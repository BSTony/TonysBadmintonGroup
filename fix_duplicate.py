import re
import sys

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

target_start = r"} else if (state.status === 'playing') {"
target_end = r"initPinballEngine();"

pos = content.find(target_start)
end_pos = content.find(target_end, pos)

playing_block = content[pos:end_pos]

# Use regex to remove the duplicate if (pinballSpectatorUi) block that includes tnJoinPinball
pattern = re.compile(r"(\s*if\s*\(pinballSpectatorUi\)\s*\{\s*const\s*myName.*?\}\s*\n\s*\})", re.DOTALL)
match = pattern.search(playing_block)

if match:
    new_playing_block = playing_block[:match.start()] + playing_block[match.end():]
    
    # Wait, there are TWO duplicates?!
    match2 = pattern.search(new_playing_block)
    if match2:
        new_playing_block = new_playing_block[:match2.start()] + new_playing_block[match2.end():]

    content = content[:pos] + new_playing_block + content[end_pos:]
    with open('public/pinball.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Successfully removed rogue spectator UI blocks using regex")
else:
    print("Could not find regex match inside playing state")
