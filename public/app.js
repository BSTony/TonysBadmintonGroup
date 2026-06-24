let currentGroupId = null;
let currentUser = null;
let gamesList = [];
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
    const configRes = await fetch('/api/config');
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
    statusMsg.innerText = '載入場次中...';
    
    const res = await fetch(`/api/game/${currentGroupId}`);
    if (!res.ok) {
      if (res.status === 404) {
        gamesList = [];
      } else {
        throw new Error('無法取得場次資料');
      }
    } else {
      const data = await res.json();
      gamesList = data.games || [];
    }

    renderLobby();
  } catch (err) {
    console.error(err);
    statusMsg.innerText = err.message;
  }
}

// 渲染大廳畫面
function renderLobby() {
  appDiv.className = '';
  lobbyView.classList.remove('hidden');
  detailView.classList.add('hidden');
  
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
    const isFull = count >= limit;
    
    const isMeRegistered = section.list.includes(currentUser.displayName);

    const hasTags = game.date || game.time || game.location || game.fee;
    let tagsHtml = '';
    if (hasTags) {
       tagsHtml = '<div class="info-tags" style="cursor: pointer; margin: 0; flex: 1;" onclick="showDetail(\'' + game.gameId + '\')">';
       if (game.date) tagsHtml += `<span class="info-tag">📅 ${escapeHTML(game.date)}</span>`;
       if (game.time) tagsHtml += `<span class="info-tag">⏰ ${escapeHTML(game.time)}</span>`;
       if (game.location) tagsHtml += `<span class="info-tag">📍 ${escapeHTML(game.location)}</span>`;
       if (game.fee) tagsHtml += `<span class="info-tag">💰 ${escapeHTML(game.fee)}</span>`;
       tagsHtml += '</div>';
    }
    
    // 判斷 title 是否只是自動生成的字串 (忽略空白)
    const normalize = s => (s||'').replace(/\s+/g, '');
    const autoStr = normalize([game.date, game.time, game.location].filter(Boolean).join(''));
    const isAutoTitle = normalize(game.title) === autoStr || game.title === '羽球接龍';
    const showTitle = game.title && !isAutoTitle;

    const card = document.createElement('div');
    card.className = 'game-card';
    card.innerHTML = `
      <div class="card-header" style="cursor: pointer; align-items: flex-start;" onclick="showDetail('${game.gameId}')">
        ${showTitle ? `<div class="card-title" style="margin-bottom: ${hasTags?'8px':'0'}">${escapeHTML(game.title)}</div>` : ''}
        ${!showTitle && hasTags ? tagsHtml : ''}
        ${!showTitle && !hasTags ? `<div class="card-title">羽球接龍</div>` : ''}
        <div class="card-badge ${isFull ? 'full' : ''}" style="margin-left: 12px; flex-shrink: 0;">${count} / ${limit}</div>
      </div>
      ${showTitle && hasTags ? `<div style="margin-top: -4px; margin-bottom: 12px;">${tagsHtml}</div>` : ''}
      ${game.note ? `<div class="game-note" style="cursor: pointer" onclick="showDetail('${game.gameId}')">${escapeHTML(game.note)}</div>` : ''}
      <div class="card-actions">
        ${isMeRegistered 
          ? `<button class="btn-danger" onclick="handleAction('${game.gameId}', 'cancel')">-1</button>`
          : `<button class="btn-primary" onclick="handleAction('${game.gameId}', 'register')">+1</button>`
        }
      </div>
      <div class="proxy-register">
        <input type="text" id="proxy-name-${game.gameId}" placeholder="輸入名稱 (代報名)">
        <button class="btn-secondary" onclick="handleProxyRegister('${game.gameId}')">報名</button>
      </div>
    `;
    gamesContainer.appendChild(card);
  });
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
  
  const section = game.sections[0] || { list: [], limit: 20 };
  detailCount.innerText = `${section.list.length} / ${section.limit}`;
  
  detailList.innerHTML = '';
  
  const hasTags = game.date || game.time || game.location || game.fee;
  if (hasTags) {
     let tagsHtml = '<div class="info-tags" style="margin-top: 0;">';
     if (game.date) tagsHtml += `<span class="info-tag">📅 ${escapeHTML(game.date)}</span>`;
     if (game.time) tagsHtml += `<span class="info-tag">⏰ ${escapeHTML(game.time)}</span>`;
     if (game.location) tagsHtml += `<span class="info-tag">📍 ${escapeHTML(game.location)}</span>`;
     if (game.fee) tagsHtml += `<span class="info-tag">💰 ${escapeHTML(game.fee)}</span>`;
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
        const isMe = name === currentUser.displayName;
        const displayName = (name === '__ANON__') ? '***' : name;
        
        // 加入取消按鈕，讓大家可以幫代報名的人取消
        const canCancel = name !== '__ANON__';
        secDiv.innerHTML += `
          <div class="list-item">
            <div class="list-num">${i + 1}.</div>
            <div class="list-name ${isMe ? 'me' : ''}">${escapeHTML(displayName)}</div>
            ${canCancel ? `<button class="btn-icon" style="color:var(--danger-color); padding: 4px; margin: 0; font-size: 16px;" onclick="handleCancelByName('${game.gameId}', '${escapeHTML(name)}')">✖</button>` : ''}
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
        const isMe = name === currentUser.displayName;
        const displayName = (name === '__ANON__') ? '***' : name;
        
        const canCancel = name !== '__ANON__';
        secDiv.innerHTML += `
          <div class="list-item">
            <div class="list-num">候${i - sec.limit + 1}.</div>
            <div class="list-name ${isMe ? 'me' : ''}">${escapeHTML(displayName)}</div>
            ${canCancel ? `<button class="btn-icon" style="color:var(--danger-color); padding: 4px; margin: 0; font-size: 16px;" onclick="handleCancelByName('${game.gameId}', '${escapeHTML(name)}')">✖</button>` : ''}
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
