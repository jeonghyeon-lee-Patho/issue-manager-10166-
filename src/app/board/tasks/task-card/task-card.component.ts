import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { calculateComprehensivePriority, Task, TaskService } from '../task.service';
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

  getTaskColor(task: Task): string {
    // 古いデータで priority (P0~P3) がない場合は都度計算する
    const priority = task.priority || calculateComprehensivePriority(task.dueDate, task.importance);
    
    switch (priority) {
      case 'P0': return '#fee2e2'; // 薄い赤（最優先）
      case 'P1': return '#fef3c7'; // 薄いオレンジ/黄色（高）
      case 'P2': return '#e0f2fe'; // 薄い青（中）
      case 'P3': return '#f9fafb'; // ほぼ白/薄いグレー（低）
      default: return '#f9f9f9';
    }
  }

  getTaskPriority(task: Task): string {
    return task.priority || calculateComprehensivePriority(task.dueDate, task.importance);
  }
 
  getDueDateLabel(task: Task): string | null {
    if (!task.dueDate) return null;
    const status = calculateDeadlineStatus(task.dueDate, task.hasTime);
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

  hasTime(task: Task): boolean {
    return !!task.hasTime && !!task.dueDate;
  }

  // バックログへ送る（backlogCategory を Backlog に設定）
  moveToBacklog(): void {
    if (!confirm(`タスク「${this.task.title}」をバックログに移動しますか？`)) return;
    const updatedTask: Task = { 
      ...this.task, 
      status: '',
      backlogCategory: '未対応' as const, 
      updatedAt: Date.now() 
    };
    this.updateTask.emit(updatedTask);
  }

  // アーカイブへ送る（archived フラグを true に変更）
  archiveTask(): void {
    if (!confirm(`タスク「${this.task.title}」をアーカイブに保管しますか？`)) return;
    const updatedTask = {
      ...this.task,
      archived: true,
      archivedAt: Date.now(),
      archivedBy: this.currentUserName || 'User',
      backlogCategory: undefined,  
      updatedAt: Date.now()
    };
    this.updateTask.emit(updatedTask);
  }
}
