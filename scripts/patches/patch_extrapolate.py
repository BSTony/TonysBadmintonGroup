import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = r"""              if (Math.abs(dx) > 100 || Math.abs(dy) > 100) {
                Matter.Body.setPosition(ball, { x: sd.x, y: sd.y });
              } else {
                Matter.Body.setPosition(ball, {
                  x: ball.position.x + dx * 0.5,
                  y: ball.position.y + dy * 0.5
                });
              }
              Matter.Body.setVelocity(ball, { x: 0, y: 0 }); // Disable extrapolation to prevent wall overshoot
              const da = sd.a - ball.angle;
              Matter.Body.setAngle(ball, ball.angle + da * 0.5);
              Matter.Body.setAngularVelocity(ball, 0);"""

replacement = r"""              if (Math.abs(dx) > 100 || Math.abs(dy) > 100) {
                Matter.Body.setPosition(ball, { x: sd.x, y: sd.y });
              } else {
                Matter.Body.setPosition(ball, {
                  x: ball.position.x + dx * 0.2,
                  y: ball.position.y + dy * 0.2
                });
              }
              Matter.Body.setVelocity(ball, { x: sd.vx, y: sd.vy });
              const da = sd.a - ball.angle;
              Matter.Body.setAngle(ball, ball.angle + da * 0.2);
              Matter.Body.setAngularVelocity(ball, sd.av);"""

content = content.replace(target, replacement)

with open('public/pinball.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Patched extrapolation back in with gentle LERP")
