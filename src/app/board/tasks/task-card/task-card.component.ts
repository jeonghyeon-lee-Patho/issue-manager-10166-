import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Task, TaskService } from '../task.service';

@Component({
  selector: 'app-task-card',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './task-card.component.html',
  styleUrls: ['./task-card.component.css']
})
export class TaskCardComponent {
  @Input() task!: Task;
  @Input() isDragging = false;
  @Input() currentUserName: string = '';
  @Input() boardMembers: any[] = [];

  @Output() editTask = new EventEmitter<Task>();
  @Output() deleteClick = new EventEmitter<string>();
  @Output() dragStart = new EventEmitter<Task>();
  @Output() dragEnd = new EventEmitter<void>();
  @Output() updateTaskTitle = new EventEmitter<{ id: string; title: string }>();
  @Output() updateTask = new EventEmitter<Task>();
 
  isEditingTitle = false;
  editingTitle = '';

  // 詳細表示フラグ
  showSubtasksDetail = false;
  showCommentsDetail = false;
  showAssigneesDetail = false;

  constructor(public taskService: TaskService) { }

  onDragStart(event: DragEvent) {
    event.stopPropagation();
    
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
    this.dragStart.emit(this.task);
  }

  onDragEnd(event: DragEvent) {
    this.dragEnd.emit();
  }

  // デッドラインによる色わけ
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
 
  // 追加：期限の状態テキストを取得（例: "【期限切れ】", "【今日まで】", "【あと2日】"）
  getDueDateLabel(dueDateStr?: string | number | Date): string | null {
    if (!dueDateStr) return null;

    const deadline = new Date(dueDateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadlineDate = new Date(deadline);
    deadlineDate.setHours(0, 0, 0, 0);

    const diffTime = deadlineDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return '【期限切れ】';
    }
    if (diffDays === 0) {
      return '【今日まで】';
    }
    if (diffDays <= 3) {
      return `【あと${diffDays}日】`;
    }
    return null; // 4日以上先は表示しない（必要に応じて変更可）
  }

  // インライン編集
  startEditTitle(event: Event) {
    event.stopPropagation();
    this.isEditingTitle = true;
    this.editingTitle = this.task.title;
  }

  saveTitle() {
    if (!this.isEditingTitle) return; 
    this.isEditingTitle = false;
  
    if (this.editingTitle && this.editingTitle.trim() && this.editingTitle !== this.task.title) {
      this.updateTaskTitle.emit({
        id: this.task.id,
        title: this.editingTitle.trim()
      });
    }
  }

  cancelEditTitle(event: Event) {
    event.stopPropagation();
    this.isEditingTitle = false;
  }

  // 詳細表示の切り替え
  toggleSubtasksDetail(event: Event) {
    event.stopPropagation();
    this.showSubtasksDetail = !this.showSubtasksDetail;
    this.showCommentsDetail = false;
    this.showAssigneesDetail = false;
  }

  toggleCommentsDetail(event: Event) {
    event.stopPropagation();
    this.showCommentsDetail = !this.showCommentsDetail;
    this.showSubtasksDetail = false;
    this.showAssigneesDetail = false;
  }

  toggleAssigneesDetail(event: Event) {
    event.stopPropagation();
    this.showAssigneesDetail = !this.showAssigneesDetail;
    this.showSubtasksDetail = false;
    this.showCommentsDetail = false;
  }

  // 担当者のプロフィール画像URLを取得するメソッド
  getAssigneeAvatar(assigneeName: string): string {
    const member = this.boardMembers.find(m => m.name === assigneeName || m.displayName === assigneeName);

    if (member && member.photoURL) {
      return member.photoURL;
    }

    return `https://ui-avatars.com/api/?name=${encodeURIComponent(assigneeName)}&background=random&color=fff&size=32`;
  }

  // サブタスクの完了状態を更新
  updateSubtask(subtask: any) {
    subtask.completed = !subtask.completed;
    this.updateTask.emit(this.task);
  }
}
