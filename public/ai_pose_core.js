/**
 * Author: Tony Hsieh
 * Date: 2026-10-27
 * Version: 1.1.0
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

  // 羽球場標準尺寸（公尺）；y 軸從遠端底線 0 到近端底線 13.4
  const COURT = {
    length: 13.4,
    width: 6.1,
    singlesInset: 0.46,
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

  // 解析 YOLOv8-pose 輸出 [1, 56, N]：4 個框座標、1 個人物分數、17 點 × (x, y, 可信度)
  function decodePose(data, dims, lb, crop, opts = {}) {
    const confThreshold = opts.confThreshold ?? 0.3;
    const iouThreshold = opts.iouThreshold ?? 0.5;
    const maxDetections = opts.maxDetections ?? 30;
    const channels = dims[1];
    const n = dims[2];
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
    return kept.map((c) => {
      const keypoints = new Array(NUM_KEYPOINTS);
      for (let k = 0; k < NUM_KEYPOINTS; k++) {
        const base = (5 + k * 3) * n + c.i;
        keypoints[k] = { x: toX(data[base]), y: toY(data[base + n]), score: data[base + 2 * n] };
      }
      return {
        score: c.score,
        box: { x1: toX(c.x1), y1: toY(c.y1), x2: toX(c.x2), y2: toY(c.y2) },
        keypoints
      };
    });
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

  function footPoint(det, minScore = 0.3) {
    const ankles = [det.keypoints[15], det.keypoints[16]].filter((k) => k.score >= minScore);
    if (ankles.length) {
      return {
        x: ankles.reduce((sum, k) => sum + k.x, 0) / ankles.length,
        y: ankles.reduce((sum, k) => sum + k.y, 0) / ankles.length,
        fromAnkles: true
      };
    }
    return { x: (det.box.x1 + det.box.x2) / 2, y: det.box.y2, fromAnkles: false };
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
    const third = COURT.netY / 3;
    const zones = { front: 0, mid: 0, rear: 0 };
    let distance = 0;
    let activeTime = 0;
    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < s.length; i++) {
      const p = s[i];
      sumX += p.x;
      sumY += p.y;
      const fromNet = Math.abs(p.y - COURT.netY);
      if (fromNet < third) zones.front++;
      else if (fromNet < 2 * third) zones.mid++;
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
    decodeShuttleHeatmap
  };
});
