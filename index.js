/**
 * X投稿補助ツール エントリーポイント（分割版）
 * メインクラスを起動するシンプルなエントリーファイル
 */

const XAutoPoster = require('./src/core/XAutoPoster');
require('dotenv').config();

// アプリケーション起動
console.log('🚀 X投稿補助ツールを開始します...');
console.log('🤖 投稿補助機能が追加されています');
console.log('📁 モジュラー設計により保守性が向上しています');
console.log('');

try {
    const poster = new XAutoPoster();
    poster.start();
} catch (error) {
    console.error('❌ アプリケーション起動エラー:', error.message);
    console.error('🔧 設定ファイルやモジュールの依存関係を確認してください');
    process.exit(1);
}