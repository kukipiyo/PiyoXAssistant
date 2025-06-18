/**
 * API設定管理 - 天気・金融・Twitter API設定
 */

// ==========================================================================
// API設定
// ==========================================================================

/**
 * 天気API設定
 */
async function setWeatherApiKey() {
    const weatherApiKey = document.getElementById('weatherApiKey').value.trim();
    
    if (!weatherApiKey) {
        alert('OpenWeatherMap APIキーを入力してください');
        return;
    }
    
    try {
        const response = await fetch('/api/weather-config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ weatherApiKey })
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('✅ 天気API設定完了');
            document.getElementById('weatherApiKey').value = '';
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        alert('❌ 天気API設定エラー: ' + error.message);
    }
}

/**
 * Twelve Data API設定
 */
async function setTwelveDataApiKey() {
    const twelveDataApiKey = document.getElementById('twelveDataApiKey').value.trim();
    
    if (!twelveDataApiKey) {
        alert('Twelve Data APIキーを入力してください');
        return;
    }
    
    try {
        const response = await fetch('/api/twelvedata-config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ twelveDataApiKey })
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('✅ Twelve Data API設定完了');
            document.getElementById('twelveDataApiKey').value = '';
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        alert('❌ Twelve Data API設定エラー: ' + error.message);
    }
}

/**
 * Twitter API設定
 */
async function setTwitterApiKey() {
    const apiKey = document.getElementById('apiKey').value.trim();
    const apiKeySecret = document.getElementById('apiKeySecret').value.trim();
    const accessToken = document.getElementById('accessToken').value.trim();
    const accessTokenSecret = document.getElementById('accessTokenSecret').value.trim();
    
    if (!apiKey || !apiKeySecret || !accessToken || !accessTokenSecret) {
        alert('全てのTwitter APIキーを入力してください');
        return;
    }
    
    try {
        const response = await fetch('/api/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                apiKey, 
                apiKeySecret, 
                accessToken, 
                accessTokenSecret 
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            document.getElementById('apiStatus').className = 'status-indicator status-success';
            document.getElementById('apiStatus').textContent = '✅ ' + result.message;
            
            // フォームクリア
            document.getElementById('apiKey').value = '';
            document.getElementById('apiKeySecret').value = '';
            document.getElementById('accessToken').value = '';
            document.getElementById('accessTokenSecret').value = '';
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        document.getElementById('apiStatus').className = 'status-indicator status-error';
        document.getElementById('apiStatus').textContent = '❌ ' + error.message;
    }
}