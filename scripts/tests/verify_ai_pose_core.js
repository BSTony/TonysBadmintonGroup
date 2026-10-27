const path = require('path');
const assert = require('assert');

const PoseCore = require(path.join(__dirname, '../../public/ai_pose_core.js'));

function close(actual, expected, tol, label) {
  assert(Math.abs(actual - expected) <= tol, `${label}: ${actual} vs ${expected} (tol ${tol})`);
}

// 1. 解碼：用人工輸出 [1, 56, 3] 驗證分數門檻、NMS 與座標還原（含 letterbox 與裁切位移）
function testDecode() {
  const n = 3;
  const data = new Float32Array(56 * n);
  const set = (ch, i, v) => { data[ch * n + i] = v; };
  const anchors = [
    { cx: 320, cy: 320, w: 100, h: 200, score: 0.9 },
    { cx: 325, cy: 322, w: 100, h: 200, score: 0.8 },
    { cx: 100, cy: 300, w: 40, h: 80, score: 0.1 }
  ];
  anchors.forEach((a, i) => {
    set(0, i, a.cx); set(1, i, a.cy); set(2, i, a.w); set(3, i, a.h); set(4, i, a.score);
    for (let k = 0; k < 17; k++) {
      set(5 + k * 3, i, a.cx + k);
      set(6 + k * 3, i, a.cy + k);
      set(7 + k * 3, i, 0.5 + k / 100);
    }
  });
  const lb = PoseCore.letterbox(1280, 720);
  assert.deepStrictEqual([lb.w, lb.h, lb.padX, lb.padY], [640, 360, 0, 140], 'letterbox 1280x720');
  const crop = { x: 100, y: 50, w: 1280, h: 720 };
  const dets = PoseCore.decodePose(data, [1, 56, n], lb, crop, { confThreshold: 0.3, iouThreshold: 0.5 });
  assert.strictEqual(dets.length, 1, 'overlapping box should be suppressed and low score filtered');
  const d = dets[0];
  close(d.score, 0.9, 1e-6, 'score');
  close(d.box.x1, (270 - 0) / 0.5 + 100, 1e-6, 'box x1');
  close(d.box.y1, (220 - 140) / 0.5 + 50, 1e-6, 'box y1');
  close(d.keypoints[16].x, (320 + 16) / 0.5 + 100, 1e-6, 'keypoint x');
  close(d.keypoints[16].y, (320 + 16 - 140) / 0.5 + 50, 1e-6, 'keypoint y');
  close(d.keypoints[16].score, 0.66, 1e-6, 'keypoint score');
  assert.throws(() => PoseCore.decodePose(data, [1, 84, n], lb, null), /模型輸出維度不符/);
  console.log('✅ decodePose / letterbox');
}

// 2. 透視校正：已知矩陣產生四角，反推後任意點都要一致；點擊順序不拘
function testHomography() {
  const Htrue = [1.2, 0.3, 100, -0.1, 0.9, 50, 0.0004, 0.0008, 1];
  const court = PoseCore.courtCorners();
  const img = court.map((p) => PoseCore.applyHomography(Htrue, p.x, p.y));
  const H = PoseCore.computeHomography(court, img);
  for (const p of [{ x: 1, y: 2 }, { x: 5.5, y: 12 }, { x: 3.05, y: 6.7 }]) {
    const a = PoseCore.applyHomography(Htrue, p.x, p.y);
    const b = PoseCore.applyHomography(H, p.x, p.y);
    close(b.x, a.x, 1e-6, 'H x');
    close(b.y, a.y, 1e-6, 'H y');
  }
  const clicked = [{ x: 1500, y: 980 }, { x: 700, y: 300 }, { x: 300, y: 1000 }, { x: 1200, y: 310 }];
  const ordered = PoseCore.orderCorners(clicked);
  assert.deepStrictEqual(ordered, [clicked[1], clicked[3], clicked[0], clicked[2]], 'orderCorners');
  assert(PoseCore.isConvexQuad(ordered), 'ordered quad should be convex');
  assert(!PoseCore.isConvexQuad([clicked[1], clicked[0], clicked[3], clicked[2]]), 'crossed quad should not be convex');
  const crop = PoseCore.courtCrop(ordered, 1920, 1080);
  assert(crop.x >= 0 && crop.y >= 0 && crop.x + crop.w <= 1920 && crop.y + crop.h <= 1080, 'crop stays inside frame');
  console.log('✅ homography / corner ordering / crop');
}

// 3. 追蹤與統計：場外線審分數較高也不能搶走球員編號；雙打編號跟著人走
function testTrackerAndStats() {
  const fake = (x, y, score = 0.9) => ({ det: { score }, court: { x, y } });
  const tracker = PoseCore.createTracker('singles');
  const samples = { near: [], far: [] };
  for (let i = 0; i <= 100; i++) {
    const t = i * 0.1;
    const assigned = tracker.update(t, [fake(0.5 + t * 0.5, 10), fake(3, 3), fake(-0.8, 11, 0.95)]);
    for (const id of Object.keys(assigned)) samples[id].push({ t, x: assigned[id].court.x, y: assigned[id].court.y });
  }
  assert.strictEqual(samples.near.length, 101, 'near samples');
  assert(samples.near.every((s) => s.x > 0), 'near player must not switch to the line judge');
  const near = PoseCore.playerStats(samples.near);
  const far = PoseCore.playerStats(samples.far);
  close(near.distance, 5, 0.2, 'near distance');
  close(far.distance, 0, 1e-9, 'far distance');
  close(near.activeTime, 10, 1e-6, 'active time');
  close(near.zones.mid, 1, 1e-9, 'near zone');

  const doubles = PoseCore.createTracker('doubles');
  let a = doubles.update(0, [fake(1, 9), fake(5, 9), fake(1, 4), fake(5, 4)]);
  assert(a.near1.court.x === 1 && a.near2.court.x === 5, 'doubles initial order by x');
  a = doubles.update(0.1, [fake(4.8, 9.2), fake(1.3, 8.8), fake(1, 4), fake(5, 4)]);
  assert(a.near1.court.x === 1.3 && a.near2.court.x === 4.8, 'doubles keeps identity');

  const heat = PoseCore.heatmapGrid(samples.near);
  assert(heat.max > 0 && heat.cols === 33 && heat.rows === 70, `heatmap grid ${heat.cols}x${heat.rows}`);
  console.log(`✅ tracker / stats（近端 ${near.distance.toFixed(2)} m / ${near.activeTime.toFixed(1)} s）`);
}

testDecode();
testHomography();
testTrackerAndStats();
console.log('\n🎉 AI pose core checks passed');
