const express = require('express');
const { Client, middleware } = require('@line/bot-sdk');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const GAMES_FILE = path.join(__dirname, 'games.json');
const LOG_FILE = path.join(__dirname, 'schedule.log');

// --- 名單快照 CSV（最精簡，使用 GitHub 儲存） ---
// 位置：data/registrations.csv（GitHub）
// 欄位：gid,sectionIdx,name
const DATA_DIR = path.join(__dirname, 'data');
const REG_CSV_FILE = path.join(DATA_DIR, 'registrations.csv');
const REG_CSV_BACKUP_DIR = path.join(DATA_DIR, 'backups');

// GitHub 設定（從環境變數讀取）
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || process.env.GITHUB_REPOSITORY?.split('/')[0];
const GITHUB_REPO = process.env.GITHUB_REPO || process.env.GITHUB_REPOSITORY?.split('/')[1];
const GITHUB_CSV_PATH = process.env.GITHUB_CSV_PATH || 'data/registrations.csv';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const USE_GITHUB = !!(GITHUB_TOKEN && GITHUB_OWNER && GITHUB_REPO);

if (USE_GITHUB) {
  console.log(`✅ 使用 GitHub 儲存 CSV: ${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_CSV_PATH}`);
  console.log(`   分支: ${GITHUB_BRANCH}`);
  console.log(`   Token: ${GITHUB_TOKEN ? GITHUB_TOKEN.substring(0, 8) + '...' : '未設定'}`);
} else {
  console.log('⚠️  未設定 GitHub 環境變數，將使用本地檔案儲存');
  console.log('   需要設定: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO');
  console.log('   目前狀態:');
  console.log(`     GITHUB_TOKEN: ${GITHUB_TOKEN ? '已設定' : '❌ 未設定'}`);
  console.log(`     GITHUB_OWNER: ${GITHUB_OWNER || '❌ 未設定'}`);
  console.log(`     GITHUB_REPO: ${GITHUB_REPO || '❌ 未設定'}`);
}

let regCsvWriteChain = Promise.resolve(); // 併發保護：所有寫入串成單一 Promise 佇列
let regCsvLastBackupYMD = null;
let regCsvContent = ''; // 快取 CSV 內容（用於 GitHub 模式）
let regCsvSha = null; // GitHub 檔案的 SHA（用於更新）

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // 有逗號、引號、換行就必須用雙引號包起來，並把引號變成兩個引號
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// GitHub API 輔助函數
async function githubApiRequest(method, endpoint, data = null) {
  const url = `https://api.github.com${endpoint}`;
  
  const headers = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`, // 使用 Bearer 格式
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'line-bot-csv-storage',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  
  let body = null;
  if (data) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(data);
  }
  
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: headers,
      timeout: 10000 // 10秒超時
    }, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const json = responseBody ? JSON.parse(responseBody) : {};
            resolve(json);
          } else {
            const errorJson = responseBody ? JSON.parse(responseBody) : {};
            const errorMsg = errorJson.message || responseBody || `HTTP ${res.statusCode}`;
            console.error(`❌ GitHub API 錯誤 [${res.statusCode}]:`, errorMsg);
            reject(new Error(`GitHub API Error: ${res.statusCode} - ${errorMsg}`));
          }
        } catch (e) {
          console.error('❌ 解析 GitHub API 回應失敗:', e.message, 'Response:', responseBody.substring(0, 200));
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    });
    
    req.on('error', (err) => {
      console.error('❌ GitHub API 請求失敗:', err.message);
      reject(err);
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('GitHub API request timeout'));
    });
    
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

// 從 GitHub 讀取 CSV
async function loadCsvFromGitHub() {
  if (!USE_GITHUB) {
    console.log('⚠️  GitHub 模式未啟用，跳過讀取');
    return null;
  }
  
  try {
    const endpoint = `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(GITHUB_CSV_PATH)}?ref=${GITHUB_BRANCH}`;
    console.log(`📥 從 GitHub 讀取 CSV: ${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_CSV_PATH}`);
    const response = await githubApiRequest('GET', endpoint);
    
    if (response.content) {
      // GitHub API 返回 base64 編碼的內容
      const content = Buffer.from(response.content, 'base64').toString('utf8');
      regCsvSha = response.sha;
      regCsvContent = content;
      const recordCount = content.split('\n').length - 1; // 減去標題行
      console.log(`✅ 從 GitHub 載入 CSV: ${recordCount} 筆記錄`);
      logToFile(`[SUCCESS] Loaded CSV from GitHub: ${recordCount} records`);
      return content;
    } else {
      throw new Error('GitHub API 回應中沒有 content 欄位');
    }
  } catch (e) {
    if (e.message.includes('404') || e.message.includes('Not Found')) {
      console.log('ℹ️  GitHub 上尚未有 CSV 檔案，將建立新檔案');
      regCsvContent = 'gid,sectionIdx,name\n';
      regCsvSha = null; // 新檔案沒有 SHA
      return null;
    }
    console.error('❌ 從 GitHub 讀取 CSV 失敗:', e.message);
    console.error('   端點:', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_CSV_PATH}`);
    logToFile(`[ERROR] Failed to load CSV from GitHub: ${e.message}`);
    
    // 如果讀取失敗，嘗試從本地檔案載入（如果有）
    try {
      if (fs.existsSync(REG_CSV_FILE)) {
        const localContent = await fs.promises.readFile(REG_CSV_FILE, 'utf8');
        regCsvContent = localContent;
        console.log('⚠️  已從本地檔案載入 CSV（GitHub 讀取失敗）');
        return localContent;
      }
    } catch (localError) {
      console.error('❌ 本地檔案載入也失敗:', localError.message);
    }
    
    return null;
  }
}

// 寫入 CSV 到 GitHub
async function writeCsvToGitHub(content, message = 'Update registrations.csv', allowRetry = true) {
  if (!USE_GITHUB) {
    console.log('⚠️  GitHub 模式未啟用，跳過寫入');
    return false;
  }
  
  try {
    const endpoint = `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(GITHUB_CSV_PATH)}`;
    const encodedContent = Buffer.from(content, 'utf8').toString('base64');
    
    const data = {
      message: message,
      content: encodedContent,
      branch: GITHUB_BRANCH
    };
    
    if (regCsvSha) {
      data.sha = regCsvSha; // 更新現有檔案需要 SHA
      console.log(`📝 更新 GitHub CSV (SHA: ${regCsvSha.substring(0, 8)}...)`);
    } else {
      console.log(`📝 建立新 GitHub CSV 檔案`);
    }
    
    const response = await githubApiRequest('PUT', endpoint, data);
    
    if (response.content && response.content.sha) {
      regCsvSha = response.content.sha;
      regCsvContent = content;
      console.log(`✅ CSV 已寫入 GitHub (${content.split('\n').length - 1} 筆記錄)`);
      logToFile(`[SUCCESS] CSV written to GitHub: ${content.split('\n').length - 1} records`);
      return true;
    } else {
      throw new Error('GitHub API 回應格式錯誤：缺少 content.sha');
    }
  } catch (e) {
    // 若遇到 SHA 衝突（409），先重新載入最新檔案再重試一次
    const isShaConflict = String(e.message).includes('409') || String(e.message).includes('does not match');
    if (isShaConflict && allowRetry) {
      console.warn('⚠️  偵測到 GitHub SHA 衝突，重新載入後重試一次');
      try {
        await loadCsvFromGitHub();
      } catch (reloadErr) {
        console.error('❌ 重新載入 GitHub CSV 失敗:', reloadErr.message);
      }
      return await writeCsvToGitHub(content, message, false);
    }

    console.error('❌ 寫入 CSV 到 GitHub 失敗:', e.message);
    console.error('   端點:', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_CSV_PATH}`);
    console.error('   分支:', GITHUB_BRANCH);
    logToFile(`[ERROR] Failed to write CSV to GitHub: ${e.message}`);
    
    // 如果寫入失敗，降級到本地檔案模式（至少保留資料）
    try {
      await fs.promises.mkdir(DATA_DIR, { recursive: true });
      await fs.promises.writeFile(REG_CSV_FILE, content, 'utf8');
      console.log('⚠️  已降級到本地檔案模式儲存');
      logToFile(`[WARN] Fallback to local file storage`);
    } catch (fallbackError) {
      console.error('❌ 本地檔案備份也失敗:', fallbackError.message);
    }
    
    return false;
  }
}

async function ensureRegCsvReady() {
  if (USE_GITHUB) {
    // GitHub 模式：確保已載入內容
    if (!regCsvContent) {
      await loadCsvFromGitHub();
      if (!regCsvContent) {
        regCsvContent = 'gid,sectionIdx,name,limit,backupLimit\n';
      }
    }
  } else {
    // 本地檔案模式
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    const exists = fs.existsSync(REG_CSV_FILE);
    if (!exists) {
      const header = 'gid,sectionIdx,name,limit,backupLimit\n';
      await fs.promises.writeFile(REG_CSV_FILE, header, 'utf8');
    }
  }
}

async function maybeBackupRegCsv(now = new Date()) {
  const today = ymd(now);
  if (regCsvLastBackupYMD === today) return;
  regCsvLastBackupYMD = today;

  try {
    // 沒有檔案就不備份
    if (!fs.existsSync(REG_CSV_FILE)) return;
    await fs.promises.mkdir(REG_CSV_BACKUP_DIR, { recursive: true });
    const backupPath = path.join(REG_CSV_BACKUP_DIR, `registrations-${today}.csv`);
    // 同一天只備份一次（若已存在就跳過）
    if (fs.existsSync(backupPath)) return;
    await fs.promises.copyFile(REG_CSV_FILE, backupPath);
  } catch (e) {
    console.error('Failed to backup registrations.csv:', e);
    logToFile(`[WARN] Failed to backup registrations.csv: ${e.message}`);
  }
}

// 保存當前接龍名單快照到 CSV（只記錄當前狀態，不記錄歷史操作）
async function saveCurrentListSnapshot(gid, waitForWrite = false) {
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
            String(section.backupLimit ?? '')
          ].map(csvEscape).join(','));
        }
      });
    });
  });

  const csvContent = 'gid,sectionIdx,name,limit,backupLimit\n' + (rows.length > 0 ? rows.join('\n') + '\n' : '');
  
  const writePromise = regCsvWriteChain
    .then(async () => {
      try {
        await ensureRegCsvReady();
        
        if (USE_GITHUB) {
          const label = gid ? (games[gid]?.title || gid) : 'all-groups';
          console.log(`📝 保存接龍名單快照到 GitHub: ${label} (${rows.length} 人)`);
          const success = await writeCsvToGitHub(csvContent, `Update current list snapshot: ${label}`);
          
          if (!success) {
            throw new Error('GitHub 寫入失敗');
          }
        } else {
          // 本地檔案模式：覆蓋寫入（不是追加）
          await fs.promises.writeFile(REG_CSV_FILE, csvContent, 'utf8');
          const label = gid ? (games[gid]?.title || gid) : 'all-groups';
          console.log(`✅ 已保存接龍名單快照: ${label} (${rows.length} 人)`);
        }
      } catch (e) {
        console.error('❌ Failed to save list snapshot:', e);
        logToFile(`[ERROR] Failed to save list snapshot: ${e.message}`);
        throw e;
      }
    });

  regCsvWriteChain = writePromise.catch((e) => {
    console.error('⚠️  CSV 寫入鏈中的錯誤（已記錄，繼續處理）:', e.message);
  });

  if (waitForWrite) {
    return writePromise;
  }
  
  return Promise.resolve();
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === ',') {
        result.push(current);
        current = '';
      } else if (ch === '"') {
        inQuotes = true;
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

async function restoreGamesFromCsv() {
  if (Object.keys(games).length > 0) return false;

  let content = regCsvContent;
  if (!content && fs.existsSync(REG_CSV_FILE)) {
    content = await fs.promises.readFile(REG_CSV_FILE, 'utf8');
  }
  if (!content) return false;

  const lines = content.trim().split(/\r?\n/);
  if (lines.length <= 1) return false;

  const header = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
  const idxGid = header.indexOf('gid');
  const idxSection = header.indexOf('sectionidx');
  const idxName = header.indexOf('name');
  const idxLimit = header.indexOf('limit');
  const idxBackup = header.indexOf('backuplimit');

  if (idxGid < 0 || idxSection < 0 || idxName < 0) {
    return false;
  }

  const byGid = new Map();
  const metaByGid = new Map();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCsvLine(line);
    const gid = (cols[idxGid] || '').trim();
    const name = (cols[idxName] || '').trim();
    const sectionIdx = parseInt((cols[idxSection] || '0').trim(), 10);

    if (!gid || !name) continue;
    const safeSectionIdx = Number.isFinite(sectionIdx) && sectionIdx >= 0 ? sectionIdx : 0;

    if (!byGid.has(gid)) {
      byGid.set(gid, new Map());
    }
    const sectionMap = byGid.get(gid);
    if (!metaByGid.has(gid)) {
      metaByGid.set(gid, new Map());
    }
    const metaMap = metaByGid.get(gid);
    if (!sectionMap.has(safeSectionIdx)) {
      sectionMap.set(safeSectionIdx, []);
    }
    if (!metaMap.has(safeSectionIdx)) {
      metaMap.set(safeSectionIdx, {});
    }
    const sectionMeta = metaMap.get(safeSectionIdx);
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
    const list = sectionMap.get(safeSectionIdx);
    if (!list.includes(name)) {
      list.push(name);
    }
  }

  if (byGid.size === 0) return false;

  for (const [gid, sectionMap] of byGid.entries()) {
    const sectionIndices = Array.from(sectionMap.keys());
    const maxIdx = Math.max(...sectionIndices, 0);
    const sections = [];
    const metaMap = metaByGid.get(gid) || new Map();
    for (let idx = 0; idx <= maxIdx; idx++) {
      const list = sectionMap.get(idx) || [];
      const meta = metaMap.get(idx) || {};
      const limit = meta.limit || Math.max(20, list.length);
      sections.push({
        title: idx === 0 ? '報名名單' : `區段${idx + 1}`,
        limit: limit,
        backupLimit: meta.backupLimit ?? 5,
        label: '',
        list: list
      });
    }
    games[gid] = {
      title: '羽球接龍',
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
    await saveGame(gid, true);
  }

  return true;
}

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

// 用戶名稱快取，減少 API 呼叫以節省額度
const userNameCache = new Map(); // key: "gid_uid", value: { name, timestamp }
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24小時快取過期時間

// UID 到名稱的映射（從名單中提取），用於快速匹配，減少 API 呼叫
const uidToNameMap = new Map(); // key: "gid_uid", value: name

// 追蹤首次使用指令的群組（用於顯示歡迎訊息，而非加入時推播）
const firstUseGroups = new Set(); // 記錄已經顯示過歡迎訊息的群組

// PostgreSQL 連線設定（已停用，改用 CSV 檔案儲存）
// 如果不需要 PostgreSQL，可以移除或註解掉以下程式碼
// 目前強制使用檔案模式，避免連線錯誤訊息
if (!process.env.DATABASE_URL) {
  console.log('ℹ️  使用檔案模式儲存資料（games.json + registrations.csv）');
} else {
  console.log('ℹ️  已停用 PostgreSQL，使用檔案模式儲存資料（games.json + registrations.csv）');
}

let pool = null;
// 停用 PostgreSQL 連線，強制使用檔案模式
// 如果需要重新啟用，請取消以下註解並移除 pool = null
/*
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
*/

// 初始化資料庫與載入資料
let loadPromise = Promise.resolve();
// 停用 PostgreSQL，直接使用檔案模式
if (pool) {
  loadPromise = pool.query(`
    CREATE TABLE IF NOT EXISTS games (
      gid TEXT PRIMARY KEY,
      data JSONB
    );
  `).then(() => loadGames())
    .catch(err => {
      console.log('ℹ️  資料庫連線失敗，已切換到檔案模式');
      pool = null;
      return loadGames();
    });
} else {
  loadPromise = loadGames();
}

// 同時載入 GitHub CSV（如果啟用）
if (USE_GITHUB) {
  loadPromise = loadPromise.then(async () => {
    await loadCsvFromGitHub();
  }).catch(err => {
    console.error('⚠️  載入 GitHub CSV 失敗（將繼續使用本地模式）:', err.message);
  });
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
let isShuttingDown = false;

// 立即寫入檔案（用於關鍵時刻或關閉時）
async function flushFileSave() {
  if (pendingSaves.size === 0) return;
  try {
    await fs.promises.writeFile(GAMES_FILE, JSON.stringify(games, null, 2), 'utf8');
    pendingSaves.clear();
    console.log('✅ 接龍資料已寫入檔案');
  } catch (e) {
    console.error('❌ 儲存接龍資料至檔案失敗:', e);
    logToFile(`[ERROR] Failed to save games.json: ${e.message}`);
    // 失敗時保留pendingSaves，下次再試
  }
}

async function saveGame(gid, immediate = false) {
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
      if (immediate) {
        await flushFileSave();
      } else {
        scheduleFileSave();
      }
    }
  } else {
    pendingSaves.add(gid);
    if (immediate || isShuttingDown) {
      await flushFileSave();
    } else {
      scheduleFileSave();
    }
  }
}

function touchGame(gid) {
  if (!games[gid]) return;
  games[gid].lastActiveTime = Date.now();
}

function scheduleFileSave() {
  if (saveFileTimeout) return; // 已有排程，等待執行
  saveFileTimeout = setTimeout(async () => {
    saveFileTimeout = null;
    await flushFileSave();
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
      games[gid].lastActiveTime = now;
      await saveGame(gid, true);
    }
    const lastActive = games[gid].lastActiveTime || games[gid].startTime || now;
    if (now - lastActive > EXPIRY_TIME) {
      console.log(`群組 ${gid} 接龍已過期自動刪除`);
      await deleteGame(gid);
      await saveCurrentListSnapshot(null, false);
    }
  }
}
checkExpiredGames().catch(console.error); // 啟動時檢查一次

function startDailyExpiryCheck() {
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const msUntilMidnight = nextMidnight.getTime() - now.getTime();
  setTimeout(() => {
    checkExpiredGames().catch(console.error);
    setInterval(() => checkExpiredGames().catch(console.error), 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
}
startDailyExpiryCheck();

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
loadPromise.then(async () => {
  const restored = await restoreGamesFromCsv().catch((e) => {
    console.error('Failed to restore games from CSV:', e);
    return false;
  });
  if (restored) {
    console.log('✅ 已從 CSV 還原接龍名單');
  }
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
  // 處理機器人被加入群組的事件（memberJoined）
  // 優化：不立即發送 pushMessage（會消耗額度），改為記錄等待首次使用時顯示
  if (event.type === 'memberJoined') {
    const gid = event.source.groupId || event.source.roomId;
    if (!gid) return null;
    
    // 僅記錄日誌，不發送推播訊息（節省 pushMessage 額度）
    logToFile(`[INFO] Bot joined group/room ${gid} - waiting for first command`);
    console.log(`✅ Bot joined group/room: ${gid} - will show welcome on first use`);
    return null;
  }

  // 處理用戶加機器人為好友的事件（follow）
  if (event.type === 'follow') {
    try {
      const uid = event.source.userId;
      const welcomeMessage = '👋 您好！感謝加我為好友。\n\n' +
        '我是羽球接龍機器人，請邀請我加入群組後使用「接龍開始」來建立接龍活動。\n\n' +
        '在群組中可以使用以下功能：\n' +
        '📖 接龍開始 - 建立新接龍\n' +
        '💡 +1 / -1 - 報名/取消\n' +
        '📋 接龍名單 - 查看名單';
      
      await client.replyMessage(event.replyToken, { type: 'text', text: welcomeMessage });
      logToFile(`[SUCCESS] Bot followed by user ${uid}`);
      console.log(`✅ Bot followed by user: ${uid}`);
      return null;
    } catch (e) {
      console.error('Failed to respond to follow event:', e);
      logToFile(`[ERROR] Failed to respond to follow event: ${e.message}`);
      return null;
    }
  }

  if (event.type !== 'message' || event.message.type !== 'text') return null;

  const gid = event.source.groupId || event.source.userId;
  const uid = event.source.userId;
  const text = event.message.text.trim();

  // 檢查是否為群組首次使用（僅針對群組，使用 replyMessage 而非 pushMessage 節省額度）
  let showWelcome = false;
  if (gid && (gid.startsWith('C') || gid.startsWith('R')) && !firstUseGroups.has(gid)) {
    firstUseGroups.add(gid);
    showWelcome = true;
  }

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
        lastActiveTime: Date.now(),
        scheduleTime: scheduleTime,
        scheduleInput: scheduleInput,
        anonymous: anonList, // 兼容舊的匿名名單（若為數字則用 placeholder 存入 list）
        anonymousCount: anonCount,
        sections: [
          { title: '報名名單', limit: limit, backupLimit: backupLimit, label: '', list: initialList }
        ]
      };
      await saveGame(gid, true); // 立即寫入，確保資料不丟失
      if (listMatch) {
        await saveCurrentListSnapshot(gid, false);
      }
      
      // 保存初始名單快照到 CSV
      await saveCurrentListSnapshot(gid, false);
      
      // 首次使用時顯示歡迎訊息（使用 replyMessage 免費，不消耗額度）
      let welcomePrefix = '';
      if (showWelcome) {
        welcomePrefix = '👋 大家好！我是羽球接龍機器人。\n\n';
      }
      
      if (scheduleTime) {
        // 若時間已過則立即觸發一次
        if (scheduleTime <= Date.now()) {
          try { await sendList(null, gid, "⏰ 定時提醒"); } catch (e) { console.error('Immediate scheduled send failed:', e); }
        }
        const displayTime = scheduleInput || (() => { const d = new Date(scheduleTime); return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`; })();
        return await client.replyMessage(event.replyToken, { type: 'text', text: welcomePrefix + `設定完成，將會在 ${displayTime} 開始接龍` });
      }
      return await sendList(event.replyToken, gid, welcomePrefix + "🚀 接龍設定成功！");
    }

    if (text === '接龍結束') {
      // 保存最終名單快照到 CSV（在刪除前）
      if (games[gid]) {
        await saveCurrentListSnapshot(gid, true);
      }
      await deleteGame(gid);
      // 刪除後更新 CSV，移除該群組資料
      await saveCurrentListSnapshot(null, false);
      // 優化：不發送回覆訊息，直接更新名單顯示結束狀態（節省一次 replyMessage）
      // 用戶可以通過查看名單確認，或我們可以在 sendList 中顯示結束訊息
      // 但為了更好的體驗，還是回覆一個簡短訊息，但使用更簡潔的文字
      return await client.replyMessage(event.replyToken, { type: 'text', text: '✅ 已結束' });
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

      touchGame(gid);
      await saveGame(gid, true); // 立即寫入，確保資料不丟失
      if (listMatch) {
        await saveCurrentListSnapshot(gid, false);
      }
      
      // 生成更新訊息
      let updateMsg = "✏️ 接龍已更新";
      if (limitMatch && parseInt(limitMatch[1], 10) < oldLimit && currentList.length > parseInt(limitMatch[1], 10)) {
        const movedCount = Math.min(currentList.length - parseInt(limitMatch[1], 10), currentList.length);
        updateMsg += `\n📋 人數已從 ${oldLimit} 調整為 ${parseInt(limitMatch[1], 10)}，超出的人員將顯示為候補`;
      }
      
      return await sendList(event.replyToken, gid, updateMsg);
    }

    // 2. 報名 (+1 到 +9) / 取消 (-1 到 -9)
    // 支援 "+1AA"、"+1 AA"、"AA+1"、"AA +1" 等格式（+1 到 +9）
    let addMatch = null;
    let count = 0;
    let content = '';
    
    // 檢查是否以 +1 到 +9 開頭（後面可以有空白和名字，或直接連接名字，或直接結束）
    const startMatch = text.match(/^\+([1-9])(\s*)(.*)/);
    if (startMatch) {
      count = parseInt(startMatch[1], 10);
      content = startMatch[3].trim();
      addMatch = { count: count, content: content };
    } 
    // 檢查是否以 +1 到 +9 結尾（前面必須有名字，+1 前可以有空白或直接連接）
    else {
      const endMatch = text.match(/^(.+?)(\s*)\+([1-9])$/);
      if (endMatch) {
        const namePart = endMatch[1].trim();
        if (namePart) {
          count = parseInt(endMatch[3], 10);
          content = namePart;
          addMatch = { count: count, content: content };
        }
      }
    }
    
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
      const currentList = games[gid].sections[0].list;
      let namesToAdd = [];

      // 支援 +1 匿名 或 +1匿名
      if (content && /匿名/.test(content)) {
        namesToAdd = Array(count).fill('__ANON__');
      } else if (content) {
        namesToAdd = content.split(/[\s,]+/).filter(n => n);
      } else if (count === 1) {
        // 優化：先檢查快取或名單映射，減少 API 呼叫
        const cacheKey = `${gid}_${uid}`;
        let userName = null;
        
        // 1. 檢查快取
        if (userNameCache.has(cacheKey)) {
          const cached = userNameCache.get(cacheKey);
          if (Date.now() - cached.timestamp < CACHE_EXPIRY) {
            userName = cached.name;
          }
        }
        
        // 2. 檢查名單映射（如果快取沒有）
        if (!userName && uidToNameMap.has(cacheKey)) {
          userName = uidToNameMap.get(cacheKey);
          // 如果名稱存在於當前名單中，可以直接使用
          if (currentList.includes(userName)) {
            namesToAdd = [userName];
          } else {
            // 名稱不在名單中，可能需要更新，呼叫 API 獲取最新名稱
            userName = await getName(gid, uid);
            namesToAdd = [userName];
          }
        } else if (!userName) {
          // 3. 都沒有的話才呼叫 API
          userName = await getName(gid, uid);
          namesToAdd = [userName];
        } else {
          namesToAdd = [userName];
        }
        
        // 更新映射
        if (userName) {
          uidToNameMap.set(cacheKey, userName);
        }
      }

      if (namesToAdd.length > 0) {
        // 對於匿名占位符允許重複，對於實名則檢查重複
        const realNames = namesToAdd.filter(n => n !== '__ANON__');
        const hasDuplicate = realNames.some(n => currentList.includes(n));
        const hasSelfDuplicate = new Set(realNames).size !== realNames.length;
        if (hasDuplicate || hasSelfDuplicate) {
          return await client.replyMessage(event.replyToken, { type: 'text', text: '名單已重複' });
        }
        namesToAdd.forEach(n => {
          addToList(gid, 0, n, { uid });
          // 更新 UID 到名稱的映射（僅對實名）
          if (n !== '__ANON__') {
            uidToNameMap.set(`${gid}_${uid}`, n);
          }
        });
      }

      touchGame(gid);
      touchGame(gid);
      touchGame(gid);
      await saveGame(gid, true); // 立即寫入，確保資料不丟失
      await saveCurrentListSnapshot(gid, false);
      return await sendList(event.replyToken, gid);
    }
    // 取消報名 (-1 到 -9)，支援 "-1AA"、"-1 AA"、"AA-1"、"AA -1" 等格式
    let removeMatch = null;
    let removeName = '';
    
    // 檢查是否以 -1 到 -9 開頭（後面可以有空白和名字，或直接連接名字，或直接結束）
    const removeStartMatch = text.match(/^-([1-9])(\s*)(.*)/);
    if (removeStartMatch) {
      removeName = removeStartMatch[3].trim();
      removeMatch = true;
    } 
    // 檢查是否以 -1 到 -9 結尾（前面必須有名字，-1 前可以有空白或直接連接）
    else {
      const removeEndMatch = text.match(/^(.+?)(\s*)-([1-9])$/);
      if (removeEndMatch) {
        const namePart = removeEndMatch[1].trim();
        if (namePart) {
          removeMatch = true;
          removeName = namePart;
        }
      }
    }
    
    if (removeMatch) {
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
      let name = removeName;
      if (!name) {
        // 優化：先從名單映射中查找，減少 API 呼叫
        const cacheKey = `${gid}_${uid}`;
        let userName = null;
        
        // 1. 檢查快取
        if (userNameCache.has(cacheKey)) {
          const cached = userNameCache.get(cacheKey);
          if (Date.now() - cached.timestamp < CACHE_EXPIRY) {
            userName = cached.name;
          }
        }
        
        // 2. 檢查名單映射
        if (!userName && uidToNameMap.has(cacheKey)) {
          userName = uidToNameMap.get(cacheKey);
          // 檢查名稱是否在名單中
          const currentList = games[gid].sections[0].list;
          if (!currentList.includes(userName)) {
            // 如果名稱不在名單中，呼叫 API 獲取最新名稱
            userName = await getName(gid, uid);
            uidToNameMap.set(cacheKey, userName);
          }
        } else if (!userName) {
          // 3. 都沒有的話才呼叫 API
          userName = await getName(gid, uid);
          uidToNameMap.set(cacheKey, userName);
        }
        
        name = userName || await getName(gid, uid);
        await removeFromList(gid, name, { uid });
      } else if (name === '匿名' || /匿名/.test(name)) {
        // 移除最後一個匿名占位符
        await removeAnon(gid, { uid });
      } else {
        await removeFromList(gid, name, { uid });
      }
      await saveGame(gid, true); // 立即寫入，確保資料不丟失
      await saveCurrentListSnapshot(gid, false);
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

      namesToAdd.forEach(n => {
        addToList(gid, 0, n, { uid });
        // 更新 UID 到名稱的映射（僅對實名）
        if (n !== '__ANON__') {
          uidToNameMap.set(`${gid}_${uid}`, n);
        }
      });
      await saveGame(gid, true); // 立即寫入，確保資料不丟失
      await saveCurrentListSnapshot(gid, false);
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
      touchGame(gid);
      await saveGame(gid, true); // 立即寫入，確保資料不丟失
      return await sendList(event.replyToken, gid, `⚙️ 區段${idx + 1} 更新成功`);
    }

    // 5. 清除/刪除/結束
    if (text === '接龍清空') {
      games[gid].sections.forEach(s => s.list = []);
      touchGame(gid);
      await saveGame(gid, true); // 立即寫入，確保資料不丟失
      // 清空後保存空名單快照
      await saveCurrentListSnapshot(gid, false);
      return await client.replyMessage(event.replyToken, { type: 'text', text: '🧹 名單已清空' });
    }
    if (text === '接龍刪除') {
      await deleteGame(gid);
      // 刪除後更新 CSV，移除該群組資料
      await saveCurrentListSnapshot(null, false);
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
      
      let csvStatus = '';
      if (USE_GITHUB) {
        try {
          // 測試 GitHub 連線
          const testEndpoint = `/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
          await githubApiRequest('GET', testEndpoint);
          const recordCount = regCsvContent ? regCsvContent.split('\n').length - 1 : 0;
          csvStatus = `✅ GitHub CSV 正常\n   倉庫: ${GITHUB_OWNER}/${GITHUB_REPO}\n   路徑: ${GITHUB_CSV_PATH}\n   記錄數: ${recordCount}`;
        } catch (e) {
          csvStatus = `❌ GitHub CSV 連線失敗: ${e.message}`;
        }
      } else {
        const localExists = fs.existsSync(REG_CSV_FILE);
        if (localExists) {
          const content = await fs.promises.readFile(REG_CSV_FILE, 'utf8').catch(() => '');
          const recordCount = content ? content.split('\n').length - 1 : 0;
          csvStatus = `📁 本地 CSV 模式\n   記錄數: ${recordCount}`;
        } else {
          csvStatus = '📁 本地 CSV 模式（尚未建立檔案）';
        }
      }
      
      return await client.replyMessage(event.replyToken, { 
        type: 'text', 
        text: `📊 系統狀態\n\n${dbStatus}\n\n${csvStatus}\n\n目前載入接龍數: ${Object.keys(games).length}` 
      });
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
  // 使用快取減少 API 呼叫以節省額度
  const cacheKey = `${gid}_${uid}`;
  const now = Date.now();
  
  // 檢查快取
  if (userNameCache.has(cacheKey)) {
    const cached = userNameCache.get(cacheKey);
    if (now - cached.timestamp < CACHE_EXPIRY) {
      return cached.name; // 返回快取的名稱
    } else {
      userNameCache.delete(cacheKey); // 快取過期，刪除
    }
  }
  
  try {
    const profile = (gid.startsWith('C') || gid.startsWith('R')) 
      ? await client.getGroupMemberProfile(gid, uid) 
      : await client.getProfile(uid);
    const name = profile.displayName;
    
    // 存入快取
    userNameCache.set(cacheKey, { name, timestamp: now });
    
    // 定期清理過期快取（每100次呼叫時檢查一次）
    if (userNameCache.size > 1000) {
      for (const [key, value] of userNameCache.entries()) {
        if (now - value.timestamp >= CACHE_EXPIRY) {
          userNameCache.delete(key);
        }
      }
    }
    
    return name;
  } catch (e) { 
    // API 失敗時使用快取的最後已知名稱，或返回預設值
    if (userNameCache.has(cacheKey)) {
      return userNameCache.get(cacheKey).name;
    }
    return '球友'; 
  }
}

function addToList(gid, idx, name, meta = {}, waitForCsv = false) {
  if (!games[gid].sections[idx]) return null;
  // 匿名占位符允許重複出現
  if (name === '__ANON__') {
    games[gid].sections[idx].list.push(name);
    // 不記錄到 CSV（只保存名單快照）
    return null;
  }
  if (!games[gid].sections[idx].list.includes(name)) {
    games[gid].sections[idx].list.push(name);
    // 不記錄到 CSV（只保存名單快照）
    return null;
  }
  return null;
}

async function removeFromList(gid, name, meta = {}, waitForCsv = false) {
  games[gid].sections.forEach((s, idx) => {
    const i = s.list.indexOf(name);
    if (i > -1) {
      s.list.splice(i, 1);
    }
  });
  // 注意：不刪除映射，因為用戶可能會再次報名，保留映射可以減少 API 呼叫
  // 不記錄到 CSV（只保存名單快照）
}

async function removeAnon(gid, meta = {}, waitForCsv = false) {
  const s = games[gid].sections[0];
  if (!s) return;
  for (let i = s.list.length - 1; i >= 0; i--) {
    if (s.list[i] === '__ANON__') {
      s.list.splice(i, 1);
      // 不記錄到 CSV（只保存名單快照）
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
const AUTO_WAKE_ENABLED = (process.env.AUTO_WAKE_ENABLED || 'true').toLowerCase() !== 'false';
const AUTO_WAKE_INTERVAL_MINUTES = Math.max(5, parseInt(process.env.AUTO_WAKE_INTERVAL_MINUTES || '60', 10) || 60);

// 內部定時器：定期訪問自己的健康檢查端點以保持喚醒
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

// Graceful shutdown：確保資料寫入
async function gracefulShutdown() {
  console.log('🛑 正在關閉服務器，確保資料寫入...');
  isShuttingDown = true;
  
  // 等待所有待寫入的資料
  if (saveFileTimeout) {
    clearTimeout(saveFileTimeout);
    saveFileTimeout = null;
  }
  await flushFileSave();
  
  // 等待所有 CSV 寫入完成
  try {
    await regCsvWriteChain;
    
    // 如果使用 GitHub 模式，確保最後的內容已寫入
    if (USE_GITHUB && regCsvContent) {
      await writeCsvToGitHub(regCsvContent, 'Final save before shutdown');
    }
    
    console.log('✅ 所有資料已寫入完成');
  } catch (e) {
    console.error('⚠️ CSV 寫入過程中發生錯誤:', e);
  }
  
  process.exit(0);
}

// 監聽關閉信號
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// 啟動服務器
app.listen(port, () => {
  console.log(`Badminton Bot Running on port ${port}...`);
  
  if (AUTO_WAKE_ENABLED) {
    // 立即執行一次（延遲5秒，確保服務器完全啟動）
    setTimeout(() => {
      pingSelf().catch(console.error);
    }, 5000);
    
    // 依設定頻率執行自我PING
    setInterval(() => {
      pingSelf().catch(console.error);
    }, AUTO_WAKE_INTERVAL_MINUTES * 60 * 1000);
    
    console.log(`✅ 自動喚醒定時器已啟動（每 ${AUTO_WAKE_INTERVAL_MINUTES} 分鐘）`);
    logToFile(`[STARTUP] Auto-wake timer started (every ${AUTO_WAKE_INTERVAL_MINUTES} minutes)`);
  } else {
    console.log('ℹ️ 已停用自動喚醒定時器（AUTO_WAKE_ENABLED=false）');
  }
});