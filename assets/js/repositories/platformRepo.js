/**
 * platformRepo.js — notifications, mailing list, vendor messages, static
 * content, platform settings, and every derived reporting figure.
 * Depends: api.js, db.js, business-rules.js
 *
 * REST mapping
 *   GET   /me/notifications             listNotifications
 *   POST  /notifications/:id/read       markRead
 *   POST  /notifications/read-all       markAllRead
 *   POST  /subscribers                  subscribe
 *   GET   /subscribers                  listSubscribers
 *   GET   /messages                     listMessages
 *   POST  /messages/:id/reply           replyToMessage
 *   GET   /pages/:slug                  getPage
 *   PATCH /pages/:slug                  updatePage
 *   GET   /settings                     getSettings
 *   PATCH /settings/:key                setSetting
 *   GET   /reports/platform             platformStats
 *   GET   /reports/admin-queues         queueCounts
 */

import { db, simulate, collection, resource, listQuery, notFound, conflict, badRequest, LATENCY } from '../api.js';
import { settleLine, planByCode } from '../business-rules.js';

/* -------------------------------------------------------- notifications -- */

export async function listNotifications(userId, opts = {}) {
  return simulate(() => collection(db.findAll('notifications', Object.assign(
    listQuery({ page: opts.page || 1, pageSize: opts.pageSize || 10, sort: 'createdAt', sortDir: 'desc' }),
    { filter: { userId, read: opts.unreadOnly ? false : undefined } }
  ))), LATENCY.read);
}

export function unreadCount(userId) {
  if (!userId) return 0;
  return db.findAll('notifications', { filter: { userId, read: false } }).total;
}

export async function markRead(id) {
  return simulate(() => resource(db.update('notifications', id, { read: true })), 120);
}

export async function markAllRead(userId) {
  return simulate(() => {
    db.transaction(() => db.findAll('notifications', { filter: { userId, read: false } }).rows
      .forEach(n => db.update('notifications', n.id, { read: true })));
    return resource({ ok: true });
  }, 200);
}

/* ---------------------------------------------------------- mailing list -- */

export async function subscribe(email, name) {
  return simulate(() => {
    const clean = String(email).trim().toLowerCase();
    if (db.findAll('subscribers', { filter: { email: clean } }).total) {
      throw conflict('already_subscribed', 'That email is already subscribed.');
    }
    return resource(db.create('subscribers', {
      email: clean, name: name || null, confirmed: false, source: 'landing',
      createdAt: new Date().toISOString(),
    }));
  }, LATENCY.write);
}

export async function listSubscribers(opts = {}) {
  return simulate(() => collection(db.findAll('subscribers', Object.assign(
    listQuery({
      page: opts.page || 1, pageSize: opts.pageSize || 15, q: opts.q,
      searchFields: ['email', 'name'], sort: opts.sort || 'createdAt', sortDir: opts.sortDir || 'desc',
    }),
    { filter: { confirmed: opts.confirmed } }
  ))), LATENCY.list);
}

/* ------------------------------------------------------------- messages -- */

export async function listMessages(opts = {}) {
  return simulate(() => {
    const out = collection(db.findAll('messages', Object.assign(
      listQuery({
        page: opts.page || 1, pageSize: opts.pageSize || 10, q: opts.q,
        searchFields: ['subject', 'body', 'fromName'],
        sort: opts.sort || 'createdAt', sortDir: opts.sortDir || 'desc',
      }),
      { filter: { vendorId: opts.vendorId, kind: opts.kind, status: opts.status } }
    )));
    out.data = out.data.map(m => {
      const p = m.productId ? db.findById('products', m.productId) : null;
      return Object.assign({}, m, { productTitle: p ? p.title : null, productCover: p ? p.cover : null });
    });
    return out;
  }, LATENCY.list);
}

export async function replyToMessage(id, body) {
  return simulate(() => {
    const m = db.findById('messages', id);
    if (!m) throw notFound('Message');
    const replies = (m.replies || []).concat([{ body, at: new Date().toISOString(), from: 'vendor' }]);
    return resource(db.update('messages', id, { replies, status: 'answered' }));
  }, LATENCY.write);
}

export async function createEnquiry({ vendorId, productId, user, subject, body }) {
  return simulate(() => resource(db.create('messages', {
    vendorId, productId: productId || null, fromUserId: user ? user.id : null,
    fromName: user ? user.name : 'Guest', kind: 'enquiry', subject, body,
    status: 'open', createdAt: new Date().toISOString(),
  })), LATENCY.write);
}

/* ---------------------------------------------------------- content/CMS -- */

export async function getPage(slug) {
  return simulate(() => {
    const p = db.findAll('pages', { filter: { slug } }).rows[0];
    if (!p) throw notFound('Page');
    return resource(p);
  }, LATENCY.read);
}

export async function listPages() {
  return simulate(() => collection(db.findAll('pages', { sort: [{ field: 'title', dir: 'asc' }] })), LATENCY.list);
}

export async function updatePage(id, patch) {
  return simulate(() => {
    if (!db.findById('pages', id)) throw notFound('Page');
    return resource(db.update('pages', id, Object.assign({}, patch, { updatedAt: new Date().toISOString() })));
  }, LATENCY.write);
}

/* ------------------------------------------------------------- settings -- */

export function settingSync(key, fallback = null) {
  const row = db.findAll('settings', { filter: { key } }).rows[0];
  return row ? row.value : fallback;
}

export async function getSettings() {
  return simulate(() => collection(db.findAll('settings', { sort: [{ field: 'key', dir: 'asc' }] })), LATENCY.read);
}

/** FR-1.3 — the pre-launch to post-launch switch, no redevelopment needed. */
export async function setSetting(key, value) {
  return simulate(() => {
    const row = db.findAll('settings', { filter: { key } }).rows[0];
    if (!row) throw notFound('Setting');
    return resource(db.update('settings', row.id, { value }));
  }, LATENCY.write);
}

/* ------------------------------------------------------------ reporting -- */

/** GET /reports/platform — commission, sales and vendor performance (FR-12.6). */
export async function platformStats() {
  return simulate(() => {
    const orders = db.findAll('orders').rows;
    const completed = orders.filter(o => o.status === 'completed');
    const vendors = db.findAll('vendors').rows;
    const products = db.findAll('products').rows;

    let gross = 0, commission = 0, vendorEarnings = 0, fees = 0;
    const byMonth = {}, byVendor = {}, byCategory = {};

    for (const o of completed) {
      for (const it of o.items) {
        const v = vendors.find(x => x.id === it.vendorId);
        const split = settleLine({ price: it.price, planCode: v ? v.planCode : 'basic' });
        gross += split.gross; commission += split.commission;
        vendorEarnings += split.vendorEarnings; fees += split.transactionFee;

        const m = o.placedAt.slice(0, 7);
        byMonth[m] = byMonth[m] || { month: m, gross: 0, commission: 0, orders: 0 };
        byMonth[m].gross += split.gross; byMonth[m].commission += split.commission; byMonth[m].orders++;

        byVendor[it.vendorId] = byVendor[it.vendorId] || {
          vendorId: it.vendorId, name: v ? v.storeName : 'Unknown', planCode: v ? v.planCode : null,
          gross: 0, commission: 0, units: 0,
        };
        byVendor[it.vendorId].gross += split.gross;
        byVendor[it.vendorId].commission += split.commission;
        byVendor[it.vendorId].units++;

        const p = products.find(x => x.id === it.productId);
        const key = p ? p.categoryId : 'unknown';
        byCategory[key] = byCategory[key] || { categoryId: key, gross: 0, units: 0 };
        byCategory[key].gross += split.gross;
        byCategory[key].units++;
      }
    }

    const payouts = db.findAll('payouts').rows;

    return resource({
      grossSales: r2(gross),
      commissionEarned: r2(commission),
      vendorEarnings: r2(vendorEarnings),
      transactionFees: r2(fees),
      orderCount: completed.length,
      refundedCount: orders.filter(o => o.status === 'refunded').length,
      averageOrderValue: completed.length ? r2(gross / completed.length) : 0,
      vendorCount: vendors.filter(v => v.status === 'approved').length,
      pendingVendors: vendors.filter(v => v.status === 'pending').length,
      productCount: products.filter(p => p.status === 'approved').length,
      pendingProducts: products.filter(p => p.status === 'pending').length,
      customerCount: db.findAll('users', { filter: { role: 'customer' } }).total,
      subscriberCount: db.findAll('subscribers').total,
      payoutsPending: r2(payouts.filter(p => p.status !== 'paid').reduce((s, p) => s + p.amount, 0)),
      payoutsPaid: r2(payouts.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0)),
      byMonth: Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month))
        .map(m => Object.assign(m, { gross: r2(m.gross), commission: r2(m.commission) })),
      topVendors: Object.values(byVendor).sort((a, b) => b.gross - a.gross).slice(0, 8)
        .map(v => Object.assign(v, { gross: r2(v.gross), commission: r2(v.commission) })),
      byCategory: Object.values(byCategory).sort((a, b) => b.gross - a.gross)
        .map(c => Object.assign(c, { gross: r2(c.gross) })),
      byPlan: ['free', 'basic', 'premium', 'publishers'].map(code => ({
        code, name: planByCode(code).name,
        vendors: vendors.filter(v => v.planCode === code).length,
      })),
    });
  }, LATENCY.list);
}

/** Badge counts for the admin sidebar — synchronous, no spinner in chrome. */
export function queueCountsSync() {
  return {
    vendors: db.findAll('vendors', { filter: { status: 'pending' } }).total,
    products: db.findAll('products', { filter: { status: 'pending' } }).total,
    payouts: db.findAll('payouts', { filter: { status: 'pending' } }).total,
    messages: db.findAll('messages', { filter: { status: 'open' } }).total,
  };
}

function r2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
