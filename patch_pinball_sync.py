import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Inject emit for Super Admin in syncBalls
# Find syncBalls(state)
target_sync = r"function syncBalls(state) {"
replacement_sync = r"""function syncBalls(state) {
    if (typeof globalIsSuperAdmin !== 'undefined' && globalIsSuperAdmin) {
      if (window.pinballSyncInterval) clearInterval(window.pinballSyncInterval);
      window.pinballSyncInterval = setInterval(() => {
        if (pbState && pbState.status === 'playing' && pbBalls) {
          const syncData = {};
          let hasBalls = false;
          for (const name in pbBalls) {
             const b = pbBalls[name];
             if (b && b.position) {
               syncData[name] = { x: b.position.x, y: b.position.y, vx: b.velocity.x, vy: b.velocity.y, a: b.angle, av: b.angularVelocity };
               hasBalls = true;
             }
          }
          if (hasBalls && typeof pinballSocket !== 'undefined') pinballSocket.emit('pinball_host_sync', syncData);
        }
      }, 100);
    }
"""

content = content.replace(target_sync, replacement_sync)

# 2. Inject listener in bindPinballSocket
target_bind = r"    s.on('pinball_ball_moved', (data) => {"
replacement_bind = r"""    s.on('pinball_host_sync', (data) => {
      // Ignore if I am the host (super admin)
      if (typeof globalIsSuperAdmin !== 'undefined' && globalIsSuperAdmin) return;
      if (pbState && pbState.status === 'playing' && pbBalls) {
        for (const name in data) {
          if (pbBalls[name]) {
             const sd = data[name];
             Matter.Body.setPosition(pbBalls[name], { x: sd.x, y: sd.y });
             Matter.Body.setVelocity(pbBalls[name], { x: sd.vx, y: sd.vy });
             Matter.Body.setAngle(pbBalls[name], sd.a);
             Matter.Body.setAngularVelocity(pbBalls[name], sd.av);
          }
        }
      }
    });

    s.on('pinball_ball_moved', (data) => {"""

content = content.replace(target_bind, replacement_bind)

# 3. Clear interval on game end/lobby
# let's inject a clearInterval near startRace() or when changing out of playing
target_lobby = r"      if (state.status === 'lobby') {"
replacement_lobby = r"""      if (state.status === 'lobby') {
        if (window.pinballSyncInterval) clearInterval(window.pinballSyncInterval);"""

content = content.replace(target_lobby, replacement_lobby)

with open('public/pinball.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("pinball.js patched for sync")
