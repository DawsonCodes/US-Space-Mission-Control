# Contributing to U.S. Space Mission Control

Thanks for your interest in improving U.S. Space Mission Control! This is a
small, friendly, dependency-free portfolio project that tracks NASA missions,
SpaceX launches, Blue Origin flights, Rocket Lab launches, ULA launches, and
Firefly launches, and thoughtful contributions of any
size are welcome — bug fixes, docs, accessibility tweaks, or new ideas.

## Before you start

- For anything beyond a small fix, please **open an issue first** so we can
  discuss the idea before you invest time in a pull request.
- Keep changes focused. One topic per pull request is much easier to review.

## Project principles

This project is intentionally simple, and we'd like to keep it that way:

- **Plain HTML, CSS, and JavaScript only.** No frameworks, no TypeScript, no
  bundler, and no build step.
- **Avoid unnecessary dependencies.** There is no `package.json` and no
  `node_modules` — please don't add one without a discussion first.
- **Preserve GitHub Pages compatibility.** The site is served from the repo root
  under a project path
  (`https://dawsoncodes.github.io/US-Space-Mission-Control/`), so always use
  **relative** asset paths (`js/main.js`, `styles/base.css`, `assets/images/...`)
  and never leading-slash absolute paths (`/js/main.js`). Keep `index.html` at
  the repo root.
- **Keep the focus.** The product tracks NASA (a civil agency) plus the SpaceX,
  Blue Origin, Rocket Lab, ULA, and Firefly launch providers. Please don't add
  other providers or an "other providers" view.

## Branch naming

Please branch from `main` using a descriptive prefix:

- `feature/...` — new functionality (e.g. `feature/launch-share-links`)
- `fix/...` — bug fixes (e.g. `fix/countdown-drift`)
- `docs/...` — documentation only (e.g. `docs/readme-screenshot`)

## Testing locally

The app uses ES modules, so it must be served over `http://` — opening
`index.html` from the file system (`file://`) will fail. Start any static
server from the project root:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

Or, if you prefer Node's one-liner:

```bash
npx serve .
```

Then manually exercise the features you touched: loading live data, refresh,
the organization tabs/overview tiles, demo mode (under **More**), search,
mission-type and flight-type filters, sorting, favorites, the local/UTC toggle,
and the countdowns. If you touched classification or the API merge, also run the
logic tests with Node:

```bash
node tests/classification.test.mjs
node tests/merge.test.mjs
```

Check the browser console for errors and confirm the page still works at mobile,
tablet, and desktop widths.

## Pull request checklist

Before opening your PR, please confirm:

- [ ] Tested locally with a static server (no console errors).
- [ ] Works under the GitHub Pages **project path** (relative paths only).
- [ ] `index.html` is still at the repository root.
- [ ] No framework, build step, or unnecessary dependency was added.
- [ ] Documentation updated if behavior or setup changed.
- [ ] Screenshots included for any visible UI change.

## Please don't commit

Keep the repository clean — do **not** commit:

- secrets, API keys, or access tokens
- `.env` or other environment files
- generated junk or build artifacts
- editor/IDE files unrelated to the project (`.vscode/`, `.idea/`, `*.swp`, etc.)

Thanks again, and happy launching! 🚀
