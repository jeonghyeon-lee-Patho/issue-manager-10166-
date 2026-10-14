// archive.component.ts

import { Component, OnInit, Input, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Task, TaskService, addActivityLog, generateTaskDiffLog } from '../tasks/task.service';
import { TaskEditModalComponent } from '../tasks/task-edit-modal/task-edit-modal.component';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-archive',
  standalone: true,
  imports: [CommonModule, FormsModule, TaskEditModalComponent],
  templateUrl: './archive.component.html',
  styleUrls: ['./archive.component.css']
})
export class ArchiveComponent implements OnInit {
  @Input() boardId: string = '';
  @Input() columns: string[] = [];
  @Input() tasks: Task[] = [];
  @Input() currentUserName: string = '';
  @Input() boardMembers: any[] = [];
  @Input() lastUpdatedAt: number = 0;

  archivedTasks: Task[] = [];
  showTaskEditModal: boolean = false;
  selectedTask: Task | null = null;
  sortBy: 'newest' | 'oldest' | 'title' = 'newest';
  filterStatus: string = 'all';
  filterAssignee: string = 'all';
  activeMoveTaskId: string | null = null;

  // ★ 伸縮検索バー用フラグ
  searchQuery: string = '';
  showSearchInput: boolean = false;

  activeDetailType: { [taskId: string]: 'subtasks' | 'comments' | 'assignees' | null } = {};

  private taskService = inject(TaskService);
  private notificationService = inject(NotificationService);
  private cdr = inject(ChangeDetectorRef);
  private originalTaskBeforeEdit: Task | null = null;

  ngOnInit() {
    this.updateArchivedTasks();
  }

  ngOnChanges() {
    this.updateArchivedTasks();
  }

  private updateArchivedTasks() {
    const archived = this.tasks.filter(t => t.archived);
    this.archivedTasks = this.getSortedTasks(archived);
    this.cdr.detectChanges();
  }

  private getSortedTasks(tasks: Task[]): Task[] {
    const filtered = tasks.filter(t => {
      // 1. キーワード検索（タイトル、説明文、タグ、担当者、サブタスク）
      if (this.searchQuery.trim()) {
        const q = this.searchQuery.toLowerCase();
        const matchesTitle = t.title.toLowerCase().includes(q);
        const matchesDesc = t.description ? t.description.toLowerCase().includes(q) : false;
        const matchesTags = t.tags ? t.tags.some(tag => tag.toLowerCase().includes(q)) : false;
        const matchesAssignees = t.assignees ? t.assignees.some(a => a.toLowerCase().includes(q)) : false;
        const matchesSubtasks = t.subtasks ? t.subtasks.some(st => st.title.toLowerCase().includes(q)) : false;

        if (!matchesTitle && !matchesDesc && !matchesTags && !matchesAssignees && !matchesSubtasks) {
          return false;
        }
      }

      // 2. ステータス（カテゴリ）フィルター
      if (this.filterStatus !== 'all') {
        const taskStatus = t.backlogCategory || t.status;
        if (taskStatus !== this.filterStatus) return false;
      }

      // 3. 担当者フィルター
      if (this.filterAssignee !== 'all') {
        if (!t.assignees || !t.assignees.some(a => this.getMemberDisplayName(a) === this.filterAssignee)) {
          return false;
        }
      }

      return true;
    });

    switch (this.sortBy) {
      case 'newest':
        return filtered.sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0));
      case 'oldest':
        return filtered.sort((a, b) => (a.archivedAt || 0) - (b.archivedAt || 0));
      case 'title':
        return filtered.sort((a, b) => a.title.localeCompare(b.title, 'ja'));
      default:
        return filtered;
    }
  }

  // ステータス選択肢（未対応 → 検討中 → 通常リストの定義順で全表示）
  getAllStatuses(): string[] {
    const defaultList = ['未対応', '検討中', ...this.columns];
    // 重複を削除して順序を維持
    return Array.from(new Set(defaultList));
  }

  // ★ 2. 担当者選択肢（全ボードメンバーを取得）
  getAllMembers(): string[] {
    if (!this.boardMembers || this.boardMembers.length === 0) return [];
    return this.boardMembers.map(m => this.getMemberDisplayName(m)).filter(name => !!name);
  }

  // ===== 伸縮検索バー制御 =====
  expandSearchInput(): void {
    this.showSearchInput = true;
  }

  collapseSearchInput(): void {
    this.showSearchInput = false;
  }

  onSearchInputBlur(): void {
    this.collapseSearchInput();
  }

  onSearchChange(): void {
    this.updateArchivedTasks();
  }

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

  getTaskDisplayStatus(task: Task): string {
    if (task.backlogCategory) {
      return task.backlogCategory;
    }
    return task.status || 'ステータスなし';
  }

  formatDateRange(startDate?: number, dueDate?: number): string {
    if (!startDate && !dueDate) return '';

    const formatDate = (ts?: number): string => {
      if (!ts) return '';
      const d = new Date(ts);
      const y = d.getFullYear();
      const m = ('0' + (d.getMonth() + 1)).slice(-2);
      const day = ('0' + d.getDate()).slice(-2);
      return `${y}/${m}/${day}`;
    };

    if (startDate && dueDate) {
      return `${formatDate(startDate)} ～ ${formatDate(dueDate)}`;
    }
    if (startDate) {
      return `${formatDate(startDate)} ～`;
    }
    if (dueDate) {
      return `～ ${formatDate(dueDate)}`;
    }
    return '';
  }

  toggleDetailType(task: Task, type: 'subtasks' | 'comments' | 'assignees', event: Event): void {
    event.stopPropagation();
    const current = this.activeDetailType[task.id];
    this.activeDetailType[task.id] = current === type ? null : type;
    this.cdr.detectChanges();
  }

  onTaskCardClick(task: Task) {
    this.selectedTask = { ...task };
    this.originalTaskBeforeEdit = { ...task };
    this.showTaskEditModal = true;
    this.cdr.detectChanges();
  }

  async onTaskEditModalSave(updatedTask: Task) {
    if (!this.boardId) return;

    try {
      const oldAssignees = this.originalTaskBeforeEdit ? [...(this.originalTaskBeforeEdit.assignees || [])] : [];
      let taskToSave: Task = {
        ...updatedTask,
        archived: true,
        archivedAt: updatedTask.archivedAt || this.originalTaskBeforeEdit?.archivedAt || Date.now(),
        archivedBy: updatedTask.archivedBy || this.originalTaskBeforeEdit?.archivedBy || this.currentUserName
      };

      if (this.originalTaskBeforeEdit) {
        const logText = generateTaskDiffLog(this.originalTaskBeforeEdit, taskToSave);
        if (logText) {
          const updatedActivities = addActivityLog(this.originalTaskBeforeEdit, this.currentUserName, logText);
          taskToSave.activities = updatedActivities;
        }
      }

      const updatedTasks = this.taskService.updateTask(this.tasks, taskToSave);
      const newTimestamp = await this.taskService.saveToFirestore(
        this.boardId,
        this.columns,
        updatedTasks,
        this.lastUpdatedAt
      );
      this.lastUpdatedAt = newTimestamp;
      this.tasks = updatedTasks;
      this.updateArchivedTasks();

      if (this.originalTaskBeforeEdit) {
        const logText = generateTaskDiffLog(this.originalTaskBeforeEdit, taskToSave);
        if (logText) {
          await this.notificationService.sendTaskNotifications(
            this.boardId,
            taskToSave,
            'update',
            this.currentUserName,
            oldAssignees,
            `アーカイブの「${taskToSave.title}」が更新されました`
          );
        }
      }
    } catch (err) {
      console.error('Error saving task:', err);
    }

    this.showTaskEditModal = false;
    this.originalTaskBeforeEdit = null;
    this.cdr.detectChanges();
  }

  onTaskEditModalClose() {
    this.showTaskEditModal = false;
    this.cdr.detectChanges();
  }

  toggleMoveOptions(task: Task, event: Event): void {
    event.stopPropagation();
    this.activeMoveTaskId = (this.activeMoveTaskId === task.id) ? null : task.id;
    this.activeDetailType[task.id] = null;
    this.cdr.detectChanges();
  }

  async moveToDestination(task: Task, destinationKey: string, event: Event) {
    event.stopPropagation();
    if (!this.boardId) return;

    const isBacklogTarget = destinationKey.startsWith('backlog:');
    const targetName = destinationKey.replace('backlog:', '').replace('board:', '');
    
    const destDisplay = isBacklogTarget ? `📋 [バックログ: ${targetName}]` : `📌 [${targetName}]`;

    if (!confirm(`タスク「${task.title}」を [Archive] → ${destDisplay} に移動しますか？`)) {
      return;
    }

    const logText = `カテゴリ移動: 📦 [アーカイブ] → ${destDisplay}`;
    const updatedActivities = addActivityLog(task, this.currentUserName, logText);

    const updatedTask: Task = {
      ...task,
      archived: false,
      archivedAt: undefined,
      archivedBy: undefined,
      backlogCategory: isBacklogTarget ? (targetName as '未対応' | '検討中') : undefined,
      status: isBacklogTarget ? '' : targetName,
      activities: updatedActivities,
      updatedAt: Date.now()
    };

    try {
      const updatedTasks = this.taskService.updateTask(this.tasks, updatedTask);
      const newTimestamp = await this.taskService.saveToFirestore(
        this.boardId,
        this.columns,
        updatedTasks,
        this.lastUpdatedAt
      );
      this.lastUpdatedAt = newTimestamp;
      this.tasks = updatedTasks;
      this.activeMoveTaskId = null;
      this.updateArchivedTasks();

      await this.notificationService.sendTaskNotifications(
        this.boardId,
        updatedTask,
        'update',
        this.currentUserName,
        task.assignees || [],
        `「${task.title}」が 📦 [アーカイブ] → ${destDisplay} に移動しました` // ★修正
      );

      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error moving task:', err);
    }
  }

  async deleteTask(task: Task, event: Event) {
    event.stopPropagation();
    if (!confirm(`タスク「${task.title}」を完全に削除してもよろしいですか？\n（この操作は取り消せません）`)) return;
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
      this.updateArchivedTasks();
    } catch (err) {
      console.error('Error deleting task:', err);
    }
  }

  async deleteAllArchived() {
    if (!confirm(`すべてのアーカイブ課題を完全に削除してもよろしいですか？\n（この操作は取り消せません）`)) return;
    if (!this.boardId) return;

    try {
      const updatedTasks = this.tasks.filter(t => !t.archived);
      const newTimestamp = await this.taskService.saveToFirestore(
        this.boardId,
        this.columns,
        updatedTasks,
        this.lastUpdatedAt
      );
      this.lastUpdatedAt = newTimestamp;
      this.tasks = updatedTasks;
      this.updateArchivedTasks();
    } catch (err) {
      console.error('Error deleting all archived tasks:', err);
    }
  }

  onSortChange() {
    this.updateArchivedTasks();
  }

  onFilterChange() {
    this.updateArchivedTasks();
  }

  formatArchivedDate(timestamp?: number): string {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleDateString('ja-JP');
  }

  getAssigneeAvatar(assigneeName: string): string {
    const member = this.boardMembers.find((m: any) => m.name === assigneeName || m.displayName === assigneeName);
    if (member?.photoURL) {
      return member.photoURL;
    }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(assigneeName)}&background=random&color=fff&size=32`;
  }

  getCompletedSubtasks(task: Task): number {
    if (!task.subtasks) return 0;
    return task.subtasks.filter(st => st.completed).length;
  }

  getPriorityLabel(importance?: string): string {
    if (importance === 'high') return '高';
    if (importance === 'medium') return '中';
    if (importance === 'low') return '低';
    return 'なし';
  }
}