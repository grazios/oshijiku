/* ============================================================
   推し軸 (oshijiku.com) – Core pure functions (ESM)
   ============================================================ */

const MAP_SIZE = 600;
const MAP_PAD = 50;
const MAP_RANGE = MAP_SIZE - MAP_PAD * 2;
const IMAGE_DATA_RE = /^data:image\/(jpeg|png|webp);base64,/i;

export { MAP_SIZE, MAP_PAD, MAP_RANGE, IMAGE_DATA_RE };

const MAX_IMAGE_BYTES = 512 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function validateImageFile(file) {
  if (!file || typeof file !== 'object') return { valid: false, error: '画像ファイルが不正です' };
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return { valid: false, error: '画像は jpg / png / webp のみ対応です' };
  if (file.size > MAX_IMAGE_BYTES) return { valid: false, error: '画像サイズは 512KB 以下にしてください' };
  return { valid: true };
}

export function resolveAxisDefaults(axis) {
  const defaults = { xMin: '左', xMax: '右', yMin: '下', yMax: '上' };
  const result = { ...axis };
  for (const [key, def] of Object.entries(defaults)) {
    if (!result[key] || !String(result[key]).trim()) result[key] = def;
  }
  return result;
}

export function toSvgX(v) {
  return MAP_SIZE / 2 + (Number(v) / 100) * (MAP_RANGE / 2);
}

export function toSvgY(v) {
  return MAP_SIZE / 2 - (Number(v) / 100) * (MAP_RANGE / 2);
}

export function fromSvgX(px) {
  return Math.round(((px - MAP_SIZE / 2) / (MAP_RANGE / 2)) * 100);
}

export function fromSvgY(px) {
  return Math.round(((MAP_SIZE / 2 - px) / (MAP_RANGE / 2)) * 100);
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/* ----------------------------------------------------------
   Pure logic extracted from app.js
   ---------------------------------------------------------- */

export function parseTags(csv) {
  return String(csv ?? '').split(',').map(s => s.trim()).filter(Boolean);
}

export function validateOshiInput(name, x, y) {
  if (!String(name).trim()) return { valid: false, error: '名前入れて〜' };
  const nx = Number(x);
  const ny = Number(y);
  if (Number.isNaN(nx) || Number.isNaN(ny)) return { valid: false, error: '座標は数値で入れてね' };
  const cx = clamp(nx, -100, 100);
  const cy = clamp(ny, -100, 100);
  const clamped = cx !== nx || cy !== ny;
  return { valid: true, x: cx, y: cy, clamped };
}

export function buildSharePayload(state) {
  return {
    axis: { ...state.axis },
    oshis: state.oshis.map(o => {
      const { imageData, ...rest } = o;
      return { ...rest };
    }),
  };
}

export function validateVisibility(v) {
  return v === 'public' || v === 'url' ? v : 'public';
}

/**
 * Safely parse and merge loaded data into a state object, sanitising every field.
 * Returns the sanitised state (does NOT mutate the passed-in state).
 */
export function sanitizeAndLoad(parsed, state) {
  const result = {
    axis: { ...state.axis },
    oshis: [...state.oshis],
  };

  if (!parsed || typeof parsed !== 'object') return result;

  // Axis
  if (parsed.axis && typeof parsed.axis === 'object') {
    const a = parsed.axis;
    result.axis = {
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
    result.oshis = parsed.oshis
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

  return result;
}
