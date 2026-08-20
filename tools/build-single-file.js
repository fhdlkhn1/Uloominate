/**
 * build-single-file.js — generates index.html, a self-contained prototype that
 * runs from file:// with no server.
 *
 * Three problems have to be solved for file:// to work:
 *   1. ES module import() is blocked  -> the 19 data-layer modules are folded
 *      into one classic script with a tiny synchronous require shim.
 *   2. fetch() is blocked            -> every screen and shell is registered
 *      with the runtime's __dcUpdate() from an inline string instead of being
 *      fetched as a sibling file.
 *   3. Cross-file navigation reloads -> router.url() is rewritten to emit hash
 *      routes and a host router swaps the mounted root component.
 *
 * Run with run_script. Re-run after changing any page or module.
 */

// Order matters: a module must be listed after everything it imports.
const MODULES = [
  'assets/js/db.js',
  'assets/js/business-rules.js',
  'assets/js/i18n.js',
  'assets/js/format.js',
  'assets/js/validation.js',
  'assets/js/api.js',
  'assets/js/router.js',
  'assets/js/auth.js',
  'assets/js/seed.js',
  'assets/js/repositories/productsRepo.js',
  'assets/js/repositories/vendorsRepo.js',
  'assets/js/repositories/ordersRepo.js',
  'assets/js/repositories/cartRepo.js',
  'assets/js/repositories/reviewsRepo.js',
  'assets/js/repositories/usersRepo.js',
  'assets/js/repositories/financeRepo.js',
  'assets/js/repositories/platformRepo.js',
  'assets/js/repositories/mediaRepo.js',
  'assets/js/app.js',
];

/** Resolve a relative specifier against the importing module's directory. */
export function resolvePath(fromPath, spec) {
  const dir = fromPath.slice(0, fromPath.lastIndexOf('/'));
  let p = spec.replace(/^\.\//, dir + '/');
  if (spec.startsWith('../')) {
    const up = dir.slice(0, dir.lastIndexOf('/'));
    p = spec.replace(/^\.\.\//, up + '/');
  }
  return p;
}

/**
 * Rewrite one ES module into a factory body: imports become require calls and
 * exports are collected onto an exports object.
 */
export function transformModule(path, src) {
  let s = src;
  const named = new Set();

  // import * as ns from './x.js'
  s = s.replace(/^import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"];?\s*$/gm,
    (_, ns, spec) => `const ${ns} = __req('${resolvePath(path, spec)}');`);

  // import { a, b as c } from './x.js'
  s = s.replace(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?\s*$/gm,
    (_, names, spec) => `const {${names}} = __req('${resolvePath(path, spec)}');`);

  // import def from './x.js'
  s = s.replace(/^import\s+(\w+)\s+from\s+['"]([^'"]+)['"];?\s*$/gm,
    (_, def, spec) => `const ${def} = __req('${resolvePath(path, spec)}').default;`);

  // export { a, b }  — record and drop
  s = s.replace(/^export\s+\{([^}]+)\};?\s*$/gm, (_, names) => {
    names.split(',').forEach(n => {
      const t = n.trim().split(/\s+as\s+/);
      if (t[0]) named.add((t[1] || t[0]).trim() + ':' + t[0].trim());
    });
    return '';
  });

  // export default X
  let hasDefault = false;
  s = s.replace(/^export\s+default\s+/gm, () => { hasDefault = true; return '__exports.default = '; });

  // export function/class/const/let/var NAME
  s = s.replace(/^export\s+(async\s+)?function\s+(\w+)/gm, (_, a, n) => { named.add(n + ':' + n); return `${a || ''}function ${n}`; });
  s = s.replace(/^export\s+class\s+(\w+)/gm, (_, n) => { named.add(n + ':' + n); return `class ${n}`; });
  s = s.replace(/^export\s+(const|let|var)\s+(\w+)/gm, (_, k, n) => { named.add(n + ':' + n); return `${k} ${n}`; });

  const assign = [...named].map(pair => {
    const [outer, inner] = pair.split(':');
    return `  try { __exports[${JSON.stringify(outer)}] = ${inner}; } catch (e) {}`;
  }).join('\n');

  return `__def(${JSON.stringify(path)}, function (__exports, __req) {\n${s}\n${assign}\n});`;
}

/** Patch the router so navigation is by hash and query params read from it. */
export function patchRouter(src) {
  let s = src;

  s = s.replace(
    /export function url\(route, params\) \{[\s\S]*?\n\}/,
    `export function url(route, params) {
  const file = ROUTES[route] || route;
  const base = String(file).replace(/\\.dc\\.html$/, '');
  let qs = '';
  if (params) {
    qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
      .join('&');
  }
  return '#' + encodeURIComponent(base) + (qs ? '?' + qs : '');
}`);

  s = s.replace(/export function go\(route, params\) \{[\s\S]*?\n\}/,
    `export function go(route, params) { window.location.hash = url(route, params).slice(1); }`);

  s = s.replace(/export function replace\(route, params\) \{[\s\S]*?\n\}/,
    `export function replace(route, params) { window.location.replace(url(route, params)); }`);

  // Query parameters live after the '?' inside the hash.
  s = s.replace(/export function param\(name, fallback = null\) \{[\s\S]*?\n\}/,
    `export function param(name, fallback = null) {
  const v = new URLSearchParams(__hashQuery()).get(name);
  return v === null ? fallback : v;
}`);

  s = s.replace(/export function params\(\) \{[\s\S]*?\n\}/,
    `export function params() {
  return Object.fromEntries(new URLSearchParams(__hashQuery()).entries());
}`);

  s = s.replace(/export function syncQuery\(next\) \{[\s\S]*?\n\}/,
    `export function syncQuery(next) {
  const sp = new URLSearchParams(__hashQuery());
  for (const [k, v] of Object.entries(next)) {
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
    if (empty) sp.delete(k);
    else sp.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const qs = sp.toString();
  const base = (location.hash || '#').slice(1).split('?')[0];
  history.replaceState(null, '', '#' + base + (qs ? '?' + qs : ''));
}

function __hashQuery() {
  const h = location.hash || '';
  const i = h.indexOf('?');
  return i === -1 ? '' : h.slice(i + 1);
}`);

  return s;
}

/** Split a .dc.html file into its template and logic halves. */
export function splitDc(src) {
  const tplStart = src.indexOf('<x-dc>');
  const tplEnd = src.lastIndexOf('</x-dc>');
  const template = tplStart === -1 ? '' : src.slice(tplStart + 6, tplEnd);

  const sm = /<script type="text\/x-dc" data-dc-script(?:\s+data-props="([^"]*)")?\s*>/.exec(src);
  let js = '', props = '';
  if (sm) {
    const from = sm.index + sm[0].length;
    js = src.slice(from, src.indexOf('<\/script>', from));
    props = sm[1] ? sm[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : '';
  }
  return { template, js, props };
}

/** Rewrite dynamic imports in a logic class to the synchronous shim. */
export function patchDcLogic(js) {
  return js.replace(/import\((['"])\.\/(assets\/js\/[^'"]+)\1\)/g,
    (_, q, path) => `__ulmImport(${q}${path}${q})`);
}
