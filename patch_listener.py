import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = r"""    s.on('pinball_host_sync', (data) => {
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
"""

content = re.sub(r"(\s*s\.on\('pinball_ball_moved')", "\n" + replacement + r"\1", content)

with open('public/pinball.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Injected listener")
