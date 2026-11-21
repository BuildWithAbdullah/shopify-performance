import { scanLiquid, insideLoop, splitFilters } from '../scan/liquid.mjs';
import { THRESHOLDS } from '../thresholds.mjs';

function loopSubject(args) {
  const m = String(args).match(/\bin\s+([A-Za-z0-9_.\[\]'"-]+)/);
  return m ? m[1] : '';
}

function loopVariable(args) {
  const m = String(args).match(/^\s*([A-Za-z0-9_]+)\s+in\b/);
  return m ? m[1] : '';
}

function iteratesProducts(subject) {
  const s = subject.toLowerCase();
  return s === 'products' || s.endsWith('.products') || s.endsWith("['products']") || s.endsWith('.items');
}

function iteratesCollections(subject) {
  const s = subject.toLowerCase();
  if (s.includes('collections.all')) return false;
  if (s.includes('.products')) return false;
  if (s === 'collections' || s.endsWith('.collections')) return true;
  return /(^|[.\[])collections([.\]]|$)/.test(s);
}

function hasFilter(filters, ...names) {
  return filters.some((f) => names.some((n) => new RegExp('^' + n + '\\b').test(f.trim())));
}

function filterArgs(filters, name) {
  const found = filters.find((f) => new RegExp('^' + name + '\\b').test(f.trim()));
  return found === undefined ? null : found.trim().slice(name.length);
}

export default {
  area: 'liquid',
  kinds: ['liquid'],
  run(input) {
    const out = [];
    const scan = scanLiquid(input.source);
    const forTags = scan.tags.filter((t) => t.name === 'for' || t.name === 'tablerow');

    // A theme that assigns a product list to a variable and then loops over the
    // variable is doing exactly the thing the loop checks are about, so the
    // assignments are followed one step. Only within one file: following a
    // render tag is a declared limit.
    const productVars = new Set();
    const allProductVars = new Set();
    for (const tag of scan.tags) {
      if (tag.name !== 'assign') continue;
      const eq = tag.args.indexOf('=');
      if (eq === -1) continue;
      const name = tag.args.slice(0, eq).trim();
      const { subject } = splitFilters(tag.args.slice(eq + 1).trim());
      const lower = subject.toLowerCase();
      if (lower.includes('collections.all.products') || allProductVars.has(subject)) {
        allProductVars.add(name);
      } else if (iteratesProducts(subject) || productVars.has(subject)) {
        productVars.add(name);
      }
    }
    const isProductList = (subject) => iteratesProducts(subject) || productVars.has(subject);

    for (const tag of forTags) {
      const subject = loopSubject(tag.args);
      const lower = subject.toLowerCase();
      if (lower.includes('collections.all.products') || allProductVars.has(subject)) {
        out.push({
          id: 'liquid-all-products-iteration',
          severity: 'error',
          line: tag.line,
          detail: 'iterates ' + subject
        });
      } else if (isProductList(subject) && !/\blimit\s*:/.test(tag.args)) {
        out.push({
          id: 'liquid-loop-without-limit',
          severity: 'error',
          line: tag.line,
          detail: 'no limit on ' + (subject || 'the loop')
        });
      }
      if (iteratesCollections(subject)) {
        const innerScan = scanLiquid(tag.inner);
        const innerProducts = innerScan.tags.find(
          (t) => (t.name === 'for' || t.name === 'tablerow') && isProductList(loopSubject(t.args))
        );
        if (innerProducts) {
          out.push({
            id: 'liquid-nested-collection-loop',
            severity: 'error',
            line: tag.line,
            detail: 'inner product loop on line ' + (tag.line + (innerProducts.line - 1))
          });
        }
      }
    }

    for (const output of scan.outputs) {
      if (insideLoop(output) && /\bmetafields\s*[.\[]/.test(output.expr)) {
        out.push({
          id: 'liquid-metafield-in-loop',
          severity: 'warn',
          line: output.line,
          detail: 'metafield read inside a loop body'
        });
      }
      if (/\.products\s*$/.test(output.subject) && hasFilter(output.filters, 'size')) {
        out.push({
          id: 'liquid-products-size-for-count',
          severity: 'warn',
          line: output.line,
          detail: 'sizing the product list to count it'
        });
      }
      if (/\.products\.size\b/.test(output.expr)) {
        out.push({
          id: 'liquid-products-size-for-count',
          severity: 'warn',
          line: output.line,
          detail: 'sizing the product list to count it'
        });
      }
      if (insideLoop(output) && hasFilter(output.filters, 'sort', 'sort_natural')) {
        out.push({
          id: 'liquid-sort-in-loop',
          severity: 'warn',
          line: output.line,
          detail: 'sort filter inside a loop body'
        });
      }
      if (hasFilter(output.filters, 'image_url')) {
        const args = filterArgs(output.filters, 'image_url') || '';
        if (!/\bwidth\s*:/.test(args)) {
          out.push({
            id: 'liquid-image-url-without-width',
            severity: 'warn',
            line: output.line,
            detail: 'image_url with no width argument'
          });
        }
      }
      if (hasFilter(output.filters, 'img_url')) {
        out.push({
          id: 'liquid-deprecated-img-url',
          severity: 'notice',
          line: output.line,
          detail: 'img_url is deprecated'
        });
        const args = (filterArgs(output.filters, 'img_url') || '').trim();
        if (!args || /^['"](master|original)['"]$/.test(args)) {
          out.push({
            id: 'liquid-image-url-without-width',
            severity: 'warn',
            line: output.line,
            detail: 'img_url serves the original upload'
          });
        }
      }
    }

    for (const tag of scan.tags) {
      if (tag.name === 'paginate') {
        const m = tag.args.match(/\bby\s+(\d+)/);
        if (m && Number(m[1]) > THRESHOLDS.paginateMax) {
          out.push({
            id: 'liquid-paginate-oversized',
            severity: 'warn',
            line: tag.line,
            detail: 'page size ' + m[1] + ', maximum ' + THRESHOLDS.paginateMax
          });
        }
      }
      if (tag.name === 'include' && insideLoop(tag)) {
        out.push({
          id: 'liquid-include-in-loop',
          severity: 'warn',
          line: tag.line,
          detail: 'include inside a loop body'
        });
      }
      if (tag.name === 'assign' && insideLoop(tag)) {
        const eq = tag.args.indexOf('=');
        if (eq !== -1) {
          const rhs = tag.args.slice(eq + 1).trim();
          const owner = [...forTags].reverse().find(
            (t) => t.start < tag.start && (t.blockEnd === -1 || t.blockEnd > tag.start)
          );
          const variable = owner ? loopVariable(owner.args) : '';
          const mentionsLoop = variable
            ? new RegExp('\\b' + variable + '\\b').test(rhs) || /\bforloop\b/.test(rhs)
            : true;
          const costsSomething = rhs.includes('|') || /[A-Za-z0-9_]\s*\.\s*[A-Za-z_]/.test(rhs);
          if (!mentionsLoop && costsSomething) {
            out.push({
              id: 'liquid-invariant-assign-in-loop',
              severity: 'notice',
              line: tag.line,
              detail: 'the expression does not mention ' + variable
            });
          }
        }
      }
      if (tag.name === 'assign' || tag.name === 'echo') {
        const eq = tag.args.indexOf('=');
        const expr = tag.name === 'echo' ? tag.args : eq === -1 ? '' : tag.args.slice(eq + 1);
        if (expr) {
          const { subject, filters } = splitFilters(expr.trim());
          if (insideLoop(tag) && hasFilter(filters, 'sort', 'sort_natural')) {
            out.push({
              id: 'liquid-sort-in-loop',
              severity: 'warn',
              line: tag.line,
              detail: 'sort filter inside a loop body'
            });
          }
          if (insideLoop(tag) && /\bmetafields\s*[.\[]/.test(expr)) {
            out.push({
              id: 'liquid-metafield-in-loop',
              severity: 'warn',
              line: tag.line,
              detail: 'metafield read inside a loop body'
            });
          }
          if (/\.products\s*$/.test(subject) && hasFilter(filters, 'size')) {
            out.push({
              id: 'liquid-products-size-for-count',
              severity: 'warn',
              line: tag.line,
              detail: 'sizing the product list to count it'
            });
          }
        }
      }
    }
    return out;
  }
};
