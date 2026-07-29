import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = r"""    } else if (type === 3) {
      // Rotary Plate (3-blade fan)
      const cx = p.x;
      const cy = p.y;
      
      const parts = [];
      parts.push(Bodies.circle(cx, cy, 22, { 
        render: { fillStyle: '#f1c40f', strokeStyle: '#bdc3c7', lineWidth: 3 }
      }));
      
      for(let j=0; j<4; j++) {
        const angle = j * (Math.PI / 2);
        const dist = 45; 
        const bx = cx + Math.cos(angle) * dist;
        const by = cy + Math.sin(angle) * dist;
        const blade = Bodies.rectangle(bx, by, 75, 22, {
          angle: angle,
          render: { fillStyle: '#34495e', strokeStyle: '#bdc3c7', lineWidth: 3 },
          chamfer: { radius: 8 }
        });
        parts.push(blade);
      }"""

replacement = r"""    } else if (type === 3) {
      // Rotary Pinwheel (4 colored blades)
      const cx = p.x;
      const cy = p.y;
      
      const parts = [];
      // Hub
      parts.push(Bodies.circle(cx, cy, 20, { 
        render: { fillStyle: '#ffffff', strokeStyle: '#bdc3c7', lineWidth: 2 }
      }));
      
      const bladeColors = ['#3498db', '#2ecc71', '#e74c3c', '#f1c40f']; // Blue, Green, Red, Yellow
      
      for(let j=0; j<4; j++) {
        const angle = j * (Math.PI / 2);
        const dist = 45; 
        const offset = 15; // Offset perpendicular to radius to create pinwheel effect
        
        const bx = cx + Math.cos(angle) * dist - Math.sin(angle) * offset;
        const by = cy + Math.sin(angle) * dist + Math.cos(angle) * offset;
        
        const blade = Bodies.rectangle(bx, by, 75, 30, {
          angle: angle,
          render: { fillStyle: bladeColors[j], strokeStyle: 'rgba(0,0,0,0.2)', lineWidth: 2 },
          chamfer: { radius: 5 }
        });
        parts.push(blade);
      }"""

content_normalized = re.sub(r'\r\n', '\n', content)
if target in content_normalized:
    content_normalized = content_normalized.replace(target, replacement)

with open('public/pinball.js', 'w', encoding='utf-8') as f:
    f.write(content_normalized)

print("done")
