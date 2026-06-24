import sys

with open('index.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_end_logic = """    if (text === '接龍結束' || text === '接龍清空') {
      const groupGames = Object.values(games).filter(g => g.gid === gid);
      for(const g of groupGames) {
        delete games[g.gameId];
      }
      await saveCurrentListSnapshot(null, false);
      return await client.replyMessage(event.replyToken, { type: 'text', text: '✅ 群組內所有場次已結束/清空' });
    }"""

new_end_modify_logic = """    if (text.startsWith('接龍結束') || text.startsWith('接龍清空')) {
      const keyword = text.replace(/接龍結束|接龍清空/, '').trim();
      let groupGames = Object.values(games).filter(g => g.gid === gid && g.active);
      
      if (text.startsWith('接龍清空') || text === '接龍結束') {
        // 全清
        for(const g of groupGames) delete games[g.gameId];
        await saveCurrentListSnapshot(null, false);
        return await client.replyMessage(event.replyToken, { type: 'text', text: '✅ 群組內所有場次已結束/清空' });
      } else {
        // 結束特定場次
        groupGames = groupGames.filter(g => g.title.includes(keyword));
        if (groupGames.length === 0) {
          return await client.replyMessage(event.replyToken, { type: 'text', text: `找不到包含「${keyword}」的場次喔！` });
        }
        for(const g of groupGames) delete games[g.gameId];
        await saveCurrentListSnapshot(null, false);
        const titles = groupGames.map(g => g.title).join('、');
        return await client.replyMessage(event.replyToken, { type: 'text', text: `✅ 已結束場次：${titles}` });
      }
    }

    if (text.startsWith('接龍修改')) {
      // 支援有大括號或沒有大括號
      const titleMatch = text.match(/標題\\s*[:：]?\\s*(?:[{\\uff5b]([\\s\\S]*?)[}\\uff5d]|([^\\n]*?(?=\\s*(?:人數|候補|時間|備註|名單|$))))/);
      const limitMatch = text.match(/人數\\s*[:：]?\\s*(?:[{\\uff5b](\\d+)[}\\uff5d]|(\\d+))/);
      const backupMatch = text.match(/候補\\s*[:：]?\\s*(?:[{\\uff5b](\\d+)[}\\uff5d]|(\\d+))/);
      const noteMatch = text.match(/備註\\s*[:：]?\\s*(?:[{\\uff5b]([\\s\\S]*?)[}\\uff5d]|([^\\n]*?(?=\\s*(?:標題|人數|候補|時間|名單|$))))/);
      
      // 取出除了 "接龍修改" 與 屬性 以外的文字當作 keyword
      let keyword = text.replace('接龍修改', '').trim();
      if (titleMatch) keyword = keyword.replace(titleMatch[0], '');
      if (limitMatch) keyword = keyword.replace(limitMatch[0], '');
      if (backupMatch) keyword = keyword.replace(backupMatch[0], '');
      if (noteMatch) keyword = keyword.replace(noteMatch[0], '');
      keyword = keyword.trim();

      let groupGames = Object.values(games).filter(g => g.gid === gid && g.active);
      if (groupGames.length === 0) {
          return await client.replyMessage(event.replyToken, { type: 'text', text: '目前沒有進行中的場次可以修改喔！' });
      }

      let targetGame = null;
      if (keyword) {
        targetGame = groupGames.find(g => g.title.includes(keyword));
        if (!targetGame) {
           return await client.replyMessage(event.replyToken, { type: 'text', text: `找不到包含「${keyword}」的場次喔！` });
        }
      } else {
        if (groupGames.length > 1) {
           // 如果沒指定，取最新建立的
           targetGame = groupGames.sort((a,b) => b.startTime - a.startTime)[0];
        } else {
           targetGame = groupGames[0];
        }
      }

      if (titleMatch) targetGame.title = (titleMatch[1] || titleMatch[2]).trim();
      if (limitMatch && targetGame.sections[0]) targetGame.sections[0].limit = parseInt(limitMatch[1] || limitMatch[2], 10);
      if (backupMatch && targetGame.sections[0]) targetGame.sections[0].backupLimit = parseInt(backupMatch[1] || backupMatch[2], 10);
      if (noteMatch) {
        const n = (noteMatch[1] || noteMatch[2]).trim();
        targetGame.note = n === '無' || n === '空' ? '' : n;
      }
      
      await saveGame(targetGame.gameId, true);
      return await sendLobbyLink(event.replyToken, gid, `✏️ 已成功修改場次：${targetGame.title}`);
    }"""

if old_end_logic in content:
    content = content.replace(old_end_logic, new_end_modify_logic)
    with open('index.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Updated end/modify logic in index.js")
else:
    print("Could not find end logic")
