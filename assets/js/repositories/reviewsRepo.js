/**
 * reviewsRepo.js — ratings, distribution and individual reviews (FR-7.7).
 * Depends: api.js, db.js, ordersRepo.js
 *
 * REST mapping
 *   GET  /products/:id/reviews      listReviews
 *   GET  /products/:id/rating       ratingSummary
 *   POST /products/:id/reviews      createReview
 *   GET  /me/reviews                listMyReviews
 *   DELETE /reviews/:id             deleteReview
 */

import { db, simulate, collection, resource, listQuery, notFound, forbidden, conflict, LATENCY } from '../api.js';
import { hasPurchased } from './ordersRepo.js';

export async function listReviews(productId, opts = {}) {
  return simulate(() => {
    const { page = 1, pageSize = 3, sort = 'createdAt', sortDir = 'desc', rating } = opts;
    return collection(db.findAll('reviews', Object.assign(
      listQuery({ page, pageSize, sort, sortDir }),
      { filter: { productId, status: 'published', rating: rating ? Number(rating) : undefined } }
    )));
  }, LATENCY.list);
}

export async function listMyReviews(userId, opts = {}) {
  return simulate(() => {
    const out = collection(db.findAll('reviews', Object.assign(
      listQuery({ page: opts.page || 1, pageSize: opts.pageSize || 10, sort: 'createdAt', sortDir: 'desc' }),
      { filter: { userId } }
    )));
    out.data = out.data.map(r => {
      const p = db.findById('products', r.productId);
      return Object.assign({}, r, { productTitle: p ? p.title : 'Removed resource', productCover: p ? p.cover : null });
    });
    return out;
  }, LATENCY.list);
}

/** GET /products/:id/rating — aggregate score plus the five-bar distribution. */
export async function ratingSummary(productId) {
  return simulate(() => {
    const p = db.findById('products', productId);
    if (!p) throw notFound('Product');
    const rows = db.findAll('reviews', { filter: { productId, status: 'published' } }).rows;

    // Seeded products carry an authored breakdown so the design page matches
    // its Figma reference exactly; user-created ones compute from reviews.
    if (p.ratingBreakdown) {
      return resource({
        average: p.ratingAvg, count: p.ratingCount,
        distribution: [5, 4, 3, 2, 1].map(star => ({ star, pct: p.ratingBreakdown[star] || 0 })),
      });
    }
    const count = rows.length;
    const average = count ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : 0;
    return resource({
      average, count,
      distribution: [5, 4, 3, 2, 1].map(star => ({
        star, pct: count ? Math.round(rows.filter(r => r.rating === star).length / count * 100) : 0,
      })),
    });
  }, LATENCY.read);
}

export async function createReview(productId, user, { rating, body }) {
  return simulate(() => db.transaction(() => {
    const p = db.findById('products', productId);
    if (!p) throw notFound('Product');
    if (!user) throw forbidden('Sign in to leave a review.');
    if (!hasPurchased(user.id, productId)) {
      throw forbidden('You can review a resource once you have purchased it.');
    }
    if (db.findAll('reviews', { filter: { productId, userId: user.id } }).total) {
      throw conflict('already_reviewed', 'You have already reviewed this resource.');
    }
    const row = db.create('reviews', {
      productId, userId: user.id, name: user.name, roleLabel: user.roleLabel || 'Educator',
      avatar: user.avatar || null, rating: Number(rating), body, status: 'published',
      createdAt: new Date().toISOString(),
    });
    recalc(productId);
    return resource(row);
  }), LATENCY.write);
}

export async function deleteReview(id, user) {
  return simulate(() => {
    const r = db.findById('reviews', id);
    if (!r) throw notFound('Review');
    if (user.role !== 'admin' && r.userId !== user.id) throw forbidden();
    db.remove('reviews', id);
    recalc(r.productId);
    return resource({ id, deleted: true });
  }, LATENCY.write);
}

function recalc(productId) {
  const p = db.findById('products', productId);
  if (!p || p.ratingBreakdown) return; // authored breakdowns are left alone
  const rows = db.findAll('reviews', { filter: { productId, status: 'published' } }).rows;
  const count = rows.length;
  db.update('products', productId, {
    ratingCount: count,
    ratingAvg: count ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : 0,
  });
}
