import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { BoardComponent } from './board/board.component';
import { LoginComponent } from './login/login.component';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'home', component: HomeComponent },
  { path: 'board/:boardId', redirectTo: 'board/:boardId/tasks', pathMatch: 'full' },
  { path: 'board/:boardId/:category', component: BoardComponent }
]; 

  