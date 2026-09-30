import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Auth } from '@angular/fire/auth';
import { Task, Subtask, TaskService } from '../task.service';

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

  constructor(private taskService: TaskService, private cdr: ChangeDetectorRef) { }

  ngOnChanges(changes: SimpleChanges) {
    // isOpen が false から true に変わったときにだけ初期化処理を実行
    const isOpenChange = changes['isOpen'];
    if (isOpenChange && !isOpenChange.previousValue && isOpenChange.currentValue === true) {
      if (this.task) {
        // 編集モード
        this.editingTask = {
          ...this.task,
          ////tags: this.task.tags ? [...this.task.tags] : []
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
  addTag() {
    if (!this.editingTask.tags) {
      this.editingTask.tags = [];
    }

    const trimmed = this.newTagInput.trim();
    if (!trimmed) return;

    if (this.editingTask.tags.length >= 5) {
      alert('タグは最大5つまでしか登録できません');
      return;
    }

    if (!this.editingTask.tags.includes(trimmed)) {
      this.editingTask.tags.push(trimmed);
    }
    this.newTagInput = '';
  }

  // タグ削除処理
  removeTag(index: number) {
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

    const taskToSave = {
      id: this.task?.id || Date.now().toString(),
      title: this.editingTask.title!.trim(),
      status: this.editingTask.status || '',
      priority: this.editingTask.priority,
      dueDate: this.editingTask.dueDate,
      description: this.editingTask.description || '',
      subtasks: this.editingTask.subtasks || [],
      comments: this.editingTask.comments || [],
      assignees: this.editingTask.assignees || [],
      tags: this.editingTask.tags || [],
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
  async exportToWiki() {
    if (!this.task || !this.boardId) return;

    const confirmExport = confirm(
      `この課題のやり取りを「[ナレッジ] ${this.task.title}」としてWikiに転記しますか？`
    );
    if (!confirmExport) return;

    this.isExportingWiki = true;
    try {
      await this.taskService.exportTaskToWiki(this.boardId, this.task);
      alert('Wikiにナレッジとして保存しました！「Wiki」タブから確認できます。');
      this.cdr.detectChanges();
    } catch (error: any) {
      alert('Wikiへの保存に失敗しました: ' + (error.message || ''));
    } finally {
      this.isExportingWiki = false;
      this.cdr.detectChanges();
    }
  }
}
 