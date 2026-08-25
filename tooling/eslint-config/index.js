// Shared flat ESLint config for all LocalTools TS workspaces.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/** Base config for every TypeScript package/app in the monorepo. */
export const base = tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '.turbo/**', '**/*.config.*', 'coverage/**'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [js.configs.recommended, ...tseslint.configs.strictTypeChecked],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      // Engine code shells out to native binaries by design; template-literal
      // expressions are still forbidden anywhere near subprocess args.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.name=/^(exec|execSync)$/] > MemberExpression > Literal[value=/\\$\\{/]',
          message:
            'Never build shell command strings with interpolation; use execFile/spawn with arg arrays.',
        },
      ],
    },
  },
);

export default base;
