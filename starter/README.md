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

## Starter Segment

The starter is meant to install a small opinionated working layer, not just a few files.

### `AGENTS.md`

`AGENTS.md` is the always-on coding contract for AI-assisted work. It sets the default engineering rules for Angular, TypeScript, and NestJS work so generated code starts from the same baseline every time.

It covers things like:

- standalone Angular components
- signals, `computed()`, `input()`, and `output()`
- `OnPush` change detection
- reactive forms only
- native Angular template control flow
- thin shells and facades with child-owned rendering
- early use of tokens and shared primitives for repeated UI patterns
- ownership-driven refactoring before drift turns into a large rewrite
- NestJS module boundaries, DTO validation, thin controllers, and service-based business logic

### Engineering Docs

The starter also copies:

- `docs/engineering-standards.md`
- `docs/ui-patterns.md`

These are the longer-form reference docs behind the compact rules in `AGENTS.md`. `AGENTS.md` is the short operational layer; the docs explain the broader standards and patterns in more detail.

They also capture the starter's default architecture posture: clear feature boundaries, thin orchestration layers, shared tokens and UI primitives for reused patterns, and refactoring by ownership and duplication signals instead of waiting only for large files.

### ESLint And Prettier

`eslint.config.js` sets the default linting behavior for Angular templates and TypeScript source files. The config is intentionally opinionated and enforces several repo preferences directly, including:

- no `any`
- no `@HostBinding` or `@HostListener`
- no `ngClass` or `ngStyle`
- `OnPush` component change detection
- unused import cleanup
- Angular template accessibility checks

Prettier is added through `package.json` so formatting is consistent without needing project-specific setup each time.

### Husky And `lint-staged`

The starter adds:

- `.husky/pre-commit`
- `lint-staged`

The pre-commit hook runs `lint-staged`, which means staged TypeScript and HTML files are lint-fixed before commit, and staged style/doc/json files are formatted with Prettier. This keeps the quality gate close to the developer workflow instead of relying only on CI.

### Bootstrap Script

`starter/bootstrap-angular-starter.mjs` wires all of this in one pass. It:

- patches `package.json`
- adds scripts like `lint`, `lint:fix`, `format`, `format:check`, `prepare`, and `ci:quality`
- adds the required dev dependencies
- copies the starter files into the target project
- patches `src/styles.scss` when present so the semantic token stylesheet is connected

The goal is to make a fresh Angular project immediately follow the same tooling and engineering defaults as this repo.

## Usage

1. Create a fresh Angular project with SCSS.
2. From this repo, run:

```bash
npm run starter:bootstrap
```

Or target another project directory explicitly:

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
- If no target directory is passed, it bootstraps the current working directory.
