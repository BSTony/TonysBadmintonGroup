const imageCache = {};

function getTransparentImage(src, callback) {
  if (imageCache[src]) {
    callback(imageCache[src]);
    return;
  }
  const img = new Image();
  img.crossOrigin = 'Anonymous';
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 230 && data[i+1] > 230 && data[i+2] > 230) {
        data[i+3] = 0;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    imageCache[src] = canvas.toDataURL('image/png');
    callback(imageCache[src]);
  };
  img.src = src;
}

function showFloatingEmoji(e, emoji) {
  if (!e) return;
  
  // Inject keyframes for wiggling animation if not already present
  if (!document.getElementById('floating-anim-style')) {
    const style = document.createElement('style');
    style.id = 'floating-anim-style';
    style.innerHTML = `
      @keyframes danceWiggle {
        0% { transform: rotate(-15deg) translateY(0); }
        25% { transform: rotate(15deg) translateY(-10px); }
        50% { transform: rotate(-15deg) translateY(0); }
        75% { transform: rotate(15deg) translateY(-10px); }
        100% { transform: rotate(-15deg) translateY(0); }
      }
      @keyframes cryShake {
        0% { transform: translateX(0); }
        25% { transform: translateX(-3px) translateY(2px); }
        50% { transform: translateX(3px) translateY(-2px); }
        75% { transform: translateX(-3px) translateY(2px); }
        100% { transform: translateX(0); }
      }
      @keyframes popNote {
        0% { transform: translate(0, 0) scale(0); opacity: 0; }
        20% { transform: translate(var(--dx), var(--dy)) scale(1.5); opacity: 1; }
        80% { transform: translate(calc(var(--dx) * 1.5), calc(var(--dy) * 2)) scale(1); opacity: 1; }
        100% { transform: translate(calc(var(--dx) * 2), calc(var(--dy) * 3)) scale(0); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
  
  const isImage = emoji.endsWith('.png') || emoji.endsWith('.jpg') || emoji.endsWith('.gif');
  
  const createWrapper = (elContent) => {
    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.left = (e.clientX - (isImage ? 35 : 20)) + 'px';
    wrapper.style.top = (e.clientY - (isImage ? 35 : 25)) + 'px';
    wrapper.style.pointerEvents = 'none';
    wrapper.style.zIndex = '9999';
    if (!isImage) {
      wrapper.style.filter = 'drop-shadow(0px 4px 6px rgba(0,0,0,0.3))';
    }
    wrapper.style.transform = 'translateY(0) scale(0.3)';
    wrapper.style.opacity = '1';
    // Increased duration to 2s
    wrapper.style.transition = 'transform 2s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 2s ease-in-out';
    
    wrapper.appendChild(elContent);
    document.body.appendChild(wrapper);
    
    void wrapper.offsetHeight;
    
    const randomX = (Math.random() * 60 - 30);
    wrapper.style.transform = `translate(${randomX}px, -200px) scale(1.5)`;
    wrapper.style.opacity = '0';
    
    setTimeout(() => wrapper.remove(), 2000);
    return wrapper;
  };

  if (isImage) {
    getTransparentImage(emoji, (transparentSrc) => {
      const el = document.createElement('img');
      el.src = transparentSrc;
      el.style.width = '70px';
      el.style.height = 'auto';
      // Removed mixBlendMode because background is now truly transparent
      
      const isDance = emoji.includes('dance.png');
      const isCry = emoji.includes('cry.png');
      
      if (isDance) {
        el.style.animation = 'danceWiggle 0.6s ease-in-out infinite';
      } else if (isCry) {
        el.style.animation = 'cryShake 0.3s ease-in-out infinite';
      }
      
      const wrapper = createWrapper(el);
      
      // Spawn independent music notes or tears
      const symbols = isDance ? ['�𦄡', '�𦅚', '��'] : ['�佂', '�𣺊', '�佂'];
      for (let i = 0; i < 3; i++) {
        const sym = document.createElement('div');
        sym.innerText = symbols[i];
        sym.style.position = 'absolute';
        sym.style.fontSize = '24px';
        sym.style.left = '20px';
        sym.style.top = '20px';
        sym.style.opacity = '0';
        
        // Random trajectory
        const dx = (Math.random() - 0.5) * 80 + 'px';
        const dy = (Math.random() * -60 - 20) + 'px';
        sym.style.setProperty('--dx', dx);
        sym.style.setProperty('--dy', dy);
        
        sym.style.animation = `popNote 1.5s ease-out ${Math.random() * 0.3}s forwards`;
        wrapper.appendChild(sym);
      }
    });
  } else {
    const el = document.createElement('div');
    el.innerText = emoji;
    el.style.fontSize = '40px';
    createWrapper(el);
  }
}

// === �典����� ===
let currentUser = null;
let currentGroupId = null;
let currentDetailGame = null;
let gamesList = [];
let globalIsAdmin = false;
let globalIsSuperAdmin = false;
let easterEggEnabled = false;
let easterEggActiveGame = 'piggy_run';
let piggyClicks = 0;
let piggyRunning = false;
let piggyBaseSpeed = 3;
let globalManagedGroups = [];
let globalLobbyTitle = '蝢賜��仿�憭批輒';
let currentGameDetailId = null;
let lastGamesJson = '';

// DOM ���
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

const statsView = document.getElementById('stats-view');
const btnLobbyStats = document.getElementById('btn-lobby-stats');
const btnSystemLogs = document.getElementById('btn-system-logs');
const systemLogsView = document.getElementById('system-logs-view');
const btnPartyAdmin = document.getElementById('btn-party-admin');
const partyAdminView = document.getElementById('party-admin-view');
const btnBackParty = document.getElementById('btn-back-party');
const btnBackLogs = document.getElementById('btn-back-logs');
const systemLogsContainer = document.getElementById('system-logs-container');
const btnBackStats = document.getElementById('btn-back-stats');
const statsGroupsContainer = document.getElementById('stats-groups-container');

// Easter Egg DOM
const btnEasterEgg = document.getElementById('btn-easter-egg');
const easterEggSettingsView = document.getElementById('easter-egg-settings-view');
const btnBackEasterEgg = document.getElementById('btn-back-easter-egg');
const btnSaveEasterEgg = document.getElementById('btn-save-easter-egg');
const btnClearWinners = document.getElementById('btn-clear-winners');
const eeEnabledCheckbox = document.getElementById('ee-enabled');
const eeMessageInput = document.getElementById('ee-message');
const eeQuotaInput = document.getElementById('ee-quota');
const eeWinnersCount = document.getElementById('ee-winners-count');
const eeWinnersList = document.getElementById('ee-winners-list');
const piggyIcon = document.querySelector('.header-icon');
const confettiContainer = document.getElementById('confetti-container');
const easterEggModal = document.getElementById('easter-egg-modal');
const easterEggMsg = document.getElementById('easter-egg-msg');
const eeActiveGameSelect = document.getElementById('ee-active-game');
const bhContainer = document.getElementById('bh-container');
const bhTimer = document.getElementById('bh-timer');
const bhEntities = document.getElementById('bh-entities');
const bhGameoverModal = document.getElementById('bh-gameover-modal');
const bhFinalTime = document.getElementById('bh-final-time');
const bhLeaderboardList = document.getElementById('bh-leaderboard-list');
const btnBhRestart = document.getElementById('btn-bh-restart');
const btnBhClose = document.getElementById('btn-bh-close');

// --- Unified Room Admin DOM ---
const roomGameType = document.getElementById('room-game-type');
const btnOpenRoom = document.getElementById('btn-open-room');
// unifiedRoomOverlay, btnCloseRoom, btnJoinRoom, lotteryCanvasContainer, roomPoolDisplayList
// are already declared in lottery.js (loaded first)
const btnToggleAdminPanel = document.getElementById('btn-toggle-admin-panel');
const roomAdminPanel = document.getElementById('room-admin-panel');
const roomAdminHeader = document.getElementById('room-admin-header');
const btnMinimizeAdminPanel = document.getElementById('btn-minimize-admin-panel');
const adminLotteryControls = document.getElementById('admin-lottery-controls');
const adminSurvivalControls = document.getElementById('admin-survival-controls');

const partyWinType = document.getElementById('party-win-type');
const partyWinValue = document.getElementById('party-win-value');
const partyAdminStatus = document.getElementById('party-admin-status');
const partyJoinContainer = document.getElementById('party-join-container');
const btnJoinParty = document.getElementById('btn-join-party');

// --- Lottery Admin DOM ---
const btnImportLobbyUsers = document.getElementById('btn-import-lobby-users');
const lotteryManualName = document.getElementById('lottery-manual-name');
const btnAddManualName = document.getElementById('btn-add-manual-name');
const lotteryPoolCount = document.getElementById('lottery-pool-count');
const lotteryPoolList = document.getElementById('lottery-pool-list');
const btnResetLottery = document.getElementById('btn-reset-lottery');
const lotteryDrawCount = document.getElementById('lottery-draw-count');
const lotteryAssigneeSelect = document.getElementById('lottery-assignee-select');
const btnAssignDraw = document.getElementById('btn-assign-draw');

let lotteryAdminPool = [];

let currentPartyStatus = 'idle';
let partyLobbyNames = [];

function updateAdminLobbyStatus() {
  if (!partyAdminStatus) return;
  const namesStr = partyLobbyNames.length > 0 ? partyLobbyNames.join(', ') : '��';
  partyAdminStatus.innerHTML = `����: ${currentPartyStatus} (鈭箸彍: ${partyLobbyNames.length})<br><span style="font-size: 13px; color: #555; font-weight: normal;">撌脣���: ${namesStr}</span>`;
}

let socket = null;
let partyOthers = {};
let currentGlobalRoomState = null;
let hasEnteredParty = false;
const partyActiveBanner = document.getElementById('party-active-banner');
const btnEnterParty = document.getElementById('btn-enter-party');

if (btnEnterParty) {
  btnEnterParty.addEventListener('click', () => {
    hasEnteredParty = true;
    updateUnifiedRoomUI();
  });
}

function updateUnifiedRoomUI() {
  if (!currentGlobalRoomState) return;
  if (currentGlobalRoomState.status === 'open') {
    if (partyActiveBanner) partyActiveBanner.classList.remove('hidden');
    
    if (hasEnteredParty) {
      if (partyActiveBanner) partyActiveBanner.classList.add('hidden');
      unifiedRoomOverlay.classList.remove('hidden');
      if (globalIsSuperAdmin) {
        btnToggleAdminPanel.classList.remove('hidden');
        roomAdminPanel.classList.remove('hidden');
      } else {
        btnToggleAdminPanel.classList.add('hidden');
        roomAdminPanel.classList.add('hidden');
      }
      
      if (currentGlobalRoomState.activeGame === 'lottery') {
        lotteryCanvasContainer.classList.remove('hidden');
        bhContainer.classList.add('hidden');
        adminLotteryControls.classList.remove('hidden');
        adminSurvivalControls.classList.add('hidden');
      } else if (currentGlobalRoomState.activeGame === 'survival') {
        lotteryCanvasContainer.classList.add('hidden');
        bhContainer.classList.remove('hidden');
        adminLotteryControls.classList.add('hidden');
        adminSurvivalControls.classList.remove('hidden');
      }
    } else {
      unifiedRoomOverlay.classList.add('hidden');
    }
  } else {
    hasEnteredParty = false;
    if (partyActiveBanner) partyActiveBanner.classList.add('hidden');
    unifiedRoomOverlay.classList.add('hidden');
    bhContainer.classList.add('hidden');
    lotteryCanvasContainer.classList.add('hidden');
    if (bhGameoverModal) bhGameoverModal.classList.add('hidden');
    if (bhEntities) bhEntities.innerHTML = '';
    bhIsPlaying = false;
  }
}

function initSocket() {
  if (socket) return;
  socket = io();
  
  if (typeof bindLotteryAdminSocket === 'function') {
    bindLotteryAdminSocket(socket);
  }
  
  socket.on('global_room_state', (state) => {
    window.globalRoomState = state;
    currentGlobalRoomState = state;
    updateUnifiedRoomUI();
  });
  
  socket.on('party_state', (state) => {
    currentPartyStatus = state.status;
    partyLobbyNames = state.players ? Object.values(state.players).map(p => p.name) : [];
    
    const adminPlayBtn = document.getElementById('btn-bh-admin-play');
    
    if (state.status === 'lobby') {
      if (adminPlayBtn) adminPlayBtn.classList.remove('hidden');
      if (currentGlobalRoomState && currentGlobalRoomState.activeGame === 'survival') {
        btnJoinRoom.classList.remove('hidden');
      }
    } else if (state.status === 'playing') {
      if (adminPlayBtn) adminPlayBtn.classList.add('hidden');
      btnJoinRoom.classList.add('hidden');
    } else {
      if (adminPlayBtn) adminPlayBtn.classList.add('hidden');
      btnJoinRoom.classList.add('hidden');
    }
    
    // Update right-side participants list for survival
    if (currentGlobalRoomState && currentGlobalRoomState.activeGame === 'survival') {
      roomPoolDisplayList.innerHTML = '';
      if (state.players) {
        Object.values(state.players).forEach(p => {
          const li = document.createElement('li');
          li.innerText = p.name;
          if (!p.alive) li.style.textDecoration = 'line-through';
          roomPoolDisplayList.appendChild(li);
        });
      }
    }
    
    // Render existing players if we are in the lobby or playing
    if (state.status === 'lobby' || state.status === 'playing') {
      if (state.players) {
        Object.values(state.players).forEach(p => {
          if (p.id !== socket.id) {
            createOtherPlayer(p);
          }
        });
      }
    }
  });
  
  socket.on('player_joined', (p) => {
    if (!partyLobbyNames.includes(p.name)) {
      partyLobbyNames.push(p.name);
      updateAdminLobbyStatus();
    }
    createOtherPlayer(p);
  });
  
  socket.on('player_left', (p) => {
    partyLobbyNames = partyLobbyNames.filter(n => n !== p.name);
    updateAdminLobbyStatus();
    if (partyOthers[p.id]) {
      partyOthers[p.id].remove();
      delete partyOthers[p.id];
    }
  });
  
  socket.on('player_moved', (data) => {
    if (partyOthers[data.id]) {
      partyOthers[data.id].style.left = (data.x * window.innerWidth) + 'px';
      partyOthers[data.id].style.top = (data.y * window.innerHeight) + 'px';
    }
  });
  
  socket.on('player_died', (data) => {
    if (partyOthers[data.id]) {
      const iconEl = partyOthers[data.id].querySelector('.bh-icon');
      if (iconEl) iconEl.innerText = '☠️';
    }
    if (data.id === socket.id && bhPlayer) {
      const iconEl = bhPlayer.querySelector('.bh-icon');
      if (iconEl) iconEl.innerText = '☠️';
    }
  });
  
  socket.on('party_play', (data) => {
    bhIsPlaying = true;
    bhStartTime = performance.now(); // Ignore data.startTime to align with requestAnimationFrame's timestamp
    if (partyJoinContainer) partyJoinContainer.classList.add('hidden');
    if (btnJoinRoom) btnJoinRoom.classList.add('hidden');
    if (roomAdminPanel) roomAdminPanel.classList.add('hidden');
    
    // 自動縮小名單不要影響畫面
    if (typeof btnToggleParticipants !== 'undefined' && btnToggleParticipants) {
      if (typeof isPanelMinimized !== 'undefined' && !isPanelMinimized) {
        btnToggleParticipants.click();
      }
    }
    
    requestAnimationFrame(bhPartyLoop);
  });
  
  socket.on('spawn_bullet', (b) => {
    if (bhIsPlaying) spawnServerBullet(b);
  });
  
  socket.on('spawn_wall', (w) => {
    if (bhIsPlaying) spawnServerWall(w);
  });
  
  socket.on('spawn_item', (item) => {
    if (bhIsPlaying) spawnServerItem(item);
  });
  
  socket.on('player_damaged', (data) => {
    if (partyOthers[data.id]) {
      // visual feedback?
    }
    if (data.id === socket.id && bhPlayer) {
      updateLives(data.lives);
      bhPlayer.classList.add('bh-invincible'); // reuse rainbow or just blink
      setTimeout(() => bhPlayer.classList.remove('bh-invincible'), 2000);
    }
  });
  
  socket.on('player_healed', (data) => {
    removeItem(data.itemId);
    if (data.id === socket.id) updateLives(data.lives);
  });
  
  socket.on('player_invincible', (data) => {
    removeItem(data.itemId);
    if (partyOthers[data.id]) partyOthers[data.id].classList.add('bh-invincible');
    if (data.id === socket.id && bhPlayer) {
      bhPlayer.classList.add('bh-invincible');
      setTimeout(() => bhPlayer.classList.remove('bh-invincible'), 5000);
    }
  });
  
  socket.on('wall_destroyed', (data) => {
    removeWall(data.wallId);
  });
  
  socket.on('party_ended', (data) => {
    bhIsPlaying = false;
    bhGameoverModal.classList.remove('hidden');
    document.getElementById('bh-gameover-title').innerText = '瘣曉�蝯鞉�嚗�';
    bhFinalTime.innerText = data.elapsed.toFixed(2);
    renderBhLeaderboard(data.leaderboard);
    
    const isWinner = data.winners.some(w => w.uid === currentUser.userId);
    if (isWinner && bhPlayer) bhPlayer.innerHTML = '��';
  });
}

function createOtherPlayer(p) {
  if (partyOthers[p.id] || p.id === (socket ? socket.id : '')) return;
  const el = document.createElement('div');
  el.className = 'bh-player';
  el.style.opacity = '0.5'; // Ghost appearance for others
  el.innerHTML = `
    <div class="bh-icon">${p.alive ? (p.icon || '�䊹') : '��'}</div>
    <div class="bh-player-name">${p.name}</div>
  `;
  el.style.left = (p.x * window.innerWidth) + 'px';
  el.style.top = (p.y * window.innerHeight) + 'px';
  bhEntities.appendChild(el);
  partyOthers[p.id] = el;
}

let selectedCharacterIcon = '�䊹';

function joinPartyLobby() {
  initSocket();
  bhContainer.classList.remove('hidden');
  bhGameoverModal.classList.add('hidden');
  bhEntities.innerHTML = '';
  partyOthers = {};
  bhBullets = [];
  bhWalls = [];
  bhItems = [];
  bhIsPlaying = false; // waiting for party_play
  
  if (globalIsSuperAdmin) {
    const adminControls = document.getElementById('bh-admin-controls');
    if (adminControls) adminControls.classList.remove('hidden');
  }
  
  bhPlayer = document.createElement('div');
  bhPlayer.className = 'bh-player';
  bhPlayer.innerHTML = `
    <div class="bh-icon">${selectedCharacterIcon}</div>
    <div class="bh-player-name">${currentUser.displayName}</div>
  `;
  
  const livesEl = document.createElement('div');
  livesEl.className = 'bh-lives';
  livesEl.id = 'bh-lives-display';
  livesEl.innerText = '�歹��歹��歹�';
  bhPlayer.appendChild(livesEl);
  
  const initialX = window.innerWidth / 2 - 15;
  const initialY = window.innerHeight - 100;
  bhPlayer.style.left = initialX + 'px';
  bhPlayer.style.top = initialY + 'px';
  bhEntities.appendChild(bhPlayer);
  
  const pctX = initialX / window.innerWidth;
  const pctY = initialY / window.innerHeight;
  socket.emit('join_party', { uid: currentUser.userId, name: currentUser.displayName, icon: selectedCharacterIcon, x: pctX, y: pctY });
  
  // Request fresh state after a short delay to ensure we have all players
  setTimeout(() => {
    if (socket) socket.emit('request_party_state');
  }, 500);
  
  // Smooth movement system
  let targetX = initialX;
  let targetY = initialY;
  let currentX = initialX;
  let currentY = initialY;
  const MOVE_SPEED = 6; // pixels per frame
  let isDragging = false;
  let lastSentX = initialX;
  let lastSentY = initialY;
  
  const onPointerDown = (e) => { isDragging = true; setTarget(e); };
  const onPointerMove = (e) => { if (isDragging) setTarget(e); };
  const onPointerUp = (e) => { isDragging = false; };
  
  function setTarget(e) {
    const touch = e.touches ? e.touches[0] : e;
    targetX = Math.max(0, Math.min(window.innerWidth - 30, touch.clientX - 15));
    targetY = Math.max(0, Math.min(window.innerHeight - 30, touch.clientY - 15));
  }
  
  // Store movement update function on bhContainer so bhPartyLoop can call it
  bhContainer._updateMovement = function() {
    const dx = targetX - currentX;
    const dy = targetY - currentY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < 1) return; // Already at target
    
    const step = Math.min(MOVE_SPEED, dist);
    let newX = currentX + (dx / dist) * step;
    let newY = currentY + (dy / dist) * step;
    newX = Math.max(0, Math.min(window.innerWidth - 30, newX));
    newY = Math.max(0, Math.min(window.innerHeight - 30, newY));
    
    // Wall collision
    const isInvincible = bhPlayer.classList.contains('bh-invincible');
    let hitWall = null;
    for (let w of bhWalls) {
      if (newX + 30 > w.left && newX < w.right && newY + 30 > w.top && newY < w.bottom) {
        hitWall = w;
        break;
      }
    }
    
    if (hitWall) {
      if (isInvincible) {
        socket.emit('destroy_wall', { wallId: hitWall.id });
      } else {
        return; // Blocked by wall
      }
    }
    
    currentX = newX;
    currentY = newY;
    bhPlayer.style.left = newX + 'px';
    bhPlayer.style.top = newY + 'px';
    
    // Only emit position if moved enough to reduce network traffic
    if (Math.abs(newX - lastSentX) > 2 || Math.abs(newY - lastSentY) > 2) {
      socket.emit('player_move', { x: newX / window.innerWidth, y: newY / window.innerHeight });
      lastSentX = newX;
      lastSentY = newY;
    }
  };
  
  bhContainer.addEventListener('pointerdown', onPointerDown);
  bhContainer.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  
  // Lobby movement loop (runs before game starts)
  function lobbyMoveLoop() {
    if (bhIsPlaying) return; // bhPartyLoop takes over
    if (bhContainer._updateMovement) bhContainer._updateMovement();
    requestAnimationFrame(lobbyMoveLoop);
  }
  requestAnimationFrame(lobbyMoveLoop);
  
  bhContainer._cleanupEvents = () => {
    bhContainer.removeEventListener('pointerdown', onPointerDown);
    bhContainer.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    bhContainer._updateMovement = null;
  };
}

function spawnServerBullet(b) {
  const el = document.createElement('div');
  el.className = 'bh-bullet';
  el.innerHTML = '�虬';
  
  const startX = b.startX * window.innerWidth;
  const targetX = b.targetX * window.innerWidth;
  const startY = b.startY * window.innerHeight;
  const targetY = b.targetY * window.innerHeight;
  
  const angle = Math.atan2(targetY - startY, targetX - startX);
  const speed = 4; // Constant base speed for sync
  
  const vx = Math.cos(angle) * speed;
  const vy = Math.sin(angle) * speed;
  
  bhEntities.appendChild(el);
  bhBullets.push({ el, x: startX, y: startY, vx, vy, speedMultiplier: b.speedMultiplier });
}

function spawnServerWall(w) {
  const el = document.createElement('div');
  el.className = 'bh-wall';
  const width = w.width * window.innerWidth;
  const height = w.height * window.innerHeight;
  const x = w.x * window.innerWidth;
  const y = w.y * window.innerHeight;
  
  el.style.width = width + 'px';
  el.style.height = height + 'px';
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  
  bhEntities.appendChild(el);
  bhWalls.push({ id: w.id, el, left: x, right: x + width, top: y, bottom: y + height });
}

function spawnServerItem(item) {
  const el = document.createElement('div');
  el.className = item.type === 'heart' ? 'bh-heart' : 'bh-star';
  el.innerHTML = item.type === 'heart' ? '�歹�' : '潃�';
  const x = item.x * window.innerWidth;
  const y = item.y * window.innerHeight;
  
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  
  bhEntities.appendChild(el);
  bhItems.push({ id: item.id, type: item.type, el, x, y });
}

function removeWall(id) {
  const idx = bhWalls.findIndex(w => w.id === id);
  if (idx !== -1) {
    bhWalls[idx].el.remove();
    bhWalls.splice(idx, 1);
  }
}

function removeItem(id) {
  const idx = bhItems.findIndex(i => i.id === id);
  if (idx !== -1) {
    bhItems[idx].el.remove();
    bhItems.splice(idx, 1);
  }
}

function updateLives(lives) {
  const display = document.getElementById('bh-lives-display');
  if (display) {
    display.innerText = '�歹�'.repeat(lives);
  }
}

function bhPartyLoop(timestamp) {
  if (!bhIsPlaying) return;
  
  // Update smooth player movement
  if (bhContainer._updateMovement) bhContainer._updateMovement();
  
  const elapsed = timestamp - bhStartTime; 
  bhTimer.innerText = (elapsed / 1000).toFixed(2);
  
  const pRect = bhPlayer.getBoundingClientRect();
  const playerHitbox = { left: pRect.left + 10, right: pRect.right - 10, top: pRect.top + 10, bottom: pRect.bottom - 10 };

  for (let i = bhBullets.length - 1; i >= 0; i--) {
    let b = bhBullets[i];
    b.y += b.vy * b.speedMultiplier;
    b.x += b.vx * b.speedMultiplier;
    
    b.el.style.transform = `translate(${b.x}px, ${b.y}px)`;
    
    if (b.y > window.innerHeight + 100 || b.y < -100 || b.x < -100 || b.x > window.innerWidth + 100) {
      b.el.remove();
      bhBullets.splice(i, 1);
      continue;
    }
    
    if (bhPlayer.innerHTML !== '��' &&
      b.x + 20 > playerHitbox.left && b.x + 10 < playerHitbox.right &&
      b.y + 20 > playerHitbox.top && b.y + 10 < playerHitbox.bottom
    ) {
      if (!bhPlayer.classList.contains('bh-invincible')) {
        socket.emit('player_hit');
        // Player visual updates are handled by server events now
      }
    }
  }
  
  // Item collisions
  for (let i = bhItems.length - 1; i >= 0; i--) {
    let item = bhItems[i];
    if (bhPlayer.innerHTML !== '��' &&
      item.x + 20 > playerHitbox.left && item.x + 10 < playerHitbox.right &&
      item.y + 20 > playerHitbox.top && item.y + 10 < playerHitbox.bottom
    ) {
      socket.emit('player_collect', { type: item.type, itemId: item.id });
      // Predictively remove from view
      item.el.remove();
      bhItems.splice(i, 1);
    }
  }
  requestAnimationFrame(bhPartyLoop);
}

if (btnJoinParty) {
  btnJoinParty.addEventListener('click', () => {
    const modal = document.getElementById('character-select-modal');
    const grid = document.getElementById('character-grid');
    const btnConfirm = document.getElementById('btn-confirm-character');
    const btnCancel = document.getElementById('btn-cancel-character');
    
    if (modal && grid) {
      grid.innerHTML = '';
      const chars = ['�䊹', '�濶', '�躼', '�鑛', '��', '�𣸮', '�䧟', '�鍳', '��', '�𢙺'];
      chars.forEach(c => {
        const btn = document.createElement('button');
        btn.className = 'char-btn';
        btn.innerText = c;
        btn.onclick = () => {
          document.querySelectorAll('.char-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          selectedCharacterIcon = c;
          btnConfirm.disabled = false;
        };
        grid.appendChild(btn);
      });
      
      btnConfirm.onclick = () => {
        modal.classList.add('hidden');
        joinPartyLobby();
        partyJoinContainer.classList.add('hidden');
      };
      
      btnCancel.onclick = () => {
        modal.classList.add('hidden');
      };
      
      modal.classList.remove('hidden');
    } else {
      // Fallback
      joinPartyLobby();
      partyJoinContainer.classList.add('hidden');
    }
  });
}


// --- Bullet Hell Game Logic ---
let bhStartTime = 0;
let bhPlayer = null;
let bhBullets = [];
let bhWalls = [];
let bhItems = [];
let bhIsPlaying = false;
let bhSpawnRate = 1000;
let bhLastSpawn = 0;

function startBulletHell() {
  bhContainer.classList.remove('hidden');
  bhGameoverModal.classList.add('hidden');
  bhEntities.innerHTML = '';
  bhBullets = [];
  bhWalls = [];
  bhItems = [];
  bhStartTime = performance.now();
  bhIsPlaying = true;
  bhSpawnRate = 1000;
  
  bhPlayer = document.createElement('div');
  bhPlayer.className = 'bh-player';
  bhPlayer.innerHTML = `
    <div class="bh-icon">�䊹</div>
    <div class="bh-player-name">${currentUser.displayName}</div>
  `;
  
  const livesEl = document.createElement('div');
  livesEl.className = 'bh-lives';
  livesEl.id = 'bh-lives-display';
  livesEl.innerText = '�歹��歹��歹�';
  bhPlayer.appendChild(livesEl);
  
  bhPlayer.style.left = (window.innerWidth / 2 - 15) + 'px';
  bhPlayer.style.top = (window.innerHeight - 100) + 'px';
  bhEntities.appendChild(bhPlayer);
  
  let isDragging = false;
  
  const onPointerDown = (e) => {
    isDragging = true;
    updatePlayerPos(e);
  };
  const onPointerMove = (e) => {
    if (!isDragging || !bhIsPlaying) return;
    updatePlayerPos(e);
  };
  const onPointerUp = (e) => {
    isDragging = false;
  };
  
  function updatePlayerPos(e) {
    const touch = e.touches ? e.touches[0] : e;
    let newX = touch.clientX - 15;
    let newY = touch.clientY - 15;
    newX = Math.max(0, Math.min(window.innerWidth - 30, newX));
    newY = Math.max(0, Math.min(window.innerHeight - 30, newY));
    
    // Wall collision
    const isInvincible = bhPlayer.classList.contains('bh-invincible');
    let hitWall = null;
    for (let w of bhWalls) {
      if (newX + 30 > w.left && newX < w.right && newY + 30 > w.top && newY < w.bottom) {
        hitWall = w;
        break;
      }
    }
    
    if (hitWall) {
      if (!isInvincible) {
        return; // Prevent movement
      }
    }
    
    bhPlayer.style.left = newX + 'px';
    bhPlayer.style.top = newY + 'px';
  }
  
  bhContainer.addEventListener('pointerdown', onPointerDown);
  bhContainer.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  
  bhContainer._cleanupEvents = () => {
    bhContainer.removeEventListener('pointerdown', onPointerDown);
    bhContainer.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  };

  requestAnimationFrame(bhGameLoop);
}

function bhGameLoop(timestamp) {
  if (!bhIsPlaying) return;
  
  const elapsed = timestamp - bhStartTime;
  bhTimer.innerText = (elapsed / 1000).toFixed(2);
  
  bhSpawnRate = Math.max(200, 1000 - (elapsed / 1000) * 20);
  
  if (timestamp - bhLastSpawn > bhSpawnRate) {
    spawnBullet();
    bhLastSpawn = timestamp;
  }
  
  const pRect = bhPlayer.getBoundingClientRect();
  const playerHitbox = {
    left: pRect.left + 10,
    right: pRect.right - 10,
    top: pRect.top + 10,
    bottom: pRect.bottom - 10
  };

  let speedMultiplier = 1 + (elapsed / 1000) * 0.05;

  for (let i = bhBullets.length - 1; i >= 0; i--) {
    let b = bhBullets[i];
    b.y += b.vy * speedMultiplier;
    b.x += b.vx * speedMultiplier;
    
    b.el.style.transform = `translate(${b.x}px, ${b.y}px)`;
    
    if (b.y > window.innerHeight + 50 || b.x < -50 || b.x > window.innerWidth + 50) {
      b.el.remove();
      bhBullets.splice(i, 1);
      continue;
    }
    
    if (
      b.x + 20 > playerHitbox.left &&
      b.x + 10 < playerHitbox.right &&
      b.y + 20 > playerHitbox.top &&
      b.y + 10 < playerHitbox.bottom
    ) {
      endBulletHell(elapsed);
      return;
    }
  }
  
  requestAnimationFrame(bhGameLoop);
}

function spawnBullet() {
  const el = document.createElement('div');
  el.className = 'bh-bullet';
  el.innerHTML = '�虬';
  
  const startX = Math.random() * window.innerWidth;
  const startY = -30;
  
  const targetX = Math.random() * window.innerWidth;
  const targetY = window.innerHeight;
  
  const angle = Math.atan2(targetY - startY, targetX - startX);
  const speed = 3 + Math.random() * 2;
  
  const vx = Math.cos(angle) * speed;
  const vy = Math.sin(angle) * speed;
  
  bhEntities.appendChild(el);
  bhBullets.push({ el, x: startX, y: startY, vx, vy });
}

async function endBulletHell(elapsedMs) {
  bhIsPlaying = false;
  if (bhContainer._cleanupEvents) bhContainer._cleanupEvents();
  
  const iconEl = bhPlayer.querySelector('.bh-icon');
  if (iconEl) iconEl.innerText = '��';
  
  const survivalTime = parseFloat((elapsedMs / 1000).toFixed(2));
  bhFinalTime.innerText = survivalTime.toFixed(2);
  
  bhGameoverModal.classList.remove('hidden');
  
  try {
    const res = await fetch('/api/easter_egg/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: currentUser.userId, name: currentUser.displayName, survivalTime })
    });
    const data = await res.json();
    if (data.success && data.leaderboard) {
      renderBhLeaderboard(data.leaderboard);
      
      if (data.leaderboard[0] && data.leaderboard[0].uid === currentUser.userId) {
        const winIconEl = bhPlayer.querySelector('.bh-icon');
        if (winIconEl) winIconEl.innerText = '👑';
      }
    }
  } catch(e) {}
}

function renderBhLeaderboard(list) {
  bhLeaderboardList.innerHTML = '';
  list.forEach((w, index) => {
    const li = document.createElement('li');
    li.style.padding = '4px 0';
    li.style.borderBottom = '1px solid #eee';
    let rank = index === 0 ? '��' : index === 1 ? '��' : index === 2 ? '��' : `${index+1}.`;
    li.innerHTML = `<strong>${rank}</strong> ${w.name} - <span style="color:#e91e63">${w.survivalTime}</span> 蝘嚒;
    bhLeaderboardList.appendChild(li);
  });
}

if (btnBhRestart) {
  btnBhRestart.addEventListener('click', startBulletHell);
}
if (btnBhClose) {
  btnBhClose.addEventListener('click', () => {
    bhContainer.classList.add('hidden');
    bhEntities.innerHTML = '';
  });
}


// �嘥��� LIFF
async function initializeLiff() {
  try {
    // 1. �硋�敺𣬚垢蝟餌絞閮剖�
    const configRes = await fetch(`/api/config?_t=${Date.now()}`);
    if (!configRes.ok) throw new Error('�⊥��硋�蝟餌絞閮剖�');
    const config = await configRes.json();
    
    if (!config.liffId) {
      throw new Error('蝟餌絞�芾身摰� LIFF ID');
    }

    // 2. �嘥��� LIFF SDK
    await liff.init({ liffId: config.liffId });

    // 3. 蝣箔�雿輻鍂��歇�餃�
    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri: window.location.href });
      return;
    }

    // �硋�雿輻鍂�����
    const profile = await liff.getProfile();
    currentUser = profile;
    if (typeof initLottery === 'function') {
      initLottery(currentUser.userId);
    }

    // 4. �硋�蝢斤� Context
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

    // 蝝����㰘赤
    if (currentGroupId && currentUser) {
      fetch('/api/lobby_visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gid: currentGroupId,
          userId: currentUser.userId,
          displayName: currentUser.displayName,
          pictureUrl: currentUser.pictureUrl
        })
      }).catch(e => console.error('Failed to log visit', e));
    }

    // 5. 頛匧�憭批輒鞈��
    document.getElementById('create-game-view').classList.add('hidden');
    await loadGamesLobby();
    
    // 6. �嘥��𡝗晷撠� Socket (�峕艶���嚗䔶誑靘踵𦻖�嗅誨��)
    initSocket();

  } catch (err) {
    console.error('LIFF Init Error:', err);
    appDiv.className = '';
    statusMsg.innerText = err.message || '�潛��航炊';
    statusMsg.style.color = '#ff5252';
    statusMsg.style.display = 'block';
  }
}

// 頛匧�憭𡁜聦甈∪之撱唾���
async function loadGamesLobby(silent = false) {
  try {
    if (!silent) {
      appDiv.className = 'loading';
      statusMsg.innerText = '頛匧�銝�...';
      statusMsg.style.display = 'block';
    }
    
    const res = await fetch(`/api/game/${currentGroupId}?uid=${currentUser.userId}&_t=${Date.now()}`);
    if (!res.ok) {
      if (res.status === 404) {
        gamesList = [];
      } else {
        throw new Error('�⊥��硋��湔活鞈��');
      }
    } else {
      const data = await res.json();
      gamesList = data.games || [];
      lastGamesJson = JSON.stringify(gamesList);
      globalIsAdmin = !!data.isAdmin;
      globalIsSuperAdmin = !!data.isSuperAdmin;
      globalManagedGroups = data.managedGroups || [];
      globalLobbyTitle = data.lobbyTitle || '蝢賜��仿�憭批輒';
      globalLobbyDesc = data.lobbyDesc || '�祇�梯𠪊�枏�憿齿��琜�頞訫翰�嗡�嚗諹��堒�鞊砌�韏瑕翰璅�𧎚�滚嫃嚗�';
    }

    try {
      const eeRes = await fetch('/api/easter_egg/status');
      if (eeRes.ok) {
        const eeData = await eeRes.json();
        easterEggEnabled = !!eeData.enabled;
      }
    } catch(e) {}

    const urlParams = new URLSearchParams(window.location.search);
    const urlGameId = urlParams.get('gameId');
    // �亦��脲活頛匧�銝𠉛雯���㗇�摰� gameId嚗���湔𦻖�脣�閰脣聦甈∴��血��坔銁擐㚚�
    if (!silent && urlGameId && gamesList.some(g => g.gameId === urlGameId)) {
      renderDetail(urlGameId);
    } else if (!currentGameDetailId) {
      renderLobby();
    } else {
      renderDetail(currentGameDetailId);
    }
  } catch (err) {
    console.error(err);
    appDiv.className = ''; // 蝣箔��潛��航炊����𣈯�頧匧���
    statusMsg.innerText = err.message;
    statusMsg.style.display = 'block';
  }
}

// �斗𪃾�湔活�臬炏撌脤��� (�寞��交���������)
function isGameExpired(game) {
  if (game.isManualEnded) return true;
  if (!game.date) return false;
  const dateMatch = game.date.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (!dateMatch) return false;
  
  const year = parseInt(dateMatch[1]);
  const month = parseInt(dateMatch[2]) - 1;
  const day = parseInt(dateMatch[3]);
  
  let hour = 23;
  let minute = 59;
  
  if (game.time) {
     const timeMatches = game.time.match(/([01]?[0-9]|2[0-3]):([0-5][0-9])/g);
     if (timeMatches && timeMatches.length > 0) {
        const lastTime = timeMatches[timeMatches.length - 1];
        const parts = lastTime.split(':');
        hour = parseInt(parts[0]);
        minute = parseInt(parts[1]);
     }
  }
  
  const endTime = new Date(year, month, day, hour, minute);
  return Date.now() > endTime.getTime();
}



document.addEventListener('click', (e) => {
  if (!e.target.closest('.btn-danger')) {
    document.querySelectorAll('.btn-danger').forEach(b => {
      if (b.dataset.dodged === 'true') {
        b.dataset.dodged = 'false';
        b.style.transition = 'transform 1s ease';
        b.style.transform = 'translate(0px, 0px)';
      }
    });
  }
});

// 皜脫�憭批輒�恍𢒰
function renderLobby() {
    appDiv.className = '';
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    lobbyView.classList.remove('hidden');
    
    document.getElementById('lobby-title-text').innerText = globalLobbyTitle || '蝢賜��仿�憭批輒';
    const btnEditTitle = document.getElementById('btn-edit-title');
    if (globalIsSuperAdmin && btnEditTitle) {
      btnEditTitle.classList.remove('hidden');
      btnEditTitle.onclick = handleEditLobbyTitle;
    } else if (btnEditTitle) {
      btnEditTitle.classList.add('hidden');
    }
    
    document.getElementById('lobby-desc-text').innerText = globalLobbyDesc || '�祇�梯𠪊�枏�憿齿��琜�頞訫翰�嗡�嚗諹��堒�鞊砌�韏瑕翰璅�𧎚�滚嫃嚗�';
    const btnEditDesc = document.getElementById('btn-edit-desc');
    if (globalIsSuperAdmin && btnEditDesc) {
      btnEditDesc.classList.remove('hidden');
      btnEditDesc.onclick = handleEditLobbyDesc;
    } else if (btnEditDesc) {
      btnEditDesc.classList.add('hidden');
    }

    if (globalIsSuperAdmin && btnLobbyStats) {
      btnLobbyStats.classList.remove('hidden');
    } else if (btnLobbyStats) {
      btnLobbyStats.classList.add('hidden');
    }

    if (globalIsSuperAdmin && btnEasterEgg) {
      btnEasterEgg.classList.remove('hidden');
    } else if (btnEasterEgg) {
      btnEasterEgg.classList.add('hidden');
    }

    if (globalIsSuperAdmin && btnPartyAdmin) {
      btnPartyAdmin.classList.remove('hidden');
    } else if (btnPartyAdmin) {
      btnPartyAdmin.classList.add('hidden');
    }
    
    const createContainer = document.getElementById('admin-create-game-container');
    if (createContainer) {
      if (globalIsAdmin) {
        createContainer.classList.remove('hidden');
      } else {
        createContainer.classList.add('hidden');
      }
    }
    
    gamesContainer.innerHTML = '';
    
    if (gamesList.length === 0) {
      noGamesMsg.classList.remove('hidden');
      return;
    }
    
    noGamesMsg.classList.add('hidden');
    
    const activeGames = [];
    const endedGames = [];
    
    gamesList.forEach(game => {
      if (isGameExpired(game)) endedGames.push(game);
      else activeGames.push(game);
    });
    
    const renderCard = (game) => {
      const section = game.sections[0] || { list: [], limit: 20 };
      const count = section.list.length;
      const limit = section.limit;
      const backupLimit = section.backupLimit || 0;
      const totalLimit = limit + backupLimit;
      
      const isExpired = isGameExpired(game);
      const isFull = count >= totalLimit;
      const isWaitlist = count >= limit && count < totalLimit;
      
      const isMeRegistered = game.myRegisteredNames && game.myRegisteredNames.length > 0;
      
      let badgeStyle = '';
      let badgeText = '';
      
      if (isExpired) {
         badgeStyle = 'background-color: #666; color: #FFF;';
         badgeText = '撌脩���';
      } else if (isFull) {
         badgeStyle = 'background-color: #E0E0E0; color: #888888;';
         badgeText = '撌脤�皛�';
      } else if (isWaitlist) {
         badgeStyle = 'background-color: #FFF3E0; color: #E65100;';
         badgeText = '�� �躰�銝�';
      } else {
         badgeText = '�� �𧢲𦆮�勗�';
      }
      
      let customTagsHtml = '';
      if (game.tag) {
         const tagArr = game.tag.split(/[,���]/).map(t => t.trim()).filter(Boolean);
         customTagsHtml = tagArr.map(t => `<div class="badge default">${escapeHTML(t)}</div>`).join('');
      }
      
      const card = document.createElement('div');
      const progressPercent = limit > 0 ? Math.min(100, (count / limit) * 100) : 0;
      const progressColor = count > limit ? 'var(--danger-color)' : 'var(--primary-color)';
      
      card.className = 'game-card';
      if (isExpired) {
         card.style.opacity = '0.6';
         card.style.filter = 'grayscale(1)';
      }

      
      card.innerHTML = `
        <div class="card-badges" onclick="showDetail('${game.gameId}')" style="cursor: pointer; flex-wrap: wrap;">
          <div class="badge ${isFull || isExpired ? 'full' : 'open'}" style="${badgeStyle}">
            ${badgeText}
          </div>
          ${customTagsHtml}
          ${isMeRegistered ? '<div class="badge open" style="background-color: var(--primary-color); color: white;">撌脣𥼚��</div>' : ''}
        </div>
        
        <div class="card-title" onclick="showDetail('${game.gameId}')" style="cursor: pointer;">
          ${escapeHTML(game.title || '蝢賜��仿�')}
        </div>
        
        <div class="info-grid" onclick="showDetail('${game.gameId}')" style="cursor: pointer;">
          <div class="info-item">
            <span class="info-icon">��</span>
            <span>${escapeHTML(game.date || '�芾身摰�')}</span>
          </div>
          <div class="info-item">
            <span class="info-icon">��</span>
            <span>${escapeHTML(game.time || '�芾身摰�')}</span>
          </div>
          <div class="info-item">
            <span class="info-icon">��</span>
            <span>${escapeHTML(game.location || '�芾身摰�')}</span>
          </div>
          <div class="info-item">
            <span class="info-icon">�兛</span>
            <span>${escapeHTML(formatFee(game.fee) || '�芾身摰�')}</span>
          </div>
        </div>
        
        ${game.note ? `<div class="game-note" onclick="showDetail('${game.gameId}')" style="cursor: pointer;">${escapeHTML(game.note)}</div>` : ''}
        
        <div class="progress-container" onclick="showDetail('${game.gameId}')" style="cursor: pointer;">
          <div class="progress-header">
            <span>�漤��脣漲</span>
            <span class="progress-value" style="color: ${count > limit ? 'var(--danger-color)' : 'var(--text-main)'}">${count} / ${limit} 鈭�</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${progressPercent}%; background-color: ${progressColor};"></div>
          </div>
        </div>
        
        <div class="action-row" style="flex-wrap: wrap;">
          <button class="btn btn-primary btn-square" ${(isFull || isExpired) ? 'disabled style="opacity:0.5"' : ''} onclick="handleActionWithInput(event, '${game.gameId}', 'register')">+1</button>
          <button class="btn btn-danger btn-square" ${isExpired ? 'disabled style="opacity:0.5"' : ''} onclick="handleActionWithInput(event, '${game.gameId}', 'cancel')">-1</button>
          <input type="text" id="name-input-${game.gameId}" class="name-input" placeholder="隢贝撓�交黸蝔�" ${isExpired ? 'disabled' : ''} style="flex: 2; min-width: 100px; font-weight: bold; color: #333;" />
          <input type="text" id="level-input-${game.gameId}" class="name-input" placeholder="蝔见漲" ${isExpired ? 'disabled' : ''} style="flex: 1; min-width: 60px; margin-left: 8px; font-weight: bold;" />
        </div>
        <div id="error-msg-${game.gameId}" class="error-msg"></div>
      `;
      return card;
    };
    
    activeGames.forEach(game => gamesContainer.appendChild(renderCard(game)));
    
    if (globalIsAdmin && endedGames.length > 0) {
      const detailsEl = document.createElement('details');
      detailsEl.style.marginTop = '20px';
      detailsEl.style.padding = '10px';
      detailsEl.style.backgroundColor = '#f9f9f9';
      detailsEl.style.borderRadius = '8px';
      detailsEl.style.border = '1px solid #ddd';
      
      const summaryEl = document.createElement('summary');
      summaryEl.style.fontWeight = 'bold';
      summaryEl.style.cursor = 'pointer';
      summaryEl.style.color = '#666';
      summaryEl.innerText = `撌脩��毺��� (${endedGames.length})`;
      
      const contentEl = document.createElement('div');
      contentEl.style.marginTop = '15px';
      
      endedGames.forEach(game => contentEl.appendChild(renderCard(game)));
      
      detailsEl.appendChild(summaryEl);
      detailsEl.appendChild(contentEl);
      gamesContainer.appendChild(detailsEl);
    }
  
  // �湔鰵���𧢲�摮� (��𧋦�航����嚗𣬚𣶹�典��� appDiv.className='' ��隞亙����憭梧��穃�烐凒�唳�摮�)
  const headerP = document.querySelector('.lobby-header p');
  if (headerP) headerP.innerText = '暺鮋�璅䠷��脣�敺䕘��舀䰻�卝���瘨����';
  const statusEl = document.getElementById('status-msg');
  if (statusEl) statusEl.style.display = 'none';
}

async function handleEditLobbyTitle() {
  const newTitle = prompt('隢贝撓�交鰵��之撱單�憿䕘�', globalLobbyTitle || '');
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
      alert('靽格㺿憭望�');
    }
  } catch(e) {
    alert('蝬脰楝�航炊');
  } finally {
    appDiv.className = '';
  }
}

async function handleEditLobbyDesc() {
  const newDesc = prompt('隢贝撓�交鰵��之撱單�餈堆�', globalLobbyDesc || '');
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
      alert('靽格㺿憭望�');
    }
  } catch (err) {
    alert('蝬脰楝�航炊');
  } finally {
    appDiv.className = '';
  }
}

// �閧�銝��砍𥼚�齿��𡝗�
async function handleAction(gameId, action) {
  try {
    appDiv.className = 'loading';
    statusMsg.innerText = '�閧�銝�...';
    
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gid: currentGroupId,
        gameId: gameId,
        uid: currentUser.userId,
        name: currentUser.displayName,
        operatorName: currentUser.displayName,
        action: action
      })
    });
    
    const result = await res.json();
    if (!res.ok) {
      alert(result.error || '�潛��航炊');
      await loadGamesLobby();
      return;
    }
    
    // �𣂼�敺峕凒�啗��坔澈���銝阡��唳葡��
    const idx = gamesList.findIndex(g => g.gameId === gameId);
    if (idx !== -1) gamesList[idx] = result.game;
    
    if (currentGameDetailId) {
      renderDetail(gameId, true);
    } else {
      renderLobby();
    }
  } catch (err) {
    console.error(err);
    alert('蝬脰楝�航炊嚗諹�蝔滚��滩岫');
    await loadGamesLobby();
  }
}

// �閧�隞�𥼚��
async function handleProxyRegister(gameId) {
  const input = document.getElementById(`proxy-name-${gameId}`);
  if (!input) return;
  const name = input.value.trim();
  if (!name) {
    alert('隢贝撓�乩誨�勗��滨迂');
    return;
  }
  
  try {
    appDiv.className = 'loading';
    statusMsg.innerText = '隞�𥼚�滩���葉...';
    
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gid: currentGroupId,
        gameId: gameId,
        uid: currentUser.userId,
        name: name,
        operatorName: currentUser.displayName,
        action: 'register'
      })
    });
    
    const result = await res.json();
    if (!res.ok) {
      alert(result.error || '�潛��航炊');
      await loadGamesLobby();
      return;
    }
    
    input.value = '';
    const idx = gamesList.findIndex(g => g.gameId === gameId);
    if (idx !== -1) gamesList[idx] = result.game;
    renderLobby();
    
  } catch (err) {
    console.error(err);
    alert('蝬脰楝�航炊嚗諹�蝔滚��滩岫');
    await loadGamesLobby();
  }
}
// ����單�蝝啁𧞄��
window.showDetail = function(gameId) {
  currentGameDetailId = gameId;
  renderDetail(gameId);
};

// 皜脫��𡒊敦�恍𢒰
function renderDetail(gameId, preserveScroll = false) {
  const game = gamesList.find(g => g.gameId === gameId);
  if (!game) return;
  
  appDiv.className = '';
  const statusMsgEl = document.getElementById('status-msg');
  if (statusMsgEl) statusMsgEl.style.display = 'none';
  lobbyView.classList.add('hidden');
  detailView.classList.remove('hidden');
  
  if (!preserveScroll) {
    window.scrollTo(0, 0);
  }
  
  const normalize = s => (s||'').replace(/\s+/g, '');
  const autoStr = normalize([game.date, game.time, game.location].filter(Boolean).join(''));
  const isAutoTitle = normalize(game.title) === autoStr || game.title === '蝢賜��仿�';
  const showTitle = game.title && !isAutoTitle;
  detailTitle.innerText = showTitle ? game.title : '�湔活�𡒊敦';
  if (!showTitle) detailTitle.style.display = 'none';
  else detailTitle.style.display = 'block';
  
  const btnCloseGame = document.getElementById('btn-close-game');
  const btnEditGame = document.getElementById('btn-edit-game');
  const btnCopyList = document.getElementById('btn-copy-list');
  if (btnCopyList) {
    btnCopyList.classList.remove('hidden');
    btnCopyList.onclick = () => {
      const list = game.sections[0]?.list || [];
      const text = list.map(n => n === '__ANON__' ? '�踹����' : n).join('\n');
      navigator.clipboard.writeText(text).then(() => {
        alert('�滚鱓撌脫��蠘�鋆踝�\n\n' + text);
      }).catch(() => {
        prompt('隢贝�鋆賭誑銝见��殷�', text);
      });
    };
  }

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
  detailCount.innerText = `${isRegistered ? '(撌脣𥼚��) ' : ''}${section.list.length} / ${section.limit}`;
  

  const isExpired = isGameExpired(game);
  const isFull = section.list.length >= (section.limit + (section.backupLimit || 0));

  let actionRowHtml = `
    <div class="action-row" style="flex-wrap: wrap; margin-top: 15px; margin-bottom: 10px;">
      <button class="btn btn-primary btn-square" ${(isFull || isExpired) ? 'disabled style="opacity:0.5"' : ''} onclick="handleActionWithInput(event, '${game.gameId}', 'register', '-detail')">+1</button>
      <button class="btn btn-danger btn-square" ${isExpired ? 'disabled style="opacity:0.5"' : ''} onclick="handleActionWithInput(event, '${game.gameId}', 'cancel', '-detail')">-1</button>
      <input type="text" id="name-input-${game.gameId}-detail" class="name-input" placeholder="隢贝撓�交黸蝔�" ${isExpired ? 'disabled' : ''} style="flex: 2; min-width: 100px; font-weight: bold; color: #333;" />
      <input type="text" id="level-input-${game.gameId}-detail" class="name-input" placeholder="蝔见漲" ${isExpired ? 'disabled' : ''} style="flex: 1; min-width: 60px; margin-left: 8px; font-weight: bold;" />
    </div>
    <div id="error-msg-${game.gameId}-detail" class="error-msg"></div>
  `;
  
  detailList.innerHTML = actionRowHtml;
  
  if (globalIsSuperAdmin) {
    let pushListBtn = document.getElementById('admin-push-list-btn');
    if (!pushListBtn) {
      pushListBtn = document.createElement('button');
      pushListBtn.id = 'admin-push-list-btn';
      pushListBtn.className = 'btn btn-primary';
      pushListBtn.style.marginTop = '10px';
      pushListBtn.style.marginBottom = '15px';
      pushListBtn.style.width = '100%';
      pushListBtn.style.backgroundColor = '#FF9800';
      pushListBtn.innerText = '�𤙥 �冽偘�桀�閰喟敦�滚鱓';
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
     if (game.date) tagsHtml += `<span class="info-tag">�� ${escapeHTML(game.date)}</span>`;
     if (game.time) tagsHtml += `<span class="info-tag">�� ${escapeHTML(game.time)}</span>`;
     tagsHtml += '</div>';
     tagsHtml += '<div class="info-row" style="margin-top: 4px;">';
     if (game.location) tagsHtml += `<span class="info-tag">�� ${escapeHTML(game.location)}</span>`;
     if (game.fee) tagsHtml += `<span class="info-tag">�兛 ${escapeHTML(formatFee(game.fee))}</span>`;
     tagsHtml += '</div>';
     tagsHtml += '</div>';
     detailList.innerHTML += tagsHtml;
  }
  if (game.note) {
     detailList.innerHTML += `<div class="game-note">${escapeHTML(game.note)}</div>`;
  }
  
  let historyHtml = '<div class="history-section" style="margin-top: 15px; margin-bottom: 15px; padding: 10px; background-color: #fafafa; border-radius: 8px; border-left: 4px solid #90caf9;">';
  historyHtml += '<h4 style="margin: 0 0 8px 0; color: #333; font-size: 14px;">甇瑕蟮蝝���</h4>';
  historyHtml += '<div style="font-size: 13px; color: #555;">';
  if (game.history && game.history.length > 0) {
    const top2 = game.history.slice(0, 2);
    const rest = game.history.slice(2);
    
    top2.forEach(h => {
       let displayText = '';
       if (h.action === '�航炊') {
         historyHtml += `<div style="margin-bottom: 4px; color: #F44336; font-size: 12px;">${escapeHTML(h.time)} <strong>[蝟餌絞�航炊]</strong> ${escapeHTML(h.errorMsg || '')}</div>`;
         return;
       }
       if (h.operator && h.operator !== h.name) {
         displayText = `${escapeHTML(h.operator)} 撟� ${escapeHTML(h.name)}`;
       } else if (h.operator) {
         displayText = escapeHTML(h.operator);
       } else {
         displayText = escapeHTML(h.name);
       }
       historyHtml += `<div style="margin-bottom: 4px;">${escapeHTML(h.time)} <strong>${displayText}</strong> <span style="color: ${h.action === '+1' ? '#4CAF50' : '#F44336'}; font-weight: bold;">${escapeHTML(h.action)}</span></div>`;
    });
    
    if (rest.length > 0) {
       historyHtml += `<details style="margin-top: 8px;">
           <summary style="cursor: pointer; color: #1976d2; font-weight: bold; outline: none;">憿舐內�游� (${rest.length})</summary>
           <div style="max-height: 120px; overflow-y: auto; margin-top: 6px; padding-left: 8px; border-left: 2px solid #ddd;">`;
       rest.forEach(h => {
           let displayText = '';
           if (h.action === '�航炊') {
             historyHtml += `<div style="margin-bottom: 4px; color: #F44336; font-size: 12px;">${escapeHTML(h.time)} <strong>[蝟餌絞�航炊]</strong> ${escapeHTML(h.errorMsg || '')}</div>`;
             return;
           }
           if (h.operator && h.operator !== h.name) {
             displayText = `${escapeHTML(h.operator)} 撟� ${escapeHTML(h.name)}`;
           } else if (h.operator) {
             displayText = escapeHTML(h.operator);
           } else {
             displayText = escapeHTML(h.name);
           }
           historyHtml += `<div style="margin-bottom: 4px;">${escapeHTML(h.time)} <strong>${displayText}</strong> <span style="color: ${h.action === '+1' ? '#4CAF50' : '#F44336'}; font-weight: bold;">${escapeHTML(h.action)}</span></div>`;
       });
       historyHtml += `</div></details>`;
    }
  } else {
    historyHtml += '<div style="color: #999; font-style: italic;">�桀�撠𡁶�甇瑕蟮蝝���</div>';
  }
  historyHtml += '</div></div>';
  detailList.innerHTML += historyHtml;
  
  // 憿舐內���匧�畾� (�怠�躰�)
  game.sections.forEach((sec, sIdx) => {
    const secDiv = document.createElement('div');
    secDiv.className = 'list-section';
    secDiv.innerHTML = `<h3>${escapeHTML(sec.title)} (�鞾� ${sec.limit})</h3>`;
    
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
            paidHtml = `<button class="paid-btn ${isPaid ? 'paid' : ''}" onclick="handleTogglePaid('${game.gameId}', '${escapeHTML(name)}')">${isPaid ? '�兛 撌脩像鞎�' : '漎� �芰像鞎�'}</button>`;
          } else if (isPaid) {
            paidHtml = `<span class="paid-badge">�兛 撌脩像鞎�</span>`;
          }
        }
        
        let moveHtml = '';
        if (globalIsAdmin) {
          const canMoveUp = i > 0;
          const canMoveDown = i < sec.list.length - 1;
          moveHtml = `
            <div style="display:flex; flex-direction:column; margin-right: 5px; min-width: 20px;">
              <button class="btn-icon" style="padding:0; font-size: 12px; margin:0; line-height: 1; opacity: ${canMoveUp ? 1 : 0.2}" ${canMoveUp ? `onclick="handleReorder('${game.gameId}', ${i}, ${i-1})"` : 'disabled'}>�䃈</button>
              <button class="btn-icon" style="padding:0; font-size: 12px; margin:0; line-height: 1; opacity: ${canMoveDown ? 1 : 0.2}" ${canMoveDown ? `onclick="handleReorder('${game.gameId}', ${i}, ${i+1})"` : 'disabled'}>�𤪖</button>
            </div>
          `;
        }
        
        secDiv.innerHTML += `
          <div class="list-item">
            ${moveHtml}
            <div class="list-num">${i + 1}.</div>
            <div class="list-name ${isMe ? 'me' : ''}">${escapeHTML(displayName)}${levelStr}</div>
            ${paidHtml}
            ${(canCancel && !isGameExpired(game)) ? `<button class="btn-icon" style="color:var(--danger-color); padding: 4px; margin: 0; font-size: 16px;" onclick="handleCancelByName('${game.gameId}', '${escapeHTML(name)}')">��</button>` : ''}
          </div>
        `;
      } else {
        secDiv.innerHTML += `
          <div class="list-item" style="opacity: 0.3">
            <div class="list-num">${i + 1}.</div>
            <div class="list-name">-- �𥕢�隞亙� --</div>
          </div>
        `;
      }
    }
    
    // �躰��滚鱓
    if (sec.list.length > sec.limit) {
      secDiv.innerHTML += `<h3 style="margin-top:20px; color:#ff9800">�躰��滚鱓</h3>`;
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
            paidHtml = `<button class="paid-btn ${isPaid ? 'paid' : ''}" onclick="handleTogglePaid('${game.gameId}', '${escapeHTML(name)}')">${isPaid ? '�兛 撌脩像鞎�' : '漎� �芰像鞎�'}</button>`;
          } else if (isPaid) {
            paidHtml = `<span class="paid-badge">�兛 撌脩像鞎�</span>`;
          }
        }
        
        let moveHtml = '';
        if (globalIsAdmin) {
          const canMoveUp = i > 0;
          const canMoveDown = i < sec.list.length - 1;
          moveHtml = `
            <div style="display:flex; flex-direction:column; margin-right: 5px; min-width: 20px;">
              <button class="btn-icon" style="padding:0; font-size: 12px; margin:0; line-height: 1; opacity: ${canMoveUp ? 1 : 0.2}" ${canMoveUp ? `onclick="handleReorder('${game.gameId}', ${i}, ${i-1})"` : 'disabled'}>�䃈</button>
              <button class="btn-icon" style="padding:0; font-size: 12px; margin:0; line-height: 1; opacity: ${canMoveDown ? 1 : 0.2}" ${canMoveDown ? `onclick="handleReorder('${game.gameId}', ${i}, ${i+1})"` : 'disabled'}>�𤪖</button>
            </div>
          `;
        }
        
        secDiv.innerHTML += `
          <div class="list-item" style="opacity: 0.8; background-color: #f9f9f9;">
            ${moveHtml}
            <div class="list-num" style="color: #666; font-size: 12px;">�� ${i - sec.limit + 1}.</div>
            <div class="list-name ${isMe ? 'me' : ''}" style="color: #666;">${escapeHTML(displayName)}${levelStr}</div>
            ${paidHtml}
            ${(canCancel && !isGameExpired(game)) ? `<button class="btn-icon" style="color:var(--danger-color); padding: 4px; margin: 0; font-size: 16px;" onclick="handleCancelByName('${game.gameId}', '${escapeHTML(name)}')">��</button>` : ''}
          </div>
        `;
      }
    }
    
    detailList.appendChild(secDiv);
  });
}

// 餈𥪜�憭批輒
btnBack.addEventListener('click', () => {
  currentGameDetailId = null;
  renderLobby();
});

const btnCloseGame = document.getElementById('btn-close-game');
if (btnCloseGame) {
  btnCloseGame.addEventListener('click', async () => {
    if (!currentGameDetailId) return;
    if (!confirm('蝣箏�閬����/�𣈯�甇文聦甈∪�嚗髿n�𣈯�敺���⊥��滚𥼚�㵪�銝虫����憭批輒�梯���')) return;
    
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
      if (!res.ok) alert(result.error || '�滢�憭望�');
      else alert('�湔活撌脤��㚁�');
      
      currentGameDetailId = null;
      await loadGamesLobby();
    } catch (e) {
      alert('蝬脰楝�航炊');
      appDiv.className = '';
    }
  });
}

// �澆��𤥁祥�剁��亦�����滚�鋆靝�
function formatFee(fee) {
  if (!fee || fee === '�芾身摰�' || fee === '�芰䰻' || fee === '��' || fee === '0') return fee || '';
  let str = fee.toString().trim();
  if (str && !str.endsWith('��')) {
    return str + '��';
  }
  return str;
}

// HTML ����賣彍�� XSS
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

// �𣈯��齿鰵�渡�鞈�� (銝漤＊蝷� loading)
let refreshPending = false;

async function silentRefreshGames() {
  if (!currentGroupId || !currentUser) return;
  
  // �乩蝙�刻��迤�刻撓�伐��怠��湔鰵隞亙��𤘪𪃾頛詨�
  const activeTag = document.activeElement ? document.activeElement.tagName : '';
  if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
    if (!refreshPending) {
      refreshPending = true;
      setTimeout(() => {
        refreshPending = false;
        silentRefreshGames();
      }, 1500); // 1.5 蝘鍦��滩岫
    }
    return;
  }
  
  try {
    const res = await fetch(`/api/game/${currentGroupId}?uid=${currentUser.userId}&_t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      const newGamesJson = JSON.stringify(data.games || []);
      
      if (newGamesJson !== lastGamesJson) {
        lastGamesJson = newGamesJson;
        gamesList = data.games || [];
        globalIsAdmin = !!data.isAdmin;
        globalManagedGroups = data.managedGroups || [];
        globalLobbyTitle = data.lobbyTitle || '蝢賜��仿�憭批輒';
        globalLobbyDesc = data.lobbyDesc || '�祇�梯𠪊�枏�憿齿��琜�頞訫翰�嗡�嚗諹��堒�鞊砌�韏瑕翰璅�𧎚�滚嫃嚗�';
        
        // �寞��桀����函𧞄�ａ��唳葡��
        if (currentGameDetailId && !detailView.classList.contains('hidden')) {
          renderDetail(currentGameDetailId, true);
        } else {
          renderLobby();
        }
      }
    }
  } catch (err) {
    // �𣈯�憭望�銝齿�蝷�
  }
}

// --- SSE 銝餃��冽偘璈笔� ---
let eventSource = null;

function setupSSE() {
  if (!currentGroupId) return;
  if (eventSource) {
    eventSource.close();
  }
  
  eventSource = new EventSource(`/api/events/${currentGroupId}`);
  
  eventSource.onmessage = (e) => {
    if (e.data === 'refresh') {
      silentRefreshGames();
    }
  };
  
  eventSource.onerror = () => {
    // �潛��航炊�𡝗𪃾蝺𡁏�嚗屸��劐蒂�典嗾蝘鍦��𡑒岫�漤��
    eventSource.close();
    eventSource = null;
    setTimeout(setupSSE, 5000);
  };
}

// �笔�
initializeLiff().then(() => {
  setupSSE();
});

// �誯��滨迂�𡝗��勗�
window.handleCancelByName = async function(gameId, name) {
  if (!confirm(`蝣箏�閬��瘨���${name}�滨��勗��𠬍�`)) return;
  try {
    appDiv.className = 'loading';
    statusMsg.innerText = '�𡝗�銝�...';
    
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gid: currentGroupId,
        gameId: gameId,
        uid: currentUser.userId,
        name: name,
        operatorName: currentUser.displayName,
        action: 'cancel'
      })
    });
    
    const result = await res.json();
    if (!res.ok) {
      alert(result.error || '�潛��航炊');
      await loadGamesLobby();
      return;
    }
    
    const idx = gamesList.findIndex(g => g.gameId === gameId);
    if (idx !== -1) gamesList[idx] = result.game;
    renderDetail(gameId, true);
    
  } catch (err) {
    console.error(err);
    alert('蝬脰楝�航炊嚗諹�蝔滚��滩岫');
    await loadGamesLobby();
  }
};

// --- Quokka �閧𧞄�讛摩 ---
function getButtonCenter(btn) {
  const rect = btn.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };
}

let currentPlusOneAnim = null;

function playPlusOneAnimation(btn) {
  if (currentPlusOneAnim) currentPlusOneAnim();
  
  btn.classList.add('glowing-prize');
  
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.pointerEvents = 'none';
  container.style.zIndex = '9999';
  
  const updatePosition = () => {
    container.style.left = '50%';
    container.style.top = '50%';
  };
  updatePosition();
  document.body.appendChild(container);
  
  const scrollListener = () => updatePosition();
  window.addEventListener('scroll', scrollListener, true);
  
  const quokka = document.createElement('img');
  getTransparentImage('images/quokka_dance.png', (src) => {
    quokka.src = src;
  });
  quokka.style.position = 'absolute';
  quokka.style.width = '240px';
  quokka.style.height = 'auto';
  quokka.style.marginTop = '-120px';
  quokka.style.marginLeft = '-120px';
  quokka.style.animation = 'quokkaJump 0.5s ease-in-out infinite alternate';
  container.appendChild(quokka);
  
  const cleanup = () => {
    btn.classList.remove('glowing-prize');
    container.remove();
    window.removeEventListener('scroll', scrollListener, true);
    document.removeEventListener('click', outsideClickListener, true);
    currentPlusOneAnim = null;
  };
  
  const outsideClickListener = (e) => {
    if (!btn.contains(e.target)) {
      cleanup();
    }
  };
  
  currentPlusOneAnim = cleanup;
  document.addEventListener('click', outsideClickListener, true);
  
  setTimeout(() => {
    if (currentPlusOneAnim === cleanup) cleanup();
  }, 3000);
}

function playMinusOneDodgeAnimation(btn) {
  btn.dataset.dodged = 'true';
  btn.style.visibility = 'hidden';
  
  const startPos = getButtonCenter(btn);
  
  const floatingQuokka = document.createElement('div');
  floatingQuokka.className = 'floating-quokka-carry';
  floatingQuokka.style.position = 'fixed';
  floatingQuokka.style.zIndex = '9999';
  floatingQuokka.style.cursor = 'pointer';
  floatingQuokka.style.transition = 'transform 2s ease-in-out';
  floatingQuokka.style.left = (startPos.x - 120) + 'px';
  floatingQuokka.style.top = (startPos.y - 120) + 'px';
  
  const img = document.createElement('img');
  getTransparentImage('images/quokka_carry_1.png', (src) => {
    img.src = src;
  });
  img.style.width = '240px';
  img.style.height = 'auto';
  img.style.pointerEvents = 'none'; // clicks go to the wrapper
  floatingQuokka.appendChild(img);
  
  document.body.appendChild(floatingQuokka);
  
  const moveRandomly = () => {
    const maxX = window.innerWidth - 240;
    const maxY = window.innerHeight - 240;
    const rx = Math.random() * maxX - (startPos.x - 120);
    const ry = Math.random() * maxY - (startPos.y - 120);
    floatingQuokka.style.transform = `translate(${rx}px, ${ry}px)`;
  };
  
  setTimeout(moveRandomly, 100);
  const moveInterval = setInterval(moveRandomly, 2000);
  
  floatingQuokka._moveInterval = moveInterval;
  floatingQuokka._img = img;
  floatingQuokka._startPos = startPos;
  
  floatingQuokka.addEventListener('click', (e) => {
    e.stopPropagation();
    btn._floatingQuokka = floatingQuokka;
    btn.click();
  });
}

function playMinusOneCancelAnimation(btn) {
  btn.dataset.dodged = 'false';
  
  const floatingQuokka = btn._floatingQuokka;
  if (!floatingQuokka) {
    btn.style.visibility = 'visible';
    return;
  }
  
  clearInterval(floatingQuokka._moveInterval);
  
  // ��2
  getTransparentImage('images/quokka_carry_2.png', (src) => {
    floatingQuokka._img.src = src;
  });
  
  // �墧飛�煺�
  floatingQuokka.style.transition = 'transform 1s ease-in-out';
  floatingQuokka.style.transform = 'translate(0px, 0px)';
  
  setTimeout(() => {
    // �劐��餌��蓥�
    floatingQuokka.style.transition = 'transform 0.2s';
    floatingQuokka.style.transform = 'translate(0px, 10px)';
    
    setTimeout(() => {
      floatingQuokka.style.transform = 'translate(0px, 0px)';
      
      // 憿舐內��迤�����
      btn.style.visibility = 'visible';
      
      // ��3 �格��剜都
      getTransparentImage('images/quokka_cry.png', (src) => {
        floatingQuokka._img.src = src;
      });
      
      floatingQuokka.style.animation = 'quokkaLeave 4s forwards';
      
      setTimeout(() => {
        floatingQuokka.remove();
      }, 4000);
      
    }, 200);
  }, 1000);
  
  btn._floatingQuokka = null;
}

// �閧��啁�頛詨�獢�𥼚�滩��脣�
async function handleActionWithInput(event, gameId, action, suffix = '') {
  const btn = event.currentTarget || event.target;
  
  if (action === 'cancel' && btn) {
    if (btn.dataset.dodged !== 'true') {
      playMinusOneDodgeAnimation(btn);
      return; // Stop actual cancellation
    } else {
      // Second click
      playMinusOneCancelAnimation(btn);
    }
  } else if (action === 'register') {
    if (btn) playPlusOneAnimation(btn);
    // Reset all dodged buttons when +1 is clicked
    document.querySelectorAll('button.btn-danger').forEach(b => {
      if (b.dataset.dodged === 'true') {
        b.dataset.dodged = 'false';
        b.style.visibility = 'visible';
        if (b._floatingQuokka) {
          clearInterval(b._floatingQuokka._moveInterval);
          b._floatingQuokka.remove();
          b._floatingQuokka = null;
        }
      }
    });
  }

  const inputEl = document.getElementById(`name-input-${gameId}${suffix}`);
  const levelEl = document.getElementById(`level-input-${gameId}${suffix}`);
  const errorEl = document.getElementById(`error-msg-${gameId}${suffix}`);
  
  let name = currentUser.displayName;
  if (inputEl && inputEl.value.trim()) {
    name = inputEl.value.trim();
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
    errorEl.innerText = '�滨迂撌脤�銴�';
    errorEl.style.display = 'block';
    return;
  }
  
  if (action === 'cancel' && !exists) {
    errorEl.innerText = '�曆��唳迨�滨迂';
    errorEl.style.display = 'block';
    return;
  }
  
  // btn already declared at top of function �� just use it
  try {
    if (btn) {
      btn.disabled = true;
      btn.dataset.originalText = btn.innerText;
      btn.innerText = '...';
    }
    
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gid: currentGroupId,
        gameId: gameId,
        uid: currentUser.userId,
        name: name,
        operatorName: currentUser.displayName,
        level: level,
        action: action,
        clientSupportsLiffSendMessage: typeof liff !== 'undefined' && liff.isInClient()
      })
    });
    
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || '�滢�憭望�');
    }

    // �芸��冽偘�滚鱓璈笔�嚗𡁜���蝙�� liff.sendMessages
    if (data.triggerBumpMsg) {
      // �𡑒岫�� liff.sendMessages嚗���� LINE �𧢲����撱箇�讛汗�其葉�齿����
      if (typeof liff !== 'undefined' && liff.isInClient()) {
        try {
          await liff.sendMessages([{ type: 'text', text: data.triggerBumpMsg + '\n\n[蝟餌絞隞�䔄]' }]);
          console.log('�芸��潸店�𣂼�');
        } catch (e) {
          console.error('liff.sendMessages 憭望�:', e);
          fetch('/api/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              gid: currentGroupId, gameId: gameId, uid: currentUser.userId, name: name, operatorName: currentUser.displayName, action: 'logError', text: '隞�䔄憭望�: ' + e.message
            })
          }).catch(console.error);
        }
      }
    }
    
    // +1/-1 摰峕�敺䕘�皜�征�梁迂���摨西撓�交�
    if (inputEl) {
      inputEl.value = '';
    }
    if (levelEl) {
      levelEl.value = '';
    }
    
    await loadGamesLobby(true); // 雿輻鍂�𣈯��㰘�嚗䔶�頧匧�����脫迫皛曉�璇嗪�蝵�
  } catch (err) {
    console.error(err);
    errorEl.innerText = err.message;
    errorEl.style.display = 'block';
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = btn.dataset.originalText || btn.innerText;
    }
  }
}


async function handleTogglePaid(gameId, name) {
  try {
    appDiv.className = 'loading';
    statusMsg.style.display = 'block';
    statusMsg.innerText = '�湔鰵銝�...';
    
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
      alert(result.error || '�潛��航炊');
      await loadGamesLobby();
      return;
    }
    
    const idx = gamesList.findIndex(g => g.gameId === gameId);
    if (idx !== -1) gamesList[idx] = result.game;
    renderDetail(gameId, true);
    
  } catch (err) {
    console.error(err);
    alert('蝬脰楝�航炊嚗諹�蝔滚��滩岫');
    await loadGamesLobby();
  }
}

window.handleTogglePaid = handleTogglePaid;

window.handleReorder = async function(gameId, fromIdx, toIdx) {
  try {
    appDiv.className = 'loading';
    statusMsg.style.display = 'block';
    statusMsg.innerText = '�湔鰵���銝�...';
    
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
      alert(result.error || '�潛��航炊');
      await loadGamesLobby();
      return;
    }
    
    const idx = gamesList.findIndex(g => g.gameId === gameId);
    if (idx !== -1) gamesList[idx] = result.game;
    renderDetail(gameId, true);
  } catch (err) {
    console.error(err);
    alert('蝬脰楝�航炊嚗諹�蝔滚��滩岫');
    await loadGamesLobby();
  } finally {
    appDiv.className = '';
    const statusMsgEl = document.getElementById('status-msg');
    if (statusMsgEl) statusMsgEl.style.display = 'none';
  }
};

window.handleCustomPush = async function() {
  const text = prompt('隢贝撓�亥��冽偘����臬�摰對�\n(蝟餌絞��䌊�訫銁���銝𧢲䲮���憭批輒���)');
  if (!text) return;
  
  const pushToAll = confirm('隢见��臬炏閬������綫�准�滚��冽�蝞∠�����厩黎蝯��\n(�仿��𡝗�嚗���芣綫�剖��嗅�蝢斤�)');
  
  try {
    appDiv.className = 'loading';
    if (statusMsg) {
      statusMsg.style.display = 'block';
      statusMsg.innerText = '�冽偘�潮��葉...';
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
      alert(result.error || '�潮��仃��');
    } else {
      alert(`�冽偘�𣂼�嚗�歇�潮��秐 ${result.count} �讠黎蝯���);
    }
  } catch(e) {
    alert('蝬脰楝�航炊');
  } finally {
    appDiv.className = '';
    const statusMsg = document.getElementById('status-msg');
    if (statusMsg) statusMsg.style.display = 'none';
  }
};

window.handlePushList = async function(gameId) {
  if (!confirm('蝣箏�閬�銁蝢斤��扳綫�准�𣬚𤌍�滩底蝝啣��柴�滚�嚗髿n(�坔�������劐犖���摮烾����𠰴予摰支葉)')) return;
  
  try {
    appDiv.className = 'loading';
    const statusMsg = document.getElementById('status-msg');
    if (statusMsg) {
      statusMsg.style.display = 'block';
      statusMsg.innerText = '�冽偘�滚鱓銝�...';
    }
    
    // 憒���臭誑�芸��潸店嚗𣬚凒�乩誨�蹂蝙�刻����枂�峕𦻖樴滚��柴�齿�隞歹�璈笔膥鈭箏停��䌊�訫�閬���游��殷�
    if (typeof liff !== 'undefined' && liff.isInClient()) {
      try {
        await liff.sendMessages([{ type: 'text', text: `�仿��滚鱓\n\n[蝟餌絞隞�䔄]` }]);
        alert('�� �滚鱓�冽偘�𣂼�嚗�歇�芸��刻�憭拙恕�澆㙈璈笔膥鈭箝��');
        return;
      } catch (e) {
        console.error('�芸��潸店憭望�:', e);
        alert('�芸��潸店憭望�嚗�虾�賣𧊋����潸�甈𢠃�');
      }
    }
    
    // 隞乩��箄������璈笔�嚗�𥅾�⊥��芸��潸店嚗�
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gid: currentGroupId,
        gameId: gameId,
        uid: currentUser.userId,
        name: currentUser.displayName,
        action: 'pushList',
        clientSupportsLiffSendMessage: false
      })
    });
    
    const result = await res.json();
    if (!res.ok) {
      alert(result.error || '�潮��仃��');
      return;
    }
    
    if (result.partialError) {
      alert('璈笔膥鈭箸綫�剝���仃��: ' + result.errors.join(', '));
    } else {
      alert('�� �滚鱓�冽偘��誘撌脤��枂嚗���單����閮𦠜䰻�卝��');
    }
  } catch(e) {
    alert('蝬脰楝�航炊');
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
  span.innerText = code === '�桀�蝢斤�' ? `${groupName} (�桀�蝢斤�)` : `${groupName} (${code})`;
  span.style.flex = '1';
  
  lbl.appendChild(chk);
  lbl.appendChild(span);
  
  const delBtn = document.createElement('span');
  delBtn.innerText = '��';
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
  if (!code) return alert('隢贝撓�亦黎蝯�誨��');
  
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
      setTimeout(() => alert(data.error || '�曆��啗府蝢斤�'), 10);
    }
  } catch(e) {
    appDiv.className = '';
    setTimeout(() => alert('蝬脰楝�航炊'), 10);
  }
}

document.getElementById('btn-cg-add-group').onclick = () => handleAddGroupCode('cg-new-group-code', 'cg-target-gids-container');
if (document.getElementById('btn-eg-add-group')) {
  document.getElementById('btn-eg-add-group').onclick = () => handleAddGroupCode('eg-new-group-code', 'eg-target-gids-container');
}

// ================= Create Game UI & Templates =================
const createGameView = document.getElementById('create-game-view');
const cgTemplateSelect = document.getElementById('cg-template-select');

let currentGroupTemplates = {};

// === �鞱身�滚鱓�閙� UI ===
function getCgListString() {
  const rows = document.querySelectorAll('#cg-initial-list-container .cg-list-row');
  let lines = [];
  rows.forEach(row => {
     const n = row.querySelector('.cg-list-name').value.trim();
     const l = row.querySelector('.cg-list-level').value.trim();
     const p = row.querySelector('.cg-list-paid').checked;
     if (!n) return;
     let line = n;
     if (l) line += `(${l})`;
     if (p) line += `(撌脩像鞎�)`;
     lines.push(line);
  });
  return lines.join('\n');
}

function parseAndRenderCgList(text) {
  const container = document.getElementById('cg-initial-list-container');
  container.innerHTML = '';
  if (!text) return;
  const lines = text.split(/[\n���,]+/).map(n => n.trim()).filter(Boolean);
  lines.forEach(line => {
    let isPaid = false;
    let name = line;
    if (name.endsWith('$') || name.endsWith('嚗�') || name.endsWith('(撌脩像鞎�)') || name.endsWith('嚗�歇蝜唾祥嚗�')) {
        isPaid = true;
        name = name.replace(/[\$嚗�$/, '').replace(/\(撌脩像鞎蓋)$/, '').replace(/嚗�歇蝜唾祥嚗�$/, '');
    }
    let level = '';
    const match = name.match(/^(.*?)(?:[\(\[嚗È(.*?)[\)\]嚗处|-(.*?))$/);
    if (match) {
        name = match[1].trim();
        level = (match[2] || match[3]).trim();
    }
    addCgListRow(name, level, isPaid);
  });
}

function addCgListRow(name = '', level = '', isPaid = false) {
  const container = document.getElementById('cg-initial-list-container');
  const row = document.createElement('div');
  row.className = 'cg-list-row';
  row.style.display = 'flex';
  row.style.gap = '5px';
  row.style.marginBottom = '5px';
  row.style.alignItems = 'center';
  
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'cg-list-name';
  nameInput.placeholder = '憪枏�';
  nameInput.value = name;
  nameInput.style.flex = '2';
  nameInput.style.margin = '0';
  
  const levelInput = document.createElement('input');
  levelInput.type = 'text';
  levelInput.className = 'cg-list-level';
  levelInput.placeholder = '蝔见漲(�詨‵)';
  levelInput.value = level;
  levelInput.style.flex = '1';
  levelInput.style.margin = '0';
  
  const paidLabel = document.createElement('label');
  paidLabel.style.display = 'flex';
  paidLabel.style.alignItems = 'center';
  paidLabel.style.gap = '3px';
  paidLabel.style.marginBottom = '0';
  paidLabel.style.fontSize = '12px';
  paidLabel.style.whiteSpace = 'nowrap';
  
  const paidCheck = document.createElement('input');
  paidCheck.type = 'checkbox';
  paidCheck.className = 'cg-list-paid';
  paidCheck.checked = isPaid;
  paidCheck.style.margin = '0';
  
  paidLabel.appendChild(paidCheck);
  paidLabel.appendChild(document.createTextNode('蝜唾祥'));
  
  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'btn-danger btn-cg-remove-row';
  delBtn.style.padding = '5px 8px';
  delBtn.style.fontSize = '12px';
  delBtn.style.margin = '0';
  delBtn.innerText = '��';
  delBtn.onclick = () => row.remove();
  
  row.appendChild(nameInput);
  row.appendChild(levelInput);
  row.appendChild(paidLabel);
  row.appendChild(delBtn);
  
  container.appendChild(row);
}

document.getElementById('btn-cg-add-row').onclick = () => addCgListRow();

async function loadTemplates() {
  try {
    const res = await fetch(`/api/templates/${currentUser.userId}?_t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      currentGroupTemplates = data.templates || {};
    } else {
      currentGroupTemplates = {};
    }
  } catch (e) {
    console.error('頛匧�蝭�𧋦憭望�:', e);
    currentGroupTemplates = {};
  }
  
  cgTemplateSelect.innerHTML = '<option value="">-- �豢�蝢斤�蝭�𧋦 --</option>';
  for (const name in currentGroupTemplates) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.innerText = name;
    cgTemplateSelect.appendChild(opt);
  }
}

document.getElementById('btn-save-template').onclick = async () => {
  const text = getCgListString();
  if (!text) return alert('�滚鱓銝滚虾�箇征嚗�');
  const name = prompt('隢贝撓�交迨蝭�𧋦���蝔� (靘见�嚗𡁻�曹��箏���)嚗�');
  if (!name) return;
  
  appDiv.className = 'loading';
  try {
    const res = await fetch(`/api/templates/${currentUser.userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: currentUser.userId,
        action: 'save',
        name: name,
        content: text
      })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      await loadTemplates();
      cgTemplateSelect.value = name;
      alert('�脣��𣂼�銝𥪜歇�峕郊�� Git嚗�');
    } else {
      alert(data.error || '�脣�憭望�');
    }
  } catch (e) {
    alert('蝬脰楝�航炊嚗𣬚�瘜訫�摮䁅秐隡箸���');
  } finally {
    appDiv.className = '';
  }
};

document.getElementById('btn-delete-template').onclick = async () => {
  const name = cgTemplateSelect.value;
  if (!name) return alert('隢见��豢�銝��讠��穿�');
  if (!confirm(`蝣箏�閬�⏛�斤��研��${name}�滚�嚗鬮)) return;
  
  appDiv.className = 'loading';
  try {
    const res = await fetch(`/api/templates/${currentUser.userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: currentUser.userId,
        action: 'delete',
        name: name
      })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      await loadTemplates();
      parseAndRenderCgList('');
      alert('�芷膄�𣂼�銝𥪜歇�峕郊�� Git嚗�');
    } else {
      alert(data.error || '�芷膄憭望�');
    }
  } catch (e) {
    alert('蝬脰楝�航炊嚗𣬚�瘜訫⏛��');
  } finally {
    appDiv.className = '';
  }
};

cgTemplateSelect.onchange = () => {
  const name = cgTemplateSelect.value;
  if (!name) {
    parseAndRenderCgList('');
    return;
  }
  if (currentGroupTemplates[name]) {
    parseAndRenderCgList(currentGroupTemplates[name]);
  }
};

function formatLocalGameDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const days = ['��', '銝�', '鈭�', '銝�', '��', '鈭�', '��'];
  return `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`;
}

function showCreateGameForm() {
  lobbyView.classList.add('hidden');
  detailView.classList.add('hidden');
  createGameView.classList.remove('hidden');
  
  // �嘥��𣇉��𤾸予��𠯫��
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tzOffset = tomorrow.getTimezoneOffset() * 60000;
  const localTomorrow = new Date(tomorrow - tzOffset).toISOString().split('T')[0];
  document.getElementById('cg-date').value = localTomorrow;
  document.getElementById('cg-time-start').value = '18:00';
  document.getElementById('cg-time-end').value = '20:00';
  
  // 憛怠��格�蝢斤��詨鱓
  const cgTargetGidsContainer = document.getElementById('cg-target-gids-container');
  cgTargetGidsContainer.innerHTML = '';
  if (globalManagedGroups.length > 0) {
    globalManagedGroups.forEach(g => {
      createTargetGroupCheckbox(cgTargetGidsContainer, g.gid, g.code, g.groupName, g.gid === currentGroupId);
    });
  } else {
    cgTargetGidsContainer.innerHTML = '<p>�⊥��硋��函�蝞∠�蝢斤�</p>';
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
  parseAndRenderCgList('');
  addCgListRow(); // Default one empty row
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
  const targetGids = Array.from(document.querySelectorAll('#cg-target-gids-container input[name="targetGids"]:checked')).map(el => el.value);
  
  if (!rawDateStr || !timeStr || !locStr || targetGids.length === 0) {
    alert('�𣬚𤌍璅嗵黎蝯��溻���峕𠯫�麄�溻���峕��瓐�溻����𧑐暺𠺶�滨�敹�‵甈��嚗�');
    return;
  }
  
  try {
    appDiv.className = 'loading';
    statusMsg.style.display = 'block';
    statusMsg.innerText = '�湔活撱箇�銝�...';
    
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
        initialListStr: getCgListString()
      })
    });
    
    const result = await res.json();
    if (!res.ok) {
      alert(result.error || '撱箇�憭望�');
    } else {
      // �见��𣂼�嚗諹䌊�閙綫�亙歇�𣈯�嚗諹�蝞∠���銁閰喟敦����閙��峕綫�剖��柴�滢誑蝭��� LINE 憿滚漲
      let alertMsg = '�� �见��𣂼�嚗�';
      if (result.pushErrors && result.pushErrors.length > 0) {
        alertMsg += '\n\n�𩤃� 璈笔膥鈭箸綫�剖仃��:\n' + result.pushErrors.join('\n');
      } else {
        alertMsg += '\n\n�働 憒���𡁶䰻蝢斤�嚗諹��脣��湔活閰喟敦����峕綫�剖��柴�溻��';
      }
      alert(alertMsg);
      
      createGameView.classList.add('hidden');
      await loadGamesLobby();
    }
  } catch(e) {
    alert('蝬脰楝�航炊');
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
    egTargetGidsContainer.innerHTML = '<p>�⊥��硋��函�蝞∠�蝢斤�</p>';
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
  
  // �閧��桀�瘝埝��函恣��黎蝯���脣��滚鱓銝哨�雿�歇摮睃銁�� game.targetGids ��黎蝯�
  gameTargetGids.forEach(tgid => {
    if (!globalManagedGroups.some(g => g.gid === tgid) && !savedEg.some(g => g.gid === tgid)) {
       createTargetGroupCheckbox(egTargetGidsContainer, tgid, '�芰䰻', '撌脤���黎蝯�', true);
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
  document.getElementById('eg-ended').checked = !!game.isManualEnded;
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
    alert('�𣬚𤌍璅嗵黎蝯��溻���峕𠯫�麄�溻���峕��瓐�溻����𧑐暺𠺶�滨�敹�‵甈��嚗�');
    return;
  }
  
  try {
    appDiv.className = 'loading';
    statusMsg.style.display = 'block';
    statusMsg.innerText = '�脣�霈𦠜凒銝�...';
    
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
        isManualEnded: document.getElementById('eg-ended').checked,
        note: document.getElementById('eg-note').value.trim()
      })
    });
    
    const result = await res.json();
    if (!res.ok) {
      alert(result.error || '�脣�憭望�');
    } else {
      alert('�脣��𣂼�嚗�');
      editGameView.classList.add('hidden');
      await loadGamesLobby();
      if (currentGameDetailId === gameId) {
         renderDetail(gameId, true);
      }
    }
  } catch(e) {
    alert('蝬脰楝�航炊');
  } finally {
    appDiv.className = '';
    statusMsg.style.display = 'none';
  }
};


document.addEventListener('click', (e) => { if (!e.target.closest('.btn-danger')) { document.querySelectorAll('.btn-danger').forEach(b => { if (b.dataset.dodged === 'true') { b.dataset.dodged = 'false'; b.style.transition = 'transform 1s ease'; b.style.transform = 'translate(0px, 0px)'; } }); } });

// 憭批輒����讛摩
if (btnLobbyStats) {
  btnLobbyStats.addEventListener('click', async () => {
    appDiv.className = 'loading';
    statusMsg.innerText = '霈��硋��鞱��嗘葉...';
    statusMsg.style.display = 'block';
    
    try {
      const res = await fetch(`/api/admin/all_stats?uid=${currentUser.userId}`);
      if (!res.ok) throw new Error('�⊥��硋����鞈��');
      const data = await res.json();
      
      statsGroupsContainer.innerHTML = '';
      
      if (data.allStats && data.allStats.length > 0) {
        let totalViews = data.totalViews || 0;
        let totalUniques = data.totalUniqueCount || 0;
        
        const summaryCard = document.createElement('div');
        summaryCard.className = 'game-card';
        summaryCard.style.marginBottom = '20px';
        summaryCard.style.border = '2px solid #FF9800';
        summaryCard.innerHTML = `
          <h3 style="margin:0 0 10px 0; color:#FF9800; text-align:center;">�� ���厩黎蝯�蜇蝯�</h3>
          <div class="detail-stats" style="margin-top:0;">
            <div class="stat-box" style="flex:1;">
              <span class="stat-label">蝮質��𧢲活��</span>
              <span class="stat-value">${totalViews}</span>
            </div>
            <div class="stat-box" style="flex:1;">
              <span class="stat-label">蝮賭��滩�閫��� (鈭箸彍)</span>
              <span class="stat-value">${totalUniques}</span>
            </div>
          </div>
        `;
        statsGroupsContainer.appendChild(summaryCard);

        data.allStats.forEach(stat => {
          const card = document.createElement('div');
          card.className = 'game-card'; // Reuse game-card style
          card.style.marginBottom = '15px';
          
          // Card Header
          const header = document.createElement('div');
          header.style.borderBottom = '1px solid #eee';
          header.style.paddingBottom = '10px';
          header.style.marginBottom = '10px';
          
          const title = document.createElement('h3');
          title.style.margin = '0';
          title.style.color = '#2c3e50';
          title.innerText = stat.groupName || stat.gid;
          
          header.appendChild(title);
          card.appendChild(header);
          
          // Stats Row
          const statsRow = document.createElement('div');
          statsRow.className = 'detail-stats';
          statsRow.style.marginTop = '0';
          statsRow.style.marginBottom = '10px';
          
          const viewsBox = document.createElement('div');
          viewsBox.className = 'stat-box';
          viewsBox.style.flex = '1';
          viewsBox.innerHTML = `<span class="stat-label">蝮質��𧢲活��</span><span class="stat-value">${stat.viewCount}</span>`;
          
          const uniqueBox = document.createElement('div');
          uniqueBox.className = 'stat-box';
          uniqueBox.style.flex = '1';
          uniqueBox.innerHTML = `<span class="stat-label">銝漤�銴����</span><span class="stat-value">${stat.uniqueCount}</span>`;
          
          statsRow.appendChild(viewsBox);
          statsRow.appendChild(uniqueBox);
          card.appendChild(statsRow);
          
          // Toggle Logs Button
          const toggleLogsBtn = document.createElement('button');
          toggleLogsBtn.className = 'btn-secondary';
          toggleLogsBtn.style.width = '100%';
          toggleLogsBtn.style.fontSize = '12px';
          toggleLogsBtn.style.padding = '6px';
          toggleLogsBtn.innerText = '撅閖�閮芸恥蝝��� ��';
          
          // Logs Container
          const logsContainer = document.createElement('div');
          logsContainer.style.display = 'none';
          logsContainer.style.marginTop = '10px';
          logsContainer.style.maxHeight = '200px';
          logsContainer.style.overflowY = 'auto';
          logsContainer.style.borderTop = '1px solid #eee';
          logsContainer.style.paddingTop = '10px';
          
          if (stat.recentVisits && stat.recentVisits.length > 0) {
            stat.recentVisits.forEach(log => {
              const d = new Date(log.time);
              const timeStr = `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
              
              const item = document.createElement('div');
              item.style.display = 'flex';
              item.style.alignItems = 'center';
              item.style.padding = '6px 0';
              item.style.borderBottom = '1px solid #f9f9f9';
              
              const timeDiv = document.createElement('div');
              timeDiv.style.color = '#888';
              timeDiv.style.fontSize = '11px';
              timeDiv.style.marginRight = '10px';
              timeDiv.style.width = '65px';
              timeDiv.innerText = timeStr;
              item.appendChild(timeDiv);

              if (log.pictureUrl && log.pictureUrl.startsWith('https://')) {
                const img = document.createElement('img');
                img.src = log.pictureUrl;
                img.style.width = '20px';
                img.style.height = '20px';
                img.style.borderRadius = '50%';
                img.style.marginRight = '8px';
                item.appendChild(img);
              } else {
                const fallbackImg = document.createElement('div');
                fallbackImg.style.width = '20px';
                fallbackImg.style.height = '20px';
                fallbackImg.style.borderRadius = '50%';
                fallbackImg.style.background = '#ccc';
                fallbackImg.style.marginRight = '8px';
                fallbackImg.style.display = 'flex';
                fallbackImg.style.alignItems = 'center';
                fallbackImg.style.justifyContent = 'center';
                fallbackImg.style.fontSize = '10px';
                fallbackImg.style.color = '#fff';
                fallbackImg.innerText = '�𪈠';
                item.appendChild(fallbackImg);
              }
              
              const nameDiv = document.createElement('div');
              nameDiv.style.fontWeight = '500';
              nameDiv.style.fontSize = '13px';
              nameDiv.innerText = log.displayName || '�芰䰻雿輻鍂��';
              item.appendChild(nameDiv);
              
              logsContainer.appendChild(item);
            });
          } else {
            logsContainer.innerHTML = '<div style="color:#999; text-align:center; padding:10px; font-size:12px;">撠𡁶�蝝���</div>';
          }
          
          toggleLogsBtn.onclick = () => {
            if (logsContainer.style.display === 'none') {
              logsContainer.style.display = 'block';
              toggleLogsBtn.innerText = '�嗅�閮芸恥蝝��� ��';
            } else {
              logsContainer.style.display = 'none';
              toggleLogsBtn.innerText = '撅閖�閮芸恥蝝��� ��';
            }
          };
          
          card.appendChild(toggleLogsBtn);
          card.appendChild(logsContainer);
          statsGroupsContainer.appendChild(card);
        });
      } else {
        statsGroupsContainer.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">�桀�瘝埝�隞颱�蝢斤�����鞱��踺��</div>';
      }
      
      lobbyView.classList.add('hidden');
      statsView.classList.remove('hidden');
    } catch (e) {
      alert(e.message);
    } finally {
      appDiv.className = '';
      statusMsg.style.display = 'none';
    }
  });
}

if (btnBackStats) {
  btnBackStats.addEventListener('click', () => {
    statsView.classList.add('hidden');
    lobbyView.classList.remove('hidden');
  });
}

if (btnPartyAdmin) {
  btnPartyAdmin.addEventListener('click', () => {
    lobbyView.classList.add('hidden');
    detailView.classList.add('hidden');
    if (easterEggSettingsView) easterEggSettingsView.classList.add('hidden');
    if (statsView) statsView.classList.add('hidden');
    if (systemLogsView) systemLogsView.classList.add('hidden');
    
    partyAdminView.classList.remove('hidden');
    initSocket();
  });
}

if (btnBackParty) {
  btnBackParty.addEventListener('click', () => {
    partyAdminView.classList.add('hidden');
    renderLobby();
  });
}

if (btnSystemLogs) {
  btnSystemLogs.addEventListener('click', async () => {
    appDiv.className = 'loading';
    statusMsg.innerText = '霈��碶葉...';
    try {
      const res = await fetch('/api/systemLogs?uid=' + currentUser.userId);
      if (!res.ok) throw new Error('�⊥�霈��𣇉頂蝯尉OG');
      const logs = await res.json();
      
      systemLogsContainer.innerHTML = '';
      if (!logs || logs.length === 0) {
        systemLogsContainer.innerHTML = '<p>�桀�瘝埝�蝟餌絞�航炊蝝���</p>';
      } else {
        logs.forEach(log => {
          const div = document.createElement('div');
          div.style.borderBottom = '1px solid #ddd';
          div.style.padding = '8px 0';
          div.innerHTML = `<div style="font-size:12px; color:#888;">${log.time}</div>
          <div style="font-weight:bold;">[${log.gameTitle || '�芰䰻�湔活'}] ${log.operator}</div>
          <div style="color:red; margin-top:4px;">${log.errorMsg}</div>`;
          systemLogsContainer.appendChild(div);
        });
      }
      
      document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
      systemLogsView.classList.remove('hidden');
    } catch(e) {
      alert(e.message);
    } finally {
      appDiv.className = '';
    }
  });
}

if (btnBackLogs) {
  btnBackLogs.addEventListener('click', () => {
    document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
    document.getElementById('lobby-view').classList.remove('hidden');
  });
}

// --- Easter Egg Interaction ---
let piggyMoveInterval = null;
let piggyOverlay = null;
let piggyStartTime = 0;

function createPiggyOverlay() {
  if (piggyOverlay) return;
  piggyOverlay = document.createElement('div');
  piggyOverlay.style.position = 'fixed';
  piggyOverlay.style.top = '0';
  piggyOverlay.style.left = '0';
  piggyOverlay.style.width = '100vw';
  piggyOverlay.style.height = '100vh';
  piggyOverlay.style.zIndex = '9998';
  piggyOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.15)'; // slight dimming to show focus mode
  document.body.appendChild(piggyOverlay);
}

function removePiggyOverlay() {
  if (piggyOverlay) {
    piggyOverlay.remove();
    piggyOverlay = null;
  }
}

function movePiggyRandomly() {
  // Speed is much faster (duration multiplied by 0.56)
  const duration = Math.max(0.2, (piggyBaseSpeed - (piggyClicks * 0.6)) * 0.56);
  piggyIcon.style.transition = `left ${duration}s linear, top ${duration}s linear`;
  
  const maxX = window.innerWidth - 60;
  const maxY = window.innerHeight - 60;
  const nextX = Math.max(0, Math.random() * maxX);
  const nextY = Math.max(0, Math.random() * maxY);
  
  const currentLeft = parseFloat(piggyIcon.style.left) || 0;
  if (nextX < currentLeft) {
    piggyIcon.style.setProperty('--face-dir', '1');
  } else {
    piggyIcon.style.setProperty('--face-dir', '-1');
  }
  
  piggyIcon.style.left = nextX + 'px';
  piggyIcon.style.top = nextY + 'px';
}

function renderLeaderboard(leaderboardData, quota) {
  const listEl = document.getElementById('ee-leaderboard-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  
  leaderboardData.forEach((user, index) => {
    const rank = index + 1;
    let rankHtml = `<div class="ee-leaderboard-rank">${rank}</div>`;
    
    // Add crown for those within the quota
    let crownHtml = '';
    if (rank <= quota) {
      if (rank === 1) crownHtml = '<span class="ee-crown">��</span>';
      else if (rank === 2) crownHtml = '<span class="ee-crown">��</span>';
      else if (rank === 3) crownHtml = '<span class="ee-crown">��</span>';
      else crownHtml = '<span class="ee-crown">��</span>';
    }

    const timeInSeconds = (!user.timeTaken || user.timeTaken === Infinity) 
      ? '-- s' 
      : (user.timeTaken / 1000).toFixed(2) + ' s';
      
    const isMe = user.uid === currentUser.userId;
    const nameColor = isMe ? '#E91E63' : '#333';
    
    const li = document.createElement('li');
    li.className = `ee-leaderboard-item rank-${rank}`;
    li.innerHTML = `
      ${rankHtml}
      <div class="ee-leaderboard-name" style="color: ${nameColor};">${crownHtml}${user.name} ${isMe ? '(雿�)' : ''}</div>
      <div class="ee-leaderboard-time">${timeInSeconds}</div>
    `;
    listEl.appendChild(li);
  });
}

// --- Admin Easter Egg View ---
if (btnEasterEgg) {
  btnEasterEgg.addEventListener('click', async () => {
    statusMsg.innerText = '頛匧�閮剖�銝�...';
    statusMsg.style.display = 'block';
    appDiv.className = 'loading';
    try {
      const res = await fetch(`/api/admin/easter_egg?uid=${currentUser.userId}`);
      if (res.ok) {
        const data = await res.json();
        eeEnabledCheckbox.checked = data.enabled;
        eeMessageInput.value = data.message;
        eeQuotaInput.value = data.quota;
        
        if (data.activeGame) {
          eeActiveGameSelect.value = data.activeGame;
        }
        
        const isBulletHell = eeActiveGameSelect.value === 'bullet_hell';
        const listData = isBulletHell ? (data.bulletHellLeaderboard || []) : (data.winners || []);
        
        eeWinnersCount.innerText = listData.length;
        eeWinnersList.innerHTML = '';
        if (listData.length > 0) {
          listData.forEach((w, index) => {
            const li = document.createElement('li');
            if (isBulletHell) {
              li.innerHTML = `<strong>${index+1}.</strong> ${w.name} - ${w.survivalTime} 蝘嚒;
            } else {
              li.innerText = w.name || 'Unknown';
            }
            eeWinnersList.appendChild(li);
          });
        }
        
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        easterEggSettingsView.classList.remove('hidden');
        appDiv.className = '';
        statusMsg.style.display = 'none';
      } else {
        throw new Error('Load failed');
      }
    } catch(e) {
      alert('�⊥�頛匧�敶抵�閮剖�');
      statusMsg.style.display = 'none';
      appDiv.className = '';
    }
  });

  // Removed old duplicate dropdown listener

  if (btnOpenRoom) {
    btnOpenRoom.addEventListener('click', async () => {
      const type = roomGameType.value;
      
      // If Lottery, we pre-fill the pool from our local admin pool
      if (type === 'lottery' && lotteryAdminPool.length > 0) {
        // We can just open the room first, then hit setup if needed. 
        // But let's just let the server open it, then we hit setup.
      }
      
      try {
        const res = await fetch('/api/admin/room/open', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: currentUser.userId, gameType: type })
        });
        const data = await res.json();
        if (!data.success) alert(data.error);
        else {
          if (type === 'lottery' && lotteryAdminPool.length > 0) {
            // Also hit setup to push pool
            await fetch('/api/admin/lottery/setup', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ uid: currentUser.userId, pool: lotteryAdminPool })
            });
          }
          alert('憭批輒撌脤����');
          hasEnteredParty = true;
          updateUnifiedRoomUI();
        }
      } catch(e) { console.error(e); }
    });
  }
  
  if (btnCloseRoom) {
    btnCloseRoom.addEventListener('click', async () => {
      if (!confirm('蝣箏�閬���㗇��㮖蒂餈𥪜��𠬍�')) return;
      if (globalIsSuperAdmin) {
        try {
          await fetch('/api/admin/room/close', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: currentUser.userId })
          });
        } catch(e) { console.error(e); }
      } else {
        unifiedRoomOverlay.classList.add('hidden');
      }
    });
  }

  // --- Admin Panel Drag & Drop ---
  if (roomAdminHeader) {
    let isDraggingAdmin = false;
    let adminDragStartX, adminDragStartY;
    let adminStartLeft, adminStartTop;

    roomAdminHeader.addEventListener('mousedown', (e) => {
      isDraggingAdmin = true;
      adminDragStartX = e.clientX;
      adminDragStartY = e.clientY;
      const rect = roomAdminPanel.getBoundingClientRect();
      adminStartLeft = rect.left;
      adminStartTop = rect.top;
      roomAdminPanel.style.right = 'auto'; // Switch to left/top positioning
      roomAdminPanel.style.left = adminStartLeft + 'px';
      roomAdminPanel.style.top = adminStartTop + 'px';
      roomAdminPanel.style.bottom = 'auto';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDraggingAdmin) return;
      const dx = e.clientX - adminDragStartX;
      const dy = e.clientY - adminDragStartY;
      roomAdminPanel.style.left = (adminStartLeft + dx) + 'px';
      roomAdminPanel.style.top = (adminStartTop + dy) + 'px';
    });

    window.addEventListener('mouseup', () => {
      isDraggingAdmin = false;
    });
    
    // Touch support for dragging
    roomAdminHeader.addEventListener('touchstart', (e) => {
      isDraggingAdmin = true;
      const touch = e.touches[0];
      adminDragStartX = touch.clientX;
      adminDragStartY = touch.clientY;
      const rect = roomAdminPanel.getBoundingClientRect();
      adminStartLeft = rect.left;
      adminStartTop = rect.top;
      roomAdminPanel.style.right = 'auto';
      roomAdminPanel.style.left = adminStartLeft + 'px';
      roomAdminPanel.style.top = adminStartTop + 'px';
    });

    window.addEventListener('touchmove', (e) => {
      if (!isDraggingAdmin) return;
      const touch = e.touches[0];
      const dx = touch.clientX - adminDragStartX;
      const dy = touch.clientY - adminDragStartY;
      roomAdminPanel.style.left = (adminStartLeft + dx) + 'px';
      roomAdminPanel.style.top = (adminStartTop + dy) + 'px';
    });

    window.addEventListener('touchend', () => {
      isDraggingAdmin = false;
    });
  }

  if (btnToggleAdminPanel) {
    btnToggleAdminPanel.addEventListener('click', () => {
      roomAdminPanel.classList.toggle('hidden');
    });
  }

  if (btnMinimizeAdminPanel) {
    btnMinimizeAdminPanel.addEventListener('click', () => {
      const body = document.getElementById('room-admin-body');
      if (body.style.display === 'none') {
        body.style.display = 'flex';
        btnMinimizeAdminPanel.innerText = '��';
      } else {
        body.style.display = 'none';
        btnMinimizeAdminPanel.innerText = '��';
      }
    });
  }

  const btnBhAdminPlay = document.getElementById('btn-bh-admin-play');
  const btnBhAdminStop = document.getElementById('btn-bh-admin-stop');
  if (btnBhAdminPlay) {
    btnBhAdminPlay.addEventListener('click', async () => {
      // First update win condition
      await fetch('/api/admin/party/start', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ 
          uid: currentUser.userId, 
          winCondition: { 
            type: partyWinType ? partyWinType.value : 'time', 
            value: partyWinValue ? (parseInt(partyWinValue.value, 10)||15) : 15 
          } 
        })
      });
      // Then start play
      await fetch('/api/admin/party/play', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ uid: currentUser.userId })
      });
    });
  }
  if (btnBhAdminStop) {
    btnBhAdminStop.addEventListener('click', async () => {
      await fetch('/api/admin/room/close', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ uid: currentUser.userId })
      });
    });
  }

  btnBackEasterEgg.addEventListener('click', () => renderLobby());
}

if (btnSaveEasterEgg) {
  btnSaveEasterEgg.addEventListener('click', async () => {
    btnSaveEasterEgg.disabled = true;
    try {
      const res = await fetch('/api/admin/easter_egg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: currentUser.userId,
          settings: {
            enabled: eeEnabledCheckbox.checked,
            message: eeMessageInput.value,
            quota: parseInt(eeQuotaInput.value, 10) || 3,
            activeGame: eeActiveGameSelect.value
          }
        })
      });
      if (res.ok) {
        alert('�脣��𣂼�');
        easterEggEnabled = eeEnabledCheckbox.checked;
        easterEggActiveGame = eeActiveGameSelect.value;
        renderLobby();
      }
    } catch(e) { alert('�脣�憭望�'); }
    btnSaveEasterEgg.disabled = false;
  });
}

if (btnClearWinners) {
  btnClearWinners.addEventListener('click', async () => {
    if (!confirm('蝣箏�閬���文��殷�')) return;
    try {
      const isBulletHell = eeActiveGameSelect.value === 'bullet_hell';
      const settingsPayload = isBulletHell ? { bulletHellLeaderboard: [] } : { winners: [] };
      
      const res = await fetch('/api/admin/easter_egg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: currentUser.userId,
          settings: settingsPayload
        })
      });
      if (res.ok) {
        eeWinnersCount.innerText = 0;
        eeWinnersList.innerHTML = '';
        alert('撌脫��文���');
      }
    } catch(e) { alert('皜�膄憭望�'); }
  });
}

if (piggyIcon) {
  piggyIcon.style.cursor = 'pointer'; // Ensure it looks clickable
  piggyIcon.addEventListener('click', async (e) => {
    if (!easterEggEnabled) {
      if (!piggyRunning) {
        piggyRunning = true;
        document.body.appendChild(piggyIcon);
        piggyIcon.classList.add('piggy-running');
        const rect = piggyIcon.getBoundingClientRect();
        piggyIcon.style.left = rect.left + 'px';
        piggyIcon.style.top = rect.top + 'px';
        
        movePiggyRandomly();
        const newIntervalMs = Math.max(200, piggyBaseSpeed * 0.56 * 1000);
        piggyMoveInterval = setInterval(movePiggyRandomly, newIntervalMs);
      } else {
        clearInterval(piggyMoveInterval);
        movePiggyRandomly();
        const newIntervalMs = Math.max(200, piggyBaseSpeed * 0.56 * 1000);
        piggyMoveInterval = setInterval(movePiggyRandomly, newIntervalMs);
      }
      return;
    }
    
    if (easterEggActiveGame === 'bullet_hell') {
      startBulletHell();
      return;
    }
    
    if (easterEggActiveGame === 'party_mode') {
      joinPartyLobby();
      if (partyJoinContainer) partyJoinContainer.classList.add('hidden');
      return;
    }
    
    piggyClicks++;
    
    if (!piggyRunning) {
      piggyRunning = true;
      piggyStartTime = Date.now(); // Start timer
      createPiggyOverlay(); // Block other clicks
      
      // Move to body to escape stacking context of .view so z-index works
      document.body.appendChild(piggyIcon);
      
      piggyIcon.classList.add('piggy-running');
      const rect = piggyIcon.getBoundingClientRect();
      piggyIcon.style.left = rect.left + 'px';
      piggyIcon.style.top = rect.top + 'px';
      
      movePiggyRandomly();
      const newIntervalMs = Math.max(200, (piggyBaseSpeed - (piggyClicks * 0.6)) * 0.56 * 1000);
      piggyMoveInterval = setInterval(movePiggyRandomly, newIntervalMs);
    } else {
      clearInterval(piggyMoveInterval);
      movePiggyRandomly();
      const newIntervalMs = Math.max(200, (piggyBaseSpeed - (piggyClicks * 0.6)) * 0.56 * 1000);
      piggyMoveInterval = setInterval(movePiggyRandomly, newIntervalMs);
    }
    
    if (piggyClicks >= 5) {
      const timeTaken = Date.now() - piggyStartTime; // Calculate time taken
      try {
        const res = await fetch('/api/easter_egg/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: currentUser.userId, name: currentUser.displayName, timeTaken })
        });
        const data = await res.json();
        if (data.success) {
          triggerConfetti();
          const easterEggMsg = document.getElementById('easter-egg-msg');
          if (easterEggMsg) easterEggMsg.innerText = data.message;
          
          if (data.leaderboard && data.quota) {
            renderLeaderboard(data.leaderboard, data.quota);
          }
          
          const easterEggModal = document.getElementById('easter-egg-modal');
          if (easterEggModal) easterEggModal.classList.remove('hidden');
        }
      } catch(e) { console.error(e); }
      
      resetPiggy();
      return;
    }
  });
}

function resetPiggy() {
  removePiggyOverlay(); // Remove block when done
  if (piggyMoveInterval) clearInterval(piggyMoveInterval);
  piggyMoveInterval = null;
  piggyRunning = false;
  piggyClicks = 0;
  piggyIcon.classList.remove('piggy-running');
  piggyIcon.style.left = '';
  piggyIcon.style.top = '';
  piggyIcon.style.setProperty('--face-dir', '1');
  piggyIcon.style.transition = '';
  
  // Move back to header
  const header = document.querySelector('.lobby-header');
  if (header) {
    header.insertBefore(piggyIcon, header.firstChild);
  }
}

function triggerConfetti() {
  confettiContainer.innerHTML = '';
  confettiContainer.classList.remove('hidden');
  const colors = ['#f00', '#0f0', '#00f', '#ff0', '#f0f', '#0ff'];
  for (let i = 0; i < 60; i++) {
    const conf = document.createElement('div');
    conf.className = 'confetti';
    conf.style.left = Math.random() * 100 + 'vw';
    conf.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    conf.style.animationDelay = Math.random() * 1.5 + 's';
    conf.style.animationDuration = Math.random() * 2 + 2 + 's';
    confettiContainer.appendChild(conf);
  }
  setTimeout(() => {
    confettiContainer.classList.add('hidden');
    confettiContainer.innerHTML = '';
  }, 5000);
}

// --- Lottery Admin Logic ---
function updateLotteryAdminPoolUI() {
  lotteryPoolCount.innerText = lotteryAdminPool.length;
  lotteryPoolList.innerHTML = '';
  lotteryAdminPool.forEach((name, idx) => {
    const li = document.createElement('li');
    li.style.display = 'flex';
    li.style.justifyContent = 'space-between';
    li.style.borderBottom = '1px solid #eee';
    li.style.padding = '2px 0';
    
    const span = document.createElement('span');
    span.innerText = `${idx + 1}. ${name}`;
    
    const delBtn = document.createElement('button');
    delBtn.innerText = '��';
    delBtn.style.background = 'none';
    delBtn.style.border = 'none';
    delBtn.style.cursor = 'pointer';
    delBtn.onclick = () => {
      lotteryAdminPool.splice(idx, 1);
      updateLotteryAdminPoolUI();
    };
    
    li.appendChild(span);
    li.appendChild(delBtn);
    lotteryPoolList.appendChild(li);
  });
}

if (btnImportLobbyUsers) {
  btnImportLobbyUsers.addEventListener('click', () => {
    if (partyLobbyNames && partyLobbyNames.length > 0) {
      partyLobbyNames.forEach(name => {
        if (!lotteryAdminPool.includes(name)) lotteryAdminPool.push(name);
      });
      updateLotteryAdminPoolUI();
    } else {
      alert('憭批輒�抒𤌍�齿��劐犖�∪虾隞亙𥲤�伐�(隢讠Ⅱ摰𡁏��见�瘣曉�憭批輒)');
    }
  });
}

if (btnAddManualName) {
  btnAddManualName.addEventListener('click', () => {
    const val = lotteryManualName.value.trim();
    if (!val) return;
    const names = val.split(/[,嚗䀉/).map(n => n.trim()).filter(Boolean);
    names.forEach(n => {
      if (!lotteryAdminPool.includes(n)) lotteryAdminPool.push(n);
    });
    lotteryManualName.value = '';
    updateLotteryAdminPoolUI();
  });
}

// btnGenerateLottery has been removed. Room open logic handles it.

if (btnResetLottery) {
  btnResetLottery.addEventListener('click', async () => {
    if (!confirm('蝣箏�閬�撥�園�蝵桐蒂�𣈯��輸��𠬍�')) return;
    try {
      await fetch('/api/admin/room/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: currentUser.userId })
      });
    } catch(e) { console.error(e); }
  });
}

if (btnAssignDraw) {
  btnAssignDraw.addEventListener('click', async () => {
    const assigneeUid = lotteryAssigneeSelect.value;
    const count = parseInt(lotteryDrawCount.value) || 1;
    
    if (!assigneeUid) {
      alert('隢钅����雿滚銁蝺帋犖�∩��賜惜');
      return;
    }
    
    try {
      const res = await fetch('/api/admin/lottery/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: currentUser.userId, assigneeUid, drawCount: count })
      });
      const data = await res.json();
      if (!data.success) alert(data.error);
      else alert('撌脫����瘣橘�');
    } catch(e) { console.error(e); }
  });
}

// Update assignee select options whenever party state changes
// Because socket may not be initialized yet when this script runs, we must listen globally
// or move this into initSocket(). We will just define a global function to be called in initSocket.
function bindLotteryAdminSocket(s) {
  s.on('party_state', (state) => {
    if (state.players && lotteryAssigneeSelect) {
      const currentSelected = lotteryAssigneeSelect.value;
      lotteryAssigneeSelect.innerHTML = '<option value="">-- 隢钅���銁蝺帋犖�� --</option>';
      
      Object.values(state.players).forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.uid;
        opt.innerText = p.name;
        lotteryAssigneeSelect.appendChild(opt);
      });
      lotteryAssigneeSelect.value = currentSelected;
    }
  });
}

if (btnJoinRoom) {
  btnJoinRoom.addEventListener('click', () => {
    if (window.globalRoomState && window.globalRoomState.activeGame === 'survival') {
      const modal = document.getElementById('character-select-modal');
      const grid = document.getElementById('character-grid');
      const btnConfirm = document.getElementById('btn-confirm-character');
      const btnCancel = document.getElementById('btn-cancel-character');
      
      if (modal && grid) {
        // Hide join button while modal is open
        btnJoinRoom.classList.add('hidden');
        
        grid.innerHTML = '';
        const chars = ['�䊹', '�濶', '�躼', '�鑛', '��', '�𣸮', '�䧟', '�鍳', '��', '�𢙺'];
        chars.forEach(c => {
          const btn = document.createElement('button');
          btn.className = 'char-btn';
          btn.innerText = c;
          btn.onclick = () => {
            document.querySelectorAll('.char-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedCharacterIcon = c;
            btnConfirm.disabled = false;
          };
          grid.appendChild(btn);
        });
        
        btnConfirm.onclick = () => {
          modal.classList.add('hidden');
          joinPartyLobby();
        };
        
        btnCancel.onclick = () => {
          modal.classList.add('hidden');
          // Show join button again if cancelled
          btnJoinRoom.classList.remove('hidden');
        };
        
        modal.classList.remove('hidden');
      } else {
        // Fallback
        joinPartyLobby();
        btnJoinRoom.classList.add('hidden');
      }
    }
  });
}

// === Room Participants Panel Logic ===
const participantsPanel = document.getElementById('room-participants-panel');
const btnToggleParticipants = document.getElementById('btn-toggle-participants');
const panelResizer = document.getElementById('panel-resizer');

let isPanelMinimized = false;

if (btnToggleParticipants && participantsPanel) {
  btnToggleParticipants.addEventListener('click', () => {
    isPanelMinimized = !isPanelMinimized;
    if (isPanelMinimized) {
      participantsPanel.style.transform = 'translateX(100%)';
      btnToggleParticipants.innerText = '?';
    } else {
      participantsPanel.style.transform = 'translateX(0%)';
      btnToggleParticipants.innerText = '?';
    }
  });
}

let isResizingPanel = false;
let startX = 0;
let startWidth = 0;

if (panelResizer && participantsPanel) {
  panelResizer.addEventListener('pointerdown', (e) => {
    if (isPanelMinimized) return;
    isResizingPanel = true;
    startX = e.clientX;
    startWidth = participantsPanel.offsetWidth;
    participantsPanel.style.transition = 'none';
    e.preventDefault();
  });
  
  window.addEventListener('pointermove', (e) => {
    if (!isResizingPanel) return;
    const dx = startX - e.clientX;
    const newWidth = Math.max(150, Math.min(window.innerWidth * 0.8, startWidth + dx));
    participantsPanel.style.width = newWidth + 'px';
  });
  
  window.addEventListener('pointerup', () => {
    if (isResizingPanel) {
      isResizingPanel = false;
      participantsPanel.style.transition = 'transform 0.3s ease';
    }
  });
}


// === Lottery Admin Play ===
const btnLotteryAdminPlay = document.getElementById('btn-lottery-admin-play');
if (btnLotteryAdminPlay) {
  btnLotteryAdminPlay.addEventListener('click', async () => {
    const count = parseInt(lotteryDrawCount.value) || 1;
    try {
      const res = await fetch('/api/admin/lottery/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: currentUser.userId, assigneeUid: currentUser.userId, drawCount: count })
      });
      const data = await res.json();
      if (!data.success) alert(data.error);
      else alert('已開始自動抽籤');
    } catch(e) { console.error(e); }
  });
}

