import { Component, OnInit, ChangeDetectorRef, DestroyRef, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Auth, authState, User, signOut, updateProfile, user } from '@angular/fire/auth';
import { Firestore, collection, query, where, doc, setDoc, onSnapshot, updateDoc, deleteDoc, getDoc } from '@angular/fire/firestore';
import { BoardService, BoardInvitation } from '../services/board.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent implements OnInit {
  currentUser: User | null = null;
  allBoards: any[] = [];
  pendingBoards: BoardInvitation[] = [];
 
  showModal = false;
  modalStep: 1 | 2 = 1;

  newBoardName = '';
  newBoardId = '';
  userName = '';

  columns: string[] = ['TODO', 'IN PROGRESS', 'IN REVIEW', 'DONE'];
  newColumnInput = '';
  showAddColumnInput = false;

  draggedBoard: any = null;

  // ボード名編集
  editingBoardId: string | null = null;
  editingBoardNameValue: string = '';

  private firestore = inject(Firestore);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private auth = inject(Auth);
  private boardService = inject(BoardService);
  private destroyRef = inject(DestroyRef);

  ngOnInit() {
    authState(this.auth).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(async user => {
      if (!user) {
        this.router.navigate(['/login']);
      } else {
        this.currentUser = user;

        const boardsRef = collection(this.firestore, 'boards');
        const ownedQuery = query(boardsRef, where('ownerId', '==', user.uid));
        const joinedQuery = query(boardsRef, where('memberUids', 'array-contains', user.uid));

        const ownedMap = new Map<string, any>();
        const joinedMap = new Map<string, any>();

        // 【修正1】両方のボード情報をマージし、ユーザー個別の順序で並び替えて反映する関数
        const updateAllBoards = async () => {
          const mergedMap = new Map([...ownedMap, ...joinedMap]);
          let boards = Array.from(mergedMap.values());

          // ユーザー個別の順序を取得
          let userBoardOrder: string[] = [];
          try {
            userBoardOrder = await this.boardService.getUserBoardOrder(user.uid);
          } catch (error) {
            console.log('ボード順序の取得に失敗（初回の可能性あり）:', error);
          }

          // ユーザー順序に基づいてソート
          if (userBoardOrder.length > 0) {
            boards.sort((a, b) => {
              const indexA = userBoardOrder.indexOf(a.id);
              const indexB = userBoardOrder.indexOf(b.id);

              // リストにあるものを先に、ない場合は末尾に追加
              if (indexA === -1 && indexB === -1) return 0;
              if (indexA === -1) return 1;
              if (indexB === -1) return -1;
              return indexA - indexB;
            });
          }

          this.allBoards = boards;
          this.cdr.detectChanges();
        };

        // 所有ボードを取得
        const unsubscribeOwned = onSnapshot(ownedQuery, (snapshot) => {
          ownedMap.clear();
          snapshot.docs.forEach(docSnap => {
            ownedMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
          });
          updateAllBoards();
        }, (error) => console.error("所有ボード取得エラー:", error));

        // 参加ボードを取得
        const unsubscribeJoined = onSnapshot(joinedQuery, (snapshot) => {
          joinedMap.clear();
          snapshot.docs.forEach(docSnap => {
            joinedMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
          });
          updateAllBoards();
        }, (error) => console.error("参加ボード取得エラー:", error));

        this.destroyRef.onDestroy(() => {
          unsubscribeOwned();
          unsubscribeJoined();
        });

        // 招待待ちボードを取得
        if (user.email) {
          const unsubscribeInvitations = this.boardService.getMyInvitations(user.email).subscribe(
            invitations => {
              this.pendingBoards = invitations;
              this.cdr.detectChanges();
            },
            error => console.error("招待取得エラー:", error)
          );

          this.destroyRef.onDestroy(() => unsubscribeInvitations.unsubscribe?.());
        }
      }
      this.cdr.detectChanges();
    });
  }

  nextStep() {
    if (!this.newBoardName.trim()) {
      alert('ボード名を入力してください。');
      return;
    }
    this.modalStep = 2;
  }

  prevStep() {
    this.modalStep = 1;
  }

  toggleAddColumnInput() {
    this.showAddColumnInput = !this.showAddColumnInput;
    this.newColumnInput = '';
  }

  addColumnSetting() {
    if (!this.newColumnInput.trim()) return;
    this.columns.push(this.newColumnInput.trim());
    this.newColumnInput = '';
    this.showAddColumnInput = false;
  }

  removeColumnSetting(index: number) {
    if (this.columns.length <= 1) {
      alert('最低1つのリストが必要です。');
      return;
    }
    this.columns.splice(index, 1);
  }

  async createBoard() {
    if (!this.newBoardName.trim() || !this.currentUser) return;

    // メールアドレスから＠前の部分を取得
    const emailPrefix = this.currentUser.email?.split('@')[0] || 'User';

    // ユーザー入力がある場合はそれを使用、ない場合はメールアドレスのプレフィックス
    const displayName = this.userName.trim() || emailPrefix;

    if (this.userName.trim()) {
      try {
        await updateProfile(this.currentUser, {
          displayName: this.userName.trim()
        });
      } catch (error) {
        console.error('Failed to update user profile:', error);
      }
    }

    const customId = this.newBoardId.trim() || Math.random().toString(36).substring(2, 9);
    const boardRef = doc(this.firestore, `boards/${customId}`);

    // 新規作成時に末尾の order を付与
    await setDoc(boardRef, {
      name: this.newBoardName.trim(),
      ownerId: this.currentUser.uid,
      creatorName: displayName,
      userName: displayName,
      createdAt: Date.now(),
      order: this.allBoards.length,
      columns: this.columns,
      tasks: [],
      members: [
        {
          uid: this.currentUser.uid,
          //displayName: this.currentUser.displayName || 'User',
          displayName: displayName,
          email: this.currentUser.email || '',
          photoURL: this.currentUser.photoURL || '',
          role: 'admin',
          joinedAt: Date.now()
        }
      ],
      memberUids: [this.currentUser.uid]
    }, { merge: true });

    this.closeModal();
    this.router.navigate(['/board', customId]);
  }

  closeModal() {
    this.showModal = false;
    this.newBoardName = '';
    this.newBoardId = '';
    this.userName = '';
    this.columns = ['TODO', 'IN PROGRESS', 'IN REVIEW', 'DONE'];
    this.newColumnInput = '';
    this.showAddColumnInput = false;
    this.modalStep = 1;
  }

  logout() {
    signOut(this.auth).then(() => this.router.navigate(['/login']));
  }

  goToBoard(boardId: string) {
    this.router.navigate(['/board', boardId]);
  }

  async joinBoard(invitation: BoardInvitation) {
    const displayName = prompt('このボードでの表示名を入力してください:');
    if (!displayName) return;

    try {
      if (invitation.id) {
        await this.boardService.acceptInvitation(invitation.id, displayName);
        alert('ボードに参加しました！');
        this.goToBoard(invitation.boardId);
      }
    } catch (error: any) {
      alert('参加に失敗しました: ' + (error.message || 'Unknown error'));
    }
  }

  async rejectInvitation(invitation: BoardInvitation) {
    if (invitation.id) {
      try {
        await this.boardService.rejectInvitation(invitation.id);
        alert('招待を却下しました');
      } catch (error: any) {
        alert('却下に失敗しました: ' + (error.message || 'Unknown error'));
      }
    }
  }

  async deleteBoard(event: Event, board: any) {
    event.stopPropagation();

    const confirmDelete = confirm(
      `ボード「${board.name}」を削除してもよろしいですか？\n\nこのボードのメンバーからあなたが削除されます。\nメンバーが一人も残らなくなった場合、ボード自体が削除されます。`
    );

    if (!confirmDelete || !this.currentUser) return;

    try {
      const boardRef = doc(this.firestore, `boards/${board.id}`);
      const boardSnap = await getDoc(boardRef);

      if (!boardSnap.exists()) {
        alert('ボードが見つかりません');
        return;
      }

      const boardData = boardSnap.data();
      const members = (boardData['members'] || []) as any[];

      let updatedMembers = members.filter(m => m.uid !== this.currentUser?.uid);

      if (updatedMembers.length === 0) {
        await deleteDoc(boardRef);
        alert('ボードを削除しました');
      } else {
        const hasAdmin = updatedMembers.some(m => m.role === 'admin');

        if (!hasAdmin) {
          // 残ったメンバーからランダムで1人を管理者（admin）に昇格
          const randomIndex = Math.floor(Math.random() * updatedMembers.length);
          updatedMembers[randomIndex] = {
            ...updatedMembers[randomIndex],
            role: 'admin'
          };
          alert(`管理者権限が「${updatedMembers[randomIndex].displayName}」さんに引き継がれました。`);
        }

        const memberUids = updatedMembers.map(m => m.uid);
        await updateDoc(boardRef, {
          members: updatedMembers,
          memberUids: memberUids
        });
        alert('ボードから削除されました');
      }

      this.allBoards = this.allBoards.filter(b => b.id !== board.id);
      this.cdr.detectChanges();
    } catch (error: any) {
      alert('ボードの削除に失敗しました: ' + (error.message || 'Unknown error'));
    }
  }

  onBoardDragStart(event: DragEvent, board: any) {
    this.draggedBoard = board;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', board.id);
    }
  }

  onBoardDragEnd(event: DragEvent) {
    this.draggedBoard = null;
  }

  onBoardDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  // ドロップ時にユーザー個別の順序番号を Firestore に保存
  async onBoardDrop(event: DragEvent, targetBoard: any) {
    event.preventDefault();
    if (!this.draggedBoard || this.draggedBoard.id === targetBoard.id) return;

    const draggedIndex = this.allBoards.findIndex(b => b.id === this.draggedBoard.id);
    const targetIndex = this.allBoards.findIndex(b => b.id === targetBoard.id);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      // 1. ローカル配列で要素の位置を入れ替え
      const [movedBoard] = this.allBoards.splice(draggedIndex, 1);
      this.allBoards.splice(targetIndex, 0, movedBoard);

      this.cdr.detectChanges();

      // 2. ユーザー個別の順序を Firestore に保存（共有ボードの order フィールドは変更しない）
      try {
        if (this.currentUser) {
          const boardIds = this.allBoards.map(b => b.id);
          await this.boardService.saveBoardOrder(this.currentUser.uid, boardIds);
        }
      } catch (error) {
        console.error('ユーザー順序の更新に失敗しました:', error);
      }
    }

    this.draggedBoard = null;
  }

  startEditBoardName(board: any) {
    if (!this.isBoardAdmin(board)) {
      return;
    }

    this.editingBoardId = board.id;
    this.editingBoardNameValue = board.name;
    this.cdr.detectChanges();

    setTimeout(() => {
      const input = document.querySelector(`input[data-board-id="${board.id}"]`) as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  }

  // async完了後に detectChanges() を呼び出してEnter1回で確実にUIを更新
  async saveBoardName(board: any) {
    if (!this.isBoardAdmin(board)) {
      this.editingBoardId = null;
      return;
    }

    const newName = this.editingBoardNameValue.trim();
    if (!newName || newName === board.name) {
      this.editingBoardId = null;
      return;
    }

    board.name = newName;
    this.editingBoardId = null;
    this.cdr.detectChanges();

    try {
      const boardRef = doc(this.firestore, `boards/${board.id}`);
      await updateDoc(boardRef, {
        name: newName,
        lastUpdatedAt: Date.now()
      });
    } catch (error: any) {
      alert('ボード名の更新に失敗しました: ' + (error.message || 'Unknown error'));
    }
  }

  cancelEditBoardName() {
    this.editingBoardId = null;
  }

  trackByBoardId(index: number, board: any): string {
    return board.id;
  }

  isBoardAdmin(board: any): boolean {
    if (!this.currentUser || !board || !board.members || !Array.isArray(board.members)) {
      return false;
    }

    const me = board.members.find((m: any) => m.uid === this.currentUser?.uid);
    return me?.role === 'admin';
  }
}