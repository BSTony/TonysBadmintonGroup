const fs = require('fs');
let code = fs.readFileSync('index.js', 'utf8');

code = code.replace(/const client = new line\.Client\(config\);/, `
const client = {
  replyMessage: async (token, msg) => {
    console.log('REPLY_MESSAGE_CALLED');
    console.log(JSON.stringify(msg, null, 2));
  },
  getProfile: async () => ({ displayName: 'TestUser' }),
  getGroupMemberProfile: async () => ({ displayName: 'TestUser' })
};
`);

const start = code.indexOf("app.post('/webhook'");
const end = code.indexOf("app.listen(port");
code = code.substring(0, start) + code.substring(end);

code += `
async function runTest() {
  superAdmins = new Set(['U12345']);
  const event = {
    type: 'message',
    replyToken: 'dummyToken',
    source: { type: 'user', userId: 'U12345' },
    message: { type: 'text', text: '接龍狀況' }
  };
  
  // mock the event handler logic manually
  const gid = event.source.groupId || event.source.roomId || event.source.userId;
  const uid = event.source.userId;
  const text = event.message.text.trim();
  const cleanText = text.replace(/\\n\\n\\[系統代發\\]$/, '').trim();
  const isPlusMinus = cleanText.match(/^\\+[1-9]/) || cleanText.match(/^-[1-9]/) || cleanText.match(/\\+[1-9]$/) || cleanText.match(/-[1-9]$/) || cleanText.match(/🔄順序更新$/) || cleanText.match(/💰繳費更新$/);

  const getGameTime = (g) => {
        let t = 0;
        if (g.date) {
          let dStr = g.date.trim();
          if (dStr.match(/^\\d{1,2}\\/\\d{1,2}$/)) {
            dStr = new Date().getFullYear() + '/' + dStr;
          }
          const pd = new Date(\`\${dStr} \${g.time || ''}\`.trim());
          if (!isNaN(pd.getTime())) t = pd.getTime();
        }
        return t === 0 ? (g.startTime || 0) : t;
  };
  const targetGames = Object.values(games)
        .filter(g => (g.gid === gid || (g.targetGids && g.targetGids.includes(gid))) && g.active && !g.isManualEnded)
        .sort((a, b) => getGameTime(a) - getGameTime(b));
  
  if (targetGames.length === 0) {
    return client.replyMessage(event.replyToken, { type: 'text', text: '目前沒有進行中的場次喔！' });
  }
}

runTest();
`;

fs.writeFileSync('test_status2.js', code);
