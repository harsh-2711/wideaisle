import type { ActionFunctionArgs } from "react-router";
import { eq } from "drizzle-orm";
import db from "../db.server";
import { sessionTable } from "../db/schema";
import { verifyShopifyWebhook } from "../lib/webhooks/verify.server";

// Verified by HMAC only: after an uninstall the shop's token is gone, so the
// library's session load and token refresh would fail before this runs.
export const action = async ({ request }: ActionFunctionArgs) => {
  const hook = await verifyShopifyWebhook(request, process.env.SHOPIFY_API_SECRET ?? "");
  if (!hook) return new Response("Unauthorized", { status: 401 });

  console.log(`Received ${hook.topic} webhook for ${hook.shop}`);
  // Webhooks can arrive more than once; deleting nothing is fine.
  await db.delete(sessionTable).where(eq(sessionTable.shop, hook.shop));
  return new Response();
};
