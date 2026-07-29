import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update gravity
target_gravity = r"pbEngine.gravity.y = GRAVITY_Y;"
replacement_gravity = r"pbEngine.gravity.y = (typeof globalIsSuperAdmin !== 'undefined' && globalIsSuperAdmin) ? GRAVITY_Y : 0;"
content = content.replace(target_gravity, replacement_gravity)

# 2. Add collisionFilter to ball
target_ball = r"""        const ball = Bodies.circle(x, y, MARBLE_RADIUS, {
          restitution: 0.6,
          friction: 0.005,
          density: 0.05,
          render: { fillStyle: color },"""

replacement_ball = r"""        const ball = Bodies.circle(x, y, MARBLE_RADIUS, {
          restitution: 0.6,
          friction: 0.005,
          density: 0.05,
          collisionFilter: (typeof globalIsSuperAdmin === 'undefined' || !globalIsSuperAdmin) ? { mask: 0 } : undefined,
          render: { fillStyle: color },"""
          
content = content.replace(target_ball, replacement_ball)

with open('public/pinball.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Patched client collision and gravity")
