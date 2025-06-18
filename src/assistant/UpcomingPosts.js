/**
 * 直近投稿管理モジュール（リファクタリング版）
 * 直近投稿予定の取得・表示・キャッシュ管理を担当
 * 重複ログ・データ保存を削除し、統一サービスを使用
 */

const Utils = require('../utils/Utils');
const Logger = require('../utils/Logger');
const DataService = require('../utils/DataService');
const DynamicProcessor = require('../processors/DynamicProcessor');

class UpcomingPosts {
    constructor(configManager) {
        this.configManager = configManager;
        this.dataService = new DataService(configManager);
        this.dynamicProcessor = new DynamicProcessor(configManager);
        
        // キャッシュ管理
        this.upcomingPostsCache = null;
        this.lastCacheUpdate = null;
        this.CACHE_DURATION = 300000; // 5分間キャッシュ
        
        // 投稿データ
        this.posts = [];
        
        Logger.moduleInit('直近投稿管理');
    }

    // ==========================================================================
    // 投稿データ管理
    // ==========================================================================

    /**
     * 投稿データを設定
     */
    setPosts(posts) {
        this.posts = posts || [];
        this.clearCache();
        Logger.dataSet('直近投稿管理', this.posts.length);
    }

    /**
     * 投稿データを取得
     */
    getPosts() {
        return this.posts;
    }

    // ==========================================================================
    // キャッシュ管理
    // ==========================================================================

    /**
     * キャッシュをクリア
     */
    clearCache() {
        this.upcomingPostsCache = null;
        this.lastCacheUpdate = null;
        Logger.cache('clear', '直近投稿キャッシュ');
    }

    /**
     * キャッシュが有効かチェック
     */
    isCacheValid() {
        if (!this.upcomingPostsCache || !this.lastCacheUpdate) {
            return false;
        }
        
        const now = Date.now();
        return (now - this.lastCacheUpdate) < this.CACHE_DURATION;
    }

    // ==========================================================================
    // 直近投稿予定取得
    // ==========================================================================

    /**
     * 直近投稿予定取得（天気API対応修正版）
     * 表示時点で天気情報も含めたフル動的変数処理を実行
     */
    async getUpcomingPosts(limit = 20) {
        const now = new Date();
        const currentTime = now.getTime();
        
        // キャッシュチェック
        if (this.isCacheValid()) {
            Logger.cache('hit', '直近投稿');
            return this.upcomingPostsCache.slice(0, limit);
        }
        
        Logger.processStart('直近投稿を新規計算');
        
        try {
            // 予約中の投稿を時刻順でソート
            const scheduledPosts = this.posts
                .filter(post => post.status === '予約中' && post.nextPostTime)
                .sort((a, b) => new Date(a.nextPostTime) - new Date(b.nextPostTime))
                .slice(0, limit);
            
            // フル動的変数処理を実行（天気API含む）
            const processedPosts = [];
            for (const post of scheduledPosts) {
                try {
                    // 基本版からフル版に変更
                    const processedContent = await this.dynamicProcessor.processDynamicContent(post.content);
                    const scheduledTime = new Date(post.nextPostTime);
                    const timeDiff = scheduledTime.getTime() - currentTime;
                    
                    // 時間差の表示用文字列
                    const timeStatus = Utils.getTimeDifferenceText(post.nextPostTime, now);
                    
                    processedPosts.push({
                        id: post.id,
                        originalContent: post.content,
                        processedContent: processedContent,  // ← 天気情報含む完全処理済み内容
                        scheduledTime: Utils.formatJST(scheduledTime, {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                        }),
                        timeStatus: timeStatus,
                        datePattern: post.datePattern,
                        scheduleType: post.scheduleType,
                        isPastDue: timeDiff < 0,
                        timeDiffMs: timeDiff,
                        hasFullProcessing: true  // ← フル処理済みフラグ
                    });
                } catch (error) {
                    Logger.apiError(`フル変数処理 (投稿ID: ${post.id})`, error);
                    
                    // エラー時はプレースホルダー表示
                    const fallbackContent = await this.dynamicProcessor.processBasicDynamicContent(post.content);
                    
                    processedPosts.push({
                        id: post.id,
                        originalContent: post.content,
                        processedContent: fallbackContent,
                        scheduledTime: Utils.formatJST(new Date(post.nextPostTime), {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                        }),
                        timeStatus: 'API処理エラー',
                        datePattern: post.datePattern,
                        scheduleType: post.scheduleType,
                        isPastDue: false,
                        timeDiffMs: 0,
                        hasError: true,
                        hasFullProcessing: false
                    });
                }
            }
            
            // キャッシュ更新
            this.upcomingPostsCache = processedPosts;
            this.lastCacheUpdate = currentTime;
            Logger.cache('update', '直近投稿');
            
            Logger.processComplete('直近投稿処理', '', processedPosts.length);
            return processedPosts;
            
        } catch (error) {
            Logger.apiError('直近投稿取得', error);
            return [];
        }
    }

    // ==========================================================================
    // フル動的変数処理（コピー時に実行）
    // ==========================================================================

    /**
     * フル動的変数処理（コピー時に実行）
     */
    async getFullyProcessedContent(postId) {
        const post = this.posts.find(p => p.id === postId);
        if (!post) {
            throw new Error('投稿が見つかりません');
        }
        
        Logger.processStart('フル動的変数処理', `ID ${postId}`);
        
        // 完全な動的変数処理を実行
        const processedContent = await this.dynamicProcessor.processDynamicContent(post.content);
        
        Logger.processComplete('フル動的変数処理', `ID ${postId}`);
        return processedContent;
    }

    // ==========================================================================
    // 表示・フォーマット関連
    // ==========================================================================

    /**
     * 表示用の投稿情報を生成
     */
    formatPostForDisplay(post) {
        const scheduledTime = new Date(post.nextPostTime);
        const now = new Date();
        const timeDiff = scheduledTime.getTime() - now.getTime();
        
        return {
            id: post.id,
            content: Utils.safeTruncate(post.content, 100),
            fullContent: post.content,
            scheduledTime: Utils.formatJST(scheduledTime),
            timeUntil: Utils.getTimeDifferenceText(post.nextPostTime, now),
            isPastDue: timeDiff < 0,
            datePattern: post.datePattern,
            scheduleType: post.scheduleType,
            baseTime: post.baseTime,
            randomMinutes: post.randomMinutes || 0,
            status: post.status
        };
    }

    /**
     * スケジュールアイコンを取得
     */
    getScheduleIcon(scheduleType, datePattern) {
        if (scheduleType === 'specific') {
            return '📅';
        } else {
            switch (datePattern) {
                case '平日': return '🏢';
                case '土日': return '🏖️';
                case '日': return '🎌';
                case '月': return '🌙';
                case '火': return '🔥';
                case '水': return '💧';
                case '木': return '🌳';
                case '金': return '💰';
                case '土': return '🎨';
                default: return '🔄';
            }
        }
    }

    /**
     * パターン説明を取得
     */
    getPatternDescription(datePattern) {
        if (/^\d{8}$/.test(datePattern)) {
            const year = datePattern.substring(0, 4);
            const month = datePattern.substring(4, 6);
            const day = datePattern.substring(6, 8);
            return `${year}/${month}/${day}`;
        } else {
            switch (datePattern) {
                case '平日': return '平日（月〜金）';
                case '土日': return '土日';
                case '日': return '毎週日曜日';
                case '月': return '毎週月曜日';
                case '火': return '毎週火曜日';
                case '水': return '毎週水曜日';
                case '木': return '毎週木曜日';
                case '金': return '毎週金曜日';
                case '土': return '毎週土曜日';
                default: return datePattern;
            }
        }
    }

    // ==========================================================================
    // 統計・分析
    // ==========================================================================

    /**
     * 直近投稿の統計を取得
     */
    getUpcomingStats() {
        const now = new Date();
        const scheduledPosts = this.posts.filter(p => p.status === '予約中' && p.nextPostTime);
        
        // 24時間以内の投稿
        const within24h = scheduledPosts.filter(p => {
            const timeDiff = new Date(p.nextPostTime).getTime() - now.getTime();
            return timeDiff > 0 && timeDiff <= (24 * 60 * 60 * 1000);
        });
        
        // 1週間以内の投稿
        const withinWeek = scheduledPosts.filter(p => {
            const timeDiff = new Date(p.nextPostTime).getTime() - now.getTime();
            return timeDiff > 0 && timeDiff <= (7 * 24 * 60 * 60 * 1000);
        });
        
        // 期限切れの投稿
        const pastDue = scheduledPosts.filter(p => {
            return new Date(p.nextPostTime).getTime() < now.getTime();
        });
        
        return {
            totalScheduled: scheduledPosts.length,
            within24h: within24h.length,
            withinWeek: withinWeek.length,
            pastDue: pastDue.length,
            nextPost: scheduledPosts.length > 0 ? 
                scheduledPosts.sort((a, b) => new Date(a.nextPostTime) - new Date(b.nextPostTime))[0] : null,
            statsTime: Utils.formatJST(now)
        };
    }

    /**
     * パターン別の投稿数を取得
     */
    getPatternDistribution() {
        const patterns = {};
        
        this.posts.forEach(post => {
            const pattern = post.datePattern;
            if (!patterns[pattern]) {
                patterns[pattern] = {
                    total: 0,
                    scheduled: 0,
                    completed: 0
                };
            }
            
            patterns[pattern].total++;
            
            if (post.status === '予約中') {
                patterns[pattern].scheduled++;
            } else if (post.status === '投稿済み' || post.status === '手動投稿済み') {
                patterns[pattern].completed++;
            }
        });
        
        return patterns;
    }

    // ==========================================================================
    // キャッシュ状態・デバッグ
    // ==========================================================================

    /**
     * キャッシュ状態を取得
     */
    getCacheInfo() {
        return {
            hasCache: !!this.upcomingPostsCache,
            cacheSize: this.upcomingPostsCache ? this.upcomingPostsCache.length : 0,
            lastUpdated: this.lastCacheUpdate ? Utils.formatJST(new Date(this.lastCacheUpdate)) : null,
            isValid: this.isCacheValid(),
            expiresIn: this.lastCacheUpdate ? 
                Math.max(0, this.CACHE_DURATION - (Date.now() - this.lastCacheUpdate)) : 0
        };
    }

    /**
     * デバッグ情報を出力
     */
    debugInfo() {
        const stats = this.getUpcomingStats();
        const cacheInfo = this.getCacheInfo();
        
        Logger.stats('直近投稿管理デバッグ情報', {
            '統計': JSON.stringify(stats),
            'キャッシュ': JSON.stringify(cacheInfo),
            '投稿総数': this.posts.length
        });
    }
}

module.exports = UpcomingPosts;