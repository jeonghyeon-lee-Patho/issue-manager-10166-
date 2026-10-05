
import { Component, Input, OnInit, OnChanges, SimpleChanges, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, addDoc } from '@angular/fire/firestore';
import { Task, TaskService, addActivityLog, generateTaskDiffLog } from '../tasks/task.service';
import { TaskEditModalComponent } from '../tasks/task-edit-modal/task-edit-modal.component';
import { NotificationService } from '../../services/notification.service';


interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  tasks: Task[];
}

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule, TaskEditModalComponent],
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.css']
})
export class CalendarComponent implements OnInit, OnChanges {
  @Input() boardId: string = '';
  @Input() tasks: Task[] = [];
  @Input() columns: string[] = [];
  @Input() boardMembers: string[] = [];
  @Input() currentUserName: string = '';
  @Input() lastUpdatedAt?: number;

  private firestore = inject(Firestore);
  private cdr = inject(ChangeDetectorRef);
  private taskService = inject(TaskService);
  private notificationService = inject(NotificationService);

  private operationStartedTaskUpdatedAt?: number;
  private isDraggingUnscheduled = false;

  showUnscheduledPanel: boolean = false;
  currentDate = new Date(); // 現在表示している月
  calendarDays: CalendarDay[] = [];
  weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  showDatePicker: boolean = false;
  selectedYear: number = new Date().getFullYear();
  selectedMonth: number = new Date().getMonth();

  // モーダル編集用の変数
  selectedTask: Task | null = null;
  editingTask: Partial<Task> = {};
  editingDueDateStr: string = '';
  isModalOpen: boolean = false;

  ngOnInit() {
    this.generateCalendar();
  }

  // タスクが追加・更新されたらカレンダーを再描画
  ngOnChanges(changes: SimpleChanges) {
    if (changes['tasks']) {
      this.generateCalendar();
      this.cdr.markForCheck();
      this.cdr.detectChanges();
    }
  }

  // --- 1. カレンダー生成ロジック ---
  generateCalendar() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // カレンダーの開始日（最初の日曜日）
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startDate.getDay());

    // カレンダーの終了日（最後の土曜日）
    const endDate = new Date(lastDay);
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));

    const days: CalendarDay[] = [];
    let current = new Date(startDate);

    while (current <= endDate) {
      days.push({
        date: new Date(current),
        isCurrentMonth: current.getMonth() === month,
        tasks: this.getTasksForDate(current)
      });
      current.setDate(current.getDate() + 1);
    }
    this.calendarDays = days;
  }

  get yearOptions(): number[] {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = currentYear - 10; i <= currentYear + 10; i++) {
      years.push(i);
    }
    return years;
  }

  monthOptions: number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  // 年月選択メニューを開閉
  toggleDatePicker() {
    this.showDatePicker = !this.showDatePicker;
    if (this.showDatePicker) {
      this.selectedYear = this.currentDate.getFullYear();
      this.selectedMonth = this.currentDate.getMonth();
    }
  }

  // 選択した年月に移動
  applyDatePicker() {
    this.currentDate = new Date(this.selectedYear, this.selectedMonth, 1);
    this.generateCalendar();
    this.showDatePicker = false;
  }

  // 「今月」に戻る
  goToToday() {
    this.currentDate = new Date();
    this.currentDate.setDate(1);
    this.generateCalendar();
    this.showDatePicker = false;
  }

  // 日付マスに一致するタスクを取得
  getTasksForDate(date: Date): Task[] {
    const dateStr = this.formatDate(date);

    const matchedTasks = this.tasks.filter(t => {
      if (!t.dueDate) return false;
      const taskDate = new Date(t.dueDate);
      return this.formatDate(taskDate) === dateStr;
    });

    return matchedTasks.sort((a, b) => {
      const aHasTime = !!a.hasTime;
      const bHasTime = !!b.hasTime;

      // 時間未設定 (--:--) のものは一番下へ
      if (!aHasTime && !bHasTime) return 0;
      if (!aHasTime) return 1;
      if (!bHasTime) return -1;

      return (a.dueDate || 0) - (b.dueDate || 0);
    });
  }

  // Dateオブジェクトを "YYYY-MM-DD" に変換
  formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = ('0' + (date.getMonth() + 1)).slice(-2);
    const d = ('0' + date.getDate()).slice(-2);
    return `${y}-${m}-${d}`;
  }

  isToday(date: Date): boolean {
    const today = new Date();
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  }

  getTaskColor(task: Task): string {
    if (!task.dueDate) {
      return '#f9f9f9';
    }

    const deadline = new Date(task.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadlineDate = new Date(deadline);
    deadlineDate.setHours(0, 0, 0, 0);

    const diffTime = deadlineDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return '#fee2e2';
    }
    if (diffDays <= 3) {
      return '#e2e8f0';
    }
    return '#f9f9f9';
  }

  // --- 2. 月切り替え（上段ナビゲーション） ---
  prevMonth() {
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() - 1, 1);
    this.generateCalendar();
  }

  nextMonth() {
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 1);
    this.generateCalendar();
  }

  get displayYearMonth(): string {
    return `${this.currentDate.getFullYear()}年 ${this.currentDate.getMonth() + 1}月`;
  }

  // モーダルを開く
  openTaskEdit(task: Task) {
    this.selectedTask = task;
    this.isModalOpen = true;
    this.operationStartedTaskUpdatedAt = task.updatedAt || task.createdAt || 0;
    this.cdr.detectChanges();
  }

  // モーダルを閉じる
  closeTaskEdit() {
    this.isModalOpen = false;
    this.selectedTask = null;
    this.cdr.detectChanges();
  }

  async saveTask(updatedTask: Task) {
    if (!this.boardId) return;

    try {
      const originalTask = this.tasks.find(t => t.id === updatedTask.id);
      const oldAssignees = originalTask ? [...(originalTask.assignees || [])] : [];
      const oldStatus = originalTask?.status || '';

      let taskWithLog: Task = {
        ...updatedTask,
        activities: originalTask?.activities ? [...originalTask.activities] : []
      };

      if (originalTask) {
        const logText = generateTaskDiffLog(originalTask, updatedTask);
        if (!logText) {
          this.closeTaskEdit();
          return;
        }
        // 変更がある場合のみアクティビティ履歴を追加
        taskWithLog.activities = addActivityLog(originalTask, this.currentUserName, logText);
      }

      // 排他ロック付き更新処理
      await this.taskService.updateSingleTaskWithLock(
        this.boardId,
        taskWithLog,
        this.operationStartedTaskUpdatedAt
      );

      let customMsg = `タスク「${updatedTask.title}」の内容が更新されました`;
      if (oldStatus && oldStatus !== updatedTask.status) {
        customMsg = `「${updatedTask.title}」のステータスが [${oldStatus}] → [${updatedTask.status}] に変更されました`;
      }

      await this.notificationService.sendTaskNotifications(
        this.boardId,
        updatedTask,
        'update',
        this.currentUserName,
        oldAssignees,
        customMsg
      );

      // ローカル状態を更新して再描画
      this.closeTaskEdit();
      this.tasks = this.tasks.map(t => t.id === taskWithLog.id ? taskWithLog : t);
      this.generateCalendar();
      this.cdr.markForCheck();
      this.cdr.detectChanges();

    } catch (err: any) {
      if (err.message === 'TASK_OPTIMISTIC_LOCK_ERROR') {
        alert('⚠️ このタスクは編集を開始した後に、他のユーザーによって更新されました。\n画面を再読み込みします。');
        window.location.reload();
      } else if (err.message === 'COLUMN_NOT_FOUND_OR_CHANGED') {
        alert('⚠️ タスクが所属するリストが、他のユーザーによって変更または削除されました。\n画面を再読み込みします。');
        window.location.reload();
      } else {
        alert('保存に失敗しました: ' + (err.message || ''));
      }
    }
  }

  // 期限未設定のタスク一覧を取得
  toggleUnscheduledPanel() {
    this.showUnscheduledPanel = !this.showUnscheduledPanel;
  }

  get unscheduledTasks(): Task[] {
    return this.tasks.filter(t => !t.dueDate);
  }

  getUnscheduledTasksByColumn(columnName: string): Task[] {
    return this.tasks.filter(t => !t.dueDate && t.status === columnName);
  }

  // サイドパネルからのドラッグ開始
  onTaskCardClick(task: Task) {
    if (this.isDraggingUnscheduled) return;
    this.openTaskEdit(task);
  }


  onUnscheduledDragStart(event: DragEvent, task: Task) {
    this.isDraggingUnscheduled = true;
    this.operationStartedTaskUpdatedAt = task.updatedAt || task.createdAt || 0;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', task.id);
    }
  }

  onUnscheduledDragEnd() {
    setTimeout(() => {
      this.isDraggingUnscheduled = false;
    }, 100);
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'; // ドロップ可能であることを指定
    }
  }

  async onDropToDate(event: DragEvent, targetDate: Date) {
    event.preventDefault();
    const taskId = event.dataTransfer?.getData('text/plain');
    if (!taskId) return;

    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return;

    const updatedDueDate = new Date(targetDate).setHours(0, 0, 0, 0);

    const updatedTask: Task = {
      ...task,
      dueDate: updatedDueDate,
      hasTime: false,
      updatedAt: Date.now()
    };

    // saveTask 側で自動的に「期限を [2026/10/05] に設定」のログが生成されます
    await this.saveTask(updatedTask);
  }
}


