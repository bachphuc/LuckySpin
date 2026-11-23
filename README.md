# LuckySpin

A small Wheel of Names–style app: build a wheel from a list, spin it locally, or share it so each participant can spin once. Every prize is awarded only once. MongoDB is the source of truth, and the server picks every shared result.

**Stack:** Next.js 16 (App Router, Route Handlers) · TypeScript · Tailwind CSS 4 · official MongoDB Node driver · Zod · Vitest · Playwright

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in MONGODB_URI
npm run dev
```

No Atlas yet? `npm run dev:memory` runs the app against a throwaway in-memory MongoDB. All data is lost when it stops.

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | Atlas connection string. Server-only, so it never gets a `NEXT_PUBLIC_` prefix. |
| `MONGODB_DB_NAME` | Database name (default `luckyspin`). |
| `NEXT_PUBLIC_APP_URL` | Base URL for share links. If it's empty, the request origin is used. |
| `RATE_LIMIT_DISABLED` | Set to `1` to turn rate limiting off (tests only). |

## Scripts

| Command | What it does |
|---|---|
| `npm test` | Unit, API and concurrency tests (Vitest + in-memory MongoDB) |
| `npm run test:e2e` | Playwright UI tests (desktop + mobile) using your installed Chrome. Use `PW_BUNDLED=1` to use Playwright's Chromium instead. |
| `npm run typecheck` / `npm run lint` / `npm run build` | Static checks and production build |

The first test run downloads a MongoDB binary for `mongodb-memory-server`. To run the tests against a real server, set `TEST_MONGODB_URI`.

## API

| Method | Route | Notes |
|---|---|---|
| `POST` | `/api/wheels` | `{ name, items[] }` → `{ code, name, status, shareUrl }` (201) |
| `GET` | `/api/wheels/[code]` | Public wheel: items, participants, results, counts |
| `POST` | `/api/wheels/[code]/spin` | `{ participantId, participantName, requestId }` → awarded result |

Errors use the shape `{ success: false, error: { code, message } }`. The codes are `INVALID_REQUEST` (400), `WHEEL_NOT_FOUND` (404), `WHEEL_COMPLETED` / `PARTICIPANT_ALREADY_SPUN` / `SPIN_CONFLICT` (409), `RATE_LIMITED` (429) and `INTERNAL_SERVER_ERROR` (500).

## How a spin stays concurrency-safe

Each wheel is a single document holding `items`, `participants` and `results`, so a spin is a single-document atomic write. `src/lib/spin-service.ts` does the following:

1. It reads the wheel. If the `requestId` was already used, it returns the stored result (idempotent retry). If the participant already spun, it returns 409. If the wheel is completed, it returns 409.
2. It picks a random remaining item using `crypto.randomInt`.
3. It calls `findOneAndUpdate` with a filter that re-checks everything: the wheel is `ACTIVE`, the participant isn't recorded, the `requestId` isn't recorded, and the chosen item is still present.
4. The update is an aggregation pipeline that removes the item, appends the participant and result, and sets `status: COMPLETED` / `completedAt` when no items are left. All of this happens in the same atomic operation.
5. If the filter misses because another request won the race, nothing is written. It reloads and retries with a fresh pick, up to 25 attempts.

User-entered strings are wrapped in `$literal` inside the pipeline, so a name like `$items` is stored as text and never read as a field path.

The concurrency tests cover these cases:
- 20 participants racing for 10 items gives exactly 10 unique awards, and the wheel ends `COMPLETED`.
- 10 simultaneous spins from one participant give exactly one award.
- 10 simultaneous retries of one `requestId` all return the same result.
- A stress test with 5 wheels and 30 spinners each.

## Notes and MVP limitations

- **Rate limiting:** a fixed-window counter in a `rate_limits` collection with a TTL index. It's shared across serverless instances, unlike an in-memory map. Limits are 10 creates per minute and 60 spins per minute per IP. If MongoDB is unreachable, the limiter lets requests through.
- **Participant identity:** a UUID in `localStorage` under `luckyspin:participant:<code>`. Clearing storage creates a new identity, which is an accepted limitation since there's no authentication.
- **Polling:** the shared page polls every 3 seconds. Polling pauses while the tab is hidden and never interrupts a running spin animation.
- **Wheel lifetime:** wheels are never deleted (no TTL).

## Deploying to Vercel

1. Push the repo and import it in Vercel.
2. Set `MONGODB_URI`, `MONGODB_DB_NAME` and `NEXT_PUBLIC_APP_URL` in the project's environment variables.
3. In Atlas, use a dedicated database user with readWrite on `luckyspin` only. Allow Vercel's egress in Network Access (`0.0.0.0/0` is the usual choice for serverless).
4. Deploy, then run through creating a wheel, sharing it, spinning from two devices, and completing it.
