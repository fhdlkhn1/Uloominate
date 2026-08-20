// Extracts a clean, HTML-oriented tree from decoded Figma nodeChanges.
export function buildIndex(nc) {
  const key = g => g ? g.sessionID + ':' + g.localID : null;
  const byId = new Map(); nc.forEach(n => byId.set(key(n.guid), n));
  const kids = new Map();
  nc.forEach(n => { const p = key(n.parentIndex && n.parentIndex.guid); if (!p) return; if (!kids.has(p)) kids.set(p, []); kids.get(p).push(n); });
  for (const [, arr] of kids) arr.sort((a, b) => a.parentIndex.position < b.parentIndex.position ? -1 : a.parentIndex.position > b.parentIndex.position ? 1 : 0);
  return { key, byId, kids };
}

const r2 = v => Math.round(v * 100) / 100;
export function hex(c) {
  if (!c) return null;
  const to = v => Math.round(Math.max(0, Math.min(1, v || 0)) * 255).toString(16).padStart(2, '0');
  const a = c.a === undefined ? 1 : c.a;
  return '#' + to(c.r) + to(c.g) + to(c.b) + (a < 0.999 ? to(a) : '');
}

function paints(list) {
  if (!list || !list.length) return undefined;
  return list.filter(p => p.visible !== false).map(p => {
    const o = { t: p.type, op: p.opacity === undefined ? 1 : r2(p.opacity) };
    if (p.color) o.c = hex(p.color);
    if (p.image && p.image.hash) o.img = Array.from(p.image.hash).map(x => x.toString(16).padStart(2, '0')).join('');
    if (p.imageScaleMode) o.fit = p.imageScaleMode;
    if (p.stops) o.stops = p.stops.map(s => ({ p: r2(s.position), c: hex(s.color) }));
    if (p.transform) o.gt = [r2(p.transform.m00), r2(p.transform.m01), r2(p.transform.m02), r2(p.transform.m10), r2(p.transform.m11), r2(p.transform.m12)];
    return o;
  });
}

export function extract(root, ix, ox = 0, oy = 0) {
  const { key, kids } = ix;
  const t = root.transform || { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 };
  const x = ox + (t.m02 || 0), y = oy + (t.m12 || 0);
  const n = {
    id: key(root.guid), type: root.type, name: root.name,
    x: r2(x), y: r2(y),
    w: root.size ? r2(root.size.x) : undefined, h: root.size ? r2(root.size.y) : undefined,
  };
  if (root.visible === false) n.hidden = true;
  if (root.opacity !== undefined && root.opacity !== 1) n.opacity = r2(root.opacity);
  const rot = Math.round(Math.atan2(t.m10 || 0, t.m00 || 1) * 180 / Math.PI);
  if (rot) n.rot = rot;
  const f = paints(root.fillPaints); if (f) n.fill = f;
  const s = paints(root.strokePaints); if (s) { n.stroke = s; n.sw = root.strokeWeight; n.salign = root.strokeAlign; }
  if (root.cornerRadius) n.r = r2(root.cornerRadius);
  if (root.rectangleCornerRadiiIndependent) n.rr = [root.rectangleTopLeftCornerRadius, root.rectangleTopRightCornerRadius, root.rectangleBottomRightCornerRadius, root.rectangleBottomLeftCornerRadius].map(v => r2(v || 0));
  if (root.effects && root.effects.length) n.fx = root.effects.filter(e => e.visible !== false).map(e => ({ t: e.type, r: r2(e.radius || 0), o: e.offset ? [r2(e.offset.x), r2(e.offset.y)] : [0, 0], c: hex(e.color), spread: r2(e.spread || 0) }));
  if (root.stackMode && root.stackMode !== 'NONE') {
    n.stack = {
      mode: root.stackMode, gap: r2(root.stackSpacing || 0),
      pad: [r2(root.stackVerticalPadding || 0), r2(root.stackPaddingRight || 0), r2(root.stackPaddingBottom || 0), r2(root.stackHorizontalPadding || 0)],
      primary: root.stackPrimaryAlignItems, counter: root.stackCounterAlignItems,
      wrap: root.stackWrap, sizing: [root.stackPrimarySizing, root.stackCounterSizing],
    };
  }
  if (root.stackChildPrimaryGrow) n.grow = root.stackChildPrimaryGrow;
  if (root.stackChildAlignSelf && root.stackChildAlignSelf !== 'AUTO') n.self = root.stackChildAlignSelf;
  if (root.clipsContent) n.clip = true;
  if (root.mask) n.mask = true;
  if (root.type === 'TEXT') {
    n.text = root.textData ? root.textData.characters : '';
    n.font = root.fontName ? { fam: root.fontName.family, st: root.fontName.style } : undefined;
    n.fs = root.fontSize;
    n.lh = root.lineHeight ? (root.lineHeight.units === 'PERCENT' ? r2(root.lineHeight.value) + '%' : r2(root.lineHeight.value)) : undefined;
    n.ls = root.letterSpacing ? (root.letterSpacing.units === 'PERCENT' ? r2(root.letterSpacing.value) + '%' : r2(root.letterSpacing.value)) : undefined;
    n.ha = root.textAlignHorizontal; n.va = root.textAlignVertical;
    n.case = root.textCase; n.dec = root.textDecoration;
    n.autoresize = root.textAutoResize;
  }
  const ch = kids.get(key(root.guid)) || [];
  if (ch.length) n.children = ch.map(c => extract(c, ix, x, y));
  return n;
}

export function outline(n, d = 0, lines = []) {
  const pad = '  '.repeat(d);
  const box = `${n.w}x${n.h}@${n.x},${n.y}`;
  const bits = [];
  if (n.fill) bits.push('fill:' + n.fill.map(f => f.c || f.t + (f.img ? ':img' : '')).join('/'));
  if (n.r || n.rr) bits.push('r:' + (n.rr ? n.rr.join(',') : n.r));
  if (n.stack) bits.push(`${n.stack.mode} gap${n.stack.gap} pad[${n.stack.pad}] ${n.stack.primary}/${n.stack.counter}`);
  if (n.type === 'TEXT') bits.push(`"${(n.text || '').slice(0, 70).replace(/\n/g, '\\n')}" ${n.font ? n.font.fam + ' ' + n.font.st : ''} ${n.fs}/${n.lh} ${n.ha}`);
  lines.push(`${pad}[${n.type}] ${n.name} ${box} ${bits.join(' | ')}`);
  (n.children || []).forEach(c => outline(c, d + 1, lines));
  return lines;
}
