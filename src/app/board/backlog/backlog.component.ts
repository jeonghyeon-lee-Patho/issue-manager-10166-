import { Component, OnInit, Input, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Task, TaskService, addActivityLog, calculateComprehensivePriority, generateTaskDiffLog } from '../tasks/task.service';
import { TaskEditModalComponent } from '../tasks/task-edit-modal/task-edit-modal.component';
import { NotificationService } from '../../services/notification.service';
import { toggleArrayValue } from '../../utils/object.util';

@Component({
  selector: 'app-backlog',
  standalone: true,
  imports: [CommonModule, FormsModule, TaskEditModalComponent],
  templateUrl: './backlog.component.html',
  styleUrls: ['./backlog.component.css']
})
export class BacklogComponent implements OnInit {
  @Input() boardId: string = '';
  @Input() columns: string[] = [];
  @Input() tasks: Task[] = [];
  @Input() currentUserName: string = '';
  @Input() boardMembers: any[] = [];
  @Input() lastUpdatedAt: number = 0;

  backlogStatuses: string[] = ['未対応', '検討中'];
  backlogTasks: Task[] = [];
  showTaskEditModal: boolean = false;
  showSearchInput: boolean = false;
  selectedTask: Task | null = null;
  activeMoveTaskId: string | null = null;

  draggedTask: Task | null = null;
  draggedFromCategory: string | null = null;

  activeDetailType: { [taskId: string]: 'subtasks' | 'comments' | 'assignees' | null } = {};

  // 検索・フィルター・ソート状態管理
  searchQuery: string = '';
  priorityFilter: string[] = [];
  compPriorityFilter: string[] = [];
  assigneeFilter: string[] = [];
  dueDateFilter: string = '';
  showFilterPanel: boolean = false;

  tempPriorityFilter: string[] = [];
  tempCompPriorityFilter: string[] = [];
  tempAssigneeFilter: string[] = [];
  tempDueDateFilter: string = '';

  sortKey: 'none' | 'title' | 'importance' | 'dueDate' | 'priority' = 'none';
  sortOrder: 'asc' | 'desc' = 'asc';
  tempSortKey: 'none' | 'title' | 'importance' | 'dueDate' | 'priority' = 'none';
  tempSortOrder: 'asc' | 'desc' = 'asc';
  showSortPanel: boolean = false;

  private operationStartedTaskUpdatedAt?: number;
  private taskService = inject(TaskService);
  private notificationService = inject(NotificationService);
  private cdr = inject(ChangeDetectorRef);
  private originalTaskBeforeEdit: Task | null = null;

  ngOnInit() {
    this.updateBacklogTasks();
  }

  ngOnChanges() {
    this.updateBacklogTasks();
  }

  private updateBacklogTasks() {
    this.backlogTasks = this.tasks.filter(t => !t.archived && !!t.backlogCategory);
    this.cdr.detectChanges();
  }

  // 検索・フィルター・ソートを適用したタスクリスト取得
  getGroupedTasks(): { [key: string]: Task[] } {
    const filtered = this.backlogTasks.filter(task => {
      // 1. 検索（タイトル、説明、タグ、担当者、サブタスク）
      if (this.searchQuery.trim()) {
        const q = this.searchQuery.toLowerCase();
        const matchesTitle = task.title.toLowerCase().includes(q);
        const matchesDesc = task.description ? task.description.toLowerCase().includes(q) : false;
        const matchesTags = task.tags ? task.tags.some(tag => tag.toLowerCase().includes(q)) : false;
        const matchesAssignees = task.assignees ? task.assignees.some(a => a.toLowerCase().includes(q)) : false;
        const matchesSubtasks = task.subtasks ? task.subtasks.some(st => st.title.toLowerCase().includes(q)) : false;

        if (!matchesTitle && !matchesDesc && !matchesTags && !matchesAssignees && !matchesSubtasks) {
          return false;
        }
      }

      if (this.priorityFilter.length > 0) {
        if (!task.importance || !this.priorityFilter.includes(task.importance)) return false;
      }

      if (this.compPriorityFilter.length > 0) {
        const p = task.priority || calculateComprehensivePriority(task.dueDate, task.importance);
        if (!this.compPriorityFilter.includes(p)) return false;
      }

      if (this.assigneeFilter.length > 0) {
        if (!task.assignees || !task.assignees.some(a => this.assigneeFilter.includes(a))) return false;
      }

      if (this.dueDateFilter) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTime = today.getTime();

        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        const weekStartTime = weekStart.getTime();

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);
        const weekEndTime = weekEnd.getTime();

        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const monthStartTime = monthStart.getTime();

        const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        monthEnd.setHours(23, 59, 59, 999);
        const monthEndTime = monthEnd.getTime();

        switch (this.dueDateFilter) {
          case 'overdue':
            if (!task.dueDate || task.dueDate >= todayTime) return false;
            break;
          case 'today':
            if (!task.dueDate || task.dueDate < todayTime || task.dueDate >= todayTime + 86400000) return false;
            break;
          case 'this-week':
            if (!task.dueDate || task.dueDate < weekStartTime || task.dueDate > weekEndTime) return false;
            break;
          case 'this-month':
            if (!task.dueDate || task.dueDate < monthStartTime || task.dueDate > monthEndTime) return false;
            break;
          case 'no-due':
            if (task.dueDate) return false;
            break;
        }
      }

      return true;
    });

    // ソート処理（デフォルト sortKey === 'none' は作成日時の古い順＝新しいものが下に並ぶ）
    filtered.sort((a, b) => {
      if (this.sortKey === 'none') {
        return (a.createdAt || 0) - (b.createdAt || 0);
      }
      return this.compareTasks(a, b);
    });

    return {
      '未対応': filtered.filter(t => t.backlogCategory === '未対応'),
      '検討中': filtered.filter(t => t.backlogCategory === '検討中')
    };
  }

  private compareTasks(a: Task, b: Task): number {
    let isAEmpty = false;
    let isBEmpty = false;

    if (this.sortKey === 'importance') {
      isAEmpty = !a.importance;
      isBEmpty = !b.importance;
    } else if (this.sortKey === 'priority') {
      isAEmpty = !a.priority;
      isBEmpty = !b.priority;
    } else if (this.sortKey === 'dueDate') {
      isAEmpty = !a.dueDate;
      isBEmpty = !b.dueDate;
    }

    if (isAEmpty && !isBEmpty) return 1;
    if (!isAEmpty && isBEmpty) return -1;
    if (isAEmpty && isBEmpty) return 0;

    let comparison = 0;

    if (this.sortKey === 'title') {
      comparison = a.title.localeCompare(b.title, 'ja');
    } else if (this.sortKey === 'importance') {
      const importanceRank: { [key: string]: number } = { high: 3, medium: 2, low: 1 };
      const rankA = importanceRank[a.importance!] || 0;
      const rankB = importanceRank[b.importance!] || 0;
      comparison = rankB - rankA;
    } else if (this.sortKey === 'priority') {
      const priorityRank: { [key: string]: number } = { 'P0': 4, 'P1': 3, 'P2': 2, 'P3': 1 };
      const rankA = priorityRank[a.priority!] || 0;
      const rankB = priorityRank[b.priority!] || 0;
      comparison = rankB - rankA;
    } else if (this.sortKey === 'dueDate') {
      const aDate = new Date(a.dueDate!).setHours(0, 0, 0, 0);
      const bDate = new Date(b.dueDate!).setHours(0, 0, 0, 0);

      if (aDate === bDate) {
        const aHasTime = !!a.hasTime;
        const bHasTime = !!b.hasTime;

        if (!aHasTime && bHasTime) comparison = 1;
        else if (aHasTime && !bHasTime) comparison = -1;
        else comparison = (a.dueDate || 0) - (b.dueDate || 0);
      } else {
        comparison = (a.dueDate || 0) - (b.dueDate || 0);
      }
    }

    return this.sortOrder === 'asc' ? comparison : -comparison;
  }

  toggleTempCompPriorityFilter(value: string): void {
    this.tempCompPriorityFilter = toggleArrayValue(this.tempCompPriorityFilter, value);
  }

  toggleFilterPanel(): void {
    this.showFilterPanel = !this.showFilterPanel;
    if (this.showFilterPanel) {
      this.showSortPanel = false;
      this.tempPriorityFilter = [...this.priorityFilter];
      this.tempCompPriorityFilter = [...this.compPriorityFilter];
      this.tempAssigneeFilter = [...this.assigneeFilter];
      this.tempDueDateFilter = this.dueDateFilter;
    }
  }

  toggleSortPanel(): void {
    this.showSortPanel = !this.showSortPanel;
    if (this.showSortPanel) {
      this.showFilterPanel = false;
      this.tempSortKey = this.sortKey;
      this.tempSortOrder = this.sortOrder;
    }
  }

  toggleTempPriorityFilter(value: string): void {
    this.tempPriorityFilter = toggleArrayValue(this.tempPriorityFilter, value);
  }

  toggleTempAssigneeFilter(value: string): void {
    this.tempAssigneeFilter = toggleArrayValue(this.tempAssigneeFilter, value);
  }

  applyFilters(): void {
    this.priorityFilter = [...this.tempPriorityFilter];
    this.compPriorityFilter = [...this.tempCompPriorityFilter];
    this.assigneeFilter = [...this.tempAssigneeFilter];
    this.dueDateFilter = this.tempDueDateFilter;
    this.showFilterPanel = false;
    this.cdr.detectChanges();
  }

  resetFilters(): void {
    this.tempPriorityFilter = [];
    this.tempCompPriorityFilter = [];
    this.tempAssigneeFilter = [];
    this.tempDueDateFilter = '';
    this.cdr.detectChanges();
  }

  applySort(): void {
    this.sortKey = this.tempSortKey;
    this.sortOrder = this.tempSortOrder;
    this.showSortPanel = false;
    this.cdr.detectChanges();
  }

  resetSort(): void {
    this.tempSortKey = 'none';
    this.tempSortOrder = 'asc';
    this.cdr.detectChanges();
  }

  hasActiveFilters(): boolean {
    return this.priorityFilter.length > 0 || this.compPriorityFilter.length > 0 || this.assigneeFilter.length > 0 || this.dueDateFilter !== '';
  }

  // 課題の作成・編集・保存（排他制御適用）
  openCreateModal(category: string) {
    this.selectedTask = {
      id: Date.now().toString(),
      title: '',
      status: '',
      backlogCategory: category as '未対応' | '検討中',
      assignees: this.currentUserName ? [this.currentUserName] : [], // 作成者をデフォルト担当者に設定
      createdAt: Date.now()
    };
    this.originalTaskBeforeEdit = null;
    this.operationStartedTaskUpdatedAt = undefined;
    this.showTaskEditModal = true;
    this.cdr.detectChanges();
  }

  onTaskCardClick(task: Task) {
    this.selectedTask = { ...task };
    this.originalTaskBeforeEdit = { ...task };
    this.operationStartedTaskUpdatedAt = task.updatedAt || task.createdAt || 0;
    this.showTaskEditModal = true;
    this.activeMoveTaskId = null;
    this.cdr.detectChanges();
  }

  async onTaskEditModalSave(updatedTask: Task) {
    if (!this.boardId) return;

    try {
      let taskToSave: Task = {
        ...updatedTask,
        status: '',
        backlogCategory: updatedTask.backlogCategory || '未対応'
      };

      const isExisting = this.tasks.some(t => t.id === taskToSave.id);

      if (isExisting && this.originalTaskBeforeEdit) {
        const logText = generateTaskDiffLog(this.originalTaskBeforeEdit, taskToSave);
        if (logText) {
          taskToSave.activities = addActivityLog(this.originalTaskBeforeEdit, this.currentUserName, logText);
        }
      } else if (!isExisting) {
        taskToSave.activities = addActivityLog(taskToSave, this.currentUserName, '課題を作成（バックログ）');
        taskToSave.createdAt = Date.now();
      }

      const newTimestamp = await this.taskService.updateSingleTaskWithLock(
        this.boardId,
        taskToSave,
        this.operationStartedTaskUpdatedAt
      );
      this.lastUpdatedAt = newTimestamp;

      if (isExisting) {
        this.tasks = this.tasks.map(t => t.id === taskToSave.id ? taskToSave : t);
      } else {
        this.tasks = [...this.tasks, taskToSave];
      }

      // 画面表示の即時更新
      this.updateBacklogTasks();

      if (isExisting && this.originalTaskBeforeEdit) {
        const logText = generateTaskDiffLog(this.originalTaskBeforeEdit, taskToSave);
        if (logText) {
          await this.notificationService.sendTaskNotifications(
            this.boardId,
            taskToSave,
            'update',
            this.currentUserName,
            this.originalTaskBeforeEdit.assignees || [],
            `バックログの「${taskToSave.title}」が更新されました`
          );
        }
      } else {
        await this.notificationService.sendTaskNotifications(
          this.boardId,
          taskToSave,
          'create',
          this.currentUserName,
          taskToSave.assignees || [],
          `バックログ（${taskToSave.backlogCategory}）に「${taskToSave.title}」が作成されました`
        );
      }
    } catch (err: any) {
      this.handleError(err);
    } finally {
      this.showTaskEditModal = false;
      this.originalTaskBeforeEdit = null;
      this.cdr.detectChanges();
    }
  }

  // ボードへの移動（統一フォーマットログ＆排他制御）
  async moveToBoard(task: Task, targetColumn: string, event: Event) {
    event.stopPropagation();
    if (!this.boardId) return;

    const currentCat = task.backlogCategory || '未対応';
    if (!confirm(`タスク「${task.title}」を [${currentCat}] → [${targetColumn}] へ移動しますか？`)) {
      return;
    }

    const logText = `カテゴリ移動: 📋 [バックログ: ${currentCat}] → 📌 [${targetColumn}]`;
    const updatedTask: Task = {
      ...task,
      status: targetColumn,
      backlogCategory: undefined,
      activities: addActivityLog(task, this.currentUserName, logText),
      updatedAt: Date.now()
    };

    try {
      await this.taskService.updateSingleTaskWithLock(this.boardId, updatedTask, task.updatedAt);
      await this.notificationService.sendTaskNotifications(
        this.boardId,
        updatedTask,
        'update',
        this.currentUserName,
        task.assignees || [],
        `「${task.title}」が 📋 [バックログ: ${currentCat}] → 📌 [${targetColumn}] に移動しました` // ★修正
      );
      this.activeMoveTaskId = null;
      this.cdr.detectChanges();
    } catch (err) {
      this.handleError(err);
    }
  }

  // アーカイブへ保管（排他制御）
  async archiveTask(task: Task, event: Event) {
    event.stopPropagation();
    const currentCategory = task.backlogCategory || '未対応';
    if (!confirm(`タスク「${task.title}」を [${currentCategory}] → [Archive] に保管しますか？`)) return;
    if (!this.boardId) return;

    // ★ 修正箇所：ログの文言
    const logText = `カテゴリ移動: 📋 [バックログ: ${currentCategory}] → 📦 [アーカイブ]`;

    const currentUserObj = this.boardMembers.find(
      (m: any) => m.name === this.currentUserName || m.displayName === this.currentUserName
    );
    const archiveUserKey = currentUserObj?.uid || currentUserObj?.displayName || this.currentUserName || 'User';

    const archivedTask: Task = {
      ...task,
      status: '',
      archived: true,
      archivedAt: Date.now(),
      archivedBy: archiveUserKey,
      activities: addActivityLog(task, this.currentUserName, logText),
      updatedAt: Date.now()
    };

    try {
      await this.taskService.updateSingleTaskWithLock(this.boardId, archivedTask, task.updatedAt);
      await this.notificationService.sendTaskNotifications(
        this.boardId,
        archivedTask,
        'update',
        this.currentUserName,
        task.assignees || [],
        `「${task.title}」が 📋 [バックログ: ${currentCategory}] → 📦 [アーカイブ] に保管されました`
      );
      this.cdr.detectChanges();
    } catch (err) {
      this.handleError(err);
    }
  }

  async deleteTask(task: Task, event: Event) {
    event.stopPropagation();
    if (!confirm(`タスク「${task.title}」を削除してもよろしいですか？`)) return;
    if (!this.boardId) return;

    try {
      const updatedTasks = this.taskService.deleteTask(this.tasks, task.id);
      const newTimestamp = await this.taskService.saveToFirestore(
        this.boardId,
        this.columns,
        updatedTasks,
        this.lastUpdatedAt
      );
      this.lastUpdatedAt = newTimestamp;
      this.tasks = updatedTasks;
      this.updateBacklogTasks();
      this.cdr.detectChanges();
    } catch (err) {
      this.handleError(err);
    }
  }

  // D&D ハンドラー
  onCardDragStart(event: DragEvent, task: Task, fromCategory: string) {
    event.stopPropagation();
    this.draggedTask = task;
    this.draggedFromCategory = fromCategory;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onCardDragEnd() {
    this.draggedTask = null;
    this.draggedFromCategory = null;
    this.cdr.detectChanges();
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  async onDrop(event: DragEvent, toCategory: string) {
    event.preventDefault();
    if (!this.draggedTask || !this.draggedFromCategory) return;

    const task = this.draggedTask;
    const fromCategory = this.draggedFromCategory;
    this.draggedTask = null;
    this.draggedFromCategory = null;

    if (fromCategory === toCategory) return;

    const logText = `ステータス変更: 📋 [バックログ: ${fromCategory}] → 📋 [バックログ: ${toCategory}]`;
    const updatedTask: Task = {
      ...task,
      status: '',
      backlogCategory: toCategory as '未対応' | '検討中',
      activities: addActivityLog(task, this.currentUserName, logText),
      updatedAt: Date.now()
    };

    try {
      await this.taskService.updateSingleTaskWithLock(this.boardId, updatedTask, task.updatedAt);
      await this.notificationService.sendTaskNotifications(
        this.boardId,
        updatedTask,
        'update',
        this.currentUserName,
        task.assignees || []
      );
      this.cdr.detectChanges();
    } catch (err) {
      this.handleError(err);
    }
  }

  // 補助メソッド
  getMemberDisplayName(nameOrId?: any): string {
    if (!nameOrId) return '';
    if (typeof nameOrId === 'string') {
      const member = this.boardMembers.find(
        (m: any) => m.uid === nameOrId || m.name === nameOrId || m.displayName === nameOrId || m.email === nameOrId
      );
      return member?.displayName || member?.name || nameOrId;
    }
    return nameOrId.displayName || nameOrId.name || nameOrId.email || '';
  }

  getAssigneeAvatar(assigneeName: string): string {
    const member = this.boardMembers.find((m: any) => m.name === assigneeName || m.displayName === assigneeName);
    if (member?.photoURL) return member.photoURL;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(assigneeName)}&background=random&color=fff&size=32`;
  }

  getCompletedSubtasks(task: Task): number {
    return task.subtasks ? task.subtasks.filter(st => st.completed).length : 0;
  }

  formatDateRange(startDate?: number, dueDate?: number): string {
    if (!startDate && !dueDate) return '';
    const formatDate = (ts?: number): string => {
      if (!ts) return '';
      const d = new Date(ts);
      return `${d.getFullYear()}/${('0' + (d.getMonth() + 1)).slice(-2)}/${('0' + d.getDate()).slice(-2)}`;
    };
    if (startDate && dueDate) return `${formatDate(startDate)} ～ ${formatDate(dueDate)}`;
    if (startDate) return `${formatDate(startDate)} ～`;
    return `～ ${formatDate(dueDate)}`;
  }

  toggleDetailType(task: Task, type: 'subtasks' | 'comments' | 'assignees', event: Event): void {
    event.stopPropagation();
    const current = this.activeDetailType[task.id];
    this.activeDetailType[task.id] = current === type ? null : type;
    this.activeMoveTaskId = null;
    this.cdr.detectChanges();
  }

  toggleMoveOptions(task: Task, event: Event): void {
    event.stopPropagation();
    this.activeMoveTaskId = (this.activeMoveTaskId === task.id) ? null : task.id;
    this.activeDetailType[task.id] = null;
    this.cdr.detectChanges();
  }

  onTaskEditModalClose() {
    this.showTaskEditModal = false;
    this.cdr.detectChanges();
  }

  private handleError(err: any) {
    if (err.message === 'TASK_OPTIMISTIC_LOCK_ERROR') {
      alert('⚠️ このタスクは他ユーザーによって更新されました。画面を再読み込みします。');
      window.location.reload();
    } else {
      alert('操作に失敗しました: ' + (err.message || ''));
    }
  }

  expandSearchInput(): void {
    this.showSearchInput = true;
  }

  collapseSearchInput(): void {
    this.showSearchInput = false;
  }

  onSearchInputBlur(): void {
    this.collapseSearchInput();
  }

  onSearchChange(event: Event): void {
    const input = (event.target as HTMLInputElement).value;
    this.searchQuery = input;
    this.cdr.detectChanges();
  }

  getPriorityLabel(importance?: string): string {
    if (importance === 'high') return '高';
    if (importance === 'medium') return '中';
    if (importance === 'low') return '低';
    return 'なし';
  }
}