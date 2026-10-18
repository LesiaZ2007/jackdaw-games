import { CREST_CHOICES } from '@jackdaw/ui';

/**
 * secret-hitler.online's artwork (frontend/src/assets), served from
 * apps/web/public/games/secret-hitler/sho. The boards, cards and party art are adapted from the
 * board game by Goat, Wolf & Cabbage; the tracker, popups, tiles and portraits are ShrimpCryptid's.
 * All CC BY-NC-SA 4.0.
 */
const BASE = '/games/secret-hitler/sho/';
const img = (file: string) => BASE + file;

export const A = {
  playerBase: img('player-base.png'),
  iconFascist: img('player-icon-fascist.png'),
  iconHitler: img('player-icon-hitler.png'),
  iconLiberal: img('player-icon-liberal.png'),
  iconBusy: img('player-icon-busy.png'),
  iconJa: img('player-icon-ja.png'),
  iconNein: img('player-icon-nein.png'),
  boardLiberal: img('board-liberal.png'),
  boardTracker: img('board-tracker.png'),
  boardPolicyLiberal: img('board-policy-liberal.png'),
  boardPolicyFascist: img('board-policy-fascist.png'),
  boardFascist56: img('board-fascist-5-6.png'),
  boardFascist78: img('board-fascist-7-8.png'),
  boardFascist910: img('board-fascist-9-10.png'),
  boardDraw: img('board-draw.png'),
  boardDiscard: img('board-discard.png'),
  boardPolicy: img('board-policy.png'),
  boardElectionTracker: img('board-election-tracker.png'),
  policyLiberal: img('policy-liberal.png'),
  policyFascist: img('policy-fascist.png'),
  folderCoverFront: img('policy-folder-cover-front.png'),
  folderCoverBack: img('policy-folder-cover-back.png'),
  folderBack: img('policy-folder-back.png'),
  voteYes: img('vote-yes.png'),
  voteNo: img('vote-no.png'),
  partyBack: img('party-membership.png'),
  partyLiberal: img('party-membership-liberal.png'),
  partyFascist: img('party-membership-fascist.png'),
  roleHitler: img('role-hitler.png'),
  roleLiberal: [1, 2, 3, 4, 5, 6].map((i) => img(`role-liberal-${i}.png`)),
  roleFascist: [1, 2, 3].map((i) => img(`role-fascist-${i}.png`)),
  victoryFascistHeader: img('victory-fascist-header.png'),
  victoryLiberalHeader: img('victory-liberal-header.png'),
};

export const defaultPortrait = 'p_default';

const portraits: Record<string, string> = {
  p_default: img('portraits/player-portrait-default.svg'),
};
for (let i = 1; i <= 20; i++) portraits[`p${i}`] = img(`portraits/player-portrait-${i}.svg`);
export default portraits;

export const portraitsAltText: Record<string, string> = {
  p_default: 'No icon selected.',
  p1: 'A stranger in neat office attire with a dark tie.',
  p2: 'A stranger with an elegant bun hiding behind a large fan.',
  p3: 'A stranger with stylish white hair in a trendy sweater.',
  p4: 'A stranger with light, curly hair in a dark overcoat.',
  p5: 'A stranger with a bob and apron with large, hooped earrings.',
  p6: 'A stranger with an afro, wearing a sweater and a vest.',
  p7: 'A dark-haired stranger in a tidy blouse.',
  p8: 'A stranger with thick spectacles wrapped in a scarf.',
  p9: "A stranger sporting a letterman's jacket and unkempt hair.",
  p10: 'A stranger with parted hair wearing a pair of large headphones.',
  p11: 'A stranger with a leather jacket and thick moustache.',
  p12: 'A stranger with curly dark hair in a bright trench coat.',
  p13: 'A stranger with reading glasses and a fancy sun hat.',
  p14: 'A stranger peeking out from behind a newspaper.',
  p15: 'A bald, bearded stranger in a neat cardigan.',
  p16: 'A stranger with thick white hair in distinguished military garb.',
  p17: 'A stranger who is not two toddlers stacked on top of each other.',
  p18: 'A stranger with long bangs hiding half of their face.',
  p19: 'A cat.',
  p20: 'An unsettling stranger shadowed in darkness.',
};

/**
 * Jackdaw keeps one crest per player in a lobby, and no two players share one, so each crest
 * stands for one portrait here: choosing a portrait in Secret Hitler sets your crest, and your
 * portrait is never anyone else's.
 */
export const PORTRAIT_FOR_CREST: Record<string, string> = Object.fromEntries(
  CREST_CHOICES.map((crest, i) => [crest, `p${i + 1}`]),
);
export const CREST_FOR_PORTRAIT: Record<string, string> = Object.fromEntries(
  CREST_CHOICES.map((crest, i) => [`p${i + 1}`, crest]),
);
/** The portraits you can choose, in the order secret-hitler.online lists them. */
export const choosablePortraits: string[] = CREST_CHOICES.map((_, i) => `p${i + 1}`);

export const portraitFor = (crest: string | undefined) =>
  (crest && PORTRAIT_FOR_CREST[crest]) || defaultPortrait;
