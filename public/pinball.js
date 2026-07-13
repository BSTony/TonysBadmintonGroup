// pinball.js - Marble Race Engine (S-Curve Track)
// Redesigned: 8-layer S-curve track with camera following system

let pbEngine, pbRender, pbRunner;
let pbBalls = {};
let pbState = { status: 'idle', pool: [], finished: [], winnerLimit: 3 };
let pbWorldHeight = 1800;

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

// Track constants
const TRACK_LAYERS = 8;
const TRACK_LAYER_SPACING = 190;
const TRACK_START_Y = 160;
const TRACK_PAD = 40;
const TRACK_SLOPE = 0.055;
const TRACK_RAMP_THICKNESS = 7;

const RAMP_COLORS = [
  '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71',
  '#3498db', '#9b59b6', '#e91e63', '#00bcd4'
];

const BALL_COLORS = [
  '#e74c3c', '#f1c40f', '#3498db', '#2c3e50',
  '#9b59b6', '#2ecc71', '#e67e22', '#e91e63',
  '#00bcd4', '#ff5722', '#8bc34a', '#ff9800'
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
}

function initPinballEngine() {
  if (!pinballContainer) pinballContainer = document.getElementById('pinball-container');
  if (!pinballCanvasWrapper) pinballCanvasWrapper = document.getElementById('pinball-canvas-wrapper');

  if (!pinballContainer || !pinballCanvasWrapper) {
    console.warn('[Pinball] Container elements not found');
    return;
  }

  const width = pinballContainer.clientWidth || window.innerWidth;
  const height = pinballContainer.clientHeight || window.innerHeight;

  if (width < 50 || height < 50) {
    console.warn('[Pinball] Container too small, skipping init');
    if (pbEngine) destroyEngine();
    return;
  }

  if (pbEngine && pbRender && pbRender.options.width === width && pbRender.options.height === height) {
    return;
  }

  if (pbEngine) destroyEngine();

  console.log('[Pinball] Initializing S-curve track: ' + width + 'x' + height);

  const { Engine, Render, Runner, World, Bodies, Events, Body } = Matter;

  pbWorldHeight = TRACK_START_Y + TRACK_LAYERS * TRACK_LAYER_SPACING + 250;

  pbEngine = Engine.create();
  pbEngine.gravity.y = 0.9;

  pinballCanvasWrapper.innerHTML = '';

  pbRender = Render.create({
    element: pinballCanvasWrapper,
    engine: pbEngine,
    options: {
      width, height,
      wireframes: false,
      background: '#0f0f23',
      hasBounds: true
    }
  });

  // Set initial viewport
  pbRender.bounds.min.x = 0;
  pbRender.bounds.min.y = 0;
  pbRender.bounds.max.x = width;
  pbRender.bounds.max.y = height;
  cameraSmoothed = 0;

  // Build the S-curve track
  const trackBodies = buildSCurveTrack(width);
  World.add(pbEngine.world, trackBodies);

  // Finish line sensor at the end of the last layer
  const lastLayerY = TRACK_START_Y + (TRACK_LAYERS - 1) * TRACK_LAYER_SPACING;
  const lastGoingRight = (TRACK_LAYERS - 1) % 2 === 0;
  const finishX = lastGoingRight ? width - TRACK_PAD - 10 : TRACK_PAD + 10;
  
  const finishLine = Bodies.rectangle(finishX, lastLayerY + 60, 30, 100, {
    isStatic: true,
    isSensor: true,
    render: { fillStyle: 'rgba(241, 196, 15, 0.3)' },
    plugin: { isFinishLine: true }
  });
  World.add(pbEngine.world, [finishLine]);

  // Collision detection - finish line
  Events.on(pbEngine, 'collisionStart', (event) => {
    event.pairs.forEach(pair => {
      let ball = null, finish = null;
      if (pair.bodyA.plugin && pair.bodyA.plugin.isBall) ball = pair.bodyA;
      if (pair.bodyB.plugin && pair.bodyB.plugin.isBall) ball = pair.bodyB;
      if (pair.bodyA.plugin && pair.bodyA.plugin.isFinishLine) finish = pair.bodyA;
      if (pair.bodyB.plugin && pair.bodyB.plugin.isFinishLine) finish = pair.bodyB;

      if (ball && finish) {
        if (!pbState.finished.includes(ball.plugin.name)) {
          fetch('/api/pinball/finish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: ball.plugin.name })
          });
        }
      }
    });
  });

  // Anti-stuck mechanic
  Events.on(pbEngine, 'beforeUpdate', () => {
    Object.values(pbBalls).forEach(ball => {
      if (ball.speed < 0.4) {
        ball.plugin.stuckFrames = (ball.plugin.stuckFrames || 0) + 1;
        if (ball.plugin.stuckFrames > 80) {
          const forceMag = 0.012;
          Body.applyForce(ball, ball.position, {
            x: (Math.random() - 0.5) * forceMag * 2,
            y: Math.abs(Math.random() * forceMag) + 0.003
          });
          ball.plugin.stuckFrames = 0;
        }
      } else {
        ball.plugin.stuckFrames = 0;
      }
    });
  });

  // Camera following logic
  Events.on(pbRender, 'beforeRender', () => {
    if (pbState.status !== 'playing') return;

    const allBalls = Object.values(pbBalls);
    if (allBalls.length === 0) return;

    // Get active balls (not finished)
    let trackBalls = allBalls.filter(b => !pbState.finished.includes(b.plugin.name));
    if (trackBalls.length === 0) trackBalls = allBalls; // All finished, just show them

    // Sort by Y position (highest Y = furthest along = leading)
    const sorted = [...trackBalls].sort((a, b) => b.position.y - a.position.y);

    // Alternate between 1st and 2nd place
    const now = Date.now();
    if (now - lastCameraSwitch > CAMERA_SWITCH_MS) {
      cameraTargetIdx = (cameraTargetIdx + 1) % Math.min(2, sorted.length);
      lastCameraSwitch = now;
    }

    const target = sorted[Math.min(cameraTargetIdx, sorted.length - 1)];
    const targetY = target.position.y - height * 0.35;

    // Clamp
    const minY = 0;
    const maxY = pbWorldHeight - height;
    const clampedY = Math.max(minY, Math.min(maxY, targetY));

    // Smooth lerp
    cameraSmoothed += (clampedY - cameraSmoothed) * 0.06;

    pbRender.bounds.min.y = cameraSmoothed;
    pbRender.bounds.max.y = cameraSmoothed + height;
  });

  // Custom rendering (names, labels, decorations)
  Events.on(pbRender, 'afterRender', () => {
    const ctx = pbRender.context;
    const bMinY = pbRender.bounds.min.y;
    const bMaxY = pbRender.bounds.max.y;
    const bMinX = pbRender.bounds.min.x;
    const bW = pbRender.bounds.max.x - bMinX;
    const bH = bMaxY - bMinY;
    const scaleX = width / bW;
    const scaleY = height / bH;

    // Helper: world coord to screen coord
    function toScreen(wx, wy) {
      return { x: (wx - bMinX) * scaleX, y: (wy - bMinY) * scaleY };
    }

    // Draw layer number labels
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'left';
    for (let i = 0; i < TRACK_LAYERS; i++) {
      const ly = TRACK_START_Y + i * TRACK_LAYER_SPACING;
      const sp = toScreen(12, ly - 18);
      if (sp.y > -30 && sp.y < height + 30) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillText('L' + (i + 1), sp.x, sp.y);
      }
    }

    // Draw ramp edge stripes (racing stripes)
    for (let i = 0; i < TRACK_LAYERS; i++) {
      const y = TRACK_START_Y + i * TRACK_LAYER_SPACING;
      const lr = i % 2 === 0;
      const rampW = width - TRACK_PAD * 2 - 30;
      const leftX = TRACK_PAD + 15;
      const rightX = width - TRACK_PAD - 15;
      
      // Draw thin racing stripes along ramp edges
      const yOffset = lr ? TRACK_SLOPE * rampW / 2 : -TRACK_SLOPE * rampW / 2;
      const sp1 = toScreen(leftX, y - yOffset);
      const sp2 = toScreen(rightX, y + yOffset);
      
      if (sp1.y > -50 && sp1.y < height + 50) {
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(sp1.x, sp1.y - 3 * scaleY);
        ctx.lineTo(sp2.x, sp2.y - 3 * scaleY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw START label
    const startSp = toScreen(width / 2, TRACK_START_Y - 60);
    if (startSp.y > -50 && startSp.y < height + 50) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#2ecc71';
      ctx.font = 'bold 26px Arial';
      ctx.shadowColor = '#2ecc71';
      ctx.shadowBlur = 15;
      ctx.fillText('🏁 START', startSp.x, startSp.y);
      ctx.shadowBlur = 0;
    }

    // Draw FINISH label
    const lastLayerY = TRACK_START_Y + (TRACK_LAYERS - 1) * TRACK_LAYER_SPACING;
    const finishSp = toScreen(width / 2, lastLayerY + 70);
    if (finishSp.y > -50 && finishSp.y < height + 50) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f1c40f';
      ctx.font = 'bold 26px Arial';
      ctx.shadowColor = '#f1c40f';
      ctx.shadowBlur = 15;
      ctx.fillText('🏆 FINISH', finishSp.x, finishSp.y);
      ctx.shadowBlur = 0;
    }

    // Draw ball names with outline
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    Object.values(pbBalls).forEach(b => {
      const sp = toScreen(b.position.x, b.position.y);
      if (sp.y < -30 || sp.y > height + 30) return;

      let name = b.plugin.name;
      if (name.length > 5) name = name.substring(0, 4) + '..';
      
      // Draw name above the ball
      const nameY = sp.y - 18 * scaleY;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText(name, sp.x, nameY);
      ctx.fillStyle = '#fff';
      ctx.fillText(name, sp.x, nameY);
    });

    // Draw camera target indicator (small arrow)
    if (pbState.status === 'playing') {
      const activeBalls = Object.values(pbBalls).filter(b => !pbState.finished.includes(b.plugin.name));
      if (activeBalls.length > 0) {
        const sorted = [...activeBalls].sort((a, b) => b.position.y - a.position.y);
        const currentTarget = sorted[Math.min(cameraTargetIdx, sorted.length - 1)];
        if (currentTarget) {
          const sp = toScreen(currentTarget.position.x, currentTarget.position.y);
          ctx.fillStyle = 'rgba(241, 196, 15, 0.6)';
          ctx.beginPath();
          ctx.moveTo(sp.x, sp.y - 26 * scaleY);
          ctx.lineTo(sp.x - 6, sp.y - 34 * scaleY);
          ctx.lineTo(sp.x + 6, sp.y - 34 * scaleY);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // Draw position indicator (top-right HUD)
    if (pbState.status === 'playing' && Object.values(pbBalls).length > 0) {
      const allBalls = Object.values(pbBalls);
      const sortedAll = [...allBalls].sort((a, b) => b.position.y - a.position.y);
      
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      const hudX = width - 110;
      const hudY = 10;
      const hudH = Math.min(sortedAll.length * 22 + 30, 200);
      ctx.fillRect(hudX, hudY, 105, hudH);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(hudX, hudY, 105, hudH);
      
      ctx.fillStyle = '#f1c40f';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('🏁 排名', hudX + 8, hudY + 16);
      
      ctx.font = '10px Arial';
      const maxShow = Math.min(sortedAll.length, 7);
      for (let i = 0; i < maxShow; i++) {
        const b = sortedAll[i];
        const isFinished = pbState.finished.includes(b.plugin.name);
        const rankY = hudY + 32 + i * 20;
        
        // Rank medal
        const medals = ['🥇', '🥈', '🥉'];
        const rank = i < 3 ? medals[i] : (i + 1) + '.';
        
        ctx.fillStyle = isFinished ? '#f1c40f' : '#fff';
        ctx.font = isFinished ? 'bold 10px Arial' : '10px Arial';
        
        let displayName = b.plugin.name;
        if (displayName.length > 6) displayName = displayName.substring(0, 5) + '..';
        ctx.fillText(rank + ' ' + displayName, hudX + 8, rankY);
      }
    }
  });

  Render.run(pbRender);
  pbRunner = Runner.create();
  Runner.run(pbRunner, pbEngine);
  console.log('[Pinball] S-curve track engine started');
}

function buildSCurveTrack(W) {
  const { Bodies } = Matter;
  const bodies = [];

  const mkOpts = (color, rest) => ({
    isStatic: true,
    friction: 0.015,
    restitution: rest || 0.35,
    render: { fillStyle: color }
  });

  const rampW = W - TRACK_PAD * 2 - 30;

  for (let i = 0; i < TRACK_LAYERS; i++) {
    const y = TRACK_START_Y + i * TRACK_LAYER_SPACING;
    const lr = i % 2 === 0; // layer goes left-to-right
    const color = RAMP_COLORS[i];
    const darkColor = darkenColor(color, 0.6);

    // ====== 1. Main ramp surface ======
    bodies.push(Bodies.rectangle(W / 2, y, rampW, TRACK_RAMP_THICKNESS, {
      ...mkOpts(color),
      angle: lr ? TRACK_SLOPE : -TRACK_SLOPE
    }));

    // ====== 2. Thin top rail (prevents balls bouncing over) ======
    bodies.push(Bodies.rectangle(W / 2, y - 22, rampW + 10, 3, {
      ...mkOpts('rgba(255,255,255,0.08)'),
      angle: lr ? TRACK_SLOPE : -TRACK_SLOPE,
      restitution: 0.6
    }));

    // ====== 3. Entry-side guardrail (high end wall) ======
    if (i > 0) {
      const entryX = lr ? TRACK_PAD + 5 : W - TRACK_PAD - 5;
      bodies.push(Bodies.rectangle(entryX, y - 12, 8, 35, {
        ...mkOpts('#555', 0.5)
      }));
    }

    // ====== 4. Turn connector to next layer ======
    if (i < TRACK_LAYERS - 1) {
      const nextY = TRACK_START_Y + (i + 1) * TRACK_LAYER_SPACING;
      const exitX = lr ? W - TRACK_PAD : TRACK_PAD;
      const dir = lr ? 1 : -1; // direction: 1 = right side, -1 = left side
      const midY = (y + nextY) / 2;
      const turnHeight = nextY - y;

      // Outer wall of the turn (prevents ball from escaping)
      bodies.push(Bodies.rectangle(exitX + dir * 22, midY, 8, turnHeight + 25, {
        ...mkOpts('#3d3d5c', 0.5)
      }));

      // Inner curved guide - using multiple segments forming a smooth curve
      // The curve connects the bottom of current ramp to the top of next ramp
      const curveSegs = 10;
      const curveR = turnHeight * 0.42;
      
      for (let s = 0; s < curveSegs; s++) {
        const t1 = s / curveSegs;
        const t2 = (s + 1) / curveSegs;
        const a1 = -Math.PI / 2 + Math.PI * t1;
        const a2 = -Math.PI / 2 + Math.PI * t2;
        const midA = (a1 + a2) / 2;

        // Curve center is at (exitX, midY)
        const squish = 0.25; // Horizontal squish factor (makes curve tighter)
        const sx = exitX + dir * curveR * squish * Math.cos(midA);
        const sy = midY + curveR * Math.sin(midA);

        const segLen = curveR * Math.PI / curveSegs + 2;

        bodies.push(Bodies.rectangle(sx, sy, segLen, TRACK_RAMP_THICKNESS - 1, {
          ...mkOpts(darkColor, 0.4),
          angle: midA + Math.PI / 2
        }));
      }

      // Small catch ramp at the bottom of the turn (extra safety)
      bodies.push(Bodies.rectangle(exitX - dir * 5, nextY - 15, 35, 5, {
        ...mkOpts('#555', 0.3),
        angle: lr ? -0.35 : 0.35
      }));
    }
  }

  // ====== Side walls (full height) ======
  bodies.push(Bodies.rectangle(4, pbWorldHeight / 2, 8, pbWorldHeight, {
    ...mkOpts('#2d2d4e', 0.5)
  }));
  bodies.push(Bodies.rectangle(W - 4, pbWorldHeight / 2, 8, pbWorldHeight, {
    ...mkOpts('#2d2d4e', 0.5)
  }));

  // ====== Top wall ======
  bodies.push(Bodies.rectangle(W / 2, -50, W, 100, {
    ...mkOpts('#2d2d4e')
  }));

  // ====== Bottom catch-all ======
  bodies.push(Bodies.rectangle(W / 2, pbWorldHeight + 50, W, 100, {
    ...mkOpts('#2d2d4e')
  }));

  return bodies;
}

// Helper: darken a hex color
function darkenColor(hex, factor) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return '#' + Math.round(r * factor).toString(16).padStart(2, '0') +
               Math.round(g * factor).toString(16).padStart(2, '0') +
               Math.round(b * factor).toString(16).padStart(2, '0');
}

function dropBalls(pool) {
  console.log('[Pinball] dropBalls called with pool:', pool);
  if (!pbEngine) {
    console.error('[Pinball] Engine not ready!');
    return;
  }
  const { World, Bodies } = Matter;
  const width = pbRender.options.width;

  // Remove existing balls
  const currentBalls = Object.values(pbBalls);
  if (currentBalls.length > 0) {
    World.remove(pbEngine.world, currentBalls);
  }
  pbBalls = {};

  // Reset camera
  cameraY = 0;
  cameraSmoothed = 0;
  cameraTargetIdx = 0;
  lastCameraSwitch = Date.now();
  pbRender.bounds.min.y = 0;
  pbRender.bounds.max.y = pbRender.options.height;

  // Balls start above the first ramp (layer 0, left side since layer 0 goes left→right)
  const startBaseX = TRACK_PAD + 50;
  const startY = TRACK_START_Y - 40;
  const spreadX = Math.min(width * 0.4, pool.length * 20);

  pool.forEach((name, idx) => {
    const x = startBaseX + (idx * 22) % spreadX + Math.random() * 10;
    const y = startY - idx * 8 - Math.random() * 30;
    const color = BALL_COLORS[idx % BALL_COLORS.length];

    const ball = Bodies.circle(x, y, 13, {
      restitution: 0.5,
      friction: 0.03,
      density: 0.04,
      render: { fillStyle: color, strokeStyle: '#fff', lineWidth: 2 },
      plugin: { isBall: true, name: name, stuckFrames: 0 }
    });

    pbBalls[name] = ball;
  });

  World.add(pbEngine.world, Object.values(pbBalls));
}

// ==========================================
// Socket binding & UI state management
// ==========================================
function bindPinballSocket(s) {
  console.log('[Pinball] bindPinballSocket called');
  s.on('pinball_state', (state) => {
    console.log('[Pinball] pinball_state received:', JSON.stringify({
      status: state.status, poolLen: state.pool?.length,
      finishedLen: state.finished?.length
    }));
    const prevStatus = pbState.status;
    pbState = state;

    // Re-fetch DOM elements
    if (!pinballStatusOverlay) pinballStatusOverlay = document.getElementById('pinball-status-overlay');
    if (!pinballStatusText) pinballStatusText = document.getElementById('pinball-status-text');
    if (!pinballStatusTimer) pinballStatusTimer = document.getElementById('pinball-status-timer');
    if (!pinballSpectatorUi) pinballSpectatorUi = document.getElementById('pinball-spectator-ui');
    if (!pinballContainer) pinballContainer = document.getElementById('pinball-container');
    if (!pinballCanvasWrapper) pinballCanvasWrapper = document.getElementById('pinball-canvas-wrapper');

    // ==========================================
    // 1. Update pool/results lists
    // ==========================================
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
        li.innerHTML = `<span style="font-size: 20px;">🕹️</span><span style="font-size: 16px;">${name}</span>`;
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

    // ==========================================
    // 2. Manage UI based on status
    // ==========================================
    const roomAdminPanel = document.getElementById('room-admin-panel');
    const roomParticipantsPanel = document.getElementById('room-participants-panel');
    const pinballItemSelectionUi = document.getElementById('pinball-item-selection-ui');

    // Hide item selection UI (removed feature)
    if (pinballItemSelectionUi) pinballItemSelectionUi.classList.add('hidden');
    if (pinballStatusOverlay) pinballStatusOverlay.classList.add('hidden');

    // Initialize engine when needed
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

      // Clear balls if returned to lobby
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
        window.pinballTimerInterval = setInterval(() => {
          let timeLeft = state.statusEndTime ? Math.max(0, Math.ceil((state.statusEndTime - Date.now()) / 1000)) : 5;
          instrTimer.innerText = timeLeft;
        }, 100);
      }

    } else if (state.status === 'playing') {
      if (window.pinballTimerInterval) clearInterval(window.pinballTimerInterval);

      // Hide instruction overlay
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

      if (prevStatus === 'instruction' || prevStatus === 'lobby' || prevStatus === 'item_placement') {
        console.log('[Pinball] Transition to playing! Pool:', state.pool);
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

      // Check for winner
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
      // idle
      if (pinballSpectatorUi) pinballSpectatorUi.classList.add('hidden');
    }
  });
}
