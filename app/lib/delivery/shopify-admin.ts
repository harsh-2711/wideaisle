// A small Admin GraphQL client for the delivery routes. It handles HTTP 429
// and 5xx, cost-based THROTTLED errors and top-level GraphQL errors, and
// takes an injected fetch so tests replay recorded responses.
import { DeliveryApiError } from "./errors";
import { DEFAULT_RETRY, backoffMs, parseJson, realSleep, retryAfterMs, type FetchLike, type RetryPolicy, type Sleep } from "./http";

// Keep in step with shopify.app.toml and ApiVersion.October26 in
// app/shopify.server.ts.
export const ADMIN_API_VERSION = "2026-10";

export interface RequestOptions {
  // Safe to send twice. A 5xx may come after Shopify ran the call, so only
  // idempotent calls are resent after one. Default: queries yes, mutations no.
  idempotent?: boolean;
}

export interface AdminGraphql {
  request<T>(query: string, variables?: Record<string, unknown>, opts?: RequestOptions): Promise<T>;
}

export interface AdminClientOptions {
  // The shop's myshopify domain, for example "wideaisle-dev.myshopify.com".
  shop: string;
  accessToken: string;
  apiVersion?: string;
  fetch: FetchLike;
  sleep?: Sleep;
  retry?: Partial<RetryPolicy>;
  random?: () => number;
}

interface GraphqlError {
  message: string;
  extensions?: { code?: string; [key: string]: unknown };
}

interface ThrottleStatus {
  maximumAvailable: number;
  currentlyAvailable: number;
  restoreRate: number;
}

interface GraphqlBody {
  data?: unknown;
  errors?: GraphqlError[] | string;
  extensions?: { cost?: { requestedQueryCost?: number; throttleStatus?: ThrottleStatus } };
}

const ACCESS_HINT = "Theme writes need write_themes and an exemption from Shopify (D-09, Q-27).";

// How long until the bucket holds enough points for the query again.
export function throttleWaitMs(body: GraphqlBody): number | null {
  const cost = body.extensions?.cost;
  const status = cost?.throttleStatus;
  if (!status || !(status.restoreRate > 0)) return null;
  const needed = (cost?.requestedQueryCost ?? status.maximumAvailable / 10) - status.currentlyAvailable;
  return Math.max(0, Math.ceil((needed / status.restoreRate) * 1000));
}

export class AdminGraphqlClient implements AdminGraphql {
  readonly shop: string;
  readonly endpoint: string;
  // A true private field, so the token never shows up in JSON or logs.
  readonly #accessToken: string;
  private readonly fetch: FetchLike;
  private readonly sleep: Sleep;
  private readonly policy: RetryPolicy;
  private readonly random: () => number;

  constructor(opts: AdminClientOptions) {
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(opts.shop)) {
      throw new DeliveryApiError(`"${opts.shop}" is not a myshopify.com domain`, "INVALID_SHOP");
    }
    this.shop = opts.shop;
    this.endpoint = `https://${opts.shop}/admin/api/${opts.apiVersion ?? ADMIN_API_VERSION}/graphql.json`;
    this.#accessToken = opts.accessToken;
    this.fetch = opts.fetch;
    this.sleep = opts.sleep ?? realSleep;
    this.policy = { ...DEFAULT_RETRY, ...opts.retry };
    this.random = opts.random ?? Math.random;
  }

  async request<T>(query: string, variables: Record<string, unknown> = {}, opts: RequestOptions = {}): Promise<T> {
    const idempotent = opts.idempotent ?? !/^\s*mutation\b/.test(query);
    for (let attempt = 0; ; attempt++) {
      const last = attempt + 1 >= this.policy.maxAttempts;
      const res = await this.fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Shopify-Access-Token": this.#accessToken,
        },
        body: JSON.stringify({ query, variables }),
      });

      // 429 means Shopify did not run the call, so it is always safe to
      // resend. A 5xx may come after the call ran.
      if (res.status === 429 || res.status >= 500) {
        if (res.status >= 500 && !idempotent) {
          throw new DeliveryApiError(`Shopify answered HTTP ${res.status}; the call may have run, so it was not resent`, `HTTP_${res.status}`);
        }
        if (last) throw new DeliveryApiError(`Shopify answered HTTP ${res.status} ${attempt + 1} times`, res.status === 429 ? "THROTTLED" : `HTTP_${res.status}`);
        await this.sleep(retryAfterMs(res.headers) ?? backoffMs(attempt, this.policy, this.random));
        continue;
      }
      const body = parseJson(await res.text()) as GraphqlBody | string | null;
      if (res.status === 401 || res.status === 403) {
        throw new DeliveryApiError(`Shopify refused the token (HTTP ${res.status})`, res.status === 401 ? "UNAUTHORIZED" : "ACCESS_DENIED", body);
      }
      if (res.status !== 200 || !body || typeof body !== "object") {
        throw new DeliveryApiError(`Shopify answered HTTP ${res.status}`, `HTTP_${res.status}`, body);
      }

      const errors = typeof body.errors === "string" ? [{ message: body.errors }] : (body.errors ?? []);
      if (errors.some((e) => e.extensions?.code === "THROTTLED")) {
        if (last) throw new DeliveryApiError(`Still throttled after ${attempt + 1} tries`, "THROTTLED", body.extensions);
        await this.sleep(Math.max(throttleWaitMs(body) ?? 0, backoffMs(0, this.policy, this.random)));
        continue;
      }
      if (errors.length) {
        const code = errors.find((e) => e.extensions?.code)?.extensions?.code ?? "GRAPHQL_ERROR";
        const message = errors.map((e) => e.message).join("; ");
        throw new DeliveryApiError(code === "ACCESS_DENIED" ? `${message} ${ACCESS_HINT}` : message, code, errors);
      }
      return body.data as T;
    }
  }
}
