const Matter = require('matter-js');
console.log(Matter.Detector.canCollide(
  { category: 1, mask: 0, group: 0 },
  { category: 1, mask: 4294967295, group: 0 }
));
