import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Two rules below are the privacy hard rules from CLAUDE.md, enforced by lint
 * so a violation is caught before review:
 *  - no absolute http(s) URL literals except loopback,
 *  - no browser SpeechRecognition (it can ship audio to Google).
 */
const NON_LOOPBACK_URL = String.raw`/^https?:\/\/(?!127\.0\.0\.1|localhost|\[::1\])/`;

const SPEECH_MESSAGE =
  'The Web Speech API can send audio to Google. Transcription runs server-side (whisper.cpp).';

const OUTBOUND_URL_SELECTORS = [
  {
    selector: `Literal[value=${NON_LOOPBACK_URL}]`,
    message: 'No outbound URLs: Apunta may only talk to 127.0.0.1/localhost/::1 (CLAUDE.md hard rule 1).',
  },
  {
    selector: `TemplateElement[value.raw=${NON_LOOPBACK_URL}]`,
    message: 'No outbound URLs: Apunta may only talk to 127.0.0.1/localhost/::1 (CLAUDE.md hard rule 1).',
  },
];

/**
 * `@fastify/multipart`'s two ways of putting an upload on disk. An uploaded
 * example note is a clinical record, and a temp file outside the database is
 * exactly the copy nothing in this app knows how to delete. Uploads are read
 * with `request.parts()` + `part.toBuffer()` and held in memory for one
 * request (M6, `server/src/routes/formats-detect.ts`).
 */
const UPLOAD_TO_DISK_SELECTORS = [
  {
    selector: 'MemberExpression[property.name="saveRequestFiles"]',
    message: 'Uploads stay in memory: use request.parts() and part.toBuffer() (CLAUDE.md hard rule 1).',
  },
  {
    selector: 'MemberExpression[property.name="toFile"]',
    message: 'Uploads stay in memory: use part.toBuffer(), never part.toFile() (CLAUDE.md hard rule 1).',
  },
];

const privacyRules = {
  'no-restricted-syntax': ['error', ...OUTBOUND_URL_SELECTORS],
  'no-restricted-globals': [
    'error',
    {
      // Without `checkGlobalObject`, the rule reports only a bare
      // `SpeechRecognition` identifier — and misses
      // `window.SpeechRecognition || window.webkitSpeechRecognition`, which is
      // the canonical MDN snippet and therefore the form anyone would actually
      // paste. Found by the 2026-08 privacy audit (W5).
      checkGlobalObject: true,
      globals: [
        {
          name: 'SpeechRecognition',
          message: SPEECH_MESSAGE,
        },
        {
          name: 'webkitSpeechRecognition',
          message: SPEECH_MESSAGE,
        },
      ],
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'prototype/**',
      // Git worktrees live inside the repo while parallel packets are in
      // flight. Linting them lints a second copy of the tree, and the second
      // tsconfig root makes typescript-eslint refuse to parse anything at all.
      '.claude/worktrees/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...privacyRules,
      eqeqeq: ['error', 'smart'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
  {
    // Developer CLI tools whose whole job is printing a report to the person
    // who ran them. `no-console` stays on everywhere else, where it does real
    // work: it is part of keeping note content out of logs (hard rule 2).
    files: ['scripts/**/*.mjs', '**/__fixtures__/**/*.mjs'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // Server code may not write an upload to disk, on top of the URL rules.
    // `no-restricted-syntax` replaces rather than merges across config
    // objects, so the outbound-URL selectors are repeated here deliberately.
    files: ['server/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...OUTBOUND_URL_SELECTORS, ...UPLOAD_TO_DISK_SELECTORS],
    },
  },
  {
    // **The one exemption from the outbound-URL rule, and the only one.**
    //
    // `installer/src/catalog.ts` is the pinned list of what first-run setup
    // downloads: the speech model's file, and the pages naming the writing
    // models' terms. It is scoped to that single file rather than to
    // `installer/**` so the exemption cannot spread by accident — every other
    // file in the package is held to the same rule as `server/` and `web/`.
    //
    // Why this is sound, and where the line is: this code runs **before the
    // app does**, in a short-lived process the shell spawns for setup, never
    // in the Fastify server and never while a note exists. The server's egress
    // guard is untouched and still rejects every non-loopback host. Setup-time
    // model acquisition is the single carve-out CLAUDE.md hard rule 1 names;
    // "check for updates" and anything else is still forbidden.
    //
    // Mentioning a URL is not the same as being able to reach one, so the real
    // constraint is `ALLOWED_DOWNLOAD_HOSTS` in that file: `assertAllowedHost`
    // refuses anything else at call time, and `catalog.test.ts` asserts both
    // the allow-list and that no *other* file in `installer/` names a host.
    files: ['installer/src/catalog.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    // The AudioWorklet module (M5) runs in its own global scope — no window,
    // no DOM, and two globals nothing else has. It lives in `web/public/` so
    // it reaches the browser byte for byte, which also means ESLint sees it as
    // a plain script rather than as part of the bundle.
    files: ['web/public/*.js'],
    languageOptions: {
      globals: {
        AudioWorkletProcessor: 'readonly',
        registerProcessor: 'readonly',
        sampleRate: 'readonly',
        currentTime: 'readonly',
      },
    },
  },
  {
    // Tests need to name the very URLs production code may not contain.
    files: ['**/*.test.{ts,tsx}', 'e2e/**/*.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  prettier,
);
