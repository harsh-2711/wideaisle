import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { sessionTable } from "../../app/db/schema";

describe("session table", () => {
  it("has the columns the Shopify session adapter reads and writes", () => {
    const columns = Object.keys(getTableColumns(sessionTable));
    for (const c of ["id", "shop", "state", "isOnline", "scope", "expires", "accessToken", "userId", "refreshToken", "refreshTokenExpires"]) {
      expect(columns).toContain(c);
    }
  });
});
