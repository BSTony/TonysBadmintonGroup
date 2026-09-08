const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Read index.js
const code = fs.readFileSync(path.join(__dirname, '../../index.js'), 'utf8');

// Extract generatePushMentionMessages function
const funcMatch = code.match(/async function generatePushMentionMessages\([\s\S]*?\n\}/);
if (!funcMatch) {
    console.error('Could not find generatePushMentionMessages in index.js');
    process.exit(1);
}

const funcStr = funcMatch[0];

// Create isolated scope to run generatePushMentionMessages
const createRunner = (isUserInGroupMock) => {
    const isUserInTargetGroup = isUserInGroupMock || (async (gid, uid) => true);
    const mockEnv = { LIFF_ID: 'test-liff-id' };
    
    // Evaluate the function
    const fn = new Function('isUserInTargetGroup', 'process', `
        ${funcStr}
        return generatePushMentionMessages;
    `)(isUserInTargetGroup, { env: mockEnv });

    return fn;
};

async function runTests() {
    console.log('=== Starting Push Mention Verification ===\n');

    const fn = createRunner(async (gid, uid) => uid !== 'U_OUT_OF_GROUP');

    // Test 1: Exact user case (15 confirmed, 2 backup, total 17 <= 20)
    console.log('--- Test 1: User Example (15 confirmed, 2 backup) ---');
    const test1Games = [{
        gameId: 'g1',
        title: '週四脫水團',
        sections: [{
            title: '分區A',
            limit: 15,
            list: [
                '謝東霖 Tony', 'Kay', '曾Jim凱', 'Ashley', '周則鼎',
                'Mina', 'Iven', '陳呈', 'John', 'Wayne',
                'Matt', '小黑', '凱文', 'Sean柏宏', '江こう 洋々',
                '紀凡', '古書羽'
            ]
        }]
    }];
    const uidMap1 = new Map();
    test1Games[0].sections[0].list.forEach((name, i) => {
        uidMap1.set(`g1_${name}`, `U${i}`);
    });

    const res1 = await fn(test1Games, 'group1', true, uidMap1, null);
    // res1[0] is carouselMsg
    // res1[1] is textV2 message
    assert.strictEqual(res1.length, 2, 'Should return 2 messages: carousel + 1 textV2 message');
    const msg1 = res1[1];
    assert.strictEqual(msg1.type, 'textV2', 'Message type should be textV2');
    console.log('Test 1 Message Text:\n' + msg1.text);
    console.log('\nSubstitutions count:', Object.keys(msg1.substitution).length);
    
    assert(msg1.text.startsWith('[週四脫水團]\n已報名成功：\n'), 'Should start with title and 已報名成功：');
    assert(msg1.text.includes('\n備取如下：\n'), 'Should include 備取如下：');
    assert.strictEqual(Object.keys(msg1.substitution).length, 17, 'Should have 17 substitutions');
    
    // Check confirmed names
    for (let i = 0; i < 15; i++) {
        assert.strictEqual(msg1._names[`user${i}`], test1Games[0].sections[0].list[i]);
    }
    // Check backup names
    assert.strictEqual(msg1._names['user15'], '紀凡');
    assert.strictEqual(msg1._names['user16'], '古書羽');
    console.log('✅ Test 1 Passed!\n');

    // Test 2: Only confirmed players, no backup
    console.log('--- Test 2: Only Confirmed Players (no backup) ---');
    const test2Games = [{
        gameId: 'g2',
        title: '週日暢打團',
        sections: [{
            limit: 10,
            list: ['Player1', 'Player2', 'Player3']
        }]
    }];
    const uidMap2 = new Map();
    test2Games[0].sections[0].list.forEach((name, i) => uidMap2.set(`g2_${name}`, `U2_${i}`));
    const res2 = await fn(test2Games, 'group1', true, uidMap2, null);
    assert.strictEqual(res2.length, 2);
    const msg2 = res2[1];
    console.log('Test 2 Message Text:\n' + msg2.text);
    assert(msg2.text.includes('已報名成功：'));
    assert(!msg2.text.includes('備取如下：'), 'Should NOT include 備取如下： when there are no backups');
    console.log('✅ Test 2 Passed!\n');

    // Test 3: Total players > 20 (e.g. 18 confirmed, 5 backup -> total 23)
    console.log('--- Test 3: Total Players > 20 (18 confirmed, 5 backup) ---');
    const test3List = [];
    for (let i = 1; i <= 23; i++) test3List.push(`Player${i}`);
    const test3Games = [{
        gameId: 'g3',
        title: '大型暢打團',
        sections: [{
            limit: 18,
            list: test3List
        }]
    }];
    const uidMap3 = new Map();
    test3List.forEach((name, i) => uidMap3.set(`g3_${name}`, `U3_${i}`));
    const res3 = await fn(test3Games, 'group1', true, uidMap3, null);
    console.log(`Test 3 Total Messages: ${res3.length}`);
    // Should have carouselMsg + 1 message for confirmed (18) + 1 message for backup (5)
    assert.strictEqual(res3.length, 3, 'Should split into 2 text messages + 1 carousel');
    const confMsg = res3[1];
    const bkpMsg = res3[2];
    console.log('Confirmed Msg:\n' + confMsg.text);
    console.log('Backup Msg:\n' + bkpMsg.text);
    assert(confMsg.text.includes('已報名成功：'));
    assert(!confMsg.text.includes('備取如下：'));
    assert.strictEqual(Object.keys(confMsg.substitution).length, 18);
    assert(bkpMsg.text.includes('備取如下：'));
    assert(!bkpMsg.text.includes('已報名成功：'));
    assert.strictEqual(Object.keys(bkpMsg.substitution).length, 5);
    console.log('✅ Test 3 Passed!\n');

    // Test 4: Confirmed > 20 (e.g. 25 confirmed, 2 backup)
    console.log('--- Test 4: Confirmed > 20 (25 confirmed, 2 backup) ---');
    const test4List = [];
    for (let i = 1; i <= 27; i++) test4List.push(`P${i}`);
    const test4Games = [{
        gameId: 'g4',
        title: '雙場地團',
        sections: [{
            limit: 25,
            list: test4List
        }]
    }];
    const uidMap4 = new Map();
    test4List.forEach((name, i) => uidMap4.set(`g4_${name}`, `U4_${i}`));
    const res4 = await fn(test4Games, 'group1', true, uidMap4, null);
    // carousel (1) + confirmed chunk 1 (20) + confirmed chunk 2 (5) + backup chunk (2) = 4 messages
    assert.strictEqual(res4.length, 4);
    assert(res4[1].text.includes('已報名成功：'));
    assert.strictEqual(Object.keys(res4[1].substitution).length, 20);
    assert(res4[2].text.includes('(續) 已報名成功：'));
    assert.strictEqual(Object.keys(res4[2].substitution).length, 5);
    assert(res4[3].text.includes('備取如下：'));
    assert.strictEqual(Object.keys(res4[3].substitution).length, 2);
    console.log('✅ Test 4 Passed!\n');

    // Test 5: Anonymous and Out-of-group handling
    console.log('--- Test 5: Anonymous & Out-of-group handling ---');
    const test5Games = [{
        gameId: 'g5',
        title: '測試團',
        sections: [{
            limit: 3,
            list: ['Alice', '__ANON__', 'Bob', 'Charlie']
        }]
    }];
    const uidMap5 = new Map();
    uidMap5.set('g5_Alice', 'U_ALICE');
    uidMap5.set('g5_Bob', 'U_OUT_OF_GROUP'); // will return inGroup = false
    uidMap5.set('g5_Charlie', 'U_CHARLIE');

    const res5 = await fn(test5Games, 'group1', true, uidMap5, null);
    const msg5 = res5[1];
    console.log('Test 5 Message Text:\n' + msg5.text);
    // Alice is confirmed (idx 0 < limit 3) -> in group -> {user0}
    // Bob is confirmed (idx 2 < limit 3) -> out of group -> @Bob
    // Charlie is backup (idx 3 >= limit 3) -> in group -> {user1}
    assert(msg5.text.includes('{user0} @Bob'));
    assert(msg5.text.includes('備取如下：\n{user1}'));
    assert(!msg5.text.includes('__ANON__'), 'Anonymous should not be tagged');
    console.log('✅ Test 5 Passed!\n');

    // Test 6: Empty games
    console.log('--- Test 6: Empty games ---');
    const test6Games = [{ gameId: 'g6', title: '空團', sections: [{ limit: 10, list: [] }] }];
    const res6 = await fn(test6Games, 'group1', true, new Map(), null);
    assert.strictEqual(res6.length, 2);
    assert.strictEqual(res6[1].text, '⚠️ 推播提醒：目前尚無任何報名者名單。');
    console.log('✅ Test 6 Passed!\n');

    console.log('🎉 ALL 6 TESTS PASSED SUCCESSFULLY! 🎉');
}

runTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
