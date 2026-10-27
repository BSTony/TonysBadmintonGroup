/**
 * Author: Tony Hsieh
 * Date: 2026-10-27
 * Version: 1.3.0
 */
(function () {
  'use strict';

  const ORT_VERSION = '1.31.1';
  // 模型從 jsDelivr 依 commit 鎖定版本下載，不佔用伺服器流量；CDN 失敗才改由伺服器提供
  const MODEL_SOURCES = [
    'https://cdn.jsdelivr.net/gh/BSTony/TonysBadmintonGroup@095ffc696559a465d6e293c023b129f91f1bdc59/public/models/',
    '/models/'
  ];
  const POSE_MODEL_FILES = ['yolov8n-pose.onnx'];
  const TRACKNET_MODEL_FILES = ['tracknetv3.onnx.part0', 'tracknetv3.onnx.part1', 'tracknetv3.onnx.part2', 'tracknetv3.onnx.part3'];
  const PLAYBACK_RATE = 2;
  // TrackNet 以 30fps 訓練：60fps 影片隔一格取一格
  const SHUTTLE_INTERVAL = 1 / 30;
  const SHUTTLE_TRAIL_SECONDS = 0.6;
  const BACKGROUND_SAMPLES = 40;
  const CONF_THRESHOLD = 0.3;
  const FAR_CONF_THRESHOLD = 0.25;
  const IOU_THRESHOLD = 0.5;
  const KEYPOINT_MIN_SCORE = 0.3;
  const CALIBRATION_KEY = 'aiAnalysis.calibration.v1';
  const UID_SESSION_KEY = 'aiAnalysis.uid';
  const PPM = 40;
  const TRAIL_SECONDS = 3;

  const Core = window.PoseCore;
  if (!Core) {
    const chip = document.getElementById('model-status');
    if (chip) chip.textContent = '程式載入失敗，請重新整理';
    return;
  }
  const COURT = Core.COURT;
  const BOUNDS = Core.DEFAULT_BOUNDS;

  const PLAYER_STYLE = {
    near: { label: '近端球員', color: '#3b82f6' },
    far: { label: '遠端球員', color: '#ef4444' },
    near1: { label: '近端 A', color: '#3b82f6' },
    near2: { label: '近端 B', color: '#22d3ee' },
    far1: { label: '遠端 A', color: '#ef4444' },
    far2: { label: '遠端 B', color: '#f59e0b' }
  };

  const els = {};
  const state = {
    uid: '',
    isPublic: false,
    savingAccess: false,
    session: null,
    backend: '',
    inputName: 'images',
    outputName: 'output0',
    file: null,
    videoUrl: '',
    mode: 'singles',
    sampleFps: 10,
    range: { start: 0, end: 0 },
    calib: null,
    calibrating: false,
    clicks: [],
    running: false,
    busy: false,
    tracker: null,
    samples: {},
    stats: {},
    lastT: -Infinity,
    analyzedUntil: 0,
    frames: 0,
    inferMs: 0,
    runStartedAt: 0,
    runStartT: 0,
    lastDets: [],
    lastAssigned: {},
    heatTarget: 'all',
    statsAt: 0,
    resumePlayback: null,
    toastTimer: 0,
    tracknet: null,
    tracknetLoading: null,
    shuttleEnabled: true,
    shuttleBg: null,
    shuttleFrames: [],
    shuttle: [],
    lastShuttleT: -Infinity,
    frameDelta: Infinity,
    shuttleMs: 0,
    shuttleBatches: 0
  };

  const prepCanvas = document.createElement('canvas');
  prepCanvas.width = Core.INPUT_SIZE;
  prepCanvas.height = Core.INPUT_SIZE;
  const prepCtx = prepCanvas.getContext('2d', { willReadFrequently: true });
  const tensorBuffers = [null, null];
  const shuttleCanvas = document.createElement('canvas');
  shuttleCanvas.width = Core.SHUTTLE.width;
  shuttleCanvas.height = Core.SHUTTLE.height;
  const shuttleCtx = shuttleCanvas.getContext('2d', { willReadFrequently: true });
  let shuttleInputBuffer = null;
  const shuttleVisited = new Uint8Array(Core.SHUTTLE.width * Core.SHUTTLE.height);

  // ---------- 小工具 ----------

  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) return '--:--';
    const s = Math.floor(sec);
    const h = Math.floor(s / 3600);
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function setChip(el, text, kind) {
    el.textContent = text;
    el.className = 'chip' + (kind ? ' chip-' + kind : '');
  }

  function showError(message) {
    els.toast.textContent = message;
    els.toast.classList.remove('hidden');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 7000);
  }

  function setProgressText(text) {
    els.progressText.textContent = text;
  }

  function videoReady() {
    return !!(state.file && els.video.videoWidth && els.video.videoHeight);
  }

  function hasSamples() {
    return state.shuttle.length > 0 || Object.keys(state.samples).some((id) => state.samples[id].length > 0);
  }

  // ONNX Runtime Web 同一時間只能有一個推論或建立模型在進行（不同模型也一樣），同時呼叫會卡死，所以一律排隊
  let ortQueue = Promise.resolve();
  function withOrt(task) {
    const run = ortQueue.then(task, task);
    ortQueue = run.catch(() => {});
    return run;
  }

  function disposeOutputs(outputs) {
    for (const key of Object.keys(outputs)) {
      if (outputs[key] && typeof outputs[key].dispose === 'function') outputs[key].dispose();
    }
  }

  function seekTo(video, t) {
    return new Promise((resolve) => {
      if (Math.abs(video.currentTime - t) < 1e-3) return resolve();
      const done = () => { video.removeEventListener('seeked', done); resolve(); };
      video.addEventListener('seeked', done);
      video.currentTime = t;
    });
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function baseName() {
    const name = state.file ? state.file.name.replace(/\.[^.]+$/, '') : 'badminton';
    return name.replace(/[\\/:*?"<>|]+/g, '_');
  }

  // ---------- 使用權限 ----------

  // 大廳帶來的 uid 存進分頁後就從網址移除，避免連同網址分享出去
  function resolveUid() {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('uid');
    if (fromUrl) {
      try { sessionStorage.setItem(UID_SESSION_KEY, fromUrl); } catch (e) { /* 無痕模式可能無法寫入 */ }
      params.delete('uid');
      const rest = params.toString();
      history.replaceState(null, '', window.location.pathname + (rest ? '?' + rest : '') + window.location.hash);
      return fromUrl;
    }
    try {
      const saved = sessionStorage.getItem(UID_SESSION_KEY);
      if (saved) return saved;
      const profile = JSON.parse(localStorage.getItem('gb_cached_user_profile') || 'null');
      if (profile && profile.userId) return profile.userId;
    } catch (e) { /* 讀不到就當訪客處理 */ }
    return '';
  }

  async function checkAccess() {
    const res = await fetch('/api/ai_analysis/access' + (state.uid ? '?uid=' + encodeURIComponent(state.uid) : ''), { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function renderPublicStatus(isPublic) {
    state.isPublic = isPublic;
    els.accessSuper.classList.toggle('active', !isPublic);
    els.accessPublic.classList.toggle('active', isPublic);
    els.accessSuper.setAttribute('aria-checked', String(!isPublic));
    els.accessPublic.setAttribute('aria-checked', String(isPublic));
    els.publicStatus.textContent = isPublic
      ? '所有使用者都能在電腦版大廳看到入口並使用'
      : '只有超級管理員看得到入口；其他人開啟網址只會看到「僅開放超級管理員試用」';
  }

  async function setAccess(isPublic) {
    if (state.savingAccess || isPublic === state.isPublic) return;
    state.savingAccess = true;
    els.accessSuper.disabled = true;
    els.accessPublic.disabled = true;
    try {
      const res = await fetch('/api/admin/ai_analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: state.uid, isPublic })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
      renderPublicStatus(!!data.isPublic);
    } catch (e) {
      showError('變更使用權限失敗：' + (e && e.message ? e.message : e));
    } finally {
      state.savingAccess = false;
      els.accessSuper.disabled = false;
      els.accessPublic.disabled = false;
    }
  }

  // ---------- 環境與模型 ----------

  async function checkEnvironment() {
    const ua = navigator.userAgent || '';
    const warnings = [];
    if (/\bLine\//i.test(ua)) {
      warnings.push('目前是在 LINE 內建瀏覽器開啟，請複製網址改用電腦的 Chrome 或 Edge 開啟，才能使用顯示卡加速。');
    }
    const isMobile = (navigator.userAgentData && navigator.userAgentData.mobile) || /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    if (isMobile) {
      warnings.push('建議用電腦開啟：手機的運算能力和記憶體不足以分析整段影片。');
    }

    let gpuOk = false;
    let gpuName = '';
    if (navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (adapter) {
          gpuOk = true;
          const info = adapter.info || {};
          gpuName = [info.vendor, info.architecture || info.description].filter(Boolean).join(' ');
        }
      } catch (e) {
        console.warn('[AI] 取得顯示卡失敗', e);
      }
    }
    if (gpuOk) {
      setChip(els.envStatus, '顯示卡加速 WebGPU' + (gpuName ? `（${gpuName}）` : ''), 'ok');
    } else {
      setChip(els.envStatus, '不支援 WebGPU，改用 CPU', 'warn');
      warnings.push('這個瀏覽器無法使用顯示卡（WebGPU），會改用 CPU 計算，速度會慢很多。建議使用最新版 Chrome 或 Edge。');
    }
    if (warnings.length) {
      els.envWarning.innerHTML = warnings.map((w) => `<div>⚠️ ${escapeHtml(w)}</div>`).join('');
      els.envWarning.classList.remove('hidden');
    }
    return gpuOk;
  }

  async function fetchParts(urls, onProgress) {
    const chunks = [];
    let received = 0;
    for (let i = 0; i < urls.length; i++) {
      const res = await fetch(urls[i]);
      if (!res.ok) throw new Error(`下載模型失敗（HTTP ${res.status}）`);
      const total = Number(res.headers.get('Content-Length')) || 0;
      if (!res.body || !total) {
        const buf = new Uint8Array(await res.arrayBuffer());
        chunks.push(buf);
        received += buf.length;
        onProgress((i + 1) / urls.length);
        continue;
      }
      const reader = res.body.getReader();
      let partReceived = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        partReceived += value.length;
        onProgress((i + Math.min(1, partReceived / total)) / urls.length);
      }
    }
    const out = new Uint8Array(received);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  }

  async function fetchModelFiles(files, onProgress) {
    let lastErr = null;
    for (const base of MODEL_SOURCES) {
      try {
        return await fetchParts(files.map((f) => base + f), onProgress);
      } catch (e) {
        lastErr = e;
        console.warn(`[AI] 從 ${base} 下載模型失敗，改用下一個來源`, e);
      }
    }
    throw lastErr;
  }

  async function loadModel(preferGpu) {
    if (typeof ort === 'undefined') throw new Error('推論引擎載入失敗，請檢查網路後重新整理');
    ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;

    setChip(els.modelStatus, '下載骨架模型 0%');
    const bytes = await fetchModelFiles(POSE_MODEL_FILES, (p) => setChip(els.modelStatus, `下載骨架模型 ${Math.round(p * 100)}%`));
    setChip(els.modelStatus, '初始化模型…');

    const providers = preferGpu ? ['webgpu', 'wasm'] : ['wasm'];
    let lastErr = null;
    for (const ep of providers) {
      try {
        state.session = await withOrt(() => ort.InferenceSession.create(bytes, { executionProviders: [ep], graphOptimizationLevel: 'all' }));
        state.backend = ep;
        break;
      } catch (e) {
        lastErr = e;
        console.warn(`[AI] ${ep} 初始化失敗，改試下一個`, e);
      }
    }
    if (!state.session) throw lastErr || new Error('模型初始化失敗');
    state.inputName = state.session.inputNames[0];
    state.outputName = state.session.outputNames[0];

    // 先用空白畫面跑一次，讓顯示卡先把運算程式編譯好
    const size = Core.INPUT_SIZE;
    const t0 = performance.now();
    const warm = await withOrt(() => state.session.run({ [state.inputName]: new ort.Tensor('float32', new Float32Array(3 * size * size), [1, 3, size, size]) }));
    disposeOutputs(warm);
    console.log(`[AI] backend=${state.backend} warmup=${(performance.now() - t0).toFixed(0)}ms`);
    setChip(els.modelStatus, `模型就緒（${state.backend === 'webgpu' ? '顯示卡' : 'CPU'}）`, 'ok');
    if (state.backend !== 'webgpu' && preferGpu) {
      showError('顯示卡初始化失敗，已改用 CPU 計算，速度會比較慢。');
    }
    syncShuttleToggle();
    refreshIdleText();
    updateButtons();
  }

  // ---------- 羽球追蹤 ----------

  function shuttleActive() {
    return state.shuttleEnabled && state.backend === 'webgpu' && !!state.tracknet && !!state.shuttleBg;
  }

  function syncShuttleToggle() {
    const gpu = state.backend === 'webgpu';
    if (!gpu) {
      state.shuttleEnabled = false;
      els.shuttleToggle.checked = false;
      els.shuttleToggle.disabled = true;
      setChip(els.shuttleStatus, '追球需要顯示卡（WebGPU）', 'warn');
      return;
    }
    els.shuttleToggle.disabled = state.running;
    if (state.shuttleEnabled && !state.tracknet && !state.tracknetLoading) {
      state.tracknetLoading = loadTrackNet().catch((e) => {
        console.error('[AI] 追球模型載入失敗', e);
        setChip(els.shuttleStatus, '追球模型載入失敗', 'err');
        state.tracknetLoading = null;
      });
    } else if (!state.shuttleEnabled && !state.tracknet) {
      setChip(els.shuttleStatus, '追球未啟用');
    }
  }

  async function loadTrackNet() {
    setChip(els.shuttleStatus, '下載追球模型 0%');
    const bytes = await fetchModelFiles(TRACKNET_MODEL_FILES, (p) => setChip(els.shuttleStatus, `下載追球模型 ${Math.round(p * 100)}%`));
    setChip(els.shuttleStatus, '初始化追球模型…');
    // onnxruntime-web 1.31.1 的 WebGPU 預設 NHWC 排列會把 TrackNet 算錯（與 CPU 差距近 100%），必須指定 NCHW
    const session = await withOrt(() => ort.InferenceSession.create(bytes, {
      executionProviders: [{ name: 'webgpu', preferredLayout: 'NCHW' }],
      graphOptimizationLevel: 'all'
    }));
    const { width: w, height: h, seqLen } = Core.SHUTTLE;
    const channels = (seqLen + 1) * 3;
    const t0 = performance.now();
    const warm = await withOrt(() => session.run({ [session.inputNames[0]]: new ort.Tensor('float32', new Float32Array(channels * w * h), [1, channels, h, w]) }));
    disposeOutputs(warm);
    console.log(`[AI] tracknet warmup=${(performance.now() - t0).toFixed(0)}ms`);
    state.tracknet = { session, inputName: session.inputNames[0], outputName: session.outputNames[0] };
    setChip(els.shuttleStatus, '追球模型就緒', 'ok');
    refreshIdleText();
    updateButtons();
  }

  function captureShuttleRgba() {
    shuttleCtx.drawImage(els.video, 0, 0, Core.SHUTTLE.width, Core.SHUTTLE.height);
    return shuttleCtx.getImageData(0, 0, Core.SHUTTLE.width, Core.SHUTTLE.height).data;
  }

  // 背景中位數讓模型分得出「會動的球」與固定不動的場地
  async function buildShuttleBackground() {
    const { start, end } = state.range;
    const frames = [];
    for (let i = 0; i < BACKGROUND_SAMPLES && state.running; i++) {
      await seekTo(els.video, start + ((end - start) * (i + 0.5)) / BACKGROUND_SAMPLES);
      frames.push(captureShuttleRgba());
      setProgressText(`建立追球用的背景影像 ${i + 1} / ${BACKGROUND_SAMPLES}…`);
    }
    if (frames.length === BACKGROUND_SAMPLES) state.shuttleBg = Core.medianImage(frames);
  }

  async function processShuttleBatch() {
    const { width: w, height: h, seqLen } = Core.SHUTTLE;
    const batch = state.shuttleFrames.splice(0, seqLen);
    if (!batch.length) return;
    const images = batch.map((f) => f.rgba);
    while (images.length < seqLen) images.push(images[images.length - 1]);
    shuttleInputBuffer = Core.buildTrackNetInput(state.shuttleBg, images, shuttleInputBuffer);
    const t0 = performance.now();
    const outputs = await withOrt(() => state.tracknet.session.run({
      [state.tracknet.inputName]: new ort.Tensor('float32', shuttleInputBuffer, [1, (seqLen + 1) * 3, h, w])
    }));
    state.shuttleMs += performance.now() - t0;
    state.shuttleBatches++;
    const out = outputs[state.tracknet.outputName];
    const sx = els.video.videoWidth / w;
    const sy = els.video.videoHeight / h;
    batch.forEach((f, i) => {
      const p = Core.decodeShuttleHeatmap(out.data, i, w, h, Core.SHUTTLE.threshold, shuttleVisited);
      state.shuttle.push(p ? { t: f.t, x: p.x * sx, y: p.y * sy } : { t: f.t, x: null, y: null });
    });
    disposeOutputs(outputs);
    drawOverlay();
  }

  // ---------- 推論 ----------

  function captureTensor(crop, slot) {
    const lb = Core.letterbox(crop.w, crop.h);
    const size = Core.INPUT_SIZE;
    prepCtx.fillStyle = `rgb(${Core.PAD_VALUE},${Core.PAD_VALUE},${Core.PAD_VALUE})`;
    prepCtx.fillRect(0, 0, size, size);
    prepCtx.drawImage(els.video, crop.x, crop.y, crop.w, crop.h, lb.padX, lb.padY, lb.w, lb.h);
    const img = prepCtx.getImageData(0, 0, size, size);
    tensorBuffers[slot] = Core.rgbaToTensor(img.data, size, tensorBuffers[slot]);
    return { tensor: new ort.Tensor('float32', tensorBuffers[slot], [1, 3, size, size]), lb, crop };
  }

  async function runPose(input, confThreshold) {
    const outputs = await withOrt(() => state.session.run({ [state.inputName]: input.tensor }));
    const out = outputs[state.outputName];
    const dets = Core.decodePose(out.data, out.dims, input.lb, input.crop, { confThreshold, iouThreshold: IOU_THRESHOLD });
    disposeOutputs(outputs);
    return dets;
  }

  // 兩塊裁切都必須在第一個 await 之前擷取完，之後影片才能繼續播放
  function capturePoseInputs() {
    const v = els.video;
    const main = captureTensor(state.calib ? state.calib.crop : { x: 0, y: 0, w: v.videoWidth, h: v.videoHeight }, 0);
    const far = state.calib && state.calib.farCrop ? captureTensor(state.calib.farCrop, 1) : null;
    return { main, far };
  }

  async function runDetection(inputs) {
    const t0 = performance.now();
    const lists = [await runPose(inputs.main, CONF_THRESHOLD)];
    if (inputs.far) lists.push(await runPose(inputs.far, FAR_CONF_THRESHOLD));
    const ms = performance.now() - t0;
    return { dets: inputs.far ? Core.mergeDetections(lists, IOU_THRESHOLD) : lists[0], ms };
  }

  function detect() {
    return runDetection(capturePoseInputs());
  }

  function toCandidates(dets) {
    if (!state.calib) return [];
    const list = [];
    for (const det of dets) {
      const foot = Core.footPoint(det, KEYPOINT_MIN_SCORE);
      const court = Core.applyHomography(state.calib.H, foot.x, foot.y);
      if (!court || !Core.inCourtArea(court)) continue;
      list.push({ det, court, foot });
    }
    return list;
  }

  async function processPose(t, inputs) {
    const { dets, ms } = await runDetection(inputs);
    state.frames++;
    state.inferMs += ms;
    const assigned = state.tracker.update(t, toCandidates(dets));
    for (const id of Object.keys(assigned)) {
      const c = assigned[id].court;
      if (!state.samples[id]) state.samples[id] = [];
      state.samples[id].push({ t, x: c.x, y: c.y });
    }
    state.lastDets = dets;
    state.lastAssigned = assigned;
    state.analyzedUntil = t;
    drawOverlay();
    drawCourt();
    updateProgress(false);
    if (performance.now() - state.statsAt > 1000) {
      state.statsAt = performance.now();
      renderStats();
    }
  }

  // 需要推論時先暫停影片、算完再播放，讓疊圖和畫面對得上；追球只擷取畫面時不暫停
  function analyzeWithFrameCallback(end) {
    const video = els.video;
    const poseInterval = 1 / state.sampleFps;
    const tracking = shuttleActive();
    let rate = tracking ? 1 : PLAYBACK_RATE;
    let steadyFrames = 0;
    let lastMediaT = -Infinity;
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (err) => {
        if (done) return;
        done = true;
        state.resumePlayback = null;
        video.removeEventListener('ended', onEnded);
        video.pause();
        if (err) reject(err);
        else resolve();
      };
      const onEnded = () => finish();
      const play = () => {
        if (done) return;
        if (document.hidden) {
          state.resumePlayback = play;
          return;
        }
        state.resumePlayback = null;
        video.play().catch((e) => { if (e.name !== 'AbortError') finish(e); });
      };
      const onFrame = async (_now, meta) => {
        if (done) return;
        if (!state.running) return finish();
        const t = meta.mediaTime;
        if (t >= end) return finish();
        if (t - lastMediaT > 0.001) state.frameDelta = Math.min(state.frameDelta, t - lastMediaT);
        lastMediaT = t;
        const shuttleStep = Math.max(SHUTTLE_INTERVAL, isFinite(state.frameDelta) ? state.frameDelta : 0);
        const needPose = t - state.lastT >= poseInterval * 0.98;
        const needShuttle = tracking && t - state.lastShuttleT >= shuttleStep * 0.98;
        if (needShuttle) {
          // 追球要連續畫面：發現跳格就放慢播放，穩定一段時間再加速
          if (state.lastShuttleT !== -Infinity && t - state.lastShuttleT > shuttleStep * 1.6) {
            rate = Math.max(0.25, rate * 0.7);
            steadyFrames = 0;
            video.playbackRate = rate;
          } else if (++steadyFrames > 90 && rate < 2) {
            rate = Math.min(2, rate * 1.25);
            steadyFrames = 0;
            video.playbackRate = rate;
          }
          state.shuttleFrames.push({ t, rgba: captureShuttleRgba() });
          state.lastShuttleT = t;
        }
        const poseInputs = needPose ? capturePoseInputs() : null;
        if (needPose) state.lastT = t;
        const batchReady = tracking && state.shuttleFrames.length >= Core.SHUTTLE.seqLen;
        if (!poseInputs && !batchReady) {
          video.requestVideoFrameCallback(onFrame);
          return;
        }
        video.pause();
        try {
          if (poseInputs) await processPose(t, poseInputs);
          if (batchReady) await processShuttleBatch();
        } catch (e) {
          finish(e);
          return;
        }
        if (!state.running) return finish();
        video.requestVideoFrameCallback(onFrame);
        play();
      };
      video.addEventListener('ended', onEnded);
      video.playbackRate = rate;
      video.requestVideoFrameCallback(onFrame);
      play();
    });
  }

  async function analyzeWithSeeking(end) {
    const interval = 1 / state.sampleFps;
    let t = state.lastT === -Infinity ? state.range.start : state.lastT + interval;
    while (state.running && t < end) {
      await seekTo(els.video, t);
      state.lastT = t;
      await processPose(t, capturePoseInputs());
      t += interval;
    }
  }

  async function toggleAnalysis() {
    if (state.running) {
      state.running = false;
      return;
    }
    if (!state.session || !videoReady() || !state.calib) return;
    if (state.analyzedUntil >= state.range.end - 0.05) {
      if (!confirm('這段已經分析完了，要清除結果重新分析嗎？')) return;
      resetTracking();
    }
    if (!state.tracker) state.tracker = Core.createTracker(state.mode);

    const resume = state.lastT !== -Infinity;
    const start = resume ? Math.max(state.analyzedUntil, state.lastShuttleT) : state.range.start;
    const wantShuttle = state.shuttleEnabled && state.backend === 'webgpu';
    state.running = true;
    els.video.controls = false;
    els.video.muted = true;
    updateButtons();
    let completed = false;
    try {
      if (wantShuttle && !state.tracknet && state.tracknetLoading) {
        setProgressText('等待追球模型下載完成…');
        await state.tracknetLoading;
      }
      if (wantShuttle && state.tracknet && !state.shuttleBg) await buildShuttleBackground();
      if (state.running) {
        state.runStartedAt = performance.now();
        state.runStartT = start;
        await seekTo(els.video, start);
        if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
          await analyzeWithFrameCallback(state.range.end);
        } else {
          await analyzeWithSeeking(state.range.end);
        }
        completed = state.running;
      }
      // 不足 8 格的尾巴也要算完，暫停後繼續時才不會重複或漏格
      if (state.shuttleFrames.length && state.tracknet && state.shuttleBg) await processShuttleBatch();
    } catch (e) {
      console.error('[AI] 分析中斷', e);
      showError('分析中斷：' + (e && e.message ? e.message : e));
    } finally {
      state.running = false;
      els.video.pause();
      els.video.playbackRate = 1;
      els.video.controls = true;
      if (completed) state.analyzedUntil = state.range.end;
      renderStats();
      drawCourt();
      updateProgress(completed);
      updateButtons();
    }
  }

  async function detectCurrentFrame() {
    if (!state.session || !videoReady() || state.running || state.busy) return;
    els.video.pause();
    state.busy = true;
    updateButtons();
    try {
      const { dets, ms } = await detect();
      state.lastDets = dets;
      state.lastAssigned = state.calib ? Core.createTracker(state.mode).update(0, toCandidates(dets)) : {};
      drawOverlay();
      const players = Object.keys(state.lastAssigned).length;
      setProgressText(`這個畫面偵測到 ${dets.length} 人` + (state.calib ? `，其中 ${players} 位在球場內` : '') + `，耗時 ${ms.toFixed(0)} ms`);
    } catch (e) {
      console.error('[AI] 偵測失敗', e);
      showError('偵測失敗：' + (e && e.message ? e.message : e));
    } finally {
      state.busy = false;
      updateButtons();
    }
  }

  function resetTracking() {
    state.tracker = null;
    state.samples = {};
    state.stats = {};
    state.lastT = -Infinity;
    state.analyzedUntil = 0;
    state.frames = 0;
    state.inferMs = 0;
    state.lastDets = [];
    state.lastAssigned = {};
    state.heatTarget = 'all';
    state.shuttleBg = null;
    state.shuttleFrames = [];
    state.shuttle = [];
    state.lastShuttleT = -Infinity;
    state.shuttleMs = 0;
    state.shuttleBatches = 0;
    renderStats();
    drawCourt();
    drawOverlay();
    updateProgress(false);
    updateButtons();
  }

  function confirmDiscard() {
    return !hasSamples() || confirm('變更後會清除目前的分析結果，確定嗎？');
  }

  // ---------- 球場校正 ----------

  function loadSavedCalibration() {
    try {
      return JSON.parse(localStorage.getItem(CALIBRATION_KEY) || 'null');
    } catch (e) {
      return null;
    }
  }

  function setCalibStatus(text, kind) {
    els.calibStatus.textContent = text;
    els.calibStatus.style.color = kind === 'ok' ? '#86efac' : kind === 'warn' ? '#fcd34d' : '';
  }

  function showCalibHint() {
    els.calibHintText.textContent = `請點選球場外框（雙打邊線與底線）的四個角，順序不拘：第 ${state.clicks.length + 1} / 4 點`;
    els.calibHint.classList.remove('hidden');
  }

  function startCalibration() {
    if (!videoReady() || state.running) return;
    if (!confirmDiscard()) return;
    els.video.pause();
    state.calibrating = true;
    state.clicks = [];
    state.lastDets = [];
    state.lastAssigned = {};
    els.video.controls = false;
    els.overlay.classList.add('clickable');
    showCalibHint();
    drawOverlay();
    updateButtons();
  }

  function endCalibrationMode() {
    state.calibrating = false;
    state.clicks = [];
    els.overlay.classList.remove('clickable');
    els.video.controls = true;
    els.calibHint.classList.add('hidden');
  }

  function applyCalibration(points, save) {
    const ordered = Core.orderCorners(points);
    if (!ordered || !Core.isConvexQuad(ordered)) {
      setCalibStatus('四個點無法組成球場，請重新點選外框四個角' + (state.calib ? '（目前仍沿用先前的校正）' : ''), 'warn');
      return false;
    }
    const corners = Core.courtCorners();
    const H = Core.computeHomography(ordered, corners);
    const Hinv = Core.computeHomography(corners, ordered);
    if (!H || !Hinv) {
      setCalibStatus('校正失敗，請重新點選', 'warn');
      return false;
    }
    const v = els.video;
    const crop = Core.courtCrop(ordered, v.videoWidth, v.videoHeight);
    state.calib = { points: ordered, H, Hinv, crop, farCrop: Core.farCourtCrop(Hinv, v.videoWidth, v.videoHeight, crop) };
    if (save) {
      try {
        localStorage.setItem(CALIBRATION_KEY, JSON.stringify({ w: v.videoWidth, h: v.videoHeight, points: ordered }));
      } catch (e) { /* 無法儲存時下次重新點選即可 */ }
    }
    setCalibStatus('已校正 ✓ 綠線應該貼齊球場線', 'ok');
    resetTracking();
    return true;
  }

  function onOverlayClick(e) {
    if (!state.calibrating) return;
    const rect = els.overlay.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (els.overlay.width / rect.width);
    const y = (e.clientY - rect.top) * (els.overlay.height / rect.height);
    state.clicks.push({ x, y });
    if (state.clicks.length < 4) {
      showCalibHint();
      drawOverlay();
      return;
    }
    const points = state.clicks.slice();
    endCalibrationMode();
    applyCalibration(points, true);
    drawOverlay();
    updateButtons();
  }

  // ---------- 繪圖 ----------

  function drawSkeleton(ctx, det, color, lw) {
    const kp = det.keypoints;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    for (const [a, b] of Core.SKELETON) {
      if (kp[a].score < KEYPOINT_MIN_SCORE || kp[b].score < KEYPOINT_MIN_SCORE) continue;
      ctx.beginPath();
      ctx.moveTo(kp[a].x, kp[a].y);
      ctx.lineTo(kp[b].x, kp[b].y);
      ctx.stroke();
    }
    for (const p of kp) {
      if (p.score < KEYPOINT_MIN_SCORE) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, lw * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawLabel(ctx, det, text, color, lw) {
    const fs = Math.round(lw * 9);
    ctx.font = `bold ${fs}px "Noto Sans TC", "Microsoft JhengHei", sans-serif`;
    const pad = Math.round(fs * 0.4);
    const boxH = fs + pad;
    const w = ctx.measureText(text).width + pad * 2;
    const x = det.box.x1;
    const y = Math.max(0, det.box.y1 - boxH - 2);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, boxH);
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + pad, y + boxH / 2);
  }

  function drawCourtOnVideo(ctx, lw) {
    const { Hinv, crop } = state.calib;
    ctx.save();
    ctx.lineWidth = lw;
    for (const line of Core.courtLines()) {
      const a = Core.applyHomography(Hinv, line.a[0], line.a[1]);
      const b = Core.applyHomography(Hinv, line.b[0], line.b[1]);
      if (!a || !b) continue;
      ctx.strokeStyle = line.net ? 'rgba(250, 204, 21, 0.9)' : 'rgba(34, 197, 94, 0.85)';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.setLineDash([lw * 4, lw * 3]);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.7)';
    ctx.strokeRect(crop.x, crop.y, crop.w, crop.h);
    if (state.calib.farCrop) {
      const f = state.calib.farCrop;
      ctx.strokeStyle = 'rgba(244, 114, 182, 0.75)';
      ctx.strokeRect(f.x, f.y, f.w, f.h);
    }
    ctx.restore();
  }

  function drawClicks(ctx, lw) {
    ctx.save();
    ctx.lineWidth = lw;
    if (state.clicks.length > 1) {
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.8)';
      ctx.beginPath();
      state.clicks.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }
    ctx.font = `bold ${Math.round(lw * 9)}px sans-serif`;
    state.clicks.forEach((p, i) => {
      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(p.x, p.y, lw * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillText(String(i + 1), p.x + lw * 6, p.y - lw * 6);
    });
    ctx.restore();
  }

  function drawOverlay() {
    const c = els.overlay;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    if (!c.width) return;
    const lw = Math.max(2, c.width / 640);
    if (state.calib && !state.calibrating) drawCourtOnVideo(ctx, lw);
    if (state.calibrating) drawClicks(ctx, lw);
    const owner = new Map();
    for (const id of Object.keys(state.lastAssigned)) owner.set(state.lastAssigned[id].det, id);
    for (const det of state.lastDets) {
      const id = owner.get(det);
      const color = id ? PLAYER_STYLE[id].color : 'rgba(226, 232, 240, 0.55)';
      drawSkeleton(ctx, det, color, id ? lw * 1.5 : lw);
      if (id) drawLabel(ctx, det, PLAYER_STYLE[id].label, color, lw);
    }
    drawShuttle(ctx, lw);
  }

  // 分析中畫最近擷取到的軌跡；分析完拖動影片時，畫目前時間點附近的軌跡
  function drawShuttle(ctx, lw) {
    if (!state.shuttle.length) return;
    const now = state.running ? state.lastShuttleT : els.video.currentTime;
    const pts = [];
    for (let i = state.shuttle.length - 1; i >= 0; i--) {
      const s = state.shuttle[i];
      if (s.t > now + 0.001) continue;
      if (now - s.t > SHUTTLE_TRAIL_SECONDS) break;
      if (s.x !== null) pts.push(s);
    }
    if (!pts.length) return;
    pts.reverse();
    ctx.save();
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.85)';
    ctx.lineWidth = lw * 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    const last = pts[pts.length - 1];
    ctx.fillStyle = '#facc15';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(last.x, last.y, lw * 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function courtToCanvas(x, y) {
    return { x: (x + BOUNDS.side) * PPM, y: (y + BOUNDS.back) * PPM };
  }

  function drawCourtLines(ctx) {
    for (const line of Core.courtLines()) {
      const a = courtToCanvas(line.a[0], line.a[1]);
      const b = courtToCanvas(line.b[0], line.b[1]);
      ctx.strokeStyle = line.net ? '#facc15' : 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = line.net ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  function heatColor(v) {
    const stops = [
      [0, [59, 130, 246, 0]],
      [0.25, [59, 130, 246, 0.55]],
      [0.5, [34, 197, 94, 0.7]],
      [0.75, [250, 204, 21, 0.8]],
      [1, [239, 68, 68, 0.9]]
    ];
    for (let i = 1; i < stops.length; i++) {
      if (v <= stops[i][0]) {
        const [p0, c0] = stops[i - 1];
        const [p1, c1] = stops[i];
        const f = (v - p0) / (p1 - p0);
        return c0.map((c, k) => c + (c1[k] - c) * f);
      }
    }
    return stops[stops.length - 1][1];
  }

  function drawDot(ctx, p, color, r, ring) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    if (ring) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function drawHeatmap(ctx) {
    const ids = state.heatTarget === 'all' ? Object.keys(state.samples) : [state.heatTarget];
    const samples = [];
    for (const id of ids) if (state.samples[id]) samples.push(...state.samples[id]);
    if (!samples.length) return;
    const heat = Core.heatmapGrid(samples, 0.25);
    const img = new ImageData(heat.cols, heat.rows);
    for (let i = 0; i < heat.grid.length; i++) {
      const v = heat.grid[i] ? Math.sqrt(heat.grid[i] / heat.max) : 0;
      const [r, g, b, a] = heatColor(v);
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = Math.round(a * 255);
    }
    const tmp = document.createElement('canvas');
    tmp.width = heat.cols;
    tmp.height = heat.rows;
    tmp.getContext('2d').putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(tmp, 0, 0, heat.cols * heat.cell * PPM, heat.rows * heat.cell * PPM);
    ctx.restore();
  }

  function drawCourt() {
    const canvas = els.court;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#14532d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const tl = courtToCanvas(0, 0);
    ctx.fillStyle = '#166534';
    ctx.fillRect(tl.x, tl.y, COURT.width * PPM, COURT.length * PPM);

    if (!state.running) drawHeatmap(ctx);
    drawCourtLines(ctx);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.font = '13px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('遠端', 8, 8);
    ctx.textBaseline = 'bottom';
    ctx.fillText('近端（鏡頭這一側）', 8, canvas.height - 8);

    if (state.running) {
      for (const id of Object.keys(state.samples)) {
        const list = state.samples[id];
        const color = PLAYER_STYLE[id].color;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 2;
        ctx.beginPath();
        let started = false;
        for (let i = Math.max(0, list.length - 200); i < list.length; i++) {
          if (state.analyzedUntil - list[i].t > TRAIL_SECONDS) continue;
          const q = courtToCanvas(list[i].x, list[i].y);
          if (started) ctx.lineTo(q.x, q.y);
          else { ctx.moveTo(q.x, q.y); started = true; }
        }
        ctx.stroke();
        ctx.restore();
        const cur = state.lastAssigned[id];
        if (cur) drawDot(ctx, courtToCanvas(cur.court.x, cur.court.y), color, 7, false);
      }
      return;
    }

    const ids = state.heatTarget === 'all' ? Object.keys(state.stats) : [state.heatTarget];
    for (const id of ids) {
      const st = state.stats[id];
      if (st && st.avg) drawDot(ctx, courtToCanvas(st.avg.x, st.avg.y), PLAYER_STYLE[id].color, 9, true);
    }
  }

  // ---------- 統計與介面 ----------

  function computeStats() {
    const stats = {};
    for (const id of Object.keys(state.samples)) {
      if (state.samples[id].length) stats[id] = Core.playerStats(state.samples[id]);
    }
    state.stats = stats;
    return stats;
  }

  function statIds() {
    return Core.slotsFor(state.mode).map((s) => s.id).filter((id) => state.stats[id]);
  }

  function renderHeatTabs(ids) {
    if (!ids.length || state.running) {
      els.heatTabs.classList.add('hidden');
      return;
    }
    const tabs = [{ id: 'all', label: '全部' }].concat(ids.map((id) => ({ id, label: PLAYER_STYLE[id].label })));
    els.heatTabs.innerHTML = tabs.map((t) => `<button type="button" class="seg-btn${state.heatTarget === t.id ? ' active' : ''}" data-heat="${t.id}">${escapeHtml(t.label)}</button>`).join('');
    els.heatTabs.classList.remove('hidden');
  }

  function shuttleSummary() {
    const found = state.shuttle.filter((s) => s.x !== null).length;
    return { total: state.shuttle.length, found };
  }

  function shuttleCardHtml() {
    const { total, found } = shuttleSummary();
    if (!total) return '';
    return `
      <div class="player-card" style="--pc:#facc15">
        <div class="pc-head"><span class="pc-dot"></span>羽球軌跡</div>
        <div class="pc-grid">
          <div><span class="pc-val">${Math.round((found / total) * 100)}%</span><div class="pc-label">畫面中找到球的比例</div></div>
          <div><span class="pc-val">${found}</span><span class="pc-unit">點</span><div class="pc-label">記錄到的球位置</div></div>
        </div>
        <div class="zone-legend">分析完可拖動影片，畫面上會顯示黃色的球軌跡</div>
      </div>`;
  }

  function renderStats() {
    const stats = computeStats();
    const ids = statIds();
    renderHeatTabs(ids);
    if (!ids.length) {
      els.playerStats.innerHTML = shuttleCardHtml() + (state.frames > 0
        ? '<p class="muted">還沒有偵測到球場內的球員。請確認綠色球場線有貼齊、球員有完整入鏡。</p>'
        : '<p class="muted">完成球場校正並開始分析後，這裡會顯示每位球員的跑動距離與站位分布。</p>');
      return;
    }
    const pct = (v) => Math.round(v * 100);
    els.playerStats.innerHTML = shuttleCardHtml() + ids.map((id) => {
      const s = stats[id];
      const st = PLAYER_STYLE[id];
      return `
        <div class="player-card" style="--pc:${st.color}">
          <div class="pc-head"><span class="pc-dot"></span>${escapeHtml(st.label)}</div>
          <div class="pc-grid">
            <div><span class="pc-val">${s.distance.toFixed(1)}</span><span class="pc-unit">公尺</span><div class="pc-label">跑動距離</div></div>
            <div><span class="pc-val">${fmtTime(s.activeTime)}</span><div class="pc-label">偵測到的時間</div></div>
          </div>
          <div class="zone-bar">
            <span class="z-front" style="width:${pct(s.zones.front)}%"></span>
            <span class="z-mid" style="width:${pct(s.zones.mid)}%"></span>
            <span class="z-rear" style="width:${pct(s.zones.rear)}%"></span>
          </div>
          <div class="zone-legend"><b style="color:#38bdf8">前場</b> ${pct(s.zones.front)}% · <b style="color:#a78bfa">中場</b> ${pct(s.zones.mid)}% · <b style="color:#f472b6">後場</b> ${pct(s.zones.rear)}%</div>
        </div>`;
    }).join('');
  }

  function updateRangeText() {
    els.rangeText.textContent = `${fmtTime(state.range.start)} ～ ${fmtTime(state.range.end)}`;
  }

  function refreshIdleText() {
    if (state.running || state.frames > 0) return;
    if (!state.file) setProgressText('請先選擇影片');
    else if (!state.session) setProgressText('模型載入中，請稍候…');
    else if (!state.calib) setProgressText('請先完成球場校正，就能開始分析');
    else setProgressText('準備就緒，按「開始分析」');
  }

  function updateProgress(completed) {
    const total = Math.max(0.001, state.range.end - state.range.start);
    const done = Math.min(total, Math.max(0, state.analyzedUntil - state.range.start));
    els.progressBar.style.width = `${(completed ? 1 : done / total) * 100}%`;
    if (!state.frames) {
      els.progressBar.style.width = '0%';
      refreshIdleText();
      return;
    }
    const avgMs = state.inferMs / state.frames;
    let text = `已分析 ${fmtTime(done)} / ${fmtTime(total)} · ${state.frames} 張 · 平均每張 ${avgMs.toFixed(0)} ms`;
    if (state.shuttleBatches) text += ` · 追球每 8 格 ${(state.shuttleMs / state.shuttleBatches).toFixed(0)} ms`;
    if (state.running) {
      const elapsed = (performance.now() - state.runStartedAt) / 1000;
      const speed = (state.analyzedUntil - state.runStartT) / Math.max(0.001, elapsed);
      if (speed > 0 && elapsed > 2) text += ` · 預估剩餘 ${fmtTime((state.range.end - state.analyzedUntil) / speed)}`;
      if (document.hidden) text += ' · 分頁在背景，已暫停';
    } else {
      text += completed ? ' · 分析完成' : ' · 已暫停';
    }
    setProgressText(text);
  }

  function updateButtons() {
    const ready = videoReady();
    const idle = !state.running && !state.calibrating && !state.busy;
    els.btnDetect.disabled = !(state.session && ready && idle);
    els.btnAnalyze.disabled = !(state.session && ready && state.calib && state.range.end > state.range.start && !state.calibrating && !state.busy);
    if (state.running) els.btnAnalyze.textContent = '⏸ 暫停';
    else if (state.lastT !== -Infinity && state.analyzedUntil < state.range.end - 0.05) els.btnAnalyze.textContent = '▶ 繼續分析';
    else els.btnAnalyze.textContent = '▶ 開始分析';
    els.btnCalibrate.disabled = !(ready && idle);
    els.btnReuseCalib.disabled = !(ready && idle);
    els.btnSetStart.disabled = !(ready && idle);
    els.btnSetEnd.disabled = !(ready && idle);
    els.btnReset.disabled = !(hasSamples() && idle);
    els.btnExportJson.disabled = !(hasSamples() && !state.running);
    els.btnExportPng.disabled = !(hasSamples() && !state.running);
    els.modeSingles.disabled = !idle;
    els.modeDoubles.disabled = !idle;
    els.sampleFps.disabled = !idle;
    els.shuttleToggle.disabled = !idle || state.backend !== 'webgpu';
    els.fileInput.disabled = !idle;
    els.btnPickFile.classList.toggle('disabled', !idle);
  }

  function setMode(mode) {
    if (mode === state.mode || state.running) return;
    if (!confirmDiscard()) return;
    state.mode = mode;
    els.modeSingles.classList.toggle('active', mode === 'singles');
    els.modeDoubles.classList.toggle('active', mode === 'doubles');
    resetTracking();
  }

  // ---------- 匯出 ----------

  function exportJson() {
    const stats = computeStats();
    const r = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
    const v = els.video;
    const data = {
      app: 'TonysBadminton AI 羽球影片分析',
      formatVersion: 1,
      createdAt: new Date().toISOString(),
      video: { name: state.file ? state.file.name : '', duration: r(v.duration || 0, 3), width: v.videoWidth, height: v.videoHeight },
      settings: { mode: state.mode, sampleFps: state.sampleFps, range: { start: r(state.range.start, 3), end: r(state.range.end, 3) } },
      model: { name: 'yolov8n-pose', backend: state.backend },
      court: { width: COURT.width, length: COURT.length, netY: COURT.netY, axis: 'x：由左到右；y：由遠端底線到近端底線（公尺）' },
      calibration: state.calib ? { imagePoints: state.calib.points.map((p) => [r(p.x, 1), r(p.y, 1)]) } : null,
      shuttle: state.shuttle.length ? {
        model: 'TrackNetV3',
        coordinate: '影片像素座標（x 向右、y 向下）',
        frames: state.shuttle.length,
        detected: shuttleSummary().found,
        samples: state.shuttle.filter((s) => s.x !== null).map((s) => [r(s.t, 3), r(s.x, 1), r(s.y, 1)])
      } : null,
      players: Object.keys(stats).map((id) => ({
        id,
        label: PLAYER_STYLE[id].label,
        stats: {
          distance: r(stats[id].distance, 2),
          activeTime: r(stats[id].activeTime, 2),
          zones: { front: r(stats[id].zones.front, 3), mid: r(stats[id].zones.mid, 3), rear: r(stats[id].zones.rear, 3) },
          avg: stats[id].avg ? { x: r(stats[id].avg.x, 2), y: r(stats[id].avg.y, 2) } : null
        },
        samples: state.samples[id].map((p) => [r(p.t, 3), r(p.x, 2), r(p.y, 2)])
      }))
    };
    download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `${baseName()}_analysis.json`);
  }

  function exportPng() {
    drawCourt();
    els.court.toBlob((blob) => {
      if (blob) download(blob, `${baseName()}_heatmap${state.heatTarget === 'all' ? '' : '_' + state.heatTarget}.png`);
    }, 'image/png');
  }

  // ---------- 影片 ----------

  function loadVideo(file) {
    if (!file || state.running) return;
    if (!/^video\//.test(file.type) && !/\.(mp4|mov|m4v|webm|mkv)$/i.test(file.name)) {
      showError('請選擇影片檔（建議 MP4）');
      return;
    }
    if (state.calibrating) endCalibrationMode();
    if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
    state.file = file;
    state.videoUrl = URL.createObjectURL(file);
    state.calib = null;
    state.frameDelta = Infinity;
    setCalibStatus('尚未校正');
    els.fileName.textContent = file.name;
    els.dropZone.classList.add('hidden');
    els.videoWrap.classList.remove('hidden');
    els.video.src = state.videoUrl;
    resetTracking();
  }

  function onLoadedMetadata() {
    const v = els.video;
    if (!v.videoWidth || !v.videoHeight) {
      showError('瀏覽器讀不到這個影片的畫面，請改用 MP4（H.264）格式');
      return;
    }
    els.overlay.width = v.videoWidth;
    els.overlay.height = v.videoHeight;
    els.videoWrap.style.aspectRatio = `${v.videoWidth} / ${v.videoHeight}`;
    state.range = { start: 0, end: isFinite(v.duration) ? v.duration : 0 };
    if (!state.range.end) showError('讀不到影片長度，請改用 MP4 格式');
    updateRangeText();
    const saved = loadSavedCalibration();
    const sameSize = saved && saved.w === v.videoWidth && saved.h === v.videoHeight && Array.isArray(saved.points);
    els.btnReuseCalib.classList.toggle('hidden', !sameSize);
    drawOverlay();
    refreshIdleText();
    updateButtons();
  }

  function setRange(which) {
    if (!videoReady() || state.running) return;
    const t = els.video.currentTime;
    const next = { ...state.range };
    if (which === 'start') next.start = Math.min(t, Math.max(0, next.end - 1));
    else next.end = Math.max(t, next.start + 1);
    if (next.start === state.range.start && next.end === state.range.end) return;
    if (!confirmDiscard()) return;
    state.range = next;
    updateRangeText();
    resetTracking();
  }

  // ---------- 初始化 ----------

  function bindElements() {
    const ids = {
      envStatus: 'env-status', modelStatus: 'model-status', envWarning: 'env-warning',
      fileInput: 'file-input', btnPickFile: 'btn-pick-file', fileName: 'file-name',
      modeSingles: 'mode-singles', modeDoubles: 'mode-doubles', sampleFps: 'sample-fps',
      rangeText: 'range-text', btnSetStart: 'btn-set-start', btnSetEnd: 'btn-set-end',
      btnCalibrate: 'btn-calibrate', btnReuseCalib: 'btn-reuse-calib', calibStatus: 'calib-status',
      dropZone: 'drop-zone', videoWrap: 'video-wrap', video: 'video', overlay: 'overlay',
      calibHint: 'calib-hint', calibHintText: 'calib-hint-text', btnCalibCancel: 'btn-calib-cancel',
      btnDetect: 'btn-detect', btnAnalyze: 'btn-analyze', btnReset: 'btn-reset',
      progressBar: 'progress-bar', progressText: 'progress-text',
      heatTabs: 'heat-tabs', court: 'court', btnExportPng: 'btn-export-png', btnExportJson: 'btn-export-json',
      playerStats: 'player-stats', toast: 'toast', shuttleToggle: 'shuttle-toggle', shuttleStatus: 'shuttle-status',
      adminBar: 'admin-bar', accessSuper: 'access-super', accessPublic: 'access-public', publicStatus: 'public-status',
      locked: 'locked', mainLayout: 'main-layout'
    };
    for (const key of Object.keys(ids)) els[key] = document.getElementById(ids[key]);
  }

  function bindEvents() {
    els.fileInput.addEventListener('change', () => {
      const file = els.fileInput.files && els.fileInput.files[0];
      els.fileInput.value = '';
      loadVideo(file);
    });
    ['dragenter', 'dragover'].forEach((type) => els.dropZone.addEventListener(type, (e) => {
      e.preventDefault();
      els.dropZone.classList.add('dragging');
    }));
    ['dragleave', 'drop'].forEach((type) => els.dropZone.addEventListener(type, (e) => {
      e.preventDefault();
      els.dropZone.classList.remove('dragging');
    }));
    els.dropZone.addEventListener('drop', (e) => loadVideo(e.dataTransfer.files && e.dataTransfer.files[0]));

    els.video.addEventListener('loadedmetadata', onLoadedMetadata);
    els.video.addEventListener('error', () => showError('影片無法播放，請改用 MP4（H.264）格式。iPhone 可到「設定 > 相機 > 格式」選「最相容」。'));
    ['seeked', 'timeupdate'].forEach((type) => els.video.addEventListener(type, () => {
      if (!state.running && state.shuttle.length) drawOverlay();
    }));
    els.shuttleToggle.addEventListener('change', () => {
      state.shuttleEnabled = els.shuttleToggle.checked;
      syncShuttleToggle();
    });
    els.video.addEventListener('seeking', () => {
      if (state.running || state.busy || !state.lastDets.length) return;
      state.lastDets = [];
      state.lastAssigned = {};
      drawOverlay();
    });

    els.modeSingles.addEventListener('click', () => setMode('singles'));
    els.modeDoubles.addEventListener('click', () => setMode('doubles'));
    els.sampleFps.addEventListener('change', () => {
      const fps = Number(els.sampleFps.value) || 10;
      if (!confirmDiscard()) {
        els.sampleFps.value = String(state.sampleFps);
        return;
      }
      state.sampleFps = fps;
      resetTracking();
    });
    els.btnSetStart.addEventListener('click', () => setRange('start'));
    els.btnSetEnd.addEventListener('click', () => setRange('end'));

    els.btnCalibrate.addEventListener('click', startCalibration);
    els.btnCalibCancel.addEventListener('click', () => {
      endCalibrationMode();
      drawOverlay();
      updateButtons();
    });
    els.btnReuseCalib.addEventListener('click', () => {
      const saved = loadSavedCalibration();
      if (!saved || !confirmDiscard()) return;
      if (applyCalibration(saved.points, false)) {
        drawOverlay();
        updateButtons();
      }
    });
    els.overlay.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.calibrating) {
        endCalibrationMode();
        drawOverlay();
        updateButtons();
      }
    });

    els.btnDetect.addEventListener('click', detectCurrentFrame);
    els.btnAnalyze.addEventListener('click', toggleAnalysis);
    els.btnReset.addEventListener('click', () => {
      if (confirm('確定要清除目前的分析結果嗎？')) resetTracking();
    });
    els.heatTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-heat]');
      if (!btn) return;
      state.heatTarget = btn.dataset.heat;
      renderHeatTabs(statIds());
      drawCourt();
    });
    els.btnExportJson.addEventListener('click', exportJson);
    els.btnExportPng.addEventListener('click', exportPng);
    els.accessSuper.addEventListener('click', () => setAccess(false));
    els.accessPublic.addEventListener('click', () => setAccess(true));

    document.addEventListener('visibilitychange', () => {
      if (!state.running) return;
      if (document.hidden) {
        els.video.pause();
        if (!state.resumePlayback) state.resumePlayback = () => els.video.play().catch(() => {});
        updateProgress(false);
      } else if (state.resumePlayback) {
        const resume = state.resumePlayback;
        state.resumePlayback = null;
        resume();
      }
    });
    window.addEventListener('beforeunload', (e) => {
      if (!state.running) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  async function init() {
    bindElements();
    bindEvents();
    state.uid = resolveUid();
    let access;
    try {
      access = await checkAccess();
    } catch (e) {
      console.error('[AI] 權限確認失敗', e);
      setChip(els.envStatus, '無法確認使用權限', 'err');
      setChip(els.modelStatus, '未載入模型', 'err');
      showError('無法連線到伺服器確認使用權限，請稍後重新整理');
      return;
    }
    // 沒有權限就不顯示操作介面，也不下載模型
    if (!access.allowed) {
      setChip(els.envStatus, '尚未開放', 'warn');
      setChip(els.modelStatus, '未載入模型');
      els.shuttleStatus.classList.add('hidden');
      els.locked.classList.remove('hidden');
      return;
    }
    if (access.canManage) {
      renderPublicStatus(!!access.isPublic);
      els.adminBar.classList.remove('hidden');
    }
    els.mainLayout.classList.remove('hidden');
    setChip(els.envStatus, '檢查電腦環境中…');

    els.court.width = Math.round((COURT.width + 2 * BOUNDS.side) * PPM);
    els.court.height = Math.round((COURT.length + 2 * BOUNDS.back) * PPM);
    drawCourt();
    updateButtons();
    const gpuOk = await checkEnvironment();
    try {
      await loadModel(gpuOk);
    } catch (e) {
      console.error('[AI] 模型載入失敗', e);
      setChip(els.modelStatus, '模型載入失敗', 'err');
      showError('模型載入失敗：' + (e && e.message ? e.message : e));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
