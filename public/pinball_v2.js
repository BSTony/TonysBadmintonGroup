// pinball.js - Top-Down Racing Track (S-Curve)
// Redesigned: 2.5D top-down view matching real marble race tracks

let pbEngine, pbRender, pbRunner;
let pbBalls = {};
let pbState = { status: 'idle', pool: [], finished: [], winnerLimit: 3 };
let pbWorldHeight = 3500;

  let currentSeed = 12345;
  function setSeed(seed) { currentSeed = seed; }
  function seededRandom() {
    currentSeed = (currentSeed * 9301 + 49297) % 233280;
    return currentSeed / 233280;
  }

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
const TRACK_WIDTH = 200;
// Logical start Y fixed to match server (1000 * 0.65 = 650)
let START_Y = 650;
// Logical width fixed to match server
const LOGICAL_WIDTH = 800;
const MARBLE_RADIUS = 12;
const GRAVITY_Y = 0.8;

// Sine wave path points for custom rendering
let trackPathPoints = [];
let trackObstacles = [];

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
  trackObstacles = [];
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

  const canvasWidth = pinballContainer.clientWidth || window.innerWidth;
  const canvasHeight = pinballContainer.clientHeight || window.innerHeight;

  if (canvasWidth < 50 || canvasHeight < 50) return;

  if (pbEngine && pbRender && pbRender.options.width === canvasWidth && pbRender.options.height === canvasHeight) {
    return;
  }

  if (pbEngine) destroyEngine();
  console.log('[Pinball] Initializing Top-Down track: ' + canvasWidth + 'x' + canvasHeight);

  const { Engine, Render, Runner, World, Bodies, Events, Body } = Matter;

  pbEngine = Engine.create();
  pbEngine.gravity.y = 0;
  pbEngine.gravity.x = 0;

  pbRender = Render.create({
    element: pinballCanvasWrapper,
    engine: pbEngine,
    options: {
      width: canvasWidth,
      height: canvasHeight,
      wireframes: false,
      background: '#3d8236', // Grass green
      hasBounds: true
    }
  });

  pbRender.bounds.min.x = 0;
  pbRender.bounds.min.y = 0;
  pbRender.bounds.max.x = LOGICAL_WIDTH;
  pbRender.bounds.max.y = canvasHeight * (LOGICAL_WIDTH / canvasWidth);
  cameraSmoothed = 0;

  // Reset seed right before generation to guarantee consistency even if initPinballEngine is called multiple times (e.g., on resize)
  if (pbState && pbState.seed) {
    setSeed(pbState.seed);
  }
  // Build the top-down track guardrails using the logical width
  const { bodies, pathPoints, finalY } = buildTopDownTrack(LOGICAL_WIDTH);
  trackPathPoints = pathPoints;
  pbWorldHeight = finalY + 400;

  
  // --- GENERATE RANDOM OBSTACLES ---
  // Generate 15 pegs uniformly distributed along the track (alternating 2 and 1 per row)
  const numRows = 10;
  const startIdx = Math.floor(pathPoints.length * 0.10);
  const endIdx = Math.floor(pathPoints.length * 0.90);
  const zoneSize = (endIdx - startIdx) / numRows;
  
  for (let r = 0; r < numRows; r++) {
    const pIdx = Math.floor(startIdx + r * zoneSize + (zoneSize / 2));
    const p = pathPoints[pIdx];
    let pNext = pathPoints[pIdx + 5] || pathPoints[pathPoints.length - 1];
    let pPrev = pathPoints[pIdx - 5] || pathPoints[0];
    
    let dx = pNext.x - pPrev.x;
    let dy = pNext.y - pPrev.y;
    let len = Math.sqrt(dx*dx + dy*dy);
    let tx = dx / len;
    let ty = dy / len;
    let nx = -ty;
    let ny = tx;

    let pegsInThisRow = (r % 2 === 0) ? 2 : 1;
    let isWindmillRow = false;
    
    // Add two windmills along the regular track
    if (r === 3 || r === 7) {
      isWindmillRow = true;
      pegsInThisRow = 1;
    }
    
    for (let i = 0; i < pegsInThisRow; i++) {
      let offsetAmt = 0;
      if (!isWindmillRow && pegsInThisRow === 2) {
        offsetAmt = (i === 0) ? -40 : 40;
      }
      
      const cx = p.x + nx * offsetAmt;
      const cy = p.y + ny * offsetAmt;
      
      if (isWindmillRow) {
        const windmill = Bodies.rectangle(cx, cy, 128, 20, {
          isStatic: true, restitution: 1.2, friction: 0.0,
          render: { fillStyle: '#f1c40f', strokeStyle: '#e67e22', lineWidth: 4 }, 
          plugin: { isRotary: true, isBumper: true }
        });
        bodies.push(windmill);
        trackObstacles.push(windmill);
      } else {
        const bouncer = Bodies.circle(cx, cy, 14, {
          isStatic: true, restitution: 1.5, friction: 0.0,
          render: { fillStyle: '#f1c40f', strokeStyle: '#111111', lineWidth: 4 }, plugin: { isBumper: true }
        });
        bodies.push(bouncer);
        trackObstacles.push(bouncer);
      }
    }
  }
  // --- END GENERATE RANDOM OBSTACLES ---

  // --- GENERATE FINAL PACHINKO GRID ---
  const startFinalIdx = Math.floor(pathPoints.length * 0.92);
  const endFinalIdx = Math.floor(pathPoints.length * 0.98);
  
  if (endFinalIdx > startFinalIdx) {
    let rowNum = 0;
    // Step by 5 to ensure enough vertical distance between rows
    for (let pIdx = startFinalIdx; pIdx <= endFinalIdx; pIdx += 5) {
      const p = pathPoints[pIdx];
      
      let pNext = pathPoints[pIdx + 5] || pathPoints[pathPoints.length - 1];
      let pPrev = pathPoints[pIdx - 5] || pathPoints[0];
      let dx = pNext.x - pPrev.x;
      let dy = pNext.y - pPrev.y;
      let len = Math.sqrt(dx*dx + dy*dy);
      let tx = dx / len;
      let ty = dy / len;
      let nx = -ty;
      let ny = tx;

      let offsets = [];
      
      const pattern = rowNum % 3;
      if (pattern === 0) offsets = [-45, 45];
      else if (pattern === 1) offsets = [-35, 35];
      else offsets = [0];

      for (let offsetAmt of offsets) {
        const cx = p.x + nx * offsetAmt;
        const cy = p.y + ny * offsetAmt;
        
        const bouncer = Bodies.circle(cx, cy, 14, {
          isStatic: true, restitution: 1.5, friction: 0.0,
          render: { fillStyle: '#e74c3c', strokeStyle: '#111111', lineWidth: 4 }, plugin: { isBumper: true }
        });
        bodies.push(bouncer);
        trackObstacles.push(bouncer);
      }
      rowNum++;
    }
  }
  // --- END GENERATE FINAL PACHINKO GRID ---

  World.add(pbEngine.world, bodies);


  // Finish line sensor
  const finishLine = Bodies.rectangle(LOGICAL_WIDTH / 2, finalY + 80, TRACK_WIDTH + 60, 40, {
    isStatic: true,
    isSensor: true,
    render: { visible: false },
    plugin: { isFinishLine: true }
  });
  World.add(pbEngine.world, [finishLine]);

  // Start Gate and Lobby Walls
  if (!window.pinballRaceStarted) {
    if (startGateBody) Matter.World.remove(pbEngine.world, startGateBody);
    startGateBody = Bodies.rectangle(LOGICAL_WIDTH / 2, START_Y + 95, LOGICAL_WIDTH * 2, 200, {
      isStatic: true,
      render: { visible: false }, // Invisible thick physical block
      plugin: { isStartGate: true }
    });
    
    // Add physical walls for the lobby area
    const lobbyCeiling = Bodies.rectangle(LOGICAL_WIDTH / 2, -20, LOGICAL_WIDTH * 2, 40, { isStatic: true, render: { visible: false } });
    const lobbyLeftWall = Bodies.rectangle(-20, START_Y / 2, 40, START_Y * 2, { isStatic: true, render: { visible: false } });
    const lobbyRightWall = Bodies.rectangle(LOGICAL_WIDTH + 20, START_Y / 2, 40, START_Y * 2, { isStatic: true, render: { visible: false } });

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
    
    // Rubber-banding (catch-up mechanic)
    if (typeof pbState !== 'undefined' && pbState && pbState.status === 'playing' && pbEngine.gravity.y > 0) {
      const allBalls = Object.values(pbBalls).filter(b => !pbState.finished.includes(b.plugin.name));
      if (allBalls.length > 1) {
        const sortedBalls = [...allBalls].sort((a, b) => b.position.y - a.position.y);
        sortedBalls.forEach((ball, index) => {
          let multiplier = 0;
          if (index === 0) multiplier = 0.0; // 1st place: 100%
          else if (index === 1) multiplier = 0.1; // 2nd place: 110%
          else if (index === 2) multiplier = 0.2; // 3rd place: 120%
          else if (index >= 3 && index <= 9) multiplier = 0.4; // 4th~10th: 140%
          else if (index >= 10 && index <= 19) multiplier = 0.8; // 11th~20th: 180%
          else multiplier = 1.0; // others: 200%
          
          if (multiplier > 0) {
            const baseForce = ball.mass * pbEngine.gravity.y * pbEngine.gravity.scale;
            Matter.Body.applyForce(ball, ball.position, { x: 0, y: baseForce * multiplier });
          }
        });
      }
    }
    
    // Rotary plates
    if (pbEngine && pbEngine.world) {
      pbEngine.world.bodies.forEach(b => {
        if (b.plugin && b.plugin.isRotary) {
          Matter.Body.setAngle(b, b.angle + 0.05);
        }
      });
    }
    
    if (pbState.status === 'playing' && window.pinballRaceStarted) {
      // Only check stuck balls during actual race
      Object.values(pbBalls).forEach(ball => {
        // Apply constant downward push to simulate steep track (+30% speed)
        Matter.Body.applyForce(ball, ball.position, { x: 0, y: 0.0006 });
        
        if (ball.speed < 0.5) {
          ball.plugin.stuckFrames = (ball.plugin.stuckFrames || 0) + 1;
          if (ball.plugin.stuckFrames > 40) {
            const nudgeX = ((ball.plugin.num || 1) % 2 === 0) ? 3.0 : -3.0;
            Matter.Body.setVelocity(ball, {
              x: nudgeX,
              y: -2.0
            });
            ball.plugin.stuckFrames = 0;
          }
        } else {
          ball.plugin.stuckFrames = 0;
        }
      });
    } else {
      // In lobby/instruction, enforce boundaries so they can't drag balls beyond the gate or off-screen
      Object.values(pbBalls).forEach(ball => {
        let { x, y } = ball.position;
        let clamped = false;
        
        if (y > START_Y - 20) { y = START_Y - 20; clamped = true; }
        if (y < 20) { y = 20; clamped = true; }
        if (x < 20) { x = 20; clamped = true; }
        if (x > LOGICAL_WIDTH - 20) { x = LOGICAL_WIDTH - 20; clamped = true; }
        
        if (clamped) {
          Matter.Body.setPosition(ball, { x, y });
          Matter.Body.setVelocity(ball, { x: 0, y: 0 });
          // Prevent players from overpowering the clamp by holding the mouse: drop the ball!
          if (typeof pbMouseConstraint !== 'undefined' && pbMouseConstraint && pbMouseConstraint.body === ball) {
            pbMouseConstraint.body = null;
            if (pbMouseConstraint.constraint) pbMouseConstraint.constraint.bodyB = null;
          }
        }
      });
    }
  });

  // Camera tracking
  Events.on(pbRender, 'beforeRender', () => {
    // Windmill rotation and leaderboard update (since we have no local physics runner)
    updateDynamicLeaderboard();
    if (pbEngine && pbEngine.world) {
      pbEngine.world.bodies.forEach(b => {
        if (b.plugin && b.plugin.isRotary) {
          Matter.Body.setAngle(b, b.angle + 0.05);
        }
      });
    }

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

    const cameraMode = window.pinballCameraMode || 'self';
    let target = sorted[Math.min(cameraTargetIdx, sorted.length - 1)];
    const myName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.displayName : null;
    if (cameraMode === 'self' && myName && pbBalls[myName] && !pbState.finished.includes(myName)) {
      target = pbBalls[myName];
    } else {
      // 'global' mode: Follow 1st place leader at the front of the race
      target = sorted[0];
    }
    const targetY = target.position.y - canvasHeight * 0.35 * (LOGICAL_WIDTH / canvasWidth);
    
    // Smooth Lerp
    cameraSmoothed += (targetY - cameraSmoothed) * 0.06;

    // Clamp
    const minY = 0;
    const maxY = pbWorldHeight - (canvasHeight * (LOGICAL_WIDTH / canvasWidth)) + 100;
    const clampedY = Math.max(minY, Math.min(maxY, cameraSmoothed));

    pbRender.bounds.min.y = clampedY;
    pbRender.bounds.max.y = clampedY + (canvasHeight * (LOGICAL_WIDTH / canvasWidth));
  });

  // Custom rendering: Road surface, arrows, billiard balls
  Events.on(pbRender, 'afterRender', () => {
    const ctx = pbRender.context;
    const bMinY = pbRender.bounds.min.y;
    const bMaxY = pbRender.bounds.max.y;
    const bMinX = pbRender.bounds.min.x;
    const bW = pbRender.bounds.max.x - bMinX;
    const bH = bMaxY - bMinY;
    const scaleX = canvasWidth / bW;
    const scaleY = canvasHeight / bH;

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
        if (sp.y > -50 && sp.y < canvasHeight + 50) {
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
    const startSp = toScreen(LOGICAL_WIDTH / 2, START_Y);
    if (startGateBody && startSp.y > -100 && startSp.y < canvasHeight + 100) {
      drawCheckerboard(ctx, startSp.x, startSp.y, LOGICAL_WIDTH, 20 * scaleY);
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${24 * scaleY}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('START', startSp.x, startSp.y + 25 * scaleY); // Draw below the gate so balls don't cover it
      ctx.shadowBlur = 0;
    }

    
      // Draw Obstacles (on top of the road)
      trackObstacles.forEach(body => {
        if (!body.vertices || body.vertices.length === 0) return;
        ctx.beginPath();
        body.vertices.forEach((v, idx) => {
          const sp = toScreen(v.x, v.y);
          if (idx === 0) ctx.moveTo(sp.x, sp.y);
          else ctx.lineTo(sp.x, sp.y);
        });
        ctx.closePath();
        ctx.fillStyle = body.render.fillStyle;
        ctx.strokeStyle = body.render.strokeStyle;
        ctx.lineWidth = (body.render.lineWidth || 2) * scaleX;
        ctx.fill();
        if (body.render.strokeStyle) ctx.stroke();
      });

      // 3. Finish Line Checkerboard

    if (trackPathPoints.length > 0) {
      const finalY = trackPathPoints[trackPathPoints.length - 1].y;
      const finishSp = toScreen(LOGICAL_WIDTH / 2, finalY + 40);
      if (finishSp.y > -100 && finishSp.y < canvasHeight + 100) {
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
      if (sp.y < -30 || sp.y > canvasHeight + 30) return;

      const r = b.circleRadius * scaleX;
      
      // Draw glowing aura for player's own ball
      const myName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.displayName : null;
      if (b.plugin.name === myName) {
        const pulse = 2.0 + Math.sin(Date.now() / 100) * 0.5; // larger pulse
        ctx.fillStyle = 'rgba(255, 255, 0, 0.6)';
        ctx.shadowColor = '#ffff00';
        ctx.shadowBlur = 30;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, r * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0; // reset
        
        // Draw an arrow pointing down to it
        ctx.fillStyle = '#ffeb3b';
        ctx.beginPath();
        const arrowY = sp.y - r * 2 - 15 + Math.sin(Date.now()/150)*8;
        ctx.moveTo(sp.x, arrowY);
        ctx.lineTo(sp.x - 12, arrowY - 20);
        ctx.lineTo(sp.x + 12, arrowY - 20);
        ctx.closePath();
        ctx.fill();
      }

      // Ball shadow
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.arc(sp.x + 3, sp.y + 3, r, 0, Math.PI * 2);
      ctx.fill();

      // Custom style rendering
        const style = (b.plugin && b.plugin.style) ? b.plugin.style : 'solid';
        
        ctx.save();
        ctx.translate(sp.x, sp.y);
        ctx.rotate(b.angle);

        if (style === 'solid') {
          ctx.fillStyle = b.render.fillStyle;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fill();
        } else if (style === 'billiard') {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.fillStyle = b.render.fillStyle;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.clip();
          ctx.fillRect(-r, -r*0.5, r * 2, r);
        } else if (style === 'gradient') {
          const grad = ctx.createRadialGradient(-r*0.3, -r*0.3, r*0.1, 0, 0, r);
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.3, b.render.fillStyle);
          grad.addColorStop(1, '#000000');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();

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
      // 超管控制寮重新顯示
      const roomAdminPanel = document.getElementById('room-admin-panel');
      if (roomAdminPanel) roomAdminPanel.style.display = '';
    });
  }

  // 超管：Pinball「再來一場」按鈕
  const btnPinballPlayAgain = document.getElementById('btn-pinball-play-again');
  if (btnPinballPlayAgain && !btnPinballPlayAgain.hasListener) {
    btnPinballPlayAgain.hasListener = true;
    btnPinballPlayAgain.addEventListener('click', async () => {
      btnPinballPlayAgain.disabled = true;
      const uid = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.userId : null;
      if (!uid) return;
      try {
        await fetch('/api/admin/pinball/next-round', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid })
        });
        
        document.getElementById('pinball-score-popup').classList.add('hidden');
        // 超管控制寮重新顯示
        const roomAdminPanel = document.getElementById('room-admin-panel');
        if (roomAdminPanel) roomAdminPanel.style.display = '';
      } catch(e) {
        console.error(e);
      } finally {
        btnPinballPlayAgain.disabled = false;
      }
    });
  }

  // 超管：Pinball「結束比賽」按鈕
  const btnPinballEndSummary = document.getElementById('btn-pinball-end-summary');
  if (btnPinballEndSummary && !btnPinballEndSummary.hasListener) {
    btnPinballEndSummary.hasListener = true;
    btnPinballEndSummary.addEventListener('click', async () => {
      btnPinballEndSummary.disabled = true;
      const uid = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.userId : null;
      if (!uid) return;
      try {
        await fetch('/api/admin/room/close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid })
        });
        document.getElementById('pinball-score-popup').classList.add('hidden');
      } catch(e) {
        console.error(e);
        btnPinballEndSummary.disabled = false;
      }
    });
  }

  Render.run(pbRender);
  pbRunner = Runner.create();
  Runner.run(pbRunner, pbEngine);

  // Stop and clean up any previous web worker
  if (window._pbWorker) {
    window._pbWorker.postMessage('stop');
    window._pbWorker.terminate();
    window._pbWorker = null;
  }

  // Setup Mouse Constraint for dragging
  const { Mouse, MouseConstraint } = Matter;
  const mouse = Mouse.create(pbRender.canvas);
  pbMouseConstraint = MouseConstraint.create(pbEngine, {
    mouse: mouse,
    constraint: { stiffness: 0.2, render: { visible: false } }
  });
  
  if (pbState.status !== 'playing' || !window.pinballRaceStarted) {
    World.add(pbEngine.world, pbMouseConstraint);
  }

  // Continuously enforce mouse constraints to prevent frame-by-frame dragging glitches
  // Registered here so it runs AFTER MouseConstraint's internal beforeUpdate
  Events.on(pbEngine, 'beforeUpdate', () => {
    if (typeof pbMouseConstraint !== 'undefined' && pbMouseConstraint && pbMouseConstraint.body) {
      const body = pbMouseConstraint.body;
      let shouldDrop = false;
      if (pbState.status === 'playing') {
        shouldDrop = true;
      } else if (body.plugin && body.plugin.isBall) {
        const myName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.displayName : null;
        const isAdmin = (typeof globalIsSuperAdmin !== 'undefined' && globalIsSuperAdmin);
        if (!isAdmin && body.plugin.name !== myName) {
          shouldDrop = true;
        }
      } else {
        shouldDrop = true;
      }
      
      if (shouldDrop) {
        pbMouseConstraint.body = null;
        if (pbMouseConstraint.constraint) pbMouseConstraint.constraint.bodyB = null;
      }
    }
  });

  // Filter mouse interactions (only allow dragging own ball in lobby/instruction)
  Events.on(pbMouseConstraint, 'mousedown', (event) => {
    const drop = () => {
      pbMouseConstraint.body = null;
      if (pbMouseConstraint.constraint) pbMouseConstraint.constraint.bodyB = null;
    };
    if (pbState.status === 'playing') {
      drop(); // Deny drag if racing or during countdown!
      return;
    }
    const body = pbMouseConstraint.body;
    if (body) {
      if (!body.plugin || !body.plugin.isBall) {
        drop(); // Only balls are draggable
        return;
      }
      const myName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.displayName : null;
      const isAdmin = (typeof globalIsSuperAdmin !== 'undefined' && globalIsSuperAdmin);
      if (!isAdmin && body.plugin.name !== myName) {
        drop(); // Deny dragging someone else's ball
      }
    }
  });

  // Sync position on drag continuously
  let lastMoveTime = 0;
  Events.on(pbMouseConstraint, 'mousemove', (event) => {
    if (pbMouseConstraint && pbMouseConstraint.body && pbMouseConstraint.body.plugin && pbMouseConstraint.body.plugin.isBall) {
      const myName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.displayName : null;
      if (pbMouseConstraint.body.plugin.name === myName) {
        const now = Date.now();
        if (now - lastMoveTime > 30) {
          if (typeof pinballSocket !== 'undefined') {
            pinballSocket.emit('pinball_move_ball', {
              name: myName,
              x: pbMouseConstraint.body.position.x,
              y: pbMouseConstraint.body.position.y
            });
          }
          lastMoveTime = now;
        }
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
  
  if (!window._pbKeydownBound) {
    window._pbKeydownBound = true;
    document.addEventListener('keydown', (event) => {
      if (typeof pbState !== 'undefined' && pbState.status === 'playing') {
        const myName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.displayName : null;
        if (!myName || typeof pbBalls === 'undefined' || !pbBalls[myName]) return;
        
        const ball = pbBalls[myName];
        let fx = 0;
        let fy = 0;
        const FORCE_AMT = 0.015;
        if (event.key === 'ArrowLeft') fx = -FORCE_AMT;
        else if (event.key === 'ArrowRight') fx = FORCE_AMT;
        else if (event.key === 'ArrowUp') fy = -FORCE_AMT;
        else if (event.key === 'ArrowDown') fy = FORCE_AMT;
        
        if (fx !== 0 || fy !== 0) {
          Matter.Body.applyForce(ball, ball.position, { x: fx, y: fy });
          if (typeof pinballSocket !== 'undefined') {
            pinballSocket.emit('pinball_apply_force', { name: myName, fx: fx, fy: fy });
          }
        }
      }
    });
  }

  console.log('[Pinball] Top-down track engine started');
}

function buildTopDownTrack(W) {
  if (typeof pbState !== 'undefined' && pbState && pbState.seed) {
    setSeed(pbState.seed);
  } else {
    setSeed(12345);
  }
  const { Bodies } = Matter;
  const bodies = [];
  const pathPoints = [];
  
  const steps = 600; // Increased resolution for massive track
  const maxT = Math.PI * 14; // 7 full S-curves
  
  // Calculate amplitude to reach exactly near the left/right screen edges
  const maxSafeAmplitude = (W / 2) - 150 - 20; // 150 is approx wall offset, 20 is padding
  const amplitude = Math.max(50, maxSafeAmplitude);
  
  // Dynamically calculate stretch to guarantee mathematically safe radius of curvature
  // Radius of curvature R = stretch^2 / amplitude. We need R > 150 to avoid wall self-intersection loops.
  const stretch = Math.max(180, Math.sqrt(amplitude * 160));

  let currentY = START_Y + 10; // Track generation starts below the gate
  
  // Create Smooth Wide Y-Shape Funnel to guide all balls effortlessly into track
  const funnelHeight = 350;
  const funnelSteps = 35;
  const topLeftX = -150; // Spans far beyond screen left
  const topRightX = W + 150; // Spans far beyond screen right
  const targetLeftX = W / 2 - TRACK_WIDTH / 2;
  const targetRightX = W / 2 + TRACK_WIDTH / 2;

  for (let i = 0; i <= funnelSteps; i++) {
    const t = i / funnelSteps;
    // Smooth quadratic curve for natural Y-funnel slope (\  /)
    const easeT = Math.pow(t, 1.3);
    const fy = currentY + t * funnelHeight;
    const flX = topLeftX + easeT * (targetLeftX - topLeftX);
    const frX = topRightX + easeT * (targetRightX - topRightX);
    
    bodies.push(Bodies.circle(flX - 30, fy, 40, { isStatic: true, friction: 0.0, restitution: 0.2, render: { fillStyle: '#bdc3c7', strokeStyle: '#95a5a6', lineWidth: 1 } }));
    bodies.push(Bodies.circle(frX + 30, fy, 40, { isStatic: true, friction: 0.0, restitution: 0.2, render: { fillStyle: '#bdc3c7', strokeStyle: '#95a5a6', lineWidth: 1 } }));
  }

  currentY += funnelHeight;
  
  // Start track points exactly at funnel exit
  for(let y = currentY; y < currentY + 100; y += 20) {
    pathPoints.push({ x: W/2, y: y });
  }
  currentY += 100;

  // Randomize track shape using sum of sines
  const phase1 = seededRandom() * Math.PI * 2;
  const phase2 = seededRandom() * Math.PI * 2;
  const phase3 = seededRandom() * Math.PI * 2;
  
  const freq1 = 0.8;
  const freq2 = 1.1 + seededRandom() * 0.3; // max 1.4 (Lowered from 2.2 to prevent cusps)
  const freq3 = 0.4 + seededRandom() * 0.2; // max 0.6
  
  // Weights for each sine wave component (sum to ~1.0)
  const w1 = 0.5 + seededRandom() * 0.2;
  const w2 = 0.15 + seededRandom() * 0.15;
  const w3 = 1.0 - w1 - w2;

  const trackWaveStartY = currentY;

  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * maxT;
    
    // Mathematical envelope to force the sine wave to start and end EXACTLY at 0 offset
    // This absolutely prevents any horizontal jumps or gaps from forming in the track wall
    let env = 1.0;
    const fadeLen = Math.PI * 2; // Fade over 1 full S-curve
    if (t < fadeLen) {
      env = (1 - Math.cos((t / fadeLen) * Math.PI)) / 2;
    } else if (maxT - t < fadeLen) {
      env = (1 - Math.cos(((maxT - t) / fadeLen) * Math.PI)) / 2;
    }
    
    const xOffset = env * amplitude * (
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
  for(let i = 0; i < 15; i++) {
    currentY += 20;
    pathPoints.push({ x: W/2, y: currentY });
  }

  // Build physical guardrails along the path
  const wallThickness = 120; // Increased drastically to prevent high-speed tunneling ejections
  const wallOffset = (TRACK_WIDTH / 2) + (wallThickness / 2) - 2; // Perfectly align inner edge
  
  for (let i = 0; i < pathPoints.length; i++) {
    const p1 = pathPoints[i];
    
    let nx, ny;
    if (i < pathPoints.length - 1) {
      const p2 = pathPoints[i+1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.sqrt(dx*dx + dy*dy);
      nx = -dy / len;
      ny = dx / len;
    } else {
      const p0 = pathPoints[i-1];
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.sqrt(dx*dx + dy*dy);
      nx = -dy / len;
      ny = dx / len;
    }
    
    const leftX = p1.x + nx * wallOffset;
    const leftY = p1.y + ny * wallOffset;
    const rightX = p1.x - nx * wallOffset;
    const rightY = p1.y - ny * wallOffset;
    
    // Matter.js track walls built using overlapping circles to avoid ANY sharp edges or broken chamfering
    bodies.push(Bodies.circle(leftX, leftY, wallThickness / 2, {
      isStatic: true,
      friction: 0.0,
      restitution: 0.2, // Less bouncy so they don't jump the wall
      render: { fillStyle: '#bdc3c7', strokeStyle: '#bdc3c7', lineWidth: 1 }
    }));

    bodies.push(Bodies.circle(rightX, rightY, wallThickness / 2, {
      isStatic: true,
      friction: 0.0,
      restitution: 0.2,
      render: { fillStyle: '#bdc3c7', strokeStyle: '#bdc3c7', lineWidth: 1 }
    }));
  }

  // Top blocking wall removed as it interfered with the open lobby
  return { bodies, pathPoints, finalY: pathPoints[pathPoints.length-1].y };
}

function drawCheckerboard(ctx, x, y, width, height) {
  const sq = 10;
  // Round width and height to nearest integer to avoid floating point loop boundary flickering
  const w = Math.round(width);
  const h = Math.round(height);
  ctx.save();
  ctx.translate(x - w/2, y - h/2);
  for (let i = 0; i < w; i += sq) {
    for (let j = 0; j < h; j += sq) {
      // Use Math.round to ensure exact integer division
      const col = Math.round(i/sq);
      const row = Math.round(j/sq);
      ctx.fillStyle = ((col + row) % 2 === 0) ? '#fff' : '#000';
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
    
    let scoreText = '';
    if (pbState.scores && pbState.scores[b.plugin.name] > 0) {
      scoreText = ` <span style="color:#f1c40f;">(${pbState.scores[b.plugin.name]}分)</span>`;
    }
    
    li.innerHTML = `<span>${rankStr} ${dName}${scoreText}</span>`;
    dynList.appendChild(li);
    lastIdx = idx;
  });
}

function syncBalls(state) {
  if (!pbEngine) return;
  const { World, Bodies } = Matter;

  // Match server spacing
  const spacingX = 40;
  const poolLen = state.pool.length;
  const startXOffset = LOGICAL_WIDTH / 2 - (Math.min(poolLen, 15) * spacingX) / 2 + 20;
  
  const poolSet = new Set(state.pool);

  // Remove balls not in pool anymore
  Object.keys(pbBalls).forEach(name => {
    if (!poolSet.has(name)) {
      World.remove(pbEngine.world, pbBalls[name]);
      delete pbBalls[name];
    }
  });

  // Sort pool alphabetically to guarantee 100% identical starting grid on all devices
  const sortedPool = [...state.pool].sort();
  
  sortedPool.forEach((name, idx) => {
    const color = (state.colors && state.colors[name]) ? state.colors[name] : POOL_COLORS[idx % POOL_COLORS.length];
    const rRow = Math.floor(idx / 15);
    const cCol = idx % 15;
    const gridX = startXOffset + cCol * spacingX;
    const gridY = START_Y - 17 - (rRow * 30);
    
    if (!pbBalls[name]) {
      const num = (idx % 15) + 1;
      const ball = Bodies.circle(gridX, gridY, MARBLE_RADIUS, {
        restitution: 0.6,
        friction: 0.005,
        density: 0.05,
        render: { fillStyle: color },
        plugin: { isBall: true, name: name, num: num, stuckFrames: 0 }
      });

      pbBalls[name] = ball;
      ball.plugin.style = (state.styles && state.styles[name]) ? state.styles[name] : 'solid';
      ball.render.visible = false;
      World.add(pbEngine.world, ball);
    } else {
      pbBalls[name].render.fillStyle = color;
      pbBalls[name].plugin.style = (state.styles && state.styles[name]) ? state.styles[name] : 'solid';
      pbBalls[name].render.visible = false;
    }
  });
}

function startRace() {
  window.pinballRaceStarted = true;
  if (!pbEngine) return;
  pbEngine.gravity.y = 1.1; // Increased by 30%+ for thrilling speed
  
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
  window.pinballSocket = s;
  s.on('pinball_server_sync', (syncData) => {
    // Pure 60 FPS local physics during race to eliminate mobile rubberbanding & replay completely
    if (!pbBalls || !pbState || pbState.status === 'idle' || pbState.status === 'playing') return;
    Object.keys(syncData).forEach(name => {
      if (pbBalls[name]) {
        const sd = syncData[name];
        if (sd && typeof sd.x === 'number' && typeof sd.y === 'number') {
          const b = pbBalls[name];
          const dx = sd.x - b.position.x;
          const dy = sd.y - b.position.y;
          const distSq = dx * dx + dy * dy;
          if (distSq > 4000) {
            // Teleport if huge displacement
            Matter.Body.setPosition(b, { x: sd.x, y: sd.y });
          } else if (distSq > 9) {
            // Smooth 15% LERP: 0 rubberband, zero stutter, 100% perfect multi-device sync!
            Matter.Body.setPosition(b, {
              x: b.position.x + dx * 0.15,
              y: b.position.y + dy * 0.15
            });
          }
        }
      }
    });
  });

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

  s.on('pinball_apply_force', (data) => {
    const { name, fx, fy } = data;
    const myName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.displayName : null;
    if (name !== myName && pbBalls && pbBalls[name]) {
      Matter.Body.applyForce(pbBalls[name], pbBalls[name].position, { x: fx || 0, y: fy || 0 });
    }
  });

  s.on('pinball_shake', () => {
    if (pbEngine && pbBalls) {
      if (typeof globalIsSuperAdmin !== 'undefined' && globalIsSuperAdmin) {
        Object.values(pbBalls).forEach(ball => {
          Matter.Body.applyForce(ball, ball.position, {
            x: (Math.random() - 0.5) * 0.05,
            y: -0.05
          });
        });
      }

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
      if (state.seed) setSeed(state.seed);

    if (state.status === 'idle') {
      // Room was closed or reset, completely tear down pinball UI
      window.pinballRaceStarted = false;
      if (window.pinballTimerInterval) clearInterval(window.pinballTimerInterval);
      const countdownEl = document.getElementById('pinball-countdown');
      if (countdownEl && countdownEl.timer) {
        clearInterval(countdownEl.timer);
        countdownEl.timer = null;
      }
      if (window.pinballSyncInterval) clearInterval(window.pinballSyncInterval);
      window._pbSyncLoopRunning = false;
      window._pbSyncTargets = {};

      const instrOverlay = document.getElementById('pinball-instruction-overlay');
      if (instrOverlay) {
        instrOverlay.classList.add('hidden');
        instrOverlay.style.display = 'none';
      }
      if (typeof unifiedRoomOverlay !== 'undefined' && unifiedRoomOverlay) {
        unifiedRoomOverlay.classList.add('hidden');
      }

      destroyEngine(); // Ensure physics and renderer are fully cleared
      return; // Stop processing further state
    }

    if (state.status === 'lobby' || state.status === 'instruction') {
      window.pinballRaceStarted = false;
      if (pbEngine && !startGateBody) {
        startGateBody = Matter.Bodies.rectangle(LOGICAL_WIDTH / 2, START_Y + 95, LOGICAL_WIDTH * 2, 200, {
          isStatic: true,
          render: { visible: false },
          plugin: { isStartGate: true }
        });
        Matter.World.add(pbEngine.world, startGateBody);
      }
    }

    if (!pinballStatusOverlay) pinballStatusOverlay = document.getElementById('pinball-status-overlay');
    if (!pinballStatusText) pinballStatusText = document.getElementById('pinball-status-text');
    if (!pinballStatusTimer) pinballStatusTimer = document.getElementById('pinball-status-timer');
    if (!pinballSpectatorUi) pinballSpectatorUi = document.getElementById('pinball-spectator-ui');
    if (!pinballContainer) pinballContainer = document.getElementById('pinball-container');
    if (!pinballCanvasWrapper) pinballCanvasWrapper = document.getElementById('pinball-canvas-wrapper');

    // Color picker close button
    const btnCloseColorPicker = document.getElementById('btn-close-color-picker');
    if (btnCloseColorPicker && !btnCloseColorPicker._bound) {
      btnCloseColorPicker._bound = true;
      btnCloseColorPicker.addEventListener('click', () => {
        const colorUi = document.getElementById('pinball-color-picker-ui');
        if (colorUi) colorUi.classList.add('hidden');
        hasSelectedPinballColor = true; // Prevent auto-reopening
      });
    }

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

    // Ensure score popup is hidden when in lobby or instruction state
    const scorePopup = document.getElementById('pinball-score-popup');
    if (scorePopup && state.status !== 'playing' && state.status !== 'finished') {
      scorePopup.classList.add('hidden');
    }

    if ((state.seed && state.seed !== window._lastTrackSeed) || (!pbEngine && state.status !== 'idle')) {
      window._lastTrackSeed = state.seed;
      initPinballEngine();
    }

    if (state.status === 'idle') { window.pinballRaceStarted = false; hasSelectedPinballColor = false; }

    if (state.status === 'lobby') {
      window.pinballRaceStarted = false;
      if (roomAdminPanel) roomAdminPanel.style.display = '';
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
          const myName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.displayName : null;
          const btnJoinPinball = document.getElementById('btn-join-pinball');
          if (myName) {
            if (!state.pool.includes(myName)) {
               pinballSpectatorUi.classList.add('hidden');
               if (btnJoinPinball) {
                 btnJoinPinball.classList.remove('hidden');
                 btnJoinPinball.innerText = '🙋‍♂️ 報名參加';
                 btnJoinPinball.onclick = () => {
                   hasSelectedPinballColor = false;
                   const colorUi = document.getElementById('pinball-color-picker-ui');
                   if (colorUi) colorUi.classList.remove('hidden');
                 };
               }
            } else {
               pinballSpectatorUi.classList.remove('hidden');
               pinballSpectatorUi.innerText = '等待遊戲開始...';
               if (btnJoinPinball) {
                 btnJoinPinball.classList.remove('hidden');
                 btnJoinPinball.innerText = '🎨 修改顏色';
                 btnJoinPinball.onclick = () => {
                   hasSelectedPinballColor = false;
                   const colorUi = document.getElementById('pinball-color-picker-ui');
                   if (colorUi) colorUi.classList.remove('hidden');
                 };
               }
            }
          } else {
            // Not logged into LIFF (e.g. testing on desktop browser)
            pinballSpectatorUi.classList.add('hidden');
            if (btnJoinPinball) {
              btnJoinPinball.classList.remove('hidden');
              btnJoinPinball.innerText = '🙋‍♂️ 訪客報名 (測試)';
              btnJoinPinball.onclick = () => {
                const guestName = prompt("您目前未登入，請輸入測試暱稱:");
                if (guestName && guestName.trim() !== '') {
                  // Mock the currentUser so subsequent renders treat this browser as this guest user
                  window.currentUser = { displayName: guestName.trim(), name: guestName.trim(), userId: 'guest_' + Math.floor(Math.random()*1000) };
                  if (window.pinballSocket) { 
                    window.pinballSocket.emit('join_pinball', { name: guestName.trim() }); 
                  } else { 
                    alert('Socket not found!'); 
                  }
                }
              };
            }
          }
        }
      
      // Color Picker UI logic
      const colorUi = document.getElementById('pinball-color-picker-ui');
      const myName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.displayName : null;
      // Color Picker UI logic (auto-popup removed, now purely driven by user clicks)
      // Always destroy engine on returning to lobby from playing so the track regenerates
      if (prevStatus === 'playing' && pbEngine) {
        destroyEngine();
        
        // Immediately rebuild with new terrain
        initPinballEngine();
      }
      
      syncBalls(state);
    } else if (state.status === 'instruction') {
      window.pinballRaceStarted = false;
      const colorUi = document.getElementById('pinball-color-picker-ui');
      if (colorUi) colorUi.classList.add('hidden');
      if (prevStatus === 'playing' && pbEngine) {
        // Destroy old engine and reset track for next round
        destroyEngine();
        
        initPinballEngine();
      }

      if (roomAdminPanel) roomAdminPanel.style.display = 'none';
      if (roomParticipantsPanel) roomParticipantsPanel.style.display = 'none';
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
        }, 20);
      }

      syncBalls(state);

    } else if (state.status === 'playing') {
      if (typeof pbMouseConstraint !== 'undefined' && pbMouseConstraint) {
        pbMouseConstraint.body = null; // Force drop any ball held from the lobby
      }
      const colorUi = document.getElementById('pinball-color-picker-ui');
      if (colorUi) colorUi.classList.add('hidden');
      if (window.pinballTimerInterval) clearInterval(window.pinballTimerInterval);

      const instrOverlay = document.getElementById('pinball-instruction-overlay');
      if (instrOverlay) {
        instrOverlay.classList.add('hidden');
        instrOverlay.style.display = 'none';
      }

      if (roomAdminPanel) roomAdminPanel.style.display = 'none';
      if (roomParticipantsPanel) roomParticipantsPanel.style.display = 'none';
      if (dynBoard) dynBoard.classList.remove('hidden');

        if (pinballSpectatorUi) pinballSpectatorUi.classList.add('hidden');
        const btnJoinPinball = document.getElementById('btn-join-pinball');
        if (btnJoinPinball) btnJoinPinball.classList.add('hidden');

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

      // Only init engine once when we first enter playing state, not on every state sync
      if (!pbEngine) {
        initPinballEngine();
      }
      syncBalls(state);

      if (prevStatus === 'instruction' || prevStatus === 'lobby' || prevStatus === 'idle') {
        const countdownEl = document.getElementById('pinball-countdown');
        if (countdownEl) {
          countdownEl.classList.remove('hidden');
          
          let count = 5;
          countdownEl.innerText = count.toString();
          countdownEl.style.fontSize = 'min(240px, 48vw)';
          
          if (countdownEl.timer) clearInterval(countdownEl.timer);
          countdownEl.timer = setInterval(() => {
            count--;
            if (count > 0) {
              countdownEl.innerText = count.toString();
            } else {
              clearInterval(countdownEl.timer);
              countdownEl.timer = null;
              countdownEl.innerText = 'GO!';
              setTimeout(() => countdownEl.classList.add('hidden'), 1500);
              startRace();
            }
          }, 1000);
        } else {
          startRace();
        }
      } else if (pbEngine && !window.pinballRaceStarted) {
        // Keep startGate in place while waiting for countdown to finish
      }

      // Winner announcement ONLY when all players have finished the race
      if (state.finished.length > 0 && state.pool && state.finished.length >= state.pool.length) {
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
          
          // 超管顯示「再來一場/結束比賽」按鈕組，一般使用者顯示等待文字
          const superadminActions = document.getElementById('pinball-superadmin-actions');
          const waitingText = document.getElementById('pinball-waiting-admin-text');
          const closeBtn = document.getElementById('btn-pinball-close-popup');
          
          if (typeof globalIsSuperAdmin !== 'undefined' && globalIsSuperAdmin) {
            if (superadminActions) {
              superadminActions.style.display = 'flex';
              superadminActions.classList.remove('hidden');
            }
            if (waitingText) waitingText.classList.add('hidden');
            if (closeBtn) closeBtn.classList.remove('hidden');
          } else {
            if (superadminActions) superadminActions.classList.add('hidden');
            if (waitingText) waitingText.classList.remove('hidden');
            if (closeBtn) closeBtn.classList.add('hidden');
          }
        }
      }
    } else if (state.status === 'finished' || (state.finished && state.pool && state.finished.length >= state.pool.length)) {
      // Show score popup ONLY when the last player crosses the finish line
      const popup = document.getElementById('pinball-score-popup');
      const scoreList = document.getElementById('pinball-score-list');
      if (popup && scoreList && state.finished && state.pool && state.finished.length >= state.pool.length) {
        scoreList.innerHTML = '';
        const scores = state.scores || {};
        const sortedPlayers = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
        
        sortedPlayers.forEach((p, i) => {
          const li = document.createElement('li');
          li.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
          li.style.display = 'flex';
          li.style.justifyContent = 'space-between';
          li.style.padding = '8px 0';
          const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
          li.innerHTML = `<span>${rank} ${p}</span> <span style="color:#f1c40f; font-weight:bold;">${scores[p]} 分</span>`;
          scoreList.appendChild(li);
        });
        popup.classList.remove('hidden');
        popup.style.display = 'flex';
        
        const superadminActions = document.getElementById('pinball-superadmin-actions');
        const waitingText = document.getElementById('pinball-waiting-admin-text');
        const closeBtn = document.getElementById('btn-pinball-close-popup');
        
        const isAdmin = (typeof globalIsSuperAdmin !== 'undefined' && globalIsSuperAdmin);
        if (isAdmin) {
          if (superadminActions) {
            superadminActions.style.display = 'flex';
            superadminActions.classList.remove('hidden');
          }
          if (waitingText) waitingText.classList.add('hidden');
          if (closeBtn) closeBtn.classList.remove('hidden');
        } else {
          if (superadminActions) superadminActions.classList.add('hidden');
          if (waitingText) waitingText.classList.remove('hidden');
          if (closeBtn) closeBtn.classList.add('hidden');
        }
      }
    } else {
      if (pinballSpectatorUi) pinballSpectatorUi.classList.add('hidden');
      if (dynBoard) dynBoard.classList.add('hidden');
      const btnShake = document.getElementById('btn-pinball-shake');
      if (btnShake) btnShake.classList.add('hidden');
      }
      
      const dpad = document.getElementById('pinball-dpad');
      const dpadName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.displayName : null;
      if (dpad) {
        if ((state.status === 'instruction' || (state.status === 'playing' && state.allowControls)) && dpadName && state.pool.includes(dpadName)) {
          dpad.classList.remove('hidden');
          if (!dpad.hasListener) {
            dpad.hasListener = true;
            dpad.querySelectorAll('.btn-dpad').forEach(btn => {
              btn.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                const currentName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.displayName : null;
                // Only players in the pool can push (check at click-time to avoid stale closure)
                if (!currentName || typeof pbState === 'undefined' || !pbState || !pbState.pool.includes(currentName)) return;
                // If the player has already finished the race, lock their controls
                if (pbState.finished && pbState.finished.includes(currentName)) return;

                const dir = e.currentTarget.getAttribute('data-dir');
                let fx = 0, fy = 0;
                const forceAmount = 0.075;
                const forceUp = forceAmount * 3.0; // Upward force +200% compared to base
                if (dir === 'up') fy = -forceUp;
                if (dir === 'down') fy = forceAmount;
                if (dir === 'left') fx = -forceAmount;
                if (dir === 'right') fx = forceAmount;
                
                console.log('[DPAD] pressed', dir, 'name=', currentName, 'ball=', pbBalls ? !!pbBalls[currentName] : 'pbBalls null');

                if (typeof pbBalls !== 'undefined' && pbBalls[currentName]) {
                  Matter.Body.applyForce(pbBalls[currentName], pbBalls[currentName].position, { x: fx, y: fy });
                  console.log('[DPAD] force applied locally');
                }
                
                if (window.pinballSocket) {
                  window.pinballSocket.emit('pinball_apply_force', { name: currentName, fx: fx, fy: fy });
                  console.log('[DPAD] socket emitted');
                }
              });
            });
          }
        } else {
          dpad.classList.add('hidden');
        }
      }
  
      const cameraToggle = document.getElementById('pinball-camera-toggle');
      if (cameraToggle) {
        if (state.status === 'playing' || state.status === 'instruction') {
          cameraToggle.classList.remove('hidden');
          if (!cameraToggle.hasListener) {
            cameraToggle.hasListener = true;
            window.pinballCameraMode = 'self'; // default
            const txt = document.getElementById('pinball-camera-text');
            if (txt) txt.innerText = '自己';
            cameraToggle.addEventListener('click', () => {
              window.pinballCameraMode = (window.pinballCameraMode === 'self') ? 'global' : 'self';
              if (txt) {
                txt.innerText = (window.pinballCameraMode === 'global') ? '全局' : '自己';
              }
            });
          }
        } else {
          cameraToggle.classList.add('hidden');
        }
      }
  });
}


  // --- G-Sensor (DeviceOrientation) support ---
  let lastForceEmit = 0;
  window.addEventListener('deviceorientation', (event) => {
    if (!window.pinballRaceStarted || pbState.status !== 'playing' || !pbBalls || !pbEngine) return;
    const myName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.displayName : null;
    const myBall = myName ? pbBalls[myName] : null;
    
    if (myBall && event.gamma !== null) {
      // gamma is left-to-right tilt in degrees (-90 to 90)
      let tilt = event.gamma;
      
      // Ignore very small tilts to avoid jitter
      if (Math.abs(tilt) < 5) return;
      
      if (tilt > 30) tilt = 30;
      if (tilt < -30) tilt = -30;
      
      // Calculate small horizontal force
      const forceX = (tilt / 30) * 0.0015; 
      
      // Apply locally
      Matter.Body.applyForce(myBall, myBall.position, { x: forceX, y: 0 });
      
      // Emit to others (throttled to ~10fps)
      const now = Date.now();
      if (now - lastForceEmit > 100) {
        if (typeof pinballSocket !== 'undefined') {
          pinballSocket.emit('pinball_apply_force', { name: myName, fx: forceX });
        }
        lastForceEmit = now;
      }
    }
  });

  window.requestPinballGyroPermission = function() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then(permissionState => {
          if (permissionState === 'granted') {
            alert('✅ 體感控制已啟用！開始比賽後，左右傾斜手機即可控制你的專屬彈珠！');
          } else {
            alert('❌ 體感控制權限已被拒絕。');
          }
        })
        .catch(console.error);
    } else {
      alert('✅ 您的設備已自動啟用體感控制！開始比賽後，左右傾斜手機即可控制彈珠！');
    }
  };

window.pinballInitColorPicker = function() {
  const colorContainer = document.getElementById('pinball-color-options');
  if (!colorContainer || colorContainer.children.length > 0) return;
  
  let selectedColor = null;
  let selectedStyle = 'solid';
  const defaultColors = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#e67e22', '#9b59b6', '#fd79a8', '#00cec9'];

  function updatePreview() {
    const canvas = document.getElementById('pinball-preview-canvas');
    if (!canvas || !selectedColor) return;
    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');
    const r = 40;
    const cx = 50;
    const cy = 50;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.translate(cx, cy);
    if (selectedStyle === 'solid') {
      ctx.fillStyle = selectedColor;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (selectedStyle === 'billiard') {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = selectedColor;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillRect(-r, -r*0.5, r * 2, r);
    } else if (selectedStyle === 'gradient') {
      const grad = ctx.createRadialGradient(-r*0.3, -r*0.3, r*0.1, 0, 0, r);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.3, selectedColor);
      grad.addColorStop(1, '#000000');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 24px Arial';
    let num = '?';
    const myName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.displayName : null;
    if (myName && typeof pbBalls !== 'undefined' && pbBalls[myName]) {
      num = pbBalls[myName].plugin.num;
    }
    ctx.fillText(num, cx, cy + 2);
  }
  
  const styleBtns = document.querySelectorAll('.pinball-style-btn');
  Array.from(styleBtns).forEach(btn => {
    btn.onclick = () => {
      Array.from(styleBtns).forEach(b => {
        b.style.borderColor = 'transparent';
        b.classList.remove('active');
      });
      btn.style.borderColor = '#3498db';
      btn.classList.add('active');
      selectedStyle = btn.getAttribute('data-style');
      updatePreview();
    };
  });

  if (!selectedColor) {
    const myName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.displayName : null;
    if (myName && typeof pbBalls !== 'undefined' && pbBalls[myName]) {
      selectedColor = pbBalls[myName].render.fillStyle;
      selectedStyle = pbBalls[myName].plugin.style || 'solid';
    } else {
      // RANDOM color and style for new players
      selectedColor = defaultColors[Math.floor(Math.random() * defaultColors.length)];
      const styles = ['solid', 'billiard', 'gradient'];
      selectedStyle = styles[Math.floor(Math.random() * styles.length)];
    }
    
    Array.from(styleBtns).forEach(b => {
      if (b.getAttribute('data-style') === selectedStyle) {
        b.style.borderColor = '#3498db';
        b.classList.add('active');
      }
    });
    
    updatePreview();
  }

  // Setup Confirm button once
  const confirmBtn = document.getElementById('btn-pinball-color-confirm');
  if (confirmBtn) {
     confirmBtn.style.display = 'block'; // Make sure it's visible so user can directly confirm
     confirmBtn.onclick = () => {
         const myName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.displayName : null;
         if (window.pinballSocket && myName) {
           window.pinballSocket.emit('join_pinball', { name: myName });
         }
         fetch('/api/pinball/set-color', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ name: myName, color: selectedColor, style: selectedStyle })
         });
       hasSelectedPinballColor = true;
       const colorUi = document.getElementById('pinball-color-picker-ui');
       if (colorUi) colorUi.classList.add('hidden');
       const roomParticipantsPanel = document.getElementById('room-participants-panel');
       if (roomParticipantsPanel) roomParticipantsPanel.style.display = 'none';
     };
  }

  defaultColors.forEach(c => {
    const btn = document.createElement('button');
    btn.style.cssText = `width: 35px; height: 35px; border-radius: 50%; border: 3px solid #fff; background-color: ${c}; cursor: pointer; transition: transform 0.2s; box-shadow: 0 2px 5px rgba(0,0,0,0.5);`;
    
    // Highlight the randomly selected color
    if (c === selectedColor) {
      btn.style.transform = 'scale(1.2)';
    }

    btn.onclick = () => {
      selectedColor = c;
      updatePreview();
      Array.from(colorContainer.children).forEach(child => child.style.transform = 'scale(1)');
      btn.style.transform = 'scale(1.2)';
    };
    colorContainer.appendChild(btn);
  });
};

document.addEventListener('DOMContentLoaded', () => {
  window.pinballInitColorPicker();
});

window.addEventListener('resize', () => { if (typeof pbState !== 'undefined' && pbState.status !== 'idle' && pbEngine && pbRender) { const w = pinballContainer.clientWidth || window.innerWidth; const h = pinballContainer.clientHeight || window.innerHeight; if (w < 50 || h < 50) return; pbRender.options.width = w; pbRender.options.height = h; pbRender.canvas.width = w; pbRender.canvas.height = h; pbRender.bounds.max.y = pbRender.bounds.min.y + h * (LOGICAL_WIDTH / w); } });
