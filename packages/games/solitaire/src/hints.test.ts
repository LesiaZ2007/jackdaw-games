import { describe, expect, it } from 'vitest';
import { hintFor, moveFor } from './hints';
import type { SeatView, SolitaireTableView } from './rules';

const seatOf = (over: Partial<SeatView>): SeatView => ({
  stock: 5,
  waste: [],
  wasteCount: 0,
  cols: [],
  left: 40,
  played: 0,
  stuck: false,
  ...over,
});

const tableOf = (foundations: SolitaireTableView['foundations'] = []) =>
  ({ foundations }) as SolitaireTableView;

describe('moveFor', () => {
  it('sends a card up when it can go to the middle', () => {
    const seat = seatOf({ cols: [{ down: 0, up: ['2s'] }] });
    const fs = [{ suit: 's' as const, top: 'As', count: 1, by: 'Wren' }];
    expect(moveFor(seat, fs, 0, '2s')).toEqual({ type: 'up', from: 0, card: '2s' });
  });

  it('puts a card on the column it fits', () => {
    const seat = seatOf({
      cols: [
        { down: 0, up: ['8h'] },
        { down: 0, up: [] },
        { down: 1, up: ['9s'] },
      ],
    });
    expect(moveFor(seat, [], 0, '8h')).toEqual({ type: 'move', from: 0, card: '8h', to: 2 });
  });

  it('does not move a king that already heads its own column', () => {
    const seat = seatOf({
      cols: [
        { down: 0, up: ['Kd'] },
        { down: 0, up: [] },
      ],
    });
    expect(moveFor(seat, [], 0, 'Kd')).toBeNull();
  });

  it('moves a waste king to an empty column', () => {
    const seat = seatOf({ waste: ['Kd'], cols: [{ down: 0, up: [] }] });
    expect(moveFor(seat, [], 'waste', 'Kd')).toEqual({
      type: 'move',
      from: 'waste',
      card: 'Kd',
      to: 0,
    });
  });
});

describe('hintFor', () => {
  it('points at a card going up first', () => {
    const seat = seatOf({
      waste: ['8h'],
      cols: [
        { down: 0, up: ['9s'] },
        { down: 0, up: ['As'] },
      ],
    });
    expect(hintFor(seat, tableOf())).toEqual({ type: 'up', from: 1, card: 'As' });
  });

  it('suggests turning the stock when nothing else moves', () => {
    expect(hintFor(seatOf({ cols: [{ down: 0, up: ['9s'] }] }), tableOf())).toBe('stock');
  });

  it('says nothing when the player is stuck', () => {
    expect(hintFor(seatOf({ stuck: true, cols: [{ down: 0, up: ['9s'] }] }), tableOf())).toBeNull();
  });
});
