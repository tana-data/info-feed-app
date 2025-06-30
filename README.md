# 📱 RSS Feed 情報収集ツール

> **🌐 GitHub Pages デモ**: [https://tana-data.github.io/info-feed-app/](https://tana-data.github.io/info-feed-app/)

RSS Feed管理とYouTube/Podcast要約機能を持つ情報収集ツールです。

![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live%20Demo-brightgreen?style=flat-square&logo=github)
![Node.js](https://img.shields.io/badge/Node.js-v14+-green?style=flat-square&logo=node.js)
![AI Powered](https://img.shields.io/badge/AI-Powered-blue?style=flat-square)

## ✨ 機能

### 🎯 コア機能
- **RSS Feed 管理**: URL登録・削除、自動記事収集
- **記事カテゴリ分類**: YouTube/Podcast/Web記事の自動識別
- **AI要約機能**: YouTube動画音声→文字起こし→要約
- **手動要約**: 任意テキストのAI要約
- **スケジューラー**: 日次・週次の自動更新

### 🚀 YouTube音声処理 (2025-06-30 大幅改良)
- **高精度音声処理**: 説明文ベース → 実際の音声コンテンツベース
- **4段階フォールバック**: ytdl-core → yt-dlp → pytube → youtube-dl
- **OpenAI Whisper API**: 音声文字起こし
- **WSL2最適化**: Windows環境での安定動作

## 🌐 デモ

### GitHub Pages版 (静的表示)
**URL**: [https://tana-data.github.io/info-feed-app/](https://tana-data.github.io/info-feed-app/)

- ✅ フロントエンドUI表示
- ✅ デザイン・レイアウト確認
- ⚠️ バックエンド機能は制限あり

### 完全版 (ローカル実行)
全機能（RSS取得、AI要約等）を使用するにはローカルでサーバーを起動してください。

## 🛠️ セットアップ

### 必要な環境
- Node.js (v14以上)
- SQLite3
- OpenAI API Key または Google Gemini API Key

### インストール

```bash
# リポジトリをクローン
git clone https://github.com/tana-data/info-feed-app.git
cd info-feed-app

# 依存関係をインストール
npm install

# 環境変数を設定
cp .env.example .env
# .envファイルを編集してAPIキーを設定

# サーバーを起動
npm start
```

### 環境変数設定

```bash
# .env ファイル
PORT=3000
OPENAI_API_KEY=your_openai_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
AI_PROVIDER=gemini
DATABASE_PATH=./newsfeeder.db
RSS_SCHEDULE=daily
```

## 📖 使用方法

1. **ローカル起動**: `http://localhost:3000` にアクセス
2. **Feed管理**: RSS/YouTube Channel URLを登録
3. **記事確認**: 自動収集された記事を閲覧
4. **AI要約**: YouTube動画の「🎧 音声要約」をクリック

## 🔧 技術スタック

### Backend
- **Runtime**: Node.js + Express.js
- **Database**: SQLite3
- **RSS**: rss-parser
- **Scheduling**: node-cron

### AI & Audio Processing
- **音声処理**: @distube/ytdl-core (YouTube), fluent-ffmpeg
- **文字起こし**: OpenAI Whisper API
- **要約AI**: OpenAI GPT / Google Gemini API
- **字幕**: youtube-transcript

### Frontend
- **UI**: Vanilla JavaScript, HTML5, CSS3
- **PWA**: Service Worker, Web App Manifest
- **Design**: レスポンシブデザイン

## 📁 プロジェクト構造

```
├── backend/
│   ├── models/database.js          # SQLite DB設定
│   ├── routes/                     # API エンドポイント
│   └── utils/
│       ├── youtube-helper.js       # YouTube処理統合
│       ├── youtube-audio-helper.js # 音声ダウンロード・転写
│       └── whisper-service.js      # OpenAI Whisper統合
├── info-feed-app/                  # フロントエンド
│   ├── index.html                  # メインUI
│   ├── manifest.json               # PWA設定
│   └── sw.js                       # Service Worker
├── server.js                       # メインサーバー
└── package.json                    # 依存関係
```

## 📋 変更履歴

### 🎙️ 2025-06-30: YouTube音声処理大幅改良
- **精度向上**: 説明文 → 実際の音声コンテンツ処理
- **信頼性向上**: @distube/ytdl-core移行、4段階フォールバック
- **パフォーマンス**: WSL2最適化、Whisper API統合

## 📄 ライセンス

MIT License

---

**🚀 開発**: Claude Code による音声処理システム改良 (2025-06-30)