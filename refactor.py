import re
import os

with open('index.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update loadGames to migrate old data
loadGames_old = """async function loadGames() {
  try {
    if (pool) {
      const res = await pool.query('SELECT gid, data FROM games');
      res.rows.forEach(row => {
        games[row.gid] = row.data;
      });
      console.log(`已從資料庫載入 ${res.rowCount} 筆接龍資料`);
    } else {
      // 檔案備援：若沒有資料庫則嘗試從本地檔案載入
      if (fs.existsSync(GAMES_FILE)) {
        try {
          const content = fs.readFileSync(GAMES_FILE, 'utf8') || '{}';
          const obj = JSON.parse(content);
          games = obj || {};
          console.log(`已從 ${GAMES_FILE} 載入 ${Object.keys(games).length} 筆接龍資料`);
        } catch (e) {
          console.error('從檔案載入接龍資料失敗:', e);
        }
      }
    }
  } catch (e) {
    console.error('載入資料失敗:', e);
  }
}"""

loadGames_new = """async function loadGames() {
  try {
    if (pool) {
      const res = await pool.query('SELECT gid, data FROM games');
      res.rows.forEach(row => {
        games[row.gid] = row.data;
      });
      console.log(`已從資料庫載入 ${res.rowCount} 筆接龍資料`);
    } else {
      // 檔案備援：若沒有資料庫則嘗試從本地檔案載入
      if (fs.existsSync(GAMES_FILE)) {
        try {
          const content = fs.readFileSync(GAMES_FILE, 'utf8') || '{}';
          const obj = JSON.parse(content);
          games = obj || {};
          console.log(`已從 ${GAMES_FILE} 載入 ${Object.keys(games).length} 筆接龍資料`);
        } catch (e) {
          console.error('從檔案載入接龍資料失敗:', e);
        }
      }
    }
    
    // 升級資料結構：確保所有 game 都有 gameId 且以 gameId 為 key
    const newGames = {};
    for (const [key, val] of Object.entries(games)) {
      if (Array.isArray(val)) {
        // 已經是 Array 的情況 (防呆)
        val.forEach(g => {
          const id = g.gameId || Date.now().toString() + Math.floor(Math.random()*1000);
          g.gameId = id;
          if(!g.gid) g.gid = key;
          newGames[id] = g;
        });
      } else if (!val.gameId) {
        // 舊版單一物件
        val.gid = key;
        val.gameId = Date.now().toString() + Math.floor(Math.random()*1000);
        newGames[val.gameId] = val;
      } else {
        newGames[key] = val;
      }
    }
    games = newGames;
    
  } catch (e) {
    console.error('載入資料失敗:', e);
  }
}"""
content = content.replace(loadGames_old, loadGames_new)

# 2. Update saveCurrentListSnapshot
snapshot_old = """async function saveCurrentListSnapshot(gid, waitForWrite = false) {
  const rows = [];
  const gids = Object.keys(games);
  
  // 建立 CSV 內容：只記錄當前名單中的每個人（所有群組）
  gids.forEach((currentGid) => {
    const g = games[currentGid];
    if (!g || !g.sections) return;
    g.sections.forEach((section, sectionIdx) => {
      section.list.forEach((name) => {
        // 只記錄實名，不記錄匿名占位符
        if (name !== '__ANON__') {
          rows.push([
            currentGid || '',
            String(sectionIdx),
            name || '',
            String(section.limit || ''),
            String(section.backupLimit ?? ''),
            String(g.title || '')
          ].map(csvEscape).join(','));
        }
      });
    });
  });

  const csvContent = 'gid,sectionIdx,name,limit,backupLimit,title\\n' + (rows.length > 0 ? rows.join('\\n') + '\\n' : '');"""

snapshot_new = """async function saveCurrentListSnapshot(gid, waitForWrite = false) {
  const rows = [];
  
  // 建立 CSV 內容：記錄當前名單中的每個人（所有場次）
  Object.values(games).forEach((g) => {
    if (!g || !g.sections) return;
    g.sections.forEach((section, sectionIdx) => {
      section.list.forEach((name) => {
        // 只記錄實名，不記錄匿名占位符
        if (name !== '__ANON__') {
          rows.push([
            g.gid || '',
            String(sectionIdx),
            name || '',
            String(section.limit || ''),
            String(section.backupLimit ?? ''),
            String(g.title || ''),
            String(g.gameId || '')
          ].map(csvEscape).join(','));
        }
      });
    });
  });

  const csvContent = 'gid,sectionIdx,name,limit,backupLimit,title,gameId\\n' + (rows.length > 0 ? rows.join('\\n') + '\\n' : '');"""
content = content.replace(snapshot_old, snapshot_new)

# 3. Update restoreGamesFromCsv
# Since it's quite complex and we don't strictly need to restore perfectly if we use games.json,
# but let's just replace the whole function.
restore_old_pattern = re.compile(r'async function restoreGamesFromCsv\(\) \{.*?\n\}\n', re.DOTALL)
restore_new = """async function restoreGamesFromCsv() {
  if (Object.keys(games).length > 0) return false;

  let content = regCsvContent;
  if (!content && fs.existsSync(REG_CSV_FILE)) {
    content = await fs.promises.readFile(REG_CSV_FILE, 'utf8');
  }
  if (!content) return false;

  const lines = content.trim().split(/\\r?\\n/);
  if (lines.length <= 1) return false;

  const header = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
  const idxGid = header.indexOf('gid');
  const idxSection = header.indexOf('sectionidx');
  const idxName = header.indexOf('name');
  const idxLimit = header.indexOf('limit');
  const idxBackup = header.indexOf('backuplimit');
  const idxTitle = header.indexOf('title');
  const idxGameId = header.indexOf('gameid');

  if (idxGid < 0 || idxSection < 0 || idxName < 0) {
    return false;
  }

  const byGameId = new Map();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCsvLine(line);
    const gid = (cols[idxGid] || '').trim();
    const name = (cols[idxName] || '').trim();
    const sectionIdx = parseInt((cols[idxSection] || '0').trim(), 10);
    const rawTitle = idxTitle >= 0 ? (cols[idxTitle] || '').trim() : '羽球接龍';
    // 若沒有 gameId，以 gid + title 產生假 ID 以分群
    const gameId = idxGameId >= 0 && cols[idxGameId] ? cols[idxGameId].trim() : `${gid}_${rawTitle}`;

    if (!gid || !name) continue;
    const safeSectionIdx = Number.isFinite(sectionIdx) && sectionIdx >= 0 ? sectionIdx : 0;

    if (!byGameId.has(gameId)) {
      byGameId.set(gameId, {
        gid: gid,
        gameId: gameId,
        title: rawTitle,
        sectionsMap: new Map(),
        metaMap: new Map()
      });
    }
    
    const gameData = byGameId.get(gameId);
    
    if (!gameData.sectionsMap.has(safeSectionIdx)) {
      gameData.sectionsMap.set(safeSectionIdx, []);
    }
    if (!gameData.metaMap.has(safeSectionIdx)) {
      gameData.metaMap.set(safeSectionIdx, {});
    }
    
    const sectionMeta = gameData.metaMap.get(safeSectionIdx);
    if (idxLimit >= 0) {
      const rawLimit = parseInt((cols[idxLimit] || '').trim(), 10);
      if (Number.isFinite(rawLimit) && rawLimit > 0) {
        sectionMeta.limit = Math.max(sectionMeta.limit || 0, rawLimit);
      }
    }
    if (idxBackup >= 0) {
      const rawBackup = parseInt((cols[idxBackup] || '').trim(), 10);
      if (Number.isFinite(rawBackup) && rawBackup >= 0) {
        sectionMeta.backupLimit = Math.max(sectionMeta.backupLimit || 0, rawBackup);
      }
    }

    const list = gameData.sectionsMap.get(safeSectionIdx);
    if (!list.includes(name)) {
      list.push(name);
    }
  }

  if (byGameId.size === 0) return false;

  for (const [gameId, data] of byGameId.entries()) {
    const sectionIndices = Array.from(data.sectionsMap.keys());
    const maxIdx = Math.max(...sectionIndices, 0);
    const sections = [];

    for (let idx = 0; idx <= maxIdx; idx++) {
      const list = data.sectionsMap.get(idx) || [];
      const meta = data.metaMap.get(idx) || {};
      const limit = meta.limit || Math.max(20, list.length);
      sections.push({
        title: idx === 0 ? '報名名單' : `區段${idx + 1}`,
        limit: limit,
        backupLimit: meta.backupLimit ?? 5,
        label: '',
        list: list
      });
    }
    games[gameId] = {
      gid: data.gid,
      gameId: gameId,
      title: data.title,
      note: '',
      active: true,
      startTime: Date.now(),
      lastActiveTime: Date.now(),
      scheduleTime: null,
      scheduleInput: null,
      anonymous: [],
      anonymousCount: 0,
      sections: sections
    };
    await saveGame(gameId, true);
  }

  return true;
}
"""
content = restore_old_pattern.sub(restore_new, content)

# 4. update deleteGame
content = content.replace("delete games[gid];", "delete games[gid]; // Note: gid is now gameId here")

# 5. API Routes
api_routes_old = """// 取得特定群組接龍狀態
app.get('/api/game/:gid', (req, res) => {
  const gid = req.params.gid;
  const game = games[gid];
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  res.json(game);
});

// 處理 LIFF 前端傳來的報名或取消請求
app.post('/api/action', express.json(), async (req, res) => {
  try {
    const { gid, uid, name, action, count } = req.body;
    if (!gid || !uid || !name || !action) {
      return res.status(400).json({ error: 'Missing parameters' });
    }
    const game = games[gid];
    if (!game || !game.active) {
      return res.status(400).json({ error: '接龍不存在或已結束' });
    }
    
    const currentList = game.sections[0].list;
    const c = count || 1;
    
    if (action === 'register') {
      const namesToAdd = [name];
      for(let i=1; i<c; i++) namesToAdd.push('__ANON__');
      
      const hasDuplicate = currentList.includes(name);
      if (hasDuplicate) { 
        return res.status(400).json({ error: '您已經報名過了' });
      }
      
      namesToAdd.forEach(n => {
        addToList(gid, 0, n, { uid });
        if (n !== '__ANON__') {
          uidToNameMap.set(`${gid}_${uid}`, n);
        }
      });
    } else if (action === 'cancel') {
      if (!currentList.includes(name)) {
        return res.status(400).json({ error: '您不在名單中' });
      }
      await removeFromList(gid, name, { uid });
      for(let i=1; i<c; i++) {
        await removeAnon(gid, { uid });
      }
    } else {
      return res.status(400).json({ error: 'Unknown action' });
    }

    touchGame(gid);
    await saveGame(gid, true);
    await saveCurrentListSnapshot(gid, false);
    
    res.json({ success: true, game: games[gid] });
  } catch (err) {
    console.error('API Action Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});"""

api_routes_new = """// 取得特定群組所有進行中的接龍
app.get('/api/game/:gid', (req, res) => {
  const gid = req.params.gid;
  const groupGames = Object.values(games).filter(g => g.gid === gid && g.active);
  if (groupGames.length === 0) {
    return res.status(404).json({ error: 'Game not found' });
  }
  // 依建立時間排序，新的在前面
  groupGames.sort((a, b) => b.startTime - a.startTime);
  res.json({ games: groupGames });
});

// 處理 LIFF 前端傳來的報名或取消請求
app.post('/api/action', express.json(), async (req, res) => {
  try {
    const { gid, gameId, uid, name, action, count } = req.body;
    if (!gameId || !uid || !name || !action) {
      return res.status(400).json({ error: 'Missing parameters' });
    }
    const game = games[gameId];
    if (!game || !game.active) {
      return res.status(400).json({ error: '接龍不存在或已結束' });
    }
    
    const currentList = game.sections[0].list;
    const c = count || 1;
    
    if (action === 'register') {
      const namesToAdd = [name];
      for(let i=1; i<c; i++) namesToAdd.push('__ANON__');
      
      const hasDuplicate = currentList.includes(name);
      if (hasDuplicate) { 
        return res.status(400).json({ error: '您已經報名過了' });
      }
      
      namesToAdd.forEach(n => {
        addToList(gameId, 0, n, { uid });
        if (n !== '__ANON__') {
          uidToNameMap.set(`${gameId}_${uid}`, n);
        }
      });
    } else if (action === 'cancel') {
      if (!currentList.includes(name)) {
        return res.status(400).json({ error: '您不在名單中' });
      }
      await removeFromList(gameId, name, { uid });
      for(let i=1; i<c; i++) {
        await removeAnon(gameId, { uid });
      }
    } else {
      return res.status(400).json({ error: 'Unknown action' });
    }

    touchGame(gameId);
    await saveGame(gameId, true);
    await saveCurrentListSnapshot(gameId, false);
    
    res.json({ success: true, game: games[gameId] });
  } catch (err) {
    console.error('API Action Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});"""
content = content.replace(api_routes_old, api_routes_new)

# 6. Simplify handleEvent - REMOVE legacy +1/-1 and edits
# Find where text parsing starts
start_idx = content.find("try {\n    // 1. 接龍開始")
end_idx = content.find("} catch (e) {\n    console.error('Logic Error:', e);")

if start_idx != -1 and end_idx != -1:
    handleEvent_body = """try {
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
      // 將該群組的所有場次設為不活躍並刪除
      const groupGames = Object.values(games).filter(g => g.gid === gid);
      for(const g of groupGames) {
        await deleteGame(g.gameId);
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
    content = content[:start_idx] + handleEvent_body + content[end_idx:]

# 7. Add sendLobbyLink and replace sendList usages where appropriate
sendLobbyLink = """async function sendLobbyLink(token, gid, prefix = "") {
  let msg = prefix ? `${prefix}\\n` : '';
  
  const groupGames = Object.values(games).filter(g => g.gid === gid && g.active);
  if (groupGames.length === 0) {
    msg += '目前沒有進行中的場次喔！請輸入「接龍開始」來建立。';
  } else {
    msg += `目前共有 ${groupGames.length} 個場次開放報名中 🏸\\n`;
    if (process.env.LIFF_ID) {
      msg += `\\n👇 點擊下方連結進入報名大廳\\nhttps://liff.line.me/${process.env.LIFF_ID}`;
    }
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
content = content + "\n" + sendLobbyLink

with open('index.js', 'w', encoding='utf-8') as f:
    f.write(content)
