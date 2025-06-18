/**
 * ルート統合管理
 * 各機能別ルートを統合し、依存性注入を行う
 */

const path = require('path');
const assistantRoutes = require('./assistantRoutes');
const controlRoutes = require('./controlRoutes');
const configRoutes = require('./configRoutes');
const uploadRoutes = require('./uploadRoutes');

/**
 * 全ルートを統合してExpressアプリに設定
 * @param {Express} app - Expressアプリケーション
 * @param {Object} dependencies - 依存性オブジェクト
 */
module.exports = function setupRoutes(app, dependencies) {
    console.log('🛣️ ルート設定開始...');
    
    // メインページ
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, '../../public/index.html'));
    });
    
    // 各機能別ルートの設定（依存性注入）
    app.use('/api', assistantRoutes(dependencies));
    app.use('/api', controlRoutes(dependencies));
    app.use('/api', configRoutes(dependencies));
    app.use('/api', uploadRoutes(dependencies));
    
    console.log('✅ ルート設定完了');
    
    // ルート一覧をログ出力（開発時のデバッグ用）
    if (process.env.NODE_ENV !== 'production') {
        logRoutes(app);
    }
};

/**
 * 登録されたルート一覧をログ出力
 * @param {Express} app - Expressアプリケーション
 */
function logRoutes(app) {
    console.log('\n📋 登録ルート一覧:');
    
    const routes = [];
    
    app._router.stack.forEach(function(middleware) {
        if (middleware.route) {
            // 直接ルート
            routes.push({
                method: Object.keys(middleware.route.methods)[0].toUpperCase(),
                path: middleware.route.path
            });
        } else if (middleware.name === 'router') {
            // ルーター内のルート
            middleware.handle.stack.forEach(function(handler) {
                if (handler.route) {
                    const method = Object.keys(handler.route.methods)[0].toUpperCase();
                    const basePath = middleware.regexp.source.replace(/\\\//g, '/').replace(/\$.*/, '');
                    const fullPath = basePath + handler.route.path;
                    routes.push({
                        method: method,
                        path: fullPath
                    });
                }
            });
        }
    });
    
    routes.forEach(route => {
        console.log(`   ${route.method.padEnd(6)} ${route.path}`);
    });
    
    console.log(`\n📊 総ルート数: ${routes.length}\n`);
}