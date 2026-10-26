import { createRng, GameError } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import {
  aimSquares,
  cellName,
  dealFleet,
  fleetError,
  shipOf,
  span,
  type Dir,
  type Placement,
  type ShipId,
} from './fleet';
import {
  battleship as game,
  unhitCells,
  type BattleshipAction,
  type BattleshipOptions,
  type BattleshipState,
} from './rules';

const WREN: Placement[] = [
  { id: 'carrier', dir: 'h', at: 0 },
  { id: 'battleship', dir: 'h', at: 10 },
  { id: 'cruiser', dir: 'v', at: 7 },
  { id: 'submarine', dir: 'h', at: 33 },
  { id: 'destroyer', dir: 'h', at: 98 },
];

const ROOK: Placement[] = [
  { id: 'carrier', dir: 'v', at: 9 },
  { id: 'battleship', dir: 'h', at: 20 },
  { id: 'cruiser', dir: 'h', at: 50 },
  { id: 'submarine', dir: 'v', at: 44 },
  { id: 'destroyer', dir: 'h', at: 77 },
];

const FLEET: Record<string, Placement[]> = { wren: WREN, rook: ROOK };

const squares = (ship: Placement) => span(ship.at, ship.dir, shipOf(ship.id).len)!;

function setup(seed = 1, options: Partial<BattleshipOptions> = {}, now = 1_000) {
  return game.setup({
    playerIds: ['wren', 'rook'],
    options: { ...game.defaultOptions(2), ...options },
    rng: createRng(seed),
    now,
  });
}

function act(s: BattleshipState, id: string, action: BattleshipAction, seed = 1, now = 5_000) {
  return game.applyAction(s, id, action, createRng(seed), now);
}

function placed(seed = 1, options: Partial<BattleshipOptions> = {}) {
  let s = setup(seed, options);
  s = act(s, 'wren', { type: 'place', ships: WREN }, seed);
  s = act(s, 'rook', { type: 'place', ships: ROOK }, seed + 1);
  return s;
}

function other(s: BattleshipState, id: string) {
  return s.players.find((p) => p !== id)!;
}

function waterOn(id: string, avoid: number[] = []): number[] {
  const taken = new Set(FLEET[id]!.flatMap(squares));
  return Array.from({ length: 100 }, (_, cell) => cell).filter(
    (cell) => !taken.has(cell) && !avoid.includes(cell),
  );
}

function relocate(
  s: BattleshipState,
  id: string,
  ship: ShipId,
  at: number,
  dir: Dir,
): BattleshipState {
  return {
    ...s,
    fleets: {
      ...s.fleets,
      [id]: {
        ...s.fleets[id]!,
        ships: s.fleets[id]!.ships.map((row) =>
          row.id === ship ? { id: ship, dir, cells: span(at, dir, shipOf(ship).len)! } : row,
        ),
      },
    },
  };
}

/** Every unhit ship square is blank on the table and on the other player's chart. */
function expectNoLeak(s: BattleshipState) {
  const table = game.getTableView(s);
  expect(JSON.stringify(table)).not.toMatch(/"ships"|"fleets"|"secret"/);
  for (const id of s.players) {
    const hidden = unhitCells(s, id);
    const foe = other(s, id);
    const opp = game.getPlayerView(s, foe);
    expect(JSON.stringify(opp)).not.toContain('secret');
    for (const cell of hidden) {
      expect(table.boards[id]!.cells[cell], `${id} ${cellName(cell)}`).toBe('blank');
      expect(opp.boards[id]!.cells[cell]).toBe('blank');
      expect(table.boards[id]!.wrecks.some((w) => w.cells.includes(cell))).toBe(false);
      // Cell numbers are per chart, so the opponent's own ships may reuse an index.
      // What they must not have is this square marked on the chart they are firing at.
      expect(opp.boards[id]!.wrecks.some((w) => w.cells.includes(cell))).toBe(false);
    }
    const mine = game.getPlayerView(s, id);
    for (const cell of hidden) {
      expect(mine.ships.some((ship) => ship.cells.includes(cell))).toBe(true);
    }
  }
}

describe('placing', () => {
  it('accepts ships that touch, and refuses overlap and a ship off the chart', () => {
    expect(fleetError(WREN)).toBeNull();
    expect(fleetError(ROOK)).toBeNull();
    // Carrier on row 1 and battleship on row 2 share an edge. That is allowed.
    expect(squares(WREN[1]!).some((cell) => squares(WREN[0]!).includes(cell - 10))).toBe(true);
    expect(
      fleetError(WREN.map((ship) => (ship.id === 'battleship' ? { ...ship, at: 0 } : ship))),
    ).toMatch(/share a square/);
    expect(
      fleetError(WREN.map((ship) => (ship.id === 'carrier' ? { ...ship, at: 7 } : ship))),
    ).toMatch(/hangs off/);
  });

  it('waits until both fleets are locked, then draws who fires first', () => {
    let s = setup();
    expect(game.waitingOn!(s).sort()).toEqual(['rook', 'wren']);
    s = act(s, 'wren', { type: 'place', ships: WREN });
    expect(s.phase).toBe('place');
    expect(game.waitingOn!(s)).toEqual(['rook']);
    expect(game.getTableView(s).boards.wren!.ready).toBe(true);
    expect(game.getPlayerView(s, 'rook').ships).toEqual([]);
    const before = s;
    s = act(s, 'rook', { type: 'place', ships: ROOK }, 4);
    expect(s.phase).toBe('fire');
    expect(s.toAct).toBe(s.first);
    expect(game.waitingOn!(s)).toEqual([s.toAct]);
    expect(game.nextTimer!(s)).toBeNull();
    expect(game.announce!(before, s)[0]).toMatch(/fires first/);
  });

  it('refuses a second placement, an early shot, and a table of the wrong size', () => {
    let s = setup();
    s = act(s, 'wren', { type: 'place', ships: WREN });
    expect(() => act(s, 'wren', { type: 'place', ships: WREN })).toThrow(GameError);
    expect(() => act(s, 'wren', { type: 'fire', cells: [0] })).toThrow(GameError);
    expect(game.validateOptions!(game.defaultOptions(2), 3)).toMatch(/two players/);
    expect(game.validateOptions!(game.defaultOptions(2), 2)).toBeNull();
  });
});

describe('firing', () => {
  it('keeps the turn after a hit, and keeps the rest of that ship hidden', () => {
    let s = placed(2);
    const attacker = s.toAct!;
    const defender = other(s, attacker);
    const destroyer = squares(FLEET[defender]!.find((ship) => ship.id === 'destroyer')!);
    const before = s;
    s = act(s, attacker, { type: 'fire', cells: [destroyer[0]!] }, 1, 8_000);
    expect(s.toAct).toBe(attacker);
    expect(s.volleys[0]!.shots[0]).toEqual({ cell: destroyer[0], result: 'hit' });
    expect(s.wrecks[defender]).toEqual([]);
    expect(game.getTableView(s).boards[defender]!.cells[destroyer[0]!]).toBe('hit');
    expect(game.getTableView(s).boards[defender]!.cells[destroyer[1]!]).toBe('blank');
    expect(game.announce!(before, s).join(' ')).not.toMatch(/destroyer/i);
    expect(s.recap.at(-1)?.secret).toMatch(/destroyer/);
    expectNoLeak(s);

    const missAt = waterOn(defender)[0]!;
    s = act(s, attacker, { type: 'fire', cells: [missAt] }, 1, 9_000);
    expect(s.volleys[1]!.shots[0]).toEqual({ cell: missAt, result: 'miss' });
    expect(s.toAct).toBe(defender);
  });

  it('reveals a ship on the shot that sinks it, and the turn continues', () => {
    let s = placed(3);
    const attacker = s.toAct!;
    const defender = other(s, attacker);
    const destroyer = squares(FLEET[defender]!.find((ship) => ship.id === 'destroyer')!);
    s = act(s, attacker, { type: 'fire', cells: [destroyer[0]!] });
    expect(s.toAct).toBe(attacker);
    const before = s;
    s = act(s, attacker, { type: 'fire', cells: [destroyer[1]!] });
    const wreck = s.wrecks[defender]!.find((row) => row.id === 'destroyer');
    expect(wreck?.cells.slice().sort((a, b) => a - b)).toEqual(
      [...destroyer].sort((a, b) => a - b),
    );
    expect(s.volleys.at(-1)!.shots[0]).toMatchObject({ result: 'sunk', ship: 'destroyer' });
    expect(game.getTableView(s).boards[defender]!.cells[destroyer[0]!]).toBe('sunk');
    expect(s.toAct).toBe(attacker);
    expect(s.phase).toBe('fire');
    expect(game.announce!(before, s).join(' ')).toMatch(/destroyer/);
    expectNoLeak(s);
  });

  it('ends on the shot that sinks the last ship, without another shot', () => {
    let s = placed(5);
    const attacker = s.toAct!;
    const defender = other(s, attacker);
    const cells = FLEET[defender]!.flatMap(squares);
    for (let i = 0; i < cells.length - 1; i++) {
      s = act(s, attacker, { type: 'fire', cells: [cells[i]!] }, i, 10_000 + i);
      expect(s.phase).toBe('fire');
      expect(s.toAct).toBe(attacker);
    }
    expectNoLeak(s);
    s = act(s, attacker, { type: 'fire', cells: [cells.at(-1)!] }, 80, 40_000);
    expect(s.phase).toBe('show');
    expect(s.toAct).toBeNull();
    expect(s.winner).toBe(attacker);
    expect(game.waitingOn!(s)).toEqual([]);
    expectNoLeak(s);
  });

  it('refuses a square that was already fired at, and a shot out of turn', () => {
    const s = placed(6);
    const shooter = s.toAct!;
    const n = act(s, shooter, { type: 'fire', cells: [waterOn(other(s, shooter))[0]!] });
    expect(() => act(n, shooter, { type: 'fire', cells: [1] })).toThrow(GameError);
    expect(() => act(n, other(s, shooter), { type: 'fire', cells: [0, 0] })).toThrow(GameError);
  });

  it('ends after the last ship, and waits a beat before the result', () => {
    let s = placed(5);
    let guard = 0;
    while (s.phase === 'fire' && guard++ < 100) {
      const shooter = s.toAct!;
      const defender = other(s, shooter);
      const left = FLEET[defender]!.flatMap(squares).filter(
        (cell) => !(s.shots[defender] ?? []).some((shot) => shot.cell === cell),
      );
      s = act(s, shooter, { type: 'fire', cells: [left[0]!] }, guard, 20_000 + guard);
      if (s.phase === 'fire') {
        const back = s.toAct!;
        const backDef = other(s, back);
        const spare = waterOn(backDef).find(
          (cell) => !(s.shots[backDef] ?? []).some((shot) => shot.cell === cell),
        )!;
        s = act(s, back, { type: 'fire', cells: [spare] }, guard, 30_000 + guard);
      }
    }
    expect(s.phase).toBe('show');
    expect(s.winner).toBeTruthy();
    expect(game.getResult(s)).toBeNull();
    expect(game.waitingOn!(s)).toEqual([]);
    expect(game.nextTimer!(s)?.id).toBe('show');
    expectNoLeak(s);
    const over = game.onTimer!(s, 'show', createRng(1), s.showBy!);
    const result = game.getResult(over);
    expect(result?.winners).toEqual([s.winner]);
    expect(result?.summary).toMatch(/sunk in \d+ shots/);
    expect(result?.highlights?.[0]?.award).toBe('Sharpest eye');
    expect(result?.highlights?.[0]?.playerIds).toEqual([s.winner]);
    expect(result?.standings?.find((row) => row.playerId === s.winner)?.outcome).toBe('win');
  });
});

describe('salvo', () => {
  it('is five shots while the fleet is whole, and one fewer after you lose a ship', () => {
    let s = placed(7, { firing: 'Salvo' });
    const first = s.toAct!;
    const second = other(s, first);
    expect(game.getTableView(s).salvo).toBe(5);
    expect(() => act(s, first, { type: 'fire', cells: [0] })).toThrow(/5 squares/);

    const destroyer = squares(FLEET[first]!.find((ship) => ship.id === 'destroyer')!);
    const opening = waterOn(second).slice(0, 5);
    s = act(s, first, { type: 'fire', cells: opening });
    expect(s.volleys[0]!.shots).toHaveLength(5);
    expect(s.toAct).toBe(second);

    const pads = waterOn(first).filter((cell) => !destroyer.includes(cell));
    s = act(s, second, { type: 'fire', cells: [...destroyer, ...pads.slice(0, 3)] });
    expect(s.wrecks[first]!.map((w) => w.id)).toContain('destroyer');
    // First still has four ships, so the next salvo is four. Second has not lost one.
    expect(s.toAct).toBe(first);
    expect(game.getTableView(s).salvo).toBe(4);
    expectNoLeak(s);
  });

  it('passes the turn after a salvo even when every shot hits', () => {
    let s = placed(8, { firing: 'Salvo' });
    const first = s.toAct!;
    const second = other(s, first);
    const ships = FLEET[second]!;
    const destroyer = squares(ships.find((ship) => ship.id === 'destroyer')!);
    const extra = squares(ships.find((ship) => ship.id === 'carrier')!).slice(0, 3);
    s = act(s, first, { type: 'fire', cells: [...destroyer, ...extra] });
    expect(s.volleys[0]!.shots.every((shot) => shot.result !== 'miss')).toBe(true);
    expect(s.wrecks[second]!.map((w) => w.id)).toEqual(['destroyer']);
    expect(s.phase).toBe('fire');
    expect(s.toAct).toBe(second);
    expectNoLeak(s);
  });
});

describe('turn timer', () => {
  it('places for anyone who runs out, then fires for them', () => {
    const s = setup(1, { turnTimer: '30 seconds' }, 1_000);
    expect(game.nextTimer!(s)).toEqual({ id: 'place', at: 31_000 });
    const begun = game.onTimer!(s, 'place', createRng(9), 31_000);
    expect(begun.phase).toBe('fire');
    for (const id of begun.players) {
      const ships = begun.fleets[id]!.ships;
      expect(
        fleetError(ships.map((ship) => ({ id: ship.id, dir: ship.dir, at: ship.cells[0]! }))),
      ).toBeNull();
    }
    expectNoLeak(begun);
    const due = begun.actBy!;
    const fired = game.onTimer!(begun, 'fire', createRng(3), due);
    expect(fired.volleys[0]!.late).toBe(true);
    expect(fired.volleys[0]!.shots).toHaveLength(1);
    const shot = fired.volleys[0]!.shots[0]!;
    if (fired.phase === 'show') {
      expect(fired.toAct).toBeNull();
      expect(fired.actBy).toBeNull();
    } else if (shot.result === 'miss') {
      expect(fired.toAct).not.toBe(begun.toAct);
      expect(fired.actBy).toBe(due + 30_000);
    } else {
      expect(fired.toAct).toBe(begun.toAct);
      expect(fired.actBy).toBe(due + 30_000);
    }
  });

  it('fires a whole salvo when salvo time runs out', () => {
    let s = setup(2, { firing: 'Salvo', turnTimer: '60 seconds' }, 1_000);
    s = act(s, 'wren', { type: 'place', ships: WREN });
    s = act(s, 'rook', { type: 'place', ships: ROOK }, 2, 2_000);
    const fired = game.onTimer!(s, 'fire', createRng(4), s.actBy!);
    expect(fired.volleys[0]!.shots).toHaveLength(5);
    expect(fired.volleys[0]!.late).toBe(true);
  });
});

describe('hidden information', () => {
  it('moving an unhit ship does not change the table or the other player', () => {
    let s = placed(11);
    const attacker = s.toAct!;
    const defender = other(s, attacker);
    const carrier = squares(FLEET[defender]!.find((ship) => ship.id === 'carrier')!);
    s = act(s, attacker, { type: 'fire', cells: [carrier[0]!] });
    expectNoLeak(s);

    const taken = new Set(FLEET[defender]!.flatMap(squares));
    const landing = [60, 61, 62, 63, 64, 65, 66, 80, 88, 0, 20, 40].find((at) => {
      const next = span(at, 'h', 2);
      return next && next.every((cell) => !taken.has(cell));
    })!;
    const moved = relocate(s, defender, 'destroyer', landing, 'h');
    expect(moved.fleets[defender]!.ships).not.toEqual(s.fleets[defender]!.ships);
    expect(game.getTableView(moved)).toEqual(game.getTableView(s));
    expect(game.getPlayerView(moved, attacker)).toEqual(game.getPlayerView(s, attacker));
    expect(game.getPlayerView(moved, defender).ships).not.toEqual(
      game.getPlayerView(s, defender).ships,
    );

    // And the square that was never fired at is not a number hiding in a wreck list.
    const hidden = carrier.slice(1);
    const pub = JSON.stringify({
      table: game.getTableView(s).boards[defender],
      foe: game.getPlayerView(s, attacker).boards[defender],
    });
    for (const cell of hidden) expect(pub).not.toContain(`[${cell}]`);
  });

  it('stays sealed across random games, including after ships move in secret', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const rng = createRng(seed * 17);
      let s = setup(seed, seed % 2 ? { firing: 'Salvo' } : {});
      s = act(s, 'wren', { type: 'place', ships: dealFleet(rng) }, seed);
      s = act(s, 'rook', { type: 'place', ships: dealFleet(rng) }, seed + 3);
      expectNoLeak(s);
      let guard = 0;
      while (s.phase === 'fire' && guard++ < 40) {
        const shooter = s.toAct!;
        const defender = other(s, shooter);
        const open: number[] = [];
        for (let cell = 0; cell < 100; cell++) {
          if (!(s.shots[defender] ?? []).some((shot) => shot.cell === cell)) open.push(cell);
        }
        const need = game.getTableView(s).salvo;
        const cells = rng.shuffle(open).slice(0, need);
        s = act(s, shooter, { type: 'fire', cells }, seed + guard, 10_000 + guard);
        expectNoLeak(s);
        const hiddenShip = s.fleets[defender]!.ships.find(
          (ship) =>
            !s.wrecks[defender]!.some((w) => w.id === ship.id) &&
            ship.cells.some((cell) => {
              return !(s.shots[defender] ?? []).some((shot) => shot.cell === cell);
            }),
        );
        if (!hiddenShip) continue;
        const moved = relocate(s, defender, hiddenShip.id, hiddenShip.cells[0]!, hiddenShip.dir);
        // Same squares: the views are equal even when the object is copied.
        expect(game.getTableView(moved)).toEqual(game.getTableView(s));
        expect(game.getPlayerView(moved, shooter).boards[defender]).toEqual(
          game.getPlayerView(s, shooter).boards[defender],
        );
      }
    }
  });
});

describe('ended early', () => {
  it('saves nothing before a shot, then the player who is ahead', () => {
    expect(game.partialResult!(placed(1))).toBeNull();
    let s = placed(13);
    const attacker = s.toAct!;
    const defender = other(s, attacker);
    const bow = squares(FLEET[defender]![0]!)[0]!;
    s = act(s, attacker, { type: 'fire', cells: [bow] });
    const part = game.partialResult!(s);
    expect(part?.winners).toEqual([attacker]);
    expect(part?.summary).toMatch(/hit/);
    expect(part?.highlights).toBeUndefined();
  });
});

describe('the chart', () => {
  it('names the squares from A1 across and down', () => {
    expect(cellName(0)).toBe('A1');
    expect(cellName(23)).toBe('D3');
    expect(cellName(99)).toBe('J10');
  });

  it('previews a ship on the squares under the bow, and marks a hang or an overlap', () => {
    const open = new Set<number>();
    expect(aimSquares(0, 'h', 5, open)).toEqual({ cells: [0, 1, 2, 3, 4], illegal: false });
    expect(aimSquares(6, 'h', 5, open)).toEqual({ cells: [6, 7, 8, 9], illegal: true });
    expect(aimSquares(90, 'v', 3, open)?.illegal).toBe(true);
    const taken = new Set([12]);
    const over = aimSquares(10, 'h', 4, taken);
    expect(over?.cells).toEqual([10, 11, 12, 13]);
    expect(over?.illegal).toBe(true);
    expect(aimSquares(-1, 'h', 2, open)).toBeNull();
  });
});
