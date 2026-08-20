/**
 * api.js — the migration seam.
 *
 * Purpose:   every repository method returns the exact JSON shape the future
 *            REST API will return. Pages only ever see these envelopes, so
 *            swapping localStorage for fetch() means editing repositories and
 *            nothing else.
 * Depends:   db.js
 *
 * Envelopes
 *   collection  { data: [...], meta: { page, pageSize, total, totalPages } }
 *   resource    { data: {...} }
 *   error       thrown ApiError with { status, code, message, fields }
 *
 * TODO(backend): replace `simulate()` with fetch(BASE + path, init) and delete
 * the latency helper. Nothing above this file changes.
 */

import * as db from './db.js';

/** Artificial latency so loading and skeleton states are visible and testable. */
export const LATENCY = { list: 320, read: 180, write: 420 };

export class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields || null;
  }
  toJSON() { return { error: { status: this.status, code: this.code, message: this.message, fields: this.fields } }; }
}

export const notFound = (what = 'Resource') => new ApiError(404, 'not_found', what + ' not found');
export const forbidden = (msg = 'You do not have access to this resource') => new ApiError(403, 'forbidden', msg);
export const unauthorized = (msg = 'Sign in to continue') => new ApiError(401, 'unauthorized', msg);
export const badRequest = (msg, fields) => new ApiError(422, 'validation_failed', msg || 'Some fields need attention', fields);
export const conflict = (code, msg) => new ApiError(409, code, msg);

export function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Wrap a synchronous data-layer read/write in the latency + promise contract. */
export async function simulate(fn, ms = LATENCY.read) {
  await wait(ms);
  return fn();
}

export function collection(result) {
  return {
    data: result.rows,
    meta: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    },
  };
}

export function resource(data) { return { data }; }

/** Shared list-query normaliser: keeps every repository's signature identical. */
export function listQuery({ page = 1, pageSize = 12, sort, sortDir = 'asc', q, searchFields, filter, where } = {}) {
  return {
    page: Number(page) || 1,
    pageSize: Number(pageSize) || 12,
    sort: sort ? [{ field: sort, dir: sortDir }] : undefined,
    search: q ? { q, fields: searchFields || [] } : undefined,
    filter, where,
  };
}

export { db };
