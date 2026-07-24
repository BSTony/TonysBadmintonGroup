const fs = require('fs');

// Patch index.html
let htmlFile = 'c:/Users/tony.hsieh/Desktop/TonysData/TonysBadmintion/public/index.html';
let html = fs.readFileSync(htmlFile, 'utf8');
if (!html.includes('gb-admin-hidden-lobby-input')) {
  html = html.replace(
    /<div><label style="display:block;font-size:13px;font-weight:bold;color:#334155;margin-bottom:6px;">📢 活動公告<\/label><textarea id="gb-admin-notice-input" rows="3" placeholder="例如：請於當天 18:00 前完成下單..." style="width:100%;padding:10px 14px;font-size:14px;border:1px solid #cbd5e1;border-radius:8px;box-sizing:border-box;resize:vertical;"><\/textarea><\/div>/,
    `<div><label style="display:block;font-size:13px;font-weight:bold;color:#334155;margin-bottom:6px;">📢 活動公告</label><textarea id="gb-admin-notice-input" rows="3" placeholder="例如：請於當天 18:00 前完成下單..." style="width:100%;padding:10px 14px;font-size:14px;border:1px solid #cbd5e1;border-radius:8px;box-sizing:border-box;resize:vertical;"></textarea></div>
              <div><label style="display:flex;align-items:center;font-size:13px;font-weight:bold;color:#334155;cursor:pointer;"><input type="checkbox" id="gb-admin-hidden-lobby-input" style="margin-right:8px;width:16px;height:16px;" /> 🙈 不顯示在羽球大廳 (僅能透過專屬連結進入)</label></div>`
  );
  html = html.replace(/Version: V202607240527/g, 'Version: V202607240528');
  html = html.replace(/app\.js\?v=V202607240527/g, 'app.js?v=V202607240528');
  fs.writeFileSync(htmlFile, html);
  console.log('Patched index.html');
}

// Patch app.js
let appFile = 'c:/Users/tony.hsieh/Desktop/TonysData/TonysBadmintion/public/app.js';
let app = fs.readFileSync(appFile, 'utf8');

// 1. Add gbAdminHiddenLobbyInput variable
if (!app.includes("document.getElementById('gb-admin-hidden-lobby-input')")) {
  app = app.replace(
    /const gbAdminNoticeInput = document\.getElementById\('gb-admin-notice-input'\);/,
    `const gbAdminNoticeInput = document.getElementById('gb-admin-notice-input');\nconst gbAdminHiddenLobbyInput = document.getElementById('gb-admin-hidden-lobby-input');`
  );
  
  // 2. Add to populateAdminFields
  app = app.replace(
    /if \(gbAdminNoticeInput\) gbAdminNoticeInput\.value = currentGroupBuyData\.notice \|\| '';/,
    `if (gbAdminNoticeInput) gbAdminNoticeInput.value = currentGroupBuyData.notice || '';\n  if (gbAdminHiddenLobbyInput) gbAdminHiddenLobbyInput.checked = !!currentGroupBuyData.hiddenFromLobby;`
  );

  // 3. Add to btnGbSaveSettings.onclick payload
  app = app.replace(
    /notice: gbAdminNoticeInput\.value\.trim\(\)/,
    `notice: gbAdminNoticeInput.value.trim(),\n        hiddenFromLobby: gbAdminHiddenLobbyInput ? gbAdminHiddenLobbyInput.checked : false`
  );

  // 4. Modify renderLobbyGroupBuyBanners logic
  app = app.replace(
    /const activeGroupBuys = \(list \|\| \[\]\)\.filter\(gb => gb\.active\);/,
    `let activeGroupBuys = (list || []).filter(gb => gb.active);\n  if (!isUserAdmin) {\n    activeGroupBuys = activeGroupBuys.filter(gb => !gb.hiddenFromLobby);\n  }`
  );
  app = app.replace(
    /<div style="font-size:15px; font-weight:bold;">\$\{gb\.title \|\| '團購專區'\}<\/div>/,
    `<div style="font-size:15px; font-weight:bold;">\${gb.title || '團購專區'} \${gb.hiddenFromLobby ? '<span style="color:#facc15;font-size:12px;">[大廳隱藏]</span>' : ''}</div>`
  );

  fs.writeFileSync(appFile, app);
  console.log('Patched app.js');
}

// Patch index.js
let indexFile = 'c:/Users/tony.hsieh/Desktop/TonysData/TonysBadmintion/index.js';
let indexJs = fs.readFileSync(indexFile, 'utf8');
let indexChanged = false;

if (!indexJs.includes('if (hiddenFromLobby !== undefined) info.hiddenFromLobby = hiddenFromLobby;')) {
  indexJs = indexJs.replace(
    /const { uid, title, notice, paymentSettings, items } = req\.body \|\| \{\};/,
    `const { uid, title, notice, hiddenFromLobby, paymentSettings, items } = req.body || {};`
  );
  indexJs = indexJs.replace(
    /if \(typeof notice === 'string'\) info\.notice = notice\.trim\(\);/,
    `if (typeof notice === 'string') info.notice = notice.trim();\n  if (hiddenFromLobby !== undefined) info.hiddenFromLobby = hiddenFromLobby;`
  );
  indexChanged = true;
}

if (!indexJs.includes('if (hiddenFromLobby !== undefined) gb.hiddenFromLobby = hiddenFromLobby;')) {
  indexJs = indexJs.replace(
    /const { uid, title, notice, paymentSettings, items } = req\.body;/,
    `const { uid, title, notice, hiddenFromLobby, paymentSettings, items } = req.body;`
  );
  indexJs = indexJs.replace(
    /if \(notice !== undefined\) gb\.notice = notice;/,
    `if (notice !== undefined) gb.notice = notice;\n  if (hiddenFromLobby !== undefined) gb.hiddenFromLobby = hiddenFromLobby;`
  );
  indexChanged = true;
}

if (indexChanged) {
  fs.writeFileSync(indexFile, indexJs);
  console.log('Patched index.js');
}

