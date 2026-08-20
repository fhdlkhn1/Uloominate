/**
 * usersRepo.js — accounts, registration, profile, wishlist.
 * Depends: api.js, db.js
 *
 * REST mapping
 *   GET    /users                  listUsers
 *   GET    /users/:id              getUser
 *   POST   /users                  registerCustomer
 *   PATCH  /users/:id              updateUser
 *   POST   /users/:id/suspend      suspendUser
 *   GET    /me/wishlist            listWishlist
 *   POST   /me/wishlist            toggleWishlist
 */

import { db, simulate, collection, resource, listQuery, notFound, conflict, LATENCY } from '../api.js';

const strip = u => { const c = Object.assign({}, u); delete c.password; delete c.resetToken; c.name = [u.firstName, u.lastName].filter(Boolean).join(' '); return c; };

export async function listUsers(opts = {}) {
  return simulate(() => {
    const out = collection(db.findAll('users', Object.assign(
      listQuery({
        page: opts.page || 1, pageSize: opts.pageSize || 12, q: opts.q,
        searchFields: ['firstName', 'lastName', 'email'],
        sort: opts.sort || 'joinedAt', sortDir: opts.sortDir || 'desc',
      }),
      { filter: { role: opts.role, status: opts.status } }
    )));
    out.data = out.data.map(strip);
    return out;
  }, LATENCY.list);
}

export async function getUser(id) {
  return simulate(() => {
    const u = db.findById('users', id);
    if (!u) throw notFound('User');
    return resource(strip(u));
  });
}

export async function registerCustomer(payload) {
  return simulate(() => db.transaction(() => {
    const email = String(payload.email).trim().toLowerCase();
    if (db.findAll('users', { filter: { email } }).total) {
      throw conflict('email_taken', 'An account already exists with that email address.');
    }
    const user = db.create('users', {
      role: 'customer', firstName: payload.firstName, lastName: payload.lastName,
      email, password: payload.password, avatar: null, status: 'active',
      roleLabel: payload.roleLabel || 'Educator',
      joinedAt: new Date().toISOString(),
    });
    db.create('notifications', {
      userId: user.id, type: 'welcome', read: false, title: 'Welcome to Uloominate',
      body: 'Your account is ready. Browse the catalogue and download your first resource.',
      createdAt: new Date().toISOString(),
    });
    return resource(strip(user));
  }), LATENCY.write);
}

export async function updateUser(id, patch) {
  return simulate(() => {
    if (!db.findById('users', id)) throw notFound('User');
    if (patch.email) {
      const clash = db.findAll('users', { filter: { email: String(patch.email).toLowerCase() } }).rows[0];
      if (clash && clash.id !== id) throw conflict('email_taken', 'That email is already in use.');
    }
    return resource(strip(db.update('users', id, patch)));
  }, LATENCY.write);
}

export async function suspendUser(id, suspended = true) {
  return simulate(() => resource(strip(db.update('users', id, { status: suspended ? 'suspended' : 'active' }))), LATENCY.write);
}

/* ------------------------------------------------------------ wishlist -- */

export async function listWishlist(userId, opts = {}) {
  return simulate(() => {
    const rows = db.findAll('wishlist', { filter: { userId }, sort: [{ field: 'createdAt', dir: 'desc' }] }).rows;
    const items = rows.map(w => {
      const p = db.findById('products', w.productId);
      if (!p) return null;
      const v = db.findById('vendors', p.vendorId);
      return {
        id: w.id, productId: p.id, title: p.title, price: p.price, originalPrice: p.originalPrice,
        cover: p.cover, ratingAvg: p.ratingAvg, ratingCount: p.ratingCount,
        vendorName: v ? v.storeName : '', available: p.status === 'approved', savedAt: w.createdAt,
      };
    }).filter(Boolean);
    const pageSize = opts.pageSize || 12, page = opts.page || 1;
    return {
      data: items.slice((page - 1) * pageSize, page * pageSize),
      meta: { page, pageSize, total: items.length, totalPages: Math.max(1, Math.ceil(items.length / pageSize)) },
    };
  }, LATENCY.list);
}

export async function toggleWishlist(userId, productId) {
  return simulate(() => {
    const existing = db.findAll('wishlist', { filter: { userId, productId } }).rows[0];
    if (existing) { db.remove('wishlist', existing.id); return resource({ saved: false }); }
    db.create('wishlist', { userId, productId, createdAt: new Date().toISOString() });
    return resource({ saved: true });
  }, LATENCY.write);
}

export function isWishlisted(userId, productId) {
  if (!userId) return false;
  return db.findAll('wishlist', { filter: { userId, productId } }).total > 0;
}
