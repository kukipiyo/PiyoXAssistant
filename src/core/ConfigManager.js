/**
 * 設定・暗号化管理モジュール（リファクタリング版）
 * APIキーの暗号化保存・復号化・設定ファイル管理を担当
 * 重複ログを削除し、統一サービスを使用
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Logger = require('../utils/Logger');

class ConfigManager {
    constructor() {
        this.encryptionKey = process.env.ENCRYPTION_KEY || 'x-auto-poster-default-key-change-this';
        this.configPath = path.join(__dirname, '../../config.json');
        
        Logger.moduleInit('設定・暗号化管理');
    }

    // ==========================================================================
    // 暗号化・復号化
    // ==========================================================================

    /**
     * テキストを暗号化
     */
    encrypt(text) {
        if (!text) return null;
        
        try {
            const algorithm = 'aes-256-cbc';
            const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
            const iv = crypto.randomBytes(16);
            
            const cipher = crypto.createCipheriv(algorithm, key, iv);
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            return {
                encrypted: encrypted,
                iv: iv.toString('hex')
            };
        } catch (error) {
            Logger.apiError('暗号化', error);
            return null;
        }
    }

    /**
     * 暗号化データを復号化
     */
    decrypt(encryptedData) {
        if (!encryptedData || !encryptedData.encrypted || !encryptedData.iv) return null;
        
        try {
            const algorithm = 'aes-256-cbc';
            const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
            const iv = Buffer.from(encryptedData.iv, 'hex');
            
            const decipher = crypto.createDecipheriv(algorithm, key, iv);
            let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            Logger.apiError('復号化', error);
            return null;
        }
    }

    // ==========================================================================
    // 設定ファイル管理
    // ==========================================================================

    /**
     * APIキーを暗号化して保存（共通化）
     */
    saveApiKey(config, keyName, keyValue, displayName) {
        if (keyValue) {
            config.apiKeys[keyName] = this.encrypt(keyValue);
            Logger.configOperation(`${displayName}を暗号化して保存`, '完了');
        }
    }

    /**
     * 設定ファイルを保存
     */
    saveConfig(data) {
        try {
            let config = {
                version: '1.0',
                lastUpdated: new Date().toISOString(),
                apiKeys: {},
                postsData: null
            };
            
            // 既存設定の読み込み
            if (fs.existsSync(this.configPath)) {
                try {
                    const existingData = fs.readFileSync(this.configPath, 'utf8');
                    const existingConfig = JSON.parse(existingData);
                    if (existingConfig.apiKeys) {
                        config.apiKeys = { ...existingConfig.apiKeys };
                    }
                    if (existingConfig.postsData) {
                        config.postsData = existingConfig.postsData;
                    }
                    if (existingConfig.stockData) {
                        config.stockData = existingConfig.stockData;
                    }
                    if (existingConfig.rssSettings) {
                        config.rssSettings = existingConfig.rssSettings;
                    }
                } catch (readError) {
                    Logger.warn('設定読み込み', `既存設定読み込みエラー: ${readError.message}`);
                }
            }
            
            // APIキーの保存（共通化済み）
            this.saveApiKey(config, 'weather', data.weatherApiKey, '天気APIキー');
            this.saveApiKey(config, 'twelvedata', data.twelveDataApiKey, 'Twelve Data APIキー');
            
            // Twitter APIキーの保存
            if (data.twitterKeys) {
                const keys = data.twitterKeys;
                if (keys.appKey && keys.appSecret && keys.accessToken && keys.accessSecret) {
                    config.apiKeys.twitter = {
                        appKey: this.encrypt(keys.appKey),
                        appSecret: this.encrypt(keys.appSecret),
                        accessToken: this.encrypt(keys.accessToken),
                        accessSecret: this.encrypt(keys.accessSecret)
                    };
                    Logger.configOperation('Twitter APIキーを暗号化して保存', '完了');
                }
            }
            
            // 投稿データの保存
            if (data.postsData) {
                config.postsData = {
                    posts: data.postsData,
                    savedAt: new Date().toISOString(),
                    count: data.postsData.length
                };
                Logger.dataSave('投稿データ', data.postsData.length);
            }
            
            // 株価データの保存
            if (data.stockData) {
                config.stockData = data.stockData;
            }
            
            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
            Logger.fileOperation('設定ファイル保存完了', this.configPath);
            
        } catch (error) {
            Logger.apiError('設定保存', error);
            throw error;
        }
    }

    /**
     * 設定ファイルを読み込み
     */
    loadConfig() {
        try {
            if (!fs.existsSync(this.configPath)) {
                Logger.processStart('設定ファイル新規作成', 'ファイルが見つかりません');
                return {};
            }
            
            const configData = fs.readFileSync(this.configPath, 'utf8');
            const config = JSON.parse(configData);
            
            Logger.processStart('設定ファイル読み込み中');
            
            const result = {};
            
            // 天気APIキー復元
            if (config.apiKeys?.weather) {
                result.weatherApiKey = this.decrypt(config.apiKeys.weather);
                if (result.weatherApiKey) {
                    Logger.apiSuccess('天気APIキー復元', '完了');
                }
            }
            
            // Twelve Data APIキー復元
            if (config.apiKeys?.twelvedata) {
                result.twelveDataApiKey = this.decrypt(config.apiKeys.twelvedata);
                if (result.twelveDataApiKey) {
                    Logger.apiSuccess('Twelve Data APIキー復元', '完了');
                }
            }
            
            // Twitter APIキー復元
            if (config.apiKeys?.twitter) {
                try {
                    const twitterKeys = config.apiKeys.twitter;
                    
                    const appKey = this.decrypt(twitterKeys.appKey);
                    const appSecret = this.decrypt(twitterKeys.appSecret);
                    const accessToken = this.decrypt(twitterKeys.accessToken);
                    const accessSecret = this.decrypt(twitterKeys.accessSecret);
                    
                    if (appKey && appSecret && accessToken && accessSecret) {
                        result.twitterKeys = {
                            appKey,
                            appSecret,
                            accessToken,
                            accessSecret
                        };
                        Logger.apiSuccess('Twitter APIキー復元', '投稿可能');
                    }
                } catch (twitterError) {
                    Logger.apiError('Twitter APIキー復元', twitterError);
                }
            }
            
            // 投稿データ復元
            if (config.postsData && config.postsData.posts) {
                result.postsData = config.postsData.posts;
                const savedAt = new Date(config.postsData.savedAt).toLocaleString('ja-JP', {
                    timeZone: 'Asia/Tokyo',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                Logger.dataSet('投稿データ復元', result.postsData.length, `保存日時: ${savedAt} JST`);
            }
            
            // 株価データ復元
            if (config.stockData) {
                result.stockData = config.stockData;
            }
            
            Logger.processComplete('設定読み込み', `更新日時: ${config.lastUpdated}`);
            return result;
            
        } catch (error) {
            Logger.apiError('設定読み込み', error);
            return {};
        }
    }

    /**
     * 設定状態を取得
     */
    getConfigStatus(posts = []) {
        const postsInfo = posts.length > 0 ? {
            count: posts.length,
            scheduled: posts.filter(p => p.status === '予約中').length,
            posted: posts.filter(p => p.status === '投稿済み' || p.status === '手動投稿済み').length,
            pending: posts.filter(p => p.status === '未投稿').length
        } : null;
        
        const config = this.loadConfig();
        
        return {
            hasWeatherApi: !!config.weatherApiKey,
            hasTwelveDataApi: !!config.twelveDataApiKey,
            hasTwitterApi: !!config.twitterKeys,
            configFileExists: fs.existsSync(this.configPath),
            configPath: this.configPath,
            postsData: postsInfo
        };
    }

    /**
     * 設定をクリア
     */
    clearConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                fs.unlinkSync(this.configPath);
            }
            Logger.configOperation('全ての設定をクリア', '完了');
        } catch (error) {
            Logger.apiError('設定クリア', error);
            throw error;
        }
    }

    /**
     * 株価データを保存
     */
    saveStockData(stockData) {
        try {
            let config = { version: '1.0', apiKeys: {} };
            
            if (fs.existsSync(this.configPath)) {
                config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
            }
            
            config.stockData = stockData;
            config.lastUpdated = new Date().toISOString();
            
            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
            Logger.dataSave('Yahoo Finance株価データ');
            
        } catch (error) {
            Logger.apiError('Yahoo Finance株価データ保存', error);
            throw error;
        }
    }

    /**
     * 保存済み株価データを取得
     */
    getStoredStockData() {
        try {
            if (fs.existsSync(this.configPath)) {
                const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
                return config.stockData || null;
            }
            return null;
        } catch (error) {
            Logger.apiError('保存済み株価データ読み込み', error);
            return null;
        }
    }

    // ==========================================================================
    // 設定検証・診断
    // ==========================================================================

    /**
     * 設定ファイルの整合性をチェック
     */
    validateConfig() {
        try {
            Logger.processStart('設定ファイル整合性チェック');
            
            if (!fs.existsSync(this.configPath)) {
                return {
                    valid: true,
                    message: '設定ファイルが存在しません（初回実行時は正常）',
                    warnings: []
                };
            }
            
            const configData = fs.readFileSync(this.configPath, 'utf8');
            const config = JSON.parse(configData);
            
            const warnings = [];
            
            // バージョンチェック
            if (!config.version) {
                warnings.push('設定ファイルにバージョン情報がありません');
            }
            
            // APIキー暗号化チェック
            if (config.apiKeys) {
                Object.keys(config.apiKeys).forEach(keyName => {
                    const keyData = config.apiKeys[keyName];
                    if (typeof keyData === 'string') {
                        warnings.push(`${keyName}キーが暗号化されていません`);
                    }
                });
            }
            
            // 投稿データ整合性チェック
            if (config.postsData && !config.postsData.savedAt) {
                warnings.push('投稿データに保存日時情報がありません');
            }
            
            Logger.processComplete('設定ファイル整合性チェック', 
                warnings.length === 0 ? '正常' : `${warnings.length}件の警告`);
            
            return {
                valid: true,
                warnings: warnings,
                config: config
            };
            
        } catch (error) {
            Logger.apiError('設定ファイル整合性チェック', error);
            return {
                valid: false,
                error: error.message
            };
        }
    }

    /**
     * 設定のバックアップを作成
     */
    backupConfig() {
        try {
            if (!fs.existsSync(this.configPath)) {
                Logger.warn('設定バックアップ', '設定ファイルが存在しません');
                return null;
            }
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = this.configPath.replace('.json', `_backup_${timestamp}.json`);
            
            fs.copyFileSync(this.configPath, backupPath);
            
            Logger.fileOperation('設定バックアップ作成', backupPath);
            
            return {
                success: true,
                backupPath: backupPath,
                timestamp: timestamp
            };
            
        } catch (error) {
            Logger.apiError('設定バックアップ作成', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 設定の統計情報を取得
     */
    getConfigStats() {
        try {
            const status = this.getConfigStatus();
            const validation = this.validateConfig();
            
            let fileSize = 0;
            let lastModified = null;
            
            if (fs.existsSync(this.configPath)) {
                const stats = fs.statSync(this.configPath);
                fileSize = stats.size;
                lastModified = stats.mtime;
            }
            
            return {
                hasConfig: status.configFileExists,
                fileSize: fileSize,
                lastModified: lastModified,
                apiStatus: {
                    weather: status.hasWeatherApi,
                    finance: status.hasTwelveDataApi,
                    twitter: status.hasTwitterApi
                },
                validation: validation,
                postsData: status.postsData
            };
            
        } catch (error) {
            Logger.apiError('設定統計取得', error);
            return {
                error: error.message
            };
        }
    }
}

module.exports = ConfigManager;