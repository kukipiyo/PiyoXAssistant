/**
 * API設定専用ルート（リファクタリング版）
 * 天気・金融・Twitter API設定・設定状態管理を担当
 * 重複エラーハンドリングを削除し、統一ミドルウェア・バリデーションを使用
 */

const express = require('express');
const { asyncHandler, sendSuccess, handleValidationResult } = require('../middleware/errorHandler');
const Validator = require('../utils/Validator');
const Logger = require('../utils/Logger');

/**
 * API設定のルートを設定
 * @param {Object} dependencies - 依存性オブジェクト
 * @returns {Router} Express Router
 */
module.exports = function(dependencies) {
    const router = express.Router();
    const { configManager, weatherAPI, financeAPI, postExecutor, getPosts } = dependencies;
    
    // ==========================================================================
    // 天気API設定
    // ==========================================================================
    
    /**
     * 天気API設定
     * POST /api/weather-config
     */
    router.post('/weather-config', asyncHandler(async (req, res) => {
        const { weatherApiKey } = req.body;
        
        // 統一バリデーション使用
        const keyResult = Validator.validateApiKey(weatherApiKey, '天気API');
        if (!handleValidationResult(res, keyResult)) return;
        
        weatherAPI.setApiKey(keyResult.value);
        Logger.configOperation('天気APIキー設定', '完了');
        
        sendSuccess(res, {
            configuredAt: new Date().toISOString()
        }, '天気APIキー設定・保存完了');
    }));
    
    // ==========================================================================
    // 金融API設定
    // ==========================================================================
    
    /**
     * Twelve Data API設定
     * POST /api/twelvedata-config
     */
    router.post('/twelvedata-config', asyncHandler(async (req, res) => {
        const { twelveDataApiKey } = req.body;
        
        // 統一バリデーション使用
        const keyResult = Validator.validateApiKey(twelveDataApiKey, 'Twelve Data API');
        if (!handleValidationResult(res, keyResult)) return;
        
        financeAPI.setApiKey(keyResult.value);
        Logger.configOperation('Twelve Data APIキー設定', '完了');
        
        sendSuccess(res, {
            configuredAt: new Date().toISOString()
        }, 'Twelve Data APIキー設定・保存完了');
    }));
    
    // ==========================================================================
    // Twitter API設定
    // ==========================================================================
    
    /**
     * Twitter API設定
     * POST /api/config
     */
    router.post('/config', asyncHandler(async (req, res) => {
        const { bearerToken, apiKey, apiKeySecret, accessToken, accessTokenSecret } = req.body;
        
        if (bearerToken) {
            throw new Error('Bearer Tokenでは投稿できません。OAuth 1.0aキーを使用してください。');
        }
        
        // Twitter APIキー統一バリデーション使用
        const twitterKeys = {
            appKey: apiKey,
            appSecret: apiKeySecret,
            accessToken: accessToken,
            accessSecret: accessTokenSecret
        };
        
        const keysResult = Validator.validateTwitterKeys(twitterKeys);
        if (!handleValidationResult(res, keysResult)) return;
        
        configManager.saveConfig({ twitterKeys });
        postExecutor.reinitializeTwitterAPI();
        
        Logger.configOperation('Twitter API設定', '完了・再初期化済み');
        
        sendSuccess(res, {
            configuredAt: new Date().toISOString(),
            keysConfigured: true
        }, 'Twitter API設定完了・保存しました');
    }));
    
    // ==========================================================================
    // 設定状態管理
    // ==========================================================================
    
    /**
     * 設定状態取得
     * GET /api/config-status
     */
    router.get('/config-status', asyncHandler(async (req, res) => {
        const status = configManager.getConfigStatus(getPosts());
        
        sendSuccess(res, { 
            config: status,
            retrievedAt: new Date().toISOString()
        });
    }));
    
    /**
     * 設定クリア
     * POST /api/clear-config
     */
    router.post('/clear-config', asyncHandler(async (req, res) => {
        configManager.clearConfig();
        
        // API再初期化
        postExecutor.reinitializeTwitterAPI();
        
        Logger.configOperation('全設定クリア', '完了・API再初期化済み');
        
        sendSuccess(res, {
            clearedAt: new Date().toISOString()
        }, '全ての設定をクリアしました');
    }));
    
    // ==========================================================================
    // APIテスト
    // ==========================================================================
    
    /**
     * 天気APIテスト
     * POST /api/test-weather
     */
    router.post('/test-weather', asyncHandler(async (req, res) => {
        const result = await weatherAPI.testAPI();
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        Logger.apiSuccess('天気API接続テスト');
        
        sendSuccess(res, {
            testResult: result,
            testedAt: new Date().toISOString()
        }, '天気API接続テスト成功');
    }));
    
    /**
     * 金融APIテスト
     * POST /api/test-finance
     */
    router.post('/test-finance', asyncHandler(async (req, res) => {
        const result = await financeAPI.testAPI();
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        Logger.apiSuccess('金融API接続テスト');
        
        sendSuccess(res, {
            testResult: result,
            testedAt: new Date().toISOString()
        }, '金融API接続テスト成功');
    }));
    
    /**
     * Twitter APIテスト
     * POST /api/test-twitter
     */
    router.post('/test-twitter', asyncHandler(async (req, res) => {
        const result = await postExecutor.testTwitterConnection();
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        Logger.apiSuccess('Twitter API接続テスト', `@${result.username}`);
        
        sendSuccess(res, {
            testResult: result,
            testedAt: new Date().toISOString()
        }, 'Twitter API接続テスト成功');
    }));
    
    return router;
};