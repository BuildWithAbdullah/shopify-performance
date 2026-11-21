# shopify-performance

Theme performance patterns for Shopify, with a checker that proves each one.

Every finding in here ships a file that has the problem, a file that does not,
and a checker that tells them apart. Nothing in this repository is an opinion
you have to take on trust: the corrected file is asserted to report exactly
nothing, which is a stronger claim than it looks, and the one that caught most
of the mistakes found while writing it.

It covers the part of a Shopify store you do own. You do not own the checkout,
and you cannot stop an app injecting a script tag from the admin API, so two of
the inputs it reads are configuration rather than code.

## What it reads

Six kinds of input, chosen by file extension.

| Extension | Kind | What it is |
|---|---|---|
| `.liquid` | `liquid` | A template, section or snippet |
| `.html` | `page` | A rendered storefront page |
| `.js`, `.mjs` | `asset-js` | A theme script |
| `.css` | `asset-css` | A theme stylesheet |
| `.headers` | `headers` | Captured response headers |
| `.json` | `config` | A script tag inventory, the theme settings, or an asset manifest |

The last one matters more than it sounds. A theme audit that reads only Liquid
and markup cannot see a script an uninstalled app is still injecting, and
cannot see a setting switched on for a section no template renders. Both are
invisible in the page and in the network capture, so both are read from
configuration a store owner can export.

## Running it

```
node bin/shopify-perf.mjs theme/sections/collection.liquid
node bin/shopify-perf.mjs captures/assets.headers --format json
node bin/shopify-perf.mjs --list
```

Exit codes: `0` for nothing at or above the reporting level, `1` for warnings
only, `2` for at least one error, `64` for arguments that could not be
understood, `65` for an input that could not be read. The codes are derived
from the severity table rather than written down twice, and a tool in this
repository spawns the real binary over every artefact to check them.

There is nothing to install. The package declares no dependencies at all,
including no HTML parser, which is why its limits are written down rather than
assumed away.

## What is in it

60 catalogued findings across 7 areas, one entry per reason rather than one per
check. Each entry declares the complete set of severities it can be emitted at,
and the suite compares that set against a real run in both directions: a
severity a finding carries that is not declared fails the build, and a declared
severity no test has ever produced fails it too. The second direction is the one
that does the work, and it is checked against an invented finding id as well, so
that a passing result cannot be a loop body that never ran.

| Area | Findings | What it is about |
|---|---|---|
| `scripts` | 9 | App and third party script footprint, loading attributes, injected tags |
| `liquid` | 11 | Render cost: loops, metafield reads, pagination, image URLs |
| `assets` | 9 | Images and fonts, including the hero image a theme marked lazy |
| `critical-path` | 8 | Render blocking stylesheets, preloads and connection hints |
| `caching` | 8 | Lifetimes, compression, cookies on assets, headers that disagree |
| `settings` | 7 | Settings on for sections nobody renders, and shipped weight |
| `storefront-js` | 8 | Cart polling, search on every keystroke, forced layout in handlers |

The corpus is 31 pattern pairs and 4 fixtures, 92 artefacts in all once the
limit cases are counted. Every one of them declares the exact set of
`id@severity` tokens it produces, compared in both directions. A fixture exists
only for a reason no pair reaches, and the suite refuses one that duplicates a
pair.

One pair declares a residual: the set of findings its corrected side still
reports on purpose. It is `vendor-library-twice`, where the fix removes the
second copy of a library and leaves the remaining third party host without a
connection hint, which is a separate decision made in a separate pair. A
residual field that is always empty is a field nobody checks, so the suite
asserts that at least one pair uses it.

## What it cannot do

13 declared limits, each with two artefacts in `limits/` and a kind.

A limit that **hides** means the problem is there and the tool says nothing.
Its blind artefact must not report the finding, and its contrast artefact, the
same problem written in the form the tool does read, must report it. Both halves
are asserted, because a contrast case that reported nothing would prove nothing:
a file with no problem in it also reports nothing.

A limit that **manufactures** means the tool reports something that is not a
problem. Its blind artefact must report the finding, and its contrast artefact
must be completely clean.

Ten hide and three manufacture. `docs/LIMITS.md` lists them all and is
generated from the manifest, so a caveat cannot survive the thing it was about
being fixed.

## Verifying

```
npm test
npm run verify
npm run exit-codes
npm run verdicts
npm run entry
npm run docs:check
```

`npm test` is 675 tests. `npm run verify` checks 56 repository assertions, each
a named claim about this repository rather than a count of assert calls, so the
number says something about what is checked rather than about how many files
there are. Judge the depth of a repository by its test count and its catalogue
size, not by that figure, and treat it as incomparable with the same figure in
another repository.

Every claim is proved individually non-vacuous. `test/perturbation.test.mjs`
copies the tree, makes one deliberate change, and requires the matching claim to
pass on the unchanged copy and fail on the changed one. Removing a claim does not
help: the claim count is asserted too.

CI runs the suite on Node 20.18.1, 22.23.5 and 24.11.1, plus a verifier job, a
generated documents job, a job proving the floor is the exact version installed,
and a job that raises the floor beyond the runtime and requires the install to
be refused. A floor that nothing enforces is a string in a file.

## How it is laid out

```
bin/          the command, which is wiring and nothing else
src/scan/     the scanners: markup, Liquid, JavaScript, CSS, headers, config
src/checks/   one module per area
src/          the catalogue, the thresholds, the orchestrator, the CLI
patterns/     the pairs, as slug.before.ext and slug.after.ext
fixtures/     one file per reason no pair reaches
limits/       slug.blind.ext and slug.contrast.ext for every declared limit
tools/        the manifests and the tools that check this repository
docs/         generated from the manifests
```

Every decision the command makes lives in `src/cli.mjs`, which the suite
imports and exercises. The entry point in `bin/` has three branches and a
budget of three, with no headroom, so a new decision fails the build while a
reformat does not.

## What is deliberately not here

Nothing from a delivered engagement. Every host in every example is a reserved
documentation domain, a name under the reserved `.test` top level domain, or a
documented platform host, and the suite asserts it. No example carries a
thirteen digit number. Those two assertions exist because the fastest way to
leak a client is to paste a real file in and generalise it afterwards.

Recurring billing is not here either. A failed renewal is not a failed
checkout, and dunning deserves its own repository rather than a corner of this
one.

## Licence

MIT.
