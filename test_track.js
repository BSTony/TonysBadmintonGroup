function seededRandom() { return 0.5; }
let START_Y = 585; // 900 * 0.65
const W = 800;
const TRACK_WIDTH = 180;
const Math_PI = Math.PI;

function buildTopDownTrack(W) {
  const pathPoints = [];
  const steps = 280;
  const maxT = Math_PI * 10;
  const stretch = 200;

  let currentY = START_Y + 10;
  currentY += 250; // funnelHeight
  
  for(let y = currentY; y < currentY + 100; y += 20) {
    pathPoints.push({ x: W/2, y: y });
  }
  currentY += 100;

  const phase1 = seededRandom() * Math_PI * 2;
  const freq1 = 0.8;
  const w1 = 0.5 + seededRandom() * 0.2;
  
  const trackWaveStartY = currentY;

  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * maxT;
    const y = trackWaveStartY + t * stretch;
    pathPoints.push({ x: W/2, y: y });
    currentY = y;
  }
  
  for(let i = 0; i < 15; i++) {
    currentY += 20;
    pathPoints.push({ x: W/2, y: currentY });
  }
  return pathPoints[pathPoints.length-1].y;
}
console.log(buildTopDownTrack(800));
