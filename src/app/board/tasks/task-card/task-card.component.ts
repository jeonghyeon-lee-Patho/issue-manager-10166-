import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Task, TaskService } from '../task.service';
import { calculateDeadlineStatus } from '../../../utils/date.util';

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
    const status = calculateDeadlineStatus(task.dueDate);
    return status.color;
  }
 
  // 追加：期限の状態テキストを取得（例: "【期限切れ】", "【今日まで】", "【あと2日】"）
  getDueDateLabel(dueDateStr?: string | number | Date): string | null {
    if (!dueDateStr) return null;
    const status = calculateDeadlineStatus(typeof dueDateStr === 'number' ? dueDateStr : new Date(dueDateStr).getTime());
    return status.label;
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
  toggleSubtasksDetail(event: Event): void {
    event.stopPropagation();
    this.showSubtasksDetail = !this.showSubtasksDetail;
    this.showCommentsDetail = false;
    this.showAssigneesDetail = false;
  }

  toggleCommentsDetail(event: Event): void {
    event.stopPropagation();
    this.showCommentsDetail = !this.showCommentsDetail;
    this.showSubtasksDetail = false;
    this.showAssigneesDetail = false;
  }

  toggleAssigneesDetail(event: Event): void {
    event.stopPropagation();
    this.showAssigneesDetail = !this.showAssigneesDetail;
    this.showSubtasksDetail = false;
    this.showCommentsDetail = false;
  }

  // 担当者のプロフィール画像URLを取得するメソッド
  getAssigneeAvatar(assigneeName: string): string {
    const member = this.boardMembers.find(m => m.name === assigneeName || m.displayName === assigneeName);

    if (member?.photoURL) {
      return member.photoURL;
    }

    return `https://ui-avatars.com/api/?name=${encodeURIComponent(assigneeName)}&background=random&color=fff&size=32`;
  }

  // サブタスクの完了状態を更新
  updateSubtask(subtask: any): void {
    // イミュータブルな更新
    const updatedSubtask = { ...subtask, completed: !subtask.completed };
    const updatedSubtasks = this.task.subtasks?.map(st => st.id === subtask.id ? updatedSubtask : st) || [];
    const updatedTask = { ...this.task, subtasks: updatedSubtasks };
    this.updateTask.emit(updatedTask);
  }

  hasTime(task: Task): boolean {
    return !!task.hasTime && !!task.dueDate;
  }
}
