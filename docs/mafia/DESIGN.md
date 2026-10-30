# Mafia (and Werewolf)

A social deduction game for 5 to 15 players where the app is the moderator, so nobody sits out to
run it. One rules engine, two settings: **Mafia** (a 1920s city) and **Werewolf** (the village of
Thiercelieux). The setting changes who is dealt, what the powers are called and the whole print
look. Package: `packages/games/mafia`.

## Roles

| Setting  | Always dealt                                                                                             | Host can add                                                                                                                     |
| -------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Mafia    | Mafia (kill together), Angel (saves one a night, self allowed), Sheriff (asks: Mafia or not?), Civilians | Jester (wins if voted out; the game ends), Mayor (vote counts twice), Serial Killer (kills alone; wins as the last one standing) |
| Werewolf | Werewolves (kill together), Seer (sees one card a night), Villagers                                      | Witch (one save, one poison), Hunter (shoots someone as they die), Cupid (lovers on night 1; one dies, both die)                 |

Killers on Auto: 1 for 5–6 players, 2 for 7–9, 3 for 10–12, 4 for 13–15. The cast (counts only) is
public. The Serial Killer reads as "not Mafia" to the Sheriff.

## How a round goes

1. **Deal**: everyone looks at their card and taps "I've seen my card" (or 45 s pass).
2. **Night** (75 s): every living player picks someone, so tapping gives nothing away. The pack
   must agree (they see each other's picks); the powers lock their pick (the Sheriff and Seer get
   their answer at once); everyone else names a suspect. Out of time, the pack's most-picked
   target is used (a tie drawn at random).
3. **Witch** (Werewolf with a Witch dealt): she sees the victim and may save and/or poison. Her
   turn comes every night she was dealt, even dead or out of potions, with the same 30 s clock
   on every screen; it then ends quietly a few seconds in.
4. **Morning** (9 s): the dead are announced (their card too when "Roles of the dead" is Shown).
   Angel or Witch saves stop the kill. Lovers die of grief together. A dying Hunter shoots (30 s).
5. **Day**: talk until most living players tap "Ready to vote", or the talk timer runs out
   (Off, 2, 3 or 5 minutes).
6. **Vote** (60 s): everyone votes for someone or skips, hidden until all are in. The most votes
   is out, unless it's a tie or the skips got as many. Then **dusk** (9 s) and night again.

Wins, checked after every morning, vote and shot: the town (village) when no killers and no
Serial Killer are left; the pack once it matches everyone else (and the Serial Killer is dead);
the Serial Killer as one of the last two; lovers from opposite sides as the last two; the Jester
when voted out. Nobody left is a draw.

## Hidden information

`getTableView` carries no living player's card, no night picks, victim, checks or potions, and
who voted but not for whom until the count. Lovers become public only once one dies of grief.
The dead see every card (with a "no hints" reminder). Rules tests swap two living players' cards
and picks and check the table view doesn't change, at every step of scripted games.

## Narration

Every phone and the TV print the narrator's line as the front-page headline. One device reads it
aloud (the browser's speech): the TV when one is watching, otherwise the host's phone. Anyone can
switch their own device to On, Off or Auto. Browsers need one tap before a page may speak, so a
speaking device that hasn't been touched asks for a tap. The phone screens get `hostId` and
`displays` through `ScreenExtras` for this.

## Look

- **Mafia, "The Jackdaw Courier"**: a 1920s tabloid. Newsprint and press ink, headlines in
  Big Shoulders 900 caps under a blackletter masthead, a red EXTRA! stamp, players as mugshot
  placards on a line-up's height chart, a skyline whose windows light up at night. Night turns the
  page to the night edition.
- **Werewolf, "The Wolves of Thiercelieux"**: a woodcut chapbook. Linen, forest ink and blood red,
  headlines in Grenze Gotisch, players as cottages (a tombstone once dead), a treeline and church,
  and at night indigo under a moon that waxes night by night.
- Both follow the shell's day and dark. The lobby uses Jackdaw's lobby with the game's own seats
  (the line-up wall or the village) and a printed cast list where the host adds the extra roles.

## Bots

A bot plays from its own prompt: killers back a teammate's pick, the Sheriff and Seer check
people they haven't, by day it votes for a killer it knows about (a teammate never), and it gets
ready to vote after about 40 s of talk.
