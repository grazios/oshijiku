const MAX_IMAGE_BYTES = 512 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const SVG_NS = 'http://www.w3.org/2000/svg';

const state = {
  axis: { title: '', xMin: '左', xMax: '右', yMin: '下', yMax: '上', visibility: 'public' },
  oshis: []
};

const $ = id => document.getElementById(id);
const map = $('map');

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
  try {
    const parsed = JSON.parse(s);
    sanitizeLoadedState(parsed);
  } catch (e) {
    console.warn(e);
  }
}

function toCoord(v) {
  return 300 + (Number(v) / 100) * 250;
}

function createSvgEl(name, attrs = {}, text = '') {
  const el = document.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
  if (text) el.textContent = text;
  return el;
}

function draw() {
  map.textContent = '';

  map.appendChild(createSvgEl('line', { class: 'axis', x1: 50, y1: 300, x2: 550, y2: 300 }));
  map.appendChild(createSvgEl('line', { class: 'axis', x1: 300, y1: 50, x2: 300, y2: 550 }));
  map.appendChild(createSvgEl('text', { class: 'label', x: 55, y: 292, 'text-anchor': 'start' }, state.axis.xMin));
  map.appendChild(createSvgEl('text', { class: 'label', x: 545, y: 292, 'text-anchor': 'end' }, state.axis.xMax));
  map.appendChild(createSvgEl('text', { class: 'label', x: 300, y: 42, 'text-anchor': 'middle' }, state.axis.yMax));
  map.appendChild(createSvgEl('text', { class: 'label', x: 300, y: 570, 'text-anchor': 'middle' }, state.axis.yMin));
  map.appendChild(createSvgEl('text', { class: 'label map-title', x: 300, y: 594, 'text-anchor': 'middle' }, state.axis.title || '推し軸MAP'));

  state.oshis.forEach(o => {
    const x = toCoord(o.x);
    const y = toCoord(-o.y);
    const tags = o.tags.length ? `\nタグ: ${o.tags.map(t => '#' + t).join(' ')}` : '';
    const tip = `${o.name} (${o.x}, ${o.y})${tags}`;

    const g = createSvgEl('g', { class: 'oshi-dot' });
    g.appendChild(createSvgEl('title', {}, tip));
    g.appendChild(createSvgEl('circle', { class: 'dot-hover', cx: x, cy: y, r: 18 }));
    g.appendChild(createSvgEl('circle', { class: 'dot', cx: x, cy: y, r: 8 }));
    g.appendChild(createSvgEl('text', { class: 'label', x: x + 12, y: y - 12 }, o.name));
    map.appendChild(g);
  });

  renderOshiList();
}

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
    del.onclick = () => {
      state.oshis.splice(i, 1);
      saveLocal();
      draw();
    };
    li.appendChild(del);

    list.appendChild(li);
  });
}

function syncInputs() {
  $('title').value = state.axis.title;
  $('xMin').value = state.axis.xMin;
  $('xMax').value = state.axis.xMax;
  $('yMin').value = state.axis.yMin;
  $('yMax').value = state.axis.yMax;
  $('visibility').value = state.axis.visibility;
}

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
    if (!/^data:image\/(jpeg|png|webp);base64,/i.test(result)) {
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
  saveLocal();
  draw();
  $('saveMsg').textContent = '軸を保存したよ！';
  setTimeout(() => { $('saveMsg').textContent = ''; }, 1400);
};

function addOshi() {
  const name = $('oshiName').value.trim();
  if (!name) return alert('名前入れて〜');

  const rawX = Number($('oshiX').value || 0);
  const rawY = Number($('oshiY').value || 0);
  if (Number.isNaN(rawX) || Number.isNaN(rawY)) return alert('座標は数値で入れてね');
  const x = Math.max(-100, Math.min(100, rawX));
  const y = Math.max(-100, Math.min(100, rawY));
  if (x !== rawX || y !== rawY) alert('座標は-100〜100に補正したよ');

  const imageData = $('oshiImageData').value || '';
  state.oshis.push({
    name,
    x,
    y,
    tags: $('oshiTags').value.split(',').map(s => s.trim()).filter(Boolean),
    imageData
  });

  $('oshiName').value = '';
  $('oshiTags').value = '';
  resetImagePicker(true);

  saveLocal();
  draw();
}

$('addOshi').onclick = addOshi;
$('oshiTags').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addOshi();
  }
});

$('shareBtn').onclick = () => {
  const data = btoa(unescape(encodeURIComponent(JSON.stringify(state))));
  const url = `${location.origin}${location.pathname}?data=${encodeURIComponent(data)}`;
  $('shareUrl').value = url;
};

$('copyBtn').onclick = async () => {
  const url = $('shareUrl').value.trim();
  if (!url) return alert('先に共有URLを作ってね');
  try {
    await navigator.clipboard.writeText(url);
    $('copyBtn').classList.add('copied');
    $('copyBtn').textContent = 'コピー済み！';
    setTimeout(() => {
      $('copyBtn').classList.remove('copied');
      $('copyBtn').textContent = 'URLをコピー';
    }, 1200);
  } catch {
    alert('コピーに失敗したよ');
  }
};

$('forkBtn').onclick = () => {
  const fork = structuredClone(state);
  localStorage.setItem('oshijiku_state', JSON.stringify(fork));
  alert('Forkしたよ！このまま編集してね');
};

(function init() {
  const q = new URLSearchParams(location.search);
  if (q.get('data')) {
    try {
      const parsed = JSON.parse(decodeURIComponent(escape(atob(q.get('data')))));
      sanitizeLoadedState(parsed);
    } catch (e) {
      console.warn(e);
      loadLocal();
    }
  } else {
    loadLocal();
  }
  syncInputs();
  draw();
  resetImagePicker();
})();
