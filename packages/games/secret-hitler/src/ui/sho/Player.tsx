'use client';

import { useState } from 'react';
import portraits, { A, defaultPortrait, portraitsAltText } from './assets';
import { Textfit } from './Textfit';
import { Role } from './types';

type PlayerProps = {
  isBusy?: boolean;
  name?: string;
  role?: string;
  showRole?: boolean;
  disabled?: boolean;
  disabledText?: string;
  useAsButton?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
  highlight?: boolean;
  showVote?: boolean;
  vote?: boolean;
  icon?: string;
};

const capitalizeFirstOnly = (text: string) =>
  text.charAt(0).toUpperCase() + text.toLowerCase().substring(1);

/**
 * A visual representation of a player, including their name and (optionally) their role.
 * secret-hitler.online's player/Player.js.
 */
export default function Player({
  isBusy = false,
  name = 'Name Here',
  role = 'FASCIST',
  showRole = true,
  disabled = false,
  disabledText = 'EXECUTED',
  useAsButton = false,
  isSelected = false,
  onClick = () => {},
  highlight = false,
  showVote = false,
  vote = false,
  icon = defaultPortrait,
}: PlayerProps) {
  const [initialState, setInitialState] = useState(true);
  const [initialVoteState, setInitialVoteState] = useState(true);
  if (initialState && isBusy) setInitialState(false);
  if (showVote && initialVoteState) setInitialVoteState(false);

  const getIcon = () =>
    role === Role.LIBERAL ? A.iconLiberal : role === Role.FASCIST ? A.iconFascist : A.iconHitler;
  const roleClass = role === Role.LIBERAL ? ' liberal-text' : '';
  const darken = disabled ? ' darken' : '';
  const highlightClass = highlight ? ' highlight' : '';
  const buttonClass =
    useAsButton && !disabled ? (isSelected ? ' selectable selected' : ' selectable') : '';
  const altText = showRole ? name + capitalizeFirstOnly(role) : name;

  return (
    <div
      id="player-container"
      className={highlightClass + darken + buttonClass}
      onClick={onClick}
      {...{ disabled }}
    >
      <img id="player-image" src={A.playerBase} alt={altText} className={darken} />

      <img id="player-icon" alt={portraitsAltText[icon]} src={portraits[icon]} className={darken} />

      <img
        id="player-busy-icon"
        src={A.iconBusy}
        className={
          initialState ? 'player-icon-default' : isBusy ? 'player-icon-show' : 'player-icon-hide'
        }
        alt=""
      />

      <img
        id="player-icon-vote"
        className={
          initialVoteState
            ? 'player-icon-default'
            : showVote
              ? 'player-icon-show'
              : 'player-icon-hide'
        }
        src={vote ? A.iconJa : A.iconNein}
        alt=""
      />

      {/* Conditionally rendered so information is not visible in Inspector view */}
      {showRole && (
        <>
          <img id="player-identity-icon" className={darken} src={getIcon()} alt={altText} />
          <p id="player-identity-label" className={roleClass + darken + ' force-update'}>
            {capitalizeFirstOnly(role)}
          </p>
        </>
      )}

      <Textfit id="player-name" className={darken + ' force-update'}>
        {name}
      </Textfit>

      <p id="player-disabled-label" hidden={!disabled}>
        {disabledText}
      </p>
    </div>
  );
}
