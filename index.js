const express = require('express');
const pinballPhysics = require('./pinballPhysics');
const { Client, middleware } = require('@line/bot-sdk');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const GAMES_FILE = path.join(__dirname, 'games.json');
const LOG_FILE = path.join(__dirname, 'schedule.log');

// --- ?�單快照 CSV（�?精簡，使??GitHub ?��?�?---
// 位置：data/registrations.csv（GitHub�?
// 欄�?：gid,sectionIdx,name
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
    { id: 'zr_001', category: '?�早?��?�?, name: '?�統油蔥麵茶', price: 150, unit: '�?, description: '鹿港?�承?�早?��?香�??�口，早餐�?下�??��??��?', imageUrl: 'https://cdn.store-assets.com/s/1255165/f/10532819.jpg', linkUrl: 'https://zrsh1986.com', linkText: '點�??�入展榮官網' },
    { id: 'zr_002', category: '?�早?��?�?, name: '?��??��?麵茶', price: 180, unit: '�?, description: '?�添?��?糖�?濃�??��??��??�統麵茶，健康無負�???, imageUrl: 'https://cdn.store-assets.com/s/1255165/f/10553346.jpg', linkUrl: 'https://zrsh1986.com', linkText: '點�??�入展榮官網' },
    { id: 'zr_003', category: '?�早?��?�?, name: '養�?黑�?麻�?', price: 220, unit: '�?, description: '低溫?��??�磨，�????纖�?補給每日?��??�?�??, imageUrl: 'https://cdn.store-assets.com/s/1255165/f/10532819.jpg', linkUrl: 'https://zrsh1986.com', linkText: '點�??�入展榮官網' },
    { id: 'zr_004', category: '?�統點�?', name: '?��??�工?�米�?(黑�???��)', price: 120, unit: '??, description: '?�統壓�??��?，�?上天?��?糖�??��?不�??��?, imageUrl: 'https://cdn.store-assets.com/s/1255165/f/10553346.jpg', linkUrl: 'https://zrsh1986.com', linkText: '點�??�入展榮官網' },
    { id: 'zr_005', category: '?�統點�?', name: '養�?紫米?�米�?, price: 135, unit: '??, description: '?�選?�灣?�地黑�?米�?紫米）�??��??��?滿滿?��?素�?, imageUrl: 'https://cdn.store-assets.com/s/1255165/f/10532819.jpg', linkUrl: 'https://zrsh1986.com', linkText: '點�??�入展榮官網' },
    { id: 'zr_006', category: '?�統點�?', name: '?�早?��?麥花?�酥', price: 150, unit: '??, description: '濃�??��?香氣?��??��?麥�?辦公室�??�零?��?, imageUrl: 'https://cdn.store-assets.com/s/1255165/f/10553346.jpg', linkUrl: 'https://zrsh1986.com', linkText: '點�??�入展榮官網' },
    { id: 'zr_007', category: '低溫?��?', name: '?�味綜�??��? (低溫?��?)', price: 350, unit: '�?, description: '?�腰?�、核桃、�?仁�??��?威夷豆�??�鹽?�油低溫?��???, imageUrl: 'https://cdn.store-assets.com/s/1255165/f/10532819.jpg', linkUrl: 'https://zrsh1986.com', linkText: '點�??�入展榮官網' },
    { id: 'zr_008', category: '低溫?��?', name: '?��??�味?��? (?�大�?', price: 320, unit: '�?, description: '?�選?�大顆腰?��??�然?�味，飽滿酥?��?, imageUrl: 'https://cdn.store-assets.com/s/1255165/f/10553346.jpg', linkUrl: 'https://zrsh1986.com', linkText: '點�??�入展榮官網' },
    { id: 'zr_009', category: '?��?油�?/?�醬', name: '純天?�冷壓�?麻油', price: 480, unit: '??, description: '100% ?�選黑�?麻�?溫冷壓�?溫�??��?絕佳首選??, imageUrl: 'https://cdn.store-assets.com/s/1255165/f/10532819.jpg', linkUrl: 'https://zrsh1986.com', linkText: '點�??�入展榮官網' },
    { id: 'zr_010', category: '?��?油�?/?�醬', name: '?��?純�??�麻??(?�磨)', price: 250, unit: '�?, description: '完全?�添?��??�油，現磨�??��??��?塗麵?��?泡�?宜�?, imageUrl: 'https://cdn.store-assets.com/s/1255165/f/10553346.jpg', linkUrl: 'https://zrsh1986.com', linkText: '點�??�入展榮官網' }
  ];
}

function loadGroupBuyStorage() {
  if (fs.existsSync(DEFAULT_MENU_FILE)) {
    try {
      defaultMenuItems = JSON.parse(fs.readFileSync(DEFAULT_MENU_FILE, 'utf8'));
    } catch(e) { console.error('載入 defaultMenu.json 失�?:', e.message); }
  }
  if (fs.existsSync(GROUP_BUY_FILE)) {
    try {
      groupBuyData = JSON.parse(fs.readFileSync(GROUP_BUY_FILE, 'utf8'));
    } catch(e) { console.error('載入 groupBuy.json 失�?:', e.message); }
  }
  if (!groupBuyData['default'] || !Array.isArray(groupBuyData['default'].items) || groupBuyData['default'].items.length === 0) {
    groupBuyData['default'] = {
      active: false,
      hiddenFromLobby: true,
      title: '?? 展榮?��? 鹿港?�承?�購專�? (1986)',
      notice: '',
      paymentSettings: {
        linePayLink: 'https://zrsh1986.com',
        linePayQrUrl: 'https://cdn.store-assets.com/s/1255165/f/10532819.jpg',
        bankCode: '822',
        bankName: '中�?信�?',
        bankAccount: '1234-5678-9012',
        bankAccountName: '展榮?��?'
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
    } catch(e) { console.error('?��? groupBuy.json 失�?:', e.message); }
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
      title: defaultData.title || '?? 展榮?��? 鹿港?�承?�購專�? (1986)',
      notice: defaultData.notice || '',
      paymentSettings: defaultData.paymentSettings || {
        linePayLink: 'https://zrsh1986.com',
        linePayQrUrl: 'https://cdn.store-assets.com/s/1255165/f/10532819.jpg',
        bankCode: '822',
        bankName: '中�?信�?',
        bankAccount: '1234-5678-9012',
        bankAccountName: '展榮?��?'
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
let easterEggSettings = { enabled: false, message: '?�示此畫?�給Tony?�以?��?一條握?��?', quota: 3, winners: [], activeGame: 'piggy_run', bulletHellLeaderboard: [] };

// 讀?�既?�設�?
let adminsSha = null;
let superAdminsSha = null;
let codesSha = null;
let settingsSha = null;
let templatesSha = null;
let gamesSha = null; // GitHub games.json ??SHA
let visitsSha = null; // GitHub lobbyVisits.json ??SHA
let easterEggSha = null; // GitHub easterEggSettings.json ??SHA
let groupBuySha = null; // GitHub groupBuy.json ??SHA
let gamesSaveChain = Promise.resolve(); // ?�併?�串行�?�?
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
      console.log('�?GitHub 讀??groupAdmins.json...');
      const adminRes = await githubApiRequest('GET', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/groupAdmins.json?ref=${GITHUB_BRANCH}`);
      if (adminRes.content) {
        adminsSha = adminRes.sha;
        const data = JSON.parse(Buffer.from(adminRes.content, 'base64').toString('utf8'));
        groupAdmins = {};
        for (const [g, admins] of Object.entries(data)) {
          groupAdmins[g] = new Set(admins);
        }
      }
    } catch(e) { console.error('?��?�?GitHub 讀??groupAdmins.json:', e.message); }

    try {
      console.log('�?GitHub 讀??superAdmins.json...');
      const saRes = await githubApiRequest('GET', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/superAdmins.json?ref=${GITHUB_BRANCH}`);
      if (saRes.content) {
        superAdminsSha = saRes.sha;
        const data = JSON.parse(Buffer.from(saRes.content, 'base64').toString('utf8'));
        superAdmins = new Set(data);
      }
    } catch(e) { console.error('?��?�?GitHub 讀??superAdmins.json:', e.message); }

    try {
      console.log('�?GitHub 讀??groupCodes.json...');
      const codesRes = await githubApiRequest('GET', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/groupCodes.json?ref=${GITHUB_BRANCH}`);
      if (codesRes.content) {
        codesSha = codesRes.sha;
        groupCodes = JSON.parse(Buffer.from(codesRes.content, 'base64').toString('utf8'));
      }
    } catch(e) { console.error('?��?�?GitHub 讀??groupCodes.json:', e.message); }

    try {
      console.log('�?GitHub 讀??groupSettings.json...');
      const settingsRes = await githubApiRequest('GET', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/groupSettings.json?ref=${GITHUB_BRANCH}`);
      if (settingsRes.content) {
        settingsSha = settingsRes.sha;
        groupSettings = JSON.parse(Buffer.from(settingsRes.content, 'base64').toString('utf8'));
      }
    } catch(e) { console.error('?��?�?GitHub 讀??groupSettings.json:', e.message); }

    try {
      console.log('�?GitHub 讀??rosterTemplates.json...');
      const templatesRes = await githubApiRequest('GET', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/rosterTemplates.json?ref=${GITHUB_BRANCH}`);
      if (templatesRes.content) {
        templatesSha = templatesRes.sha;
        rosterTemplates = JSON.parse(Buffer.from(templatesRes.content, 'base64').toString('utf8'));
      }
    } catch(e) { console.error('?��?�?GitHub 讀??rosterTemplates.json:', e.message); }

    try {
      console.log('�?GitHub 讀??games.json...');
      const gamesRes = await githubApiRequest('GET', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/games.json?ref=${GITHUB_BRANCH}`);
      if (gamesRes.content) {
        gamesSha = gamesRes.sha;
        const rawStr = Buffer.from(gamesRes.content, 'base64').toString('utf8');
        const parsedGames = JSON.parse(rawStr);
        // ?�接?�併?�全??games ?�件，loadGames() 後�??��?結�?�????
        for (const [k, v] of Object.entries(parsedGames)) {
          if (typeof v === 'string') {
            try { games[k] = JSON.parse(v); } catch(e) { games[k] = v; }
          } else {
            games[k] = v;
          }
        }
        console.log(`已�? GitHub 載入 ${Object.keys(parsedGames).length} 筆場次�??�`);
      }
    } catch(e) { console.error('?��?�?GitHub 讀??games.json:', e.message); }

    try {
      console.log('�?GitHub 讀??lobbyVisits.json...');
      const visitsRes = await githubApiRequest('GET', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/lobbyVisits.json?ref=${GITHUB_BRANCH}`);
      if (visitsRes.content) {
        visitsSha = visitsRes.sha;
        lobbyVisits = JSON.parse(Buffer.from(visitsRes.content, 'base64').toString('utf8'));
      }
    } catch(e) { console.error('?��?�?GitHub 讀??lobbyVisits.json:', e.message); }

    try {
      console.log('�?GitHub 讀??easterEggSettings.json...');
      const eeRes = await githubApiRequest('GET', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/easterEggSettings.json?ref=${GITHUB_BRANCH}`);
      if (eeRes.content) {
        easterEggSha = eeRes.sha;
        easterEggSettings = JSON.parse(Buffer.from(eeRes.content, 'base64').toString('utf8'));
        if (!easterEggSettings.activeGame) easterEggSettings.activeGame = 'piggy_run';
        if (!easterEggSettings.bulletHellLeaderboard) easterEggSettings.bulletHellLeaderboard = [];
      }
    } catch(e) { console.error('?��?�?GitHub 讀??easterEggSettings.json:', e.message); }
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
    } catch(e) { console.error('?�份 groupAdmins ??GitHub 失�?:', e.message); }
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
    } catch(e) { console.error('?�份 superAdmins ??GitHub 失�?:', e.message); }
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
    } catch(e) { console.error('?�份 groupCodes ??GitHub 失�?:', e.message); }
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
    } catch(e) { console.error('?�份 groupSettings ??GitHub 失�?:', e.message); }
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
    } catch(e) { console.error('?�份 rosterTemplates ??GitHub 失�?:', e.message); }
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
    } catch(e) { console.error('?�份 lobbyVisits ??GitHub 失�?:', e.message); }
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
    } catch(e) { console.error('?�份 easterEggSettings ??GitHub 失�?:', e.message); }
  }
}

// GitHub 設�?（�??��?變數讀?��?
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || process.env.GITHUB_REPOSITORY?.split('/')[0];
const GITHUB_REPO = process.env.GITHUB_REPO || process.env.GITHUB_REPOSITORY?.split('/')[1];
const GITHUB_CSV_PATH = process.env.GITHUB_CSV_PATH || 'data/registrations.csv';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const USE_GITHUB = !!(GITHUB_TOKEN && GITHUB_OWNER && GITHUB_REPO);

if (USE_GITHUB) {
  console.log(`??使用 GitHub ?��? CSV: ${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_CSV_PATH}`);
  console.log(`   ?�支: ${GITHUB_BRANCH}`);
  console.log(`   Token: ${GITHUB_TOKEN ? GITHUB_TOKEN.substring(0, 8) + '...' : '?�設�?}`);
} else {
  console.log('?��?  ?�設�?GitHub ?��?變數，�?使用?�地檔�??��?');
  console.log('   ?�要設�? GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO');
  console.log('   ?��??�??');
  console.log(`     GITHUB_TOKEN: ${GITHUB_TOKEN ? '已設�? : '???�設�?}`);
  console.log(`     GITHUB_OWNER: ${GITHUB_OWNER || '???�設�?}`);
  console.log(`     GITHUB_REPO: ${GITHUB_REPO || '???�設�?}`);
}

let regCsvWriteChain = Promise.resolve(); // 併發保護：�??�寫?�串?�單一 Promise 佇�?
let regCsvLastBackupYMD = null;
let regCsvContent = ''; // 快�? CSV ?�容（用??GitHub 模�?�?
let regCsvSha = null; // GitHub 檔�???SHA（用?�更?��?

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // ?�逗�??��??�、�?行就必�??��?引�??�起來�?並�?引�?變�??�個�???
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// GitHub API 輔助?�數
async function githubApiRequest(method, endpoint, data = null) {
  const url = `https://api.github.com${endpoint}`;
  
  const headers = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`, // 使用 Bearer ?��?
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
      timeout: 10000 // 10秒�???
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
            console.error(`??GitHub API ?�誤 [${res.statusCode}]:`, errorMsg);
            reject(new Error(`GitHub API Error: ${res.statusCode} - ${errorMsg}`));
          }
        } catch (e) {
          console.error('??�?? GitHub API ?��?失�?:', e.message, 'Response:', responseBody.substring(0, 200));
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    });
    
    req.on('error', (err) => {
      console.error('??GitHub API 請�?失�?:', err.message);
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

// �?GitHub 讀??CSV
async function loadCsvFromGitHub() {
  if (!USE_GITHUB) {
    console.log('?��?  GitHub 模�??��??��?跳�?讀??);
    return null;
  }
  
  try {
    const endpoint = `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(GITHUB_CSV_PATH)}?ref=${GITHUB_BRANCH}`;
    console.log(`?�� �?GitHub 讀??CSV: ${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_CSV_PATH}`);
    const response = await githubApiRequest('GET', endpoint);
    
    if (response.content) {
      // GitHub API 返�? base64 編碼?�內�?
      const content = Buffer.from(response.content, 'base64').toString('utf8');
      regCsvSha = response.sha;
      regCsvContent = content;
      const recordCount = content.split('\n').length - 1; // 減去標�?�?
      console.log(`??�?GitHub 載入 CSV: ${recordCount} 筆�??�`);
      logToFile(`[SUCCESS] Loaded CSV from GitHub: ${recordCount} records`);
      return content;
    } else {
      throw new Error('GitHub API ?��?中�???content 欄�?');
    }
  } catch (e) {
    if (e.message.includes('404') || e.message.includes('Not Found')) {
      console.log('?��?  GitHub 上�??��? CSV 檔�?，�?建�??��?�?);
      regCsvContent = 'gid,sectionIdx,name\n';
      regCsvSha = null; // ?��?案�???SHA
      return null;
    }
    console.error('??�?GitHub 讀??CSV 失�?:', e.message);
    console.error('   端�?:', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_CSV_PATH}`);
    logToFile(`[ERROR] Failed to load CSV from GitHub: ${e.message}`);
    
    // 如�?讀?�失?��??�試從本?��?案�??��?如�??��?
    try {
      if (fs.existsSync(REG_CSV_FILE)) {
        const localContent = await fs.promises.readFile(REG_CSV_FILE, 'utf8');
        regCsvContent = localContent;
        console.log('?��?  已�??�地檔�?載入 CSV（GitHub 讀?�失?��?');
        return localContent;
      }
    } catch (localError) {
      console.error('???�地檔�?載入也失??', localError.message);
    }
    
    return null;
  }
}

// 寫入 CSV ??GitHub
async function writeCsvToGitHub(content, message = 'Update registrations.csv', allowRetry = true) {
  if (!USE_GITHUB) {
    console.log('?��?  GitHub 模�??��??��?跳�?寫入');
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
      data.sha = regCsvSha; // ?�新?��?檔�??��?SHA
      console.log(`?? ?�新 GitHub CSV (SHA: ${regCsvSha.substring(0, 8)}...)`);
    } else {
      console.log(`?? 建�???GitHub CSV 檔�?`);
    }
    
    const response = await githubApiRequest('PUT', endpoint, data);
    
    if (response.content && response.content.sha) {
      regCsvSha = response.content.sha;
      regCsvContent = content;
      console.log(`??CSV 已寫??GitHub (${content.split('\n').length - 1} 筆�???`);
      logToFile(`[SUCCESS] CSV written to GitHub: ${content.split('\n').length - 1} records`);
      return true;
    } else {
      throw new Error('GitHub API ?��??��??�誤：缺�?content.sha');
    }
  } catch (e) {
    // ?��???SHA 衝�?�?09）�??��??��??��??��?案�??�試一�?
    const isShaConflict = String(e.message).includes('409') || String(e.message).includes('does not match');
    if (isShaConflict && allowRetry) {
      console.warn('?��?  ?�測??GitHub SHA 衝�?，�??��??��??�試一�?);
      try {
        await loadCsvFromGitHub();
      } catch (reloadErr) {
        console.error('???�新載入 GitHub CSV 失�?:', reloadErr.message);
      }
      return await writeCsvToGitHub(content, message, false);
    }

    console.error('??寫入 CSV ??GitHub 失�?:', e.message);
    console.error('   端�?:', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_CSV_PATH}`);
    console.error('   ?�支:', GITHUB_BRANCH);
    logToFile(`[ERROR] Failed to write CSV to GitHub: ${e.message}`);
    
    // 如�?寫入失�?，�?級到?�地檔�?模�?（至少�??��??��?
    try {
      await fs.promises.mkdir(DATA_DIR, { recursive: true });
      await fs.promises.writeFile(REG_CSV_FILE, content, 'utf8');
      console.log('?��?  已�?級到?�地檔�?模�??��?');
      logToFile(`[WARN] Fallback to local file storage`);
    } catch (fallbackError) {
      console.error('???�地檔�??�份也失??', fallbackError.message);
    }
    
    return false;
  }
}

async function ensureRegCsvReady() {
  if (USE_GITHUB) {
    // GitHub 模�?：確保已載入?�容
    if (!regCsvContent) {
      await loadCsvFromGitHub();
      if (!regCsvContent) {
        regCsvContent = 'gid,sectionIdx,name,limit,backupLimit,title\n';
      }
    }
  } else {
    // ?�地檔�?模�?
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
    // 沒�?檔�?就�??�份
    if (!fs.existsSync(REG_CSV_FILE)) return;
    await fs.promises.mkdir(REG_CSV_BACKUP_DIR, { recursive: true });
    const backupPath = path.join(REG_CSV_BACKUP_DIR, `registrations-${today}.csv`);
    // ?��?天只?�份一次�??�已存在就跳?��?
    if (fs.existsSync(backupPath)) return;
    await fs.promises.copyFile(REG_CSV_FILE, backupPath);
  } catch (e) {
    console.error('Failed to backup registrations.csv:', e);
    logToFile(`[WARN] Failed to backup registrations.csv: ${e.message}`);
  }
}

// 保�??��??��??�單快照??CSV（只記�??��??�?��?不�??�歷?��?作�?
async function saveCurrentListSnapshot(gid, waitForWrite = false) {
  const rows = [];
  
  // 建�? CSV ?�容：只記�??��??�單中�?每個人（�??�場次�?
  Object.values(games).forEach((g) => {
    if (!g || !g.sections) return;
    g.sections.forEach((section, sectionIdx) => {
      section.list.forEach((name) => {
        // ?��??�實?��?不�??�匿?��?位符
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
          console.log(`?? 保�??��??�單快照??GitHub: ${label} (${rows.length} �?`);
          const success = await writeCsvToGitHub(csvContent, `Update current list snapshot: ${label}`);
          
          if (!success) {
            throw new Error('GitHub 寫入失�?');
          }
        } else {
          // ?�地檔�?模�?：�??�寫?��?不是追�?�?
          await fs.promises.writeFile(REG_CSV_FILE, csvContent, 'utf8');
          const label = gid ? (games[gid]?.title || gid) : 'all-groups';
          console.log(`??已�?存接龍�??�快?? ${label} (${rows.length} �?`);
        }
      } catch (e) {
        console.error('??Failed to save list snapshot:', e);
        logToFile(`[ERROR] Failed to save list snapshot: ${e.message}`);
        throw e;
      }
    });

  regCsvWriteChain = writePromise.catch((e) => {
    console.error('?��?  CSV 寫入?�中?�錯誤�?已�??��?繼�??��?�?', e.message);
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
    const rawTitle = idxTitle >= 0 ? (cols[idxTitle] || '').trim() : '羽�??��?';
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
        title: idx === 0 ? '?��??�單' : `?��?{idx + 1}`,
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

// 強制以台????��?行�??��??��?）�??��?顯示??UTC
if (!process.env.TZ) process.env.TZ = 'Asia/Taipei';

// ?�濾?��???checkSchedules ?��??��?，避?��?秒刷�?
const _origConsoleLog = console.log;
console.log = (...args) => {
  const shouldSkip = args.some(a => typeof a === 'string' && a.includes('[checkSchedules]'));
  if (shouldSkip) return;
  _origConsoleLog(...args);
};

// 簡�??��??�數 - 使用?�步寫入?��??��?
let logQueue = [];
let isWritingLog = false;
let lastFileSizeCheck = 0;
const FILE_SIZE_CHECK_INTERVAL = 60 * 1000; // �?0秒檢?��?次�?件大�?

async function logToFile(msg) {
  // ?�在?��?訊息?��??�到?�件，大幅�?少I/O?��?
  // ?��??�錯誤、觸?��?件�?警�?
  if (!msg.includes('[ERROR]') && !msg.includes('[TRIGGER]') && !msg.includes('[WARN]') && !msg.includes('[SUCCESS]')) {
    return; // ?��??��?要�?�?
  }
  
  const logEntry = `[${new Date().toISOString()}] ${msg}\n`;
  logQueue.push(logEntry);
  
  if (!isWritingLog) {
    isWritingLog = true;
    setImmediate(async () => {
      while (logQueue.length > 0) {
        const entries = logQueue.splice(0, 10); // ?��?寫入，�?少I/O
        try {
          await fs.promises.appendFile(LOG_FILE, entries.join(''), 'utf8');
          
          // 減�??�件大�?檢查?��?（�?60秒檢?��?次�?
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
  console.warn('?��? ?��?�?pg 套件，�?使用記憶體模�?(請執�?npm install pg)');
}

// 從環境�??��??��??��?訊�??��?洩露??Git
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || 'fake_token',
  channelSecret: process.env.LINE_CHANNEL_SECRET || 'fake_secret'
};

if (!process.env.LINE_CHANNEL_ACCESS_TOKEN || !process.env.LINE_CHANNEL_SECRET) {
  console.warn('?��? 警�?：未設�? LINE ?��?變數，本機�?以�? Token ?��?（LINE Bot 訊息?�能將失?��?但網?�可�?��測試�?);
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
app.use((req, res, next) => {
  // Skip JSON parsing for /webhook ??LINE SDK middleware needs the raw body
  if (req.path === '/webhook') return next();
  express.json()(req, res, next);
});

// ?��?存儲：支?��?群�??��??��?
let games = {};
let systemLogs = [];
const nameToUidMap = new Map();
// 從環境�??��??�管?�員密碼，�??�未設�??�使?��?設值�?不建議�?
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '?��??�豬�?;

// ?�戶?�稱快�?，�?�?API ?�叫以�??��?�?
const userNameCache = new Map(); // key: "gid_uid", value: { name, timestamp }
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24小�?快�??��??��?

// UID ?��?稱�??��?（�??�單中�??��?，用?�快?�匹?��?減�? API ?�叫
const uidToNameMap = new Map(); // key: "gid_uid", value: name

// 追蹤首次使用?�令?�群組�??�於顯示歡�?訊息，而�??�入?�推?��?
const firstUseGroups = new Set(); // 記�?已�?顯示?�歡迎�??��?群�?

// === 權�?輔助?��? ===
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

// PostgreSQL ???設�?（已?�用，改??CSV 檔�??��?�?
// 如�?不�?�?PostgreSQL，可以移?��?註解?�以下�?式碼
// ?��?強制使用檔�?模�?，避?��???�誤訊息
if (!process.env.DATABASE_URL) {
  console.log('?��?  使用檔�?模�??��?資�?（games.json + registrations.csv�?);
} else {
  console.log('?��?  已�???PostgreSQL，使?��?案模式儲存�??��?games.json + registrations.csv�?);
}

let pool = null;
// ?�用 PostgreSQL ???，強?�使?��?案模�?
/*
if (Pool && process.env.DATABASE_URL) {
  console.log('?�試????��??�庫:', process.env.DATABASE_URL.replace(/:([^:@]+)@/, ':****@'));
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 2, // ?�費?��??��?��??
    idleTimeoutMillis: 30000, // 30秒�??��?空�???��
    connectionTimeoutMillis: 5000 // 5秒�?��超�?
  });
  
  // ?��???��?�誤，避?�崩�?
  pool.on('error', (err) => {
    console.error('Unexpected database pool error:', err);
  });
}
*/

async function initializeApp() {
  console.log('?? ?��?中�?�?��??GitHub 載入系統設�??��?份�???..');
  await loadData();
  
  console.log('?? ?��?中�?�?��載入?�地/?�地緩�??�次...');
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
      console.log('?��?  資�?庫�??失�?，已?��??��?案模�?);
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
      console.error('?��?  載入 GitHub CSV 失�?（�?繼�?使用?�地模�?�?', err.message);
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
      console.log(`已�?資�?庫�???${res.rowCount} 筆接龍�??�`);
    } else {
      // 如�?已�? GitHub 載入資�?，就不�??�地檔�?覆�?
      const alreadyLoadedFromGithub = USE_GITHUB && Object.keys(games).length > 0;
      if (!alreadyLoadedFromGithub && fs.existsSync(GAMES_FILE)) {
        try {
          const content = fs.readFileSync(GAMES_FILE, 'utf8') || '{}';
          const obj = JSON.parse(content);
          games = obj || {};
          console.log(`已�? ${GAMES_FILE} 載入 ${Object.keys(games).length} 筆接龍�??�`);
        } catch (e) {
          console.error('從�?案�??�接龍�??�失??', e);
        }
      } else if (alreadyLoadedFromGithub) {
        console.log(`已�? GitHub 載入?�次資�?，跳?�本?��?案�??�`);
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

    // ?��??��?建�??��?中�? UID ?��?�?
    for (const [id, g] of Object.entries(games)) {
      if (g.uidMap) {
        for (const [name, uid] of Object.entries(g.uidMap)) {
          nameToUidMap.set(`${id}_${name}`, uid);
          nameToUidMap.set(`${g.gid}_${name}`, uid);
          uidToNameMap.set(`${id}_${uid}`, name);
        }
      }
    }

    if (oldKeysToDelete.length > 0) {
      console.log('?��?資�?庫遷移�??�除?��?構並?��??��?�?..');
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
    console.error('載入資�?失�?:', e);
  }
}

// 檔�?寫入?��?，避?�頻繁寫??
let saveFileTimeout = null;
let pendingSaves = new Set();
let isShuttingDown = false;

// 立即寫入檔�?（用?��??��??��??��??��?
async function flushFileSave() {
  if (pendingSaves.size === 0) return;
  try {
    await fs.promises.writeFile(GAMES_FILE, JSON.stringify(games, null, 2), 'utf8');
    pendingSaves.clear();
    console.log('???��?資�?已寫?��?�?);
  } catch (e) {
    console.error('???��??��?資�??��?案失??', e);
  }

  // ?�步?��???GitHub
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
          console.log('???�次資�?已�?步儲存至 GitHub (data/games.json)');
        } catch(e) {
          const isShaConflict = String(e.message).includes('409') || String(e.message).includes('does not match');
          if (isShaConflict && allowRetry) {
            console.warn('?��? ?�測??GitHub games.json SHA 衝�?，�??��?得�???SHA 後�?�?);
            try {
              const getRes = await githubApiRequest('GET', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/games.json?ref=${GITHUB_BRANCH}`);
              if (getRes.sha) gamesSha = getRes.sha;
            } catch (getErr) {
              console.error('???��??��??�?��? games.json SHA:', getErr.message);
            }
            await attemptSave(false);
          } else {
            console.error('???��? games.json ??GitHub 失�?:', e.message);
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
    
    // 1. ?��??��??��? (scheduleTime)
    if (g.scheduleTime) {
      const sched = Number(g.scheduleTime);
      if (isNaN(sched)) {
        logToFile(`[WARN] Invalid scheduleTime for ${gameId}: ${g.scheduleTime}`);
        delete g.scheduleTime;
        await saveGame(gameId);
      } else if (sched <= now) {
        logToFile(`[TRIGGER] TRIGGER! Sending scheduled list for ${gameId}`);
        delete g.scheduleTime; // 移除設�??��??��?觸發
        await saveGame(gameId);
        try { 
          await sendList(null, gameId, "??定�??�播");
          logToFile(`[SUCCESS] Scheduled push sent for ${gameId}`);
        } catch (e) { 
          console.error('Failed to push scheduled list:', e);
          logToFile(`[ERROR] Failed to push scheduled list: ${e.message}`);
        }
      }
    }
    
    // 2. ?��?溫馨?��? (reminderTime)
    if (g.reminderTime) {
      const rem = Number(g.reminderTime);
      if (isNaN(rem)) {
        logToFile(`[WARN] Invalid reminderTime for ${gameId}: ${g.reminderTime}`);
        delete g.reminderTime;
        await saveGame(gameId);
      } else if (rem <= now) {
        logToFile(`[TRIGGER] TRIGGER! Sending reminder for ${gameId}`);
        delete g.reminderTime; // 移除設�??��??��?觸發
        await saveGame(gameId);
        try {
          const pushTargets = g.targetGids || [g.gid];
          for (const targetGid of pushTargets) {
            try {
              // ?��?要�?，暫?��??��?消耗�?度�??�播?�能
              // await client.pushMessage(targetGid, { type: 'text', text: `??溫馨?��?：�?${g.title} ???��??��?！\n請�??��??�群?�注?��??��?！` });
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
      console.error('資�?庫儲存失??', e);
      // ?��??��?案�?�?
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
  if (saveFileTimeout) return; // 已�??��?，�?待執�?
  saveFileTimeout = setTimeout(async () => {
    saveFileTimeout = null;
    await flushFileSave();
  }, 500); // ?��?�?00ms?��?多個�?存�?求�?併為一�?
}

async function deleteGame(gid) {
  delete games[gid];
  if (pool) {
    try {
      await pool.query('DELETE FROM games WHERE gid = $1', [gid]);
    } catch (e) {
      console.error('資�?庫刪?�失??', e);
    }
  }
  // 檔�??�在下次saveGame?�自?�更??
  pendingSaves.add('__all__'); // 標�??�要�?�?
  scheduleFileSave();
}

// ?��?清除超�? 7 天�??��?資�?
const EXPIRY_TIME = 7 * 24 * 60 * 60 * 1000; // 7�?
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
      console.log(`群�? ${gid} ?��?已�??�自?�刪?�`);
      await deleteGame(gid);
      await saveCurrentListSnapshot(null, false);
    }
  }
}
checkExpiredGames().catch(console.error); // ?��??�檢?��?�?

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

// ?��?檢查?�執行�?，避?��???
let checkingSchedules = false;

// 定�??�播檢查 (已�?併至上方 checkSchedules 實�?�?
// 每�??��?00秒�?檢查一次�?�?
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
  
  // 計�??��?一?�整?��??�延?��???
  const now = new Date();
  const msUntilNextMinute = ((60 - now.getSeconds()) * 1000) - now.getMilliseconds();
  const delay = msUntilNextMinute > 0 ? msUntilNextMinute : 60 * 1000;
  
  setTimeout(() => {
    executeCheck();
    // 之�?�?0秒執行�?次�?對�?每�???0秒�?
    setInterval(executeCheck, 60 * 1000);
  }, delay);
}

// 待�??��??��?立即檢查一次�?以恢復並觸發?��?機�??�已?��??��??��??��?
loadPromise.then(async () => {
  const restored = await restoreGamesFromCsv().catch((e) => {
    console.error('Failed to restore games from CSV:', e);
    return false;
  });
  if (restored) {
    console.log('??已�? CSV ?��??��??�單');
  }
  console.log('[Startup] Data loaded, performing initial schedule check');
  return checkSchedules().catch(console.error);
}).then(() => {
  // 資�?載入完�?後�??��?每�??��??�檢??
  startMinuteCheck();
}).catch(console.error);

// ?�康檢查端�? - ?�於保�??��??��???
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    gamesCount: Object.keys(games).length
  });
});

// LIFF 系統設�?
app.get('/api/config', (req, res) => {
  res.json({ liffId: process.env.LIFF_ID || '' });
});

// ?��??��?群�??�?�進�?中�??��?
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
      return "?�知群�? (Bot已退??";
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
    return res.status(404).json({ error: '?��??�該群�?�??' });
  }
});

// --- Server-Sent Events (SSE) ?�播機制 ---
const sseClients = new Map(); // gid -> Set of Response objects

app.get('/api/events/:gid', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // ?��?X-Accel-Buffering 來�???Nginx ?�緩�?
  res.setHeader('X-Accel-Buffering', 'no');
  
  // ?��?????��?，發?��?始空註解，並?�入 2KB ??padding 強制?�送緩衝�?
  res.write(':' + Array(2048).join(' ') + '\n\n');
  if (res.flush) res.flush();

  const gid = req.params.gid;
  if (!sseClients.has(gid)) {
    sseClients.set(gid, new Set());
  }
  const clientsSet = sseClients.get(gid);
  clientsSet.add(res);

  // 每�?一段�??�發??ping 以�??��??
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

// --- ?�購專�? (Group Buy) API 端�? ---
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
    return res.status(403).json({ error: '沒�?管�??��??? });
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
    return res.status(400).json({ error: '請�?供�?填�?�? });
  }
  const info = getGroupBuyInfo(gid);
  if (!info.active) {
    return res.status(400).json({ error: '?��??�購?��??? });
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
  const lobbyTitle = groupSettings[gid]?.lobbyTitle || '羽�??��?大廳';
  const lobbyDesc = groupSettings[gid]?.lobbyDesc || '?�週臨?��?額�??��?趕快?��?，�??��?豬�?起快樂揮?�吧�?;
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
        const gName = groupSettings[g]?.groupName || '?�命?�群�?;
        managedGroups.push({ gid: g, code: g === gid ? '?��?群�?' : '?�代�?, groupName: gName });
      }
    }
  }

  let groupGames = Object.values(games).filter(g => {
    if (!g.active) return false;
    if (g.isManualEnded && !isAdmin) return false;
    if (g.gid === gid) return true;
    if (g.targetGids && g.targetGids.includes(gid)) return true;
    
    // 超�?管�??�模式�?如�??�個人?�天室中，�???SUPER_ADMIN，�?顯示系統?�「�??�」活躍場�?
    if (gid === uid && superAdmin) {
      return true;
    }
    
    // 如�?管�??�是從個人?�天�??�接網�??�入 (gid === uid)，顯示�??��?管�??�群組�??�次
    if (gid === uid) {
      // 檢查此場次是?�屬?��?管�??�任何�??�群�?
      const isManaged = managedGroups.some(mg => 
        mg.gid === g.gid || (g.targetGids && g.targetGids.includes(mg.gid))
      );
      if (isManaged) return true;
    }
    
    return false;
  });
  console.log(`[API] Fetching games for gid: ${gid}, Found: ${groupGames.length}, Total games: ${Object.keys(games).length}`);


  if (groupGames.length === 0) {
      return res.json({ games: [], isAdmin: !!isAdmin, isSuperAdmin: !!superAdmin, managedGroups, lobbyTitle, lobbyDesc }); // 不報?��??�傳空陣??
  }
  
  // 深拷貝以?��?污�?記憶體中??games ?�件
  groupGames = JSON.parse(JSON.stringify(groupGames));
  
  // ?��??��? uid，�?上該?�戶?��??��???
  if (uid) {
    groupGames.forEach(g => {
      g.myRegisteredNames = g.sections[0].list.filter(name => {
        return nameToUidMap.get(`${g.gameId}_${name}`) === uid;
      });
    });
  }
  
  // ?�慧?��?：�?試解?�日??(�?7/3, 10/1)，�??��??��??�。若?�日?��?依建立�??��?�?
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
      return dateA - dateB; // ?��??��??��???
    }
    // 如�??��??��?，�??�都沒寫?��?，�?依建立�??��?�?(?��??��??��??��??��??��??�設?�新?�在?�面)
    return b.startTime - a.startTime;
  });
  
  // ?�傳結�?
  res.json({ games: groupGames, isAdmin: !!isAdmin, isSuperAdmin: !!superAdmin, managedGroups, lobbyTitle, lobbyDesc });
});

// ?��??��?群�??��?設�??��???
// 大廳點�?紀?��??��?
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

  // 每�??�只記�?一�?
  const now = Date.now();
  if (now - groupStats.uniqueViewers[userId].lastVisit < 60000) {
    return res.json({ success: true, message: 'Throttled' });
  }

  groupStats.viewCount = (groupStats.viewCount || 0) + 1;
  
  groupStats.uniqueViewers[userId].displayName = displayName; // update latest name
  groupStats.uniqueViewers[userId].lastVisit = now;
  groupStats.uniqueViewers[userId].count++;

  // 記�??�近�??�訪
  groupStats.logs.unshift({ time: now, userId, displayName, pictureUrl });
  
  // 保�??��?200 筆即?��??��??��??�長�?
  if (groupStats.logs.length > 200) {
    groupStats.logs = groupStats.logs.slice(0, 200);
  }
  
  res.json({ success: true });
});

app.get('/api/lobby_stats/:gid', (req, res) => {
  const gid = req.params.gid;
  const uid = req.query.uid;
  
  // 驗�??�否?��?級管?�員
  const isAdmin = uid && isSuperAdmin(uid);
  if (!isAdmin) {
    return res.status(403).json({ error: '?��?超�?管�??�能?��?大廳?��??��?' });
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
  if (!uid) return res.status(403).json({ error: '?��?uid' });

  const isSuperAdminUser = isSuperAdmin(uid);
  let adminGids = [];

  if (isSuperAdminUser) {
    adminGids = Object.keys(lobbyVisits);
  } else {
    // ?�使??groupAdmins 也無法使?�此 API，直?�阻??
    return res.status(403).json({ error: '?��?超�?管�??�能?��??��??��??��?' });
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

// ?��?/?�除?��?群�??��?設�??��???
app.post('/api/templates/:gid', express.json(), async (req, res) => {
  const gid = req.params.gid;
  const { action, name, content, uid } = req.body;
  
  const isAdmin = uid && Object.values(groupAdmins).some(admins => admins.has(uid));
  if (!isAdmin) {
    return res.status(403).json({ error: '?��?管�??�能修改?�設?�單' });
  }
  
  if (!rosterTemplates[gid]) rosterTemplates[gid] = {};
  
  if (action === 'save') {
    if (!name || !content) {
      return res.status(400).json({ error: '?�稱?�內容�??�為�? });
    }
    rosterTemplates[gid][name] = content;
  } else if (action === 'delete') {
    if (!name) {
      return res.status(400).json({ error: '?��?定�??�除?��??��?�? });
    }
    delete rosterTemplates[gid][name];
  } else {
    return res.status(400).json({ error: '?��???action' });
  }
  
  try {
    await saveRosterTemplates();
    res.json({ success: true, templates: rosterTemplates[gid] });
  } catch (e) {
    console.error('?��?範本失�?:', e);
    res.status(500).json({ error: '伺�??�儲存錯�? });
  }
});

// ?��?完整?�單字串?��??�函�?
function generateStatusBubble(targetGames, liffBaseUrl, cleanText, isPlusMinus) {
  const flexContents = [];
  targetGames.forEach((g, index) => {
    if (index >= 15) return;
    const sec = g.sections && g.sections[0] ? g.sections[0] : { list: [], limit: 0 };
    const count = sec.list.length;
    const limit = sec.limit || 0;
    const isFull = limit > 0 && count >= limit;
    const statusText = isFull ? '滿�?' : (limit > 0 ? `${count}/${limit}` : `${count}人`);
    const titleText = g.title || g.date || '?�次';
    
    let combinedTitle = titleText;
    if (g.date && g.date !== g.title) {
      const shortDate = g.date.replace(/\s*[（\(].*?[)）]\s*/g, '').trim();
      if (shortDate) {
        combinedTitle = `${shortDate} ${titleText}`;
      }
    }

    const isTarget = isPlusMinus && g.title && g.title.length > 1 && cleanText && cleanText.includes(g.title);

    const rowContents = [
      { type: "text", text: isTarget ? `?�� ${combinedTitle}` : combinedTitle, size: "xs", color: "#333333", flex: 4, wrap: false, weight: isTarget ? "bold" : "regular" },
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
      { type: "text", text: "??, size: "sm", color: "#cccccc", flex: 0, margin: "sm", gravity: "center" }
    ];

    const rowBox = {
      type: "box",
      layout: "horizontal",
      paddingTop: "8px",
      paddingBottom: "8px",
      paddingStart: isTarget ? "10px" : "4px",
      paddingEnd: "4px",
      alignItems: "center",
      action: { type: "uri", label: "?��??�單", uri: `${liffBaseUrl}&gameId=${g.gameId}` },
      contents: rowContents
    };

    if (isTarget) {
      rowBox.backgroundColor = "#FFF3CD";
      rowBox.cornerRadius = "md";
    }

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

  flexContents.push({
    type: "box",
    layout: "horizontal",
    margin: "lg",
    justifyContent: "center",
    contents: [
      { type: "text", text: "點選上方?�次?��?詳細?�單 ??", size: "xs", color: "#888888", align: "center" }
    ]
  });

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
        { type: "text", text: "?? ?�?�通知", size: "xs", weight: "bold", color: "#1DB446", flex: 0 },
        { type: "text", text: cleanText, size: "xs", color: "#333333", wrap: true, margin: "sm", flex: 1 }
      ]
    });
  }

  return {
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
            { type: "text", text: "?�� 羽�??��?大廳", weight: "bold", size: "md", color: "#1DB446", flex: 1 },
            {
              type: "button",
              style: "primary",
              color: "#1DB446",
              height: "sm",
              flex: 0,
              action: { type: "uri", label: "?�入大廳", uri: liffBaseUrl }
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
  };
}

function generatePushMentionMessages(groupGames, targetGid, isMentionPush, nameToUidMap, statusBubble) {
      const flexBubbles = statusBubble ? [statusBubble] : [];
      for (const g of groupGames) {
          if (flexBubbles.length >= 12) break; // LINE Carousel maximum is 12 bubbles

          const section = g.sections && g.sections[0] ? g.sections[0] : { list: [], limit: 20 };
          const list = section.list || [];
          const limit = section.limit || 20;
          const backupLimit = section.backupLimit || 0;
          
          const isFull = limit > 0 && list.length >= limit;
          const statusText = isFull ? '滿�?' : (limit > 0 ? `${list.length}/${limit}` : `${list.length}人`);

          // Date and location
          let infoLine = `?? ${g.date || ''} ${g.time || ''}`.trim();
          if (g.location) infoLine += `\n?? ${g.location}`;

          // Format names for two columns
          const listBoxes = [];
          for (let i = 0; i < list.length && i < limit; i += 2) {
              const name1 = list[i] === '__ANON__' ? '?��?' : list[i];
              const name2 = (i + 1 < list.length && i + 1 < limit) ? (list[i+1] === '__ANON__' ? '?��?' : list[i+1]) : '';
              
              const formatName = (idx, name) => {
                  if (!name) return "";
                  const levelStr = (g.levelMap && g.levelMap[name]) ? ` (${g.levelMap[name]})` : '';
                  const paidStr = (g.paidMap && g.paidMap[name]) ? '?��' : '';
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
                  { type: "text", text: "?? ?��??��?, size: "sm", color: "#1DB446", weight: "bold", flex: 1 },
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
                    { type: "text", text: "???��??�單", size: "sm", color: "#FF9800", weight: "bold", flex: 1 }
                  ]
              });
              
              const backupBoxes = [];
              let backupCount = 0;
              for (let i = limit; i < list.length; i += 2) {
                  const name1 = list[i] === '__ANON__' ? '?��?' : list[i];
                  const name2 = (i + 1 < list.length) ? (list[i+1] === '__ANON__' ? '?��?' : list[i+1]) : '';
                  
                  const formatBackup = (idx, name, bc) => {
                      if (!name) return "";
                      const levelStr = (g.levelMap && g.levelMap[name]) ? ` (${g.levelMap[name]})` : '';
                      const paidStr = (g.paidMap && g.paidMap[name]) ? '?��' : '';
                      return `�?{bc+1}. ${name}${levelStr}${paidStr}`;
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
                      { type: "text", text: `?�� ${g.title}`, weight: "bold", size: "md", color: "#1DB446", wrap: true }
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
                          action: { type: "uri", label: "?�次?��?", uri: liffGameUrl }
                      },
                      {
                          type: "button",
                          style: "secondary",
                          color: "#eeeeee",
                          height: "sm",
                          flex: 1,
                          action: { type: "uri", label: "大廳首�?", uri: liffMainUrl }
                      }
                  ]
              };
          }

          flexBubbles.push(bubble);
      }

      const carouselMsg = {
          type: "flex",
          altText: "?��??�單",
          contents: {
              type: "carousel",
              contents: flexBubbles
          }
      };

      const messagesToSend = [carouselMsg];
      
      if (isMentionPush) {
          const uidsToMention = new Map();
          for (const g of groupGames) {
              const section = g.sections && g.sections[0] ? g.sections[0] : { list: [] };
              const list = section.list || [];
              for (const name of list) {
                  if (name !== '__ANON__') {
                      let uid = nameToUidMap.get(`${g.gameId}_${name}`);
                      if (!uid && g.uidMap) {
                          uid = g.uidMap[name];
                      }
                      if (!uid) {
                          uid = nameToUidMap.get(`${targetGid}_${name}`);
                      }
                      if (uid) {
                          uidsToMention.set(uid, name);
                      }
                  }
              }
          }

          const uidArray = Array.from(uidsToMention.entries());
          if (uidArray.length > 0) {
              // LINE mention text: max 50 mentions per message, max 4 mention messages (1 carousel + 4 = 5 total)
              // We produce at most ONE mention message with the first 50 UIDs to avoid rejection
              const chunk = uidArray.slice(0, 50);
              // prefix must be pure ASCII/CJK (no emoji) to keep byte index accurate
              const prefix = "?��??��??��?�?"; 
              let textMsg = prefix;
              const mentionees = [];
              
              for (let j = 0; j < chunk.length; j++) {
                  const [uid, name] = chunk[j];
                  const placeholder = "@" + name;
                  mentionees.push({
                      index: textMsg.length,
                      length: placeholder.length,
                      type: "user",
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
          } else {
              messagesToSend.push({
                  type: "text",
                  text: "\u26a0\ufe0f \u63a8\u64ad\u63d0\u9192\uff1a\n\u76ee\u524d\u5c1a\u672a\u8a18\u9304\u5230\u4efb\u4f55\u53ef\u6a19\u8a18\u7684\u5831\u540d\u8005 UID\u3002\n\u5efa\u8b70\u8acb\u5831\u540d\u8005\u9700\u7d93\u7531 LIFF \u5927\u5ef3\u5831\u540d\uff0c\u7cfb\u7d71\u624d\u80fd\u8a18\u9304\u5176 LINE ID\u3002"
              });
          }
      }

      
    return messagesToSend;
}

function generateListMessage(g, customTitle = null) {
  let msg = `?�� ${customTitle || '?�單?�新?�知'}\n\n?�� ${g.title}\n`;
  if (g.date) msg += `?? ${g.date}\n`;
  if (g.time) msg += `??${g.time}\n`;
  if (g.location) msg += `?? ${g.location}\n`;
  
  g.sections.forEach(sec => {
    msg += `\n??{sec.title}??(?��? ${sec.list.length} / ${sec.limit} �?\n`;
    const limit = sec.limit;
    const count = Math.min(sec.list.length, limit);
    for (let i = 0; i < count; i++) {
      const n = sec.list[i];
      const name = n === '__ANON__' ? '***' : n;
      const level = g.levelMap && g.levelMap[n] ? `(${g.levelMap[n]})` : '';
      const noteStr = g.noteMap && g.noteMap[n] ? ` [${g.noteMap[n]}]` : '';
      const paidStr = g.paidMap && g.paidMap[n] ? ' (已繳�?' : '';
      msg += `${i+1}. ${name} ${level}${noteStr}${paidStr}\n`.trim() + '\n';
    }
    
    // 如�??�滿額�?顯示?�後�??�空席�??��?碼�?依�?使用?��?求�?
    if (sec.list.length < limit) {
      msg += `${limit}. \n`;
    }
    
    if (sec.list.length > limit) {
      msg += `\n?�候�??�單?�\n`;
      for (let i = sec.limit; i < sec.list.length; i++) {
        const n = sec.list[i];
        const name = n === '__ANON__' ? '***' : n;
        const level = g.levelMap && g.levelMap[n] ? `(${g.levelMap[n]})` : '';
        const noteStr = g.noteMap && g.noteMap[n] ? ` [${g.noteMap[n]}]` : '';
        const paidStr = g.paidMap && g.paidMap[n] ? ' (已繳�?' : '';
        msg += `??{i - sec.limit + 1}. ${name} ${level}${noteStr}${paidStr}\n`.trim() + '\n';
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

// --- 彩�??�能 API ---
app.get('/api/easter_egg/status', (req, res) => {
  res.json({ enabled: easterEggSettings.enabled, activeGame: easterEggSettings.activeGame || 'piggy_run' });
});

app.post('/api/easter_egg/claim', express.json(), async (req, res) => {
  const { uid, name, timeTaken, survivalTime } = req.body;
  if (!uid) return res.status(400).json({ success: false, message: 'Missing uid' });
  
  if (!easterEggSettings.enabled) {
    return res.json({ success: false, message: '活�??��??? });
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
    partyRoom.players[socket.id] = { uid, name, icon: icon || '?��', x: x || -100, y: y || -100, alive: true, id: socket.id, lives: 3, invincibleUntil: 0 };
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

// ?��? LIFF ?�端?��??�報?��??��?請�?
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
    
    // ?��?要�??�端觸發?��???
    let triggerBumpMsg = null;
    
    if (action === 'createGame') {
      if (!isSuperAdminUser) {
        return res.status(403).json({ error: '?��?超�?管�??�能建�??�次' });
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
          const rawList = initialListStr.split(/[\s,?��?\n]+/).map(n => n.trim()).filter(Boolean);
          rawList.forEach(n => {
            let isPaid = false;
            if (n.endsWith('$') || n.endsWith('�?) || n.endsWith('(已繳�?') || n.endsWith('（已繳費�?)) {
                isPaid = true;
                n = n.replace(/[\$＄]$/, '').replace(/\(已繳費\)$/, '').replace(/（已繳費�?/, '');
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
        title: title || `${date || ''} ${time || ''} ${loc || ''}`.trim() || '羽�??��?',
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
          { title: '?��??�單', limit: parseInt(limit, 10) || 20, backupLimit: parseInt(backupLimit, 10) || 5, label: '', list: initialList }
        ]
      };
      
      await saveGame(newGameId, true);
      await saveCurrentListSnapshot(newGameId, false);
      
      let pushErrors = [];
      if (!pPublish && isSuperAdminUser) {
          const gidsToPush = (targetGids && targetGids.length > 0) ? targetGids : [actualGid];
          for (const gId of gidsToPush) {
             try {
                await sendLobbyLink(null, gId, "?? ?�次建�??��?！\n" + (title || '?�場次�??�報?�中'));
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
        return res.status(403).json({ error: '?��?管�??�能?��??�次' });
      }
      if (!gameId || !games[gameId]) {
        return res.status(404).json({ error: '?��??�該?�次' });
      }
      
      const targetGame = games[gameId];
      targetGame.active = false;
      await saveGame(gameId, true);
      
      const pushTargets = targetGame.targetGids || [targetGame.gid];
      if (isSuperAdminUser) {
        for (const tGid of pushTargets) {
          try {
            await pushToAdmins(tGid, { type: 'text', text: `?? ${targetGame.title || '此場�?} 已由管�??��??��??��??�報?�。` });
          } catch (e) {}
        }
      }
      
      return res.json({ success: true });
    }
    
    if (action === 'editGame') {
      if (!isAdmin) {
        return res.status(403).json({ error: '?��?管�??�能編輯?�次' });
      }
      if (!gameId || !games[gameId]) {
        return res.status(404).json({ error: '?��??�該?�次' });
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
              await sendLobbyLink(null, gId, `?? ?��?跨群組�??�報?��?\n\n?�� ${title || game.title || '?�場�?}`);
            } catch(e) {}
          }
        }
      }

      game.title = title || `${date || ''} ${time || ''} ${loc || ''}`.trim() || '羽�??��?';
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
        return res.status(403).json({ error: '?��?超�?管�??�能?�送推?? });
      }
      
      let targetGids = [gid];
      if (pushToAll) {
        targetGids = Object.keys(groupAdmins).filter(g => groupAdmins[g].has(uid));
      }
      
      let successCount = 0;
      for (const tGid of targetGids) {
        try {
          await sendLobbyLink(null, tGid, `?�� 管�??�廣?��?\n${text}`);
          successCount++;
        } catch(e) { console.error('Push error:', e); }
      }
      return res.json({ success: true, count: successCount });
    }
    
    if (action === 'updateLobbyTitle') {
      if (!isSuperAdminUser) return res.status(403).json({ error: '?��?超�?管�??�能修改大廳標�?' });
      
      const newTitle = text ? text.trim() : '';
      await ensureGroupSettings(gid);
      groupSettings[gid].lobbyTitle = newTitle;
      await saveGroupSettings();
      return res.json({ success: true, lobbyTitle: newTitle });
    }

    if (action === 'updateLobbyDesc') {
      if (!isSuperAdminUser) return res.status(403).json({ error: '?��?超�?管�??�能修改大廳?�述' });
      
      const newDesc = text ? text.trim() : '';
      await ensureGroupSettings(gid);
      groupSettings[gid].lobbyDesc = newDesc;
      await saveGroupSettings();
      return res.json({ success: true, lobbyDesc: newDesc });
    }

    if (action === 'pushList') {
      if (!isSuperAdminUser) {
        return res.status(403).json({ error: '?��?超�?管�??�能?�播?�單' });
      }
      if (!gameId || !games[gameId]) {
        return res.status(400).json({ error: '?��??�此?�次' });
      }
      const g = games[gameId];
      let msg = generateListMessage(g, '管�??�推?�目?��???);
      
      let pushTargetGids = g.targetGids || [g.gid];
      if (req.body.targetCode) {
        const targetCode = req.body.targetCode;
        if (groupCodes[targetCode]) {
          pushTargetGids = [groupCodes[targetCode]];
        } else {
          return res.status(400).json({ error: `?��??�代碼為 ${targetCode} ?�群組` });
        }
      }
      
      let hasError = false;
      let errorMsgs = [];
      
      let singleTargetGid = pushTargetGids[0]; // ?��??�話?�能?�到?��?群�?
      let currentMsg = msg;
      if (process.env.LIFF_ID) {
        currentMsg += `\n?? 點�?下方????��?大廳\nhttps://liff.line.me/${process.env.LIFF_ID}?gid=${singleTargetGid}`;
      }

      if (clientSupportsLiffSendMessage && isAdmin) {
        // 交給?�端?��??�話
        triggerBumpMsg = currentMsg;
      } else {
        // ?�接?�播?�目標群�?
        for (const targetGid of pushTargetGids) {
          let pushMsg = msg;
          if (process.env.LIFF_ID) {
            pushMsg += `\n?? 點�?下方????��?大廳\nhttps://liff.line.me/${process.env.LIFF_ID}?gid=${targetGid}`;
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
      return res.status(400).json({ error: '?��?不�??��?已�??? });
    }
    
    const currentList = game.sections[0].list;
    const c = count || 1;
    
    if (action === 'register') {
      const namesToAdd = [name];
      for(let i=1; i<c; i++) namesToAdd.push('__ANON__');
      
      const hasDuplicate = currentList.includes(name);
      if (hasDuplicate) { 
        return res.status(400).json({ error: '?�已經報?��?�? });
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
        return res.status(403).json({ error: '?��?管�??�能修改繳費?�?? });
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
        return res.status(400).json({ error: '?��??�此?�稱' });
      }
      
      const registeredUid = nameToUidMap.get(`${gameId}_${name}`);
      
      if (!isAdmin && registeredUid && registeredUid !== uid) {
        return res.status(403).json({ error: '?�能?��??�己?�自己代?��??�單' });
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
      
      // ?�出?��?上�??�人 (??mainListAfter 但�???mainListBefore)
      const bumpedNames = mainListAfter.filter(n => !mainListBefore.includes(n) && n !== '__ANON__');
      
      if (bumpedNames.length > 0) {
        try {
          const bumpMsg = `??{bumpedNames.join('??)}?��?補�? 請注?��??�`;
          triggerBumpMsg = bumpMsg; // 記�?下�?，�?後傳給�?�?
          
          if (clientSupportsLiffSendMessage && isAdmin) {
            console.log('[Webhook] ?�端?�援且為管�??��?跳�? pushToAdmins，交?��?�?liff.sendMessages 觸發');
          } else {
            const pushTargets = game.targetGids || [game.gid];
            for (const targetGid of pushTargets) {
              try {
                await pushToAdmins(targetGid, { type: 'text', text: `${game.title}\n${bumpMsg}` });
              } catch (e) {
                console.error(`?��??�播�??失�? for ${targetGid}:`, e);
              }
            }
          }
        } catch(e) {
          console.error('?��??��?失�?:', e);
        }
      }
      
    } else if (action === 'reorder') {
      if (!isAdmin) {
        return res.status(403).json({ error: '?��?管�??�能調整?��?' });
      }
      
      const { fromIdx, toIdx } = req.body;
      const list = game.sections[0].list;
      
      if (typeof fromIdx !== 'number' || typeof toIdx !== 'number') {
        return res.status(400).json({ error: '?�數?�誤' });
      }
      if (fromIdx < 0 || fromIdx >= list.length || toIdx < 0 || toIdx >= list.length) {
        return res.status(400).json({ error: '?��??��?�? });
      }
      
      const element = list.splice(fromIdx, 1)[0];
      list.splice(toIdx, 0, element);
    } else if (action === 'logError') {
      if (!game.history) game.history = [];
      const now = new Date();
      const timeStr = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      game.history.unshift({ time: timeStr, name: '系統', operator: operatorName || name, action: '?�誤', errorMsg: text });
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
    
    // 讓�??�使?�者�?作�?，都觸發?��??�話並帶上精簡�?�?
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
        else if (action === 'reorder') msg += `${g.title} ???��??�新`;
        else if (action === 'togglePaid') msg += `${g.title}${opPart} ?��繳費?�新`;
        else if (action === 'updateNote' || action === 'setNote') msg += `${g.title}${opPart} ???�註?�新`;

        if (triggerBumpMsg) {
           msg += `\n?? ?��?補通知?�\n${triggerBumpMsg}`;
        }
        
        triggerBumpMsg = msg.trim();
        
        // Fallback for desktop / external browser
        if (!clientSupportsLiffSendMessage) {
          const pushTargets = g.targetGids || [g.gid];
          for (const targetGid of pushTargets) {
            try {
              pushToAdmins(targetGid, { type: 'text', text: triggerBumpMsg + '\n\n[系統�?��]' });
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
      res.sendStatus(200); // ?�使?�錯也�? 200，避??LINE ?�用 Webhook
    });
});

async function handleEvent(event) {
  // ?��?機器人被?�入群�??��?件�?memberJoined�?
  if (event.type === 'memberJoined') {
    const gid = event.source.groupId || event.source.roomId;
    if (!gid) return null;
    
    logToFile(`[INFO] Bot joined group/room ${gid} - waiting for first command`);
    return null;
  }

  // ?��??�戶?��??�人?�好?��?事件（follow�?
  if (event.type === 'follow') {
    try {
      const uid = event.source.userId;
      const welcomeMessage = '?? ?�好！�?謝�??�為好�??�\n\n' +
        '?�是羽�??��?機器人�?請�?請�??�入群�?後使?�「接龍�?始」�?建�??��?活�??�\n\n' +
        '?�群組中?�以使用以�??�能：\n' +
        '?? ?��??��? - 建�??�接龍\n' +
        '?�� +1 / -1 - ?��?/?��?\n' +
        '?? ?��??�單 - ?��??�單';
      
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
  // ?��??��??�次?��??�截已移?��??�由下方統整?�「接龍�?況」�?�?
  
  // 保�??��??�容
  const triggerMatch = text.match(/^?? ?�系統觸?��??��??�播?�\n([\s\S]*)/);
  if (triggerMatch) {
    const replyText = triggerMatch[1].trim();
    return await client.replyMessage(event.replyToken, { type: 'text', text: replyText });
  }
  
  if (text.replace(/\s+/g, '') === '?��?密碼Tony好帥') {
    if (!superAdmins) superAdmins = new Set();
    superAdmins.add(uid);
    saveSuperAdmins();
    return await client.replyMessage(event.replyToken, { type: 'text', text: '??權�?已�??��??�現?�是?�系統�?超�?管�??��??? });
  }

  if (text === '?��?管�??? || text === '?��?管�???) {
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
      return client.replyMessage(event.replyToken, { type: 'text', text: '??已�?消您?�管?�員權�??? });
    } else {
      return client.replyMessage(event.replyToken, { type: 'text', text: '?��? ?�本來就不是管�??��??? });
    }
  }

  if (text === '?�詢管�??? || text === '管�??��???) {
    if (!isSuperAdmin(uid)) {
      return client.replyMessage(event.replyToken, { type: 'text', text: '?��? ?��?超�?管�??�可以查詢管?�員?�單?? });
    }

    let msg = '?? 管�??��??�\n?��??��??��??��??��??��??��?\n';

    // 超�?管�???(?��?變數)
    const envAdminUids = process.env.SUPER_ADMIN_USER_ID
      ? process.env.SUPER_ADMIN_USER_ID.split(',').map(id => id.trim()).filter(Boolean)
      : [];

    // 超�?管�???(?��??��?)
    const dynamicSuperAdmins = superAdmins ? Array.from(superAdmins) : [];

    // ?�併不�?�?
    const allSuperAdminUids = [...new Set([...envAdminUids, ...dynamicSuperAdmins])];

    msg += '\n?? 超�?管�???\n';
    if (allSuperAdminUids.length === 0) {
      msg += '  (??\n';
    } else {
      for (const adminUid of allSuperAdminUids) {
        try {
          const name = await getName(gid, adminUid);
          const source = envAdminUids.includes(adminUid) ? ' [?��?變數]' : ' [?��?]';
          const nameDisplay = name === '?��?' ? `?��? (${adminUid.substring(0, 6)}...)` : name;
          msg += `  ??${nameDisplay}${source}\n`;
        } catch (e) {
          msg += `  ??${adminUid.substring(0, 8)}...${envAdminUids.includes(adminUid) ? ' [?��?變數]' : ' [?��?]'}\n`;
        }
      }
    }

    // 群�?管�???
    const groupEntries = Object.entries(groupAdmins).filter(([g, admins]) => admins.size > 0);
    if (groupEntries.length > 0) {
      msg += '\n?�� 群�?管�???\n';
      for (const [adminGid, admins] of groupEntries) {
        const code = Object.keys(groupCodes).find(k => groupCodes[k] === adminGid) || '?�代�?;
        msg += `\n  群�? [${code}]:\n`;
        for (const adminUid of admins) {
          try {
            const name = await getName(adminGid, adminUid);
            const alsoSuper = allSuperAdminUids.includes(adminUid) ? ' ??' : '';
            msg += `    ??${name}${alsoSuper}\n`;
          } catch (e) {
            msg += `    ??${adminUid.substring(0, 8)}...\n`;
          }
        }
      }
    } else {
      msg += '\n?�� 群�?管�???\n  (??\n';
    }

    return client.replyMessage(event.replyToken, { type: 'text', text: msg.trim() });
  }

  if (text === '群�?�?��' || text === '群�?�?) {
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
      text: `?�群組�?專屬�?��?��???${code} ?�` 
    });
  }

  if (text.toLowerCase() === 'line id check' || text === '?��?UID' || text === '?��?uid') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `你�?專屬 UID ?��?\n${uid}\n\n請�?�?UID ?��?給�?級管?�員，以便設定群組管?��??�。\n(?��??��??�系統�?級管?�員模�?，可將此字串設�???Render ??SUPER_ADMIN_USER_ID ?��?變數�?`
    });
  }

  const viewOverrideMatch = text.match(/^超�?管�??��?角\s+(使用?�|管�??�|?�高�???(?:\s+(\d{4}))?$/i);
  if (viewOverrideMatch) {
    if (!isTrueSuperAdmin(uid)) {
      return client.replyMessage(event.replyToken, { type: 'text', text: '?��? 此�?令�??��?�??超�?管�??�使?��? });
    }
    const mode = viewOverrideMatch[1];
    const code = viewOverrideMatch[2];
    let modeCode = 'superadmin';
    if (mode === '使用??) modeCode = 'user';
    else if (mode === '管�???) modeCode = 'admin';
    
    let targetGid = null;
    let groupNameDisplay = '';
    if (modeCode === 'admin' && code) {
      targetGid = groupCodes[code];
      if (!targetGid) {
        return client.replyMessage(event.replyToken, { type: 'text', text: `?��??�代碼為 ${code} ?�群組` });
      }
      groupNameDisplay = ` (?�群�? ${groupSettings[targetGid]?.groupName || code})`;
    }
    
    superAdminViewOverrides[uid] = { mode: modeCode, targetGid: targetGid };
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `??視�?已�??�為�?{mode}${groupNameDisplay}\n請�??�整?�網?�查?��??�。`
    });
  }

  const groupAdminSetMatch = text.match(/^?��?群主設�?\s+(U[a-f0-9]+)\s+(\d{4})$/i);
  if (groupAdminSetMatch) {
    if (!isSuperAdmin(uid)) {
      return client.replyMessage(event.replyToken, { type: 'text', text: '?��? ?��?超�?管�??�能?�派群�?管�??��? });
    }
    const targetUid = groupAdminSetMatch[1];
    const targetCode = groupAdminSetMatch[2];
    const targetGid = groupCodes[targetCode];
    if (!targetGid) {
      return client.replyMessage(event.replyToken, { type: 'text', text: `?��??�代碼為 ${targetCode} ?�群組` });
    }
    if (!groupAdmins[targetGid]) groupAdmins[targetGid] = new Set();
    groupAdmins[targetGid].add(targetUid);
    saveAdmins();
    const gName = groupSettings[targetGid]?.groupName || targetCode;
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `??已�??��?該使?�者設?��?{gName}?��?群�?管�??��?`
    });
  }

  const groupAdminRemoveMatch = text.match(/^?��?群主?�銷\s+(U[a-f0-9]+)\s+(\d{4})$/i);
  if (groupAdminRemoveMatch) {
    if (!isSuperAdmin(uid)) {
      return client.replyMessage(event.replyToken, { type: 'text', text: '?��? ?��?超�?管�??�能?�銷群�?管�??��? });
    }
    const targetUid = groupAdminRemoveMatch[1];
    const targetCode = groupAdminRemoveMatch[2];
    const targetGid = groupCodes[targetCode];
    if (!targetGid) {
      return client.replyMessage(event.replyToken, { type: 'text', text: `?��??�代碼為 ${targetCode} ?�群組` });
    }
    if (groupAdmins[targetGid] && groupAdmins[targetGid].has(targetUid)) {
      groupAdmins[targetGid].delete(targetUid);
      saveAdmins();
      const gName = groupSettings[targetGid]?.groupName || targetCode;
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: `??已撤?�該使用?�在??{gName}?��?管�?權�??�`
      });
    } else {
      return client.replyMessage(event.replyToken, { type: 'text', text: '該使?�者本來就不是此群組�?管�??��? });
    }
  }

  const urlMatch = text.match(/^(?:網�?|群�?網�?|大廳網�?)\s*(\d{4})$/);
  if (urlMatch) {
    const queryCode = urlMatch[1];
    const targetGid = groupCodes[queryCode];
    if (targetGid) {
      if (process.env.LIFF_ID) {
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: `?? 群�? ${queryCode} ?��?屬大廳網?�?��?\nhttps://liff.line.me/${process.env.LIFF_ID}?gid=${targetGid}`
        });
      } else {
        return client.replyMessage(event.replyToken, { type: 'text', text: '系統尚未設�? LIFF_ID' });
      }
    } else {
      return client.replyMessage(event.replyToken, { type: 'text', text: `?��??�代碼為 ${queryCode} ?�群組` });
    }
  }

  // ?��?許管?�員下�??��??�令 (但�??�部?�查詢�?令給一?�群??
  const isAdmin = isSuperAdmin(uid) || isGroupAdmin(uid, gid);
  
  const cleanText = text.replace(/\n\n\[系統�?��\]$/, '').trim();
  const isPlusMinus = cleanText.match(/^\+[1-9]/) || cleanText.match(/^-[1-9]/) || cleanText.match(/\+[1-9]$/) || cleanText.match(/-[1-9]$/) || cleanText.match(/???��??�新$/) || cleanText.match(/?��繳費?�新$/);
  const isPublicCommand = text.startsWith('?��??�單') || 
                          text.startsWith('?�播?��?') ||
                          text === '?��??�?? || 
                          text === '?��??��? || 
                          text === '?��??�詢' || 
                          text === '大廳' || 
                          text === '?��?大廳' ||
                          isPlusMinus;

  if (!isAdmin && !isPublicCommand) {
    return null; // ?�管?�員，已讀不�?
  }

  // 檢查?�否?�群組�?次使??
  let showWelcome = false;
  if (gid && (gid.startsWith('C') || gid.startsWith('R')) && !firstUseGroups.has(gid)) {
    firstUseGroups.add(gid);
    showWelcome = true;
  }

  try {
    // 1. ?��??��?
    if (text.startsWith('?��??��?')) {
      const groupMatch = text.match(/群�?(?:[:：])?\s*(?:\{|�?(.*?)(?:\}|�?/) || text.match(/群�?[:：]\s*(\d{4})/);
      let targetGid = gid;
      let isRemote = false;
      if (groupMatch) {
          const code = groupMatch[1].trim();
          if (groupCodes[code]) {
              targetGid = groupCodes[code];
              isRemote = targetGid !== gid;
          } else {
              return client.replyMessage(event.replyToken, { type: 'text', text: `?��??�代碼為 ${code} ?�群組�?請確認您已在?��?群�?輸入?�群組代碼」獲?�正確�?�?��?�` });
          }
      }

      const titleMatch = text.match(/標�?(?:[:：])?\s*(?:\{|�??(.*?)(?:\}|�??(?:\n|$)/) || text.match(/標�?\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:?��?|?��?|?��?|費用|人數|?��?|?�註|?�單|$))))/);
      const dateMatch = text.match(/?��?\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標�?|?��?|?��?|費用|人數|?��?|?�註|?�單|$))))/);
      const timeMatch = text.match(/?��?\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標�?|?��?|?��?|費用|人數|?��?|?�註|?�單|$))))/);
      const locMatch = text.match(/?��?\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標�?|?��?|?��?|?��??��?|?��??��?|費用|人數|?��?|?�註|?�單|$))))/);
      const feeMatch = text.match(/費用\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標�?|?��?|?��?|?��??��?|?��??��?|?��?|人數|?��?|?�註|?�單|$))))/);
      const noteMatch = text.match(/?�註\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標�?|?��?|?��?|?��??��?|?��??��?|?��?|費用|人數|?��?|?�單|標籤|$))))/);
      const tagMatch = text.match(/標籤\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標�?|?��?|?��?|?��??��?|?��??��?|?��?|費用|人數|?��?|?�註|?�單|?��??�單|$))))/);
      const listMatch = text.match(/?�單\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標�?|?��?|?��?|?��??��?|?��??��?|?��?|費用|人數|?��?|?�註|標籤|?��??�單|$))))/);
      const anonMatch = text.match(/?��??�單\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標�?|?��?|?��?|?��??��?|?��??��?|?��?|費用|人數|?��?|?�註|標籤|?�單|$))))/);
      const publishMatch = text.match(/?��??��?\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標�?|?��?|?��?|?��??��?|?��?|費用|人數|?��?|?�註|標籤|?�單|?��??�單|$))))/);
      const reminderMatch = text.match(/?��??��?\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標�?|?��?|?��?|?��??��?|?��?|費用|人數|?��?|?�註|標籤|?�單|?��??�單|$))))/);
      
      const limitMatch = text.match(/人數\s*[:：]?\s*(?:[{\uff5b](\d+)[}\uff5d]|(\d+))/);
      const backupMatch = text.match(/?��?\s*[:：]?\s*(?:[{\uff5b](\d+)[}\uff5d]|(\d+))/);
      
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
      
      let title = '羽�??��?';
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
         const rawList = listStr.split(/[\s,?��?]+/).map(n => n.trim()).filter(Boolean);
         rawList.forEach(n => {
           let isPaid = false;
           if (n.endsWith('$') || n.endsWith('�?) || n.endsWith('(已繳�?') || n.endsWith('（已繳費�?)) {
               isPaid = true;
               n = n.replace(/[\$＄]$/, '').replace(/\(已繳費\)$/, '').replace(/（已繳費�?/, '');
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
             const anons = anonStr.split(/[\s,?��?]+/).map(n => n.trim()).filter(Boolean);
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
        note: pNote === '?? || pNote === '�? ? '' : pNote,
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
          { title: '?��??�單', limit: limit, backupLimit: backupLimit, label: '', list: initialList }
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
      
      let welcomePrefix = showWelcome ? '?? 大家好�??�是羽�??��?機器人。\n\n' : '';
      if (isRemote) {
          if (!pPublish) await sendLobbyLink(null, targetGid, welcomePrefix + "?? ?�次建�??��?�?);
          return client.replyMessage(event.replyToken, { type: 'text', text: `??已�??��??�次建�?${pPublish ? '並�?程發�? : '並推??}?�代�?${groupMatch[1].trim()} ?�群組�?` });
      } else {
          if (pPublish) {
              return client.replyMessage(event.replyToken, { type: 'text', text: `???�次建�??��?！�??��?定�??�發布大廳�???�` });
          } else {
              return await sendLobbyLink(event.replyToken, gid, welcomePrefix + "?? ?�次建�??��?�?);
          }
      }
    }

    if (text.startsWith('?��?結�?') || text.startsWith('?��?清空')) {
      const groupMatch = text.match(/群�?(?:[:：])?\s*(?:\{|�?(.*?)(?:\}|�?/) || text.match(/群�?[:：]\s*(\d{4})/);
      let targetGid = gid;
      if (groupMatch) {
          const code = groupMatch[1].trim();
          if (groupCodes[code]) {
              targetGid = groupCodes[code];
          } else {
              return client.replyMessage(event.replyToken, { type: 'text', text: `?��??�代碼為 ${code} ?�群組�??��??��?清空?�` });
          }
      }

      let keyword = text.replace(/?��?結�?|?��?清空/, '');
      if (groupMatch) keyword = keyword.replace(groupMatch[0], '');
      keyword = keyword.trim();
      
      let groupGames = Object.values(games).filter(g => 
        (g.gid === targetGid || (g.targetGids && g.targetGids.includes(targetGid))) && 
        g.active && 
        !g.isManualEnded
      );
      
      if (text.startsWith('?��?清空') || text === '?��?結�?') {
        // ?��?
        const count = groupGames.length;
        for(const g of groupGames) {
          const gId = g.gameId;
          delete games[gId];
          await saveGame(gId, true);
        }
        await saveCurrentListSnapshot(null, false);
        pendingSaves.add('__force_save__');
        await flushFileSave();
        return await client.replyMessage(event.replyToken, { type: 'text', text: `???�到 ${count} ?�場次並已�?空` });
      } else {
        // 結�??��??�次
        groupGames = groupGames.filter(g => g.title.includes(keyword));
        if (groupGames.length === 0) {
          return await client.replyMessage(event.replyToken, { type: 'text', text: `?��??��??��?{keyword}?��??�次?��?` });
        }
        for(const g of groupGames) {
          const gId = g.gameId;
          delete games[gId];
          await saveGame(gId, true);
        }
        await saveCurrentListSnapshot(null, false);
        pendingSaves.add('__force_save__');
        await flushFileSave();
        const titles = groupGames.map(g => g.title).join('??);
        return await client.replyMessage(event.replyToken, { type: 'text', text: `??已�??�場次�?${titles}` });
      }
    }

    if (text === '/debug-uid') {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: `?�偵?�模式】\n?��?群�? Webhook UID ?��?\n${uid}\n\n請您?��? LIFF 網�?，�??��?下�??�者�??��?如�? LIFF ?�到??UID 跟這個�?一�??�?��?��? LIFF Channel ??Bot Channel 建�??��??��? Provider 底�?，�??��??�人不�?�?LIFF ?��???UID，這就?��?記�??��??��??��??��?`
      });
    }

    if (text === '/test-mention-now') {
      const mentionText = "@User ?�好！這是一?�寫死�?標�?測試??;
      const testMessages = [{
          type: "text",
          text: mentionText,
          mention: {
              mentionees: [{
                  index: 0,
                  length: 5,
                  type: "user",
                  userId: uid
              }]
          }
      }];
      return client.replyMessage(event.replyToken, testMessages);
    }

    if (text.startsWith('群�?�?��')) {
      const groupMatch = text.match(/群�?(?:[:：])?\s*(?:\{|�??([a-zA-Z0-9]+)(?:\}|�??\s+?�容(?:[:：])?\s*([\s\S]*)/);
      if (!groupMatch || !groupMatch[1] || !groupMatch[2]) {
        return client.replyMessage(event.replyToken, { type: 'text', text: '?��? 語�??�誤！正確格式為：\n群�?�?�� 群�?: 1234 ?�容: ?��?�?��訊息' });
      }
      
      const code = groupMatch[1].trim();
      const broadcastText = groupMatch[2].trim();
      const targetGid = groupCodes[code];
      
      if (!targetGid) {
        return client.replyMessage(event.replyToken, { type: 'text', text: `???��??�代碼為 ${code} ?�群組。` });
      }
      
      if (!isSuperAdminUser && !(groupAdmins[targetGid] && groupAdmins[targetGid].has(uid))) {
        return client.replyMessage(event.replyToken, { type: 'text', text: '???��??�目標群組�?管�??��??��?對該群�??�送廣?��? });
      }

      try {
        await client.pushMessage(targetGid, { type: 'text', text: `?�� 管�??�廣?��?\n\n${broadcastText}` });
        if (targetGid !== gid) {
          return client.replyMessage(event.replyToken, { type: 'text', text: `??�?��已�??�發?�至群�? ${code}！` });
        }
      } catch (err) {
        return client.replyMessage(event.replyToken, { type: 'text', text: `??�?��?�送失?��??�能?��??�人不在?��?群�?中�??�是?��??�發言?�` });
      }
      return null;
    }

    if (text.startsWith('?��??�單') || text.startsWith('?�播?��?') || text === '?��??��? || text === '?��??�?? || text === '?��??�詢' || isPlusMinus) {
      const isMentionPush = text.startsWith('?�播?��?');
      
      if (isMentionPush && !isAdmin) {
          return client.replyMessage(event.replyToken, { type: 'text', text: '???��?管�??�可以使?�「推?��??�」�??��?�? });
      }

      const groupMatch = text.match(/群�?(?:[:：])?\s*(?:\{|�?(.*?)(?:\}|�?/) || text.match(/群�?[:：]\s*(\d{4})/);
      let targetGid = gid;
      if (groupMatch) {
          const code = groupMatch[1].trim();
          if (groupCodes[code]) {
              targetGid = groupCodes[code];
          } else {
              return client.replyMessage(event.replyToken, { type: 'text', text: `?��??�代碼為 ${code} ?�群組。` });
          }
      }

      let keyword = text.replace(/?��??�單/, '').replace(/?�播?��?/, '').replace(/?��??��?, '').replace(/?��??�??, '').replace(/?��??�詢/, '');
      if (groupMatch) keyword = keyword.replace(groupMatch[0], '');
      keyword = keyword.replace(/\[系統�?��\]/g, '').trim();
      if (isPlusMinus) keyword = '';
      
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
          const emptyText = keyword ? `?��??��??��?{keyword}?��??�次?��?` : `?��?群�??��??�正?�進�??�場次�?！`;
          return client.replyMessage(event.replyToken, { type: 'text', text: emptyText });
      }

      const liffBaseUrl = process.env.LIFF_ID ? `https://liff.line.me/${process.env.LIFF_ID}?gid=${targetGid}` : null;
      if (!liffBaseUrl) {
        return client.replyMessage(event.replyToken, { type: 'text', text: '尚未設�?大廳網�? (LIFF_ID)' });
      }

      // Generate the status summary bubble
      const statusBubble = generateStatusBubble(groupGames, liffBaseUrl, cleanText, isPlusMinus);

      // Generate the full carousel (Status Bubble + Detail Bubbles + Mentions)
      const messagesToSend = generatePushMentionMessages(groupGames, targetGid, isMentionPush, nameToUidMap, statusBubble);
      
      // We NEVER consume quota for standard replies!
      // Only when explicitly pushing to a DIFFERENT group do we use pushMessage.
      if (targetGid !== gid) {
          try {
              await client.pushMessage(targetGid, messagesToSend);
              const successMsg = isMentionPush ? '?�次?�單?��??? : '?�次?�單';
              return client.replyMessage(event.replyToken, { type: 'text', text: `??已�?${successMsg}?�播?�群�?${groupMatch ? groupMatch[1].trim() : targetGid}` });
          } catch (e) {
              console.error('Push message failed:', e.originalError?.response?.data || e);
              const errDetail = JSON.stringify(e.originalError?.response?.data || e.message);
              return client.replyMessage(event.replyToken, { type: 'text', text: `???�播失�?，錯誤內容�?\n${errDetail}` }).catch(()=>null);
          }
      } else {
          try {
              // replyMessage silently drops mention objects in groups!
              // For mention push: use pushMessage so @tags work, then ack with replyMessage
              if (isMentionPush) {
                  await client.pushMessage(gid, messagesToSend);
                  return client.replyMessage(event.replyToken, { type: 'text', text: '✅ 推播提醒已送出！' });
              } else {
                  return await client.replyMessage(event.replyToken, messagesToSend);
              }
          } catch (e) {
              console.error('Reply message failed:', e.originalError?.response?.data || e);
              const errDetail = JSON.stringify(e.originalError?.response?.data || e.message);
              // Only fallback to pushMessage if reply fails for some strict LINE payload reasons
              return client.pushMessage(gid, { type: 'text', text: `???�送失?��??��??�常?�誤：\n${errDetail}` }).catch(()=>null);
          }
      }
    }
    
    if (text === '超�?清空') {
      const count = Object.keys(games).length;
      const allKeys = Object.keys(games);
      allKeys.forEach(k => delete games[k]);
      for (const k of allKeys) await saveGame(k, true);
      await saveCurrentListSnapshot(null, false);
      pendingSaves.add('__force_save__');
      await flushFileSave();
      return await client.replyMessage(event.replyToken, { type: 'text', text: `?�� 超�?清空?��?！已強制?�除伺�??��??�?�群組�? ${count} ?�場次。` });
    }

    if (text === '測試?�次') {
        const myGames = Object.values(games).map(g => `ID: ${g.gameId}, GID: ${g.gid}, Title: ${g.title}`).join('\n');
        return client.replyMessage(event.replyToken, { type: 'text', text: `Games in memory:\n${myGames || 'none'}\nCurrent GID: ${gid}` });
    }

    if (text.startsWith('?��?修改')) {
      const titleMatch = text.match(/標�?\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:?��?|?��?|?��?|費用|人數|?��?|?�註|?�單|$))))/);
      const dateMatch = text.match(/?��?\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標�?|?��?|?��?|費用|人數|?��?|?�註|?�單|$))))/);
      const timeMatch = text.match(/?��?\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標�?|?��?|?��?|費用|人數|?��?|?�註|?�單|$))))/);
      const locMatch = text.match(/?��?\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標�?|?��?|?��?|?��??��?|?��??��?|費用|人數|?��?|?�註|?�單|?��??�單|$))))/);
      const feeMatch = text.match(/費用\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標�?|?��?|?��?|?��??��?|?��??��?|?��?|人數|?��?|?�註|?�單|?��??�單|$))))/);
      const noteMatch = text.match(/?�註\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標�?|?��?|?��?|?��??��?|?��??��?|?��?|費用|人數|?��?|?�單|標籤|?��??�單|$))))/);
      const tagMatch = text.match(/標籤\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標�?|?��?|?��?|?��??��?|?��??��?|?��?|費用|人數|?��?|?�註|?�單|?��??�單|$))))/);
      const listMatch = text.match(/?�單\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標�?|?��?|?��?|?��??��?|?��??��?|?��?|費用|人數|?��?|?�註|標籤|?��??�單|$))))/);
      const anonMatch = text.match(/?��??�單\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標�?|?��?|?��?|?��??��?|?��??��?|?��?|費用|人數|?��?|?�註|標籤|?�單|$))))/);
      const publishMatch = text.match(/?��??��?\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標�?|?��?|?��?|?��??��?|?��?|費用|人數|?��?|?�註|標籤|?�單|?��??�單|$))))/);
      const reminderMatch = text.match(/?��??��?\s*[:：]?\s*(?:[{\uff5b]([\s\S]*?)[}\uff5d]|([^\n]*?(?=\s*(?:標�?|?��?|?��?|?��??��?|?��?|費用|人數|?��?|?�註|標籤|?�單|?��??�單|$))))/);
      
      const limitMatch = text.match(/人數\s*[:：]?\s*(?:[{\uff5b](\d+)[}\uff5d]|(\d+))/);
      const backupMatch = text.match(/?��?\s*[:：]?\s*(?:[{\uff5b](\d+)[}\uff5d]|(\d+))/);
      
      // ?�出?��? "?��?修改" ??屬�?以�??��?字當�?keyword
      let keyword = text.replace('?��?修改', '').trim();
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
          return await client.replyMessage(event.replyToken, { type: 'text', text: '?��?沒�??��?中�??�次?�以修改?��?' });
      }

      let targetGame = null;
      if (keyword) {
        targetGame = groupGames.find(g => g.title.includes(keyword));
        if (!targetGame) {
           return await client.replyMessage(event.replyToken, { type: 'text', text: `?��??��??��?{keyword}?��??�次?��?` });
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
         // ?�修?��??�中一?��?沒�??��?標�?，更?�自?��??��?標�?
         const currentTitleWasAuto = targetGame.title === [targetGame.date, targetGame.time, targetGame.location].filter(Boolean).join(' ');
         if (targetGame.title === '羽�??��?' || currentTitleWasAuto || true) {
             const newAuto = [targetGame.date, targetGame.time, targetGame.location].filter(Boolean).join(' ');
             if (newAuto) targetGame.title = newAuto;
         }
      }

      if (limitMatch && targetGame.sections[0]) targetGame.sections[0].limit = parseInt(limitMatch[1] || limitMatch[2], 10);
      if (backupMatch && targetGame.sections[0]) targetGame.sections[0].backupLimit = parseInt(backupMatch[1] || backupMatch[2], 10);
      if (noteMatch) {
        const n = (noteMatch[1] || noteMatch[2]).trim();
        targetGame.note = n === '?? || n === '�? ? '' : n;
      }
      if (tagMatch) {
        targetGame.tag = (tagMatch[1] || tagMatch[2]).trim();
      }
      if (listMatch && targetGame.sections[0]) {
         const listStr = (listMatch[1] || listMatch[2]).trim();
         const rawList = listStr.split(/[\s,?��?]+/).map(n => n.trim()).filter(Boolean);
         let newList = [];
         let newLevelMap = { ...(targetGame.levelMap || {}) };
         let newPaidMap = { ...(targetGame.paidMap || {}) };
         rawList.forEach(n => {
           let isPaid = false;
           if (n.endsWith('$') || n.endsWith('�?) || n.endsWith('(已繳�?') || n.endsWith('（已繳費�?)) {
               isPaid = true;
               n = n.replace(/[\$＄]$/, '').replace(/\(已繳費\)$/, '').replace(/（已繳費�?/, '');
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
             const anons = anonStr.split(/[\s,?��?]+/).map(n => n.trim()).filter(Boolean);
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
      return await sendLobbyLink(event.replyToken, gid, `?��? 已�??�修?�場次�?${targetGame.title}`);
    }

    if (text === '大廳' || text === '?��?大廳') {
      return await sendLobbyLink(event.replyToken, gid);
    }

    // ?��??��??�單/+1/-1 已整?�至上方統�???Carousel ?�塊�???

  } catch (e) {
    console.error('Logic Error:', e);
    const errorMsg = e.originalError?.response?.data 
                   ? JSON.stringify(e.originalError.response.data) 
                   : String(e);
    try {
      if (gid) {
        await client.pushMessage(gid, { type: 'text', text: `??機器人發?�系統錯誤�?已�??��?\n${errorMsg}` });
      }
    } catch (pushErr) {
      console.error('Failed to push error message:', pushErr);
    }
  }
}

// --- 工具?��? ---
async function getName(gid, uid) {
  // 使用快�?減�? API ?�叫以�??��?�?
  const cacheKey = `${gid}_${uid}`;
  const now = Date.now();
  
  // 檢查快�?
  if (userNameCache.has(cacheKey)) {
    const cached = userNameCache.get(cacheKey);
    if (now - cached.timestamp < CACHE_EXPIRY) {
      return cached.name; // 返�?快�??��?�?
    } else {
      userNameCache.delete(cacheKey); // 快�??��?，刪??
    }
  }
  
  try {
    const profile = (gid.startsWith('C') || gid.startsWith('R')) 
      ? await client.getGroupMemberProfile(gid, uid) 
      : await client.getProfile(uid);
    const name = profile.displayName;
    
    // 存入快�?
    userNameCache.set(cacheKey, { name, timestamp: now });
    
    // 定�?清�??��?快�?（�?100次呼?��?檢查一次�?
    if (userNameCache.size > 1000) {
      for (const [key, value] of userNameCache.entries()) {
        if (now - value.timestamp >= CACHE_EXPIRY) {
          userNameCache.delete(key);
        }
      }
    }
    
    return name;
  } catch (e) { 
    // API 失�??�使?�快?��??�後已?��?稱�??��??��?設�?
    if (userNameCache.has(cacheKey)) {
      return userNameCache.get(cacheKey).name;
    }
    return '?��?'; 
  }
}

function addToList(gid, idx, name, meta = {}, waitForCsv = false) {
  if (!games[gid].sections[idx]) return null;
  // ?��??��?符�?許�?複出??
  if (name === '__ANON__') {
    games[gid].sections[idx].list.push(name);
    return null;
  }
  if (!games[gid].sections[idx].list.includes(name)) {
    games[gid].sections[idx].list.push(name);
    if (meta && meta.uid) {
      if (!games[gid].uidMap) games[gid].uidMap = {};
      games[gid].uidMap[name] = meta.uid;
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
      // 不�??�到 CSV（只保�??�單快照�?
      return;
    }
  }
}

async function sendList(token, gameId, prefix = "") {
  const g = games[gameId];
  if (!g) return;
  
  let msg = prefix ? `${prefix}\n` : '';
  msg += `?�� ${g.title}`;
  
  // 顯示簡短統�?
  if (g.sections && g.sections[0]) {
    const listCount = g.sections[0].list.length;
    const limit = g.sections[0].limit;
    msg += `\n?��??��?�?{listCount} / ${limit} 人`;
  }

  if (g.note) msg += `\n?? ${g.note}`;
  
  const pushTargets = g.targetGids || [g.gid];
  
  if (token) {
    let replyMsg = msg;
    if (process.env.LIFF_ID) {
      replyMsg += `\n\n?? 點�?下方????��?快速報?��??��??�單\nhttps://liff.line.me/${process.env.LIFF_ID}?gid=${g.gid}`;
    }
    return await client.replyMessage(token, { type: 'text', text: replyMsg.trim() });
  }
  // ?�無 token ?�使??Push Message (?�於定�??�播)
  for (const targetGid of pushTargets) {
    let currentMsg = msg;
    if (process.env.LIFF_ID) {
      currentMsg += `\n\n?? 點�?下方????��?快速報?��??��??�單\nhttps://liff.line.me/${process.env.LIFF_ID}?gid=${targetGid}`;
    }
    try {
      await pushToAdmins(targetGid, { type: 'text', text: currentMsg.trim() });
    } catch (e) {
      console.error(`pushToAdmins failed for ${targetGid}:`, e);
    }
  }
}

// �???�播：�?群�?訊息轉送給群�?管�???(作為?�用?�播)
async function pushToAdmins(targetGid, messages) {
  // ?��?要�?，暫?��??��?要�??�推?��?度�??�話�???�能
  return;
  
  if (!targetGid) return;
  const admins = groupAdmins[targetGid];
  if (!admins || admins.size === 0) {
    console.log(`[Admin Proxy] 群�? ${targetGid} 沒�?設�?管�??��??��??�送。`);
    return;
  }

  const groupName = groupSettings[targetGid]?.groupName || groupSettings[targetGid]?.lobbyTitle || '?��?群�?';
  const prefixMsg = { 
    type: 'text', 
    text: `?? ?�系統通知?�\n此為??{groupName}?��?事件，�??�助轉發以�?訊息?�群組�?` 
  };

  const msgsArray = Array.isArray(messages) ? messages : [messages];
  const finalMessages = [prefixMsg, ...msgsArray];

  for (const adminUid of admins) {
    try {
      await client.pushMessage(adminUid, finalMessages);
      console.log(`[Admin Proxy] 已發?�通知給管?�員: ${adminUid}`);
    } catch (e) {
      console.error(`[Admin Proxy] ?�送給管�???${adminUid} 失�?:`, e);
    }
  }
}

const port = process.env.PORT || 3000;
const AUTO_WAKE_ENABLED = (process.env.AUTO_WAKE_ENABLED || 'true').toLowerCase() !== 'false';
const AUTO_WAKE_INTERVAL_MINUTES = Math.max(5, parseInt(process.env.AUTO_WAKE_INTERVAL_MINUTES || '10', 10) || 10);

// ?�部定�??��?定�?訪�??�己?�健康檢?�端點以保�??��?
async function pingSelf() {
  // ?��?使用 RENDER_EXTERNAL_URL，�??��??��??�試?��??��?變數?�使??localhost
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
      timeout: 10000 // 10秒�???
    };
    
    return new Promise((resolve, reject) => {
      const req = httpModule.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          // ?�在?�誤?��??��??��??��?少日誌輸??
          resolve();
        });
      });
      
      req.on('error', (err) => {
        // ?�在???失�??��??��??��??��??��?
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

// Graceful shutdown：確保�??�寫??
async function gracefulShutdown() {
  console.log('?? �?��?��??��??��?確�?資�?寫入...');
  isShuttingDown = true;
  
  // 等�??�?��?寫入?��???
  if (saveFileTimeout) {
    clearTimeout(saveFileTimeout);
    saveFileTimeout = null;
  }
  await flushFileSave();
  
  // 等�??�??CSV 寫入完�?
  try {
    await regCsvWriteChain;
    
    // 如�?使用 GitHub 模�?，確保�?後�??�容已寫??
    if (USE_GITHUB && regCsvContent) {
      await writeCsvToGitHub(regCsvContent, 'Final save before shutdown');
    }
    
    console.log('???�?��??�已寫入完�?');
  } catch (e) {
    console.error('?��? CSV 寫入?��?中發?�錯�?', e);
  }
  
  process.exit(0);
}

// ??��?��?信�?
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

app.use(express.json());

// ==========================================
// ?? ?�購專�? API 端�? (Group Buy REST APIs)
// ==========================================

// ?��??�?��?購�?�?(?�援多�?購活?��??��??�於大廳)
app.get('/api/groupbuy_list', (req, res) => {
  const list = Object.entries(groupBuyData).map(([id, gb]) => ({
    id,
    active: !!gb.active,
    title: gb.title || '?�購專�?',
    notice: gb.notice || '',
    itemCount: Array.isArray(gb.items) ? gb.items.length : 0,
    orderCount: gb.orders ? Object.keys(gb.orders).length : 0,
    hiddenFromLobby: !!gb.hiddenFromLobby
  }));
  res.json({ success: true, list });
});

// 管�??�建立全?��?購活??
app.post('/api/groupbuy_create', async (req, res) => {
  const { title, items } = req.body || {};
  const newGid = 'gb_' + Date.now();
  const defaultData = groupBuyData['default'] || {};
  
  groupBuyData[newGid] = {
    id: newGid,
    active: false,
    title: title || '?? ?�新?�購活�?專�?',
    notice: '?�� 歡�??�購！�?填寫姓�??�話，送出後�?完�?轉帳??,
    paymentSettings: defaultData.paymentSettings || {
      linePayLink: '',
      linePayQrUrl: '',
      bankCode: '822',
      bankName: '中�?信�?',
      bankAccount: '1234-5678-9012',
      bankAccountName: '?�購主辦�?
    },
    items: Array.isArray(items) && items.length > 0 ? items : getZhanRongDefaultItems(),
    orders: {}
  };

  await saveGroupBuyStorage();
  if (typeof io !== 'undefined' && io) io.emit('group_buy_state_updated', { gid: newGid, data: groupBuyData[newGid] });
  res.json({ success: true, gid: newGid, data: groupBuyData[newGid] });
});

// ?��?該群組�?購�???
app.get('/api/groupbuy/:gid', (req, res) => {
  const gid = req.params.gid || 'default';
  const data = getGroupBuyInfo(gid);
  res.json({ success: true, data });
});

// ?��?/?��??�購
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

// ?��??�購設�?
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

// ?��??�「�??�帶?�」�?設�???
app.post('/api/groupbuy/:gid/save_preset', async (req, res) => {
  const { items, presetName } = req.body || {};
  if (!Array.isArray(items)) {
    return res.status(400).json({ success: false, error: '?��??��??��??? });
  }
  defaultMenuItems = items;
  try {
    const dataToSave = { presetName: presetName || '展榮?��? 鹿港?�承?�產', items };
    await fs.promises.writeFile(DEFAULT_MENU_FILE, JSON.stringify(dataToSave, null, 2), 'utf8');
    res.json({ success: true, count: items.length, presetName: dataToSave.presetName });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ?��??�編輯�??��???
app.post('/api/groupbuy/:gid/item/save', async (req, res) => {
  const gid = req.params.gid || 'default';
  const { uid, item } = req.body;
  if (!item || !item.name || item.price === undefined) {
    return res.status(400).json({ success: false, error: '缺�??��??�稱?�價?? });
  }

  const gb = getGroupBuyInfo(gid);
  if (!Array.isArray(gb.items)) gb.items = [];

  const existingIdx = gb.items.findIndex(i => i.id === item.id);
  const itemObj = {
    id: item.id || 'gb_item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    name: item.name,
    price: Number(item.price) || 0,
    category: item.category || '?��??��?',
    unit: item.unit || '�?,
    description: item.description || '',
    contents: item.contents || '',
    imageUrl: item.imageUrl || '',
    linkUrl: item.linkUrl || '',
    linkText: item.linkText || '點�??�入'
  };

  if (existingIdx >= 0) {
    gb.items[existingIdx] = itemObj;
  } else {
    gb.items.unshift(itemObj); // ?�新增置??
  }

  await saveGroupBuyStorage();
  if (typeof io !== 'undefined' && io) io.emit('group_buy_state_updated', { gid, data: gb });
  res.json({ success: true, data: itemObj });
});

// ?�除?��??��?
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

// ?��?修改?��??�稱
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
    return res.status(400).json({ success: false, error: '缺�?使用?��?�? });
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

// 標�??��?付款
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

// 清空?�?��???
app.post('/api/groupbuy/:gid/clear_orders', async (req, res) => {
  const gid = req.params.gid || 'default';
  const { uid } = req.body;
  const gb = getGroupBuyInfo(gid);
  gb.orders = {};
  await saveGroupBuyStorage();
  if (typeof io !== 'undefined' && io) io.emit('group_buy_state_updated', { gid, data: gb });
  res.json({ success: true });
});

// ?�除?��?訂單
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

// ?��???debug 端�?，用來印?�當?��??��??�??
app.get('/api/systemLogs', async (req, res) => {
  // 簡�?權�?檢查
  const { uid } = req.query;
  const isSuperAdminUser = isSuperAdmin(uid);
  
  // ?��??��?�?uid 存在就�??��??�直?��???(LIFF端�??��??��?)
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
      // 立即?��?一次�?延遲5秒�?確�??��??��??��??��?
      setTimeout(() => {
        pingSelf().catch(console.error);
      }, 5000);
      
      // 依設定頻?�執行自?�PING
      setInterval(() => {
        pingSelf().catch(console.error);
      }, AUTO_WAKE_INTERVAL_MINUTES * 60 * 1000);
      
      console.log(`???��??��?定�??�已?��?（�? ${AUTO_WAKE_INTERVAL_MINUTES} ?��?）`);
      logToFile(`[STARTUP] Auto-wake timer started (every ${AUTO_WAKE_INTERVAL_MINUTES} minutes)`);
    } else {
      console.log('?��? 已�??�自?��??��??�器（AUTO_WAKE_ENABLED=false�?);
    }
  });
}).catch(err => {
  console.error('??伺�??��??��?始�?失�?:', err);
});

// 設�?大廳紀?�「�?小�??��??�自?�儲存�???
function scheduleHourlySaveLobbyVisits() {
  const now = new Date();
  const delayToNextHour = 3600000 - (now.getMinutes() * 60000 + now.getSeconds() * 1000 + now.getMilliseconds());
  setTimeout(() => {
    saveLobbyVisits().catch(e => console.error(e));
    setInterval(() => {
      saveLobbyVisits().catch(e => console.error(e));
    }, 3600000); // 之�?每�?一小�?
  }, delayToNextHour);
}
scheduleHourlySaveLobbyVisits();
async function sendLobbyLink(token, gid, prefix = "") {
  let msg = prefix ? `${prefix}\n` : '';
  
  const groupGames = Object.values(games).filter(g => (g.gid === gid || (g.targetGids && g.targetGids.includes(gid))) && g.active && !g.isManualEnded);
  if (groupGames.length === 0) {
    msg += '?��?沒�??��?中�??�次?��?請輸?�「接龍�?始」�?建�???;
  } else {
    msg += `?��??��? ${groupGames.length} ?�場次�??�報?�中 ?��\n`;
  }
  
  if (process.env.LIFF_ID) {
    msg += `\n?? 點�?下方????�入?��?大廳\nhttps://liff.line.me/${process.env.LIFF_ID}?gid=${gid}`;
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
    altText: '點�??�大�?,
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
              label: '?�入大廳',
              uri: `https://liff.line.me/${process.env.LIFF_ID}?gid=${gid}`
            }
          }
        ]
      }
    }
  };
}
