/**
 * Excel読み込み処理モジュール（リファクタリング版）
 * Excelファイルの解析・投稿データの生成を担当
 * 重複ログ・バリデーションを削除し、統一サービスを使用
 */

const XLSX = require('xlsx');
const Utils = require('./Utils');
const Logger = require('./Logger');
const Validator = require('./Validator');

class ExcelParser {
    constructor() {
        // 処理統計
        this.stats = {
            totalRows: 0,
            processedRows: 0,
            errorRows: 0,
            warnings: []
        };
        
        Logger.moduleInit('Excel読み込み処理');
    }

    // ==========================================================================
    // メイン処理
    // ==========================================================================

    /**
     * Excelファイルを読み込んで投稿データを生成
     */
    loadExcelFile(filePath) {
        try {
            Logger.fileOperation('Excel読み込み開始', filePath);
            
            // ファイル読み込み
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            Logger.processComplete('Excel取得', `${data.length}行`);
            
            // 統計初期化
            this.stats = {
                totalRows: data.length - 1, // ヘッダー除く
                processedRows: 0,
                errorRows: 0,
                warnings: []
            };
            
            const posts = [];
            
            // データ処理（ヘッダー行をスキップ）
            for (let i = 1; i < data.length; i++) {
                const row = data[i];
                
                // 空行のスキップ
                if (!row[0]) {
                    Logger.processSkip(`空行をスキップ`, `行${i + 1}`);
                    continue;
                }
                
                try {
                    const post = this.processRow(row, i + 1);
                    if (post) {
                        posts.push(post);
                        this.stats.processedRows++;
                    }
                } catch (error) {
                    Logger.apiError(`行${i + 1}処理`, error);
                    this.stats.errorRows++;
                    this.stats.warnings.push(`行${i + 1}: ${error.message}`);
                }
            }
            
            // 結果レポート
            this.logProcessingResult(posts.length);
            
            return {
                posts,
                stats: this.stats
            };
            
        } catch (error) {
            Logger.apiError('Excelファイル読み込み', error);
            throw new Error(`Excelファイル読み込み失敗: ${error.message}`);
        }
    }

    /**
     * 1行のデータを処理して投稿オブジェクトを生成
     */
    processRow(row, rowNumber) {
        // 基本データの取得
        const content = String(row[0] || '').trim();
        let baseTime = String(row[1] || '09:00').trim();
        let randomMinutes = parseInt(row[2]) || 0;
        let datePattern = String(row[3] || '平日').trim();
        const status = String(row[4] || '未投稿').trim();
        
        // 統一バリデーション使用
        const contentResult = Validator.validatePostContent(content);
        if (!contentResult.valid) {
            throw new Error(contentResult.error);
        }
        
        // 時刻の正規化・検証
        baseTime = this.normalizeTimeFormat(row[1], rowNumber);
        
        // ランダム分数の検証
        const randomResult = Validator.validateRandomMinutes(randomMinutes);
        if (!randomResult.valid) {
            Logger.warn('Excel処理', `行${rowNumber}: ${randomResult.error} - 0に設定`);
            this.stats.warnings.push(`行${rowNumber}: ${randomResult.error} - 0に設定`);
            randomMinutes = 0;
        } else {
            randomMinutes = randomResult.value;
        }
        
        // 日付パターンの検証
        const patternResult = Validator.validateDatePattern(datePattern, { returnDefault: true });
        if (!patternResult.valid) {
            Logger.warn('Excel処理', `行${rowNumber}: ${patternResult.error} - '平日'に設定`);
            this.stats.warnings.push(`行${rowNumber}: ${patternResult.error} - '平日'に設定`);
            datePattern = patternResult.value;
        } else {
            datePattern = patternResult.value;
        }
        
        // 投稿オブジェクトの生成
        return {
            id: rowNumber - 1,
            content: contentResult.value,
            baseTime: baseTime,
            randomMinutes: randomMinutes,
            datePattern: datePattern,
            status: status,
            nextPostTime: null,
            scheduleType: Utils.getScheduleType(datePattern)
        };
    }

    // ==========================================================================
    // データ検証・正規化
    // ==========================================================================

    /**
     * 時刻形式の正規化・検証
     */
    normalizeTimeFormat(timeValue, rowNumber) {
        // 数値形式（Excel時刻）の変換
        if (typeof timeValue === 'number' && timeValue >= 0 && timeValue <= 1) {
            const totalMinutes = Math.round(timeValue * 24 * 60);
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            const formatted = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
            Logger.processComplete('時刻変換', `行${rowNumber}: ${timeValue} -> ${formatted}`);
            return formatted;
        }
        
        // 文字列の数値形式の変換
        if (typeof timeValue === 'string' && !isNaN(parseFloat(timeValue))) {
            const numValue = parseFloat(timeValue);
            if (numValue >= 0 && numValue <= 1) {
                const totalMinutes = Math.round(numValue * 24 * 60);
                const hours = Math.floor(totalMinutes / 60);
                const minutes = totalMinutes % 60;
                const formatted = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                Logger.processComplete('時刻変換', `行${rowNumber}: ${timeValue} -> ${formatted}`);
                return formatted;
            }
        }
        
        // 既に正しい形式の時刻文字列
        const timeResult = Validator.validateTimeFormat(timeValue);
        if (timeResult.valid) {
            return timeResult.value;
        }
        
        // 無効な形式の場合
        Logger.warn('Excel処理', `行${rowNumber}: 不正な時刻形式 ${timeValue} - デフォルト値09:00を使用`);
        this.stats.warnings.push(`行${rowNumber}: 時刻形式が不正のためデフォルト値(09:00)を使用`);
        return '09:00';
    }

    // ==========================================================================
    // ログ・レポート
    // ==========================================================================

    /**
     * 処理結果のログ出力
     */
    logProcessingResult(postsCount) {
        Logger.stats('Excel処理結果', {
            '総行数': `${this.stats.totalRows}行`,
            '処理成功': `${this.stats.processedRows}行`,
            'エラー': `${this.stats.errorRows}行`,
            '生成投稿': `${postsCount}件`
        });
        
        if (this.stats.warnings.length > 0) {
            Logger.warn('Excel処理', '警告一覧:');
            this.stats.warnings.forEach(warning => {
                Logger.warn('Excel警告', warning);
            });
        }
        
        Logger.processComplete('Excel読み込み', `${postsCount}件の投稿を生成`);
    }

    /**
     * 詳細な処理レポートを生成
     */
    generateReport() {
        return {
            summary: {
                totalRows: this.stats.totalRows,
                processedRows: this.stats.processedRows,
                errorRows: this.stats.errorRows,
                successRate: this.stats.totalRows > 0 ? 
                    Math.round((this.stats.processedRows / this.stats.totalRows) * 100) : 0
            },
            warnings: this.stats.warnings,
            timestamp: Utils.formatJST()
        };
    }

    // ==========================================================================
    // 検証・プレビュー機能
    // ==========================================================================

    /**
     * Excelファイルの事前検証（データ保存なし）
     */
    validateExcelFile(filePath) {
        try {
            Logger.processStart('Excelファイル検証', filePath);
            
            const result = this.loadExcelFile(filePath);
            
            // データ全体の検証
            const validationResult = Validator.validatePostsArray(result.posts);
            
            Logger.processComplete('Excelファイル検証', 
                validationResult.valid ? '成功' : `${validationResult.errors.length}件のエラー`);
            
            return {
                valid: validationResult.valid,
                posts: result.posts.slice(0, 5), // プレビュー用に最初の5件
                stats: result.stats,
                validationErrors: validationResult.errors,
                validationWarnings: validationResult.warnings || [],
                checkedAt: Utils.formatJST()
            };
            
        } catch (error) {
            Logger.apiError('Excelファイル検証', error);
            return {
                valid: false,
                error: error.message,
                checkedAt: Utils.formatJST()
            };
        }
    }

    /**
     * Excelファイルの構造チェック
     */
    checkExcelStructure(filePath) {
        try {
            Logger.processStart('Excel構造チェック', filePath);
            
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            if (data.length < 2) {
                throw new Error('Excelファイルにデータ行がありません（ヘッダー行のみ）');
            }
            
            const headerRow = data[0];
            const expectedHeaders = ['投稿内容', '基準時刻', 'ランダム分数', '日付パターン', 'ステータス'];
            
            const structureInfo = {
                sheetCount: workbook.SheetNames.length,
                sheetName: sheetName,
                totalRows: data.length,
                dataRows: data.length - 1,
                headerRow: headerRow,
                hasExpectedStructure: headerRow && headerRow.length >= 4,
                expectedHeaders: expectedHeaders
            };
            
            Logger.processComplete('Excel構造チェック', 
                `${structureInfo.dataRows}行のデータ, 構造: ${structureInfo.hasExpectedStructure ? '正常' : '要確認'}`);
            
            return structureInfo;
            
        } catch (error) {
            Logger.apiError('Excel構造チェック', error);
            throw error;
        }
    }

    // ==========================================================================
    // ユーティリティ
    // ==========================================================================

    /**
     * 統計情報をリセット
     */
    resetStats() {
        this.stats = {
            totalRows: 0,
            processedRows: 0,
            errorRows: 0,
            warnings: []
        };
        Logger.processComplete('Excel処理統計リセット');
    }

    /**
     * サポートされているファイル形式を取得
     */
    getSupportedFormats() {
        return {
            extensions: ['.xlsx', '.xls'],
            mimeTypes: [
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'application/vnd.ms-excel'
            ],
            maxSize: '10MB',
            description: 'Microsoft Excel形式（.xlsx, .xls）'
        };
    }

    /**
     * Excelテンプレートの生成情報
     */
    getTemplateInfo() {
        return {
            columns: [
                { 
                    name: 'A列: 投稿内容', 
                    description: 'ツイート内容（280文字以内）',
                    example: 'おはようございます！今日も頑張りましょう！'
                },
                { 
                    name: 'B列: 基準時刻', 
                    description: '投稿したい時刻（HH:MM形式）',
                    example: '09:00, 12:30, 18:45'
                },
                { 
                    name: 'C列: ランダム分数', 
                    description: '時刻のランダム調整（0-60分）',
                    example: '0, 5, 15, 30'
                },
                { 
                    name: 'D列: 日付パターン', 
                    description: '投稿する曜日・日付',
                    example: '平日, 土日, 月, 火, 20250615'
                },
                { 
                    name: 'E列: ステータス', 
                    description: '投稿状態（通常は"未投稿"）',
                    example: '未投稿, 予約中, 投稿済み'
                }
            ],
            dynamicVariables: [
                '{NOW} - 現在日時',
                '{DATE} - 今日の日付',
                '{TIME} - 現在時刻',
                '{WEATHER} - 天気情報（API設定時）',
                '{NIKKEI} - 日経平均（Yahoo Finance）'
            ]
        };
    }
}

module.exports = ExcelParser;