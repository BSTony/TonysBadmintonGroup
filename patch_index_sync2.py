import re

with open('index.js', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = r"""  socket.on('pinball_host_sync', (data) => {
    socket.broadcast.emit('pinball_host_sync', data);
  });

  socket.on('join_lottery'"""

content = re.sub(r"\s*socket\.on\('join_lottery'", "\n" + replacement, content)

with open('index.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("index.js patched with host sync")
