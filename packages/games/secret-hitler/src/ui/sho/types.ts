/**
 * secret-hitler.online's client types (frontend/src/types), kept as they are so the ported
 * screens read the same. Players are keyed by name there; Jackdaw names are unique per lobby, so
 * the adapter (adapt.ts) keys them by name too and maps names back to ids for moves.
 */

export const PolicyType = {
  LIBERAL: 'LIBERAL',
  FASCIST: 'FASCIST',
} as const;
export type PolicyType = (typeof PolicyType)[keyof typeof PolicyType];

export const Role = {
  LIBERAL: 'LIBERAL',
  FASCIST: 'FASCIST',
  HITLER: 'HITLER',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const LobbyState = {
  SETUP: 'SETUP',
  CHANCELLOR_NOMINATION: 'CHANCELLOR_NOMINATION',
  CHANCELLOR_VOTING: 'CHANCELLOR_VOTING',
  LEGISLATIVE_PRESIDENT: 'LEGISLATIVE_PRESIDENT',
  LEGISLATIVE_CHANCELLOR: 'LEGISLATIVE_CHANCELLOR',
  LEGISLATIVE_PRESIDENT_VETO: 'LEGISLATIVE_PRESIDENT_VETO',
  PP_PEEK: 'PRESIDENTIAL_POWER_PEEK',
  PP_INVESTIGATE: 'PRESIDENTIAL_POWER_INVESTIGATE',
  PP_EXECUTION: 'PRESIDENTIAL_POWER_EXECUTION',
  PP_ELECTION: 'PRESIDENTIAL_POWER_ELECTION',
  POST_LEGISLATIVE: 'POST_LEGISLATIVE',
  LIBERAL_VICTORY_POLICY: 'LIBERAL_VICTORY_POLICY',
  LIBERAL_VICTORY_EXECUTION: 'LIBERAL_VICTORY_EXECUTION',
  FASCIST_VICTORY_POLICY: 'FASCIST_VICTORY_POLICY',
  FASCIST_VICTORY_ELECTION: 'FASCIST_VICTORY_ELECTION',
} as const;
export type LobbyState = (typeof LobbyState)[keyof typeof LobbyState];

export type PlayerState = {
  id?: Role;
  alive: boolean;
  investigated: boolean;
};

/**
 * A player's look. secret-hitler.online gives each player a portrait; on Jackdaw it's the crest
 * and colour they carry from game to game, and their id names the seat animation.
 */
export type Look = { crest: string; tint: string; id?: string };

export type GameState = {
  state: LobbyState;
  lastState: LobbyState;
  playerOrder: string[];
  players: Record<string, PlayerState>;
  chancellor: string;
  president: string;
  lastChancellor: string;
  lastPresident: string;
  electionTracker: number;
  electionTrackerAdvanced: boolean;
  userVotes: Record<string, boolean>;
  liberalPolicies: number;
  fascistPolicies: number;
  drawSize: number;
  discardSize: number;
  presidentChoices?: PolicyType[];
  chancellorChoices?: PolicyType[];
  targetUser?: string;
  lastPolicy: string;
  vetoOccurred: boolean;
  peek?: PolicyType[];
  /** Maps from usernames to their look (Jackdaw: each player's crest and colour). */
  icon: Record<string, Look>;
  /** Jackdaw: the size of the whole policy deck (17 officially, more with the house deck). */
  deckTotal?: { liberal: number; fascist: number };
  /** Jackdaw: the deal (5 to 10 officially; the house rules carry on to 15). */
  lineup?: { liberals: number; fascists: number };
};

export const WSCommandType = {
  REGISTER_CHANCELLOR_VETO: 'chancellor-veto',
  REGISTER_PRESIDENT_VETO: 'president-veto',
  REGISTER_PEEK: 'register-peek',
  END_TERM: 'end-term',
  SELECT_ICON: 'select-icon',
  NOMINATE_CHANCELLOR: 'nominate-chancellor',
  REGISTER_EXECUTION: 'register-execution',
  REGISTER_SPECIAL_ELECTION: 'register-special-election',
  GET_INVESTIGATION: 'get-investigation',
  REGISTER_VOTE: 'register-vote',
  REGISTER_CHANCELLOR_CHOICE: 'register-chancellor-choice',
  REGISTER_PRESIDENT_CHOICE: 'register-president-choice',
} as const;
export type WSCommandType = (typeof WSCommandType)[keyof typeof WSCommandType];

/** All possible commands and associated parameters. */
export type ServerRequestPayload =
  | { command: typeof WSCommandType.REGISTER_CHANCELLOR_VETO }
  | { command: typeof WSCommandType.REGISTER_PRESIDENT_VETO; veto: boolean }
  | { command: typeof WSCommandType.REGISTER_PEEK }
  | { command: typeof WSCommandType.END_TERM }
  | { command: typeof WSCommandType.SELECT_ICON; icon: string }
  | { command: typeof WSCommandType.NOMINATE_CHANCELLOR; target: string }
  | { command: typeof WSCommandType.REGISTER_EXECUTION; target: string }
  | { command: typeof WSCommandType.REGISTER_SPECIAL_ELECTION; target: string }
  | { command: typeof WSCommandType.GET_INVESTIGATION; target: string }
  | { command: typeof WSCommandType.REGISTER_VOTE; vote: boolean }
  | { command: typeof WSCommandType.REGISTER_CHANCELLOR_CHOICE; choice: number }
  | { command: typeof WSCommandType.REGISTER_PRESIDENT_CHOICE; choice: number };

export type SendWSCommand = (payload: ServerRequestPayload) => void;

export const SERVER_TIMEOUT = 4000;
export const LIBERAL = 'LIBERAL';

export const isVictoryState = (lobbyState: LobbyState): boolean =>
  lobbyState === LobbyState.FASCIST_VICTORY_ELECTION ||
  lobbyState === LobbyState.FASCIST_VICTORY_POLICY ||
  lobbyState === LobbyState.LIBERAL_VICTORY_EXECUTION ||
  lobbyState === LobbyState.LIBERAL_VICTORY_POLICY;

/** Returns true if players with the Hitler role should know which players have the Fascist role. */
export const doesHitlerKnowFascists = (gameState: GameState): boolean =>
  gameState.playerOrder.length <= 6;
