const fs = require('fs');
const file = 'c:/Users/tony.hsieh/Desktop/TonysData/TonysBadmintion/public/app.js';
let content = fs.readFileSync(file, 'utf8');

const regex = /const btnSaveThemeSettings = document\.querySelector\('\.btn-save-theme-settings'\);\s*if \(btnSaveThemeSettings\) \{\s*btnSaveThemeSettings\.onclick = \(\) => \{\s*if \(btnGbSaveSettings\) btnGbSaveSettings\.click\(\);\s*\};\s*\}/;

const replacement = `const btnSaveThemeSettings = document.querySelector('.btn-save-theme-settings');
  if (btnSaveThemeSettings) {
    btnSaveThemeSettings.onclick = async () => {
      const payload = {
        uid: currentUser.userId,
        title: gbAdminTitleInput ? gbAdminTitleInput.value.trim() : '',
        notice: gbAdminNoticeInput ? gbAdminNoticeInput.value.trim() : '',
        hiddenFromLobby: gbAdminHiddenLobbyInput ? gbAdminHiddenLobbyInput.checked : false
      };
      try {
        const res = await fetch(\`/api/groupbuy/\${currentGid || 'default'}/settings\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) alert('✅ 團購設定已儲存！');
      } catch(e) { alert('儲存失敗：' + e.message); }
    };
  }`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
console.log('Fixed save button logic!');
