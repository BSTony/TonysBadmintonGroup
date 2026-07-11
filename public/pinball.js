// pinball.js - Pinball Race Engine

let pbEngine, pbRender, pbRunner;
let pbBalls = {};
let pbTraps = {};
let pbState = { status: 'idle', pool: [], traps: [], finished: [], winnerLimit: 3, itemChoices: {} };
let selectedItemType = null; // Local preview tracking

// DOM Elements
var pinballContainer = pinballContainer || document.getElementById('pinball-container');
var pinballCanvasWrapper = pinballCanvasWrapper || document.getElementById('pinball-canvas-wrapper');
var pinballItemSelectionUi = document.getElementById('pinball-item-selection-ui');
var pinballStatusOverlay = document.getElementById('pinball-status-overlay');
var pinballStatusText = document.getElementById('pinball-status-text');
var pinballStatusTimer = document.getElementById('pinball-status-timer');
var pinballSpectatorUi = pinballSpectatorUi || document.getElementById('pinball-spectator-ui');

// Item Selection Buttons
var btnItemObstacle = document.getElementById('btn-item-obstacle');
var btnItemBouncer = document.getElementById('btn-item-bouncer');
var btnItemArrow = document.getElementById('btn-item-arrow');
var pinballItemSelectedText = document.getElementById('pinball-item-selected-text');

function selectItem(type, btnObj) {
  if (pbState.status !== 'item_selection') return;
  if (!window.currentUser || !window.currentUser.userId) return;
  
  // Highlight UI
  [btnItemObstacle, btnItemBouncer, btnItemArrow].forEach(b => {
    if (b) {
      b.style.border = '2px solid transparent';
      b.style.opacity = '0.5';
    }
  });
  if (btnObj) {
    btnObj.style.border = '2px solid white';
    btnObj.style.opacity = '1';
  }
  if (pinballItemSelectedText) pinballItemSelectedText.classList.remove('hidden');
  selectedItemType = type;

  // Send to server
  fetch('/api/pinball/select-item', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: window.currentUser.userId,
      type: type
    })
  }).catch(console.error);
}

if (btnItemObstacle) btnItemObstacle.addEventListener('click', () => selectItem('obstacle', btnItemObstacle));
if (btnItemBouncer) btnItemBouncer.addEventListener('click', () => selectItem('bouncer', btnItemBouncer));
if (btnItemArrow) btnItemArrow.addEventListener('click', () => selectItem('arrow', btnItemArrow));

// Wrapper click for item placement
if (pinballCanvasWrapper) {
  pinballCanvasWrapper.addEventListener('click', (e) => {
    if (pbState.status !== 'item_placement') {
      if (pbState.status === 'playing') alert('遊戲已經開始，無法放置道具！');
      else if (pbState.status === 'item_selection') alert('請先在畫面上選擇道具！');
      return;
    }
    if (!window.currentUser || !window.currentUser.userId) return;
    
    // Check if user is in pool or is super admin
    const myName = window.currentUser.displayName;
    const isGlobalSuperAdmin = window.globalIsSuperAdmin === true;
    if (!pbState.pool.includes(myName) && !isGlobalSuperAdmin) {
      alert('您必須先加入名單才能放置道具！');
      return;
    }
    if (!selectedItemType && !pbState.itemChoices[window.currentUser.userId]) {
      alert('您剛才沒有選擇道具！');
      return;
    }

    const rect = pinballCanvasWrapper.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Send API
    fetch('/api/pinball/place-item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: window.currentUser.userId,
        name: myName,
        x: x,
        y: y
      })
    })
    .then(r => r.json())
    .then(data => {
      if (data.error) alert('放置道具失敗：' + data.error);
      else console.log('[Pinball] Item placed');
    })
    .catch(e => alert('發生錯誤，無法放置道具'));
  });

  pinballCanvasWrapper.addEventListener('mousemove', (e) => {
    if (pbState.status !== 'item_placement') return;
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

  // Top funnel (Start point) - with guaranteed 80px gap
  const funnelWidth = width * 0.5;
  const gap = 80;
  const cosAngle = Math.cos(Math.PI * 0.15); // ~0.89
  const funnelLeftX = width/2 - gap/2 - (funnelWidth/2) * cosAngle;
  const funnelRightX = width/2 + gap/2 + (funnelWidth/2) * cosAngle;

  const funnelLeft = Bodies.rectangle(funnelLeftX, 150, funnelWidth, 20, { isStatic: true, angle: Math.PI*0.15, render: { fillStyle: '#34495e' } });
  const funnelRight = Bodies.rectangle(funnelRightX, 150, funnelWidth, 20, { isStatic: true, angle: -Math.PI*0.15, render: { fillStyle: '#34495e' } });
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
        if (trap.plugin.trapType === 'arrow') {
          // Apply force in the direction of the arrow
          const angle = trap.plugin.angle || 0;
          const forceMag = 0.015; // strong boost
          Body.applyForce(ball, ball.position, { 
            x: Math.cos(angle) * forceMag, 
            y: Math.sin(angle) * forceMag 
          });
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
    if (window.pbPreviewX != null && window.pbPreviewY != null && pbState.status === 'item_placement') {
      const typeToDraw = selectedItemType || (pbState.itemChoices[window.currentUser?.userId]?.type);
      if (typeToDraw) {
        ctx.globalAlpha = 0.5;
        ctx.translate(window.pbPreviewX, window.pbPreviewY);
        
        if (typeToDraw === 'obstacle') {
          ctx.fillStyle = '#e74c3c';
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.fillRect(-20, -10, 40, 20);
          ctx.strokeRect(-20, -10, 40, 20);
        } else if (typeToDraw === 'bouncer') {
          ctx.fillStyle = '#3498db';
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, 15, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();
        } else if (typeToDraw === 'arrow') {
          ctx.fillStyle = '#2ecc71';
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          const previewAngle = pbState.itemChoices[window.currentUser?.userId]?.angle || -Math.PI/2;
          ctx.rotate(previewAngle);
          ctx.beginPath();
          ctx.moveTo(15, 0);
          ctx.lineTo(-10, -10);
          ctx.lineTo(-10, 10);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.rotate(-previewAngle);
        }
        
        ctx.translate(-window.pbPreviewX, -window.pbPreviewY);
        ctx.globalAlpha = 1.0;
      }
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
    if (t.type === 'obstacle') {
      body = Bodies.rectangle(t.x, t.y, 40, 20, { 
        isStatic: true, 
        render: { fillStyle: '#e74c3c', strokeStyle: '#fff', lineWidth: 2 },
        plugin: { isTrap: true, trapType: 'obstacle', ownerName: t.name },
        restitution: 0.2
      });
    } else if (t.type === 'bouncer') {
      body = Bodies.circle(t.x, t.y, 15, { 
        isStatic: true,
        render: { fillStyle: '#3498db', strokeStyle: '#fff', lineWidth: 2 },
        plugin: { isTrap: true, trapType: 'bouncer', ownerName: t.name },
        restitution: 1.5 // High bounce
      });
    } else if (t.type === 'arrow') {
      body = Bodies.polygon(t.x, t.y, 3, 20, { 
        isStatic: true,
        isSensor: true, // Only detect collision, no physical blocking
        angle: t.angle || 0,
        render: { fillStyle: '#2ecc71', strokeStyle: '#fff', lineWidth: 2 },
        plugin: { isTrap: true, trapType: 'arrow', ownerName: t.name, angle: t.angle || 0 }
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
    if (!pinballItemSelectionUi) pinballItemSelectionUi = document.getElementById('pinball-item-selection-ui');
    if (!pinballStatusOverlay) pinballStatusOverlay = document.getElementById('pinball-status-overlay');
    if (!pinballStatusText) pinballStatusText = document.getElementById('pinball-status-text');
    if (!pinballStatusTimer) pinballStatusTimer = document.getElementById('pinball-status-timer');
    if (!pinballSpectatorUi) pinballSpectatorUi = document.getElementById('pinball-spectator-ui');
    if (!pinballContainer) pinballContainer = document.getElementById('pinball-container');
    if (!pinballCanvasWrapper) pinballCanvasWrapper = document.getElementById('pinball-canvas-wrapper');
    
    // ==========================================
    // 1. ALWAYS Update Lists (Lobby & Playing)
    // ==========================================
    const pinballPoolCount = document.getElementById('pinball-pool-count');
    if (pinballPoolCount) pinballPoolCount.innerText = state.pool.length;
    
    const pinballPoolList = document.getElementById('pinball-pool-list');
    const roomPoolDisplayList = document.getElementById('room-pool-display-list');
    const roomResultList = document.getElementById('room-result-list');
    
    // Preserve scroll positions
    const oldPoolScroll = roomPoolDisplayList ? roomPoolDisplayList.scrollTop : 0;
    const oldResultScroll = roomResultList ? roomResultList.scrollTop : 0;
    
    if (pinballPoolList) pinballPoolList.innerHTML = '';
    if (roomPoolDisplayList) roomPoolDisplayList.innerHTML = '';
    if (roomResultList) roomResultList.innerHTML = '';
    
    state.pool.forEach(name => {
      // For admin panel
      if (pinballPoolList) {
        const span = document.createElement('span');
        span.style.cssText = 'background: #3498db; color: white; padding: 2px 6px; border-radius: 10px; font-size: 10px; margin: 2px;';
        span.innerText = name;
        pinballPoolList.appendChild(span);
      }
      // For right side panel
      if (roomPoolDisplayList) {
        const li = document.createElement('li');
        li.style.cssText = 'padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; gap: 10px;';
        li.innerHTML = `<span style="font-size: 20px;">🕹️</span><span style="font-size: 16px;">${name}</span>`;
        roomPoolDisplayList.appendChild(li);
      }
    });
    
    // For winners panel
    state.finished.forEach((name, idx) => {
      if (roomResultList) {
        const li = document.createElement('li');
        const isWinner = idx < (state.winnerLimit || 3);
        const color = isWinner ? '#f1c40f' : '#ccc';
        const fontWeight = isWinner ? 'bold' : 'normal';
        li.style.cssText = `padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; gap: 10px; color: ${color};`;
        
        let rankStr = '';
        if (isWinner) {
          rankStr = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🏅';
        } else {
          rankStr = `<span style="display:inline-block; width:20px; text-align:center; font-size:14px;">${idx + 1}</span>`;
        }
        
        li.innerHTML = `<span style="font-size: 20px;">${rankStr}</span><span style="font-size: 16px; font-weight: ${fontWeight};">${name}</span>`;
        roomResultList.appendChild(li);
      }
    });
    
    // Restore scroll positions
    if (roomPoolDisplayList) roomPoolDisplayList.scrollTop = oldPoolScroll;
    if (roomResultList) roomResultList.scrollTop = oldResultScroll;
    
    console.log('[Pinball] Pool:', state.pool.join(', '), 'Finished:', state.finished.join(', '));
    
    // ==========================================
    // 2. Manage UI based on status
    // ==========================================
    const roomAdminPanel = document.getElementById('room-admin-panel');
    const roomParticipantsPanel = document.getElementById('room-participants-panel');

    // Hide selection UI by default
    if (pinballItemSelectionUi) pinballItemSelectionUi.classList.add('hidden');
    if (pinballStatusOverlay) pinballStatusOverlay.classList.add('hidden');
    
    if (state.status === 'lobby') {
      if (roomAdminPanel) roomAdminPanel.classList.remove('hidden');
      if (roomParticipantsPanel) roomParticipantsPanel.classList.remove('hidden');
      if (pinballSpectatorUi) {
        pinballSpectatorUi.classList.remove('hidden');
        pinballSpectatorUi.innerText = '等待遊戲開始...';
      }
      updatePinballTraps(state.traps);
      
      // Clear balls if we returned to lobby
      if (prevStatus === 'playing' && pbEngine) {
        const { World } = Matter;
        World.remove(pbEngine.world, Object.values(pbBalls));
        pbBalls = {};
      }
      
    } else if (state.status === 'item_selection') {
      if (roomAdminPanel) roomAdminPanel.classList.add('hidden');
      if (roomParticipantsPanel) roomParticipantsPanel.classList.add('hidden');
      if (pinballSpectatorUi) pinballSpectatorUi.classList.add('hidden');
      if (pinballItemSelectionUi) pinballItemSelectionUi.classList.remove('hidden');
      
      if (pinballStatusOverlay && pinballStatusText && pinballStatusTimer) {
        pinballStatusOverlay.classList.remove('hidden');
        pinballStatusText.innerText = '選擇專屬道具！';
        let timeLeft = 10;
        pinballStatusTimer.innerText = timeLeft;
        if (window.pinballTimerInterval) clearInterval(window.pinballTimerInterval);
        window.pinballTimerInterval = setInterval(() => {
          timeLeft--;
          if (timeLeft >= 0) pinballStatusTimer.innerText = timeLeft;
        }, 1000);
      }
      
    } else if (state.status === 'item_placement') {
      if (roomAdminPanel) roomAdminPanel.classList.add('hidden');
      if (roomParticipantsPanel) roomParticipantsPanel.classList.add('hidden');
      if (pinballSpectatorUi) pinballSpectatorUi.classList.add('hidden');
      
      if (pinballStatusOverlay && pinballStatusText && pinballStatusTimer) {
        pinballStatusOverlay.classList.remove('hidden');
        pinballStatusText.innerText = '點擊畫面佈置道具！';
        let timeLeft = 10;
        pinballStatusTimer.innerText = timeLeft;
        if (window.pinballTimerInterval) clearInterval(window.pinballTimerInterval);
        window.pinballTimerInterval = setInterval(() => {
          timeLeft--;
          if (timeLeft >= 0) pinballStatusTimer.innerText = timeLeft;
        }, 1000);
      }
      
      updatePinballTraps(state.traps);
      
    } else if (state.status === 'playing') {
      if (window.pinballTimerInterval) clearInterval(window.pinballTimerInterval);
      if (roomAdminPanel) roomAdminPanel.classList.add('hidden');
      // Show participants panel during game to see rankings
      if (roomParticipantsPanel) roomParticipantsPanel.classList.remove('hidden');
      
      if (pinballSpectatorUi) {
        pinballSpectatorUi.classList.remove('hidden');
        pinballSpectatorUi.innerText = '🏁 比賽開始 🏁';
      }
      
      initPinballEngine();
      updatePinballTraps(state.traps);
      
      if (prevStatus === 'item_placement' || prevStatus === 'lobby') {
        console.log('[Pinball] Transition to playing! Pool:', state.pool);
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
            dropBalls(state.pool);
          }, 3000);
        } else {
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
      if (pinballItemSelectionUi) pinballItemSelectionUi.classList.add('hidden');
      if (pinballStatusOverlay) pinballStatusOverlay.classList.add('hidden');
      if (pinballSpectatorUi) pinballSpectatorUi.classList.add('hidden');
    }
  });
}
