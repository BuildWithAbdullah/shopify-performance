// The same comparison as tools/exit-codes.mjs, made through the library rather
// than through the binary. A tool with two modes has to make the same
// assertions in both, and the library is the mode an application uses.

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { audit, kindFor, tokens } from '../src/audit.mjs';
import { exitCodeFor, filterBySeverity } from '../src/cli.mjs';
import { corpusCases, expectedExit, sameSet, describeDifference } from './corpus.mjs';

export async function verdict({ root, item }) {
  const source = await readFile(join(root, item.path), 'utf8');
  const kind = kindFor(item.path);
  if (!kind) return { ok: false, reason: 'no input kind for ' + item.path };
  const result = audit([{ kind, path: item.path, source }]);
  const actual = tokens(result.findings);
  const code = exitCodeFor(result.counts);
  return {
    ok: sameSet(actual, item.expected) && code === expectedExit(item.expected),
    actual,
    code,
    reason: sameSet(actual, item.expected)
      ? 'exit ' + code + ', expected ' + expectedExit(item.expected)
      : describeDifference(actual, item.expected)
  };
}

export async function checkAll(root) {
  const cases = corpusCases();
  const problems = [];
  let runs = 0;
  for (const item of cases) {
    const result = await verdict({ root, item });
    runs += 1;
    if (!result.ok) problems.push(item.path + ': ' + result.reason);
    // The severity floor must not change which findings exist, only which are
    // printed, so the whole set has to survive filtering at the lowest floor.
    const source = await readFile(join(root, item.path), 'utf8');
    const whole = audit([{ kind: kindFor(item.path), path: item.path, source }]);
    const floored = filterBySeverity(whole.findings, 'notice');
    runs += 1;
    if (floored.length !== whole.findings.length) {
      problems.push(item.path + ': the notice floor dropped findings');
    }
  }
  return { runs, problems, cases: cases.length };
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
  const result = await checkAll(root);
  process.stdout.write(result.runs + ' checker runs over ' + result.cases + ' artefacts\n');
  for (const problem of result.problems) process.stdout.write('  ' + problem + '\n');
  process.stdout.write(result.problems.length ? result.problems.length + ' problems\n' : 'the library agrees with every manifest\n');
  process.exitCode = result.problems.length ? 1 : 0;
}
