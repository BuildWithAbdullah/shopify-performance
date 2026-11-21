// Hosts the examples in this repository are allowed to name.
//
// Everything in the corpus either uses a reserved documentation domain, a name
// under the reserved .test top level domain, or one of the public platform
// hosts listed here, which are named because a check has to recognise them.
// test/purity.test.mjs asserts that, so a client domain cannot reach a commit.

export const PLATFORM_HOSTS = [
  'cdn.shopify.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

export const EXAMPLE_SUFFIXES = ['example.com', 'example.net', 'example.org'];

export function hostOf(url) {
  const text = String(url).trim();
  if (!text) return '';
  let rest = text;
  if (rest.startsWith('//')) rest = rest.slice(2);
  else {
    const scheme = rest.match(/^[a-z][a-z0-9+.-]*:\/\//i);
    if (!scheme) return '';
    rest = rest.slice(scheme[0].length);
  }
  const stop = rest.search(/[/?#]/);
  const authority = stop === -1 ? rest : rest.slice(0, stop);
  const at = authority.lastIndexOf('@');
  const hostport = at === -1 ? authority : authority.slice(at + 1);
  return hostport.split(':')[0].toLowerCase();
}

export function isPlatformHost(host) {
  return PLATFORM_HOSTS.includes(String(host).toLowerCase());
}

// A theme asset: either a relative URL, or one served from the platform asset
// host. Both are the store's own weight rather than a third party connection.
export function isOwnAsset(url) {
  const host = hostOf(url);
  if (!host) return true;
  return host === 'cdn.shopify.com';
}

export function isAllowedExampleHost(host) {
  const lower = String(host).toLowerCase();
  if (!lower) return true;
  if (isPlatformHost(lower)) return true;
  if (lower === 'localhost' || lower.endsWith('.localhost')) return true;
  if (lower === 'test' || lower.endsWith('.test')) return true;
  for (const suffix of EXAMPLE_SUFFIXES) {
    if (lower === suffix || lower.endsWith('.' + suffix)) return true;
  }
  return false;
}
