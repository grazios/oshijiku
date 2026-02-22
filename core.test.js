import { describe, it, expect } from 'vitest';
import {
  clamp, toSvgX, toSvgY, fromSvgX, fromSvgY, sanitizeAndLoad,
  IMAGE_DATA_RE, parseTags, validateOshiInput, buildSharePayload, validateVisibility,
} from './core.js';

describe('clamp', () => {
  it('returns value when within range', () => {
    expect(clamp(50, 0, 100)).toBe(50);
  });
  it('clamps to lower bound', () => {
    expect(clamp(-10, 0, 100)).toBe(0);
  });
  it('clamps to upper bound', () => {
    expect(clamp(200, 0, 100)).toBe(100);
  });
  it('returns lo and hi exactly at boundary', () => {
    expect(clamp(0, 0, 100)).toBe(0);
    expect(clamp(100, 0, 100)).toBe(100);
    expect(clamp(-100, -100, 100)).toBe(-100);
  });
});

describe('toSvgX / toSvgY', () => {
  it('maps -100 to left/bottom edge', () => {
    expect(toSvgX(-100)).toBe(50);   // MAP_PAD
    expect(toSvgY(-100)).toBe(550);  // MAP_SIZE - MAP_PAD
  });
  it('maps 0 to center', () => {
    expect(toSvgX(0)).toBe(300);
    expect(toSvgY(0)).toBe(300);
  });
  it('maps 100 to right/top edge', () => {
    expect(toSvgX(100)).toBe(550);
    expect(toSvgY(100)).toBe(50);
  });
});

describe('fromSvgX / fromSvgY', () => {
  it('reverse of toSvgX', () => {
    expect(fromSvgX(50)).toBe(-100);
    expect(fromSvgX(300)).toBe(0);
    expect(fromSvgX(550)).toBe(100);
  });
  it('reverse of toSvgY', () => {
    expect(fromSvgY(550)).toBe(-100);
    expect(fromSvgY(300)).toBe(0);
    expect(fromSvgY(50)).toBe(100);
  });
  it('roundtrip consistency for toSvgX↔fromSvgX and toSvgY↔fromSvgY', () => {
    for (const v of [-100, -50, 0, 50, 100]) {
      expect(fromSvgX(toSvgX(v))).toBe(v);
      expect(fromSvgY(toSvgY(v))).toBe(v);
    }
  });
});

describe('sanitizeAndLoad', () => {
  const defaultState = {
    axis: { title: '', xMin: '左', xMax: '右', yMin: '下', yMax: '上', visibility: 'public' },
    oshis: [],
  };

  it('loads valid data', () => {
    const input = {
      axis: { title: 'Test', xMin: 'L', xMax: 'R', yMin: 'D', yMax: 'U', visibility: 'url' },
      oshis: [{ name: 'A', x: 10, y: -20, tags: ['t1'] }],
    };
    const result = sanitizeAndLoad(input, defaultState);
    expect(result.axis.title).toBe('Test');
    expect(result.axis.visibility).toBe('url');
    expect(result.oshis).toHaveLength(1);
    expect(result.oshis[0].name).toBe('A');
    expect(result.oshis[0].x).toBe(10);
    expect(result.oshis[0].imageData).toBe('');
  });

  it('handles invalid data gracefully', () => {
    const result = sanitizeAndLoad('not an object', defaultState);
    expect(result.axis).toEqual(defaultState.axis);
    expect(result.oshis).toEqual([]);
  });

  it('handles null/empty', () => {
    const result = sanitizeAndLoad(null, defaultState);
    expect(result.axis).toEqual(defaultState.axis);
  });

  it('strips XSS from imageData', () => {
    const input = {
      oshis: [{ name: 'Evil', x: 0, y: 0, tags: [], imageData: 'javascript:alert(1)' }],
    };
    const result = sanitizeAndLoad(input, defaultState);
    expect(result.oshis[0].imageData).toBe('');
  });

  it('clamps out-of-range coordinates', () => {
    const input = {
      oshis: [{ name: 'Far', x: 999, y: -999, tags: [] }],
    };
    const result = sanitizeAndLoad(input, defaultState);
    expect(result.oshis[0].x).toBe(100);
    expect(result.oshis[0].y).toBe(-100);
  });

  it('filters oshis with empty names', () => {
    const input = {
      oshis: [{ name: '', x: 0, y: 0 }, { name: '  ', x: 0, y: 0 }, { name: 'Valid', x: 0, y: 0 }],
    };
    const result = sanitizeAndLoad(input, defaultState);
    expect(result.oshis).toHaveLength(1);
    expect(result.oshis[0].name).toBe('Valid');
  });

  // P0: NaN座標 → 0にフォールバック
  it('falls back NaN coordinates to 0', () => {
    const input = { oshis: [{ name: 'A', x: 'abc', y: 'xyz' }] };
    const result = sanitizeAndLoad(input, defaultState);
    expect(result.oshis[0].x).toBe(0);
    expect(result.oshis[0].y).toBe(0);
  });

  // P0: Infinity座標 → clamp
  it('clamps Infinity coordinates', () => {
    const input = { oshis: [{ name: 'A', x: Infinity, y: -Infinity }] };
    const result = sanitizeAndLoad(input, defaultState);
    expect(result.oshis[0].x).toBe(0);
    expect(result.oshis[0].y).toBe(0);
  });

  // P0: 不正なvisibility → 'public'
  it('falls back invalid visibility to public', () => {
    const input = { axis: { visibility: 'private' } };
    const result = sanitizeAndLoad(input, defaultState);
    expect(result.axis.visibility).toBe('public');
  });

  // P0: tags に非配列 → 空配列
  it('converts non-array tags to empty array', () => {
    const input = { oshis: [{ name: 'A', x: 0, y: 0, tags: 'hello' }] };
    const result = sanitizeAndLoad(input, defaultState);
    expect(result.oshis[0].tags).toEqual([]);
  });

  // P0: 有効なbase64 imageData保持
  it('preserves valid base64 imageData', () => {
    const img = 'data:image/png;base64,iVBORw0KGgo=';
    const input = { oshis: [{ name: 'A', x: 0, y: 0, imageData: img }] };
    const result = sanitizeAndLoad(input, defaultState);
    expect(result.oshis[0].imageData).toBe(img);
  });

  // P1: イミュータビリティ
  it('does not mutate the original state', () => {
    const state = { axis: { title: 'Orig', xMin: '左', xMax: '右', yMin: '下', yMax: '上', visibility: 'public' }, oshis: [{ name: 'X', x: 0, y: 0 }] };
    const stateCopy = JSON.parse(JSON.stringify(state));
    sanitizeAndLoad({ axis: { title: 'New' }, oshis: [] }, state);
    expect(state).toEqual(stateCopy);
  });

  // P1: 非オブジェクト要素フィルタ
  it('filters non-object elements in oshis array', () => {
    const input = { oshis: [null, 42, 'str', { name: 'Valid', x: 0, y: 0 }] };
    const result = sanitizeAndLoad(input, defaultState);
    expect(result.oshis).toHaveLength(1);
    expect(result.oshis[0].name).toBe('Valid');
  });

  // P1: axisだけ/oshisだけ
  it('handles axis-only or oshis-only input', () => {
    const axisOnly = sanitizeAndLoad({ axis: { title: 'T' } }, defaultState);
    expect(axisOnly.axis.title).toBe('T');
    expect(axisOnly.oshis).toEqual([]);

    const oshisOnly = sanitizeAndLoad({ oshis: [{ name: 'A', x: 1, y: 2 }] }, defaultState);
    expect(oshisOnly.axis).toEqual(defaultState.axis);
    expect(oshisOnly.oshis).toHaveLength(1);
  });

  // P2: 大量oshi
  it('handles 100 oshis without error', () => {
    const oshis = Array.from({ length: 100 }, (_, i) => ({ name: `Oshi${i}`, x: i - 50, y: 50 - i }));
    const result = sanitizeAndLoad({ oshis }, defaultState);
    expect(result.oshis).toHaveLength(100);
  });

  // P2: tags内の空文字フィルタ
  it('filters empty strings in tags', () => {
    const input = { oshis: [{ name: 'A', x: 0, y: 0, tags: ['good', '', 'nice', ''] }] };
    const result = sanitizeAndLoad(input, defaultState);
    expect(result.oshis[0].tags).toEqual(['good', 'nice']);
  });

  // P2: undefinedフィールド → デフォルト値
  it('uses defaults for undefined fields', () => {
    const input = { oshis: [{ name: 'A' }] };
    const result = sanitizeAndLoad(input, defaultState);
    expect(result.oshis[0].x).toBe(0);
    expect(result.oshis[0].y).toBe(0);
    expect(result.oshis[0].tags).toEqual([]);
    expect(result.oshis[0].imageData).toBe('');
  });
});

/* ----------------------------------------------------------
   Boundary tests for existing functions
   ---------------------------------------------------------- */
describe('toSvgX / fromSvgX boundary values', () => {
  it('toSvgX(NaN) → NaN', () => { expect(toSvgX(NaN)).toBeNaN(); });
  it('toSvgX(Infinity) → Infinity', () => { expect(toSvgX(Infinity)).toBe(Infinity); });
  it('fromSvgX(NaN) → NaN', () => { expect(fromSvgX(NaN)).toBeNaN(); });
});

describe('IMAGE_DATA_RE', () => {
  it('matches jpeg', () => { expect(IMAGE_DATA_RE.test('data:image/jpeg;base64,/9j/4AAQ...')).toBe(true); });
  it('rejects gif', () => { expect(IMAGE_DATA_RE.test('data:image/gif;base64,...')).toBe(false); });
  it('matches png with empty base64', () => { expect(IMAGE_DATA_RE.test('data:image/png;base64,')).toBe(true); });
  it('rejects non-data-url', () => { expect(IMAGE_DATA_RE.test('not-a-data-url')).toBe(false); });
  it('rejects empty string', () => { expect(IMAGE_DATA_RE.test('')).toBe(false); });
});

/* ----------------------------------------------------------
   parseTags
   ---------------------------------------------------------- */
describe('parseTags', () => {
  it('parses comma-separated tags with trim', () => {
    expect(parseTags('沼, てぇてぇ, ')).toEqual(['沼', 'てぇてぇ']);
  });
  it('returns empty array for empty string', () => { expect(parseTags('')).toEqual([]); });
  it('returns empty array for only commas', () => { expect(parseTags(',,,')).toEqual([]); });
  it('handles single tag', () => { expect(parseTags('推し')).toEqual(['推し']); });
});

/* ----------------------------------------------------------
   validateOshiInput
   ---------------------------------------------------------- */
describe('validateOshiInput', () => {
  it('rejects empty name', () => {
    expect(validateOshiInput('', 0, 0)).toEqual({ valid: false, error: '名前入れて〜' });
  });
  it('rejects NaN x', () => {
    expect(validateOshiInput('A', NaN, 0)).toEqual({ valid: false, error: '座標は数値で入れてね' });
  });
  it('rejects NaN y', () => {
    expect(validateOshiInput('A', 0, NaN)).toEqual({ valid: false, error: '座標は数値で入れてね' });
  });
  it('clamps out-of-range x', () => {
    expect(validateOshiInput('A', 150, 0)).toEqual({ valid: true, x: 100, y: 0, clamped: true });
  });
  it('returns exact values in range', () => {
    expect(validateOshiInput('A', 50, -30)).toEqual({ valid: true, x: 50, y: -30, clamped: false });
  });
  it('clamps negative out-of-range', () => {
    expect(validateOshiInput('A', -200, -200)).toEqual({ valid: true, x: -100, y: -100, clamped: true });
  });
  it('rejects whitespace-only name', () => {
    expect(validateOshiInput('   ', 0, 0)).toEqual({ valid: false, error: '名前入れて〜' });
  });
});

/* ----------------------------------------------------------
   buildSharePayload
   ---------------------------------------------------------- */
describe('buildSharePayload', () => {
  it('excludes imageData from oshis', () => {
    const result = buildSharePayload({
      axis: { title: 'T', xMin: 'L', xMax: 'R', yMin: 'D', yMax: 'U', visibility: 'public' },
      oshis: [{ name: 'A', x: 10, y: 20, tags: ['t'], imageData: 'data:image/png;base64,...' }],
    });
    expect(result.oshis[0]).toEqual({ name: 'A', x: 10, y: 20, tags: ['t'] });
    expect(result.oshis[0]).not.toHaveProperty('imageData');
  });
  it('copies axis', () => {
    const state = { axis: { title: 'X' }, oshis: [] };
    expect(buildSharePayload(state).axis.title).toBe('X');
  });
  it('handles empty oshis', () => {
    expect(buildSharePayload({ axis: {}, oshis: [] }).oshis).toEqual([]);
  });
  it('does not mutate original', () => {
    const state = { axis: { title: 'T' }, oshis: [{ name: 'A', x: 0, y: 0, tags: [], imageData: 'x' }] };
    buildSharePayload(state);
    expect(state.oshis[0].imageData).toBe('x');
  });
});

/* ----------------------------------------------------------
   validateVisibility
   ---------------------------------------------------------- */
describe('validateVisibility', () => {
  it('accepts public', () => { expect(validateVisibility('public')).toBe('public'); });
  it('accepts url', () => { expect(validateVisibility('url')).toBe('url'); });
  it('rejects invalid', () => { expect(validateVisibility('invalid')).toBe('public'); });
  it('rejects undefined', () => { expect(validateVisibility(undefined)).toBe('public'); });
  it('rejects null', () => { expect(validateVisibility(null)).toBe('public'); });
});
