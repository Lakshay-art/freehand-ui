# Contributing to freehand-ui

Thanks for helping out! Bug reports, fixes, docs, and new ideas are all welcome.
By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

Requires Node.js 18 or newer.

```bash
git clone https://github.com/Lakshay-art/freehand-ui.git
cd freehand-ui
npm install
npm run build
npm run dev     # serves the examples at http://localhost:5173/examples/
```

## Project layout

- `src/` - core drawing code, plus `react.js` and `native/` entry points and the `.d.ts` types
- `tests/` - tests using the built-in `node --test` runner
- `examples/` - HTML demos, one per feature
- `scripts/` - build and dev server

## Before you open a pull request

```bash
npm run check   # typecheck + tests + build
```

- Add or update tests for behaviour changes.
- Keep `src/*.d.ts` and the README in sync with API changes.
- Add a line under "Unreleased" in [CHANGELOG.md](CHANGELOG.md).
- Keep PRs focused; one change per PR is easiest to review.

## Submitting

1. Fork the repo and create a branch from `main`.
2. Commit your changes and push the branch.
3. Open a pull request and fill in the template.

For larger changes, open an issue first so we can agree on the approach.

## Releases (maintainers)

1. Move "Unreleased" entries in `CHANGELOG.md` under a new version heading.
2. `npm version <patch|minor|major>`
3. `git push --follow-tags`, then `npm publish --access public`
   (`prepublishOnly` builds and tests).
