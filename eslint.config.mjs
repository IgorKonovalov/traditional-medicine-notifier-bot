import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';

export default [
  eslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        // Type-aware linting. Points at tsconfig.eslint.json (extends the build
        // config but includes *.test.ts) so every linted file belongs to a TS
        // project and rules like no-floating-promises can resolve types.
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
        },
      ],
      // Catch un-awaited promises (fire-and-forget bugs) and promises passed
      // where a void/boolean is expected (e.g. async handlers wired to
      // sync-expecting APIs).
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  {
    // ADR 002: the content corpus is renderer-agnostic markdown, so bot
    // handlers must not pass `parse_mode` to ctx.reply / editMessageText.
    // Rendering quirks belong in the centralized render helpers, applied at
    // the content→reply boundary — never opportunistically in a handler.
    files: ['src/bot/**/*.ts'],
    ignores: ['src/bot/**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Property[key.name='parse_mode']",
          message:
            'parse_mode is banned in src/bot/. Content is renderer-agnostic markdown — see docs/adr/002-content-in-markdown.md.',
        },
        {
          selector: "Property[key.value='parse_mode']",
          message:
            'parse_mode is banned in src/bot/. Content is renderer-agnostic markdown — see docs/adr/002-content-in-markdown.md.',
        },
      ],
    },
  },
  {
    // Portability rule (ADR 003): Telegraf must only be imported from the bot
    // adapter layer (src/bot/**) and the boot entry (src/index.ts). Domain
    // modules (notifications, content, services) depend on the Notifier
    // interface, not on Telegraf, so they stay portable to a future codebase.
    //
    // The same rule bans cross-layer imports from src/bot/** into the domain
    // layer. Test files are unaffected — the rule scopes to non-test files.
    files: ['src/**/*.ts'],
    ignores: ['src/bot/**', 'src/index.ts', 'src/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['telegraf', 'telegraf/*'],
              message:
                'Telegraf must only be imported inside src/bot/. Domain modules depend on the Notifier interface — see docs/adr/003-portability-discipline.md.',
            },
            {
              group: [
                '../bot',
                '../bot/*',
                '../../bot',
                '../../bot/*',
                '../../../bot',
                '../../../bot/*',
              ],
              message:
                'Cross-layer import from src/bot/ into a domain module is banned. The domain layer (notifications, content, services) must not depend on the bot adapter — see docs/adr/003-portability-discipline.md.',
            },
          ],
        },
      ],
    },
  },
  {
    // Pure domain core: the notification scheduling math and the Notifier
    // interface must not reach for Node-only APIs, so they stay reusable by a
    // future shared TypeScript package and remain trivially unit-testable.
    // Filesystem access lives in src/content/loader.ts only.
    files: ['src/notifications/**/*.ts', 'src/services/notifier.ts', 'src/content/types.ts'],
    ignores: ['src/**/*.test.ts'],
    languageOptions: {
      globals: {
        process: 'off',
        Buffer: 'off',
        __dirname: 'off',
        __filename: 'off',
      },
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['telegraf', 'telegraf/*'],
              message:
                'Telegraf must only be imported inside src/bot/ — see docs/adr/003-portability-discipline.md.',
            },
            {
              group: ['node:fs', 'node:fs/*', 'node:path', 'node:os', 'fs', 'fs/*', 'path', 'os'],
              message:
                'Node-only modules are banned in the pure domain core. Filesystem access lives in src/content/loader.ts only.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'process is banned in the pure domain core — inject config values instead.' },
        { name: 'Buffer', message: 'Buffer is banned in the pure domain core.' },
        { name: '__dirname', message: '__dirname is banned in the pure domain core.' },
        { name: '__filename', message: '__filename is banned in the pure domain core.' },
      ],
    },
  },
  {
    files: ['src/**/*.test.ts'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        beforeEach: 'readonly',
        afterAll: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
    },
  },
  prettier,
  {
    ignores: ['dist/', 'node_modules/', '*.js', '*.mjs'],
  },
];
