// Each claim, proved not to be vacuous on its own.
//
// A claim that passes might be passing because its loop body never runs. So for
// every perturbation below, the named claim is run against an unchanged copy of
// the tree, where it must pass, and against a copy carrying one deliberate
// change, where it must fail. The total number of claims is asserted here too,
// so a perturbation cannot be made to pass by deleting the claim it breaks.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLAIMS, verify } from '../tools/verify.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CLAIM_COUNT = 56;

// Filter on the basename. A substring filter such as a test for '/.git' also
// excludes '/.github' and '/.gitignore', which makes four claims fail on an
// unchanged copy and turns every perturbation result into noise.
const SKIP = new Set(['.git', 'node_modules']);

async function copyTree() {
  const dir = await mkdtemp(join(tmpdir(), 'shopify-perf-perturb-'));
  await cp(ROOT, dir, {
    recursive: true,
    filter: (source) => !SKIP.has(basename(source))
  });
  return dir;
}

let pristine;

before(async () => {
  pristine = await copyTree();
});

after(async () => {
  if (pristine) await rm(pristine, { recursive: true, force: true });
});

async function runClaim(root, name) {
  const readme = await readFile(join(root, 'README.md'), 'utf8');
  const match = readme.match(/\b(\d+) tests\b/);
  const { results } = await verify(
    { root, readme, testCount: match ? Number(match[1]) : 0 },
    { only: [name] }
  );
  return results[0];
}

const PERTURBATIONS = [
  {
    name: 'an em dash in a tracked text file',
    claim: 'no tracked text file carries an em dash or an en dash',
    async apply(root) {
      const path = join(root, 'docs', 'FINDINGS.md');
      const text = await readFile(path, 'utf8');
      await writeFile(path, text + '\nA line with a long dash ' + String.fromCharCode(0x2014) + ' in it.\n');
    }
  },
  {
    name: 'a pair declaring a token it does not produce',
    claim: 'every pair is exact in both directions',
    async apply(root) {
      const path = join(root, 'tools', 'pairs.mjs');
      const text = await readFile(path, 'utf8');
      await writeFile(path, text.replace("expected: ['script-duplicate-source@warn']", "expected: ['script-duplicate-source@warn', 'script-sync-xhr@error']"));
    }
  },
  {
    name: 'a fixture declaring the wrong severity',
    claim: 'every fixture is exact',
    async apply(root) {
      const path = join(root, 'tools', 'fixtures.mjs');
      const text = await readFile(path, 'utf8');
      await writeFile(path, text.replace("['font-face-without-woff2@notice']", "['font-face-without-woff2@warn']"));
    }
  },
  {
    name: 'a limit that hides reporting its finding in its blind case',
    claim: 'a limit that hides is blind in its blind case',
    async apply(root) {
      const path = join(root, 'tools', 'limits.mjs');
      const text = await readFile(path, 'utf8');
      await writeFile(path, text.replace(
        "    blindExpected: [],\n    contrastExpected: ['image-missing-lazy@warn']",
        "    blindExpected: ['image-missing-lazy@warn'],\n    contrastExpected: ['image-missing-lazy@warn']"
      ));
    }
  },
  {
    name: 'a limit that hides reporting nothing in its contrast case',
    claim: 'a limit that hides reports in its contrast case',
    async apply(root) {
      const path = join(root, 'tools', 'limits.mjs');
      const text = await readFile(path, 'utf8');
      await writeFile(path, text.replace(
        "    blindExpected: [],\n    contrastExpected: ['image-missing-lazy@warn']",
        '    blindExpected: [],\n    contrastExpected: []'
      ));
    }
  },
  {
    name: 'a limit that manufactures with a contrast case that is not clean',
    claim: 'a limit that manufactures has a clean contrast case',
    async apply(root) {
      const path = join(root, 'tools', 'limits.mjs');
      const text = await readFile(path, 'utf8');
      await writeFile(path, text.replace(
        "    blindExpected: ['font-preload-unused@warn'],\n    contrastExpected: []",
        "    blindExpected: ['font-preload-unused@warn'],\n    contrastExpected: ['font-preload-unused@warn']"
      ));
    }
  },
  {
    name: 'a client host in an example',
    claim: 'every host named in an example is an allowed host',
    async apply(root) {
      const path = join(root, 'patterns', 'head-script-blocking.before.html');
      const text = await readFile(path, 'utf8');
      await writeFile(path, text.replace('widget.example.net', 'widget.a-real-store.com'));
    }
  },
  {
    name: 'a thirteen digit number in an example',
    claim: 'no example carries a thirteen digit number',
    async apply(root) {
      const path = join(root, 'patterns', 'product-count.before.liquid');
      const text = await readFile(path, 'utf8');
      await writeFile(path, text + '\n<!-- 1234567890123 -->\n');
    }
  },
  {
    name: 'an engines floor naming a bare major',
    claim: 'the engines floor names an exact version with an operator',
    async apply(root) {
      const path = join(root, 'package.json');
      const pkg = JSON.parse(await readFile(path, 'utf8'));
      pkg.engines.node = '>=20';
      await writeFile(path, JSON.stringify(pkg, null, 2) + '\n');
    }
  },
  {
    name: 'an engines value with no operator, which is a pin and not a floor',
    claim: 'the engines floor names an exact version with an operator',
    async apply(root) {
      const path = join(root, 'package.json');
      const pkg = JSON.parse(await readFile(path, 'utf8'));
      pkg.engines.node = '20.18.1';
      await writeFile(path, JSON.stringify(pkg, null, 2) + '\n');
    }
  },
  {
    name: 'CI with the refusal job removed',
    claim: 'CI has a job that proves the floor is enforced',
    async apply(root) {
      const path = join(root, '.github', 'workflows', 'ci.yml');
      const text = await readFile(path, 'utf8');
      await writeFile(path, text.slice(0, text.indexOf('  engines-refusal:')));
    }
  },
  {
    name: 'a bare major in the CI matrix',
    claim: 'the engines floor appears in CI with all three components',
    async apply(root) {
      const path = join(root, '.github', 'workflows', 'ci.yml');
      const text = await readFile(path, 'utf8');
      await writeFile(path, text.replace("        node: ['20.18.1', '22.23.5', '24.11.1']", "        node:\n          - '20'\n          - '22.23.5'"));
    }
  },
  {
    name: 'a decision moved back into the entry point',
    claim: 'the entry point is inside its budget',
    async apply(root) {
      const path = join(root, 'bin', 'shopify-perf.mjs');
      const text = await readFile(path, 'utf8');
      await writeFile(path, text.replace(
        'if (invokedDirectly) {',
        'if (invokedDirectly) {\n  if (process.argv.includes("--quiet")) process.argv.push("--format", "json");'
      ));
    }
  },
  {
    name: 'a generated document edited by hand',
    claim: 'the generated documents are current',
    async apply(root) {
      const path = join(root, 'docs', 'LIMITS.md');
      const text = await readFile(path, 'utf8');
      await writeFile(path, text.replace('# Limits', '# Limits and caveats'));
    }
  },
  {
    name: 'a test file that no script names',
    claim: 'the test script names every test file on disk',
    async apply(root) {
      await writeFile(join(root, 'test', 'orphan.test.mjs'), "import { test } from 'node:test';\ntest('x', () => {});\n");
    }
  },
  {
    name: 'a containment check in the guarded suite',
    claim: 'the corpus comparisons in the suite are exact and not containment',
    async apply(root) {
      const path = join(root, 'test', 'pairs.test.mjs');
      const text = await readFile(path, 'utf8');
      await writeFile(path, text + '\ntest("loose", () => { assert.ok([1].includes(1)); });\n');
    }
  },
  {
    name: 'the guarded suite reading the guard back',
    claim: 'the guarded suite does not read the guard back',
    async apply(root) {
      const path = join(root, 'test', 'pairs.test.mjs');
      const text = await readFile(path, 'utf8');
      await writeFile(path, text + '\n// a stray reference to tools/verify.mjs\n');
    }
  },
  {
    name: 'a dependency added to the package',
    claim: 'the package declares no dependencies',
    async apply(root) {
      const path = join(root, 'package.json');
      const pkg = JSON.parse(await readFile(path, 'utf8'));
      pkg.dependencies = { 'left-pad': '1.3.0' };
      await writeFile(path, JSON.stringify(pkg, null, 2) + '\n');
    }
  },
  {
    name: 'the test count stated twice in the README',
    claim: 'the README states the test count once, on one line',
    async apply(root) {
      const path = join(root, 'README.md');
      const text = await readFile(path, 'utf8');
      const match = text.match(/^.*\b\d+ tests\b.*$/m);
      await writeFile(path, text + '\n' + match[0] + '\n');
    }
  },
  {
    name: 'a threshold with its reason removed',
    claim: 'every threshold has a reason written above it',
    async apply(root) {
      const path = join(root, 'src', 'thresholds.mjs');
      const text = await readFile(path, 'utf8');
      await writeFile(path, text.replace(
        '  // The documented maximum page size for the pagination tag. A larger value is\n  // clamped rather than refused.\n',
        ''
      ));
    }
  },
  {
    name: 'the main module guard spelled a second way',
    claim: 'the main module guard is spelled identically everywhere',
    async apply(root) {
      const path = join(root, 'tools', 'entry-thin.mjs');
      const text = await readFile(path, 'utf8');
      await writeFile(path, text.replace(
        'return pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url;',
        "return import.meta.url.endsWith(process.argv[1]);"
      ));
    }
  },
  {
    name: 'a runtime import of a directory the package does not ship',
    claim: 'nothing shipped imports from a directory that is not shipped',
    async apply(root) {
      const path = join(root, 'src', 'audit.mjs');
      const text = await readFile(path, 'utf8');
      await writeFile(path, "import { PAIRS } from '../tools/pairs.mjs';\nvoid PAIRS;\n" + text);
    }
  },
  {
    name: 'a relative import that resolves to nothing',
    claim: 'every relative import in the runtime resolves to a file on disk',
    async apply(root) {
      const path = join(root, 'src', 'audit.mjs');
      const text = await readFile(path, 'utf8');
      await writeFile(path, "import { missing } from './not-here.mjs';\nvoid missing;\n" + text);
    }
  }
];

test('the claim count is the number this repository states', () => {
  assert.equal(CLAIMS.length, CLAIM_COUNT);
});

test('every perturbation names a claim that exists', () => {
  const names = new Set(CLAIMS.map((c) => c.name));
  for (const perturbation of PERTURBATIONS) {
    assert.equal(names.has(perturbation.claim), true, perturbation.claim);
  }
});

for (const perturbation of PERTURBATIONS) {
  test('the claim holds on an unchanged copy, against ' + perturbation.name, async () => {
    const result = await runClaim(pristine, perturbation.claim);
    assert.equal(result.ok, true, perturbation.claim + ': ' + result.detail);
  });

  test('the claim fails given ' + perturbation.name, async () => {
    const dir = await copyTree();
    try {
      await perturbation.apply(dir);
      const result = await runClaim(dir, perturbation.claim);
      assert.equal(result.ok, false, perturbation.claim + ' passed a tree it should refuse');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}

test('the perturbations do not leave the claim count changed', () => {
  assert.equal(CLAIMS.length, CLAIM_COUNT);
});
