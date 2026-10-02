import { Injectable, NgZone, inject } from '@angular/core';
import { Firestore, collection, doc, setDoc, updateDoc, query, where, getDocs, onSnapshot, deleteDoc, arrayUnion, arrayRemove } from '@angular/fire/firestore';
import { Auth, authState } from '@angular/fire/auth';
import { Observable } from 'rxjs';
import { WikiSection } from '../board/wiki/wiki.component';
import { cleanUndefinedFields } from '../utils/object.util';

export interface BoardMember {
  uid: string;
  email: string;
  displayName: string;
  joinedAt: number;
  position?: string;
  domain?: string;          // 担当領域
  statusMessage?: string;   // 一言ステータス (例: 今週リリース前で多忙)
  contactId?: string;       // Slack/連絡先ID (例: @tanaka_dev)
  photoURL?: string;        // プロフィール画像URL
  role?: 'admin' | 'member';
}

export interface BoardInvitation {
  id?: string;
  boardId: string;
  boardName: string;
  email: string;
  invitedBy: string;
  invitedAt: number;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface Board {
  id: string;
  name: string;
  ownerId: string;
  creatorName: string;
  createdAt: number;
  columns: string[];
  tasks: any[];
  members?: BoardMember[];
  wikiSections?: WikiSection[];
}

@Injectable({
  providedIn: 'root'
})
export class BoardService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private ngZone = inject(NgZone);

  /**
   * ユーザーのボード順序を取得（ユーザー固有の順序）
   */
  async getUserBoardOrder(userId: string): Promise<string[]> {
    const orderRef = doc(this.firestore, `users/${userId}/boardOrder/order`);
    const { getDoc } = await import('@angular/fire/firestore');
    const snap = await getDoc(orderRef);
    
    if (snap.exists()) {
      return snap.data()['boardIds'] || [];
    }
    return [];
  }

  /**
   * ボード順序を保存（ユーザー個別）
   */
  async saveBoardOrder(userId: string, boardIds: string[]): Promise<void> {
    const orderRef = doc(this.firestore, `users/${userId}/boardOrder/order`);
    await setDoc(orderRef, {
      boardIds: boardIds,
      updatedAt: Date.now()
    });
  }

  // BoardService 内への実装
  async updateMemberProfile(boardId: string, updatedMember: BoardMember): Promise<void> {
    const boardRef = doc(this.firestore, `boards/${boardId}`);
    const { getDoc } = await import('@angular/fire/firestore');
    const boardSnap = await getDoc(boardRef);

    if (!boardSnap.exists()) throw new Error('対象のボードが見つかりません');

    const members: BoardMember[] = boardSnap.data()['members'] || [];
    const updatedMembers = members.map(m => m.uid === updatedMember.uid ? updatedMember : m);

    const cleanedMembers = updatedMembers.map(m => cleanUndefinedFields(m) as BoardMember);
    await updateDoc(boardRef, { members: cleanedMembers });
  }
  /**
   * メンバーの並び替え順序を保存
   */
  async updateMembersOrder(boardId: string, updatedMembers: BoardMember[]): Promise<void> {
    const boardRef = doc(this.firestore, `boards/${boardId}`);
    await updateDoc(boardRef, {
      members: updatedMembers
    });
  }

  /**
   * メンバーの役割（admin / member）を更新する
   */
  async updateMemberRole(boardId: string, targetUid: string, newRole: 'admin' | 'member'): Promise<void> {
    const boardRef = doc(this.firestore, `boards/${boardId}`);
    const { getDoc } = await import('@angular/fire/firestore');
    const boardSnap = await getDoc(boardRef);

    if (!boardSnap.exists()) throw new Error('ボードが見つかりません');

    const members: BoardMember[] = boardSnap.data()['members'] || [];
    const updatedMembers = members.map(m => m.uid === targetUid ? { ...m, role: newRole } : m);

    await updateDoc(boardRef, { members: updatedMembers });
  }

  /**
   * 権限を完全に譲る（対象者をadminにし、自分をmemberにする）
   */
  async transferAdminRole(boardId: string, currentAdminUid: string, targetUid: string): Promise<void> {
    const boardRef = doc(this.firestore, `boards/${boardId}`);
    const { getDoc } = await import('@angular/fire/firestore');
    const boardSnap = await getDoc(boardRef);

    if (!boardSnap.exists()) throw new Error('ボードが見つかりません');

    const members: BoardMember[] = boardSnap.data()['members'] || [];
    const updatedMembers = members.map(m => {
      if (m.uid === targetUid) return { ...m, role: 'admin' as const };
      if (m.uid === currentAdminUid) return { ...m, role: 'member' as const };
      return m;
    });

    await updateDoc(boardRef, { members: updatedMembers });
  }

  /**
   * ボードにメンバーを招待
   */
  async inviteMemberToBoard(boardId: string, email: string, boardName: string): Promise<void> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) throw new Error('User not authenticated');

    // 自分自身に招待できないようにする
    if (email === currentUser.email) {
      throw new Error('既に招待されているか、メンバーに登録されています。');
    }

    // ボードドキュメントを取得して、既存メンバーをチェック
    const boardRef = doc(this.firestore, `boards/${boardId}`);
    const { getDoc } = await import('@angular/fire/firestore');
    const boardSnap = await getDoc(boardRef);

    if (boardSnap.exists()) {
      const boardData = boardSnap.data();
      const members = (boardData['members'] || []) as any[];

      // メンバーのメールアドレスをチェック
      if (members.some(m => m.email === email)) {
        throw new Error('既に招待されているか、メンバーに登録されています。');
      } 
    }

    // 招待テーブルをチェック
    const invitationsRef = collection(this.firestore, 'invitations');
    const q = query(invitationsRef, where('boardId', '==', boardId), where('email', '==', email), where('status', '==', 'pending'));
    const existingDocs = await getDocs(q);

    if (!existingDocs.empty) {
      throw new Error('既に招待されているか、メンバーに登録されています。');
    }

    const invitationRef = doc(invitationsRef);
    await setDoc(invitationRef, {
      boardId,
      boardName,
      email,
      invitedBy: currentUser.uid,
      invitedAt: Date.now(),
      status: 'pending'
    });
  }

  /**
   * ユーザーが受け取った招待一覧を取得（pending）
   */
  getMyInvitations(email: string): Observable<BoardInvitation[]> {
    const invitationsRef = collection(this.firestore, 'invitations');
    const q = query(invitationsRef, where('email', '==', email), where('status', '==', 'pending'));

    return new Observable(observer => {
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const invitations: BoardInvitation[] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as BoardInvitation));
        observer.next(invitations);
      }, (error) => observer.error(error));

      return unsubscribe;
    });
  }

  /**
   * 招待を受け入れてボードにメンバーとして追加
   */
  async acceptInvitation(invitationId: string, displayName: string): Promise<void> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) throw new Error('ユーザーが認証されていません');

    const trimmedName = displayName.trim();
    if (!trimmedName) throw new Error('表示名を入力してください');

    const invitationRef = doc(this.firestore, `invitations/${invitationId}`);
    const { getDoc } = await import('@angular/fire/firestore');
    const invitationSnap = await getDoc(invitationRef);

    if (!invitationSnap.exists()) {
      throw new Error('招待情報が見つかりません');
    }

    const invitationData = invitationSnap.data() as BoardInvitation;
    const boardId = invitationData.boardId;

    // ボードにメンバーを追加
    const boardRef = doc(this.firestore, `boards/${boardId}`);
    const boardSnap = await getDoc(boardRef);
    
    if (boardSnap.exists()) {
      const boardData = boardSnap.data();
      const members = (boardData['members'] || []) as BoardMember[];
  
      // 自分以外のメンバーで同じ名前がないか検証（トリム＋大文字小文字を無視）
      const isDuplicate = members.some(
        m => m.uid !== currentUser.uid && m.displayName?.trim().toLowerCase() === trimmedName.toLowerCase()
      );
  
      if (isDuplicate) {
        throw new Error(`表示名「${trimmedName}」はすでにこのボードで使用されています。別の名前を指定してください。`);
      }
    }

    const newMember: BoardMember = {
      uid: currentUser.uid,
      email: currentUser.email || '',
      displayName: displayName,
      joinedAt: Date.now(),
      role: 'member'
    };

    await updateDoc(boardRef, {
      members: arrayUnion(newMember),
      memberUids: arrayUnion(currentUser.uid)  // memberUids に追加
    });

    // 招待ステータスを accepted に
    await updateDoc(invitationRef, {
      status: 'accepted'
    });
  }

  /**
   * 招待を却下
   */
  async rejectInvitation(invitationId: string): Promise<void> {
    const invitationRef = doc(this.firestore, `invitations/${invitationId}`);
    await updateDoc(invitationRef, {
      status: 'rejected'
    });
  }

  /**
   * ボードのメンバー一覧を取得
   */
  getBoardMembers(boardId: string): Observable<BoardMember[]> {
    const boardRef = doc(this.firestore, `boards/${boardId}`);

    return new Observable(observer => {
      const unsubscribe = onSnapshot(boardRef, (docSnap) => {
        this.ngZone.run(() => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            const members = (data['members'] || []) as BoardMember[];
            observer.next(members);
          } else {
            observer.next([]);
          }
        });
      }, (error) => observer.error(error));

      return unsubscribe;
    });
  }

  /**
   * 自分が参加しているボード一覧を取得
   */
  getMyJoinedBoards(userUid: string): Observable<any[]> {
    const boardsRef = collection(this.firestore, 'boards');
    const q = query(boardsRef, where('members', 'array-contains', { uid: userUid }));

    return new Observable(observer => {
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const boards: any[] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        observer.next(boards);
      }, (error) => observer.error(error));

      return unsubscribe;
    });
  }

  /**
   * ボードからメンバーを削除
   */
  async removeMemberFromBoard(boardId: string, member: BoardMember): Promise<void> {
    const boardRef = doc(this.firestore, `boards/${boardId}`);
    await updateDoc(boardRef, {
      members: arrayRemove(member),
      memberUids: arrayRemove(member.uid)  // memberUids からも削除
    });
  }

  /**
   * ボード内のすべてのタスクから特定のユーザーを担当者から削除
   */
  async removeUserFromTaskAssignees(boardId: string, userDisplayName: string): Promise<void> {
    const boardRef = doc(this.firestore, `boards/${boardId}`);
    const { getDoc } = await import('@angular/fire/firestore');
    const boardSnap = await getDoc(boardRef);

    if (!boardSnap.exists()) throw new Error('ボードが見つかりません');

    const tasks = (boardSnap.data()['tasks'] || []) as any[];
    
    // 全タスクから該当ユーザーを assignees から除去
    const updatedTasks = tasks.map(task => {
      if (task.assignees && Array.isArray(task.assignees)) {
        return {
          ...task,
          assignees: task.assignees.filter((assignee: string) => assignee !== userDisplayName)
        };
      }
      return task;
    });

    // 更新をFirestoreに保存
    await updateDoc(boardRef, { tasks: updatedTasks });
  }

  /**
   * 現在のユーザーを確認
   */
  getCurrentUserEmail(): string | null {
    return this.auth.currentUser?.email || null;
  }
}
