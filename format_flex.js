const fs = require('fs');
let indexJs = fs.readFileSync('index.js', 'utf8');

const target = `        if (count >= limit) {
          statusStr = \` 滿額\`;
        } else {
          statusStr = \` 缺 \${limit - count} 趕快來+1\`;
        }
      }
      
      const singleTargetGid = (g.targetGids && g.targetGids.length > 0) ? g.targetGids[0] : g.gid;
      const lobbyUrl = \`https://liff.line.me/\${process.env.LIFF_ID}?gid=\${singleTargetGid}\`;
      const gameUrl = \`\${lobbyUrl}&gameId=\${g.gameId}\`;
      
      const infoArr = [];
      if (g.location) infoArr.push(g.location);
      if (g.time) infoArr.push(g.time);
      if (g.fee && g.fee !== '未知' && g.fee !== '無' && g.fee !== '0') infoArr.push(g.fee);
      const infoLine = infoArr.join(' ');
      
      const textContent = \`\${g.title}\${statusStr}\`.trim() + (infoLine ? \`\\n\${infoLine}\` : '');`;

const replacement = `        if (count >= limit) {
          statusStr = \`  滿額\`;
        } else {
          statusStr = \`  缺\${limit - count}\`;
        }
      }
      
      const singleTargetGid = (g.targetGids && g.targetGids.length > 0) ? g.targetGids[0] : g.gid;
      const lobbyUrl = \`https://liff.line.me/\${process.env.LIFF_ID}?gid=\${singleTargetGid}\`;
      const gameUrl = \`\${lobbyUrl}&gameId=\${g.gameId}\`;
      
      let textContent = \`\${g.title}\${statusStr}\`;
      if (g.location) {
        textContent += \`\\n\${g.location}\`;
      }
      
      const infoArr = [];
      if (g.date) infoArr.push(g.date);
      if (g.time) infoArr.push(g.time);
      if (g.fee && g.fee !== '未知' && g.fee !== '無' && g.fee !== '0') infoArr.push(g.fee);
      
      if (infoArr.length > 0) {
        textContent += \`\\n\${infoArr.join(' ')}\`;
      }`;

indexJs = indexJs.replace(target, replacement);
fs.writeFileSync('index.js', indexJs);
console.log('Done!');
