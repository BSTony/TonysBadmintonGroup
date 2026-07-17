import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

start_idx = content.find("function initPinballEngine()")
end_idx = content.find("function startRace()")

if start_idx != -1 and end_idx != -1 and start_idx < end_idx:
    init_func = content[start_idx:end_idx]
    init_func = init_func.replace("Math.random()", "seededRandom()")
    content = content[:start_idx] + init_func + content[end_idx:]
    with open('public/pinball.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Replaced Math.random inside initPinballEngine")
else:
    print("Failed to find boundaries", start_idx, end_idx)
