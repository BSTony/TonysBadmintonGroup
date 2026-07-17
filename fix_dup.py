import sys

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the start of the duplicate block
start_idx = -1
for i, line in enumerate(lines):
    if "initPinballEngine();" in line and "syncBalls(state);" in lines[i+1]:
        # This is the end of the playing state block.
        # Let's search BACKWARDS for the if (pinballSpectatorUi) {
        for j in range(i-1, -1, -1):
            if "if (pinballSpectatorUi) {" in lines[j]:
                start_idx = j
                break
        
        if start_idx != -1:
            print(f"Found duplicate block from line {start_idx} to {i-1}")
            # Delete the block
            del lines[start_idx:i]
            break

with open('public/pinball.js', 'w', encoding='utf-8') as f:
    f.writelines(lines)
    
print("Successfully deleted duplicate block")
