'use client';

import { Component, type ReactNode } from 'react';
import { A } from './assets';
import Board from './Board';
import ButtonPrompt from './ButtonPrompt';
import CustomAlert from './CustomAlert';
import Deck from './Deck';
import EventBar from './EventBar';
import { FitToScreen } from './FitToScreen';
import PlayerDisplay, { DISABLE_EXECUTED_PLAYERS, DISABLE_NONE } from './PlayerDisplay';
import PlayerPolicyStatus from './PlayerPolicyStatus';
import StatusBar from './StatusBar';
import { ElectionTrackerAlert, InvestigationAlert, PolicyEnactedAlert, RoleAlert } from './alerts';
import {
  ChancellorLegislativePrompt,
  PeekPrompt,
  PresidentLegislativePrompt,
  SelectExecutionPrompt,
  SelectInvestigationPrompt,
  SelectNominationPrompt,
  SelectSpecialElectionPrompt,
  VetoPrompt,
  VotingPrompt,
} from './prompts';
import {
  LobbyState,
  Role,
  WSCommandType,
  type GameState,
  type ServerRequestPayload,
} from './types';

/**
 * secret-hitler.online's game page (App.tsx: renderGamePage, onGameStateChanged and the
 * animation queue), driven by Jackdaw's polling instead of its WebSocket. Every change in the
 * game state queues the same event bars, status lines, popups and prompts, with the same timings.
 */

const EVENT_BAR_FADE_OUT_DURATION = 500;
const CUSTOM_ALERT_FADE_DURATION = 1000;
/** On a screen nobody answers (a TV, or a phone watching), popups close themselves after this. */
const WATCHING_ALERT_MS = 4500;

export const DEFAULT_GAME_STATE: GameState = {
  liberalPolicies: 0,
  fascistPolicies: 0,
  discardSize: 0,
  drawSize: 17,
  players: {},
  playerOrder: [],
  state: LobbyState.SETUP,
  president: '',
  chancellor: '',
  electionTracker: 0,
  vetoOccurred: false,
  lastState: LobbyState.SETUP,
  lastChancellor: '',
  lastPresident: '',
  electionTrackerAdvanced: false,
  userVotes: {},
  presidentChoices: [],
  chancellorChoices: [],
  targetUser: '',
  lastPolicy: '',
  peek: [],
  icon: {},
};

export type Investigation = { target: string; party: string };

type GamePageProps = {
  gameState: GameState;
  /** Your name, or null on a screen that only watches (a TV, or a phone that isn't seated). */
  user: string | null;
  /** Sends a move; resolves true once the server has taken it (secret-hitler.online's OK). */
  send?: (payload: ServerRequestPayload) => Promise<boolean>;
  /** The president's own investigation results, oldest first. */
  investigations?: Investigation[];
  /** Where to start from instead of a fresh table (the end screen replays the last moves). */
  startFrom?: GameState;
  /** The buttons under the victory screen. */
  renderVictoryButtons?: () => ReactNode;
  /**
   * Jackdaw: the victory line for a game the host ended early (the site's lines say how a game
   * was won, which isn't what happened then).
   */
  victoryMessage?: string;
  /** Shown in the orange band at the top. */
  header?: string;
};

type GamePageState = {
  gameState: GameState;
  liberalPolicies: number;
  fascistPolicies: number;
  /** The position of the election tracker, ranging from 0 to 3. */
  electionTracker: number;
  showVotes: boolean;
  drawDeckSize: number;
  discardDeckSize: number;
  snackbarMessage: string;
  showAlert: boolean;
  alertContent: ReactNode;
  showEventBar: boolean;
  eventBarMessage: string;
  statusBarText: string;
  allAnimationsFinished: boolean;
};

export default class GamePage extends Component<GamePageProps, GamePageState> {
  animationQueue: (() => void)[] = [];
  okMessageListeners: (() => void)[] = [];
  allAnimationsFinished = true;
  timers = new Set<ReturnType<typeof setTimeout>>();
  unmounted = false;
  seenInvestigations = 0;

  constructor(props: GamePageProps) {
    super(props);
    const from = props.startFrom ?? DEFAULT_GAME_STATE;
    this.state = {
      gameState: from,
      liberalPolicies: from.liberalPolicies,
      fascistPolicies: from.fascistPolicies,
      electionTracker: from.electionTracker,
      showVotes: false,
      drawDeckSize: from.drawSize,
      discardDeckSize: from.discardSize,
      snackbarMessage: '',
      showAlert: false,
      alertContent: <div />,
      showEventBar: false,
      eventBarMessage: '',
      statusBarText: '---',
      allAnimationsFinished: true,
    };
    // A refresh shouldn't show the president an investigation they've already seen.
    this.seenInvestigations = props.investigations?.length ?? 0;
    this.sendWSCommand = this.sendWSCommand.bind(this);
    this.hideAlertAndFinish = this.hideAlertAndFinish.bind(this);
    this.onAnimationFinish = this.onAnimationFinish.bind(this);
  }

  override componentDidMount() {
    this.unmounted = false;
    this.receive(this.props.gameState);
  }

  override componentDidUpdate(prev: GamePageProps) {
    if (prev.gameState !== this.props.gameState) this.receive(this.props.gameState);
    const inv = this.props.investigations ?? [];
    if (inv.length > this.seenInvestigations) {
      const latest = inv[inv.length - 1]!;
      this.seenInvestigations = inv.length;
      // Trigger the investigation screen when the server responds.
      this.queueAlert(
        <InvestigationAlert
          party={latest.party}
          target={latest.target}
          hideAlert={this.hideAlertAndFinish}
        />,
        false,
      );
    }
  }

  override componentWillUnmount() {
    // Drop everything queued, so a remount (React's dev double mount) starts clean.
    this.unmounted = true;
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.animationQueue = [];
    this.okMessageListeners = [];
    this.allAnimationsFinished = true;
  }

  /** setTimeout that's cleared if the screen goes away. */
  later(fn: () => void, ms: number) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.unmounted) fn();
    }, ms);
    this.timers.add(t);
  }

  /** A new game state from the server (PACKET_GAME_STATE). */
  receive(message: GameState) {
    if (message !== this.state.gameState) this.onGameStateChanged(message);
    this.setState({ gameState: message });
  }

  get name() {
    return this.props.user ?? '';
  }

  get watching() {
    return this.props.user === null;
  }

  /** Sends a move, and fires the OK listeners once the server takes it. */
  sendWSCommand(request: ServerRequestPayload) {
    const send = this.props.send;
    if (!send) return;
    void send(request).then((ok) => {
      if (!ok || this.unmounted) return;
      // Traverse all listeners and call the functions.
      const listeners = this.okMessageListeners;
      this.okMessageListeners = [];
      for (let i = 0; i < listeners.length && i < 1; i++) listeners[i]!();
    });
  }

  showSnackBar(message: string) {
    this.setState({ snackbarMessage: message });
  }

  // <editor-fold desc="Game Page">

  showExecutionResults(name: string, newState: GameState): void {
    if (name === newState.targetUser) {
      this.queueAlert(
        <ButtonPrompt
          label="YOU HAVE BEEN EXECUTED"
          headerText="Executed players may not speak, vote, or run for office. You should not reveal your identity to the group."
          buttonOnClick={this.hideAlertAndFinish}
        />,
        false,
      );
    } else {
      this.queueAlert(
        <ButtonPrompt
          label="EXECUTION RESULTS"
          footerText={
            newState.targetUser +
            ' has been executed. They may no longer speak, vote, or run for office.'
          }
          buttonOnClick={this.hideAlertAndFinish}
          buttonText="OKAY"
        >
          <PlayerDisplay
            user={name}
            gameState={newState}
            showRoles={false}
            playerDisabledFilter={DISABLE_EXECUTED_PLAYERS}
            players={[newState.targetUser!]}
          />
        </ButtonPrompt>,
        false,
      );
    }
  }

  /** Queues animations for when the game state has changed. */
  onGameStateChanged(newState: GameState) {
    const oldState = this.state.gameState;
    const name = this.name;
    const watching = this.watching;
    const isPresident = !watching && name === newState.president;
    const isChancellor = !watching && name === newState.chancellor;
    const state = newState.state;

    // If the last state was setup (the client is entering or re-entering the game), set the
    // card counts, policy counts and the tracker.
    if (oldState.state === LobbyState.SETUP) {
      this.setState({
        liberalPolicies: newState.liberalPolicies,
        fascistPolicies: newState.fascistPolicies,
        electionTracker: newState.electionTracker,
        drawDeckSize: newState.drawSize,
        discardDeckSize: newState.discardSize,
      });
    }

    // Check for changes in enacted policies and election tracker.
    const statesToShowPolicyFor: LobbyState[] = [
      LobbyState.POST_LEGISLATIVE,
      LobbyState.PP_INVESTIGATE,
      LobbyState.PP_EXECUTION,
      LobbyState.PP_ELECTION,
      LobbyState.PP_PEEK,
      LobbyState.FASCIST_VICTORY_POLICY,
      LobbyState.LIBERAL_VICTORY_POLICY,
    ];
    if (statesToShowPolicyFor.includes(state)) {
      // Check if the election tracker changed positions.
      if (newState.electionTracker !== oldState.electionTracker) {
        const newPos = newState.electionTracker;
        const advancedToThree = newPos === 0 && newState.electionTrackerAdvanced;
        // Ignore all resets to 0, unless that reset was caused by the election tracker reaching 3.
        if (newPos !== 0 || advancedToThree) {
          // If the last phase was voting, we failed due to voting. Therefore, show votes.
          if (oldState.state === LobbyState.CHANCELLOR_VOTING) {
            this.addAnimationToQueue(() => this.showVotes(newState));
          }
          // If the tracker was reset because it advanced to 3, show it moving to 3.
          const trackerPosition = advancedToThree ? 3 : newPos;
          this.queueAlert(
            <ElectionTrackerAlert
              trackerPosition={trackerPosition}
              closeAlert={this.hideAlertAndFinish}
            />,
          );
        }
      }

      const liberalChanged = newState.liberalPolicies !== oldState.liberalPolicies;
      const fascistChanged = newState.fascistPolicies !== oldState.fascistPolicies;
      if (liberalChanged || fascistChanged) {
        // Show an alert with the new policy
        this.queueAlert(
          <PolicyEnactedAlert
            hideAlert={this.hideAlertAndFinish}
            policyType={newState.lastPolicy}
          />,
        );
      }

      // Update the decks, board with the new policies / election tracker.
      this.addAnimationToQueue(() => {
        this.setState({
          liberalPolicies: newState.liberalPolicies,
          fascistPolicies: newState.fascistPolicies,
          electionTracker: newState.electionTracker,
        });
        this.later(() => this.onAnimationFinish(), 500);
      });
    }

    // Check for state change
    if (newState.state !== oldState.state) {
      switch (newState.state) {
        case LobbyState.CHANCELLOR_NOMINATION:
          if (
            !watching &&
            newState.electionTracker === 0 &&
            newState.liberalPolicies === 0 &&
            newState.fascistPolicies === 0
          ) {
            // If the game has just started (everything in default state), show the player's role.
            this.queueAlert(
              <RoleAlert
                role={newState.players[name]?.id}
                gameState={newState}
                name={name}
                onClick={() => this.hideAlertAndFinish()}
              />,
              false,
            );
          }
          this.queueEventUpdate('CHANCELLOR NOMINATION');
          this.queueStatusMessage('Waiting for president to nominate a chancellor.');
          if (isPresident) {
            // Show the chancellor nomination window.
            this.queueAlert(SelectNominationPrompt(name, newState, this.sendWSCommand));
          }
          break;

        case LobbyState.CHANCELLOR_VOTING:
          this.setState({ statusBarText: '' });
          this.queueEventUpdate('VOTING');
          this.queueStatusMessage('Waiting for all players to vote.');
          // Check if the player is dead or has already voted-- if so, do not show the voting prompt.
          if (
            !watching &&
            newState.players[name]?.alive &&
            !Object.keys(newState.userVotes).includes(name)
          ) {
            this.queueAlert(
              <VotingPrompt gameState={newState} sendWSCommand={this.sendWSCommand} user={name} />,
              true,
            );
          }
          break;

        case LobbyState.LEGISLATIVE_PRESIDENT:
          // The vote completed, so show the votes.
          this.addAnimationToQueue(() => this.showVotes(newState));
          this.queueEventUpdate('LEGISLATIVE SESSION');
          this.queueStatusMessage('Waiting for the president to choose a policy to discard.');
          if (isPresident && newState.presidentChoices) {
            this.queueAlert(
              <PresidentLegislativePrompt
                policyOptions={newState.presidentChoices}
                sendWSCommand={this.sendWSCommand}
              />,
            );
          }
          break;

        case LobbyState.LEGISLATIVE_CHANCELLOR:
          this.queueStatusMessage('Waiting for the chancellor to choose a policy to enact.');
          if (isChancellor && newState.chancellorChoices) {
            this.queueAlert(
              <ChancellorLegislativePrompt
                fascistPolicies={newState.fascistPolicies}
                showError={(message: string) => this.setState({ snackbarMessage: message })}
                policyOptions={newState.chancellorChoices}
                sendWSCommand={this.sendWSCommand}
                // Disable if veto has already happened
                enableVeto={newState.fascistPolicies === 5 && !newState.vetoOccurred}
              />,
            );
          }
          break;

        case LobbyState.LEGISLATIVE_PRESIDENT_VETO:
          this.queueStatusMessage(
            'Chancellor has motioned to veto the agenda. Waiting for the president to decide.',
          );
          if (isPresident) {
            this.queueAlert(
              <VetoPrompt
                sendWSCommand={this.sendWSCommand}
                electionTracker={newState.electionTracker}
              />,
              true,
            );
          }
          break;

        case LobbyState.PP_PEEK:
          this.queueEventUpdate('PRESIDENTIAL POWER');
          if (isPresident && newState.peek) {
            this.queueAlert(
              <PeekPrompt policies={newState.peek} sendWSCommand={this.sendWSCommand} />,
              true,
            );
          } else {
            this.queueStatusMessage('Peek: President is previewing the next 3 policies.');
          }
          break;

        case LobbyState.PP_ELECTION:
          this.queueEventUpdate('PRESIDENTIAL POWER');
          if (isPresident) {
            this.queueAlert(SelectSpecialElectionPrompt(name, newState, this.sendWSCommand));
          } else {
            this.queueStatusMessage('Special Election: President is choosing the next president.');
          }
          break;

        case LobbyState.PP_EXECUTION:
          this.queueEventUpdate('PRESIDENTIAL POWER');
          if (isPresident) {
            this.queueAlert(SelectExecutionPrompt(name, newState, this.sendWSCommand), true);
          } else {
            this.queueStatusMessage('Execution: President is choosing a player to execute.');
          }
          break;

        case LobbyState.PP_INVESTIGATE:
          this.queueEventUpdate('PRESIDENTIAL POWER');
          if (isPresident) {
            this.queueAlert(SelectInvestigationPrompt(name, newState, this.sendWSCommand));
          } else {
            this.queueStatusMessage(
              'Investigation: President is choosing a player to investigate.',
            );
          }
          break;

        case LobbyState.POST_LEGISLATIVE:
          // Show results of any special elections, executions, or investigations.
          switch (newState.lastState) {
            case LobbyState.PP_ELECTION:
              if (!isPresident) {
                this.queueAlert(
                  <ButtonPrompt
                    label="SPECIAL ELECTION"
                    footerText={
                      newState.president +
                      ' has chosen ' +
                      newState.targetUser +
                      ' to be the next president.' +
                      '\nThe normal presidential order will resume after the next round.'
                    }
                    buttonText="OKAY"
                    buttonOnClick={this.hideAlertAndFinish}
                  >
                    <PlayerDisplay
                      user={name}
                      gameState={newState}
                      showLabels={false}
                      players={[newState.targetUser!]}
                    />
                  </ButtonPrompt>,
                  false,
                );
              }
              break;
            case LobbyState.PP_EXECUTION:
              this.showExecutionResults(name, newState);
              break;
            case LobbyState.PP_INVESTIGATE:
              if (!isPresident) {
                const isTarget = newState.targetUser === name;
                const footerText = isTarget
                  ? `You have been investigated by ${newState.president}. The president now knows your party affiliation.`
                  : `${newState.targetUser} has been investigated by ${newState.president}. The president now knows their party affiliation.`;
                this.queueAlert(
                  <ButtonPrompt
                    label="INVESTIGATION RESULTS"
                    footerText={footerText}
                    buttonOnClick={this.hideAlertAndFinish}
                    buttonText="OKAY"
                  >
                    <PlayerDisplay
                      user={name}
                      gameState={newState}
                      showLabels={false}
                      players={[newState.targetUser!]}
                    />
                  </ButtonPrompt>,
                  // On secret-hitler.online this waits for the server's OK; nothing is sent
                  // from this popup, so it closes on its button like the others.
                  false,
                );
              }
              // The president gets the result directly from the server.
              break;
            default:
          }
          this.queueStatusMessage('Waiting for the president to end their term.');
          break;

        case LobbyState.LIBERAL_VICTORY_EXECUTION:
        case LobbyState.FASCIST_VICTORY_ELECTION:
        case LobbyState.FASCIST_VICTORY_POLICY:
        case LobbyState.LIBERAL_VICTORY_POLICY:
          this.showVictory(name, newState);
          break;

        default:
        // Do nothing
      }
    }

    // Update the draw decks
    this.addAnimationToQueue(() => {
      this.setState({ drawDeckSize: newState.drawSize, discardDeckSize: newState.discardSize });
      this.onAnimationFinish();
    });
  }

  showVictory(name: string, newState: GameState) {
    // Show normal enactments when victory events happen.
    if (newState.state === LobbyState.LIBERAL_VICTORY_EXECUTION) {
      this.showExecutionResults(name, newState);
    }
    if (newState.state === LobbyState.FASCIST_VICTORY_ELECTION) {
      this.addAnimationToQueue(() => this.showVotes(newState));
    }
    // Policies will already be shown for policy-based victories.

    // Divide fascist and liberal players.
    const fascistPlayers: string[] = [];
    const liberalPlayers: string[] = [];
    newState.playerOrder.forEach((player) => {
      const role = newState.players[player]?.id;
      if (role === Role.FASCIST || role === Role.HITLER) fascistPlayers.push(player);
      else liberalPlayers.push(player);
    });

    const state = newState.state;
    let victoryMessage = '';
    let messageClass: string, headerImage: string, headerAlt: string;
    let players: string[];
    if (
      state === LobbyState.FASCIST_VICTORY_ELECTION ||
      state === LobbyState.FASCIST_VICTORY_POLICY
    ) {
      players = fascistPlayers.concat(liberalPlayers);
      headerImage = A.victoryFascistHeader;
      headerAlt = 'Fascist Victory, written in red with a skull icon.';
      messageClass = 'highlight';
      victoryMessage =
        state === LobbyState.FASCIST_VICTORY_POLICY
          ? 'Fascists successfully passed six policies!'
          : 'Fascists successfully elected Hitler as chancellor!';
    } else {
      players = liberalPlayers.concat(fascistPlayers);
      headerImage = A.victoryLiberalHeader;
      headerAlt = 'Liberal Victory, written in blue with a dove icon.';
      messageClass = 'highlight-blue';
      victoryMessage =
        state === LobbyState.LIBERAL_VICTORY_POLICY
          ? 'Liberals successfully passed five policies!'
          : 'Liberals successfully executed Hitler!';
    }

    victoryMessage = this.props.victoryMessage ?? victoryMessage;
    this.addAnimationToQueue(() => {
      this.setState({
        alertContent: (
          <ButtonPrompt
            renderLabel={() => (
              <>
                <img src={headerImage} alt={headerAlt} id="victory-header" />
                <p style={{ textAlign: 'center' }} className={messageClass}>
                  {victoryMessage}
                </p>
              </>
            )}
            renderButton={this.props.renderVictoryButtons ?? (() => null)}
          >
            <PlayerDisplay
              players={players}
              playerDisabledFilter={DISABLE_NONE}
              showRoles={true}
              showLabels={false}
              useAsButtons={false}
              user={name}
              gameState={newState}
            />
          </ButtonPrompt>
        ),
        showAlert: true,
      });
    });
  }

  // </editor-fold>

  // <editor-fold desc="Animation Handling">

  /** Plays the next animation in the queue if it exists. */
  onAnimationFinish() {
    if (this.animationQueue.length > 0) {
      const func = this.animationQueue.shift();
      func?.();
    } else {
      // the animation queue is empty, so we set a flag.
      this.allAnimationsFinished = true;
      this.setState({ allAnimationsFinished: true });
    }
  }

  /** Adds the animation to the end of the queue, and starts it if nothing is playing. */
  addAnimationToQueue(func: () => void) {
    this.animationQueue.push(func);
    if (this.allAnimationsFinished) {
      this.allAnimationsFinished = false;
      this.setState({ allAnimationsFinished: false });
      const next = this.animationQueue.shift();
      next?.();
    }
  }

  showVotes(newState: GameState) {
    this.setState({ statusBarText: 'Tallying votes...' });
    this.later(() => this.setState({ showVotes: true }), 1000);
    let noVotes = 0;
    let yesVotes = 0;
    Object.values(newState.userVotes).forEach((value) => {
      if (value) yesVotes++;
      else noVotes++;
    });
    this.later(() => {
      this.setState({
        statusBarText:
          yesVotes + ' - ' + noVotes + (yesVotes > noVotes ? ': Vote passed' : ': Vote failed'),
      });
    }, 2000);
    this.later(() => this.setState({ showVotes: false, statusBarText: '' }), 6000);
    this.later(() => this.onAnimationFinish(), 6500);
  }

  /** Hides the alert and moves the queue on (after the alert has faded, if delayExit). */
  hideAlertAndFinish(delayExit = true) {
    this.setState({ showAlert: false });
    if (delayExit) {
      this.later(() => {
        this.setState({ alertContent: <div /> }); // reset the alert box contents
        this.onAnimationFinish();
      }, CUSTOM_ALERT_FADE_DURATION);
    } else {
      this.setState({ alertContent: <div /> });
      this.onAnimationFinish();
    }
  }

  /** Shows the event bar with the message for `duration` ms. */
  queueEventUpdate(message: string, duration = 2000) {
    this.addAnimationToQueue(() => {
      this.setState({ showEventBar: true, eventBarMessage: message });
      this.later(() => this.setState({ showEventBar: false }), duration);
      this.later(() => this.onAnimationFinish(), duration + EVENT_BAR_FADE_OUT_DURATION);
    });
  }

  /**
   * Queues a popup. With closeOnOK, it closes once the server takes the move made from it.
   * A screen that only watches can't press OKAY, so its popups close themselves.
   */
  queueAlert(content: ReactNode, closeOnOK = true) {
    this.addAnimationToQueue(() => {
      this.setState({ alertContent: content, showAlert: true });
      if (this.watching) {
        this.later(() => this.hideAlertAndFinish(), WATCHING_ALERT_MS);
      } else if (closeOnOK) {
        // No exit delay when waiting for the server, or the player lags behind everyone else.
        this.okMessageListeners.push(() => this.hideAlertAndFinish(false));
      }
    });
  }

  /** Sets the status bar text, then moves straight on. */
  queueStatusMessage(message: string) {
    this.addAnimationToQueue(() => {
      this.setState({ statusBarText: message });
      this.onAnimationFinish();
    });
  }

  // </editor-fold>

  override render() {
    const gs = this.state.gameState;
    const name = this.name;
    return (
      <div className="App" style={{ textAlign: 'center' }}>
        <header className="App-header">{this.props.header ?? 'SECRET HITLER'}</header>

        <CustomAlert show={this.state.showAlert}>{this.state.alertContent}</CustomAlert>

        <EventBar show={this.state.showEventBar} message={this.state.eventBarMessage} />

        <div style={{ backgroundColor: 'var(--backgroundDark)' }}>
          <PlayerDisplay
            gameState={gs}
            user={name}
            showVotes={this.state.showVotes}
            showBusy={this.state.allAnimationsFinished} // Only show busy when there isn't an active animation.
            playerDisabledFilter={DISABLE_EXECUTED_PLAYERS}
            seatTransitions
          />
        </div>

        <StatusBar>{this.state.statusBarText}</StatusBar>

        <FitToScreen>
          <div
            id="Board Layout"
            style={{
              alignItems: 'center',
              display: 'flex',
              flexDirection: 'column',
              margin: '10px auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                marginTop: '15px',
              }}
            >
              <Deck cardCount={this.state.drawDeckSize} deckType="DRAW" />

              <div style={{ margin: 'auto auto' }}>
                <button
                  disabled={
                    this.watching ||
                    gs.state !== LobbyState.POST_LEGISLATIVE ||
                    name !== gs.president
                  }
                  onClick={() => this.sendWSCommand({ command: WSCommandType.END_TERM })}
                >
                  {' '}
                  END TERM
                </button>

                <PlayerPolicyStatus
                  numFascistPolicies={this.state.fascistPolicies}
                  numLiberalPolicies={this.state.liberalPolicies}
                  playerCount={gs.playerOrder.length}
                  lineup={gs.lineup}
                  deckTotal={gs.deckTotal}
                />
              </div>

              <Deck cardCount={this.state.discardDeckSize} deckType="DISCARD" />
            </div>

            <Board
              numPlayers={gs.playerOrder.length}
              numFascistPolicies={this.state.fascistPolicies}
              numLiberalPolicies={this.state.liberalPolicies}
              electionTracker={this.state.electionTracker}
            />
          </div>
        </FitToScreen>

        <div style={{ textAlign: 'center' }}>
          <div id="snackbar">{this.state.snackbarMessage}</div>
        </div>
      </div>
    );
  }
}
