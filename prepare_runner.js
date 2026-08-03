const fs = require('fs');
let code = fs.readFileSync('test_webhook.js', 'utf8');

code = code.replace(/const client = new line\.Client\(config\);/, `
const client = {
    replyMessage: async (token, msg) => { console.log('REPLY:', JSON.stringify(msg, null, 2)); return true; },
    pushMessage: async (to, msg) => { console.log('PUSH:', JSON.stringify(msg, null, 2)); return true; }
};
`);

code += `
setTimeout(async () => {
    games['mock_game'] = {
        title: '週六打球',
        date: '07/31',
        time: '14:00',
        location: 'Stadium',
        gid: 'group123',
        gameId: 'mock_game',
        active: true,
        sections: [{ list: ['Tony', 'Alice'] }]
    };
    
    superAdmins.add('U12345');
    
    console.log('--- TESTING 推播提醒 週六 ---');
    const event = {
        type: 'message',
        message: { type: 'text', text: '推播提醒 週六' },
        source: { userId: 'U12345', groupId: 'group123' },
        replyToken: 'dummy_token'
    };
    try {
        await handleMessageEvent(event);
        console.log('--- TEST FINISHED ---');
    } catch (e) {
        console.error('--- CRASH ---', e);
    }
    process.exit(0);
}, 2000);
`;

fs.writeFileSync('test_webhook_runner.js', code);
console.log('Runner created in test_webhook_runner.js');
