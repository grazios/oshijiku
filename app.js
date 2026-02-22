const MAX_IMAGE_BYTES = 512 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const SVG_NS = 'http://www.w3.org/2000/svg';
const MAP_SIZE = 600;
const MAP_PAD = 50;
const MAP_RANGE = MAP_SIZE - MAP_PAD * 2; // 500

const state = {
  axis: { title: '', xMin: '左', xMax: '右', yMin: '下', yMax: '上', visibility: 'public' },
  oshis: []
};

const $ = id => document.getElementById(id);
const map = $('map');

/* --- persistence --- */
function saveLocal() {
  localStorage.setItem('oshijiku_state', JSON.stringify(state));
}

function sanitizeLoadedState(parsed) {
  if (!parsed || typeof parsed !== 'object') return;
  if (parsed.axis && typeof parsed.axis === 'object') {
    state.axis = {
      title: String(parsed.axis.title ?? ''),
      xMin: String(parsed.axis.xMin ?? '左'),
      xMax: String(parsed.axis.xMax ?? '右'),
      yMin: String(parsed.axis.yMin ?? '下'),
      yMax: String(parsed.axis.yMax ?? '上'),
      visibility: parsed.axis.visibility === 'url' ? 'url' : 'public'
    };
  }
  if (Array.isArray(parsed.oshis)) {
    state.oshis = parsed.oshis
      .map(o => ({
        name: String(o?.name ?? '').trim(),
        x: Number(o?.x ?? 0),
        y: Number(o?.y ?? 0),
        tags: Array.isArray(o?.tags) ? o.tags.map(t => String(t)).filter(Boolean) : [],
        imageData: typeof o?.imageData === 'string' && /^data:image\/(jpeg|png|webp);base64,/i.test(o.imageData) ? o.imageData : ''
      }))
      .filter(o => o.name)
      .map(o => ({
        ...o,
        x: Math.max(-100, Math.min(100, Number.isFinite(o.x) ? o.x : 0)),
        y: Math.max(-100, Math.min(100, Number.isFinite(o.y) ? o.y : 0))
      }));
  }
}

function loadLocal() {
  const s = localStorage.getItem('oshijiku_state');
  if (!s) return;
  try { sanitizeLoadedState(JSON.parse(s)); } catch (e) { console.warn(e); }
}

/* --- coord helpers --- */
function toSvgX(v) { return MAP_SIZE / 2 + (Number(v) / 100) * (MAP_RANGE / 2); }
function toSvgY(v) { return MAP_SIZE / 2 - (Number(v) / 100) * (MAP_RANGE / 2); }
function fromSvgX(px) { return Math.round(((px - MAP_SIZE / 2) / (MAP_RANGE / 2)) * 100); }
function fromSvgY(px) { return Math.round(((MAP_SIZE / 2 - px) / (MAP_RANGE / 2)) * 100); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function createSvgEl(name, attrs = {}, text = '') {
  const el = document.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
  if (text) el.textContent = text;
  return el;
}

/* --- SVG coordinate from pointer event --- */
let svgPt = null;
function svgCoord(evt) {
  if (!svgPt) svgPt = map.createSVGPoint();
  svgPt.x = evt.clientX;
  svgPt.y = evt.clientY;
  const ctm = map.getScreenCTM().inverse();
  return svgPt.matrixTransform(ctm);
}

/* --- draw --- */
function draw() {
  map.textContent = '';

  // grid lines (subtle)
  for (let v = -50; v <= 50; v += 50) {
    if (v === 0) continue;
    const gx = toSvgX(v), gy = toSvgY(v);
    map.appendChild(createSvgEl('line', { class: 'grid', x1: gx, y1: MAP_PAD, x2: gx, y2: MAP_SIZE - MAP_PAD }));
    map.appendChild(createSvgEl('line', { class: 'grid', x1: MAP_PAD, y1: gy, x2: MAP_SIZE - MAP_PAD, y2: gy }));
  }

  // axes
  map.appendChild(createSvgEl('line', { class: 'axis', x1: MAP_PAD, y1: MAP_SIZE / 2, x2: MAP_SIZE - MAP_PAD, y2: MAP_SIZE / 2 }));
  map.appendChild(createSvgEl('line', { class: 'axis', x1: MAP_SIZE / 2, y1: MAP_PAD, x2: MAP_SIZE / 2, y2: MAP_SIZE - MAP_PAD }));

  // labels
  map.appendChild(createSvgEl('text', { class: 'label axis-label', x: MAP_PAD + 5, y: MAP_SIZE / 2 - 8, 'text-anchor': 'start' }, state.axis.xMin));
  map.appendChild(createSvgEl('text', { class: 'label axis-label', x: MAP_SIZE - MAP_PAD - 5, y: MAP_SIZE / 2 - 8, 'text-anchor': 'end' }, state.axis.xMax));
  map.appendChild(createSvgEl('text', { class: 'label axis-label', x: MAP_SIZE / 2, y: MAP_PAD - 8, 'text-anchor': 'middle' }, state.axis.yMax));
  map.appendChild(createSvgEl('text', { class: 'label axis-label', x: MAP_SIZE / 2, y: MAP_SIZE - MAP_PAD + 20, 'text-anchor': 'middle' }, state.axis.yMin));
  map.appendChild(createSvgEl('text', { class: 'label map-title', x: MAP_SIZE / 2, y: MAP_SIZE - 6, 'text-anchor': 'middle' }, state.axis.title || '推し軸MAP'));

  // oshis
  state.oshis.forEach((o, idx) => {
    const x = toSvgX(o.x);
    const y = toSvgY(o.y);
    const tags = o.tags.length ? `\nタグ: ${o.tags.map(t => '#' + t).join(' ')}` : '';
    const tip = `${o.name} (${o.x}, ${o.y})${tags}\n※ドラッグで移動`;

    const g = createSvgEl('g', { class: 'oshi-dot', 'data-idx': idx });
    g.appendChild(createSvgEl('title', {}, tip));

    if (o.imageData) {
      // clip circle for image
      const clipId = `clip-${idx}`;
      const defs = createSvgEl('defs');
      const clipPath = createSvgEl('clipPath', { id: clipId });
      clipPath.appendChild(createSvgEl('circle', { cx: x, cy: y, r: 20 }));
      defs.appendChild(clipPath);
      g.appendChild(defs);

      // image thumbnail
      g.appendChild(createSvgEl('image', {
        href: o.imageData, x: x - 20, y: y - 20, width: 40, height: 40,
        'clip-path': `url(#${clipId})`, preserveAspectRatio: 'xMidYMid slice'
      }));
      // border ring
      g.appendChild(createSvgEl('circle', { class: 'img-ring', cx: x, cy: y, r: 20 }));
      // invisible hit area
      g.appendChild(createSvgEl('circle', { class: 'dot-hover', cx: x, cy: y, r: 24 }));
    } else {
      g.appendChild(createSvgEl('circle', { class: 'dot-hover', cx: x, cy: y, r: 18 }));
      g.appendChild(createSvgEl('circle', { class: 'dot', cx: x, cy: y, r: 8 }));
    }

    g.appendChild(createSvgEl('text', { class: 'label oshi-label', x: x, y: o.imageData ? y - 26 : y - 14, 'text-anchor': 'middle' }, o.name));
    map.appendChild(g);
  });

  renderOshiList();
}

/* --- drag & drop --- */
let dragIdx = -1;
let dragStart = null;

function onPointerDown(evt) {
  const g = evt.target.closest('.oshi-dot');
  if (!g) return;
  dragIdx = Number(g.dataset.idx);
  dragStart = svgCoord(evt);
  map.setPointerCapture(evt.pointerId);
  g.classList.add('dragging');
  evt.preventDefault();
}

function onPointerMove(evt) {
  if (dragIdx < 0) return;
  const pt = svgCoord(evt);
  const rawX = fromSvgX(pt.x);
  const rawY = fromSvgY(pt.y);
  state.oshis[dragIdx].x = clamp(rawX, -100, 100);
  state.oshis[dragIdx].y = clamp(rawY, -100, 100);
  draw();
}

function onPointerUp(evt) {
  if (dragIdx < 0) return;
  dragIdx = -1;
  dragStart = null;
  saveLocal();
  draw();
}

map.addEventListener('pointerdown', onPointerDown);
map.addEventListener('pointermove', onPointerMove);
map.addEventListener('pointerup', onPointerUp);
map.addEventListener('pointercancel', onPointerUp);

/* --- oshi list --- */
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

    const text = document.createElement('span');
    const tags = o.tags.map(t => `#${t}`).join(' ');
    text.textContent = `${o.name} (${o.x},${o.y})${tags ? ` ${tags}` : ''}`;
    li.appendChild(text);

    const del = document.createElement('button');
    del.className = 'del-btn';
    del.textContent = '✕';
    del.title = `${o.name}を削除`;
    del.onclick = () => { state.oshis.splice(i, 1); saveLocal(); draw(); };
    li.appendChild(del);

    list.appendChild(li);
  });
}

/* --- UI sync --- */
function syncInputs() {
  $('title').value = state.axis.title;
  $('xMin').value = state.axis.xMin;
  $('xMax').value = state.axis.xMax;
  $('yMin').value = state.axis.yMin;
  $('yMax').value = state.axis.yMax;
  $('visibility').value = state.axis.visibility;
}

/* --- image picker --- */
function setImageError(msg) { $('oshiImageError').textContent = msg; }

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
  if (!file) { resetImagePicker(); return; }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) { resetImagePicker(true); setImageError('画像は jpg / png / webp のみ対応です'); return; }
  if (file.size > MAX_IMAGE_BYTES) { resetImagePicker(true); setImageError('画像サイズは 512KB 以下にしてください'); return; }

  const reader = new FileReader();
  reader.onload = () => {
    const result = typeof reader.result === 'string' ? reader.result : '';
    if (!/^data:image\/(jpeg|png|webp);base64,/i.test(result)) { resetImagePicker(true); setImageError('画像の読み込みに失敗しました'); return; }
    $('oshiImageData').value = result;
    const preview = $('oshiImagePreview');
    preview.src = result;
    preview.alt = '追加前プレビュー';
    preview.classList.remove('hidden');
    setImageError('');
  };
  reader.onerror = () => { resetImagePicker(true); setImageError('画像の読み込みに失敗しました'); };
  reader.readAsDataURL(file);
});

/* --- axis --- */
$('presetBtn').onclick = () => {
  $('title').value = '裏切る / 裏切らない × 信頼できない / 信頼できる';
  $('xMin').value = '裏切る';
  $('xMax').value = '裏切らない';
  $('yMin').value = '信頼できない';
  $('yMax').value = '信頼できる';
};

$('saveAxis').onclick = () => {
  state.axis = {
    title: $('title').value.trim(),
    xMin: $('xMin').value.trim() || '左',
    xMax: $('xMax').value.trim() || '右',
    yMin: $('yMin').value.trim() || '下',
    yMax: $('yMax').value.trim() || '上',
    visibility: $('visibility').value
  };
  saveLocal(); draw();
  $('saveMsg').textContent = '軸を保存したよ！';
  setTimeout(() => { $('saveMsg').textContent = ''; }, 1400);
};

/* --- add oshi --- */
function addOshi() {
  const name = $('oshiName').value.trim();
  if (!name) return alert('名前入れて〜');
  const rawX = Number($('oshiX').value || 0);
  const rawY = Number($('oshiY').value || 0);
  if (Number.isNaN(rawX) || Number.isNaN(rawY)) return alert('座標は数値で入れてね');
  const x = clamp(rawX, -100, 100);
  const y = clamp(rawY, -100, 100);
  if (x !== rawX || y !== rawY) alert('座標は-100〜100に補正したよ');

  state.oshis.push({
    name, x, y,
    tags: $('oshiTags').value.split(',').map(s => s.trim()).filter(Boolean),
    imageData: $('oshiImageData').value || ''
  });
  $('oshiName').value = '';
  $('oshiTags').value = '';
  resetImagePicker(true);
  saveLocal(); draw();
}

$('addOshi').onclick = addOshi;
$('oshiTags').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addOshi(); } });

/* --- share / fork --- */
$('shareBtn').onclick = () => {
  const data = btoa(unescape(encodeURIComponent(JSON.stringify(state))));
  $('shareUrl').value = `${location.origin}${location.pathname}?data=${encodeURIComponent(data)}`;
};

$('copyBtn').onclick = async () => {
  const url = $('shareUrl').value.trim();
  if (!url) return alert('先に共有URLを作ってね');
  try {
    await navigator.clipboard.writeText(url);
    $('copyBtn').classList.add('copied');
    $('copyBtn').textContent = 'コピー済み！';
    setTimeout(() => { $('copyBtn').classList.remove('copied'); $('copyBtn').textContent = 'URLをコピー'; }, 1200);
  } catch { alert('コピーに失敗したよ'); }
};

$('forkBtn').onclick = () => {
  localStorage.setItem('oshijiku_state', JSON.stringify(structuredClone(state)));
  alert('Forkしたよ！このまま編集してね');
};

/* --- init --- */
(function init() {
  const q = new URLSearchParams(location.search);
  if (q.get('data')) {
    try { sanitizeLoadedState(JSON.parse(decodeURIComponent(escape(atob(q.get('data')))))); }
    catch (e) { console.warn(e); loadLocal(); }
  } else { loadLocal(); }
  syncInputs(); draw(); resetImagePicker();
})();
