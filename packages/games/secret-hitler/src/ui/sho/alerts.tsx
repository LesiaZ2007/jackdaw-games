'use client';

import { useEffect, useState } from 'react';
import { A } from './assets';
import ButtonPrompt from './ButtonPrompt';
import { LIBERAL, Role, type GameState } from './types';

/** secret-hitler.online's custom-alert popups that show something happening. */

// <editor-fold desc="RoleAlert">

const LiberalImagesAltText = [
  'Your secret role is LIBERAL. The card shows a bespectacled man with a pipe giving a side-eye.',
  'Your secret role is LIBERAL. The card shows an elegant woman with curly hair and pearls.',
  'Your secret role is LIBERAL. The card shows a round-chinned man in a pilgrim-esque hat gazing quizzically at the camera.',
  'Your secret role is LIBERAL. The card shows a sharp-suited man sporting a fedora and a neatly-trimmed mustache.',
  'Your secret role is LIBERAL. The card shows an elderly woman with comically large glasses holding a chihuahua.',
  'Your secret role is LIBERAL. The card shows a woman with a large sun hat and shoulder-length bob smirking.',
];
const HitlerImagesAltText = [
  'Your secret role is HITLER. The card shows a crocodile in a suit and WW2 German military hat glaring at the camera.',
];
const FascistImagesAltText = [
  'Your secret role is FASCIST. The card shows a snake emerging from a suit covered in military medals.',
  'Your secret role is FASCIST. The card shows an iguana in a German military hat and suit with fangs bared.',
  'Your secret role is FASCIST. The card shows an iguana in a German military hat and suit with fangs bared.',
];

const LiberalText = [
  'You win if the board fills with liberal policies, or if Hitler is executed.',
  'You lose if the board fills with fascist policies, or if Hitler is elected chancellor after 3 fascist policies are passed.',
  'Keep your eyes open and look for suspicious actions. Suss out Hitler, and remember that anyone might be lying!',
];
const FascistText = [
  'You win if Hitler is successfully elected chancellor once 3 fascist policies are on the board, or if the board fills with fascist policies.',
  'You lose if the board fills with liberal policies or if Hitler is executed.',
  'Keep suspicion off of Hitler and look for ways to throw confusion into the game.',
];
const HitlerText = [
  'You win if you are successfully elected chancellor once 3 fascist policies are on the board, or if the board fills with fascist policies.',
  'You lose if the board fills with liberal policies or if you are executed.',
  'Try to gain trust and rely on the other fascists to open opportunities for you.',
];

/** Your role card and how to win, shown when the game starts. */
export function RoleAlert({
  role,
  name,
  gameState,
  onClick,
}: {
  role?: Role;
  name: string;
  gameState: GameState;
  onClick: () => void;
}) {
  let images: string[];
  let imageAlts: string[];
  switch (role) {
    case Role.LIBERAL:
      images = A.roleLiberal;
      imageAlts = LiberalImagesAltText;
      break;
    case Role.FASCIST:
      images = A.roleFascist;
      imageAlts = FascistImagesAltText;
      break;
    default: // Hitler
      images = [A.roleHitler];
      imageAlts = HitlerImagesAltText;
  }
  const playerIndex = gameState.playerOrder.indexOf(name);
  const roleId = Math.max(0, playerIndex) % images.length;

  let roleText = HitlerText;
  if (role === Role.FASCIST) roleText = FascistText;
  else if (role === Role.LIBERAL) roleText = LiberalText;

  return (
    <div>
      <div>
        <h2 id="alert-header" className="left-align">
          YOU ARE: {role}
        </h2>
        <img id="role" src={images[roleId]} alt={imageAlts[roleId]} />

        <p className="left-align">{roleText[0]}</p>
        <p className="left-align">{roleText[1]}</p>
        <p className="highlight left-align">{roleText[2]}</p>
      </div>

      <button onClick={onClick}>OKAY</button>
    </div>
  );
}

// </editor-fold>

/** The tracker token slides one step along the election tracker. */
export function ElectionTrackerAlert({
  trackerPosition,
  closeAlert,
}: {
  trackerPosition: number;
  closeAlert: () => void;
}) {
  const [trackerClass, setTrackerClass] = useState('et-position-' + (trackerPosition - 1));
  useEffect(() => {
    const t = setTimeout(() => setTrackerClass('et-moveto-' + trackerPosition), 500);
    return () => clearTimeout(t);
  }, [trackerPosition]);
  return (
    <ButtonPrompt
      label="LEGISLATURE FAILED"
      renderHeader={() => (
        <>
          <p className="left-align">
            The election tracker advances by 1 every time a government fails to (or refuses to) pass
            a policy, and resets whenever a policy is passed.
          </p>
          <p className="left-align highlight">
            When the tracker reaches 3, the top policy on the draw deck is instantly passed. No
            presidential powers trigger and all term limits will be reset.
          </p>
        </>
      )}
      buttonText="OKAY"
      buttonOnClick={closeAlert}
    >
      <div id="election-tracker-container">
        <img
          id="election-tracker-board"
          src={A.boardElectionTracker}
          alt="The election tracker board. A blue board with four circles, which the election tracker advances along."
        />
        <img
          id="election-tracker-token"
          className={trackerClass}
          src={A.boardTracker}
          alt={'The election tracker token. It is at position ' + trackerPosition + ' out of 3.'}
        />
      </div>
    </ButtonPrompt>
  );
}

/** The new policy slides out of a manila folder. */
export function PolicyEnactedAlert({
  hideAlert,
  policyType,
}: {
  hideAlert: () => void;
  policyType: string;
}) {
  const [className, setClassName] = useState('');
  useEffect(() => {
    const shift = setTimeout(() => setClassName('show-policy-shift'), 500);
    const flip = setTimeout(() => setClassName('show-policy-flip show-policy-shift'), 1000);
    return () => {
      clearTimeout(shift);
      clearTimeout(flip);
    };
  }, []);
  const liberal = policyType === LIBERAL;
  return (
    <ButtonPrompt
      renderLabel={() => <h2 className="left-align">POLICY ENACTED</h2>}
      buttonText="OKAY"
      buttonOnClick={hideAlert}
    >
      <div id="policy-enacted-container">
        <img id="policy-enacted-back" className={className} src={A.folderBack} alt="" />
        <img
          id="policy-enacted-policy"
          className={className}
          src={liberal ? A.policyLiberal : A.policyFascist}
          alt={
            liberal
              ? "A liberal policy that was enacted! It's printed in blue with a dove insignia on it."
              : "A fascist policy that was enacted! It's printed in red with a skull insignia on it."
          }
        />
        <img
          id="policy-enacted-cover-back"
          src={A.folderCoverBack}
          className={className}
          alt="A manila folder labeled 'New Policy.'"
        />
        <img
          id="policy-enacted-cover-front"
          src={A.folderCoverFront}
          className={className}
          alt="A manila folder labeled 'New Policy.'"
        />
      </div>
    </ButtonPrompt>
  );
}

/** The president's investigation: the party card flips over. */
export function InvestigationAlert({
  party,
  target,
  hideAlert,
}: {
  party: string;
  target: string;
  hideAlert: () => void;
}) {
  const [flipCard, setFlipCard] = useState(false);
  const [showText, setShowText] = useState(false);
  useEffect(() => {
    const flip = setTimeout(() => setFlipCard(true), 1000);
    const text = setTimeout(() => setShowText(true), 1500);
    return () => {
      clearTimeout(flip);
      clearTimeout(text);
    };
  }, []);
  const alt = target + ' is a member of the ' + party + ' party.';
  const cardClass = flipCard ? 'investigation-container-flip' : 'investigation-container-default';
  return (
    <ButtonPrompt
      label="INVESTIGATION RESULTS"
      renderFooter={() => (
        <p
          id="investigation-text"
          className={showText ? 'investigation-text-show' : 'investigation-text-hide'}
        >
          {target + ' is a member of the ' + party + ' party.'}
        </p>
      )}
      buttonOnClick={hideAlert}
      buttonDisabled={!showText}
      buttonText="OKAY"
    >
      <div id="party-card-container">
        <img id="party-card-back" className={cardClass} src={A.partyBack} alt={alt} />
        <img
          id="party-card-front"
          className={cardClass}
          src={party === LIBERAL ? A.partyLiberal : A.partyFascist}
          alt={alt}
        />
      </div>
    </ButtonPrompt>
  );
}
