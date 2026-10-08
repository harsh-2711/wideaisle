import type { ActionFunctionArgs } from "react-router";
import { eq } from "drizzle-orm";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { sessionTable } from "../db/schema";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhooks can arrive more than once, and after the sessions are gone.
  if (session) {
    await db.delete(sessionTable).where(eq(sessionTable.shop, shop));
  }

  return new Response();
};
