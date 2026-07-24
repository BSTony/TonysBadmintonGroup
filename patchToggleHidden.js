const fs = require('fs');

// Patch app.js
let appFile = 'c:/Users/tony.hsieh/Desktop/TonysData/TonysBadmintion/public/app.js';
let app = fs.readFileSync(appFile, 'utf8');

if (!app.includes('hiddenFromLobby: gbAdminHiddenLobbyInput ? gbAdminHiddenLobbyInput.checked : false')) {
  app = app.replace(
    /body: JSON\.stringify\(\{ uid: currentUser\?\.userId \|\| 'admin', active: newActive \}\)/,
    `body: JSON.stringify({ uid: currentUser?.userId || 'admin', active: newActive, hiddenFromLobby: gbAdminHiddenLobbyInput ? gbAdminHiddenLobbyInput.checked : false })`
  );
  fs.writeFileSync(appFile, app);
  console.log('Patched app.js toggle payload');
}

// Patch index.js
let indexFile = 'c:/Users/tony.hsieh/Desktop/TonysData/TonysBadmintion/index.js';
let indexJs = fs.readFileSync(indexFile, 'utf8');
let indexChanged = false;

// first toggle endpoint
if (!indexJs.includes('const { uid, active, hiddenFromLobby } = req.body || {};')) {
  indexJs = indexJs.replace(
    /const \{ uid, active \} = req\.body \|\| \{\};/,
    `const { uid, active, hiddenFromLobby } = req.body || {};`
  );
  indexJs = indexJs.replace(
    /info\.active = typeof active === 'boolean' \? active : !info\.active;/,
    `info.active = typeof active === 'boolean' ? active : !info.active;\n  if (hiddenFromLobby !== undefined) info.hiddenFromLobby = hiddenFromLobby;`
  );
  indexChanged = true;
}

// second toggle endpoint
if (!indexJs.includes('const { uid, active, hiddenFromLobby } = req.body;')) {
  indexJs = indexJs.replace(
    /const \{ uid, active \} = req\.body;/,
    `const { uid, active, hiddenFromLobby } = req.body;`
  );
  indexJs = indexJs.replace(
    /gb\.active = !!active;/,
    `gb.active = !!active;\n  if (hiddenFromLobby !== undefined) gb.hiddenFromLobby = hiddenFromLobby;`
  );
  indexChanged = true;
}

if (indexChanged) {
  fs.writeFileSync(indexFile, indexJs);
  console.log('Patched index.js toggle endpoints');
}
