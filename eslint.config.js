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
      name: 'SpeechRecognition',
      message: 'The Web Speech API can send audio to Google. Transcription runs server-side (whisper.cpp).',
    },
    {
      name: 'webkitSpeechRecognition',
      message: 'The Web Speech API can send audio to Google. Transcription runs server-side (whisper.cpp).',
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
    files: ['web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    // Tests need to name the very URLs production code may not contain.
    files: ['**/*.test.{ts,tsx}', 'e2e/**/*.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  prettier,
);
