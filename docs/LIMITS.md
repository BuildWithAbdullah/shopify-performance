# Limits

Generated from `tools/limits.mjs` by `tools/gen-docs.mjs`. Do not edit by hand:
CI compares this file against the manifest and fails if they differ.

13 declared limits: 10 that hide a problem and 3 that manufacture a finding. Each one carries two artefacts in `limits/`, and both halves of its meaning are asserted.

For a limit that hides: the blind artefact must not report the named finding, and the contrast artefact, which is the same problem written in the form the tool does read, must report it. A contrast case that reported nothing would prove nothing, because a file with no problem in it also reports nothing.

For a limit that manufactures: the blind artefact must report the named finding, and the contrast artefact, which is the same thing written in the form the tool reads correctly, must be completely clean.

## The fold is read from document order, not from layout

Kind: hides. Finding: `image-missing-lazy`.

Whether an image is below the first screen is decided by its position in the markup. A theme whose first two images are full height panels pushes the third one far down the page, and nothing here can see that, so its eager loading is not reported.

Blind artefact: `limits/fold-position-is-document-order.blind.html`, which reports nothing.

Contrast artefact: `limits/fold-position-is-document-order.contrast.html`, which reports image-missing-lazy@warn.

## A script URL assembled in code is not a script source

Kind: hides. Finding: `script-blocking-in-head`.

The markup scanner reads attributes as written. A script element created in code, with a URL built from fragments, is invisible to it, which is also the shape an app uses when it wants to be hard to remove.

Blind artefact: `limits/script-url-built-at-run-time.blind.html`, which reports nothing.

Contrast artefact: `limits/script-url-built-at-run-time.contrast.html`, which reports preconnect-missing-for-script-host@notice, script-blocking-in-head@error.

## An unquoted attribute value holding an angle bracket ends the tag early

Kind: manufactures. Finding: `image-without-dimensions`.

The scanner keeps quoted values intact, but an unquoted value containing an angle bracket genuinely closes the start tag, so every attribute after it is lost. The element is then reported as missing the sizes it does in fact carry. A real parser is the fix, and this tool ships no parser.

Blind artefact: `limits/unquoted-attribute-value-with-angle-bracket.blind.html`, which reports image-without-dimensions@warn, image-without-srcset@notice.

Contrast artefact: `limits/unquoted-attribute-value-with-angle-bracket.contrast.html`, which reports nothing.

## A handler built by a wrapper cannot be followed

Kind: hides. Finding: `search-input-without-debounce`.

The checks that need to look inside a handler find it either written inline or named in the same file. A handler produced by a call, which is how logging and error wrappers are usually added, is not followed, so what it does is not examined.

Blind artefact: `limits/handler-passed-through-a-wrapper.blind.js`, which reports fetch-without-abort@warn.

Contrast artefact: `limits/handler-passed-through-a-wrapper.contrast.js`, which reports fetch-without-abort@warn, search-input-without-debounce@error.

## An event name held in a variable is not an event name

Kind: hides. Finding: `listener-not-passive`.

The listener checks read the event name from a literal. A theme that keeps its event names in one object, which is good practice, is not checked at all.

Blind artefact: `limits/event-name-from-a-variable.blind.js`, which reports nothing.

Contrast artefact: `limits/event-name-from-a-variable.contrast.js`, which reports listener-not-passive@warn.

## Faces in a stylesheet and preloads in the document are audited separately

Kind: manufactures. Finding: `font-preload-unused`.

Every input is read on its own, so a preload in the document whose matching face lives in the theme stylesheet is reported as unused. The correct answer needs the two inputs joined, which this tool deliberately does not do, because that means resolving asset URLs.

Blind artefact: `limits/faces-and-preloads-are-two-inputs.blind.html`, which reports font-preload-unused@warn.

Contrast artefact: `limits/faces-and-preloads-are-two-inputs.contrast.html`, which reports nothing.

## The asset manifest is written by the operator

Kind: hides. Finding: `asset-manifest-total-over-budget`.

The weight budget is checked against a manifest somebody hands it. A script injected by an app, which never appears in the theme assets directory, is absent from that manifest and therefore absent from the total.

Blind artefact: `limits/the-manifest-is-supplied-not-measured.blind.json`, which reports nothing.

Contrast artefact: `limits/the-manifest-is-supplied-not-measured.contrast.json`, which reports asset-manifest-total-over-budget@error.

## An expiry can only be compared against a captured date

Kind: hides. Finding: `cache-headers-conflict`.

Deciding whether an expiry disagrees with a lifetime needs to know when the response was served. A capture with no date header gives nothing to compare against, and guessing from the clock of whoever runs the audit would make the result depend on when it ran.

Blind artefact: `limits/an-expiry-conflict-needs-a-date-header.blind.headers`, which reports nothing.

Contrast artefact: `limits/an-expiry-conflict-needs-a-date-header.contrast.headers`, which reports cache-headers-conflict@error.

## Liquid is read one file at a time

Kind: hides. Finding: `liquid-loop-without-limit`.

The render tag is not followed. A section that looks clean can render a snippet holding an unbounded product loop, and the cost belongs to the section while the finding belongs to the snippet. Pass both files and both are read, separately.

Blind artefact: `limits/one-file-at-a-time.blind.liquid`, which reports nothing.

Contrast artefact: `limits/one-file-at-a-time.contrast.liquid`, which reports liquid-loop-without-limit@error.

## A library is recognised by its file name

Kind: hides. Finding: `script-library-duplicated`.

The same library is served from many hosts under many paths, so the family is matched on the file name. A copy bundled into a file named after the theme rather than after the library is not recognised, and a bundle is exactly where a second copy usually hides.

Blind artefact: `limits/a-library-is-recognised-by-its-file-name.blind.html`, which reports nothing.

Contrast artefact: `limits/a-library-is-recognised-by-its-file-name.contrast.html`, which reports script-library-duplicated@error.

## Only a response that carried a body is judged

Kind: hides. Finding: `unfingerprinted-asset-long-cache`.

A capture holds whatever the client was sent, and a 304 has no body while a redirect has no asset in it. Judging either on compression produces nonsense, so the caching checks read a 200 and nothing else. The cost is that a permanent redirect on a stable URL, cached for a year, is a real version of the same problem and is not reported.

Blind artefact: `limits/only-a-200-response-is-judged.blind.headers`, which reports nothing.

Contrast artefact: `limits/only-a-200-response-is-judged.contrast.headers`, which reports unfingerprinted-asset-long-cache@error.

## A poll written as a function that books its own next run

Kind: hides. Finding: `cart-endpoint-polled`.

The polling check looks for an interval. A function that schedules itself after each response polls just as hard, and arguably worse, because the delay is added to the response time rather than overlapping it. Recognising it means following the call graph, which this tool does not do.

Blind artefact: `limits/a-timer-that-reschedules-itself.blind.js`, which reports nothing.

Contrast artefact: `limits/a-timer-that-reschedules-itself.contrast.js`, which reports cart-endpoint-polled@error, fetch-without-abort@warn.

## The inline budget counts the bytes as written

Kind: manufactures. Finding: `inline-critical-css-oversized`.

The inline style budget is measured on the block as it appears in the document, comments included. A well commented critical block is reported as over budget while the declarations the browser parses are a third of that. Stripping comments before measuring would need a minifier, and the bytes as written are what the shopper downloads, so the honest answer is to say which number is being counted.

Blind artefact: `limits/the-inline-budget-counts-bytes-as-written.blind.html`, which reports inline-critical-css-oversized@warn.

Contrast artefact: `limits/the-inline-budget-counts-bytes-as-written.contrast.html`, which reports nothing.

## Severities

A finding is emitted at one of error, warn, notice.

