const fs = require('fs');
const file = 'c:/Users/tony.hsieh/Desktop/TonysData/TonysBadmintion/public/app.js';
let content = fs.readFileSync(file, 'utf8');

const regex = /\} catch \(err\) \{\s*console\.error\('LIFF Init Error:', err\);\s*try \{\s*currentUser = currentUser \|\| \{ userId: 'U_LOCAL_TEST', displayName: '本地球友' \};\s*globalIsSuperAdmin = true;\s*globalIsAdmin = true;\s*await loadGamesLobby\(\);\s*initSocket\(\);\s*\} catch\(e\) \{\}\s*const appDivEl = document\.getElementById\('app'\);\s*if \(appDivEl\) appDivEl\.className = '';\s*const statusMsgEl = document\.getElementById\('status-msg'\);\s*if \(statusMsgEl\) statusMsgEl\.style\.display = 'none';\s*\}/;

const replacement = `} catch (err) {
    console.error('LIFF Init Error:', err);
    try {
      currentUser = currentUser || { userId: 'U_LOCAL_TEST', displayName: '一般訪客' };
      globalIsSuperAdmin = false;
      globalIsAdmin = false;
      
      const urlParams = new URLSearchParams(window.location.search);
      const buyFromUrl = urlParams.get('buy');
      
      if (buyFromUrl) {
        if (btnBackGroupBuy) btnBackGroupBuy.style.display = 'none';
        openGroupBuyPage(buyFromUrl);
      } else {
        await loadGamesLobby();
      }
      initSocket();
    } catch(e) {}
    const appDivEl = document.getElementById('app');
    if (appDivEl) appDivEl.className = '';
    const statusMsgEl = document.getElementById('status-msg');
    if (statusMsgEl) statusMsgEl.style.display = 'none';
  }`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
console.log('Replaced via node script');
