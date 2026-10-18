import { A } from './assets';

/** secret-hitler.online's board/Board.js: the Liberal and Fascist boards with their policies. */

/** The Fascist board for the player count (9–10's board serves the house rules past 10). */
function getFascistBoard(numPlayers: number) {
  if (numPlayers <= 6) return A.boardFascist56;
  if (numPlayers <= 8) return A.boardFascist78;
  return A.boardFascist910;
}

/**
 * `totalCount` tiles `spacing` apart from `offset`; the first `count` are shown (and drop in when
 * they appear), the rest hidden.
 */
function placeRepeating(
  count: number,
  totalCount: number,
  src: string,
  id: string,
  offset: string,
  spacing: string,
) {
  const images = [];
  for (let index = 0; index < totalCount; index++) {
    images.push(
      <img
        src={src}
        id={id}
        style={{ position: 'absolute', left: `calc(${offset} + ${index}*${spacing})` }}
        alt=""
        className={index < count ? 'show' : 'hide'}
        key={index}
      />,
    );
  }
  return images;
}

export default function Board({
  numFascistPolicies = 5,
  numLiberalPolicies = 6,
  electionTracker = 0,
  numPlayers = 5,
}: {
  numFascistPolicies?: number;
  numLiberalPolicies?: number;
  electionTracker?: number;
  numPlayers?: number;
}) {
  return (
    <div id="board-container" style={{ display: 'flex', flexDirection: 'column' }}>
      <div id="board-group" style={{ margin: '4px 10px', position: 'relative' }}>
        <img
          id="board"
          src={A.boardLiberal}
          alt={numLiberalPolicies + ' liberal policies have been passed.'}
        />
        <img
          id="election-tracker"
          src={A.boardTracker}
          style={{
            position: 'absolute',
            top: '74%',
            left: 'calc(34.2% + ' + electionTracker + '*9.16%)',
            width: '3.2%',
          }}
          alt={'Election tracker at position ' + electionTracker + ' out of 3.'}
        />
        {placeRepeating(numLiberalPolicies, 5, A.boardPolicyLiberal, 'policy', '18.2%', '13.54%')}
      </div>

      <div id="board-group" style={{ margin: '4px 10px', position: 'relative' }}>
        <img
          id="board"
          src={getFascistBoard(numPlayers)}
          alt={numFascistPolicies + ' fascist policies have been passed.'}
        />
        {placeRepeating(numFascistPolicies, 6, A.boardPolicyFascist, 'policy', '11%', '13.6%')}
      </div>
    </div>
  );
}
