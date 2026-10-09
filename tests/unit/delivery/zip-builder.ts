// Builds zip archives by hand, including broken and hostile ones that zip
// libraries refuse to write: lying sizes, bad CRCs, duplicate names,
// entries that share data, traversal names and symbolic links.
import { crc32, deflateRawSync } from "node:zlib";

export interface RawEntry {
  name: string;
  data: Buffer;
  method?: 0 | 8;
  // Declared uncompressed size, if it should differ from the real one.
  declaredSize?: number;
  crc?: number;
  // Unix mode for the external attributes, for example 0o120777 for a link.
  unixMode?: number;
}

// Extra central directory records that point at an existing local header.
export interface AliasEntry {
  name: string;
  target: number;
  declaredSize: number;
}

export function buildZip(entries: RawEntry[], aliases: AliasEntry[] = []): Uint8Array {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  const meta: { offset: number; comp: Buffer; e: RawEntry; crc: number }[] = [];
  let offset = 0;
  for (const e of entries) {
    const method = e.method ?? 8;
    const comp = method === 8 ? deflateRawSync(e.data) : e.data;
    const crc = (e.crc ?? crc32(e.data)) >>> 0;
    const name = Buffer.from(e.name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(e.declaredSize ?? e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    meta.push({ offset, comp, e, crc });
    parts.push(local, name, comp);
    offset += 30 + name.length + comp.length;
  }
  const record = (nameText: string, i: number, declaredSize: number) => {
    const { offset: at, comp, e, crc } = meta[i];
    const name = Buffer.from(nameText, "utf8");
    const h = Buffer.alloc(46);
    h.writeUInt32LE(0x02014b50, 0);
    h.writeUInt16LE((3 << 8) | 20, 4);
    h.writeUInt16LE(20, 6);
    h.writeUInt16LE(0x800, 8);
    h.writeUInt16LE(e.method ?? 8, 10);
    h.writeUInt32LE(crc, 16);
    h.writeUInt32LE(comp.length, 20);
    h.writeUInt32LE(declaredSize, 24);
    h.writeUInt16LE(name.length, 28);
    h.writeUInt32LE(((e.unixMode ?? 0o100644) << 16) >>> 0, 38);
    h.writeUInt32LE(at, 42);
    central.push(h, name);
  };
  entries.forEach((e, i) => record(e.name, i, e.declaredSize ?? e.data.length));
  for (const a of aliases) record(a.name, a.target, a.declaredSize);
  const cd = Buffer.concat(central);
  const count = entries.length + aliases.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, cd, end]));
}
