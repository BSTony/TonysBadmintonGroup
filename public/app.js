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
      const symbols = isDance ? ['🎵', '🎶', '✨'] : ['💧', '💦', '💧'];
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

// === 全域狀態 ===
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
let globalLobbyTitle = '羽球接龍大廳';
let currentGameDetailId = null;
let lastGamesJson = '';

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
const adminPinballControls = document.getElementById('admin-pinball-controls');
var pinballContainer = pinballContainer || document.getElementById('pinball-container');

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
  const namesStr = partyLobbyNames.length > 0 ? partyLobbyNames.join(', ') : '無';
  partyAdminStatus.innerHTML = `狀態: ${currentPartyStatus} (人數: ${partyLobbyNames.length})<br><span style="font-size: 13px; color: #555; font-weight: normal;">已加入: ${namesStr}</span>`;
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
        bhContainer.classList.add('hidden'); // HIDE bh-container so it doesn't cover lottery
        const bhScore = document.getElementById('bh-score');
        if (bhScore) bhScore.classList.add('hidden');
        const bhWaitText = document.getElementById('bh-waiting-text');
        if (bhWaitText) bhWaitText.classList.add('hidden');
        adminLotteryControls.classList.remove('hidden');
        adminSurvivalControls.classList.add('hidden');
        if (adminPinballControls) adminPinballControls.classList.add('hidden');
        if (pinballContainer) pinballContainer.classList.add('hidden');
      } else if (currentGlobalRoomState.activeGame === 'survival') {
        // Restore overlay styles
        unifiedRoomOverlay.style.background = 'rgba(0,0,0,0.9)';
        unifiedRoomOverlay.style.pointerEvents = 'auto';
        
        lotteryCanvasContainer.classList.add('hidden');
        bhContainer.classList.remove('hidden');
        bhContainer.style.pointerEvents = 'auto';
        const bhScore = document.getElementById('bh-score');
        if (bhScore) bhScore.classList.remove('hidden');
        const bhWaitText = document.getElementById('bh-waiting-text');
        if (bhWaitText && !bhIsPlaying) bhWaitText.classList.remove('hidden');
        adminLotteryControls.classList.add('hidden');
        adminSurvivalControls.classList.remove('hidden');
        if (adminPinballControls) adminPinballControls.classList.add('hidden');
        if (pinballContainer) pinballContainer.classList.add('hidden');
      } else if (currentGlobalRoomState.activeGame === 'pinball') {
        lotteryCanvasContainer.classList.add('hidden');
        bhContainer.classList.add('hidden');
        if (pinballContainer) pinballContainer.classList.remove('hidden');
        adminLotteryControls.classList.add('hidden');
        adminSurvivalControls.classList.add('hidden');
        if (adminPinballControls) adminPinballControls.classList.remove('hidden');
        
        // Keep overlay blocking so users cannot click background UI, but can click pinball canvas
        unifiedRoomOverlay.style.background = 'rgba(0,0,0,0.9)';
        unifiedRoomOverlay.style.pointerEvents = 'auto';
        
        // Ensure child panels remain clickable
        document.getElementById('room-admin-panel').style.pointerEvents = 'auto';
        const topButtons = document.querySelector('#unified-room-overlay > div:first-child');
        if (topButtons) topButtons.style.pointerEvents = 'auto';
        const pPanel = document.getElementById('room-participants-panel');
        if (pPanel) pPanel.style.pointerEvents = 'auto';
        
        // Ensure pinball canvas catches clicks
        if (pinballContainer) pinballContainer.style.pointerEvents = 'auto';
      }
    } else {
      unifiedRoomOverlay.classList.add('hidden');
    }
  } else {
    hasEnteredParty = false;
    if (partyActiveBanner) partyActiveBanner.classList.add('hidden');
    unifiedRoomOverlay.classList.add('hidden');
    bhContainer.classList.add('hidden');
    if (typeof bhGameoverModal !== 'undefined' && bhGameoverModal) {
      bhGameoverModal.classList.add('hidden');
    }
    lotteryCanvasContainer.classList.add('hidden');
    if (pinballContainer) pinballContainer.classList.add('hidden');
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
  if (typeof bindLotterySocket === 'function') {
    bindLotterySocket(socket);
  }
  if (typeof bindPinballSocket === 'function') {
    bindPinballSocket(socket);
  }
  
  socket.on('global_room_state', (state) => {
    window.globalRoomState = state;
    currentGlobalRoomState = state;
    updateUnifiedRoomUI();
  });
  
  socket.on('require_version', (data) => {
    const CURRENT_VERSION = '20260718_serversync3';
    if (data.version !== CURRENT_VERSION) {
      console.log('Version mismatch, forcing reload...');
      window.location.href = window.location.href.split('?')[0] + '?v=' + data.version;
    }
  });

  socket.on('party_state', (state) => {
    currentPartyStatus = state.status;
    partyLobbyNames = state.players ? Object.values(state.players).map(p => p.name) : [];
    
    const adminPlayBtn = document.getElementById('btn-bh-admin-play');
    
    if (state.status === 'lobby') {
      if (adminPlayBtn) adminPlayBtn.classList.remove('hidden');
      const hasJoined = state.players && socket && state.players[socket.id];
      if (currentGlobalRoomState && !hasJoined) {
        btnJoinRoom.classList.remove('hidden');
      } else {
        btnJoinRoom.classList.add('hidden');
      }
      
      const waitingText = document.getElementById('bh-waiting-text');
      if (waitingText) {
        if (hasJoined) {
          waitingText.classList.remove('hidden');
          if (typeof globalIsSuperAdmin !== 'undefined' && globalIsSuperAdmin) {
            waitingText.innerText = '請從右側控制面板開始遊戲';
          } else {
            waitingText.innerText = '等待管理者開始遊戲...';
          }
        } else {
          waitingText.classList.add('hidden');
        }
      }
    } else if (state.status === 'playing') {
      if (adminPlayBtn) adminPlayBtn.classList.add('hidden');
      btnJoinRoom.classList.add('hidden');
      const waitingText = document.getElementById('bh-waiting-text');
      if (waitingText) waitingText.classList.add('hidden');
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
      if (iconEl) iconEl.innerText = '🤕';
    }
    if (data.id === socket.id && bhPlayer) {
      const iconEl = bhPlayer.querySelector('.bh-icon');
      if (iconEl) iconEl.innerText = '🤕';
    }
  });
  
  socket.on('party_play', (data) => {
    bhIsPlaying = true;
    bhStartTime = performance.now(); // Ignore data.startTime to align with requestAnimationFrame's timestamp
    if (partyJoinContainer) partyJoinContainer.classList.add('hidden');
    if (btnJoinRoom) btnJoinRoom.classList.add('hidden');
    if (roomAdminPanel) roomAdminPanel.classList.add('hidden');
    if (bhGameoverModal) bhGameoverModal.classList.add('hidden');
    if (bhContainer) bhContainer.classList.remove('hidden');
    
    const waitingText = document.getElementById('bh-waiting-text');
    if (waitingText) waitingText.classList.add('hidden');
    
    // Auto-minimize participant panel to prevent covering the screen
    const pPanel = document.getElementById('room-participants-panel');
    if (pPanel) {
      pPanel.classList.add('hidden');
    }
    
    // Clear old entities
    bhBullets.forEach(b => b.el.remove());
    bhBullets = [];
    bhWalls.forEach(w => w.el.remove());
    bhWalls = [];
    bhItems.forEach(i => i.el.remove());
    bhItems = [];
    
    // Reset players
    if (bhPlayer) {
      const iconEl = bhPlayer.querySelector('.bh-icon');
      if (iconEl) iconEl.innerText = selectedCharacterIcon;
      bhPlayer.classList.remove('bh-invincible');
      updateLives(3);
    }
    Object.values(partyOthers).forEach(el => {
      const iconEl = el.querySelector('.bh-icon');
      if (iconEl && el._originalIcon) iconEl.innerText = el._originalIcon;
      el.classList.remove('bh-invincible');
    });
    
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
    document.getElementById('bh-gameover-title').innerText = '派對結束！';
    bhFinalTime.innerText = data.elapsed.toFixed(2);
    renderBhLeaderboard(data.leaderboard);
    
    const isWinner = data.winners.some(w => w.uid === currentUser.userId);
    if (isWinner && bhPlayer) bhPlayer.innerHTML = '👑';
    
    // 超管顯示「再來一場 / 結束比賽」雙按鈕，一般玩家顯示等待文字
    const bhSuperadminActions = document.getElementById('bh-superadmin-actions');
    const waitingText = document.getElementById('bh-waiting-admin-text');
    if (typeof globalIsSuperAdmin !== 'undefined' && globalIsSuperAdmin) {
      if (bhSuperadminActions) bhSuperadminActions.classList.remove('hidden');
      if (waitingText) waitingText.classList.add('hidden');
      if (btnBhRestart) {
        btnBhRestart.innerText = '關閉房間(一般視窗)';
        btnBhRestart.classList.add('hidden'); // We use superadmin actions instead
      }
    } else {
      if (bhSuperadminActions) bhSuperadminActions.classList.add('hidden');
      if (waitingText) waitingText.classList.remove('hidden');
      if (btnBhRestart) {
        btnBhRestart.classList.add('hidden');
      }
    }
  });
}

function createOtherPlayer(p) {
  if (partyOthers[p.id] || p.id === (socket ? socket.id : '')) return;
  const el = document.createElement('div');
  el.className = 'bh-player';
  el.style.opacity = '0.5'; // Ghost appearance for others
  el.innerHTML = `
    <div class="bh-icon">${p.alive ? (p.icon || '🐷') : '🤕'}</div>
    <div class="bh-player-name">${p.name}</div>
  `;
  el._originalIcon = p.icon || '🐷';
  el.style.left = (p.x * window.innerWidth) + 'px';
  el.style.top = (p.y * window.innerHeight) + 'px';
  bhEntities.appendChild(el);
  partyOthers[p.id] = el;
}

let selectedCharacterIcon = '🐷';

function joinPartyLobby() {
  initSocket();
  if (typeof btnJoinRoom !== 'undefined' && btnJoinRoom) {
    btnJoinRoom.classList.add('hidden');
  }
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
  livesEl.innerText = '❤️❤️❤️';
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
  el.innerHTML = '🏸';
  
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
  el.innerHTML = item.type === 'heart' ? '❤️' : '⭐';
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
    display.innerText = '❤️'.repeat(lives);
  }
}

function bhPartyLoop(timestamp) {
  if (!bhIsPlaying) return;
  
  // Update smooth player movement
  if (bhContainer._updateMovement) bhContainer._updateMovement();
  
  const elapsed = timestamp - bhStartTime; 
  bhTimer.innerText = (elapsed / 1000).toFixed(2);
  
  const pRect = bhPlayer.getBoundingClientRect();
  const px = pRect.left + pRect.width / 2;
  const py = pRect.top + pRect.height / 2;
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
    
    if (bhPlayer.innerHTML !== '🤕' &&
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
    if (bhPlayer.innerHTML !== '🤕' &&
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
      const chars = ['🐷', '🐶', '🐱', '🐰', '🦊', '🐻', '🐼', '🐯', '🦁', '🐸'];
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
    <div class="bh-icon">🐷</div>
    <div class="bh-player-name">${currentUser.displayName}</div>
  `;
  
  const livesEl = document.createElement('div');
  livesEl.className = 'bh-lives';
  livesEl.id = 'bh-lives-display';
  livesEl.innerText = '❤️❤️❤️';
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
  el.innerHTML = '🏸';
  
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
  if (iconEl) iconEl.innerText = '🤕';
  
  const survivalTime = parseFloat((elapsedMs / 1000).toFixed(2));
  bhFinalTime.innerText = survivalTime.toFixed(2);
  
  bhGameoverModal.classList.remove('hidden');
  if (btnBhRestart) {
    btnBhRestart.innerText = '再玩一次';
    btnBhRestart.disabled = false;
  }
  
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
    let rank = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index+1}.`;
    li.innerHTML = `<strong>${rank}</strong> ${w.name} - <span style="color:#e91e63">${w.survivalTime}</span> 秒`;
    bhLeaderboardList.appendChild(li);
  });
}

if (btnBhRestart) {
  btnBhRestart.addEventListener('click', async () => {
    const isMultiplayerContext = (window.currentGlobalRoomState && window.currentGlobalRoomState.activeGame === 'survival') || (typeof hasEnteredParty !== 'undefined' && hasEnteredParty);
    if (isMultiplayerContext) {
      // 多人模式：一般玩家點「回到大廳」只是關閉 modal
      if (bhGameoverModal) bhGameoverModal.classList.add('hidden');
      const pPanel = document.getElementById('room-participants-panel');
      if (pPanel) {
        pPanel.classList.remove('hidden');
      }
      return;
    }
    startBulletHell();
  });
}

// 超管：Survival「再來一場」按鈕
const btnBhPlayAgain = document.getElementById('btn-bh-play-again');
if (btnBhPlayAgain) {
  btnBhPlayAgain.addEventListener('click', async () => {
    btnBhPlayAgain.disabled = true;
    try {
      // 重置大逃殺狀態但保留玩家
      await fetch('/api/admin/party/next-round', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: currentUser.userId })
      });
      // 自動接著開始遊戲
      await fetch('/api/admin/party/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: currentUser.userId })
      });
      if (bhGameoverModal) bhGameoverModal.classList.add('hidden');
      const bhSuperadminActions = document.getElementById('bh-superadmin-actions');
      if (bhSuperadminActions) bhSuperadminActions.classList.add('hidden');
    } catch(e) {
      console.error(e);
    } finally {
      btnBhPlayAgain.disabled = false;
    }
  });
}

// 超管：Survival「結束比賽」按鈕
const btnBhEndRoom = document.getElementById('btn-bh-end-room');
if (btnBhEndRoom) {
  btnBhEndRoom.addEventListener('click', async () => {
    btnBhEndRoom.disabled = true;
    try {
      await fetch('/api/admin/room/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: currentUser.userId })
      });
      if (bhGameoverModal) bhGameoverModal.classList.add('hidden');
    } catch(e) {
      console.error(e);
      btnBhEndRoom.disabled = false;
    }
  });
}


// 初始化 LIFF
async function initializeLiff() {
  try {
    // 0. 本機測試模式 (Local Test Mode)
    const testParams = new URLSearchParams(window.location.search);
    const testRole = testParams.get('testRole');
    if (testRole) {
      console.log('Running in Local Test Mode:', testRole);
      let randomSuffix = Math.random().toString(36).substr(2, 5);
      let mockUid = 'U_TEST_PLAYER_' + randomSuffix;
      let mockName = testParams.get('name') || ('Test Player ' + randomSuffix);
      
      if (testRole === 'superadmin') {
        mockUid = 'U_SUPER_ADMIN_TEST_ID_' + randomSuffix;
        mockName = testParams.get('name') || 'Super Admin';
      } else if (testRole === 'admin') {
        mockUid = 'U_GROUP_ADMIN_TEST_ID_' + randomSuffix;
        mockName = testParams.get('name') || 'Group Admin';
      }
      
      currentUser = { userId: mockUid, displayName: mockName };
      if (typeof initLottery === 'function') {
        initLottery(currentUser.userId);
      }
      
      currentGroupId = testParams.get('gid') || 'TEST_GROUP_1234';
      const h3 = document.getElementById('group-id-display');
      if (h3) h3.innerText = '群組ID: ' + currentGroupId;
      
      await loadGamesLobby();
      initSocket();
      
      const appDivEl = document.getElementById('app');
      if (appDivEl) appDivEl.className = '';
      const statusMsgEl = document.getElementById('status-msg');
      if (statusMsgEl) statusMsgEl.style.display = 'none';
      
      return; // Skip LIFF initialization completely
    }

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
      liff.login({ redirectUri: window.location.href });
      return;
    }

    // 取得使用者資料
    const profile = await liff.getProfile();
    currentUser = profile;
    if (typeof initLottery === 'function') {
      initLottery(currentUser.userId);
    }

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

    // 紀錄造訪
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

    // 5. 載入大廳資料
    document.getElementById('create-game-view').classList.add('hidden');
    await loadGamesLobby();
    
    // 6. 初始化派對 Socket (背景連線，以便接收廣播)
    initSocket();

  } catch (err) {
    console.error('LIFF Init Error:', err);
    appDiv.className = '';
    statusMsg.innerText = err.message || '發生錯誤';
    statusMsg.style.color = '#ff5252';
    statusMsg.style.display = 'block';
  }
}

// 載入多場次大廳資料
async function loadGamesLobby(silent = false) {
  try {
    if (!silent) {
      appDiv.className = 'loading';
      statusMsg.innerText = '載入中...';
      statusMsg.style.display = 'block';
    }
    
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
      lastGamesJson = JSON.stringify(gamesList);
      globalIsAdmin = !!data.isAdmin;
      globalIsSuperAdmin = !!data.isSuperAdmin;
      globalManagedGroups = data.managedGroups || [];
      globalLobbyTitle = data.lobbyTitle || '羽球接龍大廳';
      globalLobbyDesc = data.lobbyDesc || '本週臨打名額有限，趕快搶位，跟著小豬一起快樂揮拍吧！';
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
    // 若為初次載入且網址有指定 gameId，則直接進入該場次，否則留在首頁
    if (!silent && urlGameId && gamesList.some(g => g.gameId === urlGameId)) {
      renderDetail(urlGameId);
    } else if (!currentGameDetailId) {
      renderLobby();
    } else {
      renderDetail(currentGameDetailId);
    }
  } catch (err) {
    console.error(err);
    appDiv.className = ''; // 確保發生錯誤時也關閉轉圈圈
    statusMsg.innerText = err.message;
    statusMsg.style.display = 'block';
  }
}

// 判斷場次是否已過期 (根據日期與結束時間)
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

// 渲染大廳畫面
function renderLobby() {
    appDiv.className = '';
    if (statusMsg) statusMsg.style.display = 'none';
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    lobbyView.classList.remove('hidden');
    
    document.getElementById('lobby-title-text').innerText = globalLobbyTitle || '羽球接龍大廳';
    const btnEditTitle = document.getElementById('btn-edit-title');
    if (globalIsSuperAdmin && btnEditTitle) {
      btnEditTitle.classList.remove('hidden');
      btnEditTitle.onclick = handleEditLobbyTitle;
    } else if (btnEditTitle) {
      btnEditTitle.classList.add('hidden');
    }
    
    document.getElementById('lobby-desc-text').innerText = globalLobbyDesc || '本週臨打名額有限，趕快搶位，跟著小豬一起快樂揮拍吧！';
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

    if (globalIsSuperAdmin && btnSystemLogs) {
      btnSystemLogs.classList.remove('hidden');
    } else if (btnSystemLogs) {
      btnSystemLogs.classList.add('hidden');
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
         badgeText = '已結束';
      } else if (isFull) {
         badgeStyle = 'background-color: #E0E0E0; color: #888888;';
         badgeText = '已額滿';
      } else if (isWaitlist) {
         badgeStyle = 'background-color: #FFF3E0; color: #E65100;';
         badgeText = '⚠ 候補中';
      } else {
         badgeText = '✓ 開放報名';
      }
      
      let customTagsHtml = '';
      if (game.tag) {
         const tagArr = game.tag.split(/[,、，]/).map(t => t.trim()).filter(Boolean);
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
            <span>${escapeHTML(formatFee(game.fee) || '未設定')}</span>
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
          <button class="btn btn-primary btn-square" ${(isFull || isExpired) ? 'disabled style="opacity:0.5"' : ''} onclick="handleActionWithInput(event, '${game.gameId}', 'register')">+1</button>
          <button class="btn btn-danger btn-square" ${isExpired ? 'disabled style="opacity:0.5"' : ''} onclick="handleActionWithInput(event, '${game.gameId}', 'cancel')">-1</button>
          <input type="text" id="name-input-${game.gameId}" class="name-input" placeholder="請輸入暱稱" ${isExpired ? 'disabled' : ''} style="flex: 2; min-width: 100px; font-weight: bold; color: #333;" />
          <input type="text" id="level-input-${game.gameId}" class="name-input" placeholder="備註" ${isExpired ? 'disabled' : ''} style="flex: 1; min-width: 60px; margin-left: 8px; font-weight: bold;" />
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
      summaryEl.innerText = `已結束的團 (${endedGames.length})`;
      
      const contentEl = document.createElement('div');
      contentEl.style.marginTop = '15px';
      
      endedGames.forEach(game => contentEl.appendChild(renderCard(game)));
      
      detailsEl.appendChild(summaryEl);
      detailsEl.appendChild(contentEl);
      gamesContainer.appendChild(detailsEl);
    }
  
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
        operatorName: currentUser.displayName,
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
      renderDetail(gameId, true);
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
        operatorName: currentUser.displayName,
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
  const isAutoTitle = normalize(game.title) === autoStr || game.title === '羽球接龍';
  const showTitle = game.title && !isAutoTitle;
  detailTitle.innerText = showTitle ? game.title : '場次明細';
  if (!showTitle) detailTitle.style.display = 'none';
  else detailTitle.style.display = 'block';
  
  const btnCloseGame = document.getElementById('btn-close-game');
  const btnEditGame = document.getElementById('btn-edit-game');
  const btnCopyList = document.getElementById('btn-copy-list');
  if (btnCopyList) {
    btnCopyList.classList.remove('hidden');
    btnCopyList.onclick = () => {
      const list = game.sections[0]?.list || [];
      const text = list.map(n => n === '__ANON__' ? '匿名球友' : n).join('\n');
      navigator.clipboard.writeText(text).then(() => {
        alert('名單已成功複製！\n\n' + text);
      }).catch(() => {
        prompt('請複製以下名單：', text);
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
  detailCount.innerText = `${isRegistered ? '(已報名) ' : ''}${section.list.length} / ${section.limit}`;
  

  const isExpired = isGameExpired(game);
  const isFull = section.list.length >= (section.limit + (section.backupLimit || 0));

  let actionRowHtml = `
    <div class="action-row" style="flex-wrap: wrap; margin-top: 15px; margin-bottom: 10px;">
      <button class="btn btn-primary btn-square" ${(isFull || isExpired) ? 'disabled style="opacity:0.5"' : ''} onclick="handleActionWithInput(event, '${game.gameId}', 'register', '-detail')">+1</button>
      <button class="btn btn-danger btn-square" ${isExpired ? 'disabled style="opacity:0.5"' : ''} onclick="handleActionWithInput(event, '${game.gameId}', 'cancel', '-detail')">-1</button>
      <input type="text" id="name-input-${game.gameId}-detail" class="name-input" placeholder="請輸入暱稱" ${isExpired ? 'disabled' : ''} style="flex: 2; min-width: 100px; font-weight: bold; color: #333;" />
      <input type="text" id="level-input-${game.gameId}-detail" class="name-input" placeholder="備註" ${isExpired ? 'disabled' : ''} style="flex: 1; min-width: 60px; margin-left: 8px; font-weight: bold;" />
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
     if (game.fee) tagsHtml += `<span class="info-tag">💰 ${escapeHTML(formatFee(game.fee))}</span>`;
     tagsHtml += '</div>';
     tagsHtml += '</div>';
     detailList.innerHTML += tagsHtml;
  }
  if (game.note) {
     detailList.innerHTML += `<div class="game-note">${escapeHTML(game.note)}</div>`;
  }
  
  let historyHtml = '<div class="history-section" style="margin-top: 15px; margin-bottom: 15px; padding: 10px; background-color: #fafafa; border-radius: 8px; border-left: 4px solid #90caf9;">';
  historyHtml += '<h4 style="margin: 0 0 8px 0; color: #333; font-size: 14px;">歷史紀錄</h4>';
  historyHtml += '<div style="font-size: 13px; color: #555;">';
  if (game.history && game.history.length > 0) {
    const top2 = game.history.slice(0, 2);
    const rest = game.history.slice(2);
    
    top2.forEach(h => {
       let displayText = '';
       if (h.action === '錯誤') {
         historyHtml += `<div style="margin-bottom: 4px; color: #F44336; font-size: 12px;">${escapeHTML(h.time)} <strong>[系統錯誤]</strong> ${escapeHTML(h.errorMsg || '')}</div>`;
         return;
       }
       if (h.operator && h.operator !== h.name) {
         displayText = `${escapeHTML(h.operator)} 幫 ${escapeHTML(h.name)}`;
       } else if (h.operator) {
         displayText = escapeHTML(h.operator);
       } else {
         displayText = escapeHTML(h.name);
       }
       historyHtml += `<div style="margin-bottom: 4px;">${escapeHTML(h.time)} <strong>${displayText}</strong> <span style="color: ${h.action === '+1' ? '#4CAF50' : '#F44336'}; font-weight: bold;">${escapeHTML(h.action)}</span></div>`;
    });
    
    if (rest.length > 0) {
       historyHtml += `<details style="margin-top: 8px;">
           <summary style="cursor: pointer; color: #1976d2; font-weight: bold; outline: none;">顯示更多 (${rest.length})</summary>
           <div style="max-height: 120px; overflow-y: auto; margin-top: 6px; padding-left: 8px; border-left: 2px solid #ddd;">`;
       rest.forEach(h => {
           let displayText = '';
           if (h.action === '錯誤') {
             historyHtml += `<div style="margin-bottom: 4px; color: #F44336; font-size: 12px;">${escapeHTML(h.time)} <strong>[系統錯誤]</strong> ${escapeHTML(h.errorMsg || '')}</div>`;
             return;
           }
           if (h.operator && h.operator !== h.name) {
             displayText = `${escapeHTML(h.operator)} 幫 ${escapeHTML(h.name)}`;
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
    historyHtml += '<div style="color: #999; font-style: italic;">目前尚無歷史紀錄</div>';
  }
  historyHtml += '</div></div>';
  detailList.innerHTML += historyHtml;
  
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
            ${(canCancel && !isGameExpired(game)) ? `<button class="btn-icon" style="color:var(--danger-color); padding: 4px; margin: 0; font-size: 16px;" onclick="handleCancelByName('${game.gameId}', '${escapeHTML(name)}')">❌</button>` : ''}
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
            ${(canCancel && !isGameExpired(game)) ? `<button class="btn-icon" style="color:var(--danger-color); padding: 4px; margin: 0; font-size: 16px;" onclick="handleCancelByName('${game.gameId}', '${escapeHTML(name)}')">❌</button>` : ''}
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

// 格式化費用，若無「元」則補上
function formatFee(fee) {
  if (!fee || fee === '未設定' || fee === '未知' || fee === '無' || fee === '0') return fee || '';
  let str = fee.toString().trim();
  if (str && !str.endsWith('元')) {
    return str + '元';
  }
  return str;
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

// 靜默重新整理資料 (不顯示 loading)
let refreshPending = false;

async function silentRefreshGames() {
  if (!currentGroupId || !currentUser) return;
  
  // 若使用者正在輸入，暫停更新以免打斷輸入
  const activeTag = document.activeElement ? document.activeElement.tagName : '';
  if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
    if (!refreshPending) {
      refreshPending = true;
      setTimeout(() => {
        refreshPending = false;
        silentRefreshGames();
      }, 1500); // 1.5 秒後重試
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
        globalLobbyTitle = data.lobbyTitle || '羽球接龍大廳';
        globalLobbyDesc = data.lobbyDesc || '本週臨打名額有限，趕快搶位，跟著小豬一起快樂揮拍吧！';
        
        // 根據目前所在畫面重新渲染
        if (currentGameDetailId && !detailView.classList.contains('hidden')) {
          renderDetail(currentGameDetailId, true);
        } else {
          renderLobby();
        }
      }
    }
  } catch (err) {
    // 靜默失敗不提示
  }
}

// --- SSE 主動推播機制 ---
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
    // 發生錯誤或斷線時，關閉並在幾秒後嘗試重連
    eventSource.close();
    eventSource = null;
    setTimeout(setupSSE, 5000);
  };
}

// 啟動
initializeLiff().then(() => {
  setupSSE();
});

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
        operatorName: currentUser.displayName,
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
    renderDetail(gameId, true);
    
  } catch (err) {
    console.error(err);
    alert('網路錯誤，請稍後再試');
    await loadGamesLobby();
  }
};

// --- Quokka 動畫邏輯 ---
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
  
  // 圖2
  getTransparentImage('images/quokka_carry_2.png', (src) => {
    floatingQuokka._img.src = src;
  });
  
  // 回歸原位
  floatingQuokka.style.transition = 'transform 1s ease-in-out';
  floatingQuokka.style.transform = 'translate(0px, 0px)';
  
  setTimeout(() => {
    // 按下去的動作
    floatingQuokka.style.transition = 'transform 0.2s';
    floatingQuokka.style.transform = 'translate(0px, 10px)';
    
    setTimeout(() => {
      floatingQuokka.style.transform = 'translate(0px, 0px)';
      
      // 顯示真正的按鈕
      btn.style.visibility = 'visible';
      
      // 圖3 揮手哭泣
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

// 處理新的輸入框報名與防呆
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
    errorEl.innerText = '名稱已重複';
    errorEl.style.display = 'block';
    return;
  }
  
  if (action === 'cancel' && !exists) {
    errorEl.innerText = '找不到此名稱';
    errorEl.style.display = 'block';
    return;
  }
  
  // btn already declared at top of function — just use it
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
      throw new Error(data.error || '操作失敗');
    }

    // 自動推播名單機制：優先使用 liff.sendMessages
    if (data.triggerBumpMsg) {
      // 嘗試用 liff.sendMessages（僅在 LINE 手機版內建瀏覽器中才有效）
      if (typeof liff !== 'undefined' && liff.isInClient()) {
        try {
          await liff.sendMessages([{ type: 'text', text: data.triggerBumpMsg + '\n\n[系統代發]' }]);
          console.log('自動發話成功');
        } catch (e) {
          console.error('liff.sendMessages 失敗:', e);
          fetch('/api/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              gid: currentGroupId, gameId: gameId, uid: currentUser.userId, name: name, operatorName: currentUser.displayName, action: 'logError', text: '代發失敗: ' + e.message
            })
          }).catch(console.error);
        }
      }
    }
    
    // +1/-1 完成後，清空暱稱與備註輸入框
    if (inputEl) {
      inputEl.value = '';
    }
    if (levelEl) {
      levelEl.value = '';
    }
    
    await loadGamesLobby(true); // 使用靜默加載，不轉圈圈，防止滾動條重置
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
    renderDetail(gameId, true);
    
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
    renderDetail(gameId, true);
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
    
    // 如果可以自動發話，直接代替使用者送出「接龍名單」指令，機器人就會自動回覆完整名單！
    if (typeof liff !== 'undefined' && liff.isInClient()) {
      try {
        await liff.sendMessages([{ type: 'text', text: `接龍名單\n\n[系統代發]` }]);
        alert('✅ 名單推播成功！已自動在聊天室呼叫機器人。');
        return;
      } catch (e) {
        console.error('自動發話失敗:', e);
        alert('自動發話失敗，可能未授權發言權限');
      }
    }
    
    // 以下為舊版回退機制（若無法自動發話）
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
      alert(result.error || '發送失敗');
      return;
    }
    
    if (result.partialError) {
      alert('機器人推播部分失敗: ' + result.errors.join(', '));
    } else {
      alert('✅ 名單推播指令已送出！請至您的私訊查看。');
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

let currentGroupTemplates = {};

// === 預設名單動態 UI ===
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
     if (p) line += `(已繳費)`;
     lines.push(line);
  });
  return lines.join('\n');
}

function parseAndRenderCgList(text) {
  const container = document.getElementById('cg-initial-list-container');
  container.innerHTML = '';
  if (!text) return;
  const lines = text.split(/[\n、，,]+/).map(n => n.trim()).filter(Boolean);
  lines.forEach(line => {
    let isPaid = false;
    let name = line;
    if (name.endsWith('$') || name.endsWith('＄') || name.endsWith('(已繳費)') || name.endsWith('（已繳費）')) {
        isPaid = true;
        name = name.replace(/[\$＄]$/, '').replace(/\(已繳費\)$/, '').replace(/（已繳費）$/, '');
    }
    let level = '';
    const match = name.match(/^(.*?)(?:[\(\[（](.*?)[\)\]）]|-(.*?))$/);
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
  nameInput.placeholder = '姓名';
  nameInput.value = name;
  nameInput.style.flex = '2';
  nameInput.style.margin = '0';
  nameInput.style.minWidth = '0';
  
  const levelInput = document.createElement('input');
  levelInput.type = 'text';
  levelInput.className = 'cg-list-level';
  levelInput.placeholder = '備註(選填)';
  levelInput.value = level;
  levelInput.style.flex = '1';
  levelInput.style.margin = '0';
  levelInput.style.minWidth = '0';
  
  const paidLabel = document.createElement('label');
  paidLabel.style.display = 'flex';
  paidLabel.style.alignItems = 'center';
  paidLabel.style.gap = '3px';
  paidLabel.style.marginBottom = '0';
  paidLabel.style.fontSize = '12px';
  paidLabel.style.whiteSpace = 'nowrap';
  paidLabel.style.cursor = 'pointer';
  paidLabel.style.padding = '4px';
  
  const paidCheck = document.createElement('input');
  paidCheck.type = 'checkbox';
  paidCheck.className = 'cg-list-paid';
  paidCheck.checked = isPaid;
  paidCheck.style.margin = '0 3px 0 0';
  paidCheck.style.transform = 'scale(1.3)';
  
  paidLabel.appendChild(paidCheck);
  paidLabel.appendChild(document.createTextNode('繳費'));
  
  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'btn-danger btn-cg-remove-row';
  delBtn.style.padding = '5px 8px';
  delBtn.style.fontSize = '12px';
  delBtn.style.margin = '0';
  delBtn.innerText = '❌';
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
    console.error('載入範本失敗:', e);
    currentGroupTemplates = {};
  }
  
  cgTemplateSelect.innerHTML = '<option value="">-- 選擇群組範本 --</option>';
  for (const name in currentGroupTemplates) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.innerText = name;
    cgTemplateSelect.appendChild(opt);
  }
}

document.getElementById('btn-save-template').onclick = async () => {
  const text = getCgListString();
  if (!text) return alert('名單不可為空！');
  const name = prompt('請輸入此範本的名稱 (例如：週二固定咖)：');
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
      alert('儲存成功且已同步至 Git！');
    } else {
      alert(data.error || '儲存失敗');
    }
  } catch (e) {
    alert('網路錯誤，無法儲存至伺服器');
  } finally {
    appDiv.className = '';
  }
};

document.getElementById('btn-delete-template').onclick = async () => {
  const name = cgTemplateSelect.value;
  if (!name) return alert('請先選擇一個範本！');
  if (!confirm(`確定要刪除範本「${name}」嗎？`)) return;
  
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
      alert('刪除成功且已同步至 Git！');
    } else {
      alert(data.error || '刪除失敗');
    }
  } catch (e) {
    alert('網路錯誤，無法刪除');
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
        initialListStr: getCgListString()
      })
    });
    
    const result = await res.json();
    if (!res.ok) {
      alert(result.error || '建立失敗');
    } else {
      // 開團成功，自動推撥已關閉，請管理者在詳細頁手動按「推播名單」以節省 LINE 額度
      let alertMsg = '✅ 開團成功！';
      if (result.pushErrors && result.pushErrors.length > 0) {
        alertMsg += '\n\n⚠️ 機器人推播失敗:\n' + result.pushErrors.join('\n');
      } else {
        alertMsg += '\n\n💡 如需通知群組，請進入場次詳細頁點「推播名單」。';
      }
      alert(alertMsg);
      
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
         renderDetail(gameId, true);
      }
    }
  } catch(e) {
    alert('網路錯誤');
  } finally {
    appDiv.className = '';
    statusMsg.style.display = 'none';
  }
};


document.addEventListener('click', (e) => { if (!e.target.closest('.btn-danger')) { document.querySelectorAll('.btn-danger').forEach(b => { if (b.dataset.dodged === 'true') { b.dataset.dodged = 'false'; b.style.transition = 'transform 1s ease'; b.style.transform = 'translate(0px, 0px)'; } }); } });

// 大廳分析邏輯
if (btnLobbyStats) {
  btnLobbyStats.addEventListener('click', async () => {
    appDiv.className = 'loading';
    statusMsg.innerText = '讀取分析資料中...';
    statusMsg.style.display = 'block';
    
    try {
      const res = await fetch(`/api/admin/all_stats?uid=${currentUser.userId}`);
      if (!res.ok) throw new Error('無法取得分析資料');
      const data = await res.json();
      
      statsGroupsContainer.innerHTML = '';
      
      if (data.allStats && data.allStats.length > 0) {
        let totalViews = data.totalViews || 0;
        let totalUniques = data.totalUniqueCount || 0;
        let totalTodayViews = data.todayViews || 0;
        let totalTodayUniques = data.todayUniqueCount || 0;
        
        const summaryCard = document.createElement('div');
        summaryCard.className = 'game-card';
        summaryCard.style.marginBottom = '20px';
        summaryCard.style.border = '2px solid #FF9800';
        summaryCard.innerHTML = `
          <h3 style="margin:0 0 10px 0; color:#FF9800; text-align:center;">🌟 所有群組總結</h3>
          <div class="detail-stats" style="margin-top:0; border-bottom: 1px solid #ffe0b2; padding-bottom: 10px; margin-bottom: 10px;">
            <div class="stat-box" style="flex:1;">
              <span class="stat-label">總觀看次數</span>
              <span class="stat-value">${totalViews}</span>
            </div>
            <div class="stat-box" style="flex:1;">
              <span class="stat-label">總不重複觀看 (人數)</span>
              <span class="stat-value">${totalUniques}</span>
            </div>
          </div>
          <div class="detail-stats" style="margin-top:0;">
            <div class="stat-box" style="flex:1;">
              <span class="stat-label">本日觀看次數</span>
              <span class="stat-value" style="color:#e74c3c;">${totalTodayViews}</span>
            </div>
            <div class="stat-box" style="flex:1;">
              <span class="stat-label">本日不重複觀看</span>
              <span class="stat-value" style="color:#e74c3c;">${totalTodayUniques}</span>
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
          viewsBox.innerHTML = `<span class="stat-label">總觀看次數</span><span class="stat-value">${stat.viewCount}</span>`;
          
          const uniqueBox = document.createElement('div');
          uniqueBox.className = 'stat-box';
          uniqueBox.style.flex = '1';
          uniqueBox.innerHTML = `<span class="stat-label">不重複觀看</span><span class="stat-value">${stat.uniqueCount}</span>`;
          
          statsRow.appendChild(viewsBox);
          statsRow.appendChild(uniqueBox);
          card.appendChild(statsRow);
          
          // Daily Stats Table
          if (stat.dailyStats && stat.dailyStats.length > 0) {
            const dailyTitle = document.createElement('h4');
            dailyTitle.style.margin = '10px 0 5px 0';
            dailyTitle.style.fontSize = '14px';
            dailyTitle.style.color = '#34495e';
            dailyTitle.innerText = '📅 每日來客狀況';
            card.appendChild(dailyTitle);

            const table = document.createElement('table');
            table.style.width = '100%';
            table.style.borderCollapse = 'collapse';
            table.style.marginBottom = '15px';
            table.style.fontSize = '12px';
            
            table.innerHTML = `
              <thead>
                <tr style="background: rgba(0,0,0,0.05); text-align: left;">
                  <th style="padding: 5px; border-bottom: 1px solid #ccc;">日期</th>
                  <th style="padding: 5px; border-bottom: 1px solid #ccc;">總觀看</th>
                  <th style="padding: 5px; border-bottom: 1px solid #ccc;">不重複人數</th>
                </tr>
              </thead>
              <tbody>
                ${stat.dailyStats.map(d => `
                  <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 5px;">${d.date}</td>
                    <td style="padding: 5px;">${d.viewCount}</td>
                    <td style="padding: 5px;">${d.uniqueCount}</td>
                  </tr>
                `).join('')}
              </tbody>
            `;
            card.appendChild(table);
          }
          
          // Toggle Logs Button
          const toggleLogsBtn = document.createElement('button');
          toggleLogsBtn.className = 'btn-secondary';
          toggleLogsBtn.style.width = '100%';
          toggleLogsBtn.style.fontSize = '12px';
          toggleLogsBtn.style.padding = '6px';
          toggleLogsBtn.innerText = '展開訪客紀錄 ▼';
          
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
                fallbackImg.innerText = '👤';
                item.appendChild(fallbackImg);
              }
              
              const nameDiv = document.createElement('div');
              nameDiv.style.fontWeight = '500';
              nameDiv.style.fontSize = '13px';
              nameDiv.innerText = log.displayName || '未知使用者';
              item.appendChild(nameDiv);
              
              logsContainer.appendChild(item);
            });
          } else {
            logsContainer.innerHTML = '<div style="color:#999; text-align:center; padding:10px; font-size:12px;">尚無紀錄</div>';
          }
          
          toggleLogsBtn.onclick = () => {
            if (logsContainer.style.display === 'none') {
              logsContainer.style.display = 'block';
              toggleLogsBtn.innerText = '收合訪客紀錄 ▲';
            } else {
              logsContainer.style.display = 'none';
              toggleLogsBtn.innerText = '展開訪客紀錄 ▼';
            }
          };
          
          card.appendChild(toggleLogsBtn);
          card.appendChild(logsContainer);
          statsGroupsContainer.appendChild(card);
        });
      } else {
        statsGroupsContainer.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">目前沒有任何群組的分析資料。</div>';
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
    statusMsg.innerText = '讀取中...';
    try {
      const res = await fetch('/api/systemLogs?uid=' + currentUser.userId);
      if (!res.ok) throw new Error('無法讀取系統LOG');
      const logs = await res.json();
      
      systemLogsContainer.innerHTML = '';
      if (!logs || logs.length === 0) {
        systemLogsContainer.innerHTML = '<p>目前沒有系統錯誤紀錄</p>';
      } else {
        logs.forEach(log => {
          const div = document.createElement('div');
          div.style.borderBottom = '1px solid #ddd';
          div.style.padding = '8px 0';
          div.innerHTML = `<div style="font-size:12px; color:#888;">${log.time}</div>
          <div style="font-weight:bold;">[${log.gameTitle || '未知場次'}] ${log.operator}</div>
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
      if (rank === 1) crownHtml = '<span class="ee-crown">🥇</span>';
      else if (rank === 2) crownHtml = '<span class="ee-crown">🥈</span>';
      else if (rank === 3) crownHtml = '<span class="ee-crown">🥉</span>';
      else crownHtml = '<span class="ee-crown">👑</span>';
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
      <div class="ee-leaderboard-name" style="color: ${nameColor};">${crownHtml}${user.name} ${isMe ? '(你)' : ''}</div>
      <div class="ee-leaderboard-time">${timeInSeconds}</div>
    `;
    listEl.appendChild(li);
  });
}

// --- Admin Easter Egg View ---
if (btnEasterEgg) {
  btnEasterEgg.addEventListener('click', async () => {
    statusMsg.innerText = '載入設定中...';
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
              li.innerHTML = `<strong>${index+1}.</strong> ${w.name} - ${w.survivalTime} 秒`;
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
      alert('無法載入彩蛋設定');
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
          alert('大廳已開啟！');
          hasEnteredParty = true;
          updateUnifiedRoomUI();
          if (type === 'survival' && typeof btnJoinRoom !== 'undefined' && btnJoinRoom) {
            btnJoinRoom.click();
          }
        }
      } catch(e) { console.error(e); }
    });
  }
  
  if (btnCloseRoom) {
    btnCloseRoom.addEventListener('click', async () => {
      if (!confirm('確定要關閉房間並返回嗎？')) return;
      if (globalIsSuperAdmin) {
        try {
          await fetch('/api/admin/room/close', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: currentUser.userId })
          });
        } catch(e) { console.error(e); }
      } else {
        hasEnteredParty = false;
        unifiedRoomOverlay.classList.add('hidden');
        socket.emit('leave_room');
        
        // Clean up pinball engines and timers locally since we won't receive the 'idle' state from server
        if (typeof destroyEngine === 'function') destroyEngine();
        if (window.pinballTimerInterval) clearInterval(window.pinballTimerInterval);
        if (window.pinballSyncInterval) clearInterval(window.pinballSyncInterval);
        window.pinballRaceStarted = false;
        window._pbSyncLoopRunning = false;
        window._pbSyncTargets = {};
        const countdownEl = document.getElementById('pinball-countdown');
        if (countdownEl && countdownEl.timer) {
          clearInterval(countdownEl.timer);
          countdownEl.timer = null;
        }
        
        // Update UI so they can re-enter if they want
        if (typeof updateUnifiedRoomUI === 'function') {
          updateUnifiedRoomUI();
        }
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
        btnMinimizeAdminPanel.innerText = '—';
      } else {
        body.style.display = 'none';
        btnMinimizeAdminPanel.innerText = '口';
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
        alert('儲存成功');
        easterEggEnabled = eeEnabledCheckbox.checked;
        easterEggActiveGame = eeActiveGameSelect.value;
        renderLobby();
      }
    } catch(e) { alert('儲存失敗'); }
    btnSaveEasterEgg.disabled = false;
  });
}

if (btnClearWinners) {
  btnClearWinners.addEventListener('click', async () => {
    if (!confirm('確定要清除名單？')) return;
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
        alert('已清除名單');
      }
    } catch(e) { alert('清除失敗'); }
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
  // removed unused lotteryPoolList
  if (typeof lotteryPoolList !== 'undefined' && lotteryPoolList) lotteryPoolList.innerHTML = '';
  lotteryAdminPool.forEach((name, idx) => {
    const li = document.createElement('li');
    li.style.display = 'flex';
    li.style.justifyContent = 'space-between';
    li.style.borderBottom = '1px solid #eee';
    li.style.padding = '2px 0';
    
    const span = document.createElement('span');
    span.innerText = `${idx + 1}. ${name}`;
    
    const delBtn = document.createElement('button');
    delBtn.innerText = '❌';
    delBtn.style.background = 'none';
    delBtn.style.border = 'none';
    delBtn.style.cursor = 'pointer';
    delBtn.onclick = () => {
      lotteryAdminPool.splice(idx, 1);
      updateLotteryAdminPoolUI();
    };
    
    li.appendChild(span);
    li.appendChild(delBtn);
    if (typeof lotteryPoolList !== 'undefined' && lotteryPoolList) lotteryPoolList.appendChild(li);
  });
  syncLotteryPoolToServer();
}

async function syncLotteryPoolToServer() {
  if (typeof currentGlobalRoomState !== 'undefined' && currentGlobalRoomState && currentGlobalRoomState.status === 'open' && currentGlobalRoomState.activeGame === 'lottery') {
    try {
      await fetch('/api/admin/lottery/update-pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: currentUser.userId, pool: lotteryAdminPool })
      });
    } catch(e) { console.error(e); }
  }
}

if (btnImportLobbyUsers) {
  btnImportLobbyUsers.addEventListener('click', () => {
    if (partyLobbyNames && partyLobbyNames.length > 0) {
      partyLobbyNames.forEach(name => {
        if (!lotteryAdminPool.includes(name)) lotteryAdminPool.push(name);
      });
      updateLotteryAdminPoolUI();
    } else {
      alert('大廳內目前沒有人員可以匯入！(請確定有開啟派對大廳)');
    }
  });
}

if (btnAddManualName) {
  btnAddManualName.addEventListener('click', () => {
    const val = lotteryManualName.value.trim();
    if (!val) return;
    const names = val.split(/[,，]/).map(n => n.trim()).filter(Boolean);
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
    if (!confirm('確定要強制重置並關閉房間嗎？')) return;
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
      alert('請選擇一位在線人員來抽籤');
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
      else alert('已開始自動抽籤');
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
      lotteryAssigneeSelect.innerHTML = '<option value="">-- 請選擇在線人員 --</option>';
      
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
        const chars = ['🐷', '🐶', '🐱', '🐰', '🦊', '🐻', '🐼', '🐯', '🦁', '🐸'];
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
const tabParticipants = document.getElementById('tab-participants');
const tabWinners = document.getElementById('tab-winners');
const panelParticipantsContent = document.getElementById('panel-participants-content');
const panelWinnersContent = document.getElementById('panel-winners-content');

const btnShowParticipants = document.getElementById('btn-show-participants');
const btnCloseParticipants = document.getElementById('btn-close-participants');

if (btnShowParticipants && participantsPanel) {
  btnShowParticipants.addEventListener('click', () => {
    participantsPanel.classList.toggle('hidden');
  });
}

if (btnCloseParticipants && participantsPanel) {
  btnCloseParticipants.addEventListener('click', () => {
    participantsPanel.classList.add('hidden');
    // Also close the color picker if open
    const colorPickerUi = document.getElementById('pinball-color-picker-ui');
    if (colorPickerUi) colorPickerUi.classList.add('hidden');
  });
}


if (tabParticipants && tabWinners) {
  tabParticipants.addEventListener('click', () => {
    tabParticipants.style.background = 'rgba(255,255,255,0.2)';
    tabWinners.style.background = 'transparent';
    panelParticipantsContent.classList.remove('hidden');
    panelWinnersContent.classList.add('hidden');
  });
  tabWinners.addEventListener('click', () => {
    tabWinners.style.background = 'rgba(255,255,255,0.2)';
    tabParticipants.style.background = 'transparent';
    panelWinnersContent.classList.remove('hidden');
    panelParticipantsContent.classList.add('hidden');
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

// === Pinball Admin Play ===
const btnPinballAdminSync = document.getElementById('btn-pinball-admin-sync');
const btnPinballAdminStart = document.getElementById('btn-pinball-admin-start');
const btnPinballAdminStop = document.getElementById('btn-pinball-admin-stop');

if (btnPinballAdminSync) {
  btnPinballAdminSync.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/admin/pinball/sync-pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: currentUser.userId, pool: partyLobbyNames })
      });
      const data = await res.json();
      if (!data.success) alert(data.error);
    } catch(e) { console.error(e); }
  });
}

const btnAddPinballName = document.getElementById('btn-add-pinball-name');
const btnAddPinballSelf = document.getElementById('btn-add-pinball-self');
const inputPinballName = document.getElementById('pinball-manual-name');

async function addPinballPlayer(name) {
  if (!name) {
    alert("請輸入名字！");
    return false;
  }
  if (!currentUser) {
    alert("無法取得您的登入狀態，請確定您已透過 LINE 登入。若是新開的無痕視窗將無法使用此功能！");
    return false;
  }
  try {
    const res = await fetch('/api/admin/pinball/add-player', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: currentUser.userId, name })
    });
    if (!res.ok) {
      alert("伺服器連線失敗或找不到 API！ HTTP " + res.status);
      return false;
    }
    const data = await res.json();
    if (!data.success) {
      alert("加入失敗：" + data.error);
      return false;
    }
    return data.success;
  } catch(e) { 
    console.error(e); 
    alert("發生未知錯誤：" + e.message);
    return false; 
  }
}

if (btnAddPinballName && inputPinballName) {
  btnAddPinballName.addEventListener('click', async () => {
    const name = inputPinballName.value.trim();
    if (await addPinballPlayer(name)) {
      inputPinballName.value = '';
    }
  });
}

if (btnAddPinballSelf) {
  btnAddPinballSelf.addEventListener('click', () => {
    if (currentUser && currentUser.displayName) {
      addPinballPlayer(currentUser.displayName);
    }
  });
}

if (btnPinballAdminStart) {
  btnPinballAdminStart.addEventListener('click', async () => {
    const limitInput = document.getElementById('pinball-winner-limit');
    let limit = 3;
    if (limitInput) limit = parseInt(limitInput.value) || 3;
    
    try {
      const res = await fetch('/api/admin/pinball/start-sequence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: currentUser.userId, winnerLimit: limit })
      });
      const data = await res.json();
      if (!data.success) alert(data.error);
    } catch(e) { console.error(e); }
  });
}

const btnPinballAdminNext = document.getElementById('btn-pinball-admin-next');
if (btnPinballAdminNext) {
  btnPinballAdminNext.addEventListener('click', async () => {
    if (!confirm('確定要開始下一回合嗎？所有玩家將回到起點，且積分會持續累積！')) return;
    try {
      const res = await fetch('/api/admin/pinball/next-round', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: currentUser.userId })
      });
      const data = await res.json();
      if (!data.success) alert(data.error);
    } catch(e) { console.error(e); }
  });
}

if (btnPinballAdminStop) {
  btnPinballAdminStop.addEventListener('click', async () => {
    try {
      await fetch('/api/admin/room/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: currentUser.userId })
      });
    } catch(e) { console.error(e); }
  });
}

