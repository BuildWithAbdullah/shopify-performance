import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { audit, kindFor, tokens } from '../src/audit.mjs';
import { CATALOGUE, BY_ID } from '../src/catalogue.mjs';
import { THRESHOLDS } from '../src/thresholds.mjs';
import { PAIRS } from '../tools/pairs.mjs';
import { FIXTURES, fixturePath, SECOND_SEVERITY_FIXTURES } from '../tools/fixtures.mjs';
import { LIMITS, limitFiles, countByKind, LIMIT_KINDS } from '../tools/limits.mjs';
import { corpusCases, expectedExit, SEVERITY_EXIT, sameSet } from '../tools/corpus.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

async function tokensOf(relative) {
  const source = await readFile(join(ROOT, relative), 'utf8');
  return tokens(audit([{ kind: kindFor(relative), path: relative, source }]).findings);
}

for (const fixture of FIXTURES) {
  test('the fixture ' + fixture.file + ' reports exactly what it declares', async () => {
    assert.deepStrictEqual(await tokensOf(fixturePath(fixture)), fixture.expected.slice().sort());
  });

  test('the fixture ' + fixture.file + ' explains why it exists', () => {
    assert.ok(fixture.reason.length > 40, fixture.file);
  });
}

test('no fixture reaches a reason a pair already reaches', () => {
  const fromPairs = new Set();
  for (const pair of PAIRS) for (const token of pair.expected) fromPairs.add(token.split('@')[0]);
  const allowed = new Set(SECOND_SEVERITY_FIXTURES);
  for (const fixture of FIXTURES) {
    for (const token of fixture.expected) {
      const id = token.split('@')[0];
      const permitted = allowed.has(token);
      assert.equal(fromPairs.has(id) && !permitted, false, fixture.file + ' duplicates ' + id);
    }
  }
});

test('every fixture named as a second severity exception really declares one', () => {
  for (const token of SECOND_SEVERITY_FIXTURES) {
    const id = token.split('@')[0];
    assert.ok(BY_ID.has(id), token);
    assert.ok(BY_ID.get(id).severities.length > 1, token + ' is not a second severity at all');
  }
});

test('the settings fixture is over the budget on the compact serialisation and larger on disk', async () => {
  const path = join(ROOT, 'fixtures/settings-bloat.json');
  const text = await readFile(path, 'utf8');
  const compact = JSON.stringify(JSON.parse(text)).length;
  const onDisk = (await stat(path)).size;
  assert.ok(compact > THRESHOLDS.settingsDataBytes, 'compact ' + compact);
  assert.ok(onDisk > compact, 'the formatted file is the larger of the two');
});

test('the inline css fixture is over the inline budget', async () => {
  const text = await readFile(join(ROOT, 'fixtures/inline-critical-css-huge.html'), 'utf8');
  const open = text.indexOf('<style>') + '<style>'.length;
  const close = text.indexOf('</style>');
  assert.ok(Buffer.byteLength(text.slice(open, close), 'utf8') > THRESHOLDS.inlineStyleHeadBytes);
});

for (const limit of LIMITS) {
  const files = limitFiles(limit);

  test('the blind artefact of ' + limit.slug + ' reports exactly what it declares', async () => {
    assert.deepStrictEqual(await tokensOf(files.blind), limit.blindExpected.slice().sort());
  });

  test('the contrast artefact of ' + limit.slug + ' reports exactly what it declares', async () => {
    assert.deepStrictEqual(await tokensOf(files.contrast), limit.contrastExpected.slice().sort());
  });

  test('the limit ' + limit.slug + ' means what its kind says in both directions', () => {
    const inBlind = limit.blindExpected.filter((t) => t.split('@')[0] === limit.target).length !== 0;
    const inContrast = limit.contrastExpected.filter((t) => t.split('@')[0] === limit.target).length !== 0;
    if (limit.kind === 'hides') {
      assert.equal(inBlind, false, 'the blind case reports the finding, so the limit is gone');
      assert.equal(inContrast, true, 'the contrast case reports nothing, so it proves nothing');
    } else {
      assert.equal(inBlind, true, 'the blind case does not manufacture the finding');
      assert.equal(limit.contrastExpected.length, 0, 'the contrast case is not clean');
    }
  });

  test('the limit ' + limit.slug + ' names a catalogued finding and a known kind', () => {
    assert.ok(BY_ID.has(limit.target), limit.target);
    assert.ok(LIMIT_KINDS.includes(limit.kind), limit.kind);
  });

  test('the limit ' + limit.slug + ' is written down at length', () => {
    assert.ok(limit.title.length > 20, limit.slug + ' title');
    assert.ok(limit.text.length > 120, limit.slug + ' text');
  });
}

test('both kinds of limit are represented', () => {
  const counts = countByKind();
  assert.ok(counts.hides > 0);
  assert.ok(counts.manufactures > 0);
  assert.equal(counts.hides + counts.manufactures, LIMITS.length);
});

test('every limit slug is unique', () => {
  const slugs = LIMITS.map((l) => l.slug);
  assert.equal(new Set(slugs).size, slugs.length);
});

test('no two limits name the same finding', () => {
  const targets = LIMITS.map((l) => l.target);
  assert.equal(new Set(targets).size, targets.length);
});

test('every catalogued finding is reached by the corpus at every severity it declares', async () => {
  const produced = new Set();
  for (const item of corpusCases()) {
    for (const token of await tokensOf(item.path)) produced.add(token);
  }
  for (const entry of CATALOGUE) {
    for (const severity of entry.severities) {
      assert.equal(produced.has(entry.id + '@' + severity), true, entry.id + '@' + severity);
    }
  }
});

test('the corpus produces no severity that is not declared', async () => {
  for (const item of corpusCases()) {
    const source = await readFile(join(ROOT, item.path), 'utf8');
    const result = audit([{ kind: kindFor(item.path), path: item.path, source }]);
    for (const finding of result.findings) {
      assert.equal(
        BY_ID.get(finding.id).severities.includes(finding.severity),
        true,
        finding.id + '@' + finding.severity
      );
    }
  }
});

test('the never produced comparison fails for an invented finding', async () => {
  const produced = new Set();
  for (const item of corpusCases()) {
    for (const token of await tokensOf(item.path)) produced.add(token);
  }
  assert.equal(produced.has('this-finding-does-not-exist@error'), false);
});

test('every corpus case declares a sorted token set', () => {
  for (const item of corpusCases()) {
    assert.deepStrictEqual(item.expected, item.expected.slice().sort(), item.path);
  }
});

test('the exit code of a case derives from its worst declared severity', () => {
  assert.equal(expectedExit([]), 0);
  assert.equal(expectedExit(['a@notice']), 0);
  assert.equal(expectedExit(['a@warn']), 1);
  assert.equal(expectedExit(['a@notice', 'b@error']), 2);
});

test('an unknown severity has no exit code and is refused', () => {
  assert.throws(() => expectedExit(['a@urgent']), /no exit code/);
});

test('every severity has an exit code', () => {
  for (const severity of Object.keys(SEVERITY_EXIT)) {
    assert.equal(typeof SEVERITY_EXIT[severity], 'number', severity);
  }
});

test('sameSet ignores order and refuses a different length', () => {
  assert.equal(sameSet(['b', 'a'], ['a', 'b']), true);
  assert.equal(sameSet(['a'], ['a', 'b']), false);
});

test('every corpus case points at a file that exists and has an input kind', async () => {
  for (const item of corpusCases()) {
    const info = await stat(join(ROOT, item.path));
    assert.ok(info.isFile(), item.path);
    assert.notEqual(kindFor(item.path), null, item.path);
  }
});
