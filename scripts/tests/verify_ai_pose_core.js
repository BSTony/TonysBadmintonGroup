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

// 4. 遠半場放大裁切：底線後方視角下要比全場小、包含遠端底線上方的人，且不超出畫面
function testFarCrop() {
  const img = [{ x: 520, y: 200 }, { x: 760, y: 200 }, { x: 1060, y: 690 }, { x: 220, y: 690 }];
  const Hinv = PoseCore.computeHomography(PoseCore.courtCorners(), img);
  const crop = PoseCore.courtCrop(img, 1280, 720);
  const far = PoseCore.farCourtCrop(Hinv, 1280, 720, crop);
  assert(far, 'far crop should exist for a baseline view');
  assert(far.x >= 0 && far.y >= 0 && far.x + far.w <= 1280 && far.y + far.h <= 720, 'far crop inside frame');
  assert(far.y < 200 - 60 && far.y + far.h > 200, 'far crop covers players standing on the far baseline');
  assert(far.w * far.h < crop.w * crop.h / 2, 'far crop is a zoomed sub-region');
  // 俯視角度幾乎沒有放大效果時就不要多算一次
  const top = [{ x: 100, y: 50 }, { x: 1180, y: 50 }, { x: 1180, y: 670 }, { x: 100, y: 670 }];
  const HinvTop = PoseCore.computeHomography(PoseCore.courtCorners(), top);
  assert.strictEqual(PoseCore.farCourtCrop(HinvTop, 1280, 720, PoseCore.courtCrop(top, 1280, 720)), null, 'no far crop without zoom gain');

  const box = (x1, y1, x2, y2, score) => ({ score, box: { x1, y1, x2, y2 } });
  const merged = PoseCore.mergeDetections([[box(0, 0, 10, 20, 0.6)], [box(1, 0, 11, 20, 0.9), box(50, 50, 60, 70, 0.4)]]);
  assert.deepStrictEqual(merged.map((d) => d.score), [0.9, 0.4], 'merge keeps the best of overlapping boxes');
  console.log('✅ far crop / merge detections');
}

// 5. 追球：背景中位數、輸入通道順序（背景在前）、熱圖取最大區塊中心
function testShuttle() {
  const px = (r, g, b) => Uint8ClampedArray.from([r, g, b, 255]);
  const med = PoseCore.medianImage([px(10, 0, 0), px(30, 0, 0), px(20, 0, 0), px(90, 0, 0)]);
  assert.deepStrictEqual(Array.from(med), [25, 0, 0, 255], 'median of even count averages the middle two');

  const { width: w, height: h } = PoseCore.SHUTTLE;
  const area = w * h;
  const solid = (v) => { const a = new Uint8ClampedArray(area * 4); for (let i = 0; i < area; i++) { a[i * 4] = v; a[i * 4 + 1] = v + 1; a[i * 4 + 2] = v + 2; a[i * 4 + 3] = 255; } return a; };
  const frames = Array.from({ length: 8 }, (_, k) => solid(10 * (k + 1)));
  const input = PoseCore.buildTrackNetInput(solid(200), frames);
  assert.strictEqual(input.length, 27 * area, 'input has 27 channels');
  close(input[0], 200 / 255, 1e-6, 'channel 0 is background R');
  close(input[2 * area], 202 / 255, 1e-6, 'channel 2 is background B');
  close(input[3 * area], 10 / 255, 1e-6, 'channel 3 is frame 1 R');
  close(input[26 * area], 82 / 255, 1e-6, 'channel 26 is frame 8 B');

  const heat = new Float32Array(2 * area);
  for (let y = 100; y < 104; y++) for (let x = 200; x < 206; x++) heat[area + y * w + x] = 0.9;
  heat[area + 10 * w + 10] = 0.95;
  assert.strictEqual(PoseCore.decodeShuttleHeatmap(heat, 0), null, 'empty heatmap has no shuttle');
  assert.deepStrictEqual(PoseCore.decodeShuttleHeatmap(heat, 1), { x: 203, y: 102 }, 'largest blob center wins');
  console.log('✅ shuttle background / input / heatmap decode');
}

function testShuttlePace() {
  const samples = [];
  for (let i = 0; i <= 4; i++) samples.push({ t: i * 0.1, x: i * 10, y: 0 });
  samples.push({ t: 2, x: 0, y: 0 });
  samples.push({ t: 2.1, x: 1, y: 0 });
  const pace = PoseCore.shuttlePace(samples, (x, y) => ({ x, y }));
  assert.strictEqual(pace.flights.length, 2, 'a time gap starts a new flight');
  close(pace.flights[0].peak, 360, 0.1, '10 m in 0.1 s is 360 km/h');
  close(pace.max, 360, 0.1, 'max speed');
  assert.strictEqual(PoseCore.shuttleRhythm(pace.flights[0].peak), '殺球');
  assert.strictEqual(PoseCore.shuttleRhythm(36), '控球');
  assert.strictEqual(PoseCore.shuttlePace([{ t: 0, x: null, y: null }], (x, y) => ({ x, y })).points.length, 0);
  console.log('✅ shuttle pace');
}

function u32(view, offset, value) {
  view.setUint32(offset, value);
}

function testPatchMp4Duration() {
  const mvhd = new Uint8Array(8 + 20);
  const mv = new DataView(mvhd.buffer);
  u32(mv, 0, mvhd.length);
  mvhd.set([109, 118, 104, 100], 4); // mvhd
  u32(mv, 20, 1000); // timescale at content+12 → file offset 8+12=20
  u32(mv, 24, 1566794000); // bogus duration
  const moov = new Uint8Array(8 + mvhd.length);
  const mo = new DataView(moov.buffer);
  u32(mo, 0, moov.length);
  moov.set([109, 111, 111, 118], 4); // moov
  moov.set(mvhd, 8);
  const fixed = PoseCore.patchMp4Duration(moov, 60);
  assert.strictEqual(new DataView(fixed.buffer).getUint32(8 + 24), 60000, 'duration rewritten to 60s at timescale 1000');
  console.log('✅ mp4 duration patch');
}

testDecode();
testHomography();
testTrackerAndStats();
testFarCrop();
testShuttle();
testShuttlePace();
testPatchMp4Duration();
console.log('\n🎉 AI pose core checks passed');
