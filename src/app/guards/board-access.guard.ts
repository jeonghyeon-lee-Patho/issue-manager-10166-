import { Injectable, inject } from '@angular/core';
import { Router, CanActivateFn, ActivatedRouteSnapshot } from '@angular/router';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { firstValueFrom } from 'rxjs';

export const boardAccessGuard: CanActivateFn = async (route, state) => {
  const firestore = inject(Firestore);
  const auth = inject(Auth);
  const router = inject(Router);

  const boardId = route.paramMap.get('boardId');

  if (!boardId) {
    router.navigate(['/home']);
    return false;
  }

  try {
    // ボードが存在するかチェック
    const boardRef = doc(firestore, `boards/${boardId}`);
    const boardSnap = await getDoc(boardRef);

    if (!boardSnap.exists()) {
      // ボードが存在しない
      alert('このボードは存在しません');
      router.navigate(['/home']);
      return false;
    }

    const boardData = boardSnap.data();
    const currentUserUid = auth.currentUser?.uid;

    // ボードのメンバーに含まれているかチェック
    if (currentUserUid && !boardData['memberUids']?.includes(currentUserUid)) {
      alert('このボードへのアクセス権がありません');
      router.navigate(['/home']);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Board Access Check Error:', err);
    alert('ボード情報の確認に失敗しました');
    router.navigate(['/home']);
    return false;
  }
};
