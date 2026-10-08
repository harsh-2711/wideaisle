import type { ActionFunctionArgs } from "react-router";
import { eq } from "drizzle-orm";
import db from "../db.server";
import { sessionTable } from "../db/schema";
import { verifyShopifyWebhook } from "../lib/webhooks/verify.server";

// Verified by HMAC only: after an uninstall the shop's token is gone, so the
// library's session load and token refresh would fail before this runs.
export const action = async ({ request }: ActionFunctionArgs) => {
  const result = await verifyShopifyWebhook(request, process.env.SHOPIFY_API_SECRET ?? "", { topics: ["app/uninstalled"] });
  if (!result.ok) return new Response(result.reason, { status: result.status });
  const hook = result.hook;

  console.log(`Received ${hook.topic} webhook for ${hook.shop}`);
  // Webhooks can arrive more than once; deleting nothing is fine.
  await db.delete(sessionTable).where(eq(sessionTable.shop, hook.shop));
  hook.done();
  return new Response();
};
