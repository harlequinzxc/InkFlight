# ✈️ InkFlight — Inflight Menu Studio

**Ditch the pen, save the ink.**

A mobile-first installable PWA for Singapore Airlines cabin crew: pull the **live
inflight menu** for any flight, tailor it in seconds, and export a beautiful,
print-ready menu sheet — **A4 for the galley, A6 for the jacket pocket**.

> Unofficial, non-commercial tool. Menu content © Singapore Airlines. Not
> affiliated with or endorsed by SIA. Internal upstream endpoints are consumed
> politely: cached, rate-limited, attributed.

---

## Features

| | |
|---|---|
| 🔴 **Live menus** | Pulled from SQ's inflight-menu service via a server-side proxy (no CORS, no scraping) |
| ✍️ **Full editor** | Tap any text to edit; per-item include/hide; delete & add dishes; live preview |
| 🎴 **Two layouts** | *Elegant* — fancy-restaurant single sheet · *Compact* — minimal gaps, one-look |
| 📄 **A4 & A6** | True-to-size paper, export as **PNG / JPEG** or **.docx**, plus direct print |
| 🛫 **Multi-sector aware** | Sectors are **discovered live** from the flight's own `legs[]` — any multi-sector service (current or future, 2–4 sectors) gets a sector multi-select; each sector prints as its own sheet with all chosen cabins |
| 📱 **Installable** | PWA on Android, iOS (Add to Home Screen) and desktop; offline shell via service worker |
| 💾 **Resilient** | Typed errors, stale-cache fallback ("offline copy · may be outdated"), nothing ever fabricated |

## The flow

1. **Landing** — *"Ditch the pen, save the ink."* → Proceed
2. **Search** — key in a flight number (`SQ326` or `326`) → date pills appear
   (Today / Tomorrow / picker — booking horizon **today → +6 weeks**, matching the live menu site)
   → cabin check → pick one or many cabins → **Fetch menu**
3. **Interlude** — *"Fetching menu from seat pocket…"* → *"Almost there…"*
4. **Editor** — live paper preview ⇄ structured edit panel → Export sheet

Back-navigation (including hardware back) preserves all inputs.

## Architecture

```
api/getcabin.ts · api/menu.ts   Vercel serverless functions (thin)
api/_shared.ts                  shared dispatcher (also mounted in dev)
src/lib/sq.ts                   THE ENTIRE UPSTREAM SQ CONTRACT — one module
src/lib/normalize.ts            raw payload → editable document model
src/lib/flight.ts               Gate-1 syntax + date/time helpers
src/lib/api.ts                  client → own /api (typed errors)
src/lib/docbuild.ts             MenuDoc → .docx (A4/A6 × elegant/compact)
src/lib/exportImage.ts          paper DOM → PNG/JPEG (html2canvas-pro)
src/components/Paper.tsx        both printable layouts
src/views/*                     Landing · Search · Editor
```

### The upstream contract (observed, undocumented)

- `POST https://cifp.auto.prod.c0.singaporeair.com/api/getcabin` —
  `{ carrierId:"SQ", flightNumber, flightDate, sessionId }` → `cabinClasses[]`
- `POST …/api/menu` — same body **+ `cabinClass`** → full menu per `legs[]` sector
- **No auth** (`sessionId` is a client-generated UUID). Browsers are CORS-blocked →
  all calls are server-side. The **body's** `statusCode` is authoritative
  (`101` = flight/menu not found). Booking horizon: **today → +6 weeks** (enforced server-side).
- Caching: key `SQ{flight}:{date}:{cabin}`, TTL ≈ 6 h; NOT_FOUND cached minutes;
  transient upstream failures fall back to a stale copy, flagged to the UI.

If SQ changes their API, **`src/lib/sq.ts` is the only file to repair**.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173  (API included via dev middleware)
```

To develop against the built-in fake upstream (no network at all):

```bash
npm run dev:mock   # SQ_API_BASE=mock — serves demo menus from src/lib/sq-mock.ts
```

Demo rules: flight `999` or any date beyond 6 weeks → “no flight found” / out of window; flight `300`
→ no cabins yet; flight `200` → only YCL/SCL cabins; `11`/`12`, `25`/`26`, `478`/`479`
→ two-sector picker; **`700`** → a 3-sector SIN–BCN–MAD–SIN future-route demo;
YCL cabin → snack-bag sectors.
`scripts/mock-upstream.mjs` additionally simulates the raw *HTTP-level*
upstream for contract tests.

### Multi-sector services — fully dynamic

There is **no hardcoded route table**. During the cabin check the server quietly
fetches the flight's menu (first returned cabin, inside the same serverless time
budget) and derives the sector list from its **live `legs[]`** — real stations,
real local times, in the exact order the menu system returns. Consequences:

- the picker always matches what the editor will render (same data source);
- future multi-sector services (e.g. SIN–BCN–MAD–BCN–SIN) appear automatically
  — each sector becomes its own sheet, whatever their number;
- if SQ retimes, re-stations or retires a route, the picker simply reflects it.

If the discovery call cannot complete in time, the app falls back to a single
sheet containing all sectors — nothing breaks.


```bash
npm run build      # production build + PWA manifest/service worker
npm run preview    # serve the build
```

## Deploy (GitHub → Vercel)

1. Push this repo to GitHub.
2. In Vercel: **Add New Project → Import** the repo.
3. **Important — set the branch.** Development happens on
   `arena/01a06145-inkflight`. Either set that as the production branch
   (*Settings → Git → Production Branch*) or merge it into `main` first.
   Deploying `main` before the merge ships an empty site.
4. Framework preset **Vite** is auto-detected (`vercel.json` pins it).
   No environment variables are required (`SQ_API_BASE` is an optional
   dev/test override only — never set it to `mock` in production).
5. Deploy — `/api/getcabin` and `/api/menu` become serverless functions and the
   app installs as a PWA from the deployed URL.

## Troubleshooting

| Symptom | Cause & fix |
|---|---|
| *“…served a web page instead of the menu API”* / `ref: UPSTREAM_HTTP` | The deployment has **no `/api` functions** — you deployed a branch/commit without the `api/` folder, or the deploy predates the app. Redeploy the latest commit of the correct branch; check *Vercel → Deployments → Functions* lists `api/cabins` & `api/menu`. |
| *“…menu service is temporarily unreachable”* / `ref: UPSTREAM_TIMEOUT` / `UPSTREAM_NETWORK` / `UPSTREAM_HTTP` | The **SQ endpoint didn't answer the datacenter request**. The functions retry automatically within the time budget. If it persists: set the project's **function region to Singapore (`sin1`)** (*Settings → Functions → Region*) — SQ's edge often favours/geo-restricts APAC traffic; and check *Deployments → Functions → Logs* — every upstream anomaly is logged there as `[sq] …`. `SQ_API_BASE` can also point at any compatible proxy you run yourself (e.g. a home-IP tunnel). |
| *“No flight found”* (`ref: NOT_FOUND`) | The flight/date pair isn't in the menu system yet — check the flight operates that day, or try again closer to departure. |
| *“No cabins open yet”* (`ref: NO_CABINS`) | Flight exists for that date, but SQ hasn't published cabin menus yet — retry closer to departure. |
| PWA doesn't offer install | Serve over **HTTPS** (Vercel does), visit at least once, then: Chrome → install icon/menu · iOS Safari → Share → *Add to Home Screen*. |
| Menu images missing in export | Dish photos are intentionally not embedded (keep exports lean & polite to SQ's CDN). |

### Live-pull notes (from the observed contract)

- Every response is checked for **both** signals — HTTP status **and** the body's
  `statusCode` (200 ok · 101 not found · anything else typed `UPSTREAM_HTTP`).
- Requests carry the documented headers (`Origin`, `Referer`, browser
  `User-Agent`, JSON content type) and a fresh `sessionId` UUID per call;
  `checksum` is omitted by design.
- The upstream timeout is deadline-budgeted inside the serverless function
  (≤ ~8.6 s incl. one fast retry) so the function **always** answers typed JSON
  within the platform's 10 s cap — you never get a platform timeout page.

Quick deployment probe:

```bash
curl -X POST https://YOUR-APP.vercel.app/api/getcabin \
  -H 'Content-Type: application/json' \
  -d '{"flightNumber":"23","flightDate":"TODAY-YYYY-MM-DD"}'
# expect: {"ok":true,"data":{"cabinClasses":[...]}} or a typed NOT_FOUND — never HTML
```

## PWA install

- **Android/Chrome:** menu → *Install app* / install prompt.
- **iOS Safari:** Share → *Add to Home Screen*.
- **Desktop:** install icon in the address bar.

## Licensing & ethics

Menu content © Singapore Airlines. This is an independent crew productivity
tool: be a polite client, don't hammer the upstream, and don't use it
commercially.
