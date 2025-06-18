/**
 * 動的変数処理専用モジュール（リファクタリング版）
 * 投稿内容の動的変数処理・条件付きブロック処理を担当
 * 重複ログを削除し、統一サービスを使用
 */

const Utils = require('../utils/Utils');
const Logger = require('../utils/Logger');
const WeatherAPI = require('./WeatherAPI');
const FinanceAPI = require('./FinanceAPI');

class DynamicProcessor {
    constructor(configManager) {
        this.configManager = configManager;
        this.weatherAPI = new WeatherAPI(configManager);
        this.financeAPI = new FinanceAPI(configManager);
        Logger.moduleInit('動的変数処理');
    }

    // ==========================================================================
    // メイン動的変数処理
    // ==========================================================================

    /**
     * 動的変数処理（完全版）
     */
    async processDynamicContent(content) {
        let processedContent = content;
        
        Logger.processStart('動的変数処理', `"${Utils.safeTruncate(content, 50)}..."`);
        
        const now = new Date();
        const variables = Utils.getBasicVariables(now);
        
        // 基本的な日時変数の置換
        for (const [variable, value] of Object.entries(variables)) {
            const escapedVariable = variable.replace(/[{}]/g, '\\$&');
            const beforeReplace = processedContent;
            processedContent = processedContent.replace(new RegExp(escapedVariable, 'g'), value);
            if (beforeReplace !== processedContent) {
                Logger.processComplete('日時変数置換', `${variable} -> ${value}`);
            }
        }
        
        let weatherData = null;
        // 天気関連変数が含まれている場合のみAPI呼び出し
        if (this.weatherAPI.hasWeatherVariables(processedContent)) {
            try {
                Logger.processStart('天気データ取得');
                weatherData = await this.weatherAPI.getWeatherInfo();
                if (weatherData) {
                    this.weatherAPI.applyWeatherVariables(variables, weatherData);
                    Logger.processComplete('天気データ置換');
                } else {
                    Logger.warn('天気データ取得', '失敗');
                }
            } catch (error) {
                Logger.apiError('天気情報取得', error);
            }
        }
        
        let financeData = null;
        // 金融関連変数が含まれている場合のみAPI呼び出し
        if (this.financeAPI.hasFinanceVariables(processedContent)) {
            try {
                Logger.processStart('金融データ取得');
                financeData = await this.financeAPI.getFinanceInfo();
                if (financeData) {
                    this.financeAPI.applyFinanceVariables(variables, financeData);
                    Logger.processComplete('金融データ取得', 
                        `日経: ${variables['{NIKKEI}']}, USD/JPY: ${variables['{USDJPY}']}`);
                } else {
                    Logger.warn('金融データ取得', '失敗 - デフォルト値を使用');
                    this.financeAPI.applyDefaultFinanceVariables(variables);
                }
            } catch (error) {
                Logger.apiError('金融情報取得', error);
                this.financeAPI.applyErrorFinanceVariables(variables);
            }
        }
        
        // 全変数の置換実行
        for (const [variable, value] of Object.entries(variables)) {
            if (processedContent.includes(variable)) {
                const escapedVariable = variable.replace(/[{}]/g, '\\$&');
                const beforeReplace = processedContent;
                processedContent = processedContent.replace(new RegExp(escapedVariable, 'g'), value);
                if (beforeReplace !== processedContent) {
                    Logger.processComplete('変数置換', `${variable} -> ${value}`);
                }
            }
        }
        
        // 条件付きブロックの処理
        processedContent = this.processConditionalBlocks(processedContent, variables, weatherData, financeData);
        
        Logger.processComplete('動的変数処理', `"${Utils.safeTruncate(processedContent, 100)}..."`);
        return processedContent;
    }

    // ==========================================================================
    // 基本変数処理（軽量版）
    // ==========================================================================

    /**
     * 基本的な動的変数のみ処理（API呼び出しなし）
     */
    async processBasicDynamicContent(content) {
        let processedContent = content;
        
        const now = new Date();
        const variables = Utils.getBasicVariables(now);
        
        // 基本変数の置換
        for (const [variable, value] of Object.entries(variables)) {
            const escapedVariable = variable.replace(/[{}]/g, '\\$&');
            processedContent = processedContent.replace(new RegExp(escapedVariable, 'g'), value);
        }
        
        // API系変数はプレースホルダーとして表示
        const apiVariables = this.getAPIPlaceholders();
        
        for (const [variable, placeholder] of Object.entries(apiVariables)) {
            const escapedVariable = variable.replace(/[{}]/g, '\\$&');
            processedContent = processedContent.replace(new RegExp(escapedVariable, 'g'), placeholder);
        }
        
        return processedContent;
    }

    /**
     * APIプレースホルダーを取得
     */
    getAPIPlaceholders() {
        return {
            '{WEATHER}': '[天気情報]',
            '{TEMP}': '[気温]',
            '{TEMP_MAX}': '[最高気温]',
            '{HUMIDITY}': '[湿度]',
            '{WIND_SPEED}': '[風速]',
            '{PRESSURE}': '[気圧]',
            '{CLOUDINESS}': '[雲量]',
            '{CITY}': '[都市名]',
            '{NIKKEI}': '[日経平均]',
            '{TOPIX}': '[TOPIX]',
            '{DOW}': '[NYダウ]',
            '{NASDAQ}': '[NASDAQ]',
            '{SP500}': '[S&P500]',
            '{USDJPY}': '[USD/JPY]',
            '{EURJPY}': '[EUR/JPY]',
            '{UpdateTime}': '[更新時刻]'
        };
    }

    // ==========================================================================
    // 条件付きブロック処理
    // ==========================================================================

    /**
     * 条件付きブロック処理
     */
    processConditionalBlocks(content, variables, weatherData, financeData) {
        const conditionalPattern = /\[([^\]]*)\]/g;
        
        return content.replace(conditionalPattern, (match, innerContent) => {
            Logger.processStart('条件付きブロック処理', `"${innerContent}"`);
            
            const variablesInBlock = innerContent.match(/\{[^}]+\}/g) || [];
            
            let shouldInclude = true;
            let processedBlock = innerContent;
            
            for (const variable of variablesInBlock) {
                if (variables[variable]) {
                    const escapedVariable = variable.replace(/[{}]/g, '\\$&');
                    processedBlock = processedBlock.replace(new RegExp(escapedVariable, 'g'), variables[variable]);
                    Logger.processComplete('変数置換', `${variable} -> ${variables[variable]}`);
                } else {
                    const isWeatherVar = ['{WEATHER}', '{TEMP}', '{TEMP_MAX}', '{HUMIDITY}'].includes(variable);
                    const isFinanceVar = ['{NIKKEI}', '{TOPIX}', '{DOW}', '{NASDAQ}', '{SP500}', '{USDJPY}', '{EURJPY}'].includes(variable);
                    
                    if (isWeatherVar && !weatherData) {
                        Logger.processSkip('天気データ未取得のため除外', variable);
                        shouldInclude = false;
                        break;
                    } else if (isFinanceVar && !financeData) {
                        Logger.processSkip('金融データ未取得のため除外', variable);
                        shouldInclude = false;
                        break;
                    }
                }
            }
            
            if (shouldInclude) {
                Logger.processComplete('条件付きブロック採用', `"${processedBlock}"`);
                return processedBlock;
            } else {
                Logger.processSkip('条件付きブロック除外', `"${innerContent}"`);
                return '';
            }
        });
    }

    // ==========================================================================
    // 変数検証・チェック
    // ==========================================================================

    /**
     * 動的変数の存在チェック
     */
    hasDynamicVariables(content) {
        const allVariables = [
            // 基本変数
            '{NOW}', '{DATE}', '{TIME}', '{WEEKDAY}', '{YEAR}', '{MONTH}', '{DAY}', '{HOUR}', '{MINUTE}',
            // 天気変数
            '{WEATHER}', '{TEMP}', '{TEMP_MAX}', '{HUMIDITY}', '{WIND_SPEED}', '{PRESSURE}', '{CLOUDINESS}', '{CITY}',
            // 金融変数
            '{NIKKEI}', '{TOPIX}', '{DOW}', '{NASDAQ}', '{SP500}', '{USDJPY}', '{EURJPY}', '{UpdateTime}'
        ];
        
        return allVariables.some(variable => content.includes(variable));
    }

    /**
     * 使用されている変数の一覧を取得
     */
    getUsedVariables(content) {
        const allVariables = [
            '{NOW}', '{DATE}', '{TIME}', '{WEEKDAY}', '{YEAR}', '{MONTH}', '{DAY}', '{HOUR}', '{MINUTE}',
            '{WEATHER}', '{TEMP}', '{TEMP_MAX}', '{HUMIDITY}', '{WIND_SPEED}', '{PRESSURE}', '{CLOUDINESS}', '{CITY}',
            '{NIKKEI}', '{TOPIX}', '{DOW}', '{NASDAQ}', '{SP500}', '{USDJPY}', '{EURJPY}', '{UpdateTime}'
        ];
        
        const usedVariables = allVariables.filter(variable => content.includes(variable));
        
        return {
            all: usedVariables,
            basic: usedVariables.filter(v => ['{NOW}', '{DATE}', '{TIME}', '{WEEKDAY}', '{YEAR}', '{MONTH}', '{DAY}', '{HOUR}', '{MINUTE}'].includes(v)),
            weather: usedVariables.filter(v => ['{WEATHER}', '{TEMP}', '{TEMP_MAX}', '{HUMIDITY}', '{WIND_SPEED}', '{PRESSURE}', '{CLOUDINESS}', '{CITY}'].includes(v)),
            finance: usedVariables.filter(v => ['{NIKKEI}', '{TOPIX}', '{DOW}', '{NASDAQ}', '{SP500}', '{USDJPY}', '{EURJPY}', '{UpdateTime}'].includes(v))
        };
    }

    // ==========================================================================
    // プレビュー・ドライラン機能
    // ==========================================================================

    /**
     * 動的変数処理のドライラン
     */
    async dryRunProcessing(content) {
        Logger.processStart('動的変数処理ドライラン');
        
        try {
            const processedContent = await this.processDynamicContent(content);
            
            const usedVariables = this.getUsedVariables(content);
            
            Logger.processComplete('ドライラン', '成功');
            
            return {
                success: true,
                originalContent: content,
                processedContent: processedContent,
                usedVariables: usedVariables,
                characterCount: processedContent.length,
                withinLimit: processedContent.length <= 280,
                processedAt: new Date().toISOString()
            };
            
        } catch (error) {
            Logger.apiError('ドライラン', error);
            return {
                success: false,
                error: error.message,
                originalContent: content
            };
        }
    }

    /**
     * 変数処理統計を取得
     */
    getProcessingStats() {
        return {
            weatherAPI: {
                configured: this.weatherAPI.isConfigured(),
                lastUsed: null // 実装時に追加
            },
            financeAPI: {
                configured: this.financeAPI.isConfigured(),
                lastUsed: null // 実装時に追加
            },
            timestamp: Utils.formatJST()
        };
    }
}

module.exports = DynamicProcessor;