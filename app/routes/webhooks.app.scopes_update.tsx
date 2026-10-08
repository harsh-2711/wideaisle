import type { ActionFunctionArgs } from "react-router";
import { eq } from "drizzle-orm";
import db from "../db.server";
import { sessionTable } from "../db/schema";
import { verifyShopifyWebhook } from "../lib/webhooks/verify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const hook = await verifyShopifyWebhook(request, process.env.SHOPIFY_API_SECRET ?? "");
  if (!hook) return new Response("Unauthorized", { status: 401 });

  console.log(`Received ${hook.topic} webhook for ${hook.shop}`);
  const current = (hook.payload as { current?: string[] } | null)?.current;
  if (Array.isArray(current)) {
    await db.update(sessionTable).set({ scope: current.toString() }).where(eq(sessionTable.shop, hook.shop));
  }
  return new Response();
};
