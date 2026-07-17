import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = r"""  s.on('pinball_shake', () => {
    if (pbEngine && pbBalls) {
      if (typeof globalIsSuperAdmin !== 'undefined' && globalIsSuperAdmin) {
        Object.values(pbBalls).forEach(ball => {
          Matter.Body.applyForce(ball, ball.position, {
            x: (Math.random() - 0.5) * 0.05,
            y: -0.05
          });
        });
      }
"""

content = re.sub(r"  s\.on\('pinball_shake', \(\) => {\s*if \(pbEngine && pbBalls\) {\s*Object\.values\(pbBalls\)\.forEach\(ball => {\s*// Apply random bump force to unstick\s*Matter\.Body\.applyForce\(ball, ball\.position, {\s*x: \(Math\.random\(\) - 0\.5\) \* 0\.05,\s*y: -0\.05 // Upward jump\s*}\);\s*}\);", replacement, content)

with open('public/pinball.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Patched shake logic using regex")
