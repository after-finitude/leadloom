import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import svelteConfig from './svelte.config.js';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  { ignores: ['node_modules/**', 'dist/**', 'data/**', 'evidence/**', 'evaluation/history/**'] },
  js.configs.recommended,
  {
    files: [
      '*.{js,mjs}',
      'src/**/*.mjs',
      'scripts/**/*.mjs',
      'tests/**/*.mjs',
      'evaluation/**/*.mjs'
    ],
    languageOptions: { globals: globals.node }
  },
  {
    files: ['**/*.{ts,mts,svelte}'],
    extends: [tseslint.configs.recommended]
  },
  { files: ['src/**/*.{ts,mts}', 'tests/**/*.ts'], languageOptions: { globals: globals.node } },
  svelte.configs.recommended,
  {
    files: ['web/**/*.{ts,svelte}'],
    languageOptions: { globals: globals.browser }
  },
  {
    files: ['web/**/*.svelte', 'web/**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: tseslint.parser, svelteConfig } }
  }
]);
