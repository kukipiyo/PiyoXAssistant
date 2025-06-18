/**
 * 投稿補助機能モジュール（リファクタリング版）
 * 手動投稿支援・投稿完了マーク・延期機能専門
 * 重複コードを削除し、統一サービスを使用
 * 修正: 投稿補助モードでも時刻計算を実行
 */

const Utils = require('../utils/Utils');
const Logger = require('../utils/Logger');
const Validator = require('../utils/Validator');
const DataService = require('../utils/DataService');
const PostEditor = require('./PostEditor');

class AssistantMode {
    constructor(configManager, timeCalculator) {
        this.configManager = configManager;
        this.timeCalculator = timeCalculator;
        this.dataService = new DataService(configManager);
        this.postEditor = new PostEditor(configManager, timeCalculator);
        this.posts = [];
        
        // キャッシュ管理
        this.postsCache = null;
        this.lastCacheUpdate = null;
        this.CACHE_DURATION = 60000; // 1分間キャッシュ
        
        Logger.moduleInit('投稿補助モード');
    }

    // ==========================================================================
    // 投稿データ管理
    // ==========================================================================

    /**
     * 投稿データを設定（修正版）
     * 投稿補助モードでも時刻計算を実行
     */
    setPosts(posts) {
        this.posts = posts || [];
        this.postEditor.setPosts(this.posts);
        
        // 投稿補助モードでも未投稿を予約中に変換し、時刻計算を実行
        let scheduledCount = 0;
        this.posts.forEach(post => {
            if (post.status === '未投稿') {
                post.status = '予約中';
                this.timeCalculator.calculateNextPostTime(post);
                scheduledCount++;
            }
        });
        
        this.clearPostsCache();
        
        if (scheduledCount > 0) {
            Logger.processComplete('投稿補助モード時刻計算', `${scheduledCount}件を予約中に変換`);
        }
        
        Logger.dataSet('投稿補助モード', this.posts.length);
    }

    /**
     * 投稿データを取得
     */
    getPosts() {
        return this.posts;
    }

    /**
     * キャッシュクリア
     */
    clearPostsCache() {
        this.postsCache = null;
        this.lastCacheUpdate = null;
        Logger.cache('clear', '投稿キャッシュ');
    }

    // ==========================================================================
    // バリデーション（統一版）
    // ==========================================================================

    /**
     * 投稿存在チェック（統一版）
     */
    validatePostExists(postId) {
        const idResult = Validator.validateInteger(postId, '投稿ID');
        if (!idResult.valid) {
            return { valid: false, error: idResult.error };
        }
        
        const post = this.posts.find(p => p.id === idResult.value);
        if (!post) {
            return { valid: false, error: '投稿が見つかりません' };
        }
        
        return { valid: true, post: post };
    }

    // ==========================================================================
    // 手動投稿完了処理
    // ==========================================================================

    /**
     * 投稿を手動完了マーク
     */
    markAsManuallyPosted(postId) {
        // バリデーション（統一版）
        const postResult = this.validatePostExists(postId);
        if (!postResult.valid) {
            throw new Error(postResult.error);
        }
        
        const post = postResult.post;
        
        post.status = '手動投稿済み';
        post.lastPostedTime = new Date().toISOString();
        post.nextPostTime = null;
        
        this.clearPostsCache();
        
        const postedJST = Utils.formatJST(new Date(), {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        Logger.postAction('✅ 手動投稿完了', postId, post.content, `(${postedJST} JST)`);
        
        // 繰り返し投稿の場合は次回スケジュール
        if (post.scheduleType === 'recurring') {
            this.scheduleNextRecurringPost(post);
        }
        
        // 統一データサービスで保存
        this.dataService.savePostsData(this.posts);
        
        return post;
    }

    /**
     * 繰り返し投稿の次回スケジュール設定
     */
    scheduleNextRecurringPost(post) {
        setTimeout(() => {
            post.status = '予約中';
            this.timeCalculator.calculateNextPostTime(post, true);
            
            const nextJST = Utils.formatJST(new Date(post.nextPostTime), {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            Logger.postSchedule('🔄 手動投稿後の次回予約', post.id, post.content, nextJST);
            
            this.clearPostsCache();
            this.dataService.savePostsData(this.posts);
        }, 5000); // 5秒後に次回スケジュール
    }

    // ==========================================================================
    // 投稿延期機能
    // ==========================================================================

    /**
     * 投稿を延期
     */
    postponePost(postId, minutes = 30) {
        // バリデーション（統一版）
        const postResult = this.validatePostExists(postId);
        if (!postResult.valid) {
            throw new Error(postResult.error);
        }
        
        const minutesResult = Validator.validateRange(minutes, 1, 1440, '延期時間');
        if (!minutesResult.valid) {
            throw new Error(minutesResult.error);
        }
        
        const post = postResult.post;
        
        const newTime = new Date();
        newTime.setMinutes(newTime.getMinutes() + minutesResult.value);
        post.nextPostTime = newTime.toISOString();
        
        this.clearPostsCache();
        
        const newTimeJST = Utils.formatJST(newTime, {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        Logger.postAction('⏰ 投稿延期', postId, post.content, `-> ${newTimeJST} (JST)`);
        
        // 統一データサービスで保存
        this.dataService.savePostsData(this.posts);
        
        return post;
    }

    /**
     * 投稿の延期オプションを提案
     */
    getPostponeOptions() {
        return [
            { minutes: 15, label: '15分後' },
            { minutes: 30, label: '30分後' },
            { minutes: 60, label: '1時間後' },
            { minutes: 120, label: '2時間後' },
            { minutes: 240, label: '4時間後' },
            { minutes: 480, label: '8時間後' },
            { minutes: 720, label: '12時間後' },
            { minutes: 1440, label: '24時間後' }
        ];
    }

    /**
     * カスタム延期時間の設定
     */
    postponePostCustom(postId, targetDateTime) {
        // バリデーション（統一版）
        const postResult = this.validatePostExists(postId);
        if (!postResult.valid) {
            throw new Error(postResult.error);
        }
        
        const targetTime = new Date(targetDateTime);
        const now = new Date();
        
        if (targetTime <= now) {
            throw new Error('延期時刻は現在時刻より後に設定してください');
        }
        
        const post = postResult.post;
        post.nextPostTime = targetTime.toISOString();
        
        this.clearPostsCache();
        
        const targetJST = Utils.formatJST(targetTime);
        Logger.postAction('📅 投稿時刻変更', postId, post.content, `-> ${targetJST} (JST)`);
        
        // 統一データサービスで保存
        this.dataService.savePostsData(this.posts);
        
        return post;
    }

    // ==========================================================================
    // 投稿状態管理
    // ==========================================================================

    /**
     * 投稿状態を変更
     */
    changePostStatus(postId, newStatus) {
        // バリデーション（統一版）
        const postResult = this.validatePostExists(postId);
        if (!postResult.valid) {
            throw new Error(postResult.error);
        }
        
        const validStatuses = ['未投稿', '予約中', '投稿済み', '手動投稿済み', '投稿失敗', 'スキップ'];
        if (!validStatuses.includes(newStatus)) {
            throw new Error(`無効なステータスです: ${newStatus}`);
        }
        
        const post = postResult.post;
        const oldStatus = post.status;
        post.status = newStatus;
        
        // ステータスに応じた処理
        this.processStatusChange(post, newStatus);
        
        Logger.postStatusChange(postId, oldStatus, newStatus);
        
        this.clearPostsCache();
        this.dataService.savePostsData(this.posts);
        
        return post;
    }

    /**
     * ステータス変更時の処理
     */
    processStatusChange(post, newStatus) {
        switch (newStatus) {
            case '未投稿':
                post.nextPostTime = null;
                post.lastPostedTime = null;
                break;
            case '予約中':
                if (!post.nextPostTime) {
                    this.timeCalculator.calculateNextPostTime(post);
                }
                break;
            case '投稿済み':
            case '手動投稿済み':
                if (!post.lastPostedTime) {
                    post.lastPostedTime = new Date().toISOString();
                }
                post.nextPostTime = null;
                break;
            case 'スキップ':
                post.nextPostTime = null;
                break;
        }
    }

    /**
     * 投稿を再アクティブ化
     */
    reactivatePost(postId) {
        const postResult = this.validatePostExists(postId);
        if (!postResult.valid) {
            throw new Error(postResult.error);
        }
        
        const post = postResult.post;
        
        if (post.status === 'スキップ' || post.status === '投稿失敗') {
            post.status = '予約中';
            this.timeCalculator.calculateNextPostTime(post);
            
            const nextJST = Utils.formatJST(new Date(post.nextPostTime));
            Logger.postSchedule('🔄 投稿再アクティブ化', postId, post.content, nextJST);
            
            this.clearPostsCache();
            this.dataService.savePostsData(this.posts);
            
            return post;
        } else {
            throw new Error('再アクティブ化できない状態です');
        }
    }

    /**
     * 複数投稿の状態を一括変更
     */
    batchChangeStatus(postIds, newStatus) {
        const validStatuses = ['未投稿', '予約中', '投稿済み', '手動投稿済み', '投稿失敗', 'スキップ'];
        if (!validStatuses.includes(newStatus)) {
            throw new Error(`無効なステータスです: ${newStatus}`);
        }
        
        const updatedPosts = [];
        
        postIds.forEach(postId => {
            try {
                const post = this.changePostStatus(postId, newStatus);
                updatedPosts.push(post);
            } catch (error) {
                Logger.apiError(`ID ${postId} のステータス変更`, error);
            }
        });
        
        Logger.processComplete('一括ステータス変更', `"${newStatus}"`, updatedPosts.length);
        
        return updatedPosts;
    }

    // ==========================================================================
    // 編集機能（PostEditorに委譲）
    // ==========================================================================

    /**
     * 投稿内容を編集
     */
    editPostContent(postId, newContent) {
        const result = this.postEditor.editPostContent(postId, newContent);
        this.clearPostsCache();
        return result;
    }

    /**
     * 投稿時刻を編集
     */
    editPostTime(postId, newBaseTime, newRandomMinutes = null) {
        const result = this.postEditor.editPostTime(postId, newBaseTime, newRandomMinutes);
        this.clearPostsCache();
        return result;
    }

    /**
     * 投稿パターンを編集
     */
    editPostPattern(postId, newDatePattern) {
        const result = this.postEditor.editPostPattern(postId, newDatePattern);
        this.clearPostsCache();
        return result;
    }

    /**
     * 投稿を複製
     */
    duplicatePost(postId) {
        const result = this.postEditor.duplicatePost(postId);
        this.clearPostsCache();
        return result;
    }

    /**
     * データ検証
     */
    validatePostsData() {
        return this.postEditor.validatePostsData();
    }

    // ==========================================================================
    // 統計・分析
    // ==========================================================================

    /**
     * 手動投稿の統計を取得
     */
    getManualPostStats() {
        const manualPosts = this.posts.filter(p => p.status === '手動投稿済み');
        const stats = Utils.calculatePostStats(this.posts);
        
        return {
            ...stats,
            manualPosts: manualPosts.length,
            manualPostRate: stats.posted > 0 ? Math.round((manualPosts.length / stats.posted) * 100) : 0,
            recentManualPosts: manualPosts.filter(p => {
                if (!p.lastPostedTime) return false;
                const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
                return new Date(p.lastPostedTime).getTime() > dayAgo;
            }).length
        };
    }

    /**
     * 投稿効率分析
     */
    analyzePostingEfficiency() {
        const scheduledPosts = this.posts.filter(p => p.status === '予約中');
        const completedPosts = this.posts.filter(p => 
            p.status === '投稿済み' || p.status === '手動投稿済み'
        );
        
        return {
            totalPosts: this.posts.length,
            scheduledPosts: scheduledPosts.length,
            completedPosts: completedPosts.length,
            completionRate: this.posts.length > 0 ? 
                Math.round((completedPosts.length / this.posts.length) * 100) : 0,
            analysisTime: Utils.formatJST()
        };
    }

    // ==========================================================================
    // データ保存・復元
    // ==========================================================================

    /**
     * 投稿データを手動保存
     */
    savePostsData() {
        this.dataService.savePostsData(this.posts);
        Logger.processComplete('投稿データ手動保存', '', this.posts.length);
    }

    /**
     * 投稿データをクリア
     */
    clearPostsData() {
        this.posts = [];
        this.postEditor.setPosts(this.posts);
        this.clearPostsCache();
        this.dataService.clearPostsData();
        Logger.dataClear('投稿補助モード', '投稿データ');
    }

    /**
     * 投稿データを復元時にクリーンアップ
     */
    cleanupRestoredPosts() {
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        let cleanedCount = 0;
        
        this.posts.forEach(post => {
            if (post.status === '予約中' && post.nextPostTime) {
                const scheduledTime = new Date(post.nextPostTime);
                
                if (scheduledTime < oneDayAgo) {
                    if (post.scheduleType === 'recurring') {
                        Logger.processStart('復元時に再計算', Utils.safeTruncate(post.content, 20));
                        this.timeCalculator.calculateNextPostTime(post, false);
                        cleanedCount++;
                    } else {
                        post.status = '未投稿';
                        post.nextPostTime = null;
                        Logger.processSkip('期限切れのため未投稿に戻す', Utils.safeTruncate(post.content, 20));
                        cleanedCount++;
                    }
                }
            }
        });
        
        if (cleanedCount > 0) {
            Logger.cleanup('復元時クリーンアップ', cleanedCount);
            this.dataService.savePostsData(this.posts);
        }
    }

    // ==========================================================================
    // 検索・フィルタリング
    // ==========================================================================

    /**
     * 投稿を検索
     */
    searchPosts(query, filters = {}) {
        let results = this.posts;
        
        // テキスト検索
        if (query && query.trim()) {
            const searchTerm = query.toLowerCase();
            results = results.filter(post => 
                post.content.toLowerCase().includes(searchTerm)
            );
        }
        
        // ステータスフィルタ
        if (filters.status) {
            results = results.filter(post => post.status === filters.status);
        }
        
        // 日付パターンフィルタ
        if (filters.datePattern) {
            results = results.filter(post => post.datePattern === filters.datePattern);
        }
        
        // 時刻範囲フィルタ
        if (filters.timeRange) {
            const { start, end } = filters.timeRange;
            results = results.filter(post => {
                const baseTime = post.baseTime;
                return baseTime >= start && baseTime <= end;
            });
        }
        
        return {
            posts: results,
            totalFound: results.length,
            searchQuery: query,
            appliedFilters: filters,
            searchedAt: Utils.formatJST()
        };
    }

    /**
     * 投稿を並び替え
     */
    sortPosts(sortBy = 'id', order = 'asc') {
        const sortedPosts = [...this.posts];
        
        sortedPosts.sort((a, b) => {
            let valueA, valueB;
            
            switch (sortBy) {
                case 'id':
                    valueA = a.id;
                    valueB = b.id;
                    break;
                case 'content':
                    valueA = a.content.toLowerCase();
                    valueB = b.content.toLowerCase();
                    break;
                case 'baseTime':
                    valueA = a.baseTime;
                    valueB = b.baseTime;
                    break;
                case 'status':
                    valueA = a.status;
                    valueB = b.status;
                    break;
                case 'nextPostTime':
                    valueA = a.nextPostTime ? new Date(a.nextPostTime).getTime() : 0;
                    valueB = b.nextPostTime ? new Date(b.nextPostTime).getTime() : 0;
                    break;
                default:
                    valueA = a.id;
                    valueB = b.id;
            }
            
            if (order === 'desc') {
                return valueA < valueB ? 1 : valueA > valueB ? -1 : 0;
            } else {
                return valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
            }
        });
        
        return sortedPosts;
    }
}

module.exports = AssistantMode;