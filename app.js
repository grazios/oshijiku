/* ============================================================
   推し軸 (oshijiku.com) – Application Logic
   Vanilla JS / No framework / Static site
   ============================================================ */

import {
  MAP_SIZE, MAP_PAD, MAP_RANGE, IMAGE_DATA_RE,
  toSvgX, toSvgY, fromSvgX, fromSvgY, clamp, sanitizeAndLoad,
  parseTags, validateOshiInput, buildSharePayload, validateVisibility,
  validateImageFile, resolveAxisDefaults,
} from './core.js';

const MAX_IMAGE_BYTES = 512 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_OSHIS = 50;
const SVG_NS = 'http://www.w3.org/2000/svg';
const STORAGE_KEY = 'oshijiku_state';

let currentShareId = null;
let isViewMode = false;

/* ----------------------------------------------------------
   State
   ---------------------------------------------------------- */
const state = {
  axis: { title: '', xMin: '左', xMax: '右', yMin: '下', yMax: '上', visibility: 'public' },
  oshis: [],
};

/* ----------------------------------------------------------
   Inline Error Helpers
   ---------------------------------------------------------- */
function showMapError(msg) {
  const el = $('mapError');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => { el.textContent = ''; el.classList.add('hidden'); }, 5000);
}

/* ----------------------------------------------------------
   DOM Helpers
   ---------------------------------------------------------- */
const $ = (id) => document.getElementById(id);
const map = $('map');
const mapWrap = $('mapWrap');

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
    showMapError('保存に失敗しました。ブラウザのストレージ容量が不足している可能性があります。');
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
    { field: 'xMin', text: state.axis.xMin,  x: MAP_PAD + 5,            y: mid - 8,                anchor: 'start' },
    { field: 'xMax', text: state.axis.xMax,  x: MAP_SIZE - MAP_PAD - 5,  y: mid - 8,               anchor: 'end' },
    { field: 'yMax', text: state.axis.yMax,  x: mid,                     y: MAP_PAD - 8,            anchor: 'middle' },
    { field: 'yMin', text: state.axis.yMin,  x: mid,                     y: MAP_SIZE - MAP_PAD + 20, anchor: 'middle' },
  ];
  for (const l of labels) {
    const el = createSvgEl('text', {
      class: 'label axis-label editable-label', x: l.x, y: l.y, 'text-anchor': l.anchor,
      'data-axis-field': l.field,
    }, l.text);
    map.appendChild(el);
  }
  const titleEl = createSvgEl('text', {
    class: 'label map-title editable-label', x: mid, y: MAP_SIZE - 6, 'text-anchor': 'middle',
    'data-axis-field': 'title',
  }, state.axis.title || '推し軸MAP');
  map.appendChild(titleEl);
}

function drawEmptyState() {
  const mid = MAP_SIZE / 2;
  map.appendChild(createSvgEl('text', {
    class: 'label', x: mid, y: mid - 10, 'text-anchor': 'middle',
    fill: '#9fb0d4', 'font-size': '14',
  }, '軸ラベルをダブルクリックで編集、'));
  map.appendChild(createSvgEl('text', {
    class: 'label', x: mid, y: mid + 14, 'text-anchor': 'middle',
    fill: '#9fb0d4', 'font-size': '14',
  }, '＋ボタンで推しを追加！'));
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
   Inline Label Editing (double-click on axis labels / title)
   ---------------------------------------------------------- */
function startInlineEdit(svgTextEl) {
  const field = svgTextEl.getAttribute('data-axis-field');
  if (!field) return;

  // Get position of SVG text element relative to mapWrap
  const wrapRect = mapWrap.getBoundingClientRect();
  const textRect = svgTextEl.getBoundingClientRect();

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'inline-label-input';
  input.value = field === 'title' ? (state.axis.title || '') : (state.axis[field] || '');

  // Position
  const left = textRect.left - wrapRect.left;
  const top = textRect.top - wrapRect.top;
  input.style.left = `${left}px`;
  input.style.top = `${top - 4}px`;
  input.style.width = `${Math.max(textRect.width + 40, 80)}px`;

  // Anchor alignment
  const anchor = svgTextEl.getAttribute('text-anchor');
  if (anchor === 'end') {
    input.style.left = 'auto';
    input.style.right = `${wrapRect.right - textRect.right}px`;
    input.style.textAlign = 'right';
  } else if (anchor === 'middle') {
    input.style.left = `${left + textRect.width / 2}px`;
    input.style.transform = 'translateX(-50%)';
    input.style.textAlign = 'center';
  }

  function commit() {
    const val = input.value.trim();
    if (field === 'title') {
      state.axis.title = val;
    } else {
      state.axis[field] = val;
    }
    const resolved = resolveAxisDefaults(state.axis);
    Object.assign(state.axis, resolved);
    saveToStorage();
    input.remove();
    draw();
  }

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.remove(); }
  });

  mapWrap.appendChild(input);
  input.focus();
  input.select();
}

map.addEventListener('dblclick', (evt) => {
  if (isViewMode) return;
  const target = evt.target.closest('.editable-label');
  if (target) {
    evt.preventDefault();
    startInlineEdit(target);
  }
});

/* ----------------------------------------------------------
   Drag & Drop
   ---------------------------------------------------------- */
let dragIdx = -1;
let dragG = null;
let dragOrigSvgX = 0;
let dragOrigSvgY = 0;

function handlePointerDown(evt) {
  if (isViewMode) return;
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
  if (!pt) return;
  const newX = clamp(fromSvgX(pt.x), -100, 100);
  const newY = clamp(fromSvgY(pt.y), -100, 100);
  state.oshis[dragIdx].x = newX;
  state.oshis[dragIdx].y = newY;

  const dx = toSvgX(newX) - dragOrigSvgX;
  const dy = toSvgY(newY) - dragOrigSvgY;
  dragG.setAttribute('transform', `translate(${dx},${dy})`);
}

function handlePointerEnd() {
  if (dragIdx < 0) return;
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
    span.textContent = `${o.name}${tags ? ` ${tags}` : ''}`;
    li.appendChild(span);

    if (!isViewMode) {
      const del = document.createElement('button');
      del.className = 'del-btn';
      del.textContent = '✕';
      del.title = `${o.name}を削除`;
      del.setAttribute('aria-label', `${o.name}を削除`);
      del.onclick = () => {
        if (!confirm(`「${o.name}」を削除しますか？`)) return;
        state.oshis.splice(i, 1);
        saveToStorage();
        draw();
      };
      li.appendChild(del);
    }

    list.appendChild(li);
  });
}

/* ----------------------------------------------------------
   Add Oshi Dialog
   ---------------------------------------------------------- */
const dialog = $('addOshiDialog');

$('addOshiBtn').onclick = () => {
  // Reset fields
  $('dlgOshiName').value = '';
  $('dlgOshiTags').value = '';
  $('dlgOshiImage').value = '';
  $('dlgOshiImageData').value = '';
  $('dlgImagePreview').classList.add('hidden');
  $('dlgImagePreview').removeAttribute('src');
  $('dlgImageError').textContent = '';
  dialog.showModal();
};

// Image button triggers file input
$('dlgImageBtn').onclick = () => $('dlgOshiImage').click();

$('dlgOshiImage').addEventListener('change', () => {
  const file = $('dlgOshiImage').files?.[0];
  const preview = $('dlgImagePreview');
  const errEl = $('dlgImageError');
  if (!file) {
    $('dlgOshiImageData').value = '';
    preview.classList.add('hidden');
    errEl.textContent = '';
    return;
  }
  const validation = validateImageFile({ type: file.type, size: file.size });
  if (!validation.valid) {
    $('dlgOshiImage').value = '';
    $('dlgOshiImageData').value = '';
    preview.classList.add('hidden');
    errEl.textContent = validation.error;
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const result = typeof reader.result === 'string' ? reader.result : '';
    if (!IMAGE_DATA_RE.test(result)) {
      errEl.textContent = '画像の読み込みに失敗しました';
      return;
    }
    $('dlgOshiImageData').value = result;
    preview.src = result;
    preview.alt = '追加前プレビュー';
    preview.classList.remove('hidden');
    errEl.textContent = '';
  };
  reader.onerror = () => { errEl.textContent = '画像の読み込みに失敗しました'; };
  reader.readAsDataURL(file);
});

$('dlgAddBtn').onclick = () => {
  const name = $('dlgOshiName').value.trim();
  const dlgError = $('dlgNameError');
  if (!name) {
    dlgError.textContent = '名前入れて〜';
    return;
  }
  dlgError.textContent = '';

  if (state.oshis.length >= MAX_OSHIS) {
    dlgError.textContent = `推しは最大${MAX_OSHIS}人までです`;
    return;
  }

  state.oshis.push({
    name,
    x: 0,
    y: 0,
    tags: parseTags($('dlgOshiTags').value),
    imageData: $('dlgOshiImageData').value || '',
  });

  saveToStorage();
  draw();
  dialog.close();
};

$('dlgCancelBtn').onclick = () => dialog.close();

// Close on backdrop click
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) dialog.close();
});

// Enter to submit in dialog
$('dlgOshiName').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); $('dlgAddBtn').click(); }
});
$('dlgOshiTags').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); $('dlgAddBtn').click(); }
});

/* ----------------------------------------------------------
   Share / Fork
   ---------------------------------------------------------- */
$('shareBtn').onclick = async () => {
  const hasImages = state.oshis.some((o) => o.imageData);
  const shareState = buildSharePayload(state);

  try {
    const res = await fetch('/api/save.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(shareState),
    });
    const json = await res.json();
    if (!json.ok) {
      showMapError('共有に失敗しました: ' + (json.error || '不明なエラー'));
      return;
    }
    $('shareUrl').value = json.url;
    updateShareButtons();

    const keys = JSON.parse(localStorage.getItem('oshijiku_delete_keys') || '{}');
    keys[json.share_id] = json.delete_key;
    localStorage.setItem('oshijiku_delete_keys', JSON.stringify(keys));

    currentShareId = json.share_id;
    showDeleteBtn(json.share_id);

    $('shareMsg').textContent = '共有リンクを作成しました！削除キーはこのブラウザに保存されています。';
    setTimeout(() => { $('shareMsg').textContent = ''; }, 5000);

    if (hasImages) {
      $('shareMsg').textContent += ' ※画像は共有リンクに含まれません';
    }
  } catch (e) {
    console.error('Share failed:', e);
    showMapError('共有に失敗しました。通信エラーです。');
  }
};

function updateShareButtons() {
  const hasUrl = !!$('shareUrl').value.trim();
  $('copyBtn').disabled = !hasUrl;
  $('forkBtn').disabled = !hasUrl;
}

$('copyBtn').onclick = async () => {
  const url = $('shareUrl').value.trim();
  if (!url) return;
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
    showMapError('コピーに失敗しました');
  }
};

$('forkBtn').onclick = () => {
  const forked = JSON.parse(JSON.stringify(state));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(forked));
  $('shareMsg').textContent = 'コピーしたよ！このまま自由に編集してね';
  setTimeout(() => { $('shareMsg').textContent = ''; }, 3000);
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
    showMapError('削除キーが見つかりません');
    return;
  }
  if (!confirm('共有リンクを削除しますか？この操作は取り消せません。')) return;

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
      updateShareButtons();
      $('shareMsg').textContent = '共有を削除しました';
      setTimeout(() => { $('shareMsg').textContent = ''; }, 3000);
    } else {
      showMapError('削除に失敗しました: ' + (json.error || '不明なエラー'));
    }
  } catch (e) {
    console.error('Delete failed:', e);
    showMapError('削除に失敗しました。通信エラーです。');
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
    isViewMode = true;
    try {
      const res = await fetch(`/api/load.php?id=${encodeURIComponent(shareParam)}`);
      const json = await res.json();
      if (json.ok && json.data) {
        applySanitized(json.data);
        currentShareId = shareParam;
      } else {
        console.warn('Failed to load shared map:', json.error);
        isViewMode = false;
        loadFromStorage();
        setTimeout(() => showMapError('共有マップが見つかりませんでした'), 0);
      }
    } catch (e) {
      console.warn('Failed to fetch shared map:', e);
      isViewMode = false;
      loadFromStorage();
      setTimeout(() => showMapError('共有マップの読み込みに失敗しました'), 0);
    }
  } else if (data) {
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

  draw();
  updateShareButtons();

  // MF-1: View mode — hide edit UI, show fork button
  if (isViewMode) {
    $('addOshiBtn').classList.add('hidden');
    $('shareBtn').parentElement.classList.add('hidden'); // actions--three
    $('shareUrl').classList.add('hidden');
    $('deleteShareBtn').classList.add('hidden');
    document.querySelectorAll('.del-btn').forEach(b => b.classList.add('hidden'));
    document.querySelector('.hint')?.classList.add('hidden');

    const forkViewBtn = document.createElement('button');
    forkViewBtn.className = 'add-oshi-btn';
    forkViewBtn.textContent = 'コピーして自分用に作る';
    forkViewBtn.onclick = () => {
      const forked = JSON.parse(JSON.stringify(state));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(forked));
      location.href = '/';
    };
    $('mapWrap').after(forkViewBtn);
  }

  // MF-2: Data reset button
  if (!isViewMode) {
    const resetBtn = document.createElement('button');
    resetBtn.className = 'reset-btn';
    resetBtn.textContent = 'データをリセット';
    resetBtn.onclick = () => {
      if (!confirm('すべてのデータを削除しますか？')) return;
      localStorage.clear();
      location.reload();
    };
    $('oshiList').after(resetBtn);
  }
})();
