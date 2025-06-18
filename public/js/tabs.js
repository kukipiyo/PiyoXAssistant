/**
 * タブ管理機能 - タブ切り替え・初期化・統計同期
 */

// ==========================================================================
// タブ管理
// ==========================================================================

/**
 * タブ切り替え処理
 */
function switchTab(tabName) {
    // 全てのタブボタンから active クラスを削除
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // 全てのタブコンテンツを非表示
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // 選択されたタブをアクティブに
    event.target.classList.add('active');
    document.getElementById(tabName + '-tab').classList.add('active');
    
    // タブ切り替え時の統計同期とデータ更新
    handleTabSwitch(tabName);
    
    // ローカルストレージに現在のタブを保存
    localStorage.setItem('activeTab', tabName);
    
    console.log(`📑 タブ切り替え: ${tabName}`);
}

/**
 * タブ切り替え時の処理
 */
async function handleTabSwitch(tabName) {
    // 統計情報を最新に同期
    await updateAllStatistics();
    
    if (tabName === 'upcoming') {
        // 直近投稿タブの処理
        await refreshUpcomingPosts();
        console.log('📅 直近投稿タブアクティブ');
        
    } else if (tabName === 'management') {
        // 管理タブの処理
        if (typeof onManagementTabActive === 'function') {
            onManagementTabActive();
        }
        console.log('⚙️ 管理タブアクティブ');
    }
}

/**
 * タブを名前で切り替え（プログラム用）
 */
function switchToTab(tabName) {
    // 対応するタブボタンを探してクリック
    const buttons = document.querySelectorAll('.tab-button');
    buttons.forEach(button => {
        if (button.textContent.includes(getTabDisplayName(tabName))) {
            // イベントオブジェクトを模擬
            const mockEvent = { target: button };
            window.event = mockEvent;
            
            switchTab(tabName);
        }
    });
}

/**
 * タブ表示名を取得
 */
function getTabDisplayName(tabName) {
    const tabNames = {
        'upcoming': '直近投稿予定',
        'management': '管理・設定'
    };
    return tabNames[tabName] || tabName;
}

/**
 * 現在のアクティブタブを取得
 */
function getCurrentActiveTab() {
    const activeButton = document.querySelector('.tab-button.active');
    if (!activeButton) return 'upcoming';
    
    const text = activeButton.textContent.trim();
    if (text.includes('直近投稿予定')) return 'upcoming';
    if (text.includes('管理・設定')) return 'management';
    
    return 'upcoming';
}

// ==========================================================================
// 統計同期・更新管理
// ==========================================================================

/**
 * アクティブタブの統計を強制更新
 */
async function refreshActiveTabStats() {
    const activeTab = getCurrentActiveTab();
    
    // 統計情報を取得して更新
    await updateAllStatistics();
    
    // タブ固有の更新処理
    if (activeTab === 'upcoming') {
        console.log('📊 直近投稿タブの統計更新完了');
    } else if (activeTab === 'management') {
        console.log('📊 管理タブの統計更新完了');
    }
}

/**
 * 全タブの統計を同期（外部から呼び出し用）
 */
function syncAllTabStats() {
    updateAllStatistics();
}

// ==========================================================================
// キーボードショートカット
// ==========================================================================

/**
 * キーボードショートカット設定
 */
function setupTabKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + 数字キーでタブ切り替え
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
            switch(e.key) {
                case '1':
                    e.preventDefault();
                    switchToTab('upcoming');
                    break;
                case '2':
                    e.preventDefault();
                    switchToTab('management');
                    break;
            }
        }
        
        // F5キーで統計更新
        if (e.key === 'F5' && e.ctrlKey) {
            e.preventDefault();
            refreshActiveTabStats();
        }
    });
}

// ==========================================================================
// タブバッジ（通知）機能
// ==========================================================================

/**
 * タブバッジ更新
 */
function updateTabBadges() {
    const stats = getCachedStats();
    
    // 直近投稿タブのバッジ
    updateUpcomingTabBadge(stats);
    
    // 管理タブのバッジ
    updateManagementTabBadge(stats);
}

/**
 * 直近投稿タブのバッジ更新
 */
function updateUpcomingTabBadge(stats) {
    const button = document.querySelector('.tab-button');
    if (!button || !button.textContent.includes('直近投稿予定')) return;
    
    // 予約中の投稿がある場合のバッジ表示
    const existingBadge = button.querySelector('.tab-badge');
    if (existingBadge) {
        existingBadge.remove();
    }
    
    if (stats.scheduled > 0) {
        const badge = document.createElement('span');
        badge.className = 'tab-badge';
        badge.textContent = stats.scheduled;
        badge.style.cssText = `
            background: #dc3545;
            color: white;
            border-radius: 10px;
            padding: 2px 6px;
            font-size: 0.7rem;
            margin-left: 5px;
            font-weight: bold;
        `;
        button.appendChild(badge);
    }
}

/**
 * 管理タブのバッジ更新
 */
function updateManagementTabBadge(stats) {
    // 将来的な拡張用（未設定のAPI数など）
    // 現在は実装なし
}

// ==========================================================================
// タブ初期化・イベント
// ==========================================================================

/**
 * タブの初期化
 */
function initializeTabs() {
    console.log('📑 タブシステム初期化開始');
    
    // 前回のアクティブタブを復元
    const savedTab = localStorage.getItem('activeTab');
    if (savedTab && savedTab !== 'upcoming') {
        switchToTab(savedTab);
    }
    
    // キーボードショートカット設定
    setupTabKeyboardShortcuts();
    
    // タブボタンにツールチップ追加
    addTabTooltips();
    
    // 初期統計更新
    setTimeout(() => {
        updateAllStatistics();
        updateTabBadges();
    }, 500);
    
    console.log('✅ タブシステム初期化完了');
}

/**
 * タブボタンにツールチップを追加
 */
function addTabTooltips() {
    const tooltips = {
        'upcoming': 'Ctrl+1: 投稿予定の確認・コピー・操作',
        'management': 'Ctrl+2: ファイル読み込み・API設定・制御'
    };
    
    document.querySelectorAll('.tab-button').forEach(button => {
        const text = button.textContent.trim();
        if (text.includes('直近投稿予定')) {
            button.title = tooltips.upcoming;
        } else if (text.includes('管理・設定')) {
            button.title = tooltips.management;
        }
    });
}

/**
 * タブコンテンツのリサイズ対応
 */
function handleTabResize() {
    // レスポンシブ対応のためのリサイズ処理
    const activeTab = getCurrentActiveTab();
    
    if (window.innerWidth <= 768) {
        // モバイル表示での調整
        document.querySelectorAll('.tab-content').forEach(content => {
            content.style.padding = '15px';
        });
    } else {
        // デスクトップ表示での調整
        document.querySelectorAll('.tab-content').forEach(content => {
            content.style.padding = '30px';
        });
    }
}

// ==========================================================================
// イベントリスナー・初期化
// ==========================================================================

/**
 * DOM読み込み完了時のタブ初期化
 */
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        initializeTabs();
    }, 150);
});

/**
 * ウィンドウリサイズ対応
 */
window.addEventListener('resize', () => {
    handleTabResize();
});

// ==========================================================================
// デバッグ・開発用関数
// ==========================================================================

// タブ関連のデバッグ用関数
window.tabDebug = {
    switchTab: switchToTab,
    getCurrentTab: getCurrentActiveTab,
    resetTabs: () => {
        localStorage.removeItem('activeTab');
        switchToTab('upcoming');
    },
    refreshStats: refreshActiveTabStats,
    syncStats: syncAllTabStats,
    updateBadges: updateTabBadges
};