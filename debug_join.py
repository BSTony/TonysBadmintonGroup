import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = r"""               if (btnJoinPinball) {
                 btnJoinPinball.classList.remove('hidden');
                 btnJoinPinball.onclick = () => {
                   if (typeof pinballSocket !== 'undefined') pinballSocket.emit('join_pinball', { name: myName });
                 };
               }"""

replacement = r"""               if (btnJoinPinball) {
                 btnJoinPinball.classList.remove('hidden');
                 btnJoinPinball.onclick = () => {
                   console.log('Join button clicked! myName=', myName, 'pinballSocket=', window.pinballSocket);
                   if (window.pinballSocket) {
                     window.pinballSocket.emit('join_pinball', { name: myName });
                   } else {
                     console.error('pinballSocket is missing!');
                   }
                 };
               }"""

content = content.replace(target, replacement)
with open('public/pinball.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Added console.log to btnJoinPinball in pinball.js")
