import type { FrameEffect } from '../frame';

export type SoundKind =
  'blip' | 'eat' | 'die' | 'bonk' | 'power' | 'pick' | 'start' | 'clear' | 'win' | 'over';

export interface Sound {
  play(kind: SoundKind): void;
  /** Call from a tap or key press: browsers keep audio locked until then. */
  resume(): void;
  muted: boolean;
}

interface AudioCtor {
  new (): AudioContext;
}

/**
 * Small synthesized sounds. Safe everywhere: with no AudioContext (tests, old browsers, blocked
 * audio) every call does nothing.
 */
export function createSound(): Sound {
  let ac: AudioContext | null = null;
  let tried = false;
  let alt = false;
  const g = globalThis as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };

  const ctx = (): AudioContext | null => {
    if (!ac && !tried) {
      tried = true;
      try {
        const C = g.AudioContext ?? g.webkitAudioContext;
        if (C) ac = new C();
      } catch {
        ac = null;
      }
    }
    return ac;
  };

  const beep = (
    f1: number,
    f2: number,
    dur: number,
    type: OscillatorType = 'square',
    vol = 0.05,
    delay = 0,
  ) => {
    const a = ac;
    if (!a) return;
    try {
      const t = a.currentTime + delay;
      const o = a.createOscillator();
      const gain = a.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f1, t);
      o.frequency.linearRampToValueAtTime(f2, t + dur);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(gain);
      gain.connect(a.destination);
      o.start(t);
      o.stop(t + dur);
    } catch {
      /* audio is optional */
    }
  };

  const self: Sound = {
    muted: false,
    resume() {
      const a = ctx();
      if (a && a.state === 'suspended') void a.resume().catch(() => undefined);
    },
    play(kind) {
      if (self.muted || !ctx()) return;
      switch (kind) {
        case 'blip':
          alt = !alt;
          beep(alt ? 520 : 380, alt ? 380 : 520, 0.07, 'triangle', 0.035);
          break;
        case 'eat':
          beep(300, 1300, 0.18, 'square', 0.05);
          break;
        case 'die':
          beep(800, 60, 1.0, 'sawtooth', 0.05);
          break;
        case 'bonk':
          beep(170, 80, 0.15, 'square', 0.06);
          break;
        case 'power':
          beep(200, 900, 0.3, 'triangle', 0.06);
          break;
        case 'pick':
          beep(500, 700, 0.08, 'square', 0.04);
          beep(700, 1000, 0.1, 'square', 0.04, 0.08);
          break;
        case 'start':
          [392, 523, 659, 784].forEach((f, i) => beep(f, f, 0.12, 'square', 0.04, i * 0.12));
          break;
        case 'clear':
          [523, 659, 784, 1046, 784, 1046].forEach((f, i) =>
            beep(f, f, 0.12, 'triangle', 0.05, i * 0.13),
          );
          break;
        case 'win':
          [523, 659, 784, 1046, 1318].forEach((f, i) => beep(f, f, 0.18, 'square', 0.04, i * 0.15));
          break;
        case 'over':
          [392, 330, 262, 196].forEach((f, i) =>
            beep(f, f * 0.97, 0.25, 'triangle', 0.05, i * 0.22),
          );
          break;
      }
    },
  };
  return self;
}

/** The sound for one frame effect, as seen by `me` (null on the TV, which only plays its own). */
export function soundFor(e: FrameEffect, me: string | null): SoundKind | null {
  switch (e.kind) {
    case 'pellet':
      return e.mine ? 'blip' : null;
    case 'power':
      return e.mine ? 'power' : null;
    case 'ghostEaten':
    case 'fruitEaten':
      return e.by === me ? 'eat' : null;
    case 'caught':
      return e.mine ? 'die' : null;
    case 'mazeCleared':
      return 'clear';
    case 'attackReceived':
      return 'bonk';
    case 'attackSent':
      return 'pick';
    case 'count':
      return e.n === 0 ? 'start' : 'blip';
    case 'finished':
      return 'win';
    default:
      return null;
  }
}
