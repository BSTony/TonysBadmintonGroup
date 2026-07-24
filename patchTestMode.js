const fs = require('fs');
const file = 'c:/Users/tony.hsieh/Desktop/TonysData/TonysBadmintion/public/app.js';
let content = fs.readFileSync(file, 'utf8');

const regex1 = /globalIsSuperAdmin = \(testRole !== 'user'\);\s*globalIsAdmin = \(testRole !== 'user'\);/;
const replacement1 = `const urlBuyGid = testParams.get('buy');
      if (urlBuyGid && !testRole) {
        globalIsSuperAdmin = false;
        globalIsAdmin = false;
        currentUser.displayName = '一般訪客 (Local Test)';
      } else {
        globalIsSuperAdmin = (testRole !== 'user');
        globalIsAdmin = (testRole !== 'user');
      }`;
content = content.replace(regex1, replacement1);

const regex2 = /const url = new URL\(window\.location\.href\);\s*url\.searchParams\.set\('buy', currentGid\);/;
const replacement2 = `const url = new URL(window.location.href);
        url.searchParams.delete('testRole');
        url.searchParams.set('buy', currentGid);`;
content = content.replace(regex2, replacement2);

fs.writeFileSync(file, content);
console.log('Replaced local test logic successfully!');
