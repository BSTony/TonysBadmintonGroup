// pinball.js - Top-Down Racing Track (S-Curve)
// Redesigned: 2.5D top-down view matching real marble race tracks

const PB_LOGICAL_WIDTH = 800;
let pbEngine, pbRender, pbRunner;
let pbBalls = {};
let pbState = { status: 'idle', pool: [], finished: [], winnerLimit: 3 };
let pbWorldHeight = 3500;

// Camera state
let cameraTargetIdx = 0;
let lastCameraSwitch = 0;
const CAMERA_SWITCH_MS = 3000;
let cameraY = 0;
let cameraSmoothed = 0;

// DOM Elements
var pinballContainer = pinballContainer || document.getElementById('pinball-container');
var pinballCanvasWrapper = pinballCanvasWrapper || document.getElementById('pinball-canvas-wrapper');
var pinballStatusOverlay = document.getElementById('pinball-status-overlay');
var pinballStatusText = document.getElementById('pinball-status-text');
var pinballStatusTimer = document.getElementById('pinball-status-timer');
var pinballSpectatorUi = pinballSpectatorUi || document.getElementById('pinball-spectator-ui');

// Track Constants
const TRACK_WIDTH = 180;
const START_Y = 150;
const MARBLE_RADIUS = 12;
const GRAVITY_Y = 0.55;

// Sine wave path points for custom rendering
let trackPathPoints = [];

// Billiard Ball Colors (Pool)
const POOL_COLORS = [
  '#f1c40f', // 1: Yellow
  '#3498db', // 2: Blue
  '#e74c3c', // 3: Red
  '#9b59b6', // 4: Purple
  '#e67e22', // 5: Orange
  '#2ecc71', // 6: Green
  '#8e44ad', // 7: Maroon
  '#2c3e50', // 8: Black
  '#f39c12', // 9: Yellow stripe
  '#2980b9', // 10: Blue stripe
  '#c0392b', // 11: Red stripe
  '#8e44ad', // 12: Purple stripe
  '#d35400', // 13: Orange stripe
  '#27ae60', // 14: Green stripe
  '#7f8c8d'  // 15: Maroon stripe
];

function destroyEngine() {
  if (pbRunner) Matter.Runner.stop(pbRunner);
  if (pbRender) Matter.Render.stop(pbRender);
  if (pbEngine) {
    Matter.World.clear(pbEngine.world);
    Matter.Engine.clear(pbEngine);
  }
  if (pbRender && pbRender.canvas) pbRender.canvas.remove();
  pbEngine = null;
  pbRender = null;
  pbRunner = null;
  pbBalls = {};
  trackPathPoints = [];
}

function initPinballEngine() {
  if (!pinballContainer) pinballContainer = document.getElementById('pinball-container');
  if (!pinballCanvasWrapper) pinballCanvasWrapper = document.getElementById('pinball-canvas-wrapper');

  if (!pinballContainer || !pinballCanvasWrapper) {
    console.warn('[Pinball] Container elements not found');
    return;
  }

  const width = PB_LOGICAL_WIDTH;
  const containerW = pinballContainer.clientWidth || window.innerWidth;
  const containerH = pinballContainer.clientHeight || window.innerHeight;
  const aspect = containerH / containerW;
  const height = width * aspect;

  if (width < 50 || height < 50) return;

  if (pbEngine && pbRender && Math.abs(pbRender.options.height - height) < 10) {
    return;
  }

  if (pbEngine) destroyEngine();
  console.log('[Pinball] Initializing Top-Down track (Server Sync Mode): ' + width + 'x' + height);

  const { Engine, Render, Runner, World, Bodies, Events, Body } = Matter;

  pbEngine = Engine.create();
  pbEngine.gravity.y = 0; // Server handles physics
  pbEngine.gravity.x = 0;

  pinballCanvasWrapper.innerHTML = '';

  pbRender = Render.create({
    element: pinballCanvasWrapper,
    engine: pbEngine,
    options: {
      width, height,
      wireframes: false,
      background: '#3d8236', // Grass green
      hasBounds: true
    }
  });

  pbRender.canvas.style.width = '100%';
  pbRender.canvas.style.height = '100%';

  pbRender.bounds.min.x = 0;
  pbRender.bounds.min.y = 0;
  pbRender.bounds.max.x = width;
  pbRender.bounds.max.y = height;
  cameraSmoothed = 0;

  // Build the top-down track guardrails
  const { bodies, pathPoints, finalY } = buildTopDownTrack(width);
  trackPathPoints = pathPoints;
  pbWorldHeight = finalY + 400;
  World.add(pbEngine.world, bodies);

  // Finish line sensor (for rendering)
  const finishLine = Bodies.rectangle(width / 2, finalY + 80, TRACK_WIDTH + 60, 40, {
    isStatic: true,
    isSensor: true,
    render: { visible: false }
  });
  World.add(pbEngine.world, [finishLine]);

  // Camera tracking
  Events.on(pbRender, 'beforeRender', () => {
    if (pbState.status !== 'playing') return;

    const allBalls = Object.values(pbBalls);
    if (allBalls.length === 0) return;

    let trackBalls = allBalls.filter(b => !pbState.finished.includes(b.plugin.name));
    if (trackBalls.length === 0) trackBalls = allBalls;

    const sorted = [...trackBalls].sort((a, b) => b.position.y - a.position.y);
    const now = Date.now();
    if (now - lastCameraSwitch > CAMERA_SWITCH_MS) {
      cameraTargetIdx = (cameraTargetIdx + 1) % Math.min(2, sorted.length);
      lastCameraSwitch = now;
    }

    const target = sorted[Math.min(cameraTargetIdx, sorted.length - 1)];
    const targetY = target.position.y - height * 0.35;
    
    // Smooth Lerp
    cameraSmoothed += (targetY - cameraSmoothed) * 0.06;

    // Clamp
    const minY = 0;
    const maxY = pbWorldHeight - height + 100;
    const clampedY = Math.max(minY, Math.min(maxY, cameraSmoothed));

    pbRender.bounds.min.y = clampedY;
    pbRender.bounds.max.y = clampedY + height;
  });

  // Custom rendering: Road surface, arrows, billiard balls
  Events.on(pbRender, 'afterRender', () => {
    const ctx = pbRender.context;
    const bMinY = pbRender.bounds.min.y;
    const bMaxY = pbRender.bounds.max.y;
    const bMinX = pbRender.bounds.min.x;
    const bW = pbRender.bounds.max.x - bMinX;
    const bH = bMaxY - bMinY;
    const scaleX = width / bW;
    const scaleY = height / bH;

    function toScreen(wx, wy) {
      return { x: (wx - bMinX) * scaleX, y: (wy - bMinY) * scaleY };
    }

    // 1. Draw the road surface underneath
    if (trackPathPoints.length > 0) {
      ctx.lineJoin = 'round';
      ctx.lineCap = 'butt';
      
      // Road shadow
      ctx.beginPath();
      trackPathPoints.forEach((p, i) => {
        const sp = toScreen(p.x + 8, p.y + 8);
        if (i === 0) ctx.moveTo(sp.x, sp.y);
        else ctx.lineTo(sp.x, sp.y);
      });
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = (TRACK_WIDTH + 10) * scaleX;
      ctx.stroke();

      // Main Road
      ctx.beginPath();
      trackPathPoints.forEach((p, i) => {
        const sp = toScreen(p.x, p.y);
        if (i === 0) ctx.moveTo(sp.x, sp.y);
        else ctx.lineTo(sp.x, sp.y);
      });
      ctx.strokeStyle = '#9e9e9e'; // Grey asphalt
      ctx.lineWidth = TRACK_WIDTH * scaleX;
      ctx.stroke();

      // Outer track lines (white borders)
      ctx.beginPath();
      trackPathPoints.forEach((p, i) => {
        const sp = toScreen(p.x, p.y);
        if (i === 0) ctx.moveTo(sp.x, sp.y);
        else ctx.lineTo(sp.x, sp.y);
      });
      ctx.strokeStyle = '#ecf0f1';
      ctx.lineWidth = (TRACK_WIDTH - 6) * scaleX;
      ctx.stroke();
      
      // Inner track fill (darker grey)
      ctx.beginPath();
      trackPathPoints.forEach((p, i) => {
        const sp = toScreen(p.x, p.y);
        if (i === 0) ctx.moveTo(sp.x, sp.y);
        else ctx.lineTo(sp.x, sp.y);
      });
      ctx.strokeStyle = '#7f8c8d';
      ctx.lineWidth = (TRACK_WIDTH - 14) * scaleX;
      ctx.stroke();

      // Center dashed line
      ctx.beginPath();
      trackPathPoints.forEach((p, i) => {
        const sp = toScreen(p.x, p.y);
        if (i === 0) ctx.moveTo(sp.x, sp.y);
        else ctx.lineTo(sp.x, sp.y);
      });
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 4 * scaleX;
      ctx.setLineDash([20 * scaleY, 20 * scaleY]);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Draw arrows on the track
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = 'bold 30px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for(let i = 10; i < trackPathPoints.length; i += 20) {
        const p = trackPathPoints[i];
        const pNext = trackPathPoints[i+1];
        if(!pNext) continue;
        const sp = toScreen(p.x, p.y);
        if (sp.y > -50 && sp.y < height + 50) {
          const angle = Math.atan2(pNext.y - p.y, pNext.x - p.x);
          ctx.save();
          ctx.translate(sp.x, sp.y);
          ctx.rotate(angle);
          ctx.fillText('»', 0, -20);
          ctx.fillText('»', 0, 20);
          ctx.restore();
        }
      }
    }

    // 2. Start Line Checkerboard
    const startSp = toScreen(width / 2, START_Y - 10);
    if (startSp.y > -100 && startSp.y < height + 100) {
      drawCheckerboard(ctx, startSp.x, startSp.y, TRACK_WIDTH * scaleX, 20 * scaleY);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px Arial';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 4;
      ctx.fillText('🏁 START', startSp.x, startSp.y - 30);
      ctx.shadowBlur = 0;
    }

    // 3. Finish Line Checkerboard
    if (trackPathPoints.length > 0) {
      const finalY = trackPathPoints[trackPathPoints.length - 1].y;
      const finishSp = toScreen(width / 2, finalY + 40);
      if (finishSp.y > -100 && finishSp.y < height + 100) {
        drawCheckerboard(ctx, finishSp.x, finishSp.y, TRACK_WIDTH * scaleX, 30 * scaleY);
        ctx.fillStyle = '#f1c40f';
        ctx.font = 'bold 28px Arial';
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 4;
        ctx.fillText('🏆 FINISH', finishSp.x, finishSp.y + 40);
        ctx.shadowBlur = 0;
      }
    }

    // 4. Custom Billiard Balls
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    Object.values(pbBalls).forEach(b => {
      const sp = toScreen(b.position.x, b.position.y);
      if (sp.y < -30 || sp.y > height + 30) return;

      const r = b.circleRadius * scaleX;
      
      // Ball shadow
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.arc(sp.x + 3, sp.y + 3, r, 0, Math.PI * 2);
      ctx.fill();

      // Main ball body
      ctx.fillStyle = b.render.fillStyle;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
      ctx.fill();
      
      // Stripe logic (if it's a striped ball color 9-15)
      const colorIdx = POOL_COLORS.indexOf(b.render.fillStyle);
      if (colorIdx >= 8) { // Striped ball
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = b.render.fillStyle;
        ctx.beginPath();
        // Draw a thick horizontal band
        ctx.rect(sp.x - r, sp.y - r/2, r * 2, r);
        ctx.fill();
      }

      // White inner circle
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, r * 0.55, 0, Math.PI * 2);
      ctx.fill();

      // Number in center (using index)
      ctx.fillStyle = '#000';
      ctx.font = `bold ${r*0.7}px Arial`;
      ctx.fillText(b.plugin.num, sp.x, sp.y + 1);

      // Name tag above ball
      let name = b.plugin.name;
      if (name.length > 5) name = name.substring(0, 4) + '..';
      const nameY = sp.y - r - 8;
      
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.font = 'bold 11px Arial';
      ctx.strokeText(name, sp.x, nameY);
      ctx.fillStyle = '#fff';
      ctx.fillText(name, sp.x, nameY);
    });
    
    // Draw HUD
    drawRankingHUD(ctx, width, height);
  });

  Render.run(pbRender);
  // pbRunner is removed because physics is on the server now
  console.log('[Pinball] Top-down track engine started (Renderer Only)');
}

function buildTopDownTrack(W) {
  const { Bodies } = Matter;
  const bodies = [];
  const pathPoints = [];
  
  const steps = 280; // Increased resolution for longer track
  const maxT = Math.PI * 10; // 5 full S-curves (doubled length)
  const amplitude = Math.min(W * 0.35, 200); // max left/right swing
  const stretch = 160; // Pixels downwards per radian

  let currentY = START_Y;
  
  // Straight entry at the start
  for(let y = START_Y - 200; y < START_Y; y += 20) {
    pathPoints.push({ x: W/2, y: y });
  }

  // Generate sine wave path
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * maxT;
    const x = W / 2 + amplitude * Math.sin(t);
    const y = START_Y + t * stretch;
    pathPoints.push({ x, y });
    currentY = y;
  }
  
  // Straight exit at the bottom
  for(let y = currentY; y < currentY + 300; y += 20) {
    pathPoints.push({ x: W/2, y: y });
  }

  // Build physical guardrails along the path
  const wallThickness = 120; // Match server wall thickness
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const p1 = pathPoints[i];
    const p2 = pathPoints[i+1];
    
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx*dx + dy*dy);
    
    const nx = -dy / len;
    const ny = dx / len;
    
    const leftX = p1.x + nx * TRACK_WIDTH / 2;
    const leftY = p1.y + ny * TRACK_WIDTH / 2;
    const rightX = p1.x - nx * TRACK_WIDTH / 2;
    const rightY = p1.y - ny * TRACK_WIDTH / 2;
    
    const angle = Math.atan2(dy, dx);
    const segmentLength = len + 25; // More overlap to prevent snagging

    // Left Wall
    bodies.push(Bodies.rectangle(leftX, leftY, segmentLength, wallThickness, {
      isStatic: true,
      friction: 0,
      restitution: 0.6, // Bouncy guardrails
      angle: angle,
      render: { fillStyle: '#bdc3c7', strokeStyle: '#95a5a6', lineWidth: 2 } // Metallic rails
    }));

    // Right Wall
    bodies.push(Bodies.rectangle(rightX, rightY, segmentLength, wallThickness, {
      isStatic: true,
      friction: 0,
      restitution: 0.6,
      angle: angle,
      render: { fillStyle: '#bdc3c7', strokeStyle: '#95a5a6', lineWidth: 2 }
    }));
  }

  // Top blocking wall
  bodies.push(Bodies.rectangle(W/2, START_Y - 220, W, 40, { isStatic: true }));

  return { bodies, pathPoints, finalY: pathPoints[pathPoints.length-1].y };
}

function drawCheckerboard(ctx, x, y, width, height) {
  const sq = 10;
  ctx.save();
  ctx.translate(x - width/2, y - height/2);
  for (let i = 0; i < width; i += sq) {
    for (let j = 0; j < height; j += sq) {
      ctx.fillStyle = ((i/sq + j/sq) % 2 === 0) ? '#fff' : '#000';
      ctx.fillRect(i, j, sq, sq);
    }
  }
  ctx.restore();
}

function drawRankingHUD(ctx, width, height) {
  if (pbState.status !== 'playing' || Object.values(pbBalls).length === 0) return;
  
  const allBalls = Object.values(pbBalls);
  const sortedAll = [...allBalls].sort((a, b) => b.position.y - a.position.y);
  
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  const hudX = width - 110;
  const hudY = 10;
  const hudH = Math.min(sortedAll.length * 22 + 30, 200);
  ctx.fillRect(hudX, hudY, 105, hudH);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(hudX, hudY, 105, hudH);
  
  ctx.fillStyle = '#f1c40f';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('🏁 即時排名', hudX + 8, hudY + 16);
  
  ctx.font = '11px Arial';
  const maxShow = Math.min(sortedAll.length, 7);
  for (let i = 0; i < maxShow; i++) {
    const b = sortedAll[i];
    const isFinished = pbState.finished.includes(b.plugin.name);
    const rankY = hudY + 34 + i * 20;
    
    const medals = ['🥇', '🥈', '🥉'];
    const rank = i < 3 ? medals[i] : (i + 1) + '.';
    
    ctx.fillStyle = isFinished ? '#f1c40f' : '#fff';
    ctx.font = isFinished ? 'bold 11px Arial' : '11px Arial';
    
    let displayName = b.plugin.name;
    if (displayName.length > 5) displayName = displayName.substring(0, 4) + '..';
    ctx.fillText(rank + ' ' + displayName, hudX + 8, rankY);
  }
}

function dropBalls(pool) {
  console.log('[Pinball] dropBalls called with pool:', pool);
  if (!pbEngine) return;
  
  const { World, Bodies } = Matter;

  const currentBalls = Object.values(pbBalls);
  if (currentBalls.length > 0) World.remove(pbEngine.world, currentBalls);
  pbBalls = {};

  cameraSmoothed = 0;
  cameraTargetIdx = 0;
  lastCameraSwitch = Date.now();
  pbRender.bounds.min.y = 0;
  pbRender.bounds.max.y = pbRender.options.height;

  // We create dummy balls here; they will be moved by server via 'pinball_frame'
  pool.forEach((name, idx) => {
    const color = POOL_COLORS[idx % POOL_COLORS.length];
    const num = (idx % 15) + 1;

    const ball = Bodies.circle(-100, -100, MARBLE_RADIUS, {
      isStatic: true,  // Server controls position
      isSensor: true,
      render: { fillStyle: color }, 
      plugin: { isBall: true, name: name, num: num }
    });

    pbBalls[name] = ball;
  });

  World.add(pbEngine.world, Object.values(pbBalls));
}

function bindPinballSocket(s) {
  s.on('pinball_frame', (frameData) => {
    if (pbState.status !== 'playing' || !pbBalls) return;
    pbState.pool.forEach((name, i) => {
      const b = pbBalls[name];
      if (b) {
        const x = frameData[i * 2];
        const y = frameData[i * 2 + 1];
        if (x !== -100 && y !== -100) {
          Matter.Body.setPosition(b, { x, y });
        }
      }
    });
  });

  s.on('pinball_state', (state) => {
    const prevStatus = pbState.status;
    pbState = state;

    if (!pinballStatusOverlay) pinballStatusOverlay = document.getElementById('pinball-status-overlay');
    if (!pinballStatusText) pinballStatusText = document.getElementById('pinball-status-text');
    if (!pinballStatusTimer) pinballStatusTimer = document.getElementById('pinball-status-timer');
    if (!pinballSpectatorUi) pinballSpectatorUi = document.getElementById('pinball-spectator-ui');
    if (!pinballContainer) pinballContainer = document.getElementById('pinball-container');
    if (!pinballCanvasWrapper) pinballCanvasWrapper = document.getElementById('pinball-canvas-wrapper');

    const pinballPoolCount = document.getElementById('pinball-pool-count');
    if (pinballPoolCount) pinballPoolCount.innerText = state.pool.length;

    const pinballPoolList = document.getElementById('pinball-pool-list');
    const roomPoolDisplayList = document.getElementById('room-pool-display-list');
    const roomResultList = document.getElementById('room-result-list');

    const oldPoolScroll = roomPoolDisplayList ? roomPoolDisplayList.scrollTop : 0;
    const oldResultScroll = roomResultList ? roomResultList.scrollTop : 0;

    if (pinballPoolList) pinballPoolList.innerHTML = '';
    if (roomPoolDisplayList) roomPoolDisplayList.innerHTML = '';
    if (roomResultList) roomResultList.innerHTML = '';

    state.pool.forEach(name => {
      if (pinballPoolList) {
        const span = document.createElement('span');
        span.style.cssText = 'background: #3498db; color: white; padding: 2px 6px; border-radius: 10px; font-size: 10px; margin: 2px;';
        span.innerText = name;
        pinballPoolList.appendChild(span);
      }
      if (roomPoolDisplayList) {
        const li = document.createElement('li');
        li.style.cssText = 'padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; gap: 10px;';
        li.innerHTML = `<span style="font-size: 20px;">🎱</span><span style="font-size: 16px;">${name}</span>`;
        roomPoolDisplayList.appendChild(li);
      }
    });

    state.finished.forEach((name, idx) => {
      if (roomResultList) {
        const li = document.createElement('li');
        const isWinner = idx < (state.winnerLimit || 3);
        const color = isWinner ? '#f1c40f' : '#ccc';
        const fontWeight = isWinner ? 'bold' : 'normal';
        li.style.cssText = `padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; gap: 10px; color: ${color};`;
        let rankStr = isWinner ? (idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🏅') :
          `<span style="display:inline-block; width:20px; text-align:center; font-size:14px;">${idx + 1}</span>`;
        li.innerHTML = `<span style="font-size: 20px;">${rankStr}</span><span style="font-size: 16px; font-weight: ${fontWeight};">${name}</span>`;
        roomResultList.appendChild(li);
      }
    });

    if (roomPoolDisplayList) roomPoolDisplayList.scrollTop = oldPoolScroll;
    if (roomResultList) roomResultList.scrollTop = oldResultScroll;

    const roomAdminPanel = document.getElementById('room-admin-panel');
    const roomParticipantsPanel = document.getElementById('room-participants-panel');
    const pinballItemSelectionUi = document.getElementById('pinball-item-selection-ui');

    if (pinballItemSelectionUi) pinballItemSelectionUi.classList.add('hidden');
    if (pinballStatusOverlay) pinballStatusOverlay.classList.add('hidden');

    if (!pbEngine && state.status !== 'idle') {
      initPinballEngine();
    }

    if (state.status === 'lobby') {
      if (roomAdminPanel) roomAdminPanel.classList.remove('hidden');
      if (roomParticipantsPanel) roomParticipantsPanel.classList.remove('hidden');
      if (pinballSpectatorUi) {
        pinballSpectatorUi.classList.remove('hidden');
        pinballSpectatorUi.innerText = '等待遊戲開始...';
      }
      if (prevStatus === 'playing' && pbEngine) {
        Matter.World.remove(pbEngine.world, Object.values(pbBalls));
        pbBalls = {};
      }
    } else if (state.status === 'instruction') {
      if (roomAdminPanel) roomAdminPanel.classList.add('hidden');
      if (roomParticipantsPanel) roomParticipantsPanel.classList.add('hidden');
      if (pinballSpectatorUi) pinballSpectatorUi.classList.add('hidden');

      const instrOverlay = document.getElementById('pinball-instruction-overlay');
      const instrTimer = document.getElementById('pinball-instruction-timer');
      if (instrOverlay && instrTimer) {
        instrOverlay.classList.remove('hidden');
        instrOverlay.style.display = 'flex';

        if (window.pinballTimerInterval) clearInterval(window.pinballTimerInterval);
        let timeLeft = 5;
        instrTimer.innerText = timeLeft;
        window.pinballTimerInterval = setInterval(() => {
          timeLeft--;
          if (timeLeft >= 0) instrTimer.innerText = timeLeft;
        }, 1000);
      }

    } else if (state.status === 'playing') {
      if (window.pinballTimerInterval) clearInterval(window.pinballTimerInterval);

      const instrOverlay = document.getElementById('pinball-instruction-overlay');
      if (instrOverlay) {
        instrOverlay.classList.add('hidden');
        instrOverlay.style.display = 'none';
      }

      if (roomAdminPanel) roomAdminPanel.classList.add('hidden');
      if (roomParticipantsPanel) roomParticipantsPanel.classList.remove('hidden');

      if (pinballSpectatorUi) {
        pinballSpectatorUi.classList.remove('hidden');
        pinballSpectatorUi.innerText = '🏁 比賽開始 🏁';
      }

      initPinballEngine();

      if (prevStatus === 'instruction' || prevStatus === 'lobby') {
        const countdownEl = document.getElementById('pinball-countdown');
        if (countdownEl) {
          countdownEl.classList.remove('hidden');
          countdownEl.innerText = '3';
          setTimeout(() => countdownEl.innerText = '2', 1000);
          setTimeout(() => countdownEl.innerText = '1', 2000);
          setTimeout(() => {
            countdownEl.innerText = 'GO!';
            setTimeout(() => countdownEl.classList.add('hidden'), 1000);
            dropBalls(state.pool);
          }, 3000);
        } else {
          dropBalls(state.pool);
        }
      }

      if (state.finished.length > 0) {
        const winner = state.finished[0];
        if (pinballSpectatorUi) pinballSpectatorUi.innerText = '🏆 冠軍：' + winner + '！';

        var lotteryWinnerAnnouncement = document.getElementById('lottery-winner-announcement');
        var lotteryWinnerName = document.getElementById('lottery-winner-name');
        if (lotteryWinnerAnnouncement && lotteryWinnerName) {
          lotteryWinnerName.innerText = winner;
          lotteryWinnerAnnouncement.classList.remove('hidden');
          setTimeout(() => {
            lotteryWinnerAnnouncement.classList.add('hidden');
          }, 5000);
        }

        const tabWinners = document.getElementById('tab-winners');
        if (tabWinners) tabWinners.click();

        if (typeof confetti !== 'undefined') {
          confetti({ particleCount: 150, spread: 100, origin: { y: 0.5 } });
        }
      }
    } else {
      if (pinballSpectatorUi) pinballSpectatorUi.classList.add('hidden');
    }
  });
}
