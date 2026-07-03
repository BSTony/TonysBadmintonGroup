const fs = require('fs');

let indexJs = fs.readFileSync('index.js', 'utf8');
let appJs = fs.readFileSync('public/app.js', 'utf8');

// 1. Add getLobbyCard helper
if (!indexJs.includes('getLobbyCard(gid)')) {
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

// 2. pushList action
indexJs = indexJs.replace(
  `      if (process.env.LIFF_ID) {
        currentMsg += \`\\n👇 點擊下方連結開啟大廳\\nhttps://liff.line.me/\${process.env.LIFF_ID}?gid=\${singleTargetGid}\`;
      }`,
  ``
);

indexJs = indexJs.replace(
  `      if (clientSupportsLiffSendMessage && isAdmin) {
        // 交給前端自動發話
        triggerBumpMsg = currentMsg;
      } else {
        // 回退到私訊代理
        for (const targetGid of pushTargetGids) {
          let pushMsg = msg;
          if (process.env.LIFF_ID) {
            pushMsg += \`\\n👇 點擊下方連結開啟大廳\\nhttps://liff.line.me/\${process.env.LIFF_ID}?gid=\${targetGid}\`;
          }
          try {
            await pushToAdmins(targetGid, { type: 'text', text: pushMsg.trim() });`,
  `      let triggerBumpMsgs = null;
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
  `        triggerBumpMsg: triggerBumpMsg,
        isAdmin: isAdmin`,
  `        triggerBumpMsg: triggerBumpMsg,
        triggerBumpMsgs: triggerBumpMsgs,
        isAdmin: isAdmin`
);

// 3. other actions
indexJs = indexJs.replace(
  `    // 儲存要讓前端觸發的訊息
    let triggerBumpMsg = null;`,
  `    // 儲存要讓前端觸發的訊息
    let triggerBumpMsg = null;
    let triggerBumpMsgs = null;`
);

indexJs = indexJs.replace(
  `          if (clientSupportsLiffSendMessage && isAdmin) {
            console.log('[Webhook] 前端支援且為管理員，跳過 pushToAdmins，交由前端 liff.sendMessages 觸發');
            triggerBumpMsg = bumpMsg; // 記錄下來，稍後傳給前端
          } else {
            // 回退代理
            await pushToAdmins(targetGid, { type: 'text', text: bumpMsg });`,
  `          if (clientSupportsLiffSendMessage && isAdmin) {
            console.log('[Webhook] 前端支援且為管理員，跳過 pushToAdmins，交由前端 liff.sendMessages 觸發');
            triggerBumpMsg = bumpMsg; // fallback
            triggerBumpMsgs = [{ type: 'text', text: bumpMsg }];
            if (process.env.LIFF_ID) {
              triggerBumpMsgs.push(getLobbyCard(targetGid));
            }
          } else {
            // 回退代理
            let bumpMsgs = [{ type: 'text', text: bumpMsg }];
            if (process.env.LIFF_ID) {
              bumpMsgs.push(getLobbyCard(targetGid));
            }
            await pushToAdmins(targetGid, bumpMsgs);`
);

indexJs = indexJs.replace(
  `        if (triggerBumpMsg) {
           msg += \`\\n🎉 【遞補通知】\\n\${triggerBumpMsg}\`;
        }`,
  `        if (triggerBumpMsg) {
           msg += \`\\n🎉 【遞補通知】\\n\${triggerBumpMsg}\`;
           if (triggerBumpMsgs) {
             triggerBumpMsgs.unshift({ type: 'text', text: \`🎉 【遞補通知】\` });
           }
        }`
);

indexJs = indexJs.replace(
  `      triggerBumpMsg: triggerBumpMsg 
    });`,
  `      triggerBumpMsg: triggerBumpMsg, triggerBumpMsgs: triggerBumpMsgs 
    });`
);

// 4. 接龍大廳 (handleEvent)
indexJs = indexJs.replace(
  `        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: \`🔗 群組 \${queryCode} 的專屬大廳網址為：\\nhttps://liff.line.me/\${process.env.LIFF_ID}?gid=\${targetGid}\`
        });`,
  `        return client.replyMessage(event.replyToken, [
          { type: 'text', text: \`🔗 群組 \${queryCode} 的專屬大廳已開啟：\` },
          getLobbyCard(targetGid)
        ]);`
);

// 5. sendList
indexJs = indexJs.replace(
  `  if (token) {
    let replyMsg = msg;
    if (process.env.LIFF_ID) {
      replyMsg += \`\\n\\n👇 點擊下方連結開啟快速報名與查看名單\\nhttps://liff.line.me/\${process.env.LIFF_ID}?gid=\${g.gid}\`;
    }
    return await client.replyMessage(token, { type: 'text', text: replyMsg.trim() });
  }
  // 若無 token 則使用 Push Message (用於定時推播)
  for (const targetGid of pushTargets) {
    let currentMsg = msg;
    if (process.env.LIFF_ID) {
      currentMsg += \`\\n\\n👇 點擊下方連結開啟快速報名與查看名單\\nhttps://liff.line.me/\${process.env.LIFF_ID}?gid=\${targetGid}\`;
    }
    try {
      await pushToAdmins(targetGid, { type: 'text', text: currentMsg.trim() });`,
  `  if (token) {
    let replyMsgs = [{ type: 'text', text: msg.trim() }];
    if (process.env.LIFF_ID) {
      replyMsgs.push(getLobbyCard(g.gid));
    }
    return await client.replyMessage(token, replyMsgs);
  }
  // 若無 token 則使用 Push Message (用於定時推播)
  for (const targetGid of pushTargets) {
    let currentMsgs = [{ type: 'text', text: msg.trim() }];
    if (process.env.LIFF_ID) {
      currentMsgs.push(getLobbyCard(targetGid));
    }
    try {
      await pushToAdmins(targetGid, currentMsgs);`
);

// 6. sendLobbyLink
indexJs = indexJs.replace(
  `  if (process.env.LIFF_ID) {
    msg += \`\\n👇 點擊下方連結進入報名大廳\\nhttps://liff.line.me/\${process.env.LIFF_ID}?gid=\${gid}\`;
  }
  
  const message = { type: 'text', text: msg.trim() };
  if (token) {
    return await client.replyMessage(token, message);
  }
  try {
    return await pushToAdmins(gid, message);
  } catch (e) {
    console.error(\`pushToAdmins failed for \${gid}:\`, e);
    throw e;
  }`,
  `  let msgs = [{ type: 'text', text: msg.trim() }];
  if (process.env.LIFF_ID) {
    msgs.push(getLobbyCard(gid));
  }
  
  if (token) {
    return await client.replyMessage(token, msgs);
  }
  try {
    return await pushToAdmins(gid, msgs);
  } catch (e) {
    console.error(\`pushToAdmins failed for \${gid}:\`, e);
    throw e;
  }`
);

// 7. public/app.js liff.sendMessages
appJs = appJs.replace(
  `    // 自動推播名單機制：使用 liff.sendMessages 觸發後端免費回覆
    if (typeof liff !== 'undefined' && liff.isInClient() && data.triggerBumpMsg) {
      try {
        await liff.sendMessages([{ type: 'text', text: data.triggerBumpMsg }]);
        console.log('自動發話成功');
      } catch (e) {
        console.error('自動發話失敗:', e);
        alert('自動發話失敗！請確認 LINE Developers 後台是否已勾選 chat_message.write 權限。錯誤訊息: ' + e.message);
      }
    }`,
  `    // 自動推播名單機制：使用 liff.sendMessages 觸發後端免費回覆
    if (typeof liff !== 'undefined' && liff.isInClient() && (data.triggerBumpMsgs || data.triggerBumpMsg)) {
      try {
        if (data.triggerBumpMsgs && data.triggerBumpMsgs.length > 0) {
          await liff.sendMessages(data.triggerBumpMsgs);
        } else {
          await liff.sendMessages([{ type: 'text', text: data.triggerBumpMsg }]);
        }
        console.log('自動發話成功');
      } catch (e) {
        console.error('自動發話失敗:', e);
        alert('自動發話失敗！請確認 LINE Developers 後台是否已勾選 chat_message.write 權限。錯誤訊息: ' + e.message);
      }
    }`
);

appJs = appJs.replace(
  `    if (typeof liff !== 'undefined' && liff.isInClient() && data.triggerBumpMsg) {
      try {
        await liff.sendMessages([{ type: 'text', text: data.triggerBumpMsg }]);
        alert('已成功透過您的 LINE 發送名單至群組！');
      } catch (e) {
        console.error('自動發話失敗:', e);
        alert('自動發話失敗，可能未授權發言權限');
      }
    }`,
  `    if (typeof liff !== 'undefined' && liff.isInClient() && (data.triggerBumpMsgs || data.triggerBumpMsg)) {
      try {
        if (data.triggerBumpMsgs && data.triggerBumpMsgs.length > 0) {
          await liff.sendMessages(data.triggerBumpMsgs);
        } else {
          await liff.sendMessages([{ type: 'text', text: data.triggerBumpMsg }]);
        }
        alert('已成功透過您的 LINE 發送名單至群組！');
      } catch (e) {
        console.error('自動發話失敗:', e);
        alert('自動發話失敗，可能未授權發言權限');
      }
    }`
);

fs.writeFileSync('index.js', indexJs);
fs.writeFileSync('public/app.js', appJs);
console.log('Done replacement!');
