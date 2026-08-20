/**
 * vendorsRepo.js — vendor accounts, the approval queue, and store profiles.
 * Depends: api.js, db.js, business-rules.js
 *
 * REST mapping
 *   GET   /vendors                  listVendors
 *   GET   /vendors/:id              getVendor
 *   GET   /vendors/slug/:slug       getVendorBySlug
 *   POST  /vendors                  registerVendor
 *   PATCH /vendors/:id              updateVendor
 *   POST  /vendors/:id/approve      approveVendor
 *   POST  /vendors/:id/decline      declineVendor
 *   POST  /vendors/:id/suspend      suspendVendor
 *   POST  /vendors/:id/reinstate    reinstateVendor
 *   GET   /vendors/:id/stats        vendorStats
 */

import { db, simulate, collection, resource, listQuery, notFound, conflict, LATENCY } from '../api.js';
import { planByCode, settleLine } from '../business-rules.js';

function decorate(v) {
  if (!v) return v;
  const plan = planByCode(v.planCode);
  const products = db.findAll('products', { filter: { vendorId: v.id } }).rows;
  return Object.assign({}, v, {
    planName: plan.name,
    planPrice: plan.priceLabel,
    payoutRate: plan.payoutRate,
    productCount: products.filter(p => p.status === 'approved').length,
    pendingCount: products.filter(p => p.status === 'pending').length,
    draftCount: products.filter(p => p.status === 'draft').length,
  });
}

export async function listVendors(opts = {}) {
  return simulate(() => {
    const { status, planCode, q, page = 1, pageSize = 12, sort = 'joinedAt', sortDir = 'desc' } = opts;
    const result = db.findAll('vendors', Object.assign(
      listQuery({ page, pageSize, q, searchFields: ['storeName', 'owner', 'email', 'country'], sort, sortDir }),
      { filter: { status, planCode } }
    ));
    const out = collection(result);
    out.data = out.data.map(decorate);
    return out;
  }, LATENCY.list);
}

export async function getVendor(id) {
  return simulate(() => {
    const v = db.findById('vendors', id);
    if (!v) throw notFound('Vendor');
    return resource(decorate(v));
  });
}

export async function getVendorBySlug(slug) {
  return simulate(() => {
    const v = db.findAll('vendors', { filter: { slug } }).rows[0];
    if (!v) throw notFound('Vendor');
    return resource(decorate(v));
  });
}

/** POST /vendors — registration puts the store in `pending` (FR-2.4). */
export async function registerVendor(payload) {
  return simulate(() => db.transaction(() => {
    const email = String(payload.email).trim().toLowerCase();
    if (db.findAll('users', { filter: { email } }).total) {
      throw conflict('email_taken', 'An account already exists with that email address.');
    }
    const slug = slugify(payload.storeName);
    if (db.findAll('vendors', { filter: { slug } }).total) {
      throw conflict('store_name_taken', 'A store with a very similar name already exists. Try another.');
    }
    const vendor = db.create('vendors', {
      slug, storeName: payload.storeName,
      owner: [payload.firstName, payload.lastName].filter(Boolean).join(' '),
      email, planCode: payload.planCode, status: 'pending', followers: 0,
      logo: null, banner: null, bio: payload.bio || '',
      country: payload.country || null, payoutMethod: null, payoutAccount: null,
      joinedAt: new Date().toISOString(), setupComplete: false,
    });
    const user = db.create('users', {
      role: 'vendor', vendorId: vendor.id,
      firstName: payload.firstName, lastName: payload.lastName,
      email, password: payload.password, avatar: null, status: 'active',
      joinedAt: vendor.joinedAt,
    });
    db.create('subscriptions', {
      vendorId: vendor.id, planCode: payload.planCode, status: 'pending',
      promoActive: true, freeUntil: '2027-01-01', nextBillingDate: '2027-01-02',
      nextBillingAmount: planByCode(payload.planCode).annualFee,
      paymentMethod: null, startedAt: new Date().toISOString(), cancelledAt: null,
    });
    db.create('notifications', {
      userId: user.id, type: 'vendor_registration', read: false,
      title: 'Registration received',
      body: 'Your vendor registration is with an administrator for review against our content standard.',
      createdAt: new Date().toISOString(),
    });
    db.create('notifications', {
      userId: 'u-admin', type: 'vendor_pending', read: false,
      title: 'New vendor awaiting review',
      body: payload.storeName + ' registered on the ' + planByCode(payload.planCode).name + ' tier.',
      createdAt: new Date().toISOString(),
    });
    return resource({ vendor: decorate(vendor), user: Object.assign({}, user, { password: undefined }) });
  }), LATENCY.write);
}

export async function updateVendor(id, patch) {
  return simulate(() => {
    if (!db.findById('vendors', id)) throw notFound('Vendor');
    return resource(decorate(db.update('vendors', id, patch)));
  }, LATENCY.write);
}

export async function approveVendor(id, adminId) {
  return simulate(() => db.transaction(() => {
    const v = db.findById('vendors', id);
    if (!v) throw notFound('Vendor');
    const row = db.update('vendors', id, {
      status: 'approved', reviewedBy: adminId, reviewedAt: new Date().toISOString(),
      declineReason: null,
    });
    const sub = db.findAll('subscriptions', { filter: { vendorId: id } }).rows[0];
    if (sub) db.update('subscriptions', sub.id, { status: 'active' });
    const user = db.findAll('users', { filter: { vendorId: id } }).rows[0];
    if (user) db.create('notifications', {
      userId: user.id, type: 'vendor_approved', read: false,
      title: 'Your vendor account is approved',
      body: 'Your store is active. Complete your store setup and publish your first resource.',
      createdAt: new Date().toISOString(),
    });
    return resource(decorate(row));
  }), LATENCY.write);
}

export async function declineVendor(id, adminId, reason, note) {
  return simulate(() => db.transaction(() => {
    if (!db.findById('vendors', id)) throw notFound('Vendor');
    const row = db.update('vendors', id, {
      status: 'declined', declineReason: reason, declineNote: note || null,
      reviewedBy: adminId, reviewedAt: new Date().toISOString(),
    });
    const user = db.findAll('users', { filter: { vendorId: id } }).rows[0];
    if (user) db.create('notifications', {
      userId: user.id, type: 'vendor_declined', read: false,
      title: 'Your vendor registration was declined',
      body: reason, createdAt: new Date().toISOString(),
    });
    return resource(decorate(row));
  }), LATENCY.write);
}

export async function suspendVendor(id, reason) {
  return simulate(() => {
    if (!db.findById('vendors', id)) throw notFound('Vendor');
    return resource(decorate(db.update('vendors', id, { status: 'suspended', suspendReason: reason || null })));
  }, LATENCY.write);
}

export async function reinstateVendor(id) {
  return simulate(() => resource(decorate(db.update('vendors', id, { status: 'approved', suspendReason: null }))), LATENCY.write);
}

/** GET /vendors/:id/stats — every figure derived from stored orders. */
export async function vendorStats(vendorId) {
  return simulate(() => {
    const orders = db.findAll('orders', { filter: { status: 'completed' } }).rows;
    const vendor = db.findById('vendors', vendorId);
    if (!vendor) throw notFound('Vendor');

    let gross = 0, earnings = 0, fees = 0, commission = 0, unitsSold = 0;
    const byProduct = {};
    const byMonth = {};
    const customers = new Set();

    for (const o of orders) {
      for (const it of o.items) {
        if (it.vendorId !== vendorId) continue;
        const split = settleLine({ price: it.price, planCode: vendor.planCode });
        gross += split.gross; earnings += split.vendorEarnings;
        fees += split.transactionFee; commission += split.commission;
        unitsSold++; customers.add(o.customerId);
        byProduct[it.productId] = byProduct[it.productId] || { productId: it.productId, title: it.title, units: 0, revenue: 0 };
        byProduct[it.productId].units++;
        byProduct[it.productId].revenue += split.gross;
        const m = o.placedAt.slice(0, 7);
        byMonth[m] = byMonth[m] || { month: m, gross: 0, earnings: 0, orders: 0 };
        byMonth[m].gross += split.gross;
        byMonth[m].earnings += split.vendorEarnings;
        byMonth[m].orders++;
      }
    }

    const paidOut = db.findAll('payouts', { filter: { vendorId } }).rows
      .filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);

    const products = db.findAll('products', { filter: { vendorId } }).rows;

    return resource({
      grossSales: r2(gross),
      earnings: r2(earnings),
      commission: r2(commission),
      transactionFees: r2(fees),
      withdrawable: r2(Math.max(0, earnings - paidOut)),
      paidOut: r2(paidOut),
      ordersReceived: orders.filter(o => o.items.some(i => i.vendorId === vendorId)).length,
      unitsSold,
      customerCount: customers.size,
      productCount: products.filter(p => p.status === 'approved').length,
      pendingCount: products.filter(p => p.status === 'pending').length,
      draftCount: products.filter(p => p.status === 'draft').length,
      declinedCount: products.filter(p => p.status === 'declined').length,
      followers: vendor.followers,
      topProducts: Object.values(byProduct).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
        .map(p => Object.assign(p, { revenue: r2(p.revenue) })),
      byMonth: Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month))
        .map(m => Object.assign(m, { gross: r2(m.gross), earnings: r2(m.earnings) })),
    });
  }, LATENCY.list);
}

/** POST /vendors/:id/follow — toggles, returns the new state. */
export async function toggleFollow(vendorId, userId) {
  return simulate(() => db.transaction(() => {
    const existing = db.findAll('follows', { filter: { vendorId, userId } }).rows[0];
    const vendor = db.findById('vendors', vendorId);
    if (!vendor) throw notFound('Vendor');
    if (existing) {
      db.remove('follows', existing.id);
      db.update('vendors', vendorId, { followers: Math.max(0, vendor.followers - 1) });
      return resource({ following: false, followers: Math.max(0, vendor.followers - 1) });
    }
    db.create('follows', { vendorId, userId, createdAt: new Date().toISOString() });
    db.update('vendors', vendorId, { followers: vendor.followers + 1 });
    return resource({ following: true, followers: vendor.followers + 1 });
  }), LATENCY.write);
}

export async function listFollowing(userId) {
  return simulate(() => {
    const rows = db.findAll('follows', { filter: { userId } }).rows;
    return { data: rows.map(f => decorate(db.findById('vendors', f.vendorId))).filter(Boolean), meta: { total: rows.length } };
  }, LATENCY.list);
}

function slugify(s) {
  return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function r2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
