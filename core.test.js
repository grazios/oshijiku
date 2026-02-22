import { describe, it, expect } from 'vitest';
import { clamp, toSvgX, toSvgY, fromSvgX, fromSvgY, sanitizeAndLoad } from './core.js';

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
});
