import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc, setDoc } from '@angular/fire/firestore';
import { cleanUndefinedFields } from '../../utils/object.util';
import { PRIORITY_CSS_CLASSES } from '../../utils/constants.util';

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

export interface TaskActivity {
  id: string;
  user: string;
  action: string;
  timestamp: number;
}

export interface Task {
  id: string;
  title: string;
  status: string;
  dueDate?: number;
  hasTime?: boolean;
  priority?: 'low' | 'medium' | 'high';
  progress?: number;
  description?: string;
  subtasks?: Subtask[];
  comments?: TaskComment[];
  assignees?: string[];
  tags?: string[];
  activities?: TaskActivity[];
  createdAt?: number;
  updatedAt?: number;
}

export function addActivityLog(task: Task, user: string, actionText: string): TaskActivity[] {
  const currentActivities = task.activities || [];
  const newActivity: TaskActivity = {
    id: Date.now().toString(),
    user: user || 'Unknown User',
    action: actionText,
    timestamp: Date.now()
  };
  return [newActivity, ...currentActivities]; // 最新ログを先頭に追加
}

// 優先度ラベル変換用ヘルパー
function getPriorityText(p?: string): string {
  if (p === 'high') return '高';
  if (p === 'medium') return '中';
  if (p === 'low') return '低';
  return 'なし';
}

// 日時フォーマット用ヘルパー
function formatDueDateText(dueDate?: number, hasTime?: boolean): string {
  if (!dueDate) return '';
  const d = new Date(dueDate);
  const m = d.getMonth() + 1;
  const date = d.getDate();
  if (hasTime) {
    const hh = ('0' + d.getHours()).slice(-2);
    const mm = ('0' + d.getMinutes()).slice(-2);
    return `${m}/${date} ${hh}:${mm}`;
  }
  return `${m}/${date}`;
}

/**
 * ★旧タスクと新タスクを比較し、変更内容の具体的なテキストログを自動生成する
 */
export function generateTaskDiffLog(oldTask: Task, newTask: Task): string {
  const changes: string[] = [];

  // 1. タイトルの変更
  if (oldTask.title !== newTask.title) {
    changes.push(`タイトルを「${oldTask.title}」→「${newTask.title}」に変更`);
  }

  // 2. ステータスの変更
  if (oldTask.status !== newTask.status) {
    changes.push(`ステータスを [${oldTask.status}] → [${newTask.status}] に変更`);
  }

  // 3. 優先度の変更
  if (oldTask.priority !== newTask.priority) {
    changes.push(`優先度を [${getPriorityText(oldTask.priority)}] → [${getPriorityText(newTask.priority)}] に変更`);
  }

  // 4. 期限の変更
  if (oldTask.dueDate !== newTask.dueDate || oldTask.hasTime !== newTask.hasTime) {
    if (!newTask.dueDate) {
      changes.push('期限を解除');
    } else {
      changes.push(`期限を [${formatDueDateText(newTask.dueDate, newTask.hasTime)}] に設定`);
    }
  }

  // 5. 説明文の変更
  if ((oldTask.description || '') !== (newTask.description || '')) {
    changes.push('説明文を更新');
  }

  // 6. 担当者の変更
  const oldAssignees = (oldTask.assignees || []).sort().join(',');
  const newAssignees = (newTask.assignees || []).sort().join(',');
  if (oldAssignees !== newAssignees) {
    changes.push('担当者を更新');
  }

  // 7. タグの変更
  const oldTags = (oldTask.tags || []).sort().join(',');
  const newTags = (newTask.tags || []).sort().join(',');
  if (oldTags !== newTags) {
    changes.push('タグを更新');
  }

  // 8. サブタスクの変更
  if (JSON.stringify(oldTask.subtasks || []) !== JSON.stringify(newTask.subtasks || [])) {
    changes.push('サブタスクを更新');
  }

  // 変更点があればスラッシュ区切りで結合、なければデフォルト文言
  return changes.length > 0 ? changes.join(' / ') : '内容を更新';
}

@Injectable({
  providedIn: 'root'
})
export class TaskService {
  private firestore = inject(Firestore);

  async saveToFirestore(
    boardId: string,
    columns: string[],
    tasks: Task[],
    expectedLastUpdatedAt?: number 
  ): Promise<number> {              
    const boardRef = doc(this.firestore, `boards/${boardId}`);

    // 楽観的ロックの衝突判定
    if (expectedLastUpdatedAt !== undefined && expectedLastUpdatedAt !== null) {
      const snap = await getDoc(boardRef);
      if (snap.exists()) {
        const serverLastUpdated = snap.data()['lastUpdatedAt'] || 0;
        if (serverLastUpdated > expectedLastUpdatedAt + 100) {
          throw new Error('OPTIMISTIC_LOCK_ERROR');
        }
      }
    }

    const now = Date.now();
    try {
      const cleanedTasks = tasks.map(task => cleanUndefinedFields(task));
      await setDoc(boardRef, {
        columns,
        tasks: cleanedTasks,
        lastUpdatedAt: now
      }, { merge: true });

      return now; 
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

  async updateSingleTaskWithLock(
    boardId: string,
    updatedTask: Task,
    expectedTaskUpdatedAt?: number
  ): Promise<number> {
    const boardRef = doc(this.firestore, `boards/${boardId}`);
    const snap = await getDoc(boardRef);

    if (!snap.exists()) {
      throw new Error('BOARD_NOT_FOUND');
    }

    const boardData = snap.data();
    const currentTasks: Task[] = boardData['tasks'] || [];
 
    // カラムが変更された場合の処理
    const currentColumns: string[] = boardData['columns'] || [];
    if (!currentColumns.includes(updatedTask.status)) {
      throw new Error('COLUMN_NOT_FOUND_OR_CHANGED');
    }

    // 「同じタスク」が他人に更新された場合のみ衝突エラーを投げる
    const targetTask = currentTasks.find(t => t.id === updatedTask.id);
    if (targetTask && expectedTaskUpdatedAt) {
      const serverTaskUpdated = targetTask.updatedAt || 0;
      if (serverTaskUpdated > expectedTaskUpdatedAt + 100) {
        throw new Error('TASK_OPTIMISTIC_LOCK_ERROR');
      }
    }

    // 他人が更新した別タスクはそのまま残し、対象タスクだけを置き換える（差分マージ）
    const now = Date.now();
    const taskToSave = { ...updatedTask, updatedAt: now };

    let newTasks: Task[];
    if (targetTask) {
      newTasks = currentTasks.map(t => t.id === updatedTask.id ? taskToSave : t);
    } else {
      newTasks = [...currentTasks, taskToSave];
    }

    const cleanedTasks = newTasks.map(task => cleanUndefinedFields(task));

    await setDoc(boardRef, {
      tasks: cleanedTasks,
      lastUpdatedAt: now
    }, { merge: true });

    return now;
  }
} 
