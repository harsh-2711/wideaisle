import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

// Placeholder home page. The embedded app lane (M4, lane F) builds the real
// flow: install, scan, review fixes, publish, report.
export default function Index() {
  return (
    <s-page heading="Wide Aisle">
      <s-section heading="Make room for every shopper">
        <s-paragraph>
          Wide Aisle finds the most common accessibility failures in your
          theme, fixes them in your theme code, and keeps a dated record of
          every fix.
        </s-paragraph>
        <s-paragraph>
          Scanning is not available yet. Automated checks cannot find every
          barrier, so we always tell you what we checked and what we did not.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
