/**
 * 投稿編集専用モジュール（リファクタリング版）
 * 投稿内容・時刻・パターン編集・データ検証を担当
 * 重複バリデーション・ログを削除し、統一サービスを使用
 */

const Utils = require('../utils/Utils');
const Logger = require('../utils/Logger');
const Validator = require('../utils/Validator');
const DataService = require('../utils/DataService');

class PostEditor {
    constructor(configManager, timeCalculator) {
        this.configManager = configManager;
        this.timeCalculator = timeCalculator;
        this.dataService = new DataService(configManager);
        this.posts = [];
        
        Logger.moduleInit('投稿編集モジュール');
    }

    // ==========================================================================
    // 投稿データ管理
    // ==========================================================================

    /**
     * 投稿データを設定
     */
    setPosts(posts) {
        this.posts = posts || [];
        Logger.dataSet('投稿編集モジュール', this.posts.length);
    }

    /**
     * 投稿データを取得
     */
    getPosts() {
        return this.posts;
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
    // 投稿編集機能
    // ==========================================================================

    /**
     * 投稿内容を編集
     */
    editPostContent(postId, newContent) {
        // 統一バリデーション使用
        const postResult = this.validatePostExists(postId);
        if (!postResult.valid) {
            throw new Error(postResult.error);
        }
        
        const contentResult = Validator.validatePostContent(newContent);
        if (!contentResult.valid) {
            throw new Error(contentResult.error);
        }
        
        const post = postResult.post;
        const oldContent = post.content;
        post.content = contentResult.value;
        
        Logger.postAction('✏️ 投稿内容編集', postId, post.content, 
            `変更前: "${Utils.safeTruncate(oldContent, 30)}..."`);
        
        // 統一データサービスで保存
        this.dataService.savePostsData(this.posts);
        
        return post;
    }

    /**
     * 投稿時刻を編集
     */
    editPostTime(postId, newBaseTime, newRandomMinutes = null) {
        // 統一バリデーション使用
        const postResult = this.validatePostExists(postId);
        if (!postResult.valid) {
            throw new Error(postResult.error);
        }
        
        const timeResult = Validator.validateTimeFormat(newBaseTime, { throwError: true });
        
        if (newRandomMinutes !== null) {
            const randomResult = Validator.validateRandomMinutes(newRandomMinutes);
            if (!randomResult.valid) {
                throw new Error(randomResult.error);
            }
            newRandomMinutes = randomResult.value;
        }
        
        const post = postResult.post;
        const oldBaseTime = post.baseTime;
        post.baseTime = timeResult.value;
        
        if (newRandomMinutes !== null) {
            post.randomMinutes = newRandomMinutes;
        }
        
        // 予約中の場合は次回投稿時刻を再計算
        if (post.status === '予約中') {
            this.timeCalculator.calculateNextPostTime(post);
        }
        
        Logger.postAction('⏰ 投稿時刻編集', postId, post.content, 
            `"${oldBaseTime}" -> "${timeResult.value}" ±${newRandomMinutes || 0}分`);
        
        // 統一データサービスで保存
        this.dataService.savePostsData(this.posts);
        
        return post;
    }

    /**
     * 投稿パターンを編集
     */
    editPostPattern(postId, newDatePattern) {
        // 統一バリデーション使用
        const postResult = this.validatePostExists(postId);
        if (!postResult.valid) {
            throw new Error(postResult.error);
        }
        
        const patternResult = Validator.validateDatePattern(newDatePattern);
        if (!patternResult.valid) {
            throw new Error(patternResult.error);
        }
        
        const post = postResult.post;
        const oldPattern = post.datePattern;
        post.datePattern = patternResult.value;
        post.scheduleType = Utils.getScheduleType(patternResult.value);
        
        // 予約中の場合は次回投稿時刻を再計算
        if (post.status === '予約中') {
            this.timeCalculator.calculateNextPostTime(post);
        }
        
        Logger.postAction('📅 投稿パターン編集', postId, post.content, 
            `"${oldPattern}" -> "${patternResult.value}"`);
        
        // 統一データサービスで保存
        this.dataService.savePostsData(this.posts);
        
        return post;
    }

    /**
     * ランダム分数を編集
     */
    editRandomMinutes(postId, newRandomMinutes) {
        // 統一バリデーション使用
        const postResult = this.validatePostExists(postId);
        if (!postResult.valid) {
            throw new Error(postResult.error);
        }
        
        const randomResult = Validator.validateRandomMinutes(newRandomMinutes);
        if (!randomResult.valid) {
            throw new Error(randomResult.error);
        }
        
        const post = postResult.post;
        const oldRandomMinutes = post.randomMinutes || 0;
        post.randomMinutes = randomResult.value;
        
        // 予約中の場合は次回投稿時刻を再計算
        if (post.status === '予約中') {
            this.timeCalculator.calculateNextPostTime(post);
        }
        
        Logger.postAction('🎲 ランダム分数編集', postId, post.content, 
            `±${oldRandomMinutes}分 -> ±${randomResult.value}分`);
        
        // 統一データサービスで保存
        this.dataService.savePostsData(this.posts);
        
        return post;
    }

    // ==========================================================================
    // 投稿複製・複製機能
    // ==========================================================================

    /**
     * 投稿を複製
     */
    duplicatePost(postId) {
        // 統一バリデーション使用
        const postResult = this.validatePostExists(postId);
        if (!postResult.valid) {
            throw new Error(postResult.error);
        }
        
        const originalPost = postResult.post;
        
        // 新しいIDを生成
        const newId = Math.max(...this.posts.map(p => p.id)) + 1;
        
        const duplicatedPost = {
            id: newId,
            content: originalPost.content + ' (コピー)',
            baseTime: originalPost.baseTime,
            randomMinutes: originalPost.randomMinutes || 0,
            datePattern: originalPost.datePattern,
            status: '未投稿',
            nextPostTime: null,
            scheduleType: originalPost.scheduleType
        };
        
        this.posts.push(duplicatedPost);
        
        Logger.postAction('📄 投稿複製', newId, duplicatedPost.content, 
            `元ID: ${postId} -> 新ID: ${newId}`);
        
        // 統一データサービスで保存
        this.dataService.savePostsData(this.posts);
        
        return duplicatedPost;
    }

    /**
     * テンプレートから投稿作成
     */
    createFromTemplate(template) {
        const requiredFields = ['content', 'baseTime', 'datePattern'];
        for (const field of requiredFields) {
            if (!template[field]) {
                throw new Error(`テンプレートに必須フィールド "${field}" がありません`);
            }
        }
        
        // 統一バリデーション使用
        const contentResult = Validator.validatePostContent(template.content);
        if (!contentResult.valid) {
            throw new Error(contentResult.error);
        }
        
        const timeResult = Validator.validateTimeFormat(template.baseTime);
        if (!timeResult.valid) {
            throw new Error(timeResult.error);
        }
        
        const patternResult = Validator.validateDatePattern(template.datePattern);
        if (!patternResult.valid) {
            throw new Error(patternResult.error);
        }
        
        // 新しいIDを生成
        const newId = this.posts.length > 0 ? Math.max(...this.posts.map(p => p.id)) + 1 : 1;
        
        const newPost = {
            id: newId,
            content: contentResult.value,
            baseTime: timeResult.value,
            randomMinutes: template.randomMinutes || 0,
            datePattern: patternResult.value,
            status: '未投稿',
            nextPostTime: null,
            scheduleType: Utils.getScheduleType(patternResult.value)
        };
        
        this.posts.push(newPost);
        
        Logger.postAction('📝 テンプレートから投稿作成', newId, newPost.content);
        
        // 統一データサービスで保存
        this.dataService.savePostsData(this.posts);
        
        return newPost;
    }

    // ==========================================================================
    // データ検証・整合性チェック
    // ==========================================================================

    /**
     * 投稿データの整合性をチェック
     */
    validatePostsData() {
        Logger.processStart('投稿データ検証');
        
        // 統一バリデーション使用
        const result = Validator.validatePostsArray(this.posts, { requireId: true });
        
        if (result.valid) {
            Logger.processComplete('投稿データ検証', '全て正常', result.totalPosts);
        } else {
            Logger.apiError('投稿データ検証', new Error(`${result.errors.length}件のエラー`));
        }
        
        return {
            valid: result.valid,
            errors: result.errors,
            warnings: result.warnings || [],
            totalPosts: result.totalPosts,
            checkedAt: Utils.formatJST()
        };
    }

    /**
     * 投稿内容の文字数チェック
     */
    validateContentLength(content) {
        const result = Validator.validatePostContent(content, { 
            maxLength: 280, 
            minLength: 1 
        });
        
        const length = content ? content.length : 0;
        
        return {
            length: length,
            withinTwitterLimit: length <= 280,
            withinRecommended: length <= 240,
            isEmpty: length === 0,
            tooLong: length > 280,
            valid: result.valid,
            error: result.error
        };
    }

    /**
     * スケジュール競合チェック
     */
    checkScheduleConflicts() {
        Logger.processStart('スケジュール競合チェック');
        
        const conflicts = [];
        const scheduledPosts = this.posts.filter(p => p.status === '予約中' && p.nextPostTime);
        
        // 同じ時刻の投稿をチェック
        for (let i = 0; i < scheduledPosts.length; i++) {
            for (let j = i + 1; j < scheduledPosts.length; j++) {
                const post1 = scheduledPosts[i];
                const post2 = scheduledPosts[j];
                
                const time1 = new Date(post1.nextPostTime).getTime();
                const time2 = new Date(post2.nextPostTime).getTime();
                
                // 5分以内の場合は競合とみなす
                if (Math.abs(time1 - time2) < 5 * 60 * 1000) {
                    conflicts.push({
                        post1: { id: post1.id, time: Utils.formatJST(new Date(post1.nextPostTime)) },
                        post2: { id: post2.id, time: Utils.formatJST(new Date(post2.nextPostTime)) },
                        timeDiff: Math.abs(time1 - time2) / 1000 // 秒
                    });
                }
            }
        }
        
        Logger.processComplete('スケジュール競合チェック', '', conflicts.length);
        
        return {
            hasConflicts: conflicts.length > 0,
            conflicts: conflicts,
            checkedAt: Utils.formatJST()
        };
    }

    // ==========================================================================
    // バッチ編集機能
    // ==========================================================================

    /**
     * 複数投稿の時刻を一括変更
     */
    batchEditTime(postIds, newBaseTime, newRandomMinutes = null) {
        // 統一バリデーション使用
        const timeResult = Validator.validateTimeFormat(newBaseTime);
        if (!timeResult.valid) {
            throw new Error(timeResult.error);
        }
        
        if (newRandomMinutes !== null) {
            const randomResult = Validator.validateRandomMinutes(newRandomMinutes);
            if (!randomResult.valid) {
                throw new Error(randomResult.error);
            }
            newRandomMinutes = randomResult.value;
        }
        
        const updatedPosts = [];
        
        postIds.forEach(postId => {
            const postResult = this.validatePostExists(postId);
            if (postResult.valid) {
                const post = postResult.post;
                post.baseTime = timeResult.value;
                if (newRandomMinutes !== null) {
                    post.randomMinutes = newRandomMinutes;
                }
                
                // 予約中の場合は次回投稿時刻を再計算
                if (post.status === '予約中') {
                    this.timeCalculator.calculateNextPostTime(post);
                }
                
                updatedPosts.push(post);
            }
        });
        
        Logger.processComplete('一括時刻変更', `${timeResult.value}`, updatedPosts.length);
        
        // 統一データサービスで保存
        this.dataService.savePostsData(this.posts);
        
        return updatedPosts;
    }

    /**
     * 複数投稿のパターンを一括変更
     */
    batchEditPattern(postIds, newDatePattern) {
        // 統一バリデーション使用
        const patternResult = Validator.validateDatePattern(newDatePattern);
        if (!patternResult.valid) {
            throw new Error(patternResult.error);
        }
        
        const updatedPosts = [];
        
        postIds.forEach(postId => {
            const postResult = this.validatePostExists(postId);
            if (postResult.valid) {
                const post = postResult.post;
                post.datePattern = patternResult.value;
                post.scheduleType = Utils.getScheduleType(patternResult.value);
                
                // 予約中の場合は次回投稿時刻を再計算
                if (post.status === '予約中') {
                    this.timeCalculator.calculateNextPostTime(post);
                }
                
                updatedPosts.push(post);
            }
        });
        
        Logger.processComplete('一括パターン変更', `${patternResult.value}`, updatedPosts.length);
        
        // 統一データサービスで保存
        this.dataService.savePostsData(this.posts);
        
        return updatedPosts;
    }

    // ==========================================================================
    // ユーティリティ
    // ==========================================================================

    /**
     * 投稿統計を取得
     */
    getEditingStats() {
        const stats = Utils.calculatePostStats(this.posts);
        
        // 文字数統計
        const contentLengths = this.posts.map(p => p.content.length);
        const avgLength = contentLengths.length > 0 ? 
            Math.round(contentLengths.reduce((a, b) => a + b, 0) / contentLengths.length) : 0;
        
        // パターン別統計
        const patterns = {};
        this.posts.forEach(post => {
            const pattern = post.datePattern;
            patterns[pattern] = (patterns[pattern] || 0) + 1;
        });
        
        return {
            ...stats,
            averageContentLength: avgLength,
            maxContentLength: Math.max(...contentLengths, 0),
            minContentLength: Math.min(...contentLengths, 0),
            patternDistribution: patterns,
            timestamp: Utils.formatJST()
        };
    }
}

module.exports = PostEditor;