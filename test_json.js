function deeplyParseJson(val) {
  if (typeof val === 'string') {
    try {
      return deeplyParseJson(JSON.parse(val));
    } catch(e) {
      return val;
    }
  }
  if (Array.isArray(val)) {
    return val.map(deeplyParseJson);
  }
  if (val !== null && typeof val === 'object') {
    const res = {};
    for (const [k, v] of Object.entries(val)) {
      res[k] = deeplyParseJson(v);
    }
    return res;
  }
  return val;
}

const obj = { paidMap: { "A": true, "B": false } };
const json1 = JSON.stringify(obj);
const json2 = JSON.stringify(json1);

const parsed = deeplyParseJson(json2);
console.log(parsed);
