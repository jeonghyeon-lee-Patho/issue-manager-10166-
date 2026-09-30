import { Injectable, inject } from '@angular/core';
import { Firestore, doc, setDoc } from '@angular/fire/firestore';
import { WikiSection } from '../wiki/wiki.component';

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
      const cleanedTasks = tasks.map(task => {
        const cleanedTask: any = { ...task };
        Object.keys(cleanedTask).forEach(key => {
          if (cleanedTask[key] === undefined) {
            delete cleanedTask[key];
          }
        });
        return cleanedTask;
      });

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
   * 期限をフォーマット表示
   */
  formatDueDate(timestamp?: number): string {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString('ja-JP');
  }

  /**
   * 優先度のバッジクラス名を取得
   */
  getPriorityClass(priority?: string): string {
    switch (priority) {
      case 'high': return 'priority-high';
      case 'medium': return 'priority-medium';
      case 'low': return 'priority-low';
      default: return '';
    }
  }

  /**
 * 課題の全情報（メタ情報・説明・サブタスク・コメント）を美しく整形して Wiki にナレッジ保存
 */
  async exportTaskToWiki(boardId: string, task: Task): Promise<void> {
    const boardRef = doc(this.firestore, `boards/${boardId}`);
    const { getDoc, updateDoc } = await import('@angular/fire/firestore');
    const boardSnap = await getDoc(boardRef);

    if (!boardSnap.exists()) throw new Error('対象のボードが見つかりません');

    const boardData = boardSnap.data();
    const wikiSections: WikiSection[] = boardData['wikiSections'] || [];

    // --- 1. メタ情報の日本語フォーマット変換 ---
    const priorityLabel = task.priority
      ? { high: '高 🔥', medium: '中 ⚡', low: '低 ☕' }[task.priority] || task.priority
      : '未設定';

    const dueDateStr = task.dueDate
      ? new Date(task.dueDate).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
      : '未設定';

    const assigneesStr = (task.assignees && task.assignees.length > 0)
      ? task.assignees.join(', ')
      : 'なし';

    const tagsStr = (task.tags && task.tags.length > 0)
      ? task.tags.map(t => `#${t}`).join(' ')
      : 'なし';

    // --- 2. 文章の構築（余白と改行の最適化） ---
    const lines: string[] = [];

    // 【基本情報ブロック】
    lines.push('【基本情報】');
    lines.push(`・ステータス : ${task.status || '未設定'}`);
    lines.push(`・優 先 度   : ${priorityLabel}`);
    lines.push(`・期    限   : ${dueDateStr}`);
    lines.push(`・担 当 者   : ${assigneesStr}`);
    lines.push(`・タ    グ   : ${tagsStr}`);
    lines.push(''); // 空行で区切る

    // 【課題概要ブロック】
    lines.push('【課題概要】');
    lines.push(task.description ? task.description.trim() : '（説明なし）');
    lines.push('');

    // 【サブタスクブロック】
    if (task.subtasks && task.subtasks.length > 0) {
      lines.push('【対応項目・サブタスク】');
      task.subtasks.forEach(st => {
        lines.push(`  [${st.completed ? '✓' : ' '}] ${st.title}`);
      });
      lines.push('');
    }

    // 【解決プロセス・議論ログ】
    if (task.comments && task.comments.length > 0) {
      lines.push('【解決プロセス・議論ログ】');
      lines.push('----------------------------------------');

      task.comments.forEach((c, index) => {
        const dateStr = new Date(c.createdAt).toLocaleString('ja-JP', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit'
        });

        lines.push(`👤 ${c.author || 'Anonymous'}（${dateStr}）`);

        // コメント文内の改行に対応し、本文全体にインデント（下げ）を適用
        const indentedComment = c.text
          .split('\n')
          .map(line => `   ${line}`)
          .join('\n');

        lines.push(indentedComment);

        // コメント同士の間に余白を空ける
        if (index < task.comments!.length - 1) {
          lines.push('');
        }
      });

      lines.push('----------------------------------------');
    }

    const formattedContent = lines.join('\n');

    // --- 3. 新規Wikiセクションの作成とFirestore更新 ---
    const newWikiSection: WikiSection = {
      id: 'wiki_export_' + Date.now(),
      title: `[ナレッジ] ${task.title}`,
      icon: '💡',
      content: formattedContent
    };

    await updateDoc(boardRef, {
      wikiSections: [...wikiSections, newWikiSection],
      lastUpdatedAt: Date.now()
    });
  }
} 
