// pinball.js - Top-Down Racing Track (S-Curve)
// Redesigned: 2.5D top-down view matching real marble race tracks

const PB_LOGICAL_WIDTH = 800;
let currentSeed = 12345;
function setSeed(seed) { currentSeed = seed; }
function seededRandom() {
  let t = currentSeed += 0x6D2B79F5;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

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

      // Funnel pattern: alternate rows to push balls to center
      // Row 0: outer edges [-44, 44]
      // Row 1: middle [-28, 28]
      // Row 2: center [0]
      // Funnel pattern: alternate rows to push balls to center
      // Row 0: outer edges [-44, 44]
      // Row 1: middle [-35, 35]
      // Row 2: center [0]
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

  Events.on(pbRender, 'beforeRender', () => {
    pbEngine.world.bodies.forEach(b => {
      if (b.plugin && b.plugin.isRotary) {
        Matter.Body.setAngle(b, b.angle + 0.05);
      }
    });
  });

  Render.run(pbRender);
  // pbRunner is removed because physics is on the server now
  console.log('[Pinball] Top-down track engine started (Renderer Only)');
}

function buildTopDownTrack(W) {
  setSeed(pbState.seed || 12345);

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
  
  bodies.push(Bodies.rectangle((lStartX + lEndX)/2, (lStartY + lEndY)/2, lLen, 150, {
    isStatic: true, angle: lAngle, render: { fillStyle: '#bdc3c7', strokeStyle: '#95a5a6', lineWidth: 1 }
  }));
  
  // Right funnel wall
  const rStartX = trackRightX;
  const rStartY = currentY + funnelHeight;
  const rEndX = W + 100;
  const rEndY = currentY;
  const rLen = Math.hypot(rEndX - rStartX, rEndY - rStartY);
  const rAngle = Math.atan2(rEndY - rStartY, rEndX - rStartX);
  
  bodies.push(Bodies.rectangle((rStartX + rEndX)/2, (rStartY + rEndY)/2, rLen, 150, {
    isStatic: true, angle: rAngle, render: { fillStyle: '#bdc3c7', strokeStyle: '#95a5a6', lineWidth: 1 }
  }));

  currentY += funnelHeight;
  
  // Add smooth circular bumpers at the funnel-to-track junctions to prevent snagging
  const bumperRadius = 40;
  bodies.push(Bodies.circle(trackLeftX - bumperRadius + 15, currentY, bumperRadius, {
    isStatic: true, friction: 0.05, restitution: 0.2, render: { fillStyle: '#bdc3c7' }
  }));
  bodies.push(Bodies.circle(trackRightX + bumperRadius - 15, currentY, bumperRadius, {
    isStatic: true, friction: 0.05, restitution: 0.2, render: { fillStyle: '#bdc3c7' }
  }));
  
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
