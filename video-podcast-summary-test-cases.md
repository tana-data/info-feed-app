# 動画・Podcast要約機能 専用テストケース

**作成日**: 2025-06-28  
**対象機能**: YouTube動画・Podcast要約機能  
**重点検証**: 手動要約作成、自動要約防止機能

---

## 🎯 テスト目的

### 要件確認
1. **手動要約作成**: あくまで手動でのみ要約作成が行われること
2. **要約品質**: 正しく要約が作成できていること  
3. **API利用制御**: 自動での要約作成は行われないこと

---

## 🧪 テストケース設計

### 1. 手動要約作成機能テスト

#### TC_MANUAL_001: 手動要約モーダルの表示・操作
| Test ID | TC_MANUAL_001 |
|---------|---------------|
| **目的** | 手動要約モーダルの正常な表示と操作確認 |
| **前提条件** | YouTube/Podcast記事が表示されている |
| **テスト手順** | 1. 記事の「✏️ 手動要約」ボタンをクリック<br>2. モーダルダイアログの表示確認<br>3. テキストエリアに要約対象テキストを入力<br>4. 「要約を作成」ボタンをクリック |
| **期待結果** | - モーダルが正常に表示される<br>- テキスト入力が可能<br>- API呼び出しが実行される |
| **検証項目** | - モーダルのUI表示<br>- キャンセル機能<br>- 入力検証機能 |

#### TC_MANUAL_002: 手動要約API呼び出し検証
| Test ID | TC_MANUAL_002 |
|---------|---------------|
| **目的** | 手動要約APIの正常動作確認 |
| **API Endpoint** | `POST /api/articles/:id/summarize` |
| **Request Body** | `{ "manual_text": "要約対象のテキスト" }` |
| **期待Response** | HTTP 200 + summary_request作成 |
| **検証項目** | - API呼び出し成功<br>- データベース更新<br>- プログレスバー表示開始 |

#### TC_MANUAL_003: AI要約生成処理確認
| Test ID | TC_MANUAL_003 |
|---------|---------------|
| **目的** | AI API (OpenAI/Gemini) への適切な要約依頼 |
| **テスト手順** | 1. 手動テキストで要約リクエスト送信<br>2. AI API呼び出しログ確認<br>3. 要約結果の取得確認 |
| **期待結果** | - AI APIが適切に呼び出される<br>- 要約が正しく生成される<br>- 結果がDBに保存される |
| **検証項目** | - API使用量の記録<br>- エラーハンドリング<br>- 要約品質 |

### 2. 自動要約防止機能テスト

#### TC_AUTO_PREV_001: 自動要約トリガーの不在確認
| Test ID | TC_AUTO_PREV_001 |
|---------|---------------|
| **目的** | システムが自動的に要約を開始しないことの確認 |
| **テスト手順** | 1. 新しい記事を追加<br>2. 一定時間経過を待機<br>3. スケジューラー動作ログ確認<br>4. 要約リクエスト発生の有無確認 |
| **期待結果** | - 自動での要約リクエストが発生しない<br>- ユーザー操作なしでは要約が実行されない |
| **検証項目** | - summary_requestsテーブルの確認<br>- AI API呼び出しログ<br>- スケジューラー処理内容 |

#### TC_AUTO_PREV_002: ユーザー操作必須の確認
| Test ID | TC_AUTO_PREV_002 |
|---------|---------------|
| **目的** | 要約実行に必ずユーザーの明示的操作が必要なことの確認 |
| **テスト条件** | - YouTube動画記事が存在<br>- 字幕が利用可能<br>- AI APIキーが設定済み |
| **テスト手順** | 1. 記事一覧を表示<br>2. 要約ボタンの状態確認<br>3. ボタンクリック前後の動作比較 |
| **期待結果** | - ボタンクリックまで要約は実行されない<br>- 明示的なユーザー操作が必須 |

#### TC_AUTO_PREV_003: コンテンツタイプ制限の確認
| Test ID | TC_AUTO_PREV_003 |
|---------|---------------|
| **目的** | Web記事では自動要約ボタンが表示されないことの確認 |
| **テスト手順** | 1. 各コンテンツタイプの記事を表示<br>2. 要約ボタンの表示パターン確認 |
| **期待結果** | - YouTube/Podcast: 要約ボタン表示<br>- Web記事: 要約ボタン非表示<br>- 全タイプ: 手動要約ボタン表示 |

### 3. YouTube字幕取得・処理フローテスト

#### TC_YOUTUBE_001: 字幕利用可能性チェック
| Test ID | TC_YOUTUBE_001 |
|---------|---------------|
| **API Endpoint** | `GET /api/articles/:id/content-check` |
| **目的** | YouTube動画の字幕・説明文利用可能性の事前確認 |
| **テスト手順** | 1. 様々なYouTube URLでチェック実行<br>2. 利用可能性ステータス確認<br>3. UIでの表示状態確認 |
| **期待結果** | - 字幕あり: ✅ 要約可能表示<br>- 字幕なし: ❌ 要約不可表示<br>- エラー時: ❓ 確認失敗表示 |

#### TC_YOUTUBE_002: 字幕取得処理確認
| Test ID | TC_YOUTUBE_002 |
|---------|---------------|
| **目的** | YouTube字幕の実際の取得・キャッシュ処理確認 |
| **テスト対象ファイル** | `backend/utils/youtube-helper.js` |
| **検証項目** | - 多言語字幕の取得順序<br>- キャッシュ機能の動作<br>- エラー時のフォールバック |

#### TC_YOUTUBE_003: URLフォーマット対応確認
| Test ID | TC_YOUTUBE_003 |
|---------|---------------|
| **目的** | 様々なYouTube URL形式への対応確認 |
| **テストURL** | - youtube.com/watch?v=<br>- youtu.be/<br>- youtube.com/shorts/ |
| **期待結果** | 全形式で正常な動画ID抽出と処理 |

### 4. エラーハンドリング・UI/UXテスト

#### TC_ERROR_001: API制限・エラー時の動作
| Test ID | TC_ERROR_001 |
|---------|---------------|
| **目的** | AI API制限時やエラー時の適切な処理確認 |
| **テスト条件** | - API制限に達している状態<br>- ネットワークエラー発生 |
| **期待結果** | - 適切なエラーメッセージ表示<br>- 再試行機能の提供<br>- システムの安定動作継続 |

#### TC_UX_001: プログレスバー・フィードバック確認
| Test ID | TC_UX_001 |
|---------|---------------|
| **目的** | 要約処理中のユーザーフィードバック確認 |
| **検証項目** | - プログレスバーの表示<br>- 段階的メッセージ更新<br>- 完了時の通知 |

---

## 🔧 テスト実行環境要件

### 必要な設定
- Node.js サーバーが起動済み
- AI API (OpenAI または Gemini) のキーが設定済み
- SQLite データベースが初期化済み
- YouTube Data API キーが設定済み (字幕チェック用)

### テストデータ要件
- YouTube動画記事 (字幕あり・なし両方)
- Podcast記事
- Web記事
- 各種URL形式のYouTube動画

---

## 📊 合格基準

### 手動要約作成機能
- ✅ ユーザーの明示的操作でのみ要約が実行される
- ✅ 手動テキスト入力による要約が正常に動作する
- ✅ AI API呼び出しが適切に制御されている

### 自動要約防止機能  
- ✅ システム自体による自動要約が一切発生しない
- ✅ スケジューラーでの要約実行が行われない
- ✅ ユーザー操作なしでのAI API呼び出しが発生しない

### 要約品質
- ✅ 生成された要約が内容を適切に反映している
- ✅ エラー時の適切なフィードバックが提供される
- ✅ UI/UXが直感的で分かりやすい

---

*このテストケースに基づいて、動画・Podcast要約機能の品質と要件適合性を検証します。*