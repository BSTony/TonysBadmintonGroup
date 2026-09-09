/**
 * Author: Tony Hsieh
 * Date: 2026-08-26
 * Version: 1.4.0
 * Server-side pinball physics (host-authoritative finish; matching track layout)
 * Optimized: Sub-stepping, 30Hz sync, delta compression, velocity clamping
 */
const Matter = require('matter-js');
const { Engine, World, Bodies, Events, Body } = Matter;

let pbEngine = null;
let updateInterval = null;
let pbBalls = {};
let pbStartGate = null;
let onFinishCallback = null;

const PB_WIDTH = 800;
const PB_START_Y = Math.floor(1000 * 0.65); // 650
const PB_TRACK_WIDTH = 200;
const PB_MARBLE_RADIUS = 12;
const PB_GRAVITY_Y = 0.96; // +20% faster than 0.80

let prngState = 12345;
function setSeed(s) { prngState = s; }
function seededRandom() {
  prngState = (prngState * 9301 + 49297) % 233280;
  return prngState / 233280;
}

function buildTopDownTrack(W) {
  const bodies = [];
  const pathPoints = [];
  
  const steps = 600;
  const maxT = Math.PI * 14;
  
  const maxSafeAmplitude = (W / 2) - 150 - 20;
  const amplitude = Math.max(50, maxSafeAmplitude);
  
  const stretch = Math.max(180, Math.sqrt(amplitude * 160));

  let currentY = PB_START_Y + 10;
  
  const funnelHeight = 250;
  const funnelSteps = 25;
  const topLeftX = -150;
  const topRightX = W + 150;
  const targetLeftX = W / 2 - PB_TRACK_WIDTH / 2;
  const targetRightX = W / 2 + PB_TRACK_WIDTH / 2;

  // Ceiling to prevent flying too high
  bodies.push(Bodies.rectangle(W/2, -500, W * 10, 1000, { isStatic: true }));

  for (let i = 0; i <= funnelSteps; i++) {
    const t = i / funnelSteps;
    // Smooth quadratic curve for natural Y-funnel slope (\  /)
    const easeT = Math.pow(t, 1.3);
    const fy = currentY + t * funnelHeight;
    const flX = topLeftX + easeT * (targetLeftX - topLeftX);
    const frX = topRightX + easeT * (targetRightX - topRightX);
    
    bodies.push(Bodies.circle(flX - 30, fy, 40, { isStatic: true, friction: 0.001, restitution: 0.7 }));
    bodies.push(Bodies.circle(frX + 30, fy, 40, { isStatic: true, friction: 0.001, restitution: 0.7 }));
  }

  currentY += funnelHeight;
  
  for(let y = currentY; y < currentY + 100; y += 20) {
    pathPoints.push({ x: W/2, y: y });
  }
  currentY += 100;

  const phase1 = seededRandom() * Math.PI * 2;
  const phase2 = seededRandom() * Math.PI * 2;
  const phase3 = seededRandom() * Math.PI * 2;
  
  const freq1 = 0.8;
  const freq2 = 1.1 + seededRandom() * 0.3;
  const freq3 = 0.4 + seededRandom() * 0.2;
  
  const w1 = 0.5 + seededRandom() * 0.2;
  const w2 = 0.15 + seededRandom() * 0.15;
  const w3 = 1.0 - w1 - w2;

  const trackWaveStartY = currentY;

  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * maxT;
    
    let env = 1.0;
    const fadeLen = Math.PI * 2;
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

  for(let i = 0; i < 15; i++) {
    currentY += 20;
    pathPoints.push({ x: W/2, y: currentY });
  }

  // Build physical guardrails along the path using overlapping circles (exact 1:1 match with client)
  const wallThickness = 140;
  const wallOffset = (PB_TRACK_WIDTH / 2) + (wallThickness / 2) - 2;
  
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
    
    bodies.push(Bodies.circle(leftX, leftY, wallThickness / 2, {
      isStatic: true,
      friction: 0.03,
      restitution: 0.45
    }));

    bodies.push(Bodies.circle(rightX, rightY, wallThickness / 2, {
      isStatic: true,
      friction: 0.03,
      restitution: 0.45
    }));
  }

  // Bottom closing barrier cap (so balls can never fall out of the bottom)
  const finalP = pathPoints[pathPoints.length - 1];
  for (let angle = 0; angle <= Math.PI; angle += Math.PI / 8) {
    const bx = finalP.x + (PB_TRACK_WIDTH / 2) * Math.cos(angle);
    const by = finalP.y + (PB_TRACK_WIDTH / 2) * Math.sin(angle) + 40;
    bodies.push(Bodies.circle(bx, by, wallThickness / 2, {
      isStatic: true,
      friction: 0.001,
      restitution: 0.5
    }));
  }

  return { bodies, pathPoints, finalY: pathPoints[pathPoints.length-1].y };
}

function initServerEngine(pool, seed, optionsOrCb) {
  let onFinish = null;
  let options = {};
  if (typeof optionsOrCb === 'function') {
    onFinish = optionsOrCb;
  } else if (optionsOrCb && typeof optionsOrCb === 'object') {
    options = optionsOrCb;
    onFinish = options.onFinish || null;
  }

  if (pbEngine) {
    if (updateInterval) clearInterval(updateInterval);
    World.clear(pbEngine.world);
    Engine.clear(pbEngine);
  }
  
  setSeed(seed);
  onFinishCallback = onFinish;
  pbBalls = {};

  pbEngine = Engine.create({
    positionIterations: 10,
    velocityIterations: 10,
    enableSleeping: false
  });
  pbEngine.gravity.x = 0;
  pbEngine.gravity.y = 0; // zero gravity until race starts!

  const { bodies, pathPoints, finalY } = buildTopDownTrack(PB_WIDTH);
  serverPathPoints = pathPoints;
  
  // GENERATE RANDOM OBSTACLES
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
        bodies.push(Bodies.rectangle(cx, cy, 128, 20, {
          isStatic: true, restitution: 0.85, friction: 0.02,
          plugin: { isRotary: true, isBumper: true }
        }));
      } else {
        bodies.push(Bodies.circle(cx, cy, 14, {
          isStatic: true, restitution: 0.85, friction: 0.02,
          plugin: { isBumper: true }
        }));
      }
    }
  }

  // GENERATE FINAL PACHINKO GRID (must match client: step by 5)
  const startFinalIdx = Math.floor(pathPoints.length * 0.92);
  const endFinalIdx = Math.floor(pathPoints.length * 0.98);

  if (endFinalIdx > startFinalIdx) {
    let rowNum = 0;
    for (let pIdx = startFinalIdx; pIdx <= endFinalIdx; pIdx += 5) {
      const p = pathPoints[pIdx];
      const pNext = pathPoints[pIdx + 5] || pathPoints[pathPoints.length - 1];
      const pPrev = pathPoints[pIdx - 5] || pathPoints[0];

      let dx = pNext.x - pPrev.x;
      let dy = pNext.y - pPrev.y;
      let len = Math.sqrt(dx*dx + dy*dy) || 1;
      let nx = -dy / len;
      let ny = dx / len;

      let offsets = [];
      const pattern = rowNum % 3;
      if (pattern === 0) offsets = [-45, 45];
      else if (pattern === 1) offsets = [-35, 35];
      else offsets = [0];

      for (let offsetAmt of offsets) {
        const cx = p.x + nx * offsetAmt;
        const cy = p.y + ny * offsetAmt;
        bodies.push(Bodies.circle(cx, cy, 14, {
          isStatic: true, restitution: 0.85, friction: 0.02, plugin: { isBumper: true }
        }));
      }
      rowNum++;
    }
  }

  World.add(pbEngine.world, bodies);

  const isUphill = options && options.mode === 'uphill';
  pbEngine.plugin = { raceStarted: false, mode: isUphill ? 'uphill' : 'downhill' };

  // Finish Line Sensor (Top for Uphill, Bottom for Downhill)
  const finishY = isUphill ? (PB_START_Y - 50) : (finalY - 30);
  const finishLine = Bodies.rectangle(PB_WIDTH / 2, finishY, PB_WIDTH * 2, 80, {
    isStatic: true, isSensor: true, plugin: { isFinishLine: true }
  });
  World.add(pbEngine.world, [finishLine]);

  // Start Gate: in Uphill, placed above bottom spawn area; in Downhill, placed below top spawn area
  const gateY = isUphill ? (finalY - 120) : (PB_START_Y + 95);
  pbStartGate = Bodies.rectangle(PB_WIDTH / 2, gateY, PB_WIDTH * 2, 60, {
    isStatic: true,
    plugin: { isStartGate: true }
  });
  const lobbyCeiling = Bodies.rectangle(PB_WIDTH / 2, -20, PB_WIDTH * 2, 40, { isStatic: true });
  const lobbyLeftWall = Bodies.rectangle(-20, (finalY + PB_START_Y) / 2, 40, (finalY + PB_START_Y) * 2, { isStatic: true });
  const lobbyRightWall = Bodies.rectangle(PB_WIDTH + 20, (finalY + PB_START_Y) / 2, 40, (finalY + PB_START_Y) * 2, { isStatic: true });
  World.add(pbEngine.world, [pbStartGate, lobbyCeiling, lobbyLeftWall, lobbyRightWall]);

  // Spawn balls (alphabetical grid must match every client, unless custom dragged position exists)
  const initialPositions = (options && options.initialPositions) || {};
  const sortedPool = [...pool].sort();
  sortedPool.forEach((name, idx) => {
    let x, y;
    if (initialPositions[name] && typeof initialPositions[name].x === 'number' && typeof initialPositions[name].y === 'number') {
      x = initialPositions[name].x;
      y = initialPositions[name].y;
    } else if (isUphill) {
      const cols = 4;
      const rRow = Math.floor(idx / cols);
      const cCol = idx % cols;
      const spacingX = 38;
      const startXOffset = PB_WIDTH / 2 - ((cols - 1) * spacingX) / 2;
      x = startXOffset + cCol * spacingX;
      y = finalY - 80 + (rRow * 32);
    } else {
      const cols = 15;
      const rRow = Math.floor(idx / cols);
      const cCol = idx % cols;
      const spacingX = 40;
      const startXOffset = PB_WIDTH / 2 - ((Math.min(sortedPool.length, cols) - 1) * spacingX) / 2;
      x = startXOffset + cCol * spacingX;
      y = PB_START_Y - 25 - (rRow * 35);
    }

    const ball = Bodies.circle(x, y, PB_MARBLE_RADIUS, {
      restitution: isUphill ? 0.45 : 0.65,
      friction: 0.04,
      density: 0.05,
      frictionAir: 0.007,
      isBullet: true,
      plugin: { isBall: true, name: name }
    });
    pbBalls[name] = ball;
    World.add(pbEngine.world, ball);
  });

  Events.on(pbEngine, 'beforeUpdate', () => {
    const bodies = pbEngine.world.bodies;
    const isUphill = pbEngine.plugin && pbEngine.plugin.mode === 'uphill';
    const windmillAngle = (Date.now() / 1000) * 3.0;

    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      if (body.plugin && body.plugin.isRotary) {
        Body.setAngle(body, windmillAngle);
      }
      if (body.plugin && body.plugin.isBall) {
        // Position-based 100% reliable finish check
        if (!body.plugin.finished && pbEngine.plugin && pbEngine.plugin.raceStarted) {
          const reachedFinish = isUphill ? (body.position.y <= PB_START_Y - 30) : (body.position.y >= finalY - 45);
          if (reachedFinish) {
            body.plugin.finished = true;
            if (onFinishCallback) onFinishCallback(body.plugin.name);
          }
        }

        // Anti-stuck gentle nudge
        if (!body.plugin.finished && pbEngine.plugin && pbEngine.plugin.raceStarted) {
          if (body.speed < 0.2) {
            body.plugin.stuckFrames = (body.plugin.stuckFrames || 0) + 1;
            if (body.plugin.stuckFrames > 45) {
              Body.setVelocity(body, {
                x: (Math.random() - 0.5) * 4,
                y: isUphill ? -6 : 5
              });
              body.plugin.stuckFrames = 0;
            }
          } else {
            body.plugin.stuckFrames = 0;
          }
        }
      }
    }

    // Server-side gentle slipstream catch-up boost
    if (pbEngine.plugin && pbEngine.plugin.raceStarted && Math.abs(pbEngine.gravity.y) > 0) {
      const allBalls = Object.values(pbBalls).filter(b => !b.plugin.finished);

      // D: Velocity clamping — prevent tunneling and unstable bounces
      const MAX_SPEED = 28;
      allBalls.forEach(ball => {
        const speed = Math.sqrt(ball.velocity.x * ball.velocity.x + ball.velocity.y * ball.velocity.y);
        if (speed > MAX_SPEED) {
          const scale = MAX_SPEED / speed;
          Body.setVelocity(ball, {
            x: ball.velocity.x * scale,
            y: ball.velocity.y * scale
          });
        }
      });

      if (allBalls.length > 1) {
        const sortedBalls = [...allBalls].sort((a, b) => isUphill ? (a.position.y - b.position.y) : (b.position.y - a.position.y));
        sortedBalls.forEach((ball, index) => {
          let multiplier = 0;
          if (index === 0) multiplier = 0.0;
          else if (index === 1) multiplier = 0.03;
          else if (index === 2) multiplier = 0.06;
          else if (index >= 3 && index <= 9) multiplier = 0.10;
          else multiplier = 0.15;

          if (multiplier > 0) {
            const baseForce = ball.mass * Math.abs(pbEngine.gravity.y) * pbEngine.gravity.scale;
            Body.applyForce(ball, ball.position, { x: 0, y: isUphill ? (-baseForce * multiplier) : (baseForce * multiplier) });
          }
        });
      }
    }
    
    // Out-Of-Bounds True Emergency Rescue (only if > 140px outside track)
    if (pbEngine.plugin && pbEngine.plugin.raceStarted) {
      const allBalls = Object.values(pbBalls).filter(b => !b.plugin.finished);
      allBalls.forEach(ball => {
        if (serverPathPoints.length === 0) return;
        if (ball.position.y > serverPathPoints[serverPathPoints.length - 1].y) return;

        if (ball.position.y > serverPathPoints[0].y) {
          let closest = serverPathPoints[0];
          let minDist = Math.abs(ball.position.y - closest.y);
          for (let j = 1; j < serverPathPoints.length; j++) {
            const dist = Math.abs(ball.position.y - serverPathPoints[j].y);
            if (dist < minDist) {
              minDist = dist;
              closest = serverPathPoints[j];
            }
            if (serverPathPoints[j].y > ball.position.y + 100) break;
          }
          
          if (Math.abs(ball.position.x - closest.x) > 140) {
            Body.setPosition(ball, { x: closest.x, y: closest.y });
            Body.setVelocity(ball, { x: (Math.random() - 0.5) * 2, y: isUphill ? -5 : 5 });
          }
        }
      });
    }
  });

  // Collision handling (Finish & Pushed Bounce)
  Events.on(pbEngine, 'collisionStart', (event) => {
    event.pairs.forEach(pair => {
      let ball = null, finish = null;
      if (pair.bodyA.plugin && pair.bodyA.plugin.isBall) ball = pair.bodyA;
      if (pair.bodyB.plugin && pair.bodyB.plugin.isBall) ball = pair.bodyB;
      if (pair.bodyA.plugin && pair.bodyA.plugin.isFinishLine) finish = pair.bodyA;
      if (pair.bodyB.plugin && pair.bodyB.plugin.isFinishLine) finish = pair.bodyB;

      if (ball && finish) {
        if (!ball.plugin.finished && pbEngine.plugin && pbEngine.plugin.raceStarted) {
          ball.plugin.finished = true;
          if (onFinishCallback) onFinishCallback(ball.plugin.name);
        }
      }

      if (pair.bodyA.plugin && pair.bodyA.plugin.isBall && pair.bodyB.plugin && pair.bodyB.plugin.isBall) {
        if (pair.bodyA.plugin.pushed || pair.bodyB.plugin.pushed) {
          const dx = pair.bodyA.position.x - pair.bodyB.position.x;
          const dy = pair.bodyA.position.y - pair.bodyB.position.y;
          const dist = Math.sqrt(dx*dx + dy*dy) || 1;
          const bounceForce = 15;
          const forceX = (dx / dist) * bounceForce;
          const forceY = (dy / dist) * bounceForce;
          
          Body.setVelocity(pair.bodyA, { x: pair.bodyA.velocity.x + forceX, y: pair.bodyA.velocity.y + forceY });
          Body.setVelocity(pair.bodyB, { x: pair.bodyB.velocity.x - forceX, y: pair.bodyB.velocity.y - forceY });
          
          pair.bodyA.plugin.pushed = false;
          pair.bodyB.plugin.pushed = false;
        }
      }
    });
  });

  if (updateInterval) clearInterval(updateInterval);
  updateInterval = setInterval(() => {
    if (pbEngine) {
      Engine.update(pbEngine, 1000 / 60);
    }
  }, 1000 / 60);
}

let ioInstance = null;
function setIo(io) {
  ioInstance = io;
}

function startRace(io) {
  if (io) ioInstance = io;
  if (pbEngine) {
    const isUphill = pbEngine.plugin && pbEngine.plugin.mode === 'uphill';
    pbEngine.gravity.y = isUphill ? -PB_GRAVITY_Y : PB_GRAVITY_Y;
    if (pbEngine.plugin) pbEngine.plugin.raceStarted = true;
    if (pbStartGate) {
      World.remove(pbEngine.world, pbStartGate);
      pbStartGate = null;
    }
    Object.values(pbBalls).forEach(ball => {
      Body.setVelocity(ball, {
        x: (Math.random() - 0.5) * 3,
        y: isUphill ? -(2 + Math.random() * 2) : (2 + Math.random() * 2)
      });
    });

    let syncFrameCount = 0;
    // D3: Track last synced positions for delta compression
    let lastSyncPositions = {};

    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(() => {
      if (pbEngine) {
        // D1: Sub-stepping — 2 half-steps for more stable collisions
        Engine.update(pbEngine, 1000 / 120);
        Engine.update(pbEngine, 1000 / 120);
        // Visual rolling angle — accumulated AFTER physics step, never touching b.angle
        const bodies = pbEngine.world.bodies;
        for (let i = 0; i < bodies.length; i++) {
          const b = bodies[i];
          if (b.plugin && b.plugin.isBall) {
            if (b.plugin.rollAngle === undefined) b.plugin.rollAngle = 0;
            b.plugin.rollAngle += (b.velocity.y * 0.045 + b.velocity.x * 0.07);
          }
        }
        syncFrameCount++;
        // D2: Broadcast snapshot every 2nd frame (30Hz) — client dead-reckoning fills the gap
        if (syncFrameCount % 2 === 0 && ioInstance) {
          // D3: Delta compression — only send balls that moved significantly
          const fullSync = getSyncState();
          const deltaSync = {};
          let hasChanges = false;
          for (const name in fullSync) {
            const cur = fullSync[name];
            const prev = lastSyncPositions[name];
            if (!prev ||
                Math.abs(cur.x - prev.x) > 0.5 ||
                Math.abs(cur.y - prev.y) > 0.5 ||
                Math.abs(cur.vx - prev.vx) > 0.3 ||
                Math.abs(cur.vy - prev.vy) > 0.3) {
              deltaSync[name] = cur;
              hasChanges = true;
            }
          }
          if (hasChanges) {
            lastSyncPositions = fullSync;
            ioInstance.emit('pinball_host_sync', { syncData: deltaSync, t: Date.now() });
          }
        }
      }
    }, 1000 / 60);
  }
}

function setBallPosition(name, x, y) {
  if (pbBalls && pbBalls[name]) {
    Body.setPosition(pbBalls[name], { x, y });
    Body.setVelocity(pbBalls[name], { x: 0, y: 0 });
  }
}

function scatterBallsOnFive() {
  // Deliberately do nothing. Balls should not jump before GO.
}

function getTargetBall(name) {
  if (!pbBalls) return null;
  if (name && pbBalls[name]) return pbBalls[name];
  if (name) {
    const clean = name.replace(/\s*\(Local Test\)/i, '').trim();
    const matchKey = Object.keys(pbBalls).find(k => k === clean || k.includes(clean) || clean.includes(k));
    if (matchKey) return pbBalls[matchKey];
  }
  const all = Object.values(pbBalls);
  if (all.length === 1) return all[0];
  return null;
}

function pushBall(name, dir) {
  const ball = getTargetBall(name);
  if (pbEngine && ball) {
    const forceAmount = 0.08;
    let fx = 0, fy = 0;
    let vx = 0, vy = 0;
    if (dir === 'up') {
      fy = -forceAmount * 1.3;
      vy = -8.5;
    } else if (dir === 'down') {
      fy = forceAmount;
      vy = fy * 100;
    } else if (dir === 'left') {
      fx = -forceAmount * 1.2;
      vx = fx * 100;
    } else if (dir === 'right') {
      fx = forceAmount * 1.2;
      vx = fx * 100;
    }
    
    Body.applyForce(ball, ball.position, { x: fx, y: fy });
    Body.setVelocity(ball, { x: ball.velocity.x + vx, y: vy !== 0 ? vy : ball.velocity.y });
    
    ball.plugin.pushed = true;
    setTimeout(() => { if (ball) ball.plugin.pushed = false; }, 800);
  }
}

function applyForce(name, forceX, forceY) {
  const ball = getTargetBall(name);
  if (pbEngine && ball) {
    if (ball.plugin && ball.plugin.finished) return;
    const isUphill = pbEngine.plugin && pbEngine.plugin.mode === 'uphill';
    let fx = forceX || 0;
    let fy = forceY || 0;
    
    let newVx = ball.velocity.x;
    let newVy = ball.velocity.y;
    
    if (fx !== 0) {
      const impulseX = Math.sign(fx) * Math.max(3.8, Math.abs(fx) * 80);
      newVx = Math.max(-14, Math.min(14, ball.velocity.x + impulseX));
    }
    
    if (fy < 0) {
      if (isUphill) {
        newVy = Math.min(-8.5, ball.velocity.y - 6.5);
      } else {
        newVy = Math.max(-3.0, ball.velocity.y - 4.5);
      }
    } else if (fy > 0) {
      newVy = Math.min(22, ball.velocity.y + 4.5);
    }
    
    Body.setVelocity(ball, { x: newVx, y: newVy });
    Body.applyForce(ball, ball.position, { x: (fx || 0) * 0.05, y: (fy || 0) * 0.05 });
  }
}

function getSyncState() {
  const state = {};
  for (const name in pbBalls) {
    const b = pbBalls[name];
    if (b && b.position) {
      state[name] = {
        x: Math.round(b.position.x * 10) / 10,
        y: Math.round(b.position.y * 10) / 10,
        a: Math.round((b.plugin.rollAngle || 0) * 1000) / 1000,
        vx: Math.round(b.velocity.x * 100) / 100,
        vy: Math.round(b.velocity.y * 100) / 100
      };
    }
  }
  return state;
}

function stopEngine() {
  if (updateInterval) clearInterval(updateInterval);
  if (pbEngine) {
    World.clear(pbEngine.world);
    Engine.clear(pbEngine);
  }
  pbEngine = null;
  updateInterval = null;
  pbBalls = {};
  pbStartGate = null;
  serverPathPoints = [];
}

function addBall(name) {
  if (!pbEngine || pbBalls[name]) return;
  const x = PB_WIDTH / 2 + (Math.random() - 0.5) * 100;
  const y = PB_START_Y - 50;

  const ball = Bodies.circle(x, y, PB_MARBLE_RADIUS, {
    restitution: 0.6,
    friction: 0.005,
    density: 0.05,
    frictionAir: 0.02,
    isBullet: true,
    plugin: { isBall: true, name: name }
  });
  pbBalls[name] = ball;
  World.add(pbEngine.world, ball);
}

module.exports = {
  initServerEngine,
  setIo,
  startRace,
  scatterBallsOnFive,
  pushBall,
  applyForce,
  getSyncState,
  stopEngine,
  addBall,
  setBallPosition
};
