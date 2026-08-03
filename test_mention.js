const fs = require('fs');

let code = fs.readFileSync('index.js', 'utf8');
const funcRegex = /function generatePushMentionMessages[\s\S]*?return messagesToSend;\n}/;
const match = code.match(funcRegex);

if (!match) {
    console.error("Function not found!");
    process.exit(1);
}

eval(match[0]);

const mockGame = {
    title: "Test Game",
    date: "07/31",
    time: "14:00",
    location: "Stadium",
    gid: "group123",
    gameId: "game123",
    active: true,
    sections: [{
        list: ["Alice", "Bob", "__ANON__", "Charlie"],
        limit: 20
    }],
    levelMap: { "Alice": "A" },
    paidMap: { "Bob": true }
};

const nameToUidMap = new Map();
nameToUidMap.set("game123_Alice", "U_alice");
nameToUidMap.set("game123_Bob", "U_bob");
// Charlie has no UID mapped

try {
    const msgs = generatePushMentionMessages([mockGame], "group123", true, nameToUidMap);
    console.log("SUCCESS:");
    console.log(JSON.stringify(msgs, null, 2));
} catch (e) {
    console.error("ERROR:", e);
}
