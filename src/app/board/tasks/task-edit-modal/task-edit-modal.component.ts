import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Auth } from '@angular/fire/auth';
import { Task, Subtask, TaskService } from '../task.service';
import { WikiExportService } from '../../../services/wiki-export.service';
import { MAX_TAGS } from '../../../utils/constants.util';
import { formatToDatetimeLocal, parseDatetimeLocal } from '../../../utils/date.util';

@Component({
  selector: 'app-task-edit-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task-edit-modal.component.html',
  styleUrls: ['./task-edit-modal.component.css']
})
export class TaskEditModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() task: Task | null = null;  // null = 新規作成モード
  @Input() columns: string[] = [];
  @Input() defaultColumn: string = '';  // 新規作成時のデフォルトカラム
  @Input() currentUserName: string = 'User';  // ボード内のユーザー名
  @Input() boardMembers: string[] = [];  // ボードのメンバー一覧
  @Input() boardId: string = '';

  @Output() save = new EventEmitter<Task>();
  @Output() close = new EventEmitter<void>();

  editingTask: Partial<Task> = {};
  priorities: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];
  titleError: string = '';
  newTagInput: string = '';
  editingCommentIndex: number | null = null;
  editingCommentText: string = '';
  isExportingWiki = false;

  private auth = inject(Auth);

  constructor(private taskService: TaskService, private wikiExportService: WikiExportService, private cdr: ChangeDetectorRef) { }

  ngOnChanges(changes: SimpleChanges) {
    // isOpen が false から true に変わったときにだけ初期化処理を実行
    const isOpenChange = changes['isOpen'];
    if (isOpenChange && !isOpenChange.previousValue && isOpenChange.currentValue === true) {
      if (this.task) {
        // 編集モード
        this.editingTask = {
          ...this.task,
          assignees: this.task.assignees ? [...this.task.assignees] : [],
          tags: this.task.tags ? [...this.task.tags] : [],
          subtasks: this.task.subtasks ? this.task.subtasks.map(s => ({ ...s })) : [],
          comments: this.task.comments ? this.task.comments.map(c => ({ ...c })) : []
        };
      } else {
        // 新規作成モード
        this.editingTask = {
          status: this.defaultColumn || this.columns[0] || '',
          priority: undefined,  // デフォルトなし
          subtasks: [],
          comments: [],
          assignees: this.currentUserName ? [this.currentUserName] : [],
          tags: []
        };
      }
      this.newTagInput = '';
      this.titleError = '';
      this.cancelCommentEdit();
      this.cdr.detectChanges();
      this.cdr.markForCheck();
    }
  }

  // タグ追加処理（最大5つ制限）
  addTag(): void {
    if (!this.editingTask.tags) {
      this.editingTask.tags = [];
    }

    const trimmed = this.newTagInput.trim();
    if (!trimmed) return;

    if (this.editingTask.tags.length >= MAX_TAGS) {
      alert(`タグは最大${MAX_TAGS}つまでしか登録できません`);
      return;
    }

    if (!this.editingTask.tags.includes(trimmed)) {
      this.editingTask.tags.push(trimmed);
    }
    this.newTagInput = '';
  }

  // タグ削除処理
  removeTag(index: number): void {
    if (this.editingTask.tags) {
      this.editingTask.tags.splice(index, 1);
    }
  }

  isNewTask(): boolean {
    return this.task === null;
  }

  getModalTitle(): string {
    return this.isNewTask() ? '新しい課題を作成' : 'タスクを編集';
  }

  getPriorityLabel(priority: string): string {
    switch (priority) {
      case 'high': return '高';
      case 'medium': return '中';
      case 'low': return '低';
      default: return '';
    }
  }

  // input[type="datetime-local"] 表示用
  getDateTimeLocalString(dueDate?: number): string {
    return formatToDatetimeLocal(dueDate);
  }

  // input[type="datetime-local"] からの入力イベント処理
  setDueDateFromInput(datetimeStr: string) {
    if (datetimeStr) {
      this.editingTask.dueDate = new Date(datetimeStr).getTime();
      // YYYY-MM-DDTHH:mm の形式（時間が含まれている）なら hasTime を true にする
      this.editingTask.hasTime = datetimeStr.includes('T');
    } else {
      this.editingTask.dueDate = undefined;
      this.editingTask.hasTime = false;
    }
  }

  setDueDate(date: string) {
    if (date) {
      this.editingTask.dueDate = new Date(date).getTime();
    }
  }

  addSubtask() {
    if (!this.editingTask.subtasks) {
      this.editingTask.subtasks = [];
    }
    this.editingTask.subtasks.push({
      id: Date.now().toString(),
      title: '',
      completed: false
    });
  }

  removeSubtask(index: number) {
    if (this.editingTask.subtasks) {
      this.editingTask.subtasks.splice(index, 1);
    }
  }

  onCommentEnter(event: KeyboardEvent, inputElement: HTMLTextAreaElement) {
    // 日本語入力中（変換中）のEnterキーは無視する
    if (event.isComposing) {
      return;
    }

    // Shiftキーが押されていない場合 ＝ 送信（追加）する
    if (!event.shiftKey) {
      event.preventDefault(); // デフォルトの改行動作をキャンセル

      const text = inputElement.value;
      if (text.trim()) {
        this.addComment(text);
        inputElement.value = ''; // 送信後に空にする
      }
    }
  }

  addComment(text: string) {
    if (!this.editingTask.comments) {
      this.editingTask.comments = [];
    }
    if (text && text.trim()) {
      this.editingTask.comments.push({
        id: Date.now().toString(),
        text: text.trim(),
        createdAt: Date.now(),
        author: this.currentUserName  // ボード内のユーザー名を使用
      });
    }
  }

  removeComment(index: number) {
    if (this.editingTask.comments) {
      this.editingTask.comments.splice(index, 1);
    }
  }

  startEditComment(index: number, currentText: string): void {
    this.editingCommentIndex = index;
    this.editingCommentText = currentText;
  }

  saveCommentEdit(index: number): void {
    if (!this.editingCommentText.trim()) return;

    if (this.editingTask && this.editingTask.comments) {
      this.editingTask.comments[index].text = this.editingCommentText;
      // 必要に応じて編集日時などを更新してもOKです
    }

    this.cancelCommentEdit();
  }

  cancelCommentEdit(): void {
    this.editingCommentIndex = null;
    this.editingCommentText = '';
  }

  saveEdit() {
    // タイトルのバリデーション
    if (!this.editingTask.title || !this.editingTask.title.trim()) {
      this.titleError = '課題名は必須です';
      return;
    }

    const validSubtasks = (this.editingTask.subtasks || [])
      .filter(st => st.title && st.title.trim() !== '')
      .map(st => ({ ...st, title: st.title.trim() }));

    const taskToSave = {
      id: this.task?.id || Date.now().toString(),
      title: this.editingTask.title!.trim(),
      status: this.editingTask.status || '',
      priority: this.editingTask.priority,
      dueDate: this.editingTask.dueDate,
      hasTime: this.editingTask.hasTime || false,
      description: this.editingTask.description || '',
      subtasks: validSubtasks,
      comments: this.editingTask.comments || [],
      assignees: this.editingTask.assignees || [],
      tags: this.editingTask.tags || [],
      activities: this.task?.activities || [],
      createdAt: this.task?.createdAt || Date.now(),
      updatedAt: Date.now()
    } as Task;

    this.save.emit(taskToSave);
    this.cdr.detectChanges();
  }
 
  toggleAssignee(member: string) {
    if (!this.editingTask.assignees) {
      this.editingTask.assignees = [];
    }
    const index = this.editingTask.assignees.indexOf(member);
    if (index > -1) {
      this.editingTask.assignees.splice(index, 1);
    } else {
      this.editingTask.assignees.push(member);
    }
  }

  isAssigned(member: string): boolean {
    return this.editingTask.assignees?.includes(member) || false;
  }

  cancel() {
    this.editingTask = {};
    this.newTagInput = '';
    this.titleError = '';
    this.cancelCommentEdit();
    this.close.emit();
  }

  // Wikiへの保存処理
  async exportToWiki(): Promise<void> {
    if (!this.task || !this.boardId) return;

    const confirmExport = confirm(
      `この課題のやり取りを「[ナレッジ] ${this.task.title}」としてWikiに転記しますか？`
    );
    if (!confirmExport) return;

    this.isExportingWiki = true;
    try {
      await this.wikiExportService.exportTaskToWiki(this.boardId, this.task);
      alert('Wikiにナレッジとして保存しました！「Wiki」タブから確認できます。');
      this.cdr.detectChanges();
    } catch (error: any) {
      alert('Wikiへの保存に失敗しました: ' + (error.message || ''));
    } finally {
      this.isExportingWiki = false;
      this.cdr.detectChanges();
    }
  }

  // 日付文字列 (YYYY-MM-DD) を取得
  getDateString(dueDate?: number): string {
    if (!dueDate) return '';
    const date = new Date(dueDate);
    const pad = (n: number) => (n < 10 ? '0' + n : n);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  getTimeString(dueDate?: number): string {
    if (!dueDate || !this.editingTask.hasTime) return '';
    const date = new Date(dueDate);
    const pad = (n: number) => (n < 10 ? '0' + n : n);
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  } 

  // 日付が変更された時
  onDateChange(dateStr: string) {
    if (!dateStr) {
      this.editingTask.dueDate = undefined;
      this.editingTask.hasTime = false;
      return;
    }
    const currentTimeStr = this.getTimeString(this.editingTask.dueDate);
    const timeStr = currentTimeStr ? `T${currentTimeStr}` : 'T00:00';
    this.editingTask.dueDate = new Date(`${dateStr}${timeStr}`).getTime();
  }

  // 時間が変更された時
  onTimeChange(timeStr: string) {
    const currentDateStr = this.getDateString(this.editingTask.dueDate);
    if (!currentDateStr) return;

    if (timeStr) {
      this.editingTask.dueDate = new Date(`${currentDateStr}T${timeStr}`).getTime();
      this.editingTask.hasTime = true; 
    } else {
      this.editingTask.dueDate = new Date(`${currentDateStr}T00:00`).getTime();
      this.editingTask.hasTime = false; 
    }
  }

  // 時間のみを解除（日付はそのまま、時間を00:00指定なしに戻す）
  clearTimeOnly(): void {
    const currentDateStr = this.getDateString(this.editingTask.dueDate);
    if (!currentDateStr) return;
    this.editingTask.dueDate = new Date(`${currentDateStr}T00:00`).getTime();
    this.editingTask.hasTime = false;
  }
}
