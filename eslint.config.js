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

const privacyRules = {
  'no-restricted-syntax': [
    'error',
    {
      selector: `Literal[value=${NON_LOOPBACK_URL}]`,
      message: 'No outbound URLs: Apunta may only talk to 127.0.0.1/localhost/::1 (CLAUDE.md hard rule 1).',
    },
    {
      selector: `TemplateElement[value.raw=${NON_LOOPBACK_URL}]`,
      message: 'No outbound URLs: Apunta may only talk to 127.0.0.1/localhost/::1 (CLAUDE.md hard rule 1).',
    },
  ],
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
    files: ['scripts/**/*.mjs'],
    rules: {
      'no-console': 'off',
    },
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
