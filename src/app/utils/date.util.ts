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

/**
 * 日本の祝日判定ユーティリティ
 */

function isNthMonday(date: Date, nth: number): boolean {
  if (date.getDay() !== 1) return false;
  const day = date.getDate();
  return day > (nth - 1) * 7 && day <= nth * 7;
}

function getSpringEquinoxDay(year: number): number {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function getAutumnEquinoxDay(year: number): number {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

export function isNationalHoliday(date: Date): boolean {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();

  // 1. 固定祝日
  if (m === 1 && d === 1) return true;   // 元日
  if (m === 2 && d === 11) return true;  // 建国記念の日
  if (m === 2 && d === 23) return true;  // 天皇誕生日
  if (m === 4 && d === 29) return true;  // 昭和の日
  if (m === 5 && d === 3) return true;   // 憲法記念日
  if (m === 5 && d === 4) return true;   // みどりの日
  if (m === 5 && d === 5) return true;   // こどもの日
  if (m === 8 && d === 11) return true;  // 山の日
  if (m === 11 && d === 3) return true;  // 文化の日
  if (m === 11 && d === 23) return true; // 勤労感謝の日

  // 2. ハッピーマンデー
  if (m === 1 && isNthMonday(date, 2)) return true;  // 成人の日 (1月第2月曜)
  if (m === 7 && isNthMonday(date, 3)) return true;  // 海の日 (7月第3月曜)
  if (m === 9 && isNthMonday(date, 3)) return true;  // 敬老の日 (9月第3月曜)
  if (m === 10 && isNthMonday(date, 2)) return true; // スポーツの日 (10月第2月曜)

  // 3. 春分の日・秋分の日
  if (m === 3 && d === getSpringEquinoxDay(y)) return true;
  if (m === 9 && d === getAutumnEquinoxDay(y)) return true;

  return false;
}

/**
 * 【Step 2】土日・祝日・振替休日・国民の休日（シルバーウィーク等）すべてを含めた休日判定
 */
export function isHolidayOrWeekend(date: Date): boolean {
  const dayOfWeek = date.getDay();

  // 1. 土曜日(6) または 日曜日(0) は無条件で休日
  if (dayOfWeek === 0 || dayOfWeek === 6) return true;

  // 2. 純粋な祝日なら休日
  if (isNationalHoliday(date)) return true;

  // 3. 振替休日の正確な判定（日曜日が「純粋な祝日」だった場合の翌平日）
  let checkDate = new Date(date);
  checkDate.setDate(checkDate.getDate() - 1);
  while (checkDate.getDay() !== 0) { // 直近の日曜日まで遡る
    if (!isNationalHoliday(checkDate)) break;
    checkDate.setDate(checkDate.getDate() - 1);
  }
  if (checkDate.getDay() === 0 && isNationalHoliday(checkDate)) {
    return true; // 日曜日が祝日だったので振替休日
  }

  // 4. 国民の休日（シルバーウィーク等：前日と翌日の両方が「純粋な祝日」に挟まれた平日）
  const prevDay = new Date(date);
  prevDay.setDate(date.getDate() - 1);
  const nextDay = new Date(date);
  nextDay.setDate(date.getDate() + 1);

  if (isNationalHoliday(prevDay) && isNationalHoliday(nextDay)) {
    return true;
  }

  return false;
}