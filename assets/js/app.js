/**
 * app.js — boot sequence every page runs before it renders.
 *
 * Purpose:   seed on first load, expose the current session, and provide the
 *            small shared helpers pages need (toast, confirm, money, guards).
 * Depends:   seed.js, auth.js, db.js
 *
 * Usage from a Design Component logic class:
 *   const app = await import('./assets/js/app.js');
 *   await app.boot();
 *   const user = app.auth.requireRole('vendor');
 */

import { seedAll } from './seed.js';
import * as db from './db.js';
import * as auth from './auth.js';
import * as router from './router.js';
import * as fmt from './format.js';
import { t } from './i18n.js';

let booted = false;

/** Idempotent. Seeds once, then resolves immediately on later calls. */
export async function boot() {
  if (booted) return;
  seedAll(false);
  booted = true;
}

/** Wipe and re-seed — the dev toolbar's Reset demo data control. */
export function resetDemoData() {
  seedAll(true);
  localStorage.removeItem('uloominate.session.v1');
  localStorage.removeItem('uloominate.guestCart.v1');
}

/* ----------------------------------------------------------------- toast --
 * A single host element is appended lazily so no page has to declare one.
 */
let toastHost = null;
function ensureToastHost() {
  if (toastHost && document.body.contains(toastHost)) return toastHost;
  toastHost = document.createElement('div');
  toastHost.setAttribute('data-toast-host', '');
  Object.assign(toastHost.style, {
    position: 'fixed', right: '24px', bottom: '24px', zIndex: '9000',
    display: 'flex', flexDirection: 'column', gap: '10px', pointerEvents: 'none',
    maxWidth: 'min(400px, calc(100vw - 48px))',
  });
  document.body.appendChild(toastHost);
  return toastHost;
}

const TOAST_TONES = {
  success: { bar: '#3A836B', bg: '#FFFFFF', icon: '✓' },
  error: { bar: '#C0392B', bg: '#FFFFFF', icon: '!' },
  info: { bar: '#116254', bg: '#FFFFFF', icon: 'i' },
  warning: { bar: '#B9913E', bg: '#FFFFFF', icon: '!' },
};

export function toast(message, tone = 'success', ms = 4200) {
  const host = ensureToastHost();
  const tn = TOAST_TONES[tone] || TOAST_TONES.info;
  const el = document.createElement('div');
  el.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  Object.assign(el.style, {
    display: 'flex', alignItems: 'flex-start', gap: '12px',
    background: tn.bg, color: '#121212', borderLeft: '4px solid ' + tn.bar,
    borderRadius: '10px', padding: '14px 16px', pointerEvents: 'auto',
    boxShadow: '0 1px 2px rgba(18,18,18,.06), 0 12px 28px -8px rgba(41,72,60,.28)',
    font: '500 14px/1.45 Poppins, system-ui, sans-serif',
    transform: 'translateY(8px)', opacity: '0',
    transition: 'transform .22s cubic-bezier(.2,.7,.3,1), opacity .22s ease',
  });
  const badge = document.createElement('span');
  Object.assign(badge.style, {
    flex: '0 0 20px', width: '20px', height: '20px', borderRadius: '50%',
    background: tn.bar, color: '#fff', display: 'grid', placeItems: 'center',
    font: '700 12px/1 Poppins, sans-serif', marginTop: '1px',
  });
  badge.textContent = tn.icon;
  const text = document.createElement('span');
  text.textContent = message;
  el.append(badge, text);
  host.appendChild(el);
  requestAnimationFrame(() => { el.style.transform = 'translateY(0)'; el.style.opacity = '1'; });
  const close = () => {
    el.style.transform = 'translateY(8px)'; el.style.opacity = '0';
    setTimeout(() => el.remove(), 240);
  };
  el.addEventListener('click', close);
  setTimeout(close, ms);
  return close;
}

/* --------------------------------------------------------------- confirm --
 * Focus-trapped, Esc-closable, promise-based. Used before every destructive
 * action so no page hand-rolls its own dialog.
 */
export function confirmDialog({ title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'danger' }) {
  return new Promise(resolve => {
    const prev = document.activeElement;
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '9100', display: 'grid', placeItems: 'center',
      background: 'rgba(41,72,60,.42)', padding: '24px', opacity: '0', transition: 'opacity .18s ease',
    });
    const card = document.createElement('div');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    Object.assign(card.style, {
      width: 'min(460px, 100%)', background: '#fff', borderRadius: '16px', padding: '28px',
      boxShadow: '0 24px 64px -16px rgba(41,72,60,.4)', font: '400 15px/1.6 Poppins, system-ui, sans-serif',
      color: '#121212', transform: 'scale(.97)', transition: 'transform .18s cubic-bezier(.2,.7,.3,1)',
    });
    const h = document.createElement('h2');
    h.textContent = title;
    Object.assign(h.style, { margin: '0 0 10px', font: '600 20px/1.3 Poppins, sans-serif', color: '#29483C' });
    const p = document.createElement('p');
    p.textContent = body;
    Object.assign(p.style, { margin: '0 0 24px', color: '#595959' });
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '10px', justifyContent: 'flex-end' });
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.textContent = cancelLabel;
    Object.assign(cancel.style, {
      padding: '11px 20px', borderRadius: '8px', border: '1px solid #DCE5E1', background: '#fff',
      font: '600 14px Poppins, sans-serif', color: '#29483C', cursor: 'pointer',
    });
    const ok = document.createElement('button');
    ok.type = 'button'; ok.textContent = confirmLabel;
    Object.assign(ok.style, {
      padding: '11px 20px', borderRadius: '8px', border: 'none',
      background: tone === 'danger' ? '#C0392B' : '#3A836B', color: '#fff',
      font: '600 14px Poppins, sans-serif', cursor: 'pointer',
    });
    row.append(cancel, ok);
    card.append(h, p, row);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => { overlay.style.opacity = '1'; card.style.transform = 'scale(1)'; });
    ok.focus();

    const done = value => {
      document.removeEventListener('keydown', onKey, true);
      overlay.style.opacity = '0';
      setTimeout(() => { overlay.remove(); if (prev && prev.focus) prev.focus(); }, 180);
      resolve(value);
    };
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); done(false); }
      if (e.key === 'Tab') {
        const f = [cancel, ok];
        const i = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    cancel.addEventListener('click', () => done(false));
    ok.addEventListener('click', () => done(true));
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) done(false); });
  });
}

/** Turn an ApiError into { message, fields } a form can render. */
export function readError(err) {
  if (err && err.name === 'ApiError') return { message: err.message, fields: err.fields || {} };
  console.error(err);
  return { message: t('state.errorBody'), fields: {} };
}

export { db, auth, router, fmt, t };
