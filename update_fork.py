import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update obstacleTypes to include type 4
target_types = r"const obstacleTypes = \[1, 1, 3, 3\]\.sort\(\(\) => Math\.random\(\) - 0\.5\);"
replacement_types = r"const obstacleTypes = [1, 3, 4, 4].sort(() => Math.random() - 0.5);"
content = re.sub(target_types, replacement_types, content)

# 2. Add type 4 logic
target_type3_end = r"""      bodies.push(cross);
      bodies.push(constraint);
      trackObstacles.push(cross);
      trackObstacles.push(constraint);
    }"""
replacement_type4 = r"""      bodies.push(cross);
      bodies.push(constraint);
      trackObstacles.push(cross);
      trackObstacles.push(constraint);
    } else if (type === 4) {
      // Y-shaped fork island (green park)
      const baseAngle = Math.atan2(ty, tx);
      const island = Bodies.polygon(p.x, p.y, 4, 70, {
        isStatic: true,
        render: { fillStyle: '#2ecc71', strokeStyle: '#bdc3c7', lineWidth: 4 },
        chamfer: { radius: 15 } // smooth the diamond into a leaf/teardrop
      });
      // Scale it to be long along the Y-axis, then rotate to align Y-axis with track forward
      Matter.Body.scale(island, 0.7, 2.0);
      Matter.Body.setAngle(island, baseAngle - Math.PI/2);
      
      bodies.push(island);
      trackObstacles.push(island);
    }"""

content_normalized = re.sub(r'\r\n', '\n', content)
target_type3_end_norm = re.sub(r'\r\n', '\n', target_type3_end)

if target_type3_end_norm in content_normalized:
    content_normalized = content_normalized.replace(target_type3_end_norm, replacement_type4)

with open('public/pinball.js', 'w', encoding='utf-8') as f:
    f.write(content_normalized)

print("done")
