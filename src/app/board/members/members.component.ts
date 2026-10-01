import { Component, Input, OnInit, inject, ChangeDetectorRef, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Auth, user } from '@angular/fire/auth';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { BoardService, BoardMember } from '../../services/board.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-members',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './members.component.html',
  styleUrl: './members.component.css'
})
export class MembersComponent implements OnInit {
  @Input() boardId: string = '';
  @Input() currentUserName: string = '';
  @Input() isAdmin: boolean = false;

  members: BoardMember[] = [];
  currentUserUid: string | null = null;
  readonly defaultPhotoUrl = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%23e2e8f0'/><circle cx='50' cy='40' r='18' fill='%2394a3b8'/><path d='M 18,88 C 18,65 32,58 50,58 C 68,58 82,65 82,88 Z' fill='%2394a3b8'/></svg>`;

  showInviteModal = false;
  inviteEmail = '';
  inviteError = '';

  //// 編集用状態変数
  editingUid: string | null = null;
  editingPosition: string = '';         // 1. 役職 (例: フロントエンド / リーダー)
  editingDomain: string = '';           // 2. 担当領域 (例: Angular / UIデザイン)
  editingStatusMessage: string = '';    // 3. 一言ステータス (例: 今週リリース前で多忙)
  editingContactId: string = '';        // 4. Slack/連絡先ID (例: @tanaka_dev)
  draggedMemberUid: string | null = null;
  draggedMemberIndex: number | null = null;
  ////
  private boardService = inject(BoardService);
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);

  ngOnInit() {
    user(this.auth)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(u => {
        this.currentUserUid = u?.uid || null;
        this.cdr.detectChanges(); // UID取得時に画面を再描画して *ngIf を再評価
      });

    if (!this.boardId) return;

    this.boardService.getBoardMembers(this.boardId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(
        members => {
          this.members = members;
          this.cdr.detectChanges();
        },
        error => console.error('Failed to load members:', error)
      );
  }

  // 権限を与える (adminを追加)
  async grantAdmin(member: BoardMember) {
    if (!confirm(`${member.displayName} に管理者権限を与えますか？`)) return;
    await this.boardService.updateMemberRole(this.boardId, member.uid, 'admin');
  }

  get isCurrentUserAdmin(): boolean {
    const me = this.members.find(m => m.uid === this.currentUserUid);
    return me?.role === 'admin';
  }

  // 権限を譲る (自分がmemberになる)
  async transferAdmin(member: BoardMember) {
    if (!this.currentUserUid) return;
    if (!confirm(`${member.displayName} に管理者権限を譲りますか？\n（あなたは一般メンバーになります）`)) return;

    try {
      await this.boardService.transferAdminRole(this.boardId, this.currentUserUid, member.uid);
      // 画面のローカル状態を即時更新
      this.members = this.members.map(m => {
        if (m.uid === member.uid) return { ...m, role: 'admin' };
        if (m.uid === this.currentUserUid) return { ...m, role: 'member' };
        return m;
      });
      this.cdr.detectChanges();
    } catch (error: any) {
      alert('権限の譲渡に失敗しました: ' + (error.message || ''));
    }
  }

  // 管理者をあきらめる
  async relinquishAdmin(member: BoardMember) {
    const adminCount = this.members.filter(m => m.role === 'admin').length;
    if (adminCount <= 1) {
      alert('管理者があなた1人のため、権限をあきらめることはできません。他のメンバーに権限を与えるか譲ってください。');
      return;
    }
    if (!confirm('管理者権限をあきらめて、一般メンバーになりますか？')) return;
    await this.boardService.updateMemberRole(this.boardId, member.uid, 'member');
  }

  // メンバーを強制削除（キック）
  async kickMember(member: BoardMember) {
    if (!confirm(`${member.displayName} をボードから追放（キック）しますか？\nこのメンバーはボードにアクセスできなくなります。`)) return;
    await this.boardService.removeMemberFromBoard(this.boardId, member);
  }

  // ドラッグ開始ハンドラー
  onMemberDragStart(event: DragEvent, member: BoardMember, index: number) {
    this.draggedMemberUid = member.uid;
    this.draggedMemberIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', index.toString());
    }
  }

  // ドラッグオーバーハンドラー
  onMemberDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  // ドロップハンドラー
  async onMemberDrop(event: DragEvent, toIndex: number) {
    event.preventDefault();
    const fromIndex = this.draggedMemberIndex;

    // フラグを真っ先にリセット
    this.draggedMemberUid = null;
    this.draggedMemberIndex = null;

    if (fromIndex !== null && fromIndex !== toIndex && fromIndex >= 0 && toIndex >= 0) {
      await this.reorderMembers(fromIndex, toIndex);
    } else {
      this.cdr.detectChanges();
    }
  }

  // ドラッグ終了処理
  onMemberDragEnd() {
    this.draggedMemberUid = null;
    this.draggedMemberIndex = null;
    this.cdr.detectChanges();
  }

  // 並び替え確定およびFirestore保存
  async reorderMembers(fromIndex: number, toIndex: number) {
    if (!this.boardId) return;

    const updatedMembers = [...this.members];
    const [movedMember] = updatedMembers.splice(fromIndex, 1);
    updatedMembers.splice(toIndex, 0, movedMember);

    // 画面側を即時更新
    this.members = updatedMembers;
    this.cdr.detectChanges();

    // Firestoreへ保存
    try {
      await this.boardService.updateMembersOrder(this.boardId, updatedMembers);
    } catch (error) {
      console.error('並び替えの保存に失敗しました:', error);
    }
  }


  /**
   * 現在のユーザーがメンバーかどうかを判定
   */
  isCurrentUserMember(): boolean {
    return this.members.some(m => m.uid === this.currentUserUid);
  }

  //// 自分の情報の編集を開始
  startEdit(member: BoardMember) {
    if (member.uid !== this.currentUserUid) return; // 自分の情報以外は拒否
    this.editingUid = member.uid;
    this.editingPosition = member.position || '';
    this.editingDomain = member.domain || '';
    this.editingStatusMessage = member.statusMessage || '';
    this.editingContactId = member.contactId || '';
  }

  //// 編集をキャンセル
  cancelEdit() {
    this.editingUid = null;
    this.editingPosition = '';
    this.editingDomain = '';
    this.editingStatusMessage = '';
    this.editingContactId = '';
  }

  //// プロフィール変更を保存
  async saveMemberProfile(member: BoardMember) {
    if (member.uid !== this.currentUserUid || !this.boardId) return;

    const updatedMember: BoardMember = {
      ...member,
      position: this.editingPosition ? this.editingPosition.trim() : '',
      domain: this.editingDomain ? this.editingDomain.trim() : '',
      statusMessage: this.editingStatusMessage ? this.editingStatusMessage.trim() : '',
      contactId: this.editingContactId ? this.editingContactId.trim() : ''
    };

    const index = this.members.findIndex(m => m.uid === member.uid);
    if (index !== -1) {
      this.members[index] = updatedMember;
    }
    this.cancelEdit();

    // 2. 即座に画面を描画更新
    this.cdr.markForCheck();
    this.cdr.detectChanges();

    try {
      await this.boardService.updateMemberProfile(this.boardId, updatedMember);
    } catch (error: any) {
      alert('プロフィールの更新に失敗しました: ' + (error.message || ''));
    }
  }
  ////
  /**
   * 招待モーダルを開く
   */
  openInviteModal() {
    this.showInviteModal = true;
    this.inviteEmail = '';
    this.inviteError = '';
  }

  /**
   * 招待モーダルを閉じる
   */
  closeInviteModal() {
    this.showInviteModal = false;
    this.inviteEmail = '';
    this.inviteError = '';
  }

  /**
   * メンバーを招待
   */
  async inviteMember() {
    if (!this.inviteEmail.trim()) {
      this.inviteError = 'メールアドレスを入力してください';
      return;
    }

    try {
      // ボード情報を取得して名前を取得
      const boardRef = doc(this.firestore, `boards/${this.boardId}`);
      const boardSnap = await getDoc(boardRef);
      const boardName = boardSnap.exists() ? boardSnap.data()['name'] : 'Unknown Board';

      await this.boardService.inviteMemberToBoard(
        this.boardId,
        this.inviteEmail.trim(),
        boardName
      );

      // フォームをすぐにリセット
      this.inviteEmail = '';
      this.inviteError = '';
      this.showInviteModal = false;
      this.cdr.detectChanges();

      // 成功メッセージ（フォームは既に閉じている）
      alert('招待を送信しました！');
    } catch (error: any) {
      this.inviteError = error.message || '招待送信に失敗しました';
      this.cdr.detectChanges();
    }
  }

  /**
   * メンバーを削除（全メンバーが可能）
  */
  async removeMember(member: BoardMember) {
    if (confirm(`${member.displayName} をボードから削除してもよろしいですか？`)) {
      try {
        await this.boardService.removeMemberFromBoard(this.boardId, member);
        alert('メンバーを削除しました');
      } catch (error: any) {
        alert('削除に失敗しました: ' + (error.message || 'Unknown error'));
      }
    }
  }
} 
