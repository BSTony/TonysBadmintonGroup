const fs = require('fs');

// We will load index.js, but stub out the express server and line client so we can test the function logic.
let code = fs.readFileSync('index.js', 'utf8');

// Replace the express app.listen and bot listener so it doesn't actually start the server
code = code.replace(/app\.listen\([\s\S]*?\);/, 'console.log("Skipped app.listen");');
code = code.replace(/app\.post\('\/webhook'[\s\S]*?}\);/, 'console.log("Skipped app.post webhook");');
code = code.replace(/setInterval\([\s\S]*?\);/g, 'console.log("Skipped setInterval");');

// Save the modified code
fs.writeFileSync('test_webhook.js', code);

console.log("test_webhook.js created.");
