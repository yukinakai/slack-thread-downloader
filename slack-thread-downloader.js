require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { WebClient } = require('@slack/web-api');
const AdmZip = require('adm-zip');

// SlackのURLからチャンネルIDとスレッドタイムスタンプを抽出する関数
function parseSlackUrl(url) {
  const regex = /slack\.com\/archives\/([A-Z0-9]+)\/p([0-9]+)/;
  const match = url.match(regex);
  
  if (match && match.length === 3) {
    const channelId = match[1];
    const rawTimestamp = match[2];
    
    // タイムスタンプ形式を変換 (p1741754154975769 -> 1741754154.975769)
    const threadTs = `${rawTimestamp.slice(0, -6)}.${rawTimestamp.slice(-6)}`;
    
    // スレッドIDとしてタイムスタンプの数値部分を使用
    const threadId = rawTimestamp;
    
    return { channelId, threadTs, threadId };
  }
  
  throw new Error('無効なSlack URL形式です');
}

// 画像をURLからダウンロードする関数
async function downloadImage(url, outputPath, token) {
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

// スレッドメッセージを取得してローカルに保存するメイン関数
async function saveSlackThread(slackUrl, outputDir = '~/Downloads/slack_thread') {
  // SlackのAPIトークンを.envから取得
  const token = process.env.SLACK_TOKEN;
  
  if (!token) {
    throw new Error('SLACK_TOKENが.envファイルに設定されていません');
  }
  
  const slack = new WebClient(token);
  
  try {
    // SlackのURLを解析
    const { channelId, threadTs, threadId } = parseSlackUrl(slackUrl);
    console.log(`チャンネルID: ${channelId}, スレッドタイムスタンプ: ${threadTs} を処理中...`);
    
    // スレッドIDごとのフォルダを作成
    const threadDir = path.join(outputDir, threadId);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    if (!fs.existsSync(threadDir)) {
      fs.mkdirSync(threadDir, { recursive: true });
    }
    
    const imagesDir = path.join(threadDir, 'images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }
    
    // スレッド返信を取得
    const threadReplies = await slack.conversations.replies({
      channel: channelId,
      ts: threadTs
    });
    
    // 全メッセージ
    const allMessages = threadReplies.messages;
    console.log(`合計 ${allMessages.length} メッセージを取得しました`);
    
    // 会話内容をJSONとして保存（詳細データ）
    fs.writeFileSync(
      path.join(threadDir, 'raw_data.json'), 
      JSON.stringify(allMessages, null, 2)
    );
    
    // 画像情報を追跡するためのマップ
    const imageMap = new Map();
    let imageCounter = 1;
    
    // 画像をダウンロード
    const imagePromises = [];
    for (const msg of allMessages) {
      if (msg.files && msg.files.length > 0) {
        if (!msg.imageFiles) msg.imageFiles = [];
        
        for (const file of msg.files) {
          if (file.mimetype && file.mimetype.startsWith('image/')) {
            const imageUrl = file.url_private;
            const extension = file.mimetype.split('/')[1];
            const imageName = `image_${imageCounter}.${extension}`;
            const imagePath = path.join(imagesDir, imageName);
            
            msg.imageFiles.push({
              name: imageName,
              path: `images/${imageName}`,
              originalName: file.name
            });
            
            imagePromises.push(
              downloadImage(imageUrl, imagePath, token)
                .then(() => console.log(`ダウンロード完了: ${imagePath}`))
                .catch(err => console.error(`画像ダウンロードエラー: ${imageUrl}`, err))
            );
            
            imageCounter++;
          }
        }
      }
    }
    
    await Promise.all(imagePromises);
    
    // 会話をMarkdownファイルに保存（読みやすい形式）
    const markdownContent = generateMarkdown(allMessages);
    fs.writeFileSync(path.join(threadDir, 'conversation.md'), markdownContent);
    
    // Zipファイルを作成
    await createZipArchive(threadDir, `${threadId}_archive.zip`);
    
    console.log(`スレッドが ${threadDir} に正常に保存されました`);
    console.log(`Zipアーカイブが ${path.join(threadDir, threadId + '_archive.zip')} に作成されました`);
    
    return { success: true, outputDir: threadDir };
    
  } catch (error) {
    console.error('Slackスレッド保存エラー:', error);
    throw error;
  }
}

// Markdownコンテンツを生成する関数
function generateMarkdown(messages) {
  let markdown = `# Slack スレッド会話\n\n`;
  
  markdown += `## 会話内容\n\n`;
  
  for (const msg of messages) {
    const timestamp = new Date(Number(msg.ts) * 1000).toISOString();
    const formattedDate = timestamp.replace('T', ' ').slice(0, 19);
    
    markdown += `### ${formattedDate} - ${msg.user}\n\n`;
    markdown += `${msg.text || '(テキストなし)'}\n\n`;
    
    // 画像がある場合はリンクを追加
    if (msg.imageFiles && msg.imageFiles.length > 0) {
      markdown += `#### 添付画像\n\n`;
      
      for (const image of msg.imageFiles) {
        markdown += `- [${image.originalName}](${image.path})\n`;
        markdown += `![${image.originalName}](${image.path})\n\n`;
      }
    }
    
    markdown += `---\n\n`;
  }
  
  return markdown;
}

// Zipアーカイブを作成する関数
async function createZipArchive(sourceDir, zipFilename) {
  try {
    const zip = new AdmZip();
    
    // conversation.mdを追加
    const mdPath = path.join(sourceDir, 'conversation.md');
    if (fs.existsSync(mdPath)) {
      zip.addLocalFile(mdPath);
    }
    
    // imagesフォルダを追加
    const imagesDir = path.join(sourceDir, 'images');
    if (fs.existsSync(imagesDir)) {
      zip.addLocalFolder(imagesDir, 'images');
    }
    
    // Zipファイルを保存
    zip.writeZip(path.join(sourceDir, zipFilename));
    return true;
  } catch (error) {
    console.error('Zipアーカイブ作成エラー:', error);
    throw error;
  }
}

// このスクリプトを直接実行する場合
if (require.main === module) {
  const slackUrl = process.argv[2];
  const outputDir = process.argv[3] || './slack_thread';
  
  if (!slackUrl) {
    console.error('最初の引数としてSlack URLを指定してください');
    process.exit(1);
  }
  
  saveSlackThread(slackUrl, outputDir)
    .then(() => console.log('処理が完了しました!'))
    .catch(err => {
      console.error('エラー:', err);
      process.exit(1);
    });
}

module.exports = { saveSlackThread };