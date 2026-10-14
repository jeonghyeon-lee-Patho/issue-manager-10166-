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
  backlogCategory?: '未対応' | '検討中';
  
  startDate?: number; 
  estimatedHours?: number; 
  actualHours?: number;    
  dueDate?: number;
  hasTime?: boolean;
  importance?: 'low' | 'medium' | 'high';
  priority?: 'P0' | 'P1' | 'P2' | 'P3';
  progress?: number;
  description?: string;
  subtasks?: Subtask[];
  comments?: TaskComment[];
  assignees?: string[];
  tags?: string[];
  activities?: TaskActivity[];
  createdAt?: number;
  updatedAt?: number;
  archived?: boolean;          // アーカイブ状態フラグ
  archivedAt?: number;         // アーカイブした日時
  archivedBy?: string;         // アーカイブした者
}

export function calculateComprehensivePriority(
  dueDate?: number, 
  importance?: 'low' | 'medium' | 'high'
): 'P0' | 'P1' | 'P2' | 'P3' {
  const imp = importance || 'low';
  
  let urgency: 'high' | 'medium' | 'low' = 'low';
  
  if (dueDate) {
    // 今日の 00:00:00
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 期限日の 00:00:00
    const deadlineDate = new Date(dueDate);
    deadlineDate.setHours(0, 0, 0, 0);

    // カレンダー上の日数差を計算
    const diffMs = deadlineDate.getTime() - today.getTime();
    const daysDiff = Math.round(diffMs / (1000 * 60 * 60 * 24));
    
    if (daysDiff <= 3) {
      // 期限切れ (daysDiff < 0) または 3日以内 (0〜3日)
      urgency = 'high';
    } else if (daysDiff <= 7) {
      // 4日〜7日（1週間以内）
      urgency = 'medium';
    }
  }

  // マトリクス判定
  if (urgency === 'high') {
    if (imp === 'high') return 'P0';
    if (imp === 'medium') return 'P1';
    return 'P2';
  } else if (urgency === 'medium') {
    if (imp === 'high') return 'P1';
    if (imp === 'medium') return 'P2';
    return 'P3';
  } else { // urgency === 'low'
    if (imp === 'high') return 'P2';
    return 'P3';
  }
}

export function formatTaskStatusName(task: { status?: string; backlogCategory?: string; archived?: boolean }): string {
  if (task.archived) {
    return '📦 [アーカイブ]';
  }
  if (task.backlogCategory) {
    return `📋 [バックログ: ${task.backlogCategory}]`;
  }
  if (task.status) {
    return `📌 [${task.status}]`;
  }
  return '未設定';
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

// 重要性ラベル変換用ヘルパー
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
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const date = d.getDate();
  if (hasTime) {
    const hh = ('0' + d.getHours()).slice(-2);
    const mm = ('0' + d.getMinutes()).slice(-2);
    return `${y}/${m}/${date} ${hh}:${mm}`;
  }
  return `${y}/${m}/${date}`;
}

function getTaskArea(task: Task): 'board' | 'backlog' | 'archive' {
  if (task.archived) return 'archive';
  if (task.backlogCategory) return 'backlog';
  return 'board';
}

export function generateTaskDiffLog(oldTask: Task, newTask: Task): string {
  const changes: string[] = [];

  // 1. タイトルの変更
  if (oldTask.title !== newTask.title) {
    changes.push(`タイトルを「${oldTask.title}」→「${newTask.title}」に変更`);
  }

  // 2. ステータスの変更
  const oldStatusStr = formatTaskStatusName(oldTask);
  const newStatusStr = formatTaskStatusName(newTask);

  if (oldStatusStr !== newStatusStr) {
    const isAreaChanged = getTaskArea(oldTask) !== getTaskArea(newTask);
    const prefix = isAreaChanged ? 'カテゴリ移動' : 'ステータス変更';
    changes.push(`${prefix}: ${oldStatusStr} → ${newStatusStr}`);
  }

  // 3. 重要性の変更
  if (oldTask.importance !== newTask.importance) {
    const getImpText = (i?: string) => i === 'high' ? '高' : i === 'medium' ? '中' : i === 'low' ? '低' : 'なし';
    changes.push(`重要性を [${getImpText(oldTask.importance)}] → [${getImpText(newTask.importance)}] に変更`);
  }

  // 4. 期限の変更
  if (oldTask.dueDate !== newTask.dueDate || oldTask.hasTime !== newTask.hasTime) {
    if (!newTask.dueDate) {
      changes.push('期限を解除');
    } else {
      changes.push(`期限を [${formatDueDateText(newTask.dueDate, newTask.hasTime)}] に設定`);
    }
  }

  if (oldTask.startDate !== newTask.startDate) {
    if (!newTask.startDate) {
      changes.push('開始日を解除');
    } else {
      changes.push(`開始日を [${formatDueDateText(newTask.startDate, false)}] に設定`);
    }
  }

  if (oldTask.estimatedHours !== newTask.estimatedHours) {
    const oldVal = oldTask.estimatedHours != null ? `${oldTask.estimatedHours}h` : '未設定';
    const newVal = newTask.estimatedHours != null ? `${newTask.estimatedHours}h` : '未設定';
    changes.push(`予定工数を [${oldVal}] → [${newVal}] に変更`);
  }
  if (oldTask.actualHours !== newTask.actualHours) {
    const oldVal = oldTask.actualHours != null ? `${oldTask.actualHours}h` : '未設定';
    const newVal = newTask.actualHours != null ? `${newTask.actualHours}h` : '未設定';
    changes.push(`実績工数を [${oldVal}] → [${newVal}] に変更`);
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

  // 9. コメントの変更
  if (JSON.stringify(oldTask.comments || []) !== JSON.stringify(newTask.comments || [])) {
    changes.push('コメントを更新');
  }

  // 変更点があればスラッシュ区切りで結合、なければデフォルト文言
  return changes.length > 0 ? changes.join(' / ') : '';
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
      // ★ タスクを整形：backlogCategory のクリーンアップを含む
      const cleanedTasks = tasks.map(task => {
        let cleaned = cleanUndefinedFields(task);
        // backlogCategory が undefined または空文字の場合は削除
        if (!cleaned.backlogCategory) {
          const { backlogCategory, ...rest } = cleaned;
          return rest;
        }
        return cleaned;
      });
      
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
   * タスクをアーカイブする
   */
  archiveTask(tasks: Task[], taskId: string, archivedBy?: string): Task[] {
    return tasks.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          archived: true,
          archivedAt: Date.now(),
          archivedBy: archivedBy || 'Unknown',
          updatedAt: Date.now()
        };
      }
      return t;
    });
  }

  /**
   * タスクをアーカイブ解除する
   */
  unarchiveTask(tasks: Task[], taskId: string): Task[] {
    return tasks.map(t => {
      if (t.id === taskId) {
        const { archived, archivedAt, archivedBy, ...rest } = t;
        return { ...rest, updatedAt: Date.now() };
      }
      return t;
    });
  }

  /**
   * アーカイブされていないタスクを取得
   */
  getActiveTasksByColumn(tasks: Task[], columnName: string): Task[] {
    return tasks.filter(task => task.status === columnName && !task.archived);
  }

  /**
   * アーカイブされたタスクを取得
   */
  getArchivedTasks(tasks: Task[]): Task[] {
    return tasks.filter(task => task.archived);
  }

  /**
   * バックログ用のステータスを定義
   */
  getBacklogStatuses(): string[] {
    return ['未対応', '検討中'];
  }

  /**
   * バックログタスクを取得
   */
  getBacklogTasks(tasks: Task[]): Task[] {
    return tasks.filter(task => !!task.backlogCategory && !task.archived);
  }

  getPriorityText(p?: string): string {
    if (p === 'high') return '高';
    if (p === 'medium') return '中';
    if (p === 'low') return '低';
    return 'なし';
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
    const isBacklogTask = !!updatedTask.backlogCategory;
    
    if (!currentColumns.includes(updatedTask.status) && !isBacklogTask && !updatedTask.archived) {
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

    const cleanedTasks = newTasks.map(task => {
      let cleaned = cleanUndefinedFields(task);
      // backlogCategory が undefined または空文字の場合は削除
      if (!cleaned.backlogCategory) {
        const { backlogCategory, ...rest } = cleaned;
        return rest;
      }
      return cleaned;
    });

    await setDoc(boardRef, {
      tasks: cleanedTasks,
      lastUpdatedAt: now
    }, { merge: true });

    return now;
  }
} 
