// A crawler that behaves: it reads robots.txt before anything else, keeps a
// gap between requests to the same host, names itself and a contact in its
// user agent, and never logs in.
import { parseRobots, type Robots } from "./robots";

export interface PoliteOptions {
  contact: string;
  // Minimum gap between requests to one host. robots.txt Crawl-delay can raise it.
  minDelayMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
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
  private robots = new Map<string, Promise<Robots>>();
  private nextSlot = new Map<string, number>();

  constructor(opts: PoliteOptions) {
    this.userAgent = userAgentFor(opts.contact);
    this.minDelay = opts.minDelayMs ?? 2000;
    this.timeout = opts.timeoutMs ?? 20000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private async rawGet(url: string): Promise<PoliteResponse> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeout);
    try {
      const res = await this.fetchImpl(url, {
        headers: { "user-agent": this.userAgent, accept: "text/html,*/*;q=0.8" },
        redirect: "follow",
        signal: ctrl.signal,
      });
      return { url: res.url || url, status: res.status, text: await res.text(), contentType: res.headers.get("content-type") ?? "" };
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
    const robots = await this.robotsFor(u.origin);
    return robots.isAllowed(u.pathname + u.search);
  }

  // Fetches a page if robots.txt allows it; null when it does not.
  async get(url: string): Promise<PoliteResponse | null> {
    const u = new URL(url);
    const robots = await this.robotsFor(u.origin);
    if (!robots.isAllowed(u.pathname + u.search)) return null;
    await this.waitTurn(u.origin, (robots.crawlDelaySeconds ?? 0) * 1000);
    return this.rawGet(url);
  }
}
