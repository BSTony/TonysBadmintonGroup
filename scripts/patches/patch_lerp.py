import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update pinball_host_sync to just store targetSync
target_sync = r"""               Matter.Body.setPosition(pbBalls[name], { x: sd.x, y: sd.y });
               Matter.Body.setVelocity(pbBalls[name], { x: sd.vx, y: sd.vy });
               Matter.Body.setAngle(pbBalls[name], sd.a);
               Matter.Body.setAngularVelocity(pbBalls[name], sd.av);"""
replacement_sync = r"""               pbBalls[name].plugin.targetSync = sd;"""
content = content.replace(target_sync, replacement_sync)

# 2. Add interpolation in beforeUpdate
target_update = r"""      if (pbState.status === 'playing') {
        Object.values(pbBalls).forEach(ball => {
          // Apply constant downward push to simulate steep track"""
replacement_update = r"""      if (pbState.status === 'playing') {
        if (typeof globalIsSuperAdmin === 'undefined' || !globalIsSuperAdmin) {
          Object.values(pbBalls).forEach(ball => {
            if (ball.plugin.targetSync) {
              const sd = ball.plugin.targetSync;
              const dx = sd.x - ball.position.x;
              const dy = sd.y - ball.position.y;
              if (Math.abs(dx) > 100 || Math.abs(dy) > 100) {
                Matter.Body.setPosition(ball, { x: sd.x, y: sd.y });
              } else {
                Matter.Body.setPosition(ball, {
                  x: ball.position.x + dx * 0.4,
                  y: ball.position.y + dy * 0.4
                });
              }
              Matter.Body.setVelocity(ball, { x: sd.vx, y: sd.vy });
              const da = sd.a - ball.angle;
              Matter.Body.setAngle(ball, ball.angle + da * 0.4);
              Matter.Body.setAngularVelocity(ball, sd.av);
            }
          });
        }

        Object.values(pbBalls).forEach(ball => {
          // Apply constant downward push to simulate steep track"""
content = content.replace(target_update, replacement_update)

with open('public/pinball.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Patched LERP interpolation")
