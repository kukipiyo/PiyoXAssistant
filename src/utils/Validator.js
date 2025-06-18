/**
 * 統一バリデーターサービス
 * 全体のデータ検証処理を統一・管理するサービス
 */

const Utils = require('./Utils');

class Validator {
    // ==========================================================================
    // 基本データ検証
    // ==========================================================================

    /**
     * 投稿内容の検証
     */
    static validatePostContent(content, options = {}) {
        const { required = true, maxLength = 280, minLength = 1 } = options;
        
        if (!content || typeof content !== 'string') {
            if (required) {
                return { valid: false, error: '投稿内容が必要です' };
            }
            return { valid: true };
        }
        
        const trimmed = content.trim();
        
        if (trimmed.length === 0) {
            if (required) {
                return { valid: false, error: '投稿内容が空です' };
            }
            return { valid: true };
        }
        
        if (trimmed.length < minLength) {
            return { valid: false, error: `投稿内容は${minLength}文字以上で入力してください` };
        }
        
        if (trimmed.length > maxLength) {
            return { valid: false, error: `投稿内容は${maxLength}文字以下で入力してください` };
        }
        
        return { valid: true, value: trimmed };
    }

    /**
     * 時刻形式の検証（統一版）
     */
    static validateTimeFormat(time, options = {}) {
        const { throwError = false, returnDefault = false, defaultValue = '09:00' } = options;
        
        if (!time || typeof time !== 'string' || !Utils.isValidTimeFormat(time)) {
            const error = '時刻形式が不正です（HH:MM形式で入力してください）';
            
            if (throwError) {
                throw new Error(error);
            }
            if (returnDefault) {
                return { valid: false, error, value: defaultValue };
            }
            return { valid: false, error };
        }
        
        return { valid: true, value: time };
    }

    /**
     * ランダム分数の検証
     */
    static validateRandomMinutes(minutes, options = {}) {
        const { min = 0, max = 60, defaultValue = 0 } = options;
        
        const num = parseInt(minutes);
        
        if (isNaN(num) || num < min || num > max) {
            return { 
                valid: false, 
                error: `ランダム分数は${min}〜${max}の範囲で指定してください`,
                value: defaultValue 
            };
        }
        
        return { valid: true, value: num };
    }

    /**
     * 日付パターンの検証（毎日対応版）
     */
    static validateDatePattern(pattern, options = {}) {
        const { returnDefault = false, defaultValue = '平日' } = options;
        
        if (!pattern || !Utils.isValidDatePattern(pattern)) {
            if (returnDefault) {
                return { 
                    valid: false, 
                    error: '日付パターンが無効です',
                    value: defaultValue 
                };
            }
            return { valid: false, error: '日付パターンが無効です' };
        }
        
        return { valid: true, value: pattern };
    }

    // ==========================================================================
    // API関連検証
    // ==========================================================================

    /**
     * APIキーの検証
     */
    static validateApiKey(apiKey, keyType = 'API', options = {}) {
        const { minLength = 10, maxLength = 200 } = options;
        
        if (!apiKey || typeof apiKey !== 'string') {
            return { valid: false, error: `${keyType}キーが必要です` };
        }
        
        const trimmed = apiKey.trim();
        
        if (trimmed.length === 0) {
            return { valid: false, error: `${keyType}キーが空です` };
        }
        
        if (trimmed.length < minLength) {
            return { valid: false, error: `${keyType}キーが短すぎます（最低${minLength}文字）` };
        }
        
        if (trimmed.length > maxLength) {
            return { valid: false, error: `${keyType}キーが長すぎます（最大${maxLength}文字）` };
        }
        
        return { valid: true, value: trimmed };
    }

    /**
     * Twitter APIキーセットの検証
     */
    static validateTwitterKeys(keys) {
        const required = ['appKey', 'appSecret', 'accessToken', 'accessSecret'];
        const errors = [];
        
        for (const key of required) {
            if (!keys[key] || typeof keys[key] !== 'string' || keys[key].trim() === '') {
                errors.push(`${key}が必要です`);
            }
        }
        
        if (errors.length > 0) {
            return { valid: false, errors };
        }
        
        return { valid: true };
    }

    // ==========================================================================
    // 投稿データ検証
    // ==========================================================================

    /**
     * 投稿オブジェクトの検証
     */
    static validatePost(post, options = {}) {
        const { requireId = false } = options;
        const errors = [];
        
        // ID検証
        if (requireId && (!post.id || typeof post.id !== 'number')) {
            errors.push('投稿IDが必要です');
        }
        
        // 内容検証
        const contentResult = this.validatePostContent(post.content);
        if (!contentResult.valid) {
            errors.push(contentResult.error);
        }
        
        // 時刻検証
        const timeResult = this.validateTimeFormat(post.baseTime);
        if (!timeResult.valid) {
            errors.push(timeResult.error);
        }
        
        // ランダム分数検証
        if (post.randomMinutes !== undefined) {
            const randomResult = this.validateRandomMinutes(post.randomMinutes);
            if (!randomResult.valid) {
                errors.push(randomResult.error);
            }
        }
        
        // 日付パターン検証
        const patternResult = this.validateDatePattern(post.datePattern);
        if (!patternResult.valid) {
            errors.push(patternResult.error);
        }
        
        // ステータス検証
        const validStatuses = ['未投稿', '予約中', '投稿済み', '手動投稿済み', '投稿失敗', 'スキップ'];
        if (post.status && !validStatuses.includes(post.status)) {
            errors.push(`無効なステータスです: ${post.status}`);
        }
        
        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * 投稿配列の検証
     */
    static validatePostsArray(posts, options = {}) {
        if (!Array.isArray(posts)) {
            return { valid: false, error: '投稿データが配列ではありません' };
        }
        
        const errors = [];
        const warnings = [];
        
        posts.forEach((post, index) => {
            const result = this.validatePost(post, options);
            if (!result.valid) {
                result.errors.forEach(error => {
                    errors.push(`投稿${index + 1}: ${error}`);
                });
            }
        });
        
        // ID重複チェック
        const ids = posts.map(p => p.id).filter(id => id !== undefined);
        const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
        if (duplicateIds.length > 0) {
            errors.push(`重複するIDがあります: ${duplicateIds.join(', ')}`);
        }
        
        return {
            valid: errors.length === 0,
            errors: errors,
            warnings: warnings,
            totalPosts: posts.length
        };
    }

    // ==========================================================================
    // ファイル関連検証
    // ==========================================================================

    /**
     * ファイル形式の検証
     */
    static validateFileType(file, allowedTypes = ['.xlsx', '.xls']) {
        if (!file) {
            return { valid: false, error: 'ファイルが選択されていません' };
        }
        
        const fileName = file.originalname || file.name || '';
        const extension = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
        
        if (!allowedTypes.includes(extension)) {
            return { 
                valid: false, 
                error: `サポートされていないファイル形式です。許可形式: ${allowedTypes.join(', ')}` 
            };
        }
        
        return { valid: true };
    }

    /**
     * ファイルサイズの検証
     */
    static validateFileSize(file, maxSize = 10 * 1024 * 1024) { // 10MB
        if (!file) {
            return { valid: false, error: 'ファイルが選択されていません' };
        }
        
        const size = file.size;
        if (size > maxSize) {
            const maxSizeMB = Math.round(maxSize / (1024 * 1024));
            return { 
                valid: false, 
                error: `ファイルサイズが大きすぎます（最大${maxSizeMB}MB）` 
            };
        }
        
        return { valid: true };
    }

    // ==========================================================================
    // 数値・範囲検証
    // ==========================================================================

    /**
     * 数値範囲の検証
     */
    static validateRange(value, min, max, fieldName = '値') {
        const num = parseFloat(value);
        
        if (isNaN(num)) {
            return { valid: false, error: `${fieldName}は数値である必要があります` };
        }
        
        if (num < min || num > max) {
            return { 
                valid: false, 
                error: `${fieldName}は${min}〜${max}の範囲で指定してください` 
            };
        }
        
        return { valid: true, value: num };
    }

    /**
     * 整数の検証
     */
    static validateInteger(value, fieldName = '値') {
        const num = parseInt(value);
        
        if (isNaN(num) || !Number.isInteger(num)) {
            return { valid: false, error: `${fieldName}は整数である必要があります` };
        }
        
        return { valid: true, value: num };
    }

    // ==========================================================================
    // ユーティリティ
    // ==========================================================================

    /**
     * 複数の検証結果をまとめる
     */
    static combineResults(results) {
        const errors = [];
        const warnings = [];
        let valid = true;
        
        results.forEach(result => {
            if (!result.valid) {
                valid = false;
                if (result.error) {
                    errors.push(result.error);
                }
                if (result.errors) {
                    errors.push(...result.errors);
                }
            }
            if (result.warnings) {
                warnings.push(...result.warnings);
            }
        });
        
        return {
            valid: valid,
            errors: errors,
            warnings: warnings
        };
    }

    /**
     * エラーメッセージのフォーマット
     */
    static formatErrors(errors, prefix = '') {
        if (!Array.isArray(errors) || errors.length === 0) {
            return '';
        }
        
        return errors.map(error => `${prefix}${error}`).join('\n');
    }
}

module.exports = Validator;