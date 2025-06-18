/**
 * 統一データサービス
 * 投稿データの保存・読み込み・管理を統一
 */

const Logger = require('./Logger');

class DataService {
    constructor(configManager) {
        this.configManager = configManager;
    }

    // ==========================================================================
    // 投稿データ操作
    // ==========================================================================

    /**
     * 投稿データを保存（統一版）
     */
    savePostsData(posts) {
        try {
            this.configManager.saveConfig({ postsData: posts });
            Logger.dataSave('投稿データ', posts.length);
            return { success: true, count: posts.length };
        } catch (error) {
            Logger.apiError('投稿データ保存', error);
            throw error;
        }
    }

    /**
     * 投稿データを読み込み
     */
    loadPostsData() {
        try {
            const config = this.configManager.loadConfig();
            const posts = config.postsData || [];
            Logger.dataSet('データサービス', posts.length, '投稿データ読み込み');
            return posts;
        } catch (error) {
            Logger.apiError('投稿データ読み込み', error);
            return [];
        }
    }

    /**
     * 投稿データをクリア
     */
    clearPostsData() {
        try {
            this.configManager.saveConfig({ postsData: [] });
            Logger.dataClear('データサービス', '投稿データ');
            return { success: true };
        } catch (error) {
            Logger.apiError('投稿データクリア', error);
            throw error;
        }
    }

    // ==========================================================================
    // 設定データ操作
    // ==========================================================================

    /**
     * API設定を保存
     */
    saveApiConfig(configType, configData) {
        try {
            this.configManager.saveConfig(configData);
            Logger.configOperation('API設定保存', configType);
            return { success: true };
        } catch (error) {
            Logger.apiError(`${configType}設定保存`, error);
            throw error;
        }
    }

    /**
     * 設定状態を取得
     */
    getConfigStatus(posts = []) {
        try {
            const status = this.configManager.getConfigStatus(posts);
            return status;
        } catch (error) {
            Logger.apiError('設定状態取得', error);
            throw error;
        }
    }

    // ==========================================================================
    // データ統計
    // ==========================================================================

    /**
     * データ統計を取得
     */
    getDataStats() {
        try {
            const posts = this.loadPostsData();
            const config = this.getConfigStatus(posts);
            
            return {
                posts: {
                    total: posts.length,
                    scheduled: posts.filter(p => p.status === '予約中').length,
                    posted: posts.filter(p => p.status === '投稿済み' || p.status === '手動投稿済み').length,
                    pending: posts.filter(p => p.status === '未投稿').length
                },
                config: {
                    hasWeatherApi: config.hasWeatherApi,
                    hasTwelveDataApi: config.hasTwelveDataApi,
                    hasTwitterApi: config.hasTwitterApi
                },
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            Logger.apiError('データ統計取得', error);
            throw error;
        }
    }
}

module.exports = DataService;