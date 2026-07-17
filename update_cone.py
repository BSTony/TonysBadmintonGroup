import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update obstacleTypes to include type 2 (cone)
target_types = r"const obstacleTypes = \[1, 3, 4, 4\]\.sort\(\(\) => Math\.random\(\) - 0\.5\);"
replacement_types = r"const obstacleTypes = [1, 2, 3, 4].sort(() => Math.random() - 0.5);"
content = re.sub(target_types, replacement_types, content)

# 2. Re-introduce type === 2 logic as Traffic Cone
target_type1_end = r"""      const bouncer = Bodies.circle(cx, cy, 12, {
        isStatic: true, restitution: 1.5, friction: 0.0,
        render: { fillStyle: '#bdc3c7', strokeStyle: '#7f8c8d', lineWidth: 2 }, plugin: { isBumper: true }
      });
      bodies.push(bouncer);
      trackObstacles.push(bouncer);
      
    } else if (type === 3) {"""

replacement_type2 = r"""      const bouncer = Bodies.circle(cx, cy, 12, {
        isStatic: true, restitution: 1.5, friction: 0.0,
        render: { fillStyle: '#bdc3c7', strokeStyle: '#7f8c8d', lineWidth: 2 }, plugin: { isBumper: true }
      });
      bodies.push(bouncer);
      trackObstacles.push(bouncer);
      
    } else if (type === 2) {
      // Traffic Cone (Top-Down view: Concentric circles)
      const offsetAmt = (Math.random() - 0.5) * (TRACK_WIDTH * 0.3);
      const cx = p.x + nx * offsetAmt;
      const cy = p.y + ny * offsetAmt;
      
      const base = Matter.Bodies.circle(cx, cy, 18, { render: { fillStyle: '#e67e22', strokeStyle: '#d35400', lineWidth: 2 } });
      const mid = Matter.Bodies.circle(cx, cy, 11, { render: { fillStyle: '#ecf0f1', strokeStyle: '#bdc3c7', lineWidth: 1 } });
      const top = Matter.Bodies.circle(cx, cy, 5, { render: { fillStyle: '#e67e22', strokeStyle: '#d35400', lineWidth: 1 } });
      
      const cone = Matter.Body.create({
        parts: [base, mid, top],
        isStatic: true,
        restitution: 0.2
      });
      
      bodies.push(cone);
      trackObstacles.push(cone);
      
    } else if (type === 3) {"""

content_normalized = re.sub(r'\r\n', '\n', content)
target_type1_end_norm = re.sub(r'\r\n', '\n', target_type1_end)

if target_type1_end_norm in content_normalized:
    content_normalized = content_normalized.replace(target_type1_end_norm, replacement_type2)
else:
    print("Target 1 not found")

with open('public/pinball.js', 'w', encoding='utf-8') as f:
    f.write(content_normalized)

print("done")
