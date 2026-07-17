with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Allow host sync in lobby
sync_sender_target = "        if (pbState && pbState.status === 'playing' && pbBalls) {"
sync_sender_replace = "        if (pbState && pbState.status !== 'idle' && pbBalls) {"
content = content.replace(sync_sender_target, sync_sender_replace)

sync_receiver_target = "      if (pbState && pbState.status === 'playing' && pbBalls) {"
sync_receiver_replace = "      if (pbState && pbState.status !== 'idle' && pbBalls) {"
content = content.replace(sync_receiver_target, sync_receiver_replace)

lerp_loop_target = "            if (!pbBalls || !pbState || pbState.status !== 'playing') {"
lerp_loop_replace = "            if (!pbBalls || !pbState || pbState.status === 'idle') {"
content = content.replace(lerp_loop_target, lerp_loop_replace)

# 2. Skip LERP if dragging
lerp_body_target = """            for (const name in targets) {
              if (pbBalls[name]) {
                const ball = pbBalls[name];
                const sd = targets[name];"""
lerp_body_replace = """            for (const name in targets) {
              if (pbBalls[name]) {
                const ball = pbBalls[name];
                if (typeof pbMouseConstraint !== 'undefined' && pbMouseConstraint && pbMouseConstraint.body === ball) {
                  continue; // Skip LERP while dragging
                }
                const sd = targets[name];"""
content = content.replace(lerp_body_target, lerp_body_replace)

# 3. Add mousemove emitter
drag_target = """  // Sync position on release or drag
  Events.on(pbMouseConstraint, 'enddrag', (event) => {"""
drag_replace = """  // Sync position on drag continuously
  let lastMoveTime = 0;
  Events.on(pbMouseConstraint, 'mousemove', (event) => {
    if (pbMouseConstraint && pbMouseConstraint.body && pbMouseConstraint.body.plugin && pbMouseConstraint.body.plugin.isBall) {
      const myName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.displayName : null;
      if (pbMouseConstraint.body.plugin.name === myName) {
        const now = Date.now();
        if (now - lastMoveTime > 30) {
          if (typeof pinballSocket !== 'undefined') {
            pinballSocket.emit('pinball_move_ball', {
              name: myName,
              x: pbMouseConstraint.body.position.x,
              y: pbMouseConstraint.body.position.y
            });
          }
          lastMoveTime = now;
        }
      }
    }
  });

  // Sync position on release or drag
  Events.on(pbMouseConstraint, 'enddrag', (event) => {"""
content = content.replace(drag_target, drag_replace)

with open('public/pinball.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("OK")
