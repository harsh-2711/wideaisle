import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Wide Aisle</h1>
        <p className={styles.text}>
          Make room for every shopper. Wide Aisle fixes common accessibility
          failures in your Shopify theme code and keeps a dated record of each
          fix.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Fixes in your theme</strong>. Changes go into your theme
            code, not a widget on top of it, and you preview every change
            first.
          </li>
          <li>
            <strong>A record of every fix</strong>. Dated scans and a
            remediation log show what was found, what changed and when.
          </li>
          <li>
            <strong>Honest about limits</strong>. Automated checks cannot find
            every barrier, so each report says what we checked and what we did
            not.
          </li>
        </ul>
      </div>
    </div>
  );
}
