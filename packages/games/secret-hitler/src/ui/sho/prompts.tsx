'use client';

import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { A } from './assets';
import ButtonPrompt from './ButtonPrompt';
import Player from './Player';
import PlayerDisplay, {
  DISABLE_EXECUTED_PLAYERS,
  DISABLE_INVESTIGATED_PLAYERS,
  DISABLE_TERM_LIMITED_PLAYERS,
} from './PlayerDisplay';
import PolicyDisplay from './PolicyDisplay';
import {
  Role,
  SERVER_TIMEOUT,
  WSCommandType,
  type GameState,
  type PolicyType,
  type SendWSCommand,
} from './types';

/** secret-hitler.online's custom-alert prompts: everything a player is asked to decide. */

/** Locks a button for SERVER_TIMEOUT ms once pressed, so it can't be pressed twice. */
function useServerLock(): [boolean, () => void] {
  const [waiting, setWaiting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [
    waiting,
    () => {
      setWaiting(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setWaiting(false), SERVER_TIMEOUT);
    },
  ];
}

// <editor-fold desc="VotingPrompt">

export function VotingPrompt({
  gameState,
  sendWSCommand,
  user,
}: {
  gameState: GameState;
  sendWSCommand: SendWSCommand;
  user: string;
}) {
  const [selection, setSelection] = useState<'yes' | 'no' | undefined>(undefined);
  const [waitingForServer, lock] = useServerLock();

  /**
   * The chancellor's role shows on their card if the player is fascist and the chancellor is
   * fascist or Hitler, or the player is Hitler, the chancellor is fascist and there are 5–6 players.
   */
  const shouldChancellorRoleBeShown = () => {
    const userRole = gameState.players[user]?.id;
    const chancellorRole = gameState.players[gameState.chancellor]?.id;
    switch (userRole) {
      case Role.FASCIST:
        return chancellorRole === Role.HITLER || chancellorRole === Role.FASCIST;
      case Role.HITLER:
        return chancellorRole === Role.FASCIST && gameState.playerOrder.length <= 6;
      default:
        return false;
    }
  };

  const onButtonClick = () => {
    lock();
    sendWSCommand({ command: WSCommandType.REGISTER_VOTE, vote: selection === 'yes' });
  };

  const chancellorName = gameState.chancellor;
  const presidentName = gameState.president;
  return (
    <ButtonPrompt
      label="VOTING"
      renderHeader={() => (
        <>
          <Player
            name={chancellorName}
            showRole={shouldChancellorRoleBeShown()}
            role={gameState.players[chancellorName]?.id}
            icon={gameState.icon[chancellorName]}
          />

          <p className="left-align">
            {presidentName + ' has nominated ' + chancellorName + ' as chancellor.'}
          </p>
          <p className="left-align">
            Vote on whether you want this government to proceed; The vote passes if over 50% of the
            votes are yes.
          </p>

          {/* Two warnings for when the decision is extra critical. */}
          {gameState.fascistPolicies >= 3 && (
            <p className="highlight left-align">
              Fascists will win if Hitler is successfully voted in as chancellor!
            </p>
          )}
          {gameState.electionTracker === 2 && (
            <p className="highlight left-align">
              If this vote fails, the next policy in the draw deck will be immediately enacted.
            </p>
          )}
        </>
      )}
      buttonDisabled={selection === undefined || waitingForServer}
      buttonOnClick={onButtonClick}
    >
      <div id="voting-card-container">
        <img
          id="voting-card"
          className={'selectable ' + (selection === 'yes' ? 'selected ' : '')}
          src={A.voteYes}
          alt="Ja! (Yes)"
          onClick={() => setSelection('yes')}
        />
        <img
          id="voting-card"
          className={'selectable ' + (selection === 'no' ? 'selected ' : '')}
          src={A.voteNo}
          alt="Nein (No)"
          onClick={() => setSelection('no')}
        />
      </div>
    </ButtonPrompt>
  );
}

// </editor-fold>

export function PresidentLegislativePrompt({
  policyOptions,
  sendWSCommand,
}: {
  policyOptions: PolicyType[];
  sendWSCommand: SendWSCommand;
}) {
  const [selection, setSelection] = useState<number | undefined>(undefined);
  const [waitingForServer, lock] = useServerLock();
  return (
    <ButtonPrompt
      label="LEGISLATIVE SESSION"
      headerText="Choose a policy to discard. The remaining policies are given to the chancellor."
      buttonText="DISCARD"
      buttonOnClick={() => {
        if (selection === undefined) return;
        lock();
        sendWSCommand({ command: WSCommandType.REGISTER_PRESIDENT_CHOICE, choice: selection });
      }}
      buttonDisabled={selection === undefined || waitingForServer}
    >
      <PolicyDisplay
        policies={policyOptions}
        onClick={(index) => setSelection(index)}
        selection={selection}
        allowSelection={true}
      />
    </ButtonPrompt>
  );
}

export function ChancellorLegislativePrompt({
  policyOptions,
  sendWSCommand,
  fascistPolicies,
  showError,
  enableVeto,
}: {
  policyOptions: PolicyType[];
  sendWSCommand: SendWSCommand;
  fascistPolicies: number;
  showError: (message: string) => void;
  enableVeto: boolean;
}) {
  const [selection, setSelection] = useState<number | undefined>(undefined);
  const [waitingForServer, lock] = useServerLock();

  const onEnactButtonClick = () => {
    if (selection === undefined) return;
    lock();
    sendWSCommand({ command: WSCommandType.REGISTER_CHANCELLOR_CHOICE, choice: selection });
  };

  const onVetoButtonClick = () => {
    if (fascistPolicies === 5) {
      lock();
      sendWSCommand({ command: WSCommandType.REGISTER_CHANCELLOR_VETO });
    } else {
      showError('Veto power is unlocked when there are 5 fascist policies.');
    }
  };

  return (
    <ButtonPrompt
      label="LEGISLATIVE SESSION"
      renderHeader={() => (
        <>
          <p className="left-align">
            Choose a policy to enact. The remaining policy will be discarded.
          </p>
          {fascistPolicies === 5 && (
            <p className="left-align highlight">
              Veto power unlocked: If you choose to veto and the president agrees to the veto, the
              agenda will be discarded.
            </p>
          )}
        </>
      )}
      renderButton={() => (
        <div id="legislative-button-container">
          {enableVeto && (
            <button onClick={onVetoButtonClick} disabled={waitingForServer}>
              VETO
            </button>
          )}
          <button
            onClick={onEnactButtonClick}
            disabled={selection === undefined || waitingForServer}
          >
            ENACT
          </button>
        </div>
      )}
    >
      <PolicyDisplay
        policies={policyOptions}
        onClick={(index) => setSelection(index)}
        selection={selection}
        allowSelection={true}
      />
    </ButtonPrompt>
  );
}

export function VetoPrompt({
  sendWSCommand,
  electionTracker,
}: {
  sendWSCommand: SendWSCommand;
  electionTracker: number;
}) {
  const [waitingForServer, lock] = useServerLock();
  const onButtonClick = (accepted: boolean) => {
    lock();
    sendWSCommand({ command: WSCommandType.REGISTER_PRESIDENT_VETO, veto: accepted });
  };
  return (
    <ButtonPrompt
      label="LEGISLATIVE VETO"
      renderHeader={() => (
        <>
          <p className="left-align">The chancellor has requested to veto the agenda.</p>
          {electionTracker === 2 && (
            <p className="left-align highlight">
              If the veto is accepted, the top policy on the draw pile will be automatically
              enacted.
            </p>
          )}
          {electionTracker !== 2 && (
            <p className="left-align">
              If the veto is accepted, the remaining policies will be discarded and the election
              tracker will advance by 1.
            </p>
          )}
          <p className="left-align">
            Otherwise, the chancellor will be required to enact a policy as normal.
          </p>
          <br />
        </>
      )}
      footerText="Accept the veto?"
      renderButton={() => (
        <>
          <button onClick={() => onButtonClick(false)} disabled={waitingForServer}>
            REJECT
          </button>
          <button onClick={() => onButtonClick(true)} disabled={waitingForServer}>
            ACCEPT
          </button>
        </>
      )}
    />
  );
}

export function PeekPrompt({
  policies,
  sendWSCommand,
}: {
  policies: PolicyType[];
  sendWSCommand: SendWSCommand;
}) {
  const [waitingForServer, lock] = useServerLock();
  return (
    <ButtonPrompt
      label="PEEK"
      headerText="These are the next three policies in the draw deck."
      buttonText="OKAY"
      buttonOnClick={() => {
        lock();
        sendWSCommand({ command: WSCommandType.REGISTER_PEEK });
      }}
      buttonDisabled={waitingForServer}
    >
      <PolicyDisplay policies={policies} allowSelection={false} />
    </ButtonPrompt>
  );
}

/** A prompt with a header, a row of players to pick from, and a button. */
export function PlayerDisplayPrompt({
  user = '',
  gameState,
  includeUser = false,
  disabledFilter = DISABLE_EXECUTED_PLAYERS,
  label,
  headerText,
  renderHeader,
  footerText,
  buttonText = 'CONFIRM',
  buttonOnClick,
  buttonDisabled,
}: {
  user?: string;
  gameState: GameState;
  includeUser?: boolean;
  disabledFilter?: (name: string, state: GameState) => string;
  label?: string;
  headerText?: string;
  renderHeader?: () => ReactNode;
  footerText?: string;
  buttonText?: string;
  buttonOnClick: (selectedItem: string) => void;
  buttonDisabled?: boolean;
}) {
  const [selection, setSelection] = useState<string | undefined>(undefined);
  return (
    <ButtonPrompt
      label={label}
      headerText={headerText}
      renderHeader={renderHeader}
      footerText={footerText}
      buttonText={buttonText}
      buttonDisabled={selection === undefined || buttonDisabled}
      buttonOnClick={() => selection !== undefined && buttonOnClick(selection)}
    >
      <PlayerDisplay
        gameState={gameState}
        user={user}
        includeUser={includeUser}
        useAsButtons={true}
        playerDisabledFilter={disabledFilter}
        showLabels={false}
        selection={selection}
        onSelection={(itemSelected) => setSelection(itemSelected)}
      />
    </ButtonPrompt>
  );
}

type AllowedWSCommandTypes =
  | typeof WSCommandType.NOMINATE_CHANCELLOR
  | typeof WSCommandType.REGISTER_EXECUTION
  | typeof WSCommandType.REGISTER_SPECIAL_ELECTION
  | typeof WSCommandType.GET_INVESTIGATION;

/** A PlayerDisplayPrompt that sends a command on the button and locks the button for a moment. */
export default function SelectPlayerPrompt({
  user,
  gameState,
  sendWSCommand,
  commandType,
  disabledFilter = DISABLE_EXECUTED_PLAYERS,
  includeUser,
  label,
  headerText,
  renderHeader,
  buttonText,
}: {
  user: string;
  gameState: GameState;
  sendWSCommand: SendWSCommand;
  commandType: AllowedWSCommandTypes;
  disabledFilter?: (name: string, state: GameState) => string;
  includeUser: boolean;
  label?: string;
  headerText?: string;
  renderHeader?: () => ReactElement;
  buttonText?: string;
}): ReactElement {
  const [isWaitingForServer, lock] = useServerLock();
  return (
    <PlayerDisplayPrompt
      label={label}
      headerText={headerText}
      renderHeader={renderHeader}
      gameState={gameState}
      disabledFilter={disabledFilter}
      buttonText={buttonText}
      buttonOnClick={(selectedItem) => {
        lock();
        sendWSCommand({ command: commandType, target: selectedItem });
      }}
      buttonDisabled={isWaitingForServer}
      user={user}
      includeUser={includeUser}
    />
  );
}

/** The president picks a chancellor; term-limited players are disabled. */
export const SelectNominationPrompt = (
  user: string,
  gameState: GameState,
  sendWSCommand: SendWSCommand,
): ReactElement => (
  <SelectPlayerPrompt
    user={user}
    commandType={WSCommandType.NOMINATE_CHANCELLOR}
    label="NOMINATION"
    gameState={gameState}
    sendWSCommand={sendWSCommand}
    renderHeader={() => (
      <div>
        <p className="left-align">Nominate a player to become the next Chancellor.</p>
        <p className="left-align highlight" hidden={!(gameState.fascistPolicies >= 3)}>
          Fascists will win if Hitler is nominated and voted in as Chancellor!
        </p>
      </div>
    )}
    disabledFilter={DISABLE_TERM_LIMITED_PLAYERS}
    includeUser={false}
  />
);

export const SelectInvestigationPrompt = (
  user: string,
  gameState: GameState,
  sendWSCommand: SendWSCommand,
): ReactElement => (
  <SelectPlayerPrompt
    user={user}
    gameState={gameState}
    sendWSCommand={sendWSCommand}
    commandType={WSCommandType.GET_INVESTIGATION}
    disabledFilter={DISABLE_INVESTIGATED_PLAYERS}
    includeUser={false}
    label="INVESTIGATE LOYALTY"
    renderHeader={() => (
      <>
        <p className="left-align">
          Choose a player and investigate their party alignment. You&apos;ll learn if the player is
          a member of the Fascist or Liberal party, but not their specific role (e.g., Hitler).
        </p>
        <p className="left-align">
          Players that have been investigated once cannot be investigated again.
        </p>
        <p className="left-align highlight">
          (Remember that you can lie about the player&apos;s party alignment!)
        </p>
      </>
    )}
  />
);

export const SelectSpecialElectionPrompt = (
  user: string,
  gameState: GameState,
  sendWSCommand: SendWSCommand,
): ReactElement => (
  <SelectPlayerPrompt
    user={user}
    gameState={gameState}
    sendWSCommand={sendWSCommand}
    commandType={WSCommandType.REGISTER_SPECIAL_ELECTION}
    disabledFilter={DISABLE_EXECUTED_PLAYERS}
    includeUser={false}
    label="SPECIAL ELECTION"
    headerText="Choose any player to become the next president. Once their term is finished, the order continues as normal."
  />
);

export const SelectExecutionPrompt = (
  user: string,
  gameState: GameState,
  sendWSCommand: SendWSCommand,
): ReactElement => (
  <SelectPlayerPrompt
    user={user}
    gameState={gameState}
    sendWSCommand={sendWSCommand}
    commandType={WSCommandType.REGISTER_EXECUTION}
    disabledFilter={DISABLE_EXECUTED_PLAYERS}
    includeUser={false}
    label="EXECUTION"
    renderHeader={() => (
      <>
        <p className="left-align">
          Choose a player to execute. That player can no longer speak, vote, or run for office.
        </p>
        <p className="left-align highlight">
          The game ends and Liberals win if Hitler is executed.
        </p>
      </>
    )}
  />
);
