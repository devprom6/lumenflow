// @lumenflow/config – shared ESLint configuration
// Used by all apps and packages via: import config from '@lumenflow/config/eslint'

import Module from 'node:module';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, '../..');

const pnpmDir = path.join(rootDir, 'node_modules/.pnpm');
let ts6Path = '';
let ts6PkgDir = '';
if (fs.existsSync(pnpmDir)) {
  const dirs = fs.readdirSync(pnpmDir);
  const ts6Dir = dirs.find((d) => d.startsWith('typescript@6'));
  if (ts6Dir) {
    ts6PkgDir = path.join(pnpmDir, ts6Dir, 'node_modules/typescript');
    ts6Path = path.join(ts6PkgDir, 'lib/typescript.js');
  }
}

if (ts6Path && fs.existsSync(ts6Path)) {
  const orig = (Module)._resolveFilename;
  (Module)._resolveFilename = function (request, parent, isMain, options) {
    if (request === 'typescript') {
      return ts6Path;
    }
    if (request.startsWith('typescript/')) {
      const sub = request.slice('typescript/'.length);
      const subPath = path.join(ts6PkgDir, sub.endsWith('.js') ? sub : `${sub}.js`);
      if (fs.existsSync(subPath)) return subPath;
      return path.join(ts6PkgDir, sub);
    }
    return orig.apply(this, arguments);
  };
}

const js = (await import('@eslint/js')).default;
const tsPlugin = (await import('@typescript-eslint/eslint-plugin')).default;
const tsParser = (await import('@typescript-eslint/parser')).default;

/** @type {import('eslint').Linter.FlatConfig[]} */
const config = [
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: {
          allowDefaultProject: ['src/__tests__/*.ts'],
        },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs['strict-type-checked'].rules,
      'no-undef': 'off',
      'no-redeclare': 'off',
      '@typescript-eslint/no-deprecated': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      // Enforce no `any` as required by the README
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      // Prefer const
      'prefer-const': 'error',
      // No unused vars
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    ignores: ['dist/**', '.next/**', 'node_modules/**', '*.js', '*.mjs', '*.cjs'],
  },
];

export default config;
