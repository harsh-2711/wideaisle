# M1 quiz: accessibility, the law and our claims

Task T-012 · 20 questions · Pass mark 80% (16 of 20)

**How it works.** Do the learning path first (docs/research/learning-path.md). Answer each question with one letter. Do not open quiz-answers.md before you finish. Send your answers to the planner as a list, for example "1 C, 2 A, ...". An agent grades them against docs/research/quiz-answers.md and explains any you missed.

**1. What does a page need to meet WCAG 2.2 Level AA?**
- A. Only the Level AA success criteria
- B. A Lighthouse accessibility score of 90 or more
- C. Every Level A and Level AA success criterion
- D. At least 80% of all success criteria

**2. What is the minimum contrast ratio for normal-size body text under 1.4.3 Contrast (Minimum)?**
- A. 3:1
- B. 4.5:1
- C. 7:1
- D. 2.5:1

**3. A header cart link contains only an icon and no text. Which criteria does it fail?**
- A. 1.4.3 Contrast (Minimum)
- B. 3.1.1 Language of Page
- C. 2.2.2 Pause, Stop, Hide
- D. 2.4.4 Link Purpose and 4.1.2 Name, Role, Value

**4. A newsletter field has the placeholder "Email" and no label. What does axe-core 4.13.0's `label` rule report?**
- A. A pass, because axe accepts a non-empty placeholder as the field's name
- B. A failure for a missing label
- C. A contrast error
- D. An invalid page language

**5. Which of these can an automated scanner such as axe-core check reliably?**
- A. Whether alt text describes the product correctly
- B. Whether focus moves into the cart drawer when it opens
- C. Whether the `<html>` element has a valid `lang` attribute
- D. Whether a price change is announced after a shopper picks a variant

**6. What does WCAG's "complete processes" requirement mean for a store?**
- A. Only the home page needs to conform
- B. Every page from product selection to the end of checkout must conform before any page in that process can
- C. Checkout is exempt because a third party hosts it
- D. A process only needs Level A

**7. How does v1 deliver alt text fixes?**
- A. AI drafts alt text, the merchant reviews it, and it is written to product media through the Admin API
- B. A script adds alt text in the shopper's browser when the page loads
- C. The theme is edited to repeat the product title on every image
- D. Shopify checkout is updated

**8. Which of these is NOT in v1?**
- A. Naming empty icon buttons
- B. Setting the page language from the store locale
- C. Adjusting low-contrast theme colours
- D. Fixing focus that stays behind the cart drawer when it opens

**9. In VoiceOver, what does "VO" mean?**
- A. Command and Shift
- B. Control and Option
- C. Fn and Option
- D. Shift and Option

**10. In NVDA browse mode, which key moves to the next heading?**
- A. K
- B. F
- C. H
- D. D

**11. A shopper presses "Add to cart" and the cart drawer opens. What should happen to keyboard focus?**
- A. It moves into the drawer, then returns to the button that opened it when the drawer closes
- B. It stays on "Add to cart" behind the drawer
- C. It jumps to the top of the page
- D. It moves to the footer

**12. About how many website accessibility suits were filed in US federal court in 2025, according to Seyfarth Shaw?**
- A. About 300
- B. About 800
- C. About 12,000
- D. About 3,100

**13. Under federal ADA Title III, what does a plaintiff who wins a website case usually get?**
- A. $4,000 for every visit to the site
- B. A court order to fix the site, plus attorney's fees
- C. A criminal conviction against the owner
- D. A share of the store's revenue

**14. What did the FTC's 2025 order against accessiBe bar?**
- A. Selling any accessibility product in the US
- B. Using AI in its products
- C. Claiming, without evidence, that its automated tool can make any website conform to WCAG or keep it conforming
- D. Working with Shopify stores

**15. Since when has the European Accessibility Act applied to online stores selling to EU consumers?**
- A. 28 June 2025
- B. 1 January 2030
- C. 1 January 2024
- D. It applies only to public bodies

**16. Which business is exempt from the EAA's rules for services?**
- A. Any store with turnover under €10 million
- B. Any store based outside the EU
- C. Any store hosted on Shopify
- D. A microenterprise: fewer than 10 staff and turnover or balance sheet of €2 million or less

**17. What deadline does the April 2026 interim final rule set for US state and local governments serving 50,000 people or more to meet WCAG 2.1 AA under Title II?**
- A. 24 April 2026
- B. 26 April 2027
- C. 26 April 2028
- D. There is no deadline any more

**18. Which sentence follows our claims policy?**
- A. "Your store is now ADA-compliant."
- B. "Make your store lawsuit-proof in one click."
- C. "On 3 November 2026 we fixed 212 of the 240 issues our automated scan found on 8 key pages."
- D. "Wide Aisle makes your store 100% accessible."

**19. According to the WebAIM Million 2026, about what share of errors detected on the top million home pages fall into the six failure types v1 targets?**
- A. About 96%
- B. About 25%
- C. About 50%
- D. 100%

**20. On a product page, a screen reader says "Small, radio button, 1 of 4" but never says "Size". What is missing?**
- A. Enough colour contrast on the option label
- B. A skip link
- C. The page language
- D. A group name for the options, such as a fieldset with a legend (1.3.1)
