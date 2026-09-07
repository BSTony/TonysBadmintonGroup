const io = require('socket.io-client');
const http = require('http');

function postJson(path, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let buf = '';
      res.on('data', chunk => buf += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(buf));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${buf}`));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function testDraggedBallStart() {
  console.log('--- Testing Dragged Ball Preserved Position on Race Start ---');

  const clientAdmin = io('http://localhost:3000', { reconnection: false });
  const clientPlayer = io('http://localhost:3000', { reconnection: false });

  await new Promise((resolve) => {
    let connected = 0;
    const check = () => { if (++connected === 2) resolve(); };
    clientAdmin.on('connect', check);
    clientPlayer.on('connect', check);
  });

  // Open the pinball game room first
  console.log('Opening pinball room...');
  await postJson('/api/admin/room/open', {
    uid: 'U_SUPER_ADMIN_TEST_ID_TESTER',
    gameType: 'pinball'
  });

  await new Promise(r => setTimeout(r, 600));

  // Join pinball players
  console.log('Joining PlayerA and PlayerB...');
  clientAdmin.emit('join_pinball', { name: 'PlayerA' });
  clientPlayer.emit('join_pinball', { name: 'PlayerB' });

  await new Promise(r => setTimeout(r, 800));

  // Custom position moved to the left
  const customX = 220;
  const customY = 600;
  console.log(`PlayerA drags ball to custom position: (${customX}, ${customY})`);
  clientPlayer.emit('pinball_move_ball', { name: 'PlayerA', x: customX, y: customY });

  await new Promise(r => setTimeout(r, 600));

  let firstSnapshot = null;
  clientPlayer.on('pinball_host_sync', (data) => {
    if (!firstSnapshot) {
      firstSnapshot = data.syncData;
    }
  });

  // Start sequence
  console.log('Triggering start-sequence...');
  await postJson('/api/admin/pinball/start-sequence', {
    uid: 'U_SUPER_ADMIN_TEST_ID_TESTER',
    winnerLimit: 2,
    allowControls: true,
    socketId: clientAdmin.id,
    mode: 'downhill'
  });

  // Wait 16 seconds (5s instruction + 5s countdown + race snapshots)
  console.log('Waiting for race countdown and start (16s)...');
  await new Promise(r => setTimeout(r, 16000));

  if (!firstSnapshot || !firstSnapshot['PlayerA']) {
    console.error('FAIL: No snapshot received for PlayerA!');
    process.exit(1);
  }

  const startX = firstSnapshot['PlayerA'].x;
  console.log(`PlayerA start X in server snapshot: ${startX}`);

  // In default grid, PlayerA is at startXOffset ≈ 380-420.
  // We dragged it to 220.
  if (Math.abs(startX - customX) > 25) {
    console.error(`FAIL: PlayerA was pulled back to default grid! Expected ~${customX}, got ${startX}`);
    process.exit(1);
  }

  console.log(`SUCCESS: PlayerA started from its dragged custom position (~${startX}) without snapping back!`);

  // Reset room
  await postJson('/api/admin/pinball/reset', { uid: 'U_SUPER_ADMIN_TEST_ID_TESTER' });

  clientAdmin.disconnect();
  clientPlayer.disconnect();
  console.log('--- Test Passed Successfully ---');
  process.exit(0);
}

testDraggedBallStart().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
