/**
 * 投稿編集機能専用モジュール
 * WebUI上でのテキスト編集・テンプレート編集・プレビュー機能
 */

// PostEdit グローバルオブジェクトとして編集機能を管理
window.PostEdit = (function() {
    
    // ==========================================================================
    // 編集機能用プライベート変数
    // ==========================================================================
    
    let currentEditingPostId = null;
    let currentEditMode = 'processed'; // 'processed' or 'template'
    let originalPostData = null;
    
    // ==========================================================================
    // 公開メソッド
    // ==========================================================================
    
    return {
        /**
         * 編集中かどうかチェック
         */
        isEditing: function(postId) {
            return currentEditingPostId === postId;
        },
        
        /**
         * アクティブな編集があるかチェック
         */
        hasActiveEdit: function() {
            return currentEditingPostId !== null;
        },
        
        /**
         * 現在の編集をキャンセル
         */
        cancelCurrentEdit: function() {
            if (currentEditingPostId) {
                this.cancelEdit(currentEditingPostId);
            }
        },
        
        /**
         * 編集モードの切り替え
         */
        toggleEditMode: async function(postId) {
            if (currentEditingPostId === postId) {
                // 編集モード終了
                this.cancelEdit(postId);
                return;
            }
            
            // 他の編集を終了
            if (currentEditingPostId) {
                this.cancelEdit(currentEditingPostId);
            }
            
            try {
                // 元データを取得
                const response = await fetch(`/api/post-template/${postId}`);
                const result = await response.json();
                
                if (!result.success) {
                    throw new Error(result.message);
                }
                
                originalPostData = result.post;
                currentEditingPostId = postId;
                currentEditMode = 'processed';
                
                // 投稿一覧を再描画
                await refreshUpcomingPosts(true); // 強制更新フラグを追加
                
                console.log(`✏️ 編集モード開始: ID ${postId}`);
                
            } catch (error) {
                console.error('編集モード開始エラー:', error);
                alert(`編集モード開始エラー: ${error.message}`);
            }
        },
        
        /**
         * 編集モードのキャンセル
         */
        cancelEdit: function(postId) {
            currentEditingPostId = null;
            originalPostData = null;
            currentEditMode = 'processed';
            
            // 投稿一覧を再描画
            refreshUpcomingPosts(true); // 強制更新フラグを追加
            
            console.log(`❌ 編集キャンセル: ID ${postId}`);
        },
        
        /**
         * 編集エリアのHTMLを生成
         */
        generateEditArea: function(post) {
            const content = currentEditMode === 'processed' ? post.processedContent : (originalPostData ? originalPostData.content : post.originalContent);
            
            return `
                <div class="edit-mode-toggle">
                    <h4>📝 編集モード</h4>
                    <div class="mode-options">
                        <div class="mode-option">
                            <input type="radio" id="mode-processed-${post.id}" name="editMode-${post.id}" value="processed" ${currentEditMode === 'processed' ? 'checked' : ''}>
                            <label for="mode-processed-${post.id}">評価後テキスト編集</label>
                        </div>
                        <div class="mode-option">
                            <input type="radio" id="mode-template-${post.id}" name="editMode-${post.id}" value="template" ${currentEditMode === 'template' ? 'checked' : ''}>
                            <label for="mode-template-${post.id}">テンプレート編集</label>
                        </div>
                    </div>
                </div>
                
                <div class="edit-area">
                    <textarea class="edit-textarea" id="edit-textarea-${post.id}" placeholder="投稿内容を編集...">${escapeHtml(content)}</textarea>
                    <div class="char-counter" id="char-counter-${post.id}">文字数: 0/280</div>

                    <!-- v1.12新機能: 編集モード用動的変数ドロップダウン -->
                    <div class="dynamic-vars-helper">
                        <label for="edit-vars-dropdown-${post.id}">📝 動的変数:</label>
                        <select id="edit-vars-dropdown-${post.id}" onchange="copyDynamicVariable(this, 'edit-textarea-${post.id}')">
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

                    ${currentEditMode === 'template' ? this.generateScheduleEditor(post) : ''}
                    
                    <div class="preview-area" id="preview-area-${post.id}">
                        <h6>🔍 プレビュー</h6>
                        <div class="preview-content" id="preview-content-${post.id}"></div>
                    </div>
                    
                    <div class="edit-controls">
                        ${currentEditMode === 'template' ? '<button class="btn btn-preview" onclick="window.PostEdit.previewTemplate(' + post.id + ')">🔍 プレビュー</button>' : ''}
                        <button class="btn btn-copy" onclick="window.PostEdit.copyEditedText(${post.id})">📋 コピー</button>
                        <button class="btn btn-save" onclick="window.PostEdit.saveEditedPost(${post.id})">💾 保存</button>
                        <button class="btn btn-cancel" onclick="window.PostEdit.cancelEdit(${post.id})">❌ キャンセル</button>
                    </div>
                </div>
            `;
        },
        
        /**
         * スケジュール編集エリアを生成（毎日対応版）
         */
        generateScheduleEditor: function(post) {
            const postData = originalPostData || post;
            
            return `
                <div class="schedule-editor">
                    <h5>⏰ スケジュール設定</h5>
                    <div class="schedule-fields">
                        <div class="schedule-field">
                            <label for="edit-basetime-${post.id}">基準時刻</label>
                            <input type="time" id="edit-basetime-${post.id}" value="${postData.baseTime || '09:00'}">
                        </div>
                        <div class="schedule-field">
                            <label for="edit-random-${post.id}">ランダム分</label>
                            <input type="number" id="edit-random-${post.id}" min="0" max="60" value="${postData.randomMinutes || 0}">
                        </div>
                        <div class="schedule-field">
                            <label for="edit-pattern-${post.id}">日付パターン</label>
                            <select id="edit-pattern-${post.id}">
                                <option value="毎日" ${postData.datePattern === '毎日' ? 'selected' : ''}>毎日</option>
                                <option value="平日" ${postData.datePattern === '平日' ? 'selected' : ''}>平日</option>
                                <option value="土日" ${postData.datePattern === '土日' ? 'selected' : ''}>土日</option>
                                <option value="日" ${postData.datePattern === '日' ? 'selected' : ''}>日曜日</option>
                                <option value="月" ${postData.datePattern === '月' ? 'selected' : ''}>月曜日</option>
                                <option value="火" ${postData.datePattern === '火' ? 'selected' : ''}>火曜日</option>
                                <option value="水" ${postData.datePattern === '水' ? 'selected' : ''}>水曜日</option>
                                <option value="木" ${postData.datePattern === '木' ? 'selected' : ''}>木曜日</option>
                                <option value="金" ${postData.datePattern === '金' ? 'selected' : ''}>金曜日</option>
                                <option value="土" ${postData.datePattern === '土' ? 'selected' : ''}>土曜日</option>
                            </select>
                        </div>
                    </div>
                </div>
            `;
        },
        
        /**
         * 編集モード切り替え（評価後 ⇔ テンプレート）
         */
        switchEditMode: async function(postId, mode) {
            if (currentEditMode === mode) return;
            
            currentEditMode = mode;
            
            // 投稿一覧を再描画
            await refreshUpcomingPosts(true); // 強制更新フラグを追加
            
            console.log(`🔄 編集モード切り替え: ${mode}`);
        },
        
        /**
         * 編集中テキストをクリップボードにコピー
         */
        copyEditedText: async function(postId) {
            const textarea = document.getElementById(`edit-textarea-${postId}`);
            if (!textarea) return;
            
            try {
                await navigator.clipboard.writeText(textarea.value);
                
                // ボタンのフィードバック
                //const button = event.target;
                const button = event?.target || document.querySelector(`button[onclick*="copyEditedText(${postId})"]`);  // 安全な参照
                const originalText = button.textContent;
                button.textContent = '✅ コピー済み';
                button.style.background = '#6c757d';
                
                setTimeout(() => {
                    button.textContent = originalText;
                    button.style.background = '';
                }, 2000);
                
                console.log(`📋 編集中テキストコピー完了: ID ${postId}`);
                
            } catch (error) {
                console.error('編集中テキストコピーエラー:', error);
                alert(`コピーエラー: ${error.message}`);
            }
        },
        
        /**
         * テンプレートプレビュー
         */
        previewTemplate: async function(postId) {
            const textarea = document.getElementById(`edit-textarea-${postId}`);
            const previewArea = document.getElementById(`preview-area-${postId}`);
            const previewContent = document.getElementById(`preview-content-${postId}`);
            
            if (!textarea || !previewArea || !previewContent) return;
            
            try {
                const response = await fetch('/api/preview-template', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        content: textarea.value
                    })
                });
                
                const result = await response.json();
                
                if (!result.success) {
                    throw new Error(result.message);
                }
                
                previewContent.textContent = result.processedContent;
                previewArea.classList.add('show');
                
                console.log(`🔍 プレビュー表示完了: ID ${postId}`);
                
            } catch (error) {
                console.error('プレビューエラー:', error);
                previewContent.textContent = `プレビューエラー: ${error.message}`;
                previewArea.classList.add('show');
            }
        },
        
        /**
         * 編集内容を保存
         */
        saveEditedPost: async function(postId) {
            const textarea = document.getElementById(`edit-textarea-${postId}`);
            if (!textarea) return;
            
            const button = event.target;
            const originalText = button.textContent;
            
            try {
                button.textContent = '💾 保存中...';
                button.disabled = true;
                
                const updateData = {
                    content: textarea.value
                };
                
                // テンプレートモードの場合はスケジュール情報も含める
                if (currentEditMode === 'template') {
                    const baseTime = document.getElementById(`edit-basetime-${postId}`)?.value;
                    const randomMinutes = document.getElementById(`edit-random-${postId}`)?.value;
                    const datePattern = document.getElementById(`edit-pattern-${postId}`)?.value;
                    
                    updateData.baseTime = baseTime;
                    updateData.randomMinutes = parseInt(randomMinutes) || 0;
                    updateData.datePattern = datePattern;
                    updateData.isTemplate = true;
                }
                
                const response = await fetch(`/api/update-post/${postId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(updateData)
                });
                
                const result = await response.json();
                
                if (!result.success) {
                    throw new Error(result.message);
                }
                
                // 成功フィードバック
                button.textContent = '✅ 保存完了';
                button.style.background = '#28a745';
                
                console.log(`💾 編集内容保存完了: ID ${postId}`);
                
                // 編集モード終了
                setTimeout(() => {
                    this.cancelEdit(postId);
                    updateAllStatistics();
                }, 1500);
                
            } catch (error) {
                console.error('保存エラー:', error);
                alert(`保存エラー: ${error.message}`);
                
                button.textContent = originalText;
                button.disabled = false;
            }
        },
        
        /**
         * 編集用イベントリスナーの設定
         */
        setupEventListeners: function() {
            if (!currentEditingPostId) return;
            
            // モード切り替えのイベントリスナー
            const modeRadios = document.querySelectorAll(`input[name="editMode-${currentEditingPostId}"]`);
            modeRadios.forEach(radio => {
                radio.addEventListener('change', (e) => {
                    if (e.target.checked) {
                        this.switchEditMode(currentEditingPostId, e.target.value);
                    }
                });
            });
            
            // 文字数カウンターの設定
            const textarea = document.getElementById(`edit-textarea-${currentEditingPostId}`);
            const charCounter = document.getElementById(`char-counter-${currentEditingPostId}`);
            
            if (textarea && charCounter) {
                const updateCharCount = () => {
                    const count = textarea.value.length;
                    charCounter.textContent = `文字数: ${count}/280`;
                    
                    charCounter.className = 'char-counter';
                    if (count > 240) {
                        charCounter.classList.add('warning');
                    }
                    if (count > 280) {
                        charCounter.classList.add('error');
                    }
                };
                
                textarea.addEventListener('input', updateCharCount);
                updateCharCount(); // 初期カウント
            }
            
            // テンプレートモードの場合のスケジュール変更監視
            if (currentEditMode === 'template') {
                const scheduleInputs = [
                    `edit-basetime-${currentEditingPostId}`,
                    `edit-random-${currentEditingPostId}`,
                    `edit-pattern-${currentEditingPostId}`
                ];
                
                scheduleInputs.forEach(inputId => {
                    const input = document.getElementById(inputId);
                    if (input) {
                        input.addEventListener('change', () => {
                            console.log(`📅 スケジュール設定変更: ${inputId}`);
                        });
                    }
                });
            }
        },
        
        // ==========================================================================
        // プライベートメソッドのヘルパー
        // ==========================================================================
        
        /**
         * 現在の編集状態を取得（デバッグ用）
         */
        getEditState: function() {
            return {
                currentEditingPostId: currentEditingPostId,
                currentEditMode: currentEditMode,
                hasOriginalData: !!originalPostData
            };
        },
        
        /**
         * 編集データをリセット（デバッグ用）
         */
        resetEditState: function() {
            currentEditingPostId = null;
            currentEditMode = 'processed';
            originalPostData = null;
            console.log('🔄 編集状態リセット完了');
        },
        
        /**
         * 編集可能性チェック
         */
        canEdit: function(postId) {
            // 既に他の投稿を編集中の場合はfalse
            if (currentEditingPostId && currentEditingPostId !== postId) {
                return false;
            }
            return true;
        }
    };
})();

// ==========================================================================
// 編集機能の初期化・設定
// ==========================================================================

/**
 * 編集機能の初期化
 */
function initializeEditFeature() {
    console.log('✏️ 投稿編集機能初期化完了');
    
    // グローバルキーボードショートカット
    document.addEventListener('keydown', function(e) {
        // Ctrl+Shift+E で編集モード切り替え（最初の投稿）
        if (e.ctrlKey && e.shiftKey && e.key === 'E') {
            e.preventDefault();
            const firstPostCard = document.querySelector('.upcoming-post-card');
            if (firstPostCard) {
                const postId = firstPostCard.id.split('-')[2];
                if (postId && window.PostEdit) {
                    window.PostEdit.toggleEditMode(parseInt(postId));
                }
            }
        }
        
        // Ctrl+S で編集内容保存（編集モード中）
        if (e.ctrlKey && e.key === 's' && window.PostEdit.hasActiveEdit()) {
            e.preventDefault();
            const editState = window.PostEdit.getEditState();
            if (editState.currentEditingPostId) {
                window.PostEdit.saveEditedPost(editState.currentEditingPostId);
            }
        }
    });
}

// DOM読み込み完了時の初期化
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        initializeEditFeature();
    }, 300);
});

// ==========================================================================
// デバッグ・開発用関数
// ==========================================================================

// 編集機能のデバッグ用関数
window.editDebug = {
    getState: () => window.PostEdit.getEditState(),
    reset: () => window.PostEdit.resetEditState(),
    canEdit: (postId) => window.PostEdit.canEdit(postId),
    forceCancel: () => window.PostEdit.cancelCurrentEdit()
};