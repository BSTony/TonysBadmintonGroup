const fs = require('fs');
const path = require('path');
const assert = require('assert');

const code = fs.readFileSync(path.join(__dirname, '../../index.js'), 'utf8');

// Extract generateStatusBubble and generatePushMentionMessages
const statusMatch = code.match(/function generateStatusBubble\([\s\S]*?\n\}/);
const pushMatch = code.match(/async function generatePushMentionMessages\([\s\S]*?\n\}/);

assert(statusMatch, 'generateStatusBubble not found');
assert(pushMatch, 'generatePushMentionMessages not found');

const sandbox = new Function('isUserInTargetGroup', 'process', `
    ${statusMatch[0]}
    ${pushMatch[0]}
    return { generateStatusBubble, generatePushMentionMessages };
`)(async () => true, { env: { LIFF_ID: 'test-liff' } });

async function runTests() {
    console.log('=== Running End-to-End Card Backup Verification from index.js ===\n');

    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/games.json'), 'utf8'));
    const targetGid = 'Cf6e94fdd7c4183eda46be86fccb4bfe0';
    const games = Object.values(data).filter(g => (g.gid === targetGid || (g.targetGids && g.targetGids.includes(targetGid))) && g.active && !g.isManualEnded);

    // 1. Test Status Bubble
    console.log('1. Testing generateStatusBubble:');
    const statusBubble = sandbox.generateStatusBubble(games, 'https://liff.line.me/test', '', false);
    const statusStr = JSON.stringify(statusBubble);
    console.log('Contains 滿團(25)+1 ?', statusStr.includes('滿團(25)+1'));
    assert(statusStr.includes('滿團(25)+1'), 'Status bubble should show 滿團(25)+1 for 週四 脫水團');
    console.log('✅ Status Bubble passed!\n');

    // 2. Test Card List (isMentionPush = false, like 接龍名單 / +1)
    console.log('2. Testing generatePushMentionMessages (isMentionPush = false):');
    const msgsNormal = await sandbox.generatePushMentionMessages(games, targetGid, false, new Map(), statusBubble);
    const carouselNormal = msgsNormal[0];
    const bubblesNormal = carouselNormal.contents.contents;
    console.log(`Total bubbles in carousel: ${bubblesNormal.length}`);

    // Bubble 0 is statusBubble
    // Bubble 1 to N are detail roster cards
    const rosterBubbles = bubblesNormal.slice(1);
    const thursBubble = rosterBubbles.find(b => JSON.stringify(b).includes('週四 脫水團'));
    assert(thursBubble, 'Should find roster bubble for 週四 脫水團');
    const thursStr = JSON.stringify(thursBubble);
    assert(thursStr.includes('⌛ 候補'), '週四 脫水團 card MUST contain ⌛ 候補 header');
    assert(thursStr.includes('補-小周老婆'), '週四 脫水團 card MUST contain 補-小周老婆');
    console.log('✅ Normal card roster contains both ⌛ 候補 and 補-小周老婆 on the card!');

    // 3. Test Card List for single game (isMentionPush = true, like 推播提醒)
    console.log('\n3. Testing generatePushMentionMessages (isMentionPush = true):');
    const thursGame = games.find(g => g.title === '週四 脫水團');
    const msgsPush = await sandbox.generatePushMentionMessages([thursGame], targetGid, true, new Map(), null);
    const carouselPush = msgsPush[0];
    const bubblesPush = carouselPush.contents.contents;
    console.log(`Total bubbles in push carousel: ${bubblesPush.length}`);
    const pushCardStr = JSON.stringify(bubblesPush[0]);
    assert(pushCardStr.includes('⌛ 候補'), 'Push card MUST contain ⌛ 候補');
    assert(pushCardStr.includes('補-小周老婆'), 'Push card MUST contain 補-小周老婆');
    console.log('✅ Push mention card contains both ⌛ 候補 and 補-小周老婆 on the card!');

    console.log('\n🎉 ALL CARD BACKUP VERIFICATION TESTS PASSED! 🎉');
}

runTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
