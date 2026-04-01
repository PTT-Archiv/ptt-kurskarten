const angular = require('angular-eslint');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const unusedImports = require('eslint-plugin-unused-imports');
const eslintConfigPrettier = require('eslint-config-prettier');

const templateRecommendedRules = angular.configs.templateRecommended[1].rules;
const templateAccessibilityRules = angular.configs.templateAccessibility[1].rules;

module.exports = [
  {
    ignores: [
      'apps/ptt-kurskarten.api/**',
      'apps/ptt-kurskarten-ui/.angular/**',
      'apps/ptt-kurskarten-ui/dist/**',
      'apps/ptt-kurskarten-ui/node_modules/**',
      'apps/ptt-kurskarten-ui/coverage/**',
      'packages/**/dist/**',
      'packages/**/node_modules/**',
      '**/.angular/**',
      '**/.husky/**',
      '**/dist/**',
      '**/node_modules/**',
      '**/out-tsc/**',
      '**/coverage/**',
      '**/*.js',
      '**/*.mjs',
      '**/*.cjs',
    ],
  },
  {
    files: ['apps/ptt-kurskarten-ui/src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@angular-eslint': angular.tsPlugin,
      '@typescript-eslint': tseslint,
      'unused-imports': unusedImports,
    },
    processor: angular.processInlineTemplates,
    rules: {
      ...eslintConfigPrettier.rules,
      '@angular-eslint/no-host-metadata-property': 'off',
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "Decorator[expression.callee.name='HostBinding']",
          message: 'Use the host metadata property instead of @HostBinding.',
        },
        {
          selector: "Decorator[expression.callee.name='HostListener']",
          message: 'Use the host metadata property instead of @HostListener.',
        },
      ],
      'unused-imports/no-unused-imports': 'error',
    },
  },
  {
    files: ['apps/ptt-kurskarten-ui/src/**/*.html'],
    languageOptions: {
      parser: angular.templateParser,
    },
    plugins: {
      '@angular-eslint/template': angular.templatePlugin,
    },
    rules: {
      ...eslintConfigPrettier.rules,
      ...templateRecommendedRules,
      ...templateAccessibilityRules,
      '@angular-eslint/template/prefer-class-binding': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "BoundAttribute[name='ngClass']",
          message: 'Use class bindings instead of ngClass.',
        },
        {
          selector: "BoundAttribute[name='ngStyle']",
          message: 'Use style bindings instead of ngStyle.',
        },
      ],
    },
  },
];
