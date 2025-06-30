# Railway デプロイガイド

## 🚀 Railway 環境変数設定

Railway ダッシュボードの **Variables** タブで以下の環境変数を設定してください：

### 必須環境変数

```bash
# アプリケーション設定
NODE_ENV=production
PORT=3000

# AI API設定（どちらか一つ以上）
OPENAI_API_KEY=your_openai_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here

# AI プロバイダー選択（推奨: gemini）
AI_PROVIDER=gemini

# データベース設定
DATABASE_PATH=./newsfeeder.db

# RSS 更新スケジュール
RSS_SCHEDULE=daily
```

### オプション環境変数

```bash
# YouTube Data API（字幕取得強化用、オプション）
YOUTUBE_API_KEY=your_youtube_api_key_here
```

## 📋 セットアップ手順

### ステップ1: Railway プロジェクト作成
1. [Railway](https://railway.app) にログイン
2. "New Project" → "Deploy from GitHub repo"
3. `tana-data/info-feed-app` を選択
4. `main` ブランチを指定

### ステップ2: 環境変数設定
1. Railway ダッシュボードで **Variables** タブをクリック
2. 上記の環境変数を一つずつ追加
3. **重要**: API キーは実際の値に置き換えてください

### ステップ3: デプロイ実行
1. 環境変数設定後、自動でデプロイが開始されます
2. **Deployments** タブでビルド状況を確認
3. 完了後、Railway提供のURLでアクセステスト

## 🔑 API キーの取得方法

### Gemini API（推奨・無料枠あり）
1. [Google AI Studio](https://ai.google.dev/) にアクセス
2. "Get API key" をクリック
3. 新しいプロジェクトで API キーを生成

### OpenAI API（有料）
1. [OpenAI Platform](https://platform.openai.com/) にアクセス
2. "API keys" → "Create new secret key"
3. 生成されたキーをコピー

## 💰 料金情報

### Railway
- **Hobby Plan**: $5/月
- **使用量**: 500 時間/月まで無料
- **永続ストレージ**: 1GB

### API 使用料
- **Gemini API**: 無料枠（月15回まで）
- **OpenAI API**: 使用量課金（$1-5/月程度）

## 🔧 トラブルシューティング

### ビルドエラーの場合
1. Railway ダッシュボードの **Deployments** でログ確認
2. Node.js バージョンが14以上か確認
3. 依存関係の問題は `npm install` を再実行

### 動作エラーの場合
1. 環境変数が正しく設定されているか確認
2. API キーが有効か確認
3. Railway ダッシュボードの **Observability** でログ確認

## ✅ デプロイ後の動作テスト

### 基本機能テスト
1. **アプリケーションアクセス**
   - Railway提供のURLにアクセス
   - ページが正常に表示されるか確認

2. **Feed管理テスト**
   - Feed管理タブで RSS URL を追加
   - 例: `https://feeds.npr.org/1001/rss.xml`
   - Feed一覧に表示されるか確認

3. **記事取得テスト**
   - 「記事を更新」ボタンをクリック
   - 記事が正常に表示されるか確認
   - YouTube/Web記事の分類が正しいか確認

### AI要約機能テスト
4. **YouTube音声要約テスト**
   - YouTube動画記事で「🎬 動画要約」をクリック
   - 処理が正常に進行するか確認
   - 要約結果が表示されるか確認

5. **手動要約テスト**
   - 任意の記事で「✏️ 手動要約」をクリック
   - テキスト入力→要約実行
   - 結果が正常に表示されるか確認

### パフォーマンステスト
6. **応答速度確認**
   - 各機能の応答時間が適切か確認
   - 5分以上処理が続く場合は異常

7. **エラーハンドリング確認**
   - 無効なRSS URLでの挙動
   - 存在しないYouTube URLでの挙動

## 🐛 よくある問題と解決法

### "記事の読み込みに失敗しました"
- **原因**: データベース初期化エラー
- **解決**: Railway ダッシュボードでアプリを再起動

### "要約処理に失敗しました"
- **原因**: API キー設定エラー
- **解決**: 環境変数の API キーを再確認

### "音声ダウンロードに失敗しました"
- **原因**: YouTube URL の制限
- **解決**: 別のYouTube動画で再テスト

## 📞 サポート

問題が発生した場合は、Railway の [ドキュメント](https://docs.railway.app/) または [Discord コミュニティ](https://discord.gg/railway) を参照してください。