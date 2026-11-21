// What this tool cannot do, written down and proved.
//
// Every limit carries two artefacts and a kind.
//
//   hides        the problem is present and the tool says nothing about it.
//                The blind artefact must NOT report the target id, and the
//                contrast artefact, which expresses the same problem in the
//                form the tool does read, MUST report it. Both halves are
//                asserted: a blind case that reports the target would mean the
//                limit no longer exists, and a contrast case that reports
//                nothing would prove nothing at all, because a file with no
//                problem in it also reports nothing.
//
//   manufactures the tool reports something that is not a problem. The blind
//                artefact MUST report the target id, and the contrast
//                artefact, which is the same thing written in the form the
//                tool reads correctly, must be completely clean.
//
// Each artefact also declares the exact set it produces, compared in both
// directions, so a limit cannot drift into hiding a second finding unnoticed.

export const LIMITS = [
  {
    slug: 'fold-position-is-document-order',
    kind: 'hides',
    ext: 'html',
    target: 'image-missing-lazy',
    title: 'The fold is read from document order, not from layout',
    text: 'Whether an image is below the first screen is decided by its position in the markup. A theme whose first two images are full height panels pushes the third one far down the page, and nothing here can see that, so its eager loading is not reported.',
    blindExpected: [],
    contrastExpected: ['image-missing-lazy@warn']
  },
  {
    slug: 'script-url-built-at-run-time',
    kind: 'hides',
    ext: 'html',
    target: 'script-blocking-in-head',
    title: 'A script URL assembled in code is not a script source',
    text: 'The markup scanner reads attributes as written. A script element created in code, with a URL built from fragments, is invisible to it, which is also the shape an app uses when it wants to be hard to remove.',
    blindExpected: [],
    contrastExpected: ['preconnect-missing-for-script-host@notice', 'script-blocking-in-head@error']
  },
  {
    slug: 'unquoted-attribute-value-with-angle-bracket',
    kind: 'manufactures',
    ext: 'html',
    target: 'image-without-dimensions',
    title: 'An unquoted attribute value holding an angle bracket ends the tag early',
    text: 'The scanner keeps quoted values intact, but an unquoted value containing an angle bracket genuinely closes the start tag, so every attribute after it is lost. The element is then reported as missing the sizes it does in fact carry. A real parser is the fix, and this tool ships no parser.',
    blindExpected: ['image-without-dimensions@warn', 'image-without-srcset@notice'],
    contrastExpected: []
  },
  {
    slug: 'handler-passed-through-a-wrapper',
    kind: 'hides',
    ext: 'js',
    target: 'search-input-without-debounce',
    title: 'A handler built by a wrapper cannot be followed',
    text: 'The checks that need to look inside a handler find it either written inline or named in the same file. A handler produced by a call, which is how logging and error wrappers are usually added, is not followed, so what it does is not examined.',
    blindExpected: ['fetch-without-abort@warn'],
    contrastExpected: ['fetch-without-abort@warn', 'search-input-without-debounce@error']
  },
  {
    slug: 'event-name-from-a-variable',
    kind: 'hides',
    ext: 'js',
    target: 'listener-not-passive',
    title: 'An event name held in a variable is not an event name',
    text: 'The listener checks read the event name from a literal. A theme that keeps its event names in one object, which is good practice, is not checked at all.',
    blindExpected: [],
    contrastExpected: ['listener-not-passive@warn']
  },
  {
    slug: 'faces-and-preloads-are-two-inputs',
    kind: 'manufactures',
    ext: 'html',
    target: 'font-preload-unused',
    title: 'Faces in a stylesheet and preloads in the document are audited separately',
    text: 'Every input is read on its own, so a preload in the document whose matching face lives in the theme stylesheet is reported as unused. The correct answer needs the two inputs joined, which this tool deliberately does not do, because that means resolving asset URLs.',
    blindExpected: ['font-preload-unused@warn'],
    contrastExpected: []
  },
  {
    slug: 'the-manifest-is-supplied-not-measured',
    kind: 'hides',
    ext: 'json',
    target: 'asset-manifest-total-over-budget',
    title: 'The asset manifest is written by the operator',
    text: 'The weight budget is checked against a manifest somebody hands it. A script injected by an app, which never appears in the theme assets directory, is absent from that manifest and therefore absent from the total.',
    blindExpected: [],
    contrastExpected: ['asset-manifest-total-over-budget@error']
  },
  {
    slug: 'an-expiry-conflict-needs-a-date-header',
    kind: 'hides',
    ext: 'headers',
    target: 'cache-headers-conflict',
    title: 'An expiry can only be compared against a captured date',
    text: 'Deciding whether an expiry disagrees with a lifetime needs to know when the response was served. A capture with no date header gives nothing to compare against, and guessing from the clock of whoever runs the audit would make the result depend on when it ran.',
    blindExpected: [],
    contrastExpected: ['cache-headers-conflict@error']
  },
  {
    slug: 'one-file-at-a-time',
    kind: 'hides',
    ext: 'liquid',
    target: 'liquid-loop-without-limit',
    title: 'Liquid is read one file at a time',
    text: 'The render tag is not followed. A section that looks clean can render a snippet holding an unbounded product loop, and the cost belongs to the section while the finding belongs to the snippet. Pass both files and both are read, separately.',
    blindExpected: [],
    contrastExpected: ['liquid-loop-without-limit@error']
  },
  {
    slug: 'a-library-is-recognised-by-its-file-name',
    kind: 'hides',
    ext: 'html',
    target: 'script-library-duplicated',
    title: 'A library is recognised by its file name',
    text: 'The same library is served from many hosts under many paths, so the family is matched on the file name. A copy bundled into a file named after the theme rather than after the library is not recognised, and a bundle is exactly where a second copy usually hides.',
    blindExpected: [],
    contrastExpected: ['script-library-duplicated@error']
  },
  {
    slug: 'only-a-200-response-is-judged',
    kind: 'hides',
    ext: 'headers',
    target: 'unfingerprinted-asset-long-cache',
    title: 'Only a response that carried a body is judged',
    text: 'A capture holds whatever the client was sent, and a 304 has no body while a redirect has no asset in it. Judging either on compression produces nonsense, so the caching checks read a 200 and nothing else. The cost is that a permanent redirect on a stable URL, cached for a year, is a real version of the same problem and is not reported.',
    blindExpected: [],
    contrastExpected: ['unfingerprinted-asset-long-cache@error']
  },
  {
    slug: 'a-timer-that-reschedules-itself',
    kind: 'hides',
    ext: 'js',
    target: 'cart-endpoint-polled',
    title: 'A poll written as a function that books its own next run',
    text: 'The polling check looks for an interval. A function that schedules itself after each response polls just as hard, and arguably worse, because the delay is added to the response time rather than overlapping it. Recognising it means following the call graph, which this tool does not do.',
    blindExpected: [],
    contrastExpected: ['cart-endpoint-polled@error', 'fetch-without-abort@warn']
  },
  {
    slug: 'the-inline-budget-counts-bytes-as-written',
    kind: 'manufactures',
    ext: 'html',
    target: 'inline-critical-css-oversized',
    title: 'The inline budget counts the bytes as written',
    text: 'The inline style budget is measured on the block as it appears in the document, comments included. A well commented critical block is reported as over budget while the declarations the browser parses are a third of that. Stripping comments before measuring would need a minifier, and the bytes as written are what the shopper downloads, so the honest answer is to say which number is being counted.',
    blindExpected: ['inline-critical-css-oversized@warn'],
    contrastExpected: []
  }
];

export const LIMIT_KINDS = ['hides', 'manufactures'];

export function limitFiles(limit) {
  return {
    blind: 'limits/' + limit.slug + '.blind.' + limit.ext,
    contrast: 'limits/' + limit.slug + '.contrast.' + limit.ext
  };
}

export function countByKind() {
  const out = Object.create(null);
  for (const kind of LIMIT_KINDS) out[kind] = 0;
  for (const limit of LIMITS) out[limit.kind] += 1;
  return out;
}
