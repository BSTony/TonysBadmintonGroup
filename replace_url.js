const fs = require('fs');

let indexJs = fs.readFileSync('index.js', 'utf8');
let appJs = fs.readFileSync('public/app.js', 'utf8');

if (!indexJs.includes('getLobbyCard')) {
  indexJs += `\nfunction getLobbyCard(gid) {
  if (!process.env.LIFF_ID) return null;
  return {
    type: 'flex',
    altText: '點我進大廳',
    contents: {
      type: 'bubble',
      size: 'kilo',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            style: 'primary',
            height: 'sm',
            action: {
              type: 'uri',
              label: '進入大廳',
              uri: \`https://liff.line.me/\${process.env.LIFF_ID}?gid=\${gid}\`
            }
          }
        ]
      }
    }
  };
}\n`;
}

// 1. pushList in index.js
indexJs = indexJs.replace(
  /if \(process\.env\.LIFF_ID\) \{\s*currentMsg \+= `\\n👇 點擊下方連結開啟大廳\\nhttps:\/\/liff\.line\.me\/\$\{process\.env\.LIFF_ID\}\?gid=\$\{singleTargetGid\}`;[\s\S]*?if \(clientSupportsLiffSendMessage && isAdmin\) \{[\s\S]*?triggerBumpMsg = currentMsg;[\s\S]*?\} else \{[\s\S]*?for \(const targetGid of pushTargetGids\) \{[\s\S]*?let pushMsg = msg;[\s\S]*?if \(process\.env\.LIFF_ID\) \{[\s\S]*?pushMsg \+= `\\n👇 點擊下方連結開啟大廳\\nhttps:\/\/liff\.line\.me\/\$\{process\.env\.LIFF_ID\}\?gid=\$\{targetGid\}`;[\s\S]*?\}[\s\S]*?try \{[\s\S]*?await pushToAdmins\(targetGid, \{ type: 'text', text: pushMsg\.trim\(\) \}\);/g,
  `let triggerBumpMsgs = null;
      if (clientSupportsLiffSendMessage && isAdmin) {
        // 交給前端自動發話
        triggerBumpMsgs = [
          { type: 'text', text: msg.trim() },
          getLobbyCard(singleTargetGid)
        ].filter(Boolean);
        triggerBumpMsg = msg.trim(); // fallback
      } else {
        // 回退到私訊代理
        for (const targetGid of pushTargetGids) {
          let pushMsgs = [{ type: 'text', text: msg.trim() }];
          if (process.env.LIFF_ID) {
            pushMsgs.push(getLobbyCard(targetGid));
          }
          try {
            await pushToAdmins(targetGid, pushMsgs);`
);

indexJs = indexJs.replace(
  /triggerBumpMsg: triggerBumpMsg,/,
  `triggerBumpMsg: triggerBumpMsg,
        triggerBumpMsgs: triggerBumpMsgs,`
);

indexJs = indexJs.replace(
  /let triggerBumpMsg = null;/,
  `let triggerBumpMsg = null;\n    let triggerBumpMsgs = null;`
);

indexJs = indexJs.replace(
  /if \(clientSupportsLiffSendMessage && isAdmin\) \{\s*console\.log\('\[Webhook\] 前端支援且為管理員，跳過 pushToAdmins，交由前端 liff\.sendMessages 觸發'\);\s*triggerBumpMsg = bumpMsg; \/\/ 記錄下來，稍後傳給前端\s*\}/g,
  `if (clientSupportsLiffSendMessage && isAdmin) {
            console.log('[Webhook] 前端支援且為管理員，跳過 pushToAdmins，交由前端 liff.sendMessages 觸發');
            triggerBumpMsg = bumpMsg; // fallback
            triggerBumpMsgs = [{ type: 'text', text: bumpMsg }].filter(Boolean);
            if (process.env.LIFF_ID) {
              triggerBumpMsgs.push(getLobbyCard(targetGid));
            }
          }`
);

indexJs = indexJs.replace(
  /if \(triggerBumpMsg\) \{\s*msg \+= `\\n🎉 【遞補通知】\\n\$\{triggerBumpMsg\}`;\s*\}/g,
  `if (triggerBumpMsg) {
           msg += \`\\n🎉 【遞補通知】\\n\${triggerBumpMsg}\`;
           if (triggerBumpMsgs) {
             triggerBumpMsgs.unshift({ type: 'text', text: \`🎉 【遞補通知】\` });
           }
        }`
);

indexJs = indexJs.replace(
  /await pushToAdmins\(targetGid, \{ type: 'text', text: bumpMsg \}\);/g,
  `let bumpMsgs = [{ type: 'text', text: bumpMsg }];
            if (process.env.LIFF_ID) {
              bumpMsgs.push(getLobbyCard(targetGid));
            }
            await pushToAdmins(targetGid, bumpMsgs);`
);

indexJs = indexJs.replace(
  /triggerBumpMsg: triggerBumpMsg\s*\}/g,
  `triggerBumpMsg: triggerBumpMsg, triggerBumpMsgs: triggerBumpMsgs }`
);

indexJs = indexJs.replace(
  /if \(token\) \{\s*let replyMsg = msg;\s*if \(process\.env\.LIFF_ID\) \{\s*replyMsg \+= `\\n\\n👇 點擊下方連結開啟快速報名與查看名單\\nhttps:\/\/liff\.line\.me\/\$\{process\.env\.LIFF_ID\}\?gid=\$\{g\.gid\}`;\s*\}\s*return await client\.replyMessage\(token, \{ type: 'text', text: replyMsg\.trim\(\) \}\);\s*\}/g,
  `if (token) {
    let replyMsgs = [{ type: 'text', text: msg.trim() }];
    if (process.env.LIFF_ID) {
      replyMsgs.push(getLobbyCard(g.gid));
    }
    return await client.replyMessage(token, replyMsgs);
  }`
);

indexJs = indexJs.replace(
  /for \(const targetGid of pushTargets\) \{\s*let currentMsg = msg;\s*if \(process\.env\.LIFF_ID\) \{\s*currentMsg \+= `\\n\\n👇 點擊下方連結開啟快速報名與查看名單\\nhttps:\/\/liff\.line\.me\/\$\{process\.env\.LIFF_ID\}\?gid=\$\{targetGid\}`;\s*\}\s*try \{\s*await pushToAdmins\(targetGid, \{ type: 'text', text: currentMsg\.trim\(\) \}\);/g,
  `for (const targetGid of pushTargets) {
    let currentMsgs = [{ type: 'text', text: msg.trim() }];
    if (process.env.LIFF_ID) {
      currentMsgs.push(getLobbyCard(targetGid));
    }
    try {
      await pushToAdmins(targetGid, currentMsgs);`
);

indexJs = indexJs.replace(
  /return client\.replyMessage\(event\.replyToken, \{\s*type: 'text',\s*text: `🔗 群組 \$\{queryCode\} 的專屬大廳網址為：\\nhttps:\/\/liff\.line\.me\/\$\{process\.env\.LIFF_ID\}\?gid=\$\{targetGid\}`\s*\}\);/g,
  `return client.replyMessage(event.replyToken, [
          { type: 'text', text: \`🔗 群組 \${queryCode} 的專屬大廳已開啟：\` },
          getLobbyCard(targetGid)
        ]);`
);


appJs = appJs.replace(
  /if \(typeof liff !== 'undefined' && liff\.isInClient\(\) && data\.triggerBumpMsg\) \{\s*try \{\s*await liff\.sendMessages\(\[\{ type: 'text', text: data\.triggerBumpMsg \}\]\);/g,
  `if (typeof liff !== 'undefined' && liff.isInClient() && (data.triggerBumpMsgs || data.triggerBumpMsg)) {
      try {
        if (data.triggerBumpMsgs && data.triggerBumpMsgs.length > 0) {
          await liff.sendMessages(data.triggerBumpMsgs);
        } else {
          await liff.sendMessages([{ type: 'text', text: data.triggerBumpMsg }]);
        }`
);

appJs = appJs.replace(
  /if \(typeof liff !== 'undefined' && liff\.isInClient\(\) && data\.triggerBumpMsg\) \{\s*try \{\s*await liff\.sendMessages\(\[\{ type: 'text', text: data\.triggerBumpMsg \}\]\);\s*alert\('已成功透過您的 LINE 發送名單至群組！'\);\s*\}\s*catch\s*\(e\)\s*\{\s*alert\('發送名單失敗：' \+ e\.message\);\s*\}\s*\}/g,
  `if (typeof liff !== 'undefined' && liff.isInClient() && (data.triggerBumpMsgs || data.triggerBumpMsg)) {
        try {
          if (data.triggerBumpMsgs && data.triggerBumpMsgs.length > 0) {
            await liff.sendMessages(data.triggerBumpMsgs);
          } else {
            await liff.sendMessages([{ type: 'text', text: data.triggerBumpMsg }]);
          }
          alert('已成功透過您的 LINE 發送名單至群組！');
        } catch (e) {
          alert('發送名單失敗：' + e.message);
        }
      }`
);

fs.writeFileSync('index.js', indexJs);
fs.writeFileSync('public/app.js', appJs);

console.log('done');
