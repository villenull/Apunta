# M0 — Scaffold

**Depends on:** nothing

## Goal

A green, empty skeleton: monorepo with workspaces, toolchain, CI, a Fastify
server that serves a placeholder React SPA, and both test harnesses running.
No product features.

## Deliverables

1. Root `package.json` with npm workspaces: `server`, `web`, `shared`, `e2e`.
   Node `>=22` engines field. Root scripts exactly as named in CLAUDE.md
   (`dev`, `dev:fake`, `start`, `lint`, `typecheck`, `test`, `e2e`;
   `smoke:live` may be a stub that prints "implemented in M3/M5").
2. `shared/`: TypeScript package exporting zod + generated types; start with
   a `HealthResponse` schema.
3. `server/`: Fastify 5 + TypeScript (run with `tsx` in dev, `tsc` build for
   prod). Binds `127.0.0.1:7717` (port via `APUNTA_PORT`).
   - `GET /api/health` returning a stub `HealthResponse` (all checks
     hard-coded false for now, `ok: true`).
   - **Egress guard**: at bootstrap, wrap global `fetch` to throw on any URL
     whose hostname is not `127.0.0.1`, `localhost`, or `::1`. Unit-test it.
   - In production mode serves static files from `web/dist` with SPA
     fallback to `index.html`.
4. `web/`: Vite + React 19 + TypeScript. Placeholder page that fetches
   `/api/health` and renders "Apunta — server ok". Vite dev server
   proxies `/api` → `http://127.0.0.1:7717`. Port the design tokens (CSS
   custom properties, fonts, base element styles) from `prototype/style.css`
   into `web/src/styles/tokens.css` — visual components come in M2.
5. Tooling: ESLint (flat config) + Prettier + `tsc --noEmit` typecheck across
   workspaces; Vitest configured in `server`, `shared`, `web`.
6. `e2e/`: Playwright (Chromium only) with a `webServer` config that builds
   web and starts the server with `APUNTA_FAKE_AI=1` and a temp
   `APUNTA_DATA_DIR`. One spec: loads `/`, sees the health message.
7. `.github/workflows/ci.yml`: on push/PR — install, lint, typecheck, test,
   build, Playwright (with browser caching). ubuntu-latest, Node 22.
8. `.gitignore`, `.nvmrc`, and a one-paragraph "Development" section added to
   `README.md` describing the commands.

## Notes

- Verify current stable versions of every dependency at implementation time;
  pin with caret ranges and commit the lockfile.
- Keep the server entry small: `buildApp()` factory (used by tests via
  `fastify.inject`) separate from `listen` bootstrap.
- `APUNTA_DATA_DIR` env is read at boot even though nothing uses it yet —
  create the directory if missing.

## Acceptance criteria

- Fresh clone: `npm install && npm run lint && npm run typecheck && npm test
  && npm run e2e` all pass.
- `npm start` then opening http://127.0.0.1:7717 shows the placeholder page
  with a passing health fetch.
- CI workflow passes on the PR.
- Egress guard test proves a `fetch("https://example.com")` from server code
  throws.
