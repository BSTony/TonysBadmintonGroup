import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = "if (countdownEl) {"

# Find the first occurrence inside state.status === 'lobby'
lobby_block_start = content.find("if (state.status === 'lobby')")
if lobby_block_start != -1:
    target_pos = content.find(target, lobby_block_start)
    if target_pos != -1:
        replacement = "const countdownEl = document.getElementById('pinball-countdown');\n        if (countdownEl) {"
        content = content[:target_pos] + replacement + content[target_pos+len(target):]
        with open('public/pinball.js', 'w', encoding='utf-8') as f:
            f.write(content)
        print("Patched countdownEl reference error!")
    else:
        print("Target not found inside lobby block")
else:
    print("Lobby block not found")

