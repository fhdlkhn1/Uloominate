/**
 * cartRepo.js — multi-vendor cart. One transaction may hold resources from
 * several vendors (FR-8.1).
 * Depends: api.js, db.js
 *
 * REST mapping
 *   GET    /me/cart            getCart
 *   POST   /me/cart            addToCart
 *   DELETE /me/cart/:id        removeFromCart
 *   DELETE /me/cart            clearCart
 */

import { db, simulate, resource, notFound, conflict, LATENCY } from '../api.js';
import { hasPurchased } from './ordersRepo.js';

/** Guests get a browser-scoped cart under a stable anonymous id. */
const GUEST_KEY = 'uloominate.guestCart.v1';
export function cartOwner(user) {
  if (user) return user.id;
  let id = localStorage.getItem(GUEST_KEY);
  if (!id) { id = 'guest-' + Math.random().toString(36).slice(2, 10); localStorage.setItem(GUEST_KEY, id); }
  return id;
}

function lines(userId) {
  return db.findAll('cart', { filter: { userId }, sort: [{ field: 'createdAt', dir: 'asc' }] }).rows
    .map(row => {
      const p = db.findById('products', row.productId);
      if (!p) return null;
      const v = db.findById('vendors', p.vendorId);
      return {
        id: row.id, productId: p.id, title: p.title, price: p.price,
        originalPrice: p.originalPrice, cover: p.cover, fileType: p.fileType,
        pageCount: p.pageCount, vendorId: p.vendorId,
        vendorName: v ? v.storeName : 'Unknown vendor',
        available: p.status === 'approved',
        addedAt: row.createdAt,
      };
    })
    .filter(Boolean);
}

function totals(items) {
  const subtotal = r2(items.reduce((s, i) => s + i.price, 0));
  return {
    itemCount: items.length,
    vendorCount: new Set(items.map(i => i.vendorId)).size,
    subtotal, discount: 0, total: subtotal,
  };
}

export async function getCart(userId) {
  return simulate(() => {
    const items = lines(userId);
    return resource(Object.assign({ items }, totals(items)));
  }, LATENCY.read);
}

/** Synchronous count for the header badge — no spinner in the chrome. */
export function cartCount(userId) {
  return db.findAll('cart', { filter: { userId } }).total;
}

export async function addToCart(userId, productId, { isCustomer } = {}) {
  return simulate(() => {
    const p = db.findById('products', productId);
    if (!p) throw notFound('Product');
    if (p.status !== 'approved') throw conflict('unavailable', 'That resource is not currently available.');
    if (isCustomer && hasPurchased(userId, productId)) {
      throw conflict('already_owned', 'You already own this resource. Find it in your downloads.');
    }
    if (db.findAll('cart', { filter: { userId, productId } }).total) {
      throw conflict('already_in_cart', 'That resource is already in your cart.');
    }
    db.create('cart', { userId, productId, createdAt: new Date().toISOString() });
    const items = lines(userId);
    return resource(Object.assign({ items }, totals(items)));
  }, LATENCY.write);
}

export async function removeFromCart(userId, lineId) {
  return simulate(() => {
    db.remove('cart', lineId);
    const items = lines(userId);
    return resource(Object.assign({ items }, totals(items)));
  }, LATENCY.write);
}

export async function clearCart(userId) {
  return simulate(() => {
    db.loadCollection('cart', db.findAll('cart').rows.filter(c => c.userId !== userId));
    return resource({ items: [], itemCount: 0, vendorCount: 0, subtotal: 0, discount: 0, total: 0 });
  }, LATENCY.write);
}

/** Move a guest cart onto a real account at sign-in. */
export function mergeGuestCart(userId) {
  const guestId = localStorage.getItem(GUEST_KEY);
  if (!guestId) return 0;
  const guestLines = db.findAll('cart', { filter: { userId: guestId } }).rows;
  let moved = 0;
  for (const l of guestLines) {
    if (!db.findAll('cart', { filter: { userId, productId: l.productId } }).total) {
      db.update('cart', l.id, { userId }); moved++;
    } else db.remove('cart', l.id);
  }
  return moved;
}

function r2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
