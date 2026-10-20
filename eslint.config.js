// ESLint's recommended rules: the page's code runs in the browser, everything else in Node.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/'] },
  js.configs.recommended,
  { files: ['web/**/*.mjs', 'checks/parse-check.js'], languageOptions: { globals: globals.browser } },
  { files: ['bin/**', 'server/**', 'test/**', 'checks/*.mjs', 'eslint.config.js'], languageOptions: { globals: globals.node } },
];
