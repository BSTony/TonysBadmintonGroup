const io = require('socket.io-client');
const http = require('http');

async function runTest() {
  console.log('--- Starting Pinball Sync Verification Test ---');

  const clientAdmin = io('http://localhost:3000', { reconnection: false });
  const clientPlayer = io('http://localhost:3000', { reconnection: false });

  await new Promise((resolve) => {
    let connected = 0;
    const check = () => { if (++connected === 2) resolve(); };
    clientAdmin.on('connect', () => { console.log('Admin socket connected:', clientAdmin.id); check(); });
    clientPlayer.on('connect', () => { console.log('Player socket connected:', clientPlayer.id); check(); });
  });

  // Join pinball with 3 players
  clientAdmin.emit('join_pinball', { name: 'PlayerA' });
  clientPlayer.emit('join_pinball', { name: 'PlayerB' });
  clientAdmin.emit('join_pinball', { name: 'PlayerC' });

  await new Promise(r => setTimeout(r, 1000));

  let adminSnapshots = [];
  let playerSnapshots = [];

  clientAdmin.on('pinball_host_sync', (data) => {
    adminSnapshots.push(data);
  });

  clientPlayer.on('pinball_host_sync', (data) => {
    playerSnapshots.push(data);
  });

  let adminFinished = [];
  let playerFinished = [];

  clientAdmin.on('pinball_state', (state) => {
    if (state.finished && state.finished.length > 0) {
      adminFinished = [...state.finished];
    }
  });

  clientPlayer.on('pinball_state', (state) => {
    if (state.finished && state.finished.length > 0) {
      playerFinished = [...state.finished];
    }
  });

  // Post start sequence as superadmin
  console.log('Sending start-sequence request...');
  const postData = JSON.stringify({
    uid: 'U_SUPER_ADMIN_TEST_ID_TESTER',
    winnerLimit: 3,
    allowControls: true,
    socketId: clientAdmin.id,
    mode: 'downhill'
  });

  const req = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/admin/pinball/start-sequence',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  }, (res) => {
    console.log('start-sequence HTTP status:', res.statusCode);
  });
  req.write(postData);
  req.end();

  // Wait 16 seconds for countdown (5s instruction + 5s track countdown) + 6s race
  console.log('Waiting for race to start and sync snapshots to broadcast (16s)...');
  await new Promise(r => setTimeout(r, 16000));

  console.log(`Admin received ${adminSnapshots.length} snapshots.`);
  console.log(`Player received ${playerSnapshots.length} snapshots.`);

  if (adminSnapshots.length === 0 || playerSnapshots.length === 0) {
    console.error('FAIL: No snapshots received!');
    process.exit(1);
  }

  // Verify that the snapshots match
  const checkCount = Math.min(adminSnapshots.length, playerSnapshots.length);
  let mismatches = 0;
  for (let i = 0; i < checkCount; i++) {
    const a = adminSnapshots[i];
    const p = playerSnapshots[i];
    if (a.t !== p.t || JSON.stringify(a.syncData) !== JSON.stringify(p.syncData)) {
      mismatches++;
    }
  }

  if (mismatches > 0) {
    console.error(`FAIL: ${mismatches} snapshot mismatches detected between Admin and Player!`);
    process.exit(1);
  }

  console.log(`SUCCESS: All ${checkCount} sampled snapshots between Admin and Player were 100% IDENTICAL!`);

  // Reset room back to lobby
  const resetData = JSON.stringify({ uid: 'U_SUPER_ADMIN_TEST_ID_TESTER' });
  const resetReq = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/admin/pinball/reset',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(resetData)
    }
  });
  resetReq.write(resetData);
  resetReq.end();

  clientAdmin.disconnect();
  clientPlayer.disconnect();

  console.log('--- Test Completed Successfully ---');
  process.exit(0);
}

runTest().catch(err => {
  console.error('Error during test:', err);
  process.exit(1);
});
