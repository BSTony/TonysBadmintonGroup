const fs = require('fs');

// Patch app.js
let appFile = 'c:/Users/tony.hsieh/Desktop/TonysData/TonysBadmintion/public/app.js';
let app = fs.readFileSync(appFile, 'utf8');

// 1. saveCartToBackend payload
if (!app.includes('userPictureUrl: currentUser.pictureUrl')) {
  app = app.replace(
    /userName: name,\s*userPhone: phone,/,
    `userName: name,\n        userPhone: phone,\n        userPictureUrl: currentUser.pictureUrl || '',`
  );
}

// 2. openItemDetail innerHTML
if (!app.includes('itemDetailDesc.innerHTML = (item.description')) {
  app = app.replace(
    /if \(itemDetailDesc\) itemDetailDesc\.innerText = item\.description \|\| '暫無詳細說明';/,
    `if (itemDetailDesc) itemDetailDesc.innerHTML = (item.description || '暫無詳細說明').replace(/\\n/g, '<br/>');`
  );
}

// 3. renderSummaryTab: buyers list in openItemDetail
if (!app.includes('const avatarHtml = ord.userPictureUrl')) {
  app = app.replace(
    /buyers\.push\(\`- \$\{ord\.userName\} : \$\{q\} \$\{itemObj\.unit \|\| ''\}\`\);/,
    `const avatarHtml = ord.userPictureUrl ? \`<img src="\${ord.userPictureUrl}" style="width:20px;height:20px;border-radius:50%;vertical-align:middle;margin-right:4px;">\` : '👤';\n                buyers.push(\`- \${avatarHtml} \${ord.userName} : \${q} \${itemObj.unit || ''}\`);`
  );
}

// 4. renderSummaryTab: individual order cards
if (!app.includes('const avatarImg = ord.userPictureUrl')) {
  app = app.replace(
    /<span>👤 \$\{ord\.userName\}\$\{phoneDisplay\}<\/span>/,
    `<span>\${ord.userPictureUrl ? \`<img src="\${ord.userPictureUrl}" style="width:24px;height:24px;border-radius:50%;vertical-align:middle;margin-right:6px;">\` : '👤 '}\${ord.userName}\${phoneDisplay}</span>`
  );
}

fs.writeFileSync(appFile, app);
console.log('Patched app.js');

// Patch index.js
let indexFile = 'c:/Users/tony.hsieh/Desktop/TonysData/TonysBadmintion/index.js';
let indexJs = fs.readFileSync(indexFile, 'utf8');

// replace both occurrences in index.js for order saving
let replacedIndex = false;

if (!indexJs.includes('const { uid, userName, userPhone, userPictureUrl,')) {
  indexJs = indexJs.replace(
    /const \{ uid, userName, userPhone, items, paymentMethod, paymentNote, note \} = req\.body \|\| \{\};/g,
    `const { uid, userName, userPhone, userPictureUrl, items, paymentMethod, paymentNote, note } = req.body || {};`
  );
  replacedIndex = true;
}

if (!indexJs.includes('userPictureUrl: userPictureUrl || \'\',')) {
  indexJs = indexJs.replace(
    /userPhone: userPhone\.trim\(\),/g,
    `userPhone: userPhone.trim(),\n    userPictureUrl: userPictureUrl || '',`
  );
  replacedIndex = true;
}

if (replacedIndex) {
  fs.writeFileSync(indexFile, indexJs);
  console.log('Patched index.js');
}
