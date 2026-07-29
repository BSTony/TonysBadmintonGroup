import re

with open('index.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = r"""const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || ''
};

// 檢查必??環境???
if (!config.channelAccessToken || !config.channelSecret) {
  console.error('???誤：?設???變數 LINE_CHANNEL_ACCESS_TOKEN ??LINE_CHANNEL_SECRET');
  console.error('   ??Render 上?Settings > Environment Variables');
  process.exit(1);
}"""

replacement = r"""const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || 'fake_token',
  channelSecret: process.env.LINE_CHANNEL_SECRET || 'fake_secret'
};

if (!process.env.LINE_CHANNEL_ACCESS_TOKEN || !process.env.LINE_CHANNEL_SECRET) {
  console.warn('⚠️ 警告：未設定 LINE 環境變數，本機將以假 Token 啟動（LINE Bot 訊息功能將失效，但網頁可正常測試）');
}"""

content_normalized = re.sub(r'\r\n', '\n', content)
# Because of mojibake in target, I will use a regex search
pattern = re.compile(r"const config = \{\s*channelAccessToken:[^;]+;\s*//[^i]+if \(!config\.channelAccessToken \|\| !config\.channelSecret\) \{[^}]+\}", re.MULTILINE)

new_content = pattern.sub(replacement, content_normalized)

if new_content != content_normalized:
    with open('index.js', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("done")
else:
    print("Not found")
