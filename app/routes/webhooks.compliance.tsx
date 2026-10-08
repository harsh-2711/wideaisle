import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// The three mandatory privacy webhooks. Wide Aisle reads only public
// storefront pages and product media and stores no customer data, so there
// is nothing to export or erase for a customer. shop/redact will delete the
// shop's scans and evidence once those tables exist (M6 compliance lane).
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
      console.log(`Received ${topic} for ${shop}: no customer data is stored`);
      break;
    case "SHOP_REDACT":
      console.log(`Received ${topic} for ${shop}: no shop data tables yet`);
      break;
    default:
      console.log(`Unexpected compliance topic ${topic} for ${shop}`);
  }

  return new Response();
};
