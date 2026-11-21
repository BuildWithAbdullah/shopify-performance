// The entry point in bin/ is wiring and nothing else.
//
// A file that is only syntax checked has no coverage at all, and the entry
// point is where that bites: it is the one file a test suite tends not to
// import. So every decision lives in src/cli.mjs, which is imported and
// exercised, and this tool fails the build if a decision moves back.
//
// The branch budget has no headroom. It is set to the number of branches the
// entry point needs, which means any new decision fails while a reformat does
// not. The line budget carries two lines of slack for formatting, and a test
// asserts that the budget equals the measured figure so nobody can quietly
// raise it.

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { maskSource } from '../src/scan/js.mjs';

export const BUDGET = { branches: 3, lines: 23 };

// The needles are assembled at run time so this file does not contain the
// patterns it looks for. A scanner that can match its own source reports
// itself, which has happened on this account more than once.
const BRANCH_NEEDLES = [
  'if' + ' (',
  '?' + ' ',
  '&' + '&',
  '|' + '|',
  'catch'
];

export function countBranches(source) {
  const masked = maskSource(source);
  const withoutComments = masked
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  let total = 0;
  for (const needle of BRANCH_NEEDLES) {
    let from = 0;
    for (;;) {
      const at = withoutComments.indexOf(needle, from);
      if (at === -1) break;
      total += 1;
      from = at + needle.length;
    }
  }
  return total;
}

export function countLines(source) {
  return source.split('\n').filter((line) => line.trim() !== '').length;
}

export async function measure(root) {
  const source = await readFile(join(root, 'bin', 'shopify-perf.mjs'), 'utf8');
  return { branches: countBranches(source), lines: countLines(source) };
}

export async function check(root) {
  const measured = await measure(root);
  const problems = [];
  if (measured.branches > BUDGET.branches) {
    problems.push('the entry point has ' + measured.branches + ' branches, budget ' + BUDGET.branches);
  }
  if (measured.lines > BUDGET.lines) {
    problems.push('the entry point has ' + measured.lines + ' lines, budget ' + BUDGET.lines);
  }
  return { measured, problems };
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try {
    return pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const result = await check(root);
  process.stdout.write(
    'entry point: ' + result.measured.branches + ' branches, ' + result.measured.lines + ' lines\n'
  );
  for (const problem of result.problems) process.stdout.write('  ' + problem + '\n');
  process.exitCode = result.problems.length ? 1 : 0;
}
