/**
 * format.js — display formatting. No business logic lives here.
 * Depends: nothing.
 */

export const money = n =>
  n === 0 || n === '0' ? 'Free'
  : n == null ? '—'
  : '$' + Number(n).toFixed(2);

export const moneyAlways = n => '$' + Number(n || 0).toFixed(2);

export const compact = n => {
  const v = Number(n || 0);
  if (v >= 1e6) return (v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(v % 1e3 === 0 ? 0 : 1) + 'k';
  return String(v);
};

export const thousands = n => Number(n || 0).toLocaleString('en-US');

export const pct = (n, digits = 0) => (Number(n || 0) * 100).toFixed(digits) + '%';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

export function date(iso, style = 'medium') {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  if (style === 'monthYear') return MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  if (style === 'short') return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
  if (style === 'long') return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (style === 'withTime') return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}

export function relative(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + (mins === 1 ? ' minute ago' : ' minutes ago');
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
  const days = Math.round(hrs / 24);
  if (days < 30) return days + (days === 1 ? ' day ago' : ' days ago');
  return date(iso, 'short');
}

export function daysUntil(iso) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

export const fileSize = mb => (mb >= 1 ? `${Number(mb).toFixed(1)} MB` : `${Math.round(mb * 1024)} KB`);

export const initials = name => String(name || '')
  .split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

/** '★★★★☆' for a 0–5 rating, rounded to the nearest half up. */
export const stars = rating => {
  const full = Math.round(Number(rating) || 0);
  return '★'.repeat(full) + '☆'.repeat(Math.max(0, 5 - full));
};

export const titleCase = s => String(s || '').replace(/\b\w/g, c => c.toUpperCase());

export const truncate = (s, n) => {
  const str = String(s || '');
  return str.length > n ? str.slice(0, n - 1).trimEnd() + '…' : str;
};

export const slugify = s => String(s || '').toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
