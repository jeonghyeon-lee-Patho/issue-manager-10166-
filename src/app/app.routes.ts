import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { BoardComponent } from './board/board.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'board/:boardId', component: BoardComponent }
];

