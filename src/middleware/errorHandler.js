/**
 * 統一エラーハンドラーミドルウェア
 * 全ルートのエラーハンドリングを統一・管理
 */

const Utils = require('../utils/Utils');
const Logger = require('../utils/Logger');

// ==========================================================================
// 非同期ルートハンドラーラッパー
// ==========================================================================

/**
 * 非同期ルートハンドラーをラップしてエラーを自動キャッチ
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// ==========================================================================
// エラー分類・処理
// ==========================================================================

/**
 * エラーのタイプを判定
 */
function classifyError(error) {
    // バリデーションエラー
    if (error.name === 'ValidationError' || error.message.includes('検証') || error.message.includes('形式が不正')) {
        return { type: 'validation', statusCode: 400 };
    }
    
    // 認証エラー
    if (error.name === 'UnauthorizedError' || 
        error.message.includes('APIキー') || 
        error.message.includes('認証') || 
        error.message.includes('権限')) {
        return { type: 'authentication', statusCode: 401 };
    }
    
    // API制限エラー
    if (error.message.includes('API制限') || 
        error.message.includes('rate limit') || 
        error.code === 429) {
        return { type: 'rateLimit', statusCode: 429 };
    }
    
    // ファイルエラー
    if (error.message.includes('ファイル') || 
        error.message.includes('Excel') || 
        error.code === 'ENOENT') {
        return { type: 'file', statusCode: 400 };
    }
    
    // 投稿データエラー
    if (error.message.includes('投稿') || 
        error.message.includes('見つかりません')) {
        return { type: 'postData', statusCode: 404 };
    }
    
    // 設定エラー
    if (error.message.includes('設定') || 
        error.message.includes('config')) {
        return { type: 'config', statusCode: 400 };
    }
    
    // ネットワーク・外部APIエラー
    if (error.code === 'ECONNREFUSED' || 
        error.code === 'ETIMEDOUT' || 
        error.message.includes('fetch') || 
        error.message.includes('API')) {
        return { type: 'network', statusCode: 503 };
    }
    
    // その他のサーバーエラー
    return { type: 'server', statusCode: 500 };
}

/**
 * エラータイプ別のメッセージを生成
 */
function generateErrorMessage(error, classification) {
    const baseMessage = error.message || 'エラーが発生しました';
    
    switch (classification.type) {
        case 'validation':
            return `入力データエラー: ${baseMessage}`;
            
        case 'authentication':
            return `認証エラー: APIキーを確認してください`;
            
        case 'rateLimit':
            return `API制限に達しました。しばらく待ってから再度お試しください`;
            
        case 'file':
            return `ファイル処理エラー: ${baseMessage}`;
            
        case 'postData':
            return `投稿データエラー: ${baseMessage}`;
            
        case 'config':
            return `設定エラー: ${baseMessage}`;
            
        case 'network':
            return `ネットワークエラー: 外部サービスに接続できません`;
            
        case 'server':
        default:
            return `サーバーエラー: ${baseMessage}`;
    }
}

// ==========================================================================
// メインエラーハンドラー
// ==========================================================================

/**
 * 統一エラーハンドラーミドルウェア
 */
const errorHandler = (err, req, res, next) => {
    // エラー分類
    const classification = classifyError(err);
    
    // ログ出力（操作とパスを含む）
    const operation = `${req.method} ${req.path}`;
    Logger.apiError(operation, err, classification.type);
    
    // 開発環境では詳細なスタックトレースも出力
    if (process.env.NODE_ENV === 'development') {
        console.error('📍 Stack Trace:', err.stack);
    }
    
    // レスポンス生成
    const userMessage = generateErrorMessage(err, classification);
    
    // レスポンスデータの構築
    const errorResponse = {
        success: false,
        message: userMessage,
        errorType: classification.type,
        timestamp: new Date().toISOString()
    };
    
    // 開発環境では追加情報を含める
    if (process.env.NODE_ENV === 'development') {
        errorResponse.originalError = err.message;
        errorResponse.path = req.path;
        errorResponse.method = req.method;
    }
    
    // HTTPステータスコードとレスポンス送信
    res.status(classification.statusCode).json(errorResponse);
};

// ==========================================================================
// 特定エラー用ハンドラー
// ==========================================================================

/**
 * 404エラーハンドラー
 */
const notFoundHandler = (req, res, next) => {
    const error = new Error(`ルートが見つかりません: ${req.originalUrl}`);
    error.status = 404;
    next(error);
};

/**
 * マルチパート解析エラーハンドラー（ファイルアップロード用）
 */
const multerErrorHandler = (err, req, res, next) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
        const error = new Error('ファイルサイズが制限を超えています');
        error.status = 400;
        return next(error);
    }
    
    if (err.code === 'LIMIT_FILE_COUNT') {
        const error = new Error('ファイル数が制限を超えています');
        error.status = 400;
        return next(error);
    }
    
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        const error = new Error('予期しないファイルフィールドです');
        error.status = 400;
        return next(error);
    }
    
    next(err);
};

// ==========================================================================
// ルート用ヘルパー
// ==========================================================================

/**
 * 成功レスポンス送信ヘルパー
 */
const sendSuccess = (res, data = {}, message = 'success', statusCode = 200) => {
    res.status(statusCode).json({
        success: true,
        message,
        timestamp: new Date().toISOString(),
        ...data
    });
};

/**
 * エラーレスポンス送信ヘルパー（直接使用用）
 */
const sendError = (res, message, statusCode = 400, errorType = 'client') => {
    res.status(statusCode).json({
        success: false,
        message,
        errorType,
        timestamp: new Date().toISOString()
    });
};

// ==========================================================================
// バリデーションエラー用ヘルパー
// ==========================================================================

/**
 * バリデーション結果をエラーレスポンスに変換
 */
const handleValidationResult = (res, validationResult, context = '') => {
    if (validationResult.valid) {
        return true; // 検証成功
    }
    
    let message = '入力データが無効です';
    
    if (validationResult.error) {
        message = validationResult.error;
    } else if (validationResult.errors && validationResult.errors.length > 0) {
        message = validationResult.errors[0]; // 最初のエラーメッセージを使用
    }
    
    if (context) {
        message = `${context}: ${message}`;
    }
    
    sendError(res, message, 400, 'validation');
    return false; // 検証失敗
};

// ==========================================================================
// Express用設定関数
// ==========================================================================

/**
 * Express アプリにエラーハンドリングを設定
 */
const setupErrorHandling = (app) => {
    // 404ハンドラー（ルートが見つからない場合）
    app.use(notFoundHandler);
    
    // マルチパートエラーハンドラー
    app.use(multerErrorHandler);
    
    // メインエラーハンドラー（最後に設定）
    app.use(errorHandler);
    
    Logger.moduleInit('エラーハンドリングミドルウェア');
};

// ==========================================================================
// エクスポート
// ==========================================================================

module.exports = {
    // メイン機能
    asyncHandler,
    errorHandler,
    notFoundHandler,
    multerErrorHandler,
    setupErrorHandling,
    
    // ヘルパー関数
    sendSuccess,
    sendError,
    handleValidationResult,
    
    // 内部関数（テスト用）
    classifyError,
    generateErrorMessage
};