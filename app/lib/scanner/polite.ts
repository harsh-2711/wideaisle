// A crawler that behaves: it reads robots.txt before anything else, keeps a
// gap between page loads on the same host, names itself and a contact in its
// user agent, and never logs in.
import { DEFAULT_PORTS, pinnedFetch, portOf, type FetchLike } from "./egress";
import { BlockedAddressError, resolvePublic, systemLookup, type GuardOptions, type Lookup } from "./netguard";
import { disallowAll, parseRobots, type Robots } from "./robots";

export interface PoliteOptions {
  contact: string;
  // Minimum gap between page loads on one host. robots.txt Crawl-delay can
  // raise it, up to maxCrawlDelaySeconds.
  minDelayMs?: number;
  // A store that asks for a longer delay is skipped rather than held.
  maxCrawlDelaySeconds?: number;
  timeoutMs?: number;
  // Defaults to pinnedFetch, which connects only to vetted addresses.
  fetchImpl?: FetchLike;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  lookup?: Lookup;
  // Only for tests against a local server.
  allowPrivate?: boolean;
}

export interface PoliteResponse {
  url: string;
  status: number;
  text: string;
  contentType: string;
}

export type SkipReason = "disallowed" | "robots-unreachable" | "crawl-delay-too-long";

// Why a page was not fetched. `retry` is true when a later run might succeed.
export interface Skip {
  skipped: SkipReason;
  url: string;
  retry: boolean;
}

export function isSkip(x: unknown): x is Skip {
  return typeof x === "object" && x !== null && "skipped" in x;
}

export function describeSkip(s: Skip): string {
  const where = new URL(s.url);
  switch (s.skipped) {
    case "disallowed":
      return `robots.txt disallows ${where.host}${where.pathname}`;
    case "robots-unreachable":
      return `robots.txt unreachable on ${where.host}`;
    case "crawl-delay-too-long":
      return `robots.txt asks for a crawl delay longer than we wait on ${where.host}`;
  }
}

export function userAgentFor(contact: string): string {
  if (!contact || !/\S+@\S+|^https?:\/\//.test(contact)) {
    throw new Error("A contact email or URL is required for the crawler's user agent (Q-02).");
  }
  return `WideAisleCensus/0.1 (accessibility research; obeys robots.txt; contact: ${contact})`;
}

export class PoliteClient {
  readonly userAgent: string;
  readonly minDelay: number;
  private readonly maxCrawlDelay: number;
  private readonly timeout: number;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly lookup: Lookup;
  readonly allowPrivate: boolean;
  private robots = new Map<string, Promise<Robots>>();
  private nextSlot = new Map<string, number>();

  constructor(opts: PoliteOptions) {
    this.userAgent = userAgentFor(opts.contact);
    this.minDelay = opts.minDelayMs ?? 2000;
    this.maxCrawlDelay = opts.maxCrawlDelaySeconds ?? 30;
    this.timeout = opts.timeoutMs ?? 20000;
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.lookup = opts.lookup ?? systemLookup;
    this.allowPrivate = opts.allowPrivate ?? false;
    this.fetchImpl = opts.fetchImpl ?? pinnedFetch(this.guard);
  }

  // What the egress proxy for the scan browser must enforce too.
  get guard(): GuardOptions {
    return { lookup: this.lookup, allowPrivate: this.allowPrivate };
  }

  // Throws BlockedAddressError for anything but public http(s) hosts on the
  // standard ports.
  async checkUrl(url: string): Promise<void> {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new BlockedAddressError(`${u.protocol} is not crawled`);
    if (this.allowPrivate) return;
    if (!DEFAULT_PORTS.includes(portOf(u))) throw new BlockedAddressError(`port ${portOf(u)} is not crawled`);
    await resolvePublic(u.hostname, this.guard);
  }

  // Waits until this host's next slot, then books the one after it. Returns
  // the time the slot started.
  async waitTurn(origin: string, extraDelayMs = 0): Promise<number> {
    const gap = Math.max(this.minDelay, extraDelayMs);
    const at = Math.max(this.now(), this.nextSlot.get(origin) ?? 0);
    this.nextSlot.set(origin, at + gap);
    const wait = at - this.now();
    if (wait > 0) await this.sleep(wait);
    return at;
  }

  robotsFor(origin: string): Promise<Robots> {
    let p = this.robots.get(origin);
    if (!p) {
      p = (async () => {
        const at = await this.waitTurn(origin);
        let robots: Robots;
        try {
          const res = await this.fetchHops(`${origin}/robots.txt`, false);
          // RFC 9309: 4xx means no rules; 5xx or no answer means stay out.
          // A 429 asks us to slow down, so it counts as no answer.
          if (isSkip(res) || res.status >= 500 || res.status === 429) robots = disallowAll(true);
          else if (res.status >= 400) robots = parseRobots("", this.userAgent);
          else robots = parseRobots(res.text, this.userAgent);
        } catch {
          robots = disallowAll(true);
        }
        // The first page after robots.txt waits the Crawl-delay too.
        const delayMs = (robots.crawlDelaySeconds ?? 0) * 1000;
        if (delayMs > this.minDelay) this.nextSlot.set(origin, Math.max(this.nextSlot.get(origin) ?? 0, at + delayMs));
        return robots;
      })();
      this.robots.set(origin, p);
    }
    return p;
  }

  // Checks robots.txt for a URL without fetching it.
  async verdict(url: string): Promise<Skip | null> {
    const u = new URL(url);
    await this.checkUrl(url);
    const robots = await this.robotsFor(u.origin);
    if (robots.unreachable) return { skipped: "robots-unreachable", url, retry: true };
    if (!robots.isAllowed(u.pathname + u.search)) return { skipped: "disallowed", url, retry: false };
    if ((robots.crawlDelaySeconds ?? 0) > this.maxCrawlDelay) return { skipped: "crawl-delay-too-long", url, retry: false };
    return null;
  }

  async canVisit(url: string): Promise<boolean> {
    return (await this.verdict(url)) === null;
  }

  // Waits for a page-load slot on the URL's host, honouring Crawl-delay.
  // Returns a Skip instead when robots.txt says no.
  async pageTurn(url: string): Promise<Skip | null> {
    const skip = await this.verdict(url);
    if (skip) return skip;
    const u = new URL(url);
    const robots = await this.robotsFor(u.origin);
    await this.waitTurn(u.origin, (robots.crawlDelaySeconds ?? 0) * 1000);
    return null;
  }

  // Fetches a page if robots.txt allows it and every redirect hop too.
  async get(url: string): Promise<PoliteResponse | Skip> {
    const skip = await this.pageTurn(url);
    if (skip) return skip;
    return this.fetchHops(url, true);
  }

  // Follows redirects one hop at a time, checking every hop's address. For
  // pages, every hop after the first also gets a robots.txt check and its
  // own slot, so a redirect chain is spaced like separate page loads.
  private async fetchHops(url: string, page: boolean): Promise<PoliteResponse | Skip> {
    let current = url;
    for (let hop = 0; hop <= 5; hop++) {
      if (page && hop > 0) {
        const skip = await this.pageTurn(current);
        if (skip) return skip;
      } else {
        await this.checkUrl(current);
      }
      // The timeout covers one request, not the wait for a slot.
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeout);
      try {
        const res = await this.fetchImpl(current, {
          headers: { "user-agent": this.userAgent, accept: "text/html,*/*;q=0.8", "accept-encoding": "identity" },
          redirect: "manual",
          signal: ctrl.signal,
        });
        const location = res.headers.get("location");
        if (res.status >= 300 && res.status < 400 && location) {
          current = new URL(location, current).href;
          continue;
        }
        return { url: current, status: res.status, text: await res.text(), contentType: res.headers.get("content-type") ?? "" };
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error("too many redirects");
  }
}
