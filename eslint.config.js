import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const extensionGlobals = ['messenger', 'browser', 'chrome'].map(name => ({
  name,
  message: 'Only src/platform/tb-api.ts may access the WebExtension API.',
}));

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['src/**/*.ts'],
    ignores: ['src/platform/tb-api.ts', 'src/platform/messenger.d.ts'],
    rules: {
      'no-restricted-globals': ['error', ...extensionGlobals],
    },
  },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/features/*/*', '!**/features/*/index', '!**/features/*/index.ts'],
          message: 'Import a feature only through its index.ts.',
        }],
      }],
    },
  },
);
