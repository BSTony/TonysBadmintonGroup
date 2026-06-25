const text = `接龍開始
日期：星期二
時間：晚6~8
地點：南港運
費用：230
人數：20
備註：新手友善，請自備零錢`;

const dateMatch = text.match(/日期\\s*[:：]?\\s*(?:[{\\uff5b]([\\s\\S]*?)[}\\uff5d]|([^\\n]*?(?=\\s*(?:標題|時間|地點|費用|人數|候補|備註|名單|$))))/);
const timeMatch = text.match(/時間\\s*[:：]?\\s*(?:[{\\uff5b]([\\s\\S]*?)[}\\uff5d]|([^\\n]*?(?=\\s*(?:標題|日期|地點|費用|人數|候補|備註|名單|$))))/);
const locMatch = text.match(/地點\\s*[:：]?\\s*(?:[{\\uff5b]([\\s\\S]*?)[}\\uff5d]|([^\\n]*?(?=\\s*(?:標題|日期|時間|費用|人數|候補|備註|名單|$))))/);

console.log("dateMatch:", dateMatch);
console.log("timeMatch:", timeMatch);
console.log("locMatch:", locMatch);
