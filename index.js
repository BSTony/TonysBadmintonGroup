const express = require('express');
const pinballPhysics = require('./pinballPhysics');
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
let groupAdmins = {}; // { gid: Set<uid> }
let superAdmins = new Set(); // Set<uid>
let groupCodes = {}; // { '1234': 'Cxxxx' }
let groupSettings = {}; // { gid: { lobbyTitle, groupName } }
let rosterTemplates = {}; // { gid: { templateName: text } }

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const ADMINS_FILE = path.join(__dirname, 'data/groupAdmins.json');
const SUPER_ADMINS_FILE = path.join(__dirname, 'data/superAdmins.json');
const GROUP_CODES_FILE = path.join(__dirname, 'data/groupCodes.json');
const GROUP_SETTINGS_FILE = path.join(__dirname, 'data/groupSettings.json');
const ROSTER_TEMPLATES_FILE = path.join(__dirname, 'data/rosterTemplates.json');
const REG_CSV_FILE = path.join(DATA_DIR, 'registrations.csv');
const REG_CSV_BACKUP_DIR = path.join(DATA_DIR, 'backups');
const LOBBY_VISITS_FILE = path.join(DATA_DIR, 'lobbyVisits.json');
const EASTER_EGG_FILE = path.join(DATA_DIR, 'easterEggSettings.json');
const GROUP_BUY_FILE = path.join(DATA_DIR, 'groupBuy.json');
const DEFAULT_MENU_FILE = path.join(DATA_DIR, 'defaultMenu.json');

let defaultMenuItems = [];
let groupBuyData = {}; // { [gid]: { active: false, title: "", notice: "", paymentSettings: {}, items: [], orders: {} } }

function getZhanRongDefaultItems() {
  return [
    { id: 'zr_001', category: '古早味沖泡', name: '傳統油蔥麵茶', price: 150, unit: '袋', description: '鹿港傳承古早味，香濃順口，早餐與下午茶首選！', imageUrl: 'https://cdn.store-assets.com/s/1255165/f/10532819.jpg', linkUrl: 'https://zrsh1986.com', linkText: '點我進入展榮官網' },
    { id: 'zr_002', category: '古早味沖泡', name: '無糖杏仁麵茶', price: 180, unit: '袋', description: '無添加蔗糖，濃香杏仁搭配傳統麵茶，健康無負擔。', imageUrl: 'https://cdn.store-assets.com/s/1255165/f/10553346.jpg', linkUrl: 'https://zrsh1986.com', linkText: '點我進入展榮官網' },
    { id: 'zr_003', category: '古早味沖泡', name: '養生黑芝麻粉', price: 220, unit: '罐', description: '低溫烘焙現磨，高鈣高纖，補給每日營養所需。', imageUrl: 'https://cdn.store-assets.com/s/1255165/f/10532819.jpg', linkUrl: 'https://zrsh1986.com', linkText: '點我進入展榮官網' },
    { id: 'zr_004', category: '傳統點心', name: '招牌手工爆米香 (黑糖口味)', price: 120, unit: '包', description: '傳統壓力爆香，淋上天然黑糖，酥脆不黏牙。', imageUrl: 'https://cdn.store-assets.com/s/1255165/f/10553346.jpg', linkUrl: 'https://zrsh1986.com', linkText: '點我進入展榮官網' },
    { id: 'zr_005', category: '傳統點心', name: '養生紫米爆米香', price: 135, unit: '包', description: '嚴選台灣在地黑糙米（紫米），卡滋卡滋滿滿花青素。', imageUrl: 'https://cdn.store-assets.com/s/1255165/f/10532819.jpg', linkUrl: 'https://zrsh1986.com', linkText: '點我進入展榮官網' },
    { id: 'zr_006', category: '傳統點心', name: '古早味小麥花生酥', price: 150, unit: '包', description: '濃郁花生香氣搭配爆小麥，辦公室最愛零嘴。', imageUrl: 'https://cdn.store-assets.com/s/1255165/f/10553346.jpg', linkUrl: 'https://zrsh1986.com', linkText: '點我進入展榮官網' },
    { id: 'zr_007', category: '低溫堅果', name: '原味綜合堅果 (低溫烘焙)', price: 350, unit: '罐', description: '含腰果、核桃、杏仁果、夏威夷豆，無鹽無油低溫烘焙。', imageUrl: 'https://cdn.store-assets.com/s/1255165/f/10532819.jpg', linkUrl: 'https://zrsh1986.com', linkText: '點我進入展榮官網' },
    { id: 'zr_008', category: '低溫堅果', name: '頂級原味腰果 (特大粒)', price: 320, unit: '罐', description: '嚴選特大顆腰果，自然甜味，飽滿酥脆。', imageUrl: 'https://cdn.store-assets.com/s/1255165/f/10553346.jpg', linkUrl: 'https://zrsh1986.com', linkText: '點我進入展榮官網' },
    { id: 'zr_009', category: '冷壓油品/抹醬', name: '純天然冷壓黑麻油', price: 480, unit: '瓶', description: '100% 嚴選黑芝麻低溫冷壓，溫補料理絕佳首選。', imageUrl: 'https://cdn.store-assets.com/s/1255165/f/10532819.jpg', linkUrl: 'https://zrsh1986.com', linkText: '點我進入展榮官網' },
    { id: 'zr_010', category: '冷壓油品/抹醬', name: '無糖純黑芝麻醬 (現磨)', price: 250, unit: '罐', description: '完全無添加糖與油，現磨濃郁滑順，塗麵包沖泡皆宜。', imageUrl: 'https://cdn.store-assets.com/s/1255165/f/10553346.jpg', linkUrl: 'https://zrsh1986.com', linkText: '點我進入展榮官網' }
  ];
}

function loadGroupBuyStorage() {
  if (fs.existsSync(DEFAULT_MENU_FILE)) {
    try {
      defaultMenuItems = JSON.parse(fs.readFileSync(DEFAULT_MENU_FILE, 'utf8'));
    } catch(e) { console.error('載入 defaultMenu.json 失敗:', e.message); }
  }
  if (fs.existsSync(GROUP_BUY_FILE)) {
    try {
      groupBuyData = JSON.parse(fs.readFileSync(GROUP_BUY_FILE, 'utf8'));
    } catch(e) { console.error('載入 groupBuy.json 失敗:', e.message); }
  }
  if (!groupBuyData['default'] || !Array.isArray(groupBuyData['default'].items) || groupBuyData['default'].items.length === 0) {
    groupBuyData['default'] = {
      active: false,
      hiddenFromLobby: true,
      title: '🛒 展榮商號 鹿港傳承團購專區 (1986)',
      notice: '',
      paymentSettings: {
        linePayLink: 'https://zrsh1986.com',
        linePayQrUrl: 'https://cdn.store-assets.com/s/1255165/f/10532819.jpg',
        bankCode: '822',
        bankName: '中國信託',
        bankAccount: '1234-5678-9012',
        bankAccountName: '展榮商號'
      },
      items: getZhanRongDefaultItems(),
      orders: {}
    };
    saveGroupBuyStorage();
  }
}

let groupBuySaveChain = Promise.resolve();
function saveGroupBuyStorage() {
  groupBuySaveChain = groupBuySaveChain.then(async () => {
    try {
      const jsonStr = JSON.stringify(groupBuyData, null, 2);
      await fs.promises.writeFile(GROUP_BUY_FILE, jsonStr, 'utf8');
      
      if (USE_GITHUB) {
        try {
          const payload = {
            message: 'chore: update groupBuy data',
            content: Buffer.from(jsonStr).toString('base64')
          };
          if (groupBuySha) payload.sha = groupBuySha;
          
          const res = await githubApiRequest('PUT', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/groupBuy.json`, payload);
          if (res && res.content && res.content.sha) {
            groupBuySha = res.content.sha;
          }
        } catch (ghErr) {
          console.error('Failed to sync groupBuy to GitHub:', ghErr.message);
        }
      }
    } catch(e) { console.error('儲存 groupBuy.json 失敗:', e.message); }
  }).catch(e => console.error(e));
  return groupBuySaveChain;
}

function getGroupBuyInfo(gid) {
  if (!gid) gid = 'default';
  if (!groupBuyData[gid] || !Array.isArray(groupBuyData[gid].items) || groupBuyData[gid].items.length === 0) {
    const defaultData = groupBuyData['default'] || {};
    groupBuyData[gid] = {
      active: false,
      hiddenFromLobby: true,
      title: defaultData.title || '🛒 展榮商號 鹿港傳承團購專區 (1986)',
      notice: defaultData.notice || '',
      paymentSettings: defaultData.paymentSettings || {
        linePayLink: 'https://zrsh1986.com',
        linePayQrUrl: 'https://cdn.store-assets.com/s/1255165/f/10532819.jpg',
        bankCode: '822',
        bankName: '中國信託',
        bankAccount: '1234-5678-9012',
        bankAccountName: '展榮商號'
      },
      items: (Array.isArray(defaultData.items) && defaultData.items.length > 0)
        ? JSON.parse(JSON.stringify(defaultData.items))
        : getZhanRongDefaultItems(),
      orders: groupBuyData[gid]?.orders || {}
    };
    saveGroupBuyStorage();
  }
  return groupBuyData[gid];
}

let lobbyVisits = {}; // { gid: { viewCount: 0, uniqueViewers: {}, logs: [] } }
let easterEggSettings = { enabled: false, message: '出示此畫面給Tony可以獲得一條握把布', quota: 3, winners: [], activeGame: 'piggy_run', bulletHellLeaderboard: [] };

// 讀取既有設定
let adminsSha = null;
let superAdminsSha = null;
let codesSha = null;
let settingsSha = null;
let templatesSha = null;
let gamesSha = null; // GitHub games.json 的 SHA
let visitsSha = null; // GitHub lobbyVisits.json 的 SHA
let easterEggSha = null; // GitHub easterEggSettings.json 的 SHA
let groupBuySha = null; // GitHub groupBuy.json 的 SHA
let gamesSaveChain = Promise.resolve(); // 防併發串行保存
let lobbyVisitClickCount = 0;

async function loadData() {
  // Load from local fallback first
  if (fs.existsSync(ADMINS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(ADMINS_FILE, 'utf8'));
      groupAdmins = {};
      for (const [g, admins] of Object.entries(data)) {
        groupAdmins[g] = new Set(admins);
      }
    } catch(e) {}
  }
  if (fs.existsSync(SUPER_ADMINS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(SUPER_ADMINS_FILE, 'utf8'));
      superAdmins = new Set(data);
    } catch(e) {}
  }
  if (fs.existsSync(GROUP_CODES_FILE)) {
    try {
      groupCodes = JSON.parse(fs.readFileSync(GROUP_CODES_FILE, 'utf8'));
    } catch(e) {}
  }
  if (fs.existsSync(GROUP_SETTINGS_FILE)) {
    try {
      groupSettings = JSON.parse(fs.readFileSync(GROUP_SETTINGS_FILE, 'utf8'));
    } catch(e) {}
  }
  if (fs.existsSync(ROSTER_TEMPLATES_FILE)) {
    try {
      rosterTemplates = JSON.parse(fs.readFileSync(ROSTER_TEMPLATES_FILE, 'utf8'));
    } catch(e) {}
  }
  if (fs.existsSync(LOBBY_VISITS_FILE)) {
    try {
      lobbyVisits = JSON.parse(fs.readFileSync(LOBBY_VISITS_FILE, 'utf8'));
    } catch(e) {}
  }
  if (fs.existsSync(EASTER_EGG_FILE)) {
    try {
      easterEggSettings = JSON.parse(fs.readFileSync(EASTER_EGG_FILE, 'utf8'));
      if (!easterEggSettings.activeGame) easterEggSettings.activeGame = 'piggy_run';
      if (!easterEggSettings.bulletHellLeaderboard) easterEggSettings.bulletHellLeaderboard = [];
    } catch(e) {}
  }
  loadGroupBuyStorage();

  loadGroupBuyStorage();

  // Then try to load from GitHub if configured
  if (USE_GITHUB) {
    try {
      console.log('從 GitHub 讀取 groupAdmins.json...');
      const adminRes = await githubApiRequest('GET', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/groupAdmins.json?ref=${GITHUB_BRANCH}`);
      if (adminRes.content) {
        adminsSha = adminRes.sha;
        const data = JSON.parse(Buffer.from(adminRes.content, 'base64').toString('utf8'));
        groupAdmins = {};
        for (const [g, admins] of Object.entries(data)) {
          groupAdmins[g] = new Set(admins);
        }
      }
    } catch(e) { console.error('無法從 GitHub 讀取 groupAdmins.json:', e.message); }

    try {
      console.log('從 GitHub 讀取 superAdmins.json...');
      const saRes = await githubApiRequest('GET', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/superAdmins.json?ref=${GITHUB_BRANCH}`);
      if (saRes.content) {
        superAdminsSha = saRes.sha;
        const data = JSON.parse(Buffer.from(saRes.content, 'base64').toString('utf8'));
        superAdmins = new Set(data);
      }
    } catch(e) { console.error('無法從 GitHub 讀取 superAdmins.json:', e.message); }

    try {
      console.log('從 GitHub 讀取 groupCodes.json...');
      const codesRes = await githubApiRequest('GET', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/groupCodes.json?ref=${GITHUB_BRANCH}`);
      if (codesRes.content) {
        codesSha = codesRes.sha;
        groupCodes = JSON.parse(Buffer.from(codesRes.content, 'base64').toString('utf8'));
      }
    } catch(e) { console.error('無法從 GitHub 讀取 groupCodes.json:', e.message); }

    try {
      console.log('從 GitHub 讀取 groupSettings.json...');
      const settingsRes = await githubApiRequest('GET', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/groupSettings.json?ref=${GITHUB_BRANCH}`);
      if (settingsRes.content) {
        settingsSha = settingsRes.sha;
        groupSettings = JSON.parse(Buffer.from(settingsRes.content, 'base64').toString('utf8'));
      }
    } catch(e) { console.error('無法從 GitHub 讀取 groupSettings.json:', e.message); }

    try {
      console.log('從 GitHub 讀取 rosterTemplates.json...');
      const templatesRes = await githubApiRequest('GET', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/rosterTemplates.json?ref=${GITHUB_BRANCH}`);
      if (templatesRes.content) {
        templatesSha = templatesRes.sha;
        rosterTemplates = JSON.parse(Buffer.from(templatesRes.content, 'base64').toString('utf8'));
      }
    } catch(e) { console.error('無法從 GitHub 讀取 rosterTemplates.json:', e.message); }

    try {
      console.log('從 GitHub 讀取 games.json...');
      const gamesRes = await githubApiRequest('GET', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/games.json?ref=${GITHUB_BRANCH}`);
      if (gamesRes.content) {
        gamesSha = gamesRes.sha;
        const rawStr = Buffer.from(gamesRes.content, 'base64').toString('utf8');
        const parsedGames = JSON.parse(rawStr);
        // 直接合併進全域 games 物件，loadGames() 後續會做結構正規化
        for (const [k, v] of Object.entries(parsedGames)) {
          if (typeof v === 'string') {
            try { games[k] = JSON.parse(v); } catch(e) { games[k] = v; }
          } else {
            games[k] = v;
          }
        }
        console.log(`已從 GitHub 載入 ${Object.keys(parsedGames).length} 筆場次資料`);
      }
    } catch(e) { console.error('無法從 GitHub 讀取 games.json:', e.message); }

    try {
      console.log('從 GitHub 讀取 lobbyVisits.json...');
      const visitsRes = await githubApiRequest('GET', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/lobbyVisits.json?ref=${GITHUB_BRANCH}`);
      if (visitsRes.content) {
        visitsSha = visitsRes.sha;
        lobbyVisits = JSON.parse(Buffer.from(visitsRes.content, 'base64').toString('utf8'));
      }
    } catch(e) { console.error('無法從 GitHub 讀取 lobbyVisits.json:', e.message); }

    try {
      console.log('從 GitHub 讀取 easterEggSettings.json...');
      const eeRes = await githubApiRequest('GET', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/easterEggSettings.json?ref=${GITHUB_BRANCH}`);
      if (eeRes.content) {
        easterEggSha = eeRes.sha;
        easterEggSettings = JSON.parse(Buffer.from(eeRes.content, 'base64').toString('utf8'));
        if (!easterEggSettings.activeGame) easterEggSettings.activeGame = 'piggy_run';
        if (!easterEggSettings.bulletHellLeaderboard) easterEggSettings.bulletHellLeaderboard = [];
      }
    } catch(e) { console.error('無法從 GitHub 讀取 easterEggSettings.json:', e.message); }
  }
}

async function saveAdmins() {
  const data = {};
  for (const [g, admins] of Object.entries(groupAdmins)) {
    data[g] = Array.from(admins);
  }
  const jsonStr = JSON.stringify(data, null, 2);
  await fs.promises.writeFile(ADMINS_FILE, jsonStr, 'utf8');
  
  if (USE_GITHUB) {
    try {
      const encodedContent = Buffer.from(jsonStr, 'utf8').toString('base64');
      const payload = {
        message: 'chore: update groupAdmins',
        content: encodedContent,
        branch: GITHUB_BRANCH
      };
      if (adminsSha) payload.sha = adminsSha;
      const res = await githubApiRequest('PUT', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/groupAdmins.json`, payload);
      if (res.content && res.content.sha) adminsSha = res.content.sha;
    } catch(e) { console.error('備份 groupAdmins 至 GitHub 失敗:', e.message); }
  }
}

async function saveSuperAdmins() {
  const data = Array.from(superAdmins);
  const jsonStr = JSON.stringify(data, null, 2);
  await fs.promises.writeFile(SUPER_ADMINS_FILE, jsonStr, 'utf8');
  
  if (USE_GITHUB) {
    try {
      const encodedContent = Buffer.from(jsonStr, 'utf8').toString('base64');
      const payload = {
        message: 'chore: update superAdmins',
        content: encodedContent,
        branch: GITHUB_BRANCH
      };
      if (superAdminsSha) payload.sha = superAdminsSha;
      const res = await githubApiRequest('PUT', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/superAdmins.json`, payload);
      if (res.content && res.content.sha) superAdminsSha = res.content.sha;
    } catch(e) { console.error('備份 superAdmins 至 GitHub 失敗:', e.message); }
  }
}

async function saveGroupCodes() {
  const jsonStr = JSON.stringify(groupCodes, null, 2);
  await fs.promises.writeFile(GROUP_CODES_FILE, jsonStr, 'utf8');
  
  if (USE_GITHUB) {
    try {
      const encodedContent = Buffer.from(jsonStr, 'utf8').toString('base64');
      const payload = {
        message: 'chore: update groupCodes',
        content: encodedContent,
        branch: GITHUB_BRANCH
      };
      if (codesSha) payload.sha = codesSha;
      const res = await githubApiRequest('PUT', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/groupCodes.json`, payload);
      if (res.content && res.content.sha) codesSha = res.content.sha;
    } catch(e) { console.error('備份 groupCodes 至 GitHub 失敗:', e.message); }
  }
}

async function saveGroupSettings() {
  const jsonStr = JSON.stringify(groupSettings, null, 2);
  await fs.promises.writeFile(GROUP_SETTINGS_FILE, jsonStr, 'utf8');
  
  if (USE_GITHUB) {
    try {
      const encodedContent = Buffer.from(jsonStr, 'utf8').toString('base64');
      const payload = {
        message: 'chore: update groupSettings',
        content: encodedContent,
        branch: GITHUB_BRANCH
      };
      if (settingsSha) payload.sha = settingsSha;
      const res = await githubApiRequest('PUT', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/groupSettings.json`, payload);
      if (res.content && res.content.sha) settingsSha = res.content.sha;
    } catch(e) { console.error('備份 groupSettings 至 GitHub 失敗:', e.message); }
  }
}

async function saveRosterTemplates() {
  const jsonStr = JSON.stringify(rosterTemplates, null, 2);
  await fs.promises.writeFile(ROSTER_TEMPLATES_FILE, jsonStr, 'utf8');
  
  if (USE_GITHUB) {
    try {
      const encodedContent = Buffer.from(jsonStr, 'utf8').toString('base64');
      const payload = {
        message: 'chore: update rosterTemplates',
        content: encodedContent,
        branch: GITHUB_BRANCH
      };
      if (templatesSha) payload.sha = templatesSha;
      const res = await githubApiRequest('PUT', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/rosterTemplates.json`, payload);
      if (res.content && res.content.sha) templatesSha = res.content.sha;
    } catch(e) { console.error('備份 rosterTemplates 至 GitHub 失敗:', e.message); }
  }
}

async function saveLobbyVisits() {
  const jsonStr = JSON.stringify(lobbyVisits, null, 2);
  await fs.promises.writeFile(LOBBY_VISITS_FILE, jsonStr, 'utf8');
  if (USE_GITHUB) {
    try {
      const encodedContent = Buffer.from(jsonStr, 'utf8').toString('base64');
      const payload = {
        message: 'chore: update lobbyVisits',
        content: encodedContent,
        branch: GITHUB_BRANCH
      };
      if (visitsSha) payload.sha = visitsSha;
      const res = await githubApiRequest('PUT', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/lobbyVisits.json`, payload);
      if (res.content && res.content.sha) visitsSha = res.content.sha;
    } catch(e) { console.error('備份 lobbyVisits 至 GitHub 失敗:', e.message); }
  }
}

async function saveEasterEggSettings() {
  const jsonStr = JSON.stringify(easterEggSettings, null, 2);
  await fs.promises.writeFile(EASTER_EGG_FILE, jsonStr, 'utf8');
  if (USE_GITHUB) {
    try {
      const encodedContent = Buffer.from(jsonStr, 'utf8').toString('base64');
      const payload = {
        message: 'chore: update easterEggSettings',
        content: encodedContent,
        branch: GITHUB_BRANCH
      };
      if (easterEggSha) payload.sha = easterEggSha;
      const res = await githubApiRequest('PUT', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/easterEggSettings.json`, payload);
      if (res.content && res.content.sha) easterEggSha = res.content.sha;
    } catch(e) { console.error('備份 easterEggSettings 至 GitHub 失敗:', e.message); }
  }
}

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
        regCsvContent = 'gid,sectionIdx,name,limit,backupLimit,title\n';
      }
    }
  } else {
    // 本地檔案模式
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    const exists = fs.existsSync(REG_CSV_FILE);
    if (!exists) {
      const header = 'gid,sectionIdx,name,limit,backupLimit,title\n';
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
  
  // 建立 CSV 內容：只記錄當前名單中的每個人（所有場次）
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

  const csvContent = 'gid,sectionIdx,name,limit,backupLimit,title,gameId\n' + (rows.length > 0 ? rows.join('\n') + '\n' : '');
  
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
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || 'fake_token',
  channelSecret: process.env.LINE_CHANNEL_SECRET || 'fake_secret'
};

if (!process.env.LINE_CHANNEL_ACCESS_TOKEN || !process.env.LINE_CHANNEL_SECRET) {
  console.warn('⚠️ 警告：未設定 LINE 環境變數，本機將以假 Token 啟動（LINE Bot 訊息功能將失效，但網頁可正常測試）');
}

const client = new Client(config);
const app = express();
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, { cors: { origin: '*' } });
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res, path) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));
app.use(express.json());

// 全域存儲：支援多群組、多區段
let games = {};
let systemLogs = [];
const nameToUidMap = new Map();
// 從環境變數讀取管理員密碼，如果未設定則使用預設值（不建議）
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '鈞鈞是豬豬';

// 用戶名稱快取，減少 API 呼叫以節省額度
const userNameCache = new Map(); // key: "gid_uid", value: { name, timestamp }
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24小時快取過期時間

// UID 到名稱的映射（從名單中提取），用於快速匹配，減少 API 呼叫
const uidToNameMap = new Map(); // key: "gid_uid", value: name

// 追蹤首次使用指令的群組（用於顯示歡迎訊息，而非加入時推播）
const firstUseGroups = new Set(); // 記錄已經顯示過歡迎訊息的群組

// === 權限輔助函式 ===
let superAdminViewOverrides = {}; // uid -> 'user' | 'admin' | 'superadmin'

function isTrueSuperAdmin(uid) {
  if (!uid) return false;
  if (uid.startsWith('U_SUPER_ADMIN_TEST_ID')) return true;
  let isEnvAdmin = false;
  if (process.env.SUPER_ADMIN_USER_ID) {
    const envAdmins = process.env.SUPER_ADMIN_USER_ID.split(',').map(id => id.trim());
    isEnvAdmin = envAdmins.includes(uid);
  }
  return isEnvAdmin || (superAdmins && superAdmins.has(uid));
}

function isSuperAdmin(uid) {
  if (!isTrueSuperAdmin(uid)) return false;
  if (superAdminViewOverrides[uid]) {
    return superAdminViewOverrides[uid].mode === 'superadmin';
  }
  return true;
}

function isGroupAdmin(uid, gid) {
  if (isTrueSuperAdmin(uid)) {
    const override = superAdminViewOverrides[uid];
    if (override) {
      if (override.mode === 'user') return false;
      if (override.mode === 'admin') {
        if (override.targetGid) return gid === override.targetGid;
        return true;
      }
      if (override.mode === 'superadmin') return true;
    }
    return true; // default
  }
  if (uid && uid.startsWith('U_GROUP_ADMIN_TEST_ID')) return true;
  return !!(groupAdmins[gid] && groupAdmins[gid].has(uid));
}

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

async function initializeApp() {
  console.log('🔄 啟動中：正在自 GitHub 載入系統設定與備份資料...');
  await loadData();
  
  console.log('🔄 啟動中：正在載入本地/本地緩存場次...');
  if (pool) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS games (
          gid TEXT PRIMARY KEY,
          data JSONB
        );
      `);
      await loadGames();
    } catch(err) {
      console.log('ℹ️  資料庫連線失敗，已切換到檔案模式');
      pool = null;
      await loadGames();
    }
  } else {
    await loadGames();
  }

  if (USE_GITHUB) {
    try {
      await loadCsvFromGitHub();
    } catch (err) {
      console.error('⚠️  載入 GitHub CSV 失敗（將繼續使用本地模式）:', err.message);
    }
  }
}

const loadPromise = initializeApp();

function deeplyParseJson(val) {
  if (typeof val === 'string') {
    try {
      return deeplyParseJson(JSON.parse(val));
    } catch(e) {
      return val;
    }
  }
  if (Array.isArray(val)) {
    return val.map(deeplyParseJson);
  }
  if (val !== null && typeof val === 'object') {
    const res = {};
    for (const [k, v] of Object.entries(val)) {
      res[k] = deeplyParseJson(v);
    }
    return res;
  }
  return val;
}

async function loadGames() {
  try {
    if (pool) {
      const res = await pool.query('SELECT gid, data FROM games');
      res.rows.forEach(row => {
        games[row.gid] = deeplyParseJson(row.data);
      });
      console.log(`已從資料庫載入 ${res.rowCount} 筆接龍資料`);
    } else {
      // 如果已從 GitHub 載入資料，就不從本地檔案覆蓋
      const alreadyLoadedFromGithub = USE_GITHUB && Object.keys(games).length > 0;
      if (!alreadyLoadedFromGithub && fs.existsSync(GAMES_FILE)) {
        try {
          const content = fs.readFileSync(GAMES_FILE, 'utf8') || '{}';
          const obj = JSON.parse(content);
          games = obj || {};
          console.log(`已從 ${GAMES_FILE} 載入 ${Object.keys(games).length} 筆接龍資料`);
        } catch (e) {
          console.error('從檔案載入接龍資料失敗:', e);
        }
      } else if (alreadyLoadedFromGithub) {
        console.log(`已從 GitHub 載入場次資料，跳過本地檔案讀取`);
      }
    }

    const newGames = {};
    const oldKeysToDelete = [];
    for (const [key, val] of Object.entries(games)) {
      if (Array.isArray(val)) {
        val.forEach(g => {
          const id = g.gameId || Date.now().toString() + Math.floor(Math.random()*1000);
          g.gameId = id;
          if(!g.gid) g.gid = key;
          newGames[id] = g;
        });
        oldKeysToDelete.push(key);
      } else if (!val.gameId) {
        val.gid = key;
        val.gameId = Date.now().toString() + Math.floor(Math.random()*1000);
        newGames[val.gameId] = val;
        oldKeysToDelete.push(key);
      } else {
        newGames[key] = val;
      }
    }
    games = newGames;

    if (oldKeysToDelete.length > 0) {
      console.log('執行資料庫遷移：刪除舊結構並儲存新結構...');
      if (pool) {
        for (const k of oldKeysToDelete) {
          try {
            await pool.query('DELETE FROM games WHERE gid = $1', [k]);
          } catch(e) {}
        }
      }
      for (const [id, g] of Object.entries(games)) {
        await saveGame(id);
      }
      if (!pool) {
        scheduleFileSave();
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
  }

  // 同步儲存到 GitHub
  if (USE_GITHUB) {
    gamesSaveChain = gamesSaveChain.then(async () => {
      const jsonStr = JSON.stringify(games, null, 2);
      
      async function attemptSave(allowRetry) {
        try {
          const encodedContent = Buffer.from(jsonStr, 'utf8').toString('base64');
          const payload = {
            message: 'chore: update games data',
            content: encodedContent,
            branch: GITHUB_BRANCH
          };
          if (gamesSha) payload.sha = gamesSha;
          const res = await githubApiRequest('PUT', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/games.json`, payload);
          if (res.content && res.content.sha) gamesSha = res.content.sha;
          console.log('✅ 場次資料已同步儲存至 GitHub (data/games.json)');
        } catch(e) {
          const isShaConflict = String(e.message).includes('409') || String(e.message).includes('does not match');
          if (isShaConflict && allowRetry) {
            console.warn('⚠️ 偵測到 GitHub games.json SHA 衝突，重新取得最新 SHA 後重試');
            try {
              const getRes = await githubApiRequest('GET', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/games.json?ref=${GITHUB_BRANCH}`);
              if (getRes.sha) gamesSha = getRes.sha;
            } catch (getErr) {
              console.error('❌ 無法取得最新的 games.json SHA:', getErr.message);
            }
            await attemptSave(false);
          } else {
            console.error('❌ 儲存 games.json 至 GitHub 失敗:', e.message);
          }
        }
      }
      
      await attemptSave(true);
    });
  }
}

async function checkSchedules() {
  const now = Date.now();
  const gameIds = Object.keys(games);
  
  for (const gameId of gameIds) {
    const g = games[gameId];
    if (!g) continue;
    
    // 1. 處理預約發布 (scheduleTime)
    if (g.scheduleTime) {
      const sched = Number(g.scheduleTime);
      if (isNaN(sched)) {
        logToFile(`[WARN] Invalid scheduleTime for ${gameId}: ${g.scheduleTime}`);
        delete g.scheduleTime;
        await saveGame(gameId);
      } else if (sched <= now) {
        logToFile(`[TRIGGER] TRIGGER! Sending scheduled list for ${gameId}`);
        delete g.scheduleTime; // 移除設定避免重複觸發
        await saveGame(gameId);
        try { 
          await sendList(null, gameId, "⏰ 定時推播");
          logToFile(`[SUCCESS] Scheduled push sent for ${gameId}`);
        } catch (e) { 
          console.error('Failed to push scheduled list:', e);
          logToFile(`[ERROR] Failed to push scheduled list: ${e.message}`);
        }
      }
    }
    
    // 2. 處理溫馨提醒 (reminderTime)
    if (g.reminderTime) {
      const rem = Number(g.reminderTime);
      if (isNaN(rem)) {
        logToFile(`[WARN] Invalid reminderTime for ${gameId}: ${g.reminderTime}`);
        delete g.reminderTime;
        await saveGame(gameId);
      } else if (rem <= now) {
        logToFile(`[TRIGGER] TRIGGER! Sending reminder for ${gameId}`);
        delete g.reminderTime; // 移除設定避免重複觸發
        await saveGame(gameId);
        try {
          const pushTargets = g.targetGids || [g.gid];
          for (const targetGid of pushTargets) {
            try {
              // 因應要求，暫時關閉會消耗額度的推播功能
              // await client.pushMessage(targetGid, { type: 'text', text: `⏰ 溫馨提醒：【 ${g.title} 】 即將開始！\n請有報名的群友注意時間喔！` });
            } catch (e) {
              console.error(`Failed to push reminder to ${targetGid}:`, e);
            }
          }
          logToFile(`[SUCCESS] Reminder processed for ${gameId} (Push disabled)`);
        } catch (e) {
          console.error('Failed to send reminder:', e);
          logToFile(`[ERROR] Failed to send reminder: ${e.message}`);
        }
      }
    }
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

// 定時推播檢查 (已合併至上方 checkSchedules 實作中)
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

// LIFF 系統設定
app.get('/api/config', (req, res) => {
  res.json({ liffId: process.env.LIFF_ID || '' });
});

// 取得特定群組所有進行中的接龍
async function fetchGroupName(gid) {
  if (!gid || !gid.startsWith('C')) return null;
  try {
    const res = await fetch(`https://api.line.me/v2/bot/group/${gid}/summary`, {
      headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` }
    });
    if (res.ok) {
      const data = await res.json();
      return data.groupName;
    } else if (res.status === 404 || res.status === 400) {
      return "未知群組 (Bot已退出)";
    }
  } catch (e) {
    console.error('Failed to fetch group name:', e.message);
  }
  return null;
}

async function ensureGroupSettings(gid) {
  if (!groupSettings[gid]) groupSettings[gid] = {};
  if (!groupSettings[gid].groupName && gid.startsWith('C')) {
    const name = await fetchGroupName(gid);
    if (name) {
      groupSettings[gid].groupName = name;
      await saveGroupSettings();
    }
  }
}

app.get('/api/group/code/:code', async (req, res) => {
  const code = req.params.code;
  let foundGid = null;
  for (const [k, v] of Object.entries(groupCodes)) {
    if (k === code) {
      foundGid = v;
      break;
    }
  }
  
  if (foundGid) {
    await ensureGroupSettings(foundGid);
    const gName = groupSettings[foundGid]?.groupName || foundGid;
    return res.json({ success: true, gid: foundGid, groupName: gName });
  } else {
    return res.status(404).json({ error: '找不到該群組代號' });
  }
});

// --- Server-Sent Events (SSE) 推播機制 ---
const sseClients = new Map(); // gid -> Set of Response objects

app.get('/api/events/:gid', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // 發送 X-Accel-Buffering 來關閉 Nginx 的緩衝
  res.setHeader('X-Accel-Buffering', 'no');
  
  // 避免連線過期，發送初始空註解，並加入 2KB 的 padding 強制推送緩衝區
  res.write(':' + Array(2048).join(' ') + '\n\n');
  if (res.flush) res.flush();

  const gid = req.params.gid;
  if (!sseClients.has(gid)) {
    sseClients.set(gid, new Set());
  }
  const clientsSet = sseClients.get(gid);
  clientsSet.add(res);

  // 每隔一段時間發送 ping 以保持連線
  const pingInterval = setInterval(() => {
    try { 
      res.write(':\n\n'); 
      if (res.flush) res.flush();
    } catch(e) {}
  }, 30000);

  req.on('close', () => {
    clearInterval(pingInterval);
    clientsSet.delete(res);
    if (clientsSet.size === 0) {
      sseClients.delete(gid);
    }
  });
});

function notifySSEClients(gameOrGid) {
  if (!gameOrGid) return;
  const gidsToNotify = new Set();
  if (typeof gameOrGid === 'string') {
    gidsToNotify.add(gameOrGid);
  } else {
    if (gameOrGid.gid) gidsToNotify.add(gameOrGid.gid);
    if (gameOrGid.targetGids && Array.isArray(gameOrGid.targetGids)) {
      gameOrGid.targetGids.forEach(g => gidsToNotify.add(g));
    }
  }
  
  for (const gid of gidsToNotify) {
    if (sseClients.has(gid)) {
      sseClients.get(gid).forEach(res => {
        try {
          res.write('data: refresh\n\n');
          if (res.flush) res.flush();
        } catch(e) {}
      });
    }
  }
}

// --- 團購專區 (Group Buy) API 端點 ---
app.get('/api/groupbuy/:gid', (req, res) => {
  const gid = req.params.gid;
  const info = getGroupBuyInfo(gid);
  res.json({ success: true, gid, data: info });
});

app.post('/api/groupbuy/:gid/toggle', async (req, res) => {
  const gid = req.params.gid;
  const { uid, active, hiddenFromLobby } = req.body || {};
  const info = getGroupBuyInfo(gid);
  
  if (typeof active === 'boolean') {
    info.active = active;
  } else if (hiddenFromLobby === undefined) {
    info.active = !info.active;
  }
  
  if (hiddenFromLobby !== undefined) {
    info.hiddenFromLobby = hiddenFromLobby;
  }
  
  await saveGroupBuyStorage();
  if (typeof io !== 'undefined' && io) io.emit('group_buy_state_updated', { gid, data: info });
  notifySSEClients(gid);
  res.json({ success: true, active: info.active });
});

app.post('/api/groupbuy/:gid/settings', async (req, res) => {
  const gid = req.params.gid;
  const { uid, title, notice, hiddenFromLobby, paymentSettings, items } = req.body || {};
  const isAdmin = isSuperAdmin(uid) || isGroupAdmin(uid, gid);
  if (!isAdmin) {
    return res.status(403).json({ error: '沒有管理員權限' });
  }
  const info = getGroupBuyInfo(gid);
  if (typeof title === 'string') info.title = title.trim();
  if (typeof notice === 'string') info.notice = notice.trim();
  if (hiddenFromLobby !== undefined) info.hiddenFromLobby = hiddenFromLobby;
  if (paymentSettings && typeof paymentSettings === 'object') {
    info.paymentSettings = { ...info.paymentSettings, ...paymentSettings };
  }
  if (Array.isArray(items)) {
    info.items = items;
  }
  await saveGroupBuyStorage();
  io.emit('group_buy_state_updated', { gid, data: info });
  notifySSEClients(gid);
  res.json({ success: true, data: info });
});

app.post('/api/groupbuy/:gid/order', async (req, res) => {
  const gid = req.params.gid;
  const { uid, userName, userPhone, userPictureUrl, items, paymentMethod, paymentNote, note, anonymous } = req.body || {};
  if (!uid || !userName) {
    return res.status(400).json({ error: '請提供必填資訊' });
  }
  const info = getGroupBuyInfo(gid);
  if (!info.active) {
    return res.status(400).json({ error: '目前團購未開放' });
  }
  let totalAmount = 0;
  if (items && typeof items === 'object') {
    for (const [itemId, qty] of Object.entries(items)) {
      const p = info.items.find(i => i.id === itemId);
      if (p && qty > 0) {
        totalAmount += (p.price || 0) * qty;
      }
    }
  }
  const orderKey = (userName && userPhone) ? `${userName.trim().toLowerCase()}_${userPhone.trim()}` : uid;
  const existingOrder = info.orders[orderKey] || {};
  info.orders[orderKey] = {
    userId: uid,
    userName: userName.trim(),
    userPhone: (userPhone || '').trim(),
    userPictureUrl: userPictureUrl || '',
    items: items || {},
    totalAmount,
    paymentMethod: paymentMethod || 'p2p_linepay',
    paymentStatus: 'unverified',
    orderStatus: 'unconfirmed',
    paymentNote: paymentNote || '',
    note: note || '',
    anonymous: !!anonymous,
    updatedAt: Date.now(),
    lastConfirmedItems: existingOrder.lastConfirmedItems
  };
  await saveGroupBuyStorage();
  io.emit('group_buy_state_updated', { gid, data: info });
  notifySSEClients(gid);
  res.json({ success: true, order: info.orders[orderKey] });
});

app.post('/api/groupbuy/:gid/mark_paid', async (req, res) => {
  const gid = req.params.gid;
  const { uid, targetUid, status } = req.body || {};
  const info = getGroupBuyInfo(gid);
  if (info.orders[targetUid]) {
    info.orders[targetUid].paymentStatus = status === 'paid' ? 'paid' : 'unverified';
    if (status === 'paid') {
      info.orders[targetUid].lastConfirmedItems = JSON.parse(JSON.stringify(info.orders[targetUid].items || {}));
    }
    await saveGroupBuyStorage();
    io.emit('group_buy_state_updated', { gid, data: info });
    notifySSEClients(gid);
  }
  res.json({ success: true });
});

app.post('/api/groupbuy/:gid/clear_orders', async (req, res) => {
  const gid = req.params.gid;
  const { uid } = req.body || {};
  const info = getGroupBuyInfo(gid);
  info.orders = {};
  await saveGroupBuyStorage();
  io.emit('group_buy_state_updated', { gid, data: info });
  notifySSEClients(gid);
  res.json({ success: true });
});

app.get('/api/game/:gid', async (req, res) => {
  const gid = req.params.gid;
  await ensureGroupSettings(gid);
  const lobbyTitle = groupSettings[gid]?.lobbyTitle || '羽球接龍大廳';
  const lobbyDesc = groupSettings[gid]?.lobbyDesc || '本週臨打名額有限，趕快搶位，跟著小豬一起快樂揮拍吧！';
  const uid = req.query.uid;
  const superAdmin = isSuperAdmin(uid);
  const isAdmin = superAdmin || isGroupAdmin(uid, gid);
  let managedGroups = [];
  if (isAdmin) {
    let adminGids = [];
    if (superAdmin) {
       // Super admin doesn't strictly need managed groups for simple display, 
       // but we'll show all groups they are explicitly in groupAdmins for, 
       // or we could show all. Let's just show what they are explicitly admin of, plus the current gid.
       adminGids = Object.keys(groupAdmins).filter(g => groupAdmins[g].has(uid));
    } else {
       adminGids = Object.keys(groupAdmins).filter(g => groupAdmins[g].has(uid));
       const override = superAdminViewOverrides[uid];
       if (override && override.mode === 'admin' && override.targetGid) {
           if (!adminGids.includes(override.targetGid)) {
               adminGids.push(override.targetGid);
           }
       }
    }
    for (const g of adminGids) {
      const codes = Object.keys(groupCodes).filter(k => groupCodes[k] === g);
      if (codes.length > 0) {
        for (const c of codes) {
          await ensureGroupSettings(g);
          const gName = groupSettings[g]?.groupName || g;
          managedGroups.push({ gid: g, code: c, groupName: gName });
        }
      } else {
        await ensureGroupSettings(g);
        const gName = groupSettings[g]?.groupName || '未命名群組';
        managedGroups.push({ gid: g, code: g === gid ? '目前群組' : '無代碼', groupName: gName });
      }
    }
  }

  let groupGames = Object.values(games).filter(g => {
    if (!g.active) return false;
    if (g.isManualEnded && !isAdmin) return false;
    if (g.gid === gid) return true;
    if (g.targetGids && g.targetGids.includes(gid)) return true;
    
    // 超級管理員模式：如果在個人聊天室中，且是 SUPER_ADMIN，則顯示系統內「所有」活躍場次
    if (gid === uid && superAdmin) {
      return true;
    }
    
    // 如果管理員是從個人聊天室/直接網址進入 (gid === uid)，顯示所有他管理的群組的場次
    if (gid === uid) {
      // 檢查此場次是否屬於他管理的任何一個群組
      const isManaged = managedGroups.some(mg => 
        mg.gid === g.gid || (g.targetGids && g.targetGids.includes(mg.gid))
      );
      if (isManaged) return true;
    }
    
    return false;
  });
  console.log(`[API] Fetching games for gid: ${gid}, Found: ${groupGames.length}, Total games: ${Object.keys(games).length}`);


  if (groupGames.length === 0) {
      return res.json({ games: [], isAdmin: !!isAdmin, isSuperAdmin: !!superAdmin, managedGroups, lobbyTitle, lobbyDesc }); // 不報錯，回傳空陣列
  }
  
  // 深拷貝以避免污染記憶體中的 games 物件
  groupGames = JSON.parse(JSON.stringify(groupGames));
  
  // 若有提供 uid，附上該用戶報名的名單
  if (uid) {
    groupGames.forEach(g => {
      g.myRegisteredNames = g.sections[0].list.filter(name => {
        return nameToUidMap.get(`${g.gameId}_${name}`) === uid;
      });
    });
  }
  
  // 智慧排序：嘗試解析日期 (如 7/3, 10/1)，越早的排上面。若無日期則依建立時間排序
  const parseDateStr = (dateStr) => {
    if (!dateStr) return Number.MAX_SAFE_INTEGER;
    const match = dateStr.match(/(\d{1,2})\/(\d{1,2})/);
    if (match) {
      const month = parseInt(match[1], 10);
      const day = parseInt(match[2], 10);
      return month * 100 + day;
    }
    return Number.MAX_SAFE_INTEGER;
  };

  groupGames.sort((a, b) => {
    const dateA = parseDateStr(a.date);
    const dateB = parseDateStr(b.date);
    if (dateA !== dateB) {
      return dateA - dateB; // 日期早的排前面
    }
    // 如果日期相同，或者都沒寫日期，則依建立時間排序 (舊的在前面或新的在前面，預設為新的在前面)
    return b.startTime - a.startTime;
  });
  
  // 回傳結果
  res.json({ games: groupGames, isAdmin: !!isAdmin, isSuperAdmin: !!superAdmin, managedGroups, lobbyTitle, lobbyDesc });
});

// 取得特定群組的預設名單範本
// 大廳點擊紀錄與分析
app.post('/api/lobby_visit', express.json(), (req, res) => {
  const { gid, userId, displayName, pictureUrl } = req.body;
  if (!gid || !userId) return res.json({ success: false });

  if (!lobbyVisits[gid]) {
    lobbyVisits[gid] = { viewCount: 0, uniqueViewers: {}, logs: [] };
  }
  
  const groupStats = lobbyVisits[gid];
  if (!groupStats.uniqueViewers) groupStats.uniqueViewers = {};
  if (!groupStats.logs) groupStats.logs = [];

  if (!groupStats.uniqueViewers[userId]) {
    groupStats.uniqueViewers[userId] = { displayName, firstVisit: Date.now(), count: 0, lastVisit: 0 };
  }

  // 每分鐘只記錄一次
  const now = Date.now();
  if (now - groupStats.uniqueViewers[userId].lastVisit < 60000) {
    return res.json({ success: true, message: 'Throttled' });
  }

  groupStats.viewCount = (groupStats.viewCount || 0) + 1;
  
  groupStats.uniqueViewers[userId].displayName = displayName; // update latest name
  groupStats.uniqueViewers[userId].lastVisit = now;
  groupStats.uniqueViewers[userId].count++;

  // 記錄最近的造訪
  groupStats.logs.unshift({ time: now, userId, displayName, pictureUrl });
  
  // 保留最近 200 筆即可，避免無限制長大
  if (groupStats.logs.length > 200) {
    groupStats.logs = groupStats.logs.slice(0, 200);
  }
  
  res.json({ success: true });
});

app.get('/api/lobby_stats/:gid', (req, res) => {
  const gid = req.params.gid;
  const uid = req.query.uid;
  
  // 驗證是否為超級管理員
  const isAdmin = uid && isSuperAdmin(uid);
  if (!isAdmin) {
    return res.status(403).json({ error: '只有超級管理員能查看大廳分析數據' });
  }
  
  const stats = lobbyVisits[gid] || { viewCount: 0, uniqueViewers: {}, logs: [] };
  const sortedLogs = [...(stats.logs || [])].sort((a, b) => b.time - a.time);
  res.json({ success: true, stats: {
    viewCount: stats.viewCount || 0,
    uniqueViewersCount: Object.keys(stats.uniqueViewers || {}).length,
    recentVisits: sortedLogs.slice(0, 50)
  }});
});

app.get('/api/admin/all_stats', async (req, res) => {
  const uid = req.query.uid;
  if (!uid) return res.status(403).json({ error: '需要 uid' });

  const isSuperAdminUser = isSuperAdmin(uid);
  let adminGids = [];

  if (isSuperAdminUser) {
    adminGids = Object.keys(lobbyVisits);
  } else {
    // 即使是 groupAdmins 也無法使用此 API，直接阻擋
    return res.status(403).json({ error: '只有超級管理員能查看全域數據分析' });
  }

  let allStats = [];
  let totalViews = 0;
  let totalTodayViews = 0;
  let globalUniqueViewers = new Set();
  let todayUniqueViewers = new Set();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartTime = todayStart.getTime();

  for (const g of adminGids) {
    await ensureGroupSettings(g);
    const gName = groupSettings[g]?.groupName || groupSettings[g]?.lobbyTitle || g;
    const stats = lobbyVisits[g] || { viewCount: 0, uniqueViewers: {}, logs: [] };
    
    const uniqueViewers = stats.uniqueViewers || {};
    const uniqueCount = Object.keys(uniqueViewers).length;
    
    totalViews += (stats.viewCount || 0);
    for (const [uid, uData] of Object.entries(uniqueViewers)) {
      globalUniqueViewers.add(uid);
      if (uData.lastVisit && uData.lastVisit >= todayStartTime) {
        todayUniqueViewers.add(uid);
      }
    }
    
    // Sort logs by time descending (newest first)
    const logs = stats.logs || [];
    const sortedLogs = [...logs].sort((a, b) => b.time - a.time);

    // Compute Daily Stats (Last 7 days or so, based on logs)
    const dailyMap = {};
    for (const log of logs) {
      if (log.time >= todayStartTime) {
        totalTodayViews++;
      }
      // Create local date string (YYYY/MM/DD)
      const d = new Date(log.time);
      const dateStr = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
      if (!dailyMap[dateStr]) {
        dailyMap[dateStr] = { date: dateStr, uniqueUsers: new Set(), viewCount: 0 };
      }
      dailyMap[dateStr].viewCount++;
      dailyMap[dateStr].uniqueUsers.add(log.userId);
    }
    
    const dailyStats = Object.values(dailyMap).map(d => ({
      date: d.date,
      viewCount: d.viewCount,
      uniqueCount: d.uniqueUsers.size
    })).sort((a, b) => b.date.localeCompare(a.date));

    allStats.push({
      gid: g,
      groupName: gName,
      viewCount: stats.viewCount || 0,
      uniqueCount: uniqueCount,
      dailyStats: dailyStats,
      recentVisits: sortedLogs.slice(0, 50)
    });
  }

  res.json({ 
    success: true, 
    allStats, 
    totalViews, 
    totalUniqueCount: globalUniqueViewers.size,
    todayViews: totalTodayViews,
    todayUniqueCount: todayUniqueViewers.size
  });
});

app.get('/api/templates/:gid', (req, res) => {
  const gid = req.params.gid;
  const templates = rosterTemplates[gid] || {};
  res.json({ success: true, templates });
});

// 儲存/刪除特定群組的預設名單範本
app.post('/api/templates/:gid', express.json(), async (req, res) => {
  const gid = req.params.gid;
  const { action, name, content, uid } = req.body;
  
  const isAdmin = uid && Object.values(groupAdmins).some(admins => admins.has(uid));
  if (!isAdmin) {
    return res.status(403).json({ error: '只有管理員能修改預設名單' });
  }
  
  if (!rosterTemplates[gid]) rosterTemplates[gid] = {};
  
  if (action === 'save') {
    if (!name || !content) {
      return res.status(400).json({ error: '名稱與內容不可為空' });
    }
    rosterTemplates[gid][name] = content;
  } else if (action === 'delete') {
    if (!name) {
      return res.status(400).json({ error: '未指定要刪除的範本名稱' });
    }
    delete rosterTemplates[gid][name];
  } else {
    return res.status(400).json({ error: '無效的 action' });
  }
  
  try {
    await saveRosterTemplates();
    res.json({ success: true, templates: rosterTemplates[gid] });
  } catch (e) {
    console.error('儲存範本失敗:', e);
    res.status(500).json({ error: '伺服器儲存錯誤' });
  }
});

// 產生完整名單字串的輔助函式
function generatePushMentionMessages(groupGames, targetGid, isMentionPush, nameToUidMap) {
const flexBubbles = [];
      for (const g of groupGames) {
          if (flexBubbles.length >= 12) break; // LINE Carousel maximum is 12 bubbles

          const section = g.sections && g.sections[0] ? g.sections[0] : { list: [], limit: 20 };
          const list = section.list || [];
          const limit = section.limit || 20;
          const backupLimit = section.backupLimit || 0;
          
          const isFull = limit > 0 && list.length >= limit;
          const statusText = isFull ? '滿團' : (limit > 0 ? `${list.length}/${limit}` : `${list.length}人`);

          // Date and location
          let infoLine = `🕒 ${g.date || ''} ${g.time || ''}`.trim();
          if (g.location) infoLine += `\n📍 ${g.location}`;

          // Format names for two columns
          const listBoxes = [];
          for (let i = 0; i < list.length && i < limit; i += 2) {
              const name1 = list[i] === '__ANON__' ? '匿名' : list[i];
              const name2 = (i + 1 < list.length && i + 1 < limit) ? (list[i+1] === '__ANON__' ? '匿名' : list[i+1]) : '';
              
              const formatName = (idx, name) => {
                  if (!name) return "";
                  const levelStr = (g.levelMap && g.levelMap[name]) ? ` (${g.levelMap[name]})` : '';
                  const paidStr = (g.paidMap && g.paidMap[name]) ? '💰' : '';
                  return `${idx+1}. ${name}${levelStr}${paidStr}`;
              };

              listBoxes.push({
                  type: "box",
                  layout: "horizontal",
                  paddingTop: "2px",
                  paddingBottom: "2px",
                  contents: [
                      { type: "text", text: formatName(i, name1), size: "xs", color: "#333333", flex: 1, wrap: false },
                      { type: "text", text: name2 ? formatName(i+1, name2) : " ", size: "xs", color: "#333333", flex: 1, wrap: false }
                  ]
              });
          }
          
          if (list.length < limit) {
              // Add an empty spot indicator for the next available spot
              listBoxes.push({
                  type: "box",
                  layout: "horizontal",
                  paddingTop: "2px",
                  paddingBottom: "2px",
                  contents: [
                      { type: "text", text: `${list.length + 1}. `, size: "xs", color: "#aaaaaa", flex: 1, wrap: false },
                      { type: "text", text: " ", size: "xs", color: "#333333", flex: 1, wrap: false }
                  ]
              });
          }

          const bodyContents = [
              { type: "text", text: infoLine, size: "xs", color: "#666666", wrap: true },
              {
                type: "box",
                layout: "horizontal",
                margin: "md",
                contents: [
                  { type: "text", text: "📝 報名狀況", size: "sm", color: "#1DB446", weight: "bold", flex: 1 },
                  {
                    type: "box",
                    layout: "horizontal",
                    flex: 0,
                    height: "22px",
                    width: isFull ? "36px" : "48px",
                    cornerRadius: "sm",
                    backgroundColor: isFull ? "#ffebee" : "#e8f5e9",
                    justifyContent: "center",
                    alignItems: "center",
                    contents: [
                      { type: "text", text: statusText, size: "xxs", color: isFull ? "#ff4c4c" : "#1DB446", align: "center", weight: "bold" }
                    ]
                  }
                ]
              },
              { type: "separator", margin: "sm", color: "#eeeeee" },
              {
                type: "box",
                layout: "vertical",
                margin: "md",
                contents: listBoxes
              }
          ];

          // Backups
          if (list.length > limit) {
              bodyContents.push({ type: "separator", margin: "md", color: "#eeeeee" });
              bodyContents.push({
                  type: "box",
                  layout: "horizontal",
                  margin: "md",
                  contents: [
                    { type: "text", text: "⌛ 候補名單", size: "sm", color: "#FF9800", weight: "bold", flex: 1 }
                  ]
              });
              
              const backupBoxes = [];
              let backupCount = 0;
              for (let i = limit; i < list.length; i += 2) {
                  const name1 = list[i] === '__ANON__' ? '匿名' : list[i];
                  const name2 = (i + 1 < list.length) ? (list[i+1] === '__ANON__' ? '匿名' : list[i+1]) : '';
                  
                  const formatBackup = (idx, name, bc) => {
                      if (!name) return "";
                      const levelStr = (g.levelMap && g.levelMap[name]) ? ` (${g.levelMap[name]})` : '';
                      const paidStr = (g.paidMap && g.paidMap[name]) ? '💰' : '';
                      return `補${bc+1}. ${name}${levelStr}${paidStr}`;
                  };

                  backupBoxes.push({
                      type: "box",
                      layout: "horizontal",
                      paddingTop: "2px",
                      paddingBottom: "2px",
                      contents: [
                          { type: "text", text: formatBackup(i, name1, backupCount), size: "xs", color: "#555555", flex: 1, wrap: false },
                          { type: "text", text: name2 ? formatBackup(i+1, name2, backupCount+1) : " ", size: "xs", color: "#555555", flex: 1, wrap: false }
                      ]
                  });
                  backupCount += name2 ? 2 : 1;
              }
              bodyContents.push({
                  type: "box",
                  layout: "vertical",
                  margin: "sm",
                  contents: backupBoxes
              });
          }

          const liffMainUrl = process.env.LIFF_ID ? `https://liff.line.me/${process.env.LIFF_ID}?gid=${targetGid}` : null;
          const liffGameUrl = process.env.LIFF_ID ? `${liffMainUrl}&gameId=${g.gameId}` : null;

          const bubble = {
              type: "bubble",
              size: "mega",
              header: {
                  type: "box",
                  layout: "vertical",
                  paddingBottom: "none",
                  contents: [
                      { type: "text", text: `🏸 ${g.title}`, weight: "bold", size: "md", color: "#1DB446", wrap: true }
                  ]
              },
              body: {
                  type: "box",
                  layout: "vertical",
                  paddingAll: "16px",
                  contents: bodyContents
              }
          };

          if (liffMainUrl && liffGameUrl) {
              bubble.footer = {
                  type: "box",
                  layout: "horizontal",
                  spacing: "sm",
                  contents: [
                      {
                          type: "button",
                          style: "primary",
                          color: "#1DB446",
                          height: "sm",
                          flex: 1,
                          action: { type: "uri", label: "本次報名", uri: liffGameUrl }
                      },
                      {
                          type: "button",
                          style: "secondary",
                          color: "#eeeeee",
                          height: "sm",
                          flex: 1,
                          action: { type: "uri", label: "大廳首頁", uri: liffMainUrl }
                      }
                  ]
              };
          }

          flexBubbles.push(bubble);
      }

      const carouselMsg = {
          type: "flex",
          altText: "接龍名單",
          contents: {
              type: "carousel",
              contents: flexBubbles
          }
      };

      const messagesToSend = [carouselMsg];
      
      if (isMentionPush) {
          const uidsToMention = new Set();
          for (const g of groupGames) {
              const section = g.sections && g.sections[0] ? g.sections[0] : { list: [] };
              const list = section.list || [];
              for (const name of list) {
                  if (name !== '__ANON__') {
                      let uid = nameToUidMap.get(`${g.gameId}_${name}`);
                      if (!uid) {
                          uid = nameToUidMap.get(`${targetGid}_${name}`);
                      }
                      if (uid) {
                          uidsToMention.add(uid);
                      }
                  }
              }
          }

          const uidArray = Array.from(uidsToMention);
          if (uidArray.length > 0) {
              // LINE API text message allows max 50 mentions, and pushMessage max 5 messages.
              // We'll limit to 4 mention messages to ensure total messages (1 carousel + 4 texts) <= 5.
              for (let i = 0; i < uidArray.length && i < 200; i += 50) {
                  const chunk = uidArray.slice(i, i + 50);
                  let textMsg = "報名成功提醒：\n"; // 移除 Emoji 避免 index 計算錯誤
                  const mentionees = [];
                  
                  for (let j = 0; j < chunk.length; j++) {
                      const uid = chunk[j];
                      const placeholder = "@User";
                      mentionees.push({
                          index: textMsg.length,
                          length: placeholder.length,
                          userId: uid
                      });
                      textMsg += placeholder;
                      if (j < chunk.length - 1) {
                          textMsg += " ";
                      }
                  }
                  
                  messagesToSend.push({
                      type: "text",
                      text: textMsg,
                      mention: {
                          mentionees: mentionees
                      }
                  });
              }
          } else {
              messagesToSend.push({
                  type: "text",
                  text: "📢 報名成功提醒：\n目前尚未紀錄到任何可標記的報名者 UID。"
              });
          }
      }

      
    return messagesToSend;
}

function generateListMessage(g, customTitle = null) {
  let msg = `📢 ${customTitle || '名單更新通知'}\n\n🏸 ${g.title}\n`;
  if (g.date) msg += `📅 ${g.date}\n`;
  if (g.time) msg += `⏰ ${g.time}\n`;
  if (g.location) msg += `📍 ${g.location}\n`;
  
  g.sections.forEach(sec => {
    msg += `\n【${sec.title}】 (目前 ${sec.list.length} / ${sec.limit} 人)\n`;
    const limit = sec.limit;
    const count = Math.min(sec.list.length, limit);
    for (let i = 0; i < count; i++) {
      const n = sec.list[i];
      const name = n === '__ANON__' ? '***' : n;
      const level = g.levelMap && g.levelMap[n] ? `(${g.levelMap[n]})` : '';
      const noteStr = g.noteMap && g.noteMap[n] ? ` [${g.noteMap[n]}]` : '';
      const paidStr = g.paidMap && g.paidMap[n] ? ' (已繳費)' : '';
      msg += `${i+1}. ${name} ${level}${noteStr}${paidStr}\n`.trim() + '\n';
    }
    
    // 如果未滿額，顯示最後一個空席位的號碼（依據使用者要求）
    if (sec.list.length < limit) {
      msg += `${limit}. \n`;
    }
    
    if (sec.list.length > limit) {
      msg += `\n【候補名單】\n`;
      for (let i = sec.limit; i < sec.list.length; i++) {
        const n = sec.list[i];
        const name = n === '__ANON__' ? '***' : n;
        const level = g.levelMap && g.levelMap[n] ? `(${g.levelMap[n]})` : '';
        const noteStr = g.noteMap && g.noteMap[n] ? ` [${g.noteMap[n]}]` : '';
        const paidStr = g.paidMap && g.paidMap[n] ? ' (已繳費)' : '';
        msg += `候${i - sec.limit + 1}. ${name} ${level}${noteStr}${paidStr}\n`.trim() + '\n';
      }
    }
  });
  return msg;
}


function handlePinballFinish(name) {
  if (pinballRoom.status === 'playing' && !pinballRoom.finished.includes(name)) {
    pinballRoom.finished.push(name);
    
    const rank = pinballRoom.finished.length;
    let points = 0;
    if (rank === 1) points = 7;
    else if (rank === 2) points = 5;
    else if (rank === 3) points = 3;
    else if (rank >= 4 && rank <= 10) points = 2;
    else if (rank >= 11 && rank <= 20) points = 1;
    
    if (!pinballRoom.scores) pinballRoom.scores = {};
    if (!pinballRoom.scores[name]) pinballRoom.scores[name] = 0;
    pinballRoom.scores[name] += points;

    // Safety Fallback: 60s after 1st place finishes (in case a ball is permanently stuck)
    if (rank === 1) {
      if (global.pinballEndTimer) clearTimeout(global.pinballEndTimer);
      global.pinballEndTimer = setTimeout(() => {
        if (pinballRoom.status === 'playing') {
          pinballRoom.status = 'finished';
          io.emit('pinball_state', pinballRoom);
        }
      }, 60000);
    }

    if (pinballRoom.finished.length >= pinballRoom.pool.length) {
      if (global.pinballEndTimer) clearTimeout(global.pinballEndTimer);
      pinballRoom.status = 'finished';
    }

    io.emit('pinball_state', pinballRoom);
  }
}

// Server sends ZERO position packets during race - pure deterministic local physics with shared seed (0 rubberbanding)

let pinballRoom = {
  status: 'idle', // idle, lobby, instruction, playing, finished
  round: 1,
  pool: [], // active players
  finished: [], // winners in order
  scores: {}, // point totals for tournament
  startTime: null,
  statusEndTime: null,
  colors: {},
  positions: {} // for server authoritative state
};

// --- 彩蛋功能 API ---
app.get('/api/easter_egg/status', (req, res) => {
  res.json({ enabled: easterEggSettings.enabled, activeGame: easterEggSettings.activeGame || 'piggy_run' });
});

app.post('/api/easter_egg/claim', express.json(), async (req, res) => {
  const { uid, name, timeTaken, survivalTime } = req.body;
  if (!uid) return res.status(400).json({ success: false, message: 'Missing uid' });
  
  if (!easterEggSettings.enabled) {
    return res.json({ success: false, message: '活動未開啟' });
  }

  // Handle bullet_hell score (Leaderboard)
  if (survivalTime !== undefined) {
    if (!easterEggSettings.bulletHellLeaderboard) easterEggSettings.bulletHellLeaderboard = [];
    const existingIndex = easterEggSettings.bulletHellLeaderboard.findIndex(w => w.uid === uid);
    if (existingIndex !== -1) {
      if (survivalTime > easterEggSettings.bulletHellLeaderboard[existingIndex].survivalTime) {
        easterEggSettings.bulletHellLeaderboard[existingIndex].survivalTime = survivalTime;
        if (name) easterEggSettings.bulletHellLeaderboard[existingIndex].name = name;
      }
    } else {
      easterEggSettings.bulletHellLeaderboard.push({ uid, name: name || 'Unknown', survivalTime });
    }
    easterEggSettings.bulletHellLeaderboard.sort((a, b) => b.survivalTime - a.survivalTime);
    saveEasterEggSettings();
    return res.json({ success: true, leaderboard: easterEggSettings.bulletHellLeaderboard });
  }

  // Handle piggy_run prize claim

  const newTime = typeof timeTaken === 'number' ? timeTaken : Infinity;

  // Check if user already exists
  const existingIndex = easterEggSettings.winners.findIndex(w => (w === uid || (w && w.uid === uid)));
  
  if (existingIndex !== -1) {
    const existing = easterEggSettings.winners[existingIndex];
    const oldTime = (typeof existing === 'object' && typeof existing.timeTaken === 'number') ? existing.timeTaken : Infinity;
    
    // Update if faster, or if they had no time before
    if (newTime < oldTime) {
      if (typeof existing === 'object') {
        existing.timeTaken = newTime;
        if (name) existing.name = name;
      } else {
        easterEggSettings.winners[existingIndex] = { uid, name: name || 'Unknown', timeTaken: newTime };
      }
      saveEasterEggSettings();
    }
  } else {
    // Register new winner
    easterEggSettings.winners.push({ uid, name: name || 'Unknown', timeTaken: newTime });
    saveEasterEggSettings();
  }

  // Sort winners by timeTaken ascending
  easterEggSettings.winners.sort((a, b) => {
    const tA = (typeof a === 'object' && typeof a.timeTaken === 'number') ? a.timeTaken : Infinity;
    const tB = (typeof b === 'object' && typeof b.timeTaken === 'number') ? b.timeTaken : Infinity;
    return tA - tB;
  });
  saveEasterEggSettings(); // Save sorted state just in case

  res.json({ 
    success: true, 
    message: easterEggSettings.message, 
    quota: easterEggSettings.quota,
    leaderboard: easterEggSettings.winners 
  });
});

app.get('/api/admin/easter_egg', (req, res) => {
  const uid = req.query.uid;
  if (!uid || !isSuperAdmin(uid)) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  res.json(easterEggSettings);
});

app.post('/api/admin/easter_egg', express.json(), async (req, res) => {
  const { uid, settings } = req.body;
  if (!uid || !isSuperAdmin(uid)) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  
  if (settings) {
    if (typeof settings.enabled === 'boolean') easterEggSettings.enabled = settings.enabled;
    if (typeof settings.message === 'string') easterEggSettings.message = settings.message;
    if (typeof settings.quota === 'number') easterEggSettings.quota = settings.quota;
    if (Array.isArray(settings.winners)) easterEggSettings.winners = settings.winners;
    if (typeof settings.activeGame === 'string') easterEggSettings.activeGame = settings.activeGame;
    if (Array.isArray(settings.bulletHellLeaderboard)) easterEggSettings.bulletHellLeaderboard = settings.bulletHellLeaderboard;
    
    saveEasterEggSettings();
  }
res.json({ success: true });
});
// ------------------

let globalRoom = {
  activeGame: null, // 'lottery' or 'survival'
  status: 'closed'
};

// --- Lottery Sphere Logic ---
let lotteryRoom = {
  status: 'idle', // idle, ready, drawing, ended
  pool: [], // array of names
  drawn: [], // array of drawn names in order
  assigneeUid: null, // uid of the person allowed to draw
  drawCount: 1 // how many to draw
};

// --- Multiplayer Party Game Logic ---
let partyRoom = {
  status: 'idle', // idle, lobby, playing, ended
  winCondition: { type: 'time', value: 15 },
  players: {}, // socket.id -> { uid, name, x, y, alive }
  startTime: 0
};

let partyTimeTimeout = null;
let partyBulletInterval = null;

function endPartyGame(winners) {
  partyRoom.status = 'ended';
  if (partyTimeTimeout) clearTimeout(partyTimeTimeout);
  if (partyBulletInterval) clearInterval(partyBulletInterval);
  
  if (!easterEggSettings.bulletHellLeaderboard) easterEggSettings.bulletHellLeaderboard = [];
  
  const elapsed = parseFloat(((Date.now() - partyRoom.startTime) / 1000).toFixed(2));
  
  winners.forEach(w => {
    const existing = easterEggSettings.bulletHellLeaderboard.find(x => x.uid === w.uid);
    if (existing) {
      if (elapsed > existing.survivalTime) {
        existing.survivalTime = elapsed;
        existing.name = w.name;
      }
    } else {
      easterEggSettings.bulletHellLeaderboard.push({ uid: w.uid, name: w.name, survivalTime: elapsed });
    }
  });
  
  easterEggSettings.bulletHellLeaderboard.sort((a, b) => b.survivalTime - a.survivalTime);
  saveEasterEggSettings();
  
  io.emit('party_ended', { winners, leaderboard: easterEggSettings.bulletHellLeaderboard, elapsed });
}

function checkWinCondition() {
  if (partyRoom.status !== 'playing') return;
  const alivePlayers = Object.values(partyRoom.players).filter(p => p.alive);
  
  if (partyRoom.winCondition.type === 'last_man_standing') {
    if (alivePlayers.length <= partyRoom.winCondition.value) {
      endPartyGame(alivePlayers);
    }
  } else if (partyRoom.winCondition.type === 'time') {
    if (alivePlayers.length === 0) {
      endPartyGame([]);
    }
  }
}

io.on('connection', (socket) => {
  // Send current states to newly connected client
  socket.emit('global_room_state', globalRoom);
  socket.emit('party_state', partyRoom);
  socket.emit('lottery_state', lotteryRoom);
  socket.emit('pinball_state', pinballRoom);

  socket.on('group_buy_get', ({ gid }) => {
    socket.emit('group_buy_state', { gid, data: getGroupBuyInfo(gid) });
  });

  socket.on('group_buy_toggle', async ({ gid, uid, active }) => {
    const isAdmin = isSuperAdmin(uid) || isGroupAdmin(uid, gid);
    if (!isAdmin) return;
    const info = getGroupBuyInfo(gid);
    info.active = typeof active === 'boolean' ? active : !info.active;
    await saveGroupBuyStorage();
    io.emit('group_buy_state_updated', { gid, data: info });
    notifySSEClients(gid);
  });

  
    socket.on('pinball_push_ball', (data) => {
      pinballPhysics.pushBall(data.name, data.dir);
    });
    socket.on('pinball_apply_force', (data) => {
      pinballPhysics.applyForce(data.name, data.fx, data.fy);
      socket.broadcast.emit('pinball_apply_force', data);
    });
    socket.on('pinball_ball_moved', (data) => {
      const { name, x, y } = data;
      if (name && typeof x === 'number' && typeof y === 'number') {
        if (!pinballRoom.positions) pinballRoom.positions = {};
        pinballRoom.positions[name] = { x, y };
        socket.broadcast.emit('pinball_ball_moved', { name, x, y });
      }
    });
    socket.on('pinball_move_ball', (data) => {
      const { name, x, y } = data;
      if (name && typeof x === 'number' && typeof y === 'number') {
        if (!pinballRoom.positions) pinballRoom.positions = {};
        pinballRoom.positions[name] = { x, y };
        socket.broadcast.emit('pinball_ball_moved', { name, x, y });
      }
    });
  socket.on('pinball_host_sync', (data) => {
    if (pinballRoom.hostSocketId && socket.id !== pinballRoom.hostSocketId) return;
    socket.broadcast.emit('pinball_host_sync', data);
  });

  socket.on('join_lottery', (data) => {
    if (lotteryRoom.status === 'lobby') {
      const { name } = data;
      if (name && !lotteryRoom.pool.includes(name)) {
        lotteryRoom.pool.push(name);
        io.emit('lottery_state', lotteryRoom);
      }
    }
  });

  socket.on('join_pinball_bulk', (data) => {
    if (pinballRoom.status === 'lobby') {
      const { names } = data;
      if (Array.isArray(names)) {
        let added = false;
        names.forEach(name => {
          if (name && !pinballRoom.pool.includes(name)) {
            pinballRoom.pool.push(name);
            added = true;
          }
        });
        if (added) io.emit('pinball_state', pinballRoom);
      }
    }
  });
  
  socket.on('join_pinball', (data) => {
    console.log('[DEBUG] join_pinball event received:', data, 'status:', pinballRoom.status);
    if (pinballRoom.status === 'lobby') {
      const { name } = data;
      if (name && !pinballRoom.pool.includes(name)) {
        console.log('[DEBUG] joining pinball pool:', name);
        pinballRoom.pool.push(name);
        io.emit('pinball_state', pinballRoom);
      } else {
        console.log('[DEBUG] failed to join pool. name:', name, 'already_in_pool:', pinballRoom.pool.includes(name));
      }
    }
  });

  socket.on('lottery_perform_draw', (data) => {
    if (lotteryRoom.status === 'ready' && lotteryRoom.assigneeUid === data.uid) {
      lotteryRoom.status = 'drawing';
      io.emit('lottery_draw_started', {
         force: data.force,
         dirX: data.dirX,
         dirY: data.dirY,
         count: lotteryRoom.drawCount
      });
    }
  });

  socket.on('lottery_result_computed', (data) => {
    if (lotteryRoom.status === 'drawing' && lotteryRoom.assigneeUid === data.uid) {
      if (Array.isArray(data.drawnNames)) {
        data.drawnNames.forEach(n => {
          if (!lotteryRoom.drawn.includes(n) && lotteryRoom.pool.includes(n)) {
            lotteryRoom.drawn.push(n);
          }
        });
      }
      // Stay in 'ready' so admin can assign again for sequential drawing
      lotteryRoom.status = 'ready';
      lotteryRoom.assigneeUid = null;
      io.emit('lottery_state', lotteryRoom);
    }
  });

  socket.on('join_party', (data) => {
    if (partyRoom.status === 'idle') return;
    const { uid, name, icon, x, y } = data;
    partyRoom.players[socket.id] = { uid, name, icon: icon || '🐷', x: x || -100, y: y || -100, alive: true, id: socket.id, lives: 3, invincibleUntil: 0 };
    socket.emit('party_state', partyRoom);
    socket.broadcast.emit('player_joined', partyRoom.players[socket.id]);
  });

  socket.on('request_party_state', () => {
    socket.emit('party_state', partyRoom);
  });

  socket.on('player_move', (data) => {
    if (partyRoom.players[socket.id] && partyRoom.players[socket.id].alive) {
      partyRoom.players[socket.id].x = data.x;
      partyRoom.players[socket.id].y = data.y;
      socket.broadcast.emit('player_moved', { id: socket.id, x: data.x, y: data.y });
    }
  });

  socket.on('player_hit', () => {
    const p = partyRoom.players[socket.id];
    if (partyRoom.status === 'playing' && p && p.alive) {
      if (Date.now() < p.invincibleUntil) return; // Invincible!
      
      p.lives--;
      if (p.lives <= 0) {
        p.alive = false;
        io.emit('player_died', { id: socket.id });
        checkWinCondition();
      } else {
        p.invincibleUntil = Date.now() + 2000; // 2 seconds i-frames after hit
        io.emit('player_damaged', { id: socket.id, lives: p.lives });
      }
    }
  });
  
  socket.on('player_collect', (data) => {
    const p = partyRoom.players[socket.id];
    if (partyRoom.status === 'playing' && p && p.alive) {
      if (data.type === 'heart') {
        if (p.lives < 3) p.lives++;
        io.emit('player_healed', { id: socket.id, lives: p.lives, itemId: data.itemId });
      } else if (data.type === 'star') {
        p.invincibleUntil = Date.now() + 5000; // 5 seconds invincibility
        io.emit('player_invincible', { id: socket.id, itemId: data.itemId });
      }
    }
  });

  socket.on('destroy_wall', (data) => {
    const p = partyRoom.players[socket.id];
    if (partyRoom.status === 'playing' && p && p.alive) {
      if (Date.now() < p.invincibleUntil) {
        io.emit('wall_destroyed', { wallId: data.wallId });
      }
    }
  });

  socket.on('disconnect', () => {
    if (partyRoom.players[socket.id]) {
      delete partyRoom.players[socket.id];
      io.emit('player_left', { id: socket.id });
      if (partyRoom.status === 'playing') checkWinCondition();
    }
  });
});

app.post('/api/admin/room/open', express.json(), (req, res) => {
  const { uid, gameType } = req.body;
  if (!uid || !isSuperAdmin(uid)) return res.status(403).json({ error: 'Permission denied' });
  
  globalRoom.status = 'open';
  globalRoom.activeGame = gameType; // 'lottery' | 'survival' | 'pinball'
  
  if (gameType === 'lottery') {
    lotteryRoom.status = 'lobby';
    lotteryRoom.pool = [];
    lotteryRoom.drawn = [];
    lotteryRoom.assigneeUid = null;
    lotteryRoom.drawCount = 1;
    
    partyRoom.status = 'idle';
    pinballRoom.status = 'idle';
  } else if (gameType === 'survival') {
    partyRoom.status = 'lobby';
    partyRoom.players = {};
    
    lotteryRoom.status = 'idle';
    pinballRoom.status = 'idle';
  } else if (gameType === 'pinball') {
    pinballRoom.status = 'lobby';
    pinballRoom.pool = [];
    pinballRoom.finished = [];
    pinballRoom.scores = {};
    
    lotteryRoom.status = 'idle';
    partyRoom.status = 'idle';
  }
  
  io.emit('global_room_state', globalRoom);
  io.emit('lottery_state', lotteryRoom);
  io.emit('party_state', partyRoom);
  io.emit('pinball_state', pinballRoom);
  
  res.json({ success: true, globalRoom });
});

app.post('/api/admin/room/close', express.json(), (req, res) => {
  const { uid } = req.body;
  if (!uid || !isSuperAdmin(uid)) return res.status(403).json({ error: 'Permission denied' });
  
  globalRoom.status = 'closed';
  globalRoom.activeGame = null;
  lotteryRoom.status = 'idle';
  partyRoom.status = 'idle';
  pinballRoom.status = 'idle';
  
  io.emit('global_room_state', globalRoom);
  io.emit('lottery_state', lotteryRoom);
  io.emit('party_state', partyRoom);
  io.emit('pinball_state', pinballRoom);
  
  res.json({ success: true });
});

app.post('/api/admin/party/start', express.json(), (req, res) => {
  const { uid, winCondition } = req.body;
  if (!uid || !isSuperAdmin(uid)) return res.status(403).json({ error: 'Permission denied' });
  
  partyRoom.winCondition = winCondition || { type: 'time', value: 15 };
  io.emit('party_state', partyRoom);
  res.json({ success: true, partyRoom });
});

// --- Pinball Endpoints ---
// Item select/place endpoints removed (feature disabled for now)

app.post('/api/admin/pinball/sync-pool', express.json(), (req, res) => {
  const { uid, pool } = req.body;
  if (!uid || !isSuperAdmin(uid)) return res.status(403).json({ error: 'Permission denied' });
  
  pinballRoom.pool = pool || [];
  io.emit('pinball_state', pinballRoom);
  res.json({ success: true, pinballRoom });
});

app.post('/api/pinball/set-color', express.json(), (req, res) => {
    const { name, color, style } = req.body;
    if (!name || !color) return res.status(400).json({ error: 'Missing name or color' });
    if (!pinballRoom.colors) pinballRoom.colors = {};
    if (!pinballRoom.styles) pinballRoom.styles = {};
    pinballRoom.colors[name] = color;
    if (style) pinballRoom.styles[name] = style;
    io.emit('pinball_state', pinballRoom);
    res.json({ success: true, color, style });
  });

app.post('/api/admin/pinball/add-player', express.json(), (req, res) => {
  const { uid, name } = req.body;
  if (!uid || !isSuperAdmin(uid)) return res.status(403).json({ error: 'Permission denied' });
  if (!name || name.trim() === '') return res.status(400).json({ error: 'Name cannot be empty' });
  
  if (!pinballRoom.pool.includes(name.trim())) {
    pinballRoom.pool.push(name.trim());
    if (pinballRoom.status === 'instruction' || pinballRoom.status === 'playing') {
      pinballPhysics.addBall(name.trim());
    }
    io.emit('pinball_state', pinballRoom);
  }
  res.json({ success: true, pinballRoom });
});

app.post('/api/admin/pinball/start-sequence', express.json(), (req, res) => {
  const { uid, winnerLimit, allowControls, socketId } = req.body;
  pinballRoom.allowControls = allowControls !== false;
  pinballRoom.hostSocketId = socketId || null;
  pinballRoom.hostUid = uid || null;

  if (!uid || !isSuperAdmin(uid)) return res.status(403).json({ error: 'Permission denied' });
  
  pinballRoom.winnerLimit = winnerLimit || 3;
  pinballRoom.finished = [];
  pinballRoom.seed = Math.floor(Math.random() * 1000000);
  pinballPhysics.initServerEngine(pinballRoom.pool, pinballRoom.seed, null);

  pinballRoom.status = 'instruction';
  pinballRoom.statusEndTime = Date.now() + 5000;
  io.emit('pinball_state', pinballRoom);
  
  setTimeout(() => {
    if (pinballRoom.status !== 'instruction') {
      pinballPhysics.stopEngine();
      return; 
    }
    pinballRoom.status = 'playing';
    pinballRoom.statusEndTime = null;
    pinballRoom.startTime = Date.now() + 5000;
    io.emit('pinball_state', pinballRoom);
    
    pinballPhysics.scatterBallsOnFive();
    
    setTimeout(() => {
      if (pinballRoom.status === 'playing') {
        pinballPhysics.startRace();
      }
    }, 5000);
  }, 5000);
  
  res.json({ success: true, pinballRoom });
});

app.post('/api/admin/pinball/stop', express.json(), (req, res) => {
  const { uid } = req.body;
  if (!uid || !isSuperAdmin(uid)) return res.status(403).json({ error: 'Permission denied' });
  
  pinballRoom.status = 'lobby';
  pinballRoom.hostSocketId = null;
  pinballPhysics.stopEngine();
  io.emit('pinball_state', pinballRoom);
  res.json({ success: true });
});

app.post('/api/admin/pinball/reset', express.json(), (req, res) => {
  const { uid } = req.body;
  if (!uid || !isSuperAdmin(uid)) return res.status(403).json({ error: 'Permission denied' });
  
  pinballRoom.status = 'lobby';
  pinballRoom.hostSocketId = null;
  pinballRoom.round = (pinballRoom.round || 1) + 1; // Increment round
  pinballRoom.seed = Math.floor(Math.random() * 1000000); // Generate new track
  pinballRoom.finished = [];
  
  pinballPhysics.stopEngine();
  io.emit('pinball_state', pinballRoom);
  res.json({ success: true });
});

app.post('/api/pinball/finish', express.json(), (req, res) => {
  const { name, socketId } = req.body;
  if (pinballRoom.hostSocketId && socketId && socketId !== pinballRoom.hostSocketId) {
    return res.json({ success: false, error: 'Not designated host' });
  }
  if (pinballRoom.status === 'playing' && !pinballRoom.finished.includes(name)) {
    pinballRoom.finished.push(name);
    
    // Calculate and assign points
    const rank = pinballRoom.finished.length;
    let points = 0;
    if (rank === 1) points = 7;
    else if (rank === 2) points = 5;
    else if (rank === 3) points = 3;
    else if (rank >= 4 && rank <= 10) points = 2;
    else if (rank >= 11 && rank <= 20) points = 1;
    
    if (!pinballRoom.scores) pinballRoom.scores = {};
    if (!pinballRoom.scores[name]) pinballRoom.scores[name] = 0;
    pinballRoom.scores[name] += points;

    // Safety Fallback: 60s after 1st place finishes (in case a ball is permanently stuck)
    if (rank === 1) {
      if (global.pinballEndTimer) clearTimeout(global.pinballEndTimer);
      global.pinballEndTimer = setTimeout(() => {
        if (pinballRoom.status === 'playing') {
          pinballRoom.status = 'finished';
          io.emit('pinball_state', pinballRoom);
        }
      }, 60000);
    }

    if (pinballRoom.finished.length >= pinballRoom.pool.length) {
      if (global.pinballEndTimer) clearTimeout(global.pinballEndTimer);
      pinballRoom.status = 'finished';
    }

    io.emit('pinball_state', pinballRoom);
  }
  res.json({ success: true });
});

app.post('/api/admin/pinball/next-round', express.json(), (req, res) => {
  const { uid } = req.body;
  if (!uid || !isSuperAdmin(uid)) return res.status(403).json({ error: 'Permission denied' });
  
  // Do NOT exclude winners. Keep pool intact for multi-round scoring.
  pinballRoom.status = 'lobby';
  pinballRoom.round = (pinballRoom.round || 1) + 1; // Increment round
  pinballRoom.seed = Math.floor(Math.random() * 1000000); // Generate new track
  pinballRoom.finished = [];
  
  io.emit('pinball_state', pinballRoom);
  res.json({ success: true });
});

// Admin bumps the table to unstick balls
app.post('/api/admin/pinball/shake', express.json(), (req, res) => {
  const { uid } = req.body;
  if (!uid || !isSuperAdmin(uid)) return res.status(403).json({ error: 'Permission denied' });
  
  io.emit('pinball_shake');
  res.json({ success: true });
});

app.post('/api/admin/lottery/setup', express.json(), (req, res) => {
  const { uid, pool } = req.body;
  if (!uid || !isSuperAdmin(uid)) return res.status(403).json({ error: 'Permission denied' });
  
  lotteryRoom.status = 'lobby';
  lotteryRoom.pool = pool || []; // Admin can still pass initial pool
  lotteryRoom.drawn = [];
  lotteryRoom.assigneeUid = null;
  lotteryRoom.drawCount = 1;
  io.emit('lottery_state', lotteryRoom);
  res.json({ success: true, lotteryRoom });
});

// Update pool only (no reset of status/drawn)
app.post('/api/admin/lottery/update-pool', express.json(), (req, res) => {
  const { uid, pool } = req.body;
  if (!uid || !isSuperAdmin(uid)) return res.status(403).json({ error: 'Permission denied' });
  
  lotteryRoom.pool = pool || [];
  io.emit('lottery_state', lotteryRoom);
  res.json({ success: true, lotteryRoom });
});

app.post('/api/admin/lottery/reset', express.json(), (req, res) => {
  const { uid } = req.body;
  if (!uid || !isSuperAdmin(uid)) return res.status(403).json({ error: 'Permission denied' });
  
  lotteryRoom.status = 'idle';
  lotteryRoom.pool = [];
  lotteryRoom.drawn = [];
  lotteryRoom.assigneeUid = null;
  io.emit('lottery_state', lotteryRoom);
  res.json({ success: true, lotteryRoom });
});

app.post('/api/admin/lottery/assign', express.json(), (req, res) => {
  const { uid, assigneeUid, drawCount } = req.body;
  if (!uid || !isSuperAdmin(uid)) return res.status(403).json({ error: 'Permission denied' });
  
  if (lotteryRoom.status !== 'ready' && lotteryRoom.status !== 'lobby') return res.status(400).json({ error: 'Lottery not ready or lobby' });
  
  lotteryRoom.status = 'ready';
  lotteryRoom.assigneeUid = assigneeUid;
  lotteryRoom.drawCount = parseInt(drawCount) || 1;
  io.emit('lottery_state', lotteryRoom);
  res.json({ success: true, lotteryRoom });
});

app.post('/api/admin/lottery/close', express.json(), (req, res) => {
  const { uid } = req.body;
  if (!uid || !isSuperAdmin(uid)) return res.status(403).json({ error: 'Permission denied' });
  
  lotteryRoom.status = 'idle';
  io.emit('lottery_state', lotteryRoom);
  res.json({ success: true });
});

app.post('/api/admin/party/play', express.json(), (req, res) => {
  const { uid } = req.body;
  if (!uid || !isSuperAdmin(uid)) return res.status(403).json({ error: 'Permission denied' });
  
  if (partyRoom.status !== 'lobby' && partyRoom.status !== 'ended') {
    return res.status(400).json({ error: 'Wrong state' });
  }
  
  partyRoom.status = 'playing';
  partyRoom.startTime = Date.now();
  Object.values(partyRoom.players).forEach(p => p.alive = true);
  
  io.emit('party_play', { startTime: partyRoom.startTime });
  
  if (partyBulletInterval) clearInterval(partyBulletInterval);
  let spawnRate = 1000;
  let lastSpawn = Date.now();
  let lastWallSpawn = Date.now();
  let lastHeartSpawn = Date.now();
  let lastStarSpawn = Date.now();
  
  partyBulletInterval = setInterval(() => {
    if (partyRoom.status !== 'playing') {
      clearInterval(partyBulletInterval);
      return;
    }
    const now = Date.now();
    const elapsed = now - partyRoom.startTime;
    spawnRate = Math.max(200, 1000 - (elapsed / 1000) * 20);
    
    // Spawn Bullet
    if (now - lastSpawn > spawnRate) {
      const spawnCount = 1 + Math.floor(elapsed / 10000);
      
      for (let i = 0; i < spawnCount; i++) {
        let startX, startY, targetX, targetY;
        
        if (elapsed <= 10000) {
          startX = Math.random(); startY = -0.1;
          targetX = Math.random(); targetY = 1.1;
        } else {
          const side = Math.floor(Math.random() * 4);
          if (side === 0) { startX = Math.random(); startY = -0.1; }
          else if (side === 1) { startX = 1.1; startY = Math.random(); }
          else if (side === 2) { startX = Math.random(); startY = 1.1; }
          else { startX = -0.1; startY = Math.random(); }
          
          if (elapsed > 10000) {
            // Targeted attack
            const alivePlayers = Object.values(partyRoom.players).filter(p => p.alive);
            if (alivePlayers.length > 0) {
              const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
              targetX = target.x >= 0 ? target.x : Math.random();
              targetY = target.y >= 0 ? target.y : Math.random();
            } else {
              targetX = Math.random(); targetY = Math.random();
            }
          } else {
            // Random target
            if (side === 0) { targetX = Math.random(); targetY = 1.1; }
            else if (side === 1) { targetX = -0.1; targetY = Math.random(); }
            else if (side === 2) { targetX = Math.random(); targetY = -0.1; }
            else { targetX = 1.1; targetY = Math.random(); }
          }
        }
        
        io.emit('spawn_bullet', {
          id: Math.random().toString(36).substring(2, 9),
          startX, startY, targetX, targetY,
          speedMultiplier: 0.7 + (elapsed / 1000) * 0.04
        });
      }
      lastSpawn = now;
    }
    
    // Spawn Wall (every 10s)
    if (now - lastWallSpawn > 10000) {
      io.emit('spawn_wall', {
        id: Math.random().toString(36).substring(2, 9),
        x: Math.random() * 0.8 + 0.1, // 10% to 90%
        y: Math.random() * 0.5 + 0.2, // 20% to 70% height
        width: Math.random() * 0.2 + 0.1, // 10% to 30% screen width
        height: Math.random() * 0.05 + 0.02 // thin walls
      });
      lastWallSpawn = now;
    }
    
    // Spawn Hearts (every 15s)
    if (now - lastHeartSpawn > 15000) {
      const aliveCount = Object.values(partyRoom.players).filter(p => p.alive).length;
      if (aliveCount > 0) {
        const heartCount = Math.ceil(aliveCount / 2);
        for (let i = 0; i < heartCount; i++) {
          io.emit('spawn_item', {
            type: 'heart',
            id: Math.random().toString(36).substring(2, 9),
            x: Math.random() * 0.8 + 0.1,
            y: Math.random() * 0.8 + 0.1
          });
        }
      }
      lastHeartSpawn = now;
    }
    
    // Spawn Star (every 20s)
    if (now - lastStarSpawn > 20000) {
      io.emit('spawn_item', {
        type: 'star',
        id: Math.random().toString(36).substring(2, 9),
        x: Math.random() * 0.8 + 0.1,
        y: Math.random() * 0.8 + 0.1
      });
      lastStarSpawn = now;
    }
  }, 100);
  
  if (partyRoom.winCondition.type === 'time') {
    partyTimeTimeout = setTimeout(() => {
      if (partyRoom.status === 'playing') {
        const alivePlayers = Object.values(partyRoom.players).filter(p => p.alive);
        endPartyGame(alivePlayers);
      }
    }, partyRoom.winCondition.value * 1000);
  }
  
  res.json({ success: true });
});

app.post('/api/admin/party/stop', express.json(), (req, res) => {
  const { uid } = req.body;
  if (!uid || !isSuperAdmin(uid)) return res.status(403).json({ error: 'Permission denied' });
  
  partyRoom.status = 'idle';
  partyRoom.players = {};
  if (partyTimeTimeout) clearTimeout(partyTimeTimeout);
  if (partyBulletInterval) clearInterval(partyBulletInterval);
  io.emit('party_state', partyRoom);
  res.json({ success: true });
});

app.post('/api/admin/party/next-round', express.json(), (req, res) => {
  const { uid } = req.body;
  if (!uid || !isSuperAdmin(uid)) return res.status(403).json({ error: 'Permission denied' });
  
  partyRoom.status = 'lobby';
  Object.values(partyRoom.players).forEach(p => {
    p.alive = true;
    p.ready = false;
  });
  
  if (partyTimeTimeout) clearTimeout(partyTimeTimeout);
  if (partyBulletInterval) clearInterval(partyBulletInterval);
  io.emit('party_state', partyRoom);
  res.json({ success: true });
});

// 處理 LIFF 前端傳來的報名或取消請求
app.post('/api/action', express.json(), async (req, res) => {
  const originalJson = res.json;
  res.json = function(body) {
    if (body && body.success) {
      if (body.gameId && games[body.gameId]) {
        notifySSEClients(games[body.gameId]);
      } else if (body.game) {
        notifySSEClients(body.game);
      } else if (req.body && req.body.gid) {
        notifySSEClients(req.body.gid);
      }
    }
    return originalJson.call(this, body);
  };

  try {
    const { gid, gameId, uid, name, level, action, count, text, pushToAll, operatorName, clientSupportsLiffSendMessage } = req.body;
    
    const targetGameGid = (gameId && games[gameId]) ? games[gameId].gid : gid;
    const isSuperAdminUser = isSuperAdmin(uid);
    let isAdmin = isSuperAdminUser;
    
    if (!isAdmin) {
      if (gameId && games[gameId] && games[gameId].targetGids && games[gameId].targetGids.length > 0) {
        isAdmin = games[gameId].targetGids.some(g => isGroupAdmin(uid, g));
      } else {
        isAdmin = isGroupAdmin(uid, targetGameGid);
      }
    }
    
    // 儲存要讓前端觸發的訊息
    let triggerBumpMsg = null;
    
    if (action === 'createGame') {
      if (!isSuperAdminUser) {
        return res.status(403).json({ error: '只有超級管理員能建立場次' });
      }
      
      const { title, date, time, loc, fee, limit, backupLimit, note, tag, publish, reminder, initialListStr, targetGid, targetGids } = req.body;
      const actualGid = (targetGids && targetGids.length > 0) ? targetGids[0] : (targetGid || gid);
      
      const newGameId = Date.now().toString() + Math.floor(Math.random()*1000);
      
      let pPublish = null;
      if (publish) {
         let ptStr = publish.replace('T', ' ');
         if (!ptStr.match(/[Z\+\-]/)) ptStr += ' +08:00';
         const dt = new Date(ptStr);
         if (!isNaN(dt.getTime())) pPublish = dt.getTime();
      }
      
      let pReminder = null;
      if (reminder) {
         let rtStr = reminder.replace('T', ' ');
         if (!rtStr.match(/[Z\+\-]/)) rtStr += ' +08:00';
         const dt = new Date(rtStr);
         if (!isNaN(dt.getTime())) pReminder = dt.getTime();
      }
      
      let initialList = [];
      let initialLevelMap = {};
      let initialPaidMap = {};
      
      if (initialListStr) {
          const rawList = initialListStr.split(/[\s,、，\n]+/).map(n => n.trim()).filter(Boolean);
          rawList.forEach(n => {
            let isPaid = false;
            if (n.endsWith('$') || n.endsWith('＄') || n.endsWith('(已繳費)') || n.endsWith('（已繳費）')) {
                isPaid = true;
                n = n.replace(/[\$＄]$/, '').replace(/\(已繳費\)$/, '').replace(/（已繳費）$/, '');
            }
            const match = n.match(/^(.*?)(?:[\(\[（](.*?)[\)\]）]|-(.*?))$/);
            if (match) {
              const trueName = match[1].trim();
              const lvl = (match[2] || match[3]).trim();
              initialList.push(trueName);
              initialLevelMap[trueName] = lvl;
              if (isPaid) initialPaidMap[trueName] = true;
            } else {
              initialList.push(n);
              if (isPaid) initialPaidMap[n] = true;
            }
          });
      }
      
      games[newGameId] = {
        gid: actualGid,
        targetGids: (targetGids && targetGids.length > 0) ? targetGids : [actualGid],
        gameId: newGameId,
        title: title || `${date || ''} ${time || ''} ${loc || ''}`.trim() || '羽球接龍',
        date: date || '',
        time: time || '',
        location: loc || '',
        fee: fee || '',
        note: note || '',
        tag: tag || '',
        active: true,
        startTime: Date.now(),
        lastActiveTime: Date.now(),
        scheduleTime: pPublish,
        reminderTime: pReminder,
        scheduleInput: null,
        anonymous: [],
        anonymousCount: 0,
        levelMap: initialLevelMap,
        paidMap: initialPaidMap,
        noteMap: {},
        allowUserNoteEdit: req.body.allowUserNoteEdit !== false,
        sections: [
          { title: '報名名單', limit: parseInt(limit, 10) || 20, backupLimit: parseInt(backupLimit, 10) || 5, label: '', list: initialList }
        ]
      };
      
      await saveGame(newGameId, true);
      await saveCurrentListSnapshot(newGameId, false);
      
      let pushErrors = [];
      if (!pPublish && isSuperAdminUser) {
          const gidsToPush = (targetGids && targetGids.length > 0) ? targetGids : [actualGid];
          for (const gId of gidsToPush) {
             try {
                await sendLobbyLink(null, gId, "🚀 場次建立成功！\n" + (title || '新場次開放報名中'));
             } catch(e) {
                console.error(`createGame pushMessage failed for ${gId}:`, e);
                const detail = e.originalError?.response?.data?.message || e.response?.data?.message || e.message;
                pushErrors.push(`${gId}: ${detail}`);
             }
          }
      }
      
      return res.json({ success: true, gameId: newGameId, pushErrors: pushErrors });
    }
    
    if (action === 'closeGame') {
      if (!isAdmin) {
        return res.status(403).json({ error: '只有管理員能關閉場次' });
      }
      if (!gameId || !games[gameId]) {
        return res.status(404).json({ error: '找不到該場次' });
      }
      
      const targetGame = games[gameId];
      targetGame.active = false;
      await saveGame(gameId, true);
      
      const pushTargets = targetGame.targetGids || [targetGame.gid];
      if (isSuperAdminUser) {
        for (const tGid of pushTargets) {
          try {
            await pushToAdmins(tGid, { type: 'text', text: `🔒 ${targetGame.title || '此場次'} 已由管理員關閉，無法再報名。` });
          } catch (e) {}
        }
      }
      
      return res.json({ success: true });
    }
    
    if (action === 'editGame') {
      if (!isAdmin) {
        return res.status(403).json({ error: '只有管理員能編輯場次' });
      }
      if (!gameId || !games[gameId]) {
        return res.status(404).json({ error: '找不到該場次' });
      }
      
      const { title, date, time, loc, fee, limit, backupLimit, note, tag, publish, reminder, targetGids, isManualEnded } = req.body;
      const game = games[gameId];
      
      const oldTargetGids = game.targetGids || [game.gid];
      if (targetGids && Array.isArray(targetGids) && targetGids.length > 0) {
        const newlyAdded = targetGids.filter(g => !oldTargetGids.includes(g));
        game.targetGids = targetGids;
        if (newlyAdded.length > 0 && isSuperAdminUser) {
          for (const gId of newlyAdded) {
            try {
              await sendLobbyLink(null, gId, `🚀 新增跨群組開放報名！\n\n🏸 ${title || game.title || '新場次'}`);
            } catch(e) {}
          }
        }
      }

      game.title = title || `${date || ''} ${time || ''} ${loc || ''}`.trim() || '羽球接龍';
      game.date = date || '';
      game.time = time || '';
      game.location = loc || '';
      game.fee = fee || '';
      game.note = note || '';
      game.tag = tag || '';
      game.isManualEnded = !!isManualEnded;
      if (typeof req.body.allowUserNoteEdit !== 'undefined') {
        game.allowUserNoteEdit = !!req.body.allowUserNoteEdit;
      }
      
      if (game.sections && game.sections[0]) {
        game.sections[0].limit = parseInt(limit, 10) || 20;
        game.sections[0].backupLimit = parseInt(backupLimit, 10) || 0;
      }
      
      let pPublish = null;
      if (publish) {
         let ptStr = publish.replace('T', ' ');
         if (!ptStr.match(/[Z\+\-]/)) ptStr += ' +08:00';
         const dt = new Date(ptStr);
         if (!isNaN(dt.getTime())) pPublish = dt.getTime();
      }
      game.scheduleTime = pPublish;
      
      let pReminder = null;
      if (reminder) {
         let rtStr = reminder.replace('T', ' ');
         if (!rtStr.match(/[Z\+\-]/)) rtStr += ' +08:00';
         const dt = new Date(rtStr);
         if (!isNaN(dt.getTime())) pReminder = dt.getTime();
      }
      game.reminderTime = pReminder;
      
      await saveGame(gameId, true);
      
      return res.json({ success: true });
    }
    
    if (action === 'customPush') {
      if (!isSuperAdminUser) {
        return res.status(403).json({ error: '只有超級管理員能發送推播' });
      }
      
      let targetGids = [gid];
      if (pushToAll) {
        targetGids = Object.keys(groupAdmins).filter(g => groupAdmins[g].has(uid));
      }
      
      let successCount = 0;
      for (const tGid of targetGids) {
        try {
          await sendLobbyLink(null, tGid, `📢 管理員廣播：\n${text}`);
          successCount++;
        } catch(e) { console.error('Push error:', e); }
      }
      return res.json({ success: true, count: successCount });
    }
    
    if (action === 'updateLobbyTitle') {
      if (!isSuperAdminUser) return res.status(403).json({ error: '只有超級管理員能修改大廳標題' });
      
      const newTitle = text ? text.trim() : '';
      await ensureGroupSettings(gid);
      groupSettings[gid].lobbyTitle = newTitle;
      await saveGroupSettings();
      return res.json({ success: true, lobbyTitle: newTitle });
    }

    if (action === 'updateLobbyDesc') {
      if (!isSuperAdminUser) return res.status(403).json({ error: '只有超級管理員能修改大廳描述' });
      
      const newDesc = text ? text.trim() : '';
      await ensureGroupSettings(gid);
      groupSettings[gid].lobbyDesc = newDesc;
      await saveGroupSettings();
      return res.json({ success: true, lobbyDesc: newDesc });
    }

    if (action === 'pushList') {
      if (!isSuperAdminUser) {
        return res.status(403).json({ error: '只有超級管理員能推播名單' });
      }
      if (!gameId || !games[gameId]) {
        return res.status(400).json({ error: '找不到此場次' });
      }
      const g = games[gameId];
      let msg = generateListMessage(g, '管理員推播目前名單');
      
      let pushTargetGids = g.targetGids || [g.gid];
      if (req.body.targetCode) {
        const targetCode = req.body.targetCode;
        if (groupCodes[targetCode]) {
          pushTargetGids = [groupCodes[targetCode]];
        } else {
          return res.status(400).json({ error: `找不到代碼為 ${targetCode} 的群組` });
        }
      }
      
      let hasError = false;
      let errorMsgs = [];
      
      let singleTargetGid = pushTargetGids[0]; // 自動發話只能發到單一群組
      let currentMsg = msg;
      if (process.env.LIFF_ID) {
        currentMsg += `\n👇 點擊下方連結開啟大廳\nhttps://liff.line.me/${process.env.LIFF_ID}?gid=${singleTargetGid}`;
      }

      if (clientSupportsLiffSendMessage && isAdmin) {
        // 交給前端自動發話
        triggerBumpMsg = currentMsg;
      } else {
        // 直接推播到目標群組
        for (const targetGid of pushTargetGids) {
          let pushMsg = msg;
          if (process.env.LIFF_ID) {
            pushMsg += `\n👇 點擊下方連結開啟大廳\nhttps://liff.line.me/${process.env.LIFF_ID}?gid=${targetGid}`;
          }
          try {
            await client.pushMessage(targetGid, { type: 'text', text: pushMsg.trim() });
          } catch (e) {
            hasError = true;
            errorMsgs.push(`${targetGid}: ${e.message}`);
          }
        }
      }
      
      return res.json({ 
        success: true, 
        game: g, 
        msg: msg, 
        partialError: hasError, 
        errors: errorMsgs,
        triggerBumpMsg: triggerBumpMsg,
        isAdmin: isAdmin
      });
    }

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
        addToList(gameId, 0, n, { uid, level: n !== '__ANON__' ? level : undefined });
        if (n !== '__ANON__') {
          uidToNameMap.set(`${gameId}_${uid}`, n);
          if (!game.history) game.history = [];
          const now = new Date();
          const timeStr = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
          game.history.unshift({ time: timeStr, name: n, operator: operatorName || name, action: '+1' });
          if (game.history.length > 200) game.history.pop();
        }
      });
        } else if (action === 'togglePaid') {
      if (!isAdmin) {
        return res.status(403).json({ error: '只有管理員能修改繳費狀態' });
      }
      game.paidMap = game.paidMap || {};
      game.paidMap[name] = !game.paidMap[name];
    } else if (action === 'updateNote' || action === 'setNote') {
      game.noteMap = game.noteMap || {};
      const noteStr = typeof req.body.note === 'string' ? req.body.note.trim() : '';
      if (noteStr) {
        game.noteMap[name] = noteStr;
      } else {
        delete game.noteMap[name];
      }
    } else if (action === 'cancel') {
      if (!currentList.includes(name)) {
        return res.status(400).json({ error: '找不到此名稱' });
      }
      
      const registeredUid = nameToUidMap.get(`${gameId}_${name}`);
      
      if (!isAdmin && registeredUid && registeredUid !== uid) {
        return res.status(403).json({ error: '只能取消自己或自己代報的名單' });
      }
      
      const limit = game.sections[0].limit;
      const mainListBefore = game.sections[0].list.slice(0, limit);
      
      await removeFromList(gameId, name, { uid });
      for(let i=1; i<c; i++) {
        await removeAnon(gameId, { uid });
      }
      
      if (!game.history) game.history = [];
      const now = new Date();
      const timeStr = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      game.history.unshift({ time: timeStr, name: name, operator: operatorName || name, action: '-1' });
      if (game.history.length > 200) game.history.pop();
      
      if (game.paidMap) {
        delete game.paidMap[name];
      }
      if (game.noteMap) {
        delete game.noteMap[name];
      }
      
      const mainListAfter = game.sections[0].list.slice(0, limit);
      
      // 找出遞補上來的人 (在 mainListAfter 但不在 mainListBefore)
      const bumpedNames = mainListAfter.filter(n => !mainListBefore.includes(n) && n !== '__ANON__');
      
      if (bumpedNames.length > 0) {
        try {
          const bumpMsg = `『${bumpedNames.join('、')}』後補上 請注意訊息`;
          triggerBumpMsg = bumpMsg; // 記錄下來，稍後傳給前端
          
          if (clientSupportsLiffSendMessage && isAdmin) {
            console.log('[Webhook] 前端支援且為管理員，跳過 pushToAdmins，交由前端 liff.sendMessages 觸發');
          } else {
            const pushTargets = game.targetGids || [game.gid];
            for (const targetGid of pushTargets) {
              try {
                await pushToAdmins(targetGid, { type: 'text', text: `${game.title}\n${bumpMsg}` });
              } catch (e) {
                console.error(`遞補推播代理失敗 for ${targetGid}:`, e);
              }
            }
          }
        } catch(e) {
          console.error('遞補處理失敗:', e);
        }
      }
      
    } else if (action === 'reorder') {
      if (!isAdmin) {
        return res.status(403).json({ error: '只有管理員能調整順序' });
      }
      
      const { fromIdx, toIdx } = req.body;
      const list = game.sections[0].list;
      
      if (typeof fromIdx !== 'number' || typeof toIdx !== 'number') {
        return res.status(400).json({ error: '參數錯誤' });
      }
      if (fromIdx < 0 || fromIdx >= list.length || toIdx < 0 || toIdx >= list.length) {
        return res.status(400).json({ error: '無效的順序' });
      }
      
      const element = list.splice(fromIdx, 1)[0];
      list.splice(toIdx, 0, element);
    } else if (action === 'logError') {
      if (!game.history) game.history = [];
      const now = new Date();
      const timeStr = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      game.history.unshift({ time: timeStr, name: '系統', operator: operatorName || name, action: '錯誤', errorMsg: text });
      if (game.history.length > 200) game.history.pop();
      
      systemLogs.unshift({ time: timeStr, gameTitle: game.title, operator: operatorName || name, errorMsg: text });
      if (systemLogs.length > 500) systemLogs.pop();
      
      systemLogs.unshift({ time: timeStr, gameTitle: game.title, operator: operatorName || name, errorMsg: text });
      if (systemLogs.length > 500) systemLogs.pop();
      saveSystemLogs();
    } else {
      return res.status(400).json({ error: 'Unknown action' });
    }

    if (action !== 'logError') touchGame(gameId);
    await saveGame(gameId, true);
    await saveCurrentListSnapshot(gameId, false);
    
    // 讓所有使用者操作時，都觸發自動發話並帶上精簡資訊
    if (action === 'register' || action === 'cancel' || action === 'reorder' || action === 'togglePaid' || action === 'updateNote' || action === 'setNote') {
      const g = games[gameId];
      const sec = g.sections && g.sections[0] ? g.sections[0] : null;
      if (sec) {
        let msg = '';
        
        let opPart = name;
        if (name === operatorName || name === '__ANON__') {
          opPart = '';
        } else {
          opPart = ` ${name}`;
        }

        if (action === 'register') msg += `${g.title}${opPart} +1`;
        else if (action === 'cancel') msg += `${g.title}${opPart} -1`;
        else if (action === 'reorder') msg += `${g.title} 🔄順序更新`;
        else if (action === 'togglePaid') msg += `${g.title}${opPart} 💰繳費更新`;
        else if (action === 'updateNote' || action === 'setNote') msg += `${g.title}${opPart} 📝備註更新`;

        if (triggerBumpMsg) {
           msg += `\n🎉 【遞補通知】\n${triggerBumpMsg}`;
        }
        
        triggerBumpMsg = msg.trim();
        
        // Fallback for desktop / external browser
        if (!clientSupportsLiffSendMessage) {
          const pushTargets = g.targetGids || [g.gid];
          for (const targetGid of pushTargets) {
            try {
              pushToAdmins(targetGid, { type: 'text', text: triggerBumpMsg + '\n\n[系統代發]' });
            } catch (e) {
              console.error('Fallback pushToAdmins failed:', e);
            }
          }
        }
      }
    }
    console.log('[API Action] clientSupportsLiffSendMessage:', clientSupportsLiffSendMessage, 'triggerBumpMsg:', triggerBumpMsg);

    res.json({ 
      success: true, 
      game: games[gameId],
      isAdmin: isAdmin,
      triggerBumpMsg: triggerBumpMsg 
    });
  } catch (err) {
    console.error('API Action Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
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
  if (event.type === 'memberJoined') {
    const gid = event.source.groupId || event.source.roomId;
    if (!gid) return null;
    
    logToFile(`[INFO] Bot joined group/room ${gid} - waiting for first command`);
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
      return null;
    } catch (e) {
      console.error('Failed to respond to follow event:', e);
      logToFile(`[ERROR] Failed to respond to follow event: ${e.message}`);
      return null;
    }
  }

  if (event.type !== 'message' || event.message.type !== 'text') return null;

  const gid = event.source.groupId || event.source.roomId || event.source.userId;
  const uid = event.source.userId;
  const text = event.message.text.trim();
  const firstLine = text.split('\n')[0].trim();
  // 舊的單一場次卡片攔截已移除，改由下方統整的「接龍狀況」回覆
  
  // 保留舊版相容
  const triggerMatch = text.match(/^🤖 【系統觸發：自動推播】\n([\s\S]*)/);
  if (triggerMatch) {
    const replyText = triggerMatch[1].trim();
    return await client.replyMessage(event.replyToken, { type: 'text', text: replyText });
  }
  
  if (text.replace(/\s+/g, '') === '接龍密碼Tony好帥') {
    if (!superAdmins) superAdmins = new Set();
    superAdmins.add(uid);
    saveSuperAdmins();
    return await client.replyMessage(event.replyToken, { type: 'text', text: '✅ 權限已開通！您現在是全系統的超級管理員了。' });
  }

  if (text === '取消管理員' || text === '取消管理者') {
    let wasGroupAdmin = false;
    let wasSuperAdmin = false;

    if (superAdmins && superAdmins.has(uid)) {
      superAdmins.delete(uid);
      saveSuperAdmins();
      wasSuperAdmin = true;
    }

    for (const g in groupAdmins) {
      if (groupAdmins[g].has(uid)) {
        groupAdmins[g].delete(uid);
        wasGroupAdmin = true;
      }
    }
    
    if (wasGroupAdmin) {
      saveAdmins();
    }

    if (wasGroupAdmin || wasSuperAdmin) {
      return client.replyMessage(event.replyToken, { type: 'text', text: '✅ 已取消您的管理員權限。' });
    } else {
      return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 您本來就不是管理員喔。' });
    }
  }

  if (text === '查詢管理員' || text === '管理員名單') {
    if (!isSuperAdmin(uid)) {
      return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 只有超級管理員可以查詢管理員名單。' });
    }

    let msg = '📋 管理員名單\n══════════════\n';

    // 超級管理員 (環境變數)
    const envAdminUids = process.env.SUPER_ADMIN_USER_ID
      ? process.env.SUPER_ADMIN_USER_ID.split(',').map(id => id.trim()).filter(Boolean)
      : [];

    // 超級管理員 (動態新增)
    const dynamicSuperAdmins = superAdmins ? Array.from(superAdmins) : [];

    // 合併不重複
    const allSuperAdminUids = [...new Set([...envAdminUids, ...dynamicSuperAdmins])];

    msg += '\n👑 超級管理員:\n';
    if (allSuperAdminUids.length === 0) {
      msg += '  (無)\n';
    } else {
      for (const adminUid of allSuperAdminUids) {
        try {
          const name = await getName(gid, adminUid);
          const source = envAdminUids.includes(adminUid) ? ' [環境變數]' : ' [動態]';
          const nameDisplay = name === '球友' ? `球友 (${adminUid.substring(0, 6)}...)` : name;
          msg += `  • ${nameDisplay}${source}\n`;
        } catch (e) {
          msg += `  • ${adminUid.substring(0, 8)}...${envAdminUids.includes(adminUid) ? ' [環境變數]' : ' [動態]'}\n`;
        }
      }
    }

    // 群組管理員
    const groupEntries = Object.entries(groupAdmins).filter(([g, admins]) => admins.size > 0);
    if (groupEntries.length > 0) {
      msg += '\n👤 群組管理員:\n';
      for (const [adminGid, admins] of groupEntries) {
        const code = Object.keys(groupCodes).find(k => groupCodes[k] === adminGid) || '無代碼';
        msg += `\n  群組 [${code}]:\n`;
        for (const adminUid of admins) {
          try {
            const name = await getName(adminGid, adminUid);
            const alsoSuper = allSuperAdminUids.includes(adminUid) ? ' 👑' : '';
            msg += `    • ${name}${alsoSuper}\n`;
          } catch (e) {
            msg += `    • ${adminUid.substring(0, 8)}...\n`;
          }
        }
      }
    } else {
      msg += '\n👤 群組管理員:\n  (無)\n';
    }

    return client.replyMessage(event.replyToken, { type: 'text', text: msg.trim() });
  }

  if (text === '群組代碼' || text === '群組碼') {
    let code = Object.keys(groupCodes).find(k => groupCodes[k] === gid);
    if (!code) {
      do {
        code = Math.floor(1000 + Math.random() * 9000).toString();
      } while (groupCodes[code]);
      groupCodes[code] = gid;
      saveGroupCodes();
    }
    return client.replyMessage(event.replyToken, { 
      type: 'text', 
      text: `本群組的專屬代碼為：【 ${code} 】` 
    });
  }

  if (text.toLowerCase() === 'line id check' || text === '我的UID' || text === '我的uid') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `你的專屬 UID 是：\n${uid}\n\n請將此 UID 提供給超級管理員，以便設定群組管理權限。\n(若要開啟全系統超級管理員模式，可將此字串設定到 Render 的 SUPER_ADMIN_USER_ID 環境變數中)`
    });
  }

  const viewOverrideMatch = text.match(/^超級管理員視角\s+(使用者|管理員|最高權限)(?:\s+(\d{4}))?$/i);
  if (viewOverrideMatch) {
    if (!isTrueSuperAdmin(uid)) {
      return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 此指令僅限真正的超級管理員使用。' });
    }
    const mode = viewOverrideMatch[1];
    const code = viewOverrideMatch[2];
    let modeCode = 'superadmin';
    if (mode === '使用者') modeCode = 'user';
    else if (mode === '管理員') modeCode = 'admin';
    
    let targetGid = null;
    let groupNameDisplay = '';
    if (modeCode === 'admin' && code) {
      targetGid = groupCodes[code];
      if (!targetGid) {
        return client.replyMessage(event.replyToken, { type: 'text', text: `找不到代碼為 ${code} 的群組` });
      }
      groupNameDisplay = ` (限群組: ${groupSettings[targetGid]?.groupName || code})`;
    }
    
    superAdminViewOverrides[uid] = { mode: modeCode, targetGid: targetGid };
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `✅ 視角已切換為：${mode}${groupNameDisplay}\n請重新整理網頁查看效果。`
    });
  }

  const groupAdminSetMatch = text.match(/^接龍群主設定\s+(U[a-f0-9]+)\s+(\d{4})$/i);
  if (groupAdminSetMatch) {
    if (!isSuperAdmin(uid)) {
      return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 只有超級管理員能指派群組管理員。' });
    }
    const targetUid = groupAdminSetMatch[1];
    const targetCode = groupAdminSetMatch[2];
    const targetGid = groupCodes[targetCode];
    if (!targetGid) {
      return client.replyMessage(event.replyToken, { type: 'text', text: `找不到代碼為 ${targetCode} 的群組` });
    }
    if (!groupAdmins[targetGid]) groupAdmins[targetGid] = new Set();
    groupAdmins[targetGid].add(targetUid);
    saveAdmins();
    const gName = groupSettings[targetGid]?.groupName || targetCode;
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `✅ 已成功將該使用者設為【${gName}】的群組管理員！`
    });
  }

  const groupAdminRemoveMatch = text.match(/^接龍群主撤銷\s+(U[a-f0-9]+)\s+(\d{4})$/i);
  if (groupAdminRemoveMatch) {
    if (!isSuperAdmin(uid)) {
      return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 只有超級管理員能撤銷群組管理員。' });
    }
    const targetUid = groupAdminRemoveMatch[1];
    const targetCode = groupAdminRemoveMatch[2];
    const targetGid = groupCodes[targetCode];
    if (!targetGid) {
      return client.replyMessage(event.replyToken, { type: 'text', text: `找不到代碼為 ${targetCode} 的群組` });
    }
    if (groupAdmins[targetGid] && groupAdmins[targetGid].has(targetUid)) {
      groupAdmins[targetGid].delete(targetUid);
      saveAdmins();
      const gName = groupSettings[targetGid]?.groupName || targetCode;
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: `✅ 已撤銷該使用者在【${gName}】的管理權限。`
      });
    } else {
      return client.replyMessage(event.replyToken, { type: 'text', text: '該使用者本來就不是此群組的管理員。' });
    }
  }

  const urlMatch = text.match(/^(?:網址|群組網址|大廳網址)\s*(\d{4})$/);
  if (urlMatch) {
    const queryCode = urlMatch[1];
    const targetGid = groupCodes[queryCode];
    if (targetGid) {
      if (process.env.LIFF_ID) {
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: `🔗 群組 ${queryCode} 的專屬大廳網址為：\nhttps://liff.line.me/${process.env.LIFF_ID}?gid=${targetGid}`
        });
      } else {
        return client.replyMessage(event.replyToken, { type: 'text', text: '系統尚未設定 LIFF_ID' });
      }
    } else {
      return client.replyMessage(event.replyToken, { type: 'text', text: `找不到代碼為 ${queryCode} 的群組` });
    }
  }

  // 只允許管理員下達文字指令 (但開放部分查詢指令給一般群友)
  const isAdmin = isSuperAdmin(uid) || isGroupAdmin(uid, gid);
  
  const cleanText = text.replace(/\n\n\[系統代發\]$/, '').trim();
  const isPlusMinus = cleanText.match(/^\+[1-9]/) || cleanText.match(/^-[1-9]/) || cleanText.match(/\+[1-9]$/) || cleanText.match(/-[1-9]$/) || cleanText.match(/🔄順序更新$/) || cleanText.match(/💰繳費更新$/);
  const isPublicCommand = text.startsWith('接龍名單') || 
                          text.startsWith('推播提醒') ||
                          text === '接龍狀態' || 
                          text === '接龍狀況' || 
                          text === '接龍查詢' || 
                          text === '大廳' || 
                          text === '接龍大廳' ||
                          isPlusMinus;

  if (!isAdmin && !isPublicCommand) {
    return null; // 非管理員，已讀不回
  }

  // 檢查是否為群組首次使用
  let showWelcome = false;
  if (gid && (gid.startsWith('C') || gid.startsWith('R')) && !firstUseGroups.has(gid)) {
    firstUseGroups.add(gid);
    showWelcome = true;
  }

  try {
    // 1. 接龍開始
    if (text.startsWith('接龍開始')) {
      const groupMatch = text.match(/群組(?:[:：])?\s*(?:\{|｛)(.*?)(?:\}|｝)/) || text.match(/群組[:：]\s*(\d{4})/);
      let targetGid = gid;
      let isRemote = false;
      if (groupMatch) {
          const code = groupMatch[1].trim();
          if (groupCodes[code]) {
              targetGid = groupCodes[code];
              isRemote = targetGid !== gid;
          } else {
              return client.replyMessage(event.replyToken, { type: 'text', text: `找不到代碼為 ${code} 的群組，請確認您已在目標群組輸入「群組代碼」獲取正確的代碼。` });
          }
      }

      const titleMatch = text.match(/標題(?:[:：])?\s*(?:\{|｛)?(.*?)(?:\}|｝)?(?:\n|$)/) || text.match(/標題\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:日期|時間|地點|費用|人數|候補|備註|名單|$))))/);
      const dateMatch = text.match(/日期\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標題|時間|地點|費用|人數|候補|備註|名單|$))))/);
      const timeMatch = text.match(/時間\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標題|日期|地點|費用|人數|候補|備註|名單|$))))/);
      const locMatch = text.match(/地點\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標題|日期|時間|發布時間|提醒時間|費用|人數|候補|備註|名單|$))))/);
      const feeMatch = text.match(/費用\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標題|日期|時間|發布時間|提醒時間|地點|人數|候補|備註|名單|$))))/);
      const noteMatch = text.match(/備註\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標題|日期|時間|發布時間|提醒時間|地點|費用|人數|候補|名單|標籤|$))))/);
      const tagMatch = text.match(/標籤\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標題|日期|時間|發布時間|提醒時間|地點|費用|人數|候補|備註|名單|匿名名單|$))))/);
      const listMatch = text.match(/名單\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標題|日期|時間|發布時間|提醒時間|地點|費用|人數|候補|備註|標籤|匿名名單|$))))/);
      const anonMatch = text.match(/匿名名單\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標題|日期|時間|發布時間|提醒時間|地點|費用|人數|候補|備註|標籤|名單|$))))/);
      const publishMatch = text.match(/發布時間\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標題|日期|時間|提醒時間|地點|費用|人數|候補|備註|標籤|名單|匿名名單|$))))/);
      const reminderMatch = text.match(/提醒時間\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標題|日期|時間|發布時間|地點|費用|人數|候補|備註|標籤|名單|匿名名單|$))))/);
      
      const limitMatch = text.match(/人數\s*[:：]?\s*(?:[{\uff5b](\d+)[}\uff5d]|(\d+))/);
      const backupMatch = text.match(/候補\s*[:：]?\s*(?:[{\uff5b](\d+)[}\uff5d]|(\d+))/);
      
      const pDate = dateMatch ? (dateMatch[1] || dateMatch[2]).trim() : '';
      const pTime = timeMatch ? (timeMatch[1] || timeMatch[2]).trim() : '';
      const pLoc = locMatch ? (locMatch[1] || locMatch[2]).trim() : '';
      const pFee = feeMatch ? (feeMatch[1] || feeMatch[2]).trim() : '';
      const pNote = noteMatch ? (noteMatch[1] || noteMatch[2]).trim() : '';
      const pTag = tagMatch ? (tagMatch[1] || tagMatch[2]).trim() : '';
      
      let pPublish = null;
      if (publishMatch) {
         let ptStr = (publishMatch[1] || publishMatch[2]).trim();
         if (!ptStr.match(/[Z\+\-]/)) ptStr += ' +08:00';
         const dt = new Date(ptStr);
         if (!isNaN(dt.getTime())) pPublish = dt.getTime();
      }
      
      let pReminder = null;
      if (reminderMatch) {
         let rtStr = (reminderMatch[1] || reminderMatch[2]).trim();
         if (!rtStr.match(/[Z\+\-]/)) rtStr += ' +08:00';
         const dt = new Date(rtStr);
         if (!isNaN(dt.getTime())) pReminder = dt.getTime();
      }
      
      let title = '羽球接龍';
      if (titleMatch) {
         title = (titleMatch[1] || titleMatch[2]).trim();
      } else if (pDate || pTime || pLoc) {
         title = [pDate, pTime, pLoc].filter(Boolean).join(' ');
      }
      
      const limit = limitMatch ? parseInt(limitMatch[1] || limitMatch[2], 10) : 20;
      const backupLimit = backupMatch ? parseInt(backupMatch[1] || backupMatch[2], 10) : 5;
      
      let initialList = [];
      let initialLevelMap = {};
      let initialPaidMap = {};
      if (listMatch) {
         const listStr = (listMatch[1] || listMatch[2]).trim();
         const rawList = listStr.split(/[\s,、，]+/).map(n => n.trim()).filter(Boolean);
         rawList.forEach(n => {
           let isPaid = false;
           if (n.endsWith('$') || n.endsWith('＄') || n.endsWith('(已繳費)') || n.endsWith('（已繳費）')) {
               isPaid = true;
               n = n.replace(/[\$＄]$/, '').replace(/\(已繳費\)$/, '').replace(/（已繳費）$/, '');
           }
           const match = n.match(/^(.*?)(?:[\(\[（](.*?)[\)\]）]|-(.*?))$/);
           if (match) {
             const trueName = match[1].trim();
             const lvl = (match[2] || match[3]).trim();
             initialList.push(trueName);
             initialLevelMap[trueName] = lvl;
             if (isPaid) initialPaidMap[trueName] = true;
           } else {
             initialList.push(n);
             if (isPaid) initialPaidMap[n] = true;
           }
         });
      }
      
      if (anonMatch) {
         const anonStr = (anonMatch[1] || anonMatch[2]).trim();
         const num = parseInt(anonStr, 10);
         if (!isNaN(num)) {
             for(let i=0; i<num; i++) initialList.push('__ANON__');
         } else {
             const anons = anonStr.split(/[\s,、，]+/).map(n => n.trim()).filter(Boolean);
             for(let i=0; i<anons.length; i++) initialList.push('__ANON__');
         }
      }
      
      const gameId = Date.now().toString() + Math.floor(Math.random()*1000);
      
      games[gameId] = {
        gid: targetGid,
        gameId: gameId,
        title: title,
        date: pDate,
        time: pTime,
        location: pLoc,
        fee: pFee,
        note: pNote === '無' || pNote === '空' ? '' : pNote,
        tag: pTag,
        active: true,
        startTime: Date.now(),
        lastActiveTime: Date.now(),
        scheduleTime: pPublish,
        reminderTime: pReminder,
        scheduleInput: null,
        anonymous: [],
        anonymousCount: 0,
        levelMap: initialLevelMap,
        paidMap: initialPaidMap,
        noteMap: {},
        allowUserNoteEdit: true,
        sections: [
          { title: '報名名單', limit: limit, backupLimit: backupLimit, label: '', list: initialList }
        ]
      };
      
      // Setup uid mapping if admin creates the list with themselves in it
      initialList.forEach(n => {
        if (n === uidToNameMap.get(uid)) {
            nameToUidMap.set(`${gameId}_${n}`, uid);
        }
      });
      
      await saveGame(gameId, true);
      await saveCurrentListSnapshot(gameId, false);
      
      let welcomePrefix = showWelcome ? '🎉 大家好，我是羽球接龍機器人。\n\n' : '';
      if (isRemote) {
          if (!pPublish) await sendLobbyLink(null, targetGid, welcomePrefix + "🚀 場次建立成功！");
          return client.replyMessage(event.replyToken, { type: 'text', text: `✅ 已成功將場次建立${pPublish ? '並排程發布' : '並推播'}至代碼 ${groupMatch[1].trim()} 的群組！` });
      } else {
          if (pPublish) {
              return client.replyMessage(event.replyToken, { type: 'text', text: `✅ 場次建立成功！將於指定時間發布大廳連結。` });
          } else {
              return await sendLobbyLink(event.replyToken, gid, welcomePrefix + "🚀 場次建立成功！");
          }
      }
    }

    if (text.startsWith('接龍結束') || text.startsWith('接龍清空')) {
      const groupMatch = text.match(/群組(?:[:：])?\s*(?:\{|｛)(.*?)(?:\}|｝)/) || text.match(/群組[:：]\s*(\d{4})/);
      let targetGid = gid;
      if (groupMatch) {
          const code = groupMatch[1].trim();
          if (groupCodes[code]) {
              targetGid = groupCodes[code];
          } else {
              return client.replyMessage(event.replyToken, { type: 'text', text: `找不到代碼為 ${code} 的群組，無法執行清空。` });
          }
      }

      let keyword = text.replace(/接龍結束|接龍清空/, '');
      if (groupMatch) keyword = keyword.replace(groupMatch[0], '');
      keyword = keyword.trim();
      
      let groupGames = Object.values(games).filter(g => 
        (g.gid === targetGid || (g.targetGids && g.targetGids.includes(targetGid))) && 
        g.active && 
        !g.isManualEnded
      );
      
      if (text.startsWith('接龍清空') || text === '接龍結束') {
        // 全清
        const count = groupGames.length;
        for(const g of groupGames) {
          const gId = g.gameId;
          delete games[gId];
          await saveGame(gId, true);
        }
        await saveCurrentListSnapshot(null, false);
        pendingSaves.add('__force_save__');
        await flushFileSave();
        return await client.replyMessage(event.replyToken, { type: 'text', text: `✅ 找到 ${count} 個場次並已清空` });
      } else {
        // 結束特定場次
        groupGames = groupGames.filter(g => g.title.includes(keyword));
        if (groupGames.length === 0) {
          return await client.replyMessage(event.replyToken, { type: 'text', text: `找不到包含「${keyword}」的場次喔！` });
        }
        for(const g of groupGames) {
          const gId = g.gameId;
          delete games[gId];
          await saveGame(gId, true);
        }
        await saveCurrentListSnapshot(null, false);
        pendingSaves.add('__force_save__');
        await flushFileSave();
        const titles = groupGames.map(g => g.title).join('、');
        return await client.replyMessage(event.replyToken, { type: 'text', text: `✅ 已結束場次：${titles}` });
      }
    }


    if (text.startsWith('群組廣播')) {
      const groupMatch = text.match(/群組(?:[:：])?\s*(?:\{|｛)?([a-zA-Z0-9]+)(?:\}|｝)?\s+內容(?:[:：])?\s*([\s\S]*)/);
      if (!groupMatch || !groupMatch[1] || !groupMatch[2]) {
        return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 語法錯誤！正確格式為：\n群組廣播 群組: 1234 內容: 您的廣播訊息' });
      }
      
      const code = groupMatch[1].trim();
      const broadcastText = groupMatch[2].trim();
      const targetGid = groupCodes[code];
      
      if (!targetGid) {
        return client.replyMessage(event.replyToken, { type: 'text', text: `❌ 找不到代碼為 ${code} 的群組。` });
      }
      
      if (!isSuperAdminUser && !(groupAdmins[targetGid] && groupAdmins[targetGid].has(uid))) {
        return client.replyMessage(event.replyToken, { type: 'text', text: '❌ 您不是目標群組的管理員，無法對該群組發送廣播。' });
      }

      try {
        await client.pushMessage(targetGid, { type: 'text', text: `📢 管理員廣播：\n\n${broadcastText}` });
        if (targetGid !== gid) {
          return client.replyMessage(event.replyToken, { type: 'text', text: `✅ 廣播已成功發送至群組 ${code}！` });
        }
      } catch (err) {
        return client.replyMessage(event.replyToken, { type: 'text', text: `❌ 廣播發送失敗，可能是機器人不在目標群組中，或是無權限發言。` });
      }
      return null;
    }

    if (text.startsWith('接龍名單') || text.startsWith('推播提醒')) {
      const isMentionPush = text.startsWith('推播提醒');
      
      if (isMentionPush && !isAdmin) {
          return client.replyMessage(event.replyToken, { type: 'text', text: '❌ 只有管理員可以使用「推播提醒」功能喔！' });
      }

      const groupMatch = text.match(/群組(?:[:：])?\s*(?:\{|｛)(.*?)(?:\}|｝)/) || text.match(/群組[:：]\s*(\d{4})/);
      let targetGid = gid;
      if (groupMatch) {
          const code = groupMatch[1].trim();
          if (groupCodes[code]) {
              targetGid = groupCodes[code];
          } else {
              return client.replyMessage(event.replyToken, { type: 'text', text: `找不到代碼為 ${code} 的群組。` });
          }
      }

      let keyword = text.replace(/接龍名單/, '').replace(/推播提醒/, '');
      if (groupMatch) keyword = keyword.replace(groupMatch[0], '');
      keyword = keyword.replace(/\[系統代發\]/g, '').trim();
      
      const getGameTime = (g) => {
        let t = 0;
        if (g.date) {
          let dStr = g.date.trim();
          if (dStr.match(/^\d{1,2}\/\d{1,2}$/)) {
            dStr = new Date().getFullYear() + '/' + dStr;
          }
          const pd = new Date(`${dStr} ${g.time || ''}`.trim());
          if (!isNaN(pd.getTime())) t = pd.getTime();
        }
        return t === 0 ? (g.startTime || 0) : t;
      };

      let groupGames = Object.values(games)
        .filter(g => (g.gid === targetGid || (g.targetGids && g.targetGids.includes(targetGid))) && g.active && !g.isManualEnded)
        .sort((a, b) => getGameTime(a) - getGameTime(b));
      if (keyword) {
          groupGames = groupGames.filter(g => g.title.includes(keyword));
      }
      
      if (groupGames.length === 0) {
          const text = keyword ? `找不到包含「${keyword}」的場次喔！` : `目前群組內沒有正在進行的場次。`;
          return client.replyMessage(event.replyToken, { type: 'text', text });
      }

      const messagesToSend = generatePushMentionMessages(groupGames, targetGid, isMentionPush, nameToUidMap);
      if (targetGid !== gid) {
          try {
              await client.pushMessage(targetGid, messagesToSend);
              const successMsg = isMentionPush ? '場次名單及提醒' : '場次名單';
              return client.replyMessage(event.replyToken, { type: 'text', text: `✅ 已將${successMsg}推播至群組 ${groupMatch ? groupMatch[1].trim() : targetGid}` });
          } catch (e) {
              console.error('Push message failed:', e.originalError?.response?.data || e);
              return client.replyMessage(event.replyToken, { type: 'text', text: `❌ 無法發送至指定群組，請確認機器人是否在該群組中，或是推送訊息數量/標記超限。\n錯誤內容: ${JSON.stringify(e.originalError?.response?.data || e.message)}` });
          }
      } else {
          try {
              return await client.replyMessage(event.replyToken, messagesToSend);
          } catch (e) {
              console.error('Reply message failed in 推播提醒:', e.originalError?.response?.data || e);
              return client.pushMessage(gid, { type: 'text', text: `❌ 發送失敗，發生異常錯誤（可能是 LINE 標記數量或格式錯誤）。\n錯誤內容: ${JSON.stringify(e.originalError?.response?.data || e.message)}` }).catch(err=>console.error(err));
          }
      }
    }
    
    if (text === '超級清空') {
      const count = Object.keys(games).length;
      const allKeys = Object.keys(games);
      allKeys.forEach(k => delete games[k]);
      for (const k of allKeys) await saveGame(k, true);
      await saveCurrentListSnapshot(null, false);
      pendingSaves.add('__force_save__');
      await flushFileSave();
      return await client.replyMessage(event.replyToken, { type: 'text', text: `💥 超級清空啟動！已強制刪除伺服器上所有群組的 ${count} 個場次。` });
    }

    if (text === '測試場次') {
        const myGames = Object.values(games).map(g => `ID: ${g.gameId}, GID: ${g.gid}, Title: ${g.title}`).join('\n');
        return client.replyMessage(event.replyToken, { type: 'text', text: `Games in memory:\n${myGames || 'none'}\nCurrent GID: ${gid}` });
    }

    if (text.startsWith('接龍修改')) {
      const titleMatch = text.match(/標題\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:日期|時間|地點|費用|人數|候補|備註|名單|$))))/);
      const dateMatch = text.match(/日期\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標題|時間|地點|費用|人數|候補|備註|名單|$))))/);
      const timeMatch = text.match(/時間\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標題|日期|地點|費用|人數|候補|備註|名單|$))))/);
      const locMatch = text.match(/地點\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標題|日期|時間|發布時間|提醒時間|費用|人數|候補|備註|名單|匿名名單|$))))/);
      const feeMatch = text.match(/費用\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標題|日期|時間|發布時間|提醒時間|地點|人數|候補|備註|名單|匿名名單|$))))/);
      const noteMatch = text.match(/備註\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標題|日期|時間|發布時間|提醒時間|地點|費用|人數|候補|名單|標籤|匿名名單|$))))/);
      const tagMatch = text.match(/標籤\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標題|日期|時間|發布時間|提醒時間|地點|費用|人數|候補|備註|名單|匿名名單|$))))/);
      const listMatch = text.match(/名單\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標題|日期|時間|發布時間|提醒時間|地點|費用|人數|候補|備註|標籤|匿名名單|$))))/);
      const anonMatch = text.match(/匿名名單\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標題|日期|時間|發布時間|提醒時間|地點|費用|人數|候補|備註|標籤|名單|$))))/);
      const publishMatch = text.match(/發布時間\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標題|日期|時間|提醒時間|地點|費用|人數|候補|備註|標籤|名單|匿名名單|$))))/);
      const reminderMatch = text.match(/提醒時間\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標題|日期|時間|發布時間|地點|費用|人數|候補|備註|標籤|名單|匿名名單|$))))/);
      
      const limitMatch = text.match(/人數\s*[:：]?\s*(?:[{\uff5b](\d+)[}\uff5d]|(\d+))/);
      const backupMatch = text.match(/候補\s*[:：]?\s*(?:[{\uff5b](\d+)[}\uff5d]|(\d+))/);
      
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
      if (tagMatch) keyword = keyword.replace(tagMatch[0], '');
      if (listMatch) keyword = keyword.replace(listMatch[0], '');
      if (anonMatch) keyword = keyword.replace(anonMatch[0], '');
      if (publishMatch) keyword = keyword.replace(publishMatch[0], '');
      if (reminderMatch) keyword = keyword.replace(reminderMatch[0], '');
      keyword = keyword.trim();

      let groupGames = Object.values(games).filter(g => (g.gid === gid || (g.targetGids && g.targetGids.includes(gid))) && g.active);
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
      if (tagMatch) {
        targetGame.tag = (tagMatch[1] || tagMatch[2]).trim();
      }
      if (listMatch && targetGame.sections[0]) {
         const listStr = (listMatch[1] || listMatch[2]).trim();
         const rawList = listStr.split(/[\s,、，]+/).map(n => n.trim()).filter(Boolean);
         let newList = [];
         let newLevelMap = { ...(targetGame.levelMap || {}) };
         let newPaidMap = { ...(targetGame.paidMap || {}) };
         rawList.forEach(n => {
           let isPaid = false;
           if (n.endsWith('$') || n.endsWith('＄') || n.endsWith('(已繳費)') || n.endsWith('（已繳費）')) {
               isPaid = true;
               n = n.replace(/[\$＄]$/, '').replace(/\(已繳費\)$/, '').replace(/（已繳費）$/, '');
           }
           const match = n.match(/^(.*?)(?:[\(\[（](.*?)[\)\]）]|-(.*?))$/);
           if (match) {
             const trueName = match[1].trim();
             const lvl = (match[2] || match[3]).trim();
             newList.push(trueName);
             newLevelMap[trueName] = lvl;
             if (isPaid) newPaidMap[trueName] = true;
           } else {
             newList.push(n);
             if (isPaid) newPaidMap[n] = true;
           }
         });
         targetGame.sections[0].list = newList;
         targetGame.levelMap = newLevelMap;
         targetGame.paidMap = newPaidMap;
      }
      if (anonMatch && targetGame.sections[0]) {
         targetGame.sections[0].list = targetGame.sections[0].list.filter(n => n !== '__ANON__');
         const anonStr = (anonMatch[1] || anonMatch[2]).trim();
         const num = parseInt(anonStr, 10);
         if (!isNaN(num)) {
             for(let i=0; i<num; i++) targetGame.sections[0].list.push('__ANON__');
         } else {
             const anons = anonStr.split(/[\s,、，]+/).map(n => n.trim()).filter(Boolean);
             for(let i=0; i<anons.length; i++) targetGame.sections[0].list.push('__ANON__');
         }
      }
      if (publishMatch) {
         let ptStr = (publishMatch[1] || publishMatch[2]).trim();
         if (!ptStr.match(/[Z\+\-]/)) ptStr += ' +08:00';
         const dt = new Date(ptStr);
         if (!isNaN(dt.getTime())) targetGame.scheduleTime = dt.getTime();
      }
      if (reminderMatch) {
         let rtStr = (reminderMatch[1] || reminderMatch[2]).trim();
         if (!rtStr.match(/[Z\+\-]/)) rtStr += ' +08:00';
         const dt = new Date(rtStr);
         if (!isNaN(dt.getTime())) targetGame.reminderTime = dt.getTime();
      }
      
      await saveGame(targetGame.gameId, true);
      return await sendLobbyLink(event.replyToken, gid, `✏️ 已成功修改場次：${targetGame.title}`);
    }

    if (text === '接龍名單' || text === '接龍狀態' || text === '接龍查詢' || text === '大廳' || text === '接龍大廳') {
      return await sendLobbyLink(event.replyToken, gid);
    }
    
    if (text === '接龍狀況' || text === '接龍狀態' || isPlusMinus) {
      const getGameTime = (g) => {
        let t = 0;
        if (g.date) {
          let dStr = g.date.trim();
          if (dStr.match(/^\d{1,2}\/\d{1,2}$/)) {
            dStr = new Date().getFullYear() + '/' + dStr;
          }
          const pd = new Date(`${dStr} ${g.time || ''}`.trim());
          if (!isNaN(pd.getTime())) t = pd.getTime();
        }
        return t === 0 ? (g.startTime || 0) : t;
      };

      const targetGames = Object.values(games)
        .filter(g => (g.gid === gid || (g.targetGids && g.targetGids.includes(gid))) && g.active && !g.isManualEnded)
        .sort((a, b) => getGameTime(a) - getGameTime(b));
        
      if (targetGames.length === 0) {
        return client.replyMessage(event.replyToken, { type: 'text', text: '目前沒有進行中的場次喔！' });
      }

      const liffBaseUrl = process.env.LIFF_ID ? `https://liff.line.me/${process.env.LIFF_ID}?gid=${gid}` : null;
      if (!liffBaseUrl) {
        return client.replyMessage(event.replyToken, { type: 'text', text: '尚未設定大廳網址 (LIFF_ID)' });
      }

      const flexContents = [];

      targetGames.forEach((g, index) => {
        if (index >= 15) return;
        const sec = g.sections && g.sections[0] ? g.sections[0] : { list: [], limit: 0 };
        const count = sec.list.length;
        const limit = sec.limit || 0;
        const isFull = limit > 0 && count >= limit;
        const statusText = isFull ? '滿團' : (limit > 0 ? `${count}/${limit}` : `${count}人`);
        const titleText = g.title || g.date || '場次';
        
        let combinedTitle = titleText;
        if (g.date && g.date !== g.title) {
          const shortDate = g.date.replace(/\s*[（\(].*?[)）]\s*/g, '').trim();
          if (shortDate) {
            combinedTitle = `${shortDate} ${titleText}`;
          }
        }

        const isTarget = isPlusMinus && g.title && g.title.length > 1 && cleanText.includes(g.title);

        // 每一列的容器
        const rowContents = [
          { type: "text", text: isTarget ? `🔥 ${combinedTitle}` : combinedTitle, size: "xs", color: "#333333", flex: 4, wrap: false, weight: isTarget ? "bold" : "regular" },
          {
            type: "box",
            layout: "horizontal",
            flex: 0,
            height: "22px",
            width: isFull ? "36px" : "48px",
            cornerRadius: "sm",
            backgroundColor: isFull ? "#ffebee" : "#e8f5e9",
            justifyContent: "center",
            alignItems: "center",
            contents: [
              { type: "text", text: statusText, size: "xxs", color: isFull ? "#ff4c4c" : "#1DB446", align: "center", weight: "bold" }
            ]
          },
          { type: "text", text: "〉", size: "sm", color: "#cccccc", flex: 0, margin: "sm", gravity: "center" }
        ];

        const rowBox = {
          type: "box",
          layout: "horizontal",
          paddingTop: "8px",
          paddingBottom: "8px",
          paddingStart: isTarget ? "10px" : "4px",
          paddingEnd: "4px",
          alignItems: "center",
          action: { type: "uri", label: "查看名單", uri: `${liffBaseUrl}&gameId=${g.gameId}` },
          contents: rowContents
        };

        if (isTarget) {
          rowBox.backgroundColor = "#FFF3CD";
          rowBox.cornerRadius = "md";
        }

        // 分隔線（第一項之後才加）
        if (index > 0 && !isTarget) {
          flexContents.push({ type: "separator", color: "#f4f4f4" });
        }
        if (index > 0 && isTarget) {
          flexContents.push({ type: "box", layout: "vertical", height: "4px", contents: [{ type: "filler" }] });
        }

        flexContents.push(rowBox);

        if (isTarget) {
          flexContents.push({ type: "box", layout: "vertical", height: "4px", contents: [{ type: "filler" }] });
        }
      });

      // 在最下方加入一次性的提示文字
      flexContents.push({
        type: "box",
        layout: "horizontal",
        margin: "lg",
        justifyContent: "center",
        contents: [
          { type: "text", text: "點選上方場次查看詳細名單 👆", size: "xs", color: "#888888", align: "center" }
        ]
      });

      // 如果這是由 LIFF 系統發送的操作通知
      if (isPlusMinus && cleanText !== '+1' && cleanText !== '-1') {
        flexContents.push({
          type: "box",
          layout: "horizontal",
          margin: "md",
          paddingAll: "10px",
          backgroundColor: "#e8f5e9",
          cornerRadius: "md",
          alignItems: "center",
          contents: [
            { type: "text", text: "🔔 最新通知", size: "xs", weight: "bold", color: "#1DB446", flex: 0 },
            { type: "text", text: cleanText, size: "xs", color: "#333333", wrap: true, margin: "sm", flex: 1 }
          ]
        });
      }

      const flexMessage = {
        type: "flex",
        altText: "目前接龍狀況",
        contents: {
          type: "bubble",
          size: "mega",
          header: {
            type: "box",
            layout: "vertical",
            paddingBottom: "none",
            contents: [
              {
                type: "box",
                layout: "horizontal",
                alignItems: "center",
                contents: [
                  { type: "text", text: "🏸 羽球接龍大廳", weight: "bold", size: "md", color: "#1DB446", flex: 1 },
                  {
                    type: "button",
                    style: "primary",
                    color: "#1DB446",
                    height: "sm",
                    flex: 0,
                    action: { type: "uri", label: "進入大廳", uri: liffBaseUrl }
                  }
                ]
              },
              { type: "separator", margin: "md", color: "#eeeeee" }
            ]
          },
          body: {
            type: "box",
            layout: "vertical",
            paddingAll: "16px",
            contents: flexContents
          }
        }
      };

      return await client.replyMessage(event.replyToken, flexMessage);
    }
    
    // 舊的 +1 / -1 阻擋已移除，現在會直接回傳接龍狀況

  } catch (e) {
    console.error('Logic Error:', e);
    const errorMsg = e.originalError?.response?.data 
                   ? JSON.stringify(e.originalError.response.data) 
                   : String(e);
    try {
      if (gid) {
        await client.pushMessage(gid, { type: 'text', text: `❌ 機器人發生系統錯誤，已攔截：\n${errorMsg}` });
      }
    } catch (pushErr) {
      console.error('Failed to push error message:', pushErr);
    }
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
    return null;
  }
  if (!games[gid].sections[idx].list.includes(name)) {
    games[gid].sections[idx].list.push(name);
    if (meta && meta.uid) {
      nameToUidMap.set(`${gid}_${name}`, meta.uid);
    }
    if (meta && meta.level) {
      if (!games[gid].levelMap) games[gid].levelMap = {};
      games[gid].levelMap[name] = meta.level;
    }
    return null;
  }
  return null;
}

async function removeFromList(gid, name, meta = {}, waitForCsv = false) {
  games[gid].sections.forEach((s, idx) => {
    const i = s.list.indexOf(name);
    if (i > -1) {
      s.list.splice(i, 1);
      nameToUidMap.delete(`${gid}_${name}`);
    }
  });
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

async function sendList(token, gameId, prefix = "") {
  const g = games[gameId];
  if (!g) return;
  
  let msg = prefix ? `${prefix}\n` : '';
  msg += `🏸 ${g.title}`;
  
  // 顯示簡短統計
  if (g.sections && g.sections[0]) {
    const listCount = g.sections[0].list.length;
    const limit = g.sections[0].limit;
    msg += `\n目前報名：${listCount} / ${limit} 人`;
  }

  if (g.note) msg += `\n📝 ${g.note}`;
  
  const pushTargets = g.targetGids || [g.gid];
  
  if (token) {
    let replyMsg = msg;
    if (process.env.LIFF_ID) {
      replyMsg += `\n\n👇 點擊下方連結開啟快速報名與查看名單\nhttps://liff.line.me/${process.env.LIFF_ID}?gid=${g.gid}`;
    }
    return await client.replyMessage(token, { type: 'text', text: replyMsg.trim() });
  }
  // 若無 token 則使用 Push Message (用於定時推播)
  for (const targetGid of pushTargets) {
    let currentMsg = msg;
    if (process.env.LIFF_ID) {
      currentMsg += `\n\n👇 點擊下方連結開啟快速報名與查看名單\nhttps://liff.line.me/${process.env.LIFF_ID}?gid=${targetGid}`;
    }
    try {
      await pushToAdmins(targetGid, { type: 'text', text: currentMsg.trim() });
    } catch (e) {
      console.error(`pushToAdmins failed for ${targetGid}:`, e);
    }
  }
}

// 代理推播：將群組訊息轉送給群組管理員 (作為備用推播)
async function pushToAdmins(targetGid, messages) {
  // 因應要求，暫停所有需要消耗推播額度的發話代理功能
  return;
  
  if (!targetGid) return;
  const admins = groupAdmins[targetGid];
  if (!admins || admins.size === 0) {
    console.log(`[Admin Proxy] 群組 ${targetGid} 沒有設定管理員，放棄發送。`);
    return;
  }

  const groupName = groupSettings[targetGid]?.groupName || groupSettings[targetGid]?.lobbyTitle || '您的群組';
  const prefixMsg = { 
    type: 'text', 
    text: `🔔 【系統通知】\n此為「${groupName}」的事件，請協助轉發以下訊息至群組：` 
  };

  const msgsArray = Array.isArray(messages) ? messages : [messages];
  const finalMessages = [prefixMsg, ...msgsArray];

  for (const adminUid of admins) {
    try {
      await client.pushMessage(adminUid, finalMessages);
      console.log(`[Admin Proxy] 已發送通知給管理員: ${adminUid}`);
    } catch (e) {
      console.error(`[Admin Proxy] 發送給管理員 ${adminUid} 失敗:`, e);
    }
  }
}

const port = process.env.PORT || 3000;
const AUTO_WAKE_ENABLED = (process.env.AUTO_WAKE_ENABLED || 'true').toLowerCase() !== 'false';
const AUTO_WAKE_INTERVAL_MINUTES = Math.max(5, parseInt(process.env.AUTO_WAKE_INTERVAL_MINUTES || '10', 10) || 10);

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

app.use(express.json());

// ==========================================
// 🛒 團購專區 API 端點 (Group Buy REST APIs)
// ==========================================

// 取得所有團購列表 (支援多團購活動同時呈現於大廳)
app.get('/api/groupbuy_list', (req, res) => {
  const list = Object.entries(groupBuyData).map(([id, gb]) => ({
    id,
    active: !!gb.active,
    title: gb.title || '團購專區',
    notice: gb.notice || '',
    itemCount: Array.isArray(gb.items) ? gb.items.length : 0,
    orderCount: gb.orders ? Object.keys(gb.orders).length : 0,
    hiddenFromLobby: !!gb.hiddenFromLobby
  }));
  res.json({ success: true, list });
});

// 管理員建立全新團購活動
app.post('/api/groupbuy_create', async (req, res) => {
  const { title, items } = req.body || {};
  const newGid = 'gb_' + Date.now();
  const defaultData = groupBuyData['default'] || {};
  
  groupBuyData[newGid] = {
    id: newGid,
    active: false,
    title: title || '🛒 全新團購活動專區',
    notice: '📢 歡迎選購！請填寫姓名電話，送出後請完成轉帳。',
    paymentSettings: defaultData.paymentSettings || {
      linePayLink: '',
      linePayQrUrl: '',
      bankCode: '822',
      bankName: '中國信託',
      bankAccount: '1234-5678-9012',
      bankAccountName: '團購主辦人'
    },
    items: Array.isArray(items) && items.length > 0 ? items : getZhanRongDefaultItems(),
    orders: {}
  };

  await saveGroupBuyStorage();
  if (typeof io !== 'undefined' && io) io.emit('group_buy_state_updated', { gid: newGid, data: groupBuyData[newGid] });
  res.json({ success: true, gid: newGid, data: groupBuyData[newGid] });
});

// 取得該群組團購狀態
app.get('/api/groupbuy/:gid', (req, res) => {
  const gid = req.params.gid || 'default';
  const data = getGroupBuyInfo(gid);
  res.json({ success: true, data });
});

// 開啟/關閉團購
app.post('/api/groupbuy/:gid/toggle', async (req, res) => {
  const gid = req.params.gid || 'default';
  const { uid, active, hiddenFromLobby } = req.body || {};
  const gb = getGroupBuyInfo(gid);
  
  if (typeof active === 'boolean') {
    gb.active = active;
  } else if (hiddenFromLobby === undefined) {
    gb.active = !gb.active;
  }
  
  if (hiddenFromLobby !== undefined) {
    gb.hiddenFromLobby = hiddenFromLobby;
  }
  
  await saveGroupBuyStorage();
  if (typeof io !== 'undefined' && io) io.emit('group_buy_state_updated', { gid, data: gb });
  res.json({ success: true, active: gb.active });
});

// 儲存團購設定
app.post('/api/groupbuy/:gid/settings', async (req, res) => {
  const gid = req.params.gid || 'default';
  const { uid, title, notice, hiddenFromLobby, paymentSettings, items } = req.body;
  const gb = getGroupBuyInfo(gid);
  if (title !== undefined) gb.title = title;
  if (notice !== undefined) gb.notice = notice;
  if (hiddenFromLobby !== undefined) gb.hiddenFromLobby = hiddenFromLobby;
  if (paymentSettings) gb.paymentSettings = { ...gb.paymentSettings, ...paymentSettings };
  if (Array.isArray(items)) gb.items = items;
  await saveGroupBuyStorage();
  if (typeof io !== 'undefined' && io) io.emit('group_buy_state_updated', { gid, data: gb });
  res.json({ success: true, data: gb });
});

// 儲存為「一鍵帶入」預設範本
app.post('/api/groupbuy/:gid/save_preset', async (req, res) => {
  const { items, presetName } = req.body || {};
  if (!Array.isArray(items)) {
    return res.status(400).json({ success: false, error: '無效的商品資料' });
  }
  defaultMenuItems = items;
  try {
    const dataToSave = { presetName: presetName || '展榮商號 鹿港傳承名產', items };
    await fs.promises.writeFile(DEFAULT_MENU_FILE, JSON.stringify(dataToSave, null, 2), 'utf8');
    res.json({ success: true, count: items.length, presetName: dataToSave.presetName });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 新增或編輯商品品項
app.post('/api/groupbuy/:gid/item/save', async (req, res) => {
  const gid = req.params.gid || 'default';
  const { uid, item } = req.body;
  if (!item || !item.name || item.price === undefined) {
    return res.status(400).json({ success: false, error: '缺少商品名稱或價格' });
  }

  const gb = getGroupBuyInfo(gid);
  if (!Array.isArray(gb.items)) gb.items = [];

  const existingIdx = gb.items.findIndex(i => i.id === item.id);
  const itemObj = {
    id: item.id || 'gb_item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    name: item.name,
    price: Number(item.price) || 0,
    category: item.category || '自訂商品',
    unit: item.unit || '份',
    description: item.description || '',
    contents: item.contents || '',
    imageUrl: item.imageUrl || '',
    linkUrl: item.linkUrl || '',
    linkText: item.linkText || '點我進入'
  };

  if (existingIdx >= 0) {
    gb.items[existingIdx] = itemObj;
  } else {
    gb.items.unshift(itemObj); // 新新增置頂
  }

  await saveGroupBuyStorage();
  if (typeof io !== 'undefined' && io) io.emit('group_buy_state_updated', { gid, data: gb });
  res.json({ success: true, data: itemObj });
});

// 刪除商品品項
app.post('/api/groupbuy/:gid/item/delete', async (req, res) => {
  const gid = req.params.gid || 'default';
  const { uid, itemId } = req.body;
  const gb = getGroupBuyInfo(gid);
  if (Array.isArray(gb.items)) {
    gb.items = gb.items.filter(i => i.id !== itemId);
  }
  await saveGroupBuyStorage();
  if (typeof io !== 'undefined' && io) io.emit('group_buy_state_updated', { gid, data: gb });
  res.json({ success: true });
});

// 批量修改分類名稱
app.post('/api/groupbuy/:gid/category/rename', async (req, res) => {
  const gid = req.params.gid || 'default';
  const { uid, oldName, newName } = req.body;
  const gb = getGroupBuyInfo(gid);
  if (Array.isArray(gb.items)) {
    gb.items.forEach(i => {
      if (i.category === oldName) {
        i.category = newName;
      }
    });
  }
  await saveGroupBuyStorage();
  if (typeof io !== 'undefined' && io) io.emit('group_buy_state_updated', { gid, data: gb });
  res.json({ success: true });
});
// 下單
app.post('/api/groupbuy/:gid/order', async (req, res) => {
  const gid = req.params.gid || 'default';
  const { uid, userName, userPhone, items, paymentMethod, paymentNote, note, anonymous } = req.body;
  if (!uid || !userName) {
    return res.status(400).json({ success: false, error: '缺少使用者資訊' });
  }
  const orderKey = (userName && userPhone) ? `${userName.trim().toLowerCase()}_${userPhone.trim()}` : uid;
  const gb = getGroupBuyInfo(gid);
  if (!gb.orders) gb.orders = {};

  let totalAmount = 0;
  if (items && gb.items) {
    for (const [itemId, qty] of Object.entries(items)) {
      const p = gb.items.find(i => i.id === itemId);
      if (p && qty > 0) {
        totalAmount += (p.price || 0) * qty;
      }
    }
  }

  gb.orders[orderKey] = {
    userId: uid,
    userName,
    userPhone: userPhone || '',
    items: items || {},
    totalAmount,
    paymentMethod: paymentMethod || 'p2p_linepay',
    paymentNote: paymentNote || '',
    paymentStatus: 'unverified',
    note: note || '',
    anonymous: !!anonymous,
    updatedAt: new Date().toISOString()
  };

  await saveGroupBuyStorage();
  if (typeof io !== 'undefined' && io) io.emit('group_buy_state_updated', { gid, data: gb });
  res.json({ success: true, order: gb.orders[orderKey] });
});

// 標記核對付款
app.post('/api/groupbuy/:gid/mark_paid', async (req, res) => {
  const gid = req.params.gid || 'default';
  const { uid, targetUid, status } = req.body;
  const gb = getGroupBuyInfo(gid);
  if (gb.orders && gb.orders[targetUid]) {
    gb.orders[targetUid].paymentStatus = status || 'paid';
    await saveGroupBuyStorage();
    if (typeof io !== 'undefined' && io) io.emit('group_buy_state_updated', { gid, data: gb });
  }
  res.json({ success: true });
});

// 清空所有訂單
app.post('/api/groupbuy/:gid/clear_orders', async (req, res) => {
  const gid = req.params.gid || 'default';
  const { uid } = req.body;
  const gb = getGroupBuyInfo(gid);
  gb.orders = {};
  await saveGroupBuyStorage();
  if (typeof io !== 'undefined' && io) io.emit('group_buy_state_updated', { gid, data: gb });
  res.json({ success: true });
});

// 刪除單筆訂單
app.post('/api/groupbuy/:gid/delete_order', async (req, res) => {
  const gid = req.params.gid || 'default';
  const { targetUid } = req.body;
  const gb = getGroupBuyInfo(gid);
  if (gb.orders && gb.orders[targetUid]) {
    delete gb.orders[targetUid];
    await saveGroupBuyStorage();
    if (typeof io !== 'undefined' && io) io.emit('group_buy_state_updated', { gid, data: gb });
  }
  res.json({ success: true });
});

// 隱藏的 debug 端點，用來印出當前記憶體狀態
app.get('/api/systemLogs', async (req, res) => {
  // 簡易權限檢查
  const { uid } = req.query;
  const isSuperAdminUser = isSuperAdmin(uid);
  
  // 目前先允許 uid 存在就回傳，或直接回傳 (LIFF端會隱藏按鈕)
  res.json(systemLogs);
});

app.get('/api/debug_games', (req, res) => {
  res.json({
    total: Object.keys(games).length,
    games: games
  });
});
loadPromise.then(() => {
  server.listen(port, () => {
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
}).catch(err => {
  console.error('❌ 伺服器啟動初始化失敗:', err);
});

// 設定大廳紀錄「每小時整點」自動儲存上傳
function scheduleHourlySaveLobbyVisits() {
  const now = new Date();
  const delayToNextHour = 3600000 - (now.getMinutes() * 60000 + now.getSeconds() * 1000 + now.getMilliseconds());
  setTimeout(() => {
    saveLobbyVisits().catch(e => console.error(e));
    setInterval(() => {
      saveLobbyVisits().catch(e => console.error(e));
    }, 3600000); // 之後每隔一小時
  }, delayToNextHour);
}
scheduleHourlySaveLobbyVisits();
async function sendLobbyLink(token, gid, prefix = "") {
  let msg = prefix ? `${prefix}\n` : '';
  
  const groupGames = Object.values(games).filter(g => (g.gid === gid || (g.targetGids && g.targetGids.includes(gid))) && g.active && !g.isManualEnded);
  if (groupGames.length === 0) {
    msg += '目前沒有進行中的場次喔！請輸入「接龍開始」來建立。';
  } else {
    msg += `目前共有 ${groupGames.length} 個場次開放報名中 🏸\n`;
  }
  
  if (process.env.LIFF_ID) {
    msg += `\n👇 點擊下方連結進入報名大廳\nhttps://liff.line.me/${process.env.LIFF_ID}?gid=${gid}`;
  }
  
  const message = { type: 'text', text: msg.trim() };
  if (token) {
    return await client.replyMessage(token, message);
  }
  try {
    return await pushToAdmins(gid, message);
  } catch (e) {
    console.error(`pushToAdmins failed for ${gid}:`, e);
    throw e;
  }
}

function getLobbyCard(gid) {
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
              uri: `https://liff.line.me/${process.env.LIFF_ID}?gid=${gid}`
            }
          }
        ]
      }
    }
  };
}
