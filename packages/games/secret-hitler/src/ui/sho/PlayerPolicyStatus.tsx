import { A } from './assets';

/** secret-hitler.online's util/PlayerPolicyStatus.js: who is at the table, and what's left to enact. */

const NUM_HITLER_PLAYERS = 1;
const MAX_FASCIST_POLICIES = 11;
const MAX_LIBERAL_POLICIES = 6;

export default function PlayerPolicyStatus({
  numFascistPolicies,
  numLiberalPolicies,
  playerCount,
  lineup,
  deckTotal,
}: {
  numFascistPolicies: number;
  numLiberalPolicies: number;
  playerCount: number;
  /** Jackdaw: the house rules' deal past 10 players (the official counts otherwise). */
  lineup?: { liberals: number; fascists: number };
  /** Jackdaw: the house rules' bigger deck past 10 players. */
  deckTotal?: { liberal: number; fascist: number };
}) {
  let fascistPlayers: number;
  if (lineup) fascistPlayers = lineup.fascists;
  else if (playerCount <= 6) fascistPlayers = 1;
  else if (playerCount <= 8) fascistPlayers = 2;
  else fascistPlayers = 3;
  const liberalPlayers = playerCount - fascistPlayers - NUM_HITLER_PLAYERS;
  const maxLiberal = deckTotal?.liberal ?? MAX_LIBERAL_POLICIES;
  const maxFascist = deckTotal?.fascist ?? MAX_FASCIST_POLICIES;

  return (
    <div id="pps-container">
      <p id="pps-text">Players:</p>
      <div id="pps-icon-container">
        <img id="pps-icon" src={A.iconLiberal} alt="Liberal" />
        <p id="pps-icon-number" className="highlight-blue">
          {liberalPlayers}
        </p>
        <img id="pps-icon" src={A.iconFascist} alt="Fascist" />
        <p id="pps-icon-number" className="highlight">
          {fascistPlayers}
        </p>
        <img id="pps-icon" src={A.iconHitler} alt="Hitler" />
        <p id="pps-icon-number" className="highlight">
          {NUM_HITLER_PLAYERS}
        </p>
      </div>

      <p id="pps-text">Unenacted Policies:</p>
      <div id="pps-icon-container">
        <img id="pps-icon" className="highlight-blue" src={A.iconLiberal} alt="Liberal" />
        <p id="pps-icon-number" className="highlight-blue">
          {maxLiberal - numLiberalPolicies}
        </p>
        <img id="pps-icon" className="highlight" src={A.iconFascist} alt="Fascist" />
        <p id="pps-icon-number" className="highlight">
          {maxFascist - numFascistPolicies}
        </p>
      </div>
    </div>
  );
}
