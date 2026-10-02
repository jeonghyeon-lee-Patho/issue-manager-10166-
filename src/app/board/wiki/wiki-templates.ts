export interface WikiTemplate {
  title: string;
  icon: string;
  content: string;
}

// あらかじめ用意しておくテンプレート群
export const DEFAULT_TEMPLATES: { [key: string]: WikiTemplate } = {
  vision: {
    title: 'チームのゴール & ビジョン',
    icon: '🎯',
    content: `[テンプレート]
■ 私たちのゴール
・2026年内に〇〇サービスをリリースする
・チーム全員が楽しみながら成果を出す

■ 大切にしたい価値観 (Core Values) 
1. 迅速なコミュニケーション
2. 失敗を恐れずチャレンジする
3. お互いのフィードバックをリスペクトする`
  }, 
  rules: {
    title: 'タスク運用ルール',
    icon: '📋',
    content: `[テンプレート]
■ タスク運用の約束
1. タスクを作ったら必ず担当者か期限（Due Date）を設定する
2. 着手したらステータスを「In Progress」へ移動する
3. 困った時はタスクのコメント欄で早めにアラートを出す

■ 優先度の設定基準
・高 (High): クリティカルなバグ、直近のマイルストーンに直結するタスク
・中 (Medium): 通常の機能開発、数日内に完了すべきタスク
・低 (Low): 急ぎではない改善、リファクタリング、アイデアメモ

■ 定例ミーティング
・毎週月曜 10:00〜10:30`
  },
  links: {
    title: '重要リンク & ツール',
    icon: '🔗',
    content: `[テンプレート]
■ 会議・ツールURL
・Google Meet (定例用): https://meet.google.com/...
・デザイン (Figma): https://figma.com/...

■ 関連ドキュメント
・仕様書フォルダ: https://drive.google.com/...`
  },
};
