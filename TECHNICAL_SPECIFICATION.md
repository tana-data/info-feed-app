# 技術仕様書 - 情報収集ツール

## 🏗️ システムアーキテクチャ

### 全体構成図
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   Database      │
│   (PWA)         │◄──►│   (Node.js)     │◄──►│   SQLite/       │
│                 │    │                 │    │   PostgreSQL    │
│ - Vanilla JS    │    │ - Express.js    │    │                 │
│ - Service       │    │ - RSS Parser    │    │ - feeds         │
│   Worker        │    │ - AI APIs       │    │ - articles      │
│ - PWA Manifest  │    │ - Scheduler     │    │ - summary_reqs  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌─────────────────┐              │
         │              │  External APIs  │              │
         │              │                 │              │
         └──────────────►│ - Gemini API    │◄─────────────┘
                        │ - OpenAI API    │
                        │ - YouTube API   │
                        │ - RSS Feeds     │
                        └─────────────────┘
```

## 📁 ディレクトリ構造

```
claude_myNewsfeeder/
├── backend/
│   ├── models/
│   │   ├── database.js              # データベース接続（メイン）
│   │   └── database-adapter.js      # SQLite/PostgreSQL抽象化レイヤー
│   ├── routes/
│   │   ├── articles.js              # 記事関連API
│   │   ├── feeds.js                 # フィード関連API
│   │   └── api-stats.js             # API使用量統計
│   └── utils/
│       ├── scheduler.js             # RSS自動取得スケジューラ
│       ├── youtube-helper.js        # YouTube コンテンツ処理
│       ├── youtube-audio-helper.js  # YouTube 音声処理
│       ├── podcast-helper.js        # Podcast 音声処理
│       ├── whisper-service.js       # Whisper API サービス
│       └── api-usage-tracker.js     # API使用量トラッキング
├── info-feed-app/                   # PWA フロントエンド
│   ├── index.html                   # メインアプリケーション
│   ├── manifest.json                # PWA設定
│   ├── sw.js                        # Service Worker
│   ├── icon-192.png                 # アプリアイコン（192x192）
│   └── icon-512.png                 # アプリアイコン（512x512）
├── server.js                        # Express.js サーバー
├── start.js                         # アプリケーション起動スクリプト
├── package.json                     # Node.js 依存関係
├── railway.json                     # Railway デプロイ設定
├── .env.example                     # 環境変数テンプレート
└── newsfeeder.db                    # SQLite データベース（開発用）
```

## 🔧 バックエンド仕様

### API エンドポイント

#### Feed管理
```
GET    /api/feeds              # フィード一覧取得
POST   /api/feeds              # 新規フィード追加
DELETE /api/feeds/:id          # フィード削除
POST   /api/feeds/refresh      # 手動フィード更新
```

#### 記事管理
```
GET    /api/articles           # 記事一覧取得（フィルタ・ページング対応）
PATCH  /api/articles/:id/read  # 既読ステータス更新
```

#### AI要約機能
```
POST   /api/articles/:id/summarize           # AI要約リクエスト
GET    /api/articles/:id/summary             # 要約ステータス・結果取得
GET    /api/articles/:id/transcript-check    # YouTube字幕可用性チェック
```

#### スケジューラー管理
```
GET    /api/scheduler/status   # スケジューラー状態取得
POST   /api/scheduler/start    # スケジューラー開始
POST   /api/scheduler/stop     # スケジューラー停止
```

### データベース抽象化

#### DatabaseAdapter クラス
```javascript
class DatabaseAdapter {
  constructor()                 # SQLite/PostgreSQL自動選択
  query(sql, params)           # SELECT クエリ実行
  run(sql, params)             # INSERT/UPDATE/DELETE実行
  get(sql, params)             # 単一行取得
  all(sql, params, callback)   # レガシー互換メソッド
}
```

#### 環境変数による切り替え
```bash
# SQLite（開発環境）
DATABASE_TYPE=sqlite
DATABASE_PATH=./newsfeeder.db

# PostgreSQL（本番環境）
DATABASE_TYPE=postgresql
DATABASE_URL=postgresql://user:pass@host:port/db
```

### YouTube処理アルゴリズム

#### 3段階フォールバック戦略
```javascript
async function getYouTubeContent(url) {
  // 1. 字幕取得（最高速・高精度）
  try {
    const transcript = await getTranscript(videoId);
    return { content: transcript, method: 'transcript' };
  } catch (error) {
    console.log('字幕取得失敗、音声処理に移行');
  }

  // 2. 音声ダウンロード + Whisper文字起こし（高精度）
  try {
    const audioPath = await downloadAudio(url);
    const transcription = await whisperTranscribe(audioPath);
    return { content: transcription, method: 'audio' };
  } catch (error) {
    console.log('音声処理失敗、説明文に移行');
  }

  // 3. 動画説明文（フォールバック）
  try {
    const description = await getVideoDescription(videoId);
    return { content: description, method: 'description' };
  } catch (error) {
    throw new Error('全ての手法が失敗');
  }
}
```

#### 音声処理4段階フォールバック
```javascript
// 1. @distube/ytdl-core（推奨）
// 2. yt-dlp（システムコマンド）
// 3. pytube（Pythonライブラリ）
// 4. youtube-dl（レガシー）
```

### Whisper APIサービス

#### WSL2最適化設定
```javascript
const httpAgent = new http.Agent({
  family: 4,                    # IPv4強制
  maxSockets: 1,                # 同時接続数制限
  timeout: 180000,              # 3分タイムアウト
  keepAlive: false              # Keep-Alive無効
});
```

#### 3段階リトライ戦略
```javascript
// 1. OpenAI SDK
// 2. 直接HTTP API呼び出し
// 3. ファイル分割処理
```

## 🎨 フロントエンド仕様

### PWA設定

#### manifest.json
```json
{
  "name": "情報収集ツール",
  "short_name": "情報収集ツール",
  "description": "RSS Feed情報収集ツール - YouTube/Podcast要約対応",
  "start_url": "./index.html",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#ffffff",
  "theme_color": "#007cba",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

#### Service Worker機能
```javascript
// キャッシュ戦略
const CACHE_NAME = 'info-feed-app-v1.1';
const urlsToCache = [
  './index.html',
  './manifest.json', 
  './icon-192.png',
  './icon-512.png'
];

// オフライン対応
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
```

### JavaScript アーキテクチャ

#### モジュール構成
```javascript
// API通信
const API_BASE = window.location.origin;

// 主要機能
loadFeeds()                    # フィード一覧表示
loadArticles()                 # 記事一覧表示
addFeed(url)                   # フィード追加
requestYouTubeSummary(id)      # YouTube要約リクエスト
monitorProgress(id)            # 進行状況監視
markAsRead(id)                 # 既読マーク
```

#### 進行状況監視
```javascript
async function monitorYouTubeSummaryProgress(articleId) {
  const MAX_TIMEOUT = 10 * 60 * 1000; // 10分タイムアウト
  const startTime = Date.now();
  
  const checkResult = async () => {
    // タイムアウトチェック
    if (Date.now() - startTime > MAX_TIMEOUT) {
      showTimeout();
      return;
    }
    
    // ステータス確認
    const data = await fetch(`/api/articles/${articleId}/summary`);
    if (data.summary_status === 'completed') {
      showSuccess(data.summary_text);
    } else {
      setTimeout(checkResult, 8000); // 8秒後再チェック
    }
  };
  
  setTimeout(checkResult, 3000); // 初回3秒後開始
}
```

## 🗄️ データベース設計詳細

### テーブル定義

#### feeds テーブル
```sql
CREATE TABLE feeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT UNIQUE NOT NULL,           -- RSS Feed URL
  title TEXT,                         -- フィードタイトル
  description TEXT,                   -- フィード説明
  last_updated DATETIME,              -- 最終更新日時
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT 1         -- アクティブフラグ
);
```

#### articles テーブル
```sql
CREATE TABLE articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_id INTEGER NOT NULL,           -- フィードID（外部キー）
  guid TEXT UNIQUE NOT NULL,          -- 記事固有ID（重複防止）
  title TEXT NOT NULL,                -- 記事タイトル
  link TEXT NOT NULL,                 -- 記事URL
  description TEXT,                   -- 記事説明
  pub_date DATETIME,                  -- 公開日時
  content_type TEXT DEFAULT 'article', -- 'youtube'|'podcast'|'article'
  summary_status TEXT DEFAULT 'pending', -- 'pending'|'completed'|'failed'
  summary_text TEXT,                  -- AI要約結果
  read_status BOOLEAN DEFAULT 0,      -- 既読フラグ
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (feed_id) REFERENCES feeds (id) ON DELETE CASCADE
);
```

#### summary_requests テーブル
```sql
CREATE TABLE summary_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL,        -- 記事ID（外部キー）
  status TEXT DEFAULT 'pending',      -- 'pending'|'processing'|'completed'|'failed'
  error_message TEXT,                 -- エラーメッセージ
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,              -- 完了日時
  FOREIGN KEY (article_id) REFERENCES articles (id) ON DELETE CASCADE
);
```

#### transcript_cache テーブル
```sql
CREATE TABLE transcript_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT UNIQUE NOT NULL,      -- YouTube動画ID
  transcript_text TEXT NOT NULL,      -- 字幕テキスト
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### インデックス設計
```sql
CREATE INDEX idx_articles_feed_id ON articles(feed_id);
CREATE INDEX idx_articles_pub_date ON articles(pub_date DESC);
CREATE INDEX idx_articles_read_status ON articles(read_status);
CREATE INDEX idx_articles_content_type ON articles(content_type);
CREATE INDEX idx_summary_requests_status ON summary_requests(status);
```

## 🚀 デプロイメント仕様

### Railway設定

#### railway.json
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

#### 必要な環境変数
```bash
# 必須
DATABASE_TYPE=postgresql
DATABASE_URL=<auto-generated-by-railway>
AI_PROVIDER=gemini
GEMINI_API_KEY=<user-provided>

# オプション
OPENAI_API_KEY=<user-provided>
RSS_SCHEDULE=daily
PORT=<auto-generated-by-railway>
```

### GitHub Actions（将来実装可能）
```yaml
name: Deploy to Railway
on:
  push:
    branches: [master]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to Railway
        run: railway deploy
```

## 🔐 セキュリティ仕様

### API Key管理
- 環境変数による機密情報管理
- 本番環境でのHTTPS強制
- CORS設定による不正アクセス防止

### データベースセキュリティ
- 外部キー制約による整合性保証
- SQLインジェクション対策（パラメータ化クエリ）
- PostgreSQL接続時のSSL設定

### フロントエンドセキュリティ
- CSP（Content Security Policy）設定可能
- HTTPS環境でのService Worker動作
- 機密情報のローカルストレージ回避

## 📊 パフォーマンス仕様

### レスポンス時間目標
- 記事一覧表示: < 500ms
- フィード追加: < 1秒
- YouTube字幕要約: < 30秒
- YouTube音声要約: < 3分
- Podcast音声要約: < 5分

### スケーラビリティ
- PostgreSQL接続プール使用
- 記事取得のページング対応
- 大容量音声ファイルの分割処理
- キャッシュ機能（字幕・音声）

### リソース最適化
- Service Worker による静的リソースキャッシュ
- PWA により通信量削減
- 音声ファイル自動削除によるストレージ管理

---

この技術仕様書は、開発・運用・拡張時の技術的な指針として活用してください。