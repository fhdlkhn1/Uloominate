/**
 * auth.js — simulated but real session handling, guards and role checks.
 *
 * Purpose:   login validates against seeded users, stores a session, and every
 *            protected page calls requireRole() on load. Direct URL access to a
 *            page the role cannot use is redirected, not merely hidden.
 * Depends:   db.js, api.js, router.js, i18n.js
 *
 * TODO(backend): swap the credential check for POST /auth/login and store the
 * returned token instead of the user id. requireRole() keeps its signature.
 */

import * as db from './db.js';
import { ApiError, unauthorized, forbidden, simulate, resource, LATENCY } from './api.js';
import { ROUTES, url } from './router.js';
import { t } from './i18n.js';

const SESSION_KEY = 'uloominate.session.v1';

export const ROLES = ['guest', 'customer', 'vendor', 'admin'];

/** Which roles may open which route. Absent = public. */
export const ROUTE_ACCESS = {
  accountOrders: ['customer', 'vendor', 'admin'],
  accountDownloads: ['customer', 'vendor', 'admin'],
  accountWishlist: ['customer', 'vendor', 'admin'],
  accountReviews: ['customer', 'vendor', 'admin'],
  accountFollowing: ['customer', 'vendor', 'admin'],
  accountProfile: ['customer', 'vendor', 'admin'],
  checkout: ['customer', 'vendor', 'admin'],

  vendorDashboard: ['vendor', 'admin'],
  vendorProducts: ['vendor', 'admin'],
  vendorProductEdit: ['vendor', 'admin'],
  vendorOrders: ['vendor', 'admin'],
  vendorPayments: ['vendor', 'admin'],
  vendorCoupons: ['vendor', 'admin'],
  vendorCustomers: ['vendor', 'admin'],
  vendorMessages: ['vendor', 'admin'],
  vendorReports: ['vendor', 'admin'],
  vendorMedia: ['vendor', 'admin'],
  vendorSubscription: ['vendor', 'admin'],
  vendorStoreProfile: ['vendor', 'admin'],
  storeSetup: ['vendor', 'admin'],
  vendorPending: ['vendor', 'admin'],

  adminDashboard: ['admin'],
  adminVendorQueue: ['admin'],
  adminProductQueue: ['admin'],
  adminVendors: ['admin'],
  adminCatalogue: ['admin'],
  adminOrders: ['admin'],
  adminPayouts: ['admin'],
  adminPlans: ['admin'],
  adminReports: ['admin'],
  adminContent: ['admin'],
};

function readSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; }
  catch { return null; }
}

function writeSession(s) {
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new CustomEvent('uloominate:session', { detail: s }));
}

/** The signed-in user record, or null. Includes `vendor` when role is vendor. */
export function currentUser() {
  const s = readSession();
  if (!s) return null;
  const user = db.findById('users', s.userId);
  if (!user || user.status === 'suspended') { writeSession(null); return null; }
  const safe = Object.assign({}, user);
  delete safe.password;
  safe.name = [user.firstName, user.lastName].filter(Boolean).join(' ');
  if (user.role === 'vendor' && user.vendorId) safe.vendor = db.findById('vendors', user.vendorId);
  return safe;
}

export function currentRole() {
  const u = currentUser();
  return u ? u.role : 'guest';
}

export function isSignedIn() { return !!currentUser(); }

export function can(...roles) { return roles.includes(currentRole()); }

/** POST /auth/login */
export async function login(email, password) {
  return simulate(() => {
    const user = db.findAll('users', { filter: { email: String(email || '').trim().toLowerCase() } }).rows[0];
    if (!user || user.password !== password) throw new ApiError(401, 'invalid_credentials', t('auth.invalidCredentials'));
    if (user.status === 'suspended') throw new ApiError(403, 'account_suspended', t('auth.accountSuspended'));
    writeSession({ userId: user.id, role: user.role, startedAt: new Date().toISOString() });
    return resource(currentUser());
  }, LATENCY.write);
}

/** POST /auth/logout */
export async function logout() {
  writeSession(null);
  return { data: { ok: true } };
}

/** Switch identity without credentials — dev toolbar only. */
export function impersonate(userId) {
  const user = db.findById('users', userId);
  if (!user) throw new ApiError(404, 'not_found', 'No such demo user');
  writeSession({ userId: user.id, role: user.role, startedAt: new Date().toISOString(), impersonated: true });
  return currentUser();
}

/** POST /auth/password/forgot */
export async function requestPasswordReset(email) {
  return simulate(() => {
    const user = db.findAll('users', { filter: { email: String(email || '').trim().toLowerCase() } }).rows[0];
    const token = 'reset-' + Math.random().toString(36).slice(2, 10);
    if (user) db.update('users', user.id, { resetToken: token, resetRequestedAt: new Date().toISOString() });
    return resource({ sent: true, token: user ? token : null });
  }, LATENCY.write);
}

/** POST /auth/password/reset */
export async function resetPassword(token, password) {
  return simulate(() => {
    const user = db.findAll('users', { filter: { resetToken: token } }).rows[0];
    if (!user) throw new ApiError(400, 'invalid_token', 'That reset link is invalid or has already been used.');
    db.update('users', user.id, { password, resetToken: null });
    return resource({ ok: true });
  }, LATENCY.write);
}

/**
 * Page guard. Call at the top of every protected page's logic class.
 *   requireRole('vendor', 'admin')  -> redirects to login or 403 and returns null
 * Returns the user when access is allowed.
 */
export function requireRole(...roles) {
  const user = currentUser();
  if (!user) {
    const back = encodeURIComponent(location.pathname.split('/').pop() + location.search);
    location.replace(url('login', { next: back, reason: 'session' }));
    return null;
  }
  if (roles.length && !roles.includes(user.role)) {
    location.replace(ROUTES.forbidden);
    return null;
  }
  return user;
}

/** Guard by route name, using ROUTE_ACCESS. */
export function guardRoute(routeName) {
  const allowed = ROUTE_ACCESS[routeName];
  if (!allowed) return currentUser();
  return requireRole(...allowed);
}

/** A vendor may only publish once approved (BRD §5.4, PRD FR-2.4). */
export function vendorCanPublish(user) {
  return !!(user && user.role === 'vendor' && user.vendor && user.vendor.status === 'approved');
}

export function onSessionChange(fn) {
  const h = e => fn(e.detail);
  window.addEventListener('uloominate:session', h);
  return () => window.removeEventListener('uloominate:session', h);
}

export { unauthorized, forbidden };
