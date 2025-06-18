/**
 * 投稿管理 - 直近投稿表示・投稿アクション・統計連動
 * 基本機能版（編集機能は posts-edit.js に分離）
 */

// ==========================================================================
// 直近投稿予定管理
// ==========================================================================

/**
 * 直近投稿予定を取得・表示
 */
async function refreshUpcomingPosts(forceRefresh = false) {
    const container = document.getElementById('upcomingPostsContainer');
    if (!container) return;
    
    // 編集中の場合は強制更新でない限りスキップ
    if (!forceRefresh && window.PostEdit && window.PostEdit.hasActiveEdit()) {
        console.log('📝 編集中のため自動更新をスキップしました');
        return;
    }
    
    container.classList.add('updating');
    
    try {
        const response = await fetch('/api/upcoming-posts?limit=20');
        const result = await response.json();
        
        if (result.success) {
            displayUpcomingPosts(result.posts);
            assistantMode = result.assistantMode;
            updateModeUI();
            
            // 直近投稿タブの統計も更新
            await updateAllStatistics();
            
            const lastUpdated = document.getElementById('lastUpdated');
            if (lastUpdated) {
                const cacheStatus = result.cached ? ' (キャッシュ)' : ' (新規取得)';
                lastUpdated.textContent = `最終更新: ${new Date().toLocaleTimeString('ja-JP')}${cacheStatus}`;
            }
            
            console.log(`📅 直近投稿更新完了: ${result.posts ? result.posts.length : 0}件`);
            
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('直近投稿取得エラー:', error);
        container.innerHTML = `
            <div style="text-align: center; color: #dc3545; padding: 40px;">
                ❌ 読み込みエラー: ${escapeHtml(error.message)}
                <br><br>
                <button class="btn btn-primary" onclick="refreshUpcomingPosts()">
                    🔄 再試行
                </button>
            </div>
        `;
    } finally {
        container.classList.remove('updating');
    }
}

/**
 * 直近投稿をHTMLで表示
 */
function displayUpcomingPosts(posts) {
    const container = document.getElementById('upcomingPostsContainer');
    if (!container) return;
    
    if (!posts || posts.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: #666; padding: 40px;">
                <div style="font-size: 3rem; margin-bottom: 20px;">📭</div>
                <h3>予約中の投稿がありません</h3>
                <p style="margin-top: 10px; color: #999;">
                    Excelファイルをアップロードして投稿を予約してください
                </p>
                <br>
                <button class="btn btn-primary" onclick="switchToTab('management')">
                    📁 ファイルをアップロード
                </button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = posts.map(post => {
        const cardClass = getPostCardClass(post);
        const statusClass = getPostStatusClass(post);
        const scheduleIcon = getScheduleIcon(post.scheduleType, post.datePattern);
        const isEditing = window.PostEdit && window.PostEdit.isEditing(post.id);
        
        return `
            <div class="${cardClass}${isEditing ? ' editing' : ''}" id="post-card-${post.id}">
                <div class="post-header">
                    <div class="post-schedule">
                        <div class="schedule-time">${escapeHtml(post.scheduledTime)} (JST)</div>
                        <div class="${statusClass}">${escapeHtml(post.timeStatus)}</div>
                    </div>
                    <div class="post-actions">
                        <button class="action-btn copy-btn" onclick="copyToClipboardAndEdit(${post.id})" title="投稿内容をコピー・編集">
                            📋 コピー
                        </button>
                        <button class="action-btn posted-btn" onclick="markAsPosted(${post.id})" title="投稿完了をマーク">
                            ✅ 投稿済み
                        </button>
                        <button class="action-btn postpone-btn" onclick="postponePost(${post.id})" title="投稿を延期">
                            ⏰ 延期
                        </button>
                        <button class="action-btn edit-btn${isEditing ? ' editing' : ''}" onclick="toggleEditMode(${post.id})" title="編集モード切り替え">
                            ${isEditing ? '📝 編集中' : '✏️ 編集'}
                        </button>
                        <button class="action-btn delete-btn" onclick="deletePost(${post.id})" title="投稿を削除">
                            🗑️ 削除
                        </button>
                    </div>
                </div>
                
                ${isEditing && window.PostEdit ? window.PostEdit.generateEditArea(post) : generateViewArea(post)}
                
                <div class="post-meta">
                    <div class="pattern-info">
                        <span>${scheduleIcon}</span>
                        <span>${escapeHtml(getPatternDescription(post.datePattern))}</span>
                    </div>
                    <div class="post-id-info">
                        <small>ID: ${post.id}</small>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // 編集機能のイベントリスナー設定（編集モジュールがある場合）
    if (window.PostEdit && window.PostEdit.hasActiveEdit()) {
        window.PostEdit.setupEventListeners();
    }
}

/**
 * 表示用エリアを生成
 */
function generateViewArea(post) {
    return `<div class="post-content">${escapeHtml(post.processedContent)}</div>`;
}

/**
 * 投稿カードのCSSクラスを決定
 */
function getPostCardClass(post) {
    if (post.isPastDue) return 'upcoming-post-card past-due';
    if (post.hasError) return 'upcoming-post-card error';
    return 'upcoming-post-card';
}

/**
 * 投稿ステータスのCSSクラスを決定
 */
function getPostStatusClass(post) {
    if (post.isPastDue) return 'schedule-status past-due';
    if (post.hasError) return 'schedule-status error';
    return 'schedule-status upcoming';
}

// ==========================================================================
// 編集機能橋渡し（posts-edit.js との連携）
// ==========================================================================

/**
 * クリップボードにコピー + 編集モード展開
 */
async function copyToClipboardAndEdit(postId) {
    // 既存のコピー機能を実行
    await copyToClipboard(postId);
    
    // 編集モードを展開（編集モジュールがある場合）
    if (window.PostEdit) {
        await window.PostEdit.toggleEditMode(postId);
    }
}

/**
 * 編集モードの切り替え（編集モジュールに委譲）
 */
async function toggleEditMode(postId) {
    if (window.PostEdit) {
        await window.PostEdit.toggleEditMode(postId);
    } else {
        console.warn('編集モジュールが読み込まれていません');
    }
}

// ==========================================================================
// 投稿アクション
// ==========================================================================

/**
 * クリップボードにコピー（フル処理を要求）
 */
async function copyToClipboard(postId) {
    const button = event.target;
    const originalText = button.textContent;
    const originalClass = button.className;
    
    try {
        // ボタン状態変更
        button.textContent = '🔄 処理中';
        button.classList.add('processing');
        button.disabled = true;
        
        console.log(`📋 投稿ID ${postId} のコピー処理開始`);
        
        const response = await fetch(`/api/processed-content/${postId}`);
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.message);
        }
        
        // クリップボードにコピー
        await navigator.clipboard.writeText(result.content);
        
        // 成功時のフィードバック
        button.textContent = '✅ コピー済み';
        button.className = originalClass.replace('processing', '') + ' copied';
        
        console.log(`📋 クリップボードにコピー完了: 投稿ID ${postId}`);
        console.log(`📝 コピー内容プレビュー: ${result.content.substring(0, 50)}...`);
        
        // 3秒後にボタンを元に戻す
        setTimeout(() => {
            button.textContent = originalText;
            button.className = originalClass;
            button.disabled = false;
        }, 3000);
        
    } catch (error) {
        console.error('コピーエラー:', error);
        
        // エラー時のフィードバック
        button.textContent = '❌ エラー';
        button.className = originalClass;
        
        // エラーメッセージ表示
        showPostActionError(postId, 'コピーに失敗しました: ' + error.message);
        
        // 2秒後にボタンを元に戻す
        setTimeout(() => {
            button.textContent = originalText;
            button.disabled = false;
        }, 2000);
    }
}

/**
 * 投稿済みマーク
 */
async function markAsPosted(postId) {
    const button = event.target;
    const originalText = button.textContent;
    
    try {
        // ボタン状態変更
        button.textContent = '⏳ 処理中';
        button.disabled = true;
        
        console.log(`✅ 投稿ID ${postId} を投稿済みにマーク中`);
        
        const response = await fetch(`/api/mark-posted/${postId}`, {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            // 成功時のフィードバック
            button.textContent = '✅ 完了';
            button.style.background = '#6c757d';
            
            console.log(`✅ 投稿済みマーク完了: ID ${postId}`);
            
            // 投稿カードにアニメーション効果
            const card = document.getElementById(`post-card-${postId}`);
            if (card) {
                card.style.transition = 'all 0.5s ease';
                card.style.opacity = '0.7';
                card.style.transform = 'scale(0.98)';
            }
            
            // 統計情報を即座に更新
            await updateAllStatistics();
            
            // 2秒後に投稿一覧を更新
            setTimeout(async () => {
                await refreshUpcomingPosts();
            }, 2000);
            
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('投稿済みマークエラー:', error);
        
        // エラー時のフィードバック
        button.textContent = originalText;
        button.disabled = false;
        
        showPostActionError(postId, '投稿済みマークに失敗しました: ' + error.message);
    }
}

/**
 * 投稿延期（修正版）
 * event.target の安全な参照に対応
 */
async function postponePost(postId) {
    const customMinutes = prompt('何分延期しますか？\n\n例:\n• 30 → 30分後\n• 60 → 1時間後\n• 1440 → 24時間後', '30');
    if (customMinutes === null) return;
    
    const delayMinutes = parseInt(customMinutes) || 30;
    
    if (delayMinutes < 1 || delayMinutes > 1440) {
        alert('⚠️ 延期時間は1分〜24時間（1440分）の範囲で指定してください');
        return;
    }
    
    // event.target の安全な取得（修正部分）
    const button = event?.target || document.querySelector(`button[onclick*="postponePost(${postId})"]`);
    const originalText = button ? button.textContent : '⏰ 延期';
    
    try {
        // ボタン状態変更（ボタンが存在する場合のみ）
        if (button) {
            button.textContent = '⏰ 延期中';
            button.disabled = true;
        }
        
        console.log(`⏰ 投稿ID ${postId} を ${delayMinutes}分延期中`);
        
        const response = await fetch(`/api/postpone/${postId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ minutes: delayMinutes })
        });
        
        const result = await response.json();
        
        if (result.success) {
            // 成功時のフィードバック
            if (button) {
                button.textContent = '✅ 延期完了';
            }
            
            const hours = Math.floor(delayMinutes / 60);
            const minutes = delayMinutes % 60;
            const timeStr = hours > 0 ? `${hours}時間${minutes}分` : `${minutes}分`;
            
            alert(`📅 ${timeStr}延期しました\n新しい投稿時刻: ${result.newTime || '計算中'}`);
            
            console.log(`⏰ 投稿延期完了: ID ${postId}, 新時刻: ${result.newTime}`);
            
            // 統計情報を更新
            await updateAllStatistics();
            
            // 1秒後に投稿一覧を更新
            setTimeout(async () => {
                await refreshUpcomingPosts();
            }, 1000);
            
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('投稿延期エラー:', error);
        
        // エラー時のフィードバック
        if (button) {
            button.textContent = originalText;
            button.disabled = false;
        }
        
        showPostActionError(postId, '投稿延期に失敗しました: ' + error.message);
    }
}

/**
 * 投稿アクションエラー表示
 */
function showPostActionError(postId, message) {
    const card = document.getElementById(`post-card-${postId}`);
    if (!card) {
        alert(message);
        return;
    }
    
    // エラーメッセージを投稿カードに一時表示
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        background: #f8d7da;
        color: #721c24;
        padding: 10px;
        border-radius: 5px;
        margin-top: 10px;
        font-size: 0.9rem;
        border: 1px solid #f5c6cb;
    `;
    errorDiv.textContent = message;
    
    card.appendChild(errorDiv);
    
    // 5秒後にエラーメッセージを削除
    setTimeout(() => {
        if (errorDiv && errorDiv.parentNode) {
            errorDiv.parentNode.removeChild(errorDiv);
        }
    }, 5000);
}

// ==========================================================================
// 投稿削除機能（NEW）
// ==========================================================================

/**
 * 投稿削除の確認ダイアログとアクション選択
 */
async function showDeleteConfirmDialog(postId) {
    // 投稿内容を取得（表示用）
    const postCard = document.getElementById(`post-card-${postId}`);
    const postContent = postCard?.querySelector('.post-content')?.textContent || '投稿内容を取得できませんでした';
    const previewContent = postContent.length > 50 ? postContent.substring(0, 50) + '...' : postContent;
    
    // カスタムダイアログのHTML作成
    const dialogHTML = `
        <div id="deleteConfirmDialog" style="
            position: fixed; 
            top: 0; left: 0; 
            width: 100%; height: 100%; 
            background: rgba(0,0,0,0.5); 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            z-index: 1000;
            opacity: 0;
            transition: opacity 0.3s ease;
        ">
            <div style="
                background: white; 
                padding: 30px; 
                border-radius: 12px; 
                max-width: 500px; 
                width: 90%;
                box-shadow: 0 8px 32px rgba(0,0,0,0.3);
                transform: scale(0.9);
                transition: transform 0.3s ease;
            ">
                <h3 style="margin: 0 0 20px 0; color: #dc3545; font-size: 1.3rem;">
                    ⚠️ 投稿の処理を選択してください
                </h3>
                
                <div style="
                    background: #f8f9fa; 
                    padding: 15px; 
                    border-radius: 8px; 
                    margin-bottom: 25px;
                    border-left: 4px solid #007bff;
                ">
                    <strong>投稿内容:</strong><br>
                    <span style="color: #666; font-size: 0.9rem;">"${escapeHtml(previewContent)}"</span>
                </div>
                
                <div style="display: grid; gap: 12px; margin-bottom: 25px;">
                    <button id="deletePostBtn" style="
                        padding: 12px 20px; 
                        background: #dc3545; 
                        color: white; 
                        border: none; 
                        border-radius: 6px; 
                        font-weight: 600;
                        cursor: pointer;
                        transition: background 0.3s ease;
                    " onmouseover="this.style.background='#c82333'" onmouseout="this.style.background='#dc3545'">
                        🗑️ 削除 - 投稿を完全に削除します
                    </button>
                    
                    <button id="postponePostBtn" style="
                        padding: 12px 20px; 
                        background: #ffc107; 
                        color: #333; 
                        border: none; 
                        border-radius: 6px; 
                        font-weight: 600;
                        cursor: pointer;
                        transition: background 0.3s ease;
                    " onmouseover="this.style.background='#e0a800'" onmouseout="this.style.background='#ffc107'">
                        ⏰ 延期 - 投稿を延期します
                    </button>
                    
                    <button id="cancelDeleteBtn" style="
                        padding: 12px 20px; 
                        background: #6c757d; 
                        color: white; 
                        border: none; 
                        border-radius: 6px; 
                        font-weight: 600;
                        cursor: pointer;
                        transition: background 0.3s ease;
                    " onmouseover="this.style.background='#5a6268'" onmouseout="this.style.background='#6c757d'">
                        ❌ キャンセル - 何もしません
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // ダイアログをDOMに追加
    document.body.insertAdjacentHTML('beforeend', dialogHTML);
    const dialog = document.getElementById('deleteConfirmDialog');
    const dialogContent = dialog.querySelector('div');
    
    // アニメーション表示
    setTimeout(() => {
        dialog.style.opacity = '1';
        dialogContent.style.transform = 'scale(1)';
    }, 10);
    
    // ボタンイベント設定
    return new Promise((resolve) => {
        const deleteBtn = document.getElementById('deletePostBtn');
        const postponeBtn = document.getElementById('postponePostBtn');
        const cancelBtn = document.getElementById('cancelDeleteBtn');
        
        const closeDialog = (action) => {
            dialog.style.opacity = '0';
            dialogContent.style.transform = 'scale(0.9)';
            setTimeout(() => {
                dialog.remove();
                resolve(action);
            }, 300);
        };
        
        deleteBtn.addEventListener('click', () => closeDialog('delete'));
        postponeBtn.addEventListener('click', () => closeDialog('postpone'));
        cancelBtn.addEventListener('click', () => closeDialog('cancel'));
        
        // 背景クリックでキャンセル
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                closeDialog('cancel');
            }
        });
        
        // Escapeキーでキャンセル
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                document.removeEventListener('keydown', handleEscape);
                closeDialog('cancel');
            }
        };
        document.addEventListener('keydown', handleEscape);
    });
}

/**
 * 投稿削除実行（修正版）
 * エラーハンドリングとデバッグ情報を追加
 */
async function executePostDelete(postId) {
    try {
        console.log(`🗑️ 投稿ID ${postId} を削除中`);
        
        // DELETEリクエストの詳細ログ
        const url = `/api/delete-post/${postId}`;
        console.log('削除API URL:', url);
        
        const response = await fetch(url, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        console.log('削除API レスポンス status:', response.status);
        console.log('削除API レスポンス statusText:', response.statusText);
        
        // レスポンスのContent-Typeを確認
        const contentType = response.headers.get('content-type');
        console.log('削除API Content-Type:', contentType);
        
        if (!response.ok) {
            // HTTPエラーの場合、レスポンスの内容を確認
            const errorText = await response.text();
            console.error('削除API HTTPエラー内容:', errorText);
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // JSONパース前にレスポンスの内容を確認
        const responseText = await response.text();
        console.log('削除API レスポンス内容:', responseText);
        
        let result;
        try {
            result = JSON.parse(responseText);
        } catch (parseError) {
            console.error('JSON パースエラー:', parseError);
            console.error('レスポンス内容:', responseText);
            throw new Error('サーバーから無効なレスポンスが返されました');
        }
        
        if (result.success) {
            console.log(`✅ 投稿削除完了: ID ${postId}`);
            
            // 投稿カードにアニメーション効果
            const card = document.getElementById(`post-card-${postId}`);
            if (card) {
                card.style.transition = 'all 0.5s ease';
                card.style.opacity = '0';
                card.style.transform = 'scale(0.8)';
            }
            
            // 統計情報を即座に更新
            await updateAllStatistics();
            
            // 1秒後に投稿一覧を更新
            setTimeout(async () => {
                await refreshUpcomingPosts(true); // 強制更新
            }, 1000);
            
            // 成功通知
            alert(`✅ 投稿を削除しました\n残り投稿数: ${result.remainingCount || '不明'}件`);
            
        } else {
            throw new Error(result.message || '削除に失敗しました');
        }
    } catch (error) {
        console.error('投稿削除エラー:', error);
        
        // 詳細なエラー情報をログ出力
        if (error.message.includes('<!DOCTYPE')) {
            console.error('HTMLページが返されました。APIルートが正しく設定されていない可能性があります。');
            alert(`❌ 削除に失敗しました: APIエラー（サーバー設定を確認してください）`);
        } else {
            alert(`❌ 削除に失敗しました: ${error.message}`);
        }
    }
}

/**
 * 投稿削除のメイン処理（ダイアログ → アクション実行）
 */
async function deletePost(postId) {
    try {
        // 確認ダイアログを表示
        const action = await showDeleteConfirmDialog(postId);
        
        switch (action) {
            case 'delete':
                await executePostDelete(postId);
                break;
            case 'postpone':
                await postponePost(postId); // 既存の延期機能を使用
                break;
            case 'cancel':
                console.log(`❌ 投稿削除キャンセル: ID ${postId}`);
                break;
        }
    } catch (error) {
        console.error('削除処理エラー:', error);
        alert(`エラーが発生しました: ${error.message}`);
    }
}

// ==========================================================================
// 投稿管理ユーティリティ
// ==========================================================================

/**
 * 投稿数をカウント
 */
function countPostsByStatus(posts) {
    if (!posts || !Array.isArray(posts)) {
        return { total: 0, upcoming: 0, pastDue: 0, error: 0 };
    }
    
    return {
        total: posts.length,
        upcoming: posts.filter(p => !p.isPastDue && !p.hasError).length,
        pastDue: posts.filter(p => p.isPastDue).length,
        error: posts.filter(p => p.hasError).length
    };
}

/**
 * 投稿リストのフィルタリング
 */
function filterPosts(posts, filterType = 'all') {
    if (!posts || !Array.isArray(posts)) return [];
    
    switch (filterType) {
        case 'upcoming':
            return posts.filter(p => !p.isPastDue && !p.hasError);
        case 'pastdue':
            return posts.filter(p => p.isPastDue);
        case 'error':
            return posts.filter(p => p.hasError);
        default:
            return posts;
    }
}

/**
 * 投稿内容のプレビュー生成
 */
function generatePostPreview(content, maxLength = 100) {
    if (!content) return '';
    
    const preview = content.length > maxLength 
        ? content.substring(0, maxLength) + '...'
        : content;
    
    return escapeHtml(preview);
}

// ==========================================================================
// 直近投稿タブ専用機能
// ==========================================================================

/**
 * 直近投稿タブの初期化
 */
function initializeUpcomingPostsTab() {
    console.log('📅 直近投稿タブ初期化');
    
    // 初期データ読み込み
    refreshUpcomingPosts();
    
    // 統計情報の初期表示
    updateAllStatistics();
}

/**
 * 直近投稿タブがアクティブになった時の処理
 */
function onUpcomingTabActive() {
    console.log('📅 直近投稿タブアクティブ化');
    
    // データを最新に更新
    refreshUpcomingPosts();
    
    // 統計情報も更新
    updateAllStatistics();
}

// ==========================================================================
// イベントリスナー・初期化
// ==========================================================================

/**
 * 投稿管理機能の初期化
 */
function initializePostsManagement() {
    // キーボードショートカット設定
    document.addEventListener('keydown', function(e) {
        // Ctrl+R で投稿一覧更新
        if (e.ctrlKey && e.key === 'r') {
            e.preventDefault();
            refreshUpcomingPosts();
        }
        
        // Escキーでアクション処理をキャンセル（将来的な拡張用）
        if (e.key === 'Escape') {
            // 編集モードをキャンセル
            if (window.PostEdit && window.PostEdit.hasActiveEdit()) {
                window.PostEdit.cancelCurrentEdit();
            }
            console.log('⏹️ アクション処理キャンセル');
        }
    });
    
    console.log('📝 投稿管理機能初期化完了');
}

/**
 * DOM読み込み完了時の初期化
 */
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        initializePostsManagement();
    }, 250);
});

// ==========================================================================
// Yahoo Finance 手動取得機能（直近投稿タブ用）
// ==========================================================================

/**
 * 直近投稿タブ用: Yahoo Finance 手動取得ボタンの実装
 * 動的変数の即座反映を重視した設計
 */
async function fetchYahooStocksForDynamicVars() {
    const button = event.target;
    const originalText = button.textContent;
    
    try {
        // ボタン状態変更
        button.textContent = '📈 取得中...';
        button.disabled = true;
        button.style.background = 'rgba(255,193,7,0.8)';
        
        console.log('📈 Yahoo Finance 手動取得開始（動的変数用）');
        
        const response = await fetch('/api/fetch-yahoo-stocks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            // 成功時のフィードバック
            button.textContent = '✅ 取得完了';
            button.style.background = 'rgba(40,167,69,0.8)';
            
            const stockData = result.stockData;
            const updateInfo = result.fromCache ? ' (既存データ)' : ' (新規取得)';
            
            // 動的変数状況を更新
            updateDynamicVarStockStatus(stockData, updateInfo);
            
            // 投稿一覧を再描画（動的変数の反映確認）
            //await refreshUpcomingPosts();
            // UpcomingPostsのキャッシュを強制クリア
            console.log('💾 Yahoo Finance更新: キャッシュをクリアして再取得');
            
            // 投稿一覧を強制的に新規取得（キャッシュを使わない）
            await refreshUpcomingPosts(true); // 強制更新フラグ追加
            
            // 短いフィードバックメッセージ
            showStockUpdateNotification(stockData, updateInfo);
            
            console.log('✅ Yahoo Finance 手動取得完了 - 投稿一覧を更新');
            
        } else {
            throw new Error(result.message || 'データ取得に失敗しました');
        }
        
    } catch (error) {
        console.error('❌ Yahoo Finance 手動取得エラー:', error);
        
        // エラー時のフィードバック
        button.textContent = '❌ 取得失敗';
        button.style.background = 'rgba(220,53,69,0.8)';
        
        // エラー状況を表示
        updateDynamicVarStockStatus(null, null, error.message);
        
    } finally {
        // 3秒後にボタンを元に戻す
        setTimeout(() => {
            button.textContent = originalText;
            button.style.background = 'rgba(255,255,255,0.2)';
            button.disabled = false;
        }, 3000);
    }
}

/**
 * 動的変数用株価データ状況表示の更新
 */
function updateDynamicVarStockStatus(stockData, updateInfo, errorMessage) {
    const statusElement = document.getElementById('dynamicVarStockStatus');
    if (!statusElement) return;
    
    if (errorMessage) {
        // エラー時の表示
        statusElement.innerHTML = `
            <div style="text-align: center; color: #dc3545;">
                <div style="font-size: 0.9rem; margin-bottom: 8px;">
                    ❌ 株価取得エラー
                </div>
                <div style="font-size: 0.8rem; opacity: 0.8;">
                    ${escapeHtml(errorMessage)}
                </div>
                <div style="font-size: 0.8rem; margin-top: 5px; color: #666;">
                    しばらく時間をおいて再度お試しください
                </div>
            </div>
        `;
        return;
    }
    
    if (stockData) {
        const lastUpdated = new Date(stockData.lastUpdated).toLocaleString('ja-JP', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const sourceIcon = stockData.status === 'success' ? '✅' : '⚠️';
        const sourceText = stockData.status === 'success' ? '最新取得' : 'デフォルト値';
        
        statusElement.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; text-align: center;">
                <div style="background: white; padding: 10px; border-radius: 6px; border: 1px solid #28a745;">
                    <div style="font-weight: 600; color: #28a745; margin-bottom: 4px;">📊 {NIKKEI}</div>
                    <div style="font-size: 1.1rem; font-weight: bold;">${stockData.nikkei}</div>
                </div>
                <div style="background: white; padding: 10px; border-radius: 6px; border: 1px solid #17a2b8;">
                    <div style="font-weight: 600; color: #17a2b8; margin-bottom: 4px;">📈 {TOPIX}</div>
                    <div style="font-size: 1.1rem; font-weight: bold;">${stockData.topix}</div>
                </div>
            </div>
            <div style="text-align: center; margin-top: 8px; font-size: 0.8rem; color: #666;">
                ${sourceIcon} ${sourceText}${updateInfo} | 更新: ${lastUpdated}
            </div>
        `;
    }
}

/**
 * 株価更新通知（控えめなトースト風）
 */
function showStockUpdateNotification(stockData, updateInfo) {
    // 既存の通知があれば削除
    const existingNotification = document.getElementById('stockUpdateNotification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // 通知要素を作成
    const notification = document.createElement('div');
    notification.id = 'stockUpdateNotification';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #28a745;
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1000;
        font-size: 0.9rem;
        font-weight: 600;
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease;
    `;
    
    notification.innerHTML = `
        📈 株価データ更新完了${updateInfo}<br>
        <span style="font-size: 0.8rem; opacity: 0.9;">投稿一覧に反映されました</span>
    `;
    
    document.body.appendChild(notification);
    
    // アニメーション表示
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // 3秒後に非表示
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

/**
 * ページ読み込み時に既存の株価データを表示
 */
function initializeDynamicVarStockStatus() {
    // 既存の株価データがあれば表示
    fetch('/api/get-stored-stock-data')
        .then(response => response.json())
        .then(result => {
            if (result.success && result.stockData) {
                updateDynamicVarStockStatus(result.stockData, ' (保存済み)');
            }
        })
        .catch(error => {
            console.log('保存済み株価データの取得:', error.message);
        });
}

// ==========================================================================
// v1.11新機能: クイック投稿追加機能
// ==========================================================================

/**
 * クイック投稿追加
 */
async function addQuickPost() {
    const content = document.getElementById('quickAddContent').value.trim();
    const baseTime = document.getElementById('quickAddTime').value;
    const datePattern = document.getElementById('quickAddPattern').value;
    const randomMinutes = parseInt(document.getElementById('quickAddRandom').value) || 0;
    
    const button = document.getElementById('quickAddBtn');
    const section = document.querySelector('.quick-add-section');
    const originalText = button.textContent;
    
    // バリデーション
    if (!content) {
        showQuickAddError('投稿内容を入力してください');
        return;
    }
    
    if (content.length > 280) {
        showQuickAddError('投稿内容は280文字以内で入力してください');
        return;
    }
    
    if (!baseTime) {
        showQuickAddError('投稿時刻を設定してください');
        return;
    }
    
    if (randomMinutes < 0 || randomMinutes > 60) {
        showQuickAddError('ランダム分数は0〜60の範囲で設定してください');
        return;
    }
    
    try {
        // UI状態変更
        button.textContent = '📝 追加中...';
        button.disabled = true;
        section.classList.add('adding');
        
        console.log(`📝 クイック投稿追加開始: "${content.substring(0, 30)}..."`);
        
        const response = await fetch('/api/quick-add-post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content,
                baseTime,
                datePattern,
                randomMinutes
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            // 成功時の処理
            button.textContent = '✅ 追加完了';
            section.classList.remove('adding');
            section.classList.add('success');
            
            // フォームクリア
            clearQuickAddForm();
            
            // UI更新
            await refreshUpcomingPosts(true); // 強制更新
            await updateAllStatistics();
            
            // 成功通知
            showQuickAddSuccess(result.post, result.nextPostTimeJST);
            
            console.log(`✅ クイック投稿追加完了: ID ${result.post.id}`);
            
        } else {
            throw new Error(result.message);
        }
        
    } catch (error) {
        console.error('❌ クイック投稿追加エラー:', error);
        showQuickAddError(`投稿追加に失敗しました: ${error.message}`);
        
        // エラー時の状態復旧
        section.classList.remove('adding');
        
    } finally {
        // ボタン状態復旧（3秒後）
        setTimeout(() => {
            button.textContent = originalText;
            button.disabled = false;
            section.classList.remove('success');
        }, 3000);
    }
}

/**
 * クイック投稿フォームをクリア
 */
function clearQuickAddForm() {
    document.getElementById('quickAddContent').value = '';
    document.getElementById('quickAddTime').value = '09:00';
    document.getElementById('quickAddPattern').value = '平日';
    document.getElementById('quickAddRandom').value = '0';
    updateQuickAddCharCounter();
}

/**
 * 文字数カウンター更新
 */
function updateQuickAddCharCounter() {
    const textarea = document.getElementById('quickAddContent');
    const counter = document.getElementById('quickAddCharCounter');
    
    if (textarea && counter) {
        const length = textarea.value.length;
        counter.textContent = `${length}/280`;
        
        counter.className = 'char-counter';
        if (length > 240) counter.classList.add('warning');
        if (length > 280) counter.classList.add('error');
    }
}

/**
 * クイック投稿追加の成功通知
 */
function showQuickAddSuccess(post, nextTimeJST) {
    const message = `✅ 投稿を追加しました！
    
投稿内容: "${post.content.substring(0, 50)}${post.content.length > 50 ? '...' : ''}"
投稿パターン: ${getPatternDescription(post.datePattern)}
次回投稿予定: ${nextTimeJST}

直近投稿予定に表示されました。`;
    
    alert(message);
}

/**
 * クイック投稿追加のエラー表示
 */
function showQuickAddError(message) {
    // 一時的なエラー表示
    const existingError = document.querySelector('.quick-add-error');
    if (existingError) {
        existingError.remove();
    }
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'quick-add-error';
    errorDiv.style.cssText = `
        background: rgba(220, 53, 69, 0.9);
        color: white;
        padding: 10px;
        border-radius: 6px;
        margin-top: 10px;
        font-size: 0.9rem;
        text-align: center;
        animation: slideDown 0.3s ease;
    `;
    errorDiv.textContent = message;
    
    const quickAddSection = document.querySelector('.quick-add-section');
    quickAddSection.appendChild(errorDiv);
    
    // 5秒後にエラーメッセージを削除
    setTimeout(() => {
        if (errorDiv && errorDiv.parentNode) {
            errorDiv.style.opacity = '0';
            errorDiv.style.transform = 'translateY(-10px)';
            setTimeout(() => {
                errorDiv.remove();
            }, 300);
        }
    }, 5000);
}

/**
 * 現在時刻を基準にした推奨時刻を設定
 */
function setRecommendedTime() {
    const now = new Date();
    const timeInput = document.getElementById('quickAddTime');
    
    // 現在時刻の1時間後を推奨
    const recommendedTime = new Date(now.getTime() + 60 * 60 * 1000);
    const hours = recommendedTime.getHours().toString().padStart(2, '0');
    const minutes = recommendedTime.getMinutes().toString().padStart(2, '0');
    
    timeInput.value = `${hours}:${minutes}`;
}

/**
 * 動的変数のヘルプを表示
 */
function showDynamicVariablesHelp() {
    const helpMessage = `動的変数について:

📅 日時系:
{NOW} - 現在日時
{DATE} - 今日の日付
{TIME} - 現在時刻
{WEEKDAY} - 曜日

🌤️ 天気系（APIキー設定時）:
{WEATHER} - 天気
{TEMP} - 現在気温
{TEMP_MAX} - 最高気温

📈 金融系:
{NIKKEI} - 日経平均
{TOPIX} - TOPIX
{USDJPY} - ドル円

例: "おはようございます！今日は{WEEKDAY}曜日、{WEATHER}で{TEMP}です。"`;
    
    alert(helpMessage);
}

// ==========================================================================
// イベントリスナー設定の追加
// ==========================================================================

// 既存のDOMContentLoadedイベントリスナーに追加
// initializePostsManagement関数の中で呼び出すか、新しく追加

/**
 * クイック投稿追加のイベントリスナー設定
 */
function initializeQuickAddFeature() {
    // 文字数カウンターのイベントリスナー
    const textarea = document.getElementById('quickAddContent');
    if (textarea) {
        textarea.addEventListener('input', updateQuickAddCharCounter);
        updateQuickAddCharCounter(); // 初期化
        
        // Enterキー + Ctrl/Cmdで投稿追加
        textarea.addEventListener('keydown', function(e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                addQuickPost();
            }
        });
    }
    
    // 推奨時刻ボタン（オプション）
    const timeInput = document.getElementById('quickAddTime');
    if (timeInput) {
        // ダブルクリックで推奨時刻設定
        timeInput.addEventListener('dblclick', setRecommendedTime);
    }
    
    // ヘルプボタン（オプション）
    const helpButton = document.querySelector('.quick-add-help small');
    if (helpButton) {
        helpButton.style.cursor = 'pointer';
        helpButton.addEventListener('click', showDynamicVariablesHelp);
    }
    
    console.log('✅ クイック投稿追加機能: イベントリスナー設定完了');
}

// 既存のDOMContentLoadedイベントに追加
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        initializeQuickAddFeature();
    }, 350); // 既存の初期化の後に実行
});

// ==========================================================================
// v1.12新機能: 動的変数ドロップダウン機能
// ==========================================================================

/**
 * 動的変数をクリップボードにコピー＆テキストエリアに挿入
 */
async function copyDynamicVariable(selectElement, targetTextareaId) {
    const selectedValue = selectElement.value;
    
    if (!selectedValue) {
        return; // 空の選択肢の場合は何もしない
    }
    
    const textarea = document.getElementById(targetTextareaId);
    const helper = selectElement.closest('.dynamic-vars-helper');
    
    try {
        // クリップボードにコピー
        await navigator.clipboard.writeText(selectedValue);
        
        // テキストエリアにも挿入（カーソル位置に）
        if (textarea) {
            insertTextAtCursor(textarea, selectedValue);
            
            // 文字数カウンター更新（クイック投稿の場合）
            if (targetTextareaId === 'quickAddContent') {
                updateQuickAddCharCounter();
            }
            
            // フォーカスをテキストエリアに戻す
            textarea.focus();
        }
        
        // 成功時のビジュアルフィードバック
        showDynamicVarCopySuccess(helper, selectedValue);
        
        // セレクトボックスをリセット
        selectElement.selectedIndex = 0;
        
        console.log(`📋 動的変数コピー完了: ${selectedValue}`);
        
    } catch (error) {
        console.error('❌ 動的変数コピーエラー:', error);
        showDynamicVarCopyError(helper, 'コピーに失敗しました');
        
        // エラー時もセレクトボックスをリセット
        selectElement.selectedIndex = 0;
    }
}

/**
 * テキストエリアのカーソル位置にテキストを挿入
 */
function insertTextAtCursor(textarea, text) {
    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;
    const beforeText = textarea.value.substring(0, startPos);
    const afterText = textarea.value.substring(endPos);
    
    // カーソル位置にテキストを挿入
    textarea.value = beforeText + text + afterText;
    
    // カーソル位置を挿入したテキストの後に移動
    const newCursorPos = startPos + text.length;
    textarea.setSelectionRange(newCursorPos, newCursorPos);
    
    // change イベントを発火
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * 動的変数コピー成功時のフィードバック
 */
function showDynamicVarCopySuccess(helper, variable) {
    // アニメーション効果
    helper.classList.add('copied');
    
    // 一時的な成功メッセージ
    const tip = helper.querySelector('.dynamic-vars-tip');
    const originalText = tip.textContent;
    
    tip.textContent = `✅ ${variable} をコピーしました！`;
    tip.style.color = 'rgba(40, 167, 69, 1)';
    tip.style.fontWeight = '600';
    
    // 2秒後に元に戻す
    setTimeout(() => {
        helper.classList.remove('copied');
        tip.textContent = originalText;
        tip.style.color = '';
        tip.style.fontWeight = '';
    }, 2000);
}

/**
 * 動的変数コピーエラー時のフィードバック
 */
function showDynamicVarCopyError(helper, message) {
    const tip = helper.querySelector('.dynamic-vars-tip');
    const originalText = tip.textContent;
    
    tip.textContent = `❌ ${message}`;
    tip.style.color = 'rgba(220, 53, 69, 1)';
    tip.style.fontWeight = '600';
    
    // 3秒後に元に戻す
    setTimeout(() => {
        tip.textContent = originalText;
        tip.style.color = '';
        tip.style.fontWeight = '';
    }, 3000);
}

/**
 * 動的変数の説明ダイアログを表示
 */
function showDynamicVariablesDetailHelp() {
    const helpMessage = `🔧 動的変数について:

📅 日時系（常時利用可能）:
- {NOW} - 現在日時（例: 2025/6/15 14:30）
- {DATE} - 今日の日付（例: 2025/6/15）
- {TIME} - 現在時刻（例: 14:30）
- {WEEKDAY} - 曜日（例: 日曜日）
- {YEAR} - 年（例: 2025）
- {MONTH} - 月（例: 6）
- {DAY} - 日（例: 15）

🌤️ 天気系（OpenWeatherMap APIキー設定時）:
- {WEATHER} - 天気（例: 晴れ）
- {TEMP} - 現在気温（例: 25°C）
- {TEMP_MAX} - 最高気温（例: 28°C）
- {HUMIDITY} - 湿度（例: 60%）
- {WIND_SPEED} - 風速（例: 2.0m/s）
- {PRESSURE} - 気圧（例: 1013hPa）
- {CITY} - 都市名（例: Tokyo）

📈 金融系:
- {NIKKEI} - 日経平均（例: 38,750円）
- {TOPIX} - TOPIX（例: 2,765pt）
- {UpdateTime} - 株価更新時刻（例: 6/15 14:30）
- {DOW} - NYダウ（例: 42,800ドル）
- {NASDAQ} - NASDAQ（例: 19,200pt）
- {SP500} - S&P500（例: 5,850pt）
- {USDJPY} - ドル円（例: 151.50円）
- {EURJPY} - ユーロ円（例: 163.20円）

💡 使用例:
「おはようございます！今日は{WEEKDAY}、{WEATHER}で{TEMP}です。
日経平均は{NIKKEI}となっています。（{UpdateTime}時点）」

→ 「おはようございます！今日は月曜日、晴れで25°Cです。
日経平均は38,750円となっています。（6/15 14:30時点）」`;
    
    alert(helpMessage);
}

/**
 * よく使う動的変数の組み合わせを提供
 */
function getCommonDynamicVariableCombinations() {
    return [
        {
            name: '基本の挨拶',
            template: 'おはようございます！今日は{WEEKDAY}曜日です。'
        },
        {
            name: '天気付き挨拶',
            template: 'おはようございます！今日は{WEEKDAY}曜日、{WEATHER}で{TEMP}です。'
        },
        {
            name: '株価情報',
            template: '日経平均: {NIKKEI}、TOPIX: {TOPIX}（{UpdateTime}時点）'
        },
        {
            name: '為替情報',
            template: 'USD/JPY: {USDJPY}、EUR/JPY: {EURJPY}'
        },
        {
            name: '総合情報',
            template: '{DATE} {TIME} 現在\n天気: {WEATHER} {TEMP}\n日経: {NIKKEI}'
        }
    ];
}

// ==========================================================================
// 編集モード用の動的変数ドロップダウン統合
// ==========================================================================

/**
 * 編集モード用の動的変数ドロップダウンHTML生成
 */
function generateEditModeDynamicVarsDropdown(textareaId) {
    return `
        <div class="dynamic-vars-helper">
            <label for="${textareaId}VarsDropdown">📝 動的変数:</label>
            <select id="${textareaId}VarsDropdown" onchange="copyDynamicVariable(this, '${textareaId}')">
                <option value="">変数を選択してコピー</option>
                <optgroup label="📅 日時">
                    <option value="{NOW}">{NOW} - 現在日時</option>
                    <option value="{DATE}">{DATE} - 今日の日付</option>
                    <option value="{TIME}">{TIME} - 現在時刻</option>
                    <option value="{WEEKDAY}">{WEEKDAY} - 曜日</option>
                    <option value="{YEAR}">{YEAR} - 年</option>
                    <option value="{MONTH}">{MONTH} - 月</option>
                    <option value="{DAY}">{DAY} - 日</option>
                </optgroup>
                <optgroup label="🌤️ 天気（APIキー設定時）">
                    <option value="{WEATHER}">{WEATHER} - 天気</option>
                    <option value="{TEMP}">{TEMP} - 現在気温</option>
                    <option value="{TEMP_MAX}">{TEMP_MAX} - 最高気温</option>
                    <option value="{HUMIDITY}">{HUMIDITY} - 湿度</option>
                    <option value="{WIND_SPEED}">{WIND_SPEED} - 風速</option>
                    <option value="{PRESSURE}">{PRESSURE} - 気圧</option>
                    <option value="{CITY}">{CITY} - 都市名</option>
                </optgroup>
                <optgroup label="📈 金融">
                    <option value="{NIKKEI}">{NIKKEI} - 日経平均</option>
                    <option value="{TOPIX}">{TOPIX} - TOPIX</option>
                    <option value="{UpdateTime}">{UpdateTime} - 株価更新時刻</option>
                    <option value="{DOW}">{DOW} - NYダウ</option>
                    <option value="{NASDAQ}">{NASDAQ} - NASDAQ</option>
                    <option value="{SP500}">{SP500} - S&P500</option>
                    <option value="{USDJPY}">{USDJPY} - ドル円</option>
                    <option value="{EURJPY}">{EURJPY} - ユーロ円</option>
                </optgroup>
            </select>
            <small class="dynamic-vars-tip">💡 選択すると自動でクリップボードにコピー＆テキストに挿入されます</small>
        </div>
    `;
}

// ==========================================================================
// デバッグ・開発用関数
// ==========================================================================

/**
 * サーバー状態確認用のデバッグ関数
 */
async function debugServerStatus() {
    try {
        console.log('🔍 サーバー状態確認開始');
        
        // 基本的なAPIエンドポイントをテスト
        const testEndpoints = [
            '/api/status',
            '/api/upcoming-posts'
        ];
        
        for (const endpoint of testEndpoints) {
            try {
                const response = await fetch(endpoint);
                console.log(`${endpoint}: ${response.status} ${response.statusText}`);
            } catch (error) {
                console.error(`${endpoint}: エラー`, error.message);
            }
        }
        
        console.log('🔍 サーバー状態確認完了');
    } catch (error) {
        console.error('サーバー状態確認エラー:', error);
    }
}

// 投稿管理のデバッグ用関数
window.postsDebug = {
    refresh: refreshUpcomingPosts,
    copyPost: copyToClipboard,
    markPosted: markAsPosted,
    postpone: postponePost,
    countPosts: countPostsByStatus,
    filterPosts: filterPosts,
    initTab: initializeUpcomingPostsTab
};