import { Injectable, inject } from '@angular/core';
import { Firestore, doc, setDoc } from '@angular/fire/firestore';
import { cleanUndefinedFields } from '../../utils/object.util';
import { PRIORITY_RANK, PRIORITY_CSS_CLASSES } from '../../utils/constants.util';

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface TaskComment {
  id: string;
  text: string;
  createdAt: number;
  author?: string;
}

export interface Task {
  id: string;
  title: string;
  status: string;
  dueDate?: number;
  priority?: 'low' | 'medium' | 'high';
  progress?: number;
  description?: string;
  subtasks?: Subtask[];
  comments?: TaskComment[];
  assignees?: string[];
  tags?: string[];
  createdAt?: number;
  updatedAt?: number;
}

@Injectable({
  providedIn: 'root'
})
export class TaskService {
  private firestore = inject(Firestore);

  /**
   * Firestoreに変更を保存
   */
  async saveToFirestore(boardId: string, columns: string[], tasks: Task[]): Promise<void> {
    const boardRef = doc(this.firestore, `boards/${boardId}`);
    try {
      // タスクから undefined のフィールドを削除
      const cleanedTasks = tasks.map(task => cleanUndefinedFields(task));

      await setDoc(boardRef, {
        columns,
        tasks: cleanedTasks,
        lastUpdatedAt: Date.now()
      }, { merge: true });
    } catch (err) {
      console.error('Firestore Write Error:', err);
      throw err;
    }
  }

  /**
   * 指定カラムのタスクを取得
   */
  getTasksByColumn(tasks: Task[], columnName: string): Task[] {
    return tasks.filter(task => task.status === columnName);
  }

  /**
   * 新規タスクを作成
   */
  createNewTask(id: string, title: string, status: string): Task {
    return {
      id,
      title,
      status,
      createdAt: Date.now()
    };
  }

  /**
   * タスクのステータスを更新
   */
  updateTaskStatus(tasks: Task[], taskId: string, newStatus: string): Task[] {
    return tasks.map(t => {
      if (t.id === taskId) {
        return { ...t, status: newStatus };
      }
      return t;
    });
  }

  /**
   * タスクを削除
   */
  deleteTask(tasks: Task[], taskId: string): Task[] {
    return tasks.filter(t => t.id !== taskId);
  }

  /**
   * タスクを更新
   */
  updateTask(tasks: Task[], updatedTask: Task): Task[] {
    return tasks.map(t => {
      if (t.id === updatedTask.id) {
        return { ...updatedTask, updatedAt: Date.now() };
      }
      return t;
    });
  }

  /**
   * 完了済みサブタスク数を取得
   */
  getCompletedSubtasks(task: Task): number {
    if (!task.subtasks) return 0;
    return task.subtasks.filter(st => st.completed).length;
  }

  /**
   * 優先度のバッジクラス名を取得
   */
  getPriorityClass(priority?: string): string {
    if (!priority) return '';
    return PRIORITY_CSS_CLASSES[priority as keyof typeof PRIORITY_CSS_CLASSES] || '';
  }
} 
