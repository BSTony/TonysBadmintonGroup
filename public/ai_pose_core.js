/**
 * Author: Tony Hsieh
 * Date: 2026-10-28
 * Version: 1.3.0
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PoseCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const INPUT_SIZE = 640;
  const NUM_KEYPOINTS = 17;
  const PAD_VALUE = 114;

  // COCO 17 點骨架連線（關鍵點索引）
  const SKELETON = [
    [5, 6], [5, 7], [7, 9], [6, 8], [8, 10],
    [5, 11], [6, 12], [11, 12],
    [11, 13], [13, 15], [12, 14], [14, 16],
    [0, 1], [0, 2], [1, 3], [2, 4]
  ];

  // BWF 羽球規則（Laws of Badminton）球場尺寸，單位公尺。
  // 全場 13.40×6.10；單打寬 5.18，所以兩側各內縮 0.46。線寬 40mm，線本身算在界內。
  // 前發球線離網 1.98；雙打後發球線離底線 0.76。網在正中央。
  const COURT = {
    length: 13.4,
    width: 6.1,
    singlesWidth: 5.18,
    singlesInset: 0.46,
    lineWidth: 0.04,
    netY: 6.7,
    shortService: 1.98,
    doublesLongService: 0.76
  };

  // 球場外仍算球員活動範圍的距離（公尺）
  const DEFAULT_BOUNDS = { side: 1.0, back: 2.0 };

  function letterbox(srcW, srcH, size = INPUT_SIZE) {
    const scale = Math.min(size / srcW, size / srcH);
    const w = Math.round(srcW * scale);
    const h = Math.round(srcH * scale);
    // 與 Ultralytics LetterBox 相同的置中補邊算法
    const padX = Math.max(0, Math.round((size - w) / 2 - 0.1));
    const padY = Math.max(0, Math.round((size - h) / 2 - 0.1));
    return { size, w, h, padX, padY, scaleX: w / srcW, scaleY: h / srcH };
  }

  function rgbaToTensor(rgba, size = INPUT_SIZE, out) {
    const area = size * size;
    const t = out && out.length === 3 * area ? out : new Float32Array(3 * area);
    const inv = 1 / 255;
    for (let i = 0, p = 0; i < area; i++, p += 4) {
      t[i] = rgba[p] * inv;
      t[i + area] = rgba[p + 1] * inv;
      t[i + 2 * area] = rgba[p + 2] * inv;
    }
    return t;
  }

  function iou(a, b) {
    const ix = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
    const iy = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
    const inter = ix * iy;
    const union = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter;
    return union > 0 ? inter / union : 0;
  }

  // 解析人物／骨架輸出。偵測模型是 [1, 84, N] 或端到端 [1, 人數, 6]；骨架仍支援舊格式。
  function decodePose(data, dims, lb, crop, opts = {}) {
    const confThreshold = opts.confThreshold ?? 0.3;
    const iouThreshold = opts.iouThreshold ?? 0.5;
    const maxDetections = opts.maxDetections ?? 30;
    const d1 = dims[1];
    const d2 = dims[2];
    // COCO 偵測：4 框 + 80 類
    if (d1 === 84 || d2 === 84) {
      return decodeDetect(data, dims, lb, crop, opts);
    }
    // 端到端偵測：x1,y1,x2,y2,分數,類別
    if (d1 === 6 || d2 === 6) {
      return decodeDetectEnd2End(data, dims, lb, crop, opts);
    }
    const e2eCols = 6 + NUM_KEYPOINTS * 3;
    if (d2 === e2eCols || d1 === e2eCols) {
      const rowMajor = d2 === e2eCols;
      return decodePoseEnd2End(data, rowMajor ? d1 : d2, e2eCols, rowMajor, lb, crop, confThreshold, iouThreshold, maxDetections);
    }
    const channels = d1;
    const n = d2;
    if (channels !== 5 + NUM_KEYPOINTS * 3) {
      throw new Error(`模型輸出維度不符：${dims.join('x')}`);
    }

    const cands = [];
    for (let i = 0; i < n; i++) {
      const score = data[4 * n + i];
      if (score < confThreshold) continue;
      const cx = data[i];
      const cy = data[n + i];
      const w = data[2 * n + i];
      const h = data[3 * n + i];
      cands.push({ i, score, x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2 });
    }
    return finishPoseCandidates(cands, (c, toX, toY) => {
      const keypoints = new Array(NUM_KEYPOINTS);
      for (let k = 0; k < NUM_KEYPOINTS; k++) {
        const base = (5 + k * 3) * n + c.i;
        keypoints[k] = { x: toX(data[base]), y: toY(data[base + n]), score: data[base + 2 * n] };
      }
      return keypoints;
    }, lb, crop, iouThreshold, maxDetections);
  }

  // YOLO26 端到端：每一列是 x1,y1,x2,y2,分數,類別，接著 17 個點的 x,y,可信度。座標在補邊後的 640 畫面裡
  function decodePoseEnd2End(data, count, cols, rowMajor, lb, crop, confThreshold, iouThreshold, maxDetections) {
    const at = rowMajor
      ? (det, col) => data[det * cols + col]
      : (det, col) => data[col * count + det];
    const cands = [];
    for (let i = 0; i < count; i++) {
      const score = at(i, 4);
      if (!(score >= confThreshold)) continue;
      cands.push({ i, score, x1: at(i, 0), y1: at(i, 1), x2: at(i, 2), y2: at(i, 3) });
    }
    return finishPoseCandidates(cands, (c, toX, toY) => {
      const keypoints = new Array(NUM_KEYPOINTS);
      for (let k = 0; k < NUM_KEYPOINTS; k++) {
        const base = 6 + k * 3;
        keypoints[k] = { x: toX(at(c.i, base)), y: toY(at(c.i, base + 1)), score: at(c.i, base + 2) };
      }
      return keypoints;
    }, lb, crop, iouThreshold, maxDetections);
  }

  function finishPoseCandidates(cands, keypointsOf, lb, crop, iouThreshold, maxDetections) {
    cands.sort((a, b) => b.score - a.score);
    const kept = [];
    for (const c of cands) {
      let suppressed = false;
      for (const k of kept) {
        if (iou(c, k) > iouThreshold) { suppressed = true; break; }
      }
      if (!suppressed) {
        kept.push(c);
        if (kept.length >= maxDetections) break;
      }
    }
    const ox = crop ? crop.x : 0;
    const oy = crop ? crop.y : 0;
    const toX = (x) => (x - lb.padX) / lb.scaleX + ox;
    const toY = (y) => (y - lb.padY) / lb.scaleY + oy;
    return kept.map((c) => ({
      score: c.score,
      box: { x1: toX(c.x1), y1: toY(c.y1), x2: toX(c.x2), y2: toY(c.y2) },
      keypoints: keypointsOf ? keypointsOf(c, toX, toY) : emptyKeypoints()
    }));
  }

  function emptyKeypoints() {
    const keypoints = new Array(NUM_KEYPOINTS);
    for (let k = 0; k < NUM_KEYPOINTS; k++) keypoints[k] = { x: 0, y: 0, score: 0 };
    return keypoints;
  }

  // YOLOv8/11 偵測輸出 [1, 84, N]：只要 person（類別 0）
  function decodeDetect(data, dims, lb, crop, opts = {}) {
    const confThreshold = opts.confThreshold ?? 0.3;
    const iouThreshold = opts.iouThreshold ?? 0.5;
    const maxDetections = opts.maxDetections ?? 30;
    const personClass = opts.personClass ?? 0;
    const d1 = dims[1];
    const d2 = dims[2];
    const channelsFirst = d1 === 84;
    const channels = channelsFirst ? d1 : d2;
    const n = channelsFirst ? d2 : d1;
    if (channels !== 84) throw new Error(`偵測模型輸出維度不符：${dims.join('x')}`);
    const at = channelsFirst
      ? (ch, i) => data[ch * n + i]
      : (ch, i) => data[i * channels + ch];
    const cands = [];
    for (let i = 0; i < n; i++) {
      let bestCls = 0;
      let bestScore = -1;
      for (let c = 0; c < 80; c++) {
        const s = at(4 + c, i);
        if (s > bestScore) { bestScore = s; bestCls = c; }
      }
      if (bestCls !== personClass || !(bestScore >= confThreshold)) continue;
      const cx = at(0, i);
      const cy = at(1, i);
      const w = at(2, i);
      const h = at(3, i);
      cands.push({
        i,
        score: bestScore,
        x1: cx - w / 2,
        y1: cy - h / 2,
        x2: cx + w / 2,
        y2: cy + h / 2
      });
    }
    return finishPoseCandidates(cands, null, lb, crop, iouThreshold, maxDetections);
  }

  // 端到端偵測 [1, 人數, 6] 或 [1, 6, 人數]
  function decodeDetectEnd2End(data, dims, lb, crop, opts = {}) {
    const confThreshold = opts.confThreshold ?? 0.3;
    const iouThreshold = opts.iouThreshold ?? 0.5;
    const maxDetections = opts.maxDetections ?? 30;
    const personClass = opts.personClass ?? 0;
    const d1 = dims[1];
    const d2 = dims[2];
    const rowMajor = d2 === 6;
    const count = rowMajor ? d1 : d2;
    const cols = 6;
    const at = rowMajor
      ? (det, col) => data[det * cols + col]
      : (det, col) => data[col * count + det];
    const cands = [];
    for (let i = 0; i < count; i++) {
      const score = at(i, 4);
      const cls = Math.round(at(i, 5));
      if (cls !== personClass || !(score >= confThreshold)) continue;
      cands.push({ i, score, x1: at(i, 0), y1: at(i, 1), x2: at(i, 2), y2: at(i, 3) });
    }
    return finishPoseCandidates(cands, null, lb, crop, iouThreshold, maxDetections);
  }

  function solveLinear(A, b) {
    const n = b.length;
    const M = A.map((row, i) => row.concat([b[i]]));
    for (let col = 0; col < n; col++) {
      let pivot = col;
      for (let r = col + 1; r < n; r++) {
        if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
      }
      if (Math.abs(M[pivot][col]) < 1e-12) return null;
      const tmp = M[col]; M[col] = M[pivot]; M[pivot] = tmp;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = M[r][col] / M[col][col];
        if (f === 0) continue;
        for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
      }
    }
    return M.map((row, i) => row[n] / row[i]);
  }

  // 由 4 組對應點求 3x3 透視轉換矩陣（h33 固定為 1）
  function computeHomography(src, dst) {
    if (!src || !dst || src.length !== 4 || dst.length !== 4) return null;
    const A = [];
    const b = [];
    for (let i = 0; i < 4; i++) {
      const { x, y } = src[i];
      const { x: u, y: v } = dst[i];
      A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -x * v, -y * v]); b.push(v);
    }
    const h = solveLinear(A, b);
    return h ? h.concat([1]) : null;
  }

  function applyHomography(H, x, y) {
    if (!H) return null;
    const w = H[6] * x + H[7] * y + H[8];
    if (Math.abs(w) < 1e-9) return null;
    return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
  }

  // 鏡頭架在近端底線後方時，遠端兩角在畫面較上方；點擊順序因此不拘
  function orderCorners(points) {
    if (!points || points.length !== 4) return null;
    const byY = points.slice().sort((a, b) => a.y - b.y);
    const far = byY.slice(0, 2).sort((a, b) => a.x - b.x);
    const near = byY.slice(2).sort((a, b) => a.x - b.x);
    return [far[0], far[1], near[1], near[0]];
  }

  function isConvexQuad(pts) {
    if (!pts || pts.length !== 4) return false;
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % 4];
      const c = pts[(i + 2) % 4];
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (Math.abs(cross) < 1e-6) return false;
      const s = Math.sign(cross);
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
    return true;
  }

  // 與 orderCorners 相同順序：遠端左、遠端右、近端右、近端左
  function courtCorners() {
    return [
      { x: 0, y: 0 },
      { x: COURT.width, y: 0 },
      { x: COURT.width, y: COURT.length },
      { x: 0, y: COURT.length }
    ];
  }

  function courtLines() {
    const L = COURT.length;
    const W = COURT.width;
    const s = COURT.singlesInset;
    const n = COURT.netY;
    const ss = COURT.shortService;
    const dl = COURT.doublesLongService;
    return [
      { a: [0, 0], b: [W, 0] }, { a: [W, 0], b: [W, L] }, { a: [W, L], b: [0, L] }, { a: [0, L], b: [0, 0] },
      { a: [s, 0], b: [s, L] }, { a: [W - s, 0], b: [W - s, L] },
      { a: [0, n - ss], b: [W, n - ss] }, { a: [0, n + ss], b: [W, n + ss] },
      { a: [0, dl], b: [W, dl] }, { a: [0, L - dl], b: [W, L - dl] },
      { a: [W / 2, 0], b: [W / 2, n - ss] }, { a: [W / 2, n + ss], b: [W / 2, L] },
      { a: [0, n], b: [W, n], net: true }
    ];
  }

  // 依校正四角裁出球場範圍，讓遠端球員在模型輸入中佔更多像素；上方多留空間給遠端球員的身體
  function courtCrop(imagePoints, frameW, frameH, margins = { side: 0.2, top: 0.35, bottom: 0.15 }) {
    const xs = imagePoints.map((p) => p.x);
    const ys = imagePoints.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const w = maxX - minX;
    const h = maxY - minY;
    const x1 = Math.max(0, Math.floor(minX - w * margins.side));
    const x2 = Math.min(frameW, Math.ceil(maxX + w * margins.side));
    const y1 = Math.max(0, Math.floor(minY - h * margins.top));
    const y2 = Math.min(frameH, Math.ceil(maxY + h * margins.bottom));
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  // 遠端球員在畫面中很小、腳又常被球網擋住，所以遠半場另外裁一塊放大偵測；放大不到 1.25 倍就不值得多算一次
  function farCourtCrop(Hinv, frameW, frameH, courtCropRect, opts = {}) {
    const side = opts.side ?? 1.0;
    const back = opts.back ?? 2.0;
    const pastNet = opts.pastNet ?? 0.8;
    const bodyHeight = opts.bodyHeight ?? 2.4;
    const W = COURT.width;
    const pts = [[-side, -back], [W + side, -back], [W + side, COURT.netY + pastNet], [-side, COURT.netY + pastNet]]
      .map(([x, y]) => applyHomography(Hinv, x, y));
    const farL = applyHomography(Hinv, 0, 0);
    const farR = applyHomography(Hinv, W, 0);
    if (pts.some((p) => !p) || !farL || !farR) return null;
    const pxPerMeter = Math.hypot(farR.x - farL.x, farR.y - farL.y) / W;
    const x1 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.x))));
    const x2 = Math.min(frameW, Math.ceil(Math.max(...pts.map((p) => p.x))));
    const y1 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y)) - bodyHeight * pxPerMeter));
    const y2 = Math.min(frameH, Math.ceil(Math.max(...pts.map((p) => p.y))));
    if (x2 - x1 < 16 || y2 - y1 < 16) return null;
    const crop = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    if (courtCropRect) {
      const gain = Math.min(INPUT_SIZE / crop.w, INPUT_SIZE / crop.h) /
        Math.min(INPUT_SIZE / courtCropRect.w, INPUT_SIZE / courtCropRect.h);
      if (gain < 1.25) return null;
    }
    return crop;
  }

  // 合併多次裁切的偵測結果，重疊的人只保留分數最高的那一筆
  function mergeDetections(lists, iouThreshold = 0.5) {
    const all = [].concat(...lists).sort((a, b) => b.score - a.score);
    const kept = [];
    for (const d of all) {
      if (!kept.some((k) => iou(k.box, d.box) > iouThreshold)) kept.push(d);
    }
    return kept;
  }

  // 有骨架時用腳踝；輕量偵測只有框時，用框底邊中點當腳位
  function footPoint(det, minScore = 0.3) {
    const kps = det && det.keypoints;
    if (kps && kps.length >= 17) {
      const ankles = [kps[15], kps[16]].filter((k) => k && k.score >= minScore);
      if (ankles.length) {
        return {
          x: ankles.reduce((sum, k) => sum + k.x, 0) / ankles.length,
          y: ankles.reduce((sum, k) => sum + k.y, 0) / ankles.length,
          fromAnkles: true
        };
      }
    }
    const box = det && det.box;
    if (!box) return { x: 0, y: 0, fromAnkles: false };
    return { x: (box.x1 + box.x2) / 2, y: box.y2, fromAnkles: false };
  }

  function inCourtArea(p, bounds = DEFAULT_BOUNDS) {
    return p.x >= -bounds.side && p.x <= COURT.width + bounds.side &&
      p.y >= -bounds.back && p.y <= COURT.length + bounds.back;
  }

  function insideLines(p) {
    return p.x >= 0 && p.x <= COURT.width && p.y >= 0 && p.y <= COURT.length;
  }

  function slotsFor(mode) {
    return mode === 'doubles'
      ? [{ id: 'near1', side: 'near' }, { id: 'near2', side: 'near' }, { id: 'far1', side: 'far' }, { id: 'far2', side: 'far' }]
      : [{ id: 'near', side: 'near' }, { id: 'far', side: 'far' }];
  }

  // 以網子分近端／遠端，各半場再依上一格位置做最近配對，避免球員編號亂跳
  function createTracker(mode, opts = {}) {
    const slots = slotsFor(mode);
    const perSide = mode === 'doubles' ? 2 : 1;
    const maxJump = opts.maxJump ?? 3.0;
    const lostAfter = opts.lostAfter ?? 2.0;
    const last = {};

    const isActive = (slot, t) => last[slot.id] && t - last[slot.id].t <= lostAfter;

    function bestAssignment(slotList, cands) {
      let best = { pairs: [], cost: 0 };
      const used = new Set();
      const pairs = [];
      const walk = (idx, cost) => {
        if (idx === slotList.length) {
          if (pairs.length > best.pairs.length || (pairs.length === best.pairs.length && cost < best.cost)) {
            best = { pairs: pairs.slice(), cost };
          }
          return;
        }
        const slot = slotList[idx];
        walk(idx + 1, cost);
        for (let j = 0; j < cands.length; j++) {
          if (used.has(j)) continue;
          const prev = last[slot.id];
          const d = Math.hypot(prev.x - cands[j].court.x, prev.y - cands[j].court.y);
          if (d > maxJump) continue;
          used.add(j);
          pairs.push({ slot, j });
          walk(idx + 1, cost + d);
          pairs.pop();
          used.delete(j);
        }
      };
      walk(0, 0);
      return best.pairs;
    }

    function update(t, candidates) {
      const assigned = {};
      for (const side of ['near', 'far']) {
        const sideSlots = slots.filter((s) => s.side === side);
        const pool = candidates
          .filter((c) => (side === 'near' ? c.court.y >= COURT.netY : c.court.y < COURT.netY))
          .map((c) => Object.assign({}, c, { rank: c.det.score - (insideLines(c.court) ? 0 : 0.25) }))
          .sort((a, b) => b.rank - a.rank)
          .slice(0, perSide + 2);

        const active = sideSlots.filter((s) => isActive(s, t));
        const pairs = bestAssignment(active, pool);
        const usedIdx = new Set();
        for (const p of pairs) {
          assigned[p.slot.id] = pool[p.j];
          usedIdx.add(p.j);
        }

        const free = sideSlots.filter((s) => !assigned[s.id] && !isActive(s, t));
        const rest = pool.filter((c, j) => !usedIdx.has(j)).slice(0, free.length).sort((a, b) => a.court.x - b.court.x);
        free.forEach((s, k) => { if (rest[k]) assigned[s.id] = rest[k]; });
      }
      for (const id of Object.keys(assigned)) {
        last[id] = { x: assigned[id].court.x, y: assigned[id].court.y, t };
      }
      return assigned;
    }

    return { slots, update };
  }

  // 以前後 halfWindow 秒的平均位置平滑，降低關鍵點抖動造成的跑動距離灌水
  function smoothSamples(samples, halfWindow = 0.3) {
    const out = [];
    let lo = 0;
    let hi = 0;
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < samples.length; i++) {
      const t = samples[i].t;
      while (hi < samples.length && samples[hi].t <= t + halfWindow) {
        sx += samples[hi].x; sy += samples[hi].y; hi++;
      }
      while (samples[lo].t < t - halfWindow) {
        sx -= samples[lo].x; sy -= samples[lo].y; lo++;
      }
      const count = hi - lo;
      out.push({ t, x: sx / count, y: sy / count });
    }
    return out;
  }

  function playerStats(samples, opts = {}) {
    const maxGap = opts.maxGap ?? 1.0;
    const maxSpeed = opts.maxSpeed ?? 8;
    const s = smoothSamples(samples, opts.smoothWindow ?? 0.3);
    const zones = { front: 0, mid: 0, rear: 0 };
    let distance = 0;
    let activeTime = 0;
    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < s.length; i++) {
      const p = s[i];
      sumX += p.x;
      sumY += p.y;
      const zone = courtZone(p.y);
      if (zone === 'front') zones.front++;
      else if (zone === 'mid') zones.mid++;
      else zones.rear++;
      if (i > 0) {
        const q = s[i - 1];
        const dt = p.t - q.t;
        if (dt > 0 && dt <= maxGap) {
          const d = Math.hypot(p.x - q.x, p.y - q.y);
          activeTime += dt;
          if (d / dt <= maxSpeed) distance += d;
        }
      }
    }
    const total = s.length || 1;
    return {
      samples: s.length,
      distance,
      activeTime,
      avg: s.length ? { x: sumX / s.length, y: sumY / s.length } : null,
      zones: { front: zones.front / total, mid: zones.mid / total, rear: zones.rear / total }
    };
  }

  function heatmapGrid(samples, cell = 0.25, bounds = DEFAULT_BOUNDS) {
    const x0 = -bounds.side;
    const y0 = -bounds.back;
    const cols = Math.ceil((COURT.width + 2 * bounds.side) / cell);
    const rows = Math.ceil((COURT.length + 2 * bounds.back) / cell);
    const grid = new Float32Array(cols * rows);
    let max = 0;
    for (const p of samples) {
      const c = Math.floor((p.x - x0) / cell);
      const r = Math.floor((p.y - y0) / cell);
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
      const v = ++grid[r * cols + c];
      if (v > max) max = v;
    }
    return { grid, cols, rows, cell, x0, y0, max };
  }

  // ---------- 羽球追蹤（TrackNetV3：背景中位數 + 連續 8 格，各 3 通道，512x288） ----------

  const SHUTTLE = { width: 512, height: 288, seqLen: 8, threshold: 0.5 };

  // 與官方相同取逐像素中位數；偶數張時取中間兩張平均後無條件捨去
  function medianImage(frames) {
    const n = frames.length;
    const len = frames[0].length;
    const out = new Uint8ClampedArray(len);
    const tmp = new Uint8Array(n);
    const mid = n >> 1;
    for (let i = 0; i < len; i++) {
      if ((i & 3) === 3) { out[i] = 255; continue; }
      for (let k = 0; k < n; k++) tmp[k] = frames[k][i];
      tmp.sort();
      out[i] = n % 2 ? tmp[mid] : (tmp[mid - 1] + tmp[mid]) >> 1;
    }
    return out;
  }

  // 通道順序：背景 RGB 在最前面，接著第 1～8 格的 RGB
  function buildTrackNetInput(median, frames, out) {
    const area = SHUTTLE.width * SHUTTLE.height;
    const images = [median].concat(frames);
    const t = out && out.length === images.length * 3 * area ? out : new Float32Array(images.length * 3 * area);
    const inv = 1 / 255;
    for (let f = 0; f < images.length; f++) {
      const src = images[f];
      const o = f * 3 * area;
      for (let i = 0, p = 0; i < area; i++, p += 4) {
        t[o + i] = src[p] * inv;
        t[o + area + i] = src[p + 1] * inv;
        t[o + 2 * area + i] = src[p + 2] * inv;
      }
    }
    return t;
  }

  // 與官方 predict_location 相同：門檻以上的連通區塊取外框面積最大者，回傳外框中心
  function decodeShuttleHeatmap(data, index, w = SHUTTLE.width, h = SHUTTLE.height, threshold = SHUTTLE.threshold, visited) {
    const area = w * h;
    const base = index * area;
    const seen = visited && visited.length === area ? visited.fill(0) : new Uint8Array(area);
    const stack = [];
    let best = null;
    for (let i = 0; i < area; i++) {
      if (seen[i] || !(data[base + i] > threshold)) continue;
      let minX = w;
      let maxX = -1;
      let minY = h;
      let maxY = -1;
      seen[i] = 1;
      stack.push(i);
      while (stack.length) {
        const p = stack.pop();
        const x = p % w;
        const y = (p - x) / w;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= w) continue;
            const q = ny * w + nx;
            if (!seen[q] && data[base + q] > threshold) {
              seen[q] = 1;
              stack.push(q);
            }
          }
        }
      }
      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      if (!best || bw * bh > best.area) best = { area: bw * bh, x: minX + bw / 2, y: minY + bh / 2 };
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  // 球要連續往前飛，被打到才轉向。跳到畫面別處再跳回來的點是追錯，不能連成閃電。
  function cleanShuttleTrack(samples) {
    const out = (samples || []).map((s) => (s ? { t: s.t, x: s.x, y: s.y } : s));
    let anchor = null;
    const turnOf = (vx, vy, nx, ny) => {
      const a = Math.hypot(vx, vy);
      const b = Math.hypot(nx, ny);
      if (a < 1 || b < 1) return 0;
      const cos = Math.min(1, Math.max(-1, (vx * nx + vy * ny) / (a * b)));
      return Math.acos(cos);
    };
    const kill = (i) => {
      if (out[i]) { out[i].x = null; out[i].y = null; }
    };
    for (let i = 0; i < out.length; i++) {
      const p = out[i];
      if (!p || p.x == null || p.y == null) continue;
      if (!anchor) {
        anchor = { t: p.t, x: p.x, y: p.y, vx: 0, vy: 0, n: 1, lastTurn: 0 };
        continue;
      }
      const dt = p.t - anchor.t;
      if (!(dt > 0)) { kill(i); continue; }
      if (dt > 0.4) {
        anchor = { t: p.t, x: p.x, y: p.y, vx: 0, vy: 0, n: 1, lastTurn: 0 };
        continue;
      }
      const step = Math.hypot(p.x - anchor.x, p.y - anchor.y);
      const speed = Math.hypot(anchor.vx, anchor.vy);
      const expect = speed * dt;
      const maxStep = Math.min(160, Math.max(48, expect * 2.3));
      if (anchor.n < 2) {
        if (step > 120) { kill(i); continue; }
      } else if (step > maxStep) {
        kill(i);
        continue;
      }
      const vx = (p.x - anchor.x) / dt;
      const vy = (p.y - anchor.y) / dt;
      const turn = turnOf(anchor.vx, anchor.vy, vx, vy);
      // 連續兩格都大轉彎是亂跳。真正的擊球只轉一次，之後又沿著新方向飛。
      if (anchor.n >= 3 && speed > 60 && turn > 1.15 && anchor.lastTurn > 0.9) {
        kill(i);
        continue;
      }
      const blend = anchor.n < 2 ? 1 : 0.5;
      anchor = {
        t: p.t,
        x: p.x,
        y: p.y,
        vx: anchor.vx * (1 - blend) + vx * blend,
        vy: anchor.vy * (1 - blend) + vy * blend,
        n: anchor.n + 1,
        lastTurn: turn
      };
    }
    dropSpokes(out);
    dropSpokes(out);
    return out;
  }

  // 從真球射出去又立刻回到真球的點，連起來就是圖上那種放射狀黃線
  function dropSpokes(out) {
    const idx = [];
    out.forEach((p, i) => { if (p && p.x != null && p.y != null) idx.push(i); });
    const kill = [];
    for (let k = 1; k < idx.length - 1; k++) {
      const a = out[idx[k - 1]];
      const b = out[idx[k]];
      const c = out[idx[k + 1]];
      if (b.t - a.t > 0.25 || c.t - b.t > 0.25) continue;
      const ab = Math.hypot(b.x - a.x, b.y - a.y);
      const bc = Math.hypot(c.x - b.x, c.y - b.y);
      const ac = Math.hypot(c.x - a.x, c.y - a.y);
      if (ab > 36 && bc > 36 && ac < Math.min(ab, bc) * 0.5) kill.push(idx[k]);
    }
    kill.forEach((i) => { out[i].x = null; out[i].y = null; });
  }

  // 用畫面上的移動乘上該處的球場比例來估計球速。
  // 擊球瞬間：球路方向明顯反轉（例如往左變往右）時切成新的一拍，
  // 再取之後約 5 幀的平均速度當「離拍時速」。
  function shuttlePace(samples, project, opts) {
    const GAP = 0.2;
    const EXIT_FRAMES = Math.max(2, (opts && opts.exitFrames) || 5);
    // 相鄰兩段速度夾角接近反向（cos 接近 -1）就算擊球
    const HIT_DOT = (opts && opts.hitDot != null) ? opts.hitDot : -0.2;
    const MIN_HIT_PX_S = 40;
    const MAX_KMH = 420;
    const groups = [];
    let cur = [];
    const closeCur = () => {
      if (cur.length) groups.push(cur);
      cur = [];
    };
    (samples || []).forEach((s) => {
      if (!s || s.x == null || s.y == null) {
        closeCur();
        return;
      }
      if (cur.length && s.t - cur[cur.length - 1].t > GAP) closeCur();
      cur.push({ t: s.t, ix: s.x, iy: s.y });
    });
    closeCur();

    const points = [];
    const medianOf = (vals) => {
      const sorted = vals.slice().sort((a, b) => a - b);
      return sorted[sorted.length >> 1];
    };
    // 沿著這一段的飛行方向換算每像素幾公尺。呼叫端可提供校正比例；沒有時才用投影。
    const scaleAt = (x0, y0, x1, y1) => {
      if (opts && typeof opts.metersPerPixel === 'function') {
        const given = opts.metersPerPixel(x0, y0, x1, y1);
        if (given > 0.001 && given < 2) return given;
      }
      if (typeof project !== 'function') return null;
      const a = project(x0, y0);
      const b = project(x1, y1);
      if (!a || !b || !isFinite(a.x) || !isFinite(b.x)) return null;
      const img = Math.hypot(x1 - x0, y1 - y0);
      if (!(img >= 0.05)) return null;
      const mpp = Math.hypot(b.x - a.x, b.y - a.y) / img;
      if (!(mpp > 0.001 && mpp < 2)) return null;
      return mpp;
    };
    const stepKmh = (a, b) => {
      const dt = b.t - a.t;
      if (!(dt > 0) || dt > 0.2) return null;
      const imgDist = Math.hypot(b.ix - a.ix, b.iy - a.iy);
      if (!(imgDist >= 0.05)) return null;
      const mpp = scaleAt(a.ix, a.iy, b.ix, b.iy);
      if (!mpp) return null;
      const kmh = imgDist / dt * mpp * 3.6;
      if (!(kmh > 0) || kmh > MAX_KMH) return null;
      return kmh;
    };
    // 前後都跳很遠、但前後兩點彼此很近，就是單格追錯。
    // 真正擊球折返後會繼續往新方向飛，那種轉折要留著。
    const dropSpikes = (raw) => {
      if (raw.length < 3) return raw;
      const keep = raw.map(() => true);
      for (let i = 1; i < raw.length - 1; i++) {
        const prev = raw[i - 1];
        const p = raw[i];
        const next = raw[i + 1];
        if (p.t - prev.t > 0.12 || next.t - p.t > 0.12) continue;
        const jumpIn = Math.hypot(p.ix - prev.ix, p.iy - prev.iy);
        const jumpOut = Math.hypot(next.ix - p.ix, next.iy - p.iy);
        const bridge = Math.hypot(next.ix - prev.ix, next.iy - prev.iy);
        if (!(jumpIn > 8 && jumpOut > 8 && bridge < Math.min(jumpIn, jumpOut) * 0.5)) continue;
        let bounceContinues = false;
        if (i + 2 < raw.length && raw[i + 2].t - next.t <= 0.12) {
          const n2 = raw[i + 2];
          const bx = next.ix - p.ix;
          const by = next.iy - p.iy;
          const cx = n2.ix - next.ix;
          const cy = n2.iy - next.iy;
          const bs = Math.hypot(bx, by);
          const cs = Math.hypot(cx, cy);
          if (bs > 1 && cs > 1 && (bx * cx + by * cy) / (bs * cs) > 0.5) bounceContinues = true;
        }
        if (!bounceContinues) keep[i] = false;
      }
      return raw.filter((_, i) => keep[i]);
    };
    // 找出方向反轉的點：前一段往左、後一段往右之類
    const findHitStarts = (cleaned) => {
      const starts = [0];
      for (let i = 2; i < cleaned.length; i++) {
        const a = cleaned[i - 2];
        const b = cleaned[i - 1];
        const c = cleaned[i];
        const dt1 = b.t - a.t;
        const dt2 = c.t - b.t;
        if (!(dt1 > 0) || !(dt2 > 0) || dt1 > 0.15 || dt2 > 0.15) continue;
        const v1x = (b.ix - a.ix) / dt1;
        const v1y = (b.iy - a.iy) / dt1;
        const v2x = (c.ix - b.ix) / dt2;
        const v2y = (c.iy - b.iy) / dt2;
        const s1 = Math.hypot(v1x, v1y);
        const s2 = Math.hypot(v2x, v2y);
        if (s1 < MIN_HIT_PX_S || s2 < MIN_HIT_PX_S) continue;
        const den = s1 * s2;
        if (!(den > 0)) continue;
        const dot = (v1x * v2x + v1y * v2y) / den;
        if (dot > HIT_DOT) continue;
        const hitAt = i - 1;
        if (starts[starts.length - 1] !== hitAt) starts.push(hitAt);
      }
      return starts;
    };
    // 離拍時速：擊球後最多 EXIT_FRAMES 幀的平均速度
    const exitAverage = (cleaned, startIdx, endIdx) => {
      const last = Math.min(endIdx, startIdx + EXIT_FRAMES);
      const samples = [];
      for (let i = startIdx + 1; i <= last; i++) {
        const kmh = stepKmh(cleaned[i - 1], cleaned[i]);
        if (kmh != null) samples.push(kmh);
      }
      if (!samples.length) return 0;
      return samples.reduce((a, v) => a + v, 0) / samples.length;
    };

    const packed = [];
    groups.forEach((raw) => {
      const cleaned = dropSpikes(raw);
      if (cleaned.length < 2) return;
      const starts = findHitStarts(cleaned);
      for (let s = 0; s < starts.length; s++) {
        const startIdx = starts[s];
        const endIdx = (s + 1 < starts.length ? starts[s + 1] : cleaned.length - 1);
        if (endIdx <= startIdx) continue;
        const flightId = packed.length;
        const speeds = [];
        for (let i = startIdx + 1; i <= endIdx; i++) {
          const kmh = stepKmh(cleaned[i - 1], cleaned[i]);
          if (kmh == null) continue;
          speeds.push(kmh);
          points.push({ t: cleaned[i].t, kmh, flight: flightId, raw: kmh });
        }
        if (!speeds.length) continue;
        const exit = exitAverage(cleaned, startIdx, endIdx);
        const peak = speeds.reduce((m, v) => Math.max(m, v), 0);
        const end = speeds[speeds.length - 1];
        const exitVal = exit > 0 ? exit : peak;
        packed.push({
          t0: cleaned[startIdx].t,
          t1: cleaned[endIdx].t,
          peak,
          exit: exitVal,
          start: exitVal,
          end,
          hold: exitVal > 1 ? end / exitVal : 0,
          frames: Math.min(EXIT_FRAMES, endIdx - startIdx)
        });
      }
    });

    // 畫面瞬時速再做一點平滑，避免單一格抖動；離拍時速仍用上面的 5 幀平均
    const rawKmh = points.map((p) => p.raw);
    for (let i = 0; i < points.length; i++) {
      const bucket = [];
      const id = points[i].flight;
      for (let j = i; j >= 0 && points[i].t - points[j].t <= 0.05 && points[j].flight === id; j--) bucket.push(rawKmh[j]);
      for (let j = i + 1; j < points.length && points[j].t - points[i].t <= 0.05 && points[j].flight === id; j++) bucket.push(rawKmh[j]);
      points[i].kmh = medianOf(bucket);
    }
    const max = packed.reduce((m, f) => Math.max(m, f.exit || f.peak), 0);
    const avg = packed.length ? packed.reduce((a, f) => a + (f.exit || f.peak), 0) / packed.length : 0;
    const hold = packed.length ? packed.reduce((a, f) => a + f.hold, 0) / packed.length : 0;
    return { points, flights: packed, max, avg, hold };
  }

  function kpPoint(kp, index, minScore) {
    if (!kp || kp.length < (index + 1) * 3) return null;
    const score = kp[index * 3 + 2];
    if (!(score >= minScore)) return null;
    return { x: kp[index * 3], y: kp[index * 3 + 1] };
  }

  function jointAngle(a, b, c) {
    const v1x = a.x - b.x;
    const v1y = a.y - b.y;
    const v2x = c.x - b.x;
    const v2y = c.y - b.y;
    const denom = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
    if (denom < 1e-6) return null;
    const cos = Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y) / denom));
    return Math.acos(cos) * 180 / Math.PI;
  }

  function playerSide(id) {
    if (id === 'near' || id === 'near1' || id === 'near2') return 'near';
    if (id === 'far' || id === 'far1' || id === 'far2') return 'far';
    return '';
  }

  // 前場到前發球線（離網 1.98m）。後場取同樣深度，雙打後發球線（離底線 0.76m）落在後場裡。
  function courtZone(y) {
    const fromNet = Math.abs(y - COURT.netY);
    if (fromNet <= COURT.shortService) return 'front';
    if (fromNet >= COURT.netY - COURT.shortService) return 'rear';
    return 'mid';
  }

  function zoneLabel(zone) {
    if (zone === 'front') return '前場';
    if (zone === 'rear') return '後場';
    return '中場';
  }

  // 用球的飛行段，加上腳的位置和手腕，估計每一拍是誰打、直線或斜線、落點、出手。
  // 一拍就是一次擊球（BWF：rally 由連續的 stroke 組成，從發球算到球不再比賽）。
  function rallyReport(input) {
    const shuttle = (input && input.shuttle) || [];
    const project = input && input.project;
    const feet = (input && input.feet) || {};
    const poses = (input && input.poses) || [];
    const mode = input && input.mode === 'doubles' ? 'doubles' : 'singles';
    const shots = [];
    const counts = { shots: 0, straight: 0, cross: 0, drop: 0, in: 0, out: 0, overhead: 0, net: 0, defense: 0 };
    if (typeof project !== 'function') return { shots, players: playerRallyStats(feet, poses, shots, project), counts };

    const GAP = 0.18;
    const trails = [];
    let trail = [];
    const closeTrail = () => {
      if (trail.length >= 2) trails.push(trail);
      trail = [];
    };
    shuttle.forEach((s) => {
      if (!s || s.x == null || s.y == null) { closeTrail(); return; }
      const p = project(s.x, s.y);
      if (!p || !isFinite(p.x) || !isFinite(p.y)) { closeTrail(); return; }
      if (trail.length) {
        const prev = trail[trail.length - 1];
        const dt = s.t - prev.t;
        if (dt > GAP) closeTrail();
        else if (dt > 0.02) {
          const kmh = Math.hypot(p.x - prev.p.x, p.y - prev.p.y) / dt * 3.6;
          if (kmh > 480) return;
        }
      }
      trail.push({ t: s.t, img: { x: s.x, y: s.y }, p });
    });
    closeTrail();

    trails.forEach((points) => {
      const start = points[0];
      const end = points[points.length - 1];
      const dx = end.p.x - start.p.x;
      const dy = end.p.y - start.p.y;
      const dist = Math.hypot(dx, dy);
      const crossed = (start.p.y - COURT.netY) * (end.p.y - COURT.netY) <= 0;
      // 過網，或沿著球場往前飛超過一小段，才算一次擊球；原地亂跳不算
      if (end.t - start.t < 0.08 || dist < 0.45) return;
      if (!crossed && Math.abs(dy) < 0.8) return;
      const line = dist < 2.4 ? '放短' : Math.abs(dx) >= 1.7 ? '斜線' : '直線';
      const landing = landingOf(end.p, mode);
      const hit = hitterAt(start, poses, feet);
      const action = actionAt(hit && hit.arms, dist);
      shots.push({
        t0: start.t,
        t1: end.t,
        hitter: hit ? hit.id : '',
        line,
        zone: landing.zone,
        out: landing.out,
        side: landing.side,
        action
      });
      counts.shots++;
      if (line === '直線') counts.straight++;
      else if (line === '斜線') counts.cross++;
      else counts.drop++;
      if (landing.out) counts.out++;
      else counts.in++;
      if (action === '高舉手') counts.overhead++;
      else if (action === '放網') counts.net++;
      else if (action === '防守') counts.defense++;
    });

    return { shots, players: playerRallyStats(feet, poses, shots, project), counts, dead: rallyDeadIntervals(shuttle) };
  }

  // 超過約 1 秒沒有球，這一回合就結束了。下一次看到球之前，拍數要維持 0。
  function rallyDeadIntervals(shuttle) {
    const seen = [];
    (shuttle || []).forEach((s) => {
      if (s && s.x != null && s.y != null) seen.push(s.t);
    });
    const dead = [];
    for (let i = 1; i < seen.length; i++) {
      if (seen[i] - seen[i - 1] > 1) dead.push({ t0: seen[i - 1] + 0.5, t1: seen[i] });
    }
    if (seen.length) dead.push({ t0: seen[seen.length - 1] + 0.8, t1: Infinity });
    return dead;
  }

  function landingOf(p, mode) {
    // 單打界內寬 5.18m（內側邊線），雙打 6.10m。線屬於該區，壓線算界內。
    const inset = mode === 'singles' ? (COURT.width - COURT.singlesWidth) / 2 : 0;
    const inside = p.x >= inset && p.x <= COURT.width - inset && p.y >= 0 && p.y <= COURT.length;
    return { zone: zoneLabel(courtZone(p.y)), out: !inside, side: p.y >= COURT.netY ? 'near' : 'far' };
  }

  function nearestFoot(list, t) {
    if (!list || !list.length) return null;
    let best = null;
    let bestDt = 0.45;
    for (let i = 0; i < list.length; i++) {
      const dt = Math.abs(list[i].t - t);
      if (dt < bestDt) { bestDt = dt; best = list[i]; }
    }
    return best;
  }

  function strikingArm(kp, shuttleImg) {
    const minScore = 0.3;
    const left = [kpPoint(kp, 5, minScore), kpPoint(kp, 7, minScore), kpPoint(kp, 9, minScore)];
    const right = [kpPoint(kp, 6, minScore), kpPoint(kp, 8, minScore), kpPoint(kp, 10, minScore)];
    const ls = left[0];
    const rs = right[0];
    const shoulderWidth = ls && rs ? Math.hypot(ls.x - rs.x, ls.y - rs.y) : 0;
    const arms = [];
    [left, right].forEach((joints) => {
      if (!joints[0] || !joints[1] || !joints[2]) return;
      arms.push({
        shoulder: joints[0],
        wrist: joints[2],
        angle: jointAngle(joints[0], joints[1], joints[2])
      });
    });
    if (!arms.length) return null;
    arms.sort((a, b) => {
      const da = Math.hypot(a.wrist.x - shuttleImg.x, a.wrist.y - shuttleImg.y);
      const db = Math.hypot(b.wrist.x - shuttleImg.x, b.wrist.y - shuttleImg.y);
      return da - db;
    });
    const arm = arms[0];
    const dist = Math.hypot(arm.wrist.x - shuttleImg.x, arm.wrist.y - shuttleImg.y);
    const reach = shoulderWidth > 8 ? shoulderWidth * 3.2 : 2.2;
    return {
      dist,
      reach,
      angle: arm.angle,
      wristAbove: arm.wrist.y < arm.shoulder.y - Math.max(shoulderWidth * 0.15, 0.05)
    };
  }

  function hitterAt(start, poses, feet) {
    const side = start.p.y >= COURT.netY ? 'near' : 'far';
    let wristHit = null;
    poses.forEach((pose) => {
      if (!pose || playerSide(pose.id) !== side || Math.abs(pose.t - start.t) > 0.35) return;
      const arms = strikingArm(pose.kp, start.img);
      if (!arms || arms.dist > arms.reach) return;
      if (!wristHit || arms.dist < wristHit.arms.dist) wristHit = { id: pose.id, arms };
    });
    if (wristHit) return wristHit;
    let best = null;
    let bestD = 2.8;
    Object.keys(feet).forEach((id) => {
      if (playerSide(id) !== side) return;
      const foot = nearestFoot(feet[id], start.t);
      if (!foot) return;
      const d = Math.hypot(foot.x - start.p.x, foot.y - start.p.y);
      if (d < bestD) { bestD = d; best = id; }
    });
    return best ? { id: best, arms: null } : null;
  }

  function actionAt(arms, dist) {
    if (!arms || arms.angle == null) return '不明';
    if (arms.wristAbove && arms.angle >= 145) return '高舉手';
    if (!arms.wristAbove && arms.angle <= 120 && dist < 3.2) return '放網';
    if (!arms.wristAbove && arms.angle <= 135) return '防守';
    return '不明';
  }

  function playerRallyStats(feet, poses, shots, project) {
    const ids = {};
    Object.keys(feet).forEach((id) => { ids[id] = true; });
    shots.forEach((s) => { if (s.hitter) ids[s.hitter] = true; });
    const players = {};
    const prevFoot = {};
    const move = {};
    shots.forEach((s) => {
      if (!s.hitter) return;
      const foot = nearestFoot(feet[s.hitter], s.t0);
      const prev = prevFoot[s.hitter];
      if (prev && foot) {
        const d = Math.hypot(foot.x - prev.x, foot.y - prev.y);
        if (d <= 8) {
          if (!move[s.hitter]) move[s.hitter] = { sum: 0, n: 0 };
          move[s.hitter].sum += d;
          move[s.hitter].n++;
        }
      }
      if (foot) prevFoot[s.hitter] = foot;
    });
    Object.keys(ids).forEach((id) => {
      const list = feet[id] || [];
      let net = 0;
      const front = COURT.shortService;
      list.forEach((p) => { if (Math.abs(p.y - COURT.netY) <= front) net++; });
      let stanceSum = 0;
      let stanceN = 0;
      if (typeof project === 'function') {
        poses.forEach((pose) => {
          if (!pose || pose.id !== id) return;
          const a = kpPoint(pose.kp, 15, 0.3);
          const b = kpPoint(pose.kp, 16, 0.3);
          if (!a || !b) return;
          const pa = project(a.x, a.y);
          const pb = project(b.x, b.y);
          if (!pa || !pb || !isFinite(pa.x) || !isFinite(pb.x)) return;
          const w = Math.hypot(pa.x - pb.x, pa.y - pb.y);
          if (w >= 0.2 && w <= 1.8) { stanceSum += w; stanceN++; }
        });
      }
      const own = shots.filter((s) => s.hitter === id);
      players[id] = {
        shots: own.length,
        netRate: list.length ? net / list.length : 0,
        stance: stanceN ? stanceSum / stanceN : null,
        move: move[id] ? move[id].sum / move[id].n : null,
        overhead: own.filter((s) => s.action === '高舉手').length,
        net: own.filter((s) => s.action === '放網').length,
        defense: own.filter((s) => s.action === '防守').length
      };
    });
    return players;
  }

  // 殺球／進攻／控球只依估計球速粗分，方便看這拍的節奏
  function shuttleRhythm(kmh) {
    if (!(kmh > 0)) return '';
    if (kmh >= 140) return '殺球';
    if (kmh >= 80) return '進攻';
    return '控球';
  }

  // Chrome 的 MP4 錄製會把「網頁開了多久」寫成影片長度。這裡改回實際秒數。
  function patchMp4Duration(bytes, durationSec) {
    if (!bytes || bytes.length < 16 || !(durationSec > 0)) return null;
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let movieScale = 1000;
    const containers = { moov: 1, trak: 1, mdia: 1, minf: 1, stbl: 1, edts: 1 };

    function walk(start, end) {
      let p = start;
      while (p + 8 <= end) {
        let size = view.getUint32(p);
        let header = 8;
        if (size === 1) {
          if (p + 16 > end) return;
          size = Number(view.getBigUint64(p + 8));
          header = 16;
        } else if (size === 0) size = end - p;
        if (size < header || p + size > end) return;
        const type = String.fromCharCode(data[p + 4], data[p + 5], data[p + 6], data[p + 7]);
        if (type === 'mvhd' || type === 'mdhd') patchMediaHeader(p, header, type === 'mvhd');
        else if (type === 'tkhd') patchTrackHeader(p, header);
        else if (type === 'elst') patchEditList(p, header, p + size);
        else if (containers[type]) walk(p + header, p + size);
        p += size;
      }
    }

    function setU32(pos, value) {
      view.setUint32(pos, Math.max(0, Math.min(0xffffffff, Math.round(value))));
    }

    function patchMediaHeader(box, header, isMovie) {
      const ver = data[box + header];
      if (ver === 0) {
        const scale = view.getUint32(box + header + 12);
        if (isMovie) movieScale = scale || movieScale;
        setU32(box + header + 16, durationSec * scale);
      } else if (ver === 1 && box + header + 32 <= data.length) {
        const scale = view.getUint32(box + header + 20);
        if (isMovie) movieScale = scale || movieScale;
        view.setBigUint64(box + header + 24, BigInt(Math.round(durationSec * scale)));
      }
    }

    function patchTrackHeader(box, header) {
      const ver = data[box + header];
      const ticks = durationSec * movieScale;
      if (ver === 0) setU32(box + header + 20, ticks);
      else if (ver === 1) view.setBigUint64(box + header + 28, BigInt(Math.round(ticks)));
    }

    function patchEditList(box, header, end) {
      const ver = data[box + header];
      const count = view.getUint32(box + header + 4);
      let cursor = box + header + 8;
      const ticks = Math.round(durationSec * movieScale);
      for (let i = 0; i < count; i++) {
        if (ver === 0) {
          if (cursor + 12 > end) break;
          setU32(cursor, ticks);
          cursor += 12;
        } else {
          if (cursor + 20 > end) break;
          view.setBigUint64(cursor, BigInt(ticks));
          cursor += 20;
        }
      }
    }

    try {
      walk(0, data.length);
    } catch (e) {
      return null;
    }
    return data;
  }

  return {
    INPUT_SIZE,
    NUM_KEYPOINTS,
    PAD_VALUE,
    SKELETON,
    COURT,
    DEFAULT_BOUNDS,
    letterbox,
    rgbaToTensor,
    iou,
    decodePose,
    decodeDetect,
    decodeDetectEnd2End,
    computeHomography,
    applyHomography,
    orderCorners,
    isConvexQuad,
    courtCorners,
    courtLines,
    courtCrop,
    farCourtCrop,
    mergeDetections,
    footPoint,
    inCourtArea,
    insideLines,
    slotsFor,
    createTracker,
    smoothSamples,
    playerStats,
    heatmapGrid,
    SHUTTLE,
    medianImage,
    buildTrackNetInput,
    decodeShuttleHeatmap,
    cleanShuttleTrack,
    shuttlePace,
    shuttleRhythm,
    courtZone,
    rallyReport,
    patchMp4Duration
  };
});
