# Angular Starter

This starter captures the repo defaults that reduce drift and token-heavy setup in future Angular projects.

## What it adds

- `AGENTS.md` with compact always-on coding rules
- `eslint.config.js`
- `.prettierignore`
- `.husky/pre-commit`
- `docs/engineering-standards.md`
- `docs/ui-patterns.md`
- `src/styles/_tokens.scss`
- `package.json` updates for scripts, lint-staged, Prettier, and dev dependencies

## Usage

1. Create a fresh Angular project with SCSS.
2. From this repo, run:

```bash
npm run starter:bootstrap -- ../my-angular-app
```

3. In the target project, run:

```bash
npm install
npm run prepare
npm run lint
npm run build
```

## Notes

- The bootstrap script patches `src/styles.scss` when it exists and appends the semantic token mixins.
- It does not install packages for you.
- It assumes a standard Angular workspace layout with `package.json` at the project root.
