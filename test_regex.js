const str = 'Tony$,Kay$';
const rawList = str.split(/[\s,、，\n]+/).map(n => n.trim()).filter(Boolean);
let initialList = [];
let initialPaidMap = {};
rawList.forEach(n => {
    let isPaid = false;
    if (n.endsWith('$') || n.endsWith('＄') || n.endsWith('(已繳費)') || n.endsWith('（已繳費）')) {
        isPaid = true;
        n = n.replace(/[\$＄]$/, '').replace(/\(已繳費\)$/, '').replace(/（已繳費）$/, '');
    }
    const match = n.match(/^(.*?)(?:[\(\[（](.*?)[\)\]）]|-(.*?))$/);
    if (match) {
        const trueName = match[1].trim();
        initialList.push(trueName);
        if (isPaid) initialPaidMap[trueName] = true;
    } else {
        initialList.push(n);
        if (isPaid) initialPaidMap[n] = true;
    }
});
console.log(initialList, initialPaidMap);
