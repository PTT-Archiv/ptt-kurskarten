#!/usr/bin/env node

import { chmodSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const templateRoot = path.join(repoRoot, 'starter', 'files');

const copiedDevDependencies = [
  'eslint',
  'angular-eslint',
  '@typescript-eslint/eslint-plugin',
  '@typescript-eslint/parser',
  'eslint-plugin-unused-imports',
  'eslint-config-prettier',
  'prettier',
  'husky',
  'lint-staged',
];

const fallbackDevDependencyVersions = {
  eslint: '^9.18.0',
  'angular-eslint': '^21.3.1',
  '@typescript-eslint/eslint-plugin': '^8.54.0',
  '@typescript-eslint/parser': '^8.54.0',
  'eslint-plugin-unused-imports': '^4.4.1',
  'eslint-config-prettier': '^10.1.8',
  prettier: '^3.8.1',
  husky: '^9.1.7',
  'lint-staged': '^16.4.0',
};

const starterScripts = {
  lint: 'eslint .',
  'lint:fix': 'eslint . --fix',
  format: 'prettier . --write',
  'format:check': 'prettier . --check',
  prepare: 'husky',
  'ci:quality': 'npm run lint && npm run format:check && npm run build',
};

const starterLintStaged = {
  '*.{ts,html}': ['eslint --fix'],
  '*.{scss,css,md,json}': ['prettier --write'],
};

const starterPrettier = {
  printWidth: 100,
  singleQuote: true,
  overrides: [
    {
      files: '*.html',
      options: {
        parser: 'angular',
      },
    },
  ],
};

function printUsage() {
  console.log(`Usage: npm run starter:bootstrap -- [target-directory]

Bootstraps a fresh Angular project with the Angular starter guardrails:
- ESLint + Prettier config
- Husky pre-commit hook + lint-staged
- compact AGENTS.md
- engineering and UI docs
- semantic token stylesheet

If target-directory is omitted, the current working directory is used.

Example:
  npm run starter:bootstrap
  npm run starter:bootstrap -- ../my-angular-app`);
}

function mergeOverrides(current = [], incoming = []) {
  const byFile = new Map();
  for (const override of current) {
    byFile.set(override.files, override);
  }
  for (const override of incoming) {
    byFile.set(override.files, override);
  }
  return [...byFile.values()];
}

async function copyDirectory(sourceDir, targetDir) {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
      continue;
    }

    await mkdir(path.dirname(targetPath), { recursive: true });
    const content = await readFile(sourcePath);
    await writeFile(targetPath, content);
  }
}

async function updatePackageJson(targetRoot) {
  const sourcePackage = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  const targetPackagePath = path.join(targetRoot, 'package.json');
  const targetPackage = JSON.parse(await readFile(targetPackagePath, 'utf8'));

  targetPackage.scripts = {
    ...(targetPackage.scripts ?? {}),
    ...starterScripts,
  };

  targetPackage.prettier = {
    ...(targetPackage.prettier ?? {}),
    ...starterPrettier,
    overrides: mergeOverrides(targetPackage.prettier?.overrides, starterPrettier.overrides),
  };

  targetPackage['lint-staged'] = {
    ...(targetPackage['lint-staged'] ?? {}),
    ...starterLintStaged,
  };

  targetPackage.devDependencies = {
    ...(targetPackage.devDependencies ?? {}),
  };

  for (const dependency of copiedDevDependencies) {
    const version = sourcePackage.devDependencies?.[dependency] ?? fallbackDevDependencyVersions[dependency];
    if (!version) {
      continue;
    }
    targetPackage.devDependencies[dependency] = version;
  }

  await writeFile(`${targetPackagePath}`, `${JSON.stringify(targetPackage, null, 2)}\n`);
}

async function patchStylesScss(targetRoot) {
  const stylesPath = path.join(targetRoot, 'src', 'styles.scss');

  try {
    await stat(stylesPath);
  } catch {
    return false;
  }

  const markerStart = '/* starter:semantic-tokens:start */';
  const markerEnd = '/* starter:semantic-tokens:end */';
  let styles = await readFile(stylesPath, 'utf8');

  if (!styles.includes("@use './styles/tokens' as tokens;")) {
    styles = `@use './styles/tokens' as tokens;\n${styles}`;
  }

  if (!styles.includes(markerStart)) {
    styles = `${styles.trimEnd()}\n\n${markerStart}\n:root {\n  @include tokens.semantic-light();\n}\n\n:root[data-theme='dark'] {\n  @include tokens.semantic-dark();\n}\n${markerEnd}\n`;
  }

  await writeFile(stylesPath, styles);
  return true;
}

async function ensureHookExecutable(targetRoot) {
  const hookPath = path.join(targetRoot, '.husky', 'pre-commit');
  chmodSync(hookPath, 0o755);
}

async function main() {
  const targetArg = process.argv[2];

  if (targetArg === '--help' || targetArg === '-h') {
    printUsage();
    process.exit(0);
  }

  const targetRoot = path.resolve(process.cwd(), targetArg ?? '.');
  const targetPackagePath = path.join(targetRoot, 'package.json');

  try {
    await stat(targetPackagePath);
  } catch {
    throw new Error(`No package.json found in ${targetRoot}`);
  }

  await updatePackageJson(targetRoot);
  await copyDirectory(templateRoot, targetRoot);
  const stylesPatched = await patchStylesScss(targetRoot);
  await ensureHookExecutable(targetRoot);

  console.log(`Starter bootstrap complete for ${targetRoot}`);
  console.log('');
  console.log('Next steps:');
  console.log('1. cd into the target project');
  console.log('2. run npm install');
  console.log('3. run npm run prepare');
  console.log('4. run npm run lint and npm run build');
  if (!stylesPatched) {
    console.log(
      '5. manually import src/styles/_tokens.scss into your global styles if you are not using src/styles.scss',
    );
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
