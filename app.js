/* ============================================================
   推し軸 (oshijiku.com) – Application Logic
   Vanilla JS / No framework / Static site
   ============================================================ */

'use strict';

/* ----------------------------------------------------------
   Constants
   ---------------------------------------------------------- */
const MAX_IMAGE_BYTES = 512 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const SVG_NS = 'http://www.w3.org/2000/svg';
const MAP_SIZE = 600;
const MAP_PAD = 50;
const MAP_RANGE = MAP_SIZE - MAP_PAD * 2; // 500
const STORAGE_KEY = 'oshijiku_state';
const IMAGE_DATA_RE = /^data:image\/(jpeg|png|webp);base64,/i;

/* ----------------------------------------------------------
   State
   ---------------------------------------------------------- */
const state = {
  axis: { title: '', xMin: '左', xMax: '右', yMin: '下', yMax: '上', visibility: 'public' },
  oshis: [],
};

/* ----------------------------------------------------------
   DOM Helpers
   ---------------------------------------------------------- */
const $ = (id) => document.getElementById(id);
const map = $('map');

/**
 * Create an SVG element with attributes and optional text content.
 */
function createSvgEl(tag, attrs = {}, textContent = '') {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  if (textContent) el.textContent = textContent;
  return el;
}

/* ----------------------------------------------------------
   Coordinate Conversion
   ---------------------------------------------------------- */
function toSvgX(v) {
  return MAP_SIZE / 2 + (Number(v) / 100) * (MAP_RANGE / 2);
}

function toSvgY(v) {
  return MAP_SIZE / 2 - (Number(v) / 100) * (MAP_RANGE / 2);
}

function fromSvgX(px) {
  return Math.round(((px - MAP_SIZE / 2) / (MAP_RANGE / 2)) * 100);
}

function fromSvgY(px) {
  return Math.round(((MAP_SIZE / 2 - px) / (MAP_RANGE / 2)) * 100);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Convert a pointer event to SVG-space coordinates. */
let _svgPoint = null;
function pointerToSvg(evt) {
  if (!_svgPoint) _svgPoint = map.createSVGPoint();
  _svgPoint.x = evt.clientX;
  _svgPoint.y = evt.clientY;
  return _svgPoint.matrixTransform(map.getScreenCTM().inverse());
}

/* ----------------------------------------------------------
   Persistence (localStorage)
   ---------------------------------------------------------- */
function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/**
 * Safely parse and merge loaded data into state, sanitising every field.
 */
function sanitizeAndLoad(parsed) {
  if (!parsed || typeof parsed !== 'object') return;

  // Axis
  if (parsed.axis && typeof parsed.axis === 'object') {
    const a = parsed.axis;
    state.axis = {
      title:      String(a.title ?? ''),
      xMin:       String(a.xMin ?? '左'),
      xMax:       String(a.xMax ?? '右'),
      yMin:       String(a.yMin ?? '下'),
      yMax:       String(a.yMax ?? '上'),
      visibility: a.visibility === 'url' ? 'url' : 'public',
    };
  }

  // Oshis
  if (Array.isArray(parsed.oshis)) {
    state.oshis = parsed.oshis
      .map((o) => {
        if (!o || typeof o !== 'object') return null;
        const name = String(o.name ?? '').trim();
        if (!name) return null;

        const rawX = Number(o.x ?? 0);
        const rawY = Number(o.y ?? 0);
        return {
          name,
          x: clamp(Number.isFinite(rawX) ? rawX : 0, -100, 100),
          y: clamp(Number.isFinite(rawY) ? rawY : 0, -100, 100),
          tags: Array.isArray(o.tags) ? o.tags.map(String).filter(Boolean) : [],
          imageData: typeof o.imageData === 'string' && IMAGE_DATA_RE.test(o.imageData) ? o.imageData : '',
        };
      })
      .filter(Boolean);
  }
}

function loadFromStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    sanitizeAndLoad(JSON.parse(raw));
  } catch (e) {
    console.warn('Failed to load state from localStorage:', e);
  }
}

/* ----------------------------------------------------------
   SVG MAP Rendering
   ---------------------------------------------------------- */
function drawGrid() {
  for (let v = -50; v <= 50; v += 50) {
    if (v === 0) continue;
    const gx = toSvgX(v);
    const gy = toSvgY(v);
    map.appendChild(createSvgEl('line', { class: 'grid', x1: gx, y1: MAP_PAD, x2: gx, y2: MAP_SIZE - MAP_PAD }));
    map.appendChild(createSvgEl('line', { class: 'grid', x1: MAP_PAD, y1: gy, x2: MAP_SIZE - MAP_PAD, y2: gy }));
  }
}

function drawAxes() {
  // Horizontal axis
  map.appendChild(createSvgEl('line', {
    class: 'axis', x1: MAP_PAD, y1: MAP_SIZE / 2, x2: MAP_SIZE - MAP_PAD, y2: MAP_SIZE / 2,
  }));
  // Vertical axis
  map.appendChild(createSvgEl('line', {
    class: 'axis', x1: MAP_SIZE / 2, y1: MAP_PAD, x2: MAP_SIZE / 2, y2: MAP_SIZE - MAP_PAD,
  }));
}

function drawLabels() {
  const mid = MAP_SIZE / 2;
  const labels = [
    { text: state.axis.xMin,  x: MAP_PAD + 5,          y: mid - 8,              anchor: 'start' },
    { text: state.axis.xMax,  x: MAP_SIZE - MAP_PAD - 5, y: mid - 8,            anchor: 'end' },
    { text: state.axis.yMax,  x: mid,                   y: MAP_PAD - 8,          anchor: 'middle' },
    { text: state.axis.yMin,  x: mid,                   y: MAP_SIZE - MAP_PAD + 20, anchor: 'middle' },
  ];
  for (const l of labels) {
    map.appendChild(createSvgEl('text', {
      class: 'label axis-label', x: l.x, y: l.y, 'text-anchor': l.anchor,
    }, l.text));
  }
  // Title at bottom
  map.appendChild(createSvgEl('text', {
    class: 'label map-title', x: mid, y: MAP_SIZE - 6, 'text-anchor': 'middle',
  }, state.axis.title || '推し軸MAP'));
}

function drawOshi(oshi, idx) {
  const x = toSvgX(oshi.x);
  const y = toSvgY(oshi.y);
  const tagStr = oshi.tags.length ? `\nタグ: ${oshi.tags.map((t) => '#' + t).join(' ')}` : '';
  const tooltip = `${oshi.name} (${oshi.x}, ${oshi.y})${tagStr}\n※ドラッグで移動`;

  const g = createSvgEl('g', { class: 'oshi-dot', 'data-idx': idx });
  g.appendChild(createSvgEl('title', {}, tooltip));

  if (oshi.imageData) {
    // Circular clip for image thumbnail
    const clipId = `clip-${idx}`;
    const defs = createSvgEl('defs');
    const clipPath = createSvgEl('clipPath', { id: clipId });
    clipPath.appendChild(createSvgEl('circle', { cx: x, cy: y, r: 20 }));
    defs.appendChild(clipPath);
    g.appendChild(defs);

    g.appendChild(createSvgEl('image', {
      href: oshi.imageData, x: x - 20, y: y - 20, width: 40, height: 40,
      'clip-path': `url(#${clipId})`, preserveAspectRatio: 'xMidYMid slice',
    }));
    g.appendChild(createSvgEl('circle', { class: 'img-ring', cx: x, cy: y, r: 20 }));
    g.appendChild(createSvgEl('circle', { class: 'dot-hover', cx: x, cy: y, r: 24 }));
  } else {
    g.appendChild(createSvgEl('circle', { class: 'dot-hover', cx: x, cy: y, r: 18 }));
    g.appendChild(createSvgEl('circle', { class: 'dot', cx: x, cy: y, r: 8 }));
  }

  // Name label above the dot
  const labelY = oshi.imageData ? y - 26 : y - 14;
  g.appendChild(createSvgEl('text', {
    class: 'label oshi-label', x, y: labelY, 'text-anchor': 'middle',
  }, oshi.name));

  map.appendChild(g);
}

function draw() {
  map.textContent = '';
  drawGrid();
  drawAxes();
  drawLabels();
  state.oshis.forEach((o, i) => drawOshi(o, i));
  renderOshiList();
}

/* ----------------------------------------------------------
   Drag & Drop (Pointer Events)
   ---------------------------------------------------------- */
let dragIdx = -1;

function handlePointerDown(evt) {
  const g = evt.target.closest('.oshi-dot');
  if (!g) return;
  dragIdx = Number(g.dataset.idx);
  map.setPointerCapture(evt.pointerId);
  g.classList.add('dragging');
  evt.preventDefault();
}

function handlePointerMove(evt) {
  if (dragIdx < 0) return;
  const pt = pointerToSvg(evt);
  state.oshis[dragIdx].x = clamp(fromSvgX(pt.x), -100, 100);
  state.oshis[dragIdx].y = clamp(fromSvgY(pt.y), -100, 100);
  draw();
}

function handlePointerEnd() {
  if (dragIdx < 0) return;
  dragIdx = -1;
  saveToStorage();
  draw();
}

map.addEventListener('pointerdown', handlePointerDown);
map.addEventListener('pointermove', handlePointerMove);
map.addEventListener('pointerup', handlePointerEnd);
map.addEventListener('pointercancel', handlePointerEnd);

/* ----------------------------------------------------------
   Oshi List Rendering
   ---------------------------------------------------------- */
function renderOshiList() {
  const list = $('oshiList');
  list.textContent = '';

  state.oshis.forEach((o, i) => {
    const li = document.createElement('li');
    li.className = 'oshi-item';

    // Thumbnail
    if (o.imageData) {
      const img = document.createElement('img');
      img.src = o.imageData;
      img.alt = `${o.name}のサムネイル`;
      img.className = 'oshi-thumb';
      li.appendChild(img);
    }

    // Info text
    const span = document.createElement('span');
    const tags = o.tags.map((t) => `#${t}`).join(' ');
    span.textContent = `${o.name} (${o.x},${o.y})${tags ? ` ${tags}` : ''}`;
    li.appendChild(span);

    // Delete button
    const del = document.createElement('button');
    del.className = 'del-btn';
    del.textContent = '✕';
    del.title = `${o.name}を削除`;
    del.setAttribute('aria-label', `${o.name}を削除`);
    del.onclick = () => {
      state.oshis.splice(i, 1);
      saveToStorage();
      draw();
    };
    li.appendChild(del);

    list.appendChild(li);
  });
}

/* ----------------------------------------------------------
   UI ↔ State Sync
   ---------------------------------------------------------- */
function syncInputsFromState() {
  $('title').value = state.axis.title;
  $('xMin').value = state.axis.xMin;
  $('xMax').value = state.axis.xMax;
  $('yMin').value = state.axis.yMin;
  $('yMax').value = state.axis.yMax;
  $('visibility').value = state.axis.visibility;
}

/* ----------------------------------------------------------
   Image Picker
   ---------------------------------------------------------- */
function setImageError(msg) {
  $('oshiImageError').textContent = msg;
}

function resetImagePicker(clearInput = false) {
  const preview = $('oshiImagePreview');
  preview.removeAttribute('src');
  preview.classList.add('hidden');
  preview.alt = '';
  $('oshiImageData').value = '';
  setImageError('');
  if (clearInput) $('oshiImage').value = '';
}

$('oshiImage').addEventListener('change', () => {
  const file = $('oshiImage').files?.[0];
  if (!file) {
    resetImagePicker();
    return;
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    resetImagePicker(true);
    setImageError('画像は jpg / png / webp のみ対応です');
    return;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    resetImagePicker(true);
    setImageError('画像サイズは 512KB 以下にしてください');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const result = typeof reader.result === 'string' ? reader.result : '';
    if (!IMAGE_DATA_RE.test(result)) {
      resetImagePicker(true);
      setImageError('画像の読み込みに失敗しました');
      return;
    }
    $('oshiImageData').value = result;
    const preview = $('oshiImagePreview');
    preview.src = result;
    preview.alt = '追加前プレビュー';
    preview.classList.remove('hidden');
    setImageError('');
  };
  reader.onerror = () => {
    resetImagePicker(true);
    setImageError('画像の読み込みに失敗しました');
  };
  reader.readAsDataURL(file);
});

/* ----------------------------------------------------------
   Axis Settings
   ---------------------------------------------------------- */
$('presetBtn').onclick = () => {
  $('title').value = '裏切る / 裏切らない × 信頼できない / 信頼できる';
  $('xMin').value = '裏切る';
  $('xMax').value = '裏切らない';
  $('yMin').value = '信頼できない';
  $('yMax').value = '信頼できる';
};

$('saveAxis').onclick = () => {
  state.axis = {
    title:      $('title').value.trim(),
    xMin:       $('xMin').value.trim() || '左',
    xMax:       $('xMax').value.trim() || '右',
    yMin:       $('yMin').value.trim() || '下',
    yMax:       $('yMax').value.trim() || '上',
    visibility: $('visibility').value,
  };
  saveToStorage();
  draw();
  $('saveMsg').textContent = '軸を保存したよ！';
  setTimeout(() => { $('saveMsg').textContent = ''; }, 1400);
};

/* ----------------------------------------------------------
   Add Oshi
   ---------------------------------------------------------- */
function addOshi() {
  const name = $('oshiName').value.trim();
  if (!name) {
    alert('名前入れて〜');
    return;
  }

  const rawX = Number($('oshiX').value || 0);
  const rawY = Number($('oshiY').value || 0);
  if (Number.isNaN(rawX) || Number.isNaN(rawY)) {
    alert('座標は数値で入れてね');
    return;
  }

  const x = clamp(rawX, -100, 100);
  const y = clamp(rawY, -100, 100);
  if (x !== rawX || y !== rawY) {
    alert('座標は-100〜100に補正したよ');
  }

  state.oshis.push({
    name,
    x,
    y,
    tags: $('oshiTags').value.split(',').map((s) => s.trim()).filter(Boolean),
    imageData: $('oshiImageData').value || '',
  });

  // Reset input fields
  $('oshiName').value = '';
  $('oshiTags').value = '';
  resetImagePicker(true);
  saveToStorage();
  draw();
}

$('addOshi').onclick = addOshi;

// Enter key on name/tags/coordinate fields triggers add
['oshiName', 'oshiTags', 'oshiX', 'oshiY'].forEach((id) => {
  $(id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addOshi();
    }
  });
});

/* ----------------------------------------------------------
   Share / Fork
   ---------------------------------------------------------- */
$('shareBtn').onclick = () => {
  const json = JSON.stringify(state);
  const encoded = btoa(unescape(encodeURIComponent(json)));
  $('shareUrl').value = `${location.origin}${location.pathname}?data=${encodeURIComponent(encoded)}`;
};

$('copyBtn').onclick = async () => {
  const url = $('shareUrl').value.trim();
  if (!url) {
    alert('先に共有URLを作ってね');
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    const btn = $('copyBtn');
    btn.classList.add('copied');
    btn.textContent = 'コピー済み！';
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.textContent = 'URLをコピー';
    }, 1200);
  } catch {
    alert('コピーに失敗したよ');
  }
};

$('forkBtn').onclick = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(structuredClone(state)));
  alert('Forkしたよ！このまま編集してね');
};

/* ----------------------------------------------------------
   Initialisation
   ---------------------------------------------------------- */
(function init() {
  const params = new URLSearchParams(location.search);
  const data = params.get('data');

  if (data) {
    try {
      const json = decodeURIComponent(escape(atob(data)));
      sanitizeAndLoad(JSON.parse(json));
    } catch (e) {
      console.warn('Failed to load state from URL:', e);
      loadFromStorage();
    }
  } else {
    loadFromStorage();
  }

  syncInputsFromState();
  draw();
  resetImagePicker();
})();
