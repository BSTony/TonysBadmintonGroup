const fs = require('fs');
let code = fs.readFileSync('public/pinball.js', 'utf8');
code = code.replace(/window\.currentUser/g, "(typeof currentUser !== 'undefined' ? currentUser : null)");
code = code.replace(/window\.globalIsSuperAdmin/g, "(typeof globalIsSuperAdmin !== 'undefined' ? globalIsSuperAdmin : false)");
fs.writeFileSync('public/pinball.js', code);
console.log('Fixed pinball.js');
