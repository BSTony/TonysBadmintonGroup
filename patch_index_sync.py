import re

with open('index.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = r"    socket.on('join_lottery', (data) => {"
replacement = r"""    socket.on('pinball_host_sync', (data) => {
      socket.broadcast.emit('pinball_host_sync', data);
    });

    socket.on('join_lottery', (data) => {"""

if target in content:
    content = content.replace(target, replacement)
    with open('index.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("index.js patched")
else:
    print("target not found in index.js")
