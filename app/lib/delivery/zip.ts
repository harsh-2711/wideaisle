// A strict zip reader for merchant theme files. It trusts nothing the
// archive declares: it reads the central directory itself, refuses
// duplicate, unsafe or overlapping entries, symbolic links, encryption and
// ZIP64, caps the bytes it will unpack before unpacking any, and checks every
// entry's real size and CRC. Writing still goes through fflate.
import { crc32, inflateRawSync } from "node:zlib";
import { DeliveryApiError } from "./errors";

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export interface ReadZipOptions {
  // Cap on the sum of max(compressed, uncompressed) over all entries.
  maxUnzippedBytes: number;
  maxEntries?: number;
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;

export function zipNameProblem(name: string): string | null {
  if (!name) return "an entry has no name";
  if (/[\\\0]/.test(name)) return `${name}: backslash or NUL in the name`;
  if (name.startsWith("/") || /^[A-Za-z]:/.test(name)) return `${name}: absolute path`;
  if (name.split("/").includes("..")) return `${name}: ".." in the path`;
  return null;
}

const invalid = (why: string) => new DeliveryApiError(`Not a usable theme zip: ${why}`, "INVALID_ZIP");

interface CentralRecord {
  name: string;
  method: number;
  crc: number;
  compressed: number;
  size: number;
  start: number;
  end: number;
  headerAt: number;
}

export function readZip(zip: Uint8Array, opts: ReadZipOptions): ZipEntry[] {
  const b = Buffer.from(zip.buffer, zip.byteOffset, zip.byteLength);
  const maxEntries = opts.maxEntries ?? 100_000;

  // The end record is 22 bytes plus a comment of up to 65,535 bytes.
  let end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) {
    if (b.readUInt32LE(i) === EOCD) {
      end = i;
      break;
    }
  }
  if (end < 0) throw invalid("no end of central directory");
  if (b.readUInt16LE(end + 4) !== 0 || b.readUInt16LE(end + 6) !== 0) throw invalid("split archives are not supported");
  const count = b.readUInt16LE(end + 10);
  const cdSize = b.readUInt32LE(end + 12);
  const cdStart = b.readUInt32LE(end + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdStart === 0xffffffff) throw invalid("ZIP64 is not supported");
  if (count !== b.readUInt16LE(end + 8)) throw invalid("entry counts disagree");
  if (cdStart + cdSize > end) throw invalid("central directory out of range");
  if (count > maxEntries) throw new DeliveryApiError(`The zip has more than ${maxEntries} entries`, "TOO_LARGE");

  // Pass 1: read and check every record before unpacking anything.
  const records: CentralRecord[] = [];
  const names = new Set<string>();
  let total = 0;
  let p = cdStart;
  for (let i = 0; i < count; i++) {
    if (p + 46 > cdStart + cdSize || b.readUInt32LE(p) !== CENTRAL) throw invalid("broken central directory");
    const flags = b.readUInt16LE(p + 8);
    const method = b.readUInt16LE(p + 10);
    const crc = b.readUInt32LE(p + 16);
    const compressed = b.readUInt32LE(p + 20);
    const size = b.readUInt32LE(p + 24);
    const nameLength = b.readUInt16LE(p + 28);
    const extraLength = b.readUInt16LE(p + 30);
    const commentLength = b.readUInt16LE(p + 32);
    const external = b.readUInt32LE(p + 38);
    const headerAt = b.readUInt32LE(p + 42);
    const nameBytes = b.subarray(p + 46, p + 46 + nameLength);
    const name = nameBytes.toString(flags & 0x800 ? "utf8" : "latin1");
    p += 46 + nameLength + extraLength + commentLength;

    if (compressed === 0xffffffff || size === 0xffffffff || headerAt === 0xffffffff) throw invalid("ZIP64 is not supported");
    // Count the larger of the two sizes: a stored entry is copied by its
    // compressed size, whatever size it declares.
    total += Math.max(compressed, size);
    if (total > opts.maxUnzippedBytes) throw new DeliveryApiError("The zip unpacks to more than we accept", "TOO_LARGE");
    if (flags & 0x1) throw invalid(`${name} is encrypted`);
    const problem = zipNameProblem(name);
    if (problem) throw invalid(problem);
    if (names.has(name)) throw invalid(`${name} appears twice`);
    names.add(name);
    if (((external >>> 16) & S_IFMT) === S_IFLNK) throw invalid(`${name} is a symbolic link`);
    if (method !== 0 && method !== 8) throw invalid(`${name} uses compression method ${method}`);
    if (method === 0 && compressed !== size) throw invalid(`${name}: stored entry sizes disagree`);

    if (headerAt + 30 > cdStart || b.readUInt32LE(headerAt) !== LOCAL) throw invalid(`${name}: missing local header`);
    const localName = b.readUInt16LE(headerAt + 26);
    const localExtra = b.readUInt16LE(headerAt + 28);
    if (!b.subarray(headerAt + 30, headerAt + 30 + localName).equals(nameBytes)) throw invalid(`${name}: local and central names differ`);
    const start = headerAt + 30 + localName + localExtra;
    if (start + compressed > cdStart) throw invalid(`${name}: data runs past the archive`);
    records.push({ name, method, crc, compressed, size, start, end: start + compressed, headerAt });
  }

  // Each entry must own its bytes: no two records may share or overlap data.
  const byOffset = [...records].sort((x, y) => x.headerAt - y.headerAt);
  for (let i = 1; i < byOffset.length; i++) {
    if (byOffset[i].headerAt < byOffset[i - 1].end) throw invalid(`${byOffset[i].name} overlaps ${byOffset[i - 1].name}`);
  }

  // Pass 2: unpack, never past the declared size, then check size and CRC.
  return records.map((r) => {
    const raw = b.subarray(r.start, r.end);
    let data: Buffer;
    if (r.method === 0) data = Buffer.from(raw);
    else {
      try {
        data = inflateRawSync(raw, { maxOutputLength: Math.max(1, r.size) });
      } catch {
        throw invalid(`${r.name}: unpacked size does not match the declared size, or the data is corrupt`);
      }
    }
    if (data.length !== r.size) throw invalid(`${r.name}: unpacked size ${data.length} does not match the declared size ${r.size}`);
    if (crc32(data) >>> 0 !== r.crc) throw invalid(`${r.name}: CRC does not match`);
    return { name: r.name, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
  });
}
