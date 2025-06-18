/**
 * 共通ユーティリティ関数
 * 日付フォーマット・統計計算・エラーレスポンス等の共通処理
 */

class Utils {
    // ==========================================================================
    // 日時関連ユーティリティ
    // ==========================================================================

    /**
     * JST形式で日時をフォーマット（共通化）
     */
    static formatJST(date = new Date(), options = {}) {
        const defaultOptions = {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        };
        
        return date.toLocaleString('ja-JP', { ...defaultOptions, ...options });
    }

    /**
     * JST形式で時刻のみをフォーマット
     */
    static formatJSTTime(date = new Date()) {
        return date.toLocaleString('ja-JP', {
            timeZone: 'Asia/Tokyo',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * JST形式で日付のみをフォーマット
     */
    static formatJSTDate(date = new Date()) {
        return date.toLocaleDateString('ja-JP', {
            timeZone: 'Asia/Tokyo'
        });
    }

    /**
     * 時間差を日本語で表示
     */
    static getTimeDifferenceText(targetTime, currentTime = new Date()) {
        const timeDiff = new Date(targetTime).getTime() - currentTime.getTime();
        
        if (timeDiff < 0) {
            return '投稿時刻を過ぎています';
        } else if (timeDiff < 60 * 60 * 1000) { // 1時間未満
            const minutes = Math.ceil(timeDiff / (1000 * 60));
            return `${minutes}分後`;
        } else if (timeDiff < 24 * 60 * 60 * 1000) { // 24時間未満
            const hours = Math.ceil(timeDiff / (1000 * 60 * 60));
            return `${hours}時間後`;
        } else {
            const days = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
            return `${days}日後`;
        }
    }

    // ==========================================================================
    // 統計計算ユーティリティ（最適化済み）
    // ==========================================================================

    /**
     * 投稿統計を効率的に計算（1回のループで全て計算）
     */
    static calculatePostStats(posts) {
        return posts.reduce((stats, post) => {
            stats.total++;
            
            switch (post.status) {
                case '予約中':
                    stats.scheduled++;
                    break;
                case '投稿済み':
                case '手動投稿済み':
                    stats.posted++;
                    break;
                case '未投稿':
                    stats.pending++;
                    break;
                case '投稿失敗':
                case '設定エラー':
                    stats.error++;
                    break;
                case 'スキップ':
                    stats.skipped++;
                    break;
            }
            
            return stats;
        }, {
            total: 0,
            scheduled: 0,
            posted: 0,
            pending: 0,
            error: 0,
            skipped: 0
        });
    }

    /**
     * 期間内の投稿数を計算
     */
    static getPostsInTimeRange(posts, startTime, endTime) {
        return posts.filter(post => {
            if (!post.lastPostedTime) return false;
            const postedTime = new Date(post.lastPostedTime).getTime();
            return postedTime >= startTime && postedTime <= endTime;
        });
    }

    /**
     * 今日の投稿数を取得
     */
    static getTodayPostsCount(posts) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStart = today.getTime();
        const todayEnd = todayStart + (24 * 60 * 60 * 1000);
        
        return this.getPostsInTimeRange(posts, todayStart, todayEnd).length;
    }

    /**
     * 1週間以内の投稿数を取得
     */
    static getWeekPostsCount(posts) {
        const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        return this.getPostsInTimeRange(posts, weekAgo, Date.now()).length;
    }

    /**
     * 30分以内の投稿を検索
     */
    static getRecentPosts(posts, minutes = 30) {
        const minutesAgo = Date.now() - (minutes * 60 * 1000);
        return this.getPostsInTimeRange(posts, minutesAgo, Date.now());
    }

    // ==========================================================================
    // レスポンス関連ユーティリティ
    // ==========================================================================

    /**
     * 成功レスポンスを送信
     */
    static sendSuccess(res, data = {}, message = 'success') {
        res.json({
            success: true,
            message,
            ...data
        });
    }

    /**
     * エラーレスポンスを送信（共通化）
     */
    static sendError(res, message, code = 400) {
        res.status(code).json({
            success: false,
            message
        });
    }

    /**
     * APIレスポンス統計情報を生成
     */
    static createStatsResponse(posts, isRunning = false, hasTwitterApi = false, assistantMode = true) {
        const stats = this.calculatePostStats(posts);
        
        return {
            success: true,
            isRunning,
            hasTwitterApi,
            assistantMode,
            stats,
            posts
        };
    }

    // ==========================================================================
    // 文字列・データ処理ユーティリティ
    // ==========================================================================

    /**
     * 安全な文字列切り出し
     */
    static safeTruncate(text, maxLength = 50, suffix = '...') {
        if (!text || typeof text !== 'string') return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + suffix;
    }

    /**
     * HTMLエスケープ
     */
    static escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * 数値の範囲チェック
     */
    static isInRange(value, min, max) {
        const num = parseFloat(value);
        return !isNaN(num) && num >= min && num <= max;
    }

    /**
     * 時刻形式の検証
     */
    static isValidTimeFormat(timeString) {
        return /^\d{1,2}:\d{2}$/.test(timeString);
    }

    /**
     * 日付パターンの検証（毎日対応版）
     */
    static isValidDatePattern(pattern) {
        // 8桁の日付形式（YYYYMMDD）
        if (/^\d{8}$/.test(pattern)) {
            const year = parseInt(pattern.substring(0, 4));
            const month = parseInt(pattern.substring(4, 6));
            const day = parseInt(pattern.substring(6, 8));
            
            const testDate = new Date(year, month - 1, day);
            return testDate.getFullYear() === year && 
                testDate.getMonth() === month - 1 && 
                testDate.getDate() === day;
        }
        
        // 曜日・パターン指定（毎日を追加）
        const validPatterns = ['毎日', '平日', '土日', '日', '月', '火', '水', '木', '金', '土'];
        return validPatterns.includes(pattern);
    }

    // ==========================================================================
    // 非同期処理ユーティリティ
    // ==========================================================================

    /**
     * 待機処理
     */
    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * リトライ機能付きfetch
     */
    static async fetchWithRetry(url, options = {}, maxRetries = 3, delay = 1000) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);
                
                try {
                    const response = await fetch(url, { 
                        signal: controller.signal,
                        ...options
                    });
                    
                    clearTimeout(timeoutId);
                    
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    
                    const data = await response.json();
                    
                    if (data.message && data.message.includes('API rate limit')) {
                        console.warn(`⚠️ API制限に達しました。${delay}ms後にリトライ (${i + 1}/${maxRetries})`);
                        await this.sleep(delay * (i + 1));
                        continue;
                    }
                    
                    return data;
                    
                } catch (fetchError) {
                    clearTimeout(timeoutId);
                    throw fetchError;
                }
                
            } catch (error) {
                if (error.name === 'AbortError') {
                    console.warn(`⚠️ API取得タイムアウト (${i + 1}/${maxRetries}): ${url}`);
                } else {
                    console.warn(`⚠️ リクエスト失敗 (${i + 1}/${maxRetries}): ${error.message}`);
                }
                
                if (i === maxRetries - 1) {
                    throw error;
                }
                
                await this.sleep(delay * (i + 1));
            }
        }
    }

    // ==========================================================================
    // ログ関連ユーティリティ
    // ==========================================================================

    /**
     * 投稿ログの生成
     */
    static logPostAction(action, postId, content, additionalInfo = '') {
        const timestamp = this.formatJST();
        const truncatedContent = this.safeTruncate(content, 30);
        console.log(`${action} ID ${postId}: "${truncatedContent}" (${timestamp} JST) ${additionalInfo}`);
    }

    /**
     * API制限ログの生成
     */
    static logAPILimit(reason, details = '') {
        const timestamp = this.formatJST();
        console.warn(`⚠️ API制限: ${reason} (${timestamp} JST) ${details}`);
    }

    // ==========================================================================
    // 設定関連ユーティリティ
    // ==========================================================================

    /**
     * スケジュールタイプの判定
     */
    static getScheduleType(datePattern) {
        return /^\d{8}$/.test(datePattern) ? 'specific' : 'recurring';
    }

    /**
     * 曜日名の取得
     */
    static getWeekdayName(dayIndex) {
        const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
        return weekdays[dayIndex] || '不明';
    }

    /**
     * 基本的な動的変数の生成
     */
    static getBasicVariables(now = new Date()) {
        return {
            '{NOW}': this.formatJST(now),
            '{DATE}': this.formatJSTDate(now),
            '{TIME}': this.formatJSTTime(now),
            '{YEAR}': now.getFullYear().toString(),
            '{MONTH}': (now.getMonth() + 1).toString(),
            '{DAY}': now.getDate().toString(),
            '{WEEKDAY}': this.getWeekdayName(now.getDay()),
            '{HOUR}': now.getHours().toString(),
            '{MINUTE}': now.getMinutes().toString().padStart(2, '0')
        };
    }
}

module.exports = Utils;