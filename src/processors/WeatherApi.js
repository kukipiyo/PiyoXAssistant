/**
 * 天気API処理モジュール（リファクタリング版）
 * OpenWeatherMap APIからの天気情報取得を担当
 * 重複ログを削除し、統一サービスを使用
 */

const Utils = require('../utils/Utils');
const Logger = require('../utils/Logger');

class WeatherAPI {
    constructor(configManager) {
        this.configManager = configManager;
        Logger.moduleInit('天気API処理');
    }

    // ==========================================================================
    // 天気情報取得
    // ==========================================================================

    /**
     * 天気情報を取得
     */
    async getWeatherInfo() {
        const config = this.configManager.loadConfig();
        const API_KEY = config.weatherApiKey;
        
        if (!API_KEY) {
            Logger.warn('天気API', 'OpenWeatherMap APIキーが設定されていません');
            return null;
        }
        
        try {
            const city = 'Tokyo';
            const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=metric&lang=ja`;
            
            Logger.processStart('OpenWeatherMap API呼び出し');
            
            const response = await Utils.fetchWithRetry(url, {}, 3, 1000);
            
            if (!response) {
                throw new Error('APIレスポンスが空です');
            }
            
            const weatherInfo = this.parseWeatherResponse(response);
            
            Logger.apiSuccess('天気情報取得', weatherInfo.description);
            return weatherInfo;
            
        } catch (error) {
            Logger.apiError('OpenWeatherMap API取得', error);
            return null;
        }
    }

    /**
     * APIレスポンスを解析して必要な情報を抽出
     */
    parseWeatherResponse(data) {
        try {
            return {
                description: data.weather[0].description || '不明',
                temp: Math.round(data.main.temp) + '°C',
                temp_max: Math.round(data.main.temp_max) + '°C',
                humidity: data.main.humidity + '%',
                pressure: data.main.pressure + 'hPa',
                windSpeed: data.wind?.speed ? Math.round(data.wind.speed * 10) / 10 + 'm/s' : '不明',
                cloudiness: data.clouds?.all ? data.clouds.all + '%' : '不明',
                cityName: data.name || 'Tokyo',
                country: data.sys?.country || 'JP',
                timestamp: Utils.formatJST()
            };
        } catch (error) {
            Logger.apiError('天気データ解析', error);
            throw new Error(`天気データの解析に失敗: ${error.message}`);
        }
    }

    /**
     * 天気変数をオブジェクトに適用
     */
    applyWeatherVariables(variables, weatherData) {
        if (!weatherData) {
            // 天気データが取得できない場合のデフォルト値
            variables['{WEATHER}'] = '晴れ';
            variables['{TEMP}'] = '25°C';
            variables['{TEMP_MAX}'] = '28°C';
            variables['{HUMIDITY}'] = '60%';
            variables['{WIND_SPEED}'] = '2.0m/s';
            variables['{PRESSURE}'] = '1013hPa';
            variables['{CLOUDINESS}'] = '20%';
            Logger.warn('天気変数適用', '天気データ未取得 - デフォルト値を使用');
            return;
        }

        variables['{WEATHER}'] = weatherData.description;
        variables['{TEMP}'] = weatherData.temp;
        variables['{TEMP_MAX}'] = weatherData.temp_max;
        variables['{HUMIDITY}'] = weatherData.humidity;
        variables['{WIND_SPEED}'] = weatherData.windSpeed;
        variables['{PRESSURE}'] = weatherData.pressure;
        variables['{CLOUDINESS}'] = weatherData.cloudiness;
        variables['{CITY}'] = weatherData.cityName;
        
        Logger.processComplete('天気変数適用', `${variables['{WEATHER}']} ${variables['{TEMP}']}`);
    }

    /**
     * 天気関連変数が含まれているかチェック
     */
    hasWeatherVariables(content) {
        const weatherVariables = [
            '{WEATHER}', '{TEMP}', '{TEMP_MAX}', '{HUMIDITY}',
            '{WIND_SPEED}', '{PRESSURE}', '{CLOUDINESS}', '{CITY}'
        ];
        
        return weatherVariables.some(variable => content.includes(variable));
    }

    /**
     * 天気変数のプレースホルダーを取得
     */
    getWeatherPlaceholders() {
        return {
            '{WEATHER}': '[天気情報]',
            '{TEMP}': '[気温]',
            '{TEMP_MAX}': '[最高気温]',
            '{HUMIDITY}': '[湿度]',
            '{WIND_SPEED}': '[風速]',
            '{PRESSURE}': '[気圧]',
            '{CLOUDINESS}': '[雲量]',
            '{CITY}': '[都市名]'
        };
    }

    // ==========================================================================
    // キャッシュ機能（将来の拡張用）
    // ==========================================================================

    /**
     * 天気データのキャッシュ管理
     */
    getCachedWeatherData() {
        // 将来的にキャッシュ機能を実装する場合
        // 現在は実装なし
        return null;
    }

    /**
     * 天気データをキャッシュに保存
     */
    setCachedWeatherData(weatherData) {
        // 将来的にキャッシュ機能を実装する場合
        // 現在は実装なし
    }

    // ==========================================================================
    // 設定・状態管理
    // ==========================================================================

    /**
     * API設定状態を確認
     */
    isConfigured() {
        const config = this.configManager.loadConfig();
        return !!config.weatherApiKey;
    }

    /**
     * APIキーの設定
     */
    setApiKey(apiKey) {
        this.configManager.saveConfig({ weatherApiKey: apiKey });
        Logger.configOperation('天気APIキー設定', '完了');
    }

    /**
     * APIテスト実行
     */
    async testAPI() {
        Logger.processStart('天気API接続テスト');
        
        if (!this.isConfigured()) {
            return {
                success: false,
                error: 'APIキーが設定されていません'
            };
        }
        
        try {
            const weatherData = await this.getWeatherInfo();
            
            if (weatherData) {
                Logger.apiSuccess('天気API接続テスト');
                return {
                    success: true,
                    data: weatherData,
                    message: '天気API接続成功'
                };
            } else {
                return {
                    success: false,
                    error: '天気データの取得に失敗しました'
                };
            }
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ==========================================================================
    // 多地点対応（将来の拡張用）
    // ==========================================================================

    /**
     * 指定都市の天気情報を取得
     */
    async getWeatherByCity(cityName) {
        const config = this.configManager.loadConfig();
        const API_KEY = config.weatherApiKey;
        
        if (!API_KEY) {
            throw new Error('APIキーが設定されていません');
        }
        
        try {
            const url = `https://api.openweathermap.org/data/2.5/weather?q=${cityName}&appid=${API_KEY}&units=metric&lang=ja`;
            const response = await Utils.fetchWithRetry(url);
            return this.parseWeatherResponse(response);
        } catch (error) {
            Logger.apiError(`${cityName}の天気取得`, error);
            throw error;
        }
    }

    /**
     * 座標指定で天気情報を取得
     */
    async getWeatherByCoordinates(lat, lon) {
        const config = this.configManager.loadConfig();
        const API_KEY = config.weatherApiKey;
        
        if (!API_KEY) {
            throw new Error('APIキーが設定されていません');
        }
        
        try {
            const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=ja`;
            const response = await Utils.fetchWithRetry(url);
            return this.parseWeatherResponse(response);
        } catch (error) {
            Logger.apiError(`座標(${lat}, ${lon})の天気取得`, error);
            throw error;
        }
    }
}

module.exports = WeatherAPI;