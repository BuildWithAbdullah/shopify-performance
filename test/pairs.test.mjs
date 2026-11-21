// Every pair, compared as an exact set in both directions.
//
// Containment is not used anywhere in this file, and a claim in the verifier
// reads this file to make sure of that. An inclusion assertion would hide every
// false positive a corrected side triggers, by construction, which is the one
// structural mistake that has produced the most defects on this account.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { audit, kindFor, tokens } from '../src/audit.mjs';
import { CATALOGUE } from '../src/catalogue.mjs';
import { PAIRS, pairFiles, PAIR_SLUGS } from '../tools/pairs.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

async function tokensOf(relative) {
  const source = await readFile(join(ROOT, relative), 'utf8');
  const kind = kindFor(relative);
  assert.notEqual(kind, null, relative + ' has no input kind');
  return tokens(audit([{ kind, path: relative, source }]).findings);
}

const CATALOGUE_IDS = new Set(CATALOGUE.map((e) => e.id));

for (const pair of PAIRS) {
  const files = pairFiles(pair);

  test('the failing side of ' + pair.slug + ' reports exactly what it declares', async () => {
    assert.deepStrictEqual(await tokensOf(files.before), pair.expected.slice().sort());
  });

  test('the corrected side of ' + pair.slug + ' reports exactly its residual', async () => {
    assert.deepStrictEqual(await tokensOf(files.after), pair.residual.slice().sort());
  });

  test('every token ' + pair.slug + ' declares names a catalogued finding', () => {
    const ids = pair.expected.concat(pair.residual).map((token) => token.split('@')[0]);
    for (const id of ids) assert.equal(CATALOGUE_IDS.has(id), true, id);
  });

  test('the residual of ' + pair.slug + ' is a subset of what the failing side reports', () => {
    const expected = new Set(pair.expected);
    for (const token of pair.residual) {
      assert.equal(expected.has(token), true, token + ' survives a fix that never produced it');
    }
  });
}

test('every pair slug is unique', () => {
  assert.equal(new Set(PAIR_SLUGS).size, PAIR_SLUGS.length);
});

test('every pair declares a token set that is already sorted and free of duplicates', () => {
  for (const pair of PAIRS) {
    assert.deepStrictEqual(pair.expected, pair.expected.slice().sort(), pair.slug);
    assert.equal(new Set(pair.expected).size, pair.expected.length, pair.slug);
  }
});

test('every pair declares at least one token on its failing side', () => {
  for (const pair of PAIRS) assert.notEqual(pair.expected.length, 0, pair.slug);
});

test('exactly one pair declares a residual', () => {
  const withResidual = PAIRS.filter((pair) => pair.residual.length !== 0).map((pair) => pair.slug);
  assert.deepStrictEqual(withResidual, ['vendor-library-twice']);
});
