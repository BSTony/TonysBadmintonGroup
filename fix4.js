const fs = require('fs');
let content = fs.readFileSync('public/app.js', 'utf8');
content = content.replace(/else alert\([^)]+\);\s+?\} catch\(e\)/g, "else alert('已開始自動抽籤');\n    } catch(e)");
fs.writeFileSync('public/app.js', content, 'utf8');
