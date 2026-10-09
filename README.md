# Ship2US — SmartShip MVP

**Know before you ship.** Ship2US is a cross-border shipping guidance app for consumers and small businesses sending goods from India to the United States. It helps you understand, before you ship, what is likely eligible, how to pack it, what it might cost, and what paperwork you'll need.

This is a dependency-free Node.js app: a small HTTP server plus a vanilla-JS single-page frontend and a seeded JSON store. No npm packages are required.

## Run

Requires Node.js 20 or newer.

```bash
npm start
```

Then open <http://localhost:3000>.

## Test

```bash
npm test
```

Runs the deterministic engine smoke tests (`test-engine.js`) against the seeded rules and rates. Expected output ends with `27 passed, 0 failed`.

## The five-step flow

1. **Describe** — list what you're sending, conversationally or item by item, and choose consumer or small-business framing.
2. **Eligibility** — item-level eligibility and regulatory guidance from the seeded rule set.
3. **Packing** — a generated packing plan with box and weight guidance.
4. **Compare** — illustrative landed-cost estimates across carriers.
5. **Prepare** — a checklist and a draft declaration to take to your carrier.

A Hyderabad → Austin demo (**Try the demo** on the landing page) walks through the whole flow with sample items.

## Admin

Open <http://localhost:3000/#/admin> to edit seeded tariff rules, restriction flags, and carrier rates, and to review quote requests and community feedback. Changes are stored in `data/db.json`.

## Trust disclaimer

All estimates, eligibility results, and packing suggestions are **illustrative**. They are generated from seeded demo data and are never live carrier quotes, binding customs determinations, or regulatory advice. Simulated photo suggestions require your confirmation. Always confirm with your carrier and the relevant customs authority before shipping.

## Layout

```
server.js          HTTP server: static files from public/ and a JSON API under /api
test-engine.js     Engine smoke tests (npm test)
public/            Frontend: index.html, styles, theme, app/admin/engine/data scripts
data/db.json       Seed store (tracked; the app reads it at boot)
```
