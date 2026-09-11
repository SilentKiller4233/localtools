/**
 * Minify/beautify (PROJECT_SPEC 3.4): CSS via csso, JS via terser, HTML via
 * html-minifier-terser; beautify via prettier's programmatic API — the
 * exact libraries from spec Section 4.4.
 *
 * Prettier loads from `prettier/standalone` with EXPLICIT parser plugins
 * (postcss→css, babel+estree→js, html): the main entry resolves parsers
 * from a Node plugin registry, which the browser bundle doesn't ship —
 * "Couldn't resolve parser" in the Worker (Phase 12 dual-env fix, the
 * standalone+plugins form works identically in Node).
 */

import { minify as cssoMinify } from 'csso';
import { minify as terserMinify } from 'terser';
import { minify as htmlMinify } from 'html-minifier-terser';
// prettier/standalone: works in Node AND the browser Worker (D-042).
import * as prettier from 'prettier/standalone';
// Parser plugins must be registered explicitly with the standalone bundle.
import * as prettierCss from 'prettier/plugins/postcss';
import * as prettierBabel from 'prettier/plugins/babel';
import * as prettierEstree from 'prettier/plugins/estree';
import * as prettierHtml from 'prettier/plugins/html';
import { devError, requireText, assertTextCap, MAX_TEXT_CHARS } from '../types';

const PRETTIER_PLUGINS = [prettierCss, prettierBabel, prettierEstree, prettierHtml] as const;

export type CodeLanguage = 'css' | 'js' | 'html';

export interface CodeToolResult {
  output: string;
  originalSize: number;
  newSize: number;
}

const PARSER: Readonly<Record<CodeLanguage, string>> = {
  css: 'css',
  js: 'babel',
  html: 'html',
};

const LABEL: Readonly<Record<CodeLanguage, string>> = {
  css: 'CSS',
  js: 'JavaScript',
  html: 'HTML',
};

function firstLine(message: string): string {
  return message.split('\n')[0] ?? message;
}

export async function minifyCode(
  text: string,
  language: CodeLanguage,
  maxChars: number = MAX_TEXT_CHARS,
): Promise<CodeToolResult> {
  requireText(text, LABEL[language]);
  assertTextCap(text, maxChars);
  let output: string;
  try {
    if (language === 'css') {
      output = cssoMinify(text, { restructure: false }).css;
    } else if (language === 'js') {
      const r = await terserMinify(text, { compress: true, mangle: false });
      output = r.code ?? '';
    } else {
      output = await htmlMinify(text, {
        collapseWhitespace: true,
        removeComments: true,
        minifyCSS: true,
        minifyJS: true,
        caseSensitive: true,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The input could not be parsed.';
    throw devError(
      'invalid-input',
      `This ${LABEL[language]} could not be parsed: ${firstLine(message)}`,
    );
  }
  if (output.trim().length === 0 && text.trim().length > 0) {
    throw devError('invalid-input', `This ${LABEL[language]} has no minifiable content.`);
  }
  return { output, originalSize: text.length, newSize: output.length };
}

export async function beautifyCode(
  text: string,
  language: CodeLanguage,
  maxChars: number = MAX_TEXT_CHARS,
): Promise<CodeToolResult> {
  requireText(text, LABEL[language]);
  assertTextCap(text, maxChars);
  try {
    const output = await prettier.format(text, {
      parser: PARSER[language],
      plugins: PRETTIER_PLUGINS as never,
    });
    return { output, originalSize: text.length, newSize: output.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The input could not be parsed.';
    throw devError(
      'invalid-input',
      `This ${LABEL[language]} could not be beautified: ${firstLine(message)}`,
    );
  }
}
