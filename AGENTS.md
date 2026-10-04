# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Website (website/)

- Tap-peak generation: signal + tap indices live in the repo, never videos. Regenerate `website/public/data/finger-tapping-peaks.json` with `python3 website/tools/generate_peaks.py` (requires scipy) whenever `src/main.py` output (`website/public/data/finger-tapping.json`) changes.
- Counter verification (no test framework installed): `node website/app/tap-counter-tests.cjs` — pure-node assertions over the real peaks JSON; `website/app/tap-counter.ts` must stay free of React/browser APIs so that script keeps working.
- Anything Next.js-specific: read the guide under `node_modules/next/dist/docs/` first per `website/AGENTS.md`; a local `next start` may already hold port 3000 from another checkout — use `-p <other-port>`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
