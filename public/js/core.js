/**
 * コア機能 - グローバル変数・ユーティリティ・初期化・統計同期
 * 編集中自動更新スキップ対応
 */

// ==========================================================================
// グローバル変数
// ==========================================================================

let assistantMode = true;
let refreshInterval;
let lastStatsData = null; // 統計データのキャッシュ

// ==========================================================================
// ユーティリティ関数
// ==========================================================================

/**
 * スケジュールアイコン取得（毎日対応版）
 */
function getScheduleIcon(scheduleType, datePattern) {
    if (scheduleType === 'specific') {
        return '📅';
    } else {
        switch (datePattern) {
            case '毎日': return '🌍'; // 🆕 地球アイコン（毎日を表現）
            case '平日': return '🏢';
            case '土日': return '🏖️';
            case '日': return '🎌';
            case '月': return '🌙';
            case '火': return '🔥';
            case '水': return '💧';
            case '木': return '🌳';
            case '金': return '💰';
            case '土': return '🎨';
            default: return '🔄';
        }
    }
}

/**
 * パターン説明取得（毎日対応版）
 */
function getPatternDescription(datePattern) {
    if (/^\d{8}$/.test(datePattern)) {
        const year = datePattern.substring(0, 4);
        const month = datePattern.substring(4, 6);
        const day = datePattern.substring(6, 8);
        return `${year}/${month}/${day}`;
    } else {
        switch (datePattern) {
            case '毎日': return '毎日'; // 🆕 追加
            case '平日': return '平日（月〜金）';
            case '土日': return '土日';
            case '日': return '毎週日曜日';
            case '月': return '毎週月曜日';
            case '火': return '毎週火曜日';
            case '水': return '毎週水曜日';
            case '木': return '毎週木曜日';
            case '金': return '毎週金曜日';
            case '土': return '毎週土曜日';
            default: return datePattern;
        }
    }
}

/**
 * HTMLエスケープ
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==========================================================================
// 統計情報統一管理
// ==========================================================================

/**
 * 統計情報を全てのタブで同期更新
 */
async function updateAllStatistics() {
    try {
        const response = await fetch('/api/status');
        const result = await response.json();
        
        if (result.success) {
            const stats = {
                total: result.stats.total || 0,
                scheduled: result.stats.scheduled || 0,
                posted: result.stats.posted || 0,
                pending: result.stats.pending || 0
            };
            
            // キャッシュ更新
            lastStatsData = stats;
            
            // 両タブの統計を同期更新
            updateManagementTabStats(stats);
            updateUpcomingTabStats(stats);
            
            console.log('📊 統計情報更新完了:', stats);
        }
    } catch (error) {
        console.error('統計更新エラー:', error);
    }
}

/**
 * 管理タブの統計カード更新
 */
function updateManagementTabStats(stats) {
    const elements = {
        total: document.getElementById('totalPosts'),
        scheduled: document.getElementById('scheduledPosts'),
        posted: document.getElementById('postedCount'),
        pending: document.getElementById('pendingPosts')
    };
    
    // アニメーション付きで数値更新
    Object.keys(elements).forEach(key => {
        const element = elements[key];
        if (element) {
            animateNumber(element, parseInt(element.textContent) || 0, stats[key]);
        }
    });
}

/**
 * 直近投稿タブの統計表示更新
 */
function updateUpcomingTabStats(stats) {
    const elements = {
        total: document.getElementById('upcomingTotalPosts'),
        scheduled: document.getElementById('upcomingScheduledPosts'),
        posted: document.getElementById('upcomingPostedCount'),
        pending: document.getElementById('upcomingPendingPosts')
    };
    
    // 直近投稿タブの統計も同様に更新
    Object.keys(elements).forEach(key => {
        const element = elements[key];
        if (element) {
            animateNumber(element, parseInt(element.textContent) || 0, stats[key]);
        }
    });
}

/**
 * 数値をアニメーション付きで更新
 */
function animateNumber(element, from, to) {
    if (from === to) return;
    
    const duration = 800; // アニメーション時間（ms）
    const steps = 20;
    const stepValue = (to - from) / steps;
    const stepTime = duration / steps;
    
    let current = from;
    let step = 0;
    
    const timer = setInterval(() => {
        step++;
        current += stepValue;
        
        if (step >= steps) {
            element.textContent = to;
            clearInterval(timer);
            
            // 変化があった場合のハイライト効果
            if (from !== to) {
                element.style.transition = 'color 0.3s ease';
                element.style.color = '#28a745';
                setTimeout(() => {
                    element.style.color = '';
                }, 1000);
            }
        } else {
            element.textContent = Math.round(current);
        }
    }, stepTime);
}

/**
 * 統計情報の手動更新（外部から呼び出し用）
 */
function refreshStatistics() {
    updateAllStatistics();
}

/**
 * キャッシュされた統計データ取得
 */
function getCachedStats() {
    return lastStatsData || { total: 0, scheduled: 0, posted: 0, pending: 0 };
}

// ==========================================================================
// 定期更新管理（編集中スキップ対応）
// ==========================================================================

/**
 * 定期更新開始
 */
function startPeriodicRefresh() {
    // 既存のタイマーをクリア
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    
    // 新しいタイマー設定（30秒間隔）
    refreshInterval = setInterval(() => {
        // 編集中の場合は投稿一覧更新をスキップ
        if (window.PostEdit && window.PostEdit.hasActiveEdit()) {
            console.log('📝 編集中のため定期更新をスキップ（統計のみ更新）');
            updateAllStatistics(); // 統計は更新
            return;
        }
        
        // 通常の定期更新
        updateAllStatistics();
        refreshUpcomingPosts();
    }, 30000);
    
    console.log('🔄 定期更新開始 (30秒間隔・編集中スキップ対応)');
}

/**
 * 定期更新停止
 */
function stopPeriodicRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
        console.log('⏹️ 定期更新停止');
    }
}

/**
 * 手動更新（編集中でも実行）
 */
function forceRefreshUpcomingPosts() {
    console.log('🔄 手動更新実行（編集中でも強制実行）');
    refreshUpcomingPosts(true); // 強制更新フラグを設定
}

// ==========================================================================
// 初期化
// ==========================================================================

/**
 * アプリケーション初期化
 */
function initializeApp() {
    console.log('🚀 X投稿補助ツール初期化開始');
    
    // UI初期化
    updateModeUI();
    
    // 統計情報初期化
    updateAllStatistics();
    
    // 直近投稿初期化
    refreshUpcomingPosts();
    
    // 定期更新開始
    startPeriodicRefresh();
    
    // ページ終了時のクリーンアップ
    window.addEventListener('beforeunload', () => {
        stopPeriodicRefresh();
    });
    
    console.log('✅ 初期化完了（編集中自動更新スキップ対応）');
}

/**
 * DOM読み込み完了時の初期化
 */
document.addEventListener('DOMContentLoaded', function() {
    // 少し遅延させてから初期化（他のスクリプトの競合を避ける）
    setTimeout(() => {
        initializeApp();
    }, 100);
});

// ==========================================================================
// デバッグ・開発用関数
// ==========================================================================

// グローバルスコープにデバッグ関数を追加
window.debugStats = {
    refresh: updateAllStatistics,
    getCached: getCachedStats,
    startRefresh: startPeriodicRefresh,
    stopRefresh: stopPeriodicRefresh,
    forceRefresh: forceRefreshUpcomingPosts, // 手動更新用
    forceUpdate: (stats) => {
        updateManagementTabStats(stats);
        updateUpcomingTabStats(stats);
    }
};