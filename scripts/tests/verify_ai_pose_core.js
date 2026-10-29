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

  const cols = 57;
  const e2e = new Float32Array(2 * cols);
  e2e[0] = 270; e2e[1] = 220; e2e[2] = 370; e2e[3] = 420; e2e[4] = 0.9; e2e[5] = 0;
  e2e[6 + 16 * 3] = 336; e2e[6 + 16 * 3 + 1] = 336; e2e[6 + 16 * 3 + 2] = 0.66;
  e2e[cols + 4] = 0.1;
  const e2eDets = PoseCore.decodePose(e2e, [1, 2, cols], lb, crop, { confThreshold: 0.3, iouThreshold: 0.5 });
  assert.strictEqual(e2eDets.length, 1, 'end-to-end low score filtered');
  close(e2eDets[0].box.x1, (270 - 0) / 0.5 + 100, 1e-6, 'e2e box x1');
  close(e2eDets[0].keypoints[16].x, 336 / 0.5 + 100, 1e-6, 'e2e keypoint x');
  close(e2eDets[0].keypoints[16].score, 0.66, 1e-6, 'e2e keypoint score');
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

  const steady = [];
  for (let i = 0; i <= 20; i++) steady.push({ t: i / 30, x: i * 0.4, y: 0 });
  steady.push({ t: 21 / 30, x: 80, y: 0 });
  const filtered = PoseCore.shuttlePace(steady, (x, y) => ({ x, y }));
  assert.ok(filtered.max < 80, 'a one-frame jump must not become the reported speed, got ' + filtered.max);
  assert.ok(filtered.max > 30, 'steady motion is still measured, got ' + filtered.max);

  const teleport = [];
  for (let i = 0; i <= 20; i++) teleport.push({ t: i / 30, x: i * 0.25, y: 6 });
  teleport[10] = { t: 10 / 30, x: 0.25 * 10 + 15, y: 6 };
  const spiked = PoseCore.shuttlePace(teleport, (x, y) => ({ x, y }));
  assert.ok(spiked.max < 80, 'a 15 m one-frame jump must not show as ~1600 km/h, got ' + spiked.max);

  const drive = [];
  for (let i = 0; i <= 15; i++) drive.push({ t: i / 30, x: i * (200 / 3.6) / 30, y: 0 });
  const kept = PoseCore.shuttlePace(drive, (x, y) => ({ x, y }));
  close(kept.max, 200, 15, 'a real 200 km/h segment is kept');

  const air = [];
  for (let i = 0; i <= 12; i++) air.push({ t: i / 30, x: 100 + i * 8, y: 40 });
  const airborne = PoseCore.shuttlePace(air, () => null, { metersPerPixel: () => 0.05 });
  close(airborne.max, 8 / (1 / 30) * 0.05 * 3.6, 8, 'screen motion still has a speed when the ground projection is unusable');
  assert.ok(airborne.points.length > 8, 'airborne samples are not dropped');
  assert.ok(airborne.flights[0].exit > 0, 'exit speed is the leave-racket speed');

  // 離拍瞬間快、後面變慢：球速要抓開頭，不是飛行中段
  const fade = [];
  for (let i = 0; i <= 18; i++) {
    const t = i / 30;
    const u = Math.min(1, t / 0.5);
    const speed = (220 - 160 * u) / 3.6;
    fade.push({ t, x: i === 0 ? 0 : fade[i - 1].x + speed / 30, y: 0 });
  }
  const faded = PoseCore.shuttlePace(fade, (x, y) => ({ x, y }));
  assert.ok(faded.flights[0].exit > faded.flights[0].end + 40, 'exit is much faster than late-flight speed');
  assert.ok(faded.flights[0].exit > 150, 'exit stays near the leave-racket peak, got ' + faded.flights[0].exit);

  const smooth = [];
  for (let i = 0; i <= 10; i++) smooth.push({ t: i / 30, x: 100 + i * 20, y: 200 });
  for (let i = 1; i <= 6; i++) smooth.push({ t: (10 + i) / 30, x: 300 - i * 18, y: 200 + i * 3 });
  const turned = PoseCore.cleanShuttleTrack(smooth);
  assert.ok(turned.every((p) => p.x != null), 'a straight flight that turns once on a hit is kept');

  const bolt = [];
  for (let i = 0; i <= 8; i++) bolt.push({ t: i / 30, x: 100 + i * 15, y: 300 });
  bolt.push({ t: 9 / 30, x: 520, y: 40 });
  bolt.push({ t: 10 / 30, x: 100 + 9 * 15, y: 300 });
  bolt.push({ t: 11 / 30, x: 100 + 10 * 15, y: 300 });
  const cleaned = PoseCore.cleanShuttleTrack(bolt);
  assert.strictEqual(cleaned[9].x, null, 'a teleport is not part of the trail');
  assert.ok(cleaned[10].x != null && cleaned[11].x != null, 'the real flight continues after the bad point');

  const fan = [];
  for (let i = 0; i < 8; i++) {
    fan.push({ t: i / 15, x: 900, y: 420 });
    fan.push({ t: i / 15 + 0.02, x: 900 - 80 - i * 40, y: 420 - 30 - i * 35 });
  }
  const cleanedFan = PoseCore.cleanShuttleTrack(fan);
  const spokes = cleanedFan.filter((p) => p.x != null && p.x < 780);
  assert.strictEqual(spokes.length, 0, 'fan spokes around the shuttle are removed');
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

function kp(points) {
  const data = new Float32Array(17 * 3);
  Object.keys(points).forEach((index) => {
    const i = Number(index);
    data[i * 3] = points[i][0];
    data[i * 3 + 1] = points[i][1];
    data[i * 3 + 2] = points[i][2] == null ? 0.9 : points[i][2];
  });
  return data;
}

function flight(x0, y0, x1, y1, t0) {
  const samples = [];
  for (let i = 0; i <= 8; i++) {
    samples.push({ t: t0 + i * 0.05, x: x0 + (x1 - x0) * i / 8, y: y0 + (y1 - y0) * i / 8 });
  }
  return samples;
}

function testRallyReport() {
  const id = (x, y) => ({ x, y });
  const straight = PoseCore.rallyReport({
    shuttle: flight(1.7, 11.6, 1.7, 1.0, 0),
    project: id,
    feet: { near: [{ t: 0, x: 1.7, y: 12 }] },
    poses: [{
      t: 0,
      id: 'near',
      kp: kp({
        5: [1.3, 12.4],
        6: [1.7, 12.4],
        8: [1.7, 12.05],
        10: [1.7, 11.65]
      })
    }],
    mode: 'singles'
  });
  assert.strictEqual(straight.shots.length, 1);
  assert.strictEqual(straight.shots[0].hitter, 'near');
  assert.strictEqual(straight.shots[0].line, '直線');
  assert.strictEqual(straight.shots[0].zone, '後場');
  assert.strictEqual(PoseCore.courtZone(6.7), 'front', 'the net is the front court');
  assert.strictEqual(PoseCore.courtZone(6.7 + 1.98), 'front', 'short service line is still the front court');
  assert.strictEqual(PoseCore.courtZone(0.5), 'rear', 'near the baseline is the rear court');
  assert.strictEqual(straight.shots[0].out, false);
  assert.strictEqual(straight.shots[0].action, '高舉手');

  const cross = PoseCore.rallyReport({
    shuttle: flight(1, 11, 5, 2, 1),
    project: id,
    feet: { near: [{ t: 1, x: 1, y: 12 }] },
    poses: [],
    mode: 'doubles'
  });
  assert.strictEqual(cross.shots[0].line, '斜線');
  assert.strictEqual(cross.shots[0].out, false);

  const drop = PoseCore.rallyReport({
    shuttle: flight(3, 7.5, 3.2, 6.2, 2),
    project: id,
    feet: { near: [{ t: 2, x: 3, y: 8 }] },
    poses: [],
    mode: 'doubles'
  });
  assert.strictEqual(drop.shots[0].line, '放短');
  assert.strictEqual(drop.shots[0].zone, '前場');

  const first = flight(2, 11, 2, 2, 0);
  const second = flight(2, 2, 2, 11, 4);
  const two = PoseCore.rallyReport({
    shuttle: first.concat(second),
    project: id,
    feet: {},
    poses: [],
    mode: 'doubles'
  });
  const gap = two.dead.find((d) => d.t1 < Infinity);
  assert.ok(gap && gap.t0 < 2 && gap.t1 === 4, 'a long gap ends the rally');
  assert.ok(two.dead.some((d) => d.t0 > 4 && d.t1 === Infinity), 'after the last shot the count stays at zero');

  const out = PoseCore.rallyReport({
    shuttle: flight(3, 12, 0.2, 2, 3),
    project: id,
    feet: {},
    poses: [],
    mode: 'singles'
  });
  assert.strictEqual(out.shots[0].out, true);
  const doublesIn = PoseCore.rallyReport({
    shuttle: flight(3, 12, 0.2, 2, 3),
    project: id,
    feet: {},
    poses: [],
    mode: 'doubles'
  });
  assert.strictEqual(doublesIn.shots[0].out, false);

  const wrist = PoseCore.rallyReport({
    shuttle: flight(2, 11, 2, 2, 4),
    project: id,
    feet: {
      near1: [{ t: 4, x: 4.2, y: 12 }],
      near2: [{ t: 4, x: 2.0, y: 12 }]
    },
    poses: [
      { t: 4, id: 'near1', kp: kp({ 5: [1.8, 11.5], 6: [2.2, 11.5], 8: [2.1, 11.3], 10: [2.05, 11.05] }) },
      { t: 4, id: 'near2', kp: kp({ 5: [4.4, 11.5], 6: [4.8, 11.5], 8: [4.6, 11.3], 10: [4.6, 11.0] }) }
    ],
    mode: 'doubles'
  });
  assert.strictEqual(wrist.shots[0].hitter, 'near1', 'wrist closer than the other foot');

  const feet = [];
  for (let i = 0; i < 4; i++) feet.push({ t: i, x: 3, y: 6.6 });
  const stance = PoseCore.rallyReport({
    shuttle: [],
    project: id,
    feet: { near: feet },
    poses: [{ t: 0, id: 'near', kp: kp({ 15: [2.7, 12], 16: [3.3, 12] }) }],
    mode: 'singles'
  });
  assert.strictEqual(stance.players.near.netRate, 1);
  close(stance.players.near.stance, 0.6, 0.05, 'stance width');

  const moved = [];
  for (let i = 0; i < 6; i++) moved.push({ t: i * 0.2, x: 1 + i * 0.4, y: 12 });
  const travel = PoseCore.rallyReport({
    shuttle: flight(1, 11.5, 1, 2, 0).concat(flight(3, 11.5, 3, 2, 1)),
    project: id,
    feet: { near: moved },
    poses: [],
    mode: 'singles'
  });
  assert.strictEqual(travel.shots.length, 2);
  assert.ok(travel.players.near.move > 1.5 && travel.players.near.move < 2.5, 'move ' + travel.players.near.move);

  console.log('✅ rally report');
}

testDecode();
testHomography();
testTrackerAndStats();
testFarCrop();
testShuttle();
testShuttlePace();
testRallyReport();
testPatchMp4Duration();
console.log('\n🎉 AI pose core checks passed');
