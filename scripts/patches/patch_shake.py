import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = r"""    s.on('pinball_shake', () => {
      if (pbEngine && pbBalls) {
        Object.values(pbBalls).forEach(ball => {
          // Apply random bump force to unstick
          Matter.Body.applyForce(ball, ball.position, {
            x: (Math.random() - 0.5) * 0.05,
            y: -0.05 // Upward jump
          });
        });"""

replacement = r"""    s.on('pinball_shake', () => {
      if (pbEngine && pbBalls) {
        if (typeof globalIsSuperAdmin !== 'undefined' && globalIsSuperAdmin) {
          Object.values(pbBalls).forEach(ball => {
            // Apply random bump force to unstick
            Matter.Body.applyForce(ball, ball.position, {
              x: (Math.random() - 0.5) * 0.05,
              y: -0.05 // Upward jump
            });
          });
        }"""

if target in content:
    content = content.replace(target, replacement)
    with open('public/pinball.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Patched shake logic")
else:
    print("Target not found")
