'use client';

import { useEffect, useRef, useState, type ReactElement } from 'react';
import Player from './Player';
import { LobbyState, Role, doesHitlerKnowFascists, isVictoryState, type GameState } from './types';

/** secret-hitler.online's player/PlayerDisplay.tsx. */

export const DISABLE_NONE = () => '';

/** Filter to disable only executed players. */
export const DISABLE_EXECUTED_PLAYERS = (name: string, gameState: GameState) =>
  !gameState.players[name]?.alive ? 'EXECUTED' : '';

/** Filter to disable executed and investigated players. */
export const DISABLE_INVESTIGATED_PLAYERS = (name: string, gameState: GameState) => {
  if (!gameState.players[name]?.alive) return 'EXECUTED';
  if (gameState.players[name]?.investigated) return 'SEARCHED';
  return '';
};

/**
 * Filter to disable executed and term-limited players: the last elected chancellor and, if more
 * than five are alive, the last elected president.
 */
export const DISABLE_TERM_LIMITED_PLAYERS = (name: string, gameState: GameState) => {
  let livingPlayers = 0;
  for (const playerName of gameState.playerOrder) {
    if (gameState.players[playerName]?.alive) livingPlayers++;
  }
  if (!gameState.players[name]?.alive) return 'EXECUTED';
  if (gameState.lastChancellor === name) return 'TERM LIMITED';
  if (gameState.lastPresident === name && livingPlayers > 5) return 'TERM LIMITED';
  return '';
};

type PlayerDisplayProps = {
  user: string;
  gameState: GameState;
  players?: string[];
  playerDisabledFilter?: (playerName: string, gameState: GameState) => string;
  onSelection?: (playerName: string) => void;
  selection?: string;
  useAsButtons?: boolean;
  showVotes?: boolean;
  showLabels?: boolean;
  showRoles?: boolean;
  showBusy?: boolean;
  includeUser?: boolean;
};

/**
 * Displays a row of player icons and handles displaying busy status, votes, and roles where applicable.
 */
export default function PlayerDisplay({
  user,
  gameState,
  players,
  playerDisabledFilter = DISABLE_EXECUTED_PLAYERS,
  onSelection,
  selection,
  useAsButtons = false,
  showVotes = false,
  showLabels = true,
  showBusy = false,
  includeUser = true,
}: PlayerDisplayProps): ReactElement {
  // How many players, in order, have their vote shown. This lets the sequence be animated.
  const [playerVotesVisible, setPlayerVotesVisible] = useState<number>(0);
  /** Timeouts for each player animation. Will be destroyed on reset. */
  const playerVoteAnimations = useRef<ReturnType<typeof setTimeout>[]>([]);

  /** The player order, without the user if includeUser is false. */
  const basePlayers = players === undefined ? gameState.playerOrder : players;
  const playerOrder = includeUser ? basePlayers : basePlayers.filter((p) => p !== user);

  /**
   * The players the game is waiting on, shown with a (...) bubble.
   */
  const getBusyPlayerSet = (): Set<string> => {
    const game = gameState;
    const busyPlayers = new Set<string>([]);
    switch (game.state) {
      case LobbyState.CHANCELLOR_NOMINATION:
      case LobbyState.LEGISLATIVE_PRESIDENT:
      case LobbyState.LEGISLATIVE_PRESIDENT_VETO:
      case LobbyState.PP_PEEK:
      case LobbyState.PP_ELECTION:
      case LobbyState.PP_EXECUTION:
      case LobbyState.PP_INVESTIGATE:
      case LobbyState.POST_LEGISLATIVE:
        busyPlayers.add(game.president);
        break;
      case LobbyState.LEGISLATIVE_CHANCELLOR:
        busyPlayers.add(game.chancellor);
        break;
      case LobbyState.CHANCELLOR_VOTING:
        for (let i = 0; i < game.playerOrder.length; i++) {
          const name = playerOrder[i];
          if (name === undefined) continue;
          const isAlive = game.players[name]?.alive;
          // player has not voted (is not in the map of votes) and is alive
          if (!Object.prototype.hasOwnProperty.call(game.userVotes, name) && isAlive) {
            busyPlayers.add(name);
          }
        }
        break;
      default: // This includes the victory states and setup.
        break;
    }
    return busyPlayers;
  };

  /** True if the role should be shown. */
  const shouldShowRole = (playerName: string): boolean => {
    const myRole = gameState.players[user]?.id;
    const otherRole = gameState.players[playerName]?.id;
    if (otherRole === undefined) return false;
    if (isVictoryState(gameState.state)) return true;
    if (myRole === Role.FASCIST || (myRole === Role.HITLER && doesHitlerKnowFascists(gameState))) {
      // Hide liberal roles, because they can be redundant otherwise.
      return otherRole !== Role.LIBERAL;
    }
    return otherRole !== undefined;
  };

  /** Calls onSelection if the player is a valid choice. */
  const onPlayerSelected = (name: string): void => {
    if (
      playerDisabledFilter &&
      playerDisabledFilter(name, gameState) === '' &&
      useAsButtons &&
      name !== selection
    ) {
      onSelection?.(name);
    }
  };

  /** The players in [start, end). */
  const renderPlayer = (start: number, end: number) => {
    const busyPlayers = getBusyPlayerSet();
    return playerOrder.slice(start, end).map((playerName, index) => {
      const playerData = gameState.players[playerName] ?? { alive: true, investigated: false };

      let roleText = '';
      if (playerName === gameState.chancellor) roleText = 'CHANCELLOR';
      else if (playerName === gameState.president) roleText = 'PRESIDENT';

      const disabledText = playerDisabledFilter(playerName, gameState);
      const disabled = disabledText !== '';

      // Skip votes for players that are not alive.
      const showVote = index + start < playerVotesVisible && playerData.alive;

      return (
        <div id="player-display-text-container" key={playerName}>
          {showLabels && <p id="player-display-label">{roleText}</p>}
          <Player
            isBusy={busyPlayers.has(playerName) && !showVotes && showBusy} // Do not show while voting.
            role={playerData.id}
            showRole={shouldShowRole(playerName)}
            highlight={playerName === user}
            disabled={disabled}
            disabledText={disabledText}
            name={playerName}
            useAsButton={useAsButtons}
            isSelected={selection === playerName}
            onClick={() => onPlayerSelected(playerName)}
            showVote={showVote}
            vote={gameState.userVotes[playerName]}
            icon={gameState.icon[playerName]}
          />
        </div>
      );
    });
  };

  // The voting animation: each player's vote appears in turn over one second.
  const count = playerOrder.length;
  const [playing, setPlaying] = useState(showVotes);
  if (playing !== showVotes) {
    setPlaying(showVotes);
    setPlayerVotesVisible(0);
  }
  useEffect(() => {
    const clear = () => {
      playerVoteAnimations.current.forEach((timeout) => clearTimeout(timeout));
      playerVoteAnimations.current = [];
    };
    clear();
    if (!showVotes) return clear;
    const timePerPlayerMs = 1000 / count;
    playerVoteAnimations.current = Array.from({ length: count }, (_, index) =>
      setTimeout(() => setPlayerVotesVisible(index + 1), (index + 1) * timePerPlayerMs),
    );
    return clear;
  }, [showVotes, count]);

  // Two (or three) containers, so the tiles split into even rows when the page is too narrow.
  let div1: number, div2: number;
  if (playerOrder.length <= 4) {
    div1 = playerOrder.length;
    div2 = playerOrder.length;
  } else if (playerOrder.length <= 8) {
    div1 = Math.floor(playerOrder.length / 2);
    div2 = playerOrder.length;
  } else {
    div1 = Math.floor(playerOrder.length / 3);
    div2 = Math.floor((playerOrder.length * 2) / 3);
  }

  return (
    <div id="player-display">
      <div id="player-display-container">{renderPlayer(0, div1)}</div>
      <div id="player-display-container">{renderPlayer(div1, div2)}</div>
      <div id="player-display-container">{renderPlayer(div2, playerOrder.length)}</div>
    </div>
  );
}
