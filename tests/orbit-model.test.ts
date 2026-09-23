import { describe, expect, it } from 'vitest';
import type { PublicMarket } from '../packages/shared/public.js';
import { observedTen } from '../apps/web/orbit-model.js';

const asset = (mint: string, rank: number | null, selected = false) => ({ mint, rank, selected, symbol: 'DUPLICATE', eligibility: 'unknown' } as PublicMarket);
describe('Homepage market observations', () => {
  it('keeps ten unique mint identities in source-rank order without changing the source', () => {
    const input = Array.from({ length: 12 }, (_, i) => asset(`mint-${i}`, i + 1)).reverse();
    input.push(asset('mint-0', 1), asset('unranked', null), asset('invalid', -1));
    const before = structuredClone(input);
    const result = observedTen(input);
    expect(result.map(item => item.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(new Set(result.map(item => item.mint)).size).toBe(10);
    expect(input).toEqual(before);
  });
  it('never turns a market observation into an eligible or selected asset', () => {
    const result = observedTen([asset('one', 1), asset('two', 2)]);
    expect(result.every(item => !item.selected && item.eligibility === 'unknown')).toBe(true);
    expect(result).toHaveLength(2);
    expect(observedTen([])).toEqual([]);
  });
  it('replaces the displayed leaders when the next observation changes rank', () => {
    const first = Array.from({ length: 11 }, (_, i) => asset(`mint-${i}`, i + 1));
    const next = first.map(item => ({ ...item, rank: item.mint === 'mint-10' ? 1 : item.rank! + 1 }));
    expect(observedTen(first).map(item => item.mint)).not.toContain('mint-10');
    expect(observedTen(next)[0].mint).toBe('mint-10');
    expect(observedTen(next).map(item => item.mint)).not.toContain('mint-9');
  });
});
