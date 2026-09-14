import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  { ignores: ['node_modules/**', 'dist/**', 'data/**', 'evidence/**', 'evaluation/history/**'] },
  js.configs.recommended,
  {
    files: ['*.mjs', 'src/**/*.mjs', 'scripts/**/*.mjs', 'tests/**/*.mjs', 'evaluation/**/*.mjs'],
    languageOptions: { globals: globals.node }
  },
  {
    files: ['web/**/*.js'],
    languageOptions: { globals: globals.browser }
  },
  {
    files: ['**/*.{ts,mts}'],
    extends: [tseslint.configs.recommended],
    languageOptions: { globals: globals.node }
  }
]);
