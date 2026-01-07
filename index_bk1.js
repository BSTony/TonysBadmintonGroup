const express = require('express');
const { Client, middleware } = require('@line/bot-sdk');

const config = {
  channelAccessToken: 'YkgpPYGgaiXKFjIPzz7ZhMY1xm2QXZDGbgxlt/Am9HT8KUXEnUS21KS1sAmsTSBWc36/3tWRC29oUFJN3/bVUdIcvT4fQJVvXdED94p0OHZd8zFaRpTOr1lw4FbNn48YePshWOD5X8nr57c06d8PzwdB04t89/1O/w1cDnyilFU=',
  channelSecret: 'c8412419f4c937befe1d0856491b8a8b'
};

const client = new Client(config);
const app = express();

// 全域存儲：支援多群組、多區段
let games = {};

app.post('/webhook', middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.sendStatus(200))
    .catch((err) => {
      console.error('Webhook Error:', err);
      res.sendStatus(200); // 即使出錯也回 200，避免 LINE 停用 Webhook
    });
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return null;

  const gid = event.source.groupId || event.source.userId;
  const uid = event.source.userId;
  const text = event.message.text.trim();

  // --- 指令解析輔助函數 ---
  const getParams = (str) => {
    const matches = str.match(/\{(.+?)\}/g);
    return matches ? matches.map(m => m.slice(1, -1)) : [];
  };

  try {
    // 1. 接龍開始
    if (text.startsWith('接龍開始')) {
      const titleMatch = text.match(/標題\s*\{([\s\S]*?)\}/);
      const limitMatch = text.match(/人數\s*\{(\d+)\}/);
      const backupMatch = text.match(/候補\s*\{(\d+)\}/);
      const listMatch = text.match(/名單\s*\{([\s\S]*?)\}/);

      const title = titleMatch ? titleMatch[1].trim() : '羽球接龍';
      const limit = limitMatch ? parseInt(limitMatch[1], 10) : 20;
      const backupLimit = backupMatch ? parseInt(backupMatch[1], 10) : 5;
      
      let initialList = [];
      if (listMatch) {
        initialList = listMatch[1]
          .split(/[,\n]+/)
          .map(line => line.trim())
          .filter(line => line)
          .map(line => line.replace(/^\d+[.\s]*\s*/, ''));
      }

      games[gid] = {
        title: title,
        note: '',
        active: true,
        sections: [
          { title: '報名名單', limit: limit, backupLimit: backupLimit, label: '', list: initialList }
        ]
      };
      return await sendList(event.replyToken, gid, "🚀 接龍設定成功！");
    }

    if (!games[gid] || !games[gid].active) return null;

    // 2. 報名 (+1) / 取消 (-1)
    const addMatch = text.match(/^\+(\d+)(.*)/);
    if (addMatch) {
      const count = parseInt(addMatch[1], 10);
      const content = addMatch[2].trim();
      if (content) {
        content.split(/[\s,]+/).forEach(n => addToList(gid, 0, n));
      } else if (count === 1) {
        addToList(gid, 0, await getName(gid, uid));
      }
      return await sendList(event.replyToken, gid);
    }
    if (text.startsWith('-1')) {
      let name = text.slice(2).trim();
      if (!name) name = await getName(gid, uid);
      removeFromList(gid, name);
      return await sendList(event.replyToken, gid);
    }

    // 3. 批量名單 或 查詢
    if (text.startsWith('接龍名單')) {
      const input = text.replace('接龍名單', '').trim();
      if (input === '' || input === '#') return await sendList(event.replyToken, gid);
      input.split(/\s+/).forEach(n => addToList(gid, 0, n));
      return await sendList(event.replyToken, gid);
    }

    // 4. 多區段設定: 接龍 {段標題}{人數}{候補}{標籤} 或 接龍2...
    if (text.startsWith('接龍') && text.includes('{')) {
      const p = getParams(text);
      const idx = text.startsWith('接龍2') ? 1 : 0;
      games[gid].sections[idx] = {
        title: p[0] || `區段${idx + 1}`,
        limit: parseInt(p[1]) || 10,
        backupLimit: parseInt(p[2]) || 0,
        label: p[3] || '',
        list: games[gid].sections[idx]?.list || []
      };
      return await sendList(event.replyToken, gid, `⚙️ 區段${idx + 1} 更新成功`);
    }

    // 5. 清除/刪除/結束
    if (text === '接龍清空') {
      games[gid].sections.forEach(s => s.list = []);
      return await client.replyMessage(event.replyToken, { type: 'text', text: '🧹 名單已清空' });
    }
    if (text === '接龍刪除') {
      delete games[gid];
      return await client.replyMessage(event.replyToken, { type: 'text', text: '🗑️ 設置已移除' });
    }
    if (text === '接龍結束') {
      games[gid].active = false;
      return await client.replyMessage(event.replyToken, { type: 'text', text: 'OK' });
    }

  } catch (e) {
    console.error('Logic Error:', e);
  }
}

// --- 工具函式 ---
async function getName(gid, uid) {
  try {
    const profile = (gid.startsWith('C') || gid.startsWith('R')) 
      ? await client.getGroupMemberProfile(gid, uid) 
      : await client.getProfile(uid);
    return profile.displayName;
  } catch (e) { return '球友'; }
}

function addToList(gid, idx, name) {
  if (!games[gid].sections[idx]) return;
  if (!games[gid].sections[idx].list.includes(name)) {
    games[gid].sections[idx].list.push(name);
  }
}

function removeFromList(gid, name) {
  games[gid].sections.forEach(s => {
    const i = s.list.indexOf(name);
    if (i > -1) s.list.splice(i, 1);
  });
}

async function sendList(token, gid, prefix = "") {
  const g = games[gid];
  let msg = `${prefix}\n🏸 ${g.title}\n`;
  g.sections.forEach(sec => {
    msg += `\n【${sec.title}】\n`;
    for (let i = 0; i < sec.limit; i++) {
      if (i < sec.list.length) {
        msg += `${sec.label}${i + 1}. ${sec.list[i]}\n`;
      } else {
        if (i === sec.limit - 1) msg += `${sec.label}${i + 1}. \n`;
        else if (i === sec.list.length) msg += `..\n`;
      }
    }
    if (sec.list.length >= sec.limit) {
      msg += `--- 候補 ---\n`;
      for (let i = sec.limit; i < sec.list.length; i++) {
        if (i < sec.limit + sec.backupLimit) {
          msg += `候補${i - sec.limit + 1}. ${sec.list[i]}\n`;
        }
      }
    }
  });
  if (g.note) msg += `\n📝 ${g.note}`;
  return await client.replyMessage(token, { type: 'text', text: msg.trim() });
}

app.listen(3000, () => console.log('Badminton Bot Running...'));