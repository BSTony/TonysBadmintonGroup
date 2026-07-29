import re

with open('public/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace btnPinballAdminSync logic
target_pinball_sync = r"""  if (btnPinballAdminSync) {
    btnPinballAdminSync.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/admin/pinball/sync-pool', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: currentUser.userId, pool: partyLobbyNames })
        });"""

replacement_pinball_sync = r"""  if (btnPinballAdminSync) {
    btnPinballAdminSync.addEventListener('click', async () => {
      try {
        let allNames = [];
        gamesList.forEach(g => {
          if (!isGameExpired(g) && g.participants) {
            g.participants.forEach(p => {
               if (p.name && !allNames.includes(p.name)) allNames.push(p.name);
            });
          }
        });
        if (allNames.length === 0) {
           alert('目前沒有任何報名中的玩家！');
           return;
        }
        const res = await fetch('/api/admin/pinball/sync-pool', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: currentUser.userId, pool: allNames })
        });"""

content = content.replace(target_pinball_sync, replacement_pinball_sync)

# Replace btnImportLobbyUsers logic
target_lottery_sync = r"""  if (btnImportLobbyUsers) {
    btnImportLobbyUsers.addEventListener('click', () => {
      if (partyLobbyNames && partyLobbyNames.length > 0) {
        partyLobbyNames.forEach(name => {
          if (!lotteryAdminPool.includes(name)) lotteryAdminPool.push(name);
        });"""

replacement_lottery_sync = r"""  if (btnImportLobbyUsers) {
    btnImportLobbyUsers.addEventListener('click', () => {
      let allNames = [];
      gamesList.forEach(g => {
        if (!isGameExpired(g) && g.participants) {
          g.participants.forEach(p => {
             if (p.name && !allNames.includes(p.name)) allNames.push(p.name);
          });
        }
      });
      if (allNames && allNames.length > 0) {
        allNames.forEach(name => {
          if (!lotteryAdminPool.includes(name)) lotteryAdminPool.push(name);
        });"""

content = content.replace(target_lottery_sync, replacement_lottery_sync)

with open('public/app.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("app.js patched")
