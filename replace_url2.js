const fs = require('fs');
let indexJs = fs.readFileSync('index.js', 'utf8');

indexJs = indexJs.replace(
  /if \(process\.env\.LIFF_ID\) \{\s*msg \+= `\\n👇 點擊下方連結進入報名大廳\\nhttps:\/\/liff\.line\.me\/\$\{process\.env\.LIFF_ID\}\?gid=\$\{gid\}`;\s*\}\s*const message = \{ type: 'text', text: msg\.trim\(\) \};\s*if \(token\) \{\s*return await client\.replyMessage\(token, message\);\s*\}\s*try \{\s*await pushToAdmins\(gid, message\);\s*\} catch \(e\) \{\s*console\.error\(`pushToAdmins failed for \$\{gid\}:`, e\);\s*throw e;\s*\}/g,
  `let msgs = [{ type: 'text', text: msg.trim() }];
  if (process.env.LIFF_ID) {
    msgs.push(getLobbyCard(gid));
  }
  
  if (token) {
    return await client.replyMessage(token, msgs);
  }
  try {
    await pushToAdmins(gid, msgs);
  } catch (e) {
    console.error(\`pushToAdmins failed for \${gid}:\`, e);
    throw e;
  }`
);

fs.writeFileSync('index.js', indexJs);
console.log('done2');
