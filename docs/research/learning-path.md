# Learning path: accessibility basics in about 6 hours

Task T-012 · M1 research lane · Checked 2026-10-08

Do these in order. The path fits the roadmap's M1 budget of about 6 hours, including the walk-through and the quiz. Everything is free. Links marked "(via search, not opened)" were blocked from our container, so check each opens before you start.

## The plan

| # | What | Source | Time | Why |
|---|---|---|---|---|
| 1 | Introduction to Web Accessibility | W3C WAI [P1] | 20 min | What accessibility is and who it serves |
| 2 | How People with Disabilities Use the Web: the stories and the tools pages | W3C WAI [P2] | 30 min | Real users and the assistive tools they shop with |
| 3 | WCAG 2 at a Glance, then What's New in WCAG 2.2 | W3C WAI [P3, P4] | 20 min | The shape of the standard in one page each |
| 4 | Our primer: docs/research/wcag-primer.md | Wide Aisle | 60 min | WCAG mapped to Shopify store parts and to v1 |
| 5 | WebAIM WCAG 2 Checklist: read only the A and AA rows for the six failure types | WebAIM [P5] | 20 min | A plain-language version of the criteria |
| 6 | WebAIM on alternative text, forms, contrast and links | WebAIM [P6] | 30 min | The four techniques behind five of the six failure types |
| 7 | Screen-reader basics below, plus WebAIM's VoiceOver or NVDA guide | WebAIM [P7, P8] | 45 min | Set up and practise on any page |
| 8 | Our legal brief: docs/research/legal-brief.md | Wide Aisle | 45 min | The law, overlays and the questions for the lawyer |
| 9 | Our claims policy: docs/policy/claims-policy.md | Wide Aisle | 15 min | What we may and may not say about a store, our app or a fix |
| 10 | Walk three stores with the script below | Wide Aisle | 60 min | Hear what shoppers hear |
| 11 | Quiz: docs/research/quiz.md | Wide Aisle | 30 min | Pass mark 80% (16 of 20) |
| | **Total** | | **6 h 15 min** | |

**Optional, later:** W3C's free "Digital Accessibility Foundations" course on edX, which a third-party listing puts at 4 to 5 hours [P9] (via search, not opened). W3C's "Easy Checks" for a quick first review of any page [P10]. The ARIA Authoring Practices Guide patterns for Disclosure (menus), Dialog (drawers) and Radio Group (swatches) [P11].

## Screen-reader basics

Use VoiceOver if you are on a Mac, NVDA if you are on Windows. You only need one.

### VoiceOver on macOS, with Safari

**Set up once (10 minutes).**

1. Safari, Settings, Advanced: turn on "Press Tab to highlight each item on a webpage" [P7] (via search, not opened).
2. Turn VoiceOver on and off with Command+F5. On a Mac with Touch ID, hold Command and press Touch ID three times [P7] (via search, not opened).
3. Leave the caption panel on. It shows on screen what VoiceOver says, which helps you take notes.
4. Turn speech rate down at first if it is too fast (VoiceOver Utility, Speech).

"VO" means holding Control and Option together [P7] (via search, not opened).

| Do this | Keys |
|---|---|
| Next or previous item | VO+Right arrow, VO+Left arrow |
| Activate (click) | VO+Space |
| Next focusable item (links, buttons, fields) | Tab, Shift+Tab |
| Open the rotor (lists of headings, links, form controls, landmarks) | VO+U, then Left or Right arrow to switch list, Up or Down to move, Enter to go. Type letters to filter |
| Next heading | VO+Command+H |
| Next link | VO+Command+L |
| Next form control | VO+Command+J |
| Read from here | VO+A |
| Stop talking | Control |

### NVDA on Windows, with Chrome or Firefox

**Set up once (15 minutes).** Download NVDA free from NV Access (nvaccess.org) and install it. Start it with Control+Alt+N. Open Tools, Speech viewer to see what NVDA says on screen. Quit with NVDA+Q.

"NVDA" means the Insert key by default; you can also set Caps Lock [P8] (via search, not opened).

NVDA has two modes. **Browse mode** is for reading: single letters jump around. **Focus mode** is for typing in fields: letters type. NVDA beeps low for browse and high for focus. Switch by hand with NVDA+Space; Escape leaves focus mode [P8] (via search, not opened).

| Do this | Keys (browse mode) |
|---|---|
| Next or previous line or item | Down arrow, Up arrow |
| Read from here | NVDA+Down arrow |
| Next heading, link, form field, button, landmark | H, K, F, B, D (add Shift to go back) |
| List all links, headings and landmarks | NVDA+F7 (Fn+NVDA+F7 on many laptops) |
| Activate | Enter or Space |
| Next focusable item | Tab, Shift+Tab |
| Stop talking | Control |

## VoiceOver walk-through script: three stores

**Which stores.**

- **Store A: Dawn demo.** On themes.shopify.com, open the Dawn theme and choose its demo store. Dawn is Shopify's long-standing free theme and our first target.
- **Store B: Horizon demo.** Same steps for Horizon, Shopify's newer first-party theme.
- **Store C: a live store on a paid theme.** Use a store you have bought from, or one the census marks as a top theme once M2 has data. Do not buy anything, and do not contact the store.

Allow 20 minutes per store. Use Safari with VoiceOver on. Use the keyboard only; try two minutes on the product page with your eyes closed.

**Steps, what to press, what to listen for.**

| # | Part | What to press | What you should hear | Note a problem if |
|---|---|---|---|---|
| 1 | Page load | Load the home page, VO+A for a few seconds | The page title, then content in a voice that matches the store's language | The voice reads the wrong language or the title is missing |
| 2 | Skip link | Click in the address bar, then Tab once | "Skip to content, link" | No skip link, or Enter does not move you to the main content |
| 3 | Header links | VO+U, Links list, arrow through it | Each icon link has a name: "Cart", "Account", "Search", the store name for the logo | Any link read as just "link", a file name or a web address |
| 4 | Headings and landmarks | VO+U, Headings list; then Landmarks list | One clear page heading; landmarks for banner, navigation, main and footer | No headings, or headings that do not describe sections |
| 5 | Main menu | Tab to a menu item with a dropdown, VO+Space, then Escape | "collapsed" then "expanded"; Escape closes it and focus stays on the item | Menu opens only on hover, or Escape does nothing |
| 6 | Menu drawer | Narrow the window (or zoom to 400%) until the menu icon appears. Tab to it, VO+Space, Tab, then Escape | "Menu, button, collapsed"; after opening, focus is inside the drawer; Escape closes it and focus returns to the menu button | No name, focus stays behind the drawer, or you cannot close it with the keyboard |
| 7 | Search | Open search, type a product name | The field is called "Search"; result count or suggestions are announced | Field read as "edit text" with no name; silence after typing |
| 8 | Collection page | Open any collection; VO+Command+L through product cards | Each card link reads the product name; price is read clearly | Cards read as "link" or "image"; prices with no context |
| 9 | Product page: content | VO+Command+H to the product title; VO+Right through price and images | Product title as a heading; "Regular price" and "Sale price" if on sale; images with useful descriptions | Two prices read with no meaning; images read as file names or not at all |
| 10 | Variant picker | Tab into the options; use arrows or VO+Space to change one | The group name ("Size"), the option, "selected", and "unavailable" where it applies; the new price is announced | Options with no group name; swatches with no name; nothing announced after a change |
| 11 | Quantity | Tab to quantity and its plus and minus buttons | "Quantity" for the field; "Increase quantity" and "Decrease quantity" for the buttons | Buttons read as "button" only |
| 12 | Add to cart | Tab to "Add to cart", VO+Space | An announcement such as "added to cart", or focus moves into the cart drawer | Silence, or nothing changes for you |
| 13 | Cart drawer | Tab through the drawer, change a quantity, then Escape | "Cart, dialog" or similar; each quantity field names its product; the new total is announced; Escape closes and returns you to where you were | Focus wanders behind the drawer; unnamed remove or close buttons; no announcement of the new total |
| 14 | Footer | VO+Command+J to the newsletter field; submit it empty | The field is called "Email"; an error is announced | Field has no name, or the error appears only visually |
| 15 | Checkout | From the cart, go to checkout and listen to the first step only | The page reads; fields have names | Note it, but checkout is Shopify's, not the theme's |

**What to note.** Keep one row per problem in a sheet with these columns: store, step, what you pressed, what you heard, what you expected, and a WCAG guess from the primer if you have one. Give the sheet to the planner; it feeds M2 and the D-13 memo.

## Sources

Checked 2026-10-08.

- P1. W3C WAI, Introduction to Web Accessibility, https://www.w3.org/WAI/fundamentals/accessibility-intro/ (address confirmed in W3C's site source, https://github.com/w3c/wai-website, opened; page itself not opened).
- P2. W3C WAI, How People with Disabilities Use the Web, https://www.w3.org/WAI/people-use-web/ (address confirmed in W3C's site source, opened; page not opened).
- P3. W3C WAI, WCAG 2 at a Glance, https://www.w3.org/WAI/standards-guidelines/wcag/glance/ (page source opened in https://github.com/w3c/wai-website).
- P4. W3C WAI, What's New in WCAG 2.2, https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/ (page source opened in https://github.com/w3c/wai-website).
- P5. WebAIM, WCAG 2 Checklist, https://webaim.org/standards/wcag/checklist (via search, not opened; WebAIM says it simplifies WCAG 2.2 and is not the standard).
- P6. WebAIM, Alternative Text, https://webaim.org/techniques/alttext/ ; Creating Accessible Forms, https://webaim.org/techniques/forms ; Evaluating Color and Contrast, https://webaim.org/articles/contrast/evaluating ; Contrast Checker, https://webaim.org/resources/contrastchecker/ ; Links and Hypertext, https://webaim.org/techniques/hypertext/ (via search, not opened).
- P7. WebAIM, Using VoiceOver to Evaluate Web Accessibility, https://webaim.org/articles/voiceover/ ; Safari Tab setting from https://www.evoluted.net/blog/development/using-voiceover-for-accessibility-testing (via search, not opened).
- P8. WebAIM, Using NVDA to Evaluate Web Accessibility, https://webaim.org/articles/nvda/ ; Deque, NVDA Keyboard Shortcuts, https://dequeuniversity.com/screenreaders/nvda-keyboard-shortcuts (via search, not opened).
- P9. W3C WAI, Digital Accessibility Foundations, https://www.w3.org/WAI/fundamentals/foundations-course/ (address confirmed in W3C's site source, opened); time estimate from https://digitalacademy.gov.scot/courses/introduction-to-web-accessibility-by-w3c/ (via search, not opened).
- P10. W3C WAI, Easy Checks: A First Review of Web Accessibility, https://www.w3.org/WAI/test-evaluate/preliminary/ (via search, not opened).
- P11. W3C WAI, ARIA Authoring Practices Guide, patterns, https://www.w3.org/WAI/ARIA/apg/patterns/ (via search, not opened).
