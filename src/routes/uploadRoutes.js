/**
 * ファイル処理専用ルート（リファクタリング版）
 * Excelファイルアップロード・ファイル管理を担当
 * 重複エラーハンドリングを削除し、統一ミドルウェア・バリデーションを使用
 */

const express = require('express');
const fs = require('fs');
const multer = require('multer');
const { asyncHandler, sendSuccess, handleValidationResult } = require('../middleware/errorHandler');
const Validator = require('../utils/Validator');
const Logger = require('../utils/Logger');

// アップロード設定
const upload = multer({ dest: 'uploads/' });

/**
 * ファイル処理のルートを設定
 * @param {Object} dependencies - 依存性オブジェクト
 * @returns {Router} Express Router
 */
module.exports = function(dependencies) {
    const router = express.Router();
    const { excelParser, configManager, setPosts } = dependencies;
    
    // ==========================================================================
    // Excelファイル処理
    // ==========================================================================
    
    /**
     * Excelファイルアップロード
     * POST /api/upload
     */
    router.post('/upload', upload.single('excel'), asyncHandler(async (req, res) => {
        if (!req.file) {
            throw new Error('ファイルが選択されていません');
        }
        
        // 統一バリデーション使用
        const fileTypeResult = Validator.validateFileType(req.file, ['.xlsx', '.xls']);
        if (!handleValidationResult(res, fileTypeResult)) {
            // エラー時の一時ファイル削除
            cleanupTempFile(req.file.path);
            return;
        }
        
        const fileSizeResult = Validator.validateFileSize(req.file, 10 * 1024 * 1024); // 10MB
        if (!handleValidationResult(res, fileSizeResult)) {
            // エラー時の一時ファイル削除
            cleanupTempFile(req.file.path);
            return;
        }
        
        Logger.fileOperation('Excelファイル受信', req.file.originalname, `${req.file.size} bytes`);
        
        try {
            const result = excelParser.loadExcelFile(req.file.path);
            
            // 投稿データを設定
            setPosts(result.posts);
            
            // 設定保存
            configManager.saveConfig({ postsData: result.posts });
            
            Logger.processComplete('Excelファイル読み込み', '', result.posts.length);
            
            sendSuccess(res, {
                posts: result.posts,
                stats: result.stats,
                uploadedAt: new Date().toISOString(),
                fileName: req.file.originalname,
                fileSize: req.file.size
            }, `${result.posts.length}件の投稿を読み込みました`);
            
        } finally {
            // 一時ファイル削除
            cleanupTempFile(req.file.path);
        }
    }));
    
    // ==========================================================================
    // ファイル検証・プレビュー
    // ==========================================================================
    
    /**
     * Excelファイル検証（アップロードなし）
     * POST /api/validate-excel
     */
    router.post('/validate-excel', upload.single('excel'), asyncHandler(async (req, res) => {
        if (!req.file) {
            throw new Error('ファイルが選択されていません');
        }
        
        // 統一バリデーション使用
        const fileTypeResult = Validator.validateFileType(req.file, ['.xlsx', '.xls']);
        if (!handleValidationResult(res, fileTypeResult)) {
            cleanupTempFile(req.file.path);
            return;
        }
        
        const fileSizeResult = Validator.validateFileSize(req.file, 10 * 1024 * 1024); // 10MB
        if (!handleValidationResult(res, fileSizeResult)) {
            cleanupTempFile(req.file.path);
            return;
        }
        
        Logger.fileOperation('Excelファイル検証', req.file.originalname);
        
        try {
            // ドライラン（実際の保存は行わない）
            const result = excelParser.loadExcelFile(req.file.path);
            
            Logger.processComplete('ファイル検証', '成功');
            
            sendSuccess(res, {
                isValid: true,
                preview: result.posts.slice(0, 5), // 最初の5件のみプレビュー
                stats: result.stats,
                validatedAt: new Date().toISOString(),
                fileName: req.file.originalname
            }, 'ファイル検証完了');
            
        } finally {
            // 一時ファイル削除
            cleanupTempFile(req.file.path);
        }
    }));
    
    return router;
};

// ==========================================================================
// ユーティリティ関数
// ==========================================================================

/**
 * 一時ファイルを安全に削除
 */
function cleanupTempFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            Logger.fileOperation('一時ファイル削除', filePath);
        }
    } catch (error) {
        Logger.apiError('一時ファイル削除', error);
    }
}