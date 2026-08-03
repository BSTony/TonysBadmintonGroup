const https = require('https');
const config = require('./config.json');

const TOKEN = config.channelAccessToken;

const data = JSON.stringify({
  to: "dummy_id",
  messages: [
    {
      type: "text",
      text: "報名成功提醒：\n@User",
      mention: {
        mentionees: [
          {
            index: 8,
            length: 5,
            type: "user",
            userId: "Uf20a671391d4d1cc544155db9e652c7c"
          }
        ]
      }
    }
  ]
});

const options = {
  hostname: 'api.line.me',
  path: '/v2/bot/message/push',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + TOKEN
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => console.log('Status:', res.statusCode, 'Body:', body));
});

req.on('error', (e) => console.error(e));
req.write(data);
req.end();
