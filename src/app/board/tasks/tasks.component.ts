import { Component, Input, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Task, TaskService, TaskActivity, addActivityLog, generateTaskDiffLog } from './task.service';
import { TaskCardComponent } from './task-card/task-card.component';
import { TaskEditModalComponent } from './task-edit-modal/task-edit-modal.component';
import { NotificationService } from '../../services/notification.service';
import { toggleArrayValue } from '../../utils/object.util';

@Component({
  selector: 'app-tasks',
  standalone: true,
  imports: [CommonModule, FormsModule, TaskCardComponent, TaskEditModalComponent],
  templateUrl: './tasks.component.html',
  styleUrls: ['./tasks.component.css']
})
export class TasksComponent {
  @Input() boardId: string = '';
  @Input() columns: string[] = [];
  @Input() tasks: Task[] = [];
  @Input() currentUserName: string = 'User';  // ボード内のユーザー名
  @Input() boardMembers: string[] = [];  // ボードのメンバー一覧
  @Input() lastUpdatedAt?: number;

  newTaskTitleByColumn: { [key: string]: string } = {};
  newColumnName: string = '';

  // 追加UI表示フラグ
  showAddTaskInput: { [key: string]: boolean } = {};
  showAddColumnInput = false;

  // ドラッグ関連
  draggedTask: Task | null = null;
  draggedFromColumn: string | null = null;
  draggedColumnIndex: number | null = null;  // リストドラッグ用

  // 編集モード
  editingTaskId: string | null = null;
  editingTask: Task | null = null;
  isEditModalOpen = false;
  defaultCreateColumn: string = '';  // 新規作成時のデフォルトカラム
  originalAssignees: string[] = [];

  // カラム編集フラグ
  editingColumnName: string | null = null;
  editingColumnNewName: string = '';

  // 検索・フィルター
  searchQuery: string = '';
  showSearchInput: boolean = false;

  statusFilter: string[] = [];
  priorityFilter: string[] = [];
  assigneeFilter: string[] = [];
  dueDateFilter: string = '';
  showFilterPanel: boolean = false;

  tempStatusFilter: string[] = [];
  tempPriorityFilter: string[] = [];
  tempAssigneeFilter: string[] = [];
  tempDueDateFilter: string = '';

  sortKey: 'none' | 'title' | 'priority' | 'dueDate' = 'none';
  sortOrder: 'asc' | 'desc' = 'asc';
  tempSortKey: 'none' | 'title' | 'priority' | 'dueDate' = 'none';
  tempSortOrder: 'asc' | 'desc' = 'asc';
  showSortPanel: boolean = false;
  private operationStartedTaskUpdatedAt?: number;

  private cdr = inject(ChangeDetectorRef);
  private taskService = inject(TaskService);
  private notificationService = inject(NotificationService);

  getTasksByColumn(columnName: string): Task[] {
    return this.taskService.getTasksByColumn(this.getFilteredTasks(), columnName);
  }

  // ソートパネルの開閉
  toggleSortPanel(): void {
    this.showSortPanel = !this.showSortPanel;
    if (this.showSortPanel) {
      this.showFilterPanel = false; // フィルター側が開いていれば閉じる
      // 現在確定している設定を一時変数にコピー
      this.tempSortKey = this.sortKey;
      this.tempSortOrder = this.sortOrder;
    }
  }

  setSortKey(key: 'title' | 'priority' | 'dueDate'): void {
    this.sortKey = key;
    this.cdr.detectChanges();
  }

  setSortOrder(order: 'asc' | 'desc'): void {
    this.sortOrder = order;
    this.cdr.detectChanges();
  }

  // 「✓ 適用」ボタンを押した時に確定させる
  applySort(): void {
    this.sortKey = this.tempSortKey;
    this.sortOrder = this.tempSortOrder;
    this.showSortPanel = false;
    this.cdr.detectChanges();
  }

  // 「✕ リセット」ボタンを押した時
  resetSort(): void {
    this.tempSortKey = 'none';
    this.tempSortOrder = 'asc';

    this.cdr.detectChanges();
  }

  getSortOrderLabel(order: 'asc' | 'desc'): string {
    if (this.sortKey === 'title') return order === 'asc' ? '(あ→ん)' : '(ん→あ)';
    if (this.sortKey === 'priority') return order === 'asc' ? '(高→低)' : '(低→高)';
    if (this.sortKey === 'dueDate') return order === 'asc' ? '(古い順)' : '(新しい順)';
    return '';
  }

  // フィルター適用済みのタスク一覧を取得
  getFilteredTasks(): Task[] {
    const filtered = this.tasks.filter(task => {
      // 検索条件チェック
      if (this.searchQuery.trim()) {
        const query = this.searchQuery.toLowerCase();

        // タイトル、説明、タグのいずれかにマッチするか判定
        const matchesTitle = task.title.toLowerCase().includes(query);
        const matchesDesc = task.description ? task.description.toLowerCase().includes(query) : false;
        const matchesTags = task.tags ? task.tags.some(tag => tag.toLowerCase().includes(query)) : false;
        const matchesAssignees = task.assignees ? task.assignees.some(assignee => assignee.toLowerCase().includes(query)) : false;

        const matchesSearch = matchesTitle || matchesDesc || matchesTags || matchesAssignees;
        if (!matchesSearch) return false;
      }

      if (this.statusFilter.length > 0 && !this.statusFilter.includes(task.status)) {
        return false;
      }

      if (this.priorityFilter.length > 0) {
        if (!task.priority || !this.priorityFilter.includes(task.priority)) {
          return false;
        }
      }

      if (this.assigneeFilter.length > 0) {
        if (!task.assignees || !task.assignees.some(assignee => this.assigneeFilter.includes(assignee))) {
          return false;
        }
      }
      // 期限フィルターチェック
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

    if (this.sortKey === 'none') {
      return filtered;
    }

    return filtered.sort((a, b) => this.compareTasks(a, b));
  }

  // 比較用ヘルパーメソッド（未設定を常に一番最後にする）
  private compareTasks(a: Task, b: Task): number {
    let isAEmpty = false;
    let isBEmpty = false;

    if (this.sortKey === 'priority') {
      isAEmpty = !a.priority;
      isBEmpty = !b.priority;
    } else if (this.sortKey === 'dueDate') {
      isAEmpty = !a.dueDate;
      isBEmpty = !b.dueDate;
    }

    // 1. 未設定値（優先度なし・期限なし）は昇順/降順に関わらず常にリストの最後にする
    if (isAEmpty && !isBEmpty) return 1;
    if (!isAEmpty && isBEmpty) return -1;
    if (isAEmpty && isBEmpty) return 0;

    // 2. 実際の値で比較
    let comparison = 0;

    if (this.sortKey === 'title') {
      comparison = a.title.localeCompare(b.title, 'ja');
    } else if (this.sortKey === 'priority') {
      const priorityRank: { [key: string]: number } = { high: 3, medium: 2, low: 1 };
      const rankA = priorityRank[a.priority!] || 0;
      const rankB = priorityRank[b.priority!] || 0;
      // 標準（昇順）は 高 -> 中 -> 低
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

    // 3. 降順（desc）の場合は比較結果を反転
    return this.sortOrder === 'asc' ? comparison : -comparison;
  }

  // trackBy 関数：タスクのID変更がない限り、コンポーネントを再作成しない
  trackByTaskId(index: number, task: Task): string {
    return task.id;
  }

  // ========== タスク管理 ==========

  private async safeSave(updatedColumns: string[], updatedTasks: Task[], expectedTime?: number): Promise<boolean> {
    try {
      const newTimestamp = await this.taskService.saveToFirestore(
        this.boardId,
        updatedColumns,
        updatedTasks,
        this.lastUpdatedAt
      );
      this.lastUpdatedAt = newTimestamp;
      this.columns = updatedColumns;
      this.tasks = updatedTasks;
      this.cdr.detectChanges();
      return true;
    } catch (err: any) {
      if (err.message === 'OPTIMISTIC_LOCK_ERROR') {
        alert('⚠️ 他のユーザーがこのボードの内容を更新しました。\n最新のデータと同期するため、画面を再読み込みします。');
        window.location.reload(); // 衝突時に画面を再読み込みして最新化
      } else {
        alert('保存に失敗しました');
      }
      return false;
    }
  }

  async addTask(columnName: string) {
    const taskTitle = this.newTaskTitleByColumn[columnName];
    if (!taskTitle?.trim() || !this.boardId?.trim()) return;

    const newTask = this.taskService.createNewTask(
      Date.now().toString(),
      taskTitle.trim(),
      columnName
    );

    const updatedTasks = [...this.tasks, newTask];
    const success = await this.safeSave(this.columns, updatedTasks); // ★差し替え
    if (success) {
      this.newTaskTitleByColumn[columnName] = '';
      this.showAddTaskInput[columnName] = false;
      await this.notificationService.sendTaskNotifications(this.boardId, newTask, 'create', this.currentUserName);
    }
    this.cdr.detectChanges();
  }

  async moveTask(task: Task, newStatus: string) {
    if (!this.boardId?.trim()) return;

    const oldStatus = task.status;
    if (oldStatus === newStatus) return;

    const logText = `ステータスを [${oldStatus}] → [${newStatus}] に変更`;
    const updatedActivities = addActivityLog(task, this.currentUserName, logText);
    const movedTask: Task = { ...task, status: newStatus, activities: updatedActivities, updatedAt: Date.now() };

    try {
      await this.taskService.updateSingleTaskWithLock(
        this.boardId,
        movedTask,
        this.operationStartedTaskUpdatedAt
      );

      await this.notificationService.sendTaskNotifications(
        this.boardId,
        movedTask,
        'update',
        this.currentUserName,
        [],
        `「${task.title}」が [${oldStatus}] → [${newStatus}] に移動しました`
      );
      this.cdr.detectChanges();
    } catch (err) {
      this.handleSingleTaskError(err);
    }
  }

  async deleteTask(taskId: string) {
    if (!this.boardId?.trim()) return;
    const targetTask = this.tasks.find(t => t.id === taskId);
    if (!confirm('この課題を削除しますか？')) {
      return;
    }

    const updatedTasks = this.taskService.deleteTask(this.tasks, taskId);
    const success = await this.safeSave(this.columns, updatedTasks); // ★差し替え

    if (success && targetTask) {
      await this.notificationService.sendTaskNotifications(this.boardId, targetTask, 'delete', this.currentUserName);
    }
    this.cdr.detectChanges();
  }

  async addColumn() {
    if (!this.newColumnName.trim() || !this.boardId) return;
    const trimmedName = this.newColumnName.trim();
    if (this.columns.includes(trimmedName)) {
      alert('同じ名前のリストが既に存在します。');
      return;
    }

    const updatedColumns = [...this.columns, trimmedName];
    const success = await this.safeSave(updatedColumns, this.tasks);
    if (success) {
      this.newColumnName = '';
      this.showAddColumnInput = false;
    }
    this.cdr.detectChanges();
  }

  async deleteColumn(columnName: string) {
    if (!this.boardId) return;
    if (!confirm(`リスト「${columnName}」を削除しますか？このリストに含まれるすべての課題も削除されます。`)) {
      return;
    }

    const updatedColumns = this.columns.filter(c => c !== columnName);
    const updatedTasks = this.tasks.filter(t => t.status !== columnName);
    await this.safeSave(updatedColumns, updatedTasks);
  }

  // ========== リスト名編集機能 ==========

  startEditColumnName(columnName: string) {
    this.editingColumnName = columnName;
    this.editingColumnNewName = columnName;
  }

  async saveColumnName(oldColumnName: string) {
    if (!this.boardId || !this.editingColumnNewName.trim()) {
      this.editingColumnName = null;
      return;
    }

    const newColumnName = this.editingColumnNewName.trim();
    if (newColumnName === oldColumnName) {
      this.editingColumnName = null;
      return;
    }

    if (this.columns.includes(newColumnName)) {
      alert('同じ名前のリストが既に存在します。');
      return;
    }

    const updatedColumns = this.columns.map(c => c === oldColumnName ? newColumnName : c);
    const updatedTasks = this.tasks.map(t => t.status === oldColumnName ? { ...t, status: newColumnName } : t);

    const success = await this.safeSave(updatedColumns, updatedTasks);
    if (success) {
      this.editingColumnName = null;
    }
    this.cdr.detectChanges();
  }

  cancelEditColumnName() {
    this.editingColumnName = null;
  }

  // ========== ドラッグ&ドロップ ==========

  onDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onDrop(event: DragEvent, toColumn: string) {
    event.preventDefault();
    if (this.draggedTask && this.draggedFromColumn) {
      if (this.draggedFromColumn !== toColumn) {
        this.moveTask(this.draggedTask, toColumn);
      }
    }
    this.draggedTask = null;
    this.draggedFromColumn = null;
  }

  onCardDragStart(task: Task) {
    this.draggedTask = task;
    this.draggedFromColumn = task.status;
    this.operationStartedTaskUpdatedAt = task.updatedAt || task.createdAt || 0;
  }

  onCardDragEnd() {
    this.draggedTask = null;
    this.draggedFromColumn = null;
  }

  // ========== リストドラッグ&ドロップ ==========

  onColumnDragStart(event: DragEvent, fromIndex: number) {
    const target = event.target as HTMLElement;

    if (
      target.tagName.toLowerCase() === 'input' ||
      target.tagName.toLowerCase() === 'textarea' ||
      target.closest('.task-card') // タスクカード内の操作ならカラム移動させない
    ) {
      event.preventDefault(); // カラムドラッグを阻止
      return;
    }

    this.draggedColumnIndex = fromIndex;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', fromIndex.toString());
    }
  }

  onColumnDragEnd(event: DragEvent) {
    this.draggedColumnIndex = null;
  }

  onColumnDrop(event: DragEvent, toIndex: number) {
    event.preventDefault();

    const fromIndexStr = event.dataTransfer?.getData('text/plain');
    if (fromIndexStr !== null && fromIndexStr !== undefined) {
      const fromIndex = parseInt(fromIndexStr, 10);

      if (fromIndex !== toIndex && fromIndex >= 0 && toIndex >= 0) {
        this.reorderColumns(fromIndex, toIndex);
      }
    }

    this.draggedColumnIndex = null;
  }

  async reorderColumns(fromIndex: number, toIndex: number) {
    if (!this.boardId) return;

    const newColumns = [...this.columns];
    const [movedColumn] = newColumns.splice(fromIndex, 1);
    newColumns.splice(toIndex, 0, movedColumn);

    await this.safeSave(newColumns, this.tasks);
  }

  // ========== 編集機能 ==========

  openEditModal(task: Task) {
    this.editingTask = { ...task };
    this.editingTaskId = task.id;
    this.originalAssignees = task.assignees ? [...task.assignees] : [];
    this.isEditModalOpen = true;
    this.operationStartedTaskUpdatedAt = task.updatedAt || task.createdAt || 0;
  }

  openCreateModal(columnName: string) {
    this.editingTaskId = null;
    this.editingTask = null;
    (this as any).defaultCreateColumn = columnName;
    this.isEditModalOpen = true;
    this.operationStartedTaskUpdatedAt = undefined;
    this.cdr.detectChanges();
  }

  closeEditModal() {
    this.editingTaskId = null;
    this.editingTask = null;
    this.isEditModalOpen = false;
    (this as any).defaultCreateColumn = undefined;
  }

  async saveTaskEdit(task: Task) {
    if (!this.boardId) return;

    try {
      const isNew = !this.editingTaskId;
      const oldAssignees = isNew ? [] : [...this.originalAssignees];
      const originalTask = this.tasks.find(t => t.id === this.editingTaskId);

      if (this.editingTaskId && originalTask) {
        const logText = generateTaskDiffLog(originalTask, task);

        if (logText.length === 0) return;
        const updatedActivities = addActivityLog(originalTask, this.currentUserName, logText);
        
        const taskToSave: Task = {
          ...task,
          assignees: task.assignees || [],
          activities: updatedActivities,
          updatedAt: Date.now()
        };

        try {
          await this.taskService.updateSingleTaskWithLock(
            this.boardId,
            taskToSave,
            this.operationStartedTaskUpdatedAt
          );

          await this.sendTaskNotification(taskToSave, 'update', `タスク「${taskToSave.title}」が更新されました`, oldAssignees);
        } catch (err) {
          this.handleSingleTaskError(err);
          return;
        }
      } else {
        const initialTask: Task = {
          ...task,
          assignees: task.assignees || [],
          activities: []
        };
        const createdActivities = addActivityLog(initialTask, this.currentUserName, '課題を作成');

        const newTask: Task = {
          ...initialTask,
          id: initialTask.id || Date.now().toString(),
          activities: createdActivities,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        try {
          await this.taskService.updateSingleTaskWithLock(this.boardId, newTask);
          await this.sendTaskNotification(newTask, 'create');
        } catch (err) {
          this.handleSingleTaskError(err);
          return;
        }
      }
    } finally {
      this.closeEditModal();
      this.cdr.detectChanges();
    }
  } 

  // ハンドラーメソッド（テンプレートから呼び出し）
  onTaskCardStatusChange(event: { task: Task; newStatus: string }) {
    this.moveTask(event.task, event.newStatus);
    this.cdr.detectChanges();
  }

  async updateTaskTitle(event: { id: string; title: string }) {
    if (!this.boardId) return;

    const targetTask = this.tasks.find(t => t.id === event.id);
    if (!targetTask || targetTask.title === event.title) return;
    const oldTitle = targetTask.title;
    const newTitle = event.title;

    // タイトル変更の具体的ログを生成
    const logText = `タイトルを「${oldTitle}」→「${newTitle}」に変更`;
    const updatedActivities = addActivityLog(targetTask, this.currentUserName, logText);

    const updatedTask: Task = {
      ...targetTask,
      title: newTitle,
      activities: updatedActivities,
      updatedAt: Date.now()
    };

    try {
      await this.taskService.updateSingleTaskWithLock(this.boardId, updatedTask);
      await this.sendTaskNotification(
        updatedTask, 
        'update', 
        `タスクのタイトルが「${oldTitle}」から「${newTitle}」に変更されました`
      );
      this.cdr.detectChanges();
    } catch (err) {
      this.handleSingleTaskError(err);
    }
  }

  async saveTaskUpdate(updatedTask: Task) {
    if (!this.boardId) return;

    // 1. 変更前の元タスクを取得
    const originalTask = this.tasks.find(t => t.id === updatedTask.id);
    if (!originalTask) return;

    // 2. 差分ログを自動生成（サブタスク・進捗変更時は「サブタスクを更新」）
    const logText = generateTaskDiffLog(originalTask, updatedTask);
    if (!logText && JSON.stringify(originalTask) === JSON.stringify(updatedTask)) {
      return;
    }

    // 3. アクティビティ履歴を追加
    let taskToSave: Task = { ...updatedTask };
    if (logText) {
      const updatedActivities = addActivityLog(originalTask, this.currentUserName, logText);
      taskToSave = {
        ...taskToSave,
        activities: updatedActivities,
        updatedAt: Date.now()
      };
    }

    try {
      // 4. 排他ロック付きで Firestore に保存
      await this.taskService.updateSingleTaskWithLock(this.boardId, taskToSave);

      // 5. 通知の送信とローカル状態の即時更新
      await this.sendTaskNotification(taskToSave, 'update', `タスク「${taskToSave.title}」が更新されました`);
      this.tasks = this.tasks.map(t => t.id === taskToSave.id ? taskToSave : t);
      this.cdr.detectChanges();

    } catch (err) {
      this.handleSingleTaskError(err);
    }
  }

  private async sendTaskNotification(
    task: Task,
    actionType: 'create' | 'update' | 'delete' | boolean,
    customMessage?: string,
    oldAssignees: string[] = []
  ) {
    try {
      await this.notificationService.sendTaskNotifications(
        this.boardId,
        task,
        actionType,
        this.currentUserName,
        oldAssignees,
        customMessage
      );
    } catch (err) {
      console.error('Notification Send Error:', err);
    }
  }

  // 検索・フィルター関連メソッド
  toggleFilterPanel(): void {
    this.showFilterPanel = !this.showFilterPanel;
    // パネル開く時は一時フィルターを現在の状態にする
    if (this.showFilterPanel) {
      this.showSortPanel = false;
      this.tempStatusFilter = [...this.statusFilter];
      this.tempPriorityFilter = [...this.priorityFilter];
      this.tempAssigneeFilter = [...this.assigneeFilter];
      this.tempDueDateFilter = this.dueDateFilter;
    }
  }

  toggleSearchInput(): void {
    this.showSearchInput = !this.showSearchInput;
    // 開く時にフォーカス
    if (this.showSearchInput) {
      setTimeout(() => {
        const input = document.querySelector('.search-input') as HTMLInputElement;
        if (input) input.focus();
      }, 0);
    }
  }

  expandSearchInput(): void {
    this.showSearchInput = true;
  }

  collapseSearchInput(): void {
    // 入力欄を縮める（文字は残す）
    this.showSearchInput = false;
  }

  onSearchInputBlur(): void {
    // blur したら即座に collapse する
    this.collapseSearchInput();
  }

  closeSearchInput(): void {
    this.showSearchInput = false;
  }

  onSearchChange(event: Event): void {
    const input = (event.target as HTMLInputElement).value;
    this.searchQuery = input;
    // 検索は即座に反映
    this.cdr.detectChanges();
  }

  // HTMLのチェックボックス(change)から受け取るトグル用メソッド
  toggleTempStatusFilter(value: string): void {
    this.tempStatusFilter = toggleArrayValue(this.tempStatusFilter, value);
  }

  toggleTempPriorityFilter(value: string): void {
    this.tempPriorityFilter = toggleArrayValue(this.tempPriorityFilter, value);
  }

  toggleTempAssigneeFilter(value: string): void {
    this.tempAssigneeFilter = toggleArrayValue(this.tempAssigneeFilter, value);
  }

  onDueDateFilterChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.tempDueDateFilter = value;
    // 一時フィルターなので即座には反映しない
  }

  // 適用ボタン
  applyFilters(): void {
    this.statusFilter = [...this.tempStatusFilter];
    this.priorityFilter = [...this.tempPriorityFilter];
    this.assigneeFilter = [...this.tempAssigneeFilter];
    this.dueDateFilter = this.tempDueDateFilter;
    this.showFilterPanel = false;
    this.cdr.detectChanges();
  }

  // リセットボタン（パネル内）
  resetFilters(): void {
    this.tempStatusFilter = [];
    this.tempPriorityFilter = [];
    this.tempAssigneeFilter = [];
    this.tempDueDateFilter = '';
    this.cdr.detectChanges();
  }

  // フィルターが活性か確認（検索を除外）
  isFilterActive(): boolean {
    return this.searchQuery.trim() !== '' ||
      this.statusFilter.length > 0 ||
      this.priorityFilter.length > 0 ||
      this.assigneeFilter.length > 0 ||
      this.dueDateFilter !== '';
  }

  // フィルター条件があるか確認（検索は含めない）
  hasActiveFilters(): boolean {
    return this.statusFilter.length > 0 ||
      this.priorityFilter.length > 0 ||
      this.assigneeFilter.length > 0 ||
      this.dueDateFilter !== '';
  }

  // 隠れたタスク数を計算
  getHiddenTaskCount(): number {
    const allTasks = this.tasks.length;
    const filteredTasks = this.getFilteredTasks().length;
    return allTasks - filteredTasks;
  }

  // 表示するカラムを取得（ステータスフィルターがある場合はそれだけ、ない場合はすべて）
  getVisibleColumns(): string[] {
    if (this.statusFilter.length > 0) {
      return this.columns.filter(col => this.statusFilter.includes(col));
    }
    // フィルターがない場合はすべてのカラムを表示
    return this.columns;
  }

  // エラーハンドラー共通化
  private handleSingleTaskError(err: any) {
    if (err.message === 'TASK_OPTIMISTIC_LOCK_ERROR') {
      alert('⚠️ このタスクは編集・移動を開始した後に、他のユーザーによって更新されました。\n画面を再読み込みします。');
      window.location.reload();
    } else if (err.message === 'COLUMN_NOT_FOUND_OR_CHANGED') {
      alert('⚠️ タスクの移動先・所属するリストが、他のユーザーによって変更または削除されました。\n画面を再読み込みします。');
      window.location.reload();
    } else {
      alert('保存に失敗しました: ' + (err.message || ''));
    }
  }
}
