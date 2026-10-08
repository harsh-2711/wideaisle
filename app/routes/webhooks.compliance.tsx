import type { ActionFunctionArgs } from "react-router";
import { eq } from "drizzle-orm";
import db from "../db.server";
import { sessionTable } from "../db/schema";
import { verifyShopifyWebhook } from "../lib/webhooks/verify.server";

// The three mandatory privacy webhooks. Wide Aisle reads only public
// storefront pages and product media and stores no customer data, so there
// is nothing to export or erase for a customer. shop/redact arrives 48 hours
// after uninstall and erases what we hold for the shop. Scans and evidence
// join this list when those tables exist (M6 compliance lane).
export const action = async ({ request }: ActionFunctionArgs) => {
  const hook = await verifyShopifyWebhook(request, process.env.SHOPIFY_API_SECRET ?? "", { topics: ["customers/data_request", "customers/redact", "shop/redact"] });
  if (!hook) return new Response("Unauthorized", { status: 401 });

  switch (hook.topic) {
    case "customers/data_request":
    case "customers/redact":
      console.log(`Received ${hook.topic} for ${hook.shop}: no customer data is stored`);
      break;
    case "shop/redact":
      await db.delete(sessionTable).where(eq(sessionTable.shop, hook.shop));
      console.log(`Received ${hook.topic} for ${hook.shop}: shop data erased`);
      break;
    default:
      console.log(`Unexpected compliance topic ${hook.topic} for ${hook.shop}`);
  }
  return new Response();
};
