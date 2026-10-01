/**
 * オブジェクトユーティリティ
 */

/**
 * オブジェクトから undefined フィールドを削除
 * @param obj 対象オブジェクト
 * @returns 新しいオブジェクト（undefined フィールドを除去）
 */
export function cleanUndefinedFields<T extends Record<string, any>>(obj: T): Partial<T> {
  const cleaned: any = { ...obj };
  Object.keys(cleaned).forEach(key => {
    if (cleaned[key] === undefined) {
      delete cleaned[key];
    }
  });
  return cleaned;
}

/**
 * 配列内の値をトグル（あれば削除、なければ追加）
 */
export function toggleArrayValue<T>(array: T[], value: T): T[] {
  const index = array.indexOf(value);
  if (index > -1) {
    return array.filter((_, i) => i !== index);
  }
  return [...array, value];
}
