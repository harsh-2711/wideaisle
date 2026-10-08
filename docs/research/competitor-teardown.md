# Competitor teardown: Shopify accessibility apps

Task T-022 · M2 · Desk research, written 2026-10-08 · Decisions used: D-06, D-08, D-12

## The answer

- Three apps on Shopify say they change theme code: Patrol (from $200 a month), TestParty (Pro at $599 a month) and Adafix (from $29 a month). Everything else we found is an overlay widget that adds JavaScript at runtime, priced from free to $479 a month.
- Our $29 Starter plan sits at Adafix's price and far below Patrol and TestParty. Adafix is the closest threat: same price, same "edit the code, review, one-click revert" pitch, and it launched on 29 September 2026 with no reviews yet.
- Patrol and TestParty have what we lack: live installs, 5.0 ratings on 20 to 27 reviews, and human help (TestParty runs monthly manual audits). Patrol already ships fixes as GitHub pull requests.
- Every competitor we checked makes a claim we must not copy (D-06): "Automate ADA Compliance" (Patrol), "real ADA, WCAG 2.2 AA, EAA and AODA compliance" (TestParty), "accessibility certifications" (accessiBe), "Shield against accessibility-related lawsuits" (UserWay).
- The FTC's final order against accessiBe (April 2025, $1 million) bars it from claiming automated tools make a site WCAG compliant. That is the line our claims policy keeps us well behind.
- Every number here comes from search summaries of listing pages, not from pages we opened. This container cannot reach apps.shopify.com (owner queue Q-01). Treat each figure as unverified until a person or an agent with web access checks the live listing.

## Comparison table

All figures are from search summaries of Shopify App Store listings or third-party directories, captured on unknown dates. Review counts differ between snapshots; the table shows the range seen. "Via search" means we did not open the page.

| App | How it works | Changes theme code | Price (monthly unless noted) | App Store rating (reviews) | Launched | Compliance or legal claims seen |
|---|---|---|---|---|---|---|
| Patrol - ADA Code Level Fixes | AI finds and fixes issues in theme files or through GitHub | Yes | Free Monitor plan (audit, monitoring, email alerts, manual guidance). Starter $200 or $2,000 a year, adds code and alt-text fixes. One older snapshot showed $150 | 5.0 (11 to 27) | 5 Dec 2024 | "Automate ADA Compliance"; "compliant with WCAG"; "avoid costly ADA lawsuits" |
| Adafix | Scans live pages; AI alt text and contrast fixes in code; review each change; one-click revert | Yes (alt text and contrast named) | From $29, free trial. Scheduled re-scans on paid plans only | 0.0 (0) | 29 Sep 2026 | "fixes hold up during real audits"; "WCAG compliance scan". Official listing not found; seen only on a directory |
| TestParty: ADA Compliance | Managed service: source-code fixes as monthly GitHub pull requests, plus monthly manual audits | Yes | Free plan scans the home page only. Pro $599 or $6,469 a year. TestParty's own blog says $1,000 to $5,000 by revenue and site size | 5.0 (20 to 27) | Unverified | "real ADA, WCAG 2.2 AA, EAA and AODA compliance"; "initial WCAG 2.2 AA compliance certification within two weeks"; "Certificates of Compliance" (directory text) |
| accessiBe Web Accessibility (accessWidget) | Overlay widget; AI scans daily and adjusts the page at runtime | No | Micro $59 or $490 a year. Growth $179 or $1,490 a year. Scale $479 or $3,990 a year | 4.1 (14); one directory shows 3.5 (15) | Unverified | Micro lists "ADA, AODA, EAA and WCAG compliance" and "accessibility certifications"; Growth adds a $15k "litigation pledge" |
| UserWay Website Accessibility | Overlay widget priced by page views | No | Free light widget. $49 (100k page views), $149 (1M), $349 (10M); $490, $1,490, $3,490 a year | 2.2 (9); a competitor blog says 2.4 (9) | Unverified | "ADA & WCAG Compliance"; "Shield against accessibility-related lawsuits" |
| Avada Accessibility Widget ADA | Overlay widget | No | Free up to 1,000 widget impressions. Starter $9 or $90 a year. A competitor blog lists tiers of about $9, $14 and $19 | 5.0 (279 to 293) | 8 Jan 2025 | Lists WCAG 2.1 AA (elsewhere 2.2 AA), ADA, AODA, EAA and BFSG |
| ADA Accessibility Widget by AP | Overlay widget with AI alt text | No | Free up to 1,000 monthly visitors. Standard $9 or $64.80 a year, adds 100 AI alt texts a month and monitoring | 4.9 (83 to 87) | Unverified | Lists ADA, AODA, EAA, BFSG and WCAG |
| Wide Aisle (plan, D-12) | Rule-based fixes in theme code per supported theme; alt text through the Admin API; preview and one-click revert; dated evidence pack | Yes | Free scan. Starter $29, Pro $79, Agency $199 for 10 stores | None yet | Not launched | None. We say what we fixed and that automated scans miss some problems (D-06) |

## Notes per competitor

### Patrol

- **What it fixes.** The listing says it "resolves ADA violations in a merchant's theme files or directly in Github" and "is not an overlay widget". The paid plan adds code fixes and content fixes such as alt text. Which WCAG issues it fixes is not listed in anything we saw.
- **Onboarding.** The listing says "We automatically place you on the correct plan during installation." A third-party directory says the AI audit flags violations "in minutes" and the live theme is re-checked every hour. Reviewers call onboarding quick and mention regular check-ins.
- **Reviews.** All five stars. Reviewers praise code-level fixes, support, and the GitHub review step. One says Patrol helped after an overlay was judged insufficient in a lawsuit. One admits it "hasn't been battletested over time".
- **Company.** A job posting says it has a seed round from NextView, Founders Collective, Newark Venture Partners and Hawke Media (via search, not opened). Round size unverified.
- **Claims we must not copy.** "Automate ADA Compliance", "compliant with WCAG", "avoid costly ADA lawsuits".
- **Where we are better.** Price: $29 against $200. A shared theme fix library and a dated evidence pack. We say plainly what we do not catch.
- **Where we are worse.** It is live, has reviews, already ships GitHub pull requests, and its free plan gives monitoring we only offer as a scan. Its AI fixes are not limited to six issue types or five themes.

### Adafix

- **What it fixes.** AI alt text that the merchant reviews, and contrast on text and buttons "to meet WCAG AA". Every change is reviewed first and can be reverted in one click. Paid plans re-scan on a schedule.
- **Price.** From $29 a month with a free trial. The same price as our Starter.
- **Status.** Launched 29 September 2026 per a directory listing, with no reviews. We did not find its official App Store listing through search, so its name, developer and price there are unverified.
- **Claims we must not copy.** "fixes hold up during real audits", "WCAG compliance scan".
- **Where we are better.** Six fix types, not two. Form labels, empty links, empty buttons and page language are in our plan. Regression watch after theme changes, an evidence pack and an agency plan.
- **Where we are worse.** It is live today and we are not. Its pitch (code, not overlay; review; revert) is the same as ours, so "real fixes, not a widget" alone will not set us apart at $29.

### TestParty

- **What it fixes.** Source-code fixes for ADA and WCAG issues, shipped as monthly GitHub pull requests, plus monthly manual audits with screen readers, keyboard and zoom. Its free Shopify plan scans only the home page; a separate free "Accessibility Scan" app also exists with no reviews.
- **Price.** Pro $599 a month or $6,469 a year on listing snapshots. Its own 2025 blog says $1,000 to $5,000 a month. Its product page asks you to request pricing.
- **Claims we must not copy.** "Real ADA, WCAG 2.2 AA, EAA and AODA compliance", compliance "certification within two weeks", "Certificates of Compliance". Its blog says fewer than 1% of customers were sued in one place and zero in another (via search, not opened).
- **Where we are better.** Self-serve and cheaper for small stores. A free plan that covers more than the home page.
- **Where we are worse.** Human audits every month, which automated tools cannot match. A managed service suits stores that want someone else to own the work. Strong reviews.

### accessiBe (accessWidget)

- **What it does.** An overlay widget. The listing says AI "scans your store daily and applies accessibility adjustments without altering your design or layout". It does not change theme code.
- **Price.** $59, $179 or $479 a month. The roadmap's "$5 to $349" range for overlays is too low at the top: accessiBe's Scale plan is $479.
- **FTC order.** In January 2025 the FTC announced a complaint and proposed order; the final order came in April 2025 with a $1 million payment. It bars accessiBe from claiming its automated products can make any website WCAG compliant or keep it compliant, and requires it to disclose paid endorsements (via search, not opened). accessiBe settled without admitting liability.
- **Claims we must not copy.** "Compliance", "accessibility certifications", a "litigation pledge". We never offer legal support or money tied to lawsuits.
- **Where we are better.** We fix the code. We add no widget and no runtime script for the six fixes.
- **Where we are worse.** One-click install, a known brand, and a lawsuit pledge some merchants want. Widgets also give shoppers tools such as text size, which we do not offer.

### UserWay

- **What it does.** An overlay widget, free in a light version, then priced by monthly page views.
- **Legal context.** BloomsyBox filed a class action in Delaware federal court alleging UserWay's widget claims were misleading, after BloomsyBox was itself sued by a blind shopper. These are allegations; the latest update we saw is dated 17 February 2026 (via search, not opened).
- **Reviews.** The lowest rating in this set: 2.2 from 9 reviews. One one-star reviewer says a third-party audit found the widget fixed none of the listed issues (quoted by a competitor's blog; via search, not opened).
- **Claims we must not copy.** "ADA & WCAG Compliance", "Shield against accessibility-related lawsuits".
- **Where we are better.** Code fixes and honest claims.
- **Where we are worse.** A free plan and instant install.

### Avada Accessibility Widget ADA

- **What it does.** An overlay widget with the largest review count in this set.
- **Reviews.** 5.0 from 279 to 293 reviews, depending on the snapshot. One aggregator says the typical reviewer had used the app for about 15 days and about 1% for a year or more (via search, not opened). Ratings that early say little about outcomes.
- **Price.** Free up to 1,000 widget impressions, then about $9 to $19 a month.
- **Why it matters.** It sets what small merchants expect to pay for "accessibility": under $20. Our $29 has to be explained by what a widget cannot do.

### ADA Accessibility Widget by AP

- **What it does.** An overlay widget with 40 or more shopper tools, plus 100 AI alt texts a month on the $9 plan.
- **Why it matters.** AI alt text at $9 a month. Alt text alone will not justify our price, so the six code fixes and the evidence pack must carry it.

### Also seen, not torn down

- **AccessFix - ADA/EAA/WCAG (MK-Way).** Says it helps "detect and fix" WCAG 2.1 AA violations; Starter $49 and Pro $99 a month; no reviews. Whether it changes code is unverified. Check it in the hands-on pass, since it may be a fourth code-fix app.
- **AccessFix (StoreFix).** A scanner with a free plan; the merchant fixes issues in the theme by hand. No reviews.
- **AccessiFix AI.** Scans for alt text, contrast and ARIA problems and suggests AI fixes; free plan of 5 scans a month.
- **Accessibly.** An overlay widget, $5 to $75 a month, 4.4 from 23 reviews. One one-star review says the store was sued and the app did not protect it.
- **The category.** Shopify's Accessibility category showed 67 apps in one snapshot. TestParty, a competitor, says most are overlay widgets (via search, not opened).

## What this means for Wide Aisle

1. **Lead with what a widget cannot show.** Fix count by type, a before-and-after scan, a dated record, and re-checks after theme changes. Adafix copies our "code, not overlay" line at our price, so the evidence pack and regression watch are the difference.
2. **Our honesty is a feature, but a quiet one.** Every competitor says "compliant" or "lawsuit". We cannot, and should not try to out-shout them. Listing copy should say what we fix and what we do not, and point to the FTC order only as background, never as an attack on a named vendor. Ask the lawyer in D-14 whether naming competitors is safe.
3. **Price check.** $29 matches Adafix and is a sixth of Patrol's paid plan. Widgets anchor small merchants under $20. The interviews (T-024) should test whether $29 feels expensive next to a $9 widget.
4. **Agency plan is open ground.** None of the Shopify apps in the table lists an agency or multi-store plan in what we saw. Unverified: the hands-on pass and agency calls should confirm.
5. **Correct the roadmap.** Overlays reach $479 a month (accessiBe Scale), not $349. A fourth app (AccessFix by MK-Way) may change code.

## Hands-on teardown, waits on a dev store (Q-03)

Run this once the owner creates `wideaisle-dev` with Dawn (Q-03). Install only on the dev store, never on a live store. Use free plans and trials only. If any step asks for real payment or a paid sign-up, stop and send it to the owner (D-04). Whether app charges on a development store are test charges is unverified; check before each install.

**Order.** Patrol (free Monitor plan), Adafix (trial), TestParty (free scan), then two widgets: UserWay (free) and Avada (free). Add AccessFix by MK-Way if time allows.

**Before the first install.**

1. Duplicate the live Dawn theme and download a copy of its files as the baseline.
2. Run axe-core with Playwright on home, a collection, a product and the cart. Save counts for the six types (contrast, alt text, form labels, empty links, empty buttons, page language) and the total.
3. Take full-page screenshots of the same four pages at desktop and mobile widths.
4. Record page weight, number of requests and a Lighthouse performance score for each page.

**For each app, record:**

| Area | What to record |
|---|---|
| Install | Scopes requested, especially `write_themes`. Whether it needs an outside account. Minutes from install to first result. Every screen in order, with screenshots |
| What it changes | A diff of theme files against the baseline. New app embeds, script tags, snippets, metafields or assets. Any product alt text it writes |
| Fix results | axe-core counts for the six types and the total on the four pages, before and after. Which issues remain |
| Visual change | Screenshot diffs against the baseline. Anything that moved, broke or changed colour |
| Keyboard and screen reader | Tab through the menu drawer, search, product form and cart drawer. A short VoiceOver pass on the product page. Note anything the app made worse |
| Speed | Added JavaScript size, requests and the Lighthouse score against the baseline |
| Preview and undo | Can the merchant preview a change? Can they undo one fix, or only everything? |
| Evidence | Reports, statements, exports, dates. Could a merchant hand it to a lawyer? |
| Claims in the app | Copy every use of compliant, certified, lawsuit or guarantee from the app's own screens and emails |
| Price in the app | Plans and prices shown in the app against the listing. Trial length. Upgrade prompts |
| Support | Ask one question by the app's support channel. Time to first reply |
| Uninstall | Uninstall, then diff the theme again. List anything left behind |

**After all installs.** Restore the baseline theme, re-run the scans to confirm a clean store, and add a results table to this file with one row per app.

## Sources

Checked 2026-10-08. This container could not open any of these pages (the proxy denies them; owner queue Q-01). Every item below was read only through a search summary, so it is marked "via search, not opened". Figures may differ on the live pages.

Patrol:
- [Patrol listing, apps.shopify.com/patrol](https://apps.shopify.com/patrol) and locale copies such as [?locale=nb](https://apps.shopify.com/patrol?locale=nb) (via search, not opened)
- [Patrol reviews, French copy](https://apps.shopify.com/patrol/reviews?locale=fr) (via search, not opened)
- [AppNavigator: Patrol](https://appnavigator.io/app/patrol/) and [reviews](https://appnavigator.io/app/patrol/reviews/) (via search, not opened)
- [PickYourApp: Patrol](https://pickyourapp.com/collections/store-design/products/patrol) (via search, not opened)
- [1800DTC: Patrol](https://1800dtc.com/tools/patrol) (via search, not opened)
- [Patrol job posting naming its investors](https://hail-paw-e76.notion.site/Full-Stack-Engineer-27f268ca26dd80a3a5f7cd686efc0636) (via search, not opened)

Adafix and similar names:
- [PickYourApp: Adafix](https://pickyourapp.com/products/adafix-app) (via search, not opened)
- [AppNavigator: AccessFix - ADA/EAA/WCAG (MK-Way)](https://appnavigator.io/app/accessibility-ai-audit-fix/) (via search, not opened)
- [AccessFix (StoreFix) listing](https://apps.shopify.com/accessfix?locale=pl) (via search, not opened)
- [AppNavigator: AccessiFix AI](https://appnavigator.io/app/accessifix-ai/) (via search, not opened)

TestParty:
- [TestParty listing](https://apps.shopify.com/testparty?locale=he) (via search, not opened)
- [AppNavigator: TestParty](https://appnavigator.io/app/testparty/) (via search, not opened)
- [PickYourApp: TestParty](https://pickyourapp.com/collections/store-design/products/testparty) (via search, not opened)
- [TestParty blog: best Shopify accessibility tool 2025](https://testparty.ai/blog/best-shopify-accessibility-tool-2025) (vendor content; via search, not opened)
- [TestParty blog: best Shopify accessibility apps 2026](https://testparty.ai/blog/best-shopify-accessibility-apps-2026) (vendor content; via search, not opened)

accessiBe:
- [accessiBe listing, apps.shopify.com/accesswidget](https://apps.shopify.com/accesswidget) (via search, not opened)
- [xpay: accessiBe on Shopify](https://www.xpay.sh/directory/shopify/apps/accesswidget/) (via search, not opened)
- [accessiBe: litigation support](https://accessibe.com/litigation-support) (vendor content; via search, not opened)
- [FTC press release on accessiBe](https://www.ftc.gov/node/88115) (via search, not opened)
- [Hinckley Allen on the FTC order](https://www.hinckleyallen.com/publications/ftc-deceptive-accessibility-claims-widgets-automated-tools/) (via search, not opened)
- [Data Privacy and Security Insider on the final order](https://www.dataprivacyandsecurityinsider.com/2025/04/ftc-settles-with-accessibe-for-misleading-statements-about-wcag-compliance/) (via search, not opened)

UserWay:
- [UserWay listing, apps.shopify.com/userway-accessibility](https://apps.shopify.com/userway-accessibility?locale=pl) (via search, not opened)
- [Appify blog: UserWay alternative](https://appifycommerce.com/blog/userway-alternative-shopify-accessibility/) (competitor content; via search, not opened)
- [Lainey Feingold: UserWay overlay lawsuit](https://www.lflegal.com/2025/02/userway-overlay-lawsuit) (via search, not opened)
- [Tech Startups: UserWay class action](https://techstartups.com/2024/12/23/userway-faces-class-action-lawsuit-over-alleged-false-accessibility-and-ada-compliance-claims/) (via search, not opened)

Other apps:
- [AppNavigator: Avada Accessibility reviews](https://appnavigator.io/app/sea-accessibility-ada-wcag/reviews/?page=6) (via search, not opened)
- [Appify blog: Avada alternative](https://appifycommerce.com/blog/avada-accessibility-alternative-shopify/) (competitor content; via search, not opened)
- [ADA Accessibility Widget by AP listing](https://apps.shopify.com/access-pro) (via search, not opened)
- [Accessibly listing](https://apps.shopify.com/accessibly-app) (via search, not opened)
- [Shopify Accessibility category](https://apps.shopify.com/categories/store-design-site-optimization-accessibility/all) (via search, not opened)

Roundups:
- [Fudge: best Shopify apps for accessibility (2026)](https://www.fudge.ai/blog/best-shopify-accessibility-apps/) (Fudge sells a competing editor; via search, not opened)

Plan inputs: docs/plan/roadmap.md and decisions D-06, D-08 and D-12 in this repo (opened).
