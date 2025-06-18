/**
 * 投稿制御専用ルート（リファクタリング版）
 * 自動投稿開始・停止・ステータス取得・データ管理を担当
 * 重複エラーハンドリングを削除し、統一ミドルウェアを使用
 */

const express = require('express');
const { asyncHandler, sendSuccess, handleValidationResult } = require('../middleware/errorHandler');
const Logger = require('../utils/Logger');

/**
 * 投稿制御のルートを設定
 * @param {Object} dependencies - 依存性オブジェクト
 * @returns {Router} Express Router
 */
module.exports = function(dependencies) {
    const router = express.Router();
    const { postScheduler, postExecutor, assistantMode, getPosts } = dependencies;
    
    // ==========================================================================
    // 自動投稿制御
    // ==========================================================================
    
    /**
     * 自動投稿開始
     * POST /api/start
     */
    router.post('/start', asyncHandler(async (req, res) => {
        if (postScheduler.assistantMode) {
            throw new Error('投稿補助モードがONです。自動投稿を開始するにはモードを切り替えてください。');
        }
        
        if (!postExecutor.isTwitterAPIReady()) {
            throw new Error('APIキーが設定されていません');
        }
        
        const posts = getPosts();
        if (posts.length === 0) {
            throw new Error('投稿データがありません');
        }
        
        const success = postScheduler.startScheduling();
        if (!success) {
            throw new Error('自動投稿の開始に失敗しました');
        }
        
        Logger.serviceStart('自動投稿', `${posts.length}件の投稿`);
        
        sendSuccess(res, {
            startedAt: new Date().toISOString(),
            postsCount: posts.length
        }, '自動投稿開始');
    }));
    
    /**
     * 投稿停止
     * POST /api/stop
     */
    router.post('/stop', asyncHandler(async (req, res) => {
        const success = postScheduler.stopScheduling();
        if (!success) {
            throw new Error('自動投稿の停止に失敗しました');
        }
        
        Logger.serviceStop('自動投稿');
        
        sendSuccess(res, {
            stoppedAt: new Date().toISOString()
        }, '自動投稿停止');
    }));
    
    // ==========================================================================
    // ステータス・統計
    // ==========================================================================
    
    /**
     * ステータス取得
     * GET /api/status
     */
    router.get('/status', asyncHandler(async (req, res) => {
        const posts = getPosts();
        const stats = require('../utils/Utils').calculatePostStats(posts);
        
        sendSuccess(res, {
            isRunning: postScheduler.isRunning,
            hasTwitterApi: postExecutor.isTwitterAPIReady(),
            assistantMode: postScheduler.assistantMode,
            stats: stats,
            posts: posts,
            timestamp: new Date().toISOString()
        });
    }));
    
    // ==========================================================================
    // 投稿データ管理
    // ==========================================================================
    
    /**
     * 投稿データ保存
     * POST /api/save-posts
     */
    router.post('/save-posts', asyncHandler(async (req, res) => {
        assistantMode.savePostsData();
        
        const posts = getPosts();
        Logger.dataSave('投稿データ', posts.length);
        
        sendSuccess(res, {
            count: posts.length,
            savedAt: new Date().toISOString()
        }, '投稿データを保存しました');
    }));
    
    /**
     * 投稿データクリア
     * POST /api/clear-posts
     */
    router.post('/clear-posts', asyncHandler(async (req, res) => {
        assistantMode.clearPostsData();
        Logger.dataClear('制御ルート', '投稿データ');
        
        sendSuccess(res, {
            clearedAt: new Date().toISOString()
        }, '投稿データをクリアしました');
    }));
    
    /**
     * 投稿一覧取得
     * GET /api/posts
     */
    router.get('/posts', asyncHandler(async (req, res) => {
        const posts = getPosts();
        
        sendSuccess(res, {
            posts: posts,
            count: posts.length,
            timestamp: new Date().toISOString()
        });
    }));
    
    return router;
};