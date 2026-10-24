import { SPECTRUMS, type Spectrum } from './spectrums';

/**
 * Example clues for every spectrum card, each at the spot on the dial it means (0 = the left
 * word, 100 = the right). A computer psychic gives the clue nearest its target; a computer
 * guesser that hears one of these knows where it sits, and turns the dial near it. These are
 * public knowledge about words, like a person's sense of them: nothing here is hidden.
 *
 * One line per card: `Left|Right: clue @at; clue @at; ...`. clues.test.ts checks every card has
 * them and that each fits as a clue.
 */
const TABLE = `
Cold|Hot: Ice cube @3; Snowman @8; Fridge @18; Autumn morning @35; Room temperature @50; Bath water @68; Fresh toast @78; Chilli pepper @88; Lava @97
Quiet|Loud: Library @6; Whisper @12; Cat walking @22; Conversation @50; Vacuum cleaner @70; Thunder @88; Rock concert @95
Soft|Hard: Marshmallow @5; Pillow @10; Bread @30; Apple @60; Brick @85; Diamond @97
Smells bad|Smells good: Wet dog @8; Old socks @5; Bus station @25; Library book @55; Cut grass @75; Fresh bread @92; Roses @88
Tastes bad|Tastes good: Soap @3; Cough syrup @12; Plain rice @45; Toast @60; Pizza @85; Chocolate @93
Smooth|Rough: Silk @4; Glass @8; Paper @35; Denim @55; Tree bark @82; Sandpaper @95
Dry|Wet: Desert @3; Cracker @12; Towel @40; Grass in the morning @62; Puddle @85; Ocean @97
Light|Heavy: Feather @3; Paper @8; Book @35; Suitcase @62; Piano @85; Elephant @95
Tiny|Enormous: Ant @3; Coin @12; Cat @30; Car @55; House @70; Whale @85; The sun @98
Slow|Fast: Snail @3; Tortoise @8; Walking @28; Bicycle @50; Car on a motorway @72; Cheetah @85; Rocket @97
Dark|Bright: Cave at night @3; Cinema @15; Candlelit room @35; Cloudy day @55; Office lights @75; Sun @97
Bland|Spicy: Plain rice @3; Boiled potato @8; Toast @15; Ketchup @35; Pepperoni @55; Curry @75; Ghost chilli @97
Sweet|Sour: Candy floss @3; Honey @8; Strawberry @30; Orange @50; Green apple @68; Lemon @90; Vinegar @97
Squishy|Crunchy: Jelly @3; Banana @12; Bread @30; Cheese @45; Apple @75; Crisps @92; Ice cube @97
Fragile|Indestructible: Soap bubble @2; Egg @8; Wine glass @12; Phone @45; Brick @75; Anvil @92; Diamond @97
Short-lived|Lasts forever: Mayfly @3; Soap bubble @5; Snowman @20; Pet hamster @40; Tree @75; Pyramid @92; Diamond @97
Cheap|Expensive: Paperclip @2; Chocolate bar @10; T-shirt @25; Phone @60; Car @80; Mansion @92; Private jet @98
Ugly|Beautiful: Gargoyle @5; Rubbish tip @10; Car park @30; Pigeon @45; Butterfly @80; Sunset @93
Calming|Stressful: Spa day @3; Cup of tea @12; Gardening @25; Commute @60; Job interview @82; Bomb disposal @97
Natural|Artificial: Waterfall @3; Oak tree @6; Apple @12; Bread @45; Plastic @85; Robot @95
Simple|Complicated: Spoon @3; Noughts and crosses @10; Bicycle @40; Chess @65; Tax return @82; Quantum physics @97
Old-fashioned|Futuristic: Quill @3; Horse and cart @8; Typewriter @20; Landline phone @35; Smartphone @70; Robot butler @88; Teleporter @98
Messy|Tidy: Toddler's room @3; Teenager's bedroom @8; Kitchen after a party @15; Average desk @50; Hotel room @80; Operating theatre @92
Useless|Useful: Chocolate teapot @2; Broken pencil @8; Ornament @30; Umbrella @65; Knife @80; Phone @88; Water @97
Dull|Sharp: Spoon @3; Butter knife @12; Pencil @50; Scissors @70; Kitchen knife @82; Razor @95
Ordinary|Weird: Toast @3; Going to work @8; Wearing a hat @20; Pineapple on pizza @45; Platypus @75; Deep sea fish @88; Dream logic @97
Common|Rare: Pigeon @3; Grass @6; Red car @20; Left-handed @40; Four-leaf clover @75; Blue diamond @92; Dodo @99
Harmless|Dangerous: Kitten @3; Feather @6; Bee @30; Kitchen knife @50; Bear @80; Shark @85; Volcano @95
Easy to make|Hard to make: Toast @3; Cup of tea @6; Sandwich @12; Pancakes @30; Souffle @70; Wedding cake @82; Spaceship @97
Easy to carry|Impossible to carry: Feather @3; Phone @6; Book @15; Backpack @30; Sofa @75; Piano @85; Mountain @99
Silent|Deafening: Mime @3; Snow falling @8; Whisper @18; Office @40; Lawnmower @65; Jet engine @90; Volcano erupting @97
Plain|Fancy: Paper bag @3; White T-shirt @10; Jeans @30; Restaurant @55; Wedding dress @80; Palace @92
Round|Pointy: Ball @3; Orange @8; Egg @20; Pear @40; Pencil @80; Needle @95
Floats|Sinks: Rubber duck @3; Beach ball @5; Leaf @10; Wood @20; Ice @25; Person @50; Coin @85; Anchor @97
Clean|Filthy: Operating theatre @3; New towel @8; Washed car @20; Kitchen table @40; Muddy boots @75; Pigsty @92
Healthy|Unhealthy: Broccoli @3; Salad @6; Apple @10; Pasta @40; Pizza @68; Doughnut @85; Deep-fried butter @97
Mild|Intense: Warm milk @3; Breeze @10; Coffee @45; Roller coaster @80; Skydiving @90; Hurricane @97
Comfortable|Uncomfortable: Bed @3; Sofa @6; Armchair @12; Office chair @40; Bus seat @60; High heels @80; Bed of nails @97
Temporary|Permanent: Sandcastle @3; Sticky note @8; Haircut @20; Paint @55; Tattoo @85; Carved stone @95
Fresh|Stale: Just-baked bread @3; Morning dew @6; Today's news @12; Yesterday's bread @55; Old biscuit @80; Week-old crisps @92

Underrated|Overrated: Tap water @5; Libraries @12; Naps @20; Brunch @60; Avocado toast @75; Influencers @90
Boring|Exciting: Paint drying @3; Waiting room @8; Tax forms @12; Board meeting @20; Football match @65; Roller coaster @85; Skydiving @95
Guilty pleasure|Openly proud of: Reality TV @5; Eating cereal for dinner @12; Pop ballads @25; Board games @55; Marathon medal @88; Degree @92
Cringe|Cool: Dad dancing @3; Socks with sandals @10; Selfie stick @25; Sunglasses @70; Leather jacket @85; Skateboard tricks @90
Dated|Timeless: Fax machine @3; Shoulder pads @8; Flip phone @15; Jeans @75; Little black dress @88; The Beatles @92
Tacky|Classy: Garden gnome @5; Novelty tie @10; Sequin jacket @25; Candles @60; Pearl necklace @85; Black tie dinner @95
Forgettable|Unforgettable: Tuesday @3; Lift music @8; Lunch last week @15; Birthday party @60; Wedding day @88; First kiss @92
Worst invention|Best invention: Spam emails @3; Car alarms @8; Selfie stick @25; Sliced bread @80; The wheel @95; Internet @90
Mainstream|Niche: Pizza @3; Football @5; Netflix @10; Jazz @55; Bird watching @70; Competitive cheese rolling @92
Childish|Grown-up: Lollipop @3; Cartoons @8; Bouncy castle @12; Video games @40; Wine tasting @85; Mortgage @95
Lowbrow|Highbrow: Fart jokes @3; Reality TV @8; Action films @30; Crosswords @60; Opera @88; Philosophy @95
Overpriced|A bargain: Airport sandwich @3; Cinema popcorn @8; Concert tickets @25; Supermarket bread @60; Charity shop find @85; Library card @95
Hate it|Love it: Stubbing your toe @3; Mondays @10; Rain @35; Pizza @85; Puppies @93
Needs a remake|Leave it alone: Bad sequel @5; Forgotten cartoon @25; Classic film @85; The Mona Lisa @97
Bad gift|Good gift: Used socks @3; Soap on a rope @12; Novelty mug @30; Book voucher @60; Concert tickets @85; Puppy @90
Bad first date|Good first date: Dentist's waiting room @3; Funeral @2; Cinema @45; Coffee @55; Picnic in the park @80; Sunset walk @88
Bad pizza topping|Good pizza topping: Gummy bears @3; Toothpaste @2; Banana @15; Pineapple @45; Mushroom @70; Pepperoni @90
Bad holiday|Dream holiday: Rainy car park @3; Staying with in-laws @15; Camping in the rain @20; City break @65; Tropical island @92
Bad pet|Good pet: Tarantula @15; Shark @5; Snake @30; Goldfish @55; Cat @80; Dog @90
Bad superpower|Great superpower: Talking to fish @15; Glowing toes @5; Super hearing @55; Invisibility @80; Flying @92; Teleporting @95
Bad name for a boat|Good name for a boat: Sinky @3; Titanic Two @5; Wet Bob @15; Sea Breeze @75; Wave Dancer @85
Bad band name|Good band name: Kevin's Stuff @8; The Spreadsheets @12; Wet Socks @20; Thunder Road @75; Midnight Ravens @88
Bad wedding song|Good wedding song: Funeral march @3; Breakup ballad @10; Happy birthday @30; Pop hit @55; Love song @88
Bad job|Dream job: Sewer cleaner @5; Telemarketer @10; Office temp @35; Teacher @55; Chocolate taster @90; Astronaut @85
Bad sandwich|Perfect sandwich: Sand sandwich @2; Soggy cucumber @12; Plain butter @25; Cheese and pickle @70; BLT @85; Club sandwich @90
Bad smell to wake up to|Good smell to wake up to: Smoke alarm @3; Burnt toast @15; Wet dog @10; Rain @60; Bacon @85; Fresh coffee @92
Rubbish film|Masterpiece: Straight to DVD @5; Bad sequel @12; Popcorn flick @45; Family classic @70; Oscar winner @88
Unlikeable|Lovable: Internet troll @3; Parking warden @20; Tax inspector @15; Grumpy neighbour @25; Golden retriever @92; Grandma @88
Lame hobby|Cool hobby: Collecting receipts @3; Ironing @8; Stamp collecting @25; Gardening @45; Rock climbing @85; Skydiving @92
Bad advice|Good advice: Pet the bear @3; Lick the battery @5; Just wing it @30; Sleep on it @75; Drink water @88
Hard to love|Easy to love: Wasps @3; Traffic wardens @10; Pigeons @30; Cats @70; Puppies @93
Wrong|Right: Two plus two is five @3; Flat earth @5; Whale is a fish @15; Tomato is a fruit @85; Water is wet @95
Nobody wants it|Everybody wants it: Cold sore @3; Parking ticket @5; Fruitcake @25; Day off @85; Winning lottery ticket @97
Mild inconvenience|Total disaster: Stubbed toe @5; Missed the bus @12; Lost keys @30; Flat tyre @45; House flood @80; Volcano erupting @95
Basic|Sophisticated: Beans on toast @5; Pumpkin spice latte @15; Burger @25; Sushi @60; Opera @85; Caviar @92

Villain|Hero: Dracula @3; Pirate @15; Robin Hood @70; Firefighter @88; Superman @95
Introvert|Extrovert: Hermit @3; Bookworm @12; Cat @25; Teacher @55; Party host @85; Game show host @92
Lazy|Hard-working: Sloth @3; Cat @12; Teenager @25; Ant @90; Bee @92
Shy|Show-off: Mouse @3; Wallflower @8; Librarian @25; Peacock @90; Rock star @92
Rude|Polite: Pirate @10; Internet troll @3; Toddler @30; Shop assistant @70; Butler @92
Serious|Silly: Funeral @3; Judge @6; Exam @12; Board meeting @15; Picnic @60; Clown @95
Careful|Reckless: Surgeon @3; Bomb disposal @5; Driving test @15; Skateboarding @70; Stunt double @90
Honest|Sneaky: Judge @8; Child @15; Salesperson @60; Cat @70; Spy @90; Fox @85
Follower|Leader: Sheep @3; Duckling @8; Intern @15; Teacher @65; Captain @85; King @92
Pessimist|Optimist: Eeyore @3; Weather forecaster @35; Gambler @80; Puppy @90
Nerdy|Sporty: Chess club @3; Coding @8; Library @12; Bird watching @30; Yoga @60; Football @85; Olympic sprinter @97
Unpopular|Popular: Tax collector @3; Dentist @15; Teacher @45; Footballer @80; Pop star @95
Forgettable person|Famous person: Background extra @5; Neighbour's cousin @15; Local mayor @40; TV presenter @75; Queen @97
Bad role model|Good role model: Pirate @12; Cartoon villain @5; Rock star @30; Teacher @75; Firefighter @88
Would lose a fight|Would win a fight: Kitten @5; Goldfish @3; Grandma @25; Goose @55; Bear @88; Tank @97
Bad at keeping secrets|Vault: Toddler @3; Parrot @8; Gossip @12; Best friend @60; Spy @90; Diary with a lock @80
Harmless prank|Unforgivable prank: Whoopee cushion @5; Fake spider @15; Salt in the sugar @40; Fake lottery ticket @80; Cancelling a wedding @97
Normal thing to do|Weird thing to do: Brushing teeth @3; Making tea @6; Talking to plants @50; Eating soup with a fork @75; Wearing a tie to bed @90
Socially acceptable|Socially unacceptable: Saying please @3; Queueing @8; Singing in the shower @25; Talking loudly on the bus @65; Licking a stranger @97
Morning person|Night owl: Rooster @3; Milkman @8; Baker @10; Teacher @30; DJ @85; Owl @95; Vampire @97
Spender|Saver: Shopaholic @3; Teenager with a bank card @12; Squirrel @85; Piggy bank @92
Cat person|Dog person: Witch @10; Egyptian pharaoh @15; Postman @30; Shepherd @90; Dog walker @95
Clumsy|Graceful: Bull in a china shop @3; Toddler @12; Penguin on land @20; Cat @80; Ballet dancer @93; Swan @90
Stubborn|Easygoing: Mule @3; Toddler @12; Cat @25; Surfer @80; Labrador @90
Brave|Cowardly: Lion @10; Firefighter @6; Knight @15; Mouse @80; Chicken @92
Kind|Cruel: Grandma @5; Nurse @8; Teacher @25; Cat with a mouse @80; Evil queen @92
Beginner|Expert: Toddler on a bike @3; Learner driver @10; Student @30; Teacher @70; Surgeon @85; Grandmaster @95
Amateur|Professional: Pub quiz @10; Karaoke @5; Sunday league @20; Weekend painter @30; Olympic athlete @88; Surgeon @92
Talks too little|Talks too much: Mime @3; Cat @12; Librarian @25; Teacher @60; Parrot @85; Radio presenter @92
Laid-back|Uptight: Sloth @3; Surfer @6; Cat @20; Accountant @70; Headteacher @80; Drill sergeant @95
Selfish|Generous: Dragon on its gold @3; Seagull @8; Cat @25; Grandma @85; Santa @95
Mild crush|True love: Film star poster @10; Classmate @20; Third date @45; Wedding @85; Golden anniversary @95
Small lie|Huge lie: I love the jumper @5; I'm five minutes away @12; I did my homework @30; I'm a doctor @80; The earth is flat @90
Easy to forgive|Hard to forgive: Late by a minute @3; Forgot to text back @12; Ate your leftovers @35; Missed your birthday @55; Spoiled the film ending @70; Stole your car @92
Good loser|Sore loser: Gracious champion @8; Grandpa at cards @25; Footballer @65; Toddler @85; Board game rage @92

Fact|Myth: The earth is round @3; Water boils at 100 @6; Bats are blind @70; Goldfish memory @75; Unicorns @95
Science|Magic: Chemistry @3; Microscope @6; Electricity @15; Rainbows @40; Card tricks @70; Wizard @92; Unicorn @95
Fantasy|Reality: Dragons @3; Wizard @6; Superheroes @12; Talking animals @15; Soap opera @60; News @88; Taxes @97
Past|Future: Dinosaurs @3; Pyramids @6; Castles @15; Steam train @25; Today @50; Electric car @65; Robots @80; Mars colony @95
Rural|Urban: Farm @3; Village @12; Market town @35; Suburb @55; High street @70; Skyscraper @92
Land|Sea: Mountain @3; Desert @6; Field @10; Beach @50; Island @60; Boat @85; Whale @92
Summer|Winter: Beach @3; Ice cream @8; Sunburn @6; Barbecue @12; Autumn leaves @55; Snowman @92; Christmas @88
Breakfast food|Dinner food: Cereal @3; Pancakes @8; Bacon @20; Sandwich @45; Pasta @80; Roast dinner @93
Snack|Meal: Crisps @3; Biscuit @6; Apple @12; Sandwich @50; Pizza @70; Three-course dinner @95
Sport|Game: Football @3; Running @6; Tennis @12; Darts @50; Poker @85; Chess @90; Board game @95
Hobby|Job: Knitting @5; Gardening @10; Photography @40; Teaching @85; Accountant @95
Art|Not art: Mona Lisa @3; Statue @8; Graffiti @45; Tattoo @40; Shopping list @90; Spreadsheet @95
Vegetable|Fruit: Carrot @3; Potato @6; Cucumber @40; Tomato @60; Apple @95
Sandwich|Not a sandwich: Club sandwich @3; BLT @6; Burger @35; Hot dog @50; Taco @70; Pizza @90
Soup|Not soup: Tomato soup @3; Stew @25; Cereal with milk @55; Smoothie @60; Salad @95
Furniture|Not furniture: Sofa @3; Chair @5; Bookshelf @10; Bean bag @35; Piano @55; Rug @60; Plant @85
Tool|Toy: Hammer @3; Screwdriver @6; Spoon @25; Ball @90; Teddy bear @95
Weapon|Not a weapon: Sword @3; Bow and arrow @8; Frying pan @40; Umbrella @60; Pillow @85; Feather @95
Normal pet|Exotic pet: Cat @3; Dog @5; Goldfish @12; Rabbit @20; Parrot @50; Snake @70; Tiger @97
Easy to draw|Hard to draw: Circle @3; Smiley face @6; Stick man @8; House @20; Cat @55; Horse @75; Hands @88
Easy to spell|Hard to spell: Cat @3; Dog @5; Banana @20; Necessary @70; Onomatopoeia @90
Easy to learn|Hard to master: Snap @5; Noughts and crosses @10; Draughts @40; Guitar @70; Chess @90
Easy to say|Hard to say: Mum @3; Hello @6; Banana @15; Worcestershire @85; Supercalifragilistic @95
Easy to remember|Hard to remember: Your name @3; Birthday @10; Phone number @50; Password @80; Pi to 100 digits @97
Unknown|World famous: Your neighbour @5; Local baker @10; Town mayor @30; TV weatherman @55; Eiffel Tower @92; The moon @97
Local|Global: Corner shop @3; Village fete @6; Town hall @15; National park @60; Olympics @90; The internet @97
Ancient|Brand new: Pyramids @3; Stonehenge @6; Castle @20; Grandad's car @55; New phone @88; Fresh paint @95
Primitive|High-tech: Stone axe @3; Campfire @6; Wheel @12; Bicycle @40; Laptop @80; Robot @88; Spaceship @97
Peaceful|Chaotic: Library @5; Meditation @3; Park bench @12; Office @40; School playground @70; Toddler party @85; Stampede @97
Safe job|Risky job: Librarian @3; Accountant @6; Teacher @20; Police officer @70; Stuntman @90; Bomb disposal @97
Low-paid job|High-paid job: Paperboy @3; Shop assistant @12; Teacher @40; Doctor @80; Footballer @90; Banker @85
Mythical creature|Real animal: Unicorn @3; Dragon @5; Mermaid @8; Loch Ness monster @25; Narwhal @75; Platypus @80; Cat @97
Good for you|Bad for you: Vegetables @3; Water @5; Sleep @8; Coffee @45; Chocolate @65; Junk food @85; Poison @99
Legal|Illegal: Walking @3; Reading @5; Jaywalking @55; Speeding @75; Bank robbery @97
Feels illegal|Feels legal: Driving past a police car @15; Leaving a shop without buying @10; Eating cake for breakfast @30; Napping @80; Breathing @97
Unlucky|Lucky: Black cat @15; Broken mirror @5; Friday the 13th @10; Rainbow @70; Four-leaf clover @90; Lottery win @97
Small problem|Big problem: Hangnail @3; Lost sock @6; Flat battery @30; Burst pipe @65; Shipwreck @90
Mildly annoying|Infuriating: Slow walkers @20; Hiccups @10; Squeaky door @25; Spam calls @60; Buffering @70; Stepping on Lego @85
Easy exam|Impossible exam: Spelling your name @3; Times tables @12; Driving test @45; Medical exam @80; Rocket science @95
Short film|Long film: Advert @3; Cartoon short @10; Comedy @40; Epic @85; Lord of the Rings @95
Kids’ film|Grown-ups’ film: Cartoon @3; Talking animals @6; Superheroes @35; Spy thriller @70; Courtroom drama @85; Horror @92
Happy song|Sad song: Happy birthday @3; Party anthem @8; Love song @40; Breakup ballad @88; Funeral march @97
Relaxing music|Party music: Lullaby @3; Rainforest sounds @6; Classical @15; Jazz @40; Pop @75; Dance music @90
Bad smell|Worst smell: Old socks @20; Wet dog @30; Bin day @55; Rotten eggs @80; Skunk @95
Better hot|Better cold: Soup @3; Tea @6; Pizza @20; Coffee @25; Beer @85; Ice cream @97
Better alone|Better with friends: Reading @3; Bath @6; Sleeping @10; Walk @40; Board games @85; Party @95
Better in a book|Better on screen: Diary @5; Poetry @10; Long novel @25; Comic @60; Action film @90; Fireworks @95
Indoor activity|Outdoor activity: Reading @3; Knitting @6; Bowling @20; Swimming @45; Football @85; Hiking @95
Day activity|Night activity: Gardening @3; Picnic @6; Beach @10; Shopping @25; Cinema @70; Stargazing @95
Wholesome|Edgy: Baking with grandma @3; Puppies @6; Picnic @10; Rock music @65; Tattoos @75; Horror film @88
Medieval|Modern: Castle @3; Knight @5; Jousting @8; Windmill @30; Steam train @55; Smartphone @92
Comedy|Tragedy: Clown @3; Sitcom @6; Romcom @25; Drama @60; Shakespeare's Hamlet @90; Titanic @88
Board game|Video game: Chess @3; Monopoly @6; Jigsaw @30; Card game @45; Arcade @85; Console @95
Overdressed|Underdressed: Ballgown at a picnic @3; Tuxedo at the beach @5; Suit at a barbecue @20; Jeans @60; Swimsuit at a wedding @92
Sounds made up|Sounds real: Snollygoster @3; Bumfuzzle @8; Gobbledygook @25; Banana @90; Table @95
Hidden talent|Party trick: Knitting @10; Origami @25; Juggling @80; Card tricks @88; Fire breathing @95
Useless degree|Useful degree: Underwater basket weaving @3; Golf course management @20; History @45; Engineering @85; Medicine @92
Square|Circle: Chessboard @3; Window @8; Book @15; Stop sign @55; Plate @85; Coin @90; Wheel @95
Spring|Autumn: Lambs @3; Daffodils @6; Easter @12; Summer holiday @45; Harvest @85; Falling leaves @93
Dessert|Main course: Ice cream @3; Cheesecake @5; Fruit salad @30; Soup @55; Pasta @80; Roast beef @93
City break|Beach holiday: Paris @3; Rome @6; Museum tour @10; Lake district @45; Cruise @70; Sunbed @92
Fiction|Non-fiction: Fairy tales @3; Dragons @6; Historical novel @45; Biography @80; Dictionary @95

Pigeon|Peacock: Grey suit @6; Sparrow @12; Blackbird @25; Parrot @80; Flamingo @85; Drag queen @95
Common bird|Rare bird: Pigeon @3; Seagull @5; Robin @15; Owl @50; Kingfisher @65; Golden eagle @85; Dodo @99
Clever animal|Silly animal: Dolphin @3; Octopus @5; Crow @10; Dog @35; Sheep @75; Turkey @90
Cuddly animal|Scary animal: Kitten @3; Puppy @5; Rabbit @8; Horse @40; Goose @60; Shark @92; Tarantula @88
Pest|Pet: Cockroach @3; Rat @8; Pigeon @15; Fox @30; Hamster @80; Dog @95
`;

export interface SpotClue {
  text: string;
  /** Where on the dial it sits, 0–100. */
  at: number;
}

const keyOf = ([l, r]: Spectrum) => `${l}|${r}`;

/** Every card's clues, by `Left|Right`, sorted along the dial. */
export const CLUES: ReadonlyMap<string, readonly SpotClue[]> = (() => {
  const map = new Map<string, SpotClue[]>();
  for (const line of TABLE.split('\n')) {
    const colon = line.indexOf(': ');
    if (colon < 0) continue;
    const clues = line
      .slice(colon + 2)
      .split(';')
      .map((part) => {
        const [text, at] = part.split('@');
        return { text: text!.trim(), at: Number(at) };
      })
      .sort((a, b) => a.at - b.at);
    map.set(line.slice(0, colon).trim(), clues);
  }
  return map;
})();

/** The clues for a card (empty for a card the table doesn't know). */
export const cluesFor = (s: Spectrum): readonly SpotClue[] => CLUES.get(keyOf(s)) ?? [];

/** Cards in the game with no line in the table (clues.test.ts expects none). */
export const missingCards = () => SPECTRUMS.filter((s) => !CLUES.has(keyOf(s)));
