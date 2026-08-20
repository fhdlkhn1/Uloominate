/**
 * productsRepo.js — catalogue reads and the full submission/moderation cycle.
 * Depends: api.js, db.js, business-rules.js
 *
 * REST mapping
 *   GET    /products                 listProducts
 *   GET    /products/:id             getProduct
 *   POST   /products                 createProduct
 *   PATCH  /products/:id             updateProduct
 *   DELETE /products/:id             deleteProduct
 *   POST   /products/:id/submit      submitProduct
 *   POST   /products/:id/approve     approveProduct
 *   POST   /products/:id/decline     declineProduct
 *   POST   /products/:id/unpublish   unpublishProduct
 *   POST   /products/:id/duplicate   duplicateProduct
 */

import { db, simulate, collection, resource, listQuery, notFound, conflict, LATENCY } from '../api.js';
import { uploadAllowance, categoryById } from '../business-rules.js';

const SEARCH_FIELDS = ['title', 'description', 'subject', 'resourceType', 'tags'];

function decorate(p) {
  if (!p) return p;
  const vendor = db.findById('vendors', p.vendorId);
  const category = categoryById(p.categoryId);
  return Object.assign({}, p, {
    vendorName: vendor ? vendor.storeName : 'Unknown vendor',
    vendorSlug: vendor ? vendor.slug : null,
    vendorLogo: vendor ? vendor.logo : null,
    vendorFollowers: vendor ? vendor.followers : 0,
    categoryName: category ? category.name : '',
    categorySlug: category ? category.slug : '',
    categoryTint: category ? category.tint : '#F2FAF7',
    isFree: !p.price,
    discountPct: p.originalPrice && p.price
      ? Math.round((1 - p.price / p.originalPrice) * 100) : null,
    gradeLabel: p.gradeFrom === p.gradeTo ? p.gradeFrom : p.gradeFrom + ' – ' + p.gradeTo,
  });
}

function countPublished(vendorId) {
  return db.findAll('products', { filter: { vendorId, status: 'approved' } }).total;
}

/**
 * listProducts({ page, pageSize, q, status, vendorId, categoryIds, subjects,
 *                grades, resourceTypes, themes, priceMin, priceMax, freeOnly,
 *                sort })
 * sort: relevance | newest | price_asc | price_desc | rating | downloads | title
 */
export async function listProducts(opts = {}) {
  return simulate(() => {
    const {
      status = 'approved', vendorId, categoryIds, subjects, grades, resourceTypes,
      themes, priceMin, priceMax, freeOnly, sort = 'newest', page = 1, pageSize = 12, q,
    } = opts;

    const sortMap = {
      newest: { field: 'publishedAt', dir: 'desc' },
      oldest: { field: 'publishedAt', dir: 'asc' },
      price_asc: { field: 'price', dir: 'asc' },
      price_desc: { field: 'price', dir: 'desc' },
      rating: { field: 'ratingAvg', dir: 'desc' },
      downloads: { field: 'downloads', dir: 'desc' },
      title: { field: 'title', dir: 'asc' },
      relevance: { field: 'ratingCount', dir: 'desc' },
    };
    const s = sortMap[sort] || sortMap.newest;

    const result = db.findAll('products', Object.assign(listQuery({
      page, pageSize, q, searchFields: SEARCH_FIELDS,
      sort: s.field, sortDir: s.dir,
    }), {
      filter: {
        status: Array.isArray(status) ? status : (status === 'any' ? undefined : status),
        vendorId,
      },
      where: p => {
        if (categoryIds && categoryIds.length && !categoryIds.includes(p.categoryId)) return false;
        if (subjects && subjects.length && !subjects.includes(p.subject)) return false;
        if (resourceTypes && resourceTypes.length && !resourceTypes.includes(p.resourceType)) return false;
        if (themes && themes.length && !themes.includes(p.theme)) return false;
        if (grades && grades.length && !grades.includes(p.gradeFrom) && !grades.includes(p.gradeTo)) return false;
        if (freeOnly && p.price !== 0) return false;
        if (priceMin != null && priceMin !== '' && p.price < Number(priceMin)) return false;
        if (priceMax != null && priceMax !== '' && p.price > Number(priceMax)) return false;
        return true;
      },
    }));

    const out = collection(result);
    out.data = out.data.map(decorate);
    return out;
  }, LATENCY.list);
}

export async function getProduct(id) {
  return simulate(() => {
    const p = db.findById('products', id);
    if (!p) throw notFound('Product');
    const full = decorate(p);
    full.vendorProductCount = countPublished(p.vendorId);
    return resource(full);
  });
}

/** GET /products/:id/related — same category, excluding itself. */
export async function relatedProducts(id, limit = 4) {
  return simulate(() => {
    const p = db.findById('products', id);
    if (!p) throw notFound('Product');
    const rows = db.findAll('products', {
      filter: { status: 'approved' },
      where: r => r.id !== id && r.categoryId === p.categoryId,
      sort: [{ field: 'downloads', dir: 'desc' }],
    }).rows;
    const fill = rows.length >= limit ? rows : rows.concat(
      db.findAll('products', { filter: { status: 'approved' }, where: r => r.id !== id && r.categoryId !== p.categoryId }).rows
    );
    return { data: fill.slice(0, limit).map(decorate) };
  });
}

/** GET /vendors/:id/upload-allowance — drives the cap message at FR-3.2. */
export function checkAllowance(vendorId) {
  const vendor = db.findById('vendors', vendorId);
  if (!vendor) throw notFound('Vendor');
  const paidCount = db.findAll('products', {
    filter: { vendorId },
    where: p => p.price > 0 && ['approved', 'pending', 'draft'].includes(p.status),
  }).total;
  return uploadAllowance(vendor, paidCount);
}

export async function createProduct(vendorId, payload) {
  return simulate(() => {
    if (payload.price > 0) {
      const allow = checkAllowance(vendorId);
      if (!allow.allowed) throw conflict(allow.reason, allow.reason === 'plan_free_no_paid_listings'
        ? 'The Pioneer Vendor plan does not permit paid listings.'
        : 'You have reached the paid-resource limit for your plan.');
    }
    const row = db.create('products', Object.assign({
      vendorId, status: 'draft', downloads: 0, ratingAvg: 0, ratingCount: 0,
      gallery: [], tags: [], included: [], originalPrice: null,
      lastUpdated: new Date().toISOString(),
    }, payload));
    return resource(decorate(row));
  }, LATENCY.write);
}

export async function updateProduct(id, patch) {
  return simulate(() => {
    const before = db.findById('products', id);
    if (!before) throw notFound('Product');
    // FR-6.4: editing an approved product returns it to the queue.
    const returnsToQueue = before.status === 'approved';
    const row = db.update('products', id, Object.assign({}, patch, {
      lastUpdated: new Date().toISOString(),
      status: returnsToQueue ? 'pending' : (patch.status || before.status),
      submittedAt: returnsToQueue ? new Date().toISOString() : before.submittedAt,
    }));
    return resource(Object.assign(decorate(row), { returnedToQueue: returnsToQueue }));
  }, LATENCY.write);
}

export async function deleteProduct(id) {
  return simulate(() => {
    if (!db.findById('products', id)) throw notFound('Product');
    db.remove('products', id);
    return resource({ id, deleted: true });
  }, LATENCY.write);
}

export async function submitProduct(id) {
  return simulate(() => {
    const p = db.findById('products', id);
    if (!p) throw notFound('Product');
    const row = db.update('products', id, {
      status: 'pending', submittedAt: new Date().toISOString(), declineReason: null, declineNote: null,
    });
    return resource(decorate(row));
  }, LATENCY.write);
}

export async function approveProduct(id, adminId) {
  return simulate(() => {
    const p = db.findById('products', id);
    if (!p) throw notFound('Product');
    const row = db.update('products', id, {
      status: 'approved', publishedAt: p.publishedAt || new Date().toISOString(),
      reviewedBy: adminId, reviewedAt: new Date().toISOString(),
      declineReason: null, declineNote: null,
    });
    return resource(decorate(row));
  }, LATENCY.write);
}

export async function declineProduct(id, adminId, reason, note) {
  return simulate(() => {
    if (!db.findById('products', id)) throw notFound('Product');
    const row = db.update('products', id, {
      status: 'declined', declineReason: reason, declineNote: note || null,
      reviewedBy: adminId, reviewedAt: new Date().toISOString(),
    });
    return resource(decorate(row));
  }, LATENCY.write);
}

export async function unpublishProduct(id) {
  return simulate(() => {
    if (!db.findById('products', id)) throw notFound('Product');
    return resource(decorate(db.update('products', id, { status: 'unpublished' })));
  }, LATENCY.write);
}

export async function duplicateProduct(id) {
  return simulate(() => {
    const p = db.findById('products', id);
    if (!p) throw notFound('Product');
    const copy = Object.assign({}, p);
    delete copy.id; delete copy.createdAt; delete copy.updatedAt;
    copy.title = p.title + ' (copy)';
    copy.status = 'draft'; copy.publishedAt = null; copy.downloads = 0;
    copy.ratingAvg = 0; copy.ratingCount = 0;
    return resource(decorate(db.create('products', copy)));
  }, LATENCY.write);
}

/** POST /products/bulk — approve or decline several queue items at once. */
export async function bulkModerate(ids, action, adminId, reason) {
  return simulate(() => {
    const changed = db.transaction(() => ids.map(id => {
      if (action === 'approve') {
        return db.update('products', id, {
          status: 'approved', publishedAt: new Date().toISOString(),
          reviewedBy: adminId, reviewedAt: new Date().toISOString(), declineReason: null,
        });
      }
      return db.update('products', id, {
        status: 'declined', declineReason: reason, reviewedBy: adminId, reviewedAt: new Date().toISOString(),
      });
    }));
    return { data: changed.filter(Boolean).map(decorate), meta: { total: changed.length } };
  }, LATENCY.write);
}

/** Facet counts for the filter panel, computed against the current result set. */
export async function facets(opts = {}) {
  return simulate(() => {
    const all = db.findAll('products', { filter: { status: 'approved' } }).rows;
    const count = (key, fn) => all.reduce((acc, p) => {
      const k = fn(p);
      if (k == null) return acc;
      (Array.isArray(k) ? k : [k]).forEach(v => { acc[v] = (acc[v] || 0) + 1; });
      return acc;
    }, {});
    return {
      data: {
        categories: count('categoryId', p => p.categoryId),
        subjects: count('subject', p => p.subject),
        resourceTypes: count('resourceType', p => p.resourceType),
        themes: count('theme', p => p.theme),
        grades: count('grade', p => [p.gradeFrom, p.gradeTo]),
        free: all.filter(p => !p.price).length,
        total: all.length,
      },
    };
  }, LATENCY.read);
}
