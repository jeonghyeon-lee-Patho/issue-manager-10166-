
import { Component, Input, OnInit, OnChanges, SimpleChanges, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, doc, getDoc, updateDoc, collection, addDoc } from '@angular/fire/firestore';
import { Task } from '../tasks/task.service';
import { TaskEditModalComponent } from '../tasks/task-edit-modal/task-edit-modal.component';

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

  private firestore = inject(Firestore);
  private cdr = inject(ChangeDetectorRef);

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

    return this.tasks.filter(t => {
      if (!t.dueDate) return false;

      const taskDate = new Date(t.dueDate);
      const taskDateStr = this.formatDate(taskDate);

      return taskDateStr === dateStr;
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
  }

  // モーダルを閉じる
  closeTaskEdit() {
    this.isModalOpen = false;
    this.selectedTask = null;
  }

  async saveTask(updatedTask: Task) {
    if (!this.boardId) return;

    try {
      const boardRef = doc(this.firestore, `boards/${this.boardId}`);
      const snap = await getDoc(boardRef);
      if (snap.exists()) {
        const boardData = snap.data();
        let currentTasks: Task[] = boardData['tasks'] || [];

        const originalTask = currentTasks.find(t => t.id === updatedTask.id);
        const oldAssignees = originalTask ? [...(originalTask.assignees || [])] : [];
        const oldStatus = originalTask?.status || '';

        // 更新されたタスクで上書き
        const newTasks = currentTasks.map(t =>
          t.id === updatedTask.id ? updatedTask : t
        );

        await updateDoc(boardRef, { tasks: newTasks });

        let customMsg = `タスク「${updatedTask.title}」の内容がカレンダーから更新されました`;
        if (oldStatus && oldStatus !== updatedTask.status) {
          customMsg = `「${updatedTask.title}」のステータスが [${oldStatus}] → [${updatedTask.status}] に変更されました`;
        }

        await this.sendTaskNotification(updatedTask, 'update', customMsg, oldAssignees);

        this.closeTaskEdit(); // 保存後に閉じる
      }
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Task Update Error:', err);
      alert('保存に失敗しました');
    }
  }

  private async sendTaskNotification(
    task: Task,
    actionType: 'create' | 'update' | 'delete' | boolean,
    customMessage?: string,
    oldAssignees: string[] = []
  ) {
    if (!this.boardId) return;

    try {
      const noticesRef = collection(this.firestore, `boards/${this.boardId}/notifications`);
      const promises: Promise<any>[] = [];
      const currentAssignees = task.assignees || [];

      // ① 担当から外されたユーザーへ通知
      if (oldAssignees.length > 0) {
        const removedAssignees = oldAssignees.filter(user => !currentAssignees.includes(user));

        for (const removedUser of removedAssignees) {
          if (removedUser !== this.currentUserName) {
            promises.push(addDoc(noticesRef, {
              targetUser: removedUser,
              type: 'task',
              title: '担当解除',
              message: `タスク「${task.title}」の担当者から外されました (操作: ${this.currentUserName})`,
              createdAt: Date.now(),
              read: false
            }));
          }
        }
      }

      // ② 現在の担当者へ通知
      if (currentAssignees.length > 0) {
        let title = 'タスク更新';
        let defaultMsg = `タスク「${task.title}」が更新されました`;
        const finalMessage = `${customMessage || defaultMsg} (操作: ${this.currentUserName})`;

        for (const assignee of currentAssignees) {
          const isNewlyAdded = oldAssignees.length > 0 && !oldAssignees.includes(assignee);
          const notificationTitle = isNewlyAdded ? '新規タスク割り当て' : title;
          const notificationMsg = isNewlyAdded
            ? `タスク「${task.title}」の担当者にあなたが追加されました (操作: ${this.currentUserName})`
            : finalMessage;

          if (assignee !== this.currentUserName) {
            promises.push(addDoc(noticesRef, {
              targetUser: assignee,
              type: 'task',
              title: notificationTitle,
              message: notificationMsg,
              createdAt: Date.now(),
              read: false
            }));
          }
        }
      }

      await Promise.all(promises);
    } catch (err) {
      console.error('Calendar Notification Send Error:', err);
    }
  }
}


