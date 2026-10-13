# Avalon parity checklist

> **Superseded (2026-10-13).** Lesia decided to link the live Avalon app instead of porting it;
> see `LINK.md`. Kept as a map of the Avalon app's behaviour and source.

"Full parity" for the Phase 2 port is judged against this list. It was written on 2026-10-13 by
reading the current app's source at `C:\Users\KBITK\OneDrive\Desktop\avalon` (Next 15, plain JS),
not from memory or the build plan. Every item names the file and lines it comes from. Paths are
relative to that repo.

- Tick an item only when the Jackdaw port does the same thing, or when the item is marked
  **platform** and the Jackdaw platform already covers it.
- **platform** marks Avalon features that map onto a Jackdaw platform feature instead of being
  ported into `packages/games/avalon`.
- **Needs Lesia** marks items the port can't match without changing the game module contract, the
  lobby state machine or the protocol. They are collected in [Needs Lesia](#needs-lesia) at the end.
- `STATE.md` (next to this file) proposes the state model, actions and views that implement it.

## Contents

- [Rules](#rules)
- [Roles and knowledge](#roles-and-knowledge)
- [Options and modes](#options-and-modes)
- [Phases and actions](#phases-and-actions)
- [Player screens](#player-screens)
- [TV screens](#tv-screens)
- [Looks and motion](#looks-and-motion)
- [Platform overlaps](#platform-overlaps)
- [Edge cases](#edge-cases)
- [Where the build plan is wrong](#where-the-build-plan-is-wrong)
- [Surprises found while reading](#surprises-found-while-reading)
- [Needs Lesia](#needs-lesia)

## Rules

- [ ] **Player count 5 to 15.** `MIN_PLAYERS = 5`, `MAX_PLAYERS = 15`; the box's rules stop at
      `OFFICIAL_MAX = 10` and 11 to 15 use house rules. `lib/rules.js:3-7`, `lib/game.js:107,169`
- [ ] **Quest team sizes by player count**, 5 to 15, exactly this table. `lib/rules.js:10-22`

  | Players | Q1  | Q2  | Q3  | Q4  | Q5  |
  | ------- | --- | --- | --- | --- | --- |
  | 5       | 2   | 3   | 2   | 3   | 3   |
  | 6       | 2   | 3   | 4   | 3   | 4   |
  | 7       | 2   | 3   | 3   | 4   | 4   |
  | 8–12    | 3   | 4   | 4   | 5   | 5   |
  | 13      | 4   | 4   | 5   | 5   | 6   |
  | 14–15   | 4   | 5   | 5   | 6   | 6   |

- [ ] **Evil count by player count:** 5→2, 6→2, 7→3, 8→3, 9→3, 10→4, 11→4, 12→5, 13→5, 14→5,
      15→6. `lib/rules.js:24`
- [ ] **Quest IV needs two Fail cards with 7 or more players**, at every count up to 15.
      `lib/rules.js:27`, stored per quest as `failsNeeded` at deal time `lib/game.js:185`
- [ ] **Evil roles** are assassin, morgana, mordred, oberon and minion; everything else is good.
      `lib/rules.js:29-30`
- [ ] **First leader is random** (`randomInt(n)`); leadership passes one seat clockwise (seat
      order = join order) after every proposal is resolved: after a rejection, and after the
      approved team's quest resolves. Approval itself doesn't move the crown. `lib/game.js:174,202-207,235,263`
- [ ] **Roles are shuffled onto seats** with a uniform shuffle of the dealt lineup.
      `lib/game.js:31-38,171-173`
- [ ] **The leader proposes exactly the quest's team size.** Duplicates are dropped, ids not in
      the game are dropped, and the stored team is put back into seat order. `lib/game.js:384-395`
- [ ] **Everyone seated votes**; a vote can be changed until the last vote is in, and the last vote
      resolves at once. `lib/game.js:397-403`
- [ ] **Approval needs a strict majority** (`yes > n/2`); a tie rejects. `lib/game.js:211-212`
- [ ] **Rejections count in a row**: an approval resets the counter to 0; the **fifth rejection in a
      row ends the game, evil wins** ("Five teams in a row were rejected."), even on quest V.
      `lib/game.js:223-236`
- [ ] **Quest cards:** only team members play, once each, and can't change their card. A loyal
      player can't play Fail; the server refuses it ("Loyal servants of Arthur must play
      Success."). `lib/game.js:405-414`
- [ ] **A quest fails when fails ≥ failsNeeded**; the quest stores its `fails` count and `team`.
      `lib/game.js:239-247`
- [ ] **Three failed quests: evil wins** ("Three quests failed."). `lib/game.js:251`
- [ ] **Three successful quests:** if an Assassin is in the game, go to the assassination;
      otherwise good wins at once ("Three quests succeeded."). `lib/game.js:252-259`
- [ ] **Assassination:** the Assassin names one player who isn't evil. Naming Merlin: evil wins
      ("The Assassin named X, who was Merlin."). Anyone else: good wins ("The Assassin named X, but
      Merlin stayed hidden."). `lib/game.js:430-439`
- [ ] **Lady of the Lake** (optional): starts with the seat to the leader's right (the seat before
      the first leader), is used after quests II, III and IV only if the game goes on, and the
      holder examines one other player who has never held her. Only the holder learns good/evil;
      the examined player takes the Lady. `lib/game.js:175,191,264-265,416-428`
- [ ] **Winner reasons** are the exact sentences above; they show on every screen and in the recap.
      `lib/game.js:151-165,232,251,258,436-437`
- [ ] **Scores count finished games only**: a side tally (good/evil wins) and per-player
      played/wins, where a win means your side won. Games the host ends early don't count.
      `lib/game.js:149,156-163,450-459`. **platform** for the per-player tally (see
      [Platform overlaps](#platform-overlaps)).

## Roles and knowledge

- [ ] **Eight roles with these names, teams and blurbs** (shown on the role card and in the
      lobby's fan tooltips). `lib/rules.js:32-74`
  - Merlin (good): "You know the agents of evil, except Mordred. Steer your side toward victory
    without being obvious: if good wins three quests, the Assassin gets one guess at who you are."
  - Percival (good): "You see Merlin, but Morgana appears to you the same way. Work out which is
    the real Merlin and protect them."
  - Loyal Servant of Arthur (good): "You know only your own loyalty. Watch the votes and the quest
    results to find the traitors."
  - Assassin (evil): "Fail quests quietly. If good completes three quests, you choose one player to
    assassinate. Name Merlin and evil wins."
  - Morgana (evil): "You appear as Merlin to Percival. Use that to pull Percival off the real
    Merlin."
  - Mordred (evil): "Merlin cannot see you. Of all the evil players, you can play the most boldly."
  - Oberon (evil): "You serve evil, but you do not know your allies and they do not know you.
    Merlin can still see you."
  - Minion of Mordred (evil): "You know your fellow servants of Mordred (except Oberon). Fail
    quests without getting caught."
- [ ] **Merlin** sees every evil player except Mordred (so Oberon is seen), each labelled only
      "Evil". `lib/game.js:474`
- [ ] **Percival** sees Merlin and Morgana, labelled "Merlin or Morgana" when both are in the
      game, or "Merlin" when only Merlin is. `lib/game.js:469,475-476`
- [ ] **Evil except Oberon** (Assassin, Morgana, Mordred, Minions) sees every other evil player
      except Oberon, labelled only "Evil": allies never learn each other's roles. `lib/game.js:477`
- [ ] **Oberon and Loyal Servants** see nobody. `lib/game.js:467-480`
- [ ] **Role card extras**: Mordred's card adds "Merlin does not know you are evil."; Oberon's adds
      "You have no information about your allies."; the known list is headed "You see" (Percival),
      "You see the agents of evil" (Merlin) or "Your allies" (evil). `components/Room.js:712-726`
- [ ] **Lady results** are shown only to the holder who made the check (on their role card, as a
      seat tag and in their chronicle), and to everyone once the game is over.
      `lib/game.js:540-549`, `components/Room.js:308,345-349,728-740,1059-1073`
- [ ] **During the assassination every evil player is revealed to everyone**, Oberon included, and
      the Assassin is named. `lib/game.js:515,553-554`
- [ ] **Everything is revealed at the end**: all roles, every vote, every Lady result.
      `lib/game.js:533-539,547,555`
- [ ] **Seat tags by what you know:** at the end, the short role name ("Servant", "Minion",
      "Merlin"…) with a good/evil ring; during the assassination "Evil" or "Assassin"; otherwise
      your knowledge ("Evil", "Merlin", or "Merlin?" when Percival can't tell), then your own Lady
      results ("Lady: good"/"Lady: evil"); the assassin's target adds "named".
      `components/Room.js:21,332-350`
- [ ] **No layout leaks:** good and evil players see the same two quest cards (a loyal player's
      Fail tap shows a note client-side and sends nothing). `components/Room.js:503-520`,
      `AGENTS.md` "Style"

## Options and modes

- [ ] **Four role setups** (`MODES`): Merlin & Assassin ("The recommended setup for new groups."),
      Full set ("Every special role that fits your player count."), Custom ("Pick roles
      yourself."), No special roles ("Servants and minions only."). `lib/rules.js:76-81`
- [ ] **Dealing** (`lineup`): Merlin always brings the Assassin; Percival is good; Morgana, Mordred
      and Oberon are added to evil in that order until the evil seats run out, and any that don't
      fit are reported as `dropped`; the rest are Loyal Servants and Minions. A count under 5 is
      previewed as 5. `lib/rules.js:146-177`
- [ ] **Role dependencies** (`ROLE_NEEDS`): Percival needs Merlin, Mordred needs Merlin, Morgana
      needs Percival. A role whose partner is off is switched off when dealing.
      `lib/rules.js:114,157-159`
- [ ] **Custom toggles**: Merlin & Assassin, Percival, Morgana, Mordred, Oberon, each with a hint;
      turning a role off also turns off what depends on it (and Merlin off turns Morgana off). A
      blocked role shows disabled. Defaults: Merlin, Percival, Morgana on; Mordred, Oberon off.
      `components/Lobby.js:15-21,69-78,130-144`, `lib/rules.js:137-143`
- [ ] **Lady of the Lake** on/off, default off, hint "After quests 2, 3 and 4, the holder secretly
      learns one player's loyalty. Best with 7+ players." `components/Lobby.js:146-155`
- [ ] **Talk timer** Off / 2 / 3 / 5 min (team building and the assassination) and **vote timer**
      Off / 30 s / 1 min / 2 min. Junk values are ignored. Default both off.
      `lib/rules.js:116-122`, `lib/game.js:335-340`, `components/Lobby.js:10-13,157-174`
- [ ] **Timers are a nudge only:** a countdown on every phone and the TV, timed from the phase's
      server start time with clock-skew correction; at zero the table sees "Time's up" and the
      players being waited on get a buzz. Nothing is ever played for anyone. **Needs Lesia**
      (phase start time needs a clock). `components/Timer.js:1-55`, `lib/game.js:75-79`
- [ ] **Only the host changes settings, only in the lobby.** `lib/game.js:324-342`. **platform**
      (`setOptions` is host-only and waiting-only).
- [ ] **Lobby deal preview:** a fan of the role cards that would be dealt, "The deal for N:" (or
      "Preview for 5:" under 5), "x loyal against y evil", and "Not enough evil seats for … yet."
      for dropped roles. `components/Lobby.js:100-105`
- [ ] **House-rules note** above 10 players: "More than 10 players uses house rules, since the box
      stops at 10: N evil, and quest teams of …". `components/Lobby.js:106-111`
- [ ] **Look** (Parchment/Night) as a host setting. **Replaced by the platform**: the device's
      day/dark choice picks Parchment/Night (see [Looks and motion](#looks-and-motion)).
      `components/Lobby.js:176-188`, `lib/game.js:316-322`

## Phases and actions

Phases are `lobby → team → vote → (quest | team) → (lady) → team … → assassin → over`.
`lib/game.js:197,227,236,254,265,393,426`

| Phase    | Who acts            | Action (`type`)                            | Effect                                             | Source                |
| -------- | ------------------- | ------------------------------------------ | -------------------------------------------------- | --------------------- |
| team     | leader              | `draft { team }`                           | Live picks the table watches (capped at team size) | `lib/game.js:298-305` |
| team     | leader              | `propose { team }`                         | Exact size; to vote                                | `lib/game.js:384-395` |
| vote     | every seated player | `vote { approve }`                         | Changeable; last vote resolves                     | `lib/game.js:397-403` |
| quest    | team members        | `quest { success }`                        | Once each; good must succeed; last card resolves   | `lib/game.js:405-414` |
| lady     | Lady holder         | `lady { target }`                          | Not self, not a past holder; to team               | `lib/game.js:416-428` |
| assassin | Assassin            | `assassinate { target }`                   | Target must be good; ends the game                 | `lib/game.js:430-439` |
| any      | host                | `lobby`                                    | End early (not scored) or leave the over screen    | `lib/game.js:450-459` |
| lobby    | host                | `start`, `settings`, `kick`, `resetScores` | **platform**                                       | `lib/game.js:324-448` |
| any      | anyone              | `chat`, `react`, `avatar`, `rejoinCode`    | **platform** (react: **Needs Lesia**)              | `lib/game.js:282-354` |
| any      | host                | `theme`                                    | Dropped: device day/dark instead                   | `lib/game.js:316-322` |

- [ ] **Each phase change records its start time** (`phaseAt`) for the timers; a vote doesn't
      restart the clock, a proposal does. `lib/game.js:76-79`, `scripts/simulate.mjs:197-211`.
      **Needs Lesia** (clock).
- [ ] **A public event** (`start`, `vote`, `quest`) with an increasing id is set at the start, at
      each vote result (leader, team, every vote, approved, rejection count) and at each quest
      result (size, fails, result, failsNeeded). Phones replay it as an overlay once.
      `lib/game.js:81-84,198,221,247`
- [ ] **Draft** is cleared when the proposal is made and whenever the leader moves; it's sent only
      during the team phase. `lib/game.js:202-207,391,525`
- [ ] **Votes in progress are secret**: the table sees only who has voted (`voted`); you see your
      own vote (`myVote`). `lib/game.js:526,528`
- [ ] **Cards in progress are secret**: the table sees who has played (`played`); you see your
      own card (`myCard`). `lib/game.js:527,529`
- [ ] **Past votes are memory, not data:** mid-game, each proposal's record keeps `yes` but drops
      who voted which way, except the latest proposal while it's "on the seats" (during its
      quest, or in the team phase after it was rejected). All votes come back at the end.
      `lib/game.js:530-539`, `scripts/simulate.mjs:183-187`
- [ ] **Errors keep their wording**: "That move is not available right now.", "Only the leader
      proposes the team.", "This quest needs exactly N knights.", "You are not seated in this
      game.", "You are not on this quest.", "You already played your card.", "Only the holder of
      the Lady of the Lake can do that.", "Choose another player.", "You cannot examine someone
      who has already held the Lady of the Lake.", "Only the Assassin chooses.", "Choose a player
      on the side of good.". `lib/game.js:268-439`

## Player screens

Layout and behaviour of `components/Room.js` (the tabletop scene), `components/Lobby.js` and
`app/r/[code]/page.js`.

- [ ] **Round table**: seats placed clockwise from the top on a circle; radius and seat/avatar
      sizes shrink for 11+ and 13+ players so 15 fit. Each seat shows avatar, name, "(you)",
      badges (leader crown, Lady, on-the-quest shield, done check, last vote approve/reject),
      private note dot, and a tag or "away". `components/RoundTable.js:13-125`
- [ ] **Table centre**: phase title ("Quest III", "The vote", "On quest", "The Lady", "Assassin",
      "Good wins"/"Evil wins"), the five quest medallions, a progress line ("2 of 3 knights
      chosen", "4 of 7 have voted", "1 of 3 cards played"…), and the five-pip rejection track
      (the fifth pip marked). `components/Room.js:354-397`
- [ ] **Quest medallions**: size number, a "2" star when two fails are needed, grail/broken
      blade once done, glowing on the current quest. Tapping one shows "Succeeded, 1 fail: A, B, C"
      or "N knights, fails only with 2 Fail cards" in the centre for 6 s.
      `components/Room.js:273-296,299-305,364-371`
- [ ] **Your hand** (actions panel) for each phase, with these titles and lines.
      `components/Room.js:443-598`
  - Team, leader: "You lead quest III / Choose 3 knights", "Everyone watches your picks appear
    at the table." (+ two-fail note), picked chips with ×, "Propose team · 2/3". Others:
    "Bran is choosing 3 knights", "Watch the team form at the table. Argue for or against it out
    loud, then vote."
  - Four-rejection warning banner on both sides. `components/Room.js:454,464`
  - Vote: "Bran proposes", the team chips, Approve/Reject tokens (current one lit), "Vote cast.
    You can change it until everyone has voted." / "All votes are revealed together."
  - Quest (on team, not played): "Play a card, face down", Success/Fail cards, "Shield your
    screen. Cards are shuffled before they are revealed." After playing or off the team: card
    slots filling as cards come in, "The seats show how everyone voted on this team."
  - Lady (holder): "Whose loyalty will you learn?", explanation, pick bar "Examine X". Others:
    "X is choosing".
  - Assassin (assassin): "Name Merlin", "Talk it over with your allies out loud…", pick bar
    "Assassinate X" in red. Others: "The Assassin has one guess… If X names Merlin, evil steals
    the win."
  - Over: "Arthur prevails"/"Mordred prevails" with art, the reason, compact tally, "See the
    recap", host "Back to the lobby" / "The host can start a new game from the lobby."
- [ ] **Seat picking** by phase: leader picks up to team size (tap again to drop); Lady holder
      picks one non-holder; Assassin picks one non-revealed player; ineligible seats are muted.
      `components/Room.js:229-236,313-318`
- [ ] **Live drafting**: the leader's picks are sent 200 ms after each change and restored after a
      reload. `components/Room.js:244-258`
- [ ] **"Waiting on A and B (away)"** under the hand, from who the phase is waiting on.
      `components/Room.js:600-619,626-643`
- [ ] **Your turn alert**: vibrate `[120,60,120]` when it becomes your turn, and flash the tab
      title "Your turn · Avalon" while the tab is hidden. `components/Room.js:646-686`
- [ ] **My role** button in the top bar opens a face-down card: "Shield your screen, then tap to
      turn your card over", flip to team line, emblem, name, blurb, known list, Lady results,
      "Hide my role". Escape closes. `components/Room.js:202-206,688-756`
- [ ] **Roles are dealt overlay** at game start (phones only): "Shield your screen before you
      look.", "See my role" / "Later". `components/Room.js:1159-1182`
- [ ] **Vote reveal overlay**: every voter's avatar with an approve/reject token, flipping in one
      by one, then "Approved"/"Rejected" and "N of 5 rejections. Leadership passes on." or
      "Five rejections in a row. Evil wins." Closes after 10 s (5 s if it ended the game), on tap
      or Continue. `components/Room.js:1183-1206,1148-1153,1228-1238`
- [ ] **Quest reveal overlay**: the cards (successes first, then fails, i.e. shuffled) flip in
      0.5 s apart, then "The quest succeeds/fails", and "One Fail was played, but this quest
      needed two." `components/Room.js:1207-1225`
- [ ] **Overlays never replay** after a reload: the last seen event id lives in sessionStorage
      per room (and per TV). `components/Room.js:1118-1145`
- [ ] **Seat sheet (in game)**: avatar, name, role at the end or "Seat N", quests joined, how many
      failed, teams proposed; for others a private Trust / Unsure / Suspect note; your own seat
      changes your avatar; a rejoin panel. `components/Room.js:860-935`
- [ ] **Private notes** are stored per device per game (`avalon:notes:<code>:<gameId>`) and show
      as ✓ / ? beside the seat name. `components/Room.js:24-49`, `components/RoundTable.js:107-111`
- [ ] **Chronicle drawer**: roles in this game (fan + "A, B against C, D"), the roster with
      here/away (tap opens the seat sheet), every proposal ("Quest II · proposal 1", approved or
      rejected with the tally, "Bran sent A, B"), every quest result, every Lady use (result only
      for the holder), newest first, the TV link and the host's End game.
      `components/Room.js:1022-1116`
- [ ] **End game early** (host, every phase until over, in the hand and the chronicle): needs a
      second tap within 4 s ("Tap again to end the game for everyone"). **Needs Lesia**.
      `components/Room.js:620,1001-1020,1113`
- [ ] **Recap sheet** at the end: winner and reason; both sides with each player's role; each
      quest reached with the team, how many rejected teams came first, the approving vote split by
      avatar, and which knights were evil ("Every knight on this quest was loyal."); quests that
      never went ("3 teams were rejected, led by …"); Lady results and the assassination
      ("Hit"/"Missed"); the tally. `components/Recap.js:12-37,101-258`
- [ ] **Lobby (Avalon's waiting room)**: the round table with the room code in the centre and
      "N of 15 seated · N more needed / ready", the hand ("Gathering at the Round Table", "Waiting
      for N more knights" / "Ready when you are" / "Waiting for the host"), deal preview, house
      note, tally, settings, "Deal the roles", "Leave room", the seat hint and the TV link.
      `components/Lobby.js:23-210`. The settings and seats partly become **platform** (see
      [Platform overlaps](#platform-overlaps)).
- [ ] **How to play** (`?` button in every room, "Learn to play" on the home page): eight steps
      with a practice table (pick a team, vote and see the reveal, play a card as loyal or evil),
      the evil-count tables with house rules, special roles, winning, Lady, reading the table.
      Arrow keys and Escape work. `components/Tutorial.js:1-367`, `components/Room.js:207-209`
- [ ] **Home page cast fan** of the seven roles and "Loyal knights and hidden traitors, for 5 to 15
      players at one table." Becomes the game's catalog art and detail page. `app/page.js:13,53-67`
- [ ] **Laptop layout**: from 960 px the hand sits beside the table; from 1240 px chat docks on
      the right too. `app/globals.css:1328-1371`
- [ ] **Unread chat badge** on the chat button while chat is in a drawer. **platform** (Lesia asked
      for the same in the shell, 2026-10-13). `components/Room.js:88-95,215-218`

## TV screens

`components/TvView.js`, `app/tv/page.js`, `app/api/room/[code]/tv/route.js`.

- [ ] **Public only**: the TV gets the same view a seated player would, but with no player id, so
      no role, no knowledge, no own vote/card, no Lady results, and no rejoin codes.
      `app/api/room/[code]/tv/route.js:1-21`, `scripts/simulate.mjs:116-124`
- [ ] **Round table** with the same seat badges as phones (leader, Lady, team, draft picks, done,
      last vote on seats, away), evil revealed during the assassination, roles at the end.
      `components/TvView.js:99-126,165-193`
- [ ] **Centre**: the room code before a game; during it the phase title, medallions, progress
      line and rejection track; at the end the winner and reason. `components/TvView.js:128-191`
- [ ] **Side panel**: headline per phase ("Bran is choosing 3 knights", "Vote on Bran's team",
      "The quest is underway", "X holds the Lady of the Lake", "The Assassin has one guess",
      "Arthur/Mordred prevails"), the timer, "Waiting on A, B (away)", the tally before and after
      games, and the last six chat lines with names in their colours.
      `components/TvView.js:145-157,195-245`
- [ ] **Join panel** before the game and at the end: QR code, room code, and the site address on
      one line that shrinks to fit. **platform** (TV lobby and join strip).
      `components/TvView.js:64-72,218-234`
- [ ] **Vote and quest reveals** as overlays on the TV too (not the "roles are dealt" one), with a
      TV-only "seen" key. `components/TvView.js:247`, `components/Room.js:1144`
- [ ] **End-of-game celebration** on the TV. `components/TvView.js:76-77,248`
- [ ] **Recap below the table at the end**: "Scroll down for the recap" link, then the full recap
      inline. `components/TvView.js:159,199-203,250-254`
- [ ] **Keeps the screen awake** (Wake Lock, re-requested when visible). **platform**
      (`tv-stage.tsx` already does this). `components/TvView.js:47-62`
- [ ] **Polls every 2 s.** **platform**. `components/TvView.js:24-45`
- [ ] **"Show it on a TV"** from home (needs the code), "Just watching? Show this table on a TV"
      on the join screen, and a TV link plus "go to site/tv and enter CODE" in the lobby and the
      chronicle. **platform**. `app/page.js:116-122`, `app/r/[code]/page.js:251-253`,
      `components/TvLink.js:1-21`

## Looks and motion

- [ ] **Two looks, identical layout.** Night (`app/globals.css`) is the lake at night with an oak
      and brass table, blue for Arthur and red for Mordred. Parchment (`app/themes.css`, scoped
      to `[data-printed]`) is a skin over Night's exact layout: cream card stock, charcoal ink,
      double rules, perforated stamp edges, Big Shoulders plaques, UnifrakturMaguntia on ballots
      and the winner's banner, azure/gules, forest-green actions. Parchment may change only colour,
      typeface, background, texture, corner shape and shadow. `AGENTS.md` "Style",
      `lib/rules.js:124-135`
- [ ] **In Jackdaw, the device's day/dark choice picks the look:** day → Parchment, dark → Night
      (Lesia, 2026-10-12). This replaces Avalon's per-room host setting, so phones and the TV can
      differ. Note that Avalon's light look is called **Parchment**, not "Day" as CLAUDE.md and
      `packages/ui/src/game-ui.ts` say. `components/Theme.js:1-31`, `components/RoomThemeScript.js:1-29`
- [ ] **Night must not change when Parchment changes** (never add parchment styling to the
      night stylesheet). `AGENTS.md` "Style"
- [ ] **Fonts:** Uncial Antiqua (wordmark only), Alegreya SC (headings), Alegreya Sans (body),
      Big Shoulders (plaques), UnifrakturMaguntia (blackletter). Jackdaw loads only Alegreya Sans
      and Big Shoulders today. `app/layout.js:1-14`
- [ ] **Backdrop:** Night's lake landscape (moon and glow, stars, hills, the Tor with its lit
      tower, the lake with moon reflections, two mist layers drifting over 38 s, reeds);
      Parchment hides it and shows two print pattern layers. `components/art.js:182-271`,
      `app/globals.css:157-158`
- [ ] **Mouse parallax** on the backdrop layers (eased, pointer devices only, off with reduced
      motion). `components/Parallax.js:1-47`
- [ ] **Artwork:** role emblems for all eight roles, grail, broken blade, approve and reject
      marks, crown, Lady drop, shield, check, in 2.5–3.5 px rounded line art with brass and red
      accents. `components/art.js:1-180`. Reaction icons. `components/reactionIcons.js:1-64`
- [ ] **Motion inventory**, all expo/ease-out and all switched off by `prefers-reduced-motion`
      (`app/globals.css:3289-3296`):
  - fan cards deal in (0.5 s) and lift on hover/focus `app/globals.css:492`, `components/Fan.js`
  - current medallion glows (2.4 s loop); finished medallions pop `app/globals.css:731-745`
  - seat badges pop in `app/globals.css:856`; reaction bubbles float up over 3.6 s `:979`
  - card slots pop as cards come in `:1190`; vote reveal items and quest cards flip in, staggered
    `:1544,1568`, `components/Room.js:1192,1214`
  - role card flips over `components/Room.js:702-751`
  - timer glows under 10 s `app/globals.css:3041-3043`
  - drawers, sheets and overlays fade or rise in (`fade`/`rise` keyframes,
    `app/globals.css:2504-2514`)
- [ ] **End-of-game celebration**, 5.6 s, once per game per screen, only on a screen that watched
      the game end (not on reload or late arrival), after the final reveal finishes (700 ms beat):
      good = flash of light, two rings, 90 falling confetti bits, "Arthur prevails" with the grail;
      evil = red flood with heartbeat, two blades slashing, table shake, 50 rising embers,
      "Mordred prevails". Phones vibrate (good `[40,50,40,50,90]`, evil `[90,60,220]`).
      `components/Celebration.js:1-105`, `app/globals.css:2584-2830`
- [ ] **Breakpoints checked**: 460, 520, 700, 860, 900, 960, 1000, 1240, 1600 px.
      `app/globals.css` (`@media` lines 110-3260)

## Platform overlaps

What the Jackdaw lobby already provides, and how the Avalon feature maps onto it.

| Avalon feature                                                                                                                                                             | Jackdaw platform                                                                            | Port?                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------- |
| Create/join with a 4-letter code, invite link, copy chip `lib/game.js:25-27`                                                                                               | Lobby codes, invite sheet, QR                                                               | platform                  |
| Names 1–20 chars `lib/game.js:40-44`                                                                                                                                       | `PlayerName` (same rule)                                                                    | platform                  |
| **Unique names** (case-insensitive) on join `lib/game.js:109-111`                                                                                                          | Not checked                                                                                 | **Needs Lesia**           |
| Avatars: 16 crests or initials, 15 tints, never shared `lib/rules.js:86-109`                                                                                               | `AvatarPicker`, `setAvatar` with AVATAR_TAKEN; no initials option                           | platform                  |
| Chat (300 chars, 150 kept, 120 sent) `lib/game.js:68-72,282-286`                                                                                                           | `chat` (280 chars, 120 kept), names in tint                                                 | platform                  |
| **System chat lines** ("X joined", "Roles are dealt…", Lady used, winner)                                                                                                  | Player messages only                                                                        | **Needs Lesia** (or drop) |
| **Reactions** over seats, 6 icons, 6 s, 800 ms limit `lib/game.js:288-296`                                                                                                 | None                                                                                        | **Needs Lesia** (or drop) |
| Presence: away after 45 s, check-ins about every 25 s `lib/game.js:121-131`                                                                                                | Same 45 s window, `online` on every player                                                  | platform                  |
| **Rejoin code made for someone else** (host any time; anyone for a player away 60 s+), seen only by its maker, 6 letters, 10 min, single use `lib/game.js:137-147,344-354` | `createRejoinCode` makes a code for **yourself** only; same 6 letters / 10 min / single use | **Needs Lesia**           |
| Host passes to `players[0]` when the host leaves `lib/game.js:370-373`                                                                                                     | Longest-joined player; plus auto handover after 60 s away; `transferHost`                   | platform (better)         |
| Kick in lobby only, two-tap confirm `lib/game.js:356-364`, `Room.js:806-858`                                                                                               | `kick` (not mid-game), Manage players; seat-tap removal in progress                         | platform                  |
| Leave in lobby only `lib/game.js:366-375`                                                                                                                                  | `leave` (not while seated in a game)                                                        | platform                  |
| Joining mid-game refused `lib/game.js:105-106`                                                                                                                             | Watches the table, seated next game                                                         | platform (better)         |
| Scores: per-player played/wins `lib/game.js:156-163`                                                                                                                       | `scores` and `lobbyStats` (with `team`/`role` from standings)                               | platform                  |
| Side tally "Good 3 – Evil 2" `components/Recap.js:40-68`                                                                                                                   | Derivable from history standings' `team`                                                    | game UI from history      |
| Reset scores: host, lobby only `lib/game.js:441-448`                                                                                                                       | Host, any status                                                                            | platform                  |
| **End game early**, not scored `lib/game.js:450-459`                                                                                                                       | No transition from `in_game` except a result                                                | **Needs Lesia**           |
| Back to the lobby after a game `lib/game.js:450-457`                                                                                                                       | Results screen: Play again / Back to lobby                                                  | platform                  |
| Theme per room `lib/game.js:316-322`                                                                                                                                       | Device day/dark                                                                             | platform (decided)        |
| Polling with versions and `unchanged` `app/api/room/[code]/route.js:23-24`                                                                                                 | Same design                                                                                 | platform                  |
| Room expires after 12 h `lib/store.js:39`                                                                                                                                  | Lobby expires after 24 h idle                                                               | platform                  |
| Per-room lock `lib/store.js:178-214`                                                                                                                                       | Per-lobby lock in the runtime                                                               | platform                  |
| TV route, QR, wake lock, join address                                                                                                                                      | `/tv/[code]`, TV lobby, join strip                                                          | platform                  |
| Install as an app (PWA prompt, iOS help) `components/InstallButton.js`                                                                                                     | None                                                                                        | out of scope for the port |
| Removed-player notice and 404 screen `app/r/[code]/page.js:127-151`                                                                                                        | Removed screen, not-found page                                                              | platform                  |
| Error toast for 4 s `app/r/[code]/page.js:101-105,166-170`                                                                                                                 | Kit `Toast`                                                                                 | platform                  |

## Edge cases

- [ ] **Disconnect mid-vote / mid-quest:** nothing is auto-played; the hand and TV say "Waiting on
      X (away)"; the fix is a rejoin code. Timers only nudge. `components/Room.js:600-619`,
      `lib/rules.js:116-119`
- [ ] **Host's phone dies mid-game:** anyone can make a rejoin code for a player unseen for over
      a minute, so the table isn't stranded. `lib/game.js:344-350`. **Needs Lesia** (see rejoin).
- [ ] **A reload keeps everything:** the seat (token in localStorage `avalon:seat:<code>`), the
      leader's draft, private notes; overlays and the celebration don't replay.
      `lib/client.js:19-45`, `components/Room.js:244-248,1134-1145`, `components/Celebration.js:20-43`
- [ ] **Five rejections on the last quest** still end the game for evil. `lib/game.js:231`
- [ ] **Quest III or IV ending the game skips the Lady.** `lib/game.js:249-265`
- [ ] **No Assassin in the game** (plain, or custom without Merlin): three successes win outright.
      `lib/game.js:253`
- [ ] **Percival without Morgana** sees one "Merlin". `lib/game.js:469,476`
- [ ] **Full set at 5–9 players** drops Mordred/Oberon (Oberon only fits at 10+); the lobby says
      which were dropped. `lib/rules.js:169-173`, `README.md:20`
- [ ] **A loyal player tapping Fail** gets a client-side note and nothing is sent; a forged Fail
      is refused by the server. `components/Room.js:514`, `lib/game.js:410`
- [ ] **The leader can't propose a duplicate-padded team**: duplicates are removed before the size
      check. `lib/game.js:388-389`
- [ ] **Lady target rules** apply to the original holder too (they're in `held` from the start).
      `lib/game.js:191,421`
- [ ] **The assassin can't target an evil player** (including Oberon, who is revealed).
      `lib/game.js:434`, `components/Room.js:234`
- [ ] **Two players acting at once** never overwrite each other (lock). **platform**.
- [ ] **A 16th player is turned away**; 15 players get 15 different colours.
      `scripts/simulate.mjs:263-272`. **platform**.
- [ ] **Reveal timing:** the final reveal overlay steps aside after 5 s so the celebration can play.
      `components/Room.js:1147-1153`
- [ ] **The simulation suite's checks** become unit tests in the port (7 scripted games at 5, 6,
      7, 8, 10, 12 and 15 players covering assassin hit/miss, five rejections, three fails, Lady,
      house rules; leak checks on every phone and the TV). `scripts/simulate.mjs:1-273`

## Where the build plan is wrong

`docs/BUILD_PLAN.md`, "Phase 2: Port Avalon", compared with the real app:

1. **5 to 10 players** → 5 to 15 with house rules for 11–15 (already noted in CLAUDE.md).
2. **"Lady of the Lake (if supported)"** → it is supported, optional, after quests II, III and IV.
3. **"Options schema … with validation that the role mix fits the player count"** → the app never
   rejects a role mix. Evil specials that don't fit are dropped in a fixed order and the lobby
   says so; dependent roles switch off. `validateOptions` should return null.
4. **"Recap: … each quest's result with who played fail cards"** → the app never records who
   played which card. Its recap says which knights on a quest were evil. Recording cards would be
   new information (see [Needs Lesia](#needs-lesia)).
5. **"Keep … the assassination and final role reveal" on the TV** → the app has no assassination
   overlay. The TV shows evil revealed on the seats, then the winner, the roles on the seats, the
   celebration and the recap below.
6. **"Votes are hidden until everyone has voted"** is only half the rule: who voted which way is
   also withheld for every earlier proposal until the game ends.
7. **Not in the plan but in the app**: optional nudge timers, live team drafting, reactions,
   private Trust/Suspect notes, player records, turn alerts, the eight-step tutorial, the two looks.
8. **Acceptance "Play again starts a second game with the same roles"** → the app has no Play
   again (the host returns to the lobby and deals again with the same settings). The platform's
   Play again keeps the options, which gives the same setup.
9. **CLAUDE.md / `game-ui.ts` call Avalon's light look "Day"**; it is called Parchment.

## Surprises found while reading

- **The vote event leaks past votes for one phase.** `room.event` keeps the last vote (with every
  player's vote) until the next vote or quest result replaces it, and `view()` sends it to every
  phone and the TV. So after a rejected team, the next proposal's vote phase still carries the
  rejected team's votes in `event.votes`, even though `history` hides them then
  (`lib/game.js:221,498`). The port should drop `votes` from the public event once the seats stop
  showing them. Worth telling Lesia, since it's a (small) hidden-info leak in the live app.
- **Evil allies never learn each other's roles**, only "Evil"; the Assassin is only named to the
  table at the assassination.
- **Oberon is revealed to everyone** during the assassination, like the rest of evil.
- **The Lady's first holder** is the seat before the random first leader.
- **Joining mid-game is refused** in Avalon, so a phone that loses its token mid-game can only
  come back with a rejoin code made by someone else.
- **The app keeps no per-card history**, so "who played Fail" can't be shown even at the end.
- **No assassination overlay** exists; the result arrives as the winner with a "named" seat tag.

## Needs Lesia

**All nine approved by Lesia on 2026-10-13** (see CLAUDE.md, "For the Avalon port"). System chat
lines are kept, not dropped, and Avalon's results show its own celebration, then the shared seal.

Each of these changes the game module contract, the lobby state machine or the protocol, so it
needs Lesia's OK before the port relies on it (CLAUDE.md, "Working rules").

1. **A clock for timers.** Avalon's nudge timers count down from each phase's server start time.
   Games get no time today (`setup` and `applyAction` take no `now`). Proposal: add `now` to
   `SetupContext` and pass it to `applyAction` (still pure, since time is an input), and add the
   server's `now` to `LobbySnapshot` so phones can correct clock skew. `onTimer` isn't needed:
   nothing is played when time runs out. Alternative: ship without timers.
2. **End game early.** The host can end a game in any phase; everyone returns to the lobby and it
   isn't scored. Jackdaw can only leave `in_game` through a result. Proposal: a host-only
   `endGame` message, `in_game → waiting`, no history entry, no score change, shown in the shell's
   menu for every game.
3. **Rejoin codes for someone else.** In Avalon the host (or anyone, for a player unseen over a
   minute) makes a code for the player whose phone died, and only the maker sees it. Jackdaw's
   `createRejoinCode` only makes a code for yourself, which can't rescue a dead phone. Proposal:
   an optional `playerId` on `createRejoinCode` with Avalon's permission rule, and the snapshot
   shows the codes the caller made.
4. **Reactions.** Six reactions that pop over your seat for 6 s, in the lobby and in game.
   Proposal: a platform `react` message (rate-limited), recent reactions on the snapshot, and on
   `ScreenPlayer` so games can draw them over seats. Alternative: drop them.
5. **Unique names.** Avalon refuses a name someone in the room already has. Knowledge lists and
   the Lady are read by name, so duplicates are confusing. Proposal: check on `join` and `rename`
   (case-insensitive).
6. **System lines in chat.** Avalon writes "X joined", "Roles are dealt. X leads the first quest.",
   Lady uses and the winner into chat. Jackdaw's chat has player messages only. Recommendation:
   drop them, since the chronicle and overlays already show game events.
7. **`sendAction` returning success.** Avalon awaits every move (busy states, closing sheets on
   success). `PlayerScreenProps.sendAction` returns `void`. Proposal: `Promise<boolean>`.
8. **Who played Fail in the recap.** The build plan asks for it; the app never records it. Lesia
   to decide whether the recap should show it (it's only revealed after the game).
9. **Celebration versus the kit verdict.** Avalon "stays identical", and its own ending is the
   good/evil celebration. CLAUDE.md now says every game uses the kit's `VerdictMoment`, and the
   shell's results screen shows its own `Verdict` above a game's `Reveal`. Lesia to decide which
   Avalon shows (or both). Not a contract change, but it decides how `Reveal` is built.
