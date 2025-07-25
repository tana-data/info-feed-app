# 使用方法ガイド - 情報収集ツール

## 📱 スマホアプリとして使用する方法

### 1. アプリのインストール（ホーム画面に追加）

#### Android（Chrome）の場合
1. **Railway URLにアクセス**  
   `https://info-feed-app-production.up.railway.app` をChromeで開く

2. **ホーム画面に追加**  
   - ブラウザのメニュー（⋮）をタップ
   - 「ホーム画面に追加」を選択
   - アプリ名を確認して「追加」をタップ

3. **アプリアイコンで起動**  
   - ホーム画面に「情報収集ツール」アイコンが追加される
   - アイコンをタップしてアプリとして起動

#### iPhone（Safari）の場合
1. **Railway URLにアクセス**  
   `https://info-feed-app-production.up.railway.app` をSafariで開く

2. **ホーム画面に追加**  
   - 共有ボタン（□に↑矢印）をタップ
   - 「ホーム画面に追加」を選択
   - アプリ名を確認して「追加」をタップ

3. **アプリアイコンで起動**  
   - ホーム画面に「情報収集ツール」アイコンが追加される
   - アイコンをタップしてアプリとして起動

### 2. アプリの基本画面

アプリを起動すると、以下の3つのタブが表示されます：

```
[Feed管理] [記事一覧] [設定・統計]
```

## 📰 基本的な使用手順

### Step 1: RSS Feedの登録

1. **「Feed管理」タブをタップ**

2. **RSS Feed URLを入力**  
   URL入力欄に以下のようなURLを入力：
   ```
   例：
   - Webサイト: https://techcrunch.com/feed/
   - YouTubeチャンネル: https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID
   - Podcast: https://feeds.example.com/podcast.xml
   ```

3. **「追加」ボタンをタップ**  
   - しばらく待つとフィードが追加される
   - 成功すると「Feed管理」画面に新しいフィードが表示される

4. **複数フィードの登録**  
   興味のある分野のフィードを複数登録することで、幅広い情報を収集できます

### Step 2: 記事の閲覧

1. **「記事一覧」タブをタップ**

2. **記事の確認**  
   登録したフィードから自動収集された記事が表示されます：
   ```
   📺 YouTube動画    # YouTube関連記事
   🎧 Podcast       # Podcast関連記事
   📄 Web記事       # その他Web記事
   ```

3. **記事の詳細確認**  
   - 記事タイトルをタップで元記事へアクセス
   - 記事の概要を確認

4. **既読管理**  
   - 読み終わった記事の「✓ 既読」をタップ
   - 既読記事は以降表示されなくなる

### Step 3: AI要約機能の利用

#### YouTube動画の要約
1. **YouTube記事を選択**  
   📺 マークが付いた記事の「🎬 動画要約」ボタンをタップ

2. **要約処理の開始**  
   - 確認ダイアログで「OK」をタップ
   - 処理時間の目安：1-5分（字幕ありなら1-2分、なしなら3-5分）

3. **進行状況の確認**  
   以下の段階で処理が進行します：
   ```
   コンテンツ確認中... → 字幕取得中... → 音声ダウンロード中... 
   → 音声文字起こし中... → 要約生成中... → 要約完了！
   ```

4. **要約結果の確認**  
   - 完了すると記事下部に詳細な要約が表示される
   - 要約には内容の概要、主要ポイント、結論が含まれる

#### Podcast音声の要約
1. **Podcast記事を選択**  
   🎧 マークが付いた記事の「🎧 音声要約」ボタンをタップ

2. **音声処理の開始**  
   - 確認ダイアログで「OK」をタップ
   - 処理時間の目安：3-5分（音声の長さによる）

3. **要約結果の確認**  
   音声から文字起こしされた内容を基にした詳細要約が表示される

#### 手動テキスト要約
1. **任意の記事で「手動要約」をタップ**

2. **テキスト入力**  
   - 要約したい内容を手動で入力
   - 記事の重要部分や気になった箇所を自由に入力

3. **AI要約実行**  
   - 入力したテキストを基にAI要約が生成される
   - YouTube動画やPodcastで自動処理が失敗した場合の代替手段としても利用可能

## 🔧 設定・カスタマイズ

### フィード管理
- **フィード削除**: 不要になったフィードの「削除」ボタンをタップ
- **手動更新**: 「フィードを手動更新」ボタンで最新記事を即座に取得

### スケジューラー設定
現在は以下のスケジュールで自動実行：
- **日次更新**: 毎日8:00 AM（JST）
- **週次更新**: 毎週月曜日8:00 AM（JST）

## 💡 効果的な使用方法

### 情報収集戦略
1. **多様なソースの登録**  
   ```
   - 技術系ブログ（TechCrunch、Wired等）
   - YouTubeチャンネル（技術解説、ビジネス情報等）
   - Podcast（業界インサイト、インタビュー等）
   - 学術機関のRSS（論文、レポート等）
   ```

2. **カテゴリ別整理**  
   - UX関連フィード
   - AI・機械学習関連フィード
   - ビジネス・起業関連フィード
   - 文化・社会関連フィード

3. **効率的な要約活用**  
   - 長時間のYouTube動画 → AI要約で要点を把握
   - Podcastエピソード → 要約で内容を事前確認
   - 興味深い記事 → 手動要約で重要部分を整理

### 情報管理のベストプラクティス
1. **定期的な確認**  
   - 朝の通勤時間に新着記事をチェック
   - 週末に未読記事の整理

2. **要約の活用**  
   - 要約で概要を把握してから詳細を読む
   - 要約をメモとして保存（スクリーンショット等）

3. **既読管理の徹底**  
   - 読み終わった記事は必ず既読にマーク
   - 関心のない記事も既読にして整理

## 🚨 トラブルシューティング

### よくある問題と解決法

#### アプリが起動しない
- **症状**: ホーム画面のアイコンをタップしても開かない
- **解決法**: 
  1. インターネット接続を確認
  2. ブラウザで直接URLにアクセス
  3. アプリを一度削除して再インストール

#### フィードが追加できない
- **症状**: RSS Feed URLを入力してもエラーになる
- **解決法**:
  1. URLの形式を確認（https://で始まる有効なURL）
  2. そのサイトがRSS Feedを提供しているか確認
  3. しばらく時間をおいて再試行

#### YouTube要約がエラーになる
- **症状**: 「YouTubeから自動でコンテンツを取得できませんでした」
- **解決法**:
  1. 「手動要約」ボタンを試す
  2. 動画の内容を手入力してAI要約を実行
  3. 別のYouTube動画で試してみる

#### 要約が長時間完了しない
- **症状**: 「要約生成中...」のまま進まない
- **解決法**:
  1. 10分以上経過した場合は自動的にタイムアウト
  2. ページをリロードして再試行
  3. 手動要約モードに切り替え

#### データが消えてしまう
- **症状**: 登録したフィードや記事が見つからない
- **解決法**:
  1. Railway URLを使用していることを確認
  2. ブラウザのキャッシュをクリア
  3. 異なるブラウザで試してみる

## 🎯 上級者向け機能

### ショートカット
- **フィード追加**: URLをコピーしてから直接ペースト
- **複数記事処理**: 興味のある記事を順番に要約して一括確認
- **カテゴリ別閲覧**: YouTube/Podcast/記事のセクション別に効率的に確認

### 効率化テクニック
- **バックグラウンド処理**: 要約処理中に他の記事を閲覧
- **選択的要約**: 本当に興味のある長文コンテンツのみ要約実行
- **定期的な整理**: 週1回程度で不要なフィードを削除

---

## 📞 ヘルプ・サポート

何か問題が発生した場合や、機能改善の要望がある場合は：

1. **まずこのガイドのトラブルシューティングを確認**
2. **アプリのアップデート状況を確認**（ブラウザキャッシュのクリア）
3. **具体的な問題内容をメモして開発者に連絡**

**アプリURL**: `https://info-feed-app-production.up.railway.app`

このガイドを参考に、効率的な情報収集をお楽しみください！