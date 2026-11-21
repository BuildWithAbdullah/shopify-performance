// One entry per reason a finding can be raised, not one per check. A check may
// raise several entries and an entry may be raised by more than one input kind,
// but no two entries mean the same thing.
//
// `severities` is the complete set of severities the entry can ever be emitted
// at. The suite compares that set against a real run in both directions: a
// severity a finding carries that is not declared fails the build, and a
// declared severity no test has ever produced fails it too.

export const AREAS = [
  { id: 'scripts', title: 'App and script footprint' },
  { id: 'liquid', title: 'Liquid render cost' },
  { id: 'assets', title: 'Image and font delivery' },
  { id: 'critical-path', title: 'Render blocking and resource hints' },
  { id: 'caching', title: 'Caching, compression and CDN behaviour' },
  { id: 'settings', title: 'Theme settings and shipped weight' },
  { id: 'storefront-js', title: 'Storefront JavaScript cost' }
];

export const SEVERITIES = ['error', 'warn', 'notice'];

const E = ['error'];
const W = ['warn'];
const N = ['notice'];

export const CATALOGUE = [
  // scripts
  {
    id: 'script-blocking-in-head',
    area: 'scripts',
    severities: ['error', 'warn'],
    title: 'A script in the head blocks the parser',
    why: 'A script element in the head with neither defer nor async stops parsing until it has been fetched and run. A third party host makes that a connection you do not control, which is why the same shape is an error off site and a warning for a theme asset.',
    fix: 'Add defer, or async when order does not matter, or move the element to the end of the body.'
  },
  {
    id: 'script-duplicate-source',
    area: 'scripts',
    severities: W,
    title: 'The same script source is loaded more than once',
    why: 'Two elements pointing at the same host and path download once but execute twice, and app installers add a second copy of their own tag more often than anything else on a theme.',
    fix: 'Remove the duplicate element, or let the app inject its tag and take the hard coded one out of the theme.'
  },
  {
    id: 'script-library-duplicated',
    area: 'scripts',
    severities: E,
    title: 'Two copies of the same library family are loaded',
    why: 'A theme that already bundles a library and then loads a vendor copy pays for both downloads and both parse costs, and the second copy usually wins the global, so behaviour depends on order.',
    fix: 'Pick one copy, and expose it to the app that needs it rather than loading a second.'
  },
  {
    id: 'script-inline-large-in-head',
    area: 'scripts',
    severities: W,
    title: 'A large inline script sits in the head',
    why: 'Inline script in the head is parsed and run before the body is seen, and it cannot be cached between navigations because it is part of the document.',
    fix: 'Move the body of the script into a theme asset and load it with defer.'
  },
  {
    id: 'script-sync-xhr',
    area: 'scripts',
    severities: E,
    title: 'A synchronous request blocks the main thread',
    why: 'A synchronous request freezes the tab until the response arrives, so one slow third party makes the whole page unresponsive rather than one part of it incomplete.',
    fix: 'Use fetch and render the part of the page that depends on the response when it resolves.'
  },
  {
    id: 'script-document-write',
    area: 'scripts',
    severities: E,
    title: 'A theme script writes markup into the parser',
    why: 'Theme assets are loaded deferred, and writing to the document after parsing has finished replaces the whole page. From an asynchronous script the browser ignores the call outright, so the code is both a performance problem and quietly broken.',
    fix: 'Insert the element with the DOM rather than writing markup into the parser.'
  },
  {
    id: 'script-tag-api-scope-too-wide',
    area: 'scripts',
    severities: W,
    title: 'An injected app script runs on pages it does not serve',
    why: 'A script tag whose stated purpose is the order status page but whose display scope is every page is loaded on every product and collection view, where it does nothing except cost a connection.',
    fix: 'Narrow the display scope to the pages the script serves.'
  },
  {
    id: 'script-tag-api-stale-app',
    area: 'scripts',
    severities: E,
    title: 'An injected script belongs to an app that is no longer installed',
    why: 'Uninstalling an app does not always remove the script tags it created. The script keeps being injected into every page, and nothing in the theme shows that it is there.',
    fix: 'Delete the orphaned script tag through the API, since no theme edit can remove it.'
  },
  {
    id: 'script-parked-without-activation',
    area: 'scripts',
    severities: N,
    title: 'A parked script has nothing that activates it',
    why: 'A script stored with a non executable type, or held in a data attribute, is deferred correctly only if something later turns it into a real script. With no activation anywhere it is dead weight in the document.',
    fix: 'Either add the code that activates it on the event you intended, or remove it.'
  },

  // liquid
  {
    id: 'liquid-loop-without-limit',
    area: 'liquid',
    severities: E,
    title: 'A loop over products has no limit',
    why: 'A collection loop with no limit renders every product the collection holds, so render time is set by the largest collection in the store rather than by the template.',
    fix: 'Add a limit, or paginate.'
  },
  {
    id: 'liquid-nested-collection-loop',
    area: 'liquid',
    severities: E,
    title: 'A loop over collections contains a loop over their products',
    why: 'The cost is the product of the two, and both sides grow as the catalogue grows. This is the single most common reason a collection list template times out.',
    fix: 'Render one collection per request, or limit both loops and link through to the collection page.'
  },
  {
    id: 'liquid-metafield-in-loop',
    area: 'liquid',
    severities: W,
    title: 'A metafield is read inside a loop',
    why: 'Each metafield read inside a loop body is a separate lookup, so a template that reads one field per product does one lookup per product.',
    fix: 'Read the fields once outside the loop where the data allows it, or move the field onto the product object the loop already has.'
  },
  {
    id: 'liquid-all-products-iteration',
    area: 'liquid',
    severities: E,
    title: 'The template iterates every product in the store',
    why: 'Iterating the all products collection reads the whole catalogue on every render, and the limit the platform applies silently truncates the output rather than failing.',
    fix: 'Use a real collection, a search, or a hand built list of handles.'
  },
  {
    id: 'liquid-products-size-for-count',
    area: 'liquid',
    severities: W,
    title: 'A product count is taken by sizing the product list',
    why: 'Sizing the product list loads the products in order to count them. The count is available on the collection without loading anything.',
    fix: 'Use the count property the collection already exposes.'
  },
  {
    id: 'liquid-paginate-oversized',
    area: 'liquid',
    severities: W,
    title: 'A page of results is larger than the platform will serve',
    why: 'A page size above the documented maximum is clamped rather than refused, so the template promises one thing and the storefront does another, and the clamped page is still the largest the platform allows.',
    fix: 'Set the page size to the documented maximum or below, and size it for the slowest device you support.'
  },
  {
    id: 'liquid-include-in-loop',
    area: 'liquid',
    severities: W,
    title: 'A deprecated include sits inside a loop',
    why: 'The deprecated include tag shares the scope of its caller, so the renderer cannot cache its parse and repeats the work on every iteration.',
    fix: 'Convert the snippet to the render tag, which takes its arguments explicitly.'
  },
  {
    id: 'liquid-invariant-assign-in-loop',
    area: 'liquid',
    severities: N,
    title: 'A loop assigns a value that does not depend on the loop',
    why: 'An assignment whose expression never mentions the loop variable produces the same value on every iteration, so the work is repeated for nothing.',
    fix: 'Move the assignment above the loop.'
  },
  {
    id: 'liquid-sort-in-loop',
    area: 'liquid',
    severities: W,
    title: 'A sort runs inside a loop body',
    why: 'Sorting inside a loop sorts the same list once per iteration, and a sort is the most expensive filter in the language.',
    fix: 'Sort once into a variable above the loop and iterate that.'
  },
  {
    id: 'liquid-image-url-without-width',
    area: 'liquid',
    severities: W,
    title: 'An image URL is built without a width',
    why: 'With no width the platform serves the original upload, which on a product photo is routinely several megabytes for a thumbnail slot.',
    fix: 'Pass the width the slot actually needs, and add a source set for the sizes above it.'
  },
  {
    id: 'liquid-deprecated-img-url',
    area: 'liquid',
    severities: N,
    title: 'The deprecated image URL filter is used',
    why: 'The replacement filter takes explicit width and height arguments and emits a different URL shape, so a theme on the old filter cannot express the sizes it wants.',
    fix: 'Move to the current image URL filter.'
  },

  // assets
  {
    id: 'image-without-dimensions',
    area: 'assets',
    severities: W,
    title: 'An image has no intrinsic size on the element',
    why: 'Without a width and a height the browser cannot reserve space, so everything below the image moves when it loads.',
    fix: 'Put the width and height of the source file on the element and let CSS scale it.'
  },
  {
    id: 'image-missing-lazy',
    area: 'assets',
    severities: W,
    title: 'An image far down the page loads eagerly',
    why: 'Every eager image competes with the content a shopper can actually see, and a long product page can hold dozens of them.',
    fix: 'Mark images below the first screen as lazy.'
  },
  {
    id: 'image-hero-lazy',
    area: 'assets',
    severities: E,
    title: 'The first image on the page is marked lazy',
    why: 'Marking the largest visible image lazy takes it out of the first round of requests, which delays the very paint the metric measures. This is the most common accidental regression in a theme that added lazy loading everywhere at once.',
    fix: 'Load the first image eagerly and mark it as high priority.'
  },
  {
    id: 'image-without-srcset',
    area: 'assets',
    severities: N,
    title: 'A responsive image has no source set',
    why: 'One source for every screen means a phone downloads the desktop file, and the saving is the largest single one available on a product page.',
    fix: 'Emit a source set and a sizes attribute that matches the layout.'
  },
  {
    id: 'font-face-without-display',
    area: 'assets',
    severities: W,
    title: 'A font face does not say what to do while it loads',
    why: 'With no display descriptor the browser hides the text for up to three seconds, so the page is laid out and still unreadable.',
    fix: 'Set the display descriptor to swap or to optional.'
  },
  {
    id: 'font-not-preloaded',
    area: 'assets',
    severities: N,
    title: 'A font used above the fold is not preloaded',
    why: 'A font referenced from a stylesheet is discovered only after that stylesheet has been parsed, which puts it two round trips behind the text that needs it.',
    fix: 'Preload the one or two faces the first screen uses, and no more.'
  },
  {
    id: 'font-preload-unused',
    area: 'assets',
    severities: W,
    title: 'A preloaded font is not used by any font face',
    why: 'A preload with no matching face downloads the file at high priority and then throws it away, so it costs bandwidth at exactly the wrong moment. It usually survives a font change that nobody finished.',
    fix: 'Remove the preload, or point it at the file the face actually names.'
  },
  {
    id: 'font-face-without-woff2',
    area: 'assets',
    severities: N,
    title: 'A font face offers no compressed format',
    why: 'The compressed format is roughly a third smaller than the one before it and is supported by every browser a store should care about.',
    fix: 'Add the compressed source first in the list.'
  },
  {
    id: 'asset-oversized-image',
    area: 'assets',
    severities: W,
    title: 'An image in the theme assets is larger than the budget',
    why: 'An image committed to the theme is served as it is, with none of the resizing the platform applies to uploaded media, so an oversized file stays oversized on every device.',
    fix: 'Resize and recompress the file, or move it to media so the platform can serve variants.'
  },

  // critical-path
  {
    id: 'css-import-chained',
    area: 'critical-path',
    severities: E,
    title: 'A stylesheet imports another stylesheet',
    why: 'An import inside CSS is discovered only once the first file has been downloaded and parsed, so the second file is a second blocking round trip the parser cannot start early.',
    fix: 'Load both files from the document, or build them into one.'
  },
  {
    id: 'inline-critical-css-oversized',
    area: 'critical-path',
    severities: W,
    title: 'The inline style block in the head is too large',
    why: 'Inline critical CSS is paid for on every navigation and cannot be cached. Past a few kilobytes it costs more than the round trip it was meant to save.',
    fix: 'Keep the inline block to what the first screen needs and load the rest as a file.'
  },
  {
    id: 'preload-missing-as',
    area: 'critical-path',
    severities: E,
    title: 'A preload does not say what kind of resource it is',
    why: 'Without the kind the browser cannot set a priority or decide whether the request can be reused, so the file is often fetched twice.',
    fix: 'Add the kind, and the cross origin attribute when the kind is a font.'
  },
  {
    id: 'preload-as-mismatch',
    area: 'critical-path',
    severities: E,
    title: 'A preload names a kind that disagrees with the file',
    why: 'A mismatched kind means the preloaded response is never matched to the real request, so the resource is downloaded twice and the hint has made things worse.',
    fix: 'Set the kind to match the file, and check the extension in the template that emits the hint.'
  },
  {
    id: 'preconnect-missing-for-script-host',
    area: 'critical-path',
    severities: N,
    title: 'A third party script host has no connection hint',
    why: 'The connection to a new host costs a lookup, a handshake and a negotiation before a single byte of the script arrives, and all three can start while the document is still parsing.',
    fix: 'Add a preconnect for the hosts on the critical path.'
  },
  {
    id: 'preconnect-excessive',
    area: 'critical-path',
    severities: W,
    title: 'There are more connection hints than the page can use',
    why: 'Each hint opens a real connection and holds it. Past a handful they compete with the requests the page is making for the same bandwidth.',
    fix: 'Keep the hints for the hosts the first screen needs and let the rest connect when they are used.'
  },
  {
    id: 'stylesheet-count-in-head-excessive',
    area: 'critical-path',
    severities: W,
    title: 'Too many blocking stylesheets in the head',
    why: 'Every blocking stylesheet has to arrive before anything is painted, so the first paint is set by the slowest of them.',
    fix: 'Combine the theme stylesheets, and load anything used by one template from that template.'
  },
  {
    id: 'prefetch-of-critical-resource',
    area: 'critical-path',
    severities: W,
    title: 'A resource the page needs now is marked for prefetch',
    why: 'Prefetch is for the next navigation and is fetched at the lowest priority. Applying it to a file the current page uses deprioritises that file behind everything else.',
    fix: 'Use preload for the current page and keep prefetch for the next one.'
  },

  // caching
  {
    id: 'asset-short-cache',
    area: 'caching',
    severities: W,
    title: 'A fingerprinted asset has a short cache lifetime',
    why: 'A URL that changes when its contents change can be cached for a year safely. Anything shorter makes a returning shopper revalidate a file that cannot have changed.',
    fix: 'Serve a long lifetime for fingerprinted URLs.'
  },
  {
    id: 'asset-cache-not-immutable',
    area: 'caching',
    severities: N,
    title: 'A long lived asset is not marked immutable',
    why: 'Without the immutable directive some clients revalidate on reload even inside the lifetime, which turns a free cache hit into a round trip.',
    fix: 'Add the immutable directive alongside the long lifetime.'
  },
  {
    id: 'unfingerprinted-asset-long-cache',
    area: 'caching',
    severities: E,
    title: 'An asset with a stable URL is cached for a long time',
    why: 'A URL that does not change when its contents change cannot be cached for long, because the only way to ship a fix is to wait out the lifetime in every client that holds it.',
    fix: 'Add a version to the URL, or shorten the lifetime to minutes.'
  },
  {
    id: 'document-cached-too-long',
    area: 'caching',
    severities: E,
    title: 'A storefront document is cached beyond its ceiling',
    why: 'A cached HTML document serves a stale cart, a stale price and a stale stock count, and the shopper has no way to clear it.',
    fix: 'Keep the document lifetime short and cache the assets instead.'
  },
  {
    id: 'text-asset-not-compressed',
    area: 'caching',
    severities: E,
    title: 'A text asset is served without compression',
    why: 'Compression removes roughly two thirds of a script or stylesheet. An uncompressed response is the cheapest large saving available anywhere in a page.',
    fix: 'Enable compression for textual content types at the edge.'
  },
  {
    id: 'compressed-without-vary',
    area: 'caching',
    severities: W,
    title: 'A compressed response does not vary on the encoding',
    why: 'A shared cache that stores one compressed copy without the varying header can hand it to a client that did not ask for it, which is served as unreadable bytes.',
    fix: 'Add the varying header naming the encoding request header.'
  },
  {
    id: 'set-cookie-on-asset',
    area: 'caching',
    severities: W,
    title: 'A static asset response sets a cookie',
    why: 'Most shared caches refuse to store a response that sets a cookie, so the asset is fetched from the origin every time while appearing to be cacheable.',
    fix: 'Stop setting cookies on asset paths at the edge.'
  },
  {
    id: 'cache-headers-conflict',
    area: 'caching',
    severities: E,
    title: 'Two cache headers on one response disagree',
    why: 'When the directives disagree the client picks one and the shared cache may pick the other, so the same file has two lifetimes depending on who is asked.',
    fix: 'Send one cache header and derive everything else from it.'
  },

  // settings
  {
    id: 'setting-enabled-for-absent-section',
    area: 'settings',
    severities: W,
    title: 'A setting is switched on for a section no template renders',
    why: 'The setting still carries its cost in the theme, and a later reader cannot tell whether the feature is used, so nobody ever turns it off.',
    fix: 'Switch the setting off, or remove it with the section it belonged to.'
  },
  {
    id: 'setting-loads-unused-library',
    area: 'settings',
    severities: E,
    title: 'A switched on setting pulls in a library nothing uses',
    why: 'A setting that loads a library is the most expensive kind of dead code, because the file is downloaded, parsed and run on every page for a feature that is not on the page.',
    fix: 'Switch the setting off, and gate the library on the feature rather than on the setting.'
  },
  {
    id: 'settings-data-oversized',
    area: 'settings',
    severities: N,
    title: 'The theme settings file is very large',
    why: 'The settings file is read on every render. Size on its own is not a defect, but past a point it is a reliable sign of sections and presets nobody removed.',
    fix: 'Remove the presets and section blocks the live templates do not use.'
  },
  {
    id: 'asset-unreferenced',
    area: 'settings',
    severities: N,
    title: 'An asset is referenced by nothing',
    why: 'An unreferenced asset is not served, so it costs nothing at run time. It costs a reader time, and it hides the files that are actually used.',
    fix: 'Delete it, or reference it from the template that needs it.'
  },
  {
    id: 'asset-sourcemap-shipped',
    area: 'settings',
    severities: W,
    title: 'A source map is shipped in the theme assets',
    why: 'A source map is a public file that holds the unminified source, and it is downloaded by anybody who opens developer tools on the storefront.',
    fix: 'Keep source maps out of the published theme, or host them where only you can read them.'
  },
  {
    id: 'asset-unminified-twin',
    area: 'settings',
    severities: W,
    title: 'Both the minified and the unminified build of an asset are referenced',
    why: 'Referencing both means both are downloaded and both are run, so the page pays twice and the second definition wins.',
    fix: 'Reference the minified build and keep the source out of the theme.'
  },
  {
    id: 'asset-manifest-total-over-budget',
    area: 'settings',
    severities: E,
    title: 'The total script weight is over its budget',
    why: 'A per file limit is easy to pass while the total grows, and the total is what a shopper waits for. A budget that is never checked is not a budget.',
    fix: 'Remove or defer enough script to come back inside the total, and check the total in CI.'
  },

  // storefront-js
  {
    id: 'cart-endpoint-polled',
    area: 'storefront-js',
    severities: E,
    title: 'A cart endpoint is polled on a timer',
    why: 'Polling the cart keeps the main thread and the network busy for the whole visit, and the data it fetches changes only when the shopper acts.',
    fix: 'Update the cart from the response to the action that changed it.'
  },
  {
    id: 'search-input-without-debounce',
    area: 'storefront-js',
    severities: E,
    title: 'A search field issues a request on every keystroke',
    why: 'Typing eight characters sends eight requests, the responses arrive out of order, and the slowest one usually wins the render.',
    fix: 'Debounce the handler and cancel the request in flight.'
  },
  {
    id: 'fetch-without-abort',
    area: 'storefront-js',
    severities: W,
    title: 'A repeated request has no way to be cancelled',
    why: 'Without a cancellation signal an earlier response can land after a later one and overwrite it, and the work continues after the shopper has moved on.',
    fix: 'Create an abort controller per call and cancel the previous one.'
  },
  {
    id: 'full-page-fetch-for-section',
    area: 'storefront-js',
    severities: W,
    title: 'A whole page is fetched to update one section',
    why: 'Fetching a full page and parsing it to take one fragment out downloads the entire document, including every other section on it.',
    fix: 'Request the section through the section rendering query instead.'
  },
  {
    id: 'listener-not-passive',
    area: 'storefront-js',
    severities: W,
    title: 'A scroll or touch listener is not passive',
    why: 'The browser has to wait for a non passive handler to finish before it can scroll, so one slow handler makes the whole page feel stuck.',
    fix: 'Pass the passive option on listeners that do not cancel the event.'
  },
  {
    id: 'layout-read-after-write-in-handler',
    area: 'storefront-js',
    severities: E,
    title: 'A handler reads layout after writing style',
    why: 'Reading a layout property after a style write forces the browser to lay the page out again before the handler can continue, once per iteration.',
    fix: 'Read everything first, then write, and keep the two apart.'
  },
  {
    id: 'dom-query-in-loop',
    area: 'storefront-js',
    severities: N,
    title: 'A DOM query runs inside a loop',
    why: 'The query walks the document on every iteration to find something that has not moved.',
    fix: 'Query once above the loop.'
  },
  {
    id: 'resize-handler-without-throttle',
    area: 'storefront-js',
    severities: W,
    title: 'A resize handler is not throttled',
    why: 'A resize gesture fires continuously, so an unthrottled handler runs dozens of times a second while the window is being dragged.',
    fix: 'Throttle the handler, or move the work to an element size observer.'
  }
];

export const BY_ID = new Map(CATALOGUE.map((entry) => [entry.id, entry]));

export function entry(id) {
  const found = BY_ID.get(id);
  if (!found) throw new Error('no catalogue entry for ' + id);
  return found;
}

export function areaOf(id) {
  return entry(id).area;
}

export function declaredSeverities(id) {
  return entry(id).severities.slice();
}

export function countByArea() {
  const out = Object.create(null);
  for (const a of AREAS) out[a.id] = 0;
  for (const e of CATALOGUE) out[e.area] += 1;
  return out;
}
