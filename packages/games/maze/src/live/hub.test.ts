import { describe, expect, it } from 'vitest';
import { LiveHub, REPORT_EVERY_MS } from './hub';
import type { LiveSetup } from './pass';

const setup: LiveSetup = {
  round: 1,
  seed: 9,
  layouts: [0],
  powers: ['hunt'],
  mixed: false,
  startAt: 10_000,
  endAt: 40_000,
  seats: [
    { id: 'wren', name: 'Wren' },
    { id: 'rook', name: 'Rook' },
    { id: 'heron', name: 'Bot Heron', bot: true },
  ],
};

function phone() {
  const got: { t: string; [k: string]: unknown }[] = [];
  const closed: string[] = [];
  return {
    got,
    closed,
    send: (f: string) => got.push(JSON.parse(f) as { t: string }),
    close: (_c: number, why: string) => closed.push(why),
  };
}

describe('LiveHub', () => {
  it('greets each phone with its seat and the board, and the TV as a watcher', () => {
    const hub = new LiveHub(setup);
    const w = phone();
    const tv = phone();
    hub.connect('wren', w.send, w.close, 10_500);
    hub.connect('tv', tv.send, tv.close, 10_500);
    expect(w.got[0]).toMatchObject({ t: 'hello', id: 'p1', taken: [], maze: 0 });
    expect(tv.got[0]).toMatchObject({ t: 'hello', id: null });
  });

  it('refuses someone not seated', () => {
    const hub = new LiveHub(setup);
    const x = phone();
    expect(hub.connect('crow', x.send, x.close, 10_500)).toBeNull();
    expect(x.closed).toEqual(['Not in this round']);
  });

  it('a second connection for a seat takes over', () => {
    const hub = new LiveHub(setup);
    const a = phone();
    const b = phone();
    hub.connect('wren', a.send, a.close, 10_500);
    hub.connect('wren', b.send, b.close, 10_600);
    expect(a.closed).toEqual(['Playing on another device']);
    hub.tick(11_000);
    expect(a.got.filter((f) => f.t === 'snap')).toHaveLength(0);
    expect(b.got.some((f) => f.t === 'snap')).toBe(true);
  });

  it('applies turns and broadcasts one snapshot to everyone', () => {
    const hub = new LiveHub(setup);
    const w = phone();
    const r = phone();
    const cw = hub.connect('wren', w.send, w.close, 10_000)!;
    hub.connect('rook', r.send, r.close, 10_000);
    hub.message(cw, JSON.stringify({ t: 'turn', n: 1, d: 'left', at: [1, 1] }));
    hub.tick(10_500);
    const sw = w.got.filter((f) => f.t === 'snap');
    const sr = r.got.filter((f) => f.t === 'snap');
    expect(sw).toHaveLength(1);
    expect(sr).toHaveLength(1);
    expect((sw[0]!.s as { acks: Record<string, number> }).acks.p1).toBe(1);
    // The bot plays too.
    expect((sw[0]!.s as { chompers: { bot?: boolean }[] }).chompers[2]!.bot).toBe(true);
  });

  it('reports every few seconds with lobby ids, and once more at the end', () => {
    const hub = new LiveHub(setup);
    const w = phone();
    hub.connect('wren', w.send, w.close, 10_000);
    expect(hub.tick(10_100)).toBeNull();
    const first = hub.tick(10_000 + REPORT_EVERY_MS)!;
    expect(first.final).toBe(false);
    expect(Object.keys(first.players).sort()).toEqual(['heron', 'rook', 'wren']);
    let last = null;
    for (let t = 10_000 + REPORT_EVERY_MS; t <= 41_000; t += 50) last = hub.tick(t) ?? last;
    expect(last!.final).toBe(true);
    expect(hub.isOver()).toBe(true);
  });

  it('stops once the lobby says the session is over', () => {
    const hub = new LiveHub(setup);
    expect(hub.stopped()).toBe(false);
    hub.reported(409);
    expect(hub.stopped()).toBe(true);
    expect(hub.tick(20_000)).toBeNull();
  });

  it('says which round it serves, so the room can start a new hub for the next one', () => {
    expect(new LiveHub(setup).roundNo).toBe(setup.round);
    expect(new LiveHub({ ...setup, round: 4 }).roundNo).toBe(4);
  });
});
