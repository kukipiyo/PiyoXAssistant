/**
 * 投稿補助機能専用ルート（リファクタリング版）
 * 直近投稿・コピー・投稿完了マーク・延期機能・編集機能を担当
 * 重複エラーハンドリングを削除し、統一ミドルウェア・バリデーションを使用
 * 編集機能API追加版
 */

const express = require('express');
const { asyncHandler, sendSuccess, handleValidationResult } = require('../middleware/errorHandler');
const Validator = require('../utils/Validator');
const Logger = require('../utils/Logger');

/**
 * 投稿補助機能のルートを設定
 * @param {Object} dependencies - 依存性オブジェクト
 * @returns {Router} Express Router
 */
module.exports = function(dependencies) {
    const router = express.Router();
    const { upcomingPosts, assistantMode, postScheduler } = dependencies;
    
    // ==========================================================================
    // 直近投稿予定関連
    // ==========================================================================
    
    /**
     * 直近投稿予定取得
     * GET /api/upcoming-posts
     */
    router.get('/upcoming-posts', asyncHandler(async (req, res) => {
        const limit = parseInt(req.query.limit) || 20;
        
        // 統一バリデーション使用
        const limitResult = Validator.validateRange(limit, 1, 50, '取得件数');
        if (!handleValidationResult(res, limitResult)) return;
        
        const upcomingPostsData = await upcomingPosts.getUpcomingPosts(limitResult.value);
        
        Logger.processComplete('直近投稿取得', '', upcomingPostsData.length);
        
        sendSuccess(res, {
            posts: upcomingPostsData,
            assistantMode: postScheduler.assistantMode,
            timestamp: new Date().toISOString(),
            cached: upcomingPosts.isCacheValid()
        });
    }));
    
    /**
     * フル処理済み内容取得（コピー用）
     * GET /api/processed-content/:postId
     */
    router.get('/processed-content/:postId', asyncHandler(async (req, res) => {
        const postId = parseInt(req.params.postId);
        
        // 統一バリデーション使用
        const idResult = Validator.validateInteger(postId, '投稿ID');
        if (!handleValidationResult(res, idResult)) return;
        
        const processedContent = await upcomingPosts.getFullyProcessedContent(idResult.value);
        
        Logger.processComplete('フル動的変数処理', `ID ${idResult.value}`);
        
        sendSuccess(res, {
            content: processedContent,
            postId: idResult.value,
            processedAt: new Date().toISOString()
        });
    }));
    
    // ==========================================================================
    // 編集機能関連API
    // ==========================================================================
    
    /**
     * 投稿テンプレート取得（編集用）
     * GET /api/post-template/:postId
     */
    router.get('/post-template/:postId', asyncHandler(async (req, res) => {
        const postId = parseInt(req.params.postId);
        
        // 統一バリデーション使用
        const idResult = Validator.validateInteger(postId, '投稿ID');
        if (!handleValidationResult(res, idResult)) return;
        
        const posts = assistantMode.getPosts();
        const post = posts.find(p => p.id === idResult.value);
        
        if (!post) {
            throw new Error('投稿が見つかりません');
        }
        
        Logger.processComplete('投稿テンプレート取得', `ID ${idResult.value}`);
        
        sendSuccess(res, {
            post: {
                id: post.id,
                content: post.content,
                baseTime: post.baseTime,
                randomMinutes: post.randomMinutes || 0,
                datePattern: post.datePattern,
                status: post.status,
                scheduleType: post.scheduleType
            },
            retrievedAt: new Date().toISOString()
        });
    }));
    
    /**
     * テンプレートプレビュー
     * POST /api/preview-template
     */
    router.post('/preview-template', asyncHandler(async (req, res) => {
        const { content } = req.body;
        
        // 統一バリデーション使用
        const contentResult = Validator.validatePostContent(content, { required: true });
        if (!handleValidationResult(res, contentResult)) return;
        
        // DynamicProcessorを直接インスタンス化
        const DynamicProcessor = require('../processors/DynamicProcessor');
        const dynamicProcessor = new DynamicProcessor(dependencies.configManager);
        
        const processedContent = await dynamicProcessor.processDynamicContent(contentResult.value);
        
        Logger.processComplete('テンプレートプレビュー', `${processedContent.length}文字`);
        
        sendSuccess(res, {
            originalContent: contentResult.value,
            processedContent: processedContent,
            characterCount: processedContent.length,
            withinLimit: processedContent.length <= 280,
            previewedAt: new Date().toISOString()
        });
    }));
    
    /**
     * 投稿内容更新
     * PUT /api/update-post/:postId
     */
    router.put('/update-post/:postId', asyncHandler(async (req, res) => {
        const postId = parseInt(req.params.postId);
        const { content, baseTime, randomMinutes, datePattern, isTemplate } = req.body;
        
        // 統一バリデーション使用
        const idResult = Validator.validateInteger(postId, '投稿ID');
        if (!handleValidationResult(res, idResult)) return;
        
        const contentResult = Validator.validatePostContent(content, { required: true });
        if (!handleValidationResult(res, contentResult)) return;
        
        let updatedPost;
        
        if (isTemplate) {
            // テンプレート編集モード: 全ての設定を更新
            
            // スケジュール設定のバリデーション
            const timeResult = Validator.validateTimeFormat(baseTime);
            if (!handleValidationResult(res, timeResult)) return;
            
            const randomResult = Validator.validateRandomMinutes(randomMinutes);
            if (!handleValidationResult(res, randomResult)) return;
            
            const patternResult = Validator.validateDatePattern(datePattern);
            if (!handleValidationResult(res, patternResult)) return;
            
            // 投稿編集実行（テンプレートモード）
            updatedPost = assistantMode.editPostContent(idResult.value, contentResult.value);
            assistantMode.editPostTime(idResult.value, timeResult.value, randomResult.value);
            assistantMode.editPostPattern(idResult.value, patternResult.value);
            
            Logger.postAction('📝 テンプレート編集保存', idResult.value, contentResult.value, 
                `時刻: ${timeResult.value} ±${randomResult.value}分, パターン: ${patternResult.value}`);
            
        } else {
            // 評価後編集モード: 内容のみ更新
            updatedPost = assistantMode.editPostContent(idResult.value, contentResult.value);
            
            Logger.postAction('📝 評価後編集保存', idResult.value, contentResult.value);
        }
        
        // キャッシュクリア
        upcomingPosts.clearCache();
        
        sendSuccess(res, {
            post: {
                id: updatedPost.id,
                content: updatedPost.content,
                baseTime: updatedPost.baseTime,
                randomMinutes: updatedPost.randomMinutes,
                datePattern: updatedPost.datePattern,
                status: updatedPost.status
            },
            isTemplate: !!isTemplate,
            updatedAt: new Date().toISOString()
        }, '投稿内容を更新しました');
    }));
    
    // ==========================================================================
    // モード制御
    // ==========================================================================
    
    /**
     * モード切り替え
     * POST /api/toggle-assistant-mode
     */
    router.post('/toggle-assistant-mode', asyncHandler(async (req, res) => {
        const assistantModeStatus = postScheduler.toggleAssistantMode();
        
        Logger.serviceStart('モード切り替え', assistantModeStatus ? '投稿補助モード' : '自動投稿モード');
        
        sendSuccess(res, {
            assistantMode: assistantModeStatus,
            message: assistantModeStatus ? '手動投稿補助モードON' : '自動投稿モードON',
            changedAt: new Date().toISOString()
        });
    }));
    
    // ==========================================================================
    // 投稿操作関連
    // ==========================================================================
    
    /**
     * 手動投稿完了マーク
     * POST /api/mark-posted/:postId
     */
    router.post('/mark-posted/:postId', asyncHandler(async (req, res) => {
        const postId = parseInt(req.params.postId);
        
        // 統一バリデーション使用
        const idResult = Validator.validateInteger(postId, '投稿ID');
        if (!handleValidationResult(res, idResult)) return;
        
        const post = assistantMode.markAsManuallyPosted(idResult.value);
        
        // キャッシュクリア
        upcomingPosts.clearCache();
        
        Logger.postAction('✅ 手動投稿完了マーク', idResult.value, post.content);
        
        sendSuccess(res, {
            post: {
                id: post.id,
                status: post.status,
                lastPostedTime: post.lastPostedTime,
                nextPostTime: post.nextPostTime
            },
            markedAt: new Date().toISOString()
        }, '手動投稿完了をマークしました');
    }));
    
    /**
     * 投稿延期
     * POST /api/postpone/:postId
     */
    router.post('/postpone/:postId', asyncHandler(async (req, res) => {
        const postId = parseInt(req.params.postId);
        const minutes = parseInt(req.body.minutes) || 30;
        
        // 統一バリデーション使用
        const idResult = Validator.validateInteger(postId, '投稿ID');
        if (!handleValidationResult(res, idResult)) return;
        
        const minutesResult = Validator.validateRange(minutes, 1, 1440, '延期時間');
        if (!handleValidationResult(res, minutesResult)) return;
        
        const post = assistantMode.postponePost(idResult.value, minutesResult.value);
        
        // キャッシュクリア
        upcomingPosts.clearCache();
        
        Logger.postAction('⏰ 投稿延期', idResult.value, post.content, `${minutesResult.value}分後`);
        
        const newTime = new Date(post.nextPostTime);
        const newTimeJST = newTime.toLocaleString('ja-JP', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        sendSuccess(res, {
            post: {
                id: post.id,
                nextPostTime: post.nextPostTime
            },
            delayMinutes: minutesResult.value,
            newTime: newTimeJST,
            postponedAt: new Date().toISOString()
        }, `${minutesResult.value}分延期しました`);
    }));
    
    // ==========================================================================
    // 投稿削除機能（NEW）
    // ==========================================================================
    
    /**
     * 投稿削除（修正版）
     * DELETE /api/delete-post/:postId
     */
    router.delete('/delete-post/:postId', asyncHandler(async (req, res) => {
        const postId = parseInt(req.params.postId);
        
        // 統一バリデーション使用
        const idResult = Validator.validateInteger(postId, '投稿ID');
        if (!handleValidationResult(res, idResult)) return;
        
        const posts = assistantMode.getPosts();
        const postIndex = posts.findIndex(p => p.id === idResult.value);
        
        if (postIndex === -1) {
            throw new Error('投稿が見つかりません');
        }
        
        const deletedPost = posts[postIndex];
        
        // 投稿をリストから削除
        posts.splice(postIndex, 1);
        
        // configManagerを使って直接保存（修正部分）
        dependencies.configManager.saveConfig({ postsData: posts });
        
        // キャッシュクリア
        upcomingPosts.clearCache();
        
        Logger.postAction('🗑️ 投稿削除', idResult.value, deletedPost.content);
        
        sendSuccess(res, {
            deletedPost: {
                id: deletedPost.id,
                content: deletedPost.content,
                status: deletedPost.status
            },
            remainingCount: posts.length,
            deletedAt: new Date().toISOString()
        }, '投稿を削除しました');
    }));

    // ==========================================================================
    // バッチ編集機能
    // ==========================================================================
    
    /**
     * 複数投稿の一括編集
     * PUT /api/batch-edit
     */
    router.put('/batch-edit', asyncHandler(async (req, res) => {
        const { postIds, editData } = req.body;
        
        // バリデーション
        if (!Array.isArray(postIds) || postIds.length === 0) {
            throw new Error('編集対象の投稿IDが指定されていません');
        }
        
        if (postIds.length > 20) {
            throw new Error('一度に編集できる投稿は20件までです');
        }
        
        const results = [];
        const errors = [];
        
        for (const postId of postIds) {
            try {
                const idResult = Validator.validateInteger(postId, '投稿ID');
                if (!idResult.valid) {
                    errors.push(`ID ${postId}: ${idResult.error}`);
                    continue;
                }
                
                // 編集実行
                if (editData.content) {
                    assistantMode.editPostContent(idResult.value, editData.content);
                }
                if (editData.baseTime) {
                    assistantMode.editPostTime(idResult.value, editData.baseTime, editData.randomMinutes);
                }
                if (editData.datePattern) {
                    assistantMode.editPostPattern(idResult.value, editData.datePattern);
                }
                
                results.push(idResult.value);
                
            } catch (error) {
                errors.push(`ID ${postId}: ${error.message}`);
            }
        }
        
        // キャッシュクリア
        upcomingPosts.clearCache();
        
        Logger.processComplete('一括編集', `成功: ${results.length}件, エラー: ${errors.length}件`);
        
        sendSuccess(res, {
            success: results,
            errors: errors,
            totalProcessed: postIds.length,
            successCount: results.length,
            errorCount: errors.length,
            batchEditedAt: new Date().toISOString()
        }, `${results.length}件の投稿を一括編集しました`);
    }));
    
    // ==========================================================================
    // 投稿検証・統計機能
    // ==========================================================================
    
    /**
     * 投稿データ検証
     * POST /api/validate-posts
     */
    router.post('/validate-posts', asyncHandler(async (req, res) => {
        const validationResult = assistantMode.validatePostsData();
        
        Logger.processComplete('投稿データ検証', 
            validationResult.valid ? '正常' : `${validationResult.errors.length}件のエラー`);
        
        sendSuccess(res, {
            validation: validationResult,
            validatedAt: new Date().toISOString()
        });
    }));
    
    /**
     * 手動投稿統計取得
     * GET /api/manual-stats
     */
    router.get('/manual-stats', asyncHandler(async (req, res) => {
        const stats = assistantMode.getManualPostStats();
        
        sendSuccess(res, {
            stats: stats,
            retrievedAt: new Date().toISOString()
        });
    }));
    
    /**
     * 投稿効率分析
     * GET /api/posting-efficiency
     */
    router.get('/posting-efficiency', asyncHandler(async (req, res) => {
        const analysis = assistantMode.analyzePostingEfficiency();
        
        sendSuccess(res, {
            analysis: analysis,
            analyzedAt: new Date().toISOString()
        });
    }));
    
    // ==========================================================================
    // 検索・フィルタリング機能
    // ==========================================================================
    
    /**
     * 投稿検索
     * GET /api/search-posts
     */
    router.get('/search-posts', asyncHandler(async (req, res) => {
        const { q: query, status, datePattern, timeStart, timeEnd } = req.query;
        
        const filters = {};
        if (status) filters.status = status;
        if (datePattern) filters.datePattern = datePattern;
        if (timeStart && timeEnd) {
            filters.timeRange = { start: timeStart, end: timeEnd };
        }
        
        const searchResult = assistantMode.searchPosts(query, filters);
        
        Logger.processComplete('投稿検索', `${searchResult.totalFound}件見つかりました`);
        
        sendSuccess(res, searchResult);
    }));

    // ==========================================================================
    // v1.11 クイック投稿追加機能（NEW）
    // ==========================================================================

    /**
     * クイック投稿追加
     * POST /api/quick-add-post
     */
    router.post('/quick-add-post', asyncHandler(async (req, res) => {
        const { content, baseTime, datePattern, randomMinutes } = req.body;
        
        // 統一バリデーション使用
        const contentResult = Validator.validatePostContent(content, { required: true });
        if (!handleValidationResult(res, contentResult)) return;
        
        const timeResult = Validator.validateTimeFormat(baseTime);
        if (!handleValidationResult(res, timeResult)) return;
        
        const patternResult = Validator.validateDatePattern(datePattern);
        if (!handleValidationResult(res, patternResult)) return;
        
        const randomResult = Validator.validateRandomMinutes(randomMinutes || 0);
        if (!handleValidationResult(res, randomResult)) return;
        
        // 新しいIDを生成
        const posts = assistantMode.getPosts();
        const newId = posts.length > 0 ? Math.max(...posts.map(p => p.id)) + 1 : 1;
        
        // 新投稿テンプレートを作成
        const newPostTemplate = {
            content: contentResult.value,
            baseTime: timeResult.value,
            datePattern: patternResult.value,
            randomMinutes: randomResult.value
        };
        
        // PostEditorのcreateFromTemplateを使用
        const newPost = assistantMode.postEditor.createFromTemplate(newPostTemplate);
        
        // 自動で予約中に設定
        assistantMode.changePostStatus(newPost.id, '予約中');
        
        // キャッシュクリア
        upcomingPosts.clearCache();
        
        Logger.postAction('📝 クイック投稿追加', newPost.id, newPost.content, 
            `時刻: ${timeResult.value} ±${randomResult.value}分, パターン: ${patternResult.value}`);
        
        const nextTimeJST = newPost.nextPostTime ? 
            new Date(newPost.nextPostTime).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '計算中';
        
        sendSuccess(res, {
            post: {
                id: newPost.id,
                content: newPost.content,
                baseTime: newPost.baseTime,
                randomMinutes: newPost.randomMinutes,
                datePattern: newPost.datePattern,
                status: newPost.status,
                nextPostTime: newPost.nextPostTime
            },
            nextPostTimeJST: nextTimeJST,
            addedAt: new Date().toISOString()
        }, '投稿を追加しました');
    }));

    // ==========================================================================
    // Yahoo Finance 手動取得機能
    // ==========================================================================

    /**
     * Yahoo Finance 株価手動取得
     * POST /api/fetch-yahoo-stocks
     */
    router.post('/fetch-yahoo-stocks', asyncHandler(async (req, res) => {
        Logger.processStart('Yahoo Finance 手動取得開始');
        
        try {
            // FinanceAPI の Yahoo 取得メソッドを直接呼び出し
            const stockData = await dependencies.financeAPI.fetchStockDataFromYahooJP();
            
            if (stockData) {
                // 取得成功: ConfigManager に保存
                dependencies.configManager.saveStockData(stockData);
                
                Logger.apiSuccess('Yahoo Finance 手動取得', 
                    `日経: ${stockData.nikkei}, TOPIX: ${stockData.topix}`);
                
                sendSuccess(res, {
                    stockData: {
                        nikkei: stockData.nikkei,
                        topix: stockData.topix,
                        lastUpdated: stockData.lastUpdated,
                        source: stockData.source,
                        status: stockData.status
                    },
                    fetchedAt: new Date().toISOString(),
                    manual: true
                }, 'Yahoo Finance 株価取得完了');
                
            } else {
                throw new Error('Yahoo Finance からデータを取得できませんでした');
            }
            
        } catch (error) {
            Logger.apiError('Yahoo Finance 手動取得', error);
            
            // エラー時は既存の保存データを返す
            const existingData = dependencies.configManager.getStoredStockData();
            
            if (existingData) {
                Logger.processComplete('既存データを返却', 
                    `日経: ${existingData.nikkei}, TOPIX: ${existingData.topix}`);
                
                sendSuccess(res, {
                    stockData: existingData,
                    error: error.message,
                    fromCache: true,
                    fetchedAt: new Date().toISOString()
                }, 'Yahoo Finance 取得失敗 - 既存データを返却');
            } else {
                throw error;
            }
        }
    }));

    /**
     * 保存済み株価データ取得
     * GET /api/get-stored-stock-data
     */
    router.get('/get-stored-stock-data', asyncHandler(async (req, res) => {
        const stockData = dependencies.configManager.getStoredStockData();
        
        if (stockData) {
            sendSuccess(res, {
                stockData: stockData,
                retrievedAt: new Date().toISOString()
            }, '保存済み株価データ取得完了');
        } else {
            sendSuccess(res, {
                stockData: null,
                message: '保存済み株価データはありません'
            }, '保存済み株価データなし');
        }
    }));
    
    return router;
};