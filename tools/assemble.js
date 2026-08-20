/**
 * assemble.js — pastes build/_modules.js + build/_dcs.json + support.js into
 * index.html. Kept as a file so a rebuild is one short run_script call:
 *
 *   const A = await import(URL.createObjectURL(new Blob([await readFile('tools/assemble.js')],{type:'text/javascript'})));
 *   await saveFile('index.html', A.assemble(support, modules, dcsRaw));
 */

export const MODULE_LIST = [
  'assets/js/db.js', 'assets/js/business-rules.js', 'assets/js/i18n.js',
  'assets/js/format.js', 'assets/js/validation.js', 'assets/js/api.js',
  'assets/js/router.js', 'assets/js/auth.js', 'assets/js/seed.js',
  'assets/js/repositories/productsRepo.js', 'assets/js/repositories/vendorsRepo.js',
  'assets/js/repositories/ordersRepo.js', 'assets/js/repositories/cartRepo.js',
  'assets/js/repositories/reviewsRepo.js', 'assets/js/repositories/usersRepo.js',
  'assets/js/repositories/financeRepo.js', 'assets/js/repositories/platformRepo.js',
  'assets/js/repositories/mediaRepo.js', 'assets/js/app.js',
];

export function assemble(support, modules, dcsRaw) {
  const C = '<' + '/script>';
  const XO = '<' + 'x-dc>';
  const XC = '<' + '/x-dc>';

  const head = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Uloominate — platform prototype</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Montserrat+Alternates:wght@500;600&family=Playfair+Display:wght@400;500&family=DM+Sans:wght@400;500;700&family=Libre+Baskerville:wght@400;700&family=Roboto:wght@400;500&display=swap" rel="stylesheet" />
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Poppins, system-ui, sans-serif; color: #121212; background: #FFFFFF; -webkit-font-smoothing: antialiased; }
  a { color: #3A836B; text-decoration: none; }
  a:hover { color: #29483C; }
  :focus-visible { outline: 2px solid #3A836B; outline-offset: 3px; border-radius: 4px; }
  [data-boot-shell] { display: none; }
  #ulm-splash { position: fixed; inset: 0; z-index: 9999; background: #F2FAF7; display: grid; place-items: center; }
  #ulm-splash .in { display: flex; flex-direction: column; align-items: center; gap: 14px; }
  #ulm-splash span { font-family: 'Montserrat Alternates', Poppins, sans-serif; font-size: 26px; color: #3A836B; }
  #ulm-splash small { font-size: 13px; color: #5C7A6E; max-width: 340px; text-align: center; line-height: 1.6; }
  @keyframes ulm-spin { to { transform: rotate(360deg); } }
  .ulm-ring { width: 30px; height: 30px; border: 3px solid rgba(58,131,107,.25); border-top-color: #3A836B; border-radius: 50%; animation: ulm-spin .8s linear infinite; }
</style>
</head>
<body>

<div id="ulm-splash"><div class="in">
  <img src="assets/img/logo-mark.png" alt="" width="40" height="49" style="object-fit:contain" />
  <span>Uloominate</span>
  <div class="ulm-ring" role="status" aria-label="Loading"></div>
  <small id="ulm-splash-msg">Starting the prototype…</small>
</div></div>

`;

  const shim = `<script>
/* The data layer as one classic script: __req resolves synchronously and
   __ulmImport stands in for the dynamic import() the screens were written
   against. Classic scripts are not subject to the module CORS rules, which is
   what lets this file run straight from disk. */
(function () {
  var defs = {}, cache = {};
  function __def(path, factory) { defs[path] = factory; }
  function __req(path) {
    if (cache[path]) return cache[path];
    var f = defs[path];
    if (!f) throw new Error('Module not found: ' + path);
    var exports = {};
    cache[path] = exports;
    f(exports, __req);
    return exports;
  }
  window.__ulmImport = function (path) {
    try { return Promise.resolve(__req(path)); } catch (e) { return Promise.reject(e); }
  };
  window.__ulmRequire = __req;

`;

  const router = `;
  var app = window.__ulmRequire('assets/js/app.js');
  try { app.boot(); } catch (e) { console.error('seed failed', e); }

  // Register every screen and shared shell by name, so <dc-import> resolves
  // from memory instead of fetching a sibling file. This has to wait: support.js
  // only attaches __dcUpdate once the React UMD bundles have loaded.
  var registered = false;
  function registerAll() {
    if (registered) return;
    registered = true;
    var reg = window.__dcRegistry || {};
    Object.keys(DCS).forEach(function (name) {
      var d = DCS[name];
      if (d.p) window.__dcUpdate(name, 'props', d.p, false);
      // 'html' is the kind the runtime understands; 'template' was silently
      // ignored, which is why every screen used to fall back to a sibling fetch.
      window.__dcUpdate(name, 'html', d.t, false);
      if (d.j) window.__dcUpdate(name, 'js', d.j, false);
      // Registered from memory, so tell the runtime not to go looking for a
      // sibling .dc.html file - that fetch is wasted over http and fails
      // outright over file://.
      if (reg[name]) reg[name].fetched = true;
    });
  }

  function nameFor(hash) {
    var raw = decodeURIComponent((hash || '').replace(/^#/, '').split('?')[0]);
    if (!raw) return 'Sitemap';
    var n = raw.replace(/\\.dc\\.html$/, '');
    return DCS[n] ? n : 'Error 404';
  }

  var mountEl = document.createElement('div');
  mountEl.id = 'ulm-screen';
  document.body.appendChild(mountEl);

  var reactRoot = null, current = null;

  function fail(text) {
    var msg = document.getElementById('ulm-splash-msg');
    if (msg) msg.textContent = text;
  }

  function dropSplash() {
    var sp = document.getElementById('ulm-splash');
    if (sp && sp.parentNode) sp.parentNode.removeChild(sp);
  }

  // A screen's template compiles a beat before its logic class, so painting
  // immediately would show unresolved holes. Poll until the class is ready.
  function whenCompiled(name, cb, tries) {
    tries = tries || 0;
    var Screen = window.getDC && window.getDC(name);
    if (typeof Screen === 'function') return cb(Screen);
    if (tries > 250) {
      console.error('screen not compiled:', name);
      return fail('Could not compile ' + name + '. Reload the page.');
    }
    setTimeout(function () { whenCompiled(name, cb, tries + 1); }, 40);
  }

  function render(name) {
    current = name;
    document.title = name + ' \u2014 Uloominate';
    whenCompiled(name, function (Screen) {
      if (current !== name) return;
      if (!reactRoot) reactRoot = window.ReactDOM.createRoot(mountEl);
      // Keying on the name forces a clean remount, so each screen runs its own
      // componentDidMount instead of inheriting the previous screen's state.
      reactRoot.render(window.React.createElement(Screen, { key: name }));
      window.scrollTo(0, 0);
      dropSplash();
    });
  }

  function onHash() {
    var name = nameFor(location.hash);
    if (name !== current) render(name);
  }

  window.addEventListener('hashchange', onHash);

  function settle(tries) {
    tries = tries || 0;
    var ready = window.__dcUpdate && window.getDC && window.React && window.ReactDOM
      && window.__dcRootName && window.__dcRootName();
    if (!ready) {
      if (tries > 400) {
        return fail('Could not load React from the CDN. Connect to the internet and reload.');
      }
      return setTimeout(function () { settle(tries + 1); }, 40);
    }
    registerAll();
    if (!location.hash) {
      try { location.replace('#Sitemap'); } catch (e) { location.hash = 'Sitemap'; }
    }
    setTimeout(onHash, 0);
  }
  settle();
})();
` + C + `

</body>
</html>
`;

  return head
    + XO + '<div data-boot-shell></div>' + XC + '\n'
    + '<script type="text/x-dc" data-dc-script data-props="{}">\n'
    + 'class Component extends DCLogic { renderVals() { return {}; } }\n' + C + '\n\n'
    + '<script>\n' + support + '\n' + C + '\n\n'
    + shim + modules
    + '\n\n  ' + JSON.stringify(MODULE_LIST) + '.forEach(function (path) {\n'
    + '    try { __req(path); } catch (e) { console.error("module init failed", path, e); }\n'
    + '  });\n})();\n' + C + '\n\n'
    + '<script>\n(function () {\n  var DCS = ' + dcsRaw + router;
}
