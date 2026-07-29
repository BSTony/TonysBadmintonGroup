import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix obstacleTypes
content = re.sub(r'const obstacleTypes = \[1, 2, 3, 4\].sort\(\(\) => Math.random\(\) - 0.5\);', 
                 r'const obstacleTypes = [1, 3, 4, 4].sort(() => Math.random() - 0.5);', content)

# Find the block from     } else if (type === 1) { to the end of 	ype === 4
start_marker = r"    } else if (type === 1) {"
end_marker = r"    // --- END GENERATE RANDOM OBSTACLES ---"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx != -1 and end_idx != -1:
    new_block = r"""    } else if (type === 1) {
      const offsetAmt = (Math.random() - 0.5) * (TRACK_WIDTH * 0.4);
      const cx = p.x + nx * offsetAmt;
      const cy = p.y + ny * offsetAmt;
      
      const bouncer = Bodies.circle(cx, cy, 12, {
        isStatic: true, restitution: 1.5, friction: 0.0,
        render: { fillStyle: '#f1c40f', strokeStyle: '#111111', lineWidth: 4 }, plugin: { isBumper: true }
      });
      bodies.push(bouncer);
      trackObstacles.push(bouncer);
      
    } else if (type === 3) {
      // Rotary Pinwheel (4 colored blades)
      const cx = p.x;
      const cy = p.y;
      
      const parts = [];
      parts.push(Bodies.circle(cx, cy, 20, { 
        render: { fillStyle: '#ffffff', strokeStyle: '#bdc3c7', lineWidth: 2 }
      }));
      
      const bladeColors = ['#3498db', '#2ecc71', '#e74c3c', '#f1c40f']; // Blue, Green, Red, Yellow
      
      for(let j=0; j<4; j++) {
        const angle = j * (Math.PI / 2);
        const dist = 45; 
        const offset = 15;
        const bx = cx + Math.cos(angle) * dist - Math.sin(angle) * offset;
        const by = cy + Math.sin(angle) * dist + Math.cos(angle) * offset;
        const blade = Bodies.rectangle(bx, by, 75, 30, {
          angle: angle,
          render: { fillStyle: bladeColors[j], strokeStyle: 'rgba(0,0,0,0.2)', lineWidth: 2 },
          chamfer: { radius: 5 }
        });
        parts.push(blade);
      }
      
      const cross = Matter.Body.create({
        parts: parts,
        frictionAir: 0,
        friction: 0,
        restitution: 0.8,
        density: 0.5,
        plugin: { isRotary: true }
      });
      
      const constraint = Matter.Constraint.create({
        pointA: { x: p.x, y: p.y },
        bodyB: cross,
        pointB: { x: 0, y: 0 },
        stiffness: 1,
        length: 0,
        render: { visible: true, type: 'pin', strokeStyle: '#fff' }
      });
      
      bodies.push(cross);
      bodies.push(constraint);
      trackObstacles.push(cross);
      trackObstacles.push(constraint);
      
    } else if (type === 4) {
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
    }
"""
    content = content[:start_idx] + new_block + content[end_idx:]

with open('public/pinball.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("done")
