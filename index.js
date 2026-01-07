const express = require('express');
const { Client, middleware } = require('@line/bot-sdk');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const GAMES_FILE = path.join(__dirname, 'games.json');
const LOG_FILE = path.join(__dirname, 'schedule.log');

// 強制以台灣時間運行（台北時區），避免顯示成 UTC
if (!process.env.TZ) process.env.TZ = 'Asia/Taipei';

// 過濾掉舊版 checkSchedules 相關日誌，避免每秒刷屏
const _origConsoleLog = console.log;
console.log = (...args) => {
  const shouldSkip = args.some(a => typeof a === 'string' && a.includes('[checkSchedules]'));
  if (shouldSkip) return;
  _origConsoleLog(...args);
};

// 簡易日誌函數 - 使用異步寫入避免阻塞
let logQueue = [];
let isWritingLog = false;
let lastFileSizeCheck = 0;
const FILE_SIZE_CHECK_INTERVAL = 60 * 1000; // 每60秒檢查一次文件大小

async function logToFile(msg) {
  // 只在重要訊息時記錄到文件，大幅減少I/O操作
  // 只記錄錯誤、觸發事件和警告
  if (!msg.includes('[ERROR]') && !msg.includes('[TRIGGER]') && !msg.includes('[WARN]') && !msg.includes('[SUCCESS]')) {
    return; // 只記錄重要事件
  }
  
  const logEntry = `[${new Date().toISOString()}] ${msg}\n`;
  logQueue.push(logEntry);
  
  if (!isWritingLog) {
    isWritingLog = true;
    setImmediate(async () => {
      while (logQueue.length > 0) {
        const entries = logQueue.splice(0, 10); // 批量寫入，減少I/O
        try {
          await fs.promises.appendFile(LOG_FILE, entries.join(''), 'utf8');
          
          // 減少文件大小檢查頻率（每60秒檢查一次）
          const now = Date.now();
          if (now - lastFileSizeCheck > FILE_SIZE_CHECK_INTERVAL) {
            lastFileSizeCheck = now;
            const stats = await fs.promises.stat(LOG_FILE).catch(() => null);
            if (stats && stats.size > 1024 * 1024) {
              await fs.promises.writeFile(LOG_FILE, '', 'utf8');
            }
          }
  } catch (e) {
    console.error('Failed to write log:', e);
        }
      }
      isWritingLog = false;
    });
  }
}

let Pool;
try {
  Pool = require('pg').Pool;
} catch (e) {
  console.warn('⚠️ 未安裝 pg 套件，將使用記憶體模式 (請執行 npm install pg)');
}

// 從環境變數讀取敏感資訊，避免洩露到 Git
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || ''
};

// 檢查必要的環境變數
if (!config.channelAccessToken || !config.channelSecret) {
  console.error('❌ 錯誤：請設定環境變數 LINE_CHANNEL_ACCESS_TOKEN 和 LINE_CHANNEL_SECRET');
  console.error('   在 Render 上：Settings > Environment Variables');
  process.exit(1);
}

const client = new Client(config);
const app = express();

// 全域存儲：支援多群組、多區段
let games = {};
// 從環境變數讀取管理員密碼，如果未設定則使用預設值（不建議）
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '鈞鈞是豬豬';
const adminUsers = new Set(); // 儲存已登入的管理員 UserID (重啟後會清空)

// PostgreSQL 連線設定
// 避免未設定環境變數時崩潰
if (!process.env.DATABASE_URL) console.warn('⚠️ 未設定 DATABASE_URL，資料庫功能將無法使用');

let pool = null;
if (Pool && process.env.DATABASE_URL) {
  console.log('嘗試連線至資料庫:', process.env.DATABASE_URL.replace(/:([^:@]+)@/, ':****@'));
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 2, // 免費版限制連接數
    idleTimeoutMillis: 30000, // 30秒後關閉空閒連接
    connectionTimeoutMillis: 5000 // 5秒連接超時
  });
  
  // 處理連接錯誤，避免崩潰
  pool.on('error', (err) => {
    console.error('Unexpected database pool error:', err);
  });
}

// 初始化資料庫與載入資料
let loadPromise = Promise.resolve();
if (pool) {
  loadPromise = pool.query(`
    CREATE TABLE IF NOT EXISTS games (
      gid TEXT PRIMARY KEY,
      data JSONB
    );
  `).then(() => loadGames())
    .catch(err => {
      console.error('❌ 資料庫連線失敗 (將切換回記憶體模式):', err);
      pool = null;
      return loadGames();
    });
} else {
  loadPromise = loadGames();
}

async function loadGames() {
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
}

// 檔案寫入防抖，避免頻繁寫入
let saveFileTimeout = null;
let pendingSaves = new Set();

async function saveGame(gid) {
  if (!games[gid]) return;
  if (pool) {
    try {
    await pool.query(
      'INSERT INTO games (gid, data) VALUES ($1, $2) ON CONFLICT (gid) DO UPDATE SET data = $2',
      [gid, games[gid]]
    );
    } catch (e) {
      console.error('資料庫儲存失敗:', e);
      // 降級到檔案備份
      pendingSaves.add(gid);
      scheduleFileSave();
    }
  } else {
    pendingSaves.add(gid);
    scheduleFileSave();
  }
}

function scheduleFileSave() {
  if (saveFileTimeout) return; // 已有排程，等待執行
  saveFileTimeout = setTimeout(async () => {
    saveFileTimeout = null;
    if (pendingSaves.size === 0) return;
    try {
      await fs.promises.writeFile(GAMES_FILE, JSON.stringify(games, null, 2), 'utf8');
      pendingSaves.clear();
    } catch (e) {
      console.error('儲存接龍資料至檔案失敗:', e);
      // 失敗時保留pendingSaves，下次再試
    }
  }, 500); // 防抖：500ms內的多個保存請求合併為一次
}

async function deleteGame(gid) {
  delete games[gid];
  if (pool) {
    try {
      await pool.query('DELETE FROM games WHERE gid = $1', [gid]);
    } catch (e) {
      console.error('資料庫刪除失敗:', e);
    }
  }
  // 檔案會在下次saveGame時自動更新
  pendingSaves.add('__all__'); // 標記需要保存
  scheduleFileSave();
}

// 自動清除超過 7 天的接龍資料
const EXPIRY_TIME = 7 * 24 * 60 * 60 * 1000; // 7天
async function checkExpiredGames() {
  const now = Date.now();
  const gids = Object.keys(games);
  for (const gid of gids) {
    if (!games[gid]) continue;
    if (!games[gid].startTime) {
      games[gid].startTime = now;
      await saveGame(gid);
    }
    if (now - games[gid].startTime > EXPIRY_TIME) {
      console.log(`群組 ${gid} 接龍已過期自動刪除`);
      await deleteGame(gid);
    }
  }
}
checkExpiredGames().catch(console.error); // 啟動時檢查一次
setInterval(() => checkExpiredGames().catch(console.error), 60 * 60 * 1000); // 每小時檢查一次

// 排程檢查的執行鎖，避免重入
let checkingSchedules = false;

// 定時推播檢查
async function checkSchedules() {
  const now = Date.now();
  const gids = Object.keys(games);
  
  for (const gid of gids) {
    const g = games[gid];
    if (!g || !g.scheduleTime) continue;
    const sched = Number(g.scheduleTime);
    if (isNaN(sched)) {
      const warnMsg = `Invalid scheduleTime for ${gid}: ${g.scheduleTime}`;
      logToFile(`[WARN] ${warnMsg}`);
      delete g.scheduleTime;
      await saveGame(gid);
      continue;
    }
    
    // 只在觸發時記錄，減少日誌輸出
    if (sched <= now) {
      const triggerMsg = `TRIGGER! Sending scheduled list for ${gid}`;
      logToFile(`[TRIGGER] ${triggerMsg}`);
      delete g.scheduleTime; // 移除設定避免重複觸發
      await saveGame(gid);
      try { 
        await sendList(null, gid, "⏰ 定時提醒");
        logToFile(`[SUCCESS] Scheduled push sent for ${gid}`);
      } catch (e) { 
        console.error('Failed to push scheduled list:', e);
        logToFile(`[ERROR] Failed to push scheduled list: ${e.message}`);
      }
    }
  }
}
// 每分鐘的00秒時檢查一次排程
function startMinuteCheck() {
  const executeCheck = async () => {
  if (checkingSchedules) return;
  checkingSchedules = true;
  try {
    await checkSchedules();
  } catch (e) {
    console.error('checkSchedules error:', e);
  } finally {
    checkingSchedules = false;
  }
  };
  
  // 計算到下一個整分鐘的延遲時間
  const now = new Date();
  const msUntilNextMinute = ((60 - now.getSeconds()) * 1000) - now.getMilliseconds();
  const delay = msUntilNextMinute > 0 ? msUntilNextMinute : 60 * 1000;
  
  setTimeout(() => {
    executeCheck();
    // 之後每60秒執行一次（對齊每分鐘00秒）
    setInterval(executeCheck, 60 * 1000);
  }, delay);
}

// 待載入完成後立即檢查一次，以恢復並觸發在停機期間已到期或保留的排程
loadPromise.then(() => {
  console.log('[Startup] Data loaded, performing initial schedule check');
  return checkSchedules().catch(console.error);
}).then(() => {
  // 資料載入完成後，啟動每分鐘定時檢查
  startMinuteCheck();
}).catch(console.error);

// 健康檢查端點 - 用於保持服務器喚醒
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    gamesCount: Object.keys(games).length
  });
});

// 根路徑也返回健康狀態（方便外部監控）
app.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    message: 'Badminton Bot is running',
    timestamp: new Date().toISOString()
  });
});

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
      const titleMatch = text.match(/標題\s*[:：]?\s*[{\uff5b]([\s\S]*?)[}\uff5d]/);
      const limitMatch = text.match(/人數\s*[:：]?\s*[{\uff5b](\d+)[}\uff5d]/);
      const backupMatch = text.match(/候補\s*[:：]?\s*[{\uff5b](\d+)[}\uff5d]/);
      const anonMatch = text.match(/匿名名單\s*[:：]?\s*[{\uff5b]([\s\S]*?)[}\uff5d]/);
      const timeMatch = text.match(/時間\s*[:：]?\s*[{\uff5b]([\s\S]*?)[}\uff5d]/);

      let textForList = text;
      if (anonMatch) textForList = text.replace(anonMatch[0], '');
      const listMatch = textForList.match(/名單\s*[:：]?\s*[{\uff5b]([\s\S]*?)[}\uff5d]/);

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

      let anonList = [];
      let anonCount = 0;
      if (anonMatch) {
        const rawAnon = anonMatch[1].trim();
        if (/^\d+$/.test(rawAnon)) {
          anonCount = parseInt(rawAnon, 10);
          const placeholders = Array(anonCount).fill('__ANON__');
          initialList = initialList.concat(placeholders);
        } else {
          anonList = anonMatch[1]
            .split(/[,\n]+/)
            .map(line => line.trim())
            .filter(line => line)
            .map(line => line.replace(/^\d+[.\s]*\s*/, ''));
          initialList = initialList.concat(anonList);
        }
      }

      let scheduleTime = null;
      let scheduleInput = null;
      if (timeMatch) {
        const raw = timeMatch[1].trim();
        console.log(`Parsing time string: "${raw}"`);
        // 嘗試解析 YYYY/MM/DD HH:mm 或 YYYY-MM-DD HH:mm 格式
        const dateTimeMatch = raw.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\s+(\d{1,2}):(\d{2})/);
        if (dateTimeMatch) {
          const [, year, month, day, hours, minutes] = dateTimeMatch;
          const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes), 0);
          // 將輸入視為台灣時間 (UTC+8)，轉換為 UTC timestamp
          const TAIPEI_OFFSET_HOURS = 8;
          const utcMillisForInput = Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes));
          scheduleTime = utcMillisForInput - (TAIPEI_OFFSET_HOURS * 60 * 60 * 1000);
          scheduleInput = raw;
          console.log(`Parsed as Taipei local ${dateObj.toString()} -> UTC ${new Date(scheduleTime).toUTCString()} (timestamp: ${scheduleTime})`);
        } else {
          // 備用：嘗試 Date.parse
          let ts = Date.parse(raw);
          if (isNaN(ts)) {
            const alt = raw.replace(/-/g, '/');
            ts = Date.parse(alt);
          }
          if (!isNaN(ts)) {
            scheduleTime = ts;
            scheduleInput = raw;
          }
          console.log(`Fallback Date.parse result: ${scheduleTime}`);
        }
      }

      // 檢查重複：忽略匿名占位符 '__ANON__' 的重複
      const nonAnonList = initialList.filter(n => n !== '__ANON__');
      if (new Set(nonAnonList).size !== nonAnonList.length) {
        return await client.replyMessage(event.replyToken, { type: 'text', text: '名單已重複' });
      }

      games[gid] = {
        title: title,
        note: '',
        active: true,
        startTime: Date.now(),
        scheduleTime: scheduleTime,
        scheduleInput: scheduleInput,
        anonymous: anonList, // 兼容舊的匿名名單（若為數字則用 placeholder 存入 list）
        anonymousCount: anonCount,
        sections: [
          { title: '報名名單', limit: limit, backupLimit: backupLimit, label: '', list: initialList }
        ]
      };
      await saveGame(gid);
      if (scheduleTime) {
        // 若時間已過則立即觸發一次
        if (scheduleTime <= Date.now()) {
          try { await sendList(null, gid, "⏰ 定時提醒"); } catch (e) { console.error('Immediate scheduled send failed:', e); }
        }
        const displayTime = scheduleInput || (() => { const d = new Date(scheduleTime); return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`; })();
        return await client.replyMessage(event.replyToken, { type: 'text', text: `設定完成，將會在 ${displayTime} 開始接龍` });
      }
      return await sendList(event.replyToken, gid, "🚀 接龍設定成功！");
    }

    if (text === '接龍結束') {
      await deleteGame(gid);
      return await client.replyMessage(event.replyToken, { type: 'text', text: 'OK' });
    }

    // 接龍修改/接龍修正 - 只有在有接龍資料時才能使用
    if (text.startsWith('接龍修改') || text.startsWith('接龍修正')) {
      if (!games[gid] || !games[gid].active) {
        return await client.replyMessage(event.replyToken, { type: 'text', text: '❌ 目前沒有進行中的接龍，請先使用「接龍開始」建立接龍' });
      }

      const titleMatch = text.match(/標題\s*[:：]?\s*[{\uff5b]([\s\S]*?)[}\uff5d]/);
      const limitMatch = text.match(/人數\s*[:：]?\s*[{\uff5b](\d+)[}\uff5d]/);
      const backupMatch = text.match(/候補\s*[:：]?\s*[{\uff5b](\d+)[}\uff5d]/);
      
      let textForList = text;
      const listMatch = textForList.match(/名單\s*[:：]?\s*[{\uff5b]([\s\S]*?)[}\uff5d]/);

      let hasChanges = false;
      const section = games[gid].sections[0];
      const currentList = section.list;
      const oldLimit = section.limit;

      // 修改標題
      if (titleMatch) {
        const newTitle = titleMatch[1].trim();
        games[gid].title = newTitle;
        hasChanges = true;
      }

      // 修改人數
      if (limitMatch) {
        const newLimit = parseInt(limitMatch[1], 10);
        if (newLimit > 0) {
          // 如果新的人數低於當前報名人數，需要處理超出的人
          if (newLimit < oldLimit && currentList.length > newLimit) {
            // 人數減少：將超出的人保持在名單中（他們會自動顯示為候補）
            // 不需要移動，因為sendList會根據limit自動判斷哪些是候補
          }
          section.limit = newLimit;
          hasChanges = true;
        }
      }

      // 修改候補
      if (backupMatch) {
        const newBackupLimit = parseInt(backupMatch[1], 10);
        if (newBackupLimit >= 0) {
          section.backupLimit = newBackupLimit;
          hasChanges = true;
        }
      }

      // 修改名單
      if (listMatch) {
        const newListStr = listMatch[1].trim();
        const newList = newListStr
          .split(/[,\n]+/)
          .map(line => line.trim())
          .filter(line => line)
          .map(line => line.replace(/^\d+[.\s]*\s*/, ''));

        // 檢查重複（忽略匿名占位符）
        const nonAnonList = newList.filter(n => n !== '__ANON__');
        if (new Set(nonAnonList).size !== nonAnonList.length) {
          return await client.replyMessage(event.replyToken, { type: 'text', text: '❌ 名單中有重複的項目' });
        }

        section.list = newList;
        hasChanges = true;
      }

      if (!hasChanges) {
        return await client.replyMessage(event.replyToken, { type: 'text', text: '❌ 請指定要修改的項目（標題、人數、候補或名單）' });
      }

      await saveGame(gid);
      
      // 生成更新訊息
      let updateMsg = "✏️ 接龍已更新";
      if (limitMatch && parseInt(limitMatch[1], 10) < oldLimit && currentList.length > parseInt(limitMatch[1], 10)) {
        const movedCount = Math.min(currentList.length - parseInt(limitMatch[1], 10), currentList.length);
        updateMsg += `\n📋 人數已從 ${oldLimit} 調整為 ${parseInt(limitMatch[1], 10)}，超出的人員將顯示為候補`;
      }
      
      return await sendList(event.replyToken, gid, updateMsg);
    }

    // 2. 報名 (+1) / 取消 (-1)
    const addMatch = text.match(/^\+(\d+)(.*)/);
    if (addMatch) {
      // 檢查接龍是否存在
      if (!games[gid]) {
        return await client.replyMessage(event.replyToken, { 
          type: 'text', 
          text: '❌ 目前沒有進行中的接龍\n請先使用「接龍開始」建立接龍' 
        });
      }
      
      // 檢查接龍是否活躍
      if (!games[gid].active) {
        return await client.replyMessage(event.replyToken, { 
          type: 'text', 
          text: '❌ 此接龍已結束\n請使用「接龍開始」建立新的接龍' 
        });
      }
      // 若已有排程且尚未到時間，禁止提前 + / - 操作
      if (games[gid] && games[gid].scheduleTime && Number(games[gid].scheduleTime) > Date.now()) {
        const d = new Date(Number(games[gid].scheduleTime));
        const timeStr = `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        return await client.replyMessage(event.replyToken, { type: 'text', text: `尚未開始，將會在 ${timeStr} 開始接龍，請在機器人開始後再使用 + / - 指令` });
      }
      const count = parseInt(addMatch[1], 10);
      let content = addMatch[2].trim();
      const currentList = games[gid].sections[0].list;
      let namesToAdd = [];

      // 支援 +N 匿名 或 +N匿名
      if (content && /匿名/.test(content)) {
        namesToAdd = Array(count).fill('__ANON__');
      } else if (content) {
        namesToAdd = content.split(/[\s,]+/).filter(n => n);
      } else if (count === 1) {
        namesToAdd = [await getName(gid, uid)];
      }

      if (namesToAdd.length > 0) {
        // 對於匿名占位符允許重複，對於實名則檢查重複
        const realNames = namesToAdd.filter(n => n !== '__ANON__');
        const hasDuplicate = realNames.some(n => currentList.includes(n));
        const hasSelfDuplicate = new Set(realNames).size !== realNames.length;
        if (hasDuplicate || hasSelfDuplicate) {
          return await client.replyMessage(event.replyToken, { type: 'text', text: '名單已重複' });
        }
        namesToAdd.forEach(n => addToList(gid, 0, n));
      }

      await saveGame(gid);
      return await sendList(event.replyToken, gid);
    }
    if (text.startsWith('-1')) {
      // 檢查接龍是否存在
      if (!games[gid]) {
        return await client.replyMessage(event.replyToken, { 
          type: 'text', 
          text: '❌ 目前沒有進行中的接龍\n請先使用「接龍開始」建立接龍' 
        });
      }
      
      // 檢查接龍是否活躍
      if (!games[gid].active) {
        return await client.replyMessage(event.replyToken, { 
          type: 'text', 
          text: '❌ 此接龍已結束\n請使用「接龍開始」建立新的接龍' 
        });
      }
      
      // 若已有排程且尚未到時間，禁止提前 + / - 操作
      if (games[gid] && games[gid].scheduleTime && Number(games[gid].scheduleTime) > Date.now()) {
        const d = new Date(Number(games[gid].scheduleTime));
        const timeStr = `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        return await client.replyMessage(event.replyToken, { type: 'text', text: `尚未開始，將會在 ${timeStr} 開始接龍，請在機器人開始後再使用 + / - 指令` });
      }
      let name = text.slice(2).trim();
      if (!name) {
        name = await getName(gid, uid);
        removeFromList(gid, name);
      } else if (name === '匿名' || /匿名/.test(name)) {
        // 移除最後一個匿名占位符
        removeAnon(gid);
      } else {
        removeFromList(gid, name);
      }
      await saveGame(gid);
      return await sendList(event.replyToken, gid);
    }

    // 3. 接龍狀態查詢
    if (text === '接龍狀態' || text === '接龍查詢') {
      if (!games[gid]) {
        return await client.replyMessage(event.replyToken, { 
          type: 'text', 
          text: '❌ 目前沒有進行中的接龍\n請先使用「接龍開始」建立接龍' 
        });
      }
      const g = games[gid];
      const now = Date.now();
      const startTime = g.startTime ? new Date(g.startTime).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) : '未知';
      const age = g.startTime ? Math.floor((now - g.startTime) / (24 * 60 * 60 * 1000)) : 0;
      let statusMsg = `📋 接龍狀態\n\n`;
      statusMsg += `標題：${g.title || '未設定'}\n`;
      statusMsg += `狀態：${g.active ? '✅ 進行中' : '❌ 已結束'}\n`;
      statusMsg += `開始時間：${startTime}\n`;
      statusMsg += `已進行：${age} 天\n`;
      if (g.scheduleTime) {
        const schedTime = new Date(Number(g.scheduleTime)).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
        statusMsg += `定時推播：${schedTime}\n`;
      }
      statusMsg += `報名人數：${g.sections[0]?.list?.length || 0} / ${g.sections[0]?.limit || 0}\n`;
      return await client.replyMessage(event.replyToken, { type: 'text', text: statusMsg });
    }

    // 4. 批量名單 或 查詢
    if (text.startsWith('接龍名單')) {
      const input = text.replace('接龍名單', '').trim();
      if (input === '' || input === '#') {
        if (!games[gid]) {
          return await client.replyMessage(event.replyToken, { 
            type: 'text', 
            text: '❌ 目前沒有進行中的接龍\n請先使用「接龍開始」建立接龍' 
          });
        }
        return await sendList(event.replyToken, gid);
      }
      
      if (!games[gid] || !games[gid].active) {
        return await client.replyMessage(event.replyToken, { 
          type: 'text', 
          text: '❌ 目前沒有進行中的接龍\n請先使用「接龍開始」建立接龍' 
        });
      }
      
      const namesToAdd = input.split(/\s+/).filter(n => n);
      const currentList = games[gid].sections[0].list;
      const hasDuplicate = namesToAdd.some(n => currentList.includes(n));
      const hasSelfDuplicate = new Set(namesToAdd).size !== namesToAdd.length;
      if (hasDuplicate || hasSelfDuplicate) {
        return await client.replyMessage(event.replyToken, { type: 'text', text: '名單已重複' });
      }

      namesToAdd.forEach(n => addToList(gid, 0, n));
      await saveGame(gid);
      return await sendList(event.replyToken, gid);
    }

    // 5. 多區段設定: 接龍 {段標題}{人數}{候補}{標籤} 或 接龍2...
    // 注意：必須在"接龍修改/接龍修正"之後檢查，且不能是"接龍修改"或"接龍修正"
    if (text.startsWith('接龍') && text.includes('{') && !text.startsWith('接龍修改') && !text.startsWith('接龍修正') && !text.startsWith('接龍名單') && !text.startsWith('接龍開始') && !text.startsWith('接龍結束') && !text.startsWith('接龍清空') && !text.startsWith('接龍刪除')) {
      const p = getParams(text);
      const idx = text.startsWith('接龍2') ? 1 : 0;
      games[gid].sections[idx] = {
        title: p[0] || `區段${idx + 1}`,
        limit: parseInt(p[1]) || 10,
        backupLimit: parseInt(p[2]) || 0,
        label: p[3] || '',
        list: games[gid].sections[idx]?.list || []
      };
      await saveGame(gid);
      return await sendList(event.replyToken, gid, `⚙️ 區段${idx + 1} 更新成功`);
    }

    // 5. 清除/刪除/結束
    if (text === '接龍清空') {
      games[gid].sections.forEach(s => s.list = []);
      await saveGame(gid);
      return await client.replyMessage(event.replyToken, { type: 'text', text: '🧹 名單已清空' });
    }
    if (text === '接龍刪除') {
      await deleteGame(gid);
      return await client.replyMessage(event.replyToken, { type: 'text', text: '🗑️ 設置已移除' });
    }

    // 管理員登入
    if (text.startsWith('管理員登入')) {
      const pwd = text.replace('管理員登入', '').trim();
      if (pwd === ADMIN_PASSWORD) {
        adminUsers.add(uid);
        return await client.replyMessage(event.replyToken, { type: 'text', text: '🔓 管理員登入成功，已開啟查詢權限' });
      }
    }

    // 6. 系統狀態檢查
    if (text === '系統狀態') {
      if (!adminUsers.has(uid)) return null; // 未登入則忽略指令
      let dbStatus = '⚠️ 僅使用記憶體 (無資料庫)';
      if (pool) {
        try {
          await pool.query('SELECT 1'); // 嘗試執行簡單查詢測試連線
          dbStatus = '✅ 資料庫連線正常';
        } catch (e) {
          dbStatus = '❌ 資料庫連線異常';
        }
      }
      return await client.replyMessage(event.replyToken, { type: 'text', text: `📊 系統狀態\n${dbStatus}\n目前載入接龍數: ${Object.keys(games).length}` });
    }

    // 7. 資料庫列表 (檢查 DB 內容)
    if (text === '資料庫列表') {
      if (!adminUsers.has(uid)) return null; // 未登入則忽略指令
      if (!pool) return await client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 無資料庫連線' });
      try {
        const res = await pool.query('SELECT gid, data FROM games');
        if (res.rows.length === 0) {
          return await client.replyMessage(event.replyToken, { type: 'text', text: '📭 資料庫內無資料' });
        }
        let msg = '📦 資料庫存檔列表:\n';
        res.rows.forEach((row, i) => {
          const g = row.data;
          msg += `${i + 1}. ${g.title || '未命名'} (${row.gid})\n`;
        });
        return await client.replyMessage(event.replyToken, { type: 'text', text: msg.trim() });
      } catch (e) {
        return await client.replyMessage(event.replyToken, { type: 'text', text: `❌ 查詢失敗: ${e.message}` });
      }
    }

    // 8. 排程檢查 (調試用)
    if (text === '排程檢查') {
      if (!adminUsers.has(uid)) return null; // 未登入則忽略指令
      const gids = Object.keys(games);
      let msg = `📋 目前有 ${gids.length} 筆接龍資料\n`;
      const now = Date.now();
      for (const gid of gids) {
        const g = games[gid];
        if (g.scheduleTime) {
          const sched = Number(g.scheduleTime);
          const diff = sched - now;
          msg += `\n${g.title || '未命名'} (${gid})\n`;
          msg += `排程時間: ${new Date(sched).toString()}\n`;
          msg += `距離現在: ${diff}ms (${(diff / 1000 / 60).toFixed(1)} 分鐘)\n`;
          msg += `active: ${g.active}\n`;
        }
      }
      if (msg === `📋 目前有 ${gids.length} 筆接龍資料\n`) msg += '\n無排程設定';
      return await client.replyMessage(event.replyToken, { type: 'text', text: msg.trim() });
    }

    // 9. 測試推播
    if (text === '測試推播') {
      if (!adminUsers.has(uid)) return null; // 未登入則忽略指令
      try {
        await client.pushMessage(gid, { type: 'text', text: '✅ 測試推播成功！' });
        logToFile(`[TEST] Push message succeeded for ${gid}`);
        return await client.replyMessage(event.replyToken, { type: 'text', text: '✅ 推播測試成功！群組應已收到訊息' });
      } catch (e) {
        logToFile(`[TEST] Push message failed for ${gid}: ${e.message}`);
        return await client.replyMessage(event.replyToken, { type: 'text', text: `❌ 推播失敗: ${e.message}` });
      }
    }

    // 10. 強制檢查排程
    if (text === '強制檢查排程') {
      if (!adminUsers.has(uid)) return null; // 未登入則忽略指令
      logToFile(`[FORCE] Manual schedule check triggered`);
      await checkSchedules();
      return await client.replyMessage(event.replyToken, { type: 'text', text: '✅ 已執行排程檢查，請查看日誌' });
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
  // 匿名占位符允許重複出現
  if (name === '__ANON__') {
    games[gid].sections[idx].list.push(name);
    return;
  }
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

function removeAnon(gid) {
  const s = games[gid].sections[0];
  if (!s) return;
  for (let i = s.list.length - 1; i >= 0; i--) {
    if (s.list[i] === '__ANON__') {
      s.list.splice(i, 1);
      return;
    }
  }
}

async function sendList(token, gid, prefix = "") {
  const g = games[gid];
  if (!g) return;
  let msg = `${prefix}\n${g.title}\n`;
  g.sections.forEach(sec => {
    msg += `\n【${sec.title}】\n`;
    for (let i = 0; i < sec.limit; i++) {
      if (i < sec.list.length) {
        const name = sec.list[i];
        const isAnon = (name === '__ANON__') || ((g.anonymous || []).includes && (g.anonymous || []).includes(name));
        // 若當前與下一位皆為匿名，則隱藏當前行 (摺疊顯示)
        if (isAnon && ((sec.list[i + 1] === '__ANON__') || ((g.anonymous || []).includes && (g.anonymous || []).includes(sec.list[i + 1])))) continue;
        const displayName = isAnon ? '***' : name;
        msg += `${sec.label}${i + 1}. ${displayName}\n`;
      } else {
        if (i === sec.limit - 1) msg += `${sec.label}${i + 1}. \n`;
        else if (i === sec.list.length) msg += `..\n`;
      }
    }
    if (sec.list.length >= sec.limit) {
      msg += `--- 候補 ---\n`;
      for (let i = sec.limit; i < sec.list.length; i++) {
        if (i < sec.limit + sec.backupLimit) {
          const name = sec.list[i];
          const displayName = (g.anonymous || []).includes(name) ? '***' : name;
          msg += `候補${i - sec.limit + 1}. ${displayName}\n`;
        }
      }
    }
  });
  if (g.note) msg += `\n📝 ${g.note}`;
  
  const message = { type: 'text', text: msg.trim() };
  if (token) {
    return await client.replyMessage(token, message);
  }
  // 若無 token 則使用 Push Message (用於定時推播)
  try {
    return await client.pushMessage(gid, message);
  } catch (e) {
    console.error(`pushMessage failed for ${gid}:`, e);
    throw e;
  }
}

const port = process.env.PORT || 3000;

// 內部定時器：每10分鐘訪問自己的健康檢查端點以保持喚醒
async function pingSelf() {
  // 優先使用 RENDER_EXTERNAL_URL，如果沒有則嘗試其他環境變數或使用 localhost
  const baseUrl = process.env.RENDER_EXTERNAL_URL || 
                  process.env.APP_URL || 
                  process.env.URL || 
                  `http://localhost:${port}`;
  const healthUrl = `${baseUrl}/health`;
  
  try {
    const url = new URL(healthUrl);
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? https : http;
    const defaultPort = isHttps ? 443 : 80;
    
    const options = {
      hostname: url.hostname,
      port: url.port || defaultPort,
      path: url.pathname,
      method: 'GET',
      timeout: 10000 // 10秒超時
    };
    
    return new Promise((resolve, reject) => {
      const req = httpModule.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          // 只在錯誤時記錄，成功時減少日誌輸出
          resolve();
        });
      });
      
      req.on('error', (err) => {
        // 只在連續失敗時記錄，避免日誌過多
        logToFile(`[ERROR] [PING] Self-ping failed: ${err.message}`);
        reject(err);
      });
      
      req.on('timeout', () => {
        req.destroy();
        logToFile(`[ERROR] [PING] Self-ping timeout`);
        reject(new Error('Request timeout'));
      });
      
      req.setTimeout(10000);
      req.end();
    });
  } catch (err) {
    logToFile(`[ERROR] [PING] Self-ping error: ${err.message}`);
  }
}

// 啟動服務器
app.listen(port, () => {
  console.log(`Badminton Bot Running on port ${port}...`);
  
  // 立即執行一次（延遲5秒，確保服務器完全啟動）
  setTimeout(() => {
    pingSelf().catch(console.error);
  }, 5000);
  
  // 每10分鐘執行一次自我PING（600000毫秒 = 10分鐘）
  setInterval(() => {
    pingSelf().catch(console.error);
  }, 10 * 60 * 1000);
  
  console.log('✅ 自動喚醒定時器已啟動（每10分鐘）');
  logToFile('[STARTUP] Auto-wake timer started (every 10 minutes)');
});