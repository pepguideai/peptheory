# peptheory.io (web)

Static peptide reconstitution guide. No build step, no server, no analytics. Saved compounds live in the browser's localStorage.

## Files
- `index.html` — shell
- `styles.css` — Organic theme tokens + component styles
- `app.js` — state, math, rendering
- `assets/mix-vial.png` — step 3 illustration
- `vercel.json` — clean URLs + basic headers

## Deploy
1. Push this folder to a GitHub repo (or make it the repo root).
2. In Vercel: New Project → import the repo → Framework preset **Other**, no build command, output directory `.` (or set Root Directory to `web` if this folder is nested).
3. Deploy. Every push to main redeploys.

Local preview: `npx serve .` or any static server.

Math only. Verify before use. Not medical advice.
