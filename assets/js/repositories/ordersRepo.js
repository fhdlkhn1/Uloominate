/**
 * ordersRepo.js — checkout, order history, downloads and refunds.
 * Depends: api.js, db.js, business-rules.js
 *
 * REST mapping
 *   GET  /orders                 listOrders
 *   GET  /orders/:id             getOrder
 *   POST /orders                 placeOrder            (checkout)
 *   POST /orders/:id/refund      refundOrder
 *   GET  /me/downloads           listDownloads
 *   GET  /orders/:id/download    downloadUrl           (protected delivery)
 */

import { db, simulate, collection, resource, listQuery, notFound, forbidden, badRequest, conflict, LATENCY } from '../api.js';
import { settleLine, planByCode } from '../business-rules.js';

function decorate(o) {
  if (!o) return o;
  return Object.assign({}, o, {
    itemCount: o.items.length,
    vendorNames: [...new Set(o.items.map(i => {
      const v = db.findById('vendors', i.vendorId);
      return v ? v.storeName : 'Unknown';
    }))],
  });
}

export async function listOrders(opts = {}) {
  return simulate(() => {
    const { customerId, vendorId, status, q, page = 1, pageSize = 12, sort = 'placedAt', sortDir = 'desc' } = opts;
    const result = db.findAll('orders', Object.assign(
      listQuery({ page, pageSize, q, searchFields: ['reference', 'customerName', 'customerEmail'], sort, sortDir }),
      {
        filter: { customerId, status },
        where: vendorId ? o => o.items.some(i => i.vendorId === vendorId) : undefined,
      }
    ));
    const out = collection(result);
    out.data = out.data.map(o => {
      const d = decorate(o);
      if (vendorId) {
        const mine = o.items.filter(i => i.vendorId === vendorId);
        const vendor = db.findById('vendors', vendorId);
        d.vendorItems = mine;
        d.vendorGross = r2(mine.reduce((s, i) => s + i.price, 0));
        d.vendorEarnings = r2(mine.reduce((s, i) => s + settleLine({ price: i.price, planCode: vendor.planCode }).vendorEarnings, 0));
      }
      return d;
    });
    return out;
  }, LATENCY.list);
}

export async function getOrder(id) {
  return simulate(() => {
    const o = db.findById('orders', id);
    if (!o) throw notFound('Order');
    return resource(decorate(o));
  });
}

/**
 * POST /orders — digital-only checkout. No shipping step (FR-8.2).
 * Splits value across vendors with per-tier commission (FR-8.6) and makes the
 * resource downloadable immediately (FR-8.4).
 */
export async function placeOrder({ customerId, items, couponCode, paymentMethod, simulateFailure }) {
  return simulate(() => db.transaction(() => {
    if (!items || !items.length) throw badRequest('Your cart is empty.');
    if (simulateFailure) throw new (Object.getPrototypeOf(notFound()).constructor)(402, 'payment_failed', 'The payment could not be completed. No charge was made.');

    const user = db.findById('users', customerId);
    if (!user) throw forbidden('Sign in to complete your purchase.');

    const owned = new Set();
    db.findAll('orders', { filter: { customerId, status: 'completed' } }).rows
      .forEach(o => o.items.forEach(i => owned.add(i.productId)));

    const lines = [];
    for (const it of items) {
      const p = db.findById('products', it.productId);
      if (!p) throw notFound('Product');
      if (p.status !== 'approved') throw conflict('unavailable', '"' + p.title + '" is no longer available.');
      if (owned.has(p.id)) throw conflict('already_owned', 'You already own "' + p.title + '". Find it in your downloads.');
      const vendor = db.findById('vendors', p.vendorId);
      lines.push({
        productId: p.id, vendorId: p.vendorId, title: p.title, price: p.price,
        cover: p.cover, planCode: vendor.planCode, fileName: p.fileName, fileKey: p.fileKey,
      });
    }

    const subtotal = r2(lines.reduce((s, l) => s + l.price, 0));
    let discount = 0;
    let coupon = null;
    if (couponCode) {
      coupon = db.findAll('coupons', { filter: { code: String(couponCode).toUpperCase() } }).rows[0];
      if (!coupon) throw badRequest('That coupon code was not recognised.', { couponCode: 'Unknown code' });
      if (coupon.status !== 'active') throw badRequest('That coupon is no longer valid.', { couponCode: 'Expired or fully used' });
      if (subtotal < (coupon.minSpend || 0)) throw badRequest('Spend at least $' + coupon.minSpend.toFixed(2) + ' to use this coupon.', { couponCode: 'Minimum spend not met' });
      discount = coupon.type === 'percent' ? r2(subtotal * coupon.value / 100) : Math.min(subtotal, coupon.value);
    }

    const total = r2(Math.max(0, subtotal - discount));
    const ref = 'ULM-' + (26000 + db.findAll('orders').total + 1);

    const order = db.create('orders', {
      reference: ref, customerId, customerName: [user.firstName, user.lastName].join(' '),
      customerEmail: user.email, items: lines, subtotal, discount: r2(discount), total,
      couponCode: coupon ? coupon.code : null, status: 'completed',
      paymentMethod: paymentMethod || 'Card ••••4242', placedAt: new Date().toISOString(),
    });

    if (coupon) db.update('coupons', coupon.id, {
      used: coupon.used + 1,
      status: coupon.usageLimit && coupon.used + 1 >= coupon.usageLimit ? 'exhausted' : coupon.status,
    });

    // Download counters and vendor sale notifications (FR-7.8, FR-11.3).
    const notifiedVendors = new Set();
    for (const l of lines) {
      const p = db.findById('products', l.productId);
      db.update('products', l.productId, { downloads: (p.downloads || 0) + 1 });
      if (!notifiedVendors.has(l.vendorId)) {
        notifiedVendors.add(l.vendorId);
        const vu = db.findAll('users', { filter: { vendorId: l.vendorId } }).rows[0];
        const split = settleLine({ price: l.price, planCode: l.planCode });
        if (vu) db.create('notifications', {
          userId: vu.id, type: 'sale', read: false, title: 'You made a sale',
          body: '"' + l.title + '" sold for $' + l.price.toFixed(2) + '. Your earnings: $' + split.vendorEarnings.toFixed(2) + '.',
          createdAt: new Date().toISOString(),
        });
      }
    }

    db.create('notifications', {
      userId: customerId, type: 'order', read: false, title: 'Your resources are ready',
      body: 'Order ' + ref + ' is complete. Download your files any time from your account.',
      createdAt: new Date().toISOString(),
    });

    db.loadCollection('cart', db.findAll('cart').rows.filter(c => c.userId !== customerId));

    return resource(decorate(order));
  }), LATENCY.write + 400);
}

export async function refundOrder(id, reason) {
  return simulate(() => {
    const o = db.findById('orders', id);
    if (!o) throw notFound('Order');
    if (o.status !== 'completed') throw conflict('not_refundable', 'Only completed orders can be refunded.');
    return resource(decorate(db.update('orders', id, {
      status: 'refunded', refundReason: reason || null, refundedAt: new Date().toISOString(),
    })));
  }, LATENCY.write);
}

/** GET /me/downloads — unlimited re-download of everything purchased (FR-9.2). */
export async function listDownloads(customerId, opts = {}) {
  return simulate(() => {
    const orders = db.findAll('orders', { filter: { customerId, status: 'completed' } }).rows;
    const seen = new Map();
    for (const o of orders) {
      for (const it of o.items) {
        if (seen.has(it.productId)) continue;
        const p = db.findById('products', it.productId);
        seen.set(it.productId, {
          productId: it.productId, title: it.title, cover: it.cover,
          fileName: it.fileName || (p && p.fileName), fileKey: it.fileKey || (p && p.fileKey),
          fileType: p ? p.fileType : 'PDF', fileSizeMb: p ? p.fileSizeMb : null,
          pageCount: p ? p.pageCount : null,
          orderId: o.id, orderReference: o.reference, purchasedAt: o.placedAt,
          vendorId: it.vendorId, available: !!p && p.status !== 'unpublished',
        });
      }
    }
    let rows = [...seen.values()].sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
    if (opts.q) {
      const q = opts.q.toLowerCase();
      rows = rows.filter(r => r.title.toLowerCase().includes(q));
    }
    const pageSize = opts.pageSize || 12;
    const page = opts.page || 1;
    return {
      data: rows.slice((page - 1) * pageSize, page * pageSize),
      meta: { page, pageSize, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / pageSize)) },
    };
  }, LATENCY.list);
}

/**
 * GET /orders/:orderId/download?productId= — protected delivery (FR-10.2/10.3).
 * Verifies purchase, then mints a single-use, expiring token. Nothing about the
 * real file path is exposed to the client.
 */
export async function downloadUrl(customerId, productId) {
  return simulate(() => {
    const owns = db.findAll('orders', { filter: { customerId, status: 'completed' } }).rows
      .some(o => o.items.some(i => i.productId === productId));
    if (!owns) throw forbidden('This resource is only available to purchasers.');
    const token = 'dl_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    return resource({
      token,
      expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
      // TODO(backend): this becomes a signed URL from the external storage
      // workspace (BRD OI-8). It must not be derivable from the product id.
      href: 'about:blank#' + token,
    });
  }, LATENCY.read);
}

/** Has this customer bought this product? Gates the review form (FR-9.4). */
export function hasPurchased(customerId, productId) {
  if (!customerId) return false;
  return db.findAll('orders', { filter: { customerId, status: 'completed' } }).rows
    .some(o => o.items.some(i => i.productId === productId));
}

function r2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
