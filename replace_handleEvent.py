import sys

with open('index.js', 'r', encoding='utf-8') as f:
    content = f.read()

start_str = "  try {\n    // 1. 接龍開始"
end_str = "  } catch (e) {\n    console.error('Logic Error:', e);"

start_idx = content.find(start_str)
end_idx = content.find(end_str)

if start_idx == -1:
    print("Start index not found")
    sys.exit(1)

if end_idx == -1:
    print("End index not found")
    sys.exit(1)

new_handleEvent = """  try {
    // 1. 接龍開始
    if (text.startsWith('接龍開始')) {
      const titleMatch = text.match(/標題\\s*[:：]?\\s*[{\\uff5b]([\\s\\S]*?)[}\\uff5d]/);
      const limitMatch = text.match(/人數\\s*[:：]?\\s*[{\\uff5b](\\d+)[}\\uff5d]/);
      const backupMatch = text.match(/候補\\s*[:：]?\\s*[{\\uff5b](\\d+)[}\\uff5d]/);
      const title = titleMatch ? titleMatch[1].trim() : '羽球接龍';
      const limit = limitMatch ? parseInt(limitMatch[1], 10) : 20;
      const backupLimit = backupMatch ? parseInt(backupMatch[1], 10) : 5;
      
      const gameId = Date.now().toString() + Math.floor(Math.random()*1000);
      
      games[gameId] = {
        gid: gid,
        gameId: gameId,
        title: title,
        note: '',
        active: true,
        startTime: Date.now(),
        lastActiveTime: Date.now(),
        scheduleTime: null,
        scheduleInput: null,
        anonymous: [],
        anonymousCount: 0,
        sections: [
          { title: '報名名單', limit: limit, backupLimit: backupLimit, label: '', list: [] }
        ]
      };
      await saveGame(gameId, true);
      await saveCurrentListSnapshot(gameId, false);
      
      let welcomePrefix = showWelcome ? '👋 大家好！我是羽球接龍機器人。\\n\\n' : '';
      return await sendLobbyLink(event.replyToken, gid, welcomePrefix + "🚀 場次建立成功！");
    }

    if (text === '接龍結束' || text === '接龍清空') {
      const groupGames = Object.values(games).filter(g => g.gid === gid);
      for(const g of groupGames) {
        delete games[g.gameId];
      }
      await saveCurrentListSnapshot(null, false);
      return await client.replyMessage(event.replyToken, { type: 'text', text: '✅ 群組內所有場次已結束/清空' });
    }

    if (text === '接龍名單' || text === '接龍狀態' || text === '接龍查詢') {
      return await sendLobbyLink(event.replyToken, gid);
    }
    
    // 如果使用者輸入 +1 / -1，提示他們使用 LIFF
    if (text.match(/^\\+[1-9]/) || text.match(/^-[1-9]/) || text.match(/\\+[1-9]$/) || text.match(/-[1-9]$/)) {
       return await sendLobbyLink(event.replyToken, gid, '⚠️ 現在已經全面升級為「大廳報名模式」囉！\\n請點擊下方連結進入大廳報名，以免報錯場次：');
    }

"""
content = content[:start_idx] + new_handleEvent + content[end_idx:]

if 'async function sendLobbyLink' not in content:
    content += """
async function sendLobbyLink(token, gid, prefix = "") {
  let msg = prefix ? `${prefix}\\n` : '';
  
  const groupGames = Object.values(games).filter(g => g.gid === gid && g.active);
  if (groupGames.length === 0) {
    msg += '目前沒有進行中的場次喔！請輸入「接龍開始」來建立。';
  } else {
    msg += `目前共有 ${groupGames.length} 個場次開放報名中 🏸\\n`;
  }
  
  if (process.env.LIFF_ID) {
    msg += `\\n👇 點擊下方連結進入報名大廳\\nhttps://liff.line.me/${process.env.LIFF_ID}`;
  }
  
  const message = { type: 'text', text: msg.trim() };
  if (token) {
    return await client.replyMessage(token, message);
  }
  try {
    return await client.pushMessage(gid, message);
  } catch (e) {
    console.error(`pushMessage failed for ${gid}:`, e);
  }
}
"""

with open('index.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Success")
