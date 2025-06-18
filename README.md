# PiyoXAssistant

## 📂 **アーキテクチャ構成**

### **🎨 フロントエンド（分離設計）**
```
public/
├── index.html                    # ✅ 統合UI・動的変数ドロップダウン・毎日パターン含む完全版
├── css/
│   ├── base.css                  # ✅ 基本スタイル
│   ├── header.css                # ✅ ヘッダー・モード切り替え
│   ├── posts.css                 # ✅ 投稿表示・編集・削除・クイック追加・動的変数ドロップダウン対応
│   ├── management.css            # ✅ 管理画面
│   └── tabs.css                  # ✅ タブナビゲーション
└── js/
    ├── core.js                   # ✅ グローバル変数・初期化・統計同期・毎日パターンアイコン
    ├── mode.js                   # ✅ モード管理
    ├── posts.js                  # ✅ 投稿管理・削除・クイック追加・動的変数ドロップダウン機能
    ├── posts-edit.js             # ✅ 編集機能専用・動的変数ドロップダウン・毎日パターン統合済み
    ├── management.js             # ✅ データ管理機能
    ├── api.js                    # ✅ API設定
    └── tabs.js                   # ✅ タブ管理
```

### **🔧 バックエンド（依存性注入パターン）**
```
src/
├── core/
│   ├── XAutoPoster.js            # ✅ メインクラス・依存性注入
│   └── ConfigManager.js          # ✅ 設定・暗号化管理（AES-256-CBC）
├── routes/ (分離済み)
│   ├── index.js                  # ✅ ルート統合管理
│   ├── assistantRoutes.js        # ✅ 投稿補助・編集・削除・クイック追加API
│   ├── controlRoutes.js          # ✅ 制御・データ管理
│   ├── configRoutes.js           # ✅ API設定
│   └── uploadRoutes.js           # ✅ ファイル処理
├── assistant/
│   ├── AssistantMode.js          # ✅ 投稿補助機能
│   ├── PostEditor.js             # ✅ 投稿編集
│   └── UpcomingPosts.js          # ✅ 直近投稿管理・キャッシュ
├── processors/
│   ├── DynamicProcessor.js       # ✅ 動的変数処理
│   ├── WeatherAPI.js             # ✅ 天気API
│   └── FinanceAPI.js             # ✅ 金融API・Yahoo Finance対応・TOPIX修正済み
├── scheduler/
│   ├── TimeCalculator.js         # ✅ 時刻計算・平日スケジュール修正・毎日パターン対応
│   ├── PostExecutor.js           # ✅ 投稿実行
│   └── PostScheduler.js          # ✅ スケジュール管理
├── utils/
│   ├── Utils.js                  # ✅ 共通ユーティリティ・毎日パターン検証対応
│   ├── Logger.js                 # ✅ 統一ログサービス（時刻表示対応）
│   ├── Validator.js              # ✅ 統一バリデーター・毎日パターン対応
│   ├── DataService.js            # ✅ 統一データサービス
│   └── ExcelParser.js            # ✅ Excel読み込み
└── middleware/
    └── errorHandler.js           # ✅ 統一エラーハンドリング
```
