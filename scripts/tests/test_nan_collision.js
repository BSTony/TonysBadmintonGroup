const Matter = require('matter-js');
const engine = Matter.Engine.create();
const finishLine = Matter.Bodies.rectangle(100, NaN, 200, 40, {
  isStatic: true,
  isSensor: true,
  plugin: { isFinishLine: true }
});
const ball = Matter.Bodies.circle(100, 100, 10, {
  plugin: { isBall: true, name: 'Test' }
});
Matter.World.add(engine.world, [finishLine, ball]);
Matter.Events.on(engine, 'collisionStart', (event) => {
  console.log("COLLISION DETECTED!");
});
Matter.Engine.update(engine, 16.666);
