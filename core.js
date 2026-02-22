/* ============================================================
   推し軸 (oshijiku.com) – Core pure functions (ESM)
   ============================================================ */

const MAP_SIZE = 600;
const MAP_PAD = 50;
const MAP_RANGE = MAP_SIZE - MAP_PAD * 2;
const IMAGE_DATA_RE = /^data:image\/(jpeg|png|webp);base64,/i;

export { MAP_SIZE, MAP_PAD, MAP_RANGE, IMAGE_DATA_RE };

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
