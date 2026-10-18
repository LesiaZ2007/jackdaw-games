/**
 * secret-hitler.online's artwork (frontend/src/assets), served from
 * apps/web/public/games/secret-hitler/sho. The boards, cards and party art are adapted from the
 * board game by Goat, Wolf & Cabbage; the tracker, popups and tiles are ShrimpCryptid's. All
 * CC BY-NC-SA 4.0. The site's portraits aren't here: players carry their Jackdaw crest instead.
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
