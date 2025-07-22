# 情報収集ツール

RSS Feed管理とYouTube/Podcast AI要約機能を持つPWA（Progressive Web App）対応の情報収集ツール

## 🚀 本番環境

**Railway URL**: https://info-feed-app-production.up.railway.app

### 📱 スマホアプリとして利用
1. 上記URLにスマホでアクセス
2. 「ホーム画面に追加」でアプリ化
3. アイコンタップでアプリライクに起動

## ✨ 主要機能

- 📰 **RSS Feed登録・管理** - Webサイト、YouTube、Podcast対応
- 🤖 **AI要約機能** - YouTube動画・Podcast音声・テキストの自動要約
- 📱 **PWAアプリ対応** - スマホホーム画面に追加可能
- 🗄️ **データ永続化** - PostgreSQL使用（Railway）
- ⏰ **自動更新** - 日次・週次スケジューラー
- 👁️ **既読管理** - 読了記事の整理機能

## 🏗️ 技術スタック

- **Backend**: Node.js + Express.js
- **Database**: SQLite (dev) / PostgreSQL (prod)
- **Frontend**: Vanilla JavaScript PWA
- **AI**: Google Gemini / OpenAI (GPT + Whisper)
- **Audio**: @distube/ytdl-core + Whisper API
- **Deploy**: Railway + GitHub Actions

## 📚 ドキュメント

- 📖 **[プロジェクト概要](./PROJECT_OVERVIEW.md)** - 全体概要と機能詳細
- 🔧 **[技術仕様書](./TECHNICAL_SPECIFICATION.md)** - アーキテクチャと実装詳細
- 🚀 **[デプロイメントガイド](./DEPLOYMENT_GUIDE.md)** - Railway環境構築手順
- 📱 **[使用方法ガイド](./USER_GUIDE.md)** - エンドユーザー向け操作説明
- 📝 **[CLAUDE.md](./CLAUDE.md)** - 開発者向け詳細仕様

## ⚡ クイックスタート

### ローカル開発環境
```bash
# リポジトリクローン
git clone https://github.com/tana-data/info-feed-app.git
cd info-feed-app

# 依存関係インストール
npm install

# 環境変数設定
cp .env.example .env
# .env を編集してAPI KEYを設定

# 開発サーバー起動
npm run dev
# → http://localhost:3000
```

### 必要な環境変数
```bash
# AI Provider (推奨: Gemini)
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key

# Database (ローカル: SQLite)
DATABASE_TYPE=sqlite
DATABASE_PATH=./newsfeeder.db
```

## 🎯 主な使用フロー

1. **RSS Feed登録**: 興味のあるサイト・YouTubeチャンネル・Podcastを追加
2. **自動記事収集**: スケジューラーが新着記事を定期取得
3. **AI要約**: YouTube動画・Podcast・記事の要約をワンクリック生成
4. **スマホアプリ**: PWA機能でネイティブアプリライクに利用

## 🛠️ 開発コマンド

```bash
npm start          # 本番サーバー起動
npm run dev        # 開発サーバー起動（nodemon）
npm test           # テスト実行（未実装）
```

## 📊 バージョン情報

- **Ver.0.4** (最新) - PostgreSQL対応、PWA機能、タイムアウト修正
- **Ver.0.3** - YouTube音声処理改善、Whisper API統合
- **Ver.0.2** - AI要約機能実装
- **Ver.0.1** - RSS Feed基本機能

詳細な変更履歴は [CLAUDE.md](./CLAUDE.md) を参照してください。

## 🌐 GitHub Pages版（静的デモ）

**URL**: https://tana-data.github.io/info-feed-app/
- ✅ フロントエンドUI確認用
- ⚠️ バックエンド機能は制限あり（完全版はRailway URLを利用）

---

![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live%20Demo-brightgreen?style=flat-square&logo=github)
![Node.js](https://img.shields.io/badge/Node.js-v22+-green?style=flat-square&logo=node.js)
![AI Powered](https://img.shields.io/badge/AI-Powered-blue?style=flat-square)
![PWA Ready](https://img.shields.io/badge/PWA-Ready-purple?style=flat-square)

**📄 ライセンス**: MIT License
>>>>>>> master
