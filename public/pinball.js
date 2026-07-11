// pinball.js - Pinball Race Engine

let pbEngine, pbRender, pbRunner;
let pbBalls = {};
let pbTraps = {};
let pbState = { status: 'idle', pool: [], traps: [], finished: [] };
let selectedTrapType = 'speed';

// DOM Elements
var pinballContainer = pinballContainer || document.getElementById('pinball-container');
var pinballCanvasWrapper = pinballCanvasWrapper || document.getElementById('pinball-canvas-wrapper');
var pinballTrapUi = pinballTrapUi || document.getElementById('pinball-trap-ui');
var pinballSpectatorUi = pinballSpectatorUi || document.getElementById('pinball-spectator-ui');
var btnTrapSpeed = document.getElementById('btn-trap-speed');
var btnTrapSlow = document.getElementById('btn-trap-slow');

if (btnTrapSpeed) {
  btnTrapSpeed.addEventListener('click', () => {
    selectedTrapType = 'speed';
    btnTrapSpeed.classList.add('selected');
    btnTrapSpeed.style.border = '3px solid white';
    btnTrapSpeed.style.boxShadow = '0 0 10px #2ecc71';
    btnTrapSlow.classList.remove('selected');
    btnTrapSlow.style.border = '3px solid transparent';
    btnTrapSlow.style.boxShadow = 'none';
  });
}
if (btnTrapSlow) {
  btnTrapSlow.addEventListener('click', () => {
    selectedTrapType = 'slow';
    btnTrapSlow.classList.add('selected');
    btnTrapSlow.style.border = '3px solid white';
    btnTrapSlow.style.boxShadow = '0 0 10px #e74c3c';
    btnTrapSpeed.classList.remove('selected');
    btnTrapSpeed.style.border = '3px solid transparent';
    btnTrapSpeed.style.boxShadow = 'none';
  });
}

// Wrapper click for trap placement
if (pinballCanvasWrapper) {
  pinballCanvasWrapper.addEventListener('click', (e) => {
    if (pbState.status !== 'lobby') return;
    if (!window.currentUser || !window.currentUser.userId) return;
    
    // Check if user is in pool or is super admin
    const myName = window.currentUser.displayName;
    const isGlobalSuperAdmin = window.globalIsSuperAdmin === true;
    if (!pbState.pool.includes(myName) && !isGlobalSuperAdmin) {
      alert('您必須加入大廳才能佈置陷阱！');
      return;
    }

    const rect = pinballCanvasWrapper.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Send API
    fetch('/api/pinball/place-trap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: window.currentUser.userId,
        name: myName,
        trapType: selectedTrapType,
        x: x,
        y: y
      })
    });
  });

  pinballCanvasWrapper.addEventListener('mousemove', (e) => {
    if (pbState.status !== 'lobby') return;
    const myName = (window.currentUser && window.currentUser.displayName) || '';
    const isGlobalSuperAdmin = window.globalIsSuperAdmin === true;
    if (!pbState.pool.includes(myName) && !isGlobalSuperAdmin) return;
    
    const rect = pinballCanvasWrapper.getBoundingClientRect();
    window.pbPreviewX = e.clientX - rect.left;
    window.pbPreviewY = e.clientY - rect.top;
  });

  pinballCanvasWrapper.addEventListener('mouseleave', () => {
    window.pbPreviewX = null;
    window.pbPreviewY = null;
  });
}

function initPinballEngine() {
  // Re-fetch DOM refs in case they weren't ready at script load time
  if (!pinballContainer) pinballContainer = document.getElementById('pinball-container');
  if (!pinballCanvasWrapper) pinballCanvasWrapper = document.getElementById('pinball-canvas-wrapper');

  if (!pinballContainer || !pinballCanvasWrapper) {
    console.warn('[Pinball] Container elements not found in DOM');
    return;
  }

  const width = pinballContainer.clientWidth || window.innerWidth;
  const height = pinballContainer.clientHeight || window.innerHeight;

  // If container is hidden (0x0), don't init yet - it will be called again when visible
  if (width < 50 || height < 50) {
    console.warn('[Pinball] Container too small (hidden?), skipping init. w=' + width + ' h=' + height);
    // If we already built a broken engine, destroy it so we can rebuild
    if (pbEngine) {
      console.log('[Pinball] Destroying broken engine to rebuild later');
      if (pbRunner) Matter.Runner.stop(pbRunner);
      if (pbRender) Matter.Render.stop(pbRender);
      Matter.World.clear(pbEngine.world);
      Matter.Engine.clear(pbEngine);
      if (pbRender && pbRender.canvas) pbRender.canvas.remove();
      pbEngine = null;
      pbRender = null;
      pbRunner = null;
      pbBalls = {};
      pbTraps = {};
    }
    return;
  }

  // If engine already exists with correct dimensions, skip
  if (pbEngine && pbRender && pbRender.options.width === width && pbRender.options.height === height) {
    return;
  }

  // If engine exists but dimensions changed (e.g. was built when hidden), destroy and rebuild
  if (pbEngine) {
    console.log('[Pinball] Rebuilding engine with new dimensions: ' + width + 'x' + height);
    if (pbRunner) Matter.Runner.stop(pbRunner);
    if (pbRender) Matter.Render.stop(pbRender);
    Matter.World.clear(pbEngine.world);
    Matter.Engine.clear(pbEngine);
    if (pbRender && pbRender.canvas) pbRender.canvas.remove();
    pbEngine = null;
    pbRender = null;
    pbRunner = null;
    pbBalls = {};
    pbTraps = {};
  }

  console.log('[Pinball] Initializing engine with dimensions: ' + width + 'x' + height);

  const { Engine, Render, Runner, World, Bodies, Events, Body, Composite } = Matter;
  
  pbEngine = Engine.create();
  pbEngine.gravity.y = 1;

  // Clear any leftover canvas
  pinballCanvasWrapper.innerHTML = '';

  pbRender = Render.create({
    element: pinballCanvasWrapper,
    engine: pbEngine,
    options: {
      width, height,
      wireframes: false,
      background: 'transparent'
    }
  });

  // Walls
  const wallOpts = { isStatic: true, render: { fillStyle: '#2c3e50' }, friction: 0, restitution: 0.5 };
  World.add(pbEngine.world, [
    Bodies.rectangle(0, height/2, 20, height, wallOpts), // Left
    Bodies.rectangle(width, height/2, 20, height, wallOpts), // Right
    Bodies.rectangle(width/2, -400, width, 100, wallOpts) // Top
  ]);

  // Top funnel (Start point)
  const funnelLeft = Bodies.rectangle(width*0.3, 100, width*0.5, 20, { isStatic: true, angle: Math.PI*0.15, render: { fillStyle: '#34495e' } });
  const funnelRight = Bodies.rectangle(width*0.7, 100, width*0.5, 20, { isStatic: true, angle: -Math.PI*0.15, render: { fillStyle: '#34495e' } });
  World.add(pbEngine.world, [funnelLeft, funnelRight]);

  // Side Ramps
  const rampLeft = Bodies.rectangle(0, height*0.4, width*0.4, 20, { isStatic: true, angle: Math.PI*0.2, render: { fillStyle: '#34495e' } });
  const rampRight = Bodies.rectangle(width, height*0.6, width*0.4, 20, { isStatic: true, angle: -Math.PI*0.2, render: { fillStyle: '#34495e' } });
  World.add(pbEngine.world, [rampLeft, rampRight]);

  // Plinko Pegs
  const pegs = [];
  const rows = 5;
  const cols = 7;
  const startY = height * 0.3;
  const rowSpacing = (height * 0.4) / rows;
  const colSpacing = width / cols;
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let offset = (r % 2 === 0) ? colSpacing / 2 : 0;
      let px = c * colSpacing + offset;
      let py = startY + r * rowSpacing;
      if (px > 20 && px < width - 20) {
        pegs.push(Bodies.circle(px, py, 5, { isStatic: true, render: { fillStyle: '#bdc3c7' }, restitution: 0.8 }));
      }
    }
  }
  World.add(pbEngine.world, pegs);

  // Finish Line Sensor
  const finishLine = Bodies.rectangle(width/2, height - 10, width, 50, { 
    isStatic: true, 
    isSensor: true, 
    render: { fillStyle: '#f1c40f' },
    plugin: { isFinishLine: true }
  });
  World.add(pbEngine.world, finishLine);

  Events.on(pbEngine, 'collisionStart', (event) => {
    const pairs = event.pairs;
    pairs.forEach(pair => {
      let ball = null;
      let trap = null;
      let finish = null;

      if (pair.bodyA.plugin && pair.bodyA.plugin.isBall) ball = pair.bodyA;
      if (pair.bodyB.plugin && pair.bodyB.plugin.isBall) ball = pair.bodyB;
      
      if (pair.bodyA.plugin && pair.bodyA.plugin.isTrap) trap = pair.bodyA;
      if (pair.bodyB.plugin && pair.bodyB.plugin.isTrap) trap = pair.bodyB;
      
      if (pair.bodyA.plugin && pair.bodyA.plugin.isFinishLine) finish = pair.bodyA;
      if (pair.bodyB.plugin && pair.bodyB.plugin.isFinishLine) finish = pair.bodyB;

      if (ball && trap) {
        if (trap.plugin.trapType === 'speed') {
          Body.setVelocity(ball, { x: ball.velocity.x, y: 15 });
        } else if (trap.plugin.trapType === 'slow') {
          Body.setVelocity(ball, { x: ball.velocity.x * 0.1, y: ball.velocity.y * 0.1 });
        }
      }

      if (ball && finish) {
        // Crossed finish line!
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
  
  // Custom Render for names and trap icons
  Events.on(pbRender, 'afterRender', () => {
    const ctx = pbRender.context;
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Draw ball names
    Object.values(pbBalls).forEach(b => {
      ctx.fillStyle = '#fff';
      let t = b.plugin.name;
      if (t.length > 4) t = t.substring(0,3) + '..';
      ctx.fillText(t, b.position.x, b.position.y);
    });

    // Draw trap names
    Object.values(pbTraps).forEach(t => {
      ctx.fillStyle = '#fff';
      ctx.font = '10px Arial';
      ctx.fillText(t.plugin.ownerName, t.position.x, t.position.y + 20);
    });
    
    // Draw start line text
    ctx.fillStyle = '#2c3e50';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('🟢 START 🟢', width/2, 50);

    // Draw finish line text
    ctx.fillStyle = '#2c3e50';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('🏁 FINISH LINE 🏁', width/2, height - 10);
    
    // Draw preview trap
    if (window.pbPreviewX != null && window.pbPreviewY != null && pbState.status === 'lobby') {
      ctx.globalAlpha = 0.5;
      ctx.translate(window.pbPreviewX, window.pbPreviewY);
      if (selectedTrapType === 'speed') {
        ctx.fillStyle = '#2ecc71';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        // Triangle pointing down
        ctx.moveTo(0, 15);
        ctx.lineTo(-15, -15);
        ctx.lineTo(15, -15);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = '#e74c3c';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      }
      ctx.translate(-window.pbPreviewX, -window.pbPreviewY);
      ctx.globalAlpha = 1.0;
    }
  });

  Render.run(pbRender);
  pbRunner = Runner.create();
  Runner.run(pbRunner, pbEngine);
  console.log('[Pinball] Engine started successfully');
}

function updatePinballTraps(trapsData) {
  if (!pbEngine) return;
  const { World, Bodies, Composite } = Matter;
  
  // Remove old traps
  const currentTrapBodies = Object.values(pbTraps);
  if (currentTrapBodies.length > 0) {
    World.remove(pbEngine.world, currentTrapBodies);
  }
  pbTraps = {};

  trapsData.forEach(t => {
    let body;
    if (t.type === 'speed') {
      body = Bodies.polygon(t.x, t.y, 3, 20, { 
        isStatic: true, 
        angle: Math.PI, // Pointing down
        render: { fillStyle: '#2ecc71', strokeStyle: '#fff', lineWidth: 2 },
        plugin: { isTrap: true, trapType: 'speed', ownerName: t.name },
        restitution: 0.8
      });
    } else {
      body = Bodies.circle(t.x, t.y, 15, { 
        isStatic: true,
        render: { fillStyle: '#e74c3c', strokeStyle: '#fff', lineWidth: 2 },
        plugin: { isTrap: true, trapType: 'slow', ownerName: t.name },
        friction: 1, restitution: 0.1
      });
    }
    pbTraps[t.uid] = body;
  });
  
  World.add(pbEngine.world, Object.values(pbTraps));
}

function dropBalls(pool) {
  console.log('[Pinball] dropBalls called with pool:', pool, 'pbEngine:', !!pbEngine);
  if (!pbEngine) {
    console.error('[Pinball] ERROR: pbEngine is null, cannot drop balls!');
    return;
  }
  const { World, Bodies } = Matter;
  
  // Remove existing balls
  const currentBalls = Object.values(pbBalls);
  if (currentBalls.length > 0) {
    World.remove(pbEngine.world, currentBalls);
  }
  pbBalls = {};
  
  const width = pbRender.options.width;
  
  pool.forEach((name, idx) => {
    // Distribute along the top
    const x = 50 + (Math.random() * (width - 100));
    const y = -50 - (Math.random() * 200); // Random height so they don't all drop perfectly synchronously
    
    const colors = ['#3498db', '#e67e22', '#9b59b6', '#1abc9c', '#f39c12'];
    const color = colors[idx % colors.length];
    
    const ball = Bodies.circle(x, y, 16, {
      restitution: 0.6,
      friction: 0.05,
      density: 0.04,
      render: { fillStyle: color, strokeStyle: '#fff', lineWidth: 2 },
      plugin: { isBall: true, name: name }
    });
    
    pbBalls[name] = ball;
  });
  
  World.add(pbEngine.world, Object.values(pbBalls));
}

function bindPinballSocket(s) {
  console.log('[Pinball] bindPinballSocket called');
  s.on('pinball_state', (state) => {
    console.log('[Pinball] pinball_state received:', JSON.stringify({status: state.status, poolLen: state.pool?.length, trapsLen: state.traps?.length, finishedLen: state.finished?.length}));
    const prevStatus = pbState.status;
    pbState = state;
    
    // Re-fetch DOM elements (they may not have existed when pinball.js first loaded)
    if (!pinballTrapUi) pinballTrapUi = document.getElementById('pinball-trap-ui');
    if (!pinballSpectatorUi) pinballSpectatorUi = document.getElementById('pinball-spectator-ui');
    if (!pinballContainer) pinballContainer = document.getElementById('pinball-container');
    if (!pinballCanvasWrapper) pinballCanvasWrapper = document.getElementById('pinball-canvas-wrapper');
    
    // Manage UI
    if (state.status === 'lobby') {
      if (pinballTrapUi) pinballTrapUi.classList.remove('hidden');
      if (pinballSpectatorUi) pinballSpectatorUi.classList.remove('hidden');
      const myName = (window.currentUser && window.currentUser.displayName) || '';
      if (pinballSpectatorUi) {
        if (state.pool.includes(myName)) {
          pinballSpectatorUi.innerText = `準備中 (已加入名單：${state.pool.length}人)`;
        } else if (window.globalIsSuperAdmin) {
          pinballSpectatorUi.innerText = `準備中 (目前名單：${state.pool.length}人)`;
        } else {
          pinballSpectatorUi.innerText = `準備中... (您尚未加入名單)`;
        }
      }
      
      // Update pool display in admin panel
      const pinballPoolCount = document.getElementById('pinball-pool-count');
      if (pinballPoolCount) pinballPoolCount.innerText = state.pool.length;
      const pinballPoolList = document.getElementById('pinball-pool-list');
      if (pinballPoolList) {
        pinballPoolList.innerHTML = '';
        state.pool.forEach(name => {
          const span = document.createElement('span');
          span.style.cssText = 'background: #3498db; color: white; padding: 2px 6px; border-radius: 10px; font-size: 10px;';
          span.innerText = name;
          pinballPoolList.appendChild(span);
        });
      }
      console.log('[Pinball] Pool names:', state.pool.join(', '));
      
      initPinballEngine();
      updatePinballTraps(state.traps);
      
      // Clear balls if we returned to lobby
      if (prevStatus === 'playing' && pbEngine) {
        const { World } = Matter;
        World.remove(pbEngine.world, Object.values(pbBalls));
        pbBalls = {};
        const pPanel = document.getElementById('room-participants-panel');
        if (pPanel) pPanel.classList.remove('hidden');
      }
      
    } else if (state.status === 'playing') {
      if (pinballTrapUi) pinballTrapUi.classList.add('hidden');
      if (pinballSpectatorUi) {
        pinballSpectatorUi.classList.remove('hidden');
        pinballSpectatorUi.innerText = '🏁 比賽開始 🏁';
      }
      
      const pPanel = document.getElementById('room-participants-panel');
      if (pPanel) pPanel.classList.add('hidden');
      
      initPinballEngine();
      updatePinballTraps(state.traps);
      
      if (prevStatus === 'lobby' || prevStatus === 'idle') {
        console.log('[Pinball] Transition to playing! Pool:', state.pool, 'pbEngine exists:', !!pbEngine);
        // Do countdown
        const countdownEl = document.getElementById('pinball-countdown');
        if (countdownEl) {
          countdownEl.classList.remove('hidden');
          countdownEl.innerText = '3';
          setTimeout(() => countdownEl.innerText = '2', 1000);
          setTimeout(() => countdownEl.innerText = '1', 2000);
          setTimeout(() => {
            countdownEl.innerText = 'GO!';
            setTimeout(() => countdownEl.classList.add('hidden'), 1000);
            console.log('[Pinball] Dropping balls now for pool:', state.pool);
            dropBalls(state.pool);
          }, 3000);
        } else {
          console.log('[Pinball] No countdown element, dropping balls immediately');
          dropBalls(state.pool);
        }
      }
      
      // Check for winner
      if (state.finished.length > 0) {
        // Someone finished!
        const winner = state.finished[0];
        if (pinballSpectatorUi) pinballSpectatorUi.innerText = `🏆 冠軍：${winner}！`;
        
        // Show big announcement
        var lotteryWinnerAnnouncement = document.getElementById('lottery-winner-announcement');
        var lotteryWinnerName = document.getElementById('lottery-winner-name');
        if (lotteryWinnerAnnouncement && lotteryWinnerName) {
          lotteryWinnerName.innerText = winner;
          lotteryWinnerAnnouncement.classList.remove('hidden');
          setTimeout(() => {
            lotteryWinnerAnnouncement.classList.add('hidden');
          }, 5000);
        }
        
        // Switch tab
        const tabWinners = document.getElementById('tab-winners');
        if (tabWinners) tabWinners.click();
        
        confetti({ particleCount: 150, spread: 100, origin: { y: 0.5 } });
      }
    } else {
      // idle
      if (pinballTrapUi) pinballTrapUi.classList.add('hidden');
      if (pinballSpectatorUi) pinballSpectatorUi.classList.add('hidden');
    }
  });
}
