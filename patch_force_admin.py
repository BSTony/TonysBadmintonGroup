with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Wrap the entire playing physics block (downward push + stuck detection) in admin-only check
target = """      if (pbState.status === 'playing') {
        Object.values(pbBalls).forEach(ball => {
          // Apply constant downward push to simulate steep track
          Body.applyForce(ball, ball.position, { x: 0, y: 0.0004 });
          
          if (typeof globalIsSuperAdmin !== 'undefined' && globalIsSuperAdmin) {
            if (ball.speed < 0.5) {
              ball.plugin.stuckFrames = (ball.plugin.stuckFrames || 0) + 1;
              if (ball.plugin.stuckFrames > 40) {
                // Set velocity directly for a guaranteed strong escape burst
                Matter.Body.setVelocity(ball, {
                  x: (seededRandom() - 0.5) * 10,
                  y: -7.5
                });
                ball.plugin.stuckFrames = 0;
              }
            } else {
              ball.plugin.stuckFrames = 0;
            }
          }
        });"""

replacement = """      if (pbState.status === 'playing') {
        if (typeof globalIsSuperAdmin !== 'undefined' && globalIsSuperAdmin) {
          Object.values(pbBalls).forEach(ball => {
            // Apply constant downward push to simulate steep track (HOST ONLY)
            Body.applyForce(ball, ball.position, { x: 0, y: 0.0004 });
            
            if (ball.speed < 0.5) {
              ball.plugin.stuckFrames = (ball.plugin.stuckFrames || 0) + 1;
              if (ball.plugin.stuckFrames > 40) {
                Matter.Body.setVelocity(ball, {
                  x: (seededRandom() - 0.5) * 10,
                  y: -7.5
                });
                ball.plugin.stuckFrames = 0;
              }
            } else {
              ball.plugin.stuckFrames = 0;
            }
          });
        }"""

if target in content:
    content = content.replace(target, replacement)
    with open('public/pinball.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print('OK: Wrapped applyForce in admin-only check')
else:
    print('FAIL: target not found')
