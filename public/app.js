function showFloatingEmoji(e, emoji) {
  if (!e) return;
  const el = document.createElement('div');
  el.innerText = emoji;
  el.style.position = 'fixed';
  el.style.left = (e.clientX - 10) + 'px';
  el.style.top = (e.clientY - 20) + 'px';
  el.style.fontSize = '30px';
  el.style.pointerEvents = 'none';
  el.style.zIndex = '9999';
  el.style.transition = 'all 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
  document.body.appendChild(el);
  
  // force reflow
  void el.offsetHeight;
  
  el.style.transform = `translateY(-60px) scale(1.5) rotate(${Math.random() * 20 - 10}deg)`;
  el.style.opacity = '0';
  
  setTimeout(() => el.remove(), 800);
}

// === 全域狀態 ===
let currentUser = null;
let currentGroupId = null;
let currentDetailGame = null;
let gamesList = [];
let globalIsAdmin = false;
let globalManagedGroups = [];
let globalLobbyTitle = '羽球接龍大廳';
let currentGameDetailId = null;

// DOM 元素
const appDiv = document.getElementById('app');
const statusMsg = document.getElementById('status-msg');
const lobbyView = document.getElementById('lobby-view');
const detailView = document.getElementById('detail-view');
const gamesContainer = document.getElementById('games-container');
const noGamesMsg = document.getElementById('no-games-msg');

const btnBack = document.getElementById('btn-back');
const detailTitle = document.getElementById('detail-title');
const detailCount = document.getElementById('detail-count');
const detailList = document.getElementById('detail-list');

// 初始化 LIFF
async function initializeLiff() {
  try {
    // 1. 取得後端系統設定
    const configRes = await fetch(`/api/config?_t=${Date.now()}`);
    if (!configRes.ok) throw new Error('無法取得系統設定');
    const config = await configRes.json();
    
    if (!config.liffId) {
      throw new Error('系統未設定 LIFF ID');
    }

    // 2. 初始化 LIFF SDK
    await liff.init({ liffId: config.liffId });

    // 3. 確保使用者已登入
    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }

    // 取得使用者資料
    const profile = await liff.getProfile();
    currentUser = profile;

    // 4. 取得群組 Context
    const urlParams = new URLSearchParams(window.location.search);
    const gidFromUrl = urlParams.get('gid');
    const context = liff.getContext();
    
    if (gidFromUrl) {
      currentGroupId = gidFromUrl;
    } else if (context && (context.type === 'group' || context.type === 'room')) {
      currentGroupId = context.groupId || context.roomId;
    } else if (context && context.type === 'utou') {
      currentGroupId = currentUser.userId;
    } else {
      currentGroupId = currentUser.userId;
    }

    // 5. 載入大廳資料
    document.getElementById('create-game-view').classList.add('hidden');
    await loadGamesLobby();

  } catch (err) {
    console.error('LIFF Init Error:', err);
    statusMsg.innerText = err.message || '發生錯誤';
    statusMsg.style.color = '#ff5252';
  }
}

// 載入多場次大廳資料
async function loadGamesLobby() {
  try {
    appDiv.className = 'loading';
    statusMsg.innerText = '載入中...';
    
    const res = await fetch(`/api/game/${currentGroupId}?uid=${currentUser.userId}&_t=${Date.now()}`);
    if (!res.ok) {
      if (res.status === 404) {
        gamesList = [];
      } else {
        throw new Error('無法取得場次資料');
      }
    } else {
      const data = await res.json();
      gamesList = data.games || [];
      globalIsAdmin = !!data.isAdmin;
      globalManagedGroups = data.managedGroups || [];
      globalLobbyTitle = data.lobbyTitle || '羽球接龍大廳';
      globalLobbyDesc = data.lobbyDesc || '本週臨打名額有限，趕快搶位，跟著小豬一起快樂揮拍吧！';
    }

    renderLobby();
  } catch (err) {
    console.error(err);
    appDiv.className = ''; // 確保發生錯誤時也關閉轉圈圈
    statusMsg.innerText = err.message;
    statusMsg.style.display = 'block';
  }
}

// 渲染大廳畫面
function renderLobby() {
    appDiv.className = '';
    lobbyView.classList.remove('hidden');
    detailView.classList.add('hidden');
    
    document.getElementById('lobby-title-text').innerText = globalLobbyTitle || '羽球接龍大廳';
    const btnEditTitle = document.getElementById('btn-edit-title');
    if (globalIsAdmin && btnEditTitle) {
      btnEditTitle.classList.remove('hidden');
      btnEditTitle.onclick = handleEditLobbyTitle;
    } else if (btnEditTitle) {
      btnEditTitle.classList.add('hidden');
    }
    
    document.getElementById('lobby-desc-text').innerText = globalLobbyDesc || '本週臨打名額有限，趕快搶位，跟著小豬一起快樂揮拍吧！';
    const btnEditDesc = document.getElementById('btn-edit-desc');
    if (globalIsAdmin && btnEditDesc) {
      btnEditDesc.classList.remove('hidden');
      btnEditDesc.onclick = handleEditLobbyDesc;
    } else if (btnEditDesc) {
      btnEditDesc.classList.add('hidden');
    }
    
    let pushBtn = document.getElementById('admin-create-game-btn');
    if (globalIsAdmin) {
      if (!pushBtn) {
        const headerEl = document.querySelector('.lobby-header');
        if (headerEl) {
          pushBtn = document.createElement('button');
          pushBtn.id = 'admin-create-game-btn';
          pushBtn.className = 'btn btn-primary';
          pushBtn.style.marginTop = '10px';
          pushBtn.style.width = '100%';
          pushBtn.style.backgroundColor = '#FF9800'; // Orange for creating
          pushBtn.innerText = '➕ 管理者開團';
          pushBtn.onclick = showCreateGameForm;
          headerEl.appendChild(pushBtn);
        }
      }
      if (pushBtn) pushBtn.style.display = 'block';
    } else if (pushBtn) {
      pushBtn.style.display = 'none';
    }
    
    gamesContainer.innerHTML = '';
    
    if (gamesList.length === 0) {
      noGamesMsg.classList.remove('hidden');
      return;
    }
    
    noGamesMsg.classList.add('hidden');
    
    gamesList.forEach(game => {
      const section = game.sections[0] || { list: [], limit: 20 };
      const count = section.list.length;
      const limit = section.limit;
      const backupLimit = section.backupLimit || 0;
      const totalLimit = limit + backupLimit;
      
      const isFull = count >= totalLimit;
      const isWaitlist = count >= limit && count < totalLimit;
      
      const isMeRegistered = game.myRegisteredNames && game.myRegisteredNames.length > 0;
      
      let badgeStyle = isFull ? 'background-color: #E0E0E0; color: #888888;' : (isWaitlist ? 'background-color: #FFF3E0; color: #E65100;' : '');
      let badgeText = isFull ? '已額滿' : (isWaitlist ? '⚠ 候補中' : '✓ 開放報名');
      
      let customTagsHtml = '';
      if (game.tag) {
         const tagArr = game.tag.split(/[,、，]/).map(t => t.trim()).filter(Boolean);
         customTagsHtml = tagArr.map(t => `<div class="badge default">${escapeHTML(t)}</div>`).join('');
      }
      
      const card = document.createElement('div');
      const progressPercent = limit > 0 ? Math.min(100, (count / limit) * 100) : 0;
      const progressColor = count > limit ? 'var(--danger-color)' : 'var(--primary-color)';
      
      card.className = 'game-card';
      const prefName = localStorage.getItem('preferredName') || '';
      
      card.innerHTML = `
        <div class="card-badges" onclick="showDetail('${game.gameId}')" style="cursor: pointer; flex-wrap: wrap;">
          <div class="badge ${isFull ? 'full' : 'open'}" style="${badgeStyle}">
            ${badgeText}
          </div>
          ${customTagsHtml}
          ${isMeRegistered ? '<div class="badge open" style="background-color: var(--primary-color); color: white;">已報名</div>' : ''}
        </div>
        
        <div class="card-title" onclick="showDetail('${game.gameId}')" style="cursor: pointer;">
          ${escapeHTML(game.title || '羽球接龍')}
        </div>
        
        <div class="info-grid" onclick="showDetail('${game.gameId}')" style="cursor: pointer;">
          <div class="info-item">
            <span class="info-icon">📅</span>
            <span>${escapeHTML(game.date || '未設定')}</span>
          </div>
          <div class="info-item">
            <span class="info-icon">⏰</span>
            <span>${escapeHTML(game.time || '未設定')}</span>
          </div>
          <div class="info-item">
            <span class="info-icon">📍</span>
            <span>${escapeHTML(game.location || '未設定')}</span>
          </div>
          <div class="info-item">
            <span class="info-icon">💰</span>
            <span>${escapeHTML(game.fee || '未設定')}</span>
          </div>
        </div>
        
        ${game.note ? `<div class="game-note" onclick="showDetail('${game.gameId}')" style="cursor: pointer;">${escapeHTML(game.note)}</div>` : ''}
        
        <div class="progress-container" onclick="showDetail('${game.gameId}')" style="cursor: pointer;">
          <div class="progress-header">
            <span>名額進度</span>
            <span class="progress-value" style="color: ${count > limit ? 'var(--danger-color)' : 'var(--text-main)'}">${count} / ${limit} 人</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${progressPercent}%; background-color: ${progressColor};"></div>
          </div>
        </div>
        
        <div class="action-row" style="flex-wrap: wrap;">
          <button class="btn btn-primary btn-square" ${isFull ? 'disabled style="opacity:0.5"' : ''} onclick="handleActionWithInput(event, '${game.gameId}', 'register')">+1</button>
          <button class="btn btn-danger btn-square" onclick="handleActionWithInput(event, '${game.gameId}', 'cancel')">-1</button>
          <input type="text" id="name-input-${game.gameId}" class="name-input" placeholder="${escapeHTML(currentUser.displayName)}" value="${escapeHTML(prefName)}" style="flex: 2; min-width: 100px; font-weight: bold;" />
          <input type="text" id="level-input-${game.gameId}" class="name-input" placeholder="程度" style="flex: 1; min-width: 60px; margin-left: 8px; font-weight: bold;" />
        </div>
        <div id="error-msg-${game.gameId}" class="error-msg"></div>
      `;
      gamesContainer.appendChild(card);
    });
  
  // 更新狀態文字 (原本是轉圈圈，現在因為 appDiv.className='' 所以圈圈消失，我們更新文字)
  const headerP = document.querySelector('.lobby-header p');
  if (headerP) headerP.innerText = '點選標題進入後，可查看、取消名單';
  const statusEl = document.getElementById('status-msg');
  if (statusEl) statusEl.style.display = 'none';
}

async function handleEditLobbyTitle() {
  const newTitle = prompt('請輸入新的大廳標題：', globalLobbyTitle || '');
  if (newTitle === null) return;
  try {
    appDiv.className = 'loading';
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gid: currentGroupId,
        uid: currentUser.userId,
        action: 'updateLobbyTitle',
        text: newTitle
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.lobbyTitle) {
        globalLobbyTitle = data.lobbyTitle;
        renderLobby();
      }
    } else {
      alert('修改失敗');
    }
  } catch(e) {
    alert('網路錯誤');
  } finally {
    appDiv.className = '';
  }
}

async function handleEditLobbyDesc() {
  const newDesc = prompt('請輸入新的大廳描述：', globalLobbyDesc || '');
  if (newDesc === null) return;
  try {
    appDiv.className = 'loading';
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gid: currentGroupId,
        uid: currentUser.userId,
        action: 'updateLobbyDesc',
        text: newDesc
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.lobbyDesc !== undefined) {
        globalLobbyDesc = data.lobbyDesc;
        renderLobby();
      }
    } else {
      alert('修改失敗');
    }
  } catch (err) {
    alert('網路錯誤');
  } finally {
    appDiv.className = '';
  }
}

// 處理一般報名或取消
async function handleAction(gameId, action) {
  try {
    appDiv.className = 'loading';
    statusMsg.innerText = '處理中...';
    
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gid: currentGroupId,
        gameId: gameId,
        uid: currentUser.userId,
        name: currentUser.displayName,
        action: action
      })
    });
    
    const result = await res.json();
    if (!res.ok) {
      alert(result.error || '發生錯誤');
      await loadGamesLobby();
      return;
    }
    
    // 成功後更新資料庫陣列並重新渲染
    const idx = gamesList.findIndex(g => g.gameId === gameId);
    if (idx !== -1) gamesList[idx] = result.game;
    
    if (currentGameDetailId) {
      renderDetail(gameId);
    } else {
      renderLobby();
    }
  } catch (err) {
    console.error(err);
    alert('網路錯誤，請稍後再試');
    await loadGamesLobby();
  }
}

// 處理代報名
async function handleProxyRegister(gameId) {
  const input = document.getElementById(`proxy-name-${gameId}`);
  if (!input) return;
  const name = input.value.trim();
  if (!name) {
    alert('請輸入代報名名稱');
    return;
  }
  
  try {
    appDiv.className = 'loading';
    statusMsg.innerText = '代報名處理中...';
    
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gid: currentGroupId,
        gameId: gameId,
        uid: currentUser.userId,
        name: name,
        action: 'register'
      })
    });
    
    const result = await res.json();
    if (!res.ok) {
      alert(result.error || '發生錯誤');
      await loadGamesLobby();
      return;
    }
    
    input.value = '';
    const idx = gamesList.findIndex(g => g.gameId === gameId);
    if (idx !== -1) gamesList[idx] = result.game;
    renderLobby();
    
  } catch (err) {
    console.error(err);
    alert('網路錯誤，請稍後再試');
    await loadGamesLobby();
  }
}
// 切換至明細畫面
window.showDetail = function(gameId) {
  currentGameDetailId = gameId;
  renderDetail(gameId);
};

// 渲染明細畫面
function renderDetail(gameId) {
  const game = gamesList.find(g => g.gameId === gameId);
  if (!game) return;
  
  appDiv.className = '';
  const statusMsgEl = document.getElementById('status-msg');
  if (statusMsgEl) statusMsgEl.style.display = 'none';
  lobbyView.classList.add('hidden');
  detailView.classList.remove('hidden');
  window.scrollTo(0, 0);
  
  const normalize = s => (s||'').replace(/\s+/g, '');
  const autoStr = normalize([game.date, game.time, game.location].filter(Boolean).join(''));
  const isAutoTitle = normalize(game.title) === autoStr || game.title === '羽球接龍';
  const showTitle = game.title && !isAutoTitle;
  detailTitle.innerText = showTitle ? game.title : '場次明細';
  if (!showTitle) detailTitle.style.display = 'none';
  else detailTitle.style.display = 'block';
  
  const btnCloseGame = document.getElementById('btn-close-game');
  const btnEditGame = document.getElementById('btn-edit-game');
  if (globalIsAdmin) {
    if (btnCloseGame) btnCloseGame.classList.remove('hidden');
    if (btnEditGame) {
      btnEditGame.classList.remove('hidden');
      btnEditGame.onclick = () => showEditGameForm(gameId);
    }
  } else {
    if (btnCloseGame) btnCloseGame.classList.add('hidden');
    if (btnEditGame) btnEditGame.classList.add('hidden');
  }
  
  const section = game.sections[0] || { list: [], limit: 20 };
  const isRegistered = game.myRegisteredNames && game.myRegisteredNames.length > 0;
  detailCount.innerText = `${isRegistered ? '(已報名) ' : ''}${section.list.length} / ${section.limit}`;
  
  detailList.innerHTML = '';
  
  if (globalIsAdmin) {
    let pushListBtn = document.getElementById('admin-push-list-btn');
    if (!pushListBtn) {
      pushListBtn = document.createElement('button');
      pushListBtn.id = 'admin-push-list-btn';
      pushListBtn.className = 'btn btn-primary';
      pushListBtn.style.marginTop = '10px';
      pushListBtn.style.marginBottom = '15px';
      pushListBtn.style.width = '100%';
      pushListBtn.style.backgroundColor = '#FF9800';
      pushListBtn.innerText = '📢 推播目前詳細名單';
      detailView.insertBefore(pushListBtn, detailList);
    }
    pushListBtn.onclick = () => handlePushList(gameId);
    pushListBtn.style.display = 'block';
  } else {
    const pushListBtn = document.getElementById('admin-push-list-btn');
    if (pushListBtn) pushListBtn.style.display = 'none';
  }
  
  const hasTags = game.date || game.time || game.location || game.fee;
  if (hasTags) {
     let tagsHtml = '<div class="info-tags" style="margin-top: 0;">';
     tagsHtml += '<div class="info-row">';
     if (game.date) tagsHtml += `<span class="info-tag">📅 ${escapeHTML(game.date)}</span>`;
     if (game.time) tagsHtml += `<span class="info-tag">⏰ ${escapeHTML(game.time)}</span>`;
     tagsHtml += '</div>';
     tagsHtml += '<div class="info-row" style="margin-top: 4px;">';
     if (game.location) tagsHtml += `<span class="info-tag">📍 ${escapeHTML(game.location)}</span>`;
     if (game.fee) tagsHtml += `<span class="info-tag">💰 ${escapeHTML(game.fee)}</span>`;
     tagsHtml += '</div>';
     tagsHtml += '</div>';
     detailList.innerHTML += tagsHtml;
  }
  if (game.note) {
     detailList.innerHTML += `<div class="game-note">${escapeHTML(game.note)}</div>`;
  }
  
  // 顯示所有區段 (含候補)
  game.sections.forEach((sec, sIdx) => {
    const secDiv = document.createElement('div');
    secDiv.className = 'list-section';
    secDiv.innerHTML = `<h3>${escapeHTML(sec.title)} (限額 ${sec.limit})</h3>`;
    
    for (let i = 0; i < sec.limit; i++) {
      if (i < sec.list.length) {
        const name = sec.list[i];
        const isMe = game.myRegisteredNames && game.myRegisteredNames.includes(name);
        const displayName = (name === '__ANON__') ? '***' : name;
        const levelStr = game.levelMap && game.levelMap[name] ? `<span style="font-size: 12px; color: #888; margin-left: 8px;">(${escapeHTML(game.levelMap[name])})</span>` : '';
        
        const canCancel = name !== '__ANON__';
        
        const isPaid = game.paidMap && game.paidMap[name];
        let paidHtml = '';
        if (canCancel) {
          if (globalIsAdmin) {
            paidHtml = `<button class="paid-btn ${isPaid ? 'paid' : ''}" onclick="handleTogglePaid('${game.gameId}', '${escapeHTML(name)}')">${isPaid ? '💰 已繳費' : '⬜ 未繳費'}</button>`;
          } else if (isPaid) {
            paidHtml = `<span class="paid-badge">💰 已繳費</span>`;
          }
        }
        
        let moveHtml = '';
        if (globalIsAdmin) {
          const canMoveUp = i > 0;
          const canMoveDown = i < sec.list.length - 1;
          moveHtml = `
            <div style="display:flex; flex-direction:column; margin-right: 5px; min-width: 20px;">
              <button class="btn-icon" style="padding:0; font-size: 12px; margin:0; line-height: 1; opacity: ${canMoveUp ? 1 : 0.2}" ${canMoveUp ? `onclick="handleReorder('${game.gameId}', ${i}, ${i-1})"` : 'disabled'}>🔼</button>
              <button class="btn-icon" style="padding:0; font-size: 12px; margin:0; line-height: 1; opacity: ${canMoveDown ? 1 : 0.2}" ${canMoveDown ? `onclick="handleReorder('${game.gameId}', ${i}, ${i+1})"` : 'disabled'}>🔽</button>
            </div>
          `;
        }
        
        secDiv.innerHTML += `
          <div class="list-item">
            ${moveHtml}
            <div class="list-num">${i + 1}.</div>
            <div class="list-name ${isMe ? 'me' : ''}">${escapeHTML(displayName)}${levelStr}</div>
            ${paidHtml}
            ${canCancel ? `<button class="btn-icon" style="color:var(--danger-color); padding: 4px; margin: 0; font-size: 16px;" onclick="handleCancelByName('${game.gameId}', '${escapeHTML(name)}')">❌</button>` : ''}
          </div>
        `;
      } else {
        secDiv.innerHTML += `
          <div class="list-item" style="opacity: 0.3">
            <div class="list-num">${i + 1}.</div>
            <div class="list-name">-- 虛位以待 --</div>
          </div>
        `;
      }
    }
    
    // 候補名單
    if (sec.list.length > sec.limit) {
      secDiv.innerHTML += `<h3 style="margin-top:20px; color:#ff9800">候補名單</h3>`;
      for (let i = sec.limit; i < sec.list.length; i++) {
        const name = sec.list[i];
        const isMe = game.myRegisteredNames && game.myRegisteredNames.includes(name);
        const displayName = (name === '__ANON__') ? '***' : name;
        const levelStr = game.levelMap && game.levelMap[name] ? `<span style="font-size: 12px; color: #888; margin-left: 8px;">(${escapeHTML(game.levelMap[name])})</span>` : '';
        
        const canCancel = name !== '__ANON__';
        
        const isPaid = game.paidMap && game.paidMap[name];
        let paidHtml = '';
        if (canCancel) {
          if (globalIsAdmin) {
            paidHtml = `<button class="paid-btn ${isPaid ? 'paid' : ''}" onclick="handleTogglePaid('${game.gameId}', '${escapeHTML(name)}')">${isPaid ? '💰 已繳費' : '⬜ 未繳費'}</button>`;
          } else if (isPaid) {
            paidHtml = `<span class="paid-badge">💰 已繳費</span>`;
          }
        }
        
        let moveHtml = '';
        if (globalIsAdmin) {
          const canMoveUp = i > 0;
          const canMoveDown = i < sec.list.length - 1;
          moveHtml = `
            <div style="display:flex; flex-direction:column; margin-right: 5px; min-width: 20px;">
              <button class="btn-icon" style="padding:0; font-size: 12px; margin:0; line-height: 1; opacity: ${canMoveUp ? 1 : 0.2}" ${canMoveUp ? `onclick="handleReorder('${game.gameId}', ${i}, ${i-1})"` : 'disabled'}>🔼</button>
              <button class="btn-icon" style="padding:0; font-size: 12px; margin:0; line-height: 1; opacity: ${canMoveDown ? 1 : 0.2}" ${canMoveDown ? `onclick="handleReorder('${game.gameId}', ${i}, ${i+1})"` : 'disabled'}>🔽</button>
            </div>
          `;
        }
        
        secDiv.innerHTML += `
          <div class="list-item" style="opacity: 0.8; background-color: #f9f9f9;">
            ${moveHtml}
            <div class="list-num" style="color: #666; font-size: 12px;">候 ${i - sec.limit + 1}.</div>
            <div class="list-name ${isMe ? 'me' : ''}" style="color: #666;">${escapeHTML(displayName)}${levelStr}</div>
            ${paidHtml}
            ${canCancel ? `<button class="btn-icon" style="color:var(--danger-color); padding: 4px; margin: 0; font-size: 16px;" onclick="handleCancelByName('${game.gameId}', '${escapeHTML(name)}')">❌</button>` : ''}
          </div>
        `;
      }
    }
    
    detailList.appendChild(secDiv);
  });
}

// 返回大廳
btnBack.addEventListener('click', () => {
  currentGameDetailId = null;
  renderLobby();
});

const btnCloseGame = document.getElementById('btn-close-game');
if (btnCloseGame) {
  btnCloseGame.addEventListener('click', async () => {
    if (!currentGameDetailId) return;
    if (!confirm('確定要結束/關閉此場次嗎？\n關閉後將無法再報名，並且會從大廳隱藏。')) return;
    
    try {
      appDiv.className = 'loading';
      const res = await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gid: currentGroupId,
          gameId: currentGameDetailId,
          uid: currentUser.userId,
          name: currentUser.displayName,
          action: 'closeGame'
        })
      });
      const result = await res.json();
      if (!res.ok) alert(result.error || '操作失敗');
      else alert('場次已關閉！');
      
      currentGameDetailId = null;
      await loadGamesLobby();
    } catch (e) {
      alert('網路錯誤');
      appDiv.className = '';
    }
  });
}

// HTML 逃脫函數防 XSS
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// 啟動
initializeLiff();

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

// 處理新的輸入框報名與防呆
async function handleActionWithInput(event, gameId, action) {
    if (action === 'register') showFloatingEmoji(event, '👍');
    else if (action === 'cancel') showFloatingEmoji(event, '😭');

  const inputEl = document.getElementById(`name-input-${gameId}`);
  const levelEl = document.getElementById(`level-input-${gameId}`);
  const errorEl = document.getElementById(`error-msg-${gameId}`);
  
  let name = currentUser.displayName;
  if (inputEl && inputEl.value.trim()) {
    name = inputEl.value.trim();
    if (action === 'register') {
      localStorage.setItem('preferredName', name);
    }
  } else if (action === 'register') {
    localStorage.removeItem('preferredName');
  }
  
  let level = '';
  if (levelEl && levelEl.value.trim()) {
    level = levelEl.value.trim();
  }
  
  errorEl.style.display = 'none';
  errorEl.innerText = '';
  
  const game = gamesList.find(g => g.gameId === gameId);
  if (!game) return;
  
  const section = game.sections[0] || { list: [] };
  const exists = section.list.includes(name);
  
  if (action === 'register' && exists) {
    errorEl.innerText = '名稱已重複';
    errorEl.style.display = 'block';
    return;
  }
  
  if (action === 'cancel' && !exists) {
    errorEl.innerText = '找不到此名稱';
    errorEl.style.display = 'block';
    return;
  }
  
  try {
    appDiv.className = 'loading';
    statusMsg.style.display = 'block';
    statusMsg.innerText = action === 'register' ? '報名中...' : '取消中...';
    
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gid: currentGroupId,
        gameId: gameId,
        uid: currentUser.userId,
        name: name,
        level: level,
        action: action
      })
    });
    
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || '操作失敗');
    }
    
    // 如果是代報，自動清空輸入框，方便報下一個
    if (inputEl && inputEl.value.trim()) {
      inputEl.value = '';
    }
    if (levelEl) {
      levelEl.value = '';
    }
    
    await loadGamesLobby();
  } catch (err) {
    console.error(err);
    appDiv.className = '';
    statusMsg.style.display = 'none';
    errorEl.innerText = err.message;
    errorEl.style.display = 'block';
  }
}


async function handleTogglePaid(gameId, name) {
  try {
    appDiv.className = 'loading';
    statusMsg.style.display = 'block';
    statusMsg.innerText = '更新中...';
    
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gid: currentGroupId,
        gameId: gameId,
        uid: currentUser.userId,
        name: name,
        action: 'togglePaid'
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
}

window.handleTogglePaid = handleTogglePaid;

window.handleReorder = async function(gameId, fromIdx, toIdx) {
  try {
    appDiv.className = 'loading';
    statusMsg.style.display = 'block';
    statusMsg.innerText = '更新順序中...';
    
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gid: currentGroupId,
        gameId: gameId,
        uid: currentUser.userId,
        name: currentUser.displayName,
        action: 'reorder',
        fromIdx: fromIdx,
        toIdx: toIdx
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
  } finally {
    appDiv.className = '';
    const statusMsgEl = document.getElementById('status-msg');
    if (statusMsgEl) statusMsgEl.style.display = 'none';
  }
};

window.handleCustomPush = async function() {
  const text = prompt('請輸入要推播的訊息內容：\n(系統會自動在文字下方附上大廳連結)');
  if (!text) return;
  
  const pushToAll = confirm('請問是否要「同時推播」到您所管理的所有群組？\n(若選取消，則只推播到當前群組)');
  
  try {
    appDiv.className = 'loading';
    if (statusMsg) {
      statusMsg.style.display = 'block';
      statusMsg.innerText = '推播發送中...';
    }
    
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gid: currentGroupId,
        gameId: 'dummy',
        uid: currentUser.userId,
        name: currentUser.displayName,
        action: 'customPush',
        text: text,
        pushToAll: pushToAll
      })
    });
    
    const result = await res.json();
    if (!res.ok) {
      alert(result.error || '發送失敗');
    } else {
      alert(`推播成功！已發送至 ${result.count} 個群組。`);
    }
  } catch(e) {
    alert('網路錯誤');
  } finally {
    appDiv.className = '';
    const statusMsg = document.getElementById('status-msg');
    if (statusMsg) statusMsg.style.display = 'none';
  }
};

window.handlePushList = async function(gameId) {
  if (!confirm('確定要在群組內推播「目前詳細名單」嗎？\n(這將會把所有人的名字送到聊天室中)')) return;
  
  try {
    appDiv.className = 'loading';
    const statusMsg = document.getElementById('status-msg');
    if (statusMsg) {
      statusMsg.style.display = 'block';
      statusMsg.innerText = '推播名單中...';
    }
    
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gid: currentGroupId,
        gameId: gameId,
        uid: currentUser.userId,
        name: currentUser.displayName,
        action: 'pushList'
      })
    });
    
    const result = await res.json();
    if (!res.ok) {
      alert(result.error || '發送失敗');
    } else {
      alert('名單推播成功！');
    }
  } catch(e) {
    alert('網路錯誤');
  } finally {
    appDiv.className = '';
    const statusMsg = document.getElementById('status-msg');
    if (statusMsg) statusMsg.style.display = 'none';
  }
};

// ================= Target Groups UI Helpers =================
function createTargetGroupCheckbox(container, gid, code, groupName, isChecked) {
  if (container.querySelector(`input[value="${gid}"]`)) return;
  
  const lbl = document.createElement('label');
  lbl.style.display = 'flex';
  lbl.style.alignItems = 'center';
  lbl.style.gap = '8px';
  lbl.style.cursor = 'pointer';
  
  const chk = document.createElement('input');
  chk.type = 'checkbox';
  chk.name = 'targetGids';
  chk.value = gid;
  chk.checked = isChecked;
  
  const span = document.createElement('span');
  span.innerText = code === '目前群組' ? `${groupName} (目前群組)` : `${groupName} (${code})`;
  span.style.flex = '1';
  
  lbl.appendChild(chk);
  lbl.appendChild(span);
  
  const delBtn = document.createElement('span');
  delBtn.innerText = '❌';
  delBtn.style.cursor = 'pointer';
  delBtn.style.padding = '0 5px';
  delBtn.onclick = (e) => {
    e.preventDefault();
    lbl.remove();
    let saved = JSON.parse(localStorage.getItem('savedTargetGroups') || '[]');
    saved = saved.filter(g => g.gid !== gid);
    localStorage.setItem('savedTargetGroups', JSON.stringify(saved));
  };
  lbl.appendChild(delBtn);
  
  container.appendChild(lbl);
}

async function handleAddGroupCode(inputId, containerId) {
  const inputEl = document.getElementById(inputId);
  const code = inputEl.value.trim();
  if (!code) return alert('請輸入群組代號');
  
  appDiv.className = 'loading';
  try {
    const res = await fetch(`/api/group/code/${code}?_t=${Date.now()}`);
    const data = await res.json();
    appDiv.className = '';
    if (res.ok && data.success) {
      const container = document.getElementById(containerId);
      if (container.innerHTML.includes('<p>')) container.innerHTML = '';
      createTargetGroupCheckbox(container, data.gid, code, data.groupName, true);
      inputEl.value = '';
      
      let saved = JSON.parse(localStorage.getItem('savedTargetGroups') || '[]');
      if (!saved.some(g => g.gid === data.gid)) {
        saved.push({ gid: data.gid, code: code, groupName: data.groupName });
        localStorage.setItem('savedTargetGroups', JSON.stringify(saved));
      }
    } else {
      setTimeout(() => alert(data.error || '找不到該群組'), 10);
    }
  } catch(e) {
    appDiv.className = '';
    setTimeout(() => alert('網路錯誤'), 10);
  }
}

document.getElementById('btn-cg-add-group').onclick = () => handleAddGroupCode('cg-new-group-code', 'cg-target-gids-container');
if (document.getElementById('btn-eg-add-group')) {
  document.getElementById('btn-eg-add-group').onclick = () => handleAddGroupCode('eg-new-group-code', 'eg-target-gids-container');
}

// ================= Create Game UI & Templates =================
const createGameView = document.getElementById('create-game-view');
const cgTemplateSelect = document.getElementById('cg-template-select');
const cgInitialList = document.getElementById('cg-initial-list');

function loadTemplates() {
  const templates = JSON.parse(localStorage.getItem('cgRosterTemplates') || '{}');
  cgTemplateSelect.innerHTML = '<option value="">-- 選擇群組範本 --</option>';
  for (const name in templates) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.innerText = name;
    cgTemplateSelect.appendChild(opt);
  }
}

document.getElementById('btn-save-template').onclick = () => {
  const text = cgInitialList.value.trim();
  if (!text) return alert('名單不可為空！');
  const name = prompt('請輸入此範本的名稱 (例如：週二固定咖)：');
  if (!name) return;
  const templates = JSON.parse(localStorage.getItem('cgRosterTemplates') || '{}');
  templates[name] = text;
  localStorage.setItem('cgRosterTemplates', JSON.stringify(templates));
  loadTemplates();
  cgTemplateSelect.value = name;
  alert('儲存成功！');
};

document.getElementById('btn-delete-template').onclick = () => {
  const name = cgTemplateSelect.value;
  if (!name) return alert('請先選擇一個範本！');
  if (!confirm(`確定要刪除範本「${name}」嗎？`)) return;
  const templates = JSON.parse(localStorage.getItem('cgRosterTemplates') || '{}');
  delete templates[name];
  localStorage.setItem('cgRosterTemplates', JSON.stringify(templates));
  loadTemplates();
  cgInitialList.value = '';
  alert('刪除成功！');
};

cgTemplateSelect.onchange = () => {
  const name = cgTemplateSelect.value;
  if (!name) {
    cgInitialList.value = '';
    return;
  }
  const templates = JSON.parse(localStorage.getItem('cgRosterTemplates') || '{}');
  if (templates[name]) {
    cgInitialList.value = templates[name];
  }
};

function formatLocalGameDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const days = ['日', '一', '二', '三', '四', '五', '六'];
  return `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`;
}

function showCreateGameForm() {
  lobbyView.classList.add('hidden');
  detailView.classList.add('hidden');
  createGameView.classList.remove('hidden');
  
  // 初始化為明天的日期
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tzOffset = tomorrow.getTimezoneOffset() * 60000;
  const localTomorrow = new Date(tomorrow - tzOffset).toISOString().split('T')[0];
  document.getElementById('cg-date').value = localTomorrow;
  document.getElementById('cg-time-start').value = '18:00';
  document.getElementById('cg-time-end').value = '20:00';
  
  // 填入目標群組選單
  const cgTargetGidsContainer = document.getElementById('cg-target-gids-container');
  cgTargetGidsContainer.innerHTML = '';
  if (globalManagedGroups.length > 0) {
    globalManagedGroups.forEach(g => {
      createTargetGroupCheckbox(cgTargetGidsContainer, g.gid, g.code, g.groupName, g.gid === currentGroupId);
    });
  } else {
    cgTargetGidsContainer.innerHTML = '<p>無法取得您的管理群組</p>';
  }
  
  const savedCg = JSON.parse(localStorage.getItem('savedTargetGroups') || '[]');
  if (savedCg.length > 0 && cgTargetGidsContainer.innerHTML.includes('<p>')) {
    cgTargetGidsContainer.innerHTML = '';
  }
  savedCg.forEach(g => {
    if (!globalManagedGroups.some(mg => mg.gid === g.gid)) {
       createTargetGroupCheckbox(cgTargetGidsContainer, g.gid, g.code, g.groupName, false);
    }
  });
  
  loadTemplates();
  cgInitialList.value = '';
  cgTemplateSelect.value = '';
}

document.getElementById('btn-cancel-create').onclick = () => {
  createGameView.classList.add('hidden');
  lobbyView.classList.remove('hidden');
};

document.getElementById('btn-submit-create').onclick = async () => {
  const rawDateStr = document.getElementById('cg-date').value;
  const dateStr = rawDateStr ? formatLocalGameDate(rawDateStr) : '';
  
  const tsStart = document.getElementById('cg-time-start').value;
  const tsEnd = document.getElementById('cg-time-end').value;
  const timeStr = (tsStart && tsEnd) ? `${tsStart}~${tsEnd}` : (tsStart || tsEnd || '');
  
  const locStr = document.getElementById('cg-loc').value.trim();
  const targetGids = Array.from(document.querySelectorAll('input[name="targetGids"]:checked')).map(el => el.value);
  
  if (!rawDateStr || !timeStr || !locStr || targetGids.length === 0) {
    alert('「目標群組」、「日期」、「時間」、「地點」為必填欄位！');
    return;
  }
  
  try {
    appDiv.className = 'loading';
    statusMsg.style.display = 'block';
    statusMsg.innerText = '場次建立中...';
    
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gid: currentGroupId,
        targetGids: targetGids,
        gameId: 'dummy',
        uid: currentUser.userId,
        name: currentUser.displayName,
        action: 'createGame',
        title: document.getElementById('cg-title').value.trim(),
        date: dateStr,
        time: timeStr,
        loc: locStr,
        fee: document.getElementById('cg-fee').value.trim(),
        tag: document.getElementById('cg-tag').value.trim(),
        limit: document.getElementById('cg-limit').value,
        backupLimit: document.getElementById('cg-backup').value,
        publish: document.getElementById('cg-publish').value,
        reminder: document.getElementById('cg-reminder').value,
        note: document.getElementById('cg-note').value.trim(),
        initialListStr: cgInitialList.value.trim()
      })
    });
    
    const result = await res.json();
    if (!res.ok) {
      alert(result.error || '建立失敗');
    } else {
      alert('開團成功！');
      createGameView.classList.add('hidden');
      await loadGamesLobby();
    }
  } catch(e) {
    alert('網路錯誤');
  } finally {
    appDiv.className = '';
    statusMsg.style.display = 'none';
  }
};

// ================= Edit Game UI =================
const editGameView = document.getElementById('edit-game-view');

function showEditGameForm(gameId) {
  const game = gamesList.find(g => g.gameId === gameId);
  if (!game) return;
  
  detailView.classList.add('hidden');
  editGameView.classList.remove('hidden');
  
  document.getElementById('eg-gameId').value = gameId;
  document.getElementById('eg-title').value = game.title || '';
  
  const egTargetGidsContainer = document.getElementById('eg-target-gids-container');
  egTargetGidsContainer.innerHTML = '';
  const gameTargetGids = game.targetGids || [game.gid];
  
  if (globalManagedGroups.length > 0) {
    globalManagedGroups.forEach(g => {
      createTargetGroupCheckbox(egTargetGidsContainer, g.gid, g.code, g.groupName, gameTargetGids.includes(g.gid));
    });
  } else {
    egTargetGidsContainer.innerHTML = '<p>無法取得您的管理群組</p>';
  }
  
  const savedEg = JSON.parse(localStorage.getItem('savedTargetGroups') || '[]');
  if (savedEg.length > 0 && egTargetGidsContainer.innerHTML.includes('<p>')) {
    egTargetGidsContainer.innerHTML = '';
  }
  savedEg.forEach(g => {
    if (!globalManagedGroups.some(mg => mg.gid === g.gid)) {
       createTargetGroupCheckbox(egTargetGidsContainer, g.gid, g.code, g.groupName, gameTargetGids.includes(g.gid));
    }
  });
  
  // 處理目前沒有在管理群組與儲存名單中，但已存在於 game.targetGids 的群組
  gameTargetGids.forEach(tgid => {
    if (!globalManagedGroups.some(g => g.gid === tgid) && !savedEg.some(g => g.gid === tgid)) {
       createTargetGroupCheckbox(egTargetGidsContainer, tgid, '未知', '已選擇群組', true);
    }
  });
  
  let egDateVal = '';
  if (game.date) {
    const match = game.date.match(/(\d{1,2})\/(\d{1,2})/);
    if (match) {
      const year = new Date().getFullYear();
      const month = match[1].padStart(2, '0');
      const day = match[2].padStart(2, '0');
      egDateVal = `${year}-${month}-${day}`;
    } else {
      egDateVal = game.date;
    }
  }
  document.getElementById('eg-date').value = egDateVal;
  
  let tStart = '', tEnd = '';
  if (game.time) {
    const parts = game.time.split('~');
    tStart = parts[0] ? parts[0].trim() : '';
    tEnd = parts[1] ? parts[1].trim() : '';
  }
  document.getElementById('eg-time-start').value = tStart;
  document.getElementById('eg-time-end').value = tEnd;
  
  document.getElementById('eg-loc').value = game.location || '';
  document.getElementById('eg-fee').value = game.fee || '';
  document.getElementById('eg-tag').value = game.tag || '';
  
  const section = game.sections[0] || {};
  document.getElementById('eg-limit').value = section.limit || 20;
  document.getElementById('eg-backup').value = section.backupLimit || 0;
  document.getElementById('eg-note').value = game.note || '';
  
  // Format timestamps to datetime-local
  const fmt = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const tzOffset = d.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(d - tzOffset)).toISOString().slice(0, 16);
    return localISOTime;
  };
  document.getElementById('eg-publish').value = fmt(game.scheduleTime);
  document.getElementById('eg-reminder').value = fmt(game.reminderTime);
}

document.getElementById('btn-cancel-edit').onclick = () => {
  editGameView.classList.add('hidden');
  detailView.classList.remove('hidden');
};

document.getElementById('btn-submit-edit').onclick = async () => {
  const gameId = document.getElementById('eg-gameId').value;
  const rawDateStr = document.getElementById('eg-date').value;
  const dateStr = rawDateStr ? formatLocalGameDate(rawDateStr) : '';
  
  const tsStart = document.getElementById('eg-time-start').value;
  const tsEnd = document.getElementById('eg-time-end').value;
  const timeStr = (tsStart && tsEnd) ? `${tsStart}~${tsEnd}` : (tsStart || tsEnd || '');
  
  const locStr = document.getElementById('eg-loc').value.trim();
  const targetGids = Array.from(document.querySelectorAll('#eg-target-gids-container input[name="targetGids"]:checked')).map(el => el.value);
  
  if (!rawDateStr || !timeStr || !locStr || targetGids.length === 0) {
    alert('「目標群組」、「日期」、「時間」、「地點」為必填欄位！');
    return;
  }
  
  try {
    appDiv.className = 'loading';
    statusMsg.style.display = 'block';
    statusMsg.innerText = '儲存變更中...';
    
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gid: currentGroupId,
        gameId: gameId,
        uid: currentUser.userId,
        name: currentUser.displayName,
        action: 'editGame',
        targetGids: targetGids,
        title: document.getElementById('eg-title').value.trim(),
        date: dateStr,
        time: timeStr,
        loc: locStr,
        fee: document.getElementById('eg-fee').value.trim(),
        tag: document.getElementById('eg-tag').value.trim(),
        limit: document.getElementById('eg-limit').value,
        backupLimit: document.getElementById('eg-backup').value,
        publish: document.getElementById('eg-publish').value,
        reminder: document.getElementById('eg-reminder').value,
        note: document.getElementById('eg-note').value.trim()
      })
    });
    
    const result = await res.json();
    if (!res.ok) {
      alert(result.error || '儲存失敗');
    } else {
      alert('儲存成功！');
      editGameView.classList.add('hidden');
      await loadGamesLobby();
      if (currentGameDetailId === gameId) {
         renderDetail(gameId);
      }
    }
  } catch(e) {
    alert('網路錯誤');
  } finally {
    appDiv.className = '';
    statusMsg.style.display = 'none';
  }
};


