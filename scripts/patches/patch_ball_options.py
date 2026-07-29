import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = r"""        const ball = Bodies.circle(x, y, MARBLE_RADIUS, {
          restitution: 0.6,
          friction: 0.005,
          density: 0.05,
          collisionFilter: (typeof globalIsSuperAdmin === 'undefined' || !globalIsSuperAdmin) ? { mask: 0 } : undefined,
          render: { fillStyle: color },
          plugin: { isBall: true, name: name, num: num, stuckFrames: 0 }
        });"""

replacement = r"""        const ballOptions = {
          restitution: 0.6,
          friction: 0.005,
          density: 0.05,
          render: { fillStyle: color },
          plugin: { isBall: true, name: name, num: num, stuckFrames: 0 }
        };
        if (typeof globalIsSuperAdmin === 'undefined' || !globalIsSuperAdmin) {
          ballOptions.collisionFilter = { mask: 0 };
        }
        const ball = Bodies.circle(x, y, MARBLE_RADIUS, ballOptions);"""

content = content.replace(target, replacement)

with open('public/pinball.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Patched ball creation options")
