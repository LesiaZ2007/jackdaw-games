'use client';

import { Component } from 'react';
import { A } from './assets';

/**
 * secret-hitler.online's board/Deck.js: a pile of policy backs that slide in or out one at a
 * time when the count changes, with the count printed on the pile.
 */

const MAX_CARDS = 17;
// The final locations for cards in the hide/show states (or the start for the transitions).
const FINAL_HIDE = 'deck-final-hide';
const FINAL_SHOW = 'deck-final-show';
const TRANSITION_SHOW = 'deck-transition-show';
const TRANSITION_HIDE = 'deck-transition-hide';

type DeckProps = { cardCount: number; deckType: 'DRAW' | 'DISCARD' };
type DeckState = { playingAnimation: boolean; cardCount: number };

export default class Deck extends Component<DeckProps, DeckState> {
  cardStates: string[];
  numCards: number;
  timers: ReturnType<typeof setTimeout>[] = [];

  constructor(props: DeckProps) {
    super(props);
    this.state = { playingAnimation: false, cardCount: props.cardCount };
    this.numCards = props.cardCount;
    this.cardStates = [];
    for (let i = 0; i < MAX_CARDS; i++) {
      this.cardStates[i] = i < props.cardCount ? FINAL_SHOW : FINAL_HIDE;
    }
  }

  later(fn: () => void, ms: number) {
    this.timers.push(setTimeout(fn, ms));
  }

  override componentDidUpdate() {
    const oldCount = this.state.cardCount;
    const newCount = this.props.cardCount;

    // If the number of cards in this deck has changed, play an animation in response.
    if (oldCount !== newCount && !this.state.playingAnimation) {
      this.setState({ playingAnimation: true });
      let delayNext: number, delayChangeState: number;
      let totalDelay = 0;
      if (newCount < oldCount) {
        // Cards were taken out of the deck
        delayNext = oldCount - newCount <= 3 ? 350 : 150;
        delayChangeState = 510;
        for (let i = oldCount - 1; i >= newCount; i--) {
          // Start transition out, then move to final hidden position.
          this.later(() => {
            this.cardStates[i] = TRANSITION_HIDE;
            this.numCards = i;
            this.forceUpdate();
          }, totalDelay);
          this.later(() => {
            this.cardStates[i] = FINAL_HIDE;
            this.forceUpdate();
          }, totalDelay + delayChangeState);
          totalDelay += delayNext;
        }
      } else {
        // Cards were added to the deck
        delayNext = 150;
        delayChangeState = 300;
        for (let i = oldCount; i < newCount; i++) {
          // Start transition in, then move to final shown position.
          this.later(() => {
            this.cardStates[i] = TRANSITION_SHOW;
            this.forceUpdate();
          }, totalDelay);
          this.later(() => {
            this.cardStates[i] = FINAL_SHOW;
            this.numCards = i + 1;
            this.forceUpdate();
          }, totalDelay + delayChangeState);
          totalDelay += delayNext;
        }
      }
      // After all cards have played their animations, reset the card count and signal the end.
      this.later(() => this.setState({ playingAnimation: false, cardCount: newCount }), totalDelay);
    }
  }

  override componentWillUnmount() {
    this.timers.forEach(clearTimeout);
  }

  getCards() {
    const cards = [];
    const topOffset = 9;
    const topDistance = 2;
    for (let i = 0; i < MAX_CARDS; i++) {
      let top = topOffset - topDistance * i;
      // Move the hidden card up so it transitions in later.
      if (this.cardStates[i] === FINAL_HIDE) top -= 15;
      cards.push(
        <img
          src={A.boardPolicy}
          id="deck-policy"
          style={{ top: top + '%' }}
          className={this.cardStates[i]}
          alt={'A policy in the ' + this.props.deckType.toLowerCase() + ' deck.'}
          key={i}
        />,
      );
    }
    return cards;
  }

  override render() {
    return (
      <div id="deck-container" style={{ position: 'relative' }}>
        <p id="deck-card-count">{this.numCards}</p>
        <img
          id="deck-base"
          src={this.props.deckType === 'DRAW' ? A.boardDraw : A.boardDiscard}
          alt={
            'The ' +
            this.props.deckType.toLowerCase() +
            ' deck. (' +
            this.props.cardCount +
            ' policies)'
          }
        />
        {this.getCards()}
      </div>
    );
  }
}
