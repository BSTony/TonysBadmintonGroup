import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = r"""          if (ball.speed < 0.5) {
            ball.plugin.stuckFrames = (ball.plugin.stuckFrames || 0) + 1;
            if (ball.plugin.stuckFrames > 40) {
              // Set velocity directly for a guaranteed strong escape burst
              Matter.Body.setVelocity(ball, {
                x: (Math.random() - 0.5) * 10,
                y: -7.5
              });
              ball.plugin.stuckFrames = 0;
            }
          } else {
            ball.plugin.stuckFrames = 0;
          }"""

replacement = r"""          if (typeof globalIsSuperAdmin !== 'undefined' && globalIsSuperAdmin) {
            if (ball.speed < 0.5) {
              ball.plugin.stuckFrames = (ball.plugin.stuckFrames || 0) + 1;
              if (ball.plugin.stuckFrames > 40) {
                // Set velocity directly for a guaranteed strong escape burst
                Matter.Body.setVelocity(ball, {
                  x: (Math.random() - 0.5) * 10,
                  y: -7.5
                });
                ball.plugin.stuckFrames = 0;
              }
            } else {
              ball.plugin.stuckFrames = 0;
            }
          }"""

content = content.replace(target, replacement)
with open('public/pinball.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Patched escape burst")
