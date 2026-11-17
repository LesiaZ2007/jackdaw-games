/** Original, more demanding vocabulary and clue writing. Server only. */
export const CHALLENGE_WORDS = `
ACROSTIC|A message hiding at the beginnings of lines
ALGORITHM|A recipe whose ingredients can be instructions
AMBIGUOUS|Open to more than one reading
ANACHRONISM|A clock in a Roman drama might be one
ANALOGY|A bridge built between ideas
ANAGRAM|A new arrangement with the same cast of letters
ANTITHESIS|An idea's direct opposite
APERTURE|The opening that lets a camera see the light
ARCHIPELAGO|A sea's scattered collection of islands
ASTROLABE|An old navigator's star-measuring instrument
ASYMMETRY|A lack of mirror agreement
ATMOSPHERE|A planet's gaseous envelope
ATTENUATE|Make weaker or less intense
AUGMENT|Add to, rather than diminish
AUSPICIOUS|Promising a favourable beginning
AUTONOMY|The freedom to govern oneself
BAROMETER|A pressure-sensitive forecaster
BELLWETHER|An early indicator of a wider trend
BIBLIOPHILE|One who finds fine company between covers
BIFURCATE|Split into two branches
BIOGRAPHY|A life given in another person's words
BLUEPRINT|A plan, once commonly printed in blue
BUTTRESS|A support against sideways pressure
CALIBRATE|Adjust against a known standard
CARTOGRAPHY|The art that puts places in their places
CATALYST|An agent of change that need not be consumed
CATHEDRAL|A bishop's seat may be found here
CHRONICLE|A record that follows time's order
CIRCUMFERENCE|The long way around a circle
CLANDESTINE|Kept carefully out of the public eye
COALESCE|Come together to form a whole
COINCIDENCE|A meeting of events without a planned appointment
COMPENDIUM|Much information in a compact collection
CONFLUENCE|A meeting of rivers, or of ideas
CONJECTURE|An educated guess awaiting its proof
CONSENSUS|Agreement reached across a group
CONSTELLATION|A stellar pattern with a familiar name
CONTRADICT|Say what cannot agree with an earlier claim
COUNTERPOINT|Independent melodies in conversation
CREDIBLE|Worthy of belief
CRYPTOGRAM|A message behind a substitution
DECIPHER|Turn a secret text into a readable one
DELIBERATE|Done on purpose, or think things through
DICHOTOMY|A division into two contrasting parts
DILIGENCE|Care that keeps showing up for work
DISSONANCE|A clash that music need not avoid
DIVERGENCE|A growing separation of paths
ECCENTRIC|Off-centre, in geometry or in behaviour
ECOSYSTEM|A community and the environment it depends on
EFFERVESCENT|Bubbling with gas or with enthusiasm
ELOQUENCE|The art of making words carry well
EMBELLISH|Add decorative details, perhaps to a story
EMPIRICAL|Based on observation rather than theory alone
ENIGMATIC|Not readily understood
ENTROPY|A thermodynamic measure associated with disorder
EPHEMERAL|Here briefly, then gone
EQUILIBRIUM|A state with no net push one way or the other
EQUINOX|A seasonal point when day and night are nearly equal
ETYMOLOGY|The family history of a word
EXTRAPOLATE|Extend a known pattern beyond the observations
FACSIMILE|A close reproduction of an original
FJORD|A steep-sided inlet shaped by ice
FOLIAGE|A tree's collective summer wear
FORTUITOUS|Happening by chance
FRACTAL|A pattern with detail at many scales
FULCRUM|A lever's point of support
GARRULOUS|Inclined to use rather more words than needed
GEOMETRY|The mathematics of shape and space
GREGARIOUS|Inclined to seek company
HABITAT|An organism's natural address
HEMISPHERE|Half a globe
HIERARCHY|A system with levels of authority
HYPOTHESIS|A proposed explanation ready to be tested
ILLUMINATE|Shed light, literally or figuratively
IMPLICIT|Present without being directly stated
INFERENCE|A conclusion reached from what is given
INTRICATE|Made of many closely connected details
IRIDESCENT|Changing colour as the viewing angle changes
ISOTHERM|A map line joining equal temperatures
JUXTAPOSE|Put side by side for comparison
KALEIDOSCOPE|A turning source of changing symmetrical patterns
LABYRINTH|A maze with an ancient reputation
LACONIC|Making a few words do the work
LATITUDE|Distance north or south, or room to act
LEXICON|A word collection
LIMESTONE|A rock that may keep a record of shells
LONGITUDE|Distance measured east or west of a meridian
LUMINESCENT|Giving off light without needing to be hot
MAGNANIMOUS|Generous, especially towards a rival
MANUSCRIPT|A text before it goes to print
METAPHOR|One thing spoken of as another
METICULOUS|Attentive to the smallest details
MICROCOSM|A small world reflecting a larger one
MNEMONIC|An aid for an unreliable memory
MONOLOGUE|A speech without a conversational partner
MOSAIC|A whole assembled from many small pieces
MYRIAD|A great number, traditionally ten thousand
NAVIGATION|The business of getting one's bearings
NEBULOUS|Cloudy in outline or in meaning
NOMADIC|Moving home rather than settling in one place
NOSTALGIA|A longing with its eyes on the past
OBLIQUE|Indirect, or neither parallel nor perpendicular
OBSIDIAN|Volcanic glass with a dark appearance
OMNIVORE|An eater that includes plants and animals
ONOMATOPOEIA|A name for words that sound like their subjects
ORCHESTRATE|Arrange many parts to work together
PALINDROME|A word that is itself on reflection
PALIMPSEST|A manuscript written over an earlier erased text
PANORAMA|A view with room to spare
PARADOX|A statement that appears to argue with itself
PARALLEL|Lines of thought that may never meet
PENINSULA|Land with water nearly all around it
PERENNIAL|Returning year after year
PERIPHERY|The outer reaches
PERSPICACIOUS|Quick to perceive what others may miss
PHENOMENON|Something observed, especially when remarkable
PHOTOSYNTHESIS|The process that turns light into stored plant energy
PILGRIMAGE|A journey with a spiritual destination
PLATEAU|A high place that has levelled off
PRAGMATIC|Concerned with what works in practice
PRECEDENT|An earlier case that can guide a later one
PROLIFIC|Producing in abundance
PROTAGONIST|The character at the centre of the story
QUANDARY|A choice that is hard to choose
QUINTESSENCE|The most perfect example of a quality
RECIPROCAL|Given back in kind, or the inverse of a number
RECONCILE|Bring differing accounts into agreement
RESONANCE|A sympathetic vibration or a lasting significance
RHETORIC|The art of persuasion in words
SAGACIOUS|Showing sound judgement
SANCTUARY|A refuge protected from disturbance
SERENDIPITY|A fortunate discovery made without looking for it
SILHOUETTE|An outline that has lost its inner detail
SOLILOQUY|A character's thoughts spoken without company
STALACTITE|A cave formation that hangs from above
STALAGMITE|A cave formation growing from below
STRATOSPHERE|The atmospheric layer above the troposphere
SUBTERRANEAN|Below the surface of the ground
SYMMETRY|Agreement across a line of reflection
SYNCHRONISE|Bring separate clocks into agreement
TANGENTIAL|Touching a subject without entering its centre
TELESCOPE|A distant-viewing instrument
TOPOGRAPHY|The shape and features of a landscape
TRANSLUCENT|Letting light pass without giving a clear view
TRIANGULATE|Find a position using angles from known points
UBIQUITOUS|Seemingly present everywhere
UNDULATE|Move in a succession of waves
UNPRECEDENTED|Without an earlier example
VERNACULAR|The language of everyday use
VERSATILE|Able to turn to many different tasks
VICARIOUS|Experienced through somebody else's experience
VINDICATE|Show to have been right after all
WATERSHED|A drainage divide, or a decisive turning point
WHIMSICAL|Guided by playful or fanciful ideas
ZEITGEIST|The spirit of a particular time
ZEPHYR|A gentle breeze with a classical name
`
  .trim()
  .split('\n')
  .map((line) => {
    const [answer, ...clue] = line.split('|');
    return { answer: answer!, clue: clue.join('|') };
  });
/** Indirect alternatives for familiar crossing words. */
export const HARD_CLUES: Record<string, string> = {
  ACE: 'One at either end of a straight, depending on the game',
  ACT: 'A play may have several; a deed is one',
  AGE: 'What a birthday keeps adding to',
  AIR: 'A tune, or something a tyre may lack',
  ARC: 'A circle, in part',
  ARM: 'A chair may have one or two',
  ART: 'Work that may be framed',
  ASH: 'What a blaze leaves behind',
  ATE: 'Had a bite, perhaps',
  BAT: 'A nocturnal flier, or a hitter’s tool',
  BAY: 'A horse’s colour, or a coastal curve',
  BED: 'A river has one even when dry',
  BEE: 'A worker with a queen',
  BOW: 'It can launch an arrow or follow applause',
  BOX: 'A ring event, as a verb',
  BUS: 'A vehicle that makes frequent scheduled stops',
  CAP: 'A limit that can also be worn',
  CAT: 'A pet with a rumbling idle',
  COIN: 'Something with a head and a tail but no body',
  CROW: 'A bird, or boast about success',
  DAY: 'A date’s time allowance',
  DEN: 'A home that might belong to a bear or a family',
  DOG: 'Follow persistently, or a four-legged companion',
  DOT: 'A point with little to say',
  DRY: 'Without water, or without much humour',
  EAR: 'A listener on the side',
  EGG: 'A bird’s beginning, in a shell',
  END: 'Where the beginning was heading',
  ERA: 'A stretch with a place in history',
  EYE: 'It may be in the middle of a storm',
  FAN: 'A supporter who may also move air',
  FIR: 'A needle-bearing evergreen',
  FLY: 'Travel without keeping one’s feet on the ground',
  FOX: 'Outwit, or a creature said to do so',
  GAP: 'Something to mind on a station platform',
  GEM: 'A stone worth keeping',
  HAM: 'A performer who overdoes it, or something cured',
  HAT: 'Head office cover?',
  HEN: 'A layer with feathers',
  HUG: 'A close form of greeting',
  ICE: 'A rink’s working surface',
  INK: 'A pen’s working capital',
  INN: 'A place for a traveller to turn in',
  KEY: 'A lock’s partner, or a solution',
  LAP: 'A race may have many; a sitter has one',
  LEG: 'A table’s support, or part of a journey',
  LID: 'A container’s ceiling',
  LOG: 'A record that may also fuel a fire',
  MAP: 'It can show a way without taking a step',
  MUG: 'A cup, or overact for a camera',
  NET: 'A catch-maker with plenty of holes',
  NOD: 'A little yes from the head',
  NUT: 'An edible kernel, or a threaded fastener',
  OAR: 'A rower’s lever',
  OAK: 'An acorn’s long-term prospect',
  ODE: 'A poem that has someone or something to praise',
  ORE: 'A rock with work for a smelter',
  OWL: 'A hunter that takes the night shift',
  PAN: 'A kitchen vessel, or a harsh review',
  PAW: 'An animal’s hand, informally',
  PEA: 'A pod’s little occupant',
  PEN: 'A writing implement, or an animal enclosure',
  PET: 'A favourite kept close to home',
  PIE: 'A dish that can be humble, figuratively',
  PIN: 'A little fastener that may hold things together',
  PIT: 'A peach’s hard centre',
  POT: 'Something a cook may put on, or a player may win',
  RAY: 'A beam, or a flat swimmer',
  RIB: 'Tease, or a chest supporter',
  RIM: 'The outside of a wheel',
  ROW: 'A line of seats, or move a boat',
  SEA: 'Water with room for an ocean-going ship',
  SEW: 'Make a joint with a needle',
  SKI: 'A runner suited to going downhill',
  SKY: 'The limit, to an optimist',
  SLY: 'Like a plan kept quietly up one’s sleeve',
  SON: 'A child who may be somebody’s junior',
  SPY: 'A watcher who would rather not be seen',
  SUM: 'An addition’s conclusion',
  SUN: 'The nearest star, without celebrity status',
  TAP: 'Draw liquid from, or touch lightly',
  TEA: 'A cup with leaves in its past',
  TIE: 'A draw that can be worn',
  TIN: 'A can’s namesake metal',
  TOP: 'A peak that might also spin',
  WEB: 'A silk trap with many connections',
  ZIP: 'A fastener, or move briskly',
  AREA: 'What length times width gives a rectangle',
  BARK: 'A tree’s outer coat, or a dog’s warning',
  BEAK: 'An avian bill, never an invoice',
  BEAR: 'Carry, tolerate, or a large mammal',
  BELL: 'Something that is struck to make a point in sound',
  BONE: 'A skeleton’s building material',
  BOOK: 'Reserve, or something with covers',
  BOOT: 'Footwear that can mean dismissal',
  BOWL: 'A dish, or deliver a ball towards pins',
  CAKE: 'Something a successful task is said to be a piece of',
  CAPE: 'A cloak that can also be a point of land',
  CAVE: 'Give way, or a hollow in rock',
  COAT: 'One layer of paint, perhaps',
  CONE: 'A shape that may carry a scoop',
  CORK: 'A bottle’s little gatekeeper',
  DAWN: 'Become clear, or the beginning of light',
  DICE: 'The things a chance-taker may roll',
  DOOR: 'An entrance on hinges',
  ECHO: 'A reply without a new speaker',
  ERAS: 'Chapters on history’s longest shelf',
  ERRS: 'Strays from the right answer',
  FACE: 'A clock has one but cannot smile',
  FARM: 'A place where fields are put to work',
  FIRE: 'Dismiss, or a hot situation',
  FLAG: 'A national emblem, or grow tired',
  FORK: 'A branching point that may be on the table',
  GATE: 'A fence’s way through',
  GOLD: 'First-place metal',
  HARP: 'Dwell repeatedly on something, or a stringed instrument',
  HOME: 'Where an away side would rather win',
  IRIS: 'An eye’s adjustable coloured ring',
  KITE: 'A toy that needs a line and a breeze',
  KNOT: 'A rope’s complication',
  LAMP: 'A little light industry on a desk',
  LEAF: 'A tree’s page',
  LION: 'A cat with a royal reputation',
  LOOM: 'A weaving machine, or appear threateningly',
  MAST: 'A sail’s upright support',
  MOON: 'Earth’s regular night companion',
  NAIL: 'A hammer’s point of contact',
  NEST: 'A place a bird may feather',
  NOTE: 'A short message that could be musical',
  PAGE: 'One side of a book’s leaf',
  PINE: 'Long for, or a cone-bearing tree',
  RAIN: 'Weather that may upset an outdoor parade',
  RING: 'A band that may be heard',
  ROAD: 'A way for traffic to make headway',
  ROOT: 'A plant’s underground connection',
  ROSE: 'Went up, or a flower with thorns',
  SAIL: 'Put the wind to work at sea',
  SEAL: 'Make secure, or a flippered swimmer',
  SEAT: 'A chair’s purpose, or an elected position',
  SEED: 'A plant’s first small investment',
  SHIP: 'Send out, or a large vessel',
  SILK: 'A fabric with a cocoon in its past',
  SLIP: 'A small mistake, or lose one’s footing',
  SNOW: 'A fall made of flakes',
  SOAP: 'A washroom bar',
  SOFT: 'Yielding to pressure',
  SOLE: 'A shoe’s bottom, or the only one',
  SONG: 'A piece that needs a tune',
  STAR: 'A leading light, literally or on stage',
  STEM: 'A flower’s support, or hold back a flow',
  STEP: 'One part of a walk, or of a plan',
  TAIL: 'The end of many an animal',
  TIDE: 'A rise and fall that answers to the Moon',
  TIME: 'Something a clock keeps',
  TREE: 'An acorn’s possible future',
  VASE: 'A cut flower’s new address',
  WAVE: 'A greeting from the sea?',
  WIND: 'A breeze, or turn a clock’s key',
  WING: 'A bird’s means of taking off',
  WOOD: 'A tree’s solid contribution',
  WOOL: 'A sheep’s annual contribution to clothing',
  ARIAS: 'Solos that might fill an opera house',
  NAILS: 'A carpenter drives these points home',
  TENTS: 'Homes that can be folded away',
  TEXTS: 'Messages that need no stamp',
  TAXED: 'Made a levy on, or put under strain',
  TINED: 'Equipped with a fork’s points',
};
