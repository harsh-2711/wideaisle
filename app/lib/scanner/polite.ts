// A crawler that behaves: it reads robots.txt before anything else, keeps a
// gap between requests to the same host, names itself and a contact in its
// user agent, and never logs in.
import { assertPublicHost, BlockedAddressError, systemLookup, type Lookup } from "./netguard";
import { parseRobots, type Robots } from "./robots";

export interface PoliteOptions {
  contact: string;
  // Minimum gap between requests to one host. robots.txt Crawl-delay can raise it.
  minDelayMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
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

export function userAgentFor(contact: string): string {
  if (!contact || !/\S+@\S+|^https?:\/\//.test(contact)) {
    throw new Error("A contact email or URL is required for the crawler's user agent (Q-02).");
  }
  return `WideAisleCensus/0.1 (accessibility research; obeys robots.txt; contact: ${contact})`;
}

export class PoliteClient {
  readonly userAgent: string;
  private readonly minDelay: number;
  private readonly timeout: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly lookup: Lookup;
  readonly allowPrivate: boolean;
  private robots = new Map<string, Promise<Robots>>();
  private nextSlot = new Map<string, number>();

  constructor(opts: PoliteOptions) {
    this.userAgent = userAgentFor(opts.contact);
    this.minDelay = opts.minDelayMs ?? 2000;
    this.timeout = opts.timeoutMs ?? 20000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.lookup = opts.lookup ?? systemLookup;
    this.allowPrivate = opts.allowPrivate ?? false;
  }

  // Throws BlockedAddressError for anything but public http(s) hosts.
  async checkUrl(url: string): Promise<void> {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new BlockedAddressError(`${u.protocol} is not crawled`);
    if (!this.allowPrivate) await assertPublicHost(u.hostname, this.lookup);
  }

  // Follows redirects one hop at a time, checking every hop's address.
  private async rawGet(url: string): Promise<PoliteResponse> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeout);
    try {
      let current = url;
      for (let hop = 0; hop <= 5; hop++) {
        await this.checkUrl(current);
        const res = await this.fetchImpl(current, {
          headers: { "user-agent": this.userAgent, accept: "text/html,*/*;q=0.8" },
          redirect: "manual",
          signal: ctrl.signal,
        });
        const location = res.headers.get("location");
        if (res.status >= 300 && res.status < 400 && location) {
          current = new URL(location, current).href;
          continue;
        }
        return { url: current, status: res.status, text: await res.text(), contentType: res.headers.get("content-type") ?? "" };
      }
      throw new Error("too many redirects");
    } finally {
      clearTimeout(timer);
    }
  }

  // Waits until this host's next slot, then books the one after it.
  async waitTurn(origin: string, extraDelayMs = 0): Promise<void> {
    const gap = Math.max(this.minDelay, extraDelayMs);
    const at = Math.max(this.now(), this.nextSlot.get(origin) ?? 0);
    this.nextSlot.set(origin, at + gap);
    const wait = at - this.now();
    if (wait > 0) await this.sleep(wait);
  }

  robotsFor(origin: string): Promise<Robots> {
    let p = this.robots.get(origin);
    if (!p) {
      p = (async () => {
        await this.waitTurn(origin);
        try {
          const res = await this.rawGet(`${origin}/robots.txt`);
          // RFC 9309: 4xx means no rules; 5xx or no answer means stay out.
          if (res.status >= 500) return parseRobots("User-agent: *\nDisallow: /", this.userAgent);
          if (res.status >= 400) return parseRobots("", this.userAgent);
          return parseRobots(res.text, this.userAgent);
        } catch {
          return parseRobots("User-agent: *\nDisallow: /", this.userAgent);
        }
      })();
      this.robots.set(origin, p);
    }
    return p;
  }

  async canVisit(url: string): Promise<boolean> {
    const u = new URL(url);
    await this.checkUrl(url);
    const robots = await this.robotsFor(u.origin);
    return robots.isAllowed(u.pathname + u.search);
  }

  // Fetches a page if robots.txt allows it; null when it does not.
  async get(url: string): Promise<PoliteResponse | null> {
    const u = new URL(url);
    await this.checkUrl(url);
    const robots = await this.robotsFor(u.origin);
    if (!robots.isAllowed(u.pathname + u.search)) return null;
    await this.waitTurn(u.origin, (robots.crawlDelaySeconds ?? 0) * 1000);
    return this.rawGet(url);
  }
}
