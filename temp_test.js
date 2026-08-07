const fs = require('fs');
const indexCode = fs.readFileSync('index.js', 'utf8');
const generateFnMatch = indexCode.match(/function generateStatusBubble[\s\S]*?return \{\s*type: "bubble"[\s\S]*?\};\n\}/);
if (!generateFnMatch) {
  console.log('Function not found');
  process.exit(1);
}
eval(generateFnMatch[0]);

const targetGames = [
  {
    gameId: '123',
    title: '週日 港中團 (3時段可選)',
    date: '8/9 (日)',
    sections: [
      { title: '8:00-10:00', list: ['A', 'B'], limit: 10 },
      { title: '10:00-12:00', list: ['C', 'D'], limit: 12 }
    ]
  }
];

const bubble = generateStatusBubble(targetGames, 'https://liff', '週日 港中團', true);
console.log(JSON.stringify(bubble, null, 2));
