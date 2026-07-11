const lotteryCanvasContainer = document.getElementById('lottery-canvas-container');
const lotteryViewOverlay = document.getElementById('lottery-view-overlay');
const lotteryResultList = document.getElementById('lottery-result-list');
const btnCloseLottery = document.getElementById('btn-close-lottery');

const lotteryInteractionUi = document.getElementById('lottery-interaction-ui');
const lotteryForceBar = document.getElementById('lottery-force-bar');
const lotterySpectatorUi = document.getElementById('lottery-spectator-ui');
const lotteryHintText = document.getElementById('lottery-hint-text');

let engine, render, runner;
let balls = [];
let isDrawing = false;
let currentLotteryState = { status: 'idle', pool: [], drawn: [], assigneeUid: null, drawCount: 1 };
let myUid = ''; // will be set from app.js when initialized

// Interaction variables
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragCurrentX = 0;
let dragCurrentY = 0;

function initLottery(uid) {
  myUid = uid;
  
  if (btnCloseLottery) {
    btnCloseLottery.addEventListener('click', () => {
      lotteryViewOverlay.classList.add('hidden');
    });
  }

  // Pointer events for force/direction
  lotteryViewOverlay.addEventListener('pointerdown', (e) => {
    if (currentLotteryState.status === 'ready' && currentLotteryState.assigneeUid === myUid) {
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragCurrentX = e.clientX;
      dragCurrentY = e.clientY;
      updateForceBar();
    }
  });

  lotteryViewOverlay.addEventListener('pointermove', (e) => {
    if (isDragging) {
      dragCurrentX = e.clientX;
      dragCurrentY = e.clientY;
      updateForceBar();
    }
  });

  lotteryViewOverlay.addEventListener('pointerup', (e) => {
    if (isDragging) {
      isDragging = false;
      const dx = dragStartX - dragCurrentX;
      const dy = dragStartY - dragCurrentY;
      const distance = Math.sqrt(dx*dx + dy*dy);
      
      // Calculate force based on drag distance, capped
      const maxDist = 300;
      let force = Math.min(distance / maxDist, 1.0);
      
      if (force > 0.1) {
        // Send to server
        const dirLen = Math.sqrt(dx*dx + dy*dy) || 1;
        socket.emit('lottery_perform_draw', {
          uid: myUid,
          force: force,
          dirX: dx / dirLen,
          dirY: dy / dirLen
        });
        lotteryForceBar.style.width = '0%';
        lotteryHintText.innerText = '🌪️ 發射！';
      } else {
        lotteryForceBar.style.width = '0%';
      }
    }
  });
}

function updateForceBar() {
  const dx = dragStartX - dragCurrentX;
  const dy = dragStartY - dragCurrentY;
  const distance = Math.sqrt(dx*dx + dy*dy);
  const maxDist = 300;
  const force = Math.min(distance / maxDist, 1.0);
  lotteryForceBar.style.width = `${force * 100}%`;
}

function updateLotteryUI() {
  if (!currentLotteryState || currentLotteryState.status === 'idle') {
    lotteryViewOverlay.classList.add('hidden');
    return;
  }
  
  lotteryViewOverlay.classList.remove('hidden');
  
  if (currentLotteryState.status === 'ready') {
    if (currentLotteryState.assigneeUid === myUid) {
      lotteryInteractionUi.classList.remove('hidden');
      lotterySpectatorUi.classList.add('hidden');
      lotteryHintText.innerText = `在畫面中滑動來產生風力🌪️ (將抽出 ${currentLotteryState.drawCount} 人)`;
    } else if (currentLotteryState.assigneeUid) {
      lotteryInteractionUi.classList.add('hidden');
      lotterySpectatorUi.classList.remove('hidden');
      lotterySpectatorUi.innerText = `等待抽籤者操作中... (將抽出 ${currentLotteryState.drawCount} 人)`;
    } else {
      lotteryInteractionUi.classList.add('hidden');
      lotterySpectatorUi.classList.remove('hidden');
      lotterySpectatorUi.innerText = '等待管理員指派抽籤者...';
    }
  } else if (currentLotteryState.status === 'drawing') {
    lotteryInteractionUi.classList.add('hidden');
    lotterySpectatorUi.classList.remove('hidden');
    lotterySpectatorUi.innerText = '🌪️ 抽籤中 🌪️';
  }

  // Update Results
  lotteryResultList.innerHTML = '';
  currentLotteryState.drawn.forEach((name, idx) => {
    const li = document.createElement('li');
    li.style.padding = '8px';
    li.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
    li.style.display = 'flex';
    li.style.justifyContent = 'space-between';
    
    const rankSpan = document.createElement('span');
    rankSpan.innerText = `#${idx + 1}`;
    rankSpan.style.color = '#f1c40f';
    rankSpan.style.fontWeight = 'bold';
    
    const nameSpan = document.createElement('span');
    nameSpan.innerText = name;
    
    li.appendChild(rankSpan);
    li.appendChild(nameSpan);
    lotteryResultList.appendChild(li);
  });
}

function setupMatterJS() {
  if (engine) {
    Matter.Render.stop(render);
    Matter.Runner.stop(runner);
    Matter.Engine.clear(engine);
    lotteryCanvasContainer.innerHTML = '';
    // Append the UI divs back because innerHTML clear removes them
    lotteryCanvasContainer.appendChild(lotteryInteractionUi);
    lotteryCanvasContainer.appendChild(lotterySpectatorUi);
  }

  const { Engine, Render, Runner, World, Bodies, Body, Composite, Events } = Matter;
  
  engine = Engine.create();
  engine.gravity.y = 0.5; // Slight gravity

  const width = lotteryCanvasContainer.clientWidth;
  const height = lotteryCanvasContainer.clientHeight || window.innerHeight * 0.5;
  const radius = Math.min(width, height) / 2 - 20;
  const cx = width / 2;
  const cy = height / 2;

  render = Render.create({
    element: lotteryCanvasContainer,
    engine: engine,
    options: {
      width,
      height,
      wireframes: false,
      background: 'transparent'
    }
  });

  // Create Circular Boundary using multiple static rectangles
  const boundaryParts = [];
  const segments = 36;
  const thickness = 40;
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const x = cx + Math.cos(angle) * (radius + thickness/2);
    const y = cy + Math.sin(angle) * (radius + thickness/2);
    const rect = Bodies.rectangle(x, y, thickness, Math.PI * 2 * radius / segments * 1.2, {
      isStatic: true,
      angle: angle,
      render: {
        fillStyle: 'rgba(255, 255, 255, 0.1)',
        strokeStyle: 'rgba(255,255,255,0.3)',
        lineWidth: 1
      }
    });
    boundaryParts.push(rect);
  }
  
  // "Tube" for drawing balls (at the top)
  const tubeWidth = 60;
  const tubeHeight = 100;
  const tubeLeft = Bodies.rectangle(cx - tubeWidth/2, cy - radius - tubeHeight/2, 10, tubeHeight, { isStatic: true, render: { fillStyle: 'rgba(255,255,255,0.5)' } });
  const tubeRight = Bodies.rectangle(cx + tubeWidth/2, cy - radius - tubeHeight/2, 10, tubeHeight, { isStatic: true, render: { fillStyle: 'rgba(255,255,255,0.5)' } });
  
  World.add(engine.world, [...boundaryParts, tubeLeft, tubeRight]);

  // Create Balls
  balls = [];
  const undrawnPool = currentLotteryState.pool.filter(n => !currentLotteryState.drawn.includes(n));
  
  undrawnPool.forEach((name, i) => {
    const ballRadius = Math.max(15, Math.min(30, 200 / Math.sqrt(undrawnPool.length)));
    
    // Spread balls around the center
    const spawnAngle = Math.random() * Math.PI * 2;
    const spawnRadius = Math.random() * (radius - ballRadius * 2);
    const bx = cx + Math.cos(spawnAngle) * spawnRadius;
    const by = cy + Math.sin(spawnAngle) * spawnRadius;
    
    // Rainbow colors
    const hue = Math.floor(Math.random() * 360);
    
    const ball = Bodies.circle(bx, by, ballRadius, {
      restitution: 0.9, // very bouncy
      frictionAir: 0.01,
      density: 0.05,
      render: {
        fillStyle: `hsl(${hue}, 80%, 60%)`,
        strokeStyle: '#ffffff',
        lineWidth: 2
      },
      plugin: { name: name } // Custom property
    });
    balls.push(ball);
  });
  
  World.add(engine.world, balls);

  // Custom Rendering for text on balls
  Events.on(render, 'afterRender', function() {
    const context = render.context;
    context.font = 'bold 12px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    
    balls.forEach(ball => {
      context.fillStyle = '#ffffff';
      context.shadowColor = 'rgba(0,0,0,0.5)';
      context.shadowBlur = 4;
      // Truncate name if too long
      let nameText = ball.plugin.name;
      if (nameText.length > 4) nameText = nameText.substring(0, 3) + '..';
      context.fillText(nameText, ball.position.x, ball.position.y);
      context.shadowBlur = 0; // reset
    });
    
    // Draw Glass effect
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    const gradient = context.createRadialGradient(cx - radius*0.3, cy - radius*0.3, radius*0.1, cx, cy, radius);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = gradient;
    context.fill();
  });

  Render.run(render);
  runner = Runner.create();
  Runner.run(runner, engine);
}

function startDrawAnimation(force, dirX, dirY, count) {
  if (!engine) return;
  
  const { Body, Composite } = Matter;
  
  // Apply a massive force to all balls to simulate "wind" / "explosion"
  const explosionForce = force * 0.05; // Adjust based on ball mass
  balls.forEach(ball => {
    // Add random jitter to direction
    const rx = dirX + (Math.random() - 0.5) * 0.5;
    const ry = dirY + (Math.random() - 0.5) * 0.5;
    Body.applyForce(ball, ball.position, {
      x: rx * explosionForce * ball.mass,
      y: ry * explosionForce * ball.mass
    });
  });

  // After 2 seconds of bouncing, we pick the winners
  setTimeout(() => {
    // If I am the assignee, I calculate the result and send it to server
    if (currentLotteryState.assigneeUid === myUid) {
      // Pick top N balls (e.g. highest Y position or random)
      // Let's just pick N random balls for fairness, or the ones closest to the top tube
      const width = lotteryCanvasContainer.clientWidth;
      const height = lotteryCanvasContainer.clientHeight || window.innerHeight * 0.5;
      const targetPoint = { x: width/2, y: height/2 - (Math.min(width, height) / 2) }; // Top of sphere
      
      const sortedBalls = [...balls].sort((a, b) => {
        const da = Math.pow(a.position.x - targetPoint.x, 2) + Math.pow(a.position.y - targetPoint.y, 2);
        const db = Math.pow(b.position.x - targetPoint.x, 2) + Math.pow(b.position.y - targetPoint.y, 2);
        return da - db; // closest first
      });
      
      const winners = sortedBalls.slice(0, count).map(b => b.plugin.name);
      
      socket.emit('lottery_result_computed', {
        uid: myUid,
        drawnNames: winners
      });
    }
  }, 2000);
}

// Socket Listeners
socket.on('lottery_state', (state) => {
  const previousStatus = currentLotteryState.status;
  const previousDrawnCount = currentLotteryState.drawn.length;
  currentLotteryState = state;
  updateLotteryUI();
  
  if (state.status === 'ready' && previousStatus !== 'ready') {
    // Setup physics when becoming ready
    setupMatterJS();
  } else if (state.status === 'ready' && previousStatus === 'drawing') {
    // Transition from drawing to ready -> show winner celebration
    const newlyDrawn = state.drawn.slice(previousDrawnCount);
    if (newlyDrawn.length > 0) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
      // Re-setup to remove drawn balls
      setupMatterJS();
    }
  }
});

socket.on('lottery_draw_started', (data) => {
  // data: { force, dirX, dirY, count }
  startDrawAnimation(data.force, data.dirX, data.dirY, data.count);
});
