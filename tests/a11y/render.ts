// Renders a fixture theme to HTML with LiquidJS and small stand-ins for
// Shopify's objects and filters. Good enough to run axe before and after the
// fixers; real themes are checked on a dev store (T-031, needs Q-03).
import fs from "node:fs";
import path from "node:path";
import { Liquid } from "liquidjs";
import type { ThemeFiles } from "../../app/lib/fixers/types";

export function loadTheme(dir: string): ThemeFiles {
  const files: ThemeFiles = new Map();
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else files.set(path.relative(dir, full).split(path.sep).join("/"), fs.readFileSync(full, "utf8"));
    }
  };
  walk(dir);
  return files;
}

function json(text: string | undefined): Record<string, unknown> {
  return text ? JSON.parse(text.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, "")) : {};
}

const PIXEL = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";

export async function renderTheme(theme: ThemeFiles): Promise<string> {
  const locale = json(theme.get("locales/en.default.json"));
  const settingsData = json(theme.get("config/settings_data.json")) as { current: Record<string, unknown> };
  const engine = new Liquid({
    relativeReference: false,
    fs: {
      readFileSync: (file: string) => theme.get(file) ?? "",
      readFile: async (file: string) => theme.get(file) ?? "",
      existsSync: (file: string) => theme.has(file),
      exists: async (file: string) => theme.has(file),
      contains: async () => true,
      resolve: (_root: string, file: string) => (file.includes("/") ? file : `snippets/${file}.liquid`),
      dirname: (file: string) => path.dirname(file),
      sep: "/",
    },
  });
  engine.registerFilter("t", (key: string) => {
    let cur: unknown = locale;
    for (const k of String(key).split(".")) cur = (cur as Record<string, unknown> | undefined)?.[k];
    return typeof cur === "string" ? cur : key;
  });
  engine.registerFilter("image_url", () => PIXEL);
  engine.registerFilter("img_url", () => PIXEL);
  engine.registerFilter("asset_url", () => PIXEL);
  engine.registerTag("section", {
    parse(token) {
      this.name = token.args.replace(/['"]/g, "").trim();
    },
    *render(ctx): Generator<unknown, unknown, unknown> {
      const src = theme.get(`sections/${this.name}.liquid`) ?? "";
      return yield engine.parseAndRender(src, ctx.getAll() as object);
    },
  });
  const scope = {
    settings: settingsData.current,
    shop: { name: "Example Store" },
    request: { locale: { iso_code: "en" } },
    routes: { cart_url: "/cart", search_url: "/search", root_url: "/" },
    product: {
      title: "Linen shirt",
      description: "Breathable linen, cut for summer.",
      featured_image: { alt: "Linen shirt, front view" },
    },
  };
  return engine.parseAndRender(theme.get("layout/theme.liquid") ?? "", scope);
}
