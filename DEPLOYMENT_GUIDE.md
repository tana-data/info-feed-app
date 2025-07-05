# デプロイメントガイド - 情報収集ツール

## 🚀 Railway デプロイメント手順

### 1. 前提条件
- GitHubアカウント
- Railwayアカウント（GitHub連携推奨）
- 必要なAPI Key（Gemini または OpenAI）

### 2. Railroad デプロイ手順

#### Step 1: プロジェクト作成
1. [Railway](https://railway.app) にログイン
2. "New Project" をクリック
3. "Deploy from GitHub repo" を選択
4. `tana-data/info-feed-app` リポジトリを選択
5. プロジェクトが自動作成される

#### Step 2: PostgreSQL データベース追加
1. プロジェクトダッシュボードで "Add Service" をクリック
2. "Database" → "PostgreSQL" を選択
3. PostgreSQL サービスが自動作成される
4. `DATABASE_URL` 環境変数が自動設定される

#### Step 3: 環境変数設定
アプリケーションサービスの Variables タブで以下を設定：

**必須設定**:
```bash
DATABASE_TYPE=postgresql
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key_here
```

**オプション設定**:
```bash
OPENAI_API_KEY=your_openai_api_key_here  # OpenAI使用時
RSS_SCHEDULE=daily                       # 'daily' or 'weekly'
```

#### Step 4: デプロイ実行
1. GitHub にコードがプッシュされると自動デプロイ開始
2. "Deployments" タブでデプロイ状況を確認
3. 成功するとアプリケーションURLが生成される

#### Step 5: 動作確認
1. 生成されたURLにアクセス
2. RSS Feed登録機能をテスト
3. 記事取得とAI要約機能をテスト
4. データの永続化を確認（ページリロード後もデータが残る）

### 3. API Key取得方法

#### Google Gemini API Key
1. [Google AI Studio](https://ai.google.dev/) にアクセス
2. Googleアカウントでログイン
3. "Get API Key" をクリック
4. 新しいプロジェクトでAPI Keyを作成
5. **注意**: 無料枠あり、レート制限に注意

#### OpenAI API Key
1. [OpenAI Platform](https://platform.openai.com/) にアクセス
2. アカウント作成・ログイン
3. API Keys セクションでキーを作成
4. **注意**: 有料サービス、使用量に応じて課金

### 4. 環境変数設定ガイド

#### Railway での環境変数設定
```
1. プロジェクトダッシュボード
2. アプリケーションサービスをクリック
3. "Variables" タブを選択
4. "Add Variable" で追加

Key: DATABASE_TYPE          Value: postgresql
Key: AI_PROVIDER            Value: gemini
Key: GEMINI_API_KEY         Value: your_actual_api_key
```

#### 設定確認方法
```bash
# Railway CLI使用（オプション）
railway login
railway link [project-id]
railway vars
```

## 🔧 ローカル開発環境セットアップ

### 1. 依存関係インストール
```bash
# リポジトリクローン
git clone https://github.com/tana-data/info-feed-app.git
cd info-feed-app

# Node.js 依存関係インストール
npm install
```

### 2. 環境変数設定
```bash
# 環境変数ファイル作成
cp .env.example .env

# .env ファイル編集
nano .env
```

#### .env ファイル内容例
```bash
PORT=3000
DATABASE_TYPE=sqlite
DATABASE_PATH=./newsfeeder.db
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key_here
RSS_SCHEDULE=daily
```

### 3. ローカル開発サーバー起動
```bash
# 開発モード（自動リロード）
npm run dev

# 本番モード
npm start
```

### 4. アクセス確認
- **ローカルURL**: http://localhost:3000
- **API テスト**: http://localhost:3000/api/feeds

## 📱 PWA（スマホアプリ）デプロイ

### 1. GitHub Pages（静的ホスティング）
現在、PWA部分は GitHub Pages で配信されています：
- **URL**: https://tana-data.github.io/info-feed-app/
- **ファイル**: `info-feed-app/` ディレクトリ内

### 2. Railway PWA設定
Railway デプロイ時、PWA機能も自動的に含まれます：
- manifest.json
- Service Worker
- アプリアイコン

### 3. PWA機能テスト
```
1. Railway URLにスマホでアクセス
2. ブラウザメニューから「ホーム画面に追加」
3. アイコンタップでアプリ起動確認
4. オフライン動作確認
```

## 🔄 継続的デプロイメント（CI/CD）

### 現在の設定
- **トリガー**: master ブランチへのプッシュ
- **自動実行**: Railway が GitHub webhook で検知
- **デプロイ時間**: 約2-3分

### 手動デプロイ
```bash
# Railway CLI使用
railway login
railway link [project-id]
railway up
```

### ロールバック
```bash
# Railway ダッシュボードから
1. Deployments タブ
2. 過去のデプロイを選択
3. "Redeploy" をクリック
```

## 🚨 トラブルシューティング

### よくある問題と解決法

#### 1. データベース接続エラー
```
ERROR: Database connection failed
```
**解決法**:
- `DATABASE_TYPE=postgresql` が設定されているか確認
- PostgreSQL サービスが起動しているか確認
- `DATABASE_URL` 環境変数が自動設定されているか確認

#### 2. API Key エラー
```
ERROR: AI API authentication failed
```
**解決法**:
- `GEMINI_API_KEY` または `OPENAI_API_KEY` が正しく設定されているか確認
- API Key の有効性と使用量制限を確認
- `AI_PROVIDER` の値（gemini/openai）を確認

#### 3. YouTube要約が動作しない
```
ERROR: YouTube content extraction failed
```
**解決法**:
- インターネット接続を確認
- YouTube URL の正当性を確認
- API使用量制限を確認

#### 4. RSS Feed取得エラー
```
ERROR: Feed parsing failed
```
**解決法**:
- RSS Feed URL の有効性を確認
- CORS エラーの場合はサーバー側で処理されるか確認
- ネットワーク接続を確認

### ログ確認方法
```bash
# Railway でのログ確認
1. プロジェクトダッシュボード
2. アプリケーションサービス
3. "Logs" タブでリアルタイムログ確認

# ローカルでのログ確認
tail -f server.log
```

## 📊 モニタリング・メンテナンス

### ヘルスチェック
Railway は自動的にヘルスチェックを実行：
- **エンドポイント**: `/`
- **タイムアウト**: 100秒
- **再起動ポリシー**: 失敗時に最大3回再試行

### メトリクス監視
- **CPU使用率**: Railway ダッシュボードで確認
- **メモリ使用量**: Railway ダッシュボードで確認
- **データベースサイズ**: PostgreSQL メトリクスで確認

### 定期メンテナンス
```bash
# 月次タスク例
1. PostgreSQL データベースの不要データ削除
2. ログファイルのクリーンアップ
3. API使用量の確認と最適化
4. セキュリティアップデートの適用
```

## 💡 パフォーマンス最適化

### データベース最適化
```sql
-- インデックス再構築（PostgreSQL）
REINDEX INDEX idx_articles_pub_date;
REINDEX INDEX idx_articles_feed_id;

-- 統計情報更新
ANALYZE articles;
ANALYZE feeds;
```

### Railway リソース監視
- メモリ使用量が80%を超える場合はプラン変更を検討
- CPU使用率が継続的に高い場合は処理の最適化を検討

---

## 📞 サポート・問い合わせ

### Railway サポート
- [Railway Documentation](https://docs.railway.app/)
- [Railway Discord Community](https://discord.gg/railway)

### 技術サポート
- **GitHub Issues**: プロジェクトリポジトリのIssueセクション
- **API関連**: 各APIプロバイダーの公式ドキュメント

このガイドに従ってデプロイメントを実行し、問題が発生した場合は上記のトラブルシューティングセクションを参照してください。