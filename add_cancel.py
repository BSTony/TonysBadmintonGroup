import sys

with open('public/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add handleCancelByName function
cancel_func = """
// 透過名稱取消報名
window.handleCancelByName = async function(gameId, name) {
  if (!confirm(`確定要取消「${name}」的報名嗎？`)) return;
  try {
    appDiv.className = 'loading';
    statusMsg.innerText = '取消中...';
    
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gid: currentGroupId,
        gameId: gameId,
        uid: currentUser.userId,
        name: name,
        action: 'cancel'
      })
    });
    
    const result = await res.json();
    if (!res.ok) {
      alert(result.error || '發生錯誤');
      await loadGamesLobby();
      return;
    }
    
    const idx = gamesList.findIndex(g => g.gameId === gameId);
    if (idx !== -1) gamesList[idx] = result.game;
    renderDetail(gameId);
    
  } catch (err) {
    console.error(err);
    alert('網路錯誤，請稍後再試');
    await loadGamesLobby();
  }
};
"""

if 'window.handleCancelByName =' not in content:
    content += cancel_func

# 2. Modify renderDetail to add the delete button
# Target 1 (Regular list)
target_1_old = """        // 判斷是否為我代報的 (可以給取消按鈕，但實作上稍微複雜，這裡先簡單顯示名稱)
        secDiv.innerHTML += `
          <div class="list-item">
            <div class="list-num">${i + 1}.</div>
            <div class="list-name ${isMe ? 'me' : ''}">${escapeHTML(displayName)}</div>
          </div>
        `;"""
target_1_new = """        // 加入取消按鈕，讓大家可以幫代報名的人取消
        const canCancel = name !== '__ANON__';
        secDiv.innerHTML += `
          <div class="list-item">
            <div class="list-num">${i + 1}.</div>
            <div class="list-name ${isMe ? 'me' : ''}">${escapeHTML(displayName)}</div>
            ${canCancel ? `<button class="btn-icon" style="color:var(--danger-color); padding: 4px; margin: 0; font-size: 16px;" onclick="handleCancelByName('${game.gameId}', '${escapeHTML(name)}')">✖</button>` : ''}
          </div>
        `;"""

# Target 2 (Backup list)
target_2_old = """        secDiv.innerHTML += `
          <div class="list-item">
            <div class="list-num">候${i - sec.limit + 1}.</div>
            <div class="list-name ${isMe ? 'me' : ''}">${escapeHTML(displayName)}</div>
          </div>
        `;"""
target_2_new = """        const canCancel = name !== '__ANON__';
        secDiv.innerHTML += `
          <div class="list-item">
            <div class="list-num">候${i - sec.limit + 1}.</div>
            <div class="list-name ${isMe ? 'me' : ''}">${escapeHTML(displayName)}</div>
            ${canCancel ? `<button class="btn-icon" style="color:var(--danger-color); padding: 4px; margin: 0; font-size: 16px;" onclick="handleCancelByName('${game.gameId}', '${escapeHTML(name)}')">✖</button>` : ''}
          </div>
        `;"""

content = content.replace(target_1_old, target_1_new)
content = content.replace(target_2_old, target_2_new)

with open('public/app.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated public/app.js with cancel button")
