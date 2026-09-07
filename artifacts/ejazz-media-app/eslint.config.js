const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  {
    ignores: ['dist/**', '.expo/**', 'eslint.config.js', 'metro.config.js', 'scripts/**', 'server/**'],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);