const socket = io();

const GAME_WIDTH = 2000;
const GAME_HEIGHT = 1500;

let gameState = {
  isActive: false,
  players: {},
  items: {},
  leaderboard: []
};

let myId = null;
let playerName = "";
let playerColor = "";

// UI Elements
const tutorialModal = document.getElementById('tutorial-modal');
const btnNext = document.getElementById('btn-next');
const colorModal = document.getElementById('color-modal');
const inputName = document.getElementById('player-name');
const colorOptions = document.querySelectorAll('.color-option');
const btnStart = document.getElementById('btn-start');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const leaderboardDiv = document.getElementById('leaderboard');
const leaderboardList = document.getElementById('leaderboard-list');

// Interaction
btnNext.addEventListener('click', () => {
  tutorialModal.classList.add('hidden');
  colorModal.classList.remove('hidden');
});

colorOptions.forEach(opt => {
  opt.addEventListener('click', () => {
    colorOptions.forEach(o => o.classList.remove('selected'));
    opt.classList.add('selected');
    playerColor = opt.dataset.color;
    checkStartBtn();
  });
});

inputName.addEventListener('input', checkStartBtn);

function checkStartBtn() {
  playerName = inputName.value.trim();
  if (playerName && playerColor) {
    btnStart.disabled = false;
  } else {
    btnStart.disabled = true;
  }
}

btnStart.addEventListener('click', () => {
  colorModal.classList.add('hidden');
  socket.emit('rpg_join', { name: playerName, color: playerColor });
});

// Socket logic
socket.on('connect', () => {
  myId = socket.id;
});

socket.on('rpg_state', (state) => {
  if (!state.isActive) {
    alert("超級管理員已關閉遊戲大廳！");
    window.location.href = '/';
    return;
  }
  gameState = state;
  updateLeaderboard();
});

socket.on('rpg_event', (event) => {
  if (event.type === 'kill') {
    // 可以在這裡加入擊殺廣播 UI
    console.log(`${event.killer} 擊倒了 ${event.victim}`);
  }
});

function updateLeaderboard() {
  if (gameState.leaderboard.length > 0) {
    leaderboardDiv.classList.remove('hidden');
    leaderboardList.innerHTML = gameState.leaderboard.map((p, i) => 
      `<li><span>#${i+1} ${p.name}</span> <span>${p.score} 分</span></li>`
    ).join('');
  } else {
    leaderboardDiv.classList.add('hidden');
  }
}

// Canvas Scaling (Letterboxing)
let scale = 1;
let offsetX = 0;
let offsetY = 0;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  
  const scaleX = window.innerWidth / GAME_WIDTH;
  const scaleY = window.innerHeight / GAME_HEIGHT;
  scale = Math.min(scaleX, scaleY); // fit
  
  offsetX = (window.innerWidth - GAME_WIDTH * scale) / 2;
  offsetY = (window.innerHeight - GAME_HEIGHT * scale) / 2;
}
window.addEventListener('resize', resize);
resize();

// Input handling
let keys = {};
window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

// Swipe / Touch handling
let touchX = 0;
let touchY = 0;
let isTouching = false;
let joyDir = null; // null or angle in radians

window.addEventListener('touchstart', e => {
  touchX = e.touches[0].clientX;
  touchY = e.touches[0].clientY;
  isTouching = true;
});
window.addEventListener('touchmove', e => {
  if (!isTouching) return;
  const dx = e.touches[0].clientX - touchX;
  const dy = e.touches[0].clientY - touchY;
  
  // 計算滑動方向
  if (Math.hypot(dx, dy) > 10) {
    joyDir = Math.atan2(dy, dx);
  }
  // 更新基準點，讓滑動可以持續改變方向
  touchX = e.touches[0].clientX;
  touchY = e.touches[0].clientY;
});
window.addEventListener('touchend', () => {
  isTouching = false;
  joyDir = null;
});

// Update & Render Loop
let lastTime = 0;
function loop(timestamp) {
  requestAnimationFrame(loop);
  // const dt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;
  
  if (!gameState.isActive) return;
  
  updateInput();
  render();
}
requestAnimationFrame(loop);

function updateInput() {
  const me = gameState.players[myId];
  if (!me || !me.alive) return;
  
  let dx = 0;
  let dy = 0;
  let speed = me.hasShoes ? 15 : 10;
  
  // Keyboard
  if (keys['w'] || keys['arrowup']) dy -= 1;
  if (keys['s'] || keys['arrowdown']) dy += 1;
  if (keys['a'] || keys['arrowleft']) dx -= 1;
  if (keys['d'] || keys['arrowright']) dx += 1;
  
  if (dx !== 0 || dy !== 0) {
    const len = Math.hypot(dx, dy);
    dx /= len;
    dy /= len;
    joyDir = Math.atan2(dy, dx);
  }
  
  if ((dx !== 0 || dy !== 0) || (isTouching && joyDir !== null)) {
    let moveDir = joyDir;
    let newX = me.x + Math.cos(moveDir) * speed;
    let newY = me.y + Math.sin(moveDir) * speed;
    
    // Bounds check
    newX = Math.max(50, Math.min(GAME_WIDTH - 50, newX));
    newY = Math.max(50, Math.min(GAME_HEIGHT - 50, newY));
    
    socket.emit('rpg_move', { x: newX, y: newY, dir: moveDir });
  }
}

// Auto attack & pickup periodically
setInterval(() => {
  if (gameState.isActive && gameState.players[myId] && gameState.players[myId].alive) {
    socket.emit('rpg_attack');
    for (const itemId in gameState.items) {
      socket.emit('rpg_pickup', itemId);
    }
  }
}, 200);

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  
  // Draw Background Court
  drawCourt();
  
  // Draw Items
  for (const id in gameState.items) {
    const item = gameState.items[id];
    drawItem(item.x, item.y, item.type);
  }
  
  // Draw Players (死掉的先畫，活著的後畫)
  const sortedPlayers = Object.values(gameState.players).sort((a, b) => (a.alive === b.alive ? 0 : a.alive ? 1 : -1));
  for (const p of sortedPlayers) {
    drawPlayer(p);
  }
  
  ctx.restore();
}

function drawCourt() {
  ctx.fillStyle = '#2E7D32'; // 草地綠
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 10;
  // 外框
  ctx.strokeRect(100, 100, GAME_WIDTH - 200, GAME_HEIGHT - 200);
  // 中線
  ctx.beginPath();
  ctx.moveTo(GAME_WIDTH / 2, 100);
  ctx.lineTo(GAME_WIDTH / 2, GAME_HEIGHT - 100);
  ctx.stroke();
  
  // 球網
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillRect(GAME_WIDTH / 2 - 15, 50, 30, GAME_HEIGHT - 100);
}

function drawItem(x, y, type) {
  ctx.save();
  ctx.translate(x, y);
  if (type === 'racket') {
    // 畫球拍
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.arc(0, -15, 20, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#222'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#444';
    ctx.fillRect(-4, 5, 8, 25);
  } else if (type === 'shoes') {
    // 畫鞋子
    ctx.fillStyle = '#FF5252';
    ctx.fillRect(-20, -10, 15, 20);
    ctx.fillRect(5, -10, 15, 20);
    ctx.fillStyle = 'white';
    ctx.fillRect(-20, -10, 15, 5);
    ctx.fillRect(5, -10, 15, 5);
  }
  ctx.restore();
}

function drawPlayer(p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  
  if (!p.alive) {
    ctx.globalAlpha = 0.3;
    // 死亡狀態畫個叉叉或墓碑
    ctx.fillStyle = '#888';
    ctx.fillRect(-20, -10, 40, 50);
    ctx.fillStyle = '#fff';
    ctx.font = '20px Inter';
    ctx.fillText('RIP', -15, 20);
    ctx.restore();
    return;
  }
  
  if (p.invincibleUntil > Date.now()) {
    ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 100) * 0.3; // 閃爍
  }

  // Draw name and stats (不會跟著旋轉)
  ctx.fillStyle = 'white';
  ctx.font = 'bold 24px Inter';
  ctx.textAlign = 'center';
  ctx.fillText(p.name, 0, -60);
  
  ctx.font = '16px Inter';
  ctx.fillStyle = '#FFEB3B';
  ctx.fillText(`K:${p.kills} D:${p.deaths}`, 0, 60);

  // Rotate stickman
  ctx.rotate(p.dir); 

  // Body
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, Math.PI * 2);
  ctx.fillStyle = p.color;
  ctx.fill();
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 4;
  ctx.stroke();
  
  // 面朝方向 (眼睛)
  ctx.fillStyle = 'white';
  ctx.beginPath(); ctx.arc(15, -12, 6, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(15, 12, 6, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = 'black';
  ctx.beginPath(); ctx.arc(18, -12, 3, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(18, 12, 3, 0, Math.PI*2); ctx.fill();
  
  // Equipments
  if (p.hasRacket) {
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.arc(45, 25, 20, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#222'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#444';
    ctx.fillRect(25, 21, 20, 8);
  }
  
  if (p.hasShoes) {
    ctx.fillStyle = '#FF5252';
    ctx.beginPath(); ctx.arc(-5, -35, 12, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(-5, 35, 12, 0, Math.PI*2); ctx.fill();
  }
  
  ctx.restore();
}
