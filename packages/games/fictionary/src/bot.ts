import type { BotContext } from '@jackdaw/engine';
import type { FictionaryAction, FictionaryPlayerView, FictionaryTableView } from './rules';

/**
 * Fictionary's computer players, deciding from their own view only. A bot knows no trivia a
 * person in its seat wouldn't, so it never knows which answer is true: it asks the house for
 * help, writes one of the two lies it's handed (good lies, so bots fool people too), and picks
 * among the answers that aren't its own. The chooser takes any tab.
 */
export function fictionaryBot(
  ctx: BotContext<FictionaryPlayerView, FictionaryTableView>,
): FictionaryAction | null {
  const { view, rng } = ctx;
  const p = view.play;
  switch (view.phase) {
    case 'choose':
      return p.chooser === ctx.playerId && p.offer.length > 0
        ? { type: 'choose', tab: rng.pick(p.offer) }
        : null;
    case 'write':
      if (view.myLie) return null;
      if (view.suggestions.length === 0) return { type: 'help' };
      return { type: 'write', text: rng.pick(view.suggestions) };
    case 'pick': {
      if (view.myPick) return null;
      const open = p.entries.filter((e) => !view.mine.includes(e.id));
      return open.length > 0 ? { type: 'pick', id: rng.pick(open).id } : null;
    }
    default:
      return null;
  }
}
