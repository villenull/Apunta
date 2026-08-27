# M10 — First contact with a real model

**Depends on:** everything. M0–M9 are complete and independently verified.
**Environment:** this packet is the first that CANNOT run in a cloud
container. It requires a machine with a live Ollama — the owner's partner's
Linux PC, where you are now running. That is the entire reason it exists.

## Where you are picking up

Read `CLAUDE.md` first, as always. Then know this:

- All ten build packets are done: 897 unit tests / 74 files, 35 e2e, lint
  and typecheck clean at `bf98f7b`. Every one of those checks ran against
  **fake providers**. No part of this project has ever produced a note from
  real model weights. Closing that gap is this packet.
- The production target is an **8 GB M2 MacBook Pro** (the therapist's, not
  being replaced), so the shipping model is the small tier:
  **`qwen3.5:4b-q4_K_M`** (`shared/src/models.ts`). The 12B the project was
  designed around does not fit in her Metal budget. Every measurement you
  make must be on the 4B — a 12B result says nothing about her machine.
- The owner's voice was captured in
  `docs/feedback/2026-08-25-owner-style-source.md` (provenance-tagged, no
  real patient content, "Dana" is fictional) and distilled into
  `docs/note-instructions/owner-progress-instructions.md` — which re-carries
  the full anti-fabrication core, because a format's custom instructions
  REPLACE the defaults entirely (`server/src/ai/default-instructions.ts`,
  `instructionsFor`). Do not "trim the duplication" between that file and
  the defaults; there is none, by design.
- Her real note format is NOT SOAP. Her sections: Location, Client
  presentation, Risk review, Discussion, Intervention, Out of session
  actions, Note for next session. The eval corpus is SOAP — fine for
  measuring voice + faithfulness, but the config pack (below) must create
  HER format.
- Four questions from her style document are unanswered (its §6). Do not
  guess at them; note them in your report as still open.

## Ground rules that bite on a real machine

- The egress guard allows loopback only. Ollama at `127.0.0.1:11434` is
  fine (`APUNTA_OLLAMA_URL` overrides). `ollama pull` is the user running
  Ollama's own tooling — that is not the app egressing.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE` was a cloud-container workaround. On a
  normal machine leave it unset.
- `npm run smoke:live` needs `npm run build` first (it drives
  `server/dist`). `npm run eval` does not (it runs from source via tsx).
- The `--` in `npm run <script> -- --flag` is load-bearing. Without it npm
  eats the flags silently and you measure the wrong thing.
- Pin and record the Ollama version you test against; M8 bundles a specific
  release, and behaviour certified on one version must name it.
- Real patient text NEVER enters fixtures, prompts you author, commits, or
  reports. Everything you need is already fabricated.

## The work, in order

1. **Verify the three model tags exist** (`shared/src/models.ts`). They were
   written from research and never checked against a live registry:
   `ollama pull qwen3.5:4b-q4_K_M` is the one that matters. If a tag is
   wrong, find the correct one, fix `shared/src/models.ts` (one place — the
   script and installer import it), and record it in `docs/decisions.md`.
2. **Smoke:** `npm run build && npm run smoke:live -- --model qwen3.5:4b-q4_K_M --runs 5`.
   Five runs because ollama#15502 (repetition loop under grammar-constrained
   decoding) is intermittent. One clean run proves little.
3. **Baseline eval:**
   `npm run eval -- --models qwen3.5:4b-q4_K_M --runs 3 --out docs/eval-reports/2026-08-baseline-4b.md`
   The report leads with fabrication rate. That number is the project's
   viability on her hardware.
4. **Tuned eval:** same, plus
   `--instructions docs/note-instructions/owner-progress-instructions.md`,
   out to `docs/eval-reports/2026-08-tuned-4b.md`. Compare fabrication
   FIRST, voice second. If her voice rules make fabrication worse, trim
   style rules (never faithfulness rules) and re-run until it holds; record
   each change and its measured effect in the instruction file's git
   history. Levers if the 4B struggles, in order: strengthen the
   blank-over-invention wording; lower temperature; section-at-a-time
   drafting (M9's per-note summarise stage shows the pattern); a two-pass
   verify. The last two are code changes — justify before building.
5. **Commit both reports** (they contain only fixture-derived, fabricated
   content) and update `README.md`'s status line about nothing having met a
   real model — that sentence becomes false the moment step 2 passes, and
   stale honesty reads as current honesty.
6. **Build the config pack:** run the app fresh (`npm run dev`, real
   provider not needed for this), create her seven-section format named
   as she names it, paste the tuned instructions into its Instructions
   field, set `llm_model` to the 4B tag, add her vocabulary if provided,
   ZERO patients — then Settings → Back up. The zip is the config pack her
   Mac restores on first run. Document the exact steps you took in
   `docs/MANUAL-VERIFICATION.md` §9 (new).
7. **Report** — fabrication numbers baseline vs tuned, tokens/sec on this
   machine (say its RAM and CPU/GPU so the Mac comparison is honest),
   anything that failed, the four still-open questions, and what remains
   Mac-only (packaging, Gatekeeper walk, whisper on real audio).

## What "done" means

Smoke 5/5 clean · both eval reports committed · fabrication rate stated
plainly with the tuned-vs-baseline delta · config pack produced and its
recipe documented · README truthful again · baseline suite still green.
