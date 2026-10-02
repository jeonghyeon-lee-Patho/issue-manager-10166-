import { Component, OnInit, inject, DestroyRef, ChangeDetectorRef, NgZone, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
// Firestore関連のインポート
import { Firestore, doc, onSnapshot, setDoc, collection, query, where, orderBy, limit, updateDoc, deleteDoc } from '@angular/fire/firestore';
import { Auth, updateProfile } from '@angular/fire/auth';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TasksComponent } from './tasks/tasks.component';
import { Task } from './tasks/task.service';
import { CalendarComponent } from './calendar/calendar.component';
import { WikiComponent, WikiSection } from './wiki/wiki.component';
import { MembersComponent } from './members/members.component';
import { Unsubscribe } from 'firebase/firestore';


export interface BoardNotification {
  id?: string;
  targetUser: string;
  type: 'task' | 'member';
  title: string;
  message: string;
  createdAt: number;
  read: boolean;
}

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TasksComponent, CalendarComponent, WikiComponent, MembersComponent],
  templateUrl: './board.component.html',
  styleUrls: ['./board.component.css']
})
export class BoardComponent implements OnInit, OnDestroy, OnChanges {
  boardId: string = '';
  boardName: string = '';
  currentUserName: string = '';  // 現在のユーザー名
  selectedCategory: string = 'tasks';
  categories = ['tasks', 'calendar', 'wiki', 'members'];
  categoryLabels: { [key: string]: string } = {
    tasks: 'Tasks',
    calendar: 'Calendar',
    wiki: 'Wiki',
    members: 'Members'
  };


  // 編集モード
  isEditingBoardName = false;
  editingBoardName = '';
  isEditingUserName = false;
  editingUserName = '';
  currentUserPhotoUrl: string = '';
  readonly defaultPhotoUrl = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%23e2e8f0'/><circle cx='50' cy='40' r='18' fill='%2394a3b8'/><path d='M 18,88 C 18,65 32,58 50,58 C 68,58 82,65 82,88 Z' fill='%2394a3b8'/></svg>`;

  // データ
  columns: string[] = [];
  tasks: Task[] = [];
  wikiSections: WikiSection[] = [];
  boardMembers: string[] = [];

  notifications: BoardNotification[] = [];
  unreadCount: number = 0;
  showNotifications: boolean = false;
  isAdmin: boolean = false;
  isProcessingNameSave = false;
  lastUpdatedAt: number = 0;

  private noticeUnsub?: Unsubscribe;
  private unreadUnsub?: Unsubscribe;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);

  ngOnInit() {
    // ボード固有のユーザー名は Firestore から取得
    this.route.params.pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(params => {
      this.boardId = params['boardId'];
      this.selectedCategory = params['category'] || 'tasks';
      if (!this.boardId) return;

      const boardRef = doc(this.firestore, `boards/${this.boardId}`);

      const unsubscribe = onSnapshot(boardRef, (docSnap) => {
        this.ngZone.run(() => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            
            const currentUserUid = this.auth.currentUser?.uid;
            if (currentUserUid && !data['memberUids']?.includes(currentUserUid)) {
              alert('このボードから削除されています。');
              this.router.navigate(['/']);
              return;
            }
            
            // ★ Firestoreの最新タイムスタンプを保持
            this.lastUpdatedAt = data['lastUpdatedAt'] || data['createdAt'] || 0;

            this.boardName = data['name'] || this.boardId;
            this.columns = data['columns'] || ['To Do', 'In Progress', 'In Review', 'Done'];
            this.tasks = data['tasks'] || [];
            this.wikiSections = data['wikiSections'] || [];

            // ボード内のユーザー名を取得
            // 優先順：userName > 現在のユーザーのメンバー情報のdisplayName > 'User'
            let userName = data['userName'] || 'User';
            let userPhoto = ''; // 初期化
            let userRole = 'member';

            // membersから現在のユーザーのdisplayNameを探す
            if (this.auth.currentUser && data['members']) {
              const currentMember = data['members'].find((m: any) => m.uid === this.auth.currentUser?.uid);
              if (currentMember) {
                if (currentMember.displayName) userName = currentMember.displayName;
                if (currentMember.photoURL) userPhoto = currentMember.photoURL;
                if (currentMember.role) userRole = currentMember.role;
              } else {
                if (data['creatorId'] === this.auth.currentUser.uid) {
                  userRole = 'admin';
                }
              }
              // ボードメンバーの displayName を抽出
              this.boardMembers = data['members']
                .map((m: any) => m.displayName || m.email)
                .filter((name: string) => name);
            }

            this.currentUserName = userName;
            this.currentUserPhotoUrl = userPhoto || this.defaultPhotoUrl;
            this.isAdmin = (userRole === 'admin');

            this.subscribeNotifications();
          } else {
            this.boardName = '';
            this.columns = ['To Do', 'In Progress', 'In Review', 'Done'];
            this.tasks = [];
            this.wikiSections = [];
            this.currentUserName = 'User';
            this.currentUserPhotoUrl = this.defaultPhotoUrl;
            this.isAdmin = false;
          }
          this.cdr.markForCheck();
          this.cdr.detectChanges();

          if (!this.noticeUnsub) {
            this.subscribeNotifications();
          }
        });
      }, (err) => {
        console.error('Firestore Read Error:', err);
      });

      this.destroyRef.onDestroy(() => unsubscribe());
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['currentUserName']) {
      this.subscribeNotifications();
    }
  }

  ngOnDestroy() {
    if (this.noticeUnsub) this.noticeUnsub();
    if (this.unreadUnsub) this.unreadUnsub();
  }

  async deleteNotification(event: Event, notice: BoardNotification) {
    event.stopPropagation(); // 既読イベントのバブリング防止
    if (!notice.id || !this.boardId) return;

    const targetId = notice.id;

    if (!notice.read && this.unreadCount > 0) {
      this.unreadCount--;
    }

    this.notifications = this.notifications.filter(n => n.id !== targetId);
    this.cdr.markForCheck();
    this.cdr.detectChanges();

    try {
      const noticeRef = doc(this.firestore, `boards/${this.boardId}/notifications/${targetId}`);
      await deleteDoc(noticeRef);
    } catch (err) {
      console.error('Notification Delete Error:', err);
    }
  }

  // すべて削除処理
  async deleteAllNotifications() {
    if (this.notifications.length === 0) return;
    if (!confirm('表示中のお知らせをすべて削除してもよろしいですか？') || !this.boardId) return;

    const targets = [...this.notifications];

    // 1. UI側を即時クリア

    const unreadInTargets = targets.filter(n => !n.read).length;
    this.unreadCount = Math.max(0, this.unreadCount - unreadInTargets);

    this.notifications = [];
    this.cdr.markForCheck();
    this.cdr.detectChanges();

    // 2. 裏でFirestoreから一括削除
    try {
      const deletePromises = targets
        .filter(n => n.id)
        .map(n => {
          const noticeRef = doc(this.firestore, `boards/${this.boardId}/notifications/${n.id}`);
          return deleteDoc(noticeRef);
        });

      await Promise.all(deletePromises);
    } catch (err) {
      console.error('All Notifications Delete Error:', err);
    }
  }

  subscribeNotifications() {
    // 既存のリスナーがあれば解除（二重登録を防止）
    if (this.noticeUnsub) {
      this.noticeUnsub();
      this.noticeUnsub = undefined;
    }
    if (this.unreadUnsub) {
      this.unreadUnsub();
      this.unreadUnsub = undefined;
    }

    if (!this.boardId || !this.currentUserName) return;
    const noticesRef = collection(this.firestore, `boards/${this.boardId}/notifications`);

    // ① 通知リスト取得（画面表示用：最新20件）
    const q = query(
      noticesRef,
      where('targetUser', 'in', [this.currentUserName, 'ALL']),
      orderBy('createdAt', 'desc'),
      limit(15)
    );

    this.noticeUnsub = onSnapshot(q, (snapshot) => {
      this.ngZone.run(() => {
        this.notifications = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as BoardNotification[];

        this.cdr.markForCheck();
        this.cdr.detectChanges();
      });
    }, (error) => {
      console.error("通知リスト取得エラー:", error);
    });

    // ② 未読数カウント（バッジ表示用：未読データをすべてリアルタイムカウント）
    const unreadQuery = query(
      noticesRef,
      where('targetUser', 'in', [this.currentUserName, 'ALL']),
      where('read', '==', false)
    );

    this.unreadUnsub = onSnapshot(unreadQuery, (snapshot) => {
      this.ngZone.run(() => {
        // 画面に表示されていない分も含め、データベース上の正しい未読総数をセット
        this.unreadCount = snapshot.docs.length;

        this.cdr.markForCheck();
        this.cdr.detectChanges();
      });
    }, (err) => console.error("未読カウント取得エラー:", err));
  }

  toggleNotifications() {
    this.showNotifications = !this.showNotifications;
  }

  async markAsRead(notice: BoardNotification) {
    if (notice.read || !notice.id) return;
    notice.read = true;

    this.cdr.detectChanges();
    try {
      const noticeRef = doc(this.firestore, `boards/${this.boardId}/notifications/${notice.id}`);
      await updateDoc(noticeRef, { read: true });
    } catch (err) {
      console.error('Mark as read error:', err);
    }
  }

  async markAllAsRead() {
    if (this.unreadCount === 0) return;

    // 1. UI側を即時更新（未読数を0に）
    this.notifications.forEach(n => n.read = true);
    this.unreadCount = 0;
    this.cdr.markForCheck();
    this.cdr.detectChanges(); // 即座に画面を再描画

    // 2. 裏でFirestoreを一括更新
    try {
      const unreadList = this.notifications.filter(n => n.id);
      const promises = unreadList.map(notice => {
        const noticeRef = doc(this.firestore, `boards/${this.boardId}/notifications/${notice.id}`);
        return updateDoc(noticeRef, { read: true });
      });
      await Promise.all(promises);
    } catch (err) {
      console.error('Mark all as read error:', err);
    }
  }

  selectCategory(category: string) {
    this.selectedCategory = category;
    this.router.navigate(['/board', this.boardId, category]);
  }

  get currentUrl(): string {
    return window.location.href;
  }

  // ボード名編集
  startEditBoardName() {
    if (!this.isAdmin) return;
    this.isEditingBoardName = true;
    this.editingBoardName = this.boardName;
  }

  async saveBoardName() {
    if (!this.isAdmin) return;
    if (!this.editingBoardName.trim() || this.editingBoardName === this.boardName) {
      this.isEditingBoardName = false;
      return;
    }

    const boardRef = doc(this.firestore, `boards/${this.boardId}`);
    await setDoc(boardRef, { name: this.editingBoardName.trim() }, { merge: true });
    this.boardName = this.editingBoardName.trim();
    this.isEditingBoardName = false;
    this.cdr.detectChanges();
  }

  cancelEditBoardName() {
    this.isEditingBoardName = false;
  }

  // ユーザー名編集
  startEditUserName() {
    this.isEditingUserName = true;
    this.editingUserName = this.currentUserName;
  }

  // 【追加】ファイルが選択された時の処理
  async onFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    // Firestoreの制限(1MB)を考慮し、100KB以上の画像は弾くか警告
    if (file.size > 100 * 1024) {
      alert('画像サイズが大きすぎます。100KB以下の画像を選択してください。');
      return;
    }

    // 画像をBase64文字列に変換して読み込む
    const reader = new FileReader();
    reader.onload = async (e: any) => {
      this.ngZone.run(() => {
        const base64Image = e.target.result;
        this.currentUserPhotoUrl = base64Image;
        this.cdr.detectChanges();
        this.saveProfileImage(base64Image);
      });
    };
    reader.readAsDataURL(file);
  }

  // 画像をFirestoreの members 配列に保存する
  async saveProfileImage(photoURL: string) {
    if (!this.boardId || !this.auth.currentUser) return;

    const boardRef = doc(this.firestore, `boards/${this.boardId}`);
    const { getDoc } = await import('@angular/fire/firestore');
    const boardSnap = await getDoc(boardRef);

    if (boardSnap.exists()) {
      const boardData = boardSnap.data();
      const members = (boardData['members'] || []) as any[];

      const updatedMembersList = members.map(m => {
        if (m.uid === this.auth.currentUser?.uid) {
          return { ...m, photoURL: photoURL };
        }
        return m;
      });

      const cleanedMembers = updatedMembersList.map(m => {
        const cleaned: any = { ...m };
        Object.keys(cleaned).forEach(k => { if (cleaned[k] === undefined) delete cleaned[k]; });
        return cleaned;
      });

      await setDoc(boardRef, { members: cleanedMembers }, { merge: true });
      this.cdr.markForCheck();
      this.cdr.detectChanges();
    }
  }

  // カスタム画像が設定されているか判定
  get hasCustomPhoto(): boolean {
    return !!this.currentUserPhotoUrl && this.currentUserPhotoUrl !== this.defaultPhotoUrl;
  }

  // デフォルト画像に戻す（削除）処理
  async resetProfileImage(event: Event) {
    // 画像クリック（ファイル選択）イベントのバブリングを防止
    event.stopPropagation();

    if (!confirm('プロフィール画像を削除しますか？')) return;

    this.ngZone.run(async () => {
      // 画面表示をデフォルト画像に切り替え
      this.currentUserPhotoUrl = this.defaultPhotoUrl;
      this.cdr.detectChanges();

      // Firestore の photoURL を空文字で上書き保存
      await this.saveProfileImage('');
    });
  }

  async saveUserName() {
    if (this.isProcessingNameSave) return;
    this.isProcessingNameSave = true;
    const newUserName = this.editingUserName.trim();

    if (!newUserName || newUserName === this.currentUserName) {
      this.isEditingUserName = false;
      this.isProcessingNameSave = false;
      return;
    }

    try {
      const boardRef = doc(this.firestore, `boards/${this.boardId}`);
      const { getDoc } = await import('@angular/fire/firestore');
      const boardSnap = await getDoc(boardRef);

      if (boardSnap.exists()) {
        const boardData = boardSnap.data();
        const members = (boardData['members'] || []) as any[];

        const isDuplicate = members.some(
          m => m.uid !== this.auth.currentUser?.uid && m.displayName?.trim().toLowerCase() === newUserName.toLowerCase()
        );

        if (isDuplicate) {
          alert(`表示名「${newUserName}」はすでにこのボード内で使用されています。`);
          this.editingUserName = this.currentUserName;
          this.isEditingUserName = false;
          this.isProcessingNameSave = false;
          this.cdr.detectChanges();
          return;
        }
      }

      const oldUserName = this.currentUserName;

      const updatedTasks = this.tasks.map(task => {
        let updatedTask = { ...task };

        if (task.comments && task.comments.length > 0) {
          updatedTask.comments = task.comments.map(comment => ({
            ...comment,
            author: comment.author === oldUserName ? newUserName : comment.author
          }));
        }

        if (task.assignees && task.assignees.length > 0) {
          updatedTask.assignees = task.assignees.map(assignee =>
            assignee === oldUserName ? newUserName : assignee
          );
        } 

        if (task.activities && task.activities.length > 0) {
          updatedTask.activities = task.activities.map(act => ({
            ...act,
            user: act.user === oldUserName ? newUserName : act.user
          }));
        }
        return updatedTask;
      });

      // 現在のボード情報を取得して、メンバー配列を更新
      if (boardSnap.exists()) {
        const boardData = boardSnap.data();
        const members = (boardData['members'] || []) as any[];

        const updatedMembersList = members.map(m => {
          if (m.uid === this.auth.currentUser?.uid) {
            return { ...m, displayName: newUserName };
          }
          return m;
        });

        await setDoc(boardRef, {
          userName: newUserName,
          creatorName: newUserName,
          members: updatedMembersList,
          tasks: updatedTasks,
          lastUpdatedAt: Date.now()
        }, { merge: true });
      }

      this.currentUserName = newUserName;
      this.tasks = updatedTasks;
      this.isEditingUserName = false;
      this.subscribeNotifications();
    } catch (err) {
      console.error('名前の保存エラー:', err);
      this.editingUserName = this.currentUserName;
      this.isEditingUserName = false;
    } finally {
      this.isProcessingNameSave = false;
      this.cdr.detectChanges();
    }
  }

  cancelEditUserName() {
    this.isEditingUserName = false;
  }
}
