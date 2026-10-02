/**
 * 日付ユーティリティ
 */

export const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * 2つの日付の差を日数で返す（端数を切り上げ）
 */
export function getDaysDifference(date1: Date, date2: Date): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  d1.setHours(0, 0, 0, 0);
  d2.setHours(0, 0, 0, 0);
  const diffTime = d2.getTime() - d1.getTime();
  return Math.ceil(diffTime / MS_PER_DAY);
}

/** 
 * 期限のステータスを計算
 */
export interface DeadlineStatus {
  days: number;
  label: string | null;
  color: string;
  isOverdue: boolean;
  isToday: boolean;
}

export function calculateDeadlineStatus(dueDate?: number): DeadlineStatus {
  if (!dueDate) {
    return {
      days: Infinity,
      label: null,
      color: '#f9f9f9',
      isOverdue: false,
      isToday: false
    };
  }

  const deadline = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadlineDate = new Date(deadline);
  deadlineDate.setHours(0, 0, 0, 0);

  const diffTime = deadlineDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / MS_PER_DAY);

  if (diffDays < 0) {
    return {
      days: diffDays,
      label: '【期限切れ】',
      color: '#fee2e2',
      isOverdue: true,
      isToday: false
    };
  }

  if (diffDays === 0) {
    return {
      days: 0,
      label: '【今日まで】',
      color: '#e2e8f0',
      isOverdue: false,
      isToday: true
    };
  }

  if (diffDays <= 3) {
    return {
      days: diffDays,
      label: `【あと${diffDays}日】`,
      color: '#e2e8f0',
      isOverdue: false,
      isToday: false
    };
  }

  return {
    days: diffDays,
    label: null,
    color: '#f9f9f9',
    isOverdue: false,
    isToday: false
  };
}

/**
 * タイムスタンプをJP形式の日付文字列にフォーマット
 */
export function formatDateToJP(timestamp?: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

/**
 * タイムスタンプをJP形式の日時文字列にフォーマット
 */
export function formatDateTimeToJP(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * タイムスタンプを <input type="datetime-local"> 用のフォーマット (YYYY-MM-DDTHH:mm) に変換
 */
export function formatToDatetimeLocal(timestamp?: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const pad = (n: number) => (n < 10 ? '0' + n : n);
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

/**
 * <input type="datetime-local"> の入力値 (YYYY-MM-DDTHH:mm) をタイムスタンプ (ミリ秒) に変換
 */
export function parseDatetimeLocal(datetimeStr: string): number | undefined {
  if (!datetimeStr) return undefined;
  const time = new Date(datetimeStr).getTime();
  return isNaN(time) ? undefined : time;
}

/**
 * タイムスタンプを "MM/DD HH:mm" や "HH:mm" の形式にフォーマット
 */
export function formatTimeShort(timestamp?: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const pad = (n: number) => (n < 10 ? '0' + n : n);
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${m}/${d} ${hh}:${mm}`;
}