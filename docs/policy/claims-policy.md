# Claims policy

| Field | Value |
|---|---|
| Status | **Draft, awaiting owner approval** (owner queue Q-23) |
| Implements | D-06, option A |
| Task | T-013 |
| Drafted | 2026-10-08 |
| Lawyer review | Before launch, as part of D-14 |
| Changes | Owner approval needed. Loosening any rule also needs the lawyer (D-06) |

## The rule

We say what our scan detected, what we fixed, when, on which pages, and what we keep watching. We never claim a legal status, a conformance level or an outcome such as fewer lawsuits.

## Where it applies

Everything we write that a merchant, shopper, agency or reviewer can read: the App Store listing, the landing page, ads, emails and outreach, reports and the evidence pack, accessibility statement drafts, in-app text, support replies, case studies, social posts, sales scripts, the agency kit and white-label report templates. D-06 also lists code comments. This draft adds commit messages, because the repository is public.

## Words we never use

Banned in any form, tense or language, about a store, our app, a fix or a report.

| Never say | Why | Say instead |
|---|---|---|
| compliant, compliance (as a result), ADA-compliant, WCAG-compliant, EAA-compliant | A legal status we cannot test or promise | "fixed N of M detected issues", "checked for WCAG 2.2 AA failures our scan can detect" |
| conforms to WCAG, meets WCAG 2.2 AA, WCAG conformant | WCAG conformance needs every criterion on every page and through checkout; automated scans test a minority | "results for the WCAG 2.2 AA failures our automated scan can detect" |
| certified, certification, accessibility certificate | Implies a third party vouched for the store or product | "dated scan history", "remediation log" |
| audit, accessibility audit (for our automated or AI-assisted checks) | Implies a full review by an expert | "automated scan", "automated and AI-assisted checks" |
| lawsuit-proof, sue-proof, lawsuit protection, avoid lawsuits, reduce legal risk, protect you | An outcome no one can promise; FTC risk | "documentation you can share with your lawyer" |
| 100% accessible, fully accessible, completely accessible, barrier-free | No tool can show this | "fixes six common failure types" |
| guaranteed, guarantee | Promises an outcome | "you review every fix before it goes live" |
| instant, automatic or one-click accessibility; AI makes your store accessible; fixes everything | Overstates what automation does | "AI drafts alt text; you approve each one" |
| accessibility badge, seal, trust mark for the storefront | Reads as a status claim to shoppers | Do not offer one |
| approved or endorsed by Shopify, Shopify-certified | Not true unless Shopify says so in writing | The exact program name, only once earned (for example "Built for Shopify") |
| seamless, robust, leverage, delve | Hype words the writing rules in docs/plan/roadmap.md ban | Plain verbs |

**Two narrow exceptions.**

1. Quoting what we never say, in this policy, training material and quizzes.
2. Quoting a third party with attribution, such as a law's title or a court's words, never as our own claim.

In a file the CI claims check scans (see "How we enforce it"), mark a line that quotes a banned word under these exceptions with `claims-ok`.

**Open for the owner:** may we name a human tester's personal credential, for example "checked by Jane Doe (IAAP CPACC)", if D-13 leads to paid human checks? The draft says yes, only as a person's credential and never next to the store, app or report.

## Words we use

| Use | Example |
|---|---|
| detected issues | "Our scan detected 240 issues of six types" |
| fixed, published, reverted | "We fixed 212. You published them on 3 November 2026" |
| dated scan, re-scan | "Re-scanned on 10 November 2026: 28 open" |
| key pages | "home, one collection, two products and the cart" |
| remediation log, evidence pack | "Each fix is listed with its date and the file it changed" |
| known limitations | "Checkout and third-party apps are not covered" |
| accessibility statement draft | "A draft for you to review and publish" |
| keeps watching | "We re-scan after theme changes and tell you about new issues" |
| work toward WCAG 2.2 AA | "Fixes help you work toward WCAG 2.2 AA" (open for the owner) |

## Describing the limits of automated testing

Use these sentences as written. Change numbers and dates only.

**Short version.** Required on the listing, the landing page near pricing, every email that shares scan results, and the in-app results screen.

> Automated scans find some accessibility problems, not all. A store with no scan findings can still have barriers.

**Long version.** Required in every report and the evidence pack.

> Automated tools, including the one we use (axe-core), test only part of WCAG. Many checks need a person: whether alt text is accurate, whether keyboard focus moves sensibly, whether changes are announced to screen readers. Our results cover the issues our scan detected on the pages listed, on the dates shown. They are not a statement that your store conforms to WCAG or meets any law.

**Scope line.** Every report states the pages scanned, the scan date, the tool and its version, and the theme and its version.

**Third parties.** Every report says:

> Shopify hosts checkout, and apps add their own code. We cannot change either, and our results do not cover them.

**Legal.** Anywhere we mention laws or lawsuits:

> This is not legal advice. For legal questions, talk to a lawyer.

## Numbers and evidence

1. Every number has a dated scan or a named source on file. Keep the scan ID with the copy.
2. Use counts with their base: "212 of 240 detected issues", not "88% accessible".
3. Totals across stores state the stores, pages, failure types, dates and method, for example "detected errors of six types on key pages of 10 pilot stores fell 82% between 3 and 24 November 2026".
4. Third-party figures (lawsuit counts, WebAIM) name the source and year and link to it. No fear framing such as "you could be next". Lawsuit counts in outreach or ads wait on lawyer question 11 (legal brief).
5. Testimonials and case studies come from real merchants, with written consent, and say if the merchant got a discount or anything else of value. The exact disclosure waits on the lawyer (legal brief, question 3).
6. Comparisons with overlays or competitors are factual, sourced and dated. "Overlays get you sued" is never allowed. "We change your theme code; we do not add a widget" waits on lawyer question 4 (legal brief).

## Allowed and banned sentences

### App Store listing

| Banned | Allowed |
|---|---|
| Make your store ADA and WCAG compliant in minutes. | Find and fix six common accessibility failures in your theme code, with a dated record of each fix. |
| Lawsuit protection for your Shopify store. | Keep a dated scan history and remediation log you can share with your lawyer. |
| AI makes your store 100% accessible. | AI drafts alt text for product images. You review each one before it goes live. |
| Certified WCAG 2.2 AA. | Checks your key pages for WCAG 2.2 AA failures that automated tools can detect. |
| Guaranteed results or your money back. | Preview every fix before you publish it, and undo any fix in one click. |

### Landing page

| Banned | Allowed |
|---|---|
| Stop ADA lawsuits before they start. | Fixes go into your theme code, and alt text into your product images, not a widget, with a dated record of each fix. (Pending lawyer question 4: "not a widget" is a comparison with overlays.) |
| Over 5,000 stores were sued last year. You could be next. | [Number] digital accessibility suits were filed in US courts in 2025 ([source], [year]). Fixing common barriers helps shoppers who use assistive technology. (Pending lawyer question 11; do not use until answered. Verify the figure before use.) |
| Fully accessible in one click. | Install, scan, review the fixes and publish. You approve every change. |

### Emails and outreach

| Banned | Allowed |
|---|---|
| Your store is not ADA compliant and is at risk of a lawsuit. | Our free scan of your home, collection, product and cart pages on 3 November 2026 found 46 issues of six common types. The report lists each one and how to fix it. |
| Act now, before you get a demand letter. | If it's useful, reply and we'll walk you through it. If not, reply "no" and we won't email again. |
| Here is your free certified accessibility audit. | Here is a free automated scan report. It does not cover everything a manual review would. |

### Reports and the evidence pack

| Banned | Allowed |
|---|---|
| Status: Compliant. | Detected issues on scanned pages: 240 on 1 November, 28 on 3 November. Fixed: 212. Open: 28 (see known limitations). |
| Your store now meets WCAG 2.2 AA. | These results cover the WCAG 2.2 AA failures our automated scan can detect, on the pages listed, on the dates shown. They are not a WCAG conformance claim. |
| Accessibility certificate | Accessibility statement (draft for you to review and publish) |

### In the app and in support replies

| Banned | Allowed |
|---|---|
| Congratulations, your store is accessible! | Published 14 fixes. Next re-scan: Monday. |
| You're protected. | We'll re-scan after theme changes and tell you about new issues. |
| Merchant asks "Will this make me ADA compliant?" Reply: "Yes, once all fixes are published." | "No tool can promise that. Wide Aisle fixes six common failure types that automated scans detect and keeps a dated record. Some barriers need a manual review. For legal questions, please talk to a lawyer." |

### Code comments and commits

| Banned | Allowed |
|---|---|
| `// Ensures WCAG compliance` | `// Adds an accessible name to icon buttons (WCAG 4.1.2)` |
| `feat(fixers): make Dawn fully accessible` | `feat(fixers): name empty buttons in the Dawn cart drawer` |

## Accessibility statement drafts

The merchant publishes the statement, not us. Our draft:

- describes what was fixed, what is still open and how to report a barrier;
- lists checkout and third-party apps under known limitations;
- never pre-fills a conformance or compliance status.

**Conflict for the owner and the lawyer.** The EU model statement for public bodies (Implementing Decision (EU) 2018/1523) asks for a status of "fully", "partially" or "not" compliant (legal brief, source L16, via search, not opened). If an EU merchant's statement must use that wording, the merchant chooses it, with their lawyer. Our template leaves the field blank and explains the choice. Add this to the D-14 lawyer review alongside legal brief questions 12 and 13.

## How we enforce it

1. Growth drafts copy; a reviewer agent checks it against this policy; the owner approves outreach batches (D-16) and the listing (G3).
2. The lawyer reviews the listing, landing page, report template and statement template before launch (D-14).
3. CI runs a claims check on every pull request: `node scripts/ci/checks.mjs claims`. It reads changed files under app/routes/, app/components/, docs/growth/ and extensions/. It flags "compliant" (including ADA-, WCAG- and fully compliant), "certified", "lawsuit-proof", "100% accessible", and "guarantee" with "compliance" or "accessibility" (also "guarantees" and "guaranteed"). It skips negations such as "not certified" or "non-compliant", and a line can opt out with `claims-ok`.
4. That check catches only part of this policy. "Your store now meets WCAG 2.2 AA", "Lawsuit protection", "Accessibility certificate", "fully accessible", "audit" and "guaranteed results" all pass it. It does not read other folders or commit messages, so templates, code comments and copy kept elsewhere go unchecked. Follow-up for the planner: widen the check to this policy's word list and to every folder that holds merchant-facing copy, with this file and the quiz on an allow list. Until then, the reviewer agent checks the rest by hand.
5. Agencies using white-label reports get this policy in the agency kit, and the report template keeps the required limits text.

## Sources

- D-06 claims policy memo and the roadmap sections "What we never claim" and "Risks and legal guardrails" (in this repo).
- WCAG 2.2 conformance requirements, "Complete processes", in W3C's source at https://github.com/w3c/wcag (opened 2026-10-08).
- axe-core 4.13.0 (the version the scanner runs) and 4.14.0 rule lists, https://github.com/dequelabs/axe-core (opened 2026-10-08).
- The claims check in scripts/ci/checks.mjs (in this repo, read 2026-10-08).
- FTC order against accessiBe, April 2025, as summarised in docs/research/legal-brief.md, source L9 (via search, not opened).
- Commission Implementing Decision (EU) 2018/1523, legal brief source L16 (via search, not opened).
