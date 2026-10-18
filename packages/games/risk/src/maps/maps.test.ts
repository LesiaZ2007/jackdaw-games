import { describe, expect, it } from 'vitest';
import { MAPS } from './index';
import { REALM_LAND } from './realm.shapes';
import { WORLD_LAND } from './world.shapes';

const LAND = { world: WORLD_LAND, realm: REALM_LAND };

describe.each(Object.values(MAPS))('the $name map', (map) => {
  const ids = new Set(map.territories.map((t) => t.id));
  const byId = new Map(map.territories.map((t) => [t.id, t]));

  it('has 42 territories in 6 continents', () => {
    expect(map.territories).toHaveLength(42);
    expect(ids.size).toBe(42);
    expect(map.continents).toHaveLength(6);
  });

  it('adjacency is symmetric and names real territories', () => {
    for (const t of map.territories) {
      expect(t.adj.length, t.id).toBeGreaterThan(0);
      for (const n of t.adj) {
        expect(ids.has(n), `${t.id} → ${n}`).toBe(true);
        expect(byId.get(n)!.adj, `${n} ↛ ${t.id}`).toContain(t.id);
      }
    }
  });

  it('the graph is connected', () => {
    const seen = new Set([map.territories[0]!.id]);
    const queue = [map.territories[0]!.id];
    while (queue.length) {
      for (const n of byId.get(queue.shift()!)!.adj) {
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    expect(seen.size).toBe(42);
  });

  it('every territory belongs to a known continent; bonuses are positive', () => {
    const cs = new Set(map.continents.map((c) => c.id));
    for (const t of map.territories) expect(cs.has(t.continent), t.id).toBe(true);
    for (const c of map.continents) {
      expect(c.bonus).toBeGreaterThan(0);
      expect(map.territories.some((t) => t.continent === c.id)).toBe(true);
    }
  });

  it('mission pairs name real continents', () => {
    const cs = new Set(map.continents.map((c) => c.id));
    expect(map.missionPairs).toHaveLength(6);
    for (const [a, b] of map.missionPairs) {
      expect(cs.has(a), a).toBe(true);
      expect(cs.has(b), b).toBe(true);
      expect(a).not.toBe(b);
    }
  });

  it('lanes are also adjacencies', () => {
    for (const [a, b] of map.lanes) expect(byId.get(a)!.adj, `${a}–${b}`).toContain(b);
  });

  it('every territory has an outline and a label inside the map', () => {
    const [w, h] = map.viewBox;
    for (const t of map.territories) {
      expect(t.path, t.id).toMatch(/^M[\d.\s,LZM-]+Z$/);
      expect(t.label[0], t.id).toBeGreaterThan(0);
      expect(t.label[0], t.id).toBeLessThan(w);
      expect(t.label[1], t.id).toBeGreaterThan(0);
      expect(t.label[1], t.id).toBeLessThan(h);
    }
    expect(map.sea).toBeTruthy();
  });

  it('every continent has one outline, for the rule between continents', () => {
    expect(Object.keys(map.regions ?? {}).sort()).toEqual(map.continents.map((c) => c.id).sort());
    for (const path of Object.values(map.regions ?? {})) expect(path).toMatch(/^M[\d.]/);
  });

  it('territories touch on land exactly where they border, except across the sea', () => {
    const key = (a: string, b: string) => [a, b].sort().join('|');
    const lanes = new Set(map.lanes.map(([a, b]) => key(a, b)));
    const borders = new Set(map.territories.flatMap((t) => t.adj.map((n) => key(t.id, n))));
    const land = new Set(LAND[map.id].map(([a, b]) => key(a, b)));
    const missing = [...borders].filter((b) => !lanes.has(b) && !land.has(b));
    const extra = [...land].filter((b) => !borders.has(b));
    const wet = [...lanes].filter((b) => land.has(b));
    expect({ missing, extra, wet }).toEqual({ missing: [], extra: [], wet: [] });
  });
});

describe('the realm map', () => {
  const map = MAPS.realm;

  it('is its own map', () => {
    expect(map.id).toBe('realm');
  });

  it('has bonuses spread like the classic board', () => {
    expect(map.continents.map((c) => c.bonus).sort((a, b) => b - a)).toEqual([7, 5, 5, 3, 2, 2]);
  });

  it('names are unique across territories and regions', () => {
    const names = [...map.territories, ...map.continents].map((x) => x.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('the world map', () => {
  const map = MAPS.world;
  const t = (id: string) => map.territories.find((x) => x.id === id)!;

  it('has the classic continent bonuses', () => {
    const bonus = Object.fromEntries(map.continents.map((c) => [c.id, c.bonus]));
    expect(bonus).toEqual({
      'north-america': 5,
      'south-america': 2,
      europe: 5,
      africa: 3,
      asia: 7,
      australia: 2,
    });
  });

  it('has the classic crossings', () => {
    expect(t('alaska').adj).toContain('kamchatka');
    expect(t('north-africa').adj).toContain('brazil');
    expect(t('eastern-australia').adj).toHaveLength(2);
    expect(map.territories.filter((x) => x.continent === 'asia')).toHaveLength(12);
  });
});
