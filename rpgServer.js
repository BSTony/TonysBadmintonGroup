const MAP_WIDTH = 2000;
const MAP_HEIGHT = 1500;

let isActive = false;
let players = {};
let items = {};
let nextItemId = 1;
const ITEM_TYPES = ['racket', 'shoes'];
let gameLoopTimeout = null;

function broadcastState(io) {
  io.emit('rpg_state', {
    isActive,
    players,
    items,
    leaderboard: getLeaderboard()
  });
}

function getLeaderboard() {
  return Object.values(players)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(p => ({ name: p.name, score: p.score }));
}

function gameLoop(io) {
  if (!isActive) return;
  
  // 隨機生成道具 (最多 15 個)
  if (Math.random() < 0.05 && Object.keys(items).length < 15) {
    items[nextItemId++] = {
      type: ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)],
      x: Math.random() * (MAP_WIDTH - 100) + 50,
      y: Math.random() * (MAP_HEIGHT - 100) + 50
    };
  }
  
  broadcastState(io);
  gameLoopTimeout = setTimeout(() => gameLoop(io), 1000 / 30); // 30 FPS
}

function startGame(io) {
  if (isActive) return;
  isActive = true;
  players = {};
  items = {};
  gameLoop(io);
}

function stopGame() {
  isActive = false;
  if (gameLoopTimeout) clearTimeout(gameLoopTimeout);
}

function getAngle(x1, y1, x2, y2) {
  return Math.atan2(y2 - y1, x2 - x1);
}

function setupSocket(io) {
  io.on('connection', (socket) => {
    socket.on('rpg_join', ({ name, color }) => {
      if (!isActive) return;
      players[socket.id] = {
        id: socket.id,
        name,
        color, // Array index 0-7 or string color
        x: Math.random() * (MAP_WIDTH - 200) + 100,
        y: Math.random() * (MAP_HEIGHT - 200) + 100,
        dir: 0, // radians
        score: 0,
        kills: 0,
        deaths: 0,
        hasRacket: false,
        hasShoes: false,
        alive: true,
        invincibleUntil: Date.now() + 2000
      };
    });

    socket.on('rpg_move', ({ x, y, dir }) => {
      if (!isActive || !players[socket.id] || !players[socket.id].alive) return;
      players[socket.id].x = x;
      players[socket.id].y = y;
      if (dir !== undefined) players[socket.id].dir = dir;
    });

    socket.on('rpg_attack', () => {
      if (!isActive || !players[socket.id] || !players[socket.id].alive || players[socket.id].invincibleUntil > Date.now()) return;
      
      const attacker = players[socket.id];
      const attackRange = attacker.hasRacket ? 180 : 100;
       
      for (const targetId in players) {
        if (targetId === socket.id) continue;
        const target = players[targetId];
        // 不能攻擊同顏色隊友、不能攻擊無敵狀態、死人
        if (!target.alive || target.color === attacker.color || target.invincibleUntil > Date.now()) continue;
         
        const dist = Math.hypot(target.x - attacker.x, target.y - attacker.y);
        if (dist <= attackRange) {
          const angleToTarget = getAngle(attacker.x, attacker.y, target.x, target.y);
          
          // 判斷攻擊者是否面朝目標 (+- 60度)
          let diff = Math.abs(angleToTarget - attacker.dir);
          if (diff > Math.PI) diff = 2 * Math.PI - diff;
           
          if (diff < Math.PI / 3) {
            // 判斷目標是否背對或側對攻擊者 (正面攻擊無效)
            // 目標朝向 target.dir，目標到攻擊者的角度是 angleToTarget + PI
            let targetToAttackerAngle = angleToTarget + Math.PI;
            let hitAngleDiff = Math.abs(targetToAttackerAngle - target.dir);
            if (hitAngleDiff > Math.PI) hitAngleDiff = 2 * Math.PI - hitAngleDiff;
             
            // hitAngleDiff < PI/4 代表攻擊者在目標正前方 (正面攻擊)
            if (hitAngleDiff >= Math.PI / 4) {
              // 擊倒成功!
              target.alive = false;
              target.deaths += 1;
              attacker.kills += 1;
               
              let attackerItems = (attacker.hasRacket ? 1 : 0) + (attacker.hasShoes ? 1 : 0);
              attacker.score += (1 + attackerItems);
               
              let targetItems = (target.hasRacket ? 1 : 0) + (target.hasShoes ? 1 : 0);
              target.score = Math.max(0, target.score - targetItems);
               
              target.hasRacket = false;
              target.hasShoes = false;
               
              // 3秒後重生
              setTimeout(() => {
                if (players[targetId]) {
                  players[targetId].alive = true;
                  players[targetId].x = Math.random() * (MAP_WIDTH - 200) + 100;
                  players[targetId].y = Math.random() * (MAP_HEIGHT - 200) + 100;
                  players[targetId].invincibleUntil = Date.now() + 2000;
                }
              }, 3000);
               
              io.emit('rpg_event', { type: 'kill', killer: attacker.name, victim: target.name, killerColor: attacker.color, victimColor: target.color });
              break; // 每次攻擊只擊倒一人
            }
          }
        }
      }
    });

    socket.on('rpg_pickup', (itemId) => {
      if (!isActive || !players[socket.id] || !players[socket.id].alive || players[socket.id].invincibleUntil > Date.now()) return;
      const p = players[socket.id];
      const item = items[itemId];
      if (item) {
        const dist = Math.hypot(item.x - p.x, item.y - p.y);
        if (dist < 80) { // 撿拾距離
          if (item.type === 'racket' && !p.hasRacket) {
            p.hasRacket = true;
            delete items[itemId];
          } else if (item.type === 'shoes' && !p.hasShoes) {
            p.hasShoes = true;
            delete items[itemId];
          }
        }
      }
    });

    socket.on('disconnect', () => {
      if (players[socket.id]) {
        delete players[socket.id];
      }
    });
  });
}

module.exports = { startGame, stopGame, setupSocket, getActive: () => isActive };
