# Minellion

Krillion, but for Minecraft: a daily rare-answer trivia dig. Seven prompts a day, 25 seconds each. Name an answer that fits; a miss costs nothing but time, so keep trying. The rarer the answer, the
more points you score and the deeper you dig, from the surface at Y 64 down to bedrock at Y -64 (700 points).

It's one Cloudflare Worker with static assets and no database. The front end is React, built with Vite and
Cloudflare's Vite plugin, which also runs the Worker in dev. Prompts and answers live in `data/prompts.json`, player
results live in the browser's localStorage.

## Layout

- `src/worker.js`: the API under `/api/*`; everything else is the built SPA.
- `src/game.js`, `src/match.js`: plain modules shared by the client, the Worker and the tests.
- `src/client/`: the React app (`app.jsx` routing and HUD, `World.jsx` the dig scene, `Round.jsx` the guess box,
  `screens.jsx` the other screens) and `style.css`.

## Run locally

```sh
npm install
npm run dev       # Vite + the Worker, http://localhost:5173
npm test
npm run build     # dist/client (assets) and dist/minellion (Worker + generated wrangler.json)
npm run preview   # serve the build in the Workers runtime
```

## Add questions

`data/prompts.json` is a question bank; each day's 7 prompts are dealt from it by date alone, so there's nothing to
schedule. Dive #1 is `start` (2026-10-22) and every day since has a dive. The file points at
`data/prompts.schema.json`, so editors validate it as you type.

To add questions, append prompts at the end of `prompts` with an `added` date after today. Never delete or reorder
prompts, and never give a new prompt a date that's already passed: either changes dives people have already played.
Editing a prompt's text or answers in place is fine. `test/frozen-days.json` pins every dive from Oct 22 to Nov 18,
so `npm test` fails if a past day changes. New prompts added before Nov 19 change the pinned days after their
`added` date; that's fine while those days are still in the future, so update just those entries of the fixture.

How a day is dealt (`deal()` in `src/worker.js`):

- Prompts never dealt before go first, in file order. The launch bank (`added` = `start`) is dealt exactly in file
  order, which reproduces the hand-made dives of Oct 22 to Nov 4.
- After that, days are filled from a repeat deck: every dealt prompt, shuffled with a seed from the date the deck was
  built, least recently dealt half first. A new deck is built only when the old one runs out, so no prompt repeats
  until every prompt has been used. With 196 prompts a question comes back about every 28 days.
- Each prompt has 1 to 3 `tags` (`mobs`, `blocks`, `items`, `world`, `nether`, `end`, `crafting`, `loot`, `names`,
  `lore`, `mechanics`). A day skips a card that shares a tag with one already dealt that day if another card fits;
  a tag that still makes up 2+ per day of what's left may repeat. `category` is only the label the game shows.

Each prompt also needs:

- At least 10 answers, at least one `dirt` answer, at least one `diamond` or `netherite` answer, and a text no other
  prompt has.
- Answers are grouped by tier, from most obvious to rarest: `dirt` 10, `coal` 15 (the pick that feels clever but
  isn't), `iron` 30, `gold` 60, `diamond` 85, `netherite` 100 ("One in a Minellion").
- An answer is a name, or `["Name", "Alias", ...]` to also accept other names in this prompt only ("Black Bed" for
  "Bed"). Matching ignores case, accents, punctuation, spaces, a leading "the/a/an" and a trailing "s". A guess one
  typo away from a single name of 5+ letters gets that name back as a suggestion to confirm. No two names in a prompt
  may be equal after that normalization.
- Nicknames and old names that always mean the same thing ("Wither Head", "Zombie Pigman", "Snowy Tundra") go in
  `data/aliases.json` instead, as `{ "In-Game Name": ["alias", ...] }`. Every prompt with that name, as an answer or
  one of its aliases, accepts them; the prompt's own names win. An alias points to one name only.

A new dive goes live at midnight New York time. Days after today are never served.

## Autocomplete

The guess box only fixes spelling. Once a guess has 4+ letters and isn't a known name, it lists names within one typo
(two from 8 letters; swapped letters count as one), never names that merely start with or contain what you typed, so a
fragment like "raw" lists nothing. Names come from `GET /api/names`: every answer name in `data/prompts.json`, every
alias in `data/aliases.json`, plus `data/names.json`, a generic list that keeps suggestions from giving answers away. `names.json` holds the block, item,
mob, biome, enchantment, effect, potion, music disc, painting, trim, goat horn, profession and advancement names from
the Minecraft 26.3 client jar's `assets/minecraft/lang/en_us.json`, minus technical blocks, spawn eggs and wall
variants. The logic lives in `suggest()` in `src/match.js`.

The app has one page, `/`: the menu, archive and past dives switch screens without changing the URL.

## Deploy

```sh
npx wrangler login
npm run deploy    # npm run build && wrangler deploy
```

`wrangler deploy` picks up the config Vite writes to `dist/minellion/wrangler.json`, so always build first. In
Cloudflare's Git integration set the build command to `npm run build` and the deploy command to `npx wrangler deploy`.

## API

| Route | Returns |
|---|---|
| `GET /api/days` | `{ today, tiers, days: [{ date, number }] }`, days up to today |
| `GET /api/days/:date` | `{ date, number, prompts: [{ category, text }] }` |
| `POST /api/days/:date/:round/guess` `{ guess }` | `{ accepted: true, answer, tier, points }`, `{ accepted: false, suggestion }` for a typo, or `{ accepted: false }` |
| `GET /api/days/:date/:round/answers` | `{ answers: { dirt: [...], ... } }` canonical names by tier |
| `GET /api/names` | `{ names: [...] }` every name the guess box can suggest, sorted |

Rounds are 1 to 7. Future or unknown dates are 404.
