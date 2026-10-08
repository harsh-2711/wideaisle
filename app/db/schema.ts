import {
  bigint,
  boolean,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// Shopify sessions. Columns match what the Drizzle session storage adapter
// reads and writes, including refresh tokens for expiring offline tokens.
export const sessionTable = pgTable("session", {
  id: text("id").primaryKey(),
  shop: text("shop").notNull(),
  state: text("state").notNull(),
  isOnline: boolean("isOnline").default(false).notNull(),
  scope: text("scope"),
  expires: timestamp("expires", { mode: "date" }),
  accessToken: text("accessToken"),
  userId: bigint("userId", { mode: "number" }),
  firstName: text("firstName"),
  lastName: text("lastName"),
  email: text("email"),
  accountOwner: boolean("accountOwner").default(false).notNull(),
  locale: text("locale"),
  collaborator: boolean("collaborator").default(false),
  emailVerified: boolean("emailVerified").default(false),
  refreshToken: text("refreshToken"),
  refreshTokenExpires: timestamp("refreshTokenExpires", { mode: "date" }),
});
