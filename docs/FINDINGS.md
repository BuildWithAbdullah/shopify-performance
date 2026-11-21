# Findings

Generated from `src/catalogue.mjs` by `tools/gen-docs.mjs`. Do not edit by hand:
CI compares this file against the manifest and fails if they differ.

60 findings across 7 areas. One entry per reason, not one per check. The severity column is the complete set the finding can be emitted at, and the suite compares that set against a real run in both directions.

## App and script footprint

scripts, 9 findings.

### script-blocking-in-head

Severities: error, warn.

A script in the head blocks the parser.

A script element in the head with neither defer nor async stops parsing until it has been fetched and run. A third party host makes that a connection you do not control, which is why the same shape is an error off site and a warning for a theme asset.

Fix: Add defer, or async when order does not matter, or move the element to the end of the body.

Reached by: patterns/head-script-blocking, patterns/theme-asset-blocking.

### script-duplicate-source

Severities: warn.

The same script source is loaded more than once.

Two elements pointing at the same host and path download once but execute twice, and app installers add a second copy of their own tag more often than anything else on a theme.

Fix: Remove the duplicate element, or let the app inject its tag and take the hard coded one out of the theme.

Reached by: patterns/duplicate-app-tag.

### script-library-duplicated

Severities: error.

Two copies of the same library family are loaded.

A theme that already bundles a library and then loads a vendor copy pays for both downloads and both parse costs, and the second copy usually wins the global, so behaviour depends on order.

Fix: Pick one copy, and expose it to the app that needs it rather than loading a second.

Reached by: patterns/vendor-library-twice.

### script-inline-large-in-head

Severities: warn.

A large inline script sits in the head.

Inline script in the head is parsed and run before the body is seen, and it cannot be cached between navigations because it is part of the document.

Fix: Move the body of the script into a theme asset and load it with defer.

Reached by: patterns/inline-head-script.

### script-sync-xhr

Severities: error.

A synchronous request blocks the main thread.

A synchronous request freezes the tab until the response arrives, so one slow third party makes the whole page unresponsive rather than one part of it incomplete.

Fix: Use fetch and render the part of the page that depends on the response when it resolves.

Reached by: patterns/sync-xhr.

### script-document-write

Severities: error.

A theme script writes markup into the parser.

Theme assets are loaded deferred, and writing to the document after parsing has finished replaces the whole page. From an asynchronous script the browser ignores the call outright, so the code is both a performance problem and quietly broken.

Fix: Insert the element with the DOM rather than writing markup into the parser.

Reached by: patterns/sync-xhr.

### script-tag-api-scope-too-wide

Severities: warn.

An injected app script runs on pages it does not serve.

A script tag whose stated purpose is the order status page but whose display scope is every page is loaded on every product and collection view, where it does nothing except cost a connection.

Fix: Narrow the display scope to the pages the script serves.

Reached by: patterns/script-tag-inventory.

### script-tag-api-stale-app

Severities: error.

An injected script belongs to an app that is no longer installed.

Uninstalling an app does not always remove the script tags it created. The script keeps being injected into every page, and nothing in the theme shows that it is there.

Fix: Delete the orphaned script tag through the API, since no theme edit can remove it.

Reached by: patterns/script-tag-inventory.

### script-parked-without-activation

Severities: notice.

A parked script has nothing that activates it.

A script stored with a non executable type, or held in a data attribute, is deferred correctly only if something later turns it into a real script. With no activation anywhere it is dead weight in the document.

Fix: Either add the code that activates it on the event you intended, or remove it.

Reached by: patterns/parked-script.

## Liquid render cost

liquid, 11 findings.

### liquid-loop-without-limit

Severities: error.

A loop over products has no limit.

A collection loop with no limit renders every product the collection holds, so render time is set by the largest collection in the store rather than by the template.

Fix: Add a limit, or paginate.

Reached by: patterns/collection-loop-limit, patterns/nested-collection-loop.

### liquid-nested-collection-loop

Severities: error.

A loop over collections contains a loop over their products.

The cost is the product of the two, and both sides grow as the catalogue grows. This is the single most common reason a collection list template times out.

Fix: Render one collection per request, or limit both loops and link through to the collection page.

Reached by: patterns/nested-collection-loop.

### liquid-metafield-in-loop

Severities: warn.

A metafield is read inside a loop.

Each metafield read inside a loop body is a separate lookup, so a template that reads one field per product does one lookup per product.

Fix: Read the fields once outside the loop where the data allows it, or move the field onto the product object the loop already has.

Reached by: patterns/collection-loop-limit.

### liquid-all-products-iteration

Severities: error.

The template iterates every product in the store.

Iterating the all products collection reads the whole catalogue on every render, and the limit the platform applies silently truncates the output rather than failing.

Fix: Use a real collection, a search, or a hand built list of handles.

Reached by: patterns/all-products-loop.

### liquid-products-size-for-count

Severities: warn.

A product count is taken by sizing the product list.

Sizing the product list loads the products in order to count them. The count is available on the collection without loading anything.

Fix: Use the count property the collection already exposes.

Reached by: patterns/product-count.

### liquid-paginate-oversized

Severities: warn.

A page of results is larger than the platform will serve.

A page size above the documented maximum is clamped rather than refused, so the template promises one thing and the storefront does another, and the clamped page is still the largest the platform allows.

Fix: Set the page size to the documented maximum or below, and size it for the slowest device you support.

Reached by: patterns/paginate-size.

### liquid-include-in-loop

Severities: warn.

A deprecated include sits inside a loop.

The deprecated include tag shares the scope of its caller, so the renderer cannot cache its parse and repeats the work on every iteration.

Fix: Convert the snippet to the render tag, which takes its arguments explicitly.

Reached by: patterns/snippet-include-in-loop.

### liquid-invariant-assign-in-loop

Severities: notice.

A loop assigns a value that does not depend on the loop.

An assignment whose expression never mentions the loop variable produces the same value on every iteration, so the work is repeated for nothing.

Fix: Move the assignment above the loop.

Reached by: patterns/snippet-include-in-loop.

### liquid-sort-in-loop

Severities: warn.

A sort runs inside a loop body.

Sorting inside a loop sorts the same list once per iteration, and a sort is the most expensive filter in the language.

Fix: Sort once into a variable above the loop and iterate that.

Reached by: patterns/snippet-include-in-loop.

### liquid-image-url-without-width

Severities: warn.

An image URL is built without a width.

With no width the platform serves the original upload, which on a product photo is routinely several megabytes for a thumbnail slot.

Fix: Pass the width the slot actually needs, and add a source set for the sizes above it.

Reached by: patterns/collection-loop-limit.

### liquid-deprecated-img-url

Severities: notice.

The deprecated image URL filter is used.

The replacement filter takes explicit width and height arguments and emits a different URL shape, so a theme on the old filter cannot express the sizes it wants.

Fix: Move to the current image URL filter.

Reached by: patterns/collection-loop-limit.

## Image and font delivery

assets, 9 findings.

### image-without-dimensions

Severities: warn.

An image has no intrinsic size on the element.

Without a width and a height the browser cannot reserve space, so everything below the image moves when it loads.

Fix: Put the width and height of the source file on the element and let CSS scale it.

Reached by: patterns/hero-image-priority.

### image-missing-lazy

Severities: warn.

An image far down the page loads eagerly.

Every eager image competes with the content a shopper can actually see, and a long product page can hold dozens of them.

Fix: Mark images below the first screen as lazy.

Reached by: patterns/hero-image-priority.

### image-hero-lazy

Severities: error.

The first image on the page is marked lazy.

Marking the largest visible image lazy takes it out of the first round of requests, which delays the very paint the metric measures. This is the most common accidental regression in a theme that added lazy loading everywhere at once.

Fix: Load the first image eagerly and mark it as high priority.

Reached by: patterns/hero-image-priority.

### image-without-srcset

Severities: notice.

A responsive image has no source set.

One source for every screen means a phone downloads the desktop file, and the saving is the largest single one available on a product page.

Fix: Emit a source set and a sizes attribute that matches the layout.

Reached by: patterns/hero-image-priority.

### font-face-without-display

Severities: warn.

A font face does not say what to do while it loads.

With no display descriptor the browser hides the text for up to three seconds, so the page is laid out and still unreadable.

Fix: Set the display descriptor to swap or to optional.

Reached by: patterns/font-face-head.

### font-not-preloaded

Severities: notice.

A font used above the fold is not preloaded.

A font referenced from a stylesheet is discovered only after that stylesheet has been parsed, which puts it two round trips behind the text that needs it.

Fix: Preload the one or two faces the first screen uses, and no more.

Reached by: patterns/font-face-head.

### font-preload-unused

Severities: warn.

A preloaded font is not used by any font face.

A preload with no matching face downloads the file at high priority and then throws it away, so it costs bandwidth at exactly the wrong moment. It usually survives a font change that nobody finished.

Fix: Remove the preload, or point it at the file the face actually names.

Reached by: patterns/font-preload-stale.

### font-face-without-woff2

Severities: notice.

A font face offers no compressed format.

The compressed format is roughly a third smaller than the one before it and is supported by every browser a store should care about.

Fix: Add the compressed source first in the list.

Reached by: fixtures/font-woff-only.css.

### asset-oversized-image

Severities: warn.

An image in the theme assets is larger than the budget.

An image committed to the theme is served as it is, with none of the resizing the platform applies to uploaded media, so an oversized file stays oversized on every device.

Fix: Resize and recompress the file, or move it to media so the platform can serve variants.

Reached by: patterns/asset-manifest-weight.

## Render blocking and resource hints

critical-path, 8 findings.

### css-import-chained

Severities: error.

A stylesheet imports another stylesheet.

An import inside CSS is discovered only once the first file has been downloaded and parsed, so the second file is a second blocking round trip the parser cannot start early.

Fix: Load both files from the document, or build them into one.

Reached by: patterns/stylesheet-import.

### inline-critical-css-oversized

Severities: warn.

The inline style block in the head is too large.

Inline critical CSS is paid for on every navigation and cannot be cached. Past a few kilobytes it costs more than the round trip it was meant to save.

Fix: Keep the inline block to what the first screen needs and load the rest as a file.

Reached by: fixtures/inline-critical-css-huge.html.

### preload-missing-as

Severities: error.

A preload does not say what kind of resource it is.

Without the kind the browser cannot set a priority or decide whether the request can be reused, so the file is often fetched twice.

Fix: Add the kind, and the cross origin attribute when the kind is a font.

Reached by: patterns/preload-hints.

### preload-as-mismatch

Severities: error.

A preload names a kind that disagrees with the file.

A mismatched kind means the preloaded response is never matched to the real request, so the resource is downloaded twice and the hint has made things worse.

Fix: Set the kind to match the file, and check the extension in the template that emits the hint.

Reached by: patterns/preload-hints.

### preconnect-missing-for-script-host

Severities: notice.

A third party script host has no connection hint.

The connection to a new host costs a lookup, a handshake and a negotiation before a single byte of the script arrives, and all three can start while the document is still parsing.

Fix: Add a preconnect for the hosts on the critical path.

Reached by: patterns/head-script-blocking, patterns/vendor-library-twice.

### preconnect-excessive

Severities: warn.

There are more connection hints than the page can use.

Each hint opens a real connection and holds it. Past a handful they compete with the requests the page is making for the same bandwidth.

Fix: Keep the hints for the hosts the first screen needs and let the rest connect when they are used.

Reached by: patterns/connection-hints.

### stylesheet-count-in-head-excessive

Severities: warn.

Too many blocking stylesheets in the head.

Every blocking stylesheet has to arrive before anything is painted, so the first paint is set by the slowest of them.

Fix: Combine the theme stylesheets, and load anything used by one template from that template.

Reached by: patterns/blocking-stylesheets.

### prefetch-of-critical-resource

Severities: warn.

A resource the page needs now is marked for prefetch.

Prefetch is for the next navigation and is fetched at the lowest priority. Applying it to a file the current page uses deprioritises that file behind everything else.

Fix: Use preload for the current page and keep prefetch for the next one.

Reached by: patterns/blocking-stylesheets.

## Caching, compression and CDN behaviour

caching, 8 findings.

### asset-short-cache

Severities: warn.

A fingerprinted asset has a short cache lifetime.

A URL that changes when its contents change can be cached for a year safely. Anything shorter makes a returning shopper revalidate a file that cannot have changed.

Fix: Serve a long lifetime for fingerprinted URLs.

Reached by: patterns/asset-cache-headers.

### asset-cache-not-immutable

Severities: notice.

A long lived asset is not marked immutable.

Without the immutable directive some clients revalidate on reload even inside the lifetime, which turns a free cache hit into a round trip.

Fix: Add the immutable directive alongside the long lifetime.

Reached by: fixtures/immutable-missing.headers.

### unfingerprinted-asset-long-cache

Severities: error.

An asset with a stable URL is cached for a long time.

A URL that does not change when its contents change cannot be cached for long, because the only way to ship a fix is to wait out the lifetime in every client that holds it.

Fix: Add a version to the URL, or shorten the lifetime to minutes.

Reached by: patterns/asset-cache-headers.

### document-cached-too-long

Severities: error.

A storefront document is cached beyond its ceiling.

A cached HTML document serves a stale cart, a stale price and a stale stock count, and the shopper has no way to clear it.

Fix: Keep the document lifetime short and cache the assets instead.

Reached by: patterns/asset-cache-headers.

### text-asset-not-compressed

Severities: error.

A text asset is served without compression.

Compression removes roughly two thirds of a script or stylesheet. An uncompressed response is the cheapest large saving available anywhere in a page.

Fix: Enable compression for textual content types at the edge.

Reached by: patterns/asset-cache-headers.

### compressed-without-vary

Severities: warn.

A compressed response does not vary on the encoding.

A shared cache that stores one compressed copy without the varying header can hand it to a client that did not ask for it, which is served as unreadable bytes.

Fix: Add the varying header naming the encoding request header.

Reached by: patterns/compression-and-cookies.

### set-cookie-on-asset

Severities: warn.

A static asset response sets a cookie.

Most shared caches refuse to store a response that sets a cookie, so the asset is fetched from the origin every time while appearing to be cacheable.

Fix: Stop setting cookies on asset paths at the edge.

Reached by: patterns/compression-and-cookies.

### cache-headers-conflict

Severities: error.

Two cache headers on one response disagree.

When the directives disagree the client picks one and the shared cache may pick the other, so the same file has two lifetimes depending on who is asked.

Fix: Send one cache header and derive everything else from it.

Reached by: patterns/conflicting-cache.

## Theme settings and shipped weight

settings, 7 findings.

### setting-enabled-for-absent-section

Severities: warn.

A setting is switched on for a section no template renders.

The setting still carries its cost in the theme, and a later reader cannot tell whether the feature is used, so nobody ever turns it off.

Fix: Switch the setting off, or remove it with the section it belonged to.

Reached by: patterns/theme-settings-dead-feature.

### setting-loads-unused-library

Severities: error.

A switched on setting pulls in a library nothing uses.

A setting that loads a library is the most expensive kind of dead code, because the file is downloaded, parsed and run on every page for a feature that is not on the page.

Fix: Switch the setting off, and gate the library on the feature rather than on the setting.

Reached by: patterns/theme-settings-dead-feature.

### settings-data-oversized

Severities: notice.

The theme settings file is very large.

The settings file is read on every render. Size on its own is not a defect, but past a point it is a reliable sign of sections and presets nobody removed.

Fix: Remove the presets and section blocks the live templates do not use.

Reached by: fixtures/settings-bloat.json.

### asset-unreferenced

Severities: notice.

An asset is referenced by nothing.

An unreferenced asset is not served, so it costs nothing at run time. It costs a reader time, and it hides the files that are actually used.

Fix: Delete it, or reference it from the template that needs it.

Reached by: patterns/asset-manifest-weight.

### asset-sourcemap-shipped

Severities: warn.

A source map is shipped in the theme assets.

A source map is a public file that holds the unminified source, and it is downloaded by anybody who opens developer tools on the storefront.

Fix: Keep source maps out of the published theme, or host them where only you can read them.

Reached by: patterns/asset-manifest-weight.

### asset-unminified-twin

Severities: warn.

Both the minified and the unminified build of an asset are referenced.

Referencing both means both are downloaded and both are run, so the page pays twice and the second definition wins.

Fix: Reference the minified build and keep the source out of the theme.

Reached by: patterns/asset-manifest-weight.

### asset-manifest-total-over-budget

Severities: error.

The total script weight is over its budget.

A per file limit is easy to pass while the total grows, and the total is what a shopper waits for. A budget that is never checked is not a budget.

Fix: Remove or defer enough script to come back inside the total, and check the total in CI.

Reached by: patterns/asset-manifest-weight.

## Storefront JavaScript cost

storefront-js, 8 findings.

### cart-endpoint-polled

Severities: error.

A cart endpoint is polled on a timer.

Polling the cart keeps the main thread and the network busy for the whole visit, and the data it fetches changes only when the shopper acts.

Fix: Update the cart from the response to the action that changed it.

Reached by: patterns/cart-polling.

### search-input-without-debounce

Severities: error.

A search field issues a request on every keystroke.

Typing eight characters sends eight requests, the responses arrive out of order, and the slowest one usually wins the render.

Fix: Debounce the handler and cancel the request in flight.

Reached by: patterns/predictive-search.

### fetch-without-abort

Severities: warn.

A repeated request has no way to be cancelled.

Without a cancellation signal an earlier response can land after a later one and overwrite it, and the work continues after the shopper has moved on.

Fix: Create an abort controller per call and cancel the previous one.

Reached by: patterns/cart-polling, patterns/predictive-search.

### full-page-fetch-for-section

Severities: warn.

A whole page is fetched to update one section.

Fetching a full page and parsing it to take one fragment out downloads the entire document, including every other section on it.

Fix: Request the section through the section rendering query instead.

Reached by: patterns/section-rendering.

### listener-not-passive

Severities: warn.

A scroll or touch listener is not passive.

The browser has to wait for a non passive handler to finish before it can scroll, so one slow handler makes the whole page feel stuck.

Fix: Pass the passive option on listeners that do not cancel the event.

Reached by: patterns/scroll-handler.

### layout-read-after-write-in-handler

Severities: error.

A handler reads layout after writing style.

Reading a layout property after a style write forces the browser to lay the page out again before the handler can continue, once per iteration.

Fix: Read everything first, then write, and keep the two apart.

Reached by: patterns/scroll-handler.

### dom-query-in-loop

Severities: notice.

A DOM query runs inside a loop.

The query walks the document on every iteration to find something that has not moved.

Fix: Query once above the loop.

Reached by: patterns/dom-query-loop.

### resize-handler-without-throttle

Severities: warn.

A resize handler is not throttled.

A resize gesture fires continuously, so an unthrottled handler runs dozens of times a second while the window is being dragged.

Fix: Throttle the handler, or move the work to an element size observer.

Reached by: patterns/scroll-handler.

