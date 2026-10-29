# Minellion

Krillion, but for Minecraft: a daily rare-answer trivia dig. Seven prompts a day, 25 seconds each. Name an answer that fits; a miss costs nothing but time, so keep trying. The rarer the answer, the
more points you score and the deeper you dig, from the surface at Y 64 down to bedrock at Y -64 (700 points).

It's one Cloudflare Worker with static assets and no database. The front end is React, built with Vite and
Cloudflare's Vite plugin, which also runs the Worker in dev. Prompts and answers live in `data/days.json`, player
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

## Add a day

Append a day to `days` in `data/days.json`. The file points at `data/days.schema.json`, so editors validate it as you
type. Rules (checked by `npm test`):

- Dates are consecutive; the dive number is the day's position in the list (first day = #1).
- Each day has exactly 7 prompts; each prompt has at least 10 answers and at least one `dirt` answer.
- Answers are grouped by tier, from most obvious to rarest: `dirt` 10, `coal` 15 (the pick that feels clever but
  isn't), `iron` 30, `gold` 60, `diamond` 85, `netherite` 100 ("One in a Minellion").
- An answer is a name, or `["Name", "Alias", ...]` to also accept other spellings. Matching ignores case, accents,
  punctuation, spaces, a leading "the/a/an" and a trailing "s". A guess one typo away from a single name of 5+ letters
  gets that name back as a suggestion to confirm. No two names in a prompt may be equal after that normalization.

A new dive goes live at midnight New York time. Days after today are never served.

## Autocomplete

The guess box only fixes spelling. Once a guess has 4+ letters and isn't a known name, it lists names within one typo
(two from 8 letters; swapped letters count as one), never names that merely start with or contain what you typed, so a
fragment like "raw" lists nothing. Names come from `GET /api/names`: every answer name in `data/days.json` plus
`data/names.json`, a generic list that keeps suggestions from giving answers away. `names.json` holds the block, item,
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
