import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGUE, AREAS, SEVERITIES, BY_ID, entry, areaOf, declaredSeverities, countByArea } from '../src/catalogue.mjs';
import { THRESHOLDS, LIBRARY_FAMILIES, PRELOAD_AS_EXTENSIONS } from '../src/thresholds.mjs';

test('the catalogue has one entry per reason and no duplicate ids', () => {
  const ids = CATALOGUE.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every entry names an area that exists', () => {
  const known = new Set(AREAS.map((a) => a.id));
  for (const e of CATALOGUE) assert.ok(known.has(e.area), e.id + ' names ' + e.area);
});

test('every area holds at least one entry', () => {
  const counts = countByArea();
  for (const area of AREAS) assert.ok(counts[area.id] > 0, area.id + ' is empty');
});

test('the area counts add up to the catalogue size', () => {
  const counts = countByArea();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  assert.equal(total, CATALOGUE.length);
});

test('every entry declares at least one severity', () => {
  for (const e of CATALOGUE) assert.ok(e.severities.length >= 1, e.id);
});

test('every declared severity is one of the known severities', () => {
  for (const e of CATALOGUE) {
    for (const s of e.severities) assert.ok(SEVERITIES.includes(s), e.id + ' declares ' + s);
  }
});

test('a declared severity set has no duplicates', () => {
  for (const e of CATALOGUE) assert.equal(new Set(e.severities).size, e.severities.length, e.id);
});

test('every entry carries a title, a reason and a fix', () => {
  for (const e of CATALOGUE) {
    assert.ok(e.title.length > 10, e.id + ' title');
    assert.ok(e.why.length > 60, e.id + ' reason');
    assert.ok(e.fix.length > 15, e.id + ' fix');
  }
});

test('no title ends with a full stop, because the document adds one', () => {
  for (const e of CATALOGUE) assert.ok(!e.title.endsWith('.'), e.id);
});

test('entry throws for an id that does not exist', () => {
  assert.throws(() => entry('no-such-finding'), /no catalogue entry/);
});

test('entry returns the whole record for an id that does', () => {
  const found = entry('image-hero-lazy');
  assert.equal(found.area, 'assets');
  assert.deepEqual(found.severities, ['error']);
});

test('areaOf answers for every id', () => {
  for (const e of CATALOGUE) assert.equal(areaOf(e.id), e.area);
});

test('declaredSeverities returns a copy that cannot be mutated into the catalogue', () => {
  const copy = declaredSeverities('image-hero-lazy');
  copy.push('warn');
  assert.deepEqual(entry('image-hero-lazy').severities, ['error']);
});

test('the id index covers the whole catalogue', () => {
  assert.equal(BY_ID.size, CATALOGUE.length);
});

test('exactly one finding declares more than one severity', () => {
  const many = CATALOGUE.filter((e) => e.severities.length > 1).map((e) => e.id);
  assert.deepStrictEqual(many, ['script-blocking-in-head']);
});

test('severities are ordered from worst to least', () => {
  assert.deepStrictEqual(SEVERITIES, ['error', 'warn', 'notice']);
});

test('every area id is lower case and hyphenated', () => {
  for (const area of AREAS) assert.match(area.id, /^[a-z]+(-[a-z]+)*$/);
});

test('every finding id is lower case and hyphenated', () => {
  for (const e of CATALOGUE) assert.match(e.id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
});

test('every area has a readable title', () => {
  for (const area of AREAS) assert.ok(area.title.length > 8, area.id);
});

test('every threshold is a positive number', () => {
  for (const [name, value] of Object.entries(THRESHOLDS)) {
    assert.equal(typeof value, 'number', name);
    assert.ok(value > 0, name);
  }
});

test('the asset cache floor is below the unfingerprinted ceiling it is compared against', () => {
  assert.ok(THRESHOLDS.assetLongCacheSeconds > THRESHOLDS.unfingerprintedCacheCeiling);
});

test('the document ceiling is far below the asset floor', () => {
  assert.ok(THRESHOLDS.documentMaxAgeCeiling < THRESHOLDS.assetLongCacheSeconds / 1000);
});

test('every library family has a distinct name', () => {
  const names = LIBRARY_FAMILIES.map((f) => f.family);
  assert.equal(new Set(names).size, names.length);
});

test('every library family pattern matches its own name in a path', () => {
  for (const { family, pattern } of LIBRARY_FAMILIES) {
    assert.ok(pattern.test('/assets/' + family + '.min.js'), family);
  }
});

test('a library family pattern does not match an unrelated file', () => {
  for (const { family, pattern } of LIBRARY_FAMILIES) {
    assert.ok(!pattern.test('/assets/theme-sections.js'), family);
  }
});

test('every preload kind lists at least one extension', () => {
  for (const [as, list] of Object.entries(PRELOAD_AS_EXTENSIONS)) {
    assert.ok(list.length >= 1, as);
  }
});

test('no extension is claimed by a kind twice', () => {
  for (const [as, list] of Object.entries(PRELOAD_AS_EXTENSIONS)) {
    assert.equal(new Set(list).size, list.length, as);
  }
});
