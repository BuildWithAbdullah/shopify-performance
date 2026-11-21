import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CLAIMS, verify } from '../tools/verify.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// The test count comes from the README here. The verifier's own command line
// fills it by spawning the counter instead, which is what lets the claim list
// be fully exercised by the suite without the suite running itself.
export function statedTestCount(readme) {
  const match = readme.match(/\b(\d+) tests\b/);
  return match ? Number(match[1]) : 0;
}

const once = (async () => {
  const readme = await readFile(join(ROOT, 'README.md'), 'utf8');
  return verify({ root: ROOT, readme, testCount: statedTestCount(readme) });
})();

for (const claim of CLAIMS) {
  test('claim: ' + claim.name, async () => {
    const { results } = await once;
    const result = results.find((r) => r.name === claim.name);
    assert.notEqual(result, undefined, claim.name + ' produced no result');
    assert.equal(result.ok, true, claim.name + ': ' + result.detail);
  });
}

test('every claim produced a result', async () => {
  const { results } = await once;
  assert.equal(results.length, CLAIMS.length);
});

test('no claim failed', async () => {
  const { failed } = await once;
  assert.deepStrictEqual(failed.map((f) => f.name + ': ' + f.detail), []);
});

test('the README states a test count that this suite can read back', async () => {
  const readme = await readFile(join(ROOT, 'README.md'), 'utf8');
  assert.ok(statedTestCount(readme) > 0, 'no test count is stated at all');
});

test('asking for a claim that does not exist is refused', async () => {
  await assert.rejects(
    () => verify({ root: ROOT, readme: '', testCount: 0 }, { only: ['no such claim'] }),
    /does not exist/
  );
});
