import { Injectable, inject } from '@angular/core';
import { Firestore, doc, collection, updateDoc, addDoc } from '@angular/fire/firestore';
import { Task } from '../board/tasks/task.service';
import { cleanUndefinedFields } from '../utils/object.util';
import { formatDateToJP, formatDateTimeToJP } from '../utils/date.util';
import { getPriorityLabel } from '../utils/constants.util';
import { WikiSection } from '../board/wiki/wiki.component';
import { DEFAULT_TEMPLATES } from '../board/wiki/wiki-templates';

@Injectable({
  providedIn: 'root'
})
export class WikiExportService {
  private firestore = inject(Firestore);

  /**
   * タスク情報を美しくWiki形式にフォーマット
   */
  private formatTaskForWiki(task: Task): string {
    const priorityLabel = getPriorityLabel(task.priority);
    const dueDateStr = formatDateToJP(task.dueDate);
    const assigneesStr = (task.assignees?.length ?? 0) > 0 ? task.assignees!.join(', ') : 'なし';
    const tagsStr = (task.tags?.length ?? 0) > 0 ? task.tags!.map(t => `#${t}`).join(' ') : 'なし';
 
    // ===== 追加: 工数文字列の生成 =====
    const startDateStr = formatDateToJP(task.startDate);
    const estStr = task.estimatedHours != null ? `${task.estimatedHours} 時間` : '未設定';
    const actStr = task.actualHours != null ? `${task.actualHours} 時間` : '未設定';
    // ==================================
    const lines: string[] = [];

    // 【基本情報ブロック】
    lines.push('【基本情報】');
    lines.push(`・ナレッジ保存時間 : ${formatDateTimeToJP(Date.now())}`);
    lines.push(`・ステータス : ${task.status || '未設定'}`);
    lines.push(`・優 先 度   : ${priorityLabel}`);
    lines.push(`・開 始 日   : ${startDateStr || '未設定'}`);
    lines.push(`・期    限   : ${dueDateStr || '未設定'}`);
    // ==================================
    lines.push(`・予定工数   : ${estStr}`); 
    lines.push(`・実績工数   : ${actStr}`); 
    // ==================================
    lines.push(`・担 当 者   : ${assigneesStr}`);
    lines.push(`・タ    グ   : ${tagsStr}`);
    lines.push(''); // 空行で区切る

    // 【課題概要ブロック】
    lines.push('【課題概要】');
    lines.push(task.description?.trim() || '（説明なし）');
    lines.push('');

    // 【サブタスクブロック】
    if ((task.subtasks?.length ?? 0) > 0) {
      lines.push('【対応項目・サブタスク】');
      task.subtasks!.forEach(st => {
        lines.push(`  [${st.completed ? '✓' : ' '}] ${st.title}`);
      });
      lines.push('');
    }

    // 【解決プロセス・議論ログ】
    if ((task.comments?.length ?? 0) > 0) {
      lines.push('【解決プロセス・議論ログ】');
      lines.push('----------------------------------------');

      task.comments!.forEach((c, index) => {
        const dateStr = formatDateTimeToJP(c.createdAt);
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
      lines.push('');
    }

    // ===== 【アクティビティ履歴（プロセスの変遷）】 =====
    if ((task.activities?.length ?? 0) > 0) {
      lines.push('【対応アクティビティ履歴】');
      lines.push('----------------------------------------');

      // 時系列順（古い順）に並び替えて出力
      const sortedActivities = [...task.activities!].reverse();
      sortedActivities.forEach(act => {
        const dateStr = formatDateTimeToJP(act.timestamp);
        lines.push(`・${dateStr} [${act.user}]: ${act.action}`);
      });

      lines.push('----------------------------------------');
    }
    // ========================================================

    return lines.join('\n');
  }

  async exportTaskToWiki(boardId: string, task: Task): Promise<void> {
    const boardRef = doc(this.firestore, `boards/${boardId}`);
    const { getDoc } = await import('@angular/fire/firestore');
    const boardSnap = await getDoc(boardRef);

    if (!boardSnap.exists()) {
      throw new Error('対象のボードが見つかりません');
    }

    const boardData = boardSnap.data();
    let wikiSections: WikiSection[] = boardData['wikiSections'] || [];
    const rawWikiSections = boardData['wikiSections'];

    if (rawWikiSections === undefined) {
      const now = Date.now();
      wikiSections = [
        { id: 'vision', ...DEFAULT_TEMPLATES['vision'], updatedAt: now },
        { id: 'rules', ...DEFAULT_TEMPLATES['rules'], updatedAt: now },
        { id: 'links', ...DEFAULT_TEMPLATES['links'], updatedAt: now }
      ];
    } else {
      wikiSections = [...rawWikiSections];
    }

    // Wiki形式に変換
    const formattedContent = this.formatTaskForWiki(task);

    // 新規Wikiセクションの作成
    const newWikiSection: WikiSection = {
      id: 'wiki_export_' + Date.now(),
      title: `[ナレッジ] ${task.title}`,
      icon: '💡',
      content: formattedContent,
      updatedAt: Date.now()
    };

    // Firestoreに保存
    await updateDoc(boardRef, {
      wikiSections: [...wikiSections, newWikiSection],
      lastUpdatedAt: Date.now()
    });
  }
}
