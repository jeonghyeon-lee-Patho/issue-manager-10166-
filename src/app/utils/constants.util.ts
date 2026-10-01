/**
 * 定数ユーティリティ
 */

export const PRIORITY_LABELS: Record<'high' | 'medium' | 'low', string> = {
  high: '高 🔥',
  medium: '中 ⚡',
  low: '低 ☕'
};

export const PRIORITY_CSS_CLASSES: Record<'high' | 'medium' | 'low', string> = {
  high: 'priority-high',
  medium: 'priority-medium',
  low: 'priority-low'
};

export const PRIORITY_RANK: Record<'high' | 'medium' | 'low', number> = {
  high: 3,
  medium: 2,
  low: 1
};

export const MAX_TAGS = 5;

/**
 * 優先度ラベルを取得
 */
export function getPriorityLabel(priority?: string): string {
  return PRIORITY_LABELS[priority as keyof typeof PRIORITY_LABELS] || (priority || '未設定');
}

/**
 * 優先度CSSクラスを取得
 */
export function getPriorityClass(priority?: string): string {
  if (!priority) return '';
  return PRIORITY_CSS_CLASSES[priority as keyof typeof PRIORITY_CSS_CLASSES] || '';
}
