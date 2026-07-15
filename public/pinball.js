// pinball.js - Top-Down Racing Track (S-Curve)
// Redesigned: 2.5D top-down view matching real marble race tracks

let pbEngine, pbRender, pbRunner;
let pbBalls = {};
let pbState = { status: 'idle', pool: [], finished: [], winnerLimit: 3 };
let pbWorldHeight = 3500;
let startGateBody = null;
let pbMouseConstraint = null;

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
let START_Y = 150;
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
  startGateBody = null;
  pbMouseConstraint = null;
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

  if (width < 50 || height < 50) return;

  if (pbEngine && pbRender && pbRender.options.width === width && pbRender.options.height === height) {
    return;
  }

  if (pbEngine) destroyEngine();
  console.log('[Pinball] Initializing Top-Down track: ' + width + 'x' + height);

  const { Engine, Render, Runner, World, Bodies, Events, Body } = Matter;

  pbEngine = Engine.create();
  pbEngine.gravity.y = GRAVITY_Y;
  pbEngine.gravity.x = 0;

  START_Y = Math.floor(height * 0.65); // 65% of screen height for operations

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

  // Finish line sensor
  const finishLine = Bodies.rectangle(width / 2, finalY + 80, TRACK_WIDTH + 60, 40, {
    isStatic: true,
    isSensor: true,
    render: { visible: false },
    plugin: { isFinishLine: true }
  });
  World.add(pbEngine.world, [finishLine]);

  // Start Gate and Lobby Walls (blocks balls from falling or being dragged off-screen in lobby)
  if (pbState.status !== 'playing') {
    startGateBody = Bodies.rectangle(width / 2, START_Y + 95, width * 2, 200, {
      isStatic: true,
      render: { visible: false }, // Invisible thick physical block
      plugin: { isStartGate: true }
    });
    
    // Add physical walls for the lobby area so they can't drag balls off screen
    const lobbyCeiling = Bodies.rectangle(width / 2, -20, width * 2, 40, { isStatic: true, render: { visible: false } });
    const lobbyLeftWall = Bodies.rectangle(-20, START_Y / 2, 40, START_Y * 2, { isStatic: true, render: { visible: false } });
    const lobbyRightWall = Bodies.rectangle(width + 20, START_Y / 2, 40, START_Y * 2, { isStatic: true, render: { visible: false } });

    World.add(pbEngine.world, [startGateBody, lobbyCeiling, lobbyLeftWall, lobbyRightWall]);
  } else {
    startGateBody = null;
  }

  // Finish line collision
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

  // Physics updates and clamping
  Events.on(pbEngine, 'beforeUpdate', () => {
    updateDynamicLeaderboard();
    
    if (pbState.status === 'playing') {
      Object.values(pbBalls).forEach(ball => {
        // Apply constant downward push to simulate steep track
        Body.applyForce(ball, ball.position, { x: 0, y: 0.0004 });
        
        if (ball.speed < 1.0) {
          ball.plugin.stuckFrames = (ball.plugin.stuckFrames || 0) + 1;
          if (ball.plugin.stuckFrames > 45) {
            Body.applyForce(ball, ball.position, {
              x: (Math.random() - 0.5) * 0.04,
              y: -0.025 // Stronger jump up and out of corners
            });
            ball.plugin.stuckFrames = 0;
          }
        } else {
          ball.plugin.stuckFrames = 0;
        }
      });
    } else {
      // In lobby/instruction, enforce boundaries so they can't drag balls beyond the gate or off-screen
      const width = pbRender ? pbRender.options.width : window.innerWidth;
      Object.values(pbBalls).forEach(ball => {
        let { x, y } = ball.position;
        let clamped = false;
        
        if (y > START_Y - 20) { y = START_Y - 20; clamped = true; }
        if (y < 20) { y = 20; clamped = true; }
        if (x < 20) { x = 20; clamped = true; }
        if (x > width - 20) { x = width - 20; clamped = true; }
        
        if (clamped) {
          Matter.Body.setPosition(ball, { x, y });
          Matter.Body.setVelocity(ball, { x: 0, y: 0 });
        }
      });
    }
  });

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

    // 2. Start Line Checkerboard (only draw when start gate exists)
    const startSp = toScreen(width / 2, START_Y);
    if (startGateBody && startSp.y > -100 && startSp.y < height + 100) {
      drawCheckerboard(ctx, startSp.x, startSp.y, width, 20 * scaleY);
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${24 * scaleY}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('START', startSp.x, startSp.y + 25 * scaleY); // Draw below the gate so balls don't cover it
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
    
    // Draw HUD - Replaced by DOM-based Dynamic Leaderboard, so we do nothing here.
  });

  // Close popup logic
  const btnClosePopup = document.getElementById('btn-pinball-close-popup');
  if (btnClosePopup && !btnClosePopup.hasListener) {
    btnClosePopup.hasListener = true;
    btnClosePopup.addEventListener('click', () => {
      document.getElementById('pinball-score-popup').classList.add('hidden');
    });
  }

  Render.run(pbRender);
  pbRunner = Runner.create();
  Runner.run(pbRunner, pbEngine);

  // Setup Mouse Constraint for dragging
  const { Mouse, MouseConstraint } = Matter;
  const mouse = Mouse.create(pbRender.canvas);
  pbMouseConstraint = MouseConstraint.create(pbEngine, {
    mouse: mouse,
    constraint: { stiffness: 0.2, render: { visible: false } }
  });
  
  if (pbState.status !== 'playing') {
    World.add(pbEngine.world, pbMouseConstraint);
  }

  // Filter mouse interactions (only allow dragging own ball in lobby/instruction)
  Events.on(pbMouseConstraint, 'mousedown', (event) => {
    if (pbState.status !== 'lobby' && pbState.status !== 'instruction') {
      pbMouseConstraint.body = null; // Deny drag if racing
      return;
    }
    const body = pbMouseConstraint.body;
    if (body) {
      if (!body.plugin || !body.plugin.isBall) {
        pbMouseConstraint.body = null; // Only balls are draggable
        return;
      }
      const myName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.displayName : null;
      if (body.plugin.name !== myName) {
        pbMouseConstraint.body = null; // Deny dragging someone else's ball
      }
    }
  });

  // Sync position on release or drag
  Events.on(pbMouseConstraint, 'enddrag', (event) => {
    const body = event.body;
    if (body && body.plugin && body.plugin.isBall) {
      const myName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.displayName : null;
      if (body.plugin.name === myName) {
        if (typeof pinballSocket !== 'undefined') {
          pinballSocket.emit('pinball_move_ball', {
            name: myName,
            x: body.position.x,
            y: body.position.y
          });
        }
      }
    }
  });

  pbRender.mouse = mouse;

  console.log('[Pinball] Top-down track engine started');
}

function buildTopDownTrack(W) {
  const { Bodies } = Matter;
  const bodies = [];
  const pathPoints = [];
  
  const steps = 280; // Increased resolution for longer track
  const maxT = Math.PI * 10; // 5 full S-curves (doubled length)
  const amplitude = Math.min(W * 0.35, 200); // max left/right swing
  const stretch = 160; // Pixels downwards per radian

  let currentY = START_Y + 10; // Track generation starts below the gate
  
  // Create Funnel to guide balls from wide screen into narrow track
  const funnelHeight = 250; // Steep funnel
  const trackLeftX = W / 2 - TRACK_WIDTH / 2;
  const trackRightX = W / 2 + TRACK_WIDTH / 2;
  
  // Left funnel wall
  const lStartX = -100;
  const lStartY = currentY;
  const lEndX = trackLeftX;
  const lEndY = currentY + funnelHeight;
  const lLen = Math.hypot(lEndX - lStartX, lEndY - lStartY);
  const lAngle = Math.atan2(lEndY - lStartY, lEndX - lStartX);
  
  bodies.push(Bodies.rectangle((lStartX + lEndX)/2, (lStartY + lEndY)/2, lLen, 100, {
    isStatic: true, angle: lAngle, render: { fillStyle: '#bdc3c7', strokeStyle: '#95a5a6', lineWidth: 1 }
  }));
  
  // Right funnel wall
  const rStartX = trackRightX;
  const rStartY = currentY + funnelHeight;
  const rEndX = W + 100;
  const rEndY = currentY;
  const rLen = Math.hypot(rEndX - rStartX, rEndY - rStartY);
  const rAngle = Math.atan2(rEndY - rStartY, rEndX - rStartX);
  
  bodies.push(Bodies.rectangle((rStartX + rEndX)/2, (rStartY + rEndY)/2, rLen, 100, {
    isStatic: true, angle: rAngle, render: { fillStyle: '#bdc3c7', strokeStyle: '#95a5a6', lineWidth: 1 }
  }));

  currentY += funnelHeight;
  
  // Start track points exactly at funnel exit
  for(let y = currentY; y < currentY + 100; y += 20) {
    pathPoints.push({ x: W/2, y: y });
  }
  currentY += 100;

  // Randomize track shape using sum of sines
  const phase1 = Math.random() * Math.PI * 2;
  const phase2 = Math.random() * Math.PI * 2;
  const phase3 = Math.random() * Math.PI * 2;
  
  const freq1 = 1;
  const freq2 = 1.4 + Math.random() * 0.8; // Faster wiggles
  const freq3 = 0.4 + Math.random() * 0.3; // Long sweeping drifts
  
  // Weights for each sine wave component (sum to ~1.0)
  const w1 = 0.5 + Math.random() * 0.2;
  const w2 = 0.15 + Math.random() * 0.15;
  const w3 = 1.0 - w1 - w2;

  const trackWaveStartY = currentY;

  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * maxT;
    
    const xOffset = amplitude * (
      w1 * Math.sin(t * freq1 + phase1) +
      w2 * Math.sin(t * freq2 + phase2) +
      w3 * Math.sin(t * freq3 + phase3)
    );

    const x = W / 2 + xOffset;
    const y = trackWaveStartY + t * stretch;
    pathPoints.push({ x, y });
    currentY = y;
  }
  
  // Straight exit at the bottom
  const lastX = pathPoints[pathPoints.length - 1].x;
  for(let y = currentY; y < currentY + 300; y += 20) {
    pathPoints.push({ x: lastX, y: y });
  }

  // Build physical guardrails along the path
  const wallThickness = 50; 
  const wallOffset = (TRACK_WIDTH / 2) + (wallThickness / 2) - 2; // Perfectly align inner edge
  
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const p1 = pathPoints[i];
    const p2 = pathPoints[i+1];
    
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx*dx + dy*dy);
    
    const nx = -dy / len;
    const ny = dx / len;
    
    // Matter.js rectangles are positioned by their CENTER
    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2;
    
    const leftX = mx + nx * wallOffset;
    const leftY = my + ny * wallOffset;
    const rightX = mx - nx * wallOffset;
    const rightY = my - ny * wallOffset;
    
    const angle = Math.atan2(dy, dx);
    const segmentLength = len + 12; // Overlap to prevent snagging

    // Left Wall
    bodies.push(Bodies.rectangle(leftX, leftY, segmentLength, wallThickness, {
      isStatic: true,
      friction: 0.05,
      restitution: 0.4, // Less bouncy so they don't jump the wall
      angle: angle,
      render: { fillStyle: '#bdc3c7', strokeStyle: '#95a5a6', lineWidth: 1 }
    }));

    // Right Wall
    bodies.push(Bodies.rectangle(rightX, rightY, segmentLength, wallThickness, {
      isStatic: true,
      friction: 0.05,
      restitution: 0.4,
      angle: angle,
      render: { fillStyle: '#bdc3c7', strokeStyle: '#95a5a6', lineWidth: 1 }
    }));

    // Add circular joints to perfectly seal corners and prevent snagging
    bodies.push(Bodies.circle(p2.x + nx * wallOffset, p2.y + ny * wallOffset, wallThickness / 2, {
      isStatic: true, friction: 0.05, restitution: 0.4, render: { fillStyle: '#bdc3c7' }
    }));
    bodies.push(Bodies.circle(p2.x - nx * wallOffset, p2.y - ny * wallOffset, wallThickness / 2, {
      isStatic: true, friction: 0.05, restitution: 0.4, render: { fillStyle: '#bdc3c7' }
    }));
  }

  // Top blocking wall removed as it interfered with the open lobby
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

// Removed old drawRankingHUD as we now use DOM-based dynamic leaderboard
function updateDynamicLeaderboard() {
  if (pbState.status !== 'playing' || Object.values(pbBalls).length === 0) return;
  
  const dynBoard = document.getElementById('pinball-dynamic-leaderboard');
  const dynList = document.getElementById('pinball-dynamic-leaderboard-list');
  if (!dynBoard || !dynList) return;

  const allBalls = Object.values(pbBalls);
  const sortedAll = [...allBalls].sort((a, b) => b.position.y - a.position.y);
  
  // Find current user's rank
  let myName = typeof currentUser !== 'undefined' && currentUser ? currentUser.displayName : null;
  let myRankIdx = -1;
  if (myName) {
    myRankIdx = sortedAll.findIndex(b => b.plugin.name === myName);
  }

  const raceEnded = pbState.finished.length === pbState.pool.length;
  let showIndices = new Set();
  
  if (raceEnded) {
    // End of race: show top 5
    for(let i=0; i<Math.min(5, sortedAll.length); i++) showIndices.add(i);
  } else {
    // Show top 3
    for(let i=0; i<Math.min(3, sortedAll.length); i++) showIndices.add(i);
    // Show me and my neighbors
    if (myRankIdx !== -1) {
      if (myRankIdx > 0) showIndices.add(myRankIdx - 1);
      showIndices.add(myRankIdx);
      if (myRankIdx < sortedAll.length - 1) showIndices.add(myRankIdx + 1);
    }
  }

  const showArray = Array.from(showIndices).sort((a, b) => a - b);
  
  dynList.innerHTML = '';
  let lastIdx = -1;

  showArray.forEach(idx => {
    if (lastIdx !== -1 && idx > lastIdx + 1) {
      // Add ellipsis
      const liDots = document.createElement('li');
      liDots.style.textAlign = 'center';
      liDots.style.color = '#7f8c8d';
      liDots.innerText = '⋮';
      dynList.appendChild(liDots);
    }

    const b = sortedAll[idx];
    const isFinished = pbState.finished.includes(b.plugin.name);
    const isMe = b.plugin.name === myName;
    
    const medals = ['🥇', '🥈', '🥉'];
    const rankStr = idx < 3 ? medals[idx] : (idx + 1) + '.';
    
    const li = document.createElement('li');
    li.style.color = isFinished ? '#f1c40f' : (isMe ? '#2ecc71' : '#fff');
    li.style.fontWeight = (isFinished || isMe) ? 'bold' : 'normal';
    li.style.display = 'flex';
    li.style.justifyContent = 'space-between';
    
    let dName = b.plugin.name;
    if (dName.length > 5) dName = dName.substring(0, 4) + '..';
    
    li.innerHTML = `<span>${rankStr} ${dName}</span>`;
    dynList.appendChild(li);
    lastIdx = idx;
  });
}

function syncBalls(state) {
  if (!pbEngine) return;
  const { World, Bodies } = Matter;
  const width = pbRender.options.width;

  const cols = Math.floor(TRACK_WIDTH / (MARBLE_RADIUS * 2.5));
  const startBaseX = width / 2 - (cols * MARBLE_RADIUS * 1.2) + MARBLE_RADIUS;
  const startY = START_Y - 50;

  const poolSet = new Set(state.pool);

  // Remove balls not in pool anymore
  Object.keys(pbBalls).forEach(name => {
    if (!poolSet.has(name)) {
      World.remove(pbEngine.world, pbBalls[name]);
      delete pbBalls[name];
    }
  });

  // Add new balls
  state.pool.forEach((name, idx) => {
    if (!pbBalls[name]) {
      let x, y;
      if (state.positions && state.positions[name]) {
        x = state.positions[name].x;
        y = state.positions[name].y;
      } else {
        const row = Math.floor(idx / cols);
        const col = idx % cols;
        x = startBaseX + col * (MARBLE_RADIUS * 2.5) + (Math.random() - 0.5) * 5;
        y = startY - row * (MARBLE_RADIUS * 2.5) - Math.random() * 5;
      }

      const color = POOL_COLORS[idx % POOL_COLORS.length];
      const num = (idx % 15) + 1;

      const ball = Bodies.circle(x, y, MARBLE_RADIUS, {
        restitution: 0.6,
        friction: 0.005,
        density: 0.05,
        render: { fillStyle: color },
        plugin: { isBall: true, name: name, num: num, stuckFrames: 0 }
      });

      pbBalls[name] = ball;
      World.add(pbEngine.world, ball);
    }
  });
}

function startRace() {
  if (!pbEngine) return;
  pbEngine.gravity.y = GRAVITY_Y;
  
  if (startGateBody) {
    Matter.World.remove(pbEngine.world, startGateBody);
    startGateBody = null;
  }
  
  if (pbMouseConstraint) {
    Matter.World.remove(pbEngine.world, pbMouseConstraint);
  }

  cameraSmoothed = 0;
  cameraTargetIdx = 0;
  lastCameraSwitch = Date.now();
  pbRender.bounds.min.y = 0;
  pbRender.bounds.max.y = pbRender.options.height;
}

function bindPinballSocket(s) {
  s.on('pinball_ball_moved', (data) => {
    const { name, x, y } = data;
    if (pbBalls[name]) {
      const myName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.displayName : null;
      if (name !== myName) {
        Matter.Body.setPosition(pbBalls[name], { x, y });
        Matter.Body.setVelocity(pbBalls[name], { x: 0, y: 0 }); // stop sliding
      }
    }
  });

  s.on('pinball_shake', () => {
    if (pbEngine && pbBalls) {
      Object.values(pbBalls).forEach(ball => {
        // Apply random bump force to unstick
        Matter.Body.applyForce(ball, ball.position, {
          x: (Math.random() - 0.5) * 0.05,
          y: -0.05 // Upward jump
        });
      });
      // Visual feedback
      if (pinballCanvasWrapper) {
        pinballCanvasWrapper.style.transform = `translate(${(Math.random()-0.5)*10}px, ${(Math.random()-0.5)*10}px)`;
        setTimeout(() => pinballCanvasWrapper.style.transform = 'translate(0, 0)', 50);
      }
    }
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
    const dynBoard = document.getElementById('pinball-dynamic-leaderboard');

    if (pinballStatusOverlay) pinballStatusOverlay.classList.add('hidden');

    if (!pbEngine && state.status !== 'idle') {
      initPinballEngine();
    }

    if (state.status === 'lobby') {
      if (roomAdminPanel) roomAdminPanel.style.display = '';
      if (roomParticipantsPanel) roomParticipantsPanel.style.display = '';
      if (dynBoard) dynBoard.classList.add('hidden');
      const countdownEl = document.getElementById('pinball-countdown');
      if (countdownEl) {
        if (countdownEl.timer) {
          clearInterval(countdownEl.timer);
          countdownEl.timer = null;
        }
        countdownEl.classList.add('hidden');
      }
      if (pinballSpectatorUi) {
        pinballSpectatorUi.classList.remove('hidden');
        pinballSpectatorUi.innerText = '等待遊戲開始...';
      }
      if (prevStatus === 'playing' && pbEngine) {
        destroyEngine();
        
        // Immediately rebuild with new terrain
        initPinballEngine();
      }
      
      syncBalls(state);
    } else if (state.status === 'instruction') {
      // Destroy engine if we came directly from playing (Next Round)
      if ((prevStatus === 'playing' || isNewRound) && pbEngine) {
        destroyEngine();
        initPinballEngine();
      }

      const countdownEl = document.getElementById('pinball-countdown');
      if (countdownEl) {
        if (countdownEl.timer) {
          clearInterval(countdownEl.timer);
          countdownEl.timer = null;
        }
        countdownEl.classList.add('hidden');
      }

      if (roomAdminPanel) roomAdminPanel.style.display = 'none';
      if (roomParticipantsPanel) roomParticipantsPanel.style.display = 'none';
      if (pinballSpectatorUi) pinballSpectatorUi.classList.add('hidden');

      const instrOverlay = document.getElementById('pinball-instruction-overlay');
      const instrTimer = document.getElementById('pinball-instruction-timer');
      
      if (state.skipInstructionUI) {
        if (instrOverlay) {
          instrOverlay.classList.add('hidden');
          instrOverlay.style.display = 'none';
        }
      } else {
        if (instrOverlay && instrTimer) {
          instrOverlay.classList.remove('hidden');
          instrOverlay.style.display = 'flex';
        }
      }
      
      if (countdownEl) {
        countdownEl.classList.remove('hidden');
        countdownEl.style.fontSize = '';
      }

      if (window.pinballTimerInterval) clearInterval(window.pinballTimerInterval);
      
      let localRemaining = 5;
      if (state.statusEndTime) {
        const diffMs = state.statusEndTime - Date.now();
        // If client is way out of sync or late join, adjust locally but bound to 0-5
        if (diffMs > 0 && diffMs <= 6000) {
          localRemaining = diffMs / 1000;
        }
      }

      window.pinballTimerInterval = setInterval(() => {
        localRemaining -= 0.1;
        if (localRemaining < 0) localRemaining = 0;
        
        let timeLeft = Math.ceil(localRemaining);
        if (instrTimer) instrTimer.innerText = timeLeft;
        if (countdownEl) countdownEl.innerText = timeLeft;
        
        if (localRemaining <= 0) {
          clearInterval(window.pinballTimerInterval);
          window.pinballTimerInterval = null;
        }
      }, 100);

      syncBalls(state);

    } else if (state.status === 'playing') {
      if (window.pinballTimerInterval) clearInterval(window.pinballTimerInterval);

      const instrOverlay = document.getElementById('pinball-instruction-overlay');
      if (instrOverlay) {
        instrOverlay.classList.add('hidden');
        instrOverlay.style.display = 'none';
      }

      if (roomAdminPanel) roomAdminPanel.style.display = 'none';
      if (roomParticipantsPanel) roomParticipantsPanel.style.display = 'none';
      if (dynBoard) dynBoard.classList.remove('hidden');

      const btnShake = document.getElementById('btn-pinball-shake');
      if (btnShake && typeof globalIsSuperAdmin !== 'undefined' && globalIsSuperAdmin) {
        btnShake.classList.remove('hidden');
        if (!btnShake.hasListener) {
          btnShake.hasListener = true;
          btnShake.addEventListener('click', () => {
            fetch('/api/admin/pinball/shake', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ uid: currentUser.userId })
            });
          });
        }
      }

      if (pinballSpectatorUi) {
        pinballSpectatorUi.classList.remove('hidden');
        pinballSpectatorUi.innerText = '🏁 比賽開始 🏁';
      }

      if (isNewRound && pbEngine) {
        // Destroy old engine and reset track for quick-next
        destroyEngine();
      }

      initPinballEngine();

      if (prevStatus === 'instruction') {
        const countdownEl = document.getElementById('pinball-countdown');
        if (countdownEl) {
          countdownEl.classList.remove('hidden');
          countdownEl.innerText = 'GO!';
          setTimeout(() => countdownEl.classList.add('hidden'), 1500);
        }
      } else {
        const countdownEl = document.getElementById('pinball-countdown');
        if (countdownEl) countdownEl.classList.add('hidden');
      }

      startRace();

      if (state.finished.length > 0) {
        const winner = state.finished[0];
        if (pinballSpectatorUi) {
          if (!pinballSpectatorUi.querySelector('#pinball-winner-text')) {
            pinballSpectatorUi.innerHTML = `<div id="pinball-winner-text">🏆 冠軍：${winner}！</div>`;
          }
          
          if (typeof globalIsSuperAdmin !== 'undefined' && globalIsSuperAdmin) {
            let nextBtn = document.getElementById('btn-pinball-quick-next');
            if (!nextBtn) {
              nextBtn = document.createElement('button');
              nextBtn.id = 'btn-pinball-quick-next';
              nextBtn.className = 'btn';
              nextBtn.style.marginTop = '10px';
              nextBtn.style.padding = '8px 16px';
              nextBtn.style.background = '#2ecc71';
              nextBtn.style.color = 'white';
              nextBtn.style.border = 'none';
              nextBtn.style.borderRadius = '5px';
              nextBtn.style.cursor = 'pointer';
              nextBtn.style.fontSize = '16px';
              nextBtn.innerText = '下一場 (重新開始)';
              nextBtn.onclick = async () => {
                nextBtn.disabled = true;
                nextBtn.innerText = '處理中...';
                try {
                  await fetch('/api/admin/pinball/quick-next', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uid: currentUser.userId, winnerLimit: state.winnerLimit || 3 })
                  });
                } catch(e) { console.error(e); }
              };
              pinballSpectatorUi.appendChild(nextBtn);
            }
          }
        }

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

      // Check if race is fully ended
      if (state.finished.length > 0 && state.finished.length === state.pool.length) {
        const popup = document.getElementById('pinball-score-popup');
        const scoreList = document.getElementById('pinball-score-list');
        if (popup && scoreList) {
          scoreList.innerHTML = '';
          // Sort by scores descending
          const scores = state.scores || {};
          const sortedPlayers = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
          
          sortedPlayers.forEach((p, i) => {
            const li = document.createElement('li');
            li.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
            li.innerHTML = `<span>${rank} ${p}</span> <span style="color:#f1c40f; font-weight:bold;">${scores[p]} 分</span>`;
            scoreList.appendChild(li);
          });
          popup.classList.remove('hidden');
        }
      }
    } else {
      if (pinballSpectatorUi) pinballSpectatorUi.classList.add('hidden');
      if (dynBoard) dynBoard.classList.add('hidden');
      const btnShake = document.getElementById('btn-pinball-shake');
      if (btnShake) btnShake.classList.add('hidden');
    }
  });
}
