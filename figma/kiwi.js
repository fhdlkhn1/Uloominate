// Minimal Kiwi (evanw/kiwi) binary schema + message decoder, enough for Figma .fig payloads.
const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

export class BB {
  constructor(data) { this.d = data; this.i = 0; }
  get eof() { return this.i >= this.d.length; }
  byte() { return this.d[this.i++]; }
  bool() { return !!this.d[this.i++]; }
  varUint() {
    let v = 0, s = 0, b;
    do { b = this.d[this.i++]; v |= (b & 127) << s; s += 7; } while (b & 128 && s < 35);
    return v >>> 0;
  }
  varInt() { const v = this.varUint(); return (v & 1) ? ~(v >>> 1) : (v >>> 1); }
  varUint64() {
    let v = 0n, s = 0n, b;
    do { b = this.d[this.i++]; v |= BigInt(b & 127) << s; s += 7n; } while (b & 128 && s < 70n);
    return v;
  }
  varInt64() { const v = this.varUint64(); return (v & 1n) ? ~(v >> 1n) : (v >> 1n); }
  float() {
    const first = this.d[this.i];
    if (first === 0) { this.i++; return 0; }
    const d = this.d, i = this.i;
    let bits = (d[i] | (d[i + 1] << 8) | (d[i + 2] << 16) | (d[i + 3] << 24)) >>> 0;
    this.i += 4;
    bits = ((bits << 23) | (bits >>> 9)) >>> 0;
    u32[0] = bits; return f32[0];
  }
  string() {
    const start = this.i;
    while (this.d[this.i] !== 0) this.i++;
    const s = new TextDecoder().decode(this.d.subarray(start, this.i));
    this.i++; return s;
  }
  bytes(n) { const s = this.d.subarray(this.i, this.i + n); this.i += n; return s; }
}

export const KIND = ['ENUM', 'STRUCT', 'MESSAGE'];

export function parseSchema(bytes) {
  const bb = new BB(bytes);
  const n = bb.varUint();
  const defs = [];
  for (let k = 0; k < n; k++) {
    const name = bb.string();
    const kind = KIND[bb.byte()];
    const fc = bb.varUint();
    const fields = [];
    for (let j = 0; j < fc; j++) {
      fields.push({ name: bb.string(), type: bb.varInt(), isArray: bb.bool(), value: bb.varUint() });
    }
    defs.push({ name, kind, fields, index: k });
  }
  const byName = {}; defs.forEach(d => byName[d.name] = d);
  return { defs, byName };
}

const PRIM = { '-1': 'bool', '-2': 'byte', '-3': 'int', '-4': 'uint', '-5': 'float', '-6': 'string', '-7': 'int64', '-8': 'uint64' };

export function makeDecoder(schema) {
  const { defs } = schema;
  function readValue(bb, type) {
    if (type < 0) {
      switch (type) {
        case -1: return bb.bool();
        case -2: return bb.byte();
        case -3: return bb.varInt();
        case -4: return bb.varUint();
        case -5: return bb.float();
        case -6: return bb.string();
        case -7: return Number(bb.varInt64());
        case -8: return Number(bb.varUint64());
      }
      throw new Error('bad prim ' + type);
    }
    const def = defs[type];
    if (!def) throw new Error('bad def index ' + type);
    if (def.kind === 'ENUM') {
      const v = bb.varUint();
      const f = def.fields.find(f => f.value === v);
      return f ? f.name : v;
    }
    if (def.kind === 'STRUCT') {
      const o = {};
      for (const f of def.fields) o[f.name] = readField(bb, f);
      return o;
    }
    // MESSAGE
    const o = {};
    for (;;) {
      const id = bb.varUint();
      if (id === 0) return o;
      const f = def.fields.find(f => f.value === id);
      if (!f) throw new Error('unknown field ' + id + ' in ' + def.name);
      o[f.name] = readField(bb, f);
    }
  }
  function readField(bb, f) {
    if (!f.isArray) return readValue(bb, f.type);
    const n = bb.varUint();
    const a = new Array(n);
    for (let k = 0; k < n; k++) a[k] = readValue(bb, f.type);
    return a;
  }
  return { readValue, readField, PRIM };
}
