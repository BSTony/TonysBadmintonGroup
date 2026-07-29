const Matter = require('matter-js');
try {
  const ball = Matter.Bodies.circle(0, 0, 10, {
    collisionFilter: undefined
  });
  console.log("Category:", ball.collisionFilter.category);
} catch (e) {
  console.log("Error:", e.message);
}
