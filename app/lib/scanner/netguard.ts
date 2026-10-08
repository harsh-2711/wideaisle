// Keeps the crawler on the public internet. A listed domain could resolve
// or redirect to a private, loopback or cloud metadata address; the crawler
// must never fetch those.
import { promises as dns } from "node:dns";
import net from "node:net";

export type Lookup = (hostname: string) => Promise<string[]>;

export const systemLookup: Lookup = async (hostname) => (await dns.lookup(hostname, { all: true })).map((a) => a.address);

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;
}

const V4_BLOCKS: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

export function isPublicAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const n = v4ToInt(ip);
    return !V4_BLOCKS.some(([base, bits]) => (n >>> (32 - bits)) === (v4ToInt(base) >>> (32 - bits)));
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x);
    if (mapped) return isPublicAddress(mapped[1]);
    if (x === "::" || x === "::1") return false;
    return !/^(fc|fd|fe8|fe9|fea|feb|ff)/.test(x);
  }
  return false;
}

export class BlockedAddressError extends Error {}

export async function assertPublicHost(hostname: string, lookup: Lookup = systemLookup): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(host) ? [host] : await lookup(host);
  if (!addresses.length) throw new BlockedAddressError(`${hostname} has no address`);
  const bad = addresses.find((a) => !isPublicAddress(a));
  if (bad) throw new BlockedAddressError(`${hostname} resolves to a non-public address (${bad})`);
}

function registrable(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

// A store may redirect to www, to its primary domain under the listed one,
// or between its myshopify.com and custom domain. Anything else is another
// site and is not crawled.
export function sameSite(listed: string, finalHost: string): boolean {
  const a = registrable(listed.split(":")[0]);
  const b = registrable(finalHost.split(":")[0]);
  return a === b || b.endsWith("." + a) || a.endsWith("." + b) || b.endsWith(".myshopify.com");
}
