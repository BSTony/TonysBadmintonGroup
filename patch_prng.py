import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Insert PRNG functions
target_prng = r"let pbWorldHeight = 3500;"
replacement_prng = r"""let pbWorldHeight = 3500;

  let currentSeed = 12345;
  function setSeed(seed) { currentSeed = seed; }
  function seededRandom() {
    let t = currentSeed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
"""
content = content.replace(target_prng, replacement_prng)

# Replace Math.random() with seededRandom() inside initPinballEngine
# We will do this by slicing the content

start_idx = content.find("function initPinballEngine()")
end_idx = content.find("function destroyEngine()") # assuming it's after

if start_idx != -1 and end_idx != -1:
    init_func = content[start_idx:end_idx]
    init_func = init_func.replace("Math.random()", "seededRandom()")
    content = content[:start_idx] + init_func + content[end_idx:]

with open('public/pinball.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Patched PRNG in pinball.js")
