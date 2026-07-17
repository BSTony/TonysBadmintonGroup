import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = r"""    } else if (type === 4) {
      // Y-shaped fork island (long capsule shape)
      const baseAngle = Math.atan2(ty, tx);
      const island = Bodies.rectangle(p.x, p.y, 200, 60, {
        isStatic: true,
        angle: baseAngle,
        render: { fillStyle: '#2ecc71', strokeStyle: '#27ae60', lineWidth: 4 },
        chamfer: { radius: 30 } // 30 is half of 60, making perfectly rounded ends (capsule/pill shape)
      });
      
      bodies.push(island);
      trackObstacles.push(island);
    }"""

replacement = r"""    } else if (type === 4) {
      // Y-shaped fork island (Teardrop shape)
      const baseAngle = Math.atan2(ty, tx);
      const teardropVertices = [
        { x: 0, y: -120 },
        { x: 30, y: -20 },
        { x: 45, y: 30 },
        { x: 25, y: 70 },
        { x: 0, y: 80 },
        { x: -25, y: 70 },
        { x: -45, y: 30 },
        { x: -30, y: -20 }
      ];
      
      const island = Bodies.fromVertices(p.x, p.y, [teardropVertices], {
        isStatic: true,
        angle: baseAngle + Math.PI / 2,
        render: { fillStyle: '#2ecc71', strokeStyle: '#27ae60', lineWidth: 4 }
      }, true);
      
      bodies.push(island);
      trackObstacles.push(island);
    }"""

content_normalized = re.sub(r'\r\n', '\n', content)
target_norm = re.sub(r'\r\n', '\n', target)

if target_norm in content_normalized:
    content_normalized = content_normalized.replace(target_norm, replacement)
else:
    print("Target not found")

with open('public/pinball.js', 'w', encoding='utf-8') as f:
    f.write(content_normalized)

print("done")
