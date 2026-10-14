import { Injectable, inject } from '@angular/core';
import { Firestore, doc, updateDoc } from '@angular/fire/firestore';
import { Task, calculateComprehensivePriority } from '../board/tasks/task.service'; // ★ calculateComprehensivePriority を追加インポート
import { cleanUndefinedFields } from '../utils/object.util';
import { formatDateToJP, formatDateTimeToJP } from '../utils/date.util';
import { WikiSection } from '../board/wiki/wiki.component';
import { DEFAULT_TEMPLATES } from '../board/wiki/wiki-templates';

@Injectable({
  providedIn: 'root'
})
export class WikiExportService {
  private firestore = inject(Firestore);

  // 重要性の日本語ラベル変換
  private getImportanceText(imp?: string): string {
    if (imp === 'high') return '高';
    if (imp === 'medium') return '中';
    if (imp === 'low') return '低';
    return '未設定（低相当）';
  }

  // 総合優先度のラベル変換
  private getPriorityDisplay(p?: string): string {
    switch (p) {
      case 'P0': return 'P0 (最優先)';
      case 'P1': return 'P1 (高)';
      case 'P2': return 'P2 (中)';
      case 'P3': return 'P3 (低)';
      default: return p || 'P3 (低)';
    }
  }

  /**
   * タスク情報を美しくWiki形式にフォーマット
   */
  private formatTaskForWiki(task: Task): string {
    // 総合優先度の取得（未保存なら即時算出）
    const priority = task.priority || calculateComprehensivePriority(task.dueDate, task.importance);
    const priorityStr = this.getPriorityDisplay(priority);
    const importanceStr = this.getImportanceText(task.importance);

    const dueDateStr = formatDateToJP(task.dueDate);
    const assigneesStr = (task.assignees?.length ?? 0) > 0 ? task.assignees!.join(', ') : 'なし';
    const tagsStr = (task.tags?.length ?? 0) > 0 ? task.tags!.map(t => `#${t}`).join(' ') : 'なし';

    const startDateStr = formatDateToJP(task.startDate);
    const estStr = task.estimatedHours != null ? `${task.estimatedHours} 時間` : '未設定';
    const actStr = task.actualHours != null ? `${task.actualHours} 時間` : '未設定';

    // ステータス判別ロジック（バックログ・アーカイブ対応）
    let displayStatus = '未設定';
    if (task.archived) {
      const origStatus = task.backlogCategory ? `バックログ (${task.backlogCategory})` : (task.status || 'なし');
      displayStatus = `📦 アーカイブ (保管前: ${origStatus})`;
    } else if (task.backlogCategory) {
      displayStatus = `📋 バックログ (${task.backlogCategory})`;
    } else if (task.status) {
      displayStatus = task.status;
    }

    const lines: string[] = [];

    // 【基本情報ブロック】
    lines.push('【基本情報】');
    lines.push(`・ナレッジ保存時間 : ${formatDateTimeToJP(Date.now())}`);
    lines.push(`・ステータス   : ${displayStatus}`);
    lines.push(`・総合優先度   : ${priorityStr}`);   // ★ P0〜P3
    lines.push(`・重 要 性     : ${importanceStr}`); // ★ 高/中/低
    lines.push(`・開 始 日     : ${startDateStr || '未設定'}`);
    lines.push(`・期    限     : ${dueDateStr || '未設定'}`);
    lines.push(`・予定工数     : ${estStr}`);
    lines.push(`・実績工数     : ${actStr}`);
    lines.push(`・担 当 者     : ${assigneesStr}`);
    lines.push(`・タ    グ     : ${tagsStr}`);
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

        const indentedComment = c.text
          .split('\n')
          .map(line => `   ${line}`)
          .join('\n');

        lines.push(indentedComment);

        if (index < task.comments!.length - 1) {
          lines.push('');
        }
      });

      lines.push('----------------------------------------');
      lines.push('');
    }

    if ((task.activities?.length ?? 0) > 0) {
      lines.push('【対応アクティビティ履歴】');
      lines.push('----------------------------------------');

      const sortedActivities = [...task.activities!].reverse();
      sortedActivities.forEach(act => {
        const dateStr = formatDateTimeToJP(act.timestamp);
        lines.push(`・${dateStr} [${act.user}]: ${act.action}`);
      });

      lines.push('----------------------------------------');
    }

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

    const formattedContent = this.formatTaskForWiki(task);

    const newWikiSection: WikiSection = {
      id: 'wiki_export_' + Date.now(),
      title: `[ナレッジ] ${task.title}`,
      icon: '💡',
      content: formattedContent,
      updatedAt: Date.now()
    };

    await updateDoc(boardRef, {
      wikiSections: [...wikiSections, newWikiSection],
      lastUpdatedAt: Date.now()
    });
  }
}