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
code = code.substring(0, code.indexOf("app.post('/webhook'"));
code = code + `
async function runTest() {
  superAdmins = new Set(['U12345']);
  const event = {
    type: 'message',
    replyToken: 'dummyToken',
    source: { type: 'user', userId: 'U12345' },
    message: { type: 'text', text: '接龍狀況' }
  };
  await handleMessageEvent(event);
  console.log('Test done');
}
runTest();
`;
fs.writeFileSync('test_status.js', code);
