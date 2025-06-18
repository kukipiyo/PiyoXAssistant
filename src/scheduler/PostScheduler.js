/**
 * 投稿スケジュール管理モジュール（リファクタリング版）
 * cron による定期実行・投稿チェック・スケジュール管理を担当
 * 重複ログ・データ保存を削除し、統一サービスを使用
 */

const cron = require('node-cron');
const Utils = require('../utils/Utils');
const Logger = require('../utils/Logger');
const DataService = require('../utils/DataService');

class PostScheduler {
    constructor(configManager, timeCalculator, postExecutor) {
        this.configManager = configManager;
        this.timeCalculator = timeCalculator;
        this.postExecutor = postExecutor;
        this.dataService = new DataService(configManager);
        
        // スケジューラの状態
        this.isRunning = false;
        this.assistantMode = true; // デフォルトで補助モードON
        this.scheduledJobs = [];
        this.randomTimeouts = [];
        
        // 投稿データ
        this.posts = [];
        
        // 統計
        this.stats = {
            totalChecks: 0,
            postsExecuted: 0,
            errors: 0,
            lastCheck: null
        };
        
        Logger.moduleInit('投稿スケジュール管理');
    }

    // ==========================================================================
    // メイン制御
    // ==========================================================================

    /**
     * 自動投稿スケジューリング開始
     */
    startScheduling() {
        if (this.assistantMode) {
            Logger.warn('スケジューラ開始', '投稿補助モードがONのため、自動投稿を開始できません');
            return false;
        }
        
        if (!this.postExecutor.isTwitterAPIReady()) {
            Logger.warn('スケジューラ開始', 'Twitter APIが設定されていません');
            return false;
        }
        
        this.isRunning = true;
        Logger.serviceStart('自動投稿スケジューラ');
        
        this.clearAllSchedules();
        
        // メインスケジューラー（毎分チェック）
        const mainSchedule = cron.schedule('* * * * *', async () => {
            if (this.isRunning) {
                try {
                    await this.checkAndExecutePosts();
                } catch (error) {
                    Logger.apiError('投稿チェック処理', error);
                    this.stats.errors++;
                }
            }
        }, {
            scheduled: true,
            timezone: "Asia/Tokyo"
        });
        
        this.scheduledJobs.push({
            job: mainSchedule,
            type: 'main',
            description: 'メインスケジューラー'
        });
        
        Logger.serviceStart('メインスケジューラー', '毎分チェック開始');
        
        // 投稿データの初期設定
        this.initializePosts();
        
        return true;
    }

    /**
     * 自動投稿停止
     */
    stopScheduling() {
        if (!this.isRunning) {
            Logger.warn('スケジューラ停止', '自動投稿は実行されていません');
            return false;
        }
        
        this.isRunning = false;
        this.clearAllSchedules();
        
        // 予約中の投稿を未投稿に戻す
        this.posts.forEach(post => {
            if (post.status === '予約中') {
                post.status = '未投稿';
                post.nextPostTime = null;
            }
        });
        
        Logger.serviceStop('自動投稿スケジューラ', '全ての予約投稿を停止');
        return true;
    }

    /**
     * 投稿補助モードの切り替え
     */
    toggleAssistantMode() {
        this.assistantMode = !this.assistantMode;
        
        if (this.assistantMode && this.isRunning) {
            Logger.serviceStart('モード切り替え', '投稿補助モードON - 自動投稿を停止');
            this.stopScheduling();
        }
        
        Logger.serviceStart('モード切り替え', 
            this.assistantMode ? 'ON (手動投稿補助)' : 'OFF (自動投稿)');
        
        return this.assistantMode;
    }

    // ==========================================================================
    // 投稿チェック・実行
    // ==========================================================================

    /**
     * 投稿チェック・実行メイン処理
     */
    async checkAndExecutePosts() {
        if (this.assistantMode) {
            Logger.warn('投稿チェック', '投稿補助モード: 自動投稿は無効です');
            return;
        }
        
        const now = new Date();
        const currentTime = now.getTime();
        
        this.stats.totalChecks++;
        this.stats.lastCheck = Utils.formatJST(now);
        
        const jstTime = Utils.formatJST(now, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        Logger.schedulerCheck('投稿チェック実行', jstTime);
        
        // 過去投稿のクリーンアップ
        this.cleanupPastPosts();
        
        const scheduledPosts = this.posts.filter(p => p.status === '予約中');
        Logger.schedulerCheck('予約中投稿数', `${scheduledPosts.length}件`);
        
        // API制限チェック
        const apiLimitCheck = this.postExecutor.checkAPILimits(this.posts, currentTime);
        if (!apiLimitCheck.canPost) {
            Logger.apiLimit(apiLimitCheck.reason);
            return;
        }
        
        let executedThisMinute = false;
        
        // 実行準備完了の投稿を検索
        const readyPosts = scheduledPosts.filter(post => {
            return this.timeCalculator.isPostTimeReady(post, currentTime);
        });
        
        Logger.schedulerCheck('実行準備完了', `${readyPosts.length}件`);
        
        // 投稿実行（1分間に1件まで）
        for (const post of readyPosts) {
            if (executedThisMinute) break;
            
            const scheduledTime = new Date(post.nextPostTime).getTime();
            const timeDiff = Math.abs(currentTime - scheduledTime);
            
            const scheduledJST = Utils.formatJST(new Date(post.nextPostTime), {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            
            Logger.postAction('⏱️ 投稿実行判定', post.id, post.content, 
                `予定時刻 ${scheduledJST} (JST), 差分 ${Math.round(timeDiff/1000)}秒`);
            
            if (timeDiff <= 60000) { // 1分以内
                Logger.postAction('⏰ 投稿実行開始', post.id, post.content);
                
                executedThisMinute = true;
                this.stats.postsExecuted++;
                
                const success = await this.postExecutor.executePost(post);
                
                if (success && post.scheduleType === 'recurring' && post.status === '投稿済み') {
                    this.postExecutor.scheduleNextRecurringPost(post);
                }
                
                // 統一データサービスで保存
                this.dataService.savePostsData(this.posts);
                
                break;
            }
        }
        
        // 次回投稿予定の表示
        if (!executedThisMinute && scheduledPosts.length > 0) {
            const nextPostInfo = this.timeCalculator.getTimeUntilNextPost(scheduledPosts);
            if (nextPostInfo) {
                Logger.schedulerCheck('次回投稿予定', 
                    `${nextPostInfo.scheduledTime} (JST) - ${nextPostInfo.timeUntil}`);
            }
        }
    }

    /**
     * 過去投稿のクリーンアップ
     */
    cleanupPastPosts() {
        const now = new Date();
        const currentTime = now.getTime();
        let cleanedCount = 0;
        
        this.posts.forEach(post => {
            if (post.status === '予約中' && post.nextPostTime) {
                const rescheduled = this.timeCalculator.rescheduleDelayedPost(post, currentTime);
                if (rescheduled) {
                    cleanedCount++;
                }
            }
        });
        
        if (cleanedCount > 0) {
            Logger.cleanup('過去投稿整理', cleanedCount);
            this.dataService.savePostsData(this.posts);
        }
    }

    // ==========================================================================
    // 投稿データ管理
    // ==========================================================================

    /**
     * 投稿データを設定
     */
    setPosts(posts) {
        this.posts = posts || [];
        Logger.dataSet('投稿スケジューラ', this.posts.length);
    }

    /**
     * 投稿データを取得
     */
    getPosts() {
        return this.posts;
    }

    /**
     * 投稿を追加
     */
    addPost(post) {
        if (!post.id) {
            post.id = this.posts.length + 1;
        }
        this.posts.push(post);
        Logger.postAction('📝 投稿追加', post.id, post.content);
    }

    /**
     * 投稿を削除
     */
    removePost(postId) {
        const index = this.posts.findIndex(p => p.id === postId);
        if (index !== -1) {
            const removedPost = this.posts.splice(index, 1)[0];
            Logger.postAction('🗑️ 投稿削除', postId, removedPost.content);
            return true;
        }
        return false;
    }

    /**
     * 投稿データクリア
     */
    clearPosts() {
        this.posts = [];
        Logger.dataClear('投稿スケジューラ', '投稿データ');
    }

    /**
     * 投稿の初期設定
     */
    initializePosts() {
        this.posts.forEach(post => {
            // 未投稿のみを予約中に変換（既存処理）
            if (post.status === '未投稿') {
                post.status = '予約中';
                this.timeCalculator.calculateNextPostTime(post);
                
                if (post.nextPostTime) {
                    const jstTime = Utils.formatJST(new Date(post.nextPostTime), {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    });
                    
                    const timeDiff = this.timeCalculator.getTimeUntilNextPost([post]);
                    const timeStatus = timeDiff ? timeDiff.timeUntil : '計算中';
                    
                    Logger.postSchedule('📝 投稿予約', post.id, post.content, jstTime, timeStatus);
                }
            }
            // 予約中だが時刻未設定の場合（復旧処理）
            else if (post.status === '予約中' && !post.nextPostTime) {
                Logger.processStart('時刻未設定の予約中投稿を修復', `ID: ${post.id}`);
                this.timeCalculator.calculateNextPostTime(post);
                
                if (post.nextPostTime) {
                    const jstTime = Utils.formatJST(new Date(post.nextPostTime), {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    });
                    
                    Logger.postSchedule('🔧 投稿時刻修復', post.id, post.content, jstTime);
                }
            }
            // 予約中で時刻設定済みの場合（ログ出力のみ）
            else if (post.status === '予約中' && post.nextPostTime) {
                const jstTime = Utils.formatJST(new Date(post.nextPostTime), {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
                
                const timeDiff = this.timeCalculator.getTimeUntilNextPost([post]);
                const timeStatus = timeDiff ? timeDiff.timeUntil : '計算中';
                
                Logger.processComplete('既存予約確認', `ID ${post.id}: ${jstTime} (${timeStatus})`);
            }
        });
    }

    // ==========================================================================
    // スケジュール管理
    // ==========================================================================

    /**
     * 全スケジュールクリア
     */
    clearAllSchedules() {
        this.scheduledJobs.forEach(jobInfo => {
            if (jobInfo.job && typeof jobInfo.job.destroy === 'function') {
                jobInfo.job.destroy();
                Logger.processComplete('スケジュール削除', jobInfo.description);
            }
        });
        this.scheduledJobs = [];
        
        this.randomTimeouts.forEach(timeout => {
            clearTimeout(timeout);
        });
        this.randomTimeouts = [];
    }

    /**
     * スケジュール情報を取得
     */
    getScheduleInfo() {
        return {
            isRunning: this.isRunning,
            assistantMode: this.assistantMode,
            activeJobs: this.scheduledJobs.length,
            activeTimeouts: this.randomTimeouts.length,
            posts: {
                total: this.posts.length,
                ...Utils.calculatePostStats(this.posts)
            }
        };
    }

    // ==========================================================================
    // 統計・状態管理
    // ==========================================================================

    /**
     * スケジューラ統計を取得
     */
    getSchedulerStats() {
        const uptime = this.isRunning ? '実行中' : '停止中';
        
        return {
            ...this.stats,
            uptime: uptime,
            postsStats: Utils.calculatePostStats(this.posts),
            nextPost: this.timeCalculator.getTimeUntilNextPost(this.posts),
            timestamp: Utils.formatJST()
        };
    }

    /**
     * 統計をリセット
     */
    resetStats() {
        this.stats = {
            totalChecks: 0,
            postsExecuted: 0,
            errors: 0,
            lastCheck: null
        };
        Logger.processComplete('スケジューラ統計リセット');
    }

    /**
     * 統計ログ出力
     */
    logSchedulerSummary() {
        const stats = this.getSchedulerStats();
        Logger.stats('スケジューラ統計', {
            '状態': stats.uptime,
            '総チェック数': `${stats.totalChecks}回`,
            '実行投稿数': `${stats.postsExecuted}件`,
            'エラー数': `${stats.errors}件`,
            '最終チェック': stats.lastCheck || '未実行',
            '次回投稿': stats.nextPost ? `${stats.nextPost.scheduledTime} (${stats.nextPost.timeUntil})` : 'なし'
        });
    }

    // ==========================================================================
    // 状態チェック・デバッグ
    // ==========================================================================

    /**
     * システム状態をチェック
     */
    checkSystemStatus() {
        const status = {
            scheduler: {
                running: this.isRunning,
                assistantMode: this.assistantMode,
                jobs: this.scheduledJobs.length
            },
            api: {
                twitter: this.postExecutor.isTwitterAPIReady()
            },
            posts: Utils.calculatePostStats(this.posts),
            limits: this.checkCurrentLimits()
        };
        
        return status;
    }

    /**
     * 現在のAPI制限状況をチェック
     */
    checkCurrentLimits() {
        const recentPosts = Utils.getRecentPosts(this.posts, 30);
        const todayPosts = Utils.getTodayPostsCount(this.posts);
        const weekPosts = Utils.getWeekPostsCount(this.posts);
        
        return {
            recent30min: {
                count: recentPosts.length,
                limit: 1,
                canPost: recentPosts.length === 0
            },
            today: {
                count: todayPosts,
                limit: 30,
                canPost: todayPosts < 30
            },
            week: {
                count: weekPosts,
                limit: 200,
                canPost: weekPosts < 200
            }
        };
    }

    /**
     * デバッグ情報を出力
     */
    debugInfo() {
        const status = this.checkSystemStatus();
        
        Logger.stats('システム状態デバッグ情報', {
            'スケジューラ': JSON.stringify(status.scheduler),
            'API状態': JSON.stringify(status.api),
            '投稿統計': JSON.stringify(status.posts),
            '制限状況': JSON.stringify(status.limits)
        });
        
        // 直近予定投稿の詳細
        const scheduledPosts = this.posts
            .filter(p => p.status === '予約中')
            .sort((a, b) => new Date(a.nextPostTime) - new Date(b.nextPostTime))
            .slice(0, 3);
        
        if (scheduledPosts.length > 0) {
            Logger.processStart('直近予定投稿');
            scheduledPosts.forEach((post, index) => {
                const scheduledTime = Utils.formatJST(new Date(post.nextPostTime));
                const timeUntil = Utils.getTimeDifferenceText(post.nextPostTime);
                Logger.postSchedule(`${index + 1}`, post.id, post.content, scheduledTime, timeUntil);
            });
        } else {
            Logger.processComplete('直近予定投稿', '予約中の投稿はありません');
        }
    }

    // ==========================================================================
    // イベント・フック
    // ==========================================================================

    /**
     * 投稿実行前フック
     */
    onBeforePost(callback) {
        this.beforePostCallback = callback;
    }

    /**
     * 投稿実行後フック
     */
    onAfterPost(callback) {
        this.afterPostCallback = callback;
    }

    /**
     * エラー発生時フック
     */
    onError(callback) {
        this.errorCallback = callback;
    }

    /**
     * フック実行
     */
    async executeHook(hookName, data) {
        try {
            switch (hookName) {
                case 'beforePost':
                    if (this.beforePostCallback) {
                        await this.beforePostCallback(data);
                    }
                    break;
                case 'afterPost':
                    if (this.afterPostCallback) {
                        await this.afterPostCallback(data);
                    }
                    break;
                case 'error':
                    if (this.errorCallback) {
                        await this.errorCallback(data);
                    }
                    break;
            }
        } catch (hookError) {
            Logger.apiError(`フック実行 (${hookName})`, hookError);
        }
    }
}

module.exports = PostScheduler;