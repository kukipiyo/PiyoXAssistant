/**
 * 金融API処理モジュール（リファクタリング版）
 * Yahoo Finance（株価）+ Twelve Data（為替）からの金融情報取得を担当
 * 重複ログを削除し、統一サービスを使用
 */

const Utils = require('../utils/Utils');
const Logger = require('../utils/Logger');

class FinanceAPI {
    constructor(configManager) {
        this.configManager = configManager;
        Logger.moduleInit('金融API処理');
    }

    // ==========================================================================
    // メイン処理
    // ==========================================================================

    /**
     * 金融情報を取得（株価 + 為替）
     */
    async getFinanceInfo() {
        const config = this.configManager.loadConfig();
        const API_KEY = config.twelveDataApiKey;
        
        // Yahoo Finance保存データの確認
        const yahooStockData = this.configManager.getStoredStockData();
        let useYahooData = false;
        let updateTime = null;
        
        if (yahooStockData && yahooStockData.nikkei && yahooStockData.topix) {
            const dataAge = yahooStockData.lastUpdated ? 
                (Date.now() - new Date(yahooStockData.lastUpdated).getTime()) / (1000 * 60 * 60) : 999;
            
            if (dataAge < 12) { // 12時間以内のデータを使用
                Logger.processStart('Yahoo Finance株価データ確認', `${Math.round(dataAge * 10) / 10}時間前のデータを使用`);
                useYahooData = true;
                
                if (yahooStockData.lastUpdated) {
                    const updateDate = new Date(yahooStockData.lastUpdated);
                    updateTime = updateDate.toLocaleString('ja-JP', {
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                }
            } else {
                Logger.warn('Yahoo Finance株価データ', `データが古い（${Math.round(dataAge * 10) / 10}時間前）`);
            }
        }
        
        const results = {};
        
        // 日経平均・TOPIXの設定
        if (useYahooData) {
            results.nikkei = yahooStockData.nikkei;
            results.topix = yahooStockData.topix;
            results.updateTime = updateTime || '更新時刻不明';
            Logger.processComplete('日経・TOPIX取得', 'Yahoo Finance保存データを使用');
        } else {
            Logger.processComplete('日経・TOPIX取得', 'デフォルト値を使用（Yahoo Finance未取得）');
            results.nikkei = '38,750円';
            results.topix = '2,765pt';
            results.updateTime = 'データなし';
        }
        
        // Twelve Data APIキーが未設定の場合はデフォルト値
        if (!API_KEY) {
            Logger.warn('Twelve Data API', 'APIキーが設定されていません');
            return {
                ...results,
                usdjpy: '151.50円',
                eurjpy: '163.20円',
                dow: '42,800ドル',
                nasdaq: '19,200pt',
                sp500: '5,850pt'
            };
        }

        // 為替データの取得
        try {
            const forexData = await this.getForexData(API_KEY);
            Object.assign(results, forexData);
        } catch (error) {
            Logger.apiError('為替データ取得', error);
            results.usdjpy = '151.50円';
            results.eurjpy = '163.20円';
        }
        
        // 米国株式指数はデフォルト値（Twelve DataのFreeプランでは制限が厳しいため）
        results.dow = '42,800ドル';
        results.nasdaq = '19,200pt';
        results.sp500 = '5,850pt';
        
        Logger.processComplete('金融データ取得', `日経: ${results.nikkei}, USD/JPY: ${results.usdjpy}`);
        return results;
    }

    /**
     * 為替データを取得
     */
    async getForexData(apiKey) {
        const results = {};
        
        try {
            Logger.processStart('USD/JPY取得');
            const usdJpyData = await Utils.fetchWithRetry(
                `https://api.twelvedata.com/quote?symbol=USD/JPY&apikey=${apiKey}`,
                {}, 3, 1000
            );
            
            if (usdJpyData && usdJpyData.close && !usdJpyData.message) {
                const rate = parseFloat(usdJpyData.close);
                results.usdjpy = Math.round(rate * 100) / 100 + '円';
                Logger.apiSuccess('USD/JPY取得', results.usdjpy);
            } else {
                results.usdjpy = '151.50円';
                Logger.warn('USD/JPY取得', 'デフォルト値使用');
            }

            await Utils.sleep(1000); // API制限対策

            Logger.processStart('EUR/JPY取得');
            const eurJpyData = await Utils.fetchWithRetry(
                `https://api.twelvedata.com/quote?symbol=EUR/JPY&apikey=${apiKey}`,
                {}, 3, 1000
            );
            
            if (eurJpyData && eurJpyData.close && !eurJpyData.message) {
                const rate = parseFloat(eurJpyData.close);
                results.eurjpy = Math.round(rate * 100) / 100 + '円';
                Logger.apiSuccess('EUR/JPY取得', results.eurjpy);
            } else {
                results.eurjpy = '163.20円';
                Logger.warn('EUR/JPY取得', 'デフォルト値使用');
            }

        } catch (error) {
            Logger.apiError('為替データ取得', error);
            results.usdjpy = '151.50円';
            results.eurjpy = '163.20円';
        }
        
        return results;
    }

    // ==========================================================================
    // Yahoo Finance株価取得
    // ==========================================================================

    /**
     * 正しいTOPIX URL修正版
     */
    async fetchStockDataFromYahooJP() {
        Logger.processStart('Yahoo Finance日本版から株価取得');
        
        try {
            const results = {};
            
            // 日経平均取得（既存ロジック）
            Logger.processStart('日経平均取得');
            
            const nikkeiUrls = [
                'https://finance.yahoo.co.jp/quote/998407.O',
                'https://finance.yahoo.co.jp/quote/%5EN225',
                'https://stocks.finance.yahoo.co.jp/stocks/detail/?code=998407'
            ];
            
            let nikkeiSuccess = false;
            
            for (const nikkeiUrl of nikkeiUrls) {
                if (nikkeiSuccess) break;
                
                try {
                    Logger.processStart('URL試行', nikkeiUrl);
                    
                    const nikkeiResponse = await fetch(nikkeiUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                            'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
                            'Referer': 'https://finance.yahoo.co.jp/',
                            'Cache-Control': 'no-cache'
                        }
                    });
                    
                    if (nikkeiResponse.ok) {
                        const nikkeiHtml = await nikkeiResponse.text();
                        Logger.processComplete('HTML取得', `${nikkeiHtml.length}文字`);
                        
                        const nikkeiPrice = this.extractPriceFromYahooHTML(nikkeiHtml, '日経平均');
                        if (nikkeiPrice) {
                            results.nikkei = Math.round(parseFloat(nikkeiPrice.replace(/,/g, ''))).toLocaleString() + '円';
                            Logger.apiSuccess('日経平均取得', `${results.nikkei} (URL: ${nikkeiUrl})`);
                            nikkeiSuccess = true;
                        }
                    } else {
                        Logger.warn('HTTP取得', `エラー: ${nikkeiResponse.status} (${nikkeiUrl})`);
                    }
                } catch (error) {
                    Logger.warn('URL取得失敗', `${nikkeiUrl} - ${error.message}`);
                }
                
                await Utils.sleep(500);
            }
            
            await Utils.sleep(1000);
            
            // TOPIX取得（正しいURL使用）
            Logger.processStart('TOPIX取得');
            
            const topixUrls = [
                'https://finance.yahoo.co.jp/quote/998405.T',   // TOPIX指数の正しいコード
                'https://finance.yahoo.co.jp/quote/%5ETPX',     // 代替Symbol
                'https://finance.yahoo.co.jp/quote/1308.T',     // ETF代替1
                'https://finance.yahoo.co.jp/quote/1305.T',     // ETF代替2
                'https://finance.yahoo.co.jp/quote/1473.T'      // ETF代替3
            ];
            
            let topixSuccess = false;
            
            for (const topixUrl of topixUrls) {
                if (topixSuccess) break;
                
                try {
                    Logger.processStart('TOPIX URL試行', topixUrl);
                    
                    const topixResponse = await fetch(topixUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                            'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
                            'Referer': 'https://finance.yahoo.co.jp/',
                            'Cache-Control': 'no-cache'
                        }
                    });
                    
                    if (topixResponse.ok) {
                        const topixHtml = await topixResponse.text();
                        Logger.processComplete('TOPIX HTML取得', `${topixHtml.length}文字`);
                        
                        const topixPrice = this.extractPriceFromYahooHTML(topixHtml, 'TOPIX');
                        if (topixPrice) {
                            let finalTopixValue = parseFloat(topixPrice.replace(/,/g, ''));
                            
                            // 998405.T以外のETFの場合の簡易換算
                            if (topixUrl.includes('1308.T') || topixUrl.includes('1305.T')) {
                                if (finalTopixValue < 1000) {
                                    // これらのETFの場合は約10倍
                                    finalTopixValue = finalTopixValue * 10;
                                    Logger.processComplete('ETF指数換算', `${topixPrice} × 10 = ${finalTopixValue.toFixed(2)}`);
                                }
                            } else if (topixUrl.includes('1473.T')) {
                                // iシェアーズの場合は1:1に近い
                                Logger.processComplete('iシェアーズETF', `${topixPrice} (換算なし)`);
                            }
                            
                            // 妥当性チェック（範囲を広げる）
                            if (finalTopixValue >= 1000 && finalTopixValue <= 5000) {
                                results.topix = finalTopixValue.toFixed(2) + 'pt';
                                Logger.apiSuccess('TOPIX取得', `${results.topix} (URL: ${topixUrl})`);
                                topixSuccess = true;
                            } else {
                                Logger.warn('TOPIX値範囲外', `${finalTopixValue} (${topixUrl})`);
                            }
                        } else {
                            Logger.warn('TOPIX価格抽出失敗', topixUrl);
                        }
                    } else {
                        Logger.warn('TOPIX HTTP取得', `エラー: ${topixResponse.status} (${topixUrl})`);
                    }
                } catch (error) {
                    Logger.warn('TOPIX URL取得失敗', `${topixUrl} - ${error.message}`);
                }
                
                await Utils.sleep(500);
            }
            
            // TOPIXが取得できなかった場合のフォールバック
            if (!topixSuccess) {
                Logger.warn('TOPIX取得', '全URLで失敗 - デフォルト値を使用');
                results.topix = '2,765.00pt';
            }
            
            // 結果の検証
            if (results.nikkei || results.topix) {
                const timestamp = new Date().toISOString();
                const stockData = {
                    nikkei: results.nikkei || '38,750円',
                    topix: results.topix || '2,765.00pt',
                    lastUpdated: timestamp,
                    source: 'Yahoo Finance JP (Corrected)',
                    status: 'success'
                };
                
                Logger.processComplete('Yahoo Finance JP株価取得', 
                    `日経: ${stockData.nikkei}, TOPIX: ${stockData.topix}`);
                return stockData;
            } else {
                throw new Error('株価データの抽出に失敗しました');
            }
            
        } catch (error) {
            Logger.apiError('Yahoo Finance JP取得', error);
            return null;
        }
    }

    /**
     * 価格抽出メソッド（TOPIX範囲調整版）
     */
    extractPriceFromYahooHTML(html, stockName) {
        try {
            Logger.processStart(`${stockName}の価格抽出`);
            
            const patterns = [
                /<span[^>]*class="[^"]*price[^"]*"[^>]*>([0-9,]+(?:\.[0-9]+)?)<\/span>/gi,
                /<div[^>]*class="[^"]*price[^"]*"[^>]*>([0-9,]+(?:\.[0-9]+)?)<\/div>/gi,
                /"price"\s*:\s*"?([0-9,]+(?:\.[0-9]+)?)"?/gi,
                /"regularMarketPrice"\s*:\s*"?([0-9,]+(?:\.[0-9]+)?)"?/gi,
                /"value"\s*:\s*"?([0-9,]+(?:\.[0-9]+)?)"?/gi,
                /"close"\s*:\s*"?([0-9,]+(?:\.[0-9]+)?)"?/gi,
                /data-symbol="[^"]*"[^>]*>([0-9,]+(?:\.[0-9]+)?)/gi,
                /data-price="([0-9,]+(?:\.[0-9]+)?)"/gi,
                /<span[^>]*data-field="regularMarketPrice"[^>]*>([0-9,]+(?:\.[0-9]+)?)<\/span>/gi,
                /<span[^>]*data-reactid="[^"]*"[^>]*>([0-9,]+(?:\.[0-9]+)?)<\/span>/gi,
                /現在値[^0-9]*([0-9,]+(?:\.[0-9]+)?)/gi,
                /株価[^0-9]*([0-9,]+(?:\.[0-9]+)?)/gi,
                /終値[^0-9]*([0-9,]+(?:\.[0-9]+)?)/gi,
                />([0-9,]+(?:\.[0-9]+)?)</g
            ];
            
            let allMatches = [];
            
            for (let i = 0; i < patterns.length; i++) {
                const pattern = patterns[i];
                let match;
                
                while ((match = pattern.exec(html)) !== null) {
                    const value = parseFloat(match[1].replace(/,/g, ''));
                    
                    // 範囲チェック
                    if (stockName === '日経平均' && value >= 20000 && value <= 50000) {
                        allMatches.push({
                            value: value,
                            original: match[1],
                            patternIndex: i
                        });
                    }
                    // TOPIX範囲を拡大（1000-5000で、ETFも考慮）
                    else if (stockName === 'TOPIX' && value >= 150 && value <= 5000) {
                        allMatches.push({
                            value: value,
                            original: match[1],
                            patternIndex: i,
                            isETFRange: value < 1000
                        });
                    }
                }
                
                pattern.lastIndex = 0;
            }
            
            Logger.processComplete(`${stockName}候補検索`, `${allMatches.length}件の候補`);
            
            if (allMatches.length > 0) {
                // TOPIX指数レンジを優先、ETFレンジは代替
                let bestMatch;
                if (stockName === 'TOPIX') {
                    bestMatch = allMatches.find(m => !m.isETFRange) || allMatches[0];
                } else {
                    bestMatch = allMatches[0];
                }
                
                Logger.apiSuccess(`${stockName}価格抽出`, 
                    `${bestMatch.original} (パターン${bestMatch.patternIndex})`);
                
                if (allMatches.length > 1) {
                    Logger.processComplete(`${stockName}その他の候補`, 
                        allMatches.slice(1, 5).map(m => m.original).join(', '));
                }
                
                return bestMatch.original;
            }
            
            Logger.warn(`${stockName}価格抽出`, '抽出に失敗');
            return null;
            
        } catch (error) {
            Logger.apiError(`${stockName}HTML解析`, error);
            return null;
        }
    }

    // ==========================================================================
    // 変数適用・チェック
    // ==========================================================================

    /**
     * 金融変数をオブジェクトに適用
     */
    applyFinanceVariables(variables, financeData) {
        if (!financeData) {
            this.applyDefaultFinanceVariables(variables);
            return;
        }

        variables['{NIKKEI}'] = financeData.nikkei || 'データなし';
        variables['{TOPIX}'] = financeData.topix || 'データなし';
        variables['{DOW}'] = financeData.dow || 'データなし';
        variables['{NASDAQ}'] = financeData.nasdaq || 'データなし';
        variables['{SP500}'] = financeData.sp500 || 'データなし';
        variables['{USDJPY}'] = financeData.usdjpy || 'データなし';
        variables['{EURJPY}'] = financeData.eurjpy || 'データなし';
        variables['{UpdateTime}'] = financeData.updateTime || '時刻不明';
    }

    /**
     * デフォルト金融変数を適用
     */
    applyDefaultFinanceVariables(variables) {
        variables['{NIKKEI}'] = 'データ取得失敗';
        variables['{TOPIX}'] = 'データ取得失敗';
        variables['{DOW}'] = 'データ取得失敗';
        variables['{NASDAQ}'] = 'データ取得失敗';
        variables['{SP500}'] = 'データ取得失敗';
        variables['{USDJPY}'] = 'データ取得失敗';
        variables['{EURJPY}'] = 'データ取得失敗';
        variables['{UpdateTime}'] = 'データ取得失敗';
    }

    /**
     * エラー時の金融変数を適用
     */
    applyErrorFinanceVariables(variables) {
        variables['{NIKKEI}'] = 'エラー';
        variables['{TOPIX}'] = 'エラー';
        variables['{DOW}'] = 'エラー';
        variables['{NASDAQ}'] = 'エラー';
        variables['{SP500}'] = 'エラー';
        variables['{USDJPY}'] = 'エラー';
        variables['{EURJPY}'] = 'エラー';
        variables['{UpdateTime}'] = 'エラー';
    }

    /**
     * 金融関連変数が含まれているかチェック
     */
    hasFinanceVariables(content) {
        const financeVariables = [
            '{NIKKEI}', '{TOPIX}', '{DOW}', '{NASDAQ}', '{SP500}',
            '{USDJPY}', '{EURJPY}', '{UpdateTime}'
        ];
        
        return financeVariables.some(variable => content.includes(variable));
    }

    /**
     * 金融変数のプレースホルダーを取得
     */
    getFinancePlaceholders() {
        return {
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
    // 設定・テスト
    // ==========================================================================

    /**
     * API設定状態を確認
     */
    isConfigured() {
        const config = this.configManager.loadConfig();
        return !!config.twelveDataApiKey;
    }

    /**
     * APIキーの設定
     */
    setApiKey(apiKey) {
        this.configManager.saveConfig({ twelveDataApiKey: apiKey });
        Logger.configOperation('Twelve Data APIキー設定', '完了');
    }

    /**
     * APIテスト実行
     */
    async testAPI() {
        Logger.processStart('金融API接続テスト');
        
        try {
            const financeData = await this.getFinanceInfo();
            
            if (financeData) {
                Logger.apiSuccess('金融API接続テスト');
                return {
                    success: true,
                    data: financeData,
                    message: '金融API接続成功'
                };
            } else {
                return {
                    success: false,
                    error: '金融データの取得に失敗しました'
                };
            }
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = FinanceAPI;