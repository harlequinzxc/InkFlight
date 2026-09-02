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
| 🛫 **Multi-sector aware** | Sectors, parallel menu selections (e.g. International vs kaiseki), choose-N courses, beverages, snacks, amenities, service banners |
| 📱 **Installable** | PWA on Android, iOS (Add to Home Screen) and desktop; offline shell via service worker |
| 💾 **Resilient** | Typed errors, stale-cache fallback ("offline copy · may be outdated"), nothing ever fabricated |

## The flow

1. **Landing** — *"Ditch the pen, save the ink."* → Proceed
2. **Search** — key in a flight number (`SQ326` or `326`) → date pills appear
   (Today / Tomorrow / picker, today → +6 weeks; menus publish today → +8 days)
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
  (`101` = flight/menu not found). Menus publish **today → +8 days**.
- Caching: key `SQ{flight}:{date}:{cabin}`, TTL ≈ 6 h; NOT_FOUND cached minutes;
  transient upstream failures fall back to a stale copy, flagged to the UI.

If SQ changes their API, **`src/lib/sq.ts` is the only file to repair**.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173  (API included via dev middleware)
```

To develop against a fake upstream, start `node scripts/mock-upstream.mjs`
and run `SQ_API_BASE=http://127.0.0.1:4560 npm run dev`.

```bash
npm run build      # production build + PWA manifest/service worker
npm run preview    # serve the build
```

## Deploy (GitHub → Vercel)

1. Push this repo to GitHub.
2. In Vercel: **Add New Project → Import** the repo.
3. Framework preset **Vite** is auto-detected (`vercel.json` pins it).
   No environment variables are required (`SQ_API_BASE` is an optional
   dev/test override only).
4. Deploy — `/api/getcabin` and `/api/menu` become serverless functions and the
   app installs as a PWA from the deployed URL.

## PWA install

- **Android/Chrome:** menu → *Install app* / install prompt.
- **iOS Safari:** Share → *Add to Home Screen*.
- **Desktop:** install icon in the address bar.

## Licensing & ethics

Menu content © Singapore Airlines. This is an independent crew productivity
tool: be a polite client, don't hammer the upstream, and don't use it
commercially.
