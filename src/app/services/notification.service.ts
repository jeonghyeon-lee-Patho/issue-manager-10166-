import { Injectable, inject } from '@angular/core';
import { Firestore, collection, addDoc } from '@angular/fire/firestore';
import { Task } from '../board/tasks/task.service';

export interface TaskNotification {
  targetUser: string;
  type: 'task' | 'member';
  title: string;
  message: string;
  createdAt: number;
  read: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private firestore = inject(Firestore);
 
  /**
   * タスク関連の通知を送信
   */
  async sendTaskNotifications(
    boardId: string,
    task: Task,
    actionType: 'create' | 'update' | 'delete' | boolean,
    currentUserName: string,
    oldAssignees: string[] = [],
    customMessage?: string
  ): Promise<void> {
    if (!boardId) return;

    try {
      const noticesRef = collection(this.firestore, `boards/${boardId}/notifications`);
      const promises: Promise<any>[] = [];
      const currentAssignees = task.assignees || [];

      // ①【重要】担当から外されたユーザーを特定して通知
      if (oldAssignees.length > 0) {
        const removedAssignees = oldAssignees.filter(user => !currentAssignees.includes(user));

        for (const removedUser of removedAssignees) {
          // 操作者本人以外に通知を送信
          if (removedUser !== currentUserName) {
            promises.push(
              this.addNotification(noticesRef, {
                targetUser: removedUser,
                type: 'task',
                title: '担当解除',
                message: `タスク「${task.title}」の担当者から外されました (操作: ${currentUserName})`,
                createdAt: Date.now(),
                read: false
              })
            );
          }
        }
      }

      // ② 現在の担当者への通知（追加された人・継続の人）
      if (currentAssignees.length > 0) {
        const action = this.normalizeActionType(actionType);
        const { title, defaultMsg } = this.getNotificationTitle(action, task.title);

        const finalMessage = `${customMessage || defaultMsg} (操作: ${currentUserName})`;

        for (const assignee of currentAssignees) {
          // 新規に割り当てられた人の判定
          const isNewlyAdded = oldAssignees.length > 0 && !oldAssignees.includes(assignee);
          const notificationTitle = isNewlyAdded ? '新規タスク割り当て' : title;
          const notificationMsg = isNewlyAdded
            ? `タスク「${task.title}」の担当者にあなたが追加されました (操作: ${currentUserName})`
            : finalMessage;

          // 操作者本人以外に送信
          if (assignee !== currentUserName) {
            promises.push(
              this.addNotification(noticesRef, {
                targetUser: assignee,
                type: 'task',
                title: notificationTitle,
                message: notificationMsg,
                createdAt: Date.now(),
                read: false
              })
            );
          }
        }
      }

      // すべての通知作成を並列実行（部分的な失敗を許容）
      await Promise.allSettled(promises);
    } catch (err) {
      console.error('Notification Send Error:', err);
      // エラーは記録するが、通知失敗がタスク操作自体を失敗させないようにする
    }
  }

  /**
   * アクション種別を正規化
   */
  private normalizeActionType(actionType: 'create' | 'update' | 'delete' | boolean): 'create' | 'update' | 'delete' {
    if (typeof actionType === 'boolean') {
      return actionType ? 'create' : 'update';
    }
    return actionType;
  }

  /**
   * 通知タイトルとメッセージを取得
   */
  private getNotificationTitle(
    action: 'create' | 'update' | 'delete',
    taskTitle: string
  ): { title: string; defaultMsg: string } {
    switch (action) {
      case 'create':
        return {
          title: '新規タスク割り当て',
          defaultMsg: `新しいタスク「${taskTitle}」の担当に割り当てられました`
        };
      case 'delete':
        return {
          title: 'タスク削除',
          defaultMsg: `担当していたタスク「${taskTitle}」が削除されました`
        };
      default:
        return {
          title: 'タスク更新',
          defaultMsg: `タスク「${taskTitle}」が更新されました`
        };
    }
  }

  /**
   * 単一の通知を追加
   */
  private addNotification(noticesRef: any, notification: TaskNotification): Promise<any> {
    return addDoc(noticesRef, notification);
  }
}
