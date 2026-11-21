// Every number a check compares against lives here, with the reason it is that
// number. A threshold with no reason written beside it is an opinion, and the
// README says so.

export const THRESHOLDS = {
  // Inline script in the head is parsed before the body is seen and is paid
  // for on every navigation. Two kilobytes is about the size of a feature
  // detection block, which is the only thing that belongs there.
  inlineScriptHeadBytes: 2048,
  // An inline critical style block past ten kilobytes costs more than the
  // round trip it replaces on a connection a phone actually has.
  inlineStyleHeadBytes: 10240,
  // Each connection hint holds a real connection open. Four is the number of
  // hosts a storefront first screen can plausibly need.
  preconnectMax: 4,
  // Three blocking stylesheets is a theme stylesheet, a vendor stylesheet and
  // one template stylesheet. A fourth is almost always a leftover.
  blockingStylesheetsMax: 3,
  // Images at this position in document order and later are treated as below
  // the first screen. It is a heuristic over document order, not a measurement,
  // and the limit that follows from it is declared in tools/limits.mjs.
  foldImageIndex: 3,
  // The documented maximum page size for the pagination tag. A larger value is
  // clamped rather than refused.
  paginateMax: 50,
  // An image committed to the theme is served unresized, so 200 kilobytes is
  // already generous for anything that is not a full width hero.
  assetImageBytes: 204800,
  // Past a hundred kilobytes the settings file is reliably carrying presets
  // and section blocks that no live template renders.
  settingsDataBytes: 102400,
  // Three hundred kilobytes of script, compressed, is roughly one second of
  // parse and compile on a mid range phone.
  scriptTotalBudget: 307200,
  // A fingerprinted URL can be cached for a year. Thirty days is the floor
  // below which a returning shopper revalidates a file that cannot change.
  assetLongCacheSeconds: 2592000,
  // A stable URL cached for a day or more cannot be fixed inside that day.
  unfingerprintedCacheCeiling: 86400,
  // A storefront document holds the cart, the price and the stock count.
  documentMaxAgeCeiling: 60
};

// Families of libraries that are routinely loaded twice, once by the theme and
// once by an app. The patterns match a file name, not a host, because the same
// file is served from several content delivery networks.
export const LIBRARY_FAMILIES = [
  { family: 'jquery', pattern: /(^|[/-])jquery([.-]|$)/i },
  { family: 'lodash', pattern: /(^|[/-])lodash([.-]|$)/i },
  { family: 'swiper', pattern: /(^|[/-])swiper([.-]|$)/i },
  { family: 'gsap', pattern: /(^|[/-])gsap([.-]|$)/i }
];

export const PRELOAD_AS_EXTENSIONS = {
  script: ['js', 'mjs'],
  style: ['css'],
  font: ['woff2', 'woff', 'ttf', 'otf'],
  image: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'svg'],
  fetch: ['json', 'js', 'mjs'],
  document: ['html'],
  audio: ['mp3', 'ogg', 'wav'],
  video: ['mp4', 'webm']
};

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif'];
