# RSS Feed情報収集ツール

RSS Feedから自動的に記事を収集し、YouTube/Podcastコンテンツの要約機能を提供する情報収集ツールです。

## 機能

- **RSS Feed管理**: 任意のRSS FeedのURL登録・削除
- **自動記事収集**: 日次/週次での自動フィード更新
- **コンテンツ分類**: YouTube/Podcast/Web記事の自動判別
- **AI要約機能**: YouTube動画の字幕取得→AI要約生成
- **既読管理**: 記事ごとの既読状態管理
- **PWA対応**: オフライン機能とアプリインストール

## セットアップ

### 1. 依存関係のインストール
```bash
npm install
```

### 2. 環境設定
```bash
cp .env.example .env
```

`.env`ファイルを編集してOpenAI APIキーを設定:
```env
PORT=3000
OPENAI_API_KEY=your_openai_api_key_here
DATABASE_PATH=./newsfeeder.db
RSS_SCHEDULE=daily
```

### 3. アプリケーション起動
```bash
# 開発環境
npm run dev

# 本番環境
npm start
```

アプリケーションは `http://localhost:3000` でアクセス可能です。

## 使用方法

### RSS Feed登録
1. 「Feed管理」タブを開く
2. RSS Feed URLを入力して「追加」ボタンをクリック
3. 登録されたFeedは自動的に記事を取得開始

### 記事閲覧
1. 「記事一覧」タブでコンテンツタイプ別に記事を表示
2. 記事タイトルをクリックして元サイトへ移動
3. 「既読にする」ボタンで既読マーク（以降非表示）

### YouTube要約機能
1. YouTube動画記事で「要約を作成」ボタンをクリック
2. 自動的に字幕を取得してAI要約を生成
3. 要約完了後、記事下に要約文が表示

### 記事更新
- 自動: 毎日8:00（JST）に全Feed更新
- 手動: 「記事を更新」ボタンで即座に更新

## API仕様

### Feed管理
- `GET /api/feeds` - Feed一覧取得
- `POST /api/feeds` - Feed追加
- `DELETE /api/feeds/:id` - Feed削除
- `POST /api/feeds/refresh` - 手動更新

### 記事管理
- `GET /api/articles` - 記事一覧取得
- `PATCH /api/articles/:id/read` - 既読状態更新
- `POST /api/articles/:id/summarize` - 要約リクエスト

### スケジューラー
- `GET /api/scheduler/status` - スケジューラー状態確認
- `POST /api/scheduler/start` - スケジューラー開始
- `POST /api/scheduler/stop` - スケジューラー停止

## 技術スタック

- **Backend**: Node.js, Express.js, SQLite
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **RSS処理**: rss-parser
- **スケジューリング**: node-cron
- **AI統合**: OpenAI API
- **YouTube処理**: youtube-transcript

## 開発情報

詳細な開発情報と設定については `CLAUDE.md` を参照してください。