import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Increase sync rate
content = content.replace("}, 100);", "}, 33);")

# 2. Add iterations
target_engine = r"    pbEngine.gravity.y = GRAVITY_Y;"
replacement_engine = r"""    pbEngine.gravity.y = GRAVITY_Y;
    pbEngine.positionIterations = 8;
    pbEngine.velocityIterations = 8;"""
content = content.replace(target_engine, replacement_engine)

# 3. Only admin resets out of bounds
target_oob = r"""    Matter.Events.on(pbEngine, 'afterUpdate', () => {
      // Out of bounds check
      for (const [name, ball] of Object.entries(pbBalls)) {"""

replacement_oob = r"""    Matter.Events.on(pbEngine, 'afterUpdate', () => {
      // Out of bounds check
      if (typeof globalIsSuperAdmin !== 'undefined' && globalIsSuperAdmin) {
        for (const [name, ball] of Object.entries(pbBalls)) {"""

content = content.replace(target_oob, replacement_oob)

# Need to add closing bracket for the if statement. Let's find where the for loop ends.
target_oob_end = r"""          Matter.Body.setVelocity(ball, { x: 0, y: 0 });
        }
      }
    });"""

replacement_oob_end = r"""          Matter.Body.setVelocity(ball, { x: 0, y: 0 });
        }
      }
      } // End of globalIsSuperAdmin check
    });"""

content = content.replace(target_oob_end, replacement_oob_end)

with open('public/pinball.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Patched physics and OOB")
