/**
 * 時刻計算処理モジュール（リファクタリング版）
 * 投稿スケジュールの時刻計算・日付パターンマッチングを担当
 * 重複ログを削除し、統一サービスを使用
 */

const Utils = require('../utils/Utils');
const Logger = require('../utils/Logger');

class TimeCalculator {
    constructor() {
        // 時刻計算用の設定
        this.maxSearchDays = 14; // 最大検索日数
        Logger.moduleInit('時刻計算処理');
    }

    // ==========================================================================
    // メイン時刻計算
    // ==========================================================================

    /**
     * 次回投稿時刻を計算（修正版）
     */
    calculateNextPostTime(post, isAfterSuccessfulPost = false) {
        const now = new Date();
        let nextDate = new Date(now);
        
        if (post.scheduleType === 'specific') {
            // 具体的な日付指定（例：20250615）
            const year = parseInt(post.datePattern.substring(0, 4));
            const month = parseInt(post.datePattern.substring(4, 6)) - 1;
            const day = parseInt(post.datePattern.substring(6, 8));
            
            nextDate = new Date(year, month, day);
            
            if (nextDate < now) {
                post.status = 'スキップ';
                post.nextPostTime = null;
                Logger.processSkip('過去の日付のためスキップ', post.datePattern);
                return;
            }
        } else {
            // 繰り返しパターン（平日、土日、曜日指定など）
            if (isAfterSuccessfulPost) {
                // 投稿成功後は必ず翌日以降から検索
                nextDate = this.getNextDateForPatternFromTomorrow(post.datePattern, now);
            } else {
                // 初回計算時は今日も含めて検索
                nextDate = this.getNextDateForPattern(post.datePattern, now);
            }
        }
        
        // 基準時刻の設定
        const [hours, minutes] = post.baseTime.split(':').map(Number);
        nextDate.setHours(hours, minutes, 0, 0);
        
        // 計算された時刻が過去の場合の調整（修正版）
        if (nextDate.getTime() <= now.getTime()) {
            Logger.warn('時刻計算', `計算された時刻が過去のため調整: ${Utils.formatJST(nextDate)}`);
            
            // 同日だが時刻が過去の場合
            if (nextDate.toDateString() === now.toDateString()) {
                // 今日の同じパターンで次の候補日を検索
                nextDate = this.getNextDateForPatternFromTomorrow(post.datePattern, now);
                nextDate.setHours(hours, minutes, 0, 0);
                Logger.processComplete('同日時刻過去のため翌候補日設定', `${Utils.formatJST(nextDate)}`);
            } else {
                // 日付は未来だが何らかの理由で過去になった場合
                if (post.scheduleType === 'recurring') {
                    nextDate.setDate(nextDate.getDate() + 7); // 1週間後
                    Logger.processComplete('時刻調整', `1週間後に設定: ${Utils.formatJST(nextDate)}`);
                } else {
                    nextDate.setDate(nextDate.getDate() + 1); // 翌日
                    Logger.processComplete('時刻調整', `翌日に設定: ${Utils.formatJST(nextDate)}`);
                }
            }
        }
        
        // ランダム分数の適用
        if (post.randomMinutes > 0) {
            const randomOffset = (Math.random() - 0.5) * 2 * post.randomMinutes * 60000;
            nextDate.setTime(nextDate.getTime() + randomOffset);
        }
        
        post.nextPostTime = nextDate.toISOString();
        
        const jstTime = Utils.formatJST(nextDate, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        const logPrefix = isAfterSuccessfulPost ? '🔄 投稿成功後の次回時刻計算' : '📅 次回投稿時刻計算';
        Logger.processComplete(logPrefix, 
            `${post.datePattern} ${post.baseTime} (±${post.randomMinutes}分) -> ${jstTime} (JST)`);
    }

    // ==========================================================================
    // 日付パターンマッチング
    // ==========================================================================

    /**
     * 日付パターンにマッチするかチェック（修正版）
     */
    matchesPattern(pattern, dayOfWeek) {
        switch (pattern) {
            case '毎日':
                return true; // 🆕 毎日は常にtrue
            case '平日':
                return dayOfWeek >= 1 && dayOfWeek <= 5; // 月〜金
            case '土日':
                return dayOfWeek === 0 || dayOfWeek === 6; // 日・土
            case '日':
                return dayOfWeek === 0;
            case '月':
                return dayOfWeek === 1;
            case '火':
                return dayOfWeek === 2;
            case '水':
                return dayOfWeek === 3;
            case '木':
                return dayOfWeek === 4;
            case '金':
                return dayOfWeek === 5;
            case '土':
                return dayOfWeek === 6;
            default:
                return true; // 不明なパターンは許可
        }
    }

    /**
     * 次回実行日取得（今日から検索）- 毎日対応版
     */
    getNextDateForPattern(pattern, currentDate) {
        const now = new Date(currentDate);
        
        Logger.processStart('パターンマッチング検索', `${pattern} (今日 ${Utils.getWeekdayName(now.getDay())}曜日から)`);
        
        // 毎日パターンの場合は今日を返す
        if (pattern === '毎日') {
            Logger.processComplete('毎日パターン', `今日 ${Utils.formatJSTDate(now)} (${Utils.getWeekdayName(now.getDay())}曜日)`);
            return new Date(now);
        }
        
        // その他のパターンは既存ロジック
        for (let i = 0; i < this.maxSearchDays; i++) {
            const checkDate = new Date(now);
            checkDate.setDate(checkDate.getDate() + i);
            
            const dayOfWeek = checkDate.getDay();
            
            if (this.matchesPattern(pattern, dayOfWeek)) {
                const dayName = Utils.getWeekdayName(dayOfWeek);
                
                if (i === 0) {
                    Logger.processComplete('パターンマッチ', `${pattern} -> 今日 ${Utils.formatJSTDate(checkDate)} (${dayName}曜日)`);
                    return checkDate;
                } else {
                    Logger.processComplete('パターンマッチ', `${pattern} -> ${i}日後 ${Utils.formatJSTDate(checkDate)} (${dayName}曜日)`);
                    return checkDate;
                }
            }
        }
        
        // マッチしない場合は翌日を返す
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        Logger.warn('パターンマッチ', `"${pattern}" にマッチする日が見つからないため、翌日を設定`);
        return tomorrow;
    }

    /**
     * 次回実行日取得（明日から検索）- 毎日対応版
     */
    getNextDateForPatternFromTomorrow(pattern, currentDate) {
        const tomorrow = new Date(currentDate);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        
        Logger.processStart('明日以降パターン検索', `${pattern} (明日 ${Utils.getWeekdayName(tomorrow.getDay())}曜日から)`);
        
        // 毎日パターンの場合は明日を返す
        if (pattern === '毎日') {
            Logger.processComplete('毎日パターン（明日以降）', `明日 ${Utils.formatJSTDate(tomorrow)} (${Utils.getWeekdayName(tomorrow.getDay())}曜日)`);
            return new Date(tomorrow);
        }
        
        // その他のパターンは既存ロジック
        for (let i = 0; i < this.maxSearchDays; i++) {
            const checkDate = new Date(tomorrow);
            checkDate.setDate(checkDate.getDate() + i);
            
            const dayOfWeek = checkDate.getDay();
            
            if (this.matchesPattern(pattern, dayOfWeek)) {
                const dayName = Utils.getWeekdayName(dayOfWeek);
                Logger.processComplete('明日以降パターンマッチ', `${pattern} -> ${i === 0 ? '明日' : `${i+1}日後`} ${Utils.formatJSTDate(checkDate)} (${dayName}曜日)`);
                return checkDate;
            }
        }
        
        // マッチしない場合は1週間後を返す
        const oneWeekLater = new Date(tomorrow);
        oneWeekLater.setDate(oneWeekLater.getDate() + 7);
        Logger.warn('明日以降検索', `マッチしないため1週間後を設定: ${Utils.formatJSTDate(oneWeekLater)}`);
        return oneWeekLater;
    }

    // ==========================================================================
    // 時刻調整・検証
    // ==========================================================================

    /**
     * 過去投稿のクリーンアップ用時刻計算
     */
    shouldRescheduleOldPost(post, currentTime) {
        if (!post.nextPostTime) return false;
        
        const scheduledTime = new Date(post.nextPostTime).getTime();
        const oneDayAgo = currentTime - (24 * 60 * 60 * 1000);
        const oneHourAgo = currentTime - (60 * 60 * 1000);
        
        if (scheduledTime < oneDayAgo) {
            // 24時間以上過去
            return {
                shouldReschedule: true,
                reason: '24時間以上過去',
                action: post.scheduleType === 'recurring' ? 'recalculate' : 'skip'
            };
        } else if (scheduledTime < oneHourAgo && post.scheduleType === 'recurring') {
            // 1時間以上遅延（繰り返し投稿のみ）
            return {
                shouldReschedule: true,
                reason: '1時間以上遅延',
                action: 'reschedule_next_week'
            };
        }
        
        return {
            shouldReschedule: false,
            reason: '正常範囲'
        };
    }

    /**
     * 遅延投稿の再スケジュール
     */
    rescheduleDelayedPost(post, currentTime) {
        const check = this.shouldRescheduleOldPost(post, currentTime);
        
        if (!check.shouldReschedule) {
            return false;
        }
        
        switch (check.action) {
            case 'recalculate':
                Logger.processStart('投稿再計算', `${check.reason}: "${Utils.safeTruncate(post.content, 20)}..."`);
                this.calculateNextPostTime(post, true);
                break;
                
            case 'reschedule_next_week':
                Logger.processStart('1週間後設定', `${check.reason}: "${Utils.safeTruncate(post.content, 20)}..."`);
                const nextWeek = new Date(post.nextPostTime);
                nextWeek.setDate(nextWeek.getDate() + 7);
                post.nextPostTime = nextWeek.toISOString();
                
                const nextWeekJST = Utils.formatJST(nextWeek);
                Logger.processComplete('1週間後設定', `${nextWeekJST} (JST)`);
                break;
                
            case 'skip':
                Logger.processSkip('期限切れスキップ', `${check.reason}: "${Utils.safeTruncate(post.content, 20)}..."`);
                post.status = 'スキップ';
                post.nextPostTime = null;
                break;
        }
        
        return true;
    }

    // ==========================================================================
    // 時刻比較・検証
    // ==========================================================================

    /**
     * 投稿予定時刻が実行可能かチェック
     */
    isPostTimeReady(post, currentTime, toleranceMs = 60000) {
        if (!post.nextPostTime) return false;
        
        const scheduledTime = new Date(post.nextPostTime).getTime();
        const timeDiff = Math.abs(currentTime - scheduledTime);
        
        return timeDiff <= toleranceMs;
    }

    /**
     * 今日投稿すべきかチェック
     */
    shouldPostToday(post) {
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0=日曜日, 1=月曜日, ...
        
        switch (post.datePattern) {
            case '平日':
                return dayOfWeek >= 1 && dayOfWeek <= 5;
            case '土日':
                return dayOfWeek === 0 || dayOfWeek === 6;
            case '日':
                return dayOfWeek === 0;
            case '月':
                return dayOfWeek === 1;
            case '火':
                return dayOfWeek === 2;
            case '水':
                return dayOfWeek === 3;
            case '木':
                return dayOfWeek === 4;
            case '金':
                return dayOfWeek === 5;
            case '土':
                return dayOfWeek === 6;
            default:
                // 具体的な日付の場合（例：20250615）
                if (/^\d{8}$/.test(post.datePattern)) {
                    const targetDate = post.datePattern;
                    const today = now.toISOString().substr(0, 10).replace(/-/g, '');
                    return today === targetDate;
                }
                return true;
        }
    }

    /**
     * 最適な投稿時刻を提案
     */
    suggestOptimalPostTime(baseTime, randomMinutes = 0) {
        const now = new Date();
        const [hours, minutes] = baseTime.split(':').map(Number);
        
        const suggestedTime = new Date(now);
        suggestedTime.setHours(hours, minutes, 0, 0);
        
        // 過去の時刻の場合は翌日に設定
        if (suggestedTime.getTime() <= now.getTime()) {
            suggestedTime.setDate(suggestedTime.getDate() + 1);
        }
        
        // ランダム調整の適用
        if (randomMinutes > 0) {
            const randomOffset = (Math.random() - 0.5) * 2 * randomMinutes * 60000;
            suggestedTime.setTime(suggestedTime.getTime() + randomOffset);
        }
        
        return {
            suggestedTime: suggestedTime.toISOString(),
            formattedTime: Utils.formatJST(suggestedTime),
            isNextDay: suggestedTime.getDate() !== now.getDate(),
            randomAdjustment: randomMinutes > 0
        };
    }

    // ==========================================================================
    // 統計・分析
    // ==========================================================================

    /**
     * 投稿パターンの統計情報を取得
     */
    getPatternStatistics(posts) {
        const patterns = {};
        
        posts.forEach(post => {
            const pattern = post.datePattern;
            if (!patterns[pattern]) {
                patterns[pattern] = {
                    count: 0,
                    scheduled: 0,
                    posted: 0,
                    pending: 0,
                    times: []
                };
            }
            
            patterns[pattern].count++;
            patterns[pattern].times.push(post.baseTime);
            
            switch (post.status) {
                case '予約中':
                    patterns[pattern].scheduled++;
                    break;
                case '投稿済み':
                case '手動投稿済み':
                    patterns[pattern].posted++;
                    break;
                case '未投稿':
                    patterns[pattern].pending++;
                    break;
            }
        });
        
        // 時刻の統計も計算
        Object.keys(patterns).forEach(pattern => {
            const times = patterns[pattern].times;
            const uniqueTimes = [...new Set(times)];
            patterns[pattern].uniqueTimes = uniqueTimes.length;
            patterns[pattern].mostCommonTime = this.getMostCommonTime(times);
        });
        
        return patterns;
    }

    /**
     * 最も多い投稿時刻を取得
     */
    getMostCommonTime(times) {
        const frequency = {};
        times.forEach(time => {
            frequency[time] = (frequency[time] || 0) + 1;
        });
        
        let maxCount = 0;
        let mostCommon = null;
        
        Object.entries(frequency).forEach(([time, count]) => {
            if (count > maxCount) {
                maxCount = count;
                mostCommon = time;
            }
        });
        
        return mostCommon;
    }

    /**
     * 次回投稿までの時間を計算
     */
    getTimeUntilNextPost(posts) {
        const now = new Date();
        const currentTime = now.getTime();
        
        const scheduledPosts = posts
            .filter(post => post.status === '予約中' && post.nextPostTime)
            .map(post => ({
                ...post,
                timeDiff: new Date(post.nextPostTime).getTime() - currentTime
            }))
            .filter(post => post.timeDiff > 0)
            .sort((a, b) => a.timeDiff - b.timeDiff);
        
        if (scheduledPosts.length === 0) {
            return null;
        }
        
        const nextPost = scheduledPosts[0];
        
        return {
            post: nextPost,
            timeUntil: Utils.getTimeDifferenceText(nextPost.nextPostTime, now),
            scheduledTime: Utils.formatJST(new Date(nextPost.nextPostTime)),
            remainingMs: nextPost.timeDiff
        };
    }

    /**
     * デバッグ用：平日計算テスト関数
     */
    debugWeekdayCalculation(baseTime = '09:00', currentTime = new Date()) {
        console.log('=== 平日スケジュール計算デバッグ ===');
        console.log('現在時刻:', Utils.formatJST(currentTime));
        console.log('現在曜日:', Utils.getWeekdayName(currentTime.getDay()), `(${currentTime.getDay()})`);
        console.log('基準時刻:', baseTime);
        
        // 今日から検索
        console.log('\n--- 今日から検索 ---');
        const todayResult = this.getNextDateForPattern('平日', currentTime);
        console.log('結果:', Utils.formatJST(todayResult), Utils.getWeekdayName(todayResult.getDay()));
        
        // 明日から検索
        console.log('\n--- 明日から検索 ---');
        const tomorrowResult = this.getNextDateForPatternFromTomorrow('平日', currentTime);
        console.log('結果:', Utils.formatJST(tomorrowResult), Utils.getWeekdayName(tomorrowResult.getDay()));
        
        // 時刻設定後のテスト
        console.log('\n--- 時刻設定後のテスト ---');
        const [hours, minutes] = baseTime.split(':').map(Number);
        
        const testDate1 = new Date(todayResult);
        testDate1.setHours(hours, minutes, 0, 0);
        console.log('今日ベース + 時刻:', Utils.formatJST(testDate1));
        console.log('現在より未来?:', testDate1.getTime() > currentTime.getTime());
        
        const testDate2 = new Date(tomorrowResult);
        testDate2.setHours(hours, minutes, 0, 0);
        console.log('明日ベース + 時刻:', Utils.formatJST(testDate2));
        console.log('現在より未来?:', testDate2.getTime() > currentTime.getTime());
        
        console.log('=====================================');
    }
}

module.exports = TimeCalculator;