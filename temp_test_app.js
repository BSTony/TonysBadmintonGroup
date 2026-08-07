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
      const symbols = isDance ? ['?藀', '?藀?', '??] : ['?雿?, '?艞?', '?雿?];
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

// === ????嚙??===
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
let globalLobbyTitle = '?Ｚ???隞??剜頛?;
let currentGameDetailId = null;
let lastGamesJson = '';
let currentSimulatedRole = sessionStorage.getItem('simulatedRole') || 'superAdmin';

function getEffectiveRole() {
  if (!globalIsSuperAdmin) {
    return {
      isAdmin: globalIsAdmin,
      isSuperAdmin: false
    };
  }
  const role = currentSimulatedRole || 'superAdmin';
  if (role === 'user') {
    return { isAdmin: false, isSuperAdmin: false };
  } else if (role === 'groupAdmin') {
    return { isAdmin: true, isSuperAdmin: false };
  } else {
    return { isAdmin: true, isSuperAdmin: true };
  }
}

function handleRoleSwitch(role) {
  currentSimulatedRole = role;
  sessionStorage.setItem('simulatedRole', role);
  if (currentGameDetailId && typeof detailView !== 'undefined' && detailView && !detailView.classList.contains('hidden')) {
    renderDetail(currentGameDetailId, true);
  } else {
    renderLobby();
  }
  if (typeof fetchGroupBuyData === 'function') fetchGroupBuyData();
}
window.handleRoleSwitch = handleRoleSwitch;

// DOM ?嚙?
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
  const namesStr = partyLobbyNames.length > 0 ? partyLobbyNames.join(', ') : '??;
  partyAdminStatus.innerHTML = `?嚙?? ${currentPartyStatus} (?剔捂敶? ${partyLobbyNames.length})<br><span style="font-size: 13px; color: #555; font-weight: normal;">???? ${namesStr}</span>`;
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
  
  socket.on('group_buy_state_updated', (res) => {
    fetchGroupBuyData();
  });
  
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
            waitingText.innerText = '?Ｚ????喉蕭??對蕭?嚗貉??閫??藀?嚙?;
          } else {
            waitingText.innerText = '??????嚙??芷????..';
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
      if (iconEl) iconEl.innerText = '??';
    }
    if (data.id === socket.id && bhPlayer) {
      const iconEl = bhPlayer.querySelector('.bh-icon');
      if (iconEl) iconEl.innerText = '??';
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
    
    // ????格???皛??貍??嗆╰艞魚????    if (typeof btnToggleParticipants !== 'undefined' && btnToggleParticipants) {
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
    document.getElementById('bh-gameover-title').innerText = '?????舫????;
    bhFinalTime.innerText = data.elapsed.toFixed(2);
    renderBhLeaderboard(data.leaderboard);
    
    const isWinner = data.winners.some(w => w.uid === currentUser.userId);
    if (isWinner && bhPlayer) bhPlayer.innerHTML = '??';
    
    // ?蕭????嚙??蕭???/ ?舫???亦ㄟ擳?瞍???????蟡?啣?嚗蝞??綽蕭???
    const bhSuperadminActions = document.getElementById('bh-superadmin-actions');
    const waitingText = document.getElementById('bh-waiting-admin-text');
    if (typeof globalIsSuperAdmin !== 'undefined' && globalIsSuperAdmin) {
      if (bhSuperadminActions) bhSuperadminActions.classList.remove('hidden');
      if (waitingText) waitingText.classList.add('hidden');
      if (btnBhRestart) {
        btnBhRestart.innerText = '?艞??頛?(?蕭?蟡???';
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
    <div class="bh-icon">${p.alive ? (p.icon || '???) : '??'}</div>
    <div class="bh-player-name">${p.name}</div>
  `;
  el._originalIcon = p.icon || '???;
  el.style.left = (p.x * window.innerWidth) + 'px';
  el.style.top = (p.y * window.innerHeight) + 'px';
  bhEntities.appendChild(el);
  partyOthers[p.id] = el;
}

let selectedCharacterIcon = '???;

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
    const modeContainer = document.getElementById('admin-mode-container');
    if (modeContainer) modeContainer.classList.remove('hidden');
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
  livesEl.innerText = '?甇??甇??甇?';
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
  el.innerHTML = '???;
  
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
  el.innerHTML = item.type === 'heart' ? '?甇?' : '瞏?;
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
    display.innerText = '?甇?'.repeat(lives);
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
    
    if (bhPlayer.innerHTML !== '??' &&
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
    if (bhPlayer.innerHTML !== '??' &&
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
      const chars = ['???, '?瞈?, '?頨?, '???, '??', '?艞葬', '?銣?, '???, '??', '?艟'];
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
    <div class="bh-icon">???/div>
    <div class="bh-player-name">${currentUser.displayName}</div>
  `;
  
  const livesEl = document.createElement('div');
  livesEl.className = 'bh-lives';
  livesEl.id = 'bh-lives-display';
  livesEl.innerText = '?甇??甇??甇?';
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
  el.innerHTML = '???;
  
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
  if (iconEl) iconEl.innerText = '??';
  
  const survivalTime = parseFloat((elapsedMs / 1000).toFixed(2));
  bhFinalTime.innerText = survivalTime.toFixed(2);
  
  bhGameoverModal.classList.remove('hidden');
  if (btnBhRestart) {
    btnBhRestart.innerText = '?皛函?蕭??;
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
        if (winIconEl) winIconEl.innerText = '??';
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
    let rank = index === 0 ? '??' : index === 1 ? '??' : index === 2 ? '??' : `${index+1}.`;
    li.innerHTML = `<strong>${rank}</strong> ${w.name} - <span style="color:#e91e63">${w.survivalTime}</span> ??;
    bhLeaderboardList.appendChild(li);
  });
}

if (btnBhRestart) {
  btnBhRestart.addEventListener('click', async () => {
    const isMultiplayerContext = (window.currentGlobalRoomState && window.currentGlobalRoomState.activeGame === 'survival') || (typeof hasEnteredParty !== 'undefined' && hasEnteredParty);
    if (isMultiplayerContext) {
      // ?剖?????????蟡?啣???嚙??????勗?嚙賣???????modal
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

// ?蕭????赴rvival?嚙??蕭??瘞穿蕭朣???
const btnBhPlayAgain = document.getElementById('btn-bh-play-again');
if (btnBhPlayAgain) {
  btnBhPlayAgain.addEventListener('click', async () => {
    btnBhPlayAgain.disabled = true;
    try {
      // ?皛刻?剜?嚙踝蕭??嚙?銵??質????
      await fetch('/api/admin/party/next-round', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: currentUser.userId })
      });
      // ????鈭??閫??藀?嚙?      await fetch('/api/admin/party/play', {
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

// ?蕭????赴rvival?艞???嚙??閉嚙賡蝙???
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


// ?????LIFF
async function initializeLiff() {
  try {
    // 0. ?蟡???撗怎??? (Local Test Mode)
    const testParams = new URLSearchParams(window.location.search);
    const testRole = testParams.get('testRole');
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (testRole || isLocalhost) {
      console.log('Running in Local Test Mode:', testRole || 'localhost');
      let randomSuffix = Math.random().toString(36).substr(2, 5);
      let mockUid = 'U_SUPER_ADMIN_TEST_ID_' + randomSuffix;
      let mockName = testParams.get('name') || '?蕭??????(Local Test)';
      
      if (testRole === 'user') {
        mockUid = 'U_TEST_PLAYER_' + randomSuffix;
        mockName = testParams.get('name') || ('Test Player ' + randomSuffix);
      } else if (testRole === 'admin') {
        mockUid = 'U_GROUP_ADMIN_TEST_ID_' + randomSuffix;
        mockName = testParams.get('name') || 'Group Admin';
      }
      
      currentUser = { userId: mockUid, displayName: mockName };
      const urlBuyGid = testParams.get('buy');
      if (urlBuyGid && !testRole) {
        globalIsSuperAdmin = false;
        globalIsAdmin = false;
        currentUser.displayName = '?蕭?蟡竣??(Local Test)';
      } else {
        globalIsSuperAdmin = (testRole !== 'user');
        globalIsAdmin = (testRole !== 'user');
      }

      if (typeof initLottery === 'function') {
        initLottery(currentUser.userId);
      }
      
      currentGroupId = testParams.get('gid') || 'TEST_GROUP_1234';
      const h3 = document.getElementById('group-id-display');
      if (h3) h3.innerText = '?Ｘ?ID: ' + currentGroupId;
      
      const buyGid = testParams.get('buy');
      if (buyGid) {
        if (btnBackGroupBuy) btnBackGroupBuy.style.display = 'none';
        openGroupBuyPage(buyGid);
      } else {
        await loadGamesLobby();
      }
      initSocket();
      
      const appDivEl = document.getElementById('app');
      if (appDivEl) appDivEl.className = '';
      const statusMsgEl = document.getElementById('status-msg');
      if (statusMsgEl) statusMsgEl.style.display = 'none';
      
      return; // Skip LIFF initialization completely
    }

    // 1. ?蝖??綾ㄛ??蝯??
    const configRes = await fetch(`/api/config?_t=${Date.now()}`);
    if (!configRes.ok) throw new Error('????蝖???蝯??');
    const config = await configRes.json();
    
    if (!config.liffId) {
      throw new Error('??蝯??曇澈??LIFF ID');
    }

    // 2. ?????LIFF SDK
    await liff.init({ liffId: config.liffId });

    // 3. ?????輯撒??嚙賣??擗蕭
    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri: window.location.href });
      return;
    }

    // ?蝖??輯撒??嚙???
    const profile = await liff.getProfile();
    currentUser = profile;
    if (typeof initLottery === 'function') {
      initLottery(currentUser.userId);
    }

    // 4. ?蝖??Ｘ? Context
    const urlParams = new URLSearchParams(window.location.search);
    const gidFromUrl = urlParams.get('gid');
    const buyFromUrl = urlParams.get('buy');
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

    // ?蕭?嚙踝蕭蒺竣
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

    // 5. ?嚙賣?寡??蕭?
    document.getElementById('create-game-view').classList.add('hidden');
    await loadGamesLobby();
    
    // 6. ????臐??瑟??Socket (?撜????隤?頦蛤氖??爸??
    initSocket();

  } catch (err) {
    console.error('LIFF Init Error:', err);
    try {
      currentUser = currentUser || { userId: 'U_LOCAL_TEST', displayName: '?蕭?蟡竣?? };
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
  }
}

// ?嚙賣臐??衣??芯??勗???
async function loadGamesLobby(silent = false) {
  try {
    if (!silent) {
      appDiv.className = 'loading';
      statusMsg.innerText = '?嚙賡??..';
      statusMsg.style.display = 'block';
    }
    
    const res = await fetch(`/api/game/${currentGroupId}?uid=${currentUser.userId}&_t=${Date.now()}`);
    if (!res.ok) {
      if (res.status === 404) {
        gamesList = [];
      } else {
        throw new Error('????蝖??皝暑?蕭?');
      }
    } else {
      const data = await res.json();
      gamesList = data.games || [];
      lastGamesJson = JSON.stringify(gamesList);
      globalIsAdmin = !!data.isAdmin;
      globalIsSuperAdmin = !!data.isSuperAdmin;
      globalManagedGroups = data.managedGroups || [];
      globalLobbyTitle = data.lobbyTitle || '?Ｚ???隞??剜頛?;
      globalLobbyDesc = data.lobbyDesc || '?蟡蕭璇荊????輸蝙?????走蝧????姘?????????蝧啁?嚙踢??皛???;
      try {
        if (typeof fetchGroupBuyData === 'function') await fetchGroupBuyData();
      } catch(gbErr) { console.error('Fetch group buy error:', gbErr); }
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
    const urlBuy = urlParams.get('buy');
    
    // ?鈭佗蕭??脫暑?嚙賡?????嚙?????buy?蕭??皝氖???蕭????嚙質
    if (!silent && urlBuy) {
      if (btnBackGroupBuy) btnBackGroupBuy.style.display = 'none';
      openGroupBuyPage(urlBuy);
    }
    // ?鈭佗蕭??脫暑?嚙賡?????嚙?????gameId?蕭??皝氖???蕭?啗?衣????銵???????
    else if (!silent && urlGameId && gamesList.some(g => g.gameId === urlGameId)) {
      renderDetail(urlGameId);
    } else if (!currentGameDetailId) {
      renderLobby();
    } else {
      renderDetail(currentGameDetailId);
    }
  } catch (err) {
    console.error(err);
    appDiv.className = ''; // ?????瞏???芰??嚙??艞??批???
    statusMsg.innerText = err.message;
    statusMsg.style.display = 'block';
  }
}

// ????皝暑??祉?????(?撖??鈭??嚙??嚙???
function isGameExpired(game) {
  return !!game.isManualEnded;
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

// ???剜頛????function renderLobby() {
    appDiv.className = '';
    if (statusMsg) statusMsg.style.display = 'none';
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    lobbyView.classList.remove('hidden');
    
    const { isAdmin: effIsAdmin, isSuperAdmin: effIsSuperAdmin } = getEffectiveRole();

    let roleSwitcherContainer = document.getElementById('super-admin-role-switcher');
    if (globalIsSuperAdmin) {
      if (!roleSwitcherContainer) {
        roleSwitcherContainer = document.createElement('div');
        roleSwitcherContainer.id = 'super-admin-role-switcher';
        lobbyView.insertBefore(roleSwitcherContainer, lobbyView.firstChild);
      }
      roleSwitcherContainer.style.display = 'block';
      roleSwitcherContainer.innerHTML = `
        <div style="margin: 10px 0 15px 0; padding: 10px 14px; background: #fff8e1; border: 1px solid #ffe082; border-radius: 10px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 2px 6px rgba(0,0,0,0.04);">
          <div style="font-size: 13px; font-weight: bold; color: #e65100; display: flex; align-items: center; gap: 6px;">
            <span>?藀??突丰??嚙? (?蕭???蕭)</span>
          </div>
          <select onchange="handleRoleSwitch(this.value)" style="padding: 5px 10px; font-size: 12px; font-weight: bold; border-radius: 6px; border: 1px solid #ffb74d; background-color: #ffffff; color: #333; cursor: pointer;">
            <option value="superAdmin" ${currentSimulatedRole === 'superAdmin' ? 'selected' : ''}>?? ?蕭??????/option>
            <option value="groupAdmin" ${currentSimulatedRole === 'groupAdmin' ? 'selected' : ''}>?璊??Ｘ??????/option>
            <option value="user" ${currentSimulatedRole === 'user' ? 'selected' : ''}>?薵? ?蕭?????鳴蕭?/option>
          </select>
        </div>
      `;
    } else if (roleSwitcherContainer) {
      roleSwitcherContainer.style.display = 'none';
    }
    
    document.getElementById('lobby-title-text').innerText = globalLobbyTitle || '?Ｚ???隞??剜頛?;
    const btnEditTitle = document.getElementById('btn-edit-title');
    if (effIsSuperAdmin && btnEditTitle) {
      btnEditTitle.classList.remove('hidden');
      btnEditTitle.onclick = handleEditLobbyTitle;
    } else if (btnEditTitle) {
      btnEditTitle.classList.add('hidden');
    }
    
    document.getElementById('lobby-desc-text').innerText = globalLobbyDesc || '?蟡蕭璇荊????輸蝙?????走蝧????姘?????????蝧啁?嚙踢??皛???;
    const btnEditDesc = document.getElementById('btn-edit-desc');
    if (effIsSuperAdmin && btnEditDesc) {
      btnEditDesc.classList.remove('hidden');
      btnEditDesc.onclick = handleEditLobbyDesc;
    } else if (btnEditDesc) {
      btnEditDesc.classList.add('hidden');
    }

    if (effIsSuperAdmin && btnLobbyStats) {
      btnLobbyStats.classList.remove('hidden');
    } else if (btnLobbyStats) {
      btnLobbyStats.classList.add('hidden');
    }

    if (effIsSuperAdmin && btnSystemLogs) {
      btnSystemLogs.classList.remove('hidden');
    } else if (btnSystemLogs) {
      btnSystemLogs.classList.add('hidden');
    }

    if (effIsSuperAdmin && btnEasterEgg) {
      btnEasterEgg.classList.remove('hidden');
    } else if (btnEasterEgg) {
      btnEasterEgg.classList.add('hidden');
    }

    if (effIsSuperAdmin && btnPartyAdmin) {
      btnPartyAdmin.classList.remove('hidden');
    } else if (btnPartyAdmin) {
      btnPartyAdmin.classList.add('hidden');
    }

    const btnGbNav = document.getElementById('btn-group-buy-nav');
    
    if (typeof renderLobbyGroupBuyBanners === 'function' && typeof allGroupBuysList !== 'undefined') {
      renderLobbyGroupBuyBanners(allGroupBuysList);
    }
    
    if (btnGbNav) {
      let userHasAccessToAnyGb = false;
      if (typeof allGroupBuysList !== 'undefined' && Array.isArray(allGroupBuysList)) {
        const isUserAdmin = effIsAdmin || effIsSuperAdmin;
        const activeGroupBuys = allGroupBuysList.filter(gb => gb.active);
        if (isUserAdmin || activeGroupBuys.some(gb => !gb.hiddenFromLobby)) {
          userHasAccessToAnyGb = true;
        }
      } else {
        const isGbActive = currentGroupBuyData && currentGroupBuyData.active && !currentGroupBuyData.hiddenFromLobby;
        userHasAccessToAnyGb = isGbActive || effIsAdmin || effIsSuperAdmin;
      }

      if (userHasAccessToAnyGb) {
        btnGbNav.classList.remove('hidden');
      } else {
        btnGbNav.classList.add('hidden');
      }
    }
    
    const createContainer = document.getElementById('admin-create-game-container');
    if (createContainer) {
      if (effIsSuperAdmin) {
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

    const getGameTime = (g) => {
      if (g.isManualEnded && g.manualEndTime) return g.manualEndTime;
      if (!g.date) return g.startTime || 0;
      
      let year = new Date().getFullYear();
      let month = 0, day = 1;
      
      const matchFull = g.date.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
      if (matchFull) {
        year = parseInt(matchFull[1]);
        month = parseInt(matchFull[2]) - 1;
        day = parseInt(matchFull[3]);
      } else {
        const matchShort = g.date.match(/(\d{1,2})[-\/](\d{1,2})/);
        if (matchShort) {
          month = parseInt(matchShort[1]) - 1;
          day = parseInt(matchShort[2]);
        } else {
          return g.startTime || 0;
        }
      }

      let hour = 23, minute = 59;
      if (g.time) {
         const tm = g.time.match(/([01]?[0-9]|2[0-3]):([0-5][0-9])/g);
         if (tm && tm.length > 0) {
            const parts = tm[tm.length - 1].split(':');
            hour = parseInt(parts[0]);
            minute = parseInt(parts[1]);
         }
      }
      return new Date(year, month, day, hour, minute).getTime();
    };

    activeGames.sort((a, b) => getGameTime(a) - getGameTime(b));

    
    const renderCard = (game) => {
      let count = 0;
      let limit = 0;
      let totalLimit = 0;
      let isMultiSection = game.sections && game.sections.length > 1;

      if (isMultiSection) {
          game.sections.forEach(s => {
              count += (s.list || []).length;
              limit += (s.limit || 0);
              totalLimit += (s.limit || 0) + (s.backupLimit || 0);
          });
      } else {
          const section = game.sections[0] || { list: [], limit: 20 };
          count = section.list.length;
          limit = section.limit;
          totalLimit = limit + (section.backupLimit || 0);
      }
      
      let displayFee = formatFee(game.fee) || '??曇澈??;
      if (isMultiSection) {
          const uniqueFees = Array.from(new Set(game.sections.map(s => s.fee ? s.fee.toString().trim() : '').filter(Boolean)));
          if (uniqueFees.length > 1) {
              const numericFees = uniqueFees.map(f => parseInt(f.replace(/[^\d]/g, ''), 10)).filter(n => !isNaN(n));
              if (numericFees.length === uniqueFees.length && numericFees.length > 0) {
                  const min = Math.min(...numericFees);
                  const max = Math.max(...numericFees);
                  displayFee = `${min}~${max}?嚙?
              } else {
                  displayFee = uniqueFees.map(f => formatFee(f)).join(' / ');
              }
          } else if (uniqueFees.length === 1) {
              displayFee = formatFee(uniqueFees[0]);
          }
      }
      
      const isExpired = isGameExpired(game);
      const isFull = count >= totalLimit;
      const isWaitlist = count >= limit && count < totalLimit;
      
      const isMeRegistered = game.myRegisteredNames && game.myRegisteredNames.length > 0;
      
      let badgeStyle = '';
      let badgeText = '';
      
      if (isExpired) {
         badgeStyle = 'background-color: #666; color: #FFF;';
         badgeText = '????;
      } else if (isFull) {
         badgeStyle = 'background-color: #E0E0E0; color: #888888;';
         badgeText = '????;
      } else if (isWaitlist) {
         badgeStyle = 'background-color: #FFF3E0; color: #E65100;';
         badgeText = '???頨???;
      } else {
         badgeText = '???藃３藀???';
      }
      
      let customTagsHtml = '';
      if (game.tag) {
         const tagArr = game.tag.split(/[,?嚙?]/).map(t => t.trim()).filter(Boolean);
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
          ${isMeRegistered ? '<div class="badge open" style="background-color: var(--primary-color); color: white;">?藆???/div>' : ''}
        </div>
        
        <div class="card-title" onclick="showDetail('${game.gameId}')" style="cursor: pointer;">
          ${escapeHTML(game.title || '?Ｚ???隞?')}
        </div>
        
        <div class="info-grid" onclick="showDetail('${game.gameId}')" style="cursor: pointer;">
          <div class="info-item">
            <span class="info-icon">??</span>
            <span>${escapeHTML(game.date || '??曇澈??)}</span>
          </div>
          <div class="info-item">
            <span class="info-icon">??/span>
            <span>${escapeHTML(game.time || '??曇澈??)}</span>
          </div>
          <div class="info-item">
            <span class="info-icon">??</span>
            <span>${escapeHTML(game.location || '??曇澈??)}</span>
          </div>
          <div class="info-item">
            <span class="info-icon">???/span>
            <span>${escapeHTML(displayFee)}</span>
          </div>
        </div>
        
        ${game.note ? `<div class="game-note" onclick="showDetail('${game.gameId}')" style="cursor: pointer;">${escapeHTML(game.note)}</div>` : ''}
        
        ${(() => {
          if (!isMultiSection) {
            const section = game.sections[0] || { list: [], limit: 20 };
            const limit = section.limit || 0;
            const count = (section.list || []).length;
            const progressPercent = limit > 0 ? Math.min(100, (count / limit) * 100) : 0;
            const progressColor = count > limit ? 'var(--danger-color)' : 'var(--primary-color)';
            return `
              <div class="progress-container" onclick="showDetail('${game.gameId}')" style="cursor: pointer;">
                <div class="progress-header">
                  <span>?瞍????撞</span>
                  <span class="progress-value" style="color: ${count > limit ? 'var(--danger-color)' : 'var(--text-main)'}">${count} / ${limit} ??/span>
                </div>
                <div class="progress-bar-bg">
                  <div class="progress-bar-fill" style="width: ${progressPercent}%; background-color: ${progressColor};"></div>
                </div>
              </div>
            `;
          } else {
            return game.sections.map(sec => {
              const secLimit = sec.limit || 0;
              const secCount = (sec.list || []).length;
              const secProgressPercent = secLimit > 0 ? Math.min(100, (secCount / secLimit) * 100) : 0;
              const secProgressColor = secCount > secLimit ? 'var(--danger-color)' : '#007BFF'; // Using blue color for multi-sections as seen in the screenshot for active section, but let's stick to theme primary unless active. Actually, the screenshot showed a blue selected state maybe? I'll use primary color.
              return `
                <div class="progress-container" onclick="showDetail('${game.gameId}')" style="cursor: pointer; margin-bottom: 8px;">
                  <div class="progress-header">
                    <span>${escapeHTML(sec.title || '?嚙賣')}</span>
                    <span class="progress-value" style="color: ${secCount > secLimit ? 'var(--danger-color)' : 'var(--text-main)'}">${secCount} / ${secLimit} ??/span>
                  </div>
                  <div class="progress-bar-bg">
                    <div class="progress-bar-fill" style="width: ${secProgressPercent}%; background-color: ${secCount > secLimit ? 'var(--danger-color)' : 'var(--primary-color)'};"></div>
                  </div>
                </div>
              `;
            }).join('');
          }
        })()}
      `;
        
      let actionRowHtml = '';
        if (isMultiSection) {
            actionRowHtml = `
              <div class="action-row" style="margin-top: 10px;">
                  <button class="btn btn-primary" style="width: 100%; border-radius: 8px; padding: 12px; font-size: 16px; background-color: #03c75a; border: none; box-shadow: 0 2px 4px rgba(3,199,90,0.3);" onclick="showDetail('${game.gameId}')">
                     ?? ???衣???????嚙賣?掘??艟?嚙質嚙???
                  </button>
              </div>
            `;
        } else {
            actionRowHtml = `
              <div class="action-row" style="flex-wrap: wrap;">
                <button class="btn btn-primary btn-square" ${(isFull || isExpired) ? 'disabled style="opacity:0.5"' : ''} onclick="handleActionWithInput(event, '${game.gameId}', 'register')">+1</button>
                <button class="btn btn-danger btn-square" ${isExpired ? 'disabled style="opacity:0.5"' : ''} onclick="handleActionWithInput(event, '${game.gameId}', 'cancel')">-1</button>
                <input type="text" id="name-input-${game.gameId}" class="name-input" placeholder="?Ｚ???鈭日遘?? ${isExpired ? 'disabled' : ''} style="flex: 2; min-width: 100px; font-weight: bold; color: #333;" />
                <input type="text" id="level-input-${game.gameId}" class="name-input" placeholder="?頨圈?" ${isExpired ? 'disabled' : ''} style="flex: 1; min-width: 60px; margin-left: 8px; font-weight: bold;" />
              </div>
              <div id="error-msg-${game.gameId}" class="error-msg"></div>
            `;
        }
        
        card.innerHTML += actionRowHtml;
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
      summaryEl.innerText = `???瘥???(${endedGames.length})`;
      
      const contentEl = document.createElement('div');
      contentEl.style.marginTop = '15px';
      
      endedGames.sort((a, b) => getGameTime(b) - getGameTime(a));
      
      endedGames.forEach(game => contentEl.appendChild(renderCard(game)));
      
      detailsEl.appendChild(summaryEl);
      detailsEl.appendChild(contentEl);
      gamesContainer.appendChild(detailsEl);
    }
  
  // ?皝做?嚙?藃３???(?嚙踢?????嚙??ㄛㄥ?????appDiv.className='' ?嚙賡?鈭??嚙??剜╡??蝛蕭???????
  const headerP = document.querySelector('.lobby-header p');
  if (headerP) headerP.innerText = '?粹?嚙賜??????蕭?箔????銊??蕭嚙??剁蕭???;
  const statusEl = document.getElementById('status-msg');
  if (statusEl) statusEl.style.display = 'none';
}

async function handleEditLobbyTitle() {
  const newTitle = prompt('?Ｚ???鈭日做?嚙賭??勗??蹂??', globalLobbyTitle || '');
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
      alert('?賣蒪踵??');
    }
  } catch(e) {
    alert('?祈璆??芰?');
  } finally {
    appDiv.className = '';
  }
}

async function handleEditLobbyDesc() {
  const newDesc = prompt('?Ｚ???鈭日做?嚙賭??勗?擗??', globalLobbyDesc || '');
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
      alert('?賣蒪踵??');
    }
  } catch (err) {
    alert('?祈璆??芰?');
  } finally {
    appDiv.className = '';
  }
}

// ????蕭??未?朣??臐??
async function handleAction(gameId, action) {
  try {
    appDiv.className = 'loading';
    statusMsg.innerText = '?????..';
    
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
      alert(result.error || '?瞏???芰?');
      await loadGamesLobby();
      return;
    }
    
    // ?艞??箏???????????????唾??
    const idx = gamesList.findIndex(g => g.gameId === gameId);
    if (idx !== -1) gamesList[idx] = result.game;
    
    if (currentGameDetailId) {
      renderDetail(gameId, true);
    } else {
      renderLobby();
    }
  } catch (err) {
    console.error(err);
    alert('?祈璆??芰??姘?????皛拙疵');
    await loadGamesLobby();
  }
}

// ?????藆???
async function handleProxyRegister(gameId) {
  const input = document.getElementById(`proxy-name-${gameId}`);
  if (!input) return;
  const name = input.value.trim();
  if (!name) {
    alert('?Ｚ???銋抵爸????皛刻?');
    return;
  }
  
  try {
    appDiv.className = 'loading';
    statusMsg.innerText = '??藆??皛??嚙質?...';
    
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
      alert(result.error || '?瞏???芰?');
      await loadGamesLobby();
      return;
    }
    
    input.value = '';
    const idx = gamesList.findIndex(g => g.gameId === gameId);
    if (idx !== -1) gamesList[idx] = result.game;
    renderLobby();
    
  } catch (err) {
    console.error(err);
    alert('?祈璆??芰??姘?????皛拙疵');
    await loadGamesLobby();
  }
}
// ?嚙??????藃???
window.showDetail = function(gameId) {
  currentGameDetailId = gameId;
  renderDetail(gameId);
};

// ???臐??????function renderDetail(gameId, preserveScroll = false) {
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
  
  const { isAdmin: effIsAdmin, isSuperAdmin: effIsSuperAdmin } = getEffectiveRole();

  const normalize = s => (s||'').replace(/\s+/g, '');
  const autoStr = normalize([game.date, game.time, game.location].filter(Boolean).join(''));
  const isAutoTitle = normalize(game.title) === autoStr || game.title === '?Ｚ???隞?';
  const showTitle = game.title && !isAutoTitle;
  detailTitle.innerText = showTitle ? game.title : '?皝暑?臐???;
  if (!showTitle) detailTitle.style.display = 'none';
  else detailTitle.style.display = 'block';
  
  const btnCloseGame = document.getElementById('btn-close-game');
  const btnDeleteGame = document.getElementById('btn-delete-game');
  const btnEditGame = document.getElementById('btn-edit-game');
  const btnCopyList = document.getElementById('btn-copy-list');
  if (btnCopyList) {
    btnCopyList.classList.remove('hidden');
    btnCopyList.onclick = () => {
      const list = game.sections[0]?.list || [];
      const text = list.map(n => n === '__ANON__' ? '?頦??嚙?' : n).join('\n');
      navigator.clipboard.writeText(text).then(() => {
        alert('?皛?????????\n\n' + text);
      }).catch(() => {
        prompt('?Ｚ???陪隤?閫??畾?', text);
      });
    };
  }

  if (effIsAdmin) {
    if (btnCloseGame) {
      btnCloseGame.classList.remove('hidden');
      if (game.isManualEnded) {
        btnCloseGame.innerText = '????;
        btnCloseGame.disabled = true;
        btnCloseGame.style.opacity = '0.5';
        btnCloseGame.style.cursor = 'not-allowed';
      } else {
        btnCloseGame.innerText = '?舫??';
        btnCloseGame.disabled = false;
        btnCloseGame.style.opacity = '1';
        btnCloseGame.style.cursor = 'pointer';
      }
    }
    if (btnDeleteGame) btnDeleteGame.classList.remove('hidden');
    if (btnEditGame) {
      btnEditGame.classList.remove('hidden');
      btnEditGame.onclick = () => showEditGameForm(gameId);
    }
  } else {
    if (btnCloseGame) btnCloseGame.classList.add('hidden');
    if (btnDeleteGame) btnDeleteGame.classList.add('hidden');
    if (btnEditGame) btnEditGame.classList.add('hidden');
  }
  
  const section = game.sections[0] || { list: [], limit: 20 };
  const isRegistered = game.myRegisteredNames && game.myRegisteredNames.length > 0;
  
  let isMultiSection = game.sections && game.sections.length > 1;
  let totalListLen = 0;
  let totalLimit = 0;
  if (game.sections) {
      game.sections.forEach(s => {
          totalListLen += (s.list || []).length;
          totalLimit += (s.limit || 0);
      });
  }
  
  detailCount.innerText = `${isRegistered ? '(?藆??? ' : ''}${isMultiSection ? totalListLen : section.list.length} / ${isMultiSection ? totalLimit : section.limit}`;
  const isExpired = isGameExpired(game);
  
  // NOTE: When multi-section, the +1 button should not be disabled strictly based on total isFull, 
  // because users could still +1 to a section that isn't full, or we just let them try and server rejects it.
  // We'll leave it enabled unless expired, and server will validate.
  const isFullSingle = !isMultiSection && section.list.length >= (section.limit + (section.backupLimit || 0));

  let actionRowHtml = '';
  if (isMultiSection) {
      actionRowHtml += '<div class="section-options" style="margin-top: 15px; margin-bottom: 10px;">';
      game.sections.forEach((sec, idx) => {
          const secIsFull = sec.list.length >= sec.limit;
          const progress = Math.min(100, Math.round((sec.list.length / sec.limit) * 100));
          
          actionRowHtml += `
            <label class="section-option ${secIsFull ? 'full' : ''}" style="display: block; border: 2px solid ${secIsFull ? '#ffebee' : '#e8f5e9'}; border-radius: 8px; padding: 10px; margin-bottom: 8px; cursor: pointer; position: relative; background: ${secIsFull ? '#fffafa' : '#fcfdfc'};">
                <input type="radio" name="sectionIdx-${game.gameId}-detail" value="${idx}" ${idx === 0 ? 'checked' : ''} style="position: absolute; right: 15px; top: 20px; transform: scale(1.5);">
                <div style="padding-right: 30px;">
                    <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:16px; margin-bottom: 8px;">
                        <span style="color: #333;">${escapeHTML(sec.title)}</span>
                        ${sec.fee ? `<span style="color: var(--primary-color); font-size: 14px;">???${escapeHTML(formatFee(sec.fee))}</span>` : ''}
                    </div>
                    <div style="background-color: #eee; height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 5px;">
                        <div style="background-color: ${secIsFull ? '#F44336' : '#4CAF50'}; height: 100%; width: ${progress}%;"></div>
                    </div>
                    <div style="text-align: right; font-size: 13px; color: ${secIsFull ? '#F44336' : '#666'};">
                        ${sec.list.length} / ${sec.limit} ??${secIsFull ? '(???' : ''}
                    </div>
                </div>
            </label>
          `;
      });
      actionRowHtml += '</div>';
  }

  actionRowHtml += `
    <div class="action-row" style="flex-wrap: wrap; margin-top: ${isMultiSection ? '5px' : '15px'}; margin-bottom: 10px;">
      <button class="btn btn-primary btn-square" ${(isFullSingle || isExpired) ? 'disabled style="opacity:0.5"' : ''} onclick="handleActionWithInput(event, '${game.gameId}', 'register', '-detail')">+1</button>
      <button class="btn btn-danger btn-square" ${isExpired ? 'disabled style="opacity:0.5"' : ''} onclick="handleActionWithInput(event, '${game.gameId}', 'cancel', '-detail')">-1</button>
      <input type="text" id="name-input-${game.gameId}-detail" class="name-input" placeholder="?Ｚ???鈭日遘?? ${isExpired ? 'disabled' : ''} style="flex: 2; min-width: 100px; font-weight: bold; color: #333;" />
      <input type="text" id="level-input-${game.gameId}-detail" class="name-input" placeholder="?頨圈?" ${isExpired ? 'disabled' : ''} style="flex: 1; min-width: 60px; margin-left: 8px; font-weight: bold;" />
    </div>
    <div id="error-msg-${game.gameId}-detail" class="error-msg"></div>
  `;
  
  detailList.innerHTML = actionRowHtml;
  
  if (effIsSuperAdmin) {
    let pushListBtn = document.getElementById('admin-push-list-btn');
    if (!pushListBtn) {
      pushListBtn = document.createElement('button');
      pushListBtn.id = 'admin-push-list-btn';
      pushListBtn.className = 'btn btn-primary';
      pushListBtn.style.marginTop = '10px';
      pushListBtn.style.marginBottom = '15px';
      pushListBtn.style.width = '100%';
      pushListBtn.style.backgroundColor = '#FF9800';
      pushListBtn.innerText = '?薴 ??賢??獢??啣???皛?';
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
     if (game.date) tagsHtml += `<span class="info-tag">?? ${escapeHTML(game.date)}</span>`;
     if (game.time) tagsHtml += `<span class="info-tag">??${escapeHTML(game.time)}</span>`;
     tagsHtml += '</div>';
     tagsHtml += '<div class="info-row" style="margin-top: 4px;">';
     if (game.location) tagsHtml += `<span class="info-tag">?? ${escapeHTML(game.location)}</span>`;
     if (game.fee) tagsHtml += `<span class="info-tag">???${escapeHTML(formatFee(game.fee))}</span>`;
     tagsHtml += '</div>';
     tagsHtml += '</div>';
     detailList.innerHTML += tagsHtml;
  }
  if (game.note) {
     detailList.innerHTML += `<div class="game-note">${escapeHTML(game.note)}</div>`;
  }
  

  
  let historyHtml = '<div class="history-section" style="margin-top: 15px; margin-bottom: 15px; padding: 10px; background-color: #fafafa; border-radius: 8px; border-left: 4px solid #90caf9;">';
  historyHtml += '<h4 style="margin: 0 0 8px 0; color: #333; font-size: 14px;">???株?嚙??/h4>';
  historyHtml += '<div style="font-size: 13px; color: #555;">';
  if (game.history && game.history.length > 0) {
    const top2 = game.history.slice(0, 2);
    const rest = game.history.slice(2);
    
    top2.forEach(h => {
       let displayText = '';
       if (h.action === '??芰?') {
         historyHtml += `<div style="margin-bottom: 4px; color: #F44336; font-size: 12px;">${escapeHTML(h.time)} <strong>[??蝯??芰?]</strong> ${escapeHTML(h.errorMsg || '')}</div>`;
         return;
       }
       if (h.operator && h.operator !== h.name) {
         displayText = `${escapeHTML(h.operator)} ??${escapeHTML(h.name)}`;
       } else if (h.operator) {
         displayText = escapeHTML(h.operator);
       } else {
         displayText = escapeHTML(h.name);
       }
       historyHtml += `<div style="margin-bottom: 4px;">${escapeHTML(h.time)} <strong>${displayText}</strong> <span style="color: ${h.action === '+1' ? '#4CAF50' : '#F44336'}; font-weight: bold;">${escapeHTML(h.action)}</span></div>`;
    });
    
    if (rest.length > 0) {
       historyHtml += `<details style="margin-top: 8px;">
           <summary style="cursor: pointer; color: #1976d2; font-weight: bold; outline: none;">?輯???皜? (${rest.length})</summary>
           <div style="max-height: 120px; overflow-y: auto; margin-top: 6px; padding-left: 8px; border-left: 2px solid #ddd;">`;
       rest.forEach(h => {
           let displayText = '';
           if (h.action === '??芰?') {
             historyHtml += `<div style="margin-bottom: 4px; color: #F44336; font-size: 12px;">${escapeHTML(h.time)} <strong>[??蝯??芰?]</strong> ${escapeHTML(h.errorMsg || '')}</div>`;
             return;
           }
           if (h.operator && h.operator !== h.name) {
             displayText = `${escapeHTML(h.operator)} ??${escapeHTML(h.name)}`;
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
    historyHtml += '<div style="color: #999; font-style: italic;">?獢???塚蕭???株?嚙??/div>';
  }
  historyHtml += '</div></div>';
  detailList.innerHTML += historyHtml;
  
  // ?輯???嚙?????(??蕭頨?)
  game.sections.forEach((sec, sIdx) => {
    const secDiv = document.createElement('div');
    secDiv.className = 'list-section';
    secDiv.innerHTML = `<h3>${escapeHTML(sec.title)} (??? ${sec.limit})</h3>`;
    
    for (let i = 0; i < sec.limit; i++) {
      if (i < sec.list.length) {
        const name = sec.list[i];
        const displayName = (name === '__ANON__') ? '***' : name;
        const isMe = (game.myRegisteredNames && game.myRegisteredNames.includes(name)) || (currentUser && (currentUser.displayName === name || currentUser.displayName === displayName));
        const levelStr = game.levelMap && game.levelMap[name] ? `<span style="font-size: 12px; color: #888; margin-left: 8px;">(${escapeHTML(game.levelMap[name])})</span>` : '';
        
        const canCancel = name !== '__ANON__';
        
        const isPaid = game.paidMap && game.paidMap[name];
        let paidHtml = '';
        if (canCancel) {
          if (effIsAdmin) {
            paidHtml = `<button class="paid-btn ${isPaid ? 'paid' : ''}" onclick="handleTogglePaid('${game.gameId}', '${escapeHTML(name)}')">${isPaid ? '??????? : '瞍???啣???}</button>`;
          } else if (isPaid) {
            paidHtml = `<span class="paid-badge">???????/span>`;
          }
        }

        const noteVal = (game.noteMap && game.noteMap[name]) ? game.noteMap[name] : '';
        const canEditNote = true;
        let noteHtml = '';
        if (canCancel) {
          if (canEditNote) {
            noteHtml = `<button class="note-btn ${noteVal ? 'has-note' : ''}" onclick="handleEditNote('${game.gameId}', '${escapeHTML(name)}')">${noteVal ? escapeHTML(noteVal) : '?? ?頨圈?'}</button>`;
          } else if (noteVal) {
            noteHtml = `<span class="note-badge">${escapeHTML(noteVal)}</span>`;
          }
        }
        
        let moveHtml = '';
        if (effIsAdmin) {
          const canMoveUp = i > 0;
          const canMoveDown = i < sec.list.length - 1;
          moveHtml = `
            <div style="display:flex; flex-direction:column; margin-right: 5px; min-width: 20px;">
              <button class="btn-icon" style="padding:0; font-size: 12px; margin:0; line-height: 1; opacity: ${canMoveUp ? 1 : 0.2}" ${canMoveUp ? `onclick="handleReorder('${game.gameId}', ${i}, ${i-1}, ${sIdx})"` : 'disabled'}>???/button>
              <button class="btn-icon" style="padding:0; font-size: 12px; margin:0; line-height: 1; opacity: ${canMoveDown ? 1 : 0.2}" ${canMoveDown ? `onclick="handleReorder('${game.gameId}', ${i}, ${i+1}, ${sIdx})"` : 'disabled'}>?薴?</button>
            </div>
          `;
        }
        
        secDiv.innerHTML += `
          <div class="list-item">
            ${moveHtml}
            <div class="list-num">${i + 1}.</div>
            <div class="list-name ${isMe ? 'me' : ''}">${escapeHTML(displayName)}${levelStr}</div>
            ${paidHtml}
            ${noteHtml}
            ${(canCancel && !isGameExpired(game)) ? `<button class="btn-icon" style="color:var(--danger-color); padding: 4px; margin: 0; font-size: 16px;" onclick="handleCancelByName('${game.gameId}', '${escapeHTML(name)}')">??/button>` : ''}
          </div>
        `;
      }
    }
    
    // ?頨??皛?
    if (sec.list.length > sec.limit) {
      secDiv.innerHTML += `<h3 style="margin-top:20px; color:#ff9800">?頨??皛?</h3>`;
      for (let i = sec.limit; i < sec.list.length; i++) {
        const name = sec.list[i];
        const displayName = (name === '__ANON__') ? '***' : name;
        const isMe = (game.myRegisteredNames && game.myRegisteredNames.includes(name)) || (currentUser && (currentUser.displayName === name || currentUser.displayName === displayName));
        const levelStr = game.levelMap && game.levelMap[name] ? `<span style="font-size: 12px; color: #888; margin-left: 8px;">(${escapeHTML(game.levelMap[name])})</span>` : '';
        
        const canCancel = name !== '__ANON__';
        
        const isPaid = game.paidMap && game.paidMap[name];
        let paidHtml = '';
        if (canCancel) {
          if (effIsAdmin) {
            paidHtml = `<button class="paid-btn ${isPaid ? 'paid' : ''}" onclick="handleTogglePaid('${game.gameId}', '${escapeHTML(name)}')">${isPaid ? '??????? : '瞍???啣???}</button>`;
          } else if (isPaid) {
            paidHtml = `<span class="paid-badge">???????/span>`;
          }
        }
        
        const noteVal = (game.noteMap && game.noteMap[name]) ? game.noteMap[name] : '';
        const canEditNote = true;
        let noteHtml = '';
        if (canCancel) {
          if (canEditNote) {
            noteHtml = `<button class="note-btn ${noteVal ? 'has-note' : ''}" onclick="handleEditNote('${game.gameId}', '${escapeHTML(name)}')">${noteVal ? escapeHTML(noteVal) : '?? ?頨圈?'}</button>`;
          } else if (noteVal) {
            noteHtml = `<span class="note-badge">${escapeHTML(noteVal)}</span>`;
          }
        }

        let moveHtml = '';
        if (effIsAdmin) {
          const canMoveUp = i > 0;
          const canMoveDown = i < sec.list.length - 1;
          moveHtml = `
            <div style="display:flex; flex-direction:column; margin-right: 5px; min-width: 20px;">
              <button class="btn-icon" style="padding:0; font-size: 12px; margin:0; line-height: 1; opacity: ${canMoveUp ? 1 : 0.2}" ${canMoveUp ? `onclick="handleReorder('${game.gameId}', ${i}, ${i-1}, ${sIdx})"` : 'disabled'}>???/button>
              <button class="btn-icon" style="padding:0; font-size: 12px; margin:0; line-height: 1; opacity: ${canMoveDown ? 1 : 0.2}" ${canMoveDown ? `onclick="handleReorder('${game.gameId}', ${i}, ${i+1}, ${sIdx})"` : 'disabled'}>?薴?</button>
            </div>
          `;
        }
        
        secDiv.innerHTML += `
          <div class="list-item" style="opacity: 0.8; background-color: #f9f9f9;">
            ${moveHtml}
            <div class="list-num" style="color: #666; font-size: 12px;">??${i - sec.limit + 1}.</div>
            <div class="list-name ${isMe ? 'me' : ''}" style="color: #666;">${escapeHTML(displayName)}${levelStr}</div>
            ${paidHtml}
            ${noteHtml}
            ${(canCancel && !isGameExpired(game)) ? `<button class="btn-icon" style="color:var(--danger-color); padding: 4px; margin: 0; font-size: 16px;" onclick="handleCancelByName('${game.gameId}', '${escapeHTML(name)}')">??/button>` : ''}
          </div>
        `;
      }
    }
    
    detailList.appendChild(secDiv);
  });
}

// 擗左??剜頛?btnBack.addEventListener('click', () => {
  currentGameDetailId = null;
  renderLobby();
});

const btnCloseGame = document.getElementById('btn-close-game');
if (btnCloseGame) {
  btnCloseGame.addEventListener('click', async () => {
    if (!currentGameDetailId) return;
    if (!confirm('?????穿蕭??嚙質縐?皝暑????\n?舫???綽蕭銋???輯???蝞蕭????菜????)) return;
    
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
          action: 'editGame',
          isManualEnded: true
        })
      });
      const result = await res.json();
      if (!res.ok) alert(result.error || '?皛??剜??');
      else {
        alert('?皝暑???嚙?');
        currentGameDetailId = null;
        await loadGamesLobby();
      }
    } catch (e) {
      alert('?祈璆??芰?');
    } finally {
      appDiv.className = '';
    }
  });
}

const btnDeleteGame = document.getElementById('btn-delete-game');
if (btnDeleteGame) {
  btnDeleteGame.addEventListener('click', async () => {
    if (!currentGameDetailId) return;
    if (!confirm('?????穿蕭?園?嚙賤???縐?皝暑????????遲戌蛛蕭????嚙?')) return;
    
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
          action: 'deleteGame'
        })
      });
      const result = await res.json();
      if (!res.ok) alert(result.error || '??瑁??剜??');
      else {
        alert('?皝暑???甇?');
        currentGameDetailId = null;
        await loadGamesLobby();
      }
    } catch (e) {
      alert('?祈璆??芰?');
    } finally {
      appDiv.className = '';
    }
  });
}

// ?瞉??薴?蟡????鈭佗蕭?嚙??皛????
function formatFee(fee) {
  if (!fee || fee === '??曇澈?? || fee === '??唬偵' || fee === '?? || fee === '0') return fee || '';
  let str = fee.toString().trim();
  if (str && !str.endsWith('??)) {
    return str + '??;
  }
  return str;
}

// HTML ?嚙踝蕭?鞈????XSS
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

// ?艞??朣輸做?皜??蕭? (?慾嚗?loading)
let refreshPending = false;

async function silentRefreshGames() {
  if (!currentGroupId || !currentUser) return;
  
  // ?銋抵???鳴蕭嚙質縣??餅??隡?????皝做????薴薵?岳嚙?  const activeTag = document.activeElement ? document.activeElement.tagName : '';
  if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
    if (!refreshPending) {
      refreshPending = true;
      setTimeout(() => {
        refreshPending = false;
        silentRefreshGames();
      }, 1500); // 1.5 ???皛拙疵
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
        globalLobbyTitle = data.lobbyTitle || '?Ｚ???隞??剜頛?;
        globalLobbyDesc = data.lobbyDesc || '?蟡蕭璇荊????輸蝙?????走蝧????姘?????????蝧啁?嚙踢??皛???;
        
        // ?撖??獢??嚙??踢??嚚???唾??
        if (currentGameDetailId && !detailView.classList.contains('hidden')) {
          renderDetail(currentGameDetailId, true);
        } else {
          renderLobby();
        }
      }
    }
  } catch (err) {
    // ?艞??剜???蝙???
  }
}

// --- SSE ?????賢???嚙?---
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
    // ?瞏???芰??臐?薵?綾???掘??????詨???臐?撗?瞍歹蕭?
    eventSource.close();
    eventSource = null;
    setTimeout(setupSSE, 5000);
  };
}

// ?蝚?
initializeLiff().then(() => {
  setupSSE();
});

// ?隤??皛刻??臐?????
window.handleCancelByName = async function(gameId, name) {
  if (!confirm(`?????穿蕭??剁蕭嚙?{name}?皛????????`)) return;
  try {
    appDiv.className = 'loading';
    statusMsg.innerText = '?臐????..';
    
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
      alert(result.error || '?瞏???芰?');
      await loadGamesLobby();
      return;
    }
    
    const idx = gamesList.findIndex(g => g.gameId === gameId);
    if (idx !== -1) gamesList[idx] = result.game;
    renderDetail(gameId, true);
    
  } catch (err) {
    console.error(err);
    alert('?祈璆??芰??姘?????皛拙疵');
    await loadGamesLobby();
  }
};

// --- Quokka ??攻??霈 ---
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
  
  // ??
  getTransparentImage('images/quokka_carry_2.png', (src) => {
    floatingQuokka._img.src = src;
  });
  
  // ?憓折????
  floatingQuokka.style.transition = 'transform 1s ease-in-out';
  floatingQuokka.style.transform = 'translate(0px, 0px)';
  
  setTimeout(() => {
    // ????擗????
    floatingQuokka.style.transition = 'transform 0.2s';
    floatingQuokka.style.transform = 'translate(0px, 10px)';
    
    setTimeout(() => {
      floatingQuokka.style.transform = 'translate(0px, 0px)';
      
      // ?輯???嚙質縣?嚙???
      btn.style.visibility = 'visible';
      
      // ?? ?????
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

// ???????岳嚙賜嚙踢未?皛????
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
  
  // Find selected section
  let sectionIdx = 0;
  const radioGroup = document.querySelector(`input[name="sectionIdx-${gameId}${suffix}"]:checked`);
  if (radioGroup) {
      sectionIdx = parseInt(radioGroup.value, 10);
  } else {
      // If there's a multiple section layout but nothing is checked (should have default checked though)
      const anyRadio = document.querySelector(`input[name="sectionIdx-${gameId}${suffix}"]`);
      if (anyRadio) sectionIdx = parseInt(anyRadio.value, 10);
  }
  
  const section = game.sections[sectionIdx] || { list: [] };
  
  let existsAnywhere = false;
  game.sections.forEach(s => {
      if (s.list.includes(name)) existsAnywhere = true;
  });
  
  if (action === 'register' && existsAnywhere) {
    errorEl.innerText = '??豢??祆?藆??瞍??哨蕭??亥????橘蕭?蕭?嚙賣??;
    errorEl.style.display = 'block';
    return;
  }
  
  if (action === 'cancel' && !existsAnywhere) {
    errorEl.innerText = '?????唾縐?皛刻?';
    errorEl.style.display = 'block';
    return;
  }
  
  // btn already declared at top of function ??just use it
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
        sectionIdx: sectionIdx,
        clientSupportsLiffSendMessage: typeof liff !== 'undefined' && liff.isInClient()
      })
    });
    
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || '?皛??剜??');
    }

    // ?????賢??皛???嚙賢?臐?嚙?嚙質???liff.sendMessages
    if (data.triggerBumpMsg) {
      // ?臐?撗??liff.sendMessages?蕭???LINE ?藃３??嚙踝蕭?梁?嚙質?瘙??嗉??朣??嚙?
      if (typeof liff !== 'undefined' && liff.isInClient()) {
        try {
          await liff.sendMessages([{ type: 'text', text: data.triggerBumpMsg + '\n\n[??蝯???' }]);
          console.log('????瞏詨??艞?');
        } catch (e) {
          console.error('liff.sendMessages ?剜??:', e);
          fetch('/api/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              gid: currentGroupId, gameId: gameId, uid: currentUser.userId, name: name, operatorName: currentUser.displayName, action: 'logError', text: '?????: ' + e.message
            })
          }).catch(console.error);
        }
      }
    }
    
    // +1/-1 ?啣???箔???蕭敺?璇??嚙??桅???鈭?
    if (inputEl) {
      inputEl.value = '';
    }
    if (levelEl) {
      levelEl.value = '';
    }
    
    await loadGamesLobby(true); // ?輯撒??艞??蒺????批??嚙???怨翰???????
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
    statusMsg.innerText = '?皝做??..';
    
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
      alert(result.error || '?瞏???芰?');
      await loadGamesLobby();
      return;
    }
    
    const idx = gamesList.findIndex(g => g.gameId === gameId);
    if (idx !== -1) gamesList[idx] = result.game;
    renderDetail(gameId, true);
    
  } catch (err) {
    console.error(err);
    alert('?祈璆??芰??姘?????皛拙疵');
    await loadGamesLobby();
  }
}

window.handleTogglePaid = handleTogglePaid;

async function handleEditNote(gameId, name) {
  try {
    const game = gamesList.find(g => g.gameId === gameId);
    const currentNote = (game && game.noteMap && game.noteMap[name]) ? game.noteMap[name] : '';
    const newNote = prompt(`?Ｚ???銋蕭?{name}?霈??頨圈??咫, currentNote);
    if (newNote === null) return;
    
    appDiv.className = 'loading';
    if (statusMsg) {
      statusMsg.style.display = 'block';
      statusMsg.innerText = '?皝做?頨圈???..';
    }
    
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gid: currentGroupId,
        gameId: gameId,
        uid: currentUser.userId,
        name: name,
        action: 'updateNote',
        note: newNote.trim()
      })
    });
    
    const result = await res.json();
    if (!res.ok) {
      alert(result.error || '?瞏???芰?');
      await loadGamesLobby();
      return;
    }
    
    const idx = gamesList.findIndex(g => g.gameId === gameId);
    if (idx !== -1) gamesList[idx] = result.game;
    renderDetail(gameId, true);
  } catch (err) {
    console.error(err);
    alert('?祈璆??芰??姘?????皛拙疵');
    await loadGamesLobby();
  }
}

window.handleEditNote = handleEditNote;



window.handleReorder = async function(gameId, fromIdx, toIdx, sectionIdx = 0) {
  try {
    appDiv.className = 'loading';
    statusMsg.style.display = 'block';
    statusMsg.innerText = '?皝做?嚙???..';
    
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
        toIdx: toIdx,
        sectionIdx: sectionIdx
      })
    });
    
    const result = await res.json();
    if (!res.ok) {
      alert(result.error || '?瞏???芰?');
      await loadGamesLobby();
      return;
    }
    
    const idx = gamesList.findIndex(g => g.gameId === gameId);
    if (idx !== -1) gamesList[idx] = result.game;
    renderDetail(gameId, true);
  } catch (err) {
    console.error(err);
    alert('?祈璆??芰??姘?????皛拙疵');
    await loadGamesLobby();
  } finally {
    appDiv.className = '';
    const statusMsgEl = document.getElementById('status-msg');
    if (statusMsgEl) statusMsgEl.style.display = 'none';
  }
};

window.handleCustomPush = async function() {
  const text = prompt('?Ｚ???鈭???賢??嚙???穿蕭?啣??\n(??蝯?嚙賭??閮恍??嚙??坎脖皎?嚙??剜頛???)');
  if (!text) return;
  
  const pushToAll = confirm('?Ｚ????祉??穿蕭嚙踝蕭??嚙賜陲??蕭皛蕭???????嚙???拚??荔蕭?\n(?隞選蕭?臐???蕭????陲??蕭????Ｘ?)');
  
  try {
    appDiv.className = 'loading';
    if (statusMsg) {
      statusMsg.style.display = 'block';
      statusMsg.innerText = '??賢??瞏殷蕭嚙質?...';
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
      alert(result.error || '?瞏殷蕭嚙賭???);
    } else {
      alert(`??賢??艞??蕭甇?瞏殷蕭嚙賜? ${result.count} ?霈??荔蕭嚙踝蕭);
    }
  } catch(e) {
    alert('?祈璆??芰?');
  } finally {
    appDiv.className = '';
    const statusMsg = document.getElementById('status-msg');
    if (statusMsg) statusMsg.style.display = 'none';
  }
};

window.handlePushList = async function(gameId) {
  let groupsText = '';
  if (typeof globalManagedGroups !== 'undefined' && globalManagedGroups.length > 0) {
    groupsText = '\n\n????嚙賡??荔蕭?\n' + globalManagedGroups.map(g => `${g.code} - ${g.groupName}`).join('\n');
  } else {
    const savedCg = JSON.parse(localStorage.getItem('savedTargetGroups') || '[]');
    if (savedCg.length > 0) {
      groupsText = '\n\n????嚙賡??荔蕭?\n' + savedCg.map(g => `${g.code} - ${g.groupName}`).join('\n');
    }
  }

  const targetCode = prompt(`?Ｚ???鈭???賢??皛??嚙踝蕭艞?薴??暺嚙質爸??膠嚙賬答?\n(?鈭斤?瞏殷蕭嚙賜???踢??朣?????Ｘ??姘??皝氖??菔???????)${groupsText}`);
  if (targetCode === null) return;
  
  if (!confirm('?????穿蕭蝬??蕭艞?薴??皛拙?????湛蕭皛??姪n(????嚙??嚙????嚙??桃嚙踝蕭嚙??偌鈭?航?)')) return;
  
  try {
    appDiv.className = 'loading';
    const statusMsg = document.getElementById('status-msg');
    if (statusMsg) {
      statusMsg.style.display = 'block';
      statusMsg.innerText = '??賢??皛???..';
    }
    
    // ?蕭???剛?????瞏詨???????嚙??摮??Ｘ??????艞???銋抵爸?頩???鳴蕭嚙踝蕭嚙賣??撜陲?????蕭朣???
    if (!targetCode && typeof liff !== 'undefined' && liff.isInClient()) {
      try {
        await liff.sendMessages([{ type: 'text', text: `??賢????\n\n[??蝯???` }]);
        alert('???皛???賢??艞??蕭甇???????剜???瞉????仿蝞蕭?);
        return;
      } catch (e) {
        console.error('????瞏詨??剜??:', e);
        // Fallback to backend API
      }
    }
    
    // ?隤??綾ㄛ??賢? (?嚙??Ｘ?????艞?嚙賜?????找???
    const reqBody = {
      gid: currentGroupId,
      gameId: gameId,
      uid: currentUser.userId,
      name: currentUser.displayName,
      action: 'pushList',
      clientSupportsLiffSendMessage: false
    };
    if (targetCode) reqBody.targetCode = targetCode.trim();
    
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody)
    });
    
    const result = await res.json();
    if (!res.ok) {
      alert(result.error || '?瞏殷蕭嚙賭???);
      return;
    }
    
    if (result.partialError) {
      alert('???仿蝞貊陲??蕭?嚙賭??? ' + result.errors.join(', '));
    } else {
      alert('???皛???賢??嚙質??嚙踝蕭??嚙???殷蕭?嚙??氣?偵??蕭?);
    }
  } catch(e) {
    alert('?祈璆??芰?');
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
  span.innerText = code === '?獢??Ｘ?' ? `${groupName} (?獢??Ｘ?)` : `${groupName} (${code})`;
  span.style.flex = '1';
  
  lbl.appendChild(chk);
  lbl.appendChild(span);
  
  const delBtn = document.createElement('span');
  delBtn.innerText = '??;
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
  if (!code) return alert('?Ｚ???鈭阡??荔蕭隤??);
  
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
      setTimeout(() => alert(data.error || '???????Ｘ?'), 10);
    }
  } catch(e) {
    appDiv.className = '';
    setTimeout(() => alert('?祈璆??芰?'), 10);
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

// === ??梯澈?皛???? UI ===
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
     if (p) line += `(????`;
     lines.push(line);
  });
  return lines.join('\n');
}

function parseAndRenderCgList(text) {
  const container = document.getElementById('cg-initial-list-container');
  container.innerHTML = '';
  if (!text) return;
  const lines = text.split(/[\n?嚙?,]+/).map(n => n.trim()).filter(Boolean);
  lines.forEach(line => {
    let isPaid = false;
    let name = line;
    if (name.endsWith('$') || name.endsWith('??) || name.endsWith('(????') || name.endsWith('?蕭甇??曄孕??)) {
        isPaid = true;
        name = name.replace(/[\$?蕭$/, '').replace(/\(?????$/, '').replace(/?蕭甇??曄孕??/, '');
    }
    let level = '';
    const match = name.match(/^(.*?)(?:[\(\[??.*?)[\)\]??|-(.*?))$/);
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
  nameInput.placeholder = '?芣??';
  nameInput.value = name;
  nameInput.style.flex = '2';
  nameInput.style.margin = '0';
  nameInput.style.minWidth = '0';
  
  const levelInput = document.createElement('input');
  levelInput.type = 'text';
  levelInput.className = 'cg-list-level';
  levelInput.placeholder = '?頨圈?(?閰兩?';
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
  paidLabel.appendChild(document.createTextNode('?蟡?));
  
  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'btn-danger btn-cg-remove-row';
  delBtn.style.padding = '5px 8px';
  delBtn.style.fontSize = '12px';
  delBtn.style.margin = '0';
  delBtn.innerText = '??;
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
    const res = await fetch(`/api/templates/${currentGroupId}?_t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      currentGroupTemplates = data.templates || {};
    } else {
      currentGroupTemplates = {};
    }
  } catch (e) {
    console.error('?嚙質嚙踢?行??:', e);
    currentGroupTemplates = {};
  }
  
  cgTemplateSelect.innerHTML = '<option value="">-- ?鞊??Ｘ??哨蕭藃 --</option>';
  for (const name in currentGroupTemplates) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.innerText = name;
    cgTemplateSelect.appendChild(opt);
  }

  const taTemplateSelect = document.getElementById('ta-template-select');
  if (taTemplateSelect) {
    const oldVal = taTemplateSelect.value;
    taTemplateSelect.innerHTML = '<option value="">-- ????哨蕭藃 --</option>';
    for (const name in currentGroupTemplates) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.innerText = name;
      taTemplateSelect.appendChild(opt);
    }
    if (currentGroupTemplates[oldVal]) {
      taTemplateSelect.value = oldVal;
    } else {
      taTemplateSelect.value = '';
    }
  }
}

document.getElementById('btn-save-template').onclick = async () => {
  const text = getCgListString();
  if (!text) return alert('?皛?????蝞???);
  const name = prompt('?Ｚ???鈭方縐?哨蕭藃?嚙???(?????鳴蕭???蝞?????);
  if (!name) return;
  
  appDiv.className = 'loading';
  try {
    const res = await fetch(`/api/templates/${currentGroupId}`, {
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
      alert('????艞??左??撜???Git??);
    } else {
      alert(data.error || '????剜??');
    }
  } catch (e) {
    alert('?祈璆??芰??ㄛ蕭?走嚙賣???∠捂???);
  } finally {
    appDiv.className = '';
  }
};

document.getElementById('btn-delete-template').onclick = async () => {
  const name = cgTemplateSelect.value;
  if (!name) return alert('?Ｚ???鞊??蕭?霈??蝛?');
  if (!confirm(`?????穿蕭??????蕭?{name}?皛??洫)) return;
  
  appDiv.className = 'loading';
  try {
    const res = await fetch(`/api/templates/${currentGroupId}`, {
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
      alert('??瑁??艞??左??撜???Git??);
    } else {
      alert(data.error || '??瑁??剜??');
    }
  } catch (e) {
    alert('?祈璆??芰??ㄛ蕭?走???);
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
  const days = ['??, '?蕭', '??, '??, '??, '??, '??];
  return `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`;
}

function showCreateGameForm() {
  lobbyView.classList.add('hidden');
  detailView.classList.add('hidden');
  createGameView.classList.remove('hidden');
  
  // ????艞?嚙?薴噪鈭?嚙踢??
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tzOffset = tomorrow.getTimezoneOffset() * 60000;
  const localTomorrow = new Date(tomorrow - tzOffset).toISOString().split('T')[0];
  document.getElementById('cg-date').value = localTomorrow;
  document.getElementById('cg-time-start').value = '18:00';
  document.getElementById('cg-time-end').value = '20:00';
  
  // ?蕭????Ｘ??閰券?
  const cgTargetGidsContainer = document.getElementById('cg-target-gids-container');
  cgTargetGidsContainer.innerHTML = '';
  if (globalManagedGroups.length > 0) {
    globalManagedGroups.forEach(g => {
      createTargetGroupCheckbox(cgTargetGidsContainer, g.gid, g.code, g.groupName, g.gid === currentGroupId);
    });
  } else {
    cgTargetGidsContainer.innerHTML = '<p>????蝖????????Ｘ?</p>';
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

let cgSections = [];

function renderCgSections() {
  const container = document.getElementById('cg-sections-list');
  container.innerHTML = '';
  cgSections.forEach((sec, idx) => {
    const card = document.createElement('div');
    card.className = 'dynamic-section-card';
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-weight:bold; color:var(--primary-color);">?嚙賣/?嚙? ${idx + 1}</span>
        ${cgSections.length > 1 ? `<button type="button" class="btn-icon" style="color:var(--danger-color);" onclick="removeCgSection(${idx})">??/button>` : ''}
      </div>
      <div class="form-group">
        <label>?皛刻? (?? 8-10)</label>
        <input type="text" id="cg-sec-title-${idx}" value="${sec.title || ''}" placeholder="?????-10">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>?剔捂敶?艟??</label>
          <input type="number" id="cg-sec-limit-${idx}" value="${sec.limit || 20}" min="1">
        </div>
        <div class="form-group">
          <label>????/label>
          <input type="text" id="cg-sec-fee-${idx}" value="${sec.fee || ''}" placeholder="?????00">
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

window.removeCgSection = (idx) => {
  saveCgSectionsData();
  cgSections.splice(idx, 1);
  renderCgSections();
};

function saveCgSectionsData() {
  cgSections = cgSections.map((sec, idx) => {
    return {
      title: document.getElementById(`cg-sec-title-${idx}`)?.value || '',
      limit: document.getElementById(`cg-sec-limit-${idx}`)?.value || 20,
      fee: document.getElementById(`cg-sec-fee-${idx}`)?.value || ''
    };
  });
}

document.getElementById('cg-multi-section-toggle').addEventListener('change', (e) => {
  const isMulti = e.target.checked;
  if (isMulti) {
    document.getElementById('cg-single-section-block').classList.add('hidden');
    document.getElementById('cg-multi-section-block').classList.remove('hidden');
    if (cgSections.length === 0) {
      cgSections.push({ title: '8-10', limit: document.getElementById('cg-limit').value || 20, fee: document.getElementById('cg-fee').value || '' });
      cgSections.push({ title: '10-12', limit: document.getElementById('cg-limit').value || 20, fee: document.getElementById('cg-fee').value || '' });
    }
    renderCgSections();
  } else {
    document.getElementById('cg-single-section-block').classList.remove('hidden');
    document.getElementById('cg-multi-section-block').classList.add('hidden');
  }
});

document.getElementById('btn-cg-add-section').onclick = () => {
  saveCgSectionsData();
  cgSections.push({ title: '', limit: 20, fee: '' });
  renderCgSections();
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
    alert('?艞?薴??暺嚙踝蕭皞鳴蕭嚙踝蕭撜?暻蕭皞鳴蕭嚙踝蕭撜???蕭皞鳴蕭嚙踝蕭嚙踢??熄嚙賣豪嚙賣嚙賤萇?嚙???);
    return;
  }
  
  try {
    appDiv.className = 'loading';
    statusMsg.style.display = 'block';
    statusMsg.innerText = '?皝暑?梁????..';
    
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
        initialListStr: getCgListString(),
        sections: document.getElementById('cg-multi-section-toggle').checked ? (saveCgSectionsData(), cgSections) : null
      })
    });
    
    const result = await res.json();
    if (!res.ok) {
      alert(result.error || '?梁???剜??');
    } else {
      // ?閫??艞??姘???陲?鈭??艞??姘?????嚙賡??啣???嚙?????撜陲?????湛蕭皛Ｚ??哨蕭??LINE ?踵?瞍?      let alertMsg = '???閫??艞???;
      if (result.pushErrors && result.pushErrors.length > 0) {
        alertMsg += '\n\n?薳?? ???仿蝞貊陲?????\n' + result.pushErrors.join('\n');
      } else {
        alertMsg += '\n\n????蕭??臐銊餉???姘????蕭?皝暑?啣???嚙??撜陲?????湛蕭皞鳴蕭?;
      }
      alert(alertMsg);
      
      createGameView.classList.add('hidden');
      await loadGamesLobby();
    }
  } catch(e) {
    alert('?祈璆??芰?');
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
    egTargetGidsContainer.innerHTML = '<p>????蝖????????Ｘ?</p>';
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
  
  // ????獢??????賣?嚙賡??荔蕭?????皛????選蕭甇????game.targetGids ?嚙賡???
  gameTargetGids.forEach(tgid => {
    if (!globalManagedGroups.some(g => g.gid === tgid) && !savedEg.some(g => g.gid === tgid)) {
       createTargetGroupCheckbox(egTargetGidsContainer, tgid, '??唬偵', '?嚙?嚙賡???, true);
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
  document.getElementById('eg-fee').value = game.fee || section.fee || '';
  const btnEnd = document.getElementById('btn-eg-end');
  if (btnEnd) {
    if (game.isManualEnded) {
      btnEnd.innerText = '????;
      btnEnd.disabled = true;
      btnEnd.style.opacity = '0.5';
      btnEnd.style.cursor = 'not-allowed';
    } else {
      btnEnd.innerText = '?舫???皝暑';
      btnEnd.disabled = false;
      btnEnd.style.opacity = '1';
      btnEnd.style.cursor = 'pointer';
    }
  }
  document.getElementById('eg-note').value = game.note || '';
  
  // ????蝖??嚙賣?桀??
  egSections = JSON.parse(JSON.stringify(game.sections || []));
  if (egSections.length > 1) {
    document.getElementById('eg-multi-section-toggle').checked = true;
    document.getElementById('eg-single-section-block').classList.add('hidden');
    document.getElementById('eg-multi-section-block').classList.remove('hidden');
  } else {
    document.getElementById('eg-multi-section-toggle').checked = false;
    document.getElementById('eg-single-section-block').classList.remove('hidden');
    document.getElementById('eg-multi-section-block').classList.add('hidden');
  }
  renderEgSections();
  
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

let egSections = [];

function renderEgSections() {
  const container = document.getElementById('eg-sections-list');
  container.innerHTML = '';
  egSections.forEach((sec, idx) => {
    const card = document.createElement('div');
    card.className = 'dynamic-section-card';
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-weight:bold; color:var(--primary-color);">?嚙賣/?嚙? ${idx + 1}</span>
        ${egSections.length > 1 ? `<button type="button" class="btn-icon" style="color:var(--danger-color);" onclick="removeEgSection(${idx})">??/button>` : ''}
      </div>
      <div class="form-group">
        <label>?皛刻? (?? 8-10)</label>
        <input type="text" id="eg-sec-title-${idx}" value="${sec.title || ''}" placeholder="?????-10">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>?剔捂敶?艟??</label>
          <input type="number" id="eg-sec-limit-${idx}" value="${sec.limit || 20}" min="1">
        </div>
        <div class="form-group">
          <label>????/label>
          <input type="text" id="eg-sec-fee-${idx}" value="${sec.fee || ''}" placeholder="?????00">
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

window.removeEgSection = (idx) => {
  saveEgSectionsData();
  egSections.splice(idx, 1);
  renderEgSections();
};

function saveEgSectionsData() {
  egSections = egSections.map((sec, idx) => {
    return {
      ...sec, // ?對蕭??質???嚗??嚙???list)????
      title: document.getElementById(`eg-sec-title-${idx}`)?.value || '',
      limit: document.getElementById(`eg-sec-limit-${idx}`)?.value || 20,
      fee: document.getElementById(`eg-sec-fee-${idx}`)?.value || ''
    };
  });
}

document.getElementById('eg-multi-section-toggle').addEventListener('change', (e) => {
  const isMulti = e.target.checked;
  if (isMulti) {
    document.getElementById('eg-single-section-block').classList.add('hidden');
    document.getElementById('eg-multi-section-block').classList.remove('hidden');
    if (egSections.length === 0) {
      egSections.push({ title: '8-10', limit: document.getElementById('eg-limit').value || 20, fee: document.getElementById('eg-fee').value || '' });
      egSections.push({ title: '10-12', limit: document.getElementById('eg-limit').value || 20, fee: document.getElementById('eg-fee').value || '' });
    }
    renderEgSections();
  } else {
    document.getElementById('eg-single-section-block').classList.remove('hidden');
    document.getElementById('eg-multi-section-block').classList.add('hidden');
  }
});

document.getElementById('btn-eg-add-section').onclick = () => {
  saveEgSectionsData();
  egSections.push({ title: '', limit: 20, fee: '', list: [] });
  renderEgSections();
};

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
    alert('?艞?薴??暺嚙踝蕭皞鳴蕭嚙踝蕭撜?暻蕭皞鳴蕭嚙踝蕭撜???蕭皞鳴蕭嚙踝蕭嚙踢??熄嚙賣豪嚙賣嚙賤萇?嚙???);
    return;
  }
  
  try {
    appDiv.className = 'loading';
    statusMsg.style.display = 'block';
    statusMsg.innerText = '????????..';
    
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
        isManualEnded: !!(gamesList.find(g => g.gameId === gameId) || {}).isManualEnded,
        note: document.getElementById('eg-note').value.trim(),
        sections: document.getElementById('eg-multi-section-toggle').checked ? (saveEgSectionsData(), egSections) : null
      })
    });
    
    const result = await res.json();
    if (!res.ok) {
      alert(result.error || '????剜??');
    } else {
      alert('????艞???);
      editGameView.classList.add('hidden');
      await loadGamesLobby();
      if (currentGameDetailId === gameId) {
         renderDetail(gameId, true);
      }
    }
  } catch(e) {
    alert('?祈璆??芰?');
  } finally {
    appDiv.className = '';
    statusMsg.style.display = 'none';
  }
};


document.addEventListener('click', (e) => { if (!e.target.closest('.btn-danger')) { document.querySelectorAll('.btn-danger').forEach(b => { if (b.dataset.dodged === 'true') { b.dataset.dodged = 'false'; b.style.transition = 'transform 1s ease'; b.style.transform = 'translate(0px, 0px)'; } }); } });

// ?剜頛?嚙??霈
if (btnLobbyStats) {
  btnLobbyStats.addEventListener('click', async () => {
    appDiv.className = 'loading';
    statusMsg.innerText = '?蕭?蝖???????...';
    statusMsg.style.display = 'block';
    
    const { isSuperAdmin: effIsSuperAdmin } = (typeof getEffectiveRole === 'function') ? getEffectiveRole() : { isSuperAdmin: false };
    
    try {
      const res = await fetch(`/api/admin/all_stats?uid=${currentUser.userId}`);
      if (!res.ok) throw new Error('????蝖??嚙??蕭?');
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
          <h3 style="margin:0 0 10px 0; color:#FF9800; text-align:center;">?? ?嚙??拚??荔蕭??/h3>
          <div class="detail-stats" style="margin-top:0; margin-bottom: 10px;">
            <div class="stat-box" style="flex:1;">
              <span class="stat-label">?株釭??藃３瘣??/span>
              <span class="stat-value">${totalViews}</span>
            </div>
            <div class="stat-box" style="flex:1;">
              <span class="stat-label">?蟡恍嚙?藃３瘣??/span>
              <span class="stat-value" style="color:#e74c3c;">${totalTodayViews}</span>
            </div>
          </div>
        `;
        
        if (data.allUsersStats && data.allUsersStats.length > 0) {
            const titleContainer = document.createElement('div');
            titleContainer.style.display = 'flex';
            titleContainer.style.justifyContent = 'space-between';
            titleContainer.style.alignItems = 'center';
            titleContainer.style.cursor = 'pointer';
            titleContainer.style.userSelect = 'none';
            titleContainer.style.padding = '18px 5px';
            titleContainer.style.margin = '10px -5px 0 -5px';
            titleContainer.style.borderTop = '1px solid #ffe0b2';
            titleContainer.style.borderRadius = '8px';

            const allUsersTitle = document.createElement('h4');
            allUsersTitle.style.margin = '0';
            allUsersTitle.style.fontSize = '14px';
            allUsersTitle.style.color = '#FF9800';
            allUsersTitle.innerText = '?? ?獢??嚙????嚙??蝢???;
            
            const toggleIcon = document.createElement('span');
            toggleIcon.innerText = '??;
            toggleIcon.style.color = '#FF9800';
            toggleIcon.style.fontSize = '12px';
            toggleIcon.style.transition = 'transform 0.3s ease';

            titleContainer.appendChild(allUsersTitle);
            titleContainer.appendChild(toggleIcon);
            summaryCard.appendChild(titleContainer);

            const tableContainer = document.createElement('div');
            tableContainer.style.display = 'none';

            const table = document.createElement('table');
            table.style.width = '100%';
            table.style.borderCollapse = 'collapse';
            table.style.marginBottom = '15px';
            table.style.fontSize = '12px';
            
            table.innerHTML = `
              <thead>
                <tr style="background: rgba(0,0,0,0.05); text-align: left;">
                  <th style="padding: 16px 10px; border-bottom: 1px solid #ccc;">?皛刻?</th>
                  <th id="sort-count" style="padding: 16px 10px; border-bottom: 1px solid #ccc; cursor: pointer; user-select: none;" title="?箏╡??漱???>?株部?????/th>
                  <th id="sort-time" style="padding: 16px 10px; border-bottom: 1px solid #ccc; cursor: pointer; user-select: none;" title="?箏╡??漱???>?嚙賣撅???/th>
                </tr>
              </thead>
              <tbody>
              </tbody>
            `;
            tableContainer.appendChild(table);

            let currentSort = 'lastVisit';
            let sortDesc = true;

            const renderTbody = () => {
              const tbody = table.querySelector('tbody');
              const sortedData = [...data.allUsersStats].sort((a, b) => {
                if (currentSort === 'count') {
                  return sortDesc ? b.count - a.count : a.count - b.count;
                } else if (currentSort === 'lastVisit') {
                  const timeA = new Date(a.lastVisit).getTime();
                  const timeB = new Date(b.lastVisit).getTime();
                  return sortDesc ? timeB - timeA : timeA - timeB;
                }
                return 0;
              });

              const todayStr = new Date().toLocaleDateString('zh-TW');

              tbody.innerHTML = sortedData.map(u => {
                  const visitDate = new Date(u.lastVisit);
                  const isToday = visitDate.toLocaleDateString('zh-TW') === todayStr;
                  const bgStyle = isToday ? 'background: #fff8e1;' : '';
                  
                  return `
                  <tr style="border-bottom: 1px solid #eee; ${bgStyle}">
                    <td style="padding: 5px; max-width: 100px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${u.displayName}">${u.displayName}</td>
                    <td style="padding: 5px;">${u.count}</td>
                    <td style="padding: 5px;">${visitDate.toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}</td>
                  </tr>
                  `;
              }).join('');
              
              table.querySelector('#sort-count').innerText = currentSort === 'count' ? (sortDesc ? '?株部????? : '?株部?????) : '?株部???;
              table.querySelector('#sort-time').innerText = currentSort === 'lastVisit' ? (sortDesc ? '?嚙賣撅????? : '?嚙賣撅?????) : '?嚙賣撅???;
            };

            renderTbody();

            table.querySelector('#sort-count').onclick = () => {
              if (currentSort === 'count') sortDesc = !sortDesc;
              else { currentSort = 'count'; sortDesc = true; }
              renderTbody();
            };

            table.querySelector('#sort-time').onclick = () => {
              if (currentSort === 'lastVisit') sortDesc = !sortDesc;
              else { currentSort = 'lastVisit'; sortDesc = true; }
              renderTbody();
            };
            summaryCard.appendChild(tableContainer);

            titleContainer.onclick = () => {
              if (tableContainer.style.display === 'none') {
                tableContainer.style.display = 'block';
                toggleIcon.style.transform = 'rotate(180deg)';
              } else {
                tableContainer.style.display = 'none';
                toggleIcon.style.transform = 'rotate(0deg)';
              }
            };
        }
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
          header.style.display = 'flex';
          header.style.justifyContent = 'space-between';
          header.style.alignItems = 'center';
          
          const title = document.createElement('h3');
          title.style.margin = '0';
          title.style.color = '#2c3e50';
          title.innerText = stat.groupName || stat.gid;
          
          header.appendChild(title);

          if (effIsSuperAdmin) {
            const delBtn = document.createElement('button');
            delBtn.className = 'btn btn-danger btn-square';
            delBtn.style.padding = '4px 8px';
            delBtn.style.fontSize = '12px';
            delBtn.innerText = '??瑁??蕭?';
            delBtn.onclick = async () => {
              if (confirm('?????穿蕭???伐蕭?蕭霈??荔蕭??箏╡??蕭?嚙??蕭餈???????箸????)) {
                try {
                  const delRes = await fetch(`/api/admin/lobby_stats/${stat.gid}/delete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uid: currentUser.userId })
                  });
                  if (delRes.ok) {
                    alert('??瑁??艞?');
                    btnLobbyStats.click(); // Reload stats
                  } else {
                    alert('??瑁??剜??');
                  }
                } catch(e) {
                  alert('??瑁??瞏???芰?');
                }
              }
            };
            header.appendChild(delBtn);
          }

          card.appendChild(header);
          
          // Stats Row
          const statsRow = document.createElement('div');
          statsRow.className = 'detail-stats';
          statsRow.style.marginTop = '0';
          statsRow.style.marginBottom = '10px';
          
          const viewsBox = document.createElement('div');
          viewsBox.className = 'stat-box';
          viewsBox.style.flex = '1';
          viewsBox.innerHTML = `<span class="stat-label">?株釭??藃３瘣??/span><span class="stat-value">${stat.viewCount}</span>`;
          
          const uniqueBox = document.createElement('div');
          uniqueBox.className = 'stat-box';
          uniqueBox.style.flex = '1';
          uniqueBox.innerHTML = `<span class="stat-label">?慾??湛蕭???/span><span class="stat-value">${stat.uniqueCount}</span>`;
          
          statsRow.appendChild(viewsBox);
          statsRow.appendChild(uniqueBox);
          card.appendChild(statsRow);
          
          // Daily Stats Table
          if (stat.dailyStats && stat.dailyStats.length > 0) {
            const titleContainer = document.createElement('div');
            titleContainer.style.display = 'flex';
            titleContainer.style.justifyContent = 'space-between';
            titleContainer.style.alignItems = 'center';
            titleContainer.style.cursor = 'pointer';
            titleContainer.style.userSelect = 'none';
            titleContainer.style.padding = '18px 5px';
            titleContainer.style.margin = '10px -5px 0 -5px';
            titleContainer.style.borderRadius = '8px';

            const dailyTitle = document.createElement('h4');
            dailyTitle.style.margin = '0';
            dailyTitle.style.fontSize = '14px';
            dailyTitle.style.color = '#34495e';
            dailyTitle.innerText = '?? ?休予綾恍?嚙賣?嚙賜??;
            
            const toggleIcon = document.createElement('span');
            toggleIcon.innerText = '??;
            toggleIcon.style.color = '#34495e';
            toggleIcon.style.fontSize = '12px';
            toggleIcon.style.transition = 'transform 0.3s ease';

            titleContainer.appendChild(dailyTitle);
            titleContainer.appendChild(toggleIcon);
            card.appendChild(titleContainer);

            const tableContainer = document.createElement('div');
            tableContainer.style.display = 'none';

            const table = document.createElement('table');
            table.style.width = '100%';
            table.style.borderCollapse = 'collapse';
            table.style.marginBottom = '15px';
            table.style.fontSize = '12px';
            
            table.innerHTML = `
              <thead>
                <tr style="background: rgba(0,0,0,0.05); text-align: left;">
                  <th style="padding: 5px; border-bottom: 1px solid #ccc;">?鈭?</th>
                  <th style="padding: 5px; border-bottom: 1px solid #ccc;">?株釭???/th>
                  <th style="padding: 5px; border-bottom: 1px solid #ccc;">?慾??湛蕭???/th>
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
            tableContainer.appendChild(table);
            card.appendChild(tableContainer);

            titleContainer.onclick = () => {
              if (tableContainer.style.display === 'none') {
                tableContainer.style.display = 'block';
                toggleIcon.style.transform = 'rotate(180deg)';
              } else {
                tableContainer.style.display = 'none';
                toggleIcon.style.transform = 'rotate(0deg)';
              }
            };
          }
          
          // Toggle Logs Button
          const toggleLogsBtn = document.createElement('button');
          toggleLogsBtn.className = 'btn-secondary';
          toggleLogsBtn.style.width = '100%';
          toggleLogsBtn.style.fontSize = '12px';
          toggleLogsBtn.style.padding = '6px';
          toggleLogsBtn.innerText = '????株?亥?嚙????;
          
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
                fallbackImg.innerText = '?薵?';
                item.appendChild(fallbackImg);
              }
              
              const nameDiv = document.createElement('div');
              nameDiv.style.fontWeight = '500';
              nameDiv.style.fontSize = '13px';
              nameDiv.innerText = log.displayName || '??唬偵?輯撒???;
              item.appendChild(nameDiv);
              
              logsContainer.appendChild(item);
            });
          } else {
            logsContainer.innerHTML = '<div style="color:#999; text-align:center; padding:10px; font-size:12px;">??塚蕭?蕭??/div>';
          }
          
          toggleLogsBtn.onclick = () => {
            if (logsContainer.style.display === 'none') {
              logsContainer.style.display = 'block';
              toggleLogsBtn.innerText = '????株?亥?嚙????;
            } else {
              logsContainer.style.display = 'none';
              toggleLogsBtn.innerText = '????株?亥?嚙????;
            }
          };
          
          card.appendChild(toggleLogsBtn);
          card.appendChild(logsContainer);
          statsGroupsContainer.appendChild(card);
        });
      } else {
        statsGroupsContainer.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">?獢?????２??Ｘ??嚙?????頦綽蕭?/div>';
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
    statusMsg.innerText = '?蕭?蝣嗉?...';
    try {
      const res = await fetch('/api/systemLogs?uid=' + currentUser.userId);
      if (!res.ok) throw new Error('????蕭?艞??撠G');
      const logs = await res.json();
      
      systemLogsContainer.innerHTML = '';
      if (!logs || logs.length === 0) {
        systemLogsContainer.innerHTML = '<p>?獢??????蝯??芰??蕭??/p>';
      } else {
        logs.forEach(log => {
          const div = document.createElement('div');
          div.style.borderBottom = '1px solid #ddd';
          div.style.padding = '8px 0';
          div.innerHTML = `<div style="font-size:12px; color:#888;">${log.time}</div>
          <div style="font-weight:bold;">[${log.gameTitle || '??唬偵?皝暑'}] ${log.operator}</div>
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
      if (rank === 1) crownHtml = '<span class="ee-crown">??</span>';
      else if (rank === 2) crownHtml = '<span class="ee-crown">??</span>';
      else if (rank === 3) crownHtml = '<span class="ee-crown">??</span>';
      else crownHtml = '<span class="ee-crown">??</span>';
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
      <div class="ee-leaderboard-name" style="color: ${nameColor};">${crownHtml}${user.name} ${isMe ? '(??' : ''}</div>
      <div class="ee-leaderboard-time">${timeInSeconds}</div>
    `;
    listEl.appendChild(li);
  });
}

// --- Admin Easter Egg View ---
if (btnEasterEgg) {
  btnEasterEgg.addEventListener('click', async () => {
    statusMsg.innerText = '?嚙賡????..';
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
              li.innerHTML = `<strong>${index+1}.</strong> ${w.name} - ${w.survivalTime} ??;
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
      alert('????嚙賣???桀??');
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
          alert('?剜頛????嚙?');
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
      if (!confirm('?????穿蕭???蕭?蒡?擗左?????')) return;
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
        btnMinimizeAdminPanel.innerText = '??;
      } else {
        body.style.display = 'none';
        btnMinimizeAdminPanel.innerText = '??;
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
        alert('????艞?');
        easterEggEnabled = eeEnabledCheckbox.checked;
        easterEggActiveGame = eeActiveGameSelect.value;
        renderLobby();
      }
    } catch(e) { alert('????剜??'); }
    btnSaveEasterEgg.disabled = false;
  });
}

if (btnClearWinners) {
  btnClearWinners.addEventListener('click', async () => {
    if (!confirm('?????穿蕭?????畾?')) return;
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
        alert('???????);
      }
    } catch(e) { alert('?蕭???'); }
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
    delBtn.innerText = '??;
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
      alert('?剜頛????朣??????芾??藆略?隡?(?Ｚ??⊥臐???閫??????剜頛?');
    }
  });
}

if (btnAddManualName) {
  btnAddManualName.addEventListener('click', () => {
    const val = lotteryManualName.value.trim();
    if (!val) return;
    const names = val.split(/[,??).map(n => n.trim()).filter(Boolean);
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
    if (!confirm('?????穿蕭?????菜???艞??頛?????')) return;
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
      alert('?ａ?嚙?嚙??踵??撣?????鞈?');
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
      else alert('???芾???????);
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
      lotteryAssigneeSelect.innerHTML = '<option value="">-- ?ａ?嚙?嚙賡??箏????--</option>';
      
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
        const chars = ['???, '?瞈?, '?頨?, '???, '??', '?艞葬', '?銣?, '???, '??', '?艟'];
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
    const isHidden = participantsPanel.classList.contains('hidden') || participantsPanel.style.display === 'none';
    if (isHidden) {
      participantsPanel.classList.remove('hidden');
      participantsPanel.style.display = 'flex';
    } else {
      participantsPanel.classList.add('hidden');
      participantsPanel.style.display = 'none';
    }
  });
}

if (btnCloseParticipants && participantsPanel) {
  btnCloseParticipants.addEventListener('click', () => {
    participantsPanel.classList.add('hidden');
    participantsPanel.style.display = 'none';
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
      else alert('???芾???????);
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
const pinballActivitySelect = document.getElementById('pinball-activity-select');
const btnAddPinballActivity = document.getElementById('btn-add-pinball-activity');
const btnAddPinballRandom = document.getElementById('btn-add-pinball-random');

let pinballActivitiesLoaded = false;
if (pinballActivitySelect) {
  pinballActivitySelect.addEventListener('focus', async () => {
    if (pinballActivitiesLoaded) return;
    try {
      pinballActivitySelect.innerHTML = '<option value="">-- ?嚙賡??.. --</option>';
      const res = await fetch('/api/debug_games');
      const data = await res.json();
      pinballActivitySelect.innerHTML = '<option value="">-- ?鞊???????穿蕭 --</option>';
      if (data.games) {
        Object.values(data.games).forEach(game => {
          if (game.title) {
            const opt = document.createElement('option');
            opt.value = game.gameId;
            opt.textContent = game.title;
            let names = [];
            if (game.sections) {
              game.sections.forEach(sec => {
                if (sec.list) names.push(...sec.list);
              });
            }
            opt.dataset.names = JSON.stringify(names);
            pinballActivitySelect.appendChild(opt);
          }
        });
      }
      pinballActivitiesLoaded = true;
    } catch(e) { console.error('Failed to load activities', e); pinballActivitySelect.innerHTML = '<option value="">-- ?嚙賣?? --</option>'; }
  });
}

if (btnAddPinballActivity) {
  btnAddPinballActivity.addEventListener('click', () => {
    const selected = pinballActivitySelect.options[pinballActivitySelect.selectedIndex];
    if (!selected || !selected.value) return alert("?Ｚ???鞊??蕭?藃３??薴?");
    try {
      const names = JSON.parse(selected.dataset.names || "[]");
      if (names.length === 0) return alert("?啗??????攻未?皛??畾?");
      if (window.pinballSocket) {
        window.pinballSocket.emit('join_pinball_bulk', { names });
      }
    } catch(e) { console.error(e); }
  });
}

if (btnAddPinballRandom) {
  btnAddPinballRandom.addEventListener('click', () => {
    const names = [];
    const firstNames = ["??, "??, "??, "??, "??, "??, "??, "??, "??, "??, "??, "??];
    const lastNames = ["??, "??, "??, "??, "??, "??, "??, "??, "??, "璅?, "??, "??];
    for (let i = 0; i < 10; i++) {
      const fn = firstNames[Math.floor(Math.random() * firstNames.length)];
      const ln = lastNames[Math.floor(Math.random() * lastNames.length)];
      names.push(fn + ln + Math.floor(Math.random() * 100));
    }
    if (window.pinballSocket) {
      window.pinballSocket.emit('join_pinball_bulk', { names });
    }
  });
}

async function addPinballPlayer(name) {
  if (!name) {
    alert("?Ｚ???鈭??格Ⅰ?");
    return false;
  }
  if (!currentUser) {
    alert("????蝖?????擗蕭?嚙?憿??Ｚ??⊥臐?嚙賣??歹蕭隤? LINE ?擗蕭?嚙踢???敿?霈?????突???蕭嚙賜??亥???質縐??蕭??);
    return false;
  }
  try {
    const res = await fetch('/api/admin/pinball/add-player', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: currentUser.userId, name })
    });
    if (!res.ok) {
      alert("?∠捂???賂蕭???剜???臐?薵??嚙?API??HTTP " + res.status);
      return false;
    }
    const data = await res.json();
    if (!data.success) {
      alert("??抬蕭?剜???? + data.error);
      return false;
    }
    return data.success;
  } catch(e) { 
    console.error(e); 
    alert("?瞏???唬偵??芰??? + e.message);
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
        body: JSON.stringify({
          uid: currentUser.userId,
          winnerLimit: limit,
          allowControls: document.getElementById('pinball-allow-controls') ? document.getElementById('pinball-allow-controls').checked : true,
          socketId: window.pinballSocket ? window.pinballSocket.id : null
        })
      });
      const data = await res.json();
      if (!data.success) alert(data.error);
    } catch(e) { console.error(e); }
  });
}

const btnPinballAdminNext = document.getElementById('btn-pinball-admin-next');
if (btnPinballAdminNext) {
  btnPinballAdminNext.addEventListener('click', async () => {
    if (!confirm('?????穿蕭??芾﹞??蕭?藃戮??????嚙??拍?啣???藃戮嚙賡?????????嚙??休ㄛ??答?')) return;
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

// ==========================================
// ?? ????蕭? (Group Buy Frontend Module)
// ==========================================
var currentGid = 'default';
var currentGroupBuyData = null;
var currentCart = {};

window.validateNamePhone = function() {
  const n = document.getElementById('gb-header-name');
  const p = document.getElementById('gb-header-phone');
  if (!n || !p) return true;
  const nv = n.value.trim();
  const pv = p.value.trim();
  
  // Clear previous styles
  n.style.boxShadow = '';
  n.style.borderColor = '#cbd5e1';
  p.style.boxShadow = '';
  p.style.borderColor = '#cbd5e1';
  
  let isValid = true;
  let msg = '';
  
  if (!nv) {
    isValid = false;
    n.style.borderColor = '#ef4444';
    n.style.boxShadow = '0 0 8px rgba(239, 68, 68, 0.8)';
    msg += '?芣???貍嚙?蝞??蕭n';
  }
  
  if (!pv) {
    isValid = false;
    p.style.borderColor = '#ef4444';
    p.style.boxShadow = '0 0 8px rgba(239, 68, 68, 0.8)';
    msg += '?擗??貍嚙?蝞??蕭n';
  } else if (!/^09\d{8}$/.test(pv)) {
    isValid = false;
    p.style.borderColor = '#ef4444';
    p.style.boxShadow = '0 0 8px rgba(239, 68, 68, 0.8)';
    msg += '?擗??瞉???芰??蕭??岳嚙?9??蕭?嚙??輸蝙敶璇?\n';
  }
  
  if (!isValid) {
    alert(msg + '?Ｚ??????皎????芣???嚙質縣??硃薴??唳╡??皛?遛??返坎??閰??嚙???);
    return false;
  }
  
  localStorage.setItem('gb_last_name', nv);
  localStorage.setItem('gb_last_phone', pv);
  return true;
};
 // { [itemId]: quantity }
let draftCart = {}; // { [itemId]: draft_quantity }
let selectedDetailItem = null;
let detailQty = 1;

// DOM ?嚙????const btnGroupBuyNav = document.getElementById('btn-group-buy-nav');
const groupBuyBanner = document.getElementById('group-buy-banner');
const btnEnterGroupBuy = document.getElementById('btn-enter-group-buy');
const groupBuyView = document.getElementById('group-buy-view');
const btnBackGroupBuy = document.getElementById('btn-back-group-buy');

const gbModalTitle = document.getElementById('gb-modal-title');
const gbNoticeText = document.getElementById('gb-notice-text');

const gbTabItems = document.getElementById('gb-tab-items');
const gbTabSummary = document.getElementById('gb-tab-summary');
const gbTabAdmin = document.getElementById('gb-tab-admin');

const gbPaneItems = document.getElementById('gb-pane-items');
const gbPaneSummary = document.getElementById('gb-pane-summary');
const gbPaneAdmin = document.getElementById('gb-pane-admin');

const gbSearchInput = document.getElementById('gb-search-input');
const gbSearchClear = document.getElementById('gb-search-clear');
const gbCategoryNav = document.getElementById('gb-category-nav');
const gbItemsGrid = document.getElementById('gb-items-grid');

const groupBuyCartBar = document.getElementById('groupBuyCartBar');
const gbCartCount = document.getElementById('gb-cart-count');
const gbCartSum = document.getElementById('gb-cart-sum');
const btnGbOpenCheckout = document.getElementById('btn-gb-open-checkout');

// ?嚙??啣? Modal ?嚙?
const itemDetailModal = document.getElementById('itemDetailModal');
const btnCloseItemDetail = document.getElementById('btn-close-item-detail');
const itemDetailCategory = document.getElementById('item-detail-category');
const itemDetailName = document.getElementById('item-detail-name');
const itemDetailPrice = document.getElementById('item-detail-price');
const itemDetailUnit = document.getElementById('item-detail-unit');
const itemDetailDesc = document.getElementById('item-detail-desc');
const itemDetailImgContainer = document.getElementById('item-detail-img-container');
const itemDetailLinkContainer = document.getElementById('item-detail-link-container');
const itemDetailLinkBtn = document.getElementById('item-detail-link-btn');
const itemDetailLinkText = document.getElementById('item-detail-link-text');

const btnDetailQtyMinus = document.getElementById('btn-detail-qty-minus');
const btnDetailQtyPlus = document.getElementById('btn-detail-qty-plus');
const detailQtyNum = document.getElementById('detail-qty-display');
const btnDetailConfirmAdd = document.getElementById('btn-detail-confirm-add');

// ?荊?潸 Modal ?嚙?
const groupBuyCheckoutModal = document.getElementById('groupBuyCheckoutModal');
const btnCloseCheckout = document.getElementById('btn-close-checkout');
const gbUserName = document.getElementById('gb-user-name');
const gbUserPhone = document.getElementById('gb-user-phone');
const checkoutItemsList = document.getElementById('checkout-items-list');
const checkoutTotalSum = document.getElementById('checkout-total-sum');
const btnSubmitGbOrder = document.getElementById('btn-submit-gb-order');

const paymentDetailsLinepay = document.getElementById('payment-details-linepay');
const paymentDetailsBank = document.getElementById('payment-details-bank');
const btnLaunchLinepay = document.getElementById('btn-launch-linepay');
const gbLinepayQrBox = document.getElementById('gb-linepay-qr-box');
const gbLinepayQrImg = document.getElementById('gb-linepay-qr-img');
const gbLinepayNote = document.getElementById('gb-linepay-note');

const gbBankNameDisplay = document.getElementById('gb-bank-name-display');
const gbBankAccDisplay = document.getElementById('gb-bank-acc-display');
const gbBankHolderDisplay = document.getElementById('gb-bank-holder-display');
const btnCopyBankAcc = document.getElementById('btn-copy-bank-acc');
const gbBankLast5 = document.getElementById('gb-bank-last5');
const gbOrderNote = document.getElementById('gb-order-note');

// ???????嚗???
const btnGbAdminToggle = document.getElementById('btn-gb-admin-toggle');
const gbAdminTitleInput = document.getElementById('gb-admin-title-input');
const gbAdminNoticeInput = document.getElementById('gb-admin-notice-input');
const gbAdminHiddenLobbyInput = document.getElementById('gb-admin-hidden-lobby-input');
const gbAdminLinepayLink = document.getElementById('gb-admin-linepay-link');
const gbAdminLinepayQr = document.getElementById('gb-admin-linepay-qr');
const gbAdminBankCode = document.getElementById('gb-admin-bank-code');
const gbAdminBankName = document.getElementById('gb-admin-bank-name');
const gbAdminBankAccount = document.getElementById('gb-admin-bank-account');
const gbAdminBankHolder = document.getElementById('gb-admin-bank-holder');
const btnGbSaveSettings = document.getElementById('btn-gb-save-settings');
const btnGbCopySummary = document.getElementById('btn-gb-copy-summary');
const btnGbClearOrders = document.getElementById('btn-gb-clear-orders');

let activeCategoryFilter = '??賂蕭';
let currentSearchQuery = '';

var allGroupBuysList = [];

async function fetchGroupBuyData() {
  try {
    const listRes = await fetch('/api/groupbuy_list');
    if (listRes.ok) {
      const listResult = await listRes.json();
      if (listResult.success) {
        allGroupBuysList = listResult.list || [];
        renderLobbyGroupBuyBanners(allGroupBuysList);
        updateCampaignSelectorDropdown(allGroupBuysList);
      }
    }

    const targetGid = currentGid || 'default';
    const res = await fetch(`/api/groupbuy/${targetGid}`);
    if (res.ok) {
      const result = await res.json();
      if (result.success) {
        renderGroupBuyUI(result.data);
      }
    }
  } catch(e) {
    console.error('Fetch group buy data failed:', e);
  }
}

function renderLobbyGroupBuyBanners(list) {
  const container = document.getElementById('group-buy-banners-list');
  const bannerBox = document.getElementById('group-buy-banner');
  if (!container || !bannerBox) return;

  const { isAdmin: effIsAdmin, isSuperAdmin: effIsSuperAdmin } = (typeof getEffectiveRole === 'function') ? getEffectiveRole() : { isAdmin: false, isSuperAdmin: false };
  const isUserAdmin = effIsAdmin || effIsSuperAdmin;

  let activeGroupBuys = (list || []).filter(gb => gb.active);
  if (!isUserAdmin) {
    activeGroupBuys = activeGroupBuys.filter(gb => !gb.hiddenFromLobby);
  }
  if (activeGroupBuys.length === 0) {
    bannerBox.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  bannerBox.classList.remove('hidden');
  container.innerHTML = '';

  const gradients = [
    'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
    'linear-gradient(135deg, #059669 0%, #047857 100%)',
    'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
    'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)'
  ];

  activeGroupBuys.forEach((gb, idx) => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.style.cssText = `width: 100%; background: ${gradients[idx % gradients.length]}; font-weight: bold; border-radius: 14px; font-size: 15px; padding: 14px 18px; color: white; border: none; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.15); animation: pulse 2s infinite; display: flex; align-items: center; justify-content: space-between; text-align: left; box-sizing: border-box;`;
    btn.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="font-size:22px;">??</span>
        <div>
          <div style="font-size:15px; font-weight:bold;">${gb.title || '????蕭?'} ${gb.hiddenFromLobby ? '<span style="color:#facc15;font-size:12px;">[?剜頛?璇?]</span>' : ''}</div>
          <div style="font-size:12px; font-weight:normal; opacity:0.9;">????${gb.itemCount} ??蝘?閰???| ?璇??鞎???/div>
        </div>
      </div>
      <span style="font-size:13px; font-weight:bold; background:rgba(255,255,255,0.2); padding:5px 12px; border-radius:20px; white-space:nowrap;">???蕭??? ??/span>
    `;
    btn.onclick = () => openGroupBuyPage(gb.id);
    container.appendChild(btn);
  });
}

function updateCampaignSelectorDropdown(list) {
  const selector = document.getElementById('gb-campaign-selector');
  if (!selector) return;
  
  let html = '';
  list.forEach(gb => {
    const statusText = gb.active ? '????藃３藀?? : '?艞? ????;
    const selectedAttr = (gb.id === currentGid) ? 'selected' : '';
    html += `<option value="${gb.id}" ${selectedAttr}>${gb.title || '???????'} (${statusText})</option>`;
  });
  if (html) selector.innerHTML = html;

  selector.onchange = (e) => {
    currentGid = e.target.value;
    fetchGroupBuyData();
  };
}

function openGroupBuyPage(gid = null) {
  if (gid) currentGid = gid;
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  if (groupBuyView) groupBuyView.classList.remove('hidden');

  // ??嚙?嚙??擙蕭????嚙??食??????脫暑?閫??嚙踢??嚗孵??鞈???
  if (gbTabItems) gbTabItems.click();

  fetchGroupBuyData();
}

function checkIsAdmin() {
  if (typeof getEffectiveRole === 'function') {
    try {
      const role = getEffectiveRole();
      if (role && (role.isAdmin || role.isSuperAdmin)) return true;
    } catch(e) {}
  }
  if (typeof globalIsSuperAdmin !== 'undefined' && globalIsSuperAdmin) return true;
  if (typeof globalIsAdmin !== 'undefined' && globalIsAdmin) return true;
  return false;
}

function getZhanRongDefaultItemsClient() {
  return [
    { id: 'zr_001', category: '????????, name: '????砥薴ㄢ?餉???, price: 150, unit: '??, description: '?質葭???柴????????僚??嚙質???臐?????????鞈?', imageUrl: 'https://cdn.store-assets.com/s/1255165/f/10532819.jpg', linkUrl: 'https://zrsh1986.com', linkText: '?箏╡????蕭???冽?⊿' },
    { id: 'zr_002', category: '????????, name: '????霅??餉???, price: 180, unit: '??, description: '??交熄?蒺?????蕭??霅????????餉???嚙踝蕭?函?嚙賡?鉽???, imageUrl: 'https://cdn.store-assets.com/s/1255165/f/10553346.jpg', linkUrl: 'https://zrsh1986.com', linkText: '?箏╡????蕭???冽?⊿' },
    { id: 'zr_003', category: '????????, name: '????綾???駁??', price: 220, unit: '??, description: '?踵瞉???????掘?????亙???戌萇??休予綾?蝵??嚙?嚙??, imageUrl: 'https://cdn.store-assets.com/s/1255165/f/10532819.jpg', linkUrl: 'https://zrsh1986.com', linkText: '?箏╡????蕭???冽?⊿' },
    { id: 'zr_004', category: '????綾尬?', name: '?薴凶??閫扔?嚙賣???(?綾????蒤?', price: 120, unit: '??, description: '????舀???嚙?????港????????鈭??慾??頦綽蕭?, imageUrl: 'https://cdn.store-assets.com/s/1255165/f/10553346.jpg', linkUrl: 'https://zrsh1986.com', linkText: '?箏╡????蕭???冽?⊿' },
    { id: 'zr_005', category: '????綾尬?', name: '??????嚙賣???, price: 135, unit: '??, description: '?皝改蕭??蕭??賅?薴????????????????葭??璇??足哨蕭?, imageUrl: 'https://cdn.store-assets.com/s/1255165/f/10532819.jpg', linkUrl: 'https://zrsh1986.com', linkText: '?箏╡????蕭???冽?⊿' },
    { id: 'zr_006', category: '????綾尬?', name: '???????颱漸嚙?蝵賂蕭', price: 150, unit: '??, description: '?蕭??璇??僚?????嚙??颱??憸脰?嚙賣????血??瘞穿蕭?, imageUrl: 'https://cdn.store-assets.com/s/1255165/f/10553346.jpg', linkUrl: 'https://zrsh1986.com', linkText: '?箏╡????蕭???冽?⊿' },
    { id: 'zr_007', category: '?踵瞉?嚙?', name: '?蝚??突???嚙? (?踵瞉???)', price: 350, unit: '??, description: '??剁蕭??塚蕭嚙賜?ｇ蕭嚙踝蕭??蕭??嚙??∴蕭隞?嚙???踹??亦??踵瞉?????, imageUrl: 'https://cdn.store-assets.com/s/1255165/f/10532819.jpg', linkUrl: 'https://zrsh1986.com', linkText: '?箏╡????蕭???冽?⊿' },
    { id: 'zr_008', category: '?踵瞉?嚙?', name: '?嚙??蝚???? (?摮萎???', price: 320, unit: '??, description: '?皝改蕭?摮萎??選蕭嚙?????堆蕭?藂蒤?撅裝?頛賂蕭?嚙踝蕭?, imageUrl: 'https://cdn.store-assets.com/s/1255165/f/10553346.jpg', linkUrl: 'https://zrsh1986.com', linkText: '?箏╡????蕭???冽?⊿' },
    { id: 'zr_009', category: '????音?/?撖伐蕭', name: '?左???蕭?胯???駁?蝖?, price: 480, unit: '??, description: '100% ?皝改蕭?綾???駁２??蕭?舀????????航???蕭??, imageUrl: 'https://cdn.store-assets.com/s/1255165/f/10532819.jpg', linkUrl: 'https://zrsh1986.com', linkText: '?箏╡????蕭???冽?⊿' },
    { id: 'zr_010', category: '????音?/?撖伐蕭', name: '????赤???芰???(???)', price: 250, unit: '??, description: '?堆蕭嚙??交熄????嚙賜??ㄛㄥ寡???嚙??嚙????嚙?????唳嚙?, imageUrl: 'https://cdn.store-assets.com/s/1255165/f/10553346.jpg', linkUrl: 'https://zrsh1986.com', linkText: '?箏╡????蕭???冽?⊿' }
  ];
}


window.gbIsAdminEditMode = false;

function initAdminEditToggles() {
  const adminControls = document.getElementById('gb-admin-items-controls');
  const btnToggle = document.getElementById('btn-gb-mode-toggle');
  const lblEdit = document.getElementById('lbl-mode-edit');
  const lblUser = document.getElementById('lbl-mode-user');
  
  if (adminControls && typeof getEffectiveRole === 'function' && getEffectiveRole().isSuperAdmin) {
    adminControls.classList.remove('hidden');
    const modeContainer = document.getElementById('admin-mode-container');
    if (modeContainer) modeContainer.classList.remove('hidden');
    
    if (btnToggle) {
      const updateToggleUI = () => {
        const knob = btnToggle.querySelector('.mode-toggle-knob');
        if (window.gbIsAdminEditMode) {
          btnToggle.style.background = '#f59e0b';
          knob.style.transform = 'translateX(0px)';
          lblEdit.style.color = '#f59e0b';
          lblUser.style.color = '#64748b';
          if (adminControls) adminControls.style.display = 'flex';
        } else {
          btnToggle.style.background = '#3b82f6';
          if (adminControls) adminControls.style.display = 'none';
          knob.style.transform = 'translateX(20px)';
          lblEdit.style.color = '#64748b';
          lblUser.style.color = '#3b82f6';
        }
      };
      
      const toggleMode = () => {
        window.gbIsAdminEditMode = !window.gbIsAdminEditMode;
        updateToggleUI();
        renderItemsGrid();
      };
      
      btnToggle.onclick = toggleMode;
      

      if (lblEdit) lblEdit.onclick = () => { if (!window.gbIsAdminEditMode) toggleMode(); };
      if (lblUser) lblUser.onclick = () => { if (window.gbIsAdminEditMode) toggleMode(); };
      
      // Initialize
      updateToggleUI();
    }
  }
}

function renderGroupBuyUI(data) {
  currentGroupBuyData = data || {};
  if (!Array.isArray(currentGroupBuyData.items) || currentGroupBuyData.items.length === 0) {
    currentGroupBuyData.items = getZhanRongDefaultItemsClient();
  }
  if (!currentGroupBuyData.title) currentGroupBuyData.title = '?? ????嚙? ?質葭???柴?????蕭? (1986)';
  if (!currentGroupBuyData.notice) currentGroupBuyData.notice = '';

  const isActive = !!currentGroupBuyData.active;
  const isUserAdmin = checkIsAdmin();

  // ??瘙?????(?銋???Modal ????颲??嚙賜???Modal ??? navBtn)
  const navBtn = document.getElementById('btn-group-buy-nav');
  if (navBtn) {
    if (isActive || isUserAdmin) navBtn.classList.remove('hidden');
    else navBtn.classList.add('hidden');
  }

  if (gbModalTitle) gbModalTitle.innerText = data.title || '????蕭?';
  if (gbNoticeText) {
    if (data.notice) {
      gbNoticeText.innerText = data.notice;
      gbNoticeText.style.display = 'block';
    } else {
      gbNoticeText.innerText = '';
      gbNoticeText.style.display = 'none';
    }
  }

  const btnCopyLink = document.getElementById('btn-copy-buy-link');
  if (btnCopyLink) {
    if (isUserAdmin) {
      btnCopyLink.classList.remove('hidden');
      btnCopyLink.onclick = () => {
        const url = new URL(window.location.href);
        url.searchParams.delete('testRole');
        url.searchParams.set('buy', currentGid);
        const link = url.toString();
        
        // ?蝞??閰冽??蛛蕭????剖?嚙???fallback ?臐??
        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(link).then(() => {
            alert('?????郭??????嚙???蕭n' + link);
          }).catch(() => {
            prompt('?ｈ坎?????都餈?????, link);
          });
        } else {
          prompt('?ｈ坎?????都餈?????, link);
        }
      };
    } else {
      btnCopyLink.classList.add('hidden');
    }
  }

  // ?嚙賣??????對蕭?潘蕭薴??? ?鞎??嚙??皛??薴???剜?舫????蕭??(??蕭????萄??)?朣?????嚙質?祇△??艟????????桀???皛??????芾??
  if (gbTabSummary) gbTabSummary.classList.remove('hidden');
  if (isUserAdmin) {
    if (gbTabAdmin) gbTabAdmin.classList.remove('hidden');
  } else {
    if (gbTabAdmin) gbTabAdmin.classList.add('hidden');
    if (gbPaneAdmin) {
      gbPaneAdmin.classList.remove('active');
      gbPaneAdmin.classList.add('hidden');
    }
  }

  if (btnGbClearOrders) {
    if (isUserAdmin) btnGbClearOrders.classList.remove('hidden');
    else btnGbClearOrders.classList.add('hidden');
  }

  // ?隢??郭藆略?株閉嚙賡蝙??閮??????芾??
  if (btnGbCopySummary) {
    if (isUserAdmin) btnGbCopySummary.classList.remove('hidden');
    else btnGbCopySummary.classList.add('hidden');
  }

  // ????箸???銵斤????格????臐???嚙??獢嚙賣??芣???擗?
  if (data.orders && currentUser?.userId && data.orders[currentUser.userId]) {
    const myOrder = data.orders[currentUser.userId];
    if (gbUserName && !gbUserName.value) gbUserName.value = myOrder.userName || '';
    if (gbUserPhone && !gbUserPhone.value) gbUserPhone.value = myOrder.userPhone || '';
    // ?蕭???嚙賡?藀?蝟?蝞??蕭??銋??????
    if (Object.keys(currentCart).length === 0 && myOrder.items) {
      currentCart = { ...myOrder.items };
    }
  } else if (currentUser?.displayName && gbUserName && !gbUserName.value) {
    gbUserName.value = currentUser.displayName;
  }

  renderCategoryNav();
  initAdminEditToggles();
  renderItemsGrid();
  updateCartBar();
  renderSummaryTab();
  populateAdminFields();
}

function renderCategoryNav() {
  if (!gbCategoryNav || !currentGroupBuyData) return;
  const categories = ['??賂蕭', '?? ?嚙賡??];
  if (Array.isArray(currentGroupBuyData.items)) {
    currentGroupBuyData.items.forEach(item => {
      if (item.category && !categories.includes(item.category)) {
        categories.push(item.category);
      }
    });
  }

  const primaryCategories = ['??賂蕭', '?? ?嚙賡??, '?嚙???, '?蟡????', '?????'];
  
  gbCategoryNav.innerHTML = '';
  gbCategoryNav.style.display = window.isCategoryNavExpanded ? 'block' : 'flex';

  const createBtn = (cat) => {
    const btn = document.createElement('button');
    btn.className = `gb-cat-btn ${cat === activeCategoryFilter ? 'active' : ''}`;
    btn.innerText = cat;
    btn.onclick = () => {
      activeCategoryFilter = cat;
      renderCategoryNav();
      renderItemsGrid();
      updateCartBar();
    };
    return btn;
  };

  const createToggleBtn = () => {
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'gb-cat-btn';
    toggleBtn.style.cssText = 'background-color:#f1f5f9; color:#334155; border:1px solid #cbd5e1; font-weight:bold; padding:6px 16px;';
    toggleBtn.innerText = window.isCategoryNavExpanded ? '????結?嚙?' : '+';
    toggleBtn.onclick = () => {
      window.isCategoryNavExpanded = !window.isCategoryNavExpanded;
      renderCategoryNav();
    };
    return toggleBtn;
  };

  if (!window.isCategoryNavExpanded) {
    const displayCategories = categories.filter(c => primaryCategories.includes(c) || c === activeCategoryFilter);
    displayCategories.forEach(cat => {
      gbCategoryNav.appendChild(createBtn(cat));
    });
    if (categories.length > displayCategories.length) {
      gbCategoryNav.appendChild(createToggleBtn());
    }
  } else {
    const commonCats = categories.filter(c => ['??賂蕭', '?? ?嚙賡??].includes(c));
    const mainCats = categories.filter(c => ['?嚙???, '?蟡????', '?????'].includes(c));
    const otherCats = categories.filter(c => !primaryCategories.includes(c));

    const renderGroup = (title, catList) => {
      if (catList.length === 0) return;
      const groupDiv = document.createElement('div');
      groupDiv.style.cssText = 'border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-bottom:12px; background:#f8fafc;';
      const titleEl = document.createElement('div');
      titleEl.style.cssText = 'font-size:14px; font-weight:bold; color:#475569; margin-bottom:10px;';
      titleEl.innerText = title;
      groupDiv.appendChild(titleEl);
      const btnContainer = document.createElement('div');
      btnContainer.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px;';
      catList.forEach(c => btnContainer.appendChild(createBtn(c)));
      groupDiv.appendChild(btnContainer);
      gbCategoryNav.appendChild(groupDiv);
    };

    renderGroup('?? ?????鞈?', commonCats);
    renderGroup('瞏???????', mainCats);
    renderGroup('??∪?????嚙?', otherCats);

    const toggleWrap = document.createElement('div');
    toggleWrap.style.cssText = 'text-align:right; margin-bottom:8px;';
    toggleWrap.appendChild(createToggleBtn());
    gbCategoryNav.appendChild(toggleWrap);
  }
}

window.expandedCategories = window.expandedCategories || {
  '?嚙???: true,
  '?蟡????': true,
  '?????': true
};
window.activeExpandedItemId = null;

function renderItemsGrid() {
  if (!gbItemsGrid || !currentGroupBuyData) return;
  gbItemsGrid.innerHTML = '';

  let filtered = currentGroupBuyData.items || [];
  if (activeCategoryFilter === '?? ?嚙賡??) {
    filtered = filtered.filter(i => currentCart[i.id] > 0);
  } else if (activeCategoryFilter !== '??賂蕭') {
    filtered = filtered.filter(i => i.category === activeCategoryFilter);
  }
  if (currentSearchQuery) {
    const q = currentSearchQuery.toLowerCase();
    filtered = filtered.filter(i => 
      (i.name && i.name.toLowerCase().includes(q)) ||
      (i.category && i.category.toLowerCase().includes(q)) ||
      (i.description && i.description.toLowerCase().includes(q))
    );
  }

  if (filtered.length === 0) {
    gbItemsGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:30px; color:#888;">?????陬?嚙????嚙?</div>';
    return;
  }

  // ?撖??嚗???瞍??????????嚙??蕭??藆?? (?嚙賣?隤拍???190px)
  
  const createItemCard = (item) => {
    const card = document.createElement('div');
    card.id = 'gb-item-card-' + item.id;
    card.className = 'gb-list-item';
    
    const qty = currentCart[item.id] || 0;
    const isExpanded = (window.activeExpandedItemId === item.id);
    
    card.style.cssText = `background:white; border:1px solid ${qty > 0 ? '#10b981' : '#e2e8f0'}; border-radius:8px; overflow:hidden; transition:all 0.2s ease; ${qty > 0 && !isExpanded ? 'background:#ecfdf5;' : ''}`;

    // ?????
    const rowHtml = `
      <div class="gb-list-row" style="display:flex; align-items:center; justify-content:space-between; padding:12px; cursor:pointer;">
        <div style="flex:1; font-weight:bold; color:#2563eb; font-size:15px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
          ${item.name}
        </div>
        <div style="flex:0 0 auto; display:flex; align-items:center;">
          ${qty > 0 ? `<span style="background:#10b981; color:white; font-size:11px; padding:2px 6px; border-radius:10px; margin-right:6px; font-weight:bold;">?嚙? ${qty}</span>` : ''}
          <span style="font-weight:bold; font-size:15px; color:#1e293b;">${item.price}</span>
        </div>
      </div>
    `;

    // ????嚙???(????嚙踝蕭嚙???寞???潘蕭嚙賢??隤荔蕭?嚙??蕭??
    let expandedHtml = '';
    if (isExpanded) {
      const dQty = (draftCart[item.id] !== undefined) ? draftCart[item.id] : (qty || 1); 

      expandedHtml = `
        <div class="gb-accordion-body" style="padding:12px 16px; background:#f8fafc; border-top:1px solid #e2e8f0;">
          
          ${item.contents ? `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div style="font-size:13px; color:#334155; text-align:left; flex:1;">
              <strong>?頨圈???/strong>${item.contents}
            </div>
          </div>` : ''}
          
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
            <div style="display:flex; align-items:center; justify-content:center; gap:12px;">
              <button class="qty-btn btn-minus" style="width:36px;height:36px;font-size:18px;border:none;border-radius:50%;background:#e2e8f0;color:#334155;cursor:pointer;font-weight:bold;">-</button>
              <span class="qty-num" style="min-width:36px;height:36px;display:flex;align-items:center;justify-content:center;border:1px solid #cbd5e1;border-radius:4px;font-size:16px;font-weight:bold;color:#1e293b;background:white;">${dQty}</span>
              <button class="qty-btn btn-plus" style="width:36px;height:36px;font-size:18px;border:none;border-radius:50%;background:#10b981;color:white;cursor:pointer;font-weight:bold;">+</button>
            </div>
            
            <div style="display:flex; gap:8px;">
              <button class="btn-confirm-draft" style="background:transparent;color:#10b981;border:none;width:36px;height:36px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform 0.1s;padding:0;"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:32px;height:32px;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg></button>
            </div>
          </div>
        </div>
      `;
    }

    
    if (isExpanded && window.gbIsAdminEditMode && typeof getEffectiveRole === 'function' && getEffectiveRole().isSuperAdmin) {
      expandedHtml += `
        <div style="padding:12px 16px; background:#fef3c7; border-top:1px solid #fde68a;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
             <input type="text" class="inline-edit-name" value="${item.name}" style="flex:1; margin-right:8px; padding:6px; border:1px solid #cbd5e1; border-radius:4px; font-size:14px;">
             <input type="number" class="inline-edit-price" value="${item.price}" style="width:80px; padding:6px; border:1px solid #cbd5e1; border-radius:4px; font-size:14px;">
          </div>
          <div style="display:flex; justify-content:flex-end;">
             <button class="btn-inline-save" style="background:#f59e0b; color:white; border:none; padding:6px 12px; border-radius:4px; font-weight:bold; cursor:pointer;">????賣蒪?/button>
          </div>
        </div>
      `;
    }
    card.innerHTML = rowHtml + expandedHtml;


    // ?剛﹞颲???
    const row = card.querySelector('.gb-list-row');
    row.onclick = () => { if (typeof validateNamePhone === 'function' && !validateNamePhone()) return;
      if (window.activeExpandedItemId === item.id) {
        window.activeExpandedItemId = null; // ???
      } else {
        window.activeExpandedItemId = item.id; // ???
        if (draftCart[item.id] === undefined) {
          draftCart[item.id] = currentCart[item.id] || 1; // ??梯澈?鞈????艞?薴??皛??鞊?
        }
      }
      renderItemsGrid();
    };

    if (isExpanded) {
      const btnMinus = card.querySelector('.btn-minus');
      const btnPlus = card.querySelector('.btn-plus');
      const btnConfirm = card.querySelector('.btn-confirm-draft');
      

      if (btnMinus) btnMinus.onclick = (e) => { if (typeof validateNamePhone === 'function' && !validateNamePhone()) return;
        e.stopPropagation();
        if (draftCart[item.id] > 0) {
          draftCart[item.id]--;
          renderItemsGrid();
        }
      };
      
      if (btnPlus) btnPlus.onclick = (e) => { if (typeof validateNamePhone === 'function' && !validateNamePhone()) return;
        e.stopPropagation();
        draftCart[item.id] = (draftCart[item.id] || 0) + 1;
        renderItemsGrid();
      };
      if (window.gbIsAdminEditMode && typeof getEffectiveRole === 'function' && getEffectiveRole().isSuperAdmin) {
        const btnInlineSave = card.querySelector('.btn-inline-save');
        const inputName = card.querySelector('.inline-edit-name');
        const inputPrice = card.querySelector('.inline-edit-price');
        if (btnInlineSave) {
          btnInlineSave.onclick = async (e) => {
            e.stopPropagation();
            const newName = inputName.value.trim();
            const newPrice = parseFloat(inputPrice.value);
            
            if (!newName) {
              if (!confirm('?嚙??蝞??ㄛ?唳????瑁?????嚙???)) return;
              try {
                const res = await fetch(`/api/groupbuy/${currentGid || 'default'}/item/delete`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ uid: currentUser?.userId || 'admin', itemId: item.id })
                });
                const data = await res.json();
                if (data.success) {
                  if (typeof fetchGroupBuyData === 'function') fetchGroupBuyData(currentGid);
                } else {
                  alert('??瑁??剜??');
                }
              } catch(err) { console.error(err); }
              return;
            }

            if (isNaN(newPrice)) { alert('?撖?貍嚙?蝞?'); return; }
            
            try {
              const res = await fetch(`/api/groupbuy/${currentGid || 'default'}/item/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  uid: currentUser?.userId || 'admin',
                  item: { ...item, name: newName, price: newPrice }
                })
              });
              const data = await res.json();
              if (data.success) {
                alert('?賣蒪?艞???);
                if (typeof fetchGroupBuyData === 'function') fetchGroupBuyData(currentGid);
              } else {
                alert('?賣蒪踵??');
              }
            } catch(err) { console.error(err); }
          };
        }
      }

      if (btnConfirm) btnConfirm.onclick = (e) => { if (typeof validateNamePhone === 'function' && !validateNamePhone()) return;
        e.stopPropagation();
        if (draftCart[item.id] > 0) {
          currentCart[item.id] = draftCart[item.id];
        } else {
          delete currentCart[item.id];
        }
        delete draftCart[item.id];
        window.activeExpandedItemId = null; // ?????箄姘??????
        renderItemsGrid();
        updateCartBar();
        saveCartToBackend();
      };

      
    }

    
    return card;
  };

  const isAllView = (activeCategoryFilter === '??賂蕭' && (!currentSearchQuery || currentSearchQuery.trim() === ''));

  if (!isAllView) {
    gbItemsGrid.style.display = 'grid';
    gbItemsGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(190px, 1fr))';
    gbItemsGrid.style.gap = '8px';
    gbItemsGrid.style.alignItems = 'start';
    
    filtered.forEach(item => {
      gbItemsGrid.appendChild(createItemCard(item));
    });
  } else {
    gbItemsGrid.style.display = 'block';
    
    const groups = {};
    filtered.forEach(item => {
      const cat = item.category || '?????;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    
    const primaryCategories = ['?嚙???, '?蟡????', '?????'];
    const sortedCats = Object.keys(groups).sort((a, b) => {
      const idxA = primaryCategories.indexOf(a);
      const idxB = primaryCategories.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    sortedCats.forEach(cat => {
      const groupDiv = document.createElement('div');
      groupDiv.style.marginBottom = '24px';
      groupDiv.style.background = 'transparent';
      
      const titleEl = document.createElement('div');
      titleEl.style.cssText = 'font-size:16px; font-weight:bold; color:#1e293b; margin-bottom:12px; display:flex; align-items:center; gap:8px;';
      titleEl.innerHTML = `<span style="width:4px; height:18px; background:#10b981; border-radius:2px; display:inline-block;"></span>${cat}`;
      groupDiv.appendChild(titleEl);
      
      const gridDiv = document.createElement('div');
      gridDiv.style.display = 'grid';
      gridDiv.style.gridTemplateColumns = 'repeat(auto-fill, minmax(190px, 1fr))';
      gridDiv.style.gap = '8px';
      gridDiv.style.alignItems = 'start';
      
      groups[cat].forEach(item => {
        gridDiv.appendChild(createItemCard(item));
      });
      
      groupDiv.appendChild(gridDiv);
      gbItemsGrid.appendChild(groupDiv);
    });
  }

}

window.forceOpenDetail = function(itemId) {
  if (!currentGroupBuyData || !currentGroupBuyData.items) return;
  const item = currentGroupBuyData.items.find(i => i.id === itemId);
  if (item) {
    openItemDetail(item);
  }
};

function openItemDetail(item) {
  selectedDetailItem = item;
  detailQty = currentCart[item.id] || 1;

  if (itemDetailCategory) itemDetailCategory.innerText = item.category || '?嚙?';
  if (itemDetailName) itemDetailName.innerText = item.name;
  if (itemDetailPrice) itemDetailPrice.innerText = item.price;
  if (itemDetailUnit) itemDetailUnit.innerText = item.unit ? `/ ${item.unit}` : '';
  if (itemDetailDesc) itemDetailDesc.innerHTML = (item.description || '??蕭?啣??阡??').replace(/\n/g, '<br/>');

  if (itemDetailImgContainer) {
    if (item.imageUrl) {
      itemDetailImgContainer.innerHTML = `<img src="${item.imageUrl}" alt="${item.name}" style="max-width:100%;max-height:140px;object-fit:contain;border-radius:8px;" />`;
    } else {
      itemDetailImgContainer.innerHTML = `<span style="font-size:48px;">?艞?</span>`;
    }
  }

  // ?准?嚙????撅???橘蕭??蕭?皛???
  if (itemDetailLinkContainer && itemDetailLinkBtn && itemDetailLinkText) {
    if (item.linkUrl) {
      itemDetailLinkBtn.href = item.linkUrl;
      itemDetailLinkText.innerText = item.linkText || '?箏╡????蕭?祈?';
      itemDetailLinkContainer.classList.remove('hidden');
    } else {
      itemDetailLinkContainer.classList.add('hidden');
    }
  }

  if (detailQtyNum) detailQtyNum.innerText = detailQty;
  if (itemDetailModal) itemDetailModal.classList.remove('hidden');
}

async function saveCartToBackend() {
  if (!currentGroupBuyData || !currentUser) return;
  
  const gbHeaderNameInput = document.getElementById('gb-header-name');
  const gbHeaderPhoneInput = document.getElementById('gb-header-phone');
  
  const oldOrder = currentGroupBuyData.orders && currentGroupBuyData.orders[currentUser.userId];
  const defaultName = (oldOrder && oldOrder.userName) ? oldOrder.userName : (currentUser.displayName || '??賅朱??);
  const defaultPhone = (oldOrder && oldOrder.userPhone) ? oldOrder.userPhone : '';
  
  const name = gbHeaderNameInput && gbHeaderNameInput.value.trim() ? gbHeaderNameInput.value.trim() : defaultName;
  const phone = gbHeaderPhoneInput ? gbHeaderPhoneInput.value.trim() : defaultPhone;
  const note = (oldOrder && oldOrder.note) ? oldOrder.note : '';
  
  try {
    const res = await fetch(`/api/groupbuy/${currentGid}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: phone, userName: name, userPhone: phone, userPictureUrl: currentUser.pictureUrl || '',
        items: currentCart,
        paymentMethod: 'none',
        paymentNote: '',
        note: note
      })
    });
    const data = await res.json();
    if (data.success) {
      await fetchGroupBuyData();
    }
  } catch(e) {
    console.error('?瞏殷蕭嚙??獢隞??', e);
  }
}

function updateCartBar() {
  let count = 0;
  let sum = 0;

  if (currentGroupBuyData && currentGroupBuyData.items) {
    for (const [itemId, qty] of Object.entries(currentCart)) {
      if (qty > 0) {
        count += qty;
        const p = currentGroupBuyData.items.find(i => i.id === itemId);
        if (p) sum += (p.price || 0) * qty;
      }
    }
  }

  const headerTotal = document.getElementById('gb-header-total');
  const headerSum = document.getElementById('gb-header-sum');

  if (headerSum) headerSum.innerText = sum;

  if (headerTotal) {
    if (count > 0 && groupBuyView && !groupBuyView.classList.contains('hidden')) {
      headerTotal.classList.remove('hidden');
    } else {
      headerTotal.classList.add('hidden');
    }
  }
}

function openGroupBuyPage() {
  fetchGroupBuyData().then(() => {
    const gbHeaderNameInput = document.getElementById('gb-header-name');
    const gbHeaderPhoneInput = document.getElementById('gb-header-phone');
    
    if (gbHeaderPhoneInput) {
      
      const reloadCart = () => {
        const n = (gbHeaderNameInput && gbHeaderNameInput.value.trim().toLowerCase()) || '';
        const p = (gbHeaderPhoneInput && gbHeaderPhoneInput.value.trim()) || '';
        const key = (n && p) ? `${n}_${p}` : '';
        
        if (key && currentGroupBuyData && currentGroupBuyData.orders && currentGroupBuyData.orders[key]) {
          currentCart = { ...currentGroupBuyData.orders[key].items };
        } else if (p || n) {
          currentCart = {};
        }
        renderItemsGrid();
        updateCartBar();
      };
      
      gbHeaderPhoneInput.addEventListener('input', () => {
        const p = gbHeaderPhoneInput.value.trim();
        if (p === '' || /^09\d{8}$/.test(p)) reloadCart();
      });
      if (gbHeaderNameInput) {
        gbHeaderNameInput.addEventListener('input', () => {
          const p = gbHeaderPhoneInput ? gbHeaderPhoneInput.value.trim() : '';
          if (p === '' || /^09\d{8}$/.test(p)) reloadCart();
        });
      }

    }
    if (currentUser && currentGroupBuyData) {
      const oldOrder = currentGroupBuyData.orders && currentGroupBuyData.orders[currentUser.userId];
      if (gbHeaderNameInput) {
        gbHeaderNameInput.value = (oldOrder && oldOrder.userName) ? oldOrder.userName : (currentUser.displayName || '');
      }
      if (gbHeaderPhoneInput) {
        gbHeaderPhoneInput.value = (oldOrder && oldOrder.userPhone) ? oldOrder.userPhone : '';
      }
    }
  });
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  if (groupBuyView) groupBuyView.classList.remove('hidden');
  updateCartBar();
}

function renderSummaryTab() {
  if (!currentGroupBuyData || !gbPaneSummary) return;

  const isUserAdmin = checkIsAdmin();
  const totalsContainer = document.getElementById('gb-summary-totals');
  const ordersContainer = document.getElementById('gb-orders-list');
  const orders = currentGroupBuyData.orders || {};
  const itemsMap = {}; // itemId -> { name, price, totalQty }

  if (currentGroupBuyData.items) {
    currentGroupBuyData.items.forEach(i => {
      itemsMap[i.id] = { name: i.name, price: i.price, category: i.category, qty: 0 };
    });
  }

  let totalRevenue = 0;
  let totalOrderCount = Object.keys(orders).length;

  Object.values(orders).forEach(ord => {
    if (ord.items) {
      for (const [itemId, qty] of Object.entries(ord.items)) {
        if (itemsMap[itemId] && qty > 0) {
          itemsMap[itemId].qty += qty;
          totalRevenue += itemsMap[itemId].price * qty;
        }
      }
    }
  });

  // 1. ?????????萄?Ｗ?嚙??嚙??皛?箏╡????蕭?啣???
  if (totalsContainer) {
    const orderedItems = Object.values(itemsMap).filter(x => x.qty > 0);
    orderedItems.sort((a, b) => b.qty - a.qty); // ?敶?薴征???
    if (orderedItems.length === 0) {
      totalsContainer.innerHTML = '<div style="color:#888; text-align:center; padding:15px;">?獢???塚蕭??敼?嚙?</div>';
    } else {
      totalsContainer.innerHTML = '';
      const table = document.createElement('table');
      table.style.cssText = 'width:100%; border-collapse:collapse; margin-bottom:15px;';
      table.innerHTML = '';
      
      let theadHtml = `<thead><tr>
        <th style="border:1px solid #dee2e6;padding:8px;font-size:13px;background:#e9ecef;white-space:nowrap;">???</th>
        <th style="border:1px solid #dee2e6;padding:8px;font-size:13px;background:#e9ecef;">?嚙??皛刻?</th>
        <th style="border:1px solid #dee2e6;padding:8px;font-size:13px;background:#e9ecef;white-space:nowrap;">?獢嚙?/th>
        <th style="border:1px solid #dee2e6;padding:8px;font-size:13px;background:#e9ecef;white-space:nowrap;">?鞈?</th>`;
      
      if (isUserAdmin) {
        theadHtml += `<th style="border:1px solid #dee2e6;padding:8px;font-size:13px;background:#e9ecef;white-space:nowrap;">???</th>`;
      }
      theadHtml += `</tr></thead>`;
      table.innerHTML = theadHtml;
      
      const tbody = document.createElement('tbody');

      orderedItems.forEach((x, idx) => {
        const itemObj = (currentGroupBuyData.items || []).find(i => i.name === x.name);
        const contentsText = itemObj ? (itemObj.contents || itemObj.description || '') : '';

        const tr = document.createElement('tr');
        const rankEmoji = idx === 0 ? '??' : idx === 1 ? '??' : idx === 2 ? '??' : `${idx + 1}`;
        
        let rowHtml = `
          <td style="border:1px solid #dee2e6;padding:8px;font-size:13px;text-align:center;">${rankEmoji}</td>
          <td style="border:1px solid #dee2e6;padding:8px;font-size:13px;"><span style="cursor:pointer;color:#2563eb;text-decoration:underline;margin-right:8px;" class="gb-rank-item-name"><strong>${x.name}</strong></span><span class="gb-rank-item-buyers" style="cursor:pointer;font-size:14px;" title="?鈭??螂??皛?">?臐六</span></td>
          <td style="border:1px solid #dee2e6;padding:8px;font-size:13px;text-align:center;">$${x.price}</td>
          <td style="border:1px solid #dee2e6;padding:8px;font-size:13px;text-align:center;"><strong style="color:#27ae60;font-size:15px;">${x.qty}</strong></td>
        `;
        
        if (isUserAdmin) {
          rowHtml += `<td style="border:1px solid #dee2e6;padding:8px;font-size:13px;text-align:center;">$${x.price * x.qty}</td>`;
        }
        
        tr.innerHTML = rowHtml;

        const nameSpan = tr.querySelector('.gb-rank-item-name');
        const buyersSpan = tr.querySelector('.gb-rank-item-buyers');
        if (itemObj) {
          if (nameSpan) {
            nameSpan.onclick = () => {
              if (typeof gbTabItems !== 'undefined' && gbTabItems) gbTabItems.click();
              activeCategoryFilter = itemObj.category || '??賂蕭';
              renderCategoryNav();
              window.activeExpandedItemId = itemObj.id;
              renderItemsGrid();
              setTimeout(() => {
                const card = document.getElementById('gb-item-card-' + itemObj.id);
                if (card) {
                  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  card.style.transition = 'box-shadow 0.3s';
                  card.style.boxShadow = '0 0 15px rgba(37,99,235,0.6)';
                  setTimeout(() => card.style.boxShadow = '', 2000);
                }
              }, 100);
            };
          }
          if (buyersSpan) {
            buyersSpan.onclick = () => {
            const buyers = [];
            let totalItemQty = 0;
            const orders = currentGroupBuyData.orders || {};
            Object.values(orders).forEach(ord => {
              const q = ord.items && ord.items[itemObj.id];
              if (q > 0) {
                const avatarHtml = ord.userPictureUrl ? `<img src="${ord.userPictureUrl}" style="width:20px;height:20px;border-radius:50%;vertical-align:middle;margin-right:4px;">` : '?薵?';
                buyers.push(`- ${avatarHtml} ${ord.userName} : ${q} ${itemObj.unit || ''}`);
                totalItemQty += q;
              }
            });
            
            let extraInfo = '';
            if (buyers.length > 0) {
              extraInfo = `\n\n????皛拚??????湛蕭??株郭嚙?${totalItemQty} ${itemObj.unit || ''})\n` + buyers.join('\n');
            } else {
              extraInfo = `\n\n????皛拚??????湛蕭擃▋?獢????????輯??瞏貊?嚙?
            }

            const tempItem = { ...itemObj, description: (itemObj.description || '??蕭?啣??阡??') + extraInfo };
              openItemDetail(tempItem);
            };
          }
        }
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);

      if (isUserAdmin) {
        const tfoot = document.createElement('tfoot');
        tfoot.innerHTML = `<tr><td colspan="4" style="border:1px solid #dee2e6;padding:8px;font-size:13px;text-align:right;"><strong>????株釭? (${totalOrderCount} ??</strong></td><td style="border:1px solid #dee2e6;padding:8px;font-size:13px;text-align:center;"><strong style="color:#e74c3c;font-size:16px;">$${totalRevenue}</strong></td></tr>`;
        table.appendChild(tfoot);
      }
      
      totalsContainer.appendChild(table);
    }
  }

  // 2. ???銵斤??殷蕭??臐?????
  if (ordersContainer) {
    ordersContainer.innerHTML = '';
    const orderList = Object.entries(orders).map(([k, v]) => ({ ...v, orderKey: k }));
    if (orderList.length === 0) {
      ordersContainer.innerHTML = '<div style="color:#888; text-align:center; padding:15px;">?獢?????銵斤??臐???/div>';
    } else {
      orderList.forEach(ord => {
        const card = document.createElement('div');
        card.className = 'gb-order-card';

        const isPaid = ord.paymentStatus === 'paid';

        let itemsText = [];
        if (ord.items) {
          for (const [itemId, qty] of Object.entries(ord.items)) {
            const p = itemsMap[itemId];
            if (p && qty > 0) itemsText.push(`${p.name} ? ${qty}`);
          }
        }

        let diffText = [];
        if (ord.lastConfirmedItems) {
          const allItemIds = new Set([...Object.keys(ord.items || {}), ...Object.keys(ord.lastConfirmedItems)]);
          allItemIds.forEach(itemId => {
            const newQty = (ord.items && ord.items[itemId]) || 0;
            const oldQty = ord.lastConfirmedItems[itemId] || 0;
            if (newQty > oldQty) {
              const p = itemsMap[itemId];
              if (p) diffText.push(`+ ${p.name} ? ${newQty - oldQty}`);
            } else if (newQty < oldQty) {
              const p = itemsMap[itemId];
              if (p) diffText.push(`- ${p.name} ? ${oldQty - newQty}`);
            }
          });
        }

        const cardBg = isPaid ? 'white' : '#fffbeb';
        const cardBorder = isPaid ? '#e2e8f0' : '#fde68a';
        card.style.cssText = `background:${cardBg}; border:1px solid ${cardBorder}; border-radius:12px; padding:12px; margin-bottom:12px; box-shadow:0 1px 3px rgba(0,0,0,0.05); position:relative; transition: background 0.3s;`;

        const statusBadge = isPaid 
          ? '<span style="color:#27ae60; font-weight:bold;">???殷蕭敼蝞?</span>' 
          : '<span style="color:#e67e22; font-weight:bold;">????售??/span>';

        let isUserSuperAdmin = false;
        if (typeof getEffectiveRole === 'function') {
          isUserSuperAdmin = getEffectiveRole().isSuperAdmin;
        }
        const phoneDisplay = (isUserAdmin && ord.userPhone) ? ` (${ord.userPhone})` : '';

        const adminBtn = isUserAdmin ? `
          <div style="display:flex; gap:8px;">
            <button class="delete-order-btn" style="border:1px solid #ef4444; background:transparent; color:#ef4444; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:bold;">??????瑁?</button>
            <button class="paid-btn ${isPaid ? 'paid' : ''}" style="border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:bold; ${isPaid ? 'background:#e2e8f0;color:#64748b;' : 'background:#2563eb;color:white;'}">${isPaid ? '?臐??????' : '?????殷蕭敼?}</button>
          </div>
        ` : '';

        card.innerHTML = `
          <div class="gb-order-header">
            <span>${ord.userPictureUrl ? `<img src="${ord.userPictureUrl}" style="width:24px;height:24px;border-radius:50%;vertical-align:middle;margin-right:6px;">` : '?薵? '}${ord.userName}${phoneDisplay}</span>
            <span>$${ord.totalAmount} | ${statusBadge}</span>
          </div>
          <div style="font-size:13px; color:#495057; margin-bottom:4px;">
            <strong>?嚙???/strong>${itemsText.join(', ') || '??}
          </div>
          ${diffText.length > 0 ? `<div style="font-size:13px; color:#2563eb; margin-bottom:4px; font-weight:bold;">?? ???/??瑁??????{diffText.join(', ')}</div>` : ''}
          ${ord.note ? `<div style="font-size:12px; color:#2980b9; margin-top:4px;">?? ?頨圈?: ${ord.note}</div>` : ''}
          ${adminBtn ? `<div style="display:flex; justify-content:flex-end; margin-top:8px;">${adminBtn}</div>` : ''}
        `;

        if (isUserAdmin) {
          const btnPaid = card.querySelector('.paid-btn');
          if (btnPaid) {
            btnPaid.onclick = async () => {
              const newStatus = isPaid ? 'unverified' : 'paid';
              try {
                await fetch(`/api/groupbuy/${currentGid || 'default'}/mark_paid`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ uid: currentUser?.userId || 'admin', targetUid: ord.orderKey, status: newStatus })
                });
              } catch(e) { console.error(e); }
            };
          }
          const btnDelete = card.querySelector('.delete-order-btn');
          if (btnDelete) {
            btnDelete.onclick = async () => {
              if (confirm(`?????穿蕭???${ord.userName} ?嚙??獢??蕭餈?皛?????嚙??嚙?) {
                try {
                  await fetch(`/api/groupbuy/${currentGid || 'default'}/delete_order`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ targetUid: ord.orderKey })
                  });
                  if (typeof fetchGroupBuyData === 'function') fetchGroupBuyData(currentGid);
                } catch(e) { console.error(e); }
              }
            };
          }
        }

        ordersContainer.appendChild(card);
      });
    }
  }
}

function populateAdminFields() {
  if (!currentGroupBuyData) return;
  const p = currentGroupBuyData.paymentSettings || {};
  if (btnGbAdminToggle) {
    const knob = btnGbAdminToggle.querySelector('.toggle-knob');
    const lblOpen = document.getElementById('lbl-open');
    const lblClose = document.getElementById('lbl-close');
    if (currentGroupBuyData.active) {
      btnGbAdminToggle.style.background = '#10b981';
      if (knob) knob.style.transform = 'translateX(24px)';
      if (lblOpen) lblOpen.style.color = '#10b981';
      if (lblClose) lblClose.style.color = '#cbd5e1';
    } else {
      btnGbAdminToggle.style.background = '#cbd5e1';
      if (knob) knob.style.transform = 'translateX(0)';
      if (lblOpen) lblOpen.style.color = '#cbd5e1';
      if (lblClose) lblClose.style.color = '#ef4444';
    }
  }
  
  const btnGbAdminHiddenToggle = document.getElementById('btn-gb-admin-hidden-toggle');
  if (btnGbAdminHiddenToggle) {
    const knob2 = btnGbAdminHiddenToggle.querySelector('.toggle-knob');
    const lblShow = document.getElementById('lbl-show');
    const lblHide = document.getElementById('lbl-hide');
    if (!currentGroupBuyData.hiddenFromLobby) {
      // ?輯???      btnGbAdminHiddenToggle.style.background = '#10b981';
      if (knob2) knob2.style.transform = 'translateX(24px)';
      if (lblShow) lblShow.style.color = '#10b981';
      if (lblHide) lblHide.style.color = '#cbd5e1';
    } else {
      // ?璇?
      btnGbAdminHiddenToggle.style.background = '#cbd5e1';
      if (knob2) knob2.style.transform = 'translateX(0)';
      if (lblShow) lblShow.style.color = '#cbd5e1';
      if (lblHide) lblHide.style.color = '#ef4444';
    }
  }
  if (gbAdminTitleInput) gbAdminTitleInput.value = currentGroupBuyData.title || '';
  if (gbAdminNoticeInput) gbAdminNoticeInput.value = currentGroupBuyData.notice || '';
  if (gbAdminHiddenLobbyInput) gbAdminHiddenLobbyInput.checked = !!currentGroupBuyData.hiddenFromLobby;
  if (gbAdminLinepayLink) gbAdminLinepayLink.value = p.linePayLink || '';
  if (gbAdminLinepayQr) gbAdminLinepayQr.value = p.linePayQrUrl || '';
  if (gbAdminBankCode) gbAdminBankCode.value = p.bankCode || '';
  if (gbAdminBankName) gbAdminBankName.value = p.bankName || '';
  if (gbAdminBankAccount) gbAdminBankAccount.value = p.bankAccount || '';
  renderAdminItemsList();
}

function renderAdminItemsList() {
  const container = document.getElementById('gb-admin-items-list');
  const countSpan = document.getElementById('gb-admin-items-count');
  if (!container || !currentGroupBuyData) return;

  if (!Array.isArray(currentGroupBuyData.items) || currentGroupBuyData.items.length === 0) {
    currentGroupBuyData.items = getZhanRongDefaultItemsClient();
  }

  const items = currentGroupBuyData.items;
  if (countSpan) countSpan.innerText = items.length;

  if (items.length === 0) {
    container.innerHTML = '<div style="color:#888; text-align:center; padding:15px;">??塚蕭?嚙??姘??箏╡???皎????????/div>';
    return;
  }

  let html = '<div style="display:flex; flex-direction:column; gap:6px;">';
  items.forEach(item => {
    html += `
      <div style="display:flex; justify-content:space-between; align-items:center; background:#f8f9fa; padding:8px 12px; border-radius:8px; border:1px solid #e9ecef;">
        <div style="flex:1;">
          <span style="font-size:11px; background:#e0e0e0; color:#333; padding:2px 6px; border-radius:4px; margin-right:6px;">${item.category || '???'}</span>
          <strong style="font-size:14px;">${item.name}</strong>
          <span style="color:#e74c3c; font-weight:bold; margin-left:8px;">$${item.price}</span>
          ${item.unit ? `<span style="font-size:12px; color:#888;">/${item.unit}</span>` : ''}
        </div>
        <button class="btn-secondary btn-edit-item" data-id="${item.id}" style="padding:4px 10px; font-size:12px; background:#3498db; color:white; border-radius:6px;">?藃?? ?箏??/button>
      </div>
    `;
  });
  html += '</div>';
  container.innerHTML = html;

  // ?穿蕭??箏?????剛﹞颲?  container.querySelectorAll('.btn-edit-item').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      const targetItem = items.find(i => i.id === id);
      if (targetItem) openItemEditModal(targetItem);
    };
  });
}

function closeItemEditModal() {
  const modal = document.getElementById('gbItemEditModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.removeProperty('display');
    modal.style.removeProperty('opacity');
    modal.style.removeProperty('z-index');
  }
}

function openItemEditModal(item = null) {
    const modal = document.getElementById('gbItemEditModal');
  const title = document.getElementById('gb-item-edit-title');
  const idInput = document.getElementById('gb-edit-item-id');
  const catInput = document.getElementById('gb-edit-item-category');
  const nameInput = document.getElementById('gb-edit-item-name');
  const priceInput = document.getElementById('gb-edit-item-price');
  
  const linkTextInput = document.getElementById('gb-edit-item-linktext');
  const descInput = document.getElementById('gb-edit-item-desc');
  const contentsInput = document.getElementById('gb-edit-item-contents');
  const linkUrlInput = document.getElementById('gb-edit-item-linkurl');
  const imgUrlInput = document.getElementById('gb-edit-item-imgurl');
  const btnDelete = document.getElementById('btn-gb-delete-item');

  const suggestions = document.getElementById('gb-category-suggestions');
  if (suggestions && currentGroupBuyData && currentGroupBuyData.items) {
    const cats = new Set();
    currentGroupBuyData.items.forEach(i => { if (i.category) cats.add(i.category); });
    suggestions.innerHTML = Array.from(cats).map(c => `<option value="${c}">`).join('');
  }


  if (item) {
    if (title) title.innerText = '?藃?? ?箏??嚙??嚙?';
    if (idInput) idInput.value = item.id;
    if (catInput) catInput.value = item.category || '';
    if (nameInput) nameInput.value = item.name || '';
    if (priceInput) priceInput.value = item.price || '';
    
    if (linkTextInput) linkTextInput.value = item.linkText || '';
    if (descInput) descInput.value = item.description || '';
    if (contentsInput) contentsInput.value = item.contents || '';
    if (linkUrlInput) linkUrlInput.value = item.linkUrl || '';
    if (imgUrlInput) imgUrlInput.value = item.imageUrl || '';
    if (btnDelete) btnDelete.classList.remove('hidden');
  } else {
    if (title) title.innerText = '?????????嚙??嚙?';
    if (idInput) idInput.value = '';
    if (catInput) catInput.value = activeCategoryFilter !== '??賂蕭' ? activeCategoryFilter : '';
    if (nameInput) nameInput.value = '';
    if (priceInput) priceInput.value = '';
    
    if (linkTextInput) linkTextInput.value = '?箏╡????蕭?祈?';
    if (descInput) descInput.value = '';
    if (linkUrlInput) linkUrlInput.value = '';
    if (imgUrlInput) imgUrlInput.value = '';
    if (btnDelete) btnDelete.classList.add('hidden');
  }

  if (modal) { document.body.appendChild(modal); modal.classList.remove('hidden'); modal.style.setProperty('display', 'flex', 'important'); modal.style.setProperty('opacity', '1', 'important'); modal.style.setProperty('z-index', '999999', 'important'); }
}

// ?穿蕭??剛﹞颲??嚙?function initGroupBuyEvents() {
  if (btnGroupBuyNav) {
    btnGroupBuyNav.onclick = () => openGroupBuyPage();
  }
  if (btnEnterGroupBuy) {
    btnEnterGroupBuy.onclick = () => openGroupBuyPage();
  }
  if (btnBackGroupBuy) {
    btnBackGroupBuy.onclick = () => {
      if (groupBuyView) groupBuyView.classList.add('hidden');
      document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
      renderLobby();
      if (groupBuyCartBar) groupBuyCartBar.classList.add('hidden');
    };
  }

  // ?嚙賣??嚙?
  if (gbTabItems) {
    gbTabItems.onclick = () => {
      gbTabItems.classList.add('active');
      gbTabSummary.classList.remove('active');
      if (gbTabAdmin) gbTabAdmin.classList.remove('active');

      gbPaneItems.classList.add('active');
      gbPaneItems.classList.remove('hidden');
      gbPaneSummary.classList.remove('active');
      gbPaneSummary.classList.add('hidden');
      if (gbPaneAdmin) {
        gbPaneAdmin.classList.remove('active');
        gbPaneAdmin.classList.add('hidden');
      }
      updateCartBar();
    };
  }
  if (gbTabSummary) {
    gbTabSummary.onclick = () => {
      gbTabSummary.classList.add('active');
      gbTabItems.classList.remove('active');
      if (gbTabAdmin) gbTabAdmin.classList.remove('active');

      gbPaneSummary.classList.add('active');
      gbPaneSummary.classList.remove('hidden');
      gbPaneItems.classList.remove('active');
      gbPaneItems.classList.add('hidden');
      if (gbPaneAdmin) {
        gbPaneAdmin.classList.remove('active');
        gbPaneAdmin.classList.add('hidden');
      }
      renderSummaryTab();
      if (groupBuyCartBar) groupBuyCartBar.classList.add('hidden');
    };
  }
  if (gbTabAdmin) {
    gbTabAdmin.onclick = () => {
      gbTabAdmin.classList.add('active');
      gbTabItems.classList.remove('active');
      gbTabSummary.classList.remove('active');

      if (gbPaneAdmin) {
        gbPaneAdmin.classList.add('active');
        gbPaneAdmin.classList.remove('hidden');
      }
      if (gbPaneItems) {
        gbPaneItems.classList.remove('active');
        gbPaneItems.classList.add('hidden');
      }
      if (gbPaneSummary) {
        gbPaneSummary.classList.remove('active');
        gbPaneSummary.classList.add('hidden');
      }
      if (groupBuyCartBar) groupBuyCartBar.classList.add('hidden');
      populateAdminFields();
    };
  }



  // ?啣? Modal ?剛﹞颲?  const btnCloseItemDetailBottom = document.getElementById('btn-close-item-detail-bottom');
  if (btnCloseItemDetail) {
    btnCloseItemDetail.onclick = () => itemDetailModal.classList.add('hidden');
  }
  if (btnCloseItemDetailBottom) {
    btnCloseItemDetailBottom.onclick = () => itemDetailModal.classList.add('hidden');
  }
  if (itemDetailModal) {
    itemDetailModal.onclick = (e) => {
      if (e.target === itemDetailModal) itemDetailModal.classList.add('hidden');
    };
  }
  if (btnDetailQtyMinus) {
    btnDetailQtyMinus.onclick = () => {
      if (detailQty > 0) {
        detailQty--;
        if (detailQtyNum) detailQtyNum.innerText = detailQty;
      }
    };
  }
  if (btnDetailQtyPlus) {
    btnDetailQtyPlus.onclick = () => {
      detailQty++;
      if (detailQtyNum) detailQtyNum.innerText = detailQty;
    };
  }
  if (btnDetailConfirmAdd) {
    btnDetailConfirmAdd.onclick = () => {
      if (selectedDetailItem) {
        if (detailQty > 0) {
          currentCart[selectedDetailItem.id] = detailQty;
        } else {
          delete currentCart[selectedDetailItem.id];
        }
        renderItemsGrid();
        updateCartBar();
        saveCartToBackend();
        itemDetailModal.classList.add('hidden');
      }
    };
  }

  // ?荊?潸 Modal ?剛﹞颲?  if (btnGbOpenCheckout) {
    btnGbOpenCheckout.onclick = () => openCheckoutModal();
  }
  if (btnCloseCheckout) {
    btnCloseCheckout.onclick = () => groupBuyCheckoutModal.classList.add('hidden');
  }


  // ?嚙賣?????殷蕭敼?  if (btnSubmitGbOrder) {
    btnSubmitGbOrder.onclick = async () => {
      const name = gbUserName.value.trim();
      const phone = gbUserPhone.value.trim();
      if (!name || !phone) {
        alert('?Ｚ??菜????皛?????擗???);
        return;
      }



      try {
        const res = await fetch(`/api/groupbuy/${currentGid || 'default'}/order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: phone, userName: name, userPhone: phone, items: currentCart,
            paymentMethod: 'none',
            paymentNote: '',
            note: gbOrderNote ? gbOrderNote.value.trim() : ''
          })
        });

        const data = await res.json();
        if (data.success) {
          alert('?? ?殷蕭敼?????蕭嚙賣???);
          groupBuyCheckoutModal.classList.add('hidden');
          renderItemsGrid();
          updateCartBar();
        } else {
          alert('?嚙賣??剜???? + data.error);
        }
      } catch(e) {
        alert('?瞏殷蕭嚙??獢隞?璇?' + e.message);
      }
    };
  }

  // ?蕭?????蝯嚙???
  if (btnGbCopySummary) {
    btnGbCopySummary.onclick = () => {
      if (!currentGroupBuyData) return;
      const orders = currentGroupBuyData.orders || {};
      const itemsMap = {};
      (currentGroupBuyData.items || []).forEach(i => { itemsMap[i.id] = { name: i.name, price: i.price, qty: 0 }; });

      let totalRevenue = 0;
      Object.values(orders).forEach(ord => {
        if (ord.items) {
          for (const [id, qty] of Object.entries(ord.items)) {
            if (itemsMap[id] && qty > 0) {
              itemsMap[id].qty += qty;
              totalRevenue += itemsMap[id].price * qty;
            }
          }
        }
      });

      let summaryText = `?? ??{currentGroupBuyData.title || '?Ｚ???瑟????}?薴蝯嚙質??殷蕭?\n`;
      summaryText += `----------------------------------------\n`;
      Object.values(itemsMap).filter(x => x.qty > 0).forEach(x => {
        summaryText += `- ${x.name} x ${x.qty} ($${x.price * x.qty})\n`;
      });
      summaryText += `----------------------------------------\n`;
      summaryText += `?株部??踴答?$${totalRevenue}\n`;
      summaryText += `?株釭?????鞈?${Object.keys(orders).length} ?剜?n`;

      navigator.clipboard.writeText(summaryText).then(() => {
        alert('???????蝯嚙踢未????氣????曄巨?芷?');
      });
    };
  }

  // ????桀???桅??????(????桀?? / ???桀?? / ?嚙??桀??)
  const subBtnTheme = document.getElementById('btn-admin-subtab-theme');
  const subBtnItems = document.getElementById('btn-admin-subtab-items');

  const subPaneTheme = document.getElementById('gb-admin-subpane-theme');
  const subPaneItems = document.getElementById('gb-admin-subpane-items');

  function switchAdminSubTab(target) {
    [subBtnTheme, subBtnItems].forEach(b => {
      if (b) {
        b.style.background = 'transparent';
        b.style.color = '#64748b';
        b.style.boxShadow = 'none';
      }
    });
    if (subPaneTheme) subPaneTheme.classList.add('hidden');
    if (subPaneItems) subPaneItems.classList.add('hidden');

    if (target === 'theme') {
      if (subBtnTheme) { subBtnTheme.style.background = 'white'; subBtnTheme.style.color = '#2563eb'; subBtnTheme.style.boxShadow = '0 2px 5px rgba(0,0,0,0.06)'; }
      if (subPaneTheme) subPaneTheme.classList.remove('hidden');
    } else if (target === 'payment') {
      if (subBtnPayment) { subBtnPayment.style.background = 'white'; subBtnPayment.style.color = '#2563eb'; subBtnPayment.style.boxShadow = '0 2px 5px rgba(0,0,0,0.06)'; }
      if (subPanePayment) subPanePayment.classList.remove('hidden');
    } else if (target === 'items') {
      if (subBtnItems) { subBtnItems.style.background = 'white'; subBtnItems.style.color = '#2563eb'; subBtnItems.style.boxShadow = '0 2px 5px rgba(0,0,0,0.06)'; }
      if (subPaneItems) subPaneItems.classList.remove('hidden');
    }
  }

  if (subBtnTheme) subBtnTheme.onclick = () => switchAdminSubTab('theme');
  if (subBtnItems) subBtnItems.onclick = () => switchAdminSubTab('items');

  const btnSaveThemeSettings = document.querySelector('.btn-save-theme-settings');
  if (btnSaveThemeSettings) {
    btnSaveThemeSettings.onclick = async () => {
      const payload = {
        uid: currentUser.userId,
        title: gbAdminTitleInput ? gbAdminTitleInput.value.trim() : '',
        notice: gbAdminNoticeInput ? gbAdminNoticeInput.value.trim() : '',
        hiddenFromLobby: gbAdminHiddenLobbyInput ? gbAdminHiddenLobbyInput.checked : false
      };
      try {
        const res = await fetch(`/api/groupbuy/${currentGid || 'default'}/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) alert('??????桀???嚙賣??');
      } catch(e) { alert('????剜???? + e.message); }
    };
  }

  // ???????藂???
  if (btnGbAdminToggle) {
    btnGbAdminToggle.onclick = async () => {
      if (!currentGroupBuyData) return;
      const newActive = !currentGroupBuyData.active;
      try {
        const res = await fetch(`/api/groupbuy/${currentGid || 'default'}/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: currentUser?.userId || 'admin', active: newActive })
        });
        const result = await res.json();
        if (result.success) {
          currentGroupBuyData.active = result.active;
          populateAdminFields();
          await fetchGroupBuyData();
          alert(result.active ? '????????蝵??嚙??剜頛??喉蕭?蟡??輯??????鞎??鈭?????? : '?艞? ??????蝵?????剜頛??喉蕭?璇??啗??蔭嚙賡?瞉蕭??嚙?);
        }
      } catch(e) { alert('?嚙??剜???? + e.message); }
    };
  }

  // ?????芷?∟?嚙????蔬???
  const btnCreateNewCampaign = document.getElementById('btn-gb-create-new-campaign');
  if (btnCreateNewCampaign) {
    btnCreateNewCampaign.onclick = async () => {
      const title = prompt('???Ｚ???鈭日做????????嚙??╡?\n(???: ?憟?50??????冽?嚙?藃３?????', '?憟???????冽?嚙???');
      if (!title || !title.trim()) return;

      try {
        const res = await fetch('/api/groupbuy_create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title.trim() })
        });
        const result = await res.json();
        if (result.success) {
          currentGid = result.gid;
          await fetchGroupBuyData();
          alert(`?????蝚?∟﹞??閫?????蔬??薴???{result.data.title}?蒫?\n?剜頛?????嚙賣??????嚙賡?瞉蕭????藂偵嚙踝蕭);
        }
      } catch(e) { alert('?梁???????隞?璇?' + e.message); }
    };
  }

  // ?????迎蕭?桐?頨急?
  if (btnGbSaveSettings) {
    btnGbSaveSettings.onclick = async () => {
      const payload = {
        uid: currentUser.userId,
        title: gbAdminTitleInput.value.trim(),
        notice: gbAdminNoticeInput.value.trim(),
        hiddenFromLobby: gbAdminHiddenLobbyInput ? gbAdminHiddenLobbyInput.checked : false
      };
      try {
        const res = await fetch(`/api/groupbuy/${currentGid || 'default'}/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) alert('??????桀???嚙賣??');
      } catch(e) { alert('????剜???? + e.message); }
    };
  }

  // ???????捂??????
  if (btnGbClearOrders) {
    btnGbClearOrders.onclick = async () => {
      if (!confirm('?薳?? ?????穿蕭???嚙賣?憡?????殷蕭敼?嚙?????????遲戌蛛蕭?走??嚙?')) return;
      try {
        await fetch(`/api/groupbuy/${currentGid || 'default'}/clear_orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: currentUser.userId })
        });
        currentCart = {};
        alert('?????嚙??捂??????);
      } catch(e) { alert('?蕭敺???? + e.message); }
    };
  }

  // ?蕭????鈭?????????
  const btnImportZhanRong = document.getElementById('btn-gb-import-zhanrong');
  if (btnImportZhanRong) {
    btnImportZhanRong.onclick = async () => {
      if (!confirm('???????穿蕭?????鈭?????瘥? 10 ??嚙????嚙??艞??????')) return;
      const zhanRongItems = getZhanRongDefaultItemsClient();
      if (!currentGroupBuyData) currentGroupBuyData = {};
      currentGroupBuyData.items = zhanRongItems;
      currentGroupBuyData.title = '?? ????嚙? ?質葭???柴?????蕭? (1986)';
      currentGroupBuyData.notice = '';

      try {
        await fetch(`/api/groupbuy/${currentGid || 'default'}/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: currentUser?.userId || 'admin',
            title: currentGroupBuyData.title,
            notice: currentGroupBuyData.notice,
            items: zhanRongItems
          })
        });
      } catch(e) { console.error(e); }

      renderGroupBuyUI(currentGroupBuyData);
      alert('???????????隞??桀?嚙????嚙?????艞????);
    };
  }

  // ???????獢??嚙?????蝞蕭??????銋蕭瞍??桀????UI ?皛? (?塚蕭??鞈?????)
  const btnSaveAsPreset = document.getElementById('btn-gb-save-as-preset');
  const gbSavePresetModal = document.getElementById('gbSavePresetModal');
  const btnCloseSavePreset = document.getElementById('btn-close-save-preset');
  const btnCancelSavePreset = document.getElementById('btn-cancel-save-preset');
  const btnConfirmSavePreset = document.getElementById('btn-confirm-save-preset');
  const gbPresetNameInput = document.getElementById('gb-preset-name-input');
  const gbPresetItemsPreview = document.getElementById('gb-preset-items-preview');
  const gbPresetSelect = document.getElementById('gb-preset-select');

  if (btnCloseSavePreset) btnCloseSavePreset.onclick = () => gbSavePresetModal.classList.add('hidden');
  if (btnCancelSavePreset) btnCancelSavePreset.onclick = () => gbSavePresetModal.classList.add('hidden');
  if (gbSavePresetModal) {
    gbSavePresetModal.onclick = (e) => {
      if (e.target === gbSavePresetModal) gbSavePresetModal.classList.add('hidden');
    };
  }

  if (btnSaveAsPreset) {
    btnSaveAsPreset.onclick = () => {
      const items = currentGroupBuyData?.items || [];
      if (items.length === 0) {
        alert('?獢??嚙??蕭敼?蝞??ㄛ蕭??頨?蝎??桀???蝛??Ｚ??????嚙???);
        return;
      }
      if (gbPresetNameInput) gbPresetNameInput.value = `????嚙? ?質葭???柴??皛劾予?(${items.length} ??`;
      if (gbPresetItemsPreview) {
        gbPresetItemsPreview.innerHTML = items.map(i => `??[${i.category || '???'}] ${i.name} ($${i.price})`).join('<br/>');
      }
      if (gbSavePresetModal) gbSavePresetModal.classList.remove('hidden');
    };
  }

  if (btnConfirmSavePreset) {
    btnConfirmSavePreset.onclick = async () => {
      const items = currentGroupBuyData?.items || [];
      const presetName = gbPresetNameInput ? gbPresetNameInput.value.trim() : '';
      if (!presetName) {
        alert('?Ｚ???鈭?????╡?');
        return;
      }

      try {
        const res = await fetch(`/api/groupbuy/${currentGid || 'default'}/save_preset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items, presetName })
        });
        const result = await res.json();
        if (result.success) {
          if (gbSavePresetModal) gbSavePresetModal.classList.add('hidden');
          if (gbPresetSelect) {
            gbPresetSelect.innerHTML = `<option value="custom">${result.presetName} (${items.length} ??</option>`;
          }
          alert(`?????蝚蕭?柴???桀???蝛???{result.presetName}?蒫?\n?皛??嚙???踝蕭?嚙質?JSON ?澆???嚙?;
        } else {
          alert('????哨蕭藃?剜???? + (result.error || '??唬偵??芰?'));
        }
      } catch(e) {
        alert('????哨蕭藃?剜???? + e.message);
      }
    };
  }

  // ?????仿做???箏??嚙? Modal ?剛﹞颲?  const btnOpenAddItem = document.getElementById('btn-gb-add-item');
  const btnCloseItemEdit = document.getElementById('btn-close-item-edit');
  const btnSaveItem = document.getElementById('btn-gb-save-item');
  const btnDeleteItem = document.getElementById('btn-gb-delete-item');
  const itemEditModal = document.getElementById('gbItemEditModal');

  if (btnOpenAddItem) btnOpenAddItem.onclick = (e) => { e.preventDefault(); openItemEditModal(); };
  if (btnCloseItemEdit) btnCloseItemEdit.onclick = () => closeItemEditModal();

  if (btnSaveItem) {
    btnSaveItem.onclick = async () => {
      const id = document.getElementById('gb-edit-item-id').value;
      const category = document.getElementById('gb-edit-item-category').value.trim();
      const name = document.getElementById('gb-edit-item-name').value.trim();
      const price = parseFloat(document.getElementById('gb-edit-item-price').value);

      if (!category || !name || isNaN(price)) {
        alert('?Ｚ??菜??????踴答??嚙??嚙??嚙???嚙踝蕭嚙?瞏???);
        return;
      }

      const itemPayload = {
        id: id || undefined,
        category,
        name,
        price,
        unit: (document.getElementById('gb-edit-item-unit') ? document.getElementById('gb-edit-item-unit').value.trim() : ''),
        linkText: document.getElementById('gb-edit-item-linktext').value.trim(),
        description: document.getElementById('gb-edit-item-desc').value.trim(),
        contents: (document.getElementById('gb-edit-item-contents') ? document.getElementById('gb-edit-item-contents').value.trim() : ''),
        linkUrl: document.getElementById('gb-edit-item-linkurl').value.trim(),
        imageUrl: document.getElementById('gb-edit-item-imgurl').value.trim()
      };

      try {
        const res = await fetch(`/api/groupbuy/${currentGid || 'default'}/item/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: currentUser.userId, item: itemPayload })
        });
        const data = await res.json();
        if (data.success) {
          alert('???嚙??嚙賣??');
          if (itemEditModal) closeItemEditModal();
        } else {
          alert('????剜???? + data.error);
        }
      } catch(e) { alert('????剜???? + e.message); }
    };
  }

  if (btnDeleteItem) {
    btnDeleteItem.onclick = async () => {
      const id = document.getElementById('gb-edit-item-id').value;
      if (!id) return;
      if (!confirm('?????穿蕭???縐?嚙??嚙?????')) return;

      try {
        const res = await fetch(`/api/groupbuy/${currentGid || 'default'}/item/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: currentUser.userId, itemId: id })
        });
        const data = await res.json();
        if (data.success) {
          alert('?????????);
          if (itemEditModal) closeItemEditModal();
        } else {
          alert('??瑁??剜???? + data.error);
        }
      } catch(e) { alert('??瑁??剜???? + e.message); }
    };
  }
  const btnGbSaveSettingsNew = document.getElementById('btn-gb-save-settings');
  if (btnGbSaveSettingsNew) {
    btnGbSaveSettingsNew.onclick = async () => {
      const payload = {
        uid: currentUser?.userId || 'admin',
        title: document.getElementById('gb-admin-title-input') ? document.getElementById('gb-admin-title-input').value.trim() : '',
        notice: document.getElementById('gb-admin-notice-input') ? document.getElementById('gb-admin-notice-input').value.trim() : '',
        paymentSettings: {
          linePayLink: document.getElementById('gb-admin-linepay-link') ? document.getElementById('gb-admin-linepay-link').value.trim() : '',
          linePayQrUrl: document.getElementById('gb-admin-linepay-qr') ? document.getElementById('gb-admin-linepay-qr').value.trim() : '',
          bankCode: document.getElementById('gb-admin-bank-code') ? document.getElementById('gb-admin-bank-code').value.trim() : '',
          bankName: document.getElementById('gb-admin-bank-name') ? document.getElementById('gb-admin-bank-name').value.trim() : '',
          bankAccount: document.getElementById('gb-admin-bank-account') ? document.getElementById('gb-admin-bank-account').value.trim() : '',
          bankAccountName: document.getElementById('gb-admin-bank-holder') ? document.getElementById('gb-admin-bank-holder').value.trim() : ''
        }
      };
      try {
        const res = await fetch(`/api/groupbuy/${currentGid || 'default'}/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
           alert('???桀???嚙賣??');
           fetchGroupBuyData();
        } else {
           alert('????剜???? + data.error);
        }
      } catch(e) { alert('????剜???? + e.message); }
    };
  }

  const btnGbAdminHiddenToggleNew = document.getElementById('btn-gb-admin-hidden-toggle');
  if (btnGbAdminHiddenToggleNew) {
    btnGbAdminHiddenToggleNew.onclick = async () => {
      if (!currentGroupBuyData) return;
      try {
        const res = await fetch(`/api/groupbuy/${currentGid || 'default'}/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: currentUser?.userId || 'admin', hiddenFromLobby: !currentGroupBuyData.hiddenFromLobby })
        });
        const data = await res.json();
        if (data.success) fetchGroupBuyData();
      } catch(e) { console.error(e); }
    };
  }
  
  const btnGbClearOrdersNew = document.getElementById('btn-gb-clear-orders');
  if (btnGbClearOrdersNew) {
    btnGbClearOrdersNew.onclick = async () => {
      if (!confirm('?薳?? ?????穿蕭??捂????????嚙??蕭餈?皛?????嚙???)) return;
      try {
        const res = await fetch(`/api/groupbuy/${currentGid || 'default'}/clear_orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: currentUser?.userId || 'admin' })
        });
        const data = await res.json();
        if (data.success) {
          alert('???????捂?????畾?');
          fetchGroupBuyData();
        } else alert('?蕭敺???? + data.error);
      } catch(e) { alert('?蕭敺???? + e.message); }
    };
  }

}

function openCheckoutModal() {
  if (!currentGroupBuyData || Object.keys(currentCart).length === 0) {
    alert('?????嚙賡?藀?蝟?蝞??姘??嚙??閰??嚙?');
    return;
  }

  // ????嚙賡?藀????
  
  const gbHeaderNameInput = document.getElementById('gb-header-name');
  const gbHeaderPhoneInput = document.getElementById('gb-header-phone');
  if (gbHeaderNameInput && gbUserName) gbUserName.value = gbHeaderNameInput.value.trim();
  if (gbHeaderPhoneInput && gbUserPhone) gbUserPhone.value = gbHeaderPhoneInput.value.trim();

  if (checkoutItemsList) {
    checkoutItemsList.innerHTML = '';
    let sum = 0;
    for (const [itemId, qty] of Object.entries(currentCart)) {
      const item = currentGroupBuyData.items.find(i => i.id === itemId);
      if (item && qty > 0) {
        const subtotal = item.price * qty;
        sum += subtotal;
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.fontSize = '14px';
        row.style.margin = '4px 0';
        row.innerHTML = `<span>${item.name} ? ${qty}</span><span>$${subtotal}</span>`;
        checkoutItemsList.appendChild(row);
      }
    }
    if (checkoutTotalSum) checkoutTotalSum.innerText = sum;
  }

  // ???嚙賡??寧??嚙賡?嚙?
  const p = currentGroupBuyData.paymentSettings || {};
  if (gbBankNameDisplay) gbBankNameDisplay.innerText = `${p.bankName || '?嚙賡?} (${p.bankCode || '????})`;
  if (gbBankAccDisplay) gbBankAccDisplay.innerText = p.bankAccount || '??曇澈?埠???;
  if (gbBankHolderDisplay) gbBankHolderDisplay.innerText = p.bankAccountName || '??曇澈?埠?蕭??;

  // LINE Pay ?批??????QR Code
  if (btnLaunchLinepay) {
    if (p.linePayLink) {
      btnLaunchLinepay.href = p.linePayLink;
      btnLaunchLinepay.classList.remove('hidden');
    } else {
      btnLaunchLinepay.href = '#';
      btnLaunchLinepay.innerText = '????Ｚ????朣蝞??LINE ?批????';
    }
  }
  
  const btnGbAdminHiddenToggle = document.getElementById('btn-gb-admin-hidden-toggle');
  if (btnGbAdminHiddenToggle) {
    const knob2 = btnGbAdminHiddenToggle.querySelector('.toggle-knob');
    const lblShow = document.getElementById('lbl-show');
    const lblHide = document.getElementById('lbl-hide');
    if (!currentGroupBuyData.hiddenFromLobby) {
      // ?輯???      btnGbAdminHiddenToggle.style.background = '#10b981';
      if (knob2) knob2.style.transform = 'translateX(24px)';
      if (lblShow) lblShow.style.color = '#10b981';
      if (lblHide) lblHide.style.color = '#cbd5e1';
    } else {
      // ?璇?
      btnGbAdminHiddenToggle.style.background = '#cbd5e1';
      if (knob2) knob2.style.transform = 'translateX(0)';
      if (lblShow) lblShow.style.color = '#cbd5e1';
      if (lblHide) lblHide.style.color = '#ef4444';
    }
  }

  if (gbLinepayQrBox && gbLinepayQrImg) {
    if (p.linePayQrUrl) {
      gbLinepayQrImg.src = p.linePayQrUrl;
      gbLinepayQrBox.classList.remove('hidden');
    } else {
      gbLinepayQrBox.classList.add('hidden');
    }
  }

  if (groupBuyCheckoutModal) groupBuyCheckoutModal.classList.remove('hidden');
}

// ?嚙踢??蒺??啣???嚙??芾??
// ================= Template Admin Logic =================
function showTemplateAdminView() {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById('template-admin-view').classList.remove('hidden');
  loadTemplates();
  document.getElementById('ta-template-name').value = '';
  document.getElementById('ta-template-content').value = '';
  document.getElementById('btn-ta-delete').style.display = 'none';
}

window.showTemplateAdminView = showTemplateAdminView;

const btnBackTemplateAdmin = document.getElementById('btn-back-template-admin');
if (btnBackTemplateAdmin) {
  btnBackTemplateAdmin.onclick = async () => {
    document.getElementById('template-admin-view').classList.add('hidden');
    await loadGamesLobby();
  };
}

const taTemplateSelect = document.getElementById('ta-template-select');
if (taTemplateSelect) {
  taTemplateSelect.onchange = (e) => {
    const name = e.target.value;
    const nameInput = document.getElementById('ta-template-name');
    const contentInput = document.getElementById('ta-template-content');
    const deleteBtn = document.getElementById('btn-ta-delete');
    
    if (name && currentGroupTemplates[name]) {
      nameInput.value = name;
      contentInput.value = currentGroupTemplates[name];
      deleteBtn.style.display = 'block';
    } else {
      nameInput.value = '';
      contentInput.value = '';
      deleteBtn.style.display = 'none';
    }
  };
}

const btnTaSave = document.getElementById('btn-ta-save');
if (btnTaSave) {
  btnTaSave.onclick = async () => {
    const name = document.getElementById('ta-template-name').value.trim();
    const content = document.getElementById('ta-template-content').value.trim();
    
    if (!name) return alert('隢撓?亦??砍?蝔?);
    if (!content) return alert('隢撓?亙??桀摰?);
    
    appDiv.className = 'loading';
    try {
      const res = await fetch(`/api/templates/${currentGroupId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: currentUser.userId,
          action: 'save',
          name: name,
          content: content
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await loadTemplates();
        document.getElementById('ta-template-select').value = name;
        document.getElementById('ta-template-select').dispatchEvent(new Event('change'));
        alert('?脣???嚗?);
      } else {
        alert(data.error || '?脣?憭望?');
      }
    } catch (e) {
      alert('蝬脰楝?航炊嚗瘜摮隡箸???);
    } finally {
      appDiv.className = '';
    }
  };
}

const btnTaDelete = document.getElementById('btn-ta-delete');
if (btnTaDelete) {
  btnTaDelete.onclick = async () => {
    const name = document.getElementById('ta-template-name').value.trim();
    if (!name) return;
    if (!confirm(`蝣箏?閬?斤??研?{name}??嚗)) return;
    
    appDiv.className = 'loading';
    try {
      const res = await fetch(`/api/templates/${currentGroupId}`, {
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
        document.getElementById('ta-template-select').value = '';
        document.getElementById('ta-template-select').dispatchEvent(new Event('change'));
        alert('?芷??嚗?);
      } else {
        alert(data.error || '?芷憭望?');
      }
    } catch (e) {
      alert('蝬脰楝?航炊嚗瘜??隡箸???);
    } finally {
      appDiv.className = '';
    }
  };
}

document.addEventListener('DOMContentLoaded', () => {
  initializeLiff();
  initGroupBuyEvents();
  fetchGroupBuyData();
});



