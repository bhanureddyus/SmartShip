# Ship2US mobile (Expo)

The same five-step journey as the web app, on a phone, against the same API — plus the camera.
Expo SDK 57 · React Native · TypeScript · Expo Router. Runs in Expo Go; not store-ready.

The shipping engine is **imported, not copied**: `metro.config.js` adds `../public/js` to
`watchFolders`, and `src/engine.ts` / `src/data.ts` load `public/js/engine.js` and `data.js`
through their guarded CommonJS tail. One source of truth; the root `npm test` still covers it.

## Run it in Expo Go (Bhanu — this is the M4 review step)

```bash
cd mobile
npm install
npx expo start
```

1. Install **Expo Go** on your phone (App Store / Play Store).
2. Scan the QR code the terminal prints (iOS: Camera app; Android: inside Expo Go).
   Phone and laptop must be on the same Wi-Fi; if the QR fails, run `npx expo start --tunnel`.
3. Tap **Try the Hyderabad → Austin demo** and walk the five steps. Expect: 3 items,
   12.55 kg billed, five quotes, Post EMS cheapest at $114.63 — identical to the web.
4. On **Check**, tap **Yes** on the "Does this match what you've seen?" strip. The report lands in
   the hosted `data/db.json`; confirm at `<API_BASE>/admin` under Community reports.
5. On **Ship**, send the hand-over report and tap **Take a photo** — this exercises the
   camera → resize (≤ 1600 px) → raw-bytes `POST /api/photo` path. The share card then shows the
   receiver link and QR.

### Open the receiver flow by deep link

Copy the token from the share card URL (`…/#/r/<token>`), then:

```bash
npx uri-scheme open "ship2us://r/<token>" --ios
npx uri-scheme open "ship2us://r/<token>" --android
```

(With Expo Go the dev-client URL form also works: `exp://<lan-ip>:8081/--/r/<token>`.)
Expect five panes — Arrived → How was it → Photos → One line → Send — then the read-only
recap on a second open. Receiver photos go through `POST /api/share/:token/photo`.

## Point it at a different API

The app defaults to the hosted demo backend so Expo Go needs no local server.

```bash
EXPO_PUBLIC_API_BASE=http://<your-lan-ip>:3000 npx expo start
```

(`localhost` will not work from a phone — use the machine's LAN IP, and run `node server.js`
at the repo root.)

## Checks

```bash
npx tsc --noEmit     # types
npx jest             # engine parity (M2) + QuickTap / receiver panes (M3)
npx expo export --platform web && npx serve dist   # browser smoke render
```

CI runs the first two as the `mobile` job in `.github/workflows/ci.yml`.

## Layout

```
app/                  Expo Router routes
  index.tsx           landing: start / demo / resume + community story strip
  estimate/           stepper layout + describe · check · pack · cost · ship
  r/[token].tsx       receiver arrival flow (deep link target)
  admin.tsx           read-only community reports
src/
  engine.ts data.ts   shared engine + seed imported from ../public/js
  engine.d.ts         hand-written types for the engine surface we use
  api.ts              typed wrappers for every /api route
  store.ts            journey state (context + AsyncStorage), same shape as the web `state`
  journey.ts          step definitions and guards
  theme.ts            tokens mirrored from public/app.css (light only)
  components/         QuickTap · InsightLine · PhotoPicker · ShareCard · ReceiverFlow · ui
__tests__/            Jest (jest-expo preset)
```

Community insight is shown beside engine output, never fed into it, and always carries the
"Community input · unverified" badge — same invariant as the web.
