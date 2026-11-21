import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audit, tokens, auditOne, kindFor, extensionsFor, KINDS, CHECKS } from '../src/audit.mjs';

function run(kind, source) {
  return tokens(audit([{ kind, path: 'inline', source }]).findings);
}

function page(head, body = '<h1>x</h1>') {
  return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>t</title>\n' +
    head + '\n</head>\n<body>\n' + body + '\n</body>\n</html>\n';
}

test('a third party script in the head with no loading attribute is an error', () => {
  const found = run('page', page('<script src="https://widget.example.net/a.js"></script>'));
  assert.deepStrictEqual(found, ['preconnect-missing-for-script-host@notice', 'script-blocking-in-head@error']);
});

test('a theme asset in the same position is a warning', () => {
  const found = run('page', page('<script src="/assets/theme.js"></script>'));
  assert.deepStrictEqual(found, ['script-blocking-in-head@warn']);
});

test('the platform asset host counts as a theme asset', () => {
  const found = run('page', page('<script src="https://cdn.shopify.com/s/files/a.js"></script>'));
  assert.deepStrictEqual(found, ['script-blocking-in-head@warn']);
});

test('a deferred script in the head is not a blocking script', () => {
  const found = run('page', page('<script src="/assets/theme.js" defer></script>'));
  assert.deepStrictEqual(found, []);
});

test('an asynchronous script in the head is not a blocking script', () => {
  const found = run('page', page('<script src="/assets/theme.js" async></script>'));
  assert.deepStrictEqual(found, []);
});

test('a module script in the head is deferred by the browser and is not reported', () => {
  const found = run('page', page('<script src="/assets/theme.js" type="module"></script>'));
  assert.deepStrictEqual(found, []);
});

test('a script at the end of the body is not in the head', () => {
  const found = run('page', page('', '<h1>x</h1>\n<script src="/assets/theme.js"></script>'));
  assert.deepStrictEqual(found, []);
});

test('the same source loaded twice is a duplicate', () => {
  const found = run('page', page(
    '<link rel="preconnect" href="https://widget.example.net">\n' +
    '<script src="https://widget.example.net/a.js" defer></script>\n' +
    '<script src="https://widget.example.net/a.js" defer></script>'
  ));
  assert.deepStrictEqual(found, ['script-duplicate-source@warn']);
});

test('the same path on two hosts is not a duplicate source', () => {
  const found = run('page', page(
    '<link rel="preconnect" href="https://widget.example.net">\n' +
    '<link rel="preconnect" href="https://reviews.example.org">\n' +
    '<script src="https://widget.example.net/a.js" defer></script>\n' +
    '<script src="https://reviews.example.org/a.js" defer></script>'
  ));
  assert.deepStrictEqual(found, []);
});

test('the same source with a different query is still the same source', () => {
  const found = run('page', page(
    '<link rel="preconnect" href="https://widget.example.net">\n' +
    '<script src="https://widget.example.net/a.js?v=1" defer></script>\n' +
    '<script src="https://widget.example.net/a.js?v=2" defer></script>'
  ));
  assert.deepStrictEqual(found, ['script-duplicate-source@warn']);
});

test('two copies of one library family are an error', () => {
  const found = run('page', page(
    '<link rel="preconnect" href="https://cdn.example.com">\n' +
    '<script src="https://cdn.example.com/jquery-3.7.1.min.js" defer></script>\n' +
    '<script src="/assets/jquery.min.js" defer></script>'
  ));
  assert.deepStrictEqual(found, ['script-library-duplicated@error']);
});

test('one copy of a library is not a duplicate', () => {
  const found = run('page', page('<script src="/assets/jquery.min.js" defer></script>'));
  assert.deepStrictEqual(found, []);
});

test('two different library families are not duplicates of each other', () => {
  const found = run('page', page(
    '<script src="/assets/jquery.min.js" defer></script>\n' +
    '<script src="/assets/swiper.min.js" defer></script>'
  ));
  assert.deepStrictEqual(found, []);
});

test('a short inline script in the head is not reported', () => {
  const found = run('page', page('<script>window.theme = {};</script>'));
  assert.deepStrictEqual(found, []);
});

test('an inline script in the head past the budget is a warning', () => {
  const filler = 'window.theme = window.theme || {};\n'.repeat(80);
  const found = run('page', page('<script>\n' + filler + '</script>'));
  assert.deepStrictEqual(found, ['script-inline-large-in-head@warn']);
});

test('a large inline script in the body is not reported', () => {
  const filler = 'window.theme = window.theme || {};\n'.repeat(80);
  const found = run('page', page('', '<script>\n' + filler + '</script>'));
  assert.deepStrictEqual(found, []);
});

test('a large inline template in the head is not read as script', () => {
  const filler = '<li>item</li>\n'.repeat(200);
  const found = run('page', page('<script type="text/template">\n' + filler + '</script>'));
  assert.deepStrictEqual(found, ['script-parked-without-activation@notice']);
});

test('a parked script with no activation is a notice', () => {
  const found = run('page', page('', '<script type="text/plain" data-src="https://widget.example.net/a.js"></script>'));
  assert.deepStrictEqual(found, ['script-parked-without-activation@notice']);
});

test('a parked script with activation code present is not reported', () => {
  const found = run('page', page('', [
    '<script type="text/plain" data-src="https://widget.example.net/a.js"></script>',
    '<script>var n = document.createElement("script"); n.src = "x";</script>'
  ].join('\n')));
  assert.deepStrictEqual(found, []);
});

test('a synchronous request is an error', () => {
  const found = run('asset-js', 'const r = new XMLHttpRequest();\nr.open("GET", "/a.json", false);\nr.send();\n');
  assert.deepStrictEqual(found, ['script-sync-xhr@error']);
});

test('an asynchronous request with an explicit true is not reported', () => {
  const found = run('asset-js', 'const r = new XMLHttpRequest();\nr.open("GET", "/a.json", true);\nr.send();\n');
  assert.deepStrictEqual(found, []);
});

test('a two argument open is not reported', () => {
  const found = run('asset-js', 'const r = new XMLHttpRequest();\nr.open("GET", "/a.json");\n');
  assert.deepStrictEqual(found, []);
});

test('writing markup into the parser is an error', () => {
  const found = run('asset-js', 'document.write("<p>x</p>");\n');
  assert.deepStrictEqual(found, ['script-document-write@error']);
});

test('a write on something that is not the document is not reported', () => {
  const found = run('asset-js', 'stream.write("x");\n');
  assert.deepStrictEqual(found, []);
});

test('a document write written inside a string is not a call', () => {
  const found = run('asset-js', 'const warning = "document.write(1)";\n');
  assert.deepStrictEqual(found, []);
});

test('an injected script serving the order status page everywhere is a warning', () => {
  const source = JSON.stringify({
    shopify_perf_input: 'script-tags',
    script_tags: [{ src: 'https://widget.example.net/a.js', display_scope: 'all', purpose: 'Order status page tracking' }]
  });
  assert.deepStrictEqual(run('config', source), ['script-tag-api-scope-too-wide@warn']);
});

test('an injected script already narrowed to the order status page is not reported', () => {
  const source = JSON.stringify({
    shopify_perf_input: 'script-tags',
    script_tags: [{ src: 'https://widget.example.net/a.js', display_scope: 'order_status', purpose: 'Order status page tracking' }]
  });
  assert.deepStrictEqual(run('config', source), []);
});

test('an injected script for an uninstalled app is an error', () => {
  const source = JSON.stringify({
    shopify_perf_input: 'script-tags',
    script_tags: [{ src: 'https://analytics.example.com/a.js', display_scope: 'online_store', purpose: 'Analytics', app_installed: false }]
  });
  assert.deepStrictEqual(run('config', source), ['script-tag-api-stale-app@error']);
});

test('a product loop with no limit is an error', () => {
  assert.deepStrictEqual(run('liquid', '{% for p in collection.products %}{{ p.title }}{% endfor %}'), ['liquid-loop-without-limit@error']);
});

test('a product loop with a limit is not reported', () => {
  assert.deepStrictEqual(run('liquid', '{% for p in collection.products limit: 8 %}{{ p.title }}{% endfor %}'), []);
});

test('a loop over something that is not products is not reported', () => {
  assert.deepStrictEqual(run('liquid', '{% for block in section.blocks %}{{ block.id }}{% endfor %}'), []);
});

test('a loop over collections containing a product loop is an error', () => {
  const found = run('liquid', '{% for c in collections %}{% for p in c.products limit: 4 %}{{ p.title }}{% endfor %}{% endfor %}');
  assert.deepStrictEqual(found, ['liquid-nested-collection-loop@error']);
});

test('a product loop with no collection loop around it is not a nested loop', () => {
  const found = run('liquid', '{% for p in collection.products limit: 4 %}{{ p.title }}{% endfor %}');
  assert.deepStrictEqual(found, []);
});

test('a metafield read inside a loop is a warning', () => {
  const found = run('liquid', '{% for p in collection.products limit: 4 %}{{ p.metafields.specs.weight }}{% endfor %}');
  assert.deepStrictEqual(found, ['liquid-metafield-in-loop@warn']);
});

test('a metafield read outside a loop is not reported', () => {
  assert.deepStrictEqual(run('liquid', '{{ collection.metafields.specs.weight }}'), []);
});

test('a metafield assigned inside a loop is still a metafield read inside a loop', () => {
  const found = run('liquid', '{% for p in collection.products limit: 4 %}{% assign w = p.metafields.specs.weight %}{% endfor %}');
  assert.deepStrictEqual(found, ['liquid-metafield-in-loop@warn']);
});

test('iterating the whole catalogue is an error and not a missing limit', () => {
  assert.deepStrictEqual(run('liquid', '{% for p in collections.all.products %}{{ p.title }}{% endfor %}'), ['liquid-all-products-iteration@error']);
});

test('a named collection is not the whole catalogue', () => {
  assert.deepStrictEqual(run('liquid', "{% for p in collections['new'].products limit: 4 %}{{ p.title }}{% endfor %}"), []);
});

test('counting by sizing the product list is a warning', () => {
  assert.deepStrictEqual(run('liquid', '{{ collection.products | size }}'), ['liquid-products-size-for-count@warn']);
});

test('the dotted size form is also reported', () => {
  assert.deepStrictEqual(run('liquid', '{{ collection.products.size }}'), ['liquid-products-size-for-count@warn']);
});

test('the count property is not reported', () => {
  assert.deepStrictEqual(run('liquid', '{{ collection.all_products_count }}'), []);
});

test('sizing something that is not a product list is not reported', () => {
  assert.deepStrictEqual(run('liquid', '{{ section.blocks | size }}'), []);
});

test('a page size above the maximum is a warning', () => {
  assert.deepStrictEqual(run('liquid', '{% paginate collection.products by 100 %}{% endpaginate %}'), ['liquid-paginate-oversized@warn']);
});

test('a page size at the maximum is not reported', () => {
  assert.deepStrictEqual(run('liquid', '{% paginate collection.products by 50 %}{% endpaginate %}'), []);
});

test('the deprecated include inside a loop is a warning', () => {
  const found = run('liquid', '{% for p in collection.products limit: 4 %}{% include "card" %}{% endfor %}');
  assert.deepStrictEqual(found, ['liquid-include-in-loop@warn']);
});

test('the render tag inside a loop is not reported', () => {
  const found = run('liquid', '{% for p in collection.products limit: 4 %}{% render "card", product: p %}{% endfor %}');
  assert.deepStrictEqual(found, []);
});

test('an include outside a loop is not reported', () => {
  assert.deepStrictEqual(run('liquid', '{% include "card" %}'), []);
});

test('an assignment in a loop that ignores the loop variable is a notice', () => {
  const found = run('liquid', '{% for p in collection.products limit: 4 %}{% assign c = cart.currency.symbol %}{% endfor %}');
  assert.deepStrictEqual(found, ['liquid-invariant-assign-in-loop@notice']);
});

test('an assignment that uses the loop variable is not reported', () => {
  const found = run('liquid', '{% for p in collection.products limit: 4 %}{% assign t = p.title %}{% endfor %}');
  assert.deepStrictEqual(found, []);
});

test('an assignment that uses the loop object is not reported', () => {
  const found = run('liquid', '{% for p in collection.products limit: 4 %}{% assign i = forloop.index %}{% endfor %}');
  assert.deepStrictEqual(found, []);
});

test('an accumulator reset with a plain value is not reported', () => {
  const found = run('liquid', '{% for p in collection.products limit: 4 %}{% assign total = 0 %}{% endfor %}');
  assert.deepStrictEqual(found, []);
});

test('a sort inside a loop is a warning', () => {
  const found = run('liquid', "{% for p in collection.products limit: 4 %}{{ collection.products | sort: 'price' }}{% endfor %}");
  assert.deepStrictEqual(found, ['liquid-sort-in-loop@warn']);
});

test('a sort outside a loop is not reported', () => {
  assert.deepStrictEqual(run('liquid', "{% assign s = collection.products | sort: 'price' %}"), []);
});

test('an image url with no width is a warning', () => {
  assert.deepStrictEqual(run('liquid', '{{ p.featured_image | image_url }}'), ['liquid-image-url-without-width@warn']);
});

test('an image url with a width is not reported', () => {
  assert.deepStrictEqual(run('liquid', '{{ p.featured_image | image_url: width: 400 }}'), []);
});

test('the deprecated image filter with no size is both a notice and a width warning', () => {
  const found = run('liquid', '{{ p.featured_image | img_url }}');
  assert.deepStrictEqual(found, ['liquid-deprecated-img-url@notice', 'liquid-image-url-without-width@warn']);
});

test('the deprecated image filter with a size is only the deprecation notice', () => {
  assert.deepStrictEqual(run('liquid', "{{ p.featured_image | img_url: '400x400' }}"), ['liquid-deprecated-img-url@notice']);
});

test('an image with no width or height is a warning', () => {
  const found = run('page', page('', '<img src="/a.jpg" alt="A" srcset="/a-1.jpg 1w">'));
  assert.deepStrictEqual(found, ['image-without-dimensions@warn']);
});

test('an image with both is not reported', () => {
  const found = run('page', page('', '<img src="/a.jpg" alt="A" width="10" height="10" srcset="/a-1.jpg 1w">'));
  assert.deepStrictEqual(found, []);
});

test('an image sized by an aspect ratio in a style attribute is not reported', () => {
  const found = run('page', page('', '<img src="/a.jpg" alt="A" style="aspect-ratio: 1 / 1" srcset="/a-1.jpg 1w">'));
  assert.deepStrictEqual(found, []);
});

test('an image with only a width is still missing its size', () => {
  const found = run('page', page('', '<img src="/a.jpg" alt="A" width="10" srcset="/a-1.jpg 1w">'));
  assert.deepStrictEqual(found, ['image-without-dimensions@warn']);
});

test('the first image marked lazy is an error', () => {
  const found = run('page', page('', '<img src="/a.jpg" alt="A" width="10" height="10" srcset="/a-1.jpg 1w" loading="lazy">'));
  assert.deepStrictEqual(found, ['image-hero-lazy@error']);
});

test('the first image loading eagerly is not reported', () => {
  const found = run('page', page('', '<img src="/a.jpg" alt="A" width="10" height="10" srcset="/a-1.jpg 1w">'));
  assert.deepStrictEqual(found, []);
});

test('an image past the fold loading eagerly is a warning', () => {
  const img = (n, extra) => '<img src="/' + n + '.jpg" alt="' + n + '" width="10" height="10" srcset="/' + n + '-1.jpg 1w"' + extra + '>';
  const found = run('page', page('', [img('a', ''), img('b', ''), img('c', ''), img('d', '')].join('\n')));
  assert.deepStrictEqual(found, ['image-missing-lazy@warn']);
});

test('an image past the fold marked lazy is not reported', () => {
  const img = (n, extra) => '<img src="/' + n + '.jpg" alt="' + n + '" width="10" height="10" srcset="/' + n + '-1.jpg 1w"' + extra + '>';
  const found = run('page', page('', [img('a', ''), img('b', ''), img('c', ''), img('d', ' loading="lazy"')].join('\n')));
  assert.deepStrictEqual(found, []);
});

test('an image with one source is a notice', () => {
  const found = run('page', page('', '<img src="/a.jpg" alt="A" width="10" height="10">'));
  assert.deepStrictEqual(found, ['image-without-srcset@notice']);
});

test('an image whose source set is deferred to a data attribute is not reported', () => {
  const found = run('page', page('', '<img src="/a.jpg" alt="A" width="10" height="10" data-srcset="/a-1.jpg 1w">'));
  assert.deepStrictEqual(found, []);
});

test('a font face with no display descriptor is a warning', () => {
  const css = '@font-face { font-family: "A"; src: url("/a.woff2") format("woff2"); }';
  assert.deepStrictEqual(run('asset-css', css), ['font-face-without-display@warn']);
});

test('a font face with a display descriptor is not reported', () => {
  const css = '@font-face { font-family: "A"; src: url("/a.woff2") format("woff2"); font-display: swap; }';
  assert.deepStrictEqual(run('asset-css', css), []);
});

test('a font face offering no compressed format is a notice', () => {
  const css = '@font-face { font-family: "A"; src: url("/a.woff") format("woff"); font-display: swap; }';
  assert.deepStrictEqual(run('asset-css', css), ['font-face-without-woff2@notice']);
});

test('an inline face that is not preloaded is a notice', () => {
  const found = run('page', page('<style>@font-face { font-family: "A"; src: url("/a.woff2") format("woff2"); font-display: swap; }</style>'));
  assert.deepStrictEqual(found, ['font-not-preloaded@notice']);
});

test('an inline face that is preloaded is not reported', () => {
  const found = run('page', page(
    '<link rel="preload" href="/a.woff2" as="font" type="font/woff2" crossorigin>\n' +
    '<style>@font-face { font-family: "A"; src: url("/a.woff2") format("woff2"); font-display: swap; }</style>'
  ));
  assert.deepStrictEqual(found, []);
});

test('a font preload naming no face is a warning', () => {
  const found = run('page', page(
    '<link rel="preload" href="/old.woff2" as="font" type="font/woff2" crossorigin>\n' +
    '<link rel="preload" href="/a.woff2" as="font" type="font/woff2" crossorigin>\n' +
    '<style>@font-face { font-family: "A"; src: url("/a.woff2") format("woff2"); font-display: swap; }</style>'
  ));
  assert.deepStrictEqual(found, ['font-preload-unused@warn']);
});

test('an oversized theme image is a warning', () => {
  const source = JSON.stringify({
    shopify_perf_input: 'asset-manifest',
    assets: [{ path: 'assets/hero.jpg', bytes: 900000, referenced: true }]
  });
  assert.deepStrictEqual(run('config', source), ['asset-oversized-image@warn']);
});

test('a theme image inside the budget is not reported', () => {
  const source = JSON.stringify({
    shopify_perf_input: 'asset-manifest',
    assets: [{ path: 'assets/hero.jpg', bytes: 100000, referenced: true }]
  });
  assert.deepStrictEqual(run('config', source), []);
});

test('an oversized file that is not an image is not an oversized image', () => {
  const source = JSON.stringify({
    shopify_perf_input: 'asset-manifest',
    assets: [{ path: 'assets/notes.txt', bytes: 900000, referenced: true }]
  });
  assert.deepStrictEqual(run('config', source), []);
});

test('a stylesheet importing a stylesheet is an error', () => {
  assert.deepStrictEqual(run('asset-css', '@import url("/a.css");\nbody { color: red; }'), ['css-import-chained@error']);
});

test('a stylesheet with no import is not reported', () => {
  assert.deepStrictEqual(run('asset-css', 'body { color: red; }'), []);
});

test('an inline style block past the budget is a warning', () => {
  const filler = '.a { color: red; }\n'.repeat(700);
  assert.deepStrictEqual(run('page', page('<style>\n' + filler + '</style>')), ['inline-critical-css-oversized@warn']);
});

test('an inline style block inside the budget is not reported', () => {
  assert.deepStrictEqual(run('page', page('<style>.a { color: red; }</style>')), []);
});

test('a preload with no kind is an error', () => {
  assert.deepStrictEqual(run('page', page('<link rel="preload" href="/a.js">')), ['preload-missing-as@error']);
});

test('a preload whose kind disagrees with the file is an error', () => {
  assert.deepStrictEqual(run('page', page('<link rel="preload" href="/a.js" as="style">')), ['preload-as-mismatch@error']);
});

test('a preload whose kind agrees with the file is not reported', () => {
  assert.deepStrictEqual(run('page', page('<link rel="preload" href="/a.js" as="script">')), []);
});

test('a preload of a file with no extension is not judged on its kind', () => {
  assert.deepStrictEqual(run('page', page('<link rel="preload" href="/api/data" as="fetch">')), []);
});

test('a third party script host with no connection hint is a notice', () => {
  const found = run('page', page('<script src="https://widget.example.net/a.js" defer></script>'));
  assert.deepStrictEqual(found, ['preconnect-missing-for-script-host@notice']);
});

test('a dns prefetch counts as a connection hint', () => {
  const found = run('page', page(
    '<link rel="dns-prefetch" href="https://widget.example.net">\n' +
    '<script src="https://widget.example.net/a.js" defer></script>'
  ));
  assert.deepStrictEqual(found, []);
});

test('more connection hints than the budget is a warning', () => {
  const hints = ['a.example.com', 'b.example.com', 'c.example.com', 'd.example.com', 'e.example.com']
    .map((h) => '<link rel="preconnect" href="https://' + h + '">')
    .join('\n');
  assert.deepStrictEqual(run('page', page(hints)), ['preconnect-excessive@warn']);
});

test('connection hints at the budget are not reported', () => {
  const hints = ['a.example.com', 'b.example.com', 'c.example.com', 'd.example.com']
    .map((h) => '<link rel="preconnect" href="https://' + h + '">')
    .join('\n');
  assert.deepStrictEqual(run('page', page(hints)), []);
});

test('more blocking stylesheets than the budget is a warning', () => {
  const links = ['a', 'b', 'c', 'd'].map((n) => '<link rel="stylesheet" href="/' + n + '.css">').join('\n');
  assert.deepStrictEqual(run('page', page(links)), ['stylesheet-count-in-head-excessive@warn']);
});

test('a print stylesheet does not block and is not counted', () => {
  const links = ['a', 'b', 'c'].map((n) => '<link rel="stylesheet" href="/' + n + '.css">').join('\n') +
    '\n<link rel="stylesheet" href="/print.css" media="print">';
  assert.deepStrictEqual(run('page', page(links)), []);
});

test('a prefetch of a resource the page already uses is a warning', () => {
  const found = run('page', page(
    '<link rel="stylesheet" href="/a.css">\n<link rel="prefetch" href="/a.css">'
  ));
  assert.deepStrictEqual(found, ['prefetch-of-critical-resource@warn']);
});

test('a prefetch of a resource for the next page is not reported', () => {
  const found = run('page', page('<link rel="stylesheet" href="/a.css">\n<link rel="prefetch" href="/next.css">'));
  assert.deepStrictEqual(found, []);
});

test('a fingerprinted asset with a short lifetime is a warning', () => {
  const capture = '>>> GET /a.a1b2c3d4e5f6.js\n200\ncontent-type: text/javascript\ncontent-encoding: br\nvary: Accept-Encoding\ncache-control: public, max-age=600\n';
  assert.deepStrictEqual(run('headers', capture), ['asset-short-cache@warn']);
});

test('a fingerprinted asset with a long lifetime and immutable is not reported', () => {
  const capture = '>>> GET /a.a1b2c3d4e5f6.js\n200\ncontent-type: text/javascript\ncontent-encoding: br\nvary: Accept-Encoding\ncache-control: public, max-age=31536000, immutable\n';
  assert.deepStrictEqual(run('headers', capture), []);
});

test('a long lived asset without immutable is a notice', () => {
  const capture = '>>> GET /a.a1b2c3d4e5f6.js\n200\ncontent-type: text/javascript\ncontent-encoding: br\nvary: Accept-Encoding\ncache-control: public, max-age=31536000\n';
  assert.deepStrictEqual(run('headers', capture), ['asset-cache-not-immutable@notice']);
});

test('an unfingerprinted asset cached for a day is an error', () => {
  const capture = '>>> GET /a.js\n200\ncontent-type: text/javascript\ncontent-encoding: br\nvary: Accept-Encoding\ncache-control: public, max-age=86400\n';
  assert.deepStrictEqual(run('headers', capture), ['unfingerprinted-asset-long-cache@error']);
});

test('an unfingerprinted asset cached for minutes is not reported', () => {
  const capture = '>>> GET /a.js\n200\ncontent-type: text/javascript\ncontent-encoding: br\nvary: Accept-Encoding\ncache-control: public, max-age=300\n';
  assert.deepStrictEqual(run('headers', capture), []);
});

test('a document cached past the ceiling is an error', () => {
  const capture = '>>> GET /p\n200\ncontent-type: text/html\ncontent-encoding: br\nvary: Accept-Encoding\ncache-control: public, max-age=600\n';
  assert.deepStrictEqual(run('headers', capture), ['document-cached-too-long@error']);
});

test('a document cached at the ceiling is not reported', () => {
  const capture = '>>> GET /p\n200\ncontent-type: text/html\ncontent-encoding: br\nvary: Accept-Encoding\ncache-control: public, max-age=60\n';
  assert.deepStrictEqual(run('headers', capture), []);
});

test('a textual asset with no compression is an error', () => {
  const capture = '>>> GET /a.a1b2c3d4e5f6.css\n200\ncontent-type: text/css\ncache-control: public, max-age=31536000, immutable\n';
  assert.deepStrictEqual(run('headers', capture), ['text-asset-not-compressed@error']);
});

test('an image with no compression is not reported', () => {
  const capture = '>>> GET /a.a1b2c3d4e5f6.png\n200\ncontent-type: image/png\ncache-control: public, max-age=31536000, immutable\n';
  assert.deepStrictEqual(run('headers', capture), []);
});

test('a compressed response with no varying header is a warning', () => {
  const capture = '>>> GET /a.a1b2c3d4e5f6.css\n200\ncontent-type: text/css\ncontent-encoding: br\ncache-control: public, max-age=31536000, immutable\n';
  assert.deepStrictEqual(run('headers', capture), ['compressed-without-vary@warn']);
});

test('a varying header naming something else is still missing the encoding', () => {
  const capture = '>>> GET /a.a1b2c3d4e5f6.css\n200\ncontent-type: text/css\ncontent-encoding: br\nvary: Accept\ncache-control: public, max-age=31536000, immutable\n';
  assert.deepStrictEqual(run('headers', capture), ['compressed-without-vary@warn']);
});

test('a cookie on a static response is a warning', () => {
  const capture = '>>> GET /a.a1b2c3d4e5f6.png\n200\ncontent-type: image/png\ncache-control: public, max-age=31536000, immutable\nset-cookie: a=1; path=/\n';
  assert.deepStrictEqual(run('headers', capture), ['set-cookie-on-asset@warn']);
});

test('a cookie on a document is expected and not reported', () => {
  const capture = '>>> GET /p\n200\ncontent-type: text/html\ncontent-encoding: br\nvary: Accept-Encoding\ncache-control: public, max-age=0\nset-cookie: cart=1; path=/\n';
  assert.deepStrictEqual(run('headers', capture), []);
});

test('two cache headers that disagree are an error', () => {
  const capture = '>>> GET /a.a1b2c3d4e5f6.css\n200\ncontent-type: text/css\ncontent-encoding: br\nvary: Accept-Encoding\ncache-control: public, max-age=31536000, immutable\ncache-control: no-cache\n';
  assert.deepStrictEqual(run('headers', capture), ['cache-headers-conflict@error']);
});

test('two cache headers that differ only in spacing do not conflict', () => {
  const capture = '>>> GET /a.a1b2c3d4e5f6.css\n200\ncontent-type: text/css\ncontent-encoding: br\nvary: Accept-Encoding\ncache-control: public, max-age=31536000, immutable\ncache-control: PUBLIC,  max-age=31536000,  immutable\n';
  assert.deepStrictEqual(run('headers', capture), []);
});

test('an expiry in the past beside a long lifetime is an error', () => {
  const capture = '>>> GET /a.a1b2c3d4e5f6.css\n200\ncontent-type: text/css\ncontent-encoding: br\nvary: Accept-Encoding\ndate: Wed, 18 Nov 2026 12:00:00 GMT\nexpires: Tue, 17 Nov 2026 12:00:00 GMT\ncache-control: public, max-age=31536000, immutable\n';
  assert.deepStrictEqual(run('headers', capture), ['cache-headers-conflict@error']);
});

test('an expiry in the future beside a long lifetime is not a conflict', () => {
  const capture = '>>> GET /a.a1b2c3d4e5f6.css\n200\ncontent-type: text/css\ncontent-encoding: br\nvary: Accept-Encoding\ndate: Wed, 18 Nov 2026 12:00:00 GMT\nexpires: Thu, 18 Nov 2027 12:00:00 GMT\ncache-control: public, max-age=31536000, immutable\n';
  assert.deepStrictEqual(run('headers', capture), []);
});

test('a zero expiry beside a lifetime is an error', () => {
  const capture = '>>> GET /a.a1b2c3d4e5f6.css\n200\ncontent-type: text/css\ncontent-encoding: br\nvary: Accept-Encoding\nexpires: 0\ncache-control: public, max-age=31536000, immutable\n';
  assert.deepStrictEqual(run('headers', capture), ['cache-headers-conflict@error']);
});

test('a setting on for an absent section is a warning', () => {
  const source = JSON.stringify({
    shopify_perf_input: 'theme-settings',
    sections_present: ['header'],
    setting_requires_section: { enable_countdown: 'countdown-bar' },
    current: { enable_countdown: true }
  });
  assert.deepStrictEqual(run('config', source), ['setting-enabled-for-absent-section@warn']);
});

test('a setting on for a section that is present is not reported', () => {
  const source = JSON.stringify({
    shopify_perf_input: 'theme-settings',
    sections_present: ['countdown-bar'],
    setting_requires_section: { enable_countdown: 'countdown-bar' },
    current: { enable_countdown: true }
  });
  assert.deepStrictEqual(run('config', source), []);
});

test('a setting that is off is not reported whatever it requires', () => {
  const source = JSON.stringify({
    shopify_perf_input: 'theme-settings',
    sections_present: [],
    setting_requires_section: { enable_countdown: 'countdown-bar' },
    current: { enable_countdown: false }
  });
  assert.deepStrictEqual(run('config', source), []);
});

test('a setting that loads a library for an absent section is an error, not a warning', () => {
  const source = JSON.stringify({
    shopify_perf_input: 'theme-settings',
    sections_present: ['header'],
    setting_requires_section: { enable_parallax: 'parallax-hero' },
    setting_loads_library: { enable_parallax: 'assets/engine.js' },
    current: { enable_parallax: true }
  });
  assert.deepStrictEqual(run('config', source), ['setting-loads-unused-library@error']);
});

test('an unreferenced asset is a notice', () => {
  const source = JSON.stringify({
    shopify_perf_input: 'asset-manifest',
    assets: [{ path: 'assets/old.css', bytes: 100, referenced: false }]
  });
  assert.deepStrictEqual(run('config', source), ['asset-unreferenced@notice']);
});

test('a source map is a warning', () => {
  const source = JSON.stringify({
    shopify_perf_input: 'asset-manifest',
    assets: [{ path: 'assets/theme.js.map', bytes: 100, referenced: true }]
  });
  assert.deepStrictEqual(run('config', source), ['asset-sourcemap-shipped@warn']);
});

test('both builds of one asset referenced is a warning', () => {
  const source = JSON.stringify({
    shopify_perf_input: 'asset-manifest',
    assets: [
      { path: 'assets/theme.js', bytes: 100, referenced: true },
      { path: 'assets/theme.min.js', bytes: 50, referenced: true }
    ]
  });
  assert.deepStrictEqual(run('config', source), ['asset-unminified-twin@warn']);
});

test('only the minified build referenced is not reported', () => {
  const source = JSON.stringify({
    shopify_perf_input: 'asset-manifest',
    assets: [
      { path: 'assets/theme.js', bytes: 100, referenced: false },
      { path: 'assets/theme.min.js', bytes: 50, referenced: true }
    ]
  });
  assert.deepStrictEqual(run('config', source), ['asset-unreferenced@notice']);
});

test('script weight over the total budget is an error', () => {
  const source = JSON.stringify({
    shopify_perf_input: 'asset-manifest',
    assets: [
      { path: 'assets/a.min.js', bytes: 200000, referenced: true },
      { path: 'assets/b.min.js', bytes: 200000, referenced: true }
    ]
  });
  assert.deepStrictEqual(run('config', source), ['asset-manifest-total-over-budget@error']);
});

test('an unreferenced script does not count towards the total', () => {
  const source = JSON.stringify({
    shopify_perf_input: 'asset-manifest',
    assets: [
      { path: 'assets/a.min.js', bytes: 200000, referenced: true },
      { path: 'assets/b.min.js', bytes: 200000, referenced: false }
    ]
  });
  assert.deepStrictEqual(run('config', source), ['asset-unreferenced@notice']);
});

test('polling the cart on a timer is an error', () => {
  const js = 'function go() { fetch("/cart.js").then((r) => r.json()); }\nsetInterval(go, 5000);\n';
  assert.deepStrictEqual(run('asset-js', js), ['cart-endpoint-polled@error', 'fetch-without-abort@warn']);
});

test('a timer that does not request the cart is not reported', () => {
  const js = 'setInterval(() => { tick(); }, 5000);\n';
  assert.deepStrictEqual(run('asset-js', js), []);
});

test('a timer requesting something else is not a cart poll', () => {
  const js = 'setInterval(() => { fetch("/status.json"); }, 5000);\n';
  assert.deepStrictEqual(run('asset-js', js), ['fetch-without-abort@warn']);
});

test('a keystroke handler that requests with no debounce is an error', () => {
  const js = 'const c = new AbortController();\nfield.addEventListener("input", () => { fetch("/search", { signal: c.signal }); });\n';
  assert.deepStrictEqual(run('asset-js', js), ['search-input-without-debounce@error']);
});

test('a keystroke handler with a timer is not reported', () => {
  const js = 'const c = new AbortController();\nfield.addEventListener("input", () => { setTimeout(() => fetch("/search", { signal: c.signal }), 250); });\n';
  assert.deepStrictEqual(run('asset-js', js), []);
});

test('a repeated request with no abort controller is a warning', () => {
  const js = 'el.addEventListener("click", () => { fetch("/a.json"); });\n';
  assert.deepStrictEqual(run('asset-js', js), ['fetch-without-abort@warn']);
});

test('a request with an abort controller is not reported', () => {
  const js = 'const c = new AbortController();\nel.addEventListener("click", () => { fetch("/a.json", { signal: c.signal }); });\n';
  assert.deepStrictEqual(run('asset-js', js), []);
});

test('a one off request outside any handler is not a repeated request', () => {
  const js = 'await fetch("/a.json");\n';
  assert.deepStrictEqual(run('asset-js', js), []);
});

test('parsing a whole document for one section is a warning', () => {
  const js = 'const t = await (await fetch("/p")).text();\nnew DOMParser().parseFromString(t, "text/html");\n';
  assert.deepStrictEqual(run('asset-js', js), ['full-page-fetch-for-section@warn']);
});

test('using the section rendering query is not reported', () => {
  const js = 'const s = await (await fetch("/?sections=cart")).json();\nuse(s);\n';
  assert.deepStrictEqual(run('asset-js', js), []);
});

test('a scroll listener with no passive option is a warning', () => {
  const js = 'window.addEventListener("scroll", () => { seen(); });\n';
  assert.deepStrictEqual(run('asset-js', js), ['listener-not-passive@warn']);
});

test('a scroll listener with the passive option is not reported', () => {
  const js = 'window.addEventListener("scroll", () => { seen(); }, { passive: true });\n';
  assert.deepStrictEqual(run('asset-js', js), []);
});

test('a click listener is not held to the passive rule', () => {
  const js = 'window.addEventListener("click", () => { seen(); });\n';
  assert.deepStrictEqual(run('asset-js', js), []);
});

test('a handler that writes style and then reads layout is an error', () => {
  const js = 'window.addEventListener("click", () => { a.style.height = "1px"; const h = b.offsetHeight; use(h); });\n';
  assert.deepStrictEqual(run('asset-js', js), ['layout-read-after-write-in-handler@error']);
});

test('a handler that reads layout and then writes style is not reported', () => {
  const js = 'window.addEventListener("click", () => { const h = b.offsetHeight; a.style.height = h + "px"; });\n';
  assert.deepStrictEqual(run('asset-js', js), []);
});

test('a resize handler with no throttle is a warning', () => {
  const js = 'window.addEventListener("resize", () => { a.dataset.w = "1"; });\n';
  assert.deepStrictEqual(run('asset-js', js), ['resize-handler-without-throttle@warn']);
});

test('a resize handler on a frame callback is not reported', () => {
  const js = 'window.addEventListener("resize", () => { requestAnimationFrame(() => { a.dataset.w = "1"; }); });\n';
  assert.deepStrictEqual(run('asset-js', js), []);
});

test('a document query inside a loop is a notice', () => {
  const js = 'for (let i = 0; i < 3; i += 1) { const n = document.querySelector("#a" + i); use(n); }\n';
  assert.deepStrictEqual(run('asset-js', js), ['dom-query-in-loop@notice']);
});

test('a query hoisted above a loop is not reported', () => {
  const js = 'const nodes = document.querySelectorAll(".a");\nfor (let i = 0; i < 3; i += 1) { use(nodes[i]); }\n';
  assert.deepStrictEqual(run('asset-js', js), []);
});

test('a query inside a while loop is also a notice', () => {
  const js = 'let i = 0;\nwhile (i < 3) { const n = document.querySelector("#a"); use(n); i += 1; }\n';
  assert.deepStrictEqual(run('asset-js', js), ['dom-query-in-loop@notice']);
});

test('the input kind of a path comes from its extension', () => {
  assert.equal(kindFor('a/b.liquid'), 'liquid');
  assert.equal(kindFor('a/b.html'), 'page');
  assert.equal(kindFor('a/b.mjs'), 'asset-js');
  assert.equal(kindFor('a/b.css'), 'asset-css');
  assert.equal(kindFor('a/b.headers'), 'headers');
  assert.equal(kindFor('a/b.json'), 'config');
});

test('a path with no extension has no input kind', () => {
  assert.equal(kindFor('Makefile'), null);
});

test('an unknown extension has no input kind', () => {
  assert.equal(kindFor('a/b.txt'), null);
});

test('every input kind has at least one extension', () => {
  for (const kind of KINDS) assert.ok(extensionsFor(kind).length >= 1, kind);
});

test('every check declares only input kinds that exist', () => {
  for (const check of CHECKS) {
    for (const kind of check.kinds) assert.ok(KINDS.includes(kind), check.area + ' names ' + kind);
  }
});

test('auditing an unknown input kind throws rather than returning nothing', () => {
  assert.throws(() => auditOne({ kind: 'nonsense', path: 'x', source: '' }), /unknown input kind/);
});

test('findings are sorted by path then line then id', () => {
  const result = audit([
    { kind: 'liquid', path: 'b.liquid', source: '{{ collection.products | size }}' },
    { kind: 'liquid', path: 'a.liquid', source: '{% for p in collection.products %}{% endfor %}' }
  ]);
  assert.deepStrictEqual(result.findings.map((f) => f.path), ['a.liquid', 'b.liquid']);
});

test('the summary counts every severity', () => {
  const result = audit([{ kind: 'liquid', path: 'a.liquid', source: '{% for p in collection.products %}{{ p.metafields.a.b }}{% endfor %}' }]);
  assert.equal(result.counts.error, 1);
  assert.equal(result.counts.warn, 1);
  assert.equal(result.counts.notice, 0);
});

test('every finding carries the title from the catalogue', () => {
  const result = audit([{ kind: 'liquid', path: 'a.liquid', source: '{% for p in collection.products %}{% endfor %}' }]);
  assert.equal(result.findings[0].title, 'A loop over products has no limit');
});

test('a finding with no line falls back to line one', () => {
  const source = JSON.stringify({
    shopify_perf_input: 'asset-manifest',
    assets: [{ path: 'assets/old.css', bytes: 1, referenced: false }]
  });
  const result = audit([{ kind: 'config', path: 'a.json', source }]);
  assert.equal(result.findings[0].line, 1);
});

test('a config file that cannot be parsed produces no findings rather than throwing', () => {
  assert.deepStrictEqual(run('config', '{ not json'), []);
});

test('an empty input of every kind produces nothing', () => {
  for (const kind of KINDS) assert.deepStrictEqual(run(kind, ''), [], kind);
});

test('a listener that declares the passive option as false is not passive', () => {
  const js = 'window.addEventListener("scroll", () => { go(); }, { passive: false });\n';
  assert.deepStrictEqual(run('asset-js', js), ['listener-not-passive@warn']);
});

test('a listener that declares it as true is passive', () => {
  const js = 'window.addEventListener("scroll", () => { go(); }, { passive: true });\n';
  assert.deepStrictEqual(run('asset-js', js), []);
});

test('an image inside a noscript fallback is not the image the paint waits for', () => {
  const found = run('page', page('', '<noscript><img src="/a.jpg" alt="A" loading="lazy"></noscript>'));
  assert.deepStrictEqual(found, []);
});

test('an image inside a template is never rendered and is not counted', () => {
  const found = run('page', page('', '<template><img src="/a.jpg" alt="A"></template>'));
  assert.deepStrictEqual(found, []);
});

test('a script inside a template is never run and is not weight', () => {
  const found = run('page', page('<template><script src="https://widget.example.net/a.js"></script></template>'));
  assert.deepStrictEqual(found, []);
});

test('an image in a picture whose sources carry widths needs no source set of its own', () => {
  const body = '<picture><source srcset="/a-300.webp 300w, /a-600.webp 600w" type="image/webp">' +
    '<img src="/a.jpg" alt="A" width="10" height="10"></picture>';
  assert.deepStrictEqual(run('page', page('', body)), []);
});

test('an image in a picture whose only source names a type still has one size', () => {
  const body = '<picture><source srcset="/a.webp" type="image/webp">' +
    '<img src="/a.jpg" alt="A" width="10" height="10"></picture>';
  assert.deepStrictEqual(run('page', page('', body)), ['image-without-srcset@notice']);
});

test('a response that was not modified carries no body and is not judged', () => {
  const capture = '>>> GET /assets/theme.css\n304\ncontent-type: text/css\ncache-control: public, max-age=600\n';
  assert.deepStrictEqual(run('headers', capture), []);
});

test('a redirect is not judged as an asset', () => {
  const capture = '>>> GET /old\n301\ncontent-type: text/html\nlocation: /new\ncache-control: public, max-age=31536000\n';
  assert.deepStrictEqual(run('headers', capture), []);
});

test('a font face declared in a style block in the body is still read', () => {
  const body = '<style>@font-face { font-family: "A"; src: url("/a.woff2") format("woff2"); }</style>';
  assert.deepStrictEqual(run('page', page('', body)), ['font-face-without-display@warn', 'font-not-preloaded@notice']);
});

test('a product list held in a variable is still a product loop', () => {
  const found = run('liquid', '{% assign items = collection.products %}{% for p in items %}{{ p.title }}{% endfor %}');
  assert.deepStrictEqual(found, ['liquid-loop-without-limit@error']);
});

test('a product list held in a variable with a limit is not reported', () => {
  const found = run('liquid', '{% assign items = collection.products %}{% for p in items limit: 4 %}{{ p.title }}{% endfor %}');
  assert.deepStrictEqual(found, []);
});

test('the whole catalogue held in a variable is still the whole catalogue', () => {
  const found = run('liquid', '{% assign a = collections.all.products %}{% for p in a %}{{ p.title }}{% endfor %}');
  assert.deepStrictEqual(found, ['liquid-all-products-iteration@error']);
});

test('an assignment is followed through a second assignment', () => {
  const found = run('liquid', '{% assign a = collection.products %}{% assign b = a %}{% for p in b %}{{ p.title }}{% endfor %}');
  assert.deepStrictEqual(found, ['liquid-loop-without-limit@error']);
});

test('a variable holding something that is not products is not a product list', () => {
  const found = run('liquid', '{% assign b = section.blocks %}{% for p in b %}{{ p.id }}{% endfor %}');
  assert.deepStrictEqual(found, []);
});
