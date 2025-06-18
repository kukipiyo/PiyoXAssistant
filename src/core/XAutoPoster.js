/**
 * X投稿補助ツール メインクラス（リファクタリング版）
 * 各モジュールを統合し、アプリケーション全体を管理
 * 重複ログを削除し、統一サービスを使用
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

// コアモジュール
const ConfigManager = require('./ConfigManager');
const Utils = require('../utils/Utils');
const Logger = require('../utils/Logger');
const ExcelParser = require('../utils/ExcelParser');

// 処理系モジュール
const WeatherAPI = require('../processors/WeatherAPI');
const FinanceAPI = require('../processors/FinanceAPI');

// スケジューラ系モジュール
const TimeCalculator = require('../scheduler/TimeCalculator');
const PostExecutor = require('../scheduler/PostExecutor');
const PostScheduler = require('../scheduler/PostScheduler');

// 投稿補助系モジュール
const AssistantMode = require('../assistant/AssistantMode');
const UpcomingPosts = require('../assistant/UpcomingPosts');

// ルート統合管理
const setupRoutes = require('../routes');

class XAutoPoster {
    constructor() {
        this.app = express();
        
        // コアコンポーネント初期化
        this.initializeComponents();
        
        // アプリケーション設定
        this.setupApplication();
        
        Logger.moduleInit('X投稿補助ツール メインクラス');
    }

    // ==========================================================================
    // コンポーネント初期化
    // ==========================================================================

    /**
     * 全コンポーネントを初期化
     */
    initializeComponents() {
        Logger.processStart('コンポーネント初期化');
        
        // コアコンポーネント
        this.configManager = new ConfigManager();
        this.excelParser = new ExcelParser();
        
        // 処理系コンポーネント
        this.weatherAPI = new WeatherAPI(this.configManager);
        this.financeAPI = new FinanceAPI(this.configManager);
        
        // スケジューラ系コンポーネント
        this.timeCalculator = new TimeCalculator();
        this.postExecutor = new PostExecutor(this.configManager, this.timeCalculator);
        this.postScheduler = new PostScheduler(this.configManager, this.timeCalculator, this.postExecutor);
        
        // 投稿補助系コンポーネント
        this.assistantMode = new AssistantMode(this.configManager, this.timeCalculator);
        this.upcomingPosts = new UpcomingPosts(this.configManager);
        
        Logger.processComplete('コンポーネント初期化');
    }

    /**
     * アプリケーション設定
     */
    setupApplication() {
        Logger.processStart('アプリケーション設定');
        
        // Express基本設定
        this.setupExpress();
        
        // 設定読み込み
        this.loadConfiguration();
        
        // ルート設定（分離済み）
        this.setupRoutes();
        
        // イベントハンドラ設定
        this.setupEventHandlers();
        
        Logger.processComplete('アプリケーション設定');
    }

    // ==========================================================================
    // Express設定
    // ==========================================================================

    /**
     * Express基本設定
     */
    setupExpress() {
        this.app.use(express.json());
        this.app.use(express.static(path.join(__dirname, '../../public')));
        this.app.use(express.urlencoded({ extended: true }));
        
        Logger.processComplete('Express基本設定');
    }

    /**
     * ルート設定（分離済み）
     */
    setupRoutes() {
        Logger.processStart('ルート設定');
        
        // 依存性オブジェクトを作成
        const dependencies = this.createDependencies();
        
        // 分離されたルート設定を適用
        setupRoutes(this.app, dependencies);
        
        Logger.processComplete('ルート設定');
    }

    /**
     * 依存性オブジェクト作成
     */
    createDependencies() {
        return {
            // コア
            configManager: this.configManager,
            excelParser: this.excelParser,
            
            // 処理系
            weatherAPI: this.weatherAPI,
            financeAPI: this.financeAPI,
            
            // スケジューラ系
            timeCalculator: this.timeCalculator,
            postExecutor: this.postExecutor,
            postScheduler: this.postScheduler,
            
            // 投稿補助系
            assistantMode: this.assistantMode,
            upcomingPosts: this.upcomingPosts,
            
            // データアクセス関数
            getPosts: () => this.getPosts(),
            setPosts: (posts) => this.setPosts(posts)
        };
    }

    // ==========================================================================
    // 設定・初期化
    // ==========================================================================

    /**
     * 設定読み込み
     */
    loadConfiguration() {
        Logger.processStart('設定読み込み');
        
        const config = this.configManager.loadConfig();
        
        // 投稿データの復元
        if (config.postsData) {
            this.setPosts(config.postsData);
            this.assistantMode.cleanupRestoredPosts();
            Logger.dataSet('投稿データ復元', config.postsData.length);
        }
        
        Logger.processComplete('設定読み込み');
    }

    /**
     * イベントハンドラ設定
     */
    setupEventHandlers() {
        // プロセス終了時の処理
        process.on('SIGINT', () => {
            Logger.processStart('アプリケーション終了処理');
            this.shutdown();
        });

        process.on('SIGTERM', () => {
            Logger.processStart('アプリケーション終了処理');
            this.shutdown();
        });

        process.on('uncaughtException', (error) => {
            Logger.apiError('未処理の例外', error);
            Logger.warn('システム状態', 'アプリケーションを再起動することをお勧めします');
        });

        process.on('unhandledRejection', (reason, promise) => {
            Logger.apiError('未処理のPromise拒否', new Error(reason));
            Logger.warn('システム状態', 'アプリケーションを再起動することをお勧めします');
        });
    }

    // ==========================================================================
    // 投稿データ管理
    // ==========================================================================

    /**
     * 投稿データを設定
     */
    setPosts(posts) {
        this.postScheduler.setPosts(posts);
        this.assistantMode.setPosts(posts);
        this.upcomingPosts.setPosts(posts);
        Logger.dataSet('X投稿補助ツール', (posts || []).length);
    }

    /**
     * 投稿データを取得
     */
    getPosts() {
        return this.postScheduler.getPosts();
    }

    /**
     * 投稿データをクリア
     */
    clearPostsData() {
        this.assistantMode.clearPostsData();
        this.setPosts([]);
        Logger.dataClear('X投稿補助ツール', '投稿データ');
    }

    /**
     * 投稿データを手動保存
     */
    savePostsData() {
        this.assistantMode.savePostsData();
        Logger.dataSave('投稿データ手動保存');
    }

    // ==========================================================================
    // アプリケーション制御
    // ==========================================================================

    /**
     * アプリケーション開始
     */
    start(port = 3000) {
        // 必要なディレクトリを作成
        this.createDirectories();
        
        // サーバー開始
        this.app.listen(port, () => {
            this.logStartupMessage(port);
        });
    }

    /**
     * 必要なディレクトリを作成
     */
    createDirectories() {
        const directories = ['uploads'];
        
        directories.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                Logger.fileOperation('ディレクトリ作成', dir);
            }
        });
        
        // publicディレクトリが存在することを確認
        if (fs.existsSync('public')) {
            Logger.processComplete('publicディレクトリ確認済み');
        } else {
            Logger.warn('ディレクトリ確認', 'publicディレクトリが見つかりません');
        }
    }

    /**
     * 起動メッセージを表示
     */
    logStartupMessage(port) {
        Logger.serviceStart('X投稿補助ツール', `http://localhost:${port}`);
        
        console.log('\n🎉 X投稿補助ツール起動完了！');
        console.log('=====================================');
        console.log(`📡 サーバー: http://localhost:${port}`);
        console.log('💡 ブラウザで上記URLにアクセスしてください');
        console.log('⏹️ 停止するには Ctrl+C を押してください');
        console.log('');
        console.log('🚀 新機能:');
        console.log('  🛣️ ルート分離による保守性向上');
        console.log('  🤖 投稿補助モード（デフォルト有効）');
        console.log('  📈 Yahoo Finance株価取得機能');
        console.log('  🌤️ 天気API機能（APIキー設定時）');
        console.log('  💱 Twelve Data金融API（APIキー設定時）');
        console.log('=====================================\n');
        
        // システム状態の表示
        this.logSystemStatus();
    }

    /**
     * システム状態をログ出力
     */
    logSystemStatus() {
        const posts = this.getPosts();
        const stats = Utils.calculatePostStats(posts);
        
        Logger.stats('現在の状態', {
            '投稿データ': `${stats.total}件`,
            '予約中': `${stats.scheduled}件`,
            '投稿済み': `${stats.posted}件`,
            '待機中': `${stats.pending}件`
        });
        
        if (stats.scheduled > 0) {
            const nextPost = this.timeCalculator.getTimeUntilNextPost(posts);
            if (nextPost) {
                Logger.processComplete('次回投稿予定', `${nextPost.scheduledTime} (${nextPost.timeUntil})`);
            }
        }
    }

    /**
     * アプリケーション終了処理
     */
    shutdown() {
        try {
            // スケジューラ停止
            if (this.postScheduler.isRunning) {
                this.postScheduler.stopScheduling();
            }
            
            // データ保存
            if (this.getPosts().length > 0) {
                this.savePostsData();
            }
            
            Logger.processComplete('終了処理');
            process.exit(0);
        } catch (error) {
            Logger.apiError('終了処理', error);
            process.exit(1);
        }
    }

    // ==========================================================================
    // デバッグ・統計
    // ==========================================================================

    /**
     * システム全体の状態を取得
     */
    getSystemStatus() {
        return {
            scheduler: this.postScheduler.getScheduleInfo(),
            posts: Utils.calculatePostStats(this.getPosts()),
            config: this.configManager.getConfigStatus(this.getPosts()),
            cache: this.upcomingPosts.getCacheInfo(),
            execution: this.postExecutor.getExecutionStats()
        };
    }

    /**
     * デバッグ情報を出力
     */
    debugInfo() {
        const status = this.getSystemStatus();
        
        Logger.stats('システム全体デバッグ情報', {
            'スケジューラ': JSON.stringify(status.scheduler),
            '投稿統計': JSON.stringify(status.posts),
            '設定状態': JSON.stringify(status.config),
            'キャッシュ': JSON.stringify(status.cache),
            '実行統計': JSON.stringify(status.execution)
        });
    }
}

module.exports = XAutoPoster;