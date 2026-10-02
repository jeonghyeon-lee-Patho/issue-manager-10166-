import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Auth, signInWithEmailAndPassword, createUserWithEmailAndPassword, authState, sendEmailVerification, signOut, User, sendPasswordResetEmail } from '@angular/fire/auth';
import { first } from 'rxjs/operators';


@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent implements OnInit {
  email = '';
  password = '';
  isSignUp = false;
  authError = '';
  currentUserForVerification: User | null = null;
  showResendLink = false;
  showPassword = false;
  isLoading = false;

  constructor(
    private auth: Auth,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    // 初回のFirebase認証チェック完了を待ってから画面を表示
    authState(this.auth).pipe(first()).subscribe(user => {
      if (user && user.emailVerified) {
        this.router.navigate(['/home']);
      }
    });
  }

  async handleAuth() {
    if (!this.email.trim() || !this.password.trim()) {
      this.authError = 'メールアドレスとパスワードを入力してください。';
      return;
    }

    if (this.password.length < 6) {
      this.authError = 'パスワードは6文字以上で指定してください。';
      return;
    }

    this.authError = '';
    this.showResendLink = false;
    this.isLoading = true;

    try {
      if (this.isSignUp) {
        const credential = await createUserWithEmailAndPassword(this.auth, this.email.trim(), this.password);
        await sendEmailVerification(credential.user);
        alert('登録確認メールを送信しました。メール内のリンクをクリックして登録を完了させてください。\n\n※メールが届かない場合は、迷惑メール（スパム）フォルダもご確認ください。');
        await signOut(this.auth); // 新規登録後も認証完了までログインさせない場合
      } else {
        const credential = await signInWithEmailAndPassword(this.auth, this.email.trim(), this.password);
        // メール認証チェック
        if (!credential.user.emailVerified) {
          this.authError = 'メールアドレスの確認が完了していません。\n届いた確認メール（迷惑メールフォルダ含む）のリンクをクリックしてください。';
          this.showResendLink = true;
          await signOut(this.auth);
          return;
        }
      }
      // 成功したらトップ画面（ホーム）へ移動
      this.router.navigate(['/home']);
    } catch (err: any) {
      this.authError = this.getJapaneseErrorMessage(err.code);
      this.cdr.detectChanges();
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  // 既存・未確認ユーザー用：確認メール再送メソッド
  async resendVerificationEmail() {
    if (!this.email.trim() || !this.password.trim()) {
      alert('メールアドレスとパスワードを入力した状態で実行してください。');
      return;
    }

    this.isLoading = true;
    try {
      // 再度一時的にサインインしてメール送信
      const credential = await signInWithEmailAndPassword(this.auth, this.email.trim(), this.password);
      await sendEmailVerification(credential.user);
      await signOut(this.auth);

      alert('確認メールを再送信しました。\nメールボックスおよび迷惑メールフォルダをご確認ください。');
      this.showResendLink = false;
    } catch (err: any) {
      alert('再送信に失敗しました: ' + this.getJapaneseErrorMessage(err.code));
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  private getJapaneseErrorMessage(code: string): string {
    switch (code) {
      case 'auth/invalid-email':
        return 'メールアドレスの形式が正しくありません。';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'メールアドレスまたはパスワードが間違っています。';
      case 'auth/email-already-in-use':
        return 'このメールアドレスは既に登録されています。\n届いた確認メール（迷惑メールフォルダ含む）のリンクをクリックするか、ログインをお試しください。';
      case 'auth/weak-password':
        return 'パスワードは6文字以上で入力してください。';
      case 'auth/too-many-requests':
        return '短時間に多数のリクエストが行われました。少し時間（1〜2分）を置いてから再度お試しください。';
      case 'auth/network-request-failed':
        return '通信エラーが発生しました。ネットワーク接続をご確認ください。';
      default:
        return `認証エラーが発生しました (${code})。入力内容をご確認ください。`;
    }
  }

  async resetPassword() {
    if (!this.email.trim()) {
      this.authError = 'パスワード再設定メールを送信するため、メールアドレスを入力してください。';
      return;
    }

    this.isLoading = true;

    try {
      await sendPasswordResetEmail(this.auth, this.email.trim());
      alert('パスワード再設定用のメールを送信しました。メールボックスをご確認ください。');
      this.authError = '';
    } catch (err: any) {
      this.authError = 'メールの送信に失敗しました。メールアドレスをご確認ください。';
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }
}