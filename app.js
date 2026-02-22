/* ============================================================
   推し軸 (oshijiku.com) – Application Logic
   Vanilla JS / No framework / Static site
   ============================================================ */

import {
  MAP_SIZE, MAP_PAD, MAP_RANGE, IMAGE_DATA_RE,
  toSvgX, toSvgY, fromSvgX, fromSvgY, clamp, sanitizeAndLoad,
} from './core.js';

const MAX_IMAGE_BYTES = 512 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const SVG_NS = 'http://www.w3.org/2000/svg';
const STORAGE_KEY = 'oshijiku_state';

let currentShareId = null;

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

function createSvgEl(tag, attrs = {}, textContent = '') {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  if (textContent) el.textContent = textContent;
  return el;
}

/* ----------------------------------------------------------
   Coordinate Conversion (SVG point)
   ---------------------------------------------------------- */
let _svgPoint = null;
function pointerToSvg(evt) {
  if (!_svgPoint) _svgPoint = map.createSVGPoint();
  _svgPoint.x = evt.clientX;
  _svgPoint.y = evt.clientY;
  // SF-1: getScreenCTM() null check
  const ctm = map.getScreenCTM();
  if (!ctm) return null;
  return _svgPoint.matrixTransform(ctm.inverse());
}

/* ----------------------------------------------------------
   Persistence (localStorage)
   ---------------------------------------------------------- */
function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    alert('保存に失敗しました。ブラウザのストレージ容量が不足している可能性があります。');
    console.warn('localStorage save failed:', e);
  }
}

function applySanitized(parsed) {
  const result = sanitizeAndLoad(parsed, state);
  Object.assign(state.axis, result.axis);
  state.oshis = result.oshis;
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    applySanitized(JSON.parse(raw));
    return true;
  } catch (e) {
    console.warn('Failed to load state from localStorage:', e);
    return false;
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
  map.appendChild(createSvgEl('line', {
    class: 'axis', x1: MAP_PAD, y1: MAP_SIZE / 2, x2: MAP_SIZE - MAP_PAD, y2: MAP_SIZE / 2,
  }));
  map.appendChild(createSvgEl('line', {
    class: 'axis', x1: MAP_SIZE / 2, y1: MAP_PAD, x2: MAP_SIZE / 2, y2: MAP_SIZE - MAP_PAD,
  }));
}

function drawLabels() {
  const mid = MAP_SIZE / 2;
  const labels = [
    { text: state.axis.xMin,  x: MAP_PAD + 5,            y: mid - 8,                anchor: 'start' },
    { text: state.axis.xMax,  x: MAP_SIZE - MAP_PAD - 5,  y: mid - 8,               anchor: 'end' },
    { text: state.axis.yMax,  x: mid,                     y: MAP_PAD - 8,            anchor: 'middle' },
    { text: state.axis.yMin,  x: mid,                     y: MAP_SIZE - MAP_PAD + 20, anchor: 'middle' },
  ];
  for (const l of labels) {
    map.appendChild(createSvgEl('text', {
      class: 'label axis-label', x: l.x, y: l.y, 'text-anchor': l.anchor,
    }, l.text));
  }
  map.appendChild(createSvgEl('text', {
    class: 'label map-title', x: mid, y: MAP_SIZE - 6, 'text-anchor': 'middle',
  }, state.axis.title || '推し軸MAP'));
}

function drawEmptyState() {
  const mid = MAP_SIZE / 2;
  map.appendChild(createSvgEl('text', {
    class: 'label', x: mid, y: mid - 10, 'text-anchor': 'middle',
    fill: '#9fb0d4', 'font-size': '14',
  }, 'まず軸を設定して、'));
  map.appendChild(createSvgEl('text', {
    class: 'label', x: mid, y: mid + 14, 'text-anchor': 'middle',
    fill: '#9fb0d4', 'font-size': '14',
  }, '推しを追加してみよう！'));
}

function drawOshi(oshi, idx) {
  const x = toSvgX(oshi.x);
  const y = toSvgY(oshi.y);
  const tagStr = oshi.tags.length ? `\nタグ: ${oshi.tags.map((t) => '#' + t).join(' ')}` : '';
  const tooltip = `${oshi.name} (${oshi.x}, ${oshi.y})${tagStr}\n※ドラッグで移動`;

  const g = createSvgEl('g', { class: 'oshi-dot', 'data-idx': idx });
  g.appendChild(createSvgEl('title', {}, tooltip));

  if (oshi.imageData) {
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
  if (state.oshis.length === 0) {
    drawEmptyState();
  } else {
    state.oshis.forEach((o, i) => drawOshi(o, i));
  }
  renderOshiList();
}

/* ----------------------------------------------------------
   Drag & Drop
   ---------------------------------------------------------- */
let dragIdx = -1;
let dragG = null;
let dragOrigSvgX = 0;
let dragOrigSvgY = 0;

function handlePointerDown(evt) {
  const g = evt.target.closest('.oshi-dot');
  if (!g) return;
  dragIdx = Number(g.dataset.idx);
  dragG = g;
  const oshi = state.oshis[dragIdx];
  dragOrigSvgX = toSvgX(oshi.x);
  dragOrigSvgY = toSvgY(oshi.y);
  map.setPointerCapture(evt.pointerId);
  g.classList.add('dragging');
  evt.preventDefault();
}

function handlePointerMove(evt) {
  if (dragIdx < 0 || !dragG) return;
  const pt = pointerToSvg(evt);
  if (!pt) return; // SF-1: getScreenCTM() returned null
  const newX = clamp(fromSvgX(pt.x), -100, 100);
  const newY = clamp(fromSvgY(pt.y), -100, 100);
  state.oshis[dragIdx].x = newX;
  state.oshis[dragIdx].y = newY;

  // Transform-only approach – no draw() during drag
  const dx = toSvgX(newX) - dragOrigSvgX;
  const dy = toSvgY(newY) - dragOrigSvgY;
  dragG.setAttribute('transform', `translate(${dx},${dy})`);
  // MF-1: renderOshiList() removed – list updates on pointerup via draw()
}

function handlePointerEnd() {
  if (dragIdx < 0) return;
  // SF-2: explicitly remove dragging class before draw()
  if (dragG) dragG.classList.remove('dragging');
  dragIdx = -1;
  dragG = null;
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

    if (o.imageData) {
      const img = document.createElement('img');
      img.src = o.imageData;
      img.alt = `${o.name}のサムネイル`;
      img.className = 'oshi-thumb';
      li.appendChild(img);
    }

    const span = document.createElement('span');
    const tags = o.tags.map((t) => `#${t}`).join(' ');
    span.textContent = `${o.name} (${o.x},${o.y})${tags ? ` ${tags}` : ''}`;
    li.appendChild(span);

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

  $('oshiName').value = '';
  $('oshiTags').value = '';
  resetImagePicker(true);
  saveToStorage();
  draw();
}

$('addOshi').onclick = addOshi;

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
$('shareBtn').onclick = async () => {
  const hasImages = state.oshis.some((o) => o.imageData);
  const shareState = {
    axis: { ...state.axis },
    oshis: state.oshis.map((o) => ({
      name: o.name,
      x: o.x,
      y: o.y,
      tags: o.tags,
    })),
  };

  try {
    const res = await fetch('/api/save.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(shareState),
    });
    const json = await res.json();
    if (!json.ok) {
      alert('共有に失敗しました: ' + (json.error || '不明なエラー'));
      return;
    }
    $('shareUrl').value = json.url;

    // Save delete_key to localStorage
    const keys = JSON.parse(localStorage.getItem('oshijiku_delete_keys') || '{}');
    keys[json.share_id] = json.delete_key;
    localStorage.setItem('oshijiku_delete_keys', JSON.stringify(keys));

    currentShareId = json.share_id;
    showDeleteBtn(json.share_id);

    $('shareMsg').textContent = '共有リンクを作成しました！削除キーはこのブラウザに保存されています。';
    setTimeout(() => { $('shareMsg').textContent = ''; }, 5000);

    if (hasImages) {
      alert('※画像は共有リンクに含まれません');
    }
  } catch (e) {
    console.error('Share failed:', e);
    alert('共有に失敗しました。通信エラーです。');
  }
};

$('copyBtn').onclick = async () => {
  const url = $('shareUrl').value.trim();
  if (!url) {
    alert('先に共有リンクを作ってね');
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
  const forked = JSON.parse(JSON.stringify(state));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(forked));
  alert('コピーしたよ！このまま自由に編集してね');
};

/* ----------------------------------------------------------
   Delete Shared Map
   ---------------------------------------------------------- */
function showDeleteBtn(shareId) {
  const keys = JSON.parse(localStorage.getItem('oshijiku_delete_keys') || '{}');
  const btn = $('deleteShareBtn');
  if (keys[shareId]) {
    btn.classList.remove('hidden');
  } else {
    btn.classList.add('hidden');
  }
}

$('deleteShareBtn').onclick = async () => {
  if (!currentShareId) return;
  const keys = JSON.parse(localStorage.getItem('oshijiku_delete_keys') || '{}');
  const deleteKey = keys[currentShareId];
  if (!deleteKey) {
    alert('削除キーが見つかりません');
    return;
  }
  if (!confirm('この共有リンクを削除しますか？')) return;

  try {
    const res = await fetch('/api/delete.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ share_id: currentShareId, delete_key: deleteKey }),
    });
    const json = await res.json();
    if (json.ok) {
      delete keys[currentShareId];
      localStorage.setItem('oshijiku_delete_keys', JSON.stringify(keys));
      currentShareId = null;
      $('shareUrl').value = '';
      $('deleteShareBtn').classList.add('hidden');
      $('shareMsg').textContent = '共有を削除しました';
      setTimeout(() => { $('shareMsg').textContent = ''; }, 3000);
    } else {
      alert('削除に失敗しました: ' + (json.error || '不明なエラー'));
    }
  } catch (e) {
    console.error('Delete failed:', e);
    alert('削除に失敗しました。通信エラーです。');
  }
};

/* ----------------------------------------------------------
   Sample Data
   ---------------------------------------------------------- */
function loadSampleData() {
  state.axis = {
    title: '裏切る / 裏切らない × 信頼できない / 信頼できる',
    xMin: '裏切る',
    xMax: '裏切らない',
    yMin: '信頼できない',
    yMax: '信頼できる',
    visibility: 'public',
  };
  state.oshis = [
    { name: 'キャラA', x: 60, y: 80, tags: ['推し', '信頼'], imageData: '' },
    { name: 'キャラB', x: -40, y: 30, tags: ['沼'], imageData: '' },
    { name: 'キャラC', x: 20, y: -50, tags: ['てぇてぇ'], imageData: '' },
  ];
}

/* ----------------------------------------------------------
   Initialisation
   ---------------------------------------------------------- */
(async function init() {
  const params = new URLSearchParams(location.search);
  const shareParam = params.get('s');
  const data = params.get('data');

  if (shareParam) {
    // DB shared map
    try {
      const res = await fetch(`/api/load.php?id=${encodeURIComponent(shareParam)}`);
      const json = await res.json();
      if (json.ok && json.data) {
        applySanitized(json.data);
        currentShareId = shareParam;
        showDeleteBtn(shareParam);
      } else {
        console.warn('Failed to load shared map:', json.error);
        loadFromStorage();
      }
    } catch (e) {
      console.warn('Failed to fetch shared map:', e);
      loadFromStorage();
    }
  } else if (data) {
    // Legacy base64 URL format
    try {
      const json = decodeURIComponent(escape(atob(data)));
      applySanitized(JSON.parse(json));
    } catch (e) {
      console.warn('Failed to load state from URL:', e);
      loadFromStorage();
    }
  } else {
    const loaded = loadFromStorage();
    if (!loaded) {
      loadSampleData();
      saveToStorage();
    }
  }

  syncInputsFromState();
  draw();
  resetImagePicker();
})();
