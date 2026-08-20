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
const PB_GRAVITY_Y = 0.88; // Reduced by 20% for smooth readable race speed

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
  const trackLeftX = W / 2 - PB_TRACK_WIDTH / 2;
  const trackRightX = W / 2 + PB_TRACK_WIDTH / 2;
  
  // Ceiling to prevent flying too high
  bodies.push(Bodies.rectangle(W/2, -500, W * 10, 1000, { isStatic: true }));

  const lStartX = -1000;
  const lStartY = currentY;
  const lEndX = trackLeftX;
  const lEndY = currentY + funnelHeight;
  const lLen = Math.hypot(lEndX - lStartX, lEndY - lStartY);
  const lAngle = Math.atan2(lEndY - lStartY, lEndX - lStartX);
  
  bodies.push(Bodies.rectangle((lStartX + lEndX)/2, (lStartY + lEndY)/2, lLen, 150, {
    isStatic: true, angle: lAngle
  }));
  
  const rStartX = trackRightX;
  const rStartY = currentY + funnelHeight;
  const rEndX = W + 1000;
  const rEndY = currentY;
  const rLen = Math.hypot(rEndX - rStartX, rEndY - rStartY);
  const rAngle = Math.atan2(rEndY - rStartY, rEndX - rStartX);
  
  bodies.push(Bodies.rectangle((rStartX + rEndX)/2, (rStartY + rEndY)/2, rLen, 150, {
    isStatic: true, angle: rAngle
  }));

  currentY += funnelHeight;
  
  const bumperRadius = 40;
  bodies.push(Bodies.circle(trackLeftX - bumperRadius + 15, currentY, bumperRadius, {
    isStatic: true, friction: 0.05, restitution: 0.2
  }));
  bodies.push(Bodies.circle(trackRightX + bumperRadius - 15, currentY, bumperRadius, {
    isStatic: true, friction: 0.05, restitution: 0.2
  }));
  
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
  const wallThickness = 120;
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
      friction: 0.0,
      restitution: 0.2
    }));

    bodies.push(Bodies.circle(rightX, rightY, wallThickness / 2, {
      isStatic: true,
      friction: 0.0,
      restitution: 0.2
    }));
  }

  // Bottom closing barrier cap (so balls can never fall out of the bottom)
  const finalP = pathPoints[pathPoints.length - 1];
  for (let angle = 0; angle <= Math.PI; angle += Math.PI / 8) {
    const bx = finalP.x + (PB_TRACK_WIDTH / 2) * Math.cos(angle);
    const by = finalP.y + (PB_TRACK_WIDTH / 2) * Math.sin(angle) + 10;
    bodies.push(Bodies.circle(bx, by, wallThickness / 2, {
      isStatic: true,
      friction: 0.0,
      restitution: 0.4
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
    positionIterations: 12,
    velocityIterations: 12,
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
          isStatic: true, restitution: 1.2, friction: 0.0,
          plugin: { isRotary: true, isBumper: true }
        }));
      } else {
        bodies.push(Bodies.circle(cx, cy, 14, {
          isStatic: true, restitution: 1.5, friction: 0.0,
          plugin: { isBumper: true }
        }));
      }
    }
  }

  // GENERATE FINAL PACHINKO GRID
  const startFinalIdx = Math.floor(pathPoints.length * 0.92);
  const endFinalIdx = Math.floor(pathPoints.length * 0.98);
  const pachinkoRows = 6;
  const pachinkoRowSpacing = Math.floor((endFinalIdx - startFinalIdx) / pachinkoRows);
  
  if (pachinkoRowSpacing > 0) {
    let rowNum = 0;
    for (let pIdx = startFinalIdx; pIdx <= endFinalIdx; pIdx += pachinkoRowSpacing) {
      const p = pathPoints[pIdx];
      const pNext = pathPoints[Math.min(pathPoints.length - 1, pIdx + 3)];
      const pPrev = pathPoints[Math.max(0, pIdx - 3)];
      
      let dx = pNext.x - pPrev.x;
      let dy = pNext.y - pPrev.y;
      let len = Math.sqrt(dx*dx + dy*dy) || 1;
      let nx = -dy / len;
      let ny = dx / len;

      let offsets = [];
      if (rowNum % 2 === 0) {
        offsets = [-75, -25, 25, 75];
      } else {
        offsets = [-50, 0, 50];
      }

      for (let offsetAmt of offsets) {
        const cx = p.x + nx * offsetAmt;
        const cy = p.y + ny * offsetAmt;
        bodies.push(Bodies.circle(cx, cy, 14, {
          isStatic: true, restitution: 1.5, friction: 0.0, plugin: { isBumper: true }
        }));
      }
      rowNum++;
    }
  }

  World.add(pbEngine.world, bodies);

  const isUphill = options && options.mode === 'uphill';
  pbEngine.plugin = { raceStarted: false, mode: isUphill ? 'uphill' : 'downhill' };

  // Finish Line Sensor (Top for Uphill, Bottom for Downhill)
  const finishY = isUphill ? (PB_START_Y - 50) : (finalY + 200);
  const finishLine = Bodies.rectangle(PB_WIDTH / 2, finishY, PB_WIDTH * 3, isUphill ? 100 : 400, {
    isStatic: true, isSensor: true, plugin: { isFinishLine: true }
  });
  World.add(pbEngine.world, [finishLine]);

  // Start Gate: in Uphill, placed above bottom spawn area; in Downhill, placed below top spawn area
  const gateY = isUphill ? (finalY - 180) : (PB_START_Y + 95);
  pbStartGate = Bodies.rectangle(PB_WIDTH / 2, gateY, PB_WIDTH * 2, 80, {
    isStatic: true,
    plugin: { isStartGate: true }
  });
  const lobbyCeiling = Bodies.rectangle(PB_WIDTH / 2, -20, PB_WIDTH * 2, 40, { isStatic: true });
  const lobbyLeftWall = Bodies.rectangle(-20, (finalY + PB_START_Y) / 2, 40, (finalY + PB_START_Y) * 2, { isStatic: true });
  const lobbyRightWall = Bodies.rectangle(PB_WIDTH + 20, (finalY + PB_START_Y) / 2, 40, (finalY + PB_START_Y) * 2, { isStatic: true });
  World.add(pbEngine.world, [pbStartGate, lobbyCeiling, lobbyLeftWall, lobbyRightWall]);

  // Spawn balls
  const baseStartY = isUphill ? (finalY - 40) : PB_START_Y;
  pool.forEach((name, idx) => {
    const rRow = Math.floor(idx / 15);
    const cCol = idx % 15;
    const spacingX = 40;
    const startXOffset = PB_WIDTH / 2 - (Math.min(pool.length, 15) * spacingX) / 2 + 20;
    const x = startXOffset + cCol * spacingX;
    const y = baseStartY - 30 - (rRow * 35);

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
  });

  Events.on(pbEngine, 'beforeUpdate', () => {
    const bodies = pbEngine.world.bodies;
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      if (body.plugin && body.plugin.isRotary) {
        Body.setAngle(body, body.angle + 0.05);
      }
      if (body.plugin && body.plugin.isBall) {
        // Foolproof Anti-Out-Of-Bounds Containment
        if (body.position.x < 30) {
          Body.setPosition(body, { x: 45, y: body.position.y });
          Body.setVelocity(body, { x: Math.abs(body.velocity.x) * 0.5, y: body.velocity.y });
        } else if (body.position.x > PB_WIDTH - 30) {
          Body.setPosition(body, { x: PB_WIDTH - 45, y: body.position.y });
          Body.setVelocity(body, { x: -Math.abs(body.velocity.x) * 0.5, y: body.velocity.y });
        }
        if (body.position.y > finalY + 15) {
          Body.setPosition(body, { x: body.position.x, y: finalY - 10 });
          Body.setVelocity(body, { x: body.velocity.x, y: Math.min(-2, -Math.abs(body.velocity.y) * 0.5) });
        }
        if (body.position.y < 30) {
          Body.setPosition(body, { x: body.position.x, y: 45 });
          Body.setVelocity(body, { x: body.velocity.x, y: Math.abs(body.velocity.y) * 0.5 });
        }

        if (!body.plugin.finished && pbEngine.plugin && pbEngine.plugin.raceStarted) {
          if (body.speed < 0.5) {
            body.plugin.stuckFrames = (body.plugin.stuckFrames || 0) + 1;
            if (body.plugin.stuckFrames > 60) {
              Body.setVelocity(body, {
                x: (Math.random() - 0.5) * 10,
                y: isUphill ? -10 : -7.5
              });
              body.plugin.stuckFrames = 0;
            }
          } else {
            body.plugin.stuckFrames = 0;
          }
        }
      }
    }
    
    // Rubber-banding (catch-up mechanic) & Anti-tunneling
    if (pbEngine.plugin && pbEngine.plugin.raceStarted) {
      const allBalls = Object.values(pbBalls).filter(b => !b.plugin.finished);
      if (isUphill) {
        const highestY = Math.min(...allBalls.map(b => b.position.y));
        allBalls.forEach(ball => {
          const distanceBehind = ball.position.y - highestY;
          let multiplier = 0;
          if (distanceBehind > 200) multiplier = 0.03;
          if (distanceBehind > 400) multiplier = 0.06;
          if (distanceBehind > 600) multiplier = 0.12;
          if (distanceBehind > 1000) multiplier = 0.25;
          
          const baseForce = ball.mass * pbEngine.gravity.y * pbEngine.gravity.scale;
          let totalYForce = -baseForce * multiplier;
          
          Body.applyForce(ball, ball.position, { x: 0, y: totalYForce });
        });
      } else {
        const lowestY = Math.max(...allBalls.map(b => b.position.y));
        allBalls.forEach(ball => {
          const distanceBehind = lowestY - ball.position.y;
          let multiplier = 0;
          if (distanceBehind > 200) multiplier = 0.05;
          if (distanceBehind > 400) multiplier = 0.1;
          if (distanceBehind > 600) multiplier = 0.2;
          if (distanceBehind > 1000) multiplier = 0.35;
          
          const baseForce = ball.mass * pbEngine.gravity.y * pbEngine.gravity.scale;
          let totalYForce = baseForce * multiplier;
          
          Body.applyForce(ball, ball.position, { x: 0, y: totalYForce });
        });
      }
      
      // Speed clamp to prevent tunneling
      allBalls.forEach(ball => {
        if (ball.velocity.y > 25) {
          Body.setVelocity(ball, { x: ball.velocity.x, y: 25 });
        }
        if (ball.velocity.y < -25) {
          Body.setVelocity(ball, { x: ball.velocity.x, y: -25 });
        }
        if (Math.abs(ball.velocity.x) > 25) {
          Body.setVelocity(ball, { x: Math.sign(ball.velocity.x) * 25, y: ball.velocity.y });
        }
      });
      
      // Out-Of-Bounds Rescue Mechanic
      allBalls.forEach(ball => {
        if (ball.plugin.finished) return;
        if (serverPathPoints.length === 0) return;
        
        if (ball.position.y > serverPathPoints[serverPathPoints.length - 1].y) return;

        if (ball.position.y > PB_START_Y) {
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
          
          if (Math.abs(ball.position.x - closest.x) > 85) {
            Body.setPosition(ball, { x: closest.x, y: closest.y });
            Body.setVelocity(ball, { x: 0, y: ball.velocity.y * 0.5 });
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

function startRace() {
  if (pbEngine) {
    pbEngine.gravity.y = PB_GRAVITY_Y;
    if (pbEngine.plugin) pbEngine.plugin.raceStarted = true;
    if (pbStartGate) {
      World.remove(pbEngine.world, pbStartGate);
      pbStartGate = null;
    }
    Object.values(pbBalls).forEach(ball => {
      Body.setVelocity(ball, {
        x: (Math.random() - 0.5) * 4,
        y: -(4 + Math.random() * 4)
      });
    });
  }
}

function scatterBallsOnFive() {
  // Deliberately do nothing. Balls should not jump before GO.
}

function pushBall(name, dir) {
  if (pbEngine && pbBalls && pbBalls[name]) {
    const forceAmount = 0.1;
    let fx = 0, fy = 0;
    let vx = 0, vy = 0;
    if (dir === 'up') {
      fy = -forceAmount * 2.5; // 2.5x upward jump force
      vy = -16; // Strong upward leap impulse
    } else if (dir === 'down') {
      fy = forceAmount;
      vy = fy * 150;
    } else if (dir === 'left') {
      fx = -forceAmount * 1.5;
      vx = fx * 150;
    } else if (dir === 'right') {
      fx = forceAmount * 1.5;
      vx = fx * 150;
    }
    
    Body.applyForce(pbBalls[name], pbBalls[name].position, { x: fx, y: fy });
    Body.setVelocity(pbBalls[name], { x: pbBalls[name].velocity.x + vx, y: vy !== 0 ? vy : pbBalls[name].velocity.y });
    
    pbBalls[name].plugin.pushed = true;
    setTimeout(() => { if (pbBalls && pbBalls[name]) pbBalls[name].plugin.pushed = false; }, 800);
  }
}

function applyForce(name, forceX, forceY) {
  if (pbEngine && pbBalls && pbBalls[name]) {
    const ball = pbBalls[name];
    if (ball.plugin && ball.plugin.finished) return; // Don't push finished balls
    let fx = forceX || 0;
    let fy = forceY || 0;
    
    // If upward force is applied, double the force and apply jump impulse
    if (fy < 0) {
      fy = fy * 2.5;
      Body.setVelocity(ball, { x: ball.velocity.x + fx * 100, y: Math.min(-12, ball.velocity.y - 12) });
    }
    Body.applyForce(ball, ball.position, { x: fx, y: fy });
  }
}

function getSyncState() {
    const state = {};
    for (const name in pbBalls) {
      state[name] = {
        x: Math.round(pbBalls[name].position.x * 100) / 100,
        y: Math.round(pbBalls[name].position.y * 100) / 100,
        a: Math.round(pbBalls[name].angle * 1000) / 1000,
        vx: Math.round(pbBalls[name].velocity.x * 100) / 100,
        vy: Math.round(pbBalls[name].velocity.y * 100) / 100
      };
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
  startRace,
  scatterBallsOnFive,
  pushBall,
  applyForce,
  getSyncState,
  stopEngine,
  addBall
};
