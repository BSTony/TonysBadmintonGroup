import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = r"    // --- END GENERATE RANDOM OBSTACLES ---"
replacement = """    // --- ADD 5 RANDOM NAILS (BOUNCERS) ---
    for (let i = 0; i < 5; i++) {
        const randIdx = startIdx + Math.floor(Math.random() * (endIdx - startIdx));
        const p = pathPoints[randIdx];
        
        let pNext = pathPoints[randIdx + 5] || pathPoints[pathPoints.length - 1];
        let pPrev = pathPoints[randIdx - 5] || pathPoints[0];
        let dx = pNext.x - pPrev.x;
        let dy = pNext.y - pPrev.y;
        if (dx === 0 && dy === 0) continue;
        let len = Math.sqrt(dx*dx + dy*dy);
        let tx = dx / len;
        let ty = dy / len;
        let nx = -ty;
        let ny = tx;
        
        const offsetAmt = (Math.random() - 0.5) * (TRACK_WIDTH * 0.7);
        const cx = p.x + nx * offsetAmt;
        const cy = p.y + ny * offsetAmt;
        
        const nail = Bodies.circle(cx, cy, 14, {
          isStatic: true, restitution: 1.5, friction: 0.0,
          render: { fillStyle: '#f1c40f', strokeStyle: '#111111', lineWidth: 4 }, plugin: { isBumper: true }
        });
        bodies.push(nail);
        trackObstacles.push(nail);
    }
    // --- END GENERATE RANDOM OBSTACLES ---"""

content = content.replace(target, replacement)

with open('public/pinball.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Added 5 random nails")
