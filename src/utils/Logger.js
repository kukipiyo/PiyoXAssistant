/**
 * 統一ログサービス（時刻情報追加版）
 * 全体のログ出力を統一・管理するサービス
 */

const Utils = require('./Utils');

class Logger {
    // ==========================================================================
    // 時刻フォーマット関数（追加）
    // ==========================================================================

    /**
     * ログ用の時刻文字列を生成
     */
    static getTimestamp() {
        const now = new Date();
        return now.toLocaleString('ja-JP', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    /**
     * ログメッセージに時刻を追加
     */
    static formatMessage(message) {
        return `[${this.getTimestamp()}] ${message}`;
    }

    // ==========================================================================
    // データ操作ログ（時刻追加版）
    // ==========================================================================

    /**
     * データ設定ログ
     */
    static dataSet(moduleName, count, type = '投稿データ') {
        console.log(this.formatMessage(`📊 ${moduleName}: ${type}設定 ${count}件`));
    }

    /**
     * データクリアログ
     */
    static dataClear(moduleName, type = '投稿データ') {
        console.log(this.formatMessage(`🗑️ ${moduleName}: ${type}をクリア`));
    }

    /**
     * データ保存ログ
     */
    static dataSave(type = '投稿データ', count = 0) {
        console.log(this.formatMessage(`💾 ${type}保存: ${count}件`));
    }

    // ==========================================================================
    // 投稿操作ログ（時刻追加版）
    // ==========================================================================

    /**
     * 投稿アクションログ（統一版）
     */
    static postAction(action, postId, content, additionalInfo = '') {
        const truncatedContent = Utils.safeTruncate(content, 30);
        console.log(this.formatMessage(`${action} ID ${postId}: "${truncatedContent}" ${additionalInfo}`));
    }

    /**
     * 投稿ステータス変更ログ
     */
    static postStatusChange(postId, oldStatus, newStatus) {
        console.log(this.formatMessage(`🔄 投稿ステータス変更: ID ${postId} "${oldStatus}" -> "${newStatus}"`));
    }

    /**
     * 投稿スケジュールログ
     */
    static postSchedule(action, postId, content, scheduledTime, timeStatus = '') {
        const truncatedContent = Utils.safeTruncate(content, 30);
        console.log(this.formatMessage(`📅 ${action}: "${truncatedContent}" -> ${scheduledTime} ${timeStatus}`));
    }

    // ==========================================================================
    // API・システムログ（時刻追加版）
    // ==========================================================================

    /**
     * APIエラーログ（統一版）
     */
    static apiError(operation, error, context = '') {
        console.error(this.formatMessage(`❌ ${operation}エラー${context ? ` (${context})` : ''}:`), error.message);
    }

    /**
     * API成功ログ
     */
    static apiSuccess(operation, details = '') {
        console.log(this.formatMessage(`✅ ${operation}成功${details ? `: ${details}` : ''}`));
    }

    /**
     * API制限ログ
     */
    static apiLimit(reason, details = '') {
        console.warn(this.formatMessage(`⚠️ API制限: ${reason} ${details}`));
    }

    // ==========================================================================
    // システム・初期化ログ（時刻追加版）
    // ==========================================================================

    /**
     * モジュール初期化ログ
     */
    static moduleInit(moduleName, status = '完了') {
        console.log(this.formatMessage(`🔧 ${moduleName}初期化${status}`));
    }

    /**
     * サービス開始ログ
     */
    static serviceStart(serviceName, details = '') {
        console.log(this.formatMessage(`🚀 ${serviceName}開始${details ? `: ${details}` : ''}`));
    }

    /**
     * サービス停止ログ
     */
    static serviceStop(serviceName, reason = '') {
        console.log(this.formatMessage(`⏹️ ${serviceName}停止${reason ? `: ${reason}` : ''}`));
    }

    // ==========================================================================
    // ファイル・設定ログ（時刻追加版）
    // ==========================================================================

    /**
     * ファイル操作ログ
     */
    static fileOperation(operation, fileName, details = '') {
        console.log(this.formatMessage(`📁 ${operation}: ${fileName}${details ? ` ${details}` : ''}`));
    }

    /**
     * 設定操作ログ
     */
    static configOperation(operation, configType, details = '') {
        console.log(this.formatMessage(`⚙️ ${operation}: ${configType}${details ? ` ${details}` : ''}`));
    }

    // ==========================================================================
    // 処理・計算ログ（時刻追加版）
    // ==========================================================================

    /**
     * 処理開始ログ
     */
    static processStart(processName, target = '') {
        console.log(this.formatMessage(`🔄 ${processName}開始${target ? `: ${target}` : ''}...`));
    }

    /**
     * 処理完了ログ
     */
    static processComplete(processName, result = '', count = null) {
        const countInfo = count !== null ? ` (${count}件)` : '';
        console.log(this.formatMessage(`✅ ${processName}完了${result ? `: ${result}` : ''}${countInfo}`));
    }

    /**
     * 処理スキップログ
     */
    static processSkip(processName, reason) {
        console.log(this.formatMessage(`⏭️ ${processName}スキップ: ${reason}`));
    }

    // ==========================================================================
    // 統計・分析ログ（時刻追加版）
    // ==========================================================================

    /**
     * 統計ログ
     */
    static stats(title, stats, timestamp = true) {
        console.log(this.formatMessage(`\n📊 ${title}:`));
        Object.entries(stats).forEach(([key, value]) => {
            console.log(`   ${key}: ${value}`);
        });
        if (timestamp) {
            console.log(`   統計取得時刻: ${Utils.formatJST()}`);
        }
        console.log('');
    }

    /**
     * キャッシュ操作ログ
     */
    static cache(operation, type, details = '') {
        const operations = {
            clear: '📋 キャッシュクリア',
            hit: '💾 キャッシュヒット',
            miss: '🔄 キャッシュミス',
            update: '💾 キャッシュ更新'
        };
        console.log(this.formatMessage(`${operations[operation] || '📋 キャッシュ操作'}: ${type}${details ? ` ${details}` : ''}`));
    }

    // ==========================================================================
    // デバッグ・開発用ログ（時刻追加版）
    // ==========================================================================

    /**
     * デバッグログ（開発時のみ）
     */
    static debug(category, message, data = null) {
        if (process.env.NODE_ENV !== 'production') {
            console.log(this.formatMessage(`🔍 [DEBUG:${category}] ${message}`));
            if (data) {
                console.log('   データ:', data);
            }
        }
    }

    /**
     * 警告ログ
     */
    static warn(category, message, details = '') {
        console.warn(this.formatMessage(`⚠️ [${category}] ${message}${details ? ` - ${details}` : ''}`));
    }

    // ==========================================================================
    // バッチ・定期処理ログ（時刻追加版）
    // ==========================================================================

    /**
     * 定期処理チェックログ
     */
    static schedulerCheck(checkType, result, details = '') {
        console.log(this.formatMessage(`🔍 ${checkType}チェック: ${result}${details ? ` ${details}` : ''}`));
    }

    /**
     * クリーンアップログ
     */
    static cleanup(type, count, details = '') {
        console.log(this.formatMessage(`🧹 ${type}クリーンアップ: ${count}件を処理${details ? ` ${details}` : ''}`));
    }
}

module.exports = Logger;