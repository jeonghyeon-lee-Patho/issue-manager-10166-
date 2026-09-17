import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent {
  targetBoardId: string = '';

  constructor(private router: Router) {}

  // ① ランダムなIDを生成して新規ボードへ移動
  createRandomBoard() {
    const randomId = Math.random().toString(36).substring(2, 9);
    this.router.navigate(['/board', randomId]);
  }

  // ② 入力されたボードIDへ移動
  joinBoard() {
    if (!this.targetBoardId.trim()) return;
    this.router.navigate(['/board', this.targetBoardId.trim()]);
  }
}