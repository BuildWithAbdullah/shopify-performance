// The pattern pairs.
//
// Every pair declares the EXACT set of id@severity tokens each side produces,
// and test/pairs.test.mjs compares both sides in both directions. An inclusion
// assertion would hide, by construction, every false positive the corrected
// side triggers, so the exact set is the whole point of this file.
//
// `residual` is the exact set the corrected side still produces on purpose. It
// is almost always empty. Where it is not, the reason is written down, because
// a reader has to be able to tell a deliberate leftover from a defect.

export const PAIRS = [
  {
    slug: 'head-script-blocking',
    ext: 'html',
    area: 'scripts',
    expected: ['preconnect-missing-for-script-host@notice', 'script-blocking-in-head@error'],
    residual: [],
    note: 'A third party review widget loaded in the head with no loading attribute.'
  },
  {
    slug: 'theme-asset-blocking',
    ext: 'html',
    area: 'scripts',
    expected: ['script-blocking-in-head@warn'],
    residual: [],
    note: 'The same shape with a theme asset, which is the second severity the entry declares.'
  },
  {
    slug: 'duplicate-app-tag',
    ext: 'html',
    area: 'scripts',
    expected: ['script-duplicate-source@warn'],
    residual: [],
    note: 'An app tag left in the theme after the app started injecting its own.'
  },
  {
    slug: 'vendor-library-twice',
    ext: 'html',
    area: 'scripts',
    expected: ['preconnect-missing-for-script-host@notice', 'script-library-duplicated@error'],
    residual: ['preconnect-missing-for-script-host@notice'],
    note: 'Two copies of one library family. The corrected side keeps the connection hint notice on purpose: this pair is about the duplicate copy, and the remaining third party host still has no hint, which is a separate decision taken in another pair.'
  },
  {
    slug: 'inline-head-script',
    ext: 'html',
    area: 'scripts',
    expected: ['script-inline-large-in-head@warn'],
    residual: [],
    note: 'A feature detection block that grew past the budget for inline head script.'
  },
  {
    slug: 'parked-script',
    ext: 'html',
    area: 'scripts',
    expected: ['script-parked-without-activation@notice'],
    residual: [],
    note: 'A chat widget parked behind a non executable type with nothing that ever starts it.'
  },
  {
    slug: 'collection-loop-limit',
    ext: 'liquid',
    area: 'liquid',
    expected: [
      'liquid-deprecated-img-url@notice',
      'liquid-image-url-without-width@warn',
      'liquid-loop-without-limit@error',
      'liquid-metafield-in-loop@warn'
    ],
    residual: [],
    note: 'The default product grid: unbounded loop, a metafield read per product, and the original upload served as a thumbnail.'
  },
  {
    slug: 'nested-collection-loop',
    ext: 'liquid',
    area: 'liquid',
    expected: ['liquid-loop-without-limit@error', 'liquid-nested-collection-loop@error'],
    residual: [],
    note: 'A collection list that renders every product of every collection.'
  },
  {
    slug: 'all-products-loop',
    ext: 'liquid',
    area: 'liquid',
    expected: ['liquid-all-products-iteration@error'],
    residual: [],
    note: 'A new arrivals shelf built by filtering the whole catalogue in the template.'
  },
  {
    slug: 'product-count',
    ext: 'liquid',
    area: 'liquid',
    expected: ['liquid-products-size-for-count@warn'],
    residual: [],
    note: 'A count taken by loading the products in order to size the list.'
  },
  {
    slug: 'paginate-size',
    ext: 'liquid',
    area: 'liquid',
    expected: ['liquid-paginate-oversized@warn'],
    residual: [],
    note: 'A page size above the documented maximum, which is clamped rather than refused.'
  },
  {
    slug: 'snippet-include-in-loop',
    ext: 'liquid',
    area: 'liquid',
    expected: [
      'liquid-include-in-loop@warn',
      'liquid-invariant-assign-in-loop@notice',
      'liquid-sort-in-loop@warn'
    ],
    residual: [],
    note: 'Three kinds of repeated work in one loop body.'
  },
  {
    slug: 'hero-image-priority',
    ext: 'html',
    area: 'assets',
    expected: [
      'image-hero-lazy@error',
      'image-missing-lazy@warn',
      'image-without-dimensions@warn',
      'image-without-srcset@notice'
    ],
    residual: [],
    note: 'A theme that added lazy loading to every image at once, including the one the metric measures.'
  },
  {
    slug: 'font-face-head',
    ext: 'html',
    area: 'assets',
    expected: ['font-face-without-display@warn', 'font-not-preloaded@notice'],
    residual: [],
    note: 'An inline face with no display descriptor and no preload, so the text is invisible until the font arrives.'
  },
  {
    slug: 'font-preload-stale',
    ext: 'html',
    area: 'assets',
    expected: ['font-preload-unused@warn'],
    residual: [],
    note: 'A preload left behind by a font change that nobody finished.'
  },
  {
    slug: 'stylesheet-import',
    ext: 'css',
    area: 'critical-path',
    expected: ['css-import-chained@error'],
    residual: [],
    note: 'A reset imported from inside the theme stylesheet, which the parser cannot discover early.'
  },
  {
    slug: 'preload-hints',
    ext: 'html',
    area: 'critical-path',
    expected: ['preload-as-mismatch@error', 'preload-missing-as@error'],
    residual: [],
    note: 'One hint with no kind and one whose kind disagrees with the file, so both resources are fetched twice.'
  },
  {
    slug: 'connection-hints',
    ext: 'html',
    area: 'critical-path',
    expected: ['preconnect-excessive@warn'],
    residual: [],
    note: 'Five held connections for a first screen that needs two.'
  },
  {
    slug: 'blocking-stylesheets',
    ext: 'html',
    area: 'critical-path',
    expected: ['prefetch-of-critical-resource@warn', 'stylesheet-count-in-head-excessive@warn'],
    residual: [],
    note: 'Four blocking stylesheets, one of which is also marked for the next navigation.'
  },
  {
    slug: 'asset-cache-headers',
    ext: 'headers',
    area: 'caching',
    expected: [
      'asset-short-cache@warn',
      'document-cached-too-long@error',
      'text-asset-not-compressed@error',
      'unfingerprinted-asset-long-cache@error'
    ],
    residual: [],
    note: 'Four cache mistakes in one capture, including a storefront document cached for an hour.'
  },
  {
    slug: 'compression-and-cookies',
    ext: 'headers',
    area: 'caching',
    expected: ['compressed-without-vary@warn', 'set-cookie-on-asset@warn'],
    residual: [],
    note: 'Two ways to make a shared cache refuse a response that looks cacheable.'
  },
  {
    slug: 'conflicting-cache',
    ext: 'headers',
    area: 'caching',
    expected: ['cache-headers-conflict@error'],
    residual: [],
    note: 'Two cache headers that disagree, and an expiry in the past beside a year long lifetime.'
  },
  {
    slug: 'asset-manifest-weight',
    ext: 'json',
    area: 'settings',
    expected: [
      'asset-manifest-total-over-budget@error',
      'asset-oversized-image@warn',
      'asset-sourcemap-shipped@warn',
      'asset-unminified-twin@warn',
      'asset-unreferenced@notice'
    ],
    residual: [],
    note: 'A theme assets directory nobody has pruned since launch.'
  },
  {
    slug: 'theme-settings-dead-feature',
    ext: 'json',
    area: 'settings',
    expected: ['setting-enabled-for-absent-section@warn', 'setting-loads-unused-library@error'],
    residual: [],
    note: 'Two settings switched on for sections the live templates no longer render.'
  },
  {
    slug: 'script-tag-inventory',
    ext: 'json',
    area: 'scripts',
    expected: ['script-tag-api-scope-too-wide@warn', 'script-tag-api-stale-app@error'],
    residual: [],
    note: 'An injected script that runs everywhere to serve one page, and one left behind by an uninstalled app.'
  },
  {
    slug: 'cart-polling',
    ext: 'js',
    area: 'storefront-js',
    expected: ['cart-endpoint-polled@error', 'fetch-without-abort@warn'],
    residual: [],
    note: 'A cart badge kept current by asking the server every five seconds.'
  },
  {
    slug: 'predictive-search',
    ext: 'js',
    area: 'storefront-js',
    expected: ['fetch-without-abort@warn', 'search-input-without-debounce@error'],
    residual: [],
    note: 'One request per keystroke, with the responses allowed to land in any order.'
  },
  {
    slug: 'section-rendering',
    ext: 'js',
    area: 'storefront-js',
    expected: ['full-page-fetch-for-section@warn'],
    residual: [],
    note: 'A cart drawer refreshed by downloading the whole page and throwing most of it away.'
  },
  {
    slug: 'scroll-handler',
    ext: 'js',
    area: 'storefront-js',
    expected: [
      'layout-read-after-write-in-handler@error',
      'listener-not-passive@warn',
      'resize-handler-without-throttle@warn'
    ],
    residual: [],
    note: 'A sticky header that forces a layout on every scroll event.'
  },
  {
    slug: 'sync-xhr',
    ext: 'js',
    area: 'scripts',
    expected: ['script-document-write@error', 'script-sync-xhr@error'],
    residual: [],
    note: 'A recommendations loader that freezes the tab and then writes into the parser.'
  },
  {
    slug: 'dom-query-loop',
    ext: 'js',
    area: 'storefront-js',
    expected: ['dom-query-in-loop@notice'],
    residual: [],
    note: 'A variant label loop that walks the document once per variant.'
  }
];

export const PAIR_SLUGS = PAIRS.map((p) => p.slug);

export function pairFiles(pair) {
  return {
    before: 'patterns/' + pair.slug + '.before.' + pair.ext,
    after: 'patterns/' + pair.slug + '.after.' + pair.ext
  };
}
