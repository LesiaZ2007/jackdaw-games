import type { GameRegistry } from '@jackdaw/engine';
import { avalon } from '@jackdaw/game-avalon';
import { backgammon } from '@jackdaw/game-backgammon';
import { tetra } from '@jackdaw/game-tetra';
import { battleship } from '@jackdaw/game-battleship';
import { monopoly } from '@jackdaw/game-monopoly';
import { catan } from '@jackdaw/game-catan';
import { mafia } from '@jackdaw/game-mafia';
import { codenames } from '@jackdaw/game-codenames';
import { kings } from '@jackdaw/game-kings';
import { uno } from '@jackdaw/game-uno';
import { poker } from '@jackdaw/game-poker';
import { risk } from '@jackdaw/game-risk';
import { rps } from '@jackdaw/game-rps';
import { secretHitler } from '@jackdaw/game-secret-hitler';
import { wavelength } from '@jackdaw/game-wavelength';
import { wordhoard } from '@jackdaw/game-wordhoard';
import { zap } from '@jackdaw/game-zap';
import { fandango } from '@jackdaw/game-fandango';
import { solitaire } from '@jackdaw/game-solitaire';

/**
 * The one place games are registered. The room runtime runs these modules, and the catalog
 * lists their metadata. Adding a game = add its module here (screens are registered separately
 * on the client, so the server never imports React).
 */
export const games: GameRegistry = {
  [avalon.meta.id]: avalon,
  [backgammon.meta.id]: backgammon,
  [tetra.meta.id]: tetra,
  [battleship.meta.id]: battleship,
  [monopoly.meta.id]: monopoly,
  [catan.meta.id]: catan,
  [codenames.meta.id]: codenames,
  [kings.meta.id]: kings,
  [mafia.meta.id]: mafia,
  [uno.meta.id]: uno,
  [poker.meta.id]: poker,
  [risk.meta.id]: risk,
  [rps.meta.id]: rps,
  [secretHitler.meta.id]: secretHitler,
  [wavelength.meta.id]: wavelength,
  [wordhoard.meta.id]: wordhoard,
  [zap.meta.id]: zap,
  [fandango.meta.id]: fandango,
  [solitaire.meta.id]: solitaire,
};
