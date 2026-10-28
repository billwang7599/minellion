# Minellion

Krillion, but for Minecraft: a daily rare-answer trivia dig. Seven prompts a day, 25 seconds each. Name an answer that fits; a miss costs nothing but time, so keep trying. The rarer the answer, the
more points you score and the deeper you dig, from the surface at Y 64 down to bedrock at Y -64 (700 points).

It's one Cloudflare Worker with static assets: no database and no build step. Prompts and answers live in
`data/days.json`, player results live in the browser's localStorage.

## Run locally

```sh
npm install
npm run dev     # http://localhost:8787
npm test
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

## Deploy

```sh
npx wrangler login
npx wrangler deploy
```

## API

| Route | Returns |
|---|---|
| `GET /api/days` | `{ today, tiers, days: [{ date, number }] }`, days up to today |
| `GET /api/days/:date` | `{ date, number, prompts: [{ category, text }] }` |
| `POST /api/days/:date/:round/guess` `{ guess }` | `{ accepted: true, answer, tier, points }`, `{ accepted: false, suggestion }` for a typo, or `{ accepted: false }` |
| `GET /api/days/:date/:round/answers` | `{ answers: { dirt: [...], ... } }` canonical names by tier |

Rounds are 1 to 7. Future or unknown dates are 404.
