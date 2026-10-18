'use client';

import portraits, { choosablePortraits, defaultPortrait, portraitsAltText } from './assets';
import ButtonPrompt from './ButtonPrompt';

/**
 * secret-hitler.online's custom-alert/IconSelection.tsx: pick a portrait; ones other players
 * have are greyed out. (The site hides half of them until you share it on Twitter; here they
 * are all open, since a table can seat 15.)
 */
export default function IconSelection({
  playerToIcon,
  players,
  user,
  onSelect,
  onConfirm,
}: {
  playerToIcon: Record<string, string>;
  players: string[];
  user: string;
  onSelect: (icon: string) => void;
  onConfirm: () => void;
}) {
  const isIconInUse = (iconID: string) => players.some((p) => playerToIcon[p] === iconID);
  const currPortrait = playerToIcon[user];

  const onClickIcon = (iconID: string) => {
    // Does not allow selection if someone has already selected this icon
    if (!isIconInUse(iconID)) onSelect(iconID);
  };

  return (
    <ButtonPrompt
      label="PLAYER LOOK"
      renderHeader={() => (
        <>
          <p>Choose a look, then press confirm.</p>
          <div id="icon-container">
            {choosablePortraits.map((portraitID) => {
              const isEnabled = !isIconInUse(portraitID) || portraitID === currPortrait;
              const isSelected = currPortrait === portraitID;
              return (
                <img
                  id="icon"
                  key={portraitID}
                  className={
                    'selectable' + (isSelected ? ' selected' : '') + (!isEnabled ? ' disabled' : '')
                  }
                  alt={portraitsAltText[portraitID]}
                  src={portraits[portraitID]}
                  draggable={false}
                  onClick={() => onClickIcon(portraitID)}
                />
              );
            })}
          </div>
        </>
      )}
      renderFooter={() => null}
      buttonDisabled={currPortrait === defaultPortrait}
      buttonOnClick={() => {
        if (currPortrait !== defaultPortrait) onConfirm();
      }}
    />
  );
}
