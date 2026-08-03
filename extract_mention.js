const fs = require('fs');
let code = fs.readFileSync('index.js', 'utf8');

const startTag = 'const flexBubbles = [];';
const endTag = 'if (targetGid !== gid) {';

const startIndex = code.indexOf(startTag);
const endIndex = code.indexOf(endTag, startIndex);

const innerCode = code.substring(startIndex, endIndex);

const functionStr = `function generatePushMentionMessages(groupGames, targetGid, isMentionPush, nameToUidMap) {
` + innerCode + `
    return messagesToSend;
}
`;

let newBlock = `const messagesToSend = generatePushMentionMessages(groupGames, targetGid, isMentionPush, nameToUidMap);
      `;

let newCode = code.substring(0, startIndex) + newBlock + code.substring(endIndex);

const utilPoint = newCode.indexOf('function generateListMessage');
newCode = newCode.substring(0, utilPoint) + functionStr + '\n' + newCode.substring(utilPoint);

fs.writeFileSync('index.js', newCode);
console.log('Extraction complete');
