/**
 * 投稿実行処理モジュール（リファクタリング版）
 * Twitter API連携・投稿実行・エラーハンドリング専門
 * 重複ログを削除し、統一サービスを使用
 */

const { TwitterApi } = require('twitter-api-v2');
const Utils = require('../utils/Utils');
const Logger = require('../utils/Logger');
const DynamicProcessor = require('../processors/DynamicProcessor');

class PostExecutor {
    constructor(configManager, timeCalculator) {
        this.configManager = configManager;
        this.timeCalculator = timeCalculator;
        this.dynamicProcessor = new DynamicProcessor(configManager);
        this.twitter = null;
        
        // 実行統計
        this.stats = {
            totalExecuted: 0,
            successful: 0,
            failed: 0,
            retried: 0
        };
        
        this.initializeTwitterAPI();
        Logger.moduleInit('投稿実行処理');
    }

    // ==========================================================================
    // 初期化・設定
    // ==========================================================================

    /**
     * Twitter APIを初期化
     */
    initializeTwitterAPI() {
        const config = this.configManager.loadConfig();
        
        if (config.twitterKeys) {
            const keys = config.twitterKeys;
            this.twitter = new TwitterApi({
                appKey: keys.appKey,
                appSecret: keys.appSecret,
                accessToken: keys.accessToken,
                accessSecret: keys.accessSecret,
            });
            Logger.apiSuccess('Twitter API初期化', '投稿可能');
        } else {
            Logger.warn('Twitter API初期化', 'APIキーが設定されていません');
        }
    }

    /**
     * Twitter APIの有効性をチェック
     */
    isTwitterAPIReady() {
        return !!this.twitter;
    }

    /**
     * Twitter APIを再初期化
     */
    reinitializeTwitterAPI() {
        this.initializeTwitterAPI();
    }

    // ==========================================================================
    // メイン投稿実行
    // ==========================================================================

    /**
     * 個別投稿実行
     */
    async executePost(post) {
        if (!this.twitter) {
            Logger.apiError('投稿実行', new Error('Twitter API未設定'));
            post.status = '設定エラー';
            return false;
        }
        
        try {
            this.stats.totalExecuted++;
            
            // 動的変数処理（分離済みモジュールを使用）
            const processedContent = await this.dynamicProcessor.processDynamicContent(post.content);
            
            Logger.postAction('📝 投稿実行中', post.id, processedContent);
            
            let retryCount = 0;
            const maxRetries = 2;
            
            while (retryCount < maxRetries) {
                try {
                    const result = await this.twitter.v2.tweet(processedContent);
                    
                    // 投稿成功
                    const success = this.handleSuccessfulPost(post, result);
                    if (success) {
                        return true;
                    }
                    
                } catch (apiError) {
                    const retryResult = this.handleAPIError(apiError, post, retryCount, maxRetries);
                    
                    if (retryResult.shouldRetry) {
                        retryCount++;
                        this.stats.retried++;
                        continue;
                    } else {
                        return retryResult.success;
                    }
                }
            }
            
        } catch (error) {
            return this.handleGeneralError(error, post);
        }
    }

    /**
     * 投稿成功時の処理
     */
    handleSuccessfulPost(post, result) {
        post.status = '投稿済み';
        const now = new Date();
        post.lastPostedTime = now.toISOString();
        post.nextPostTime = null;
        
        this.stats.successful++;
        
        const postedJST = Utils.formatJST(now, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        Logger.apiSuccess('投稿実行', `ID ${result.data.id} (${postedJST} JST)`);
        Logger.processComplete('Free プラン使用状況更新', '今日の投稿回数+1');
        
        return true;
    }

    /**
     * API エラー処理
     */
    handleAPIError(apiError, post, retryCount, maxRetries) {
        const errorCode = apiError.code || apiError.status;
        Logger.apiError('Twitter API', apiError, `エラーコード: ${errorCode}`);
        
        if (errorCode === 429) {
            // API制限エラー
            return this.handleRateLimitError(post, retryCount, maxRetries);
        } else if (errorCode === 403) {
            // 権限エラー
            return this.handlePermissionError(post);
        } else if (errorCode === 401) {
            // 認証エラー
            return this.handleAuthError(post);
        } else {
            // その他のエラー
            throw apiError;
        }
    }

    /**
     * API制限エラー処理
     */
    handleRateLimitError(post, retryCount, maxRetries) {
        if (retryCount < maxRetries) {
            const waitMinutes = 5 * (retryCount + 1);
            Logger.apiLimit(`API制限 (${retryCount + 1}/${maxRetries})`, `${waitMinutes}分後に短時間リトライ`);
            
            const retryTime = new Date();
            retryTime.setMinutes(retryTime.getMinutes() + waitMinutes);
            post.nextPostTime = retryTime.toISOString();
            post.status = '予約中';
            
            const retryJST = Utils.formatJSTTime(retryTime);
            Logger.postSchedule('🔄 短時間リトライ予約', post.id, post.content, retryJST);
            
            return { shouldRetry: true, success: false };
        } else {
            // 最大リトライ回数に達した場合
            Logger.apiLimit('API制限により投稿延期', '次回スケジュールで再試行');
            post.status = '予約中';
            
            const retryTime = new Date();
            retryTime.setMinutes(retryTime.getMinutes() + 30);
            post.nextPostTime = retryTime.toISOString();
            
            const retryJST = Utils.formatJSTTime(retryTime);
            Logger.postSchedule('🔄 API制限延期', post.id, post.content, `30分後: ${retryJST}`);
            
            return { shouldRetry: false, success: false };
        }
    }

    /**
     * 権限エラー処理
     */
    handlePermissionError(post) {
        Logger.apiError('投稿権限エラー', new Error('内容制限またはアカウント制限'), 
            'Free プランの月間制限に達した可能性');
        post.status = '投稿失敗';
        this.stats.failed++;
        
        return { shouldRetry: false, success: false };
    }

    /**
     * 認証エラー処理
     */
    handleAuthError(post) {
        Logger.apiError('認証エラー', new Error('APIキーを確認してください'));
        post.status = '設定エラー';
        this.stats.failed++;
        
        return { shouldRetry: false, success: false };
    }

    /**
     * 一般エラー処理
     */
    handleGeneralError(error, post) {
        Logger.apiError('投稿処理', error);
        post.status = '投稿失敗';
        this.stats.failed++;
        
        // 繰り返し投稿の場合は再スケジュール
        if (post.scheduleType === 'recurring') {
            const retryTime = new Date();
            retryTime.setHours(retryTime.getHours() + 2);
            post.nextPostTime = retryTime.toISOString();
            post.status = '予約中';
            
            const retryJST = Utils.formatJSTTime(retryTime);
            Logger.postSchedule('🔄 エラー再試行', post.id, post.content, `2時間後: ${retryJST}`);
        } else {
            post.nextPostTime = null;
        }
        
        return false;
    }

    // ==========================================================================
    // 繰り返し投稿の次回スケジュール
    // ==========================================================================

    /**
     * 繰り返し投稿の次回スケジュール
     */
    scheduleNextRecurringPost(post) {
        Logger.processStart('繰り返し投稿の次回スケジュール設定', post.datePattern);
        
        setTimeout(() => {
            Logger.processStart('投稿成功後の次回投稿時刻を計算');
            
            post.status = '予約中';
            
            this.timeCalculator.calculateNextPostTime(post, true);
            
            const calculatedTime = new Date(post.nextPostTime);
            const minNextTime = new Date();
            minNextTime.setHours(minNextTime.getHours() + 24);
            
            if (calculatedTime.getTime() < minNextTime.getTime()) {
                Logger.warn('24時間ルール適用', '強制的に24時間後に調整');
                post.nextPostTime = minNextTime.toISOString();
            }
            
            const nextJST = Utils.formatJST(new Date(post.nextPostTime), {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            const daysDiff = Math.ceil((new Date(post.nextPostTime).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            Logger.postSchedule('🔄 次回投稿予約完了', post.id, post.content, nextJST, `約${daysDiff}日後`);
            
        }, 10000); // 10秒後に次回スケジュール
    }

    // ==========================================================================
    // API制限チェック
    // ==========================================================================

    /**
     * API制限をチェック
     */
    checkAPILimits(posts, currentTime) {
        // 30分以内の投稿チェック
        const recentPosts = Utils.getRecentPosts(posts, 30);
        if (recentPosts.length >= 1) {
            const lastPost = recentPosts[0];
            const lastPostJST = Utils.formatJST(new Date(lastPost.lastPostedTime), {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
            return {
                canPost: false,
                reason: `Free プラン制限: 30分以内に投稿済み（最終: ${lastPostJST} JST）`
            };
        }
        
        // 今日の投稿数チェック
        const todayPostsCount = Utils.getTodayPostsCount(posts);
        if (todayPostsCount >= 30) {
            return {
                canPost: false,
                reason: `Free プラン制限: 本日${todayPostsCount}回投稿済み（上限30回）`
            };
        }
        
        // 1週間の投稿数チェック
        const weekPostsCount = Utils.getWeekPostsCount(posts);
        if (weekPostsCount >= 200) {
            return {
                canPost: false,
                reason: `Free プラン制限: 1週間で${weekPostsCount}回投稿済み（上限200回）`
            };
        }
        
        return {
            canPost: true,
            reason: 'API制限OK'
        };
    }

    // ==========================================================================
    // 実行統計・状態管理
    // ==========================================================================

    /**
     * 実行統計を取得
     */
    getExecutionStats() {
        const successRate = this.stats.totalExecuted > 0 ? 
            Math.round((this.stats.successful / this.stats.totalExecuted) * 100) : 0;
        
        return {
            ...this.stats,
            successRate: successRate,
            timestamp: Utils.formatJST()
        };
    }

    /**
     * 統計をリセット
     */
    resetStats() {
        this.stats = {
            totalExecuted: 0,
            successful: 0,
            failed: 0,
            retried: 0
        };
        Logger.processComplete('実行統計をリセット');
    }

    /**
     * 実行状態をログ出力
     */
    logExecutionSummary() {
        const stats = this.getExecutionStats();
        Logger.stats('投稿実行統計', {
            '総実行数': `${stats.totalExecuted}件`,
            '成功': `${stats.successful}件 (${stats.successRate}%)`,
            '失敗': `${stats.failed}件`,
            'リトライ': `${stats.retried}件`
        });
    }

    // ==========================================================================
    // テスト・デバッグ機能
    // ==========================================================================

    /**
     * 投稿のドライラン（実際には投稿しない）
     */
    async dryRunPost(post) {
        Logger.processStart('ドライラン実行');
        
        try {
            // 動的変数処理のみ実行（分離済みモジュールを使用）
            const processedContent = await this.dynamicProcessor.processDynamicContent(post.content);
            
            Logger.processComplete('ドライラン', `処理済み内容: "${Utils.safeTruncate(processedContent, 100)}..."`);
            Logger.processComplete('文字数チェック', `${processedContent.length}文字`);
            
            return {
                success: true,
                processedContent: processedContent,
                characterCount: processedContent.length,
                withinLimit: processedContent.length <= 280
            };
            
        } catch (error) {
            Logger.apiError('ドライラン', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Twitter API接続テスト
     */
    async testTwitterConnection() {
        if (!this.twitter) {
            return {
                success: false,
                error: 'Twitter APIが設定されていません'
            };
        }
        
        try {
            Logger.processStart('Twitter API接続テスト');
            
            // 自分のユーザー情報を取得してテスト
            const user = await this.twitter.v2.me();
            
            Logger.apiSuccess('Twitter API接続テスト', `@${user.data.username}`);
            
            return {
                success: true,
                username: user.data.username,
                userId: user.data.id,
                message: 'Twitter API接続成功'
            };
            
        } catch (error) {
            Logger.apiError('Twitter API接続テスト', error);
            
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = PostExecutor;