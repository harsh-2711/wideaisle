// robots.txt rules for one user agent (RFC 9309): the most specific group
// applies, the longest matching rule wins, Allow wins a tie, and "*" and "$"
// work as wildcards.

interface Rule {
  allow: boolean;
  pattern: string;
}

export interface Robots {
  isAllowed(path: string): boolean;
  crawlDelaySeconds: number | null;
  // True when robots.txt could not be read (5xx, 429 or no answer). The
  // rules then disallow everything, and a later run may retry.
  unreachable?: boolean;
}

// Matches a rule against a path without regular expressions, so a hostile
// pattern such as "/*a*a*a*a*b" cannot stall the crawler. A rule matches a
// prefix of the path unless it ends in "$". The worst case is pattern
// length times path length.
export function ruleMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const p = anchored ? pattern.slice(0, -1) : pattern;
  let i = 0;
  let j = 0;
  let star = -1;
  let mark = 0;
  while (j < path.length) {
    if (i < p.length && p[i] === "*") {
      star = i++;
      mark = j;
    } else if (i < p.length && p[i] === path[j]) {
      i++;
      j++;
    } else if (i === p.length && !anchored) {
      return true;
    } else if (star >= 0) {
      i = star + 1;
      j = ++mark;
    } else {
      return false;
    }
  }
  while (i < p.length && p[i] === "*") i++;
  return i === p.length;
}

// RFC 9309: a crawler matches a group by its product token, compared
// without case. "WideAisleCensus/0.1 (...)" has the token "wideaislecensus".
export function productToken(value: string): string {
  return (/^[a-z_-]+/i.exec(value.trim())?.[0] ?? "").toLowerCase();
}

// RFC 9309 compares percent-encoded paths, and URL paths arrive encoded, so
// encode any non-ASCII text in a rule the same way.
function encodePattern(pattern: string): string {
  return pattern.replace(/[^\p{ASCII}]+/gu, (run) => encodeURIComponent(run));
}

export function parseRobots(text: string, userAgent: string): Robots {
  const agent = productToken(userAgent);
  const groups: { agents: string[]; rules: Rule[]; delay: number | null }[] = [];
  let current: (typeof groups)[number] | null = null;
  let inRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      // A user-agent line after rules (or a Crawl-delay, which belongs to
      // a group) starts a new group. Sitemap lines are not part of a group.
      if (!current || inRules) {
        current = { agents: [], rules: [], delay: null };
        groups.push(current);
        inRules = false;
      }
      const token = value === "*" ? "*" : productToken(value);
      if (token) current.agents.push(token);
      continue;
    }
    if (!current) continue;
    if (key === "allow" || key === "disallow") {
      inRules = true;
      if (key === "disallow" && value === "") continue; // empty Disallow allows all
      current.rules.push({ allow: key === "allow", pattern: encodePattern(value) });
    } else if (key === "crawl-delay") {
      inRules = true;
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) current.delay = n;
    }
  }
  const mine = groups.filter((g) => g.agents.includes(agent));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  const rules = chosen.flatMap((g) => g.rules);
  const delay = chosen.map((g) => g.delay).find((d) => d !== null) ?? null;
  return {
    crawlDelaySeconds: delay,
    isAllowed(path: string) {
      let best: Rule | null = null;
      for (const r of rules) {
        if (!ruleMatches(r.pattern, path)) continue;
        if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) best = r;
      }
      return best ? best.allow : true;
    },
  };
}

export function disallowAll(unreachable = false): Robots {
  return { isAllowed: () => false, crawlDelaySeconds: null, unreachable };
}
