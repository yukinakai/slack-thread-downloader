# Slack Thread Downloader

Slackの特定のスレッドの会話と添付画像を取得し、ローカルに保存するNode.jsスクリプト。

## 機能

- Slack URLからスレッドの会話を取得
- スレッド内の全メッセージをMarkdown形式で保存
- スレッド内のすべての画像を自動ダウンロード
- Markdownファイル内に画像へのリンクを自動挿入
- スレッドIDごとにデータを整理
- 会話と画像をZIPアーカイブとして保存
- 生データをJSON形式で保存（詳細分析用）

## 必要条件

- Node.js 14以上
- Slack APIトークン（Bot Token）

## インストール

1. リポジトリをクローン:

```bash
git clone https://github.com/yukinakai/slack-thread-downloader.git
cd slack-thread-downloader
```

2. 依存パッケージをインストール:

```bash
npm install
```

3. `.env.sample`を`.env`にコピーし、SlackのAPIトークンを設定:

```bash
cp .env.sample .env
```

`.env`ファイルを編集し、`SLACK_TOKEN`に有効なSlack APIトークンを設定してください。

## Slack APIトークンの取得方法

1. [Slack API ウェブサイト](https://api.slack.com/apps)にアクセス
2. 「Create New App」をクリック
3. 「From scratch」を選択し、アプリ名とワークスペースを設定
4. 「OAuth & Permissions」セクションに移動
5. 以下のスコープを追加:
   - `channels:history`
   - `channels:read`
   - `chat:write`
   - `files:read`
   - `groups:history`
   - `groups:read`
   - `im:history`
   - `im:read`
   - `mpim:history`
   - `mpim:read`
6. アプリをワークスペースにインストール
7. Bot User OAuth Tokenを取得（`xoxb-`で始まるトークン）

## 使用方法

```bash
node slack-thread-downloader.js [SLACK_THREAD_URL] [OUTPUT_DIRECTORY]
```

例:

```bash
node slack-thread-downloader.js https://workspace.slack.com/archives/C04PPCC3X70/p1741754154975769 ./slack_thread
```

### 引数

- `SLACK_THREAD_URL`: 必須。ダウンロードしたいSlackスレッドのURL
- `OUTPUT_DIRECTORY`: オプション。保存先ディレクトリ（デフォルト: `./slack_thread`）

## 出力

スクリプトは指定された出力ディレクトリに以下の構造でファイルを生成します:

```
slack_thread/
├── [スレッドID]/
│   ├── conversation.md     # Markdown形式の会話テキスト（画像へのリンク付き）
│   ├── raw_data.json       # APIから取得した生データ（JSON形式）
│   ├── [スレッドID]_archive.zip  # 会話と画像をまとめたZIPアーカイブ
│   └── images/             # ダウンロードした画像ファイル
│       ├── image_1.jpg
│       ├── image_2.png
│       └── ...
```

## 詳細情報

### conversation.mdの形式

会話は以下のようなMarkdown形式で保存されます:

```markdown
# Slack スレッド会話

## 会話内容

### 2025-03-13 01:45:23 - U12345678

こんにちは！

#### 添付画像

- [photo.jpg](images/image_1.jpg)
![photo.jpg](images/image_1.jpg)

---

### 2025-03-13 01:46:05 - U87654321

お返事です！

---
```

### ZIPアーカイブ

各スレッドフォルダ内に`[スレッドID]_archive.zip`という名前でZIPファイルが生成されます。このZIPファイルには以下が含まれます:

- `conversation.md`: Markdown形式の会話
- `images/`: ダウンロードした全画像

## ライセンス

MIT

## 制限事項

- プライベートチャンネルやDMを取得するには、適切なスコープとアクセス権が必要です
- Slack APIのレート制限に注意してください
- 非常に大量の画像がある場合は、ダウンロードに時間がかかることがあります