import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { Auth, authState } from '@angular/fire/auth';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';

export const authGuard: CanActivateFn = async (route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);

  // authStateが初期化されるまで待つ
  const user = await firstValueFrom(authState(auth).pipe(take(1)));

  if (user) {
    return true;
  } else {
    router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
    return false;
  }
}; 
