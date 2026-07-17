import re

with open('index.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = r"""  socket.on('pinball_move_ball', (data) => {
    const { name, x, y } = data;
    if (pinballRoom.status === 'lobby' || pinballRoom.status === 'instruction') {
      pinballRoom.positions[name] = { x, y };
      // Broadcast this individual move to others so they can animate it locally
      socket.broadcast.emit('pinball_ball_moved', { name, x, y });
    }
  });"""

replacement = r"""  socket.on('pinball_move_ball', (data) => {
    const { name, x, y } = data;
    if (pinballRoom.status === 'lobby' || pinballRoom.status === 'instruction') {
      pinballRoom.positions[name] = { x, y };
      // Broadcast this individual move to others so they can animate it locally
      socket.broadcast.emit('pinball_ball_moved', { name, x, y });
    }
  });
  
  socket.on('pinball_apply_force', (data) => {
    // Broadcast the g-sensor force to all other clients (including the superadmin screen)
    socket.broadcast.emit('pinball_apply_force', data);
  });"""

content_normalized = re.sub(r'\r\n', '\n', content)
target_norm = re.sub(r'\r\n', '\n', target)

if target_norm in content_normalized:
    content_normalized = content_normalized.replace(target_norm, replacement)

with open('index.js', 'w', encoding='utf-8') as f:
    f.write(content_normalized)

print("done")
