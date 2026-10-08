// Keeps the crawler on the public internet. A listed domain could resolve
// or redirect to a private, loopback or cloud metadata address; the crawler
// must never fetch those.
import { promises as dns, type LookupAddress } from "node:dns";
import net from "node:net";

export type Lookup = (hostname: string) => Promise<string[]>;

export const systemLookup: Lookup = async (hostname) => (await dns.lookup(hostname, { all: true })).map((a) => a.address);

const V4_BLOCKED = new net.BlockList();
for (const [base, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) V4_BLOCKED.addSubnet(base, bits, "ipv4");

// IPv6 is an allowlist: global unicast only. Inside it, block the
// documentation ranges and the ranges that carry an IPv4 address (Teredo,
// 6to4), which could point back at a private one.
const V6_GLOBAL = new net.BlockList();
V6_GLOBAL.addSubnet("2000::", 3, "ipv6");
const V6_BLOCKED = new net.BlockList();
for (const [base, bits] of [["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20]] as const) {
  V6_BLOCKED.addSubnet(base, bits, "ipv6");
}

export function isPublicAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return !V4_BLOCKED.check(ip, "ipv4");
  if (net.isIPv6(ip)) return V6_GLOBAL.check(ip, "ipv6") && !V6_BLOCKED.check(ip, "ipv6");
  return false;
}

export class BlockedAddressError extends Error {}

export interface GuardOptions {
  lookup?: Lookup;
  // Only for tests against a local server.
  allowPrivate?: boolean;
}

// Resolves a host once and returns only vetted addresses. Callers connect to
// these addresses, so a second DNS answer cannot swap in a private one.
export async function resolvePublic(hostname: string, opts: GuardOptions = {}): Promise<string[]> {
  const host = hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(host) ? [host] : await (opts.lookup ?? systemLookup)(host);
  if (!addresses.length) throw new BlockedAddressError(`${hostname} has no address`);
  if (opts.allowPrivate) return addresses;
  const bad = addresses.find((a) => !isPublicAddress(a));
  if (bad) throw new BlockedAddressError(`${hostname} resolves to a non-public address (${bad})`);
  return addresses;
}

export async function assertPublicHost(hostname: string, lookup: Lookup = systemLookup): Promise<void> {
  await resolvePublic(hostname, { lookup });
}

type LookupCallback = (err: Error | null, address: string | LookupAddress[], family?: number) => void;

function lookupFrom(resolve: (hostname: string) => Promise<string[]>) {
  return (hostname: string, options: unknown, callback?: LookupCallback) => {
    const cb = (typeof options === "function" ? options : callback) as LookupCallback;
    const all = typeof options === "object" && options !== null && (options as { all?: boolean }).all;
    resolve(hostname).then(
      (addresses) => {
        const list = addresses.map((address) => ({ address, family: net.isIPv6(address) ? 6 : 4 }));
        if (all) cb(null, list);
        else cb(null, list[0].address, list[0].family);
      },
      (err: Error) => cb(err, ""),
    );
  };
}

// A drop-in for the `lookup` option of net, http and https. Node skips
// `lookup` for IP literals, so check those with resolvePublic first.
export function guardedLookup(opts: GuardOptions = {}) {
  return lookupFrom((hostname) => resolvePublic(hostname, opts));
}

// A `lookup` that answers with addresses already vetted, so a connection
// tries each of them in turn without asking DNS again.
export function pinnedLookup(addresses: string[]) {
  return lookupFrom(async () => addresses);
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
