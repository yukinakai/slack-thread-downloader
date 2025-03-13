require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { WebClient } = require('@slack/web-api');

// SlackのURLからチャンネルIDとスレッドタイムスタンプを抽出する関数
function parseSlackUrl(url) {
  const regex = /slack\.com\/archives\/([A-Z0-9]+)\/p([0-9]+)/;
  const match = url.match(regex);
  
  if (match && match.length === 3) {
    const channelId = match[1];
    const rawTimestamp = match[2];
    
    // タイムスタンプ形式を変換 (p1741754154975769 -> 1741754154.975769)
    const threadTs = `${rawTimestamp.slice(0, -6)}.${rawTimestamp.slice(-6)}`;
    
    return { channelId, threadTs };
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
async function saveSlackThread(slackUrl, outputDir = './slack_thread') {
  // SlackのAPIトークンを.envから取得
  const token = process.env.SLACK_TOKEN;
  
  if (!token) {
    throw new Error('SLACK_TOKENが.envファイルに設定されていません');
  }
  
  const slack = new WebClient(token);
  
  // 出力ディレクトリが存在しない場合は作成
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const imagesDir = path.join(outputDir, 'images');
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }
  
  try {
    // SlackのURLを解析
    const { channelId, threadTs } = parseSlackUrl(slackUrl);
    console.log(`チャンネルID: ${channelId}, スレッドタイムスタンプ: ${threadTs} を処理中...`);
    
    // 親メッセージを取得
    const parentMessage = await slack.conversations.history({
      channel: channelId,
      latest: threadTs,
      limit: 1,
      inclusive: true
    });
    
    // スレッド返信を取得
    const threadReplies = await slack.conversations.replies({
      channel: channelId,
      ts: threadTs
    });
    
    // 親メッセージと返信を結合
    const allMessages = threadReplies.messages;
    console.log(`合計 ${allMessages.length} メッセージを取得しました`);
    
    // 会話内容をJSONとして保存（詳細データ）
    fs.writeFileSync(
      path.join(outputDir, 'raw_data.json'), 
      JSON.stringify(allMessages, null, 2)
    );
    
    // 会話をテキストファイルに保存（読みやすい形式）
    const conversationText = allMessages.map(msg => {
      const timestamp = new Date(Number(msg.ts) * 1000).toISOString();
      return `[${timestamp}] ${msg.user}: ${msg.text}`;
    }).join('\n\n');
    
    fs.writeFileSync(path.join(outputDir, 'conversation.txt'), conversationText);
    
    // ダウンロードした画像を追跡
    const imagePromises = [];
    let imageCounter = 1;
    
    // 画像をダウンロード
    for (const msg of allMessages) {
      if (msg.files && msg.files.length > 0) {
        for (const file of msg.files) {
          if (file.mimetype && file.mimetype.startsWith('image/')) {
            const imageUrl = file.url_private;
            const extension = file.mimetype.split('/')[1];
            const imagePath = path.join(imagesDir, `image_${imageCounter}.${extension}`);
            
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
    
    console.log(`スレッドが ${outputDir} に正常に保存されました`);
    return { success: true, outputDir };
    
  } catch (error) {
    console.error('Slackスレッド保存エラー:', error);
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