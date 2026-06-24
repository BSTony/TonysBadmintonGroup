import sys

with open('index.js', 'r', encoding='utf-8') as f:
    content = f.read()

start_old = """    // 1. 接龍開始
    if (text.startsWith('接龍開始')) {
      // 支援有大括號或沒有大括號 (用空格/換行分隔)
      const titleMatch = text.match(/標題\\s*[:：]?\\s*(?:[{\\uff5b]([\\s\\S]*?)[}\\uff5d]|([^\\n]*?(?=\\s*(?:人數|候補|時間|備註|名單|$))))/);
      const limitMatch = text.match(/人數\\s*[:：]?\\s*(?:[{\\uff5b](\\d+)[}\\uff5d]|(\\d+))/);
      const backupMatch = text.match(/候補\\s*[:：]?\\s*(?:[{\\uff5b](\\d+)[}\\uff5d]|(\\d+))/);
      
      const title = titleMatch ? (titleMatch[1] || titleMatch[2]).trim() : '羽球接龍';
      const limit = limitMatch ? parseInt(limitMatch[1] || limitMatch[2], 10) : 20;
      const backupLimit = backupMatch ? parseInt(backupMatch[1] || backupMatch[2], 10) : 5;
      
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
      return await sendLobbyLink(event.replyToken, gid, welcomePrefix + "🚀 場次建立成功！");
    }"""

start_new = """    // 1. 接龍開始
    if (text.startsWith('接龍開始')) {
      // 支援有大括號或沒有大括號 (用空格/換行分隔)
      const titleMatch = text.match(/標題\\s*[:：]?\\s*(?:[{\\uff5b]([\\s\\S]*?)[}\\uff5d]|([^\\n]*?(?=\\s*(?:日期|時間|地點|費用|人數|候補|備註|名單|$))))/);
      const dateMatch = text.match(/日期\\s*[:：]?\\s*(?:[{\\uff5b]([\\s\\S]*?)[}\\uff5d]|([^\\n]*?(?=\\s*(?:標題|時間|地點|費用|人數|候補|備註|名單|$))))/);
      const timeMatch = text.match(/時間\\s*[:：]?\\s*(?:[{\\uff5b]([\\s\\S]*?)[}\\uff5d]|([^\\n]*?(?=\\s*(?:標題|日期|地點|費用|人數|候補|備註|名單|$))))/);
      const locMatch = text.match(/地點\\s*[:：]?\\s*(?:[{\\uff5b]([\\s\\S]*?)[}\\uff5d]|([^\\n]*?(?=\\s*(?:標題|日期|時間|費用|人數|候補|備註|名單|$))))/);
      const feeMatch = text.match(/費用\\s*[:：]?\\s*(?:[{\\uff5b]([\\s\\S]*?)[}\\uff5d]|([^\\n]*?(?=\\s*(?:標題|日期|時間|地點|人數|候補|備註|名單|$))))/);
      const noteMatch = text.match(/備註\\s*[:：]?\\s*(?:[{\\uff5b]([\\s\\S]*?)[}\\uff5d]|([^\\n]*?(?=\\s*(?:標題|日期|時間|地點|費用|人數|候補|名單|$))))/);
      
      const limitMatch = text.match(/人數\\s*[:：]?\\s*(?:[{\\uff5b](\\d+)[}\\uff5d]|(\\d+))/);
      const backupMatch = text.match(/候補\\s*[:：]?\\s*(?:[{\\uff5b](\\d+)[}\\uff5d]|(\\d+))/);
      
      const pDate = dateMatch ? (dateMatch[1] || dateMatch[2]).trim() : '';
      const pTime = timeMatch ? (timeMatch[1] || timeMatch[2]).trim() : '';
      const pLoc = locMatch ? (locMatch[1] || locMatch[2]).trim() : '';
      const pFee = feeMatch ? (feeMatch[1] || feeMatch[2]).trim() : '';
      const pNote = noteMatch ? (noteMatch[1] || noteMatch[2]).trim() : '';
      
      let title = '羽球接龍';
      if (titleMatch) {
         title = (titleMatch[1] || titleMatch[2]).trim();
      } else if (pDate || pTime || pLoc) {
         title = [pDate, pTime, pLoc].filter(Boolean).join(' ');
      }
      
      const limit = limitMatch ? parseInt(limitMatch[1] || limitMatch[2], 10) : 20;
      const backupLimit = backupMatch ? parseInt(backupMatch[1] || backupMatch[2], 10) : 5;
      
      const gameId = Date.now().toString() + Math.floor(Math.random()*1000);
      
      games[gameId] = {
        gid: gid,
        gameId: gameId,
        title: title,
        date: pDate,
        time: pTime,
        location: pLoc,
        fee: pFee,
        note: pNote === '無' || pNote === '空' ? '' : pNote,
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
      return await sendLobbyLink(event.replyToken, gid, welcomePrefix + "🚀 場次建立成功！");
    }"""

modify_old = """    if (text.startsWith('接龍修改')) {
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

modify_new = """    if (text.startsWith('接龍修改')) {
      const titleMatch = text.match(/標題\\s*[:：]?\\s*(?:[{\\uff5b]([\\s\\S]*?)[}\\uff5d]|([^\\n]*?(?=\\s*(?:日期|時間|地點|費用|人數|候補|備註|名單|$))))/);
      const dateMatch = text.match(/日期\\s*[:：]?\\s*(?:[{\\uff5b]([\\s\\S]*?)[}\\uff5d]|([^\\n]*?(?=\\s*(?:標題|時間|地點|費用|人數|候補|備註|名單|$))))/);
      const timeMatch = text.match(/時間\\s*[:：]?\\s*(?:[{\\uff5b]([\\s\\S]*?)[}\\uff5d]|([^\\n]*?(?=\\s*(?:標題|日期|地點|費用|人數|候補|備註|名單|$))))/);
      const locMatch = text.match(/地點\\s*[:：]?\\s*(?:[{\\uff5b]([\\s\\S]*?)[}\\uff5d]|([^\\n]*?(?=\\s*(?:標題|日期|時間|費用|人數|候補|備註|名單|$))))/);
      const feeMatch = text.match(/費用\\s*[:：]?\\s*(?:[{\\uff5b]([\\s\\S]*?)[}\\uff5d]|([^\\n]*?(?=\\s*(?:標題|日期|時間|地點|人數|候補|備註|名單|$))))/);
      const noteMatch = text.match(/備註\\s*[:：]?\\s*(?:[{\\uff5b]([\\s\\S]*?)[}\\uff5d]|([^\\n]*?(?=\\s*(?:標題|日期|時間|地點|費用|人數|候補|名單|$))))/);
      
      const limitMatch = text.match(/人數\\s*[:：]?\\s*(?:[{\\uff5b](\\d+)[}\\uff5d]|(\\d+))/);
      const backupMatch = text.match(/候補\\s*[:：]?\\s*(?:[{\\uff5b](\\d+)[}\\uff5d]|(\\d+))/);
      
      // 取出除了 "接龍修改" 與 屬性 以外的文字當作 keyword
      let keyword = text.replace('接龍修改', '').trim();
      if (titleMatch) keyword = keyword.replace(titleMatch[0], '');
      if (dateMatch) keyword = keyword.replace(dateMatch[0], '');
      if (timeMatch) keyword = keyword.replace(timeMatch[0], '');
      if (locMatch) keyword = keyword.replace(locMatch[0], '');
      if (feeMatch) keyword = keyword.replace(feeMatch[0], '');
      if (noteMatch) keyword = keyword.replace(noteMatch[0], '');
      if (limitMatch) keyword = keyword.replace(limitMatch[0], '');
      if (backupMatch) keyword = keyword.replace(backupMatch[0], '');
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
           targetGame = groupGames.sort((a,b) => b.startTime - a.startTime)[0];
        } else {
           targetGame = groupGames[0];
        }
      }

      if (dateMatch) targetGame.date = (dateMatch[1] || dateMatch[2]).trim();
      if (timeMatch) targetGame.time = (timeMatch[1] || timeMatch[2]).trim();
      if (locMatch) targetGame.location = (locMatch[1] || locMatch[2]).trim();
      if (feeMatch) targetGame.fee = (feeMatch[1] || feeMatch[2]).trim();
      
      if (titleMatch) {
         targetGame.title = (titleMatch[1] || titleMatch[2]).trim();
      } else if (dateMatch || timeMatch || locMatch) {
         // 若修改了其中一項且沒有指定標題，更新自動生成的標題
         const currentTitleWasAuto = targetGame.title === [targetGame.date, targetGame.time, targetGame.location].filter(Boolean).join(' ');
         if (targetGame.title === '羽球接龍' || currentTitleWasAuto || true) {
             const newAuto = [targetGame.date, targetGame.time, targetGame.location].filter(Boolean).join(' ');
             if (newAuto) targetGame.title = newAuto;
         }
      }

      if (limitMatch && targetGame.sections[0]) targetGame.sections[0].limit = parseInt(limitMatch[1] || limitMatch[2], 10);
      if (backupMatch && targetGame.sections[0]) targetGame.sections[0].backupLimit = parseInt(backupMatch[1] || backupMatch[2], 10);
      if (noteMatch) {
        const n = (noteMatch[1] || noteMatch[2]).trim();
        targetGame.note = n === '無' || n === '空' ? '' : n;
      }
      
      await saveGame(targetGame.gameId, true);
      return await sendLobbyLink(event.replyToken, gid, `✏️ 已成功修改場次：${targetGame.title}`);
    }"""

if start_old in content:
    content = content.replace(start_old, start_new)
    print("Replaced start")
if modify_old in content:
    content = content.replace(modify_old, modify_new)
    print("Replaced modify")

with open('index.js', 'w', encoding='utf-8') as f:
    f.write(content)
