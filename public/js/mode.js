/**
 * モード管理 - 投稿補助モード・自動投稿モード切り替え
 */

// ==========================================================================
// モード管理
// ==========================================================================

/**
 * 投稿補助モードと自動投稿モードの切り替え
 */
async function toggleMode() {
    try {
        const response = await fetch('/api/toggle-assistant-mode', {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            assistantMode = result.assistantMode;
            updateModeUI();
            refreshUpcomingPosts();
        } else {
            alert('モード切り替えに失敗しました');
        }
    } catch (error) {
        console.error('モード切り替えエラー:', error);
        alert('モード切り替えエラー: ' + error.message);
    }
}

/**
 * UI上のモード表示を更新
 */
function updateModeUI() {
    const toggle = document.getElementById('modeToggle');
    const modeInfo = document.getElementById('modeInfo');
    
    if (assistantMode) {
        toggle.classList.remove('active');
        modeInfo.className = 'assistant-mode-info';
        modeInfo.innerHTML = `
            <h4>🤖 投稿補助モード</h4>
            <p>投稿内容を確認してコピーボタンでクリップボードにコピー → Xサイトで手動投稿してください。<br>
            投稿完了後は「投稿済み」ボタンを押すと次回スケジュールが自動設定されます。</p>
        `;
    } else {
        toggle.classList.add('active');
        modeInfo.className = 'assistant-mode-info auto-mode';
        modeInfo.innerHTML = `
            <h4>🚀 自動投稿モード</h4>
            <p>予約時間になると自動でX(Twitter)に投稿されます。API制限にご注意ください。</p>
        `;
    }
}