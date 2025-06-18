/**
 * データ管理・ファイル・制御機能
 */

// ==========================================================================
// ファイル管理
// ==========================================================================

/**
 * Excelファイルアップロード
 */
async function uploadFile() {
    const fileInput = document.getElementById('excelFile');
    const file = fileInput.files[0];
    
    if (!file) {
        alert('ファイルを選択してください');
        return;
    }
    
    const formData = new FormData();
    formData.append('excel', file);
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            document.getElementById('fileStatus').className = 'status-indicator status-success';
            document.getElementById('fileStatus').textContent = '✅ ' + result.message;
            
            // アップロード後の更新処理
            await Promise.all([
                refreshUpcomingPosts(),
                updateAllStatistics()
            ]);
            
            // データ管理ステータス更新
            updateDataManagementStatus('ファイル読み込み完了');
            
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        document.getElementById('fileStatus').className = 'status-indicator status-error';
        document.getElementById('fileStatus').textContent = '❌ ' + error.message;
    }
}

// ==========================================================================
// 投稿制御
// ==========================================================================

/**
 * 自動投稿開始
 */
async function startPosting() {
    if (assistantMode) {
        const confirm = window.confirm('現在は投稿補助モードです。自動投稿モードに切り替えて開始しますか？');
        if (confirm) {
            await toggleMode();
        } else {
            return;
        }
    }
    
    try {
        const response = await fetch('/api/start', {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            document.getElementById('controlStatus').className = 'status-indicator status-success';
            document.getElementById('controlStatus').textContent = '🚀 ' + result.message;
            document.getElementById('startBtn').disabled = true;
            document.getElementById('stopBtn').disabled = false;
            
            // 自動投稿開始後の統計更新
            setTimeout(() => updateAllStatistics(), 1000);
            
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        document.getElementById('controlStatus').className = 'status-indicator status-error';
        document.getElementById('controlStatus').textContent = '❌ ' + error.message;
    }
}

/**
 * 投稿停止
 */
async function stopPosting() {
    try {
        const response = await fetch('/api/stop', {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            document.getElementById('controlStatus').className = 'status-indicator status-warning';
            document.getElementById('controlStatus').textContent = '⏹️ ' + result.message;
            document.getElementById('startBtn').disabled = false;
            document.getElementById('stopBtn').disabled = true;
            
            // 停止後の統計更新
            setTimeout(() => updateAllStatistics(), 1000);
        }
    } catch (error) {
        document.getElementById('controlStatus').className = 'status-indicator status-error';
        document.getElementById('controlStatus').textContent = '❌ ' + error.message;
    }
}

// ==========================================================================
// 投稿データ管理
// ==========================================================================

/**
 * 投稿データを手動保存
 */
async function savePostsData() {
    const saveBtn = document.querySelector('.btn-success');
    const originalText = saveBtn.textContent;
    
    try {
        // ボタン状態変更
        saveBtn.textContent = '💾 保存中...';
        saveBtn.disabled = true;
        
        const response = await fetch('/api/save-posts', {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            // 成功時のフィードバック
            saveBtn.textContent = '✅ 保存完了';
            saveBtn.style.background = '#28a745';
            
            alert(`💾 投稿データを保存しました（${result.count}件）`);
            
            // 統計とデータ状況を更新
            await updateAllStatistics();
            updateDataManagementStatus(`最後に保存: ${new Date().toLocaleTimeString('ja-JP')}`);
            
            // 3秒後にボタンを元に戻す
            setTimeout(() => {
                saveBtn.textContent = originalText;
                saveBtn.style.background = '';
                saveBtn.disabled = false;
            }, 3000);
            
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('投稿データ保存エラー:', error);
        alert('投稿データ保存に失敗しました: ' + error.message);
        
        // エラー時はボタンを元に戻す
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
    }
}

/**
 * 投稿データをクリア
 */
async function clearPostsData() {
    const confirm = window.confirm('⚠️ 全ての投稿データを削除します。この操作は取り消せません。\n本当に削除しますか？');
    if (!confirm) return;
    
    const clearBtn = document.querySelector('.btn-danger');
    const originalText = clearBtn.textContent;
    
    try {
        // ボタン状態変更
        clearBtn.textContent = '🗑️ 削除中...';
        clearBtn.disabled = true;
        
        const response = await fetch('/api/clear-posts', {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            // 成功時のフィードバック
            clearBtn.textContent = '✅ 削除完了';
            
            alert('🗑️ 投稿データをクリアしました');
            
            // すべてのUIを更新
            await Promise.all([
                refreshUpcomingPosts(),
                updateAllStatistics()
            ]);
            
            updateDataManagementStatus('データクリア完了');
            
            // 3秒後にボタンを元に戻す
            setTimeout(() => {
                clearBtn.textContent = originalText;
                clearBtn.disabled = false;
            }, 3000);
            
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('投稿データクリアエラー:', error);
        alert('投稿データクリアに失敗しました: ' + error.message);
        
        // エラー時はボタンを元に戻す
        clearBtn.textContent = originalText;
        clearBtn.disabled = false;
    }
}

/**
 * データ管理ステータス更新
 */
function updateDataManagementStatus(message) {
    const statusElement = document.getElementById('dataManagementStatus');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.style.color = '#28a745';
        
        // 5秒後に通常表示に戻す
        setTimeout(() => {
            statusElement.textContent = '投稿データ管理機能';
            statusElement.style.color = '';
        }, 5000);
    }
}

// ==========================================================================
// 管理タブ専用統計更新（レガシー関数・互換性のため残す）
// ==========================================================================

/**
 * 統計情報更新（レガシー関数）
 * @deprecated core.js の updateAllStatistics() を使用してください
 */
async function updateStats() {
    console.warn('⚠️ updateStats() は非推奨です。updateAllStatistics() を使用してください。');
    await updateAllStatistics();
}

// ==========================================================================
// データ管理タブの初期化
// ==========================================================================

/**
 * 管理タブのアクティブ化時の処理
 */
function onManagementTabActive() {
    // 統計情報を最新に更新
    updateAllStatistics();
    
    // データ管理ステータスをリセット
    updateDataManagementStatus('投稿データ管理機能');
    
    console.log('📁 管理タブアクティブ化');
}

// ==========================================================================
// イベントリスナー・初期化
// ==========================================================================

/**
 * 管理機能の初期化
 */
function initializeManagement() {
    // ボタンの初期状態設定
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    
    if (startBtn && stopBtn) {
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }
    
    console.log('⚙️ 管理機能初期化完了');
}

// DOM読み込み完了時の初期化
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        initializeManagement();
    }, 200);
});