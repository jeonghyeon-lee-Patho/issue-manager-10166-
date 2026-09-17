import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Firestore関連のインポート
import { Firestore, doc, docData, setDoc } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

interface Task {
  id: string;
  title: string;
}

interface BoardData {
  tasks: Task[];
}

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './board.component.html',
  styleUrl: './board.component.css'
})
export class BoardComponent implements OnInit {

  boardId: string = '';
  newTaskTitle: string = '';
  tasks: Task[] = [];

  constructor(
    private route: ActivatedRoute,
    private firestore: Firestore
  ) {}
  
  ngOnInit() {
    // URLのパラメータが変わるたびに、該当するボードのFirestoreデータをリアルタイム監視
    this.route.params.pipe(
      switchMap(params => {
        this.boardId = params['boardId'];
        const boardRef = doc(this.firestore, `boards/${this.boardId}`);
        return docData(boardRef) as Observable<BoardData>;
      })
    ).subscribe(data => {
      // データが存在すればセット、なければ空配列
      this.tasks = data?.tasks || [];
    });
  }

  // タスクを追加してFirestoreへ保存
  async add() {
    if (!this.newTaskTitle.trim()) return;

    const newTask: Task = {
      id: Date.now().toString(),
      title: this.newTaskTitle.trim()
    };
    
    const updatedTasks = [...this.tasks, newTask];
    const boardRef = doc(this.firestore, `boards/${this.boardId}`);

    // Firestoreの指定ボードドキュメントを更新
    await setDoc(boardRef, { tasks: updatedTasks }, { merge: true });
    this.newTaskTitle = '';
  }

  /*
  boardId: string = '';
  newTask: string = '';
  tasks: string[] = [];

  constructor(private route: ActivatedRoute) {}

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.boardId = params['boardId'];
      this.tasks = [];
    });
  }

  add() {
    if (!this.newTask.trim()) return;
    this.tasks.push(this.newTask.trim());
    this.newTask = '';
  }

  */

  get currentUrl(): string {
    return window.location.href;
  }
}