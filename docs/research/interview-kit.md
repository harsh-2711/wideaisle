# Interview kit: merchants and agencies

Task T-024 · M2 · Written 2026-10-08, revised 2026-10-08 after review · Decisions used: D-04, D-06, D-07, D-08, D-12, D-14, D-16, D-18

## The answer

- Run 15 merchant calls and 5 agency calls of 20 to 30 minutes (D-07). Book 25 minutes.
- Each call has one goal. Learn what the person does about accessibility today and what it costs them. Then learn whether they would pay $29, $79 or $199 a month (D-12) for fixes in theme code plus a dated record.
- Count commitments, not compliments. The best evidence is a paid pilot at the founding price, current spend on an alternative, or an introduction to the person who pays.
- You send every message and run every call. Agents draft messages and write the summaries.
- Never promise compliance (D-06). Never cold-contact stores recently named in lawsuits (D-16). Every message has an easy opt-out.
- Until a lawyer answers section 15, cold messages go only to stores and agencies based in the US.
- This repo is public (Q-32). Recordings, transcripts, per-call summaries and contact lists never go in it. They live in the private ledger repo once you create it (Q-07), and on your machine until then. Only a combined, anonymous synthesis goes in this repo.
- Five choices wait on you before the first batch. See "Decide before the first batch" at the end.

## Contents

1. What we want to learn
2. Who to recruit
3. Where to find them
4. Suppression check before every batch
5. Screening questions
6. Recruiting messages
7. Scheduling
8. Consent, recording and where notes live
9. Call script: merchants
10. Call script: agencies
11. Per-call summary template
12. Synthesis template and what counts as willingness to pay
13. Words we use and words we never use
14. Decide before the first batch
15. Questions for a lawyer
16. Sources

## 1. What we want to learn

Each call scores these six hypotheses. The synthesis counts how many calls support or contradict each one.

| ID | Hypothesis | What would prove it wrong |
|---|---|---|
| H1 | Merchants on popular themes care about accessibility enough to act before any demand letter arrives | Most say it is not on their list and have done nothing |
| H2 | Merchants who tried overlays, freelancers or apps are not happy with the result | Most are content with what they have |
| H3 | Small and mid-size merchants will pay $29 a month for fixes in theme code plus a dated record | Price answers cluster well below $29, or nobody commits |
| H4 | Agencies will pay $199 a month for 10 stores with white-label reports | Agencies want per-store pricing, or will not pay for tools they cannot resell |
| H5 | Fear of a broken theme or a slower site is the main objection, and preview plus one-click revert answers it | Other objections dominate, such as trust in automated fixes or Shopify updates |
| H6 | A dated record of scans and fixes matters to merchants, their lawyers or their agencies | Nobody asks for it or sees value in it |

## 2. Who to recruit

### Merchants (15)

Every merchant must meet all of these:

- Runs a live Shopify store on a supported theme. Until the census picks the top 5 themes (D-08), recruit stores on Dawn and other free themes made by Shopify. Swap in the census list when it lands.
- Decides, or helps decide, which apps the store installs and pays for.
- Sells to customers in the US, Canada, the UK or the EU.

Aim for this mix. Order bands are self-reported in the screener.

| Segment | Calls | Definition |
|---|---|---|
| Small | 5 | 1 or 2 people run the store, or under 300 orders a month |
| Mid | 6 | 3 to 20 people, or 300 to 3,000 orders a month |
| Larger | 4 | Over 20 people, or a developer or agency on retainer |

Also aim for, across the 15:

- At least 4 who sell mostly in the US and at least 3 who sell into the EU.
- At least 3 who have tried an accessibility app, overlay widget or freelancer.
- At least 3 who have never done anything about accessibility. They show the cold market.
- At least 2 who have had a demand letter or lawsuit, found only through warm channels: people who volunteer it in a screener or reply to a public post. Never find them from lawsuit lists (D-16).

Do not recruit:

- Anyone on the suppression list (section 4).
- People who work for an accessibility vendor or an overlay company.
- More than 3 people you know well. Friends are polite, and polite answers are weak evidence.

### Agencies (5)

Every agency must meet all of these:

- Builds or maintains Shopify stores on themes, not mainly headless builds.
- Maintains at least 5 live client stores. Prefer 10 or more, since the Agency plan covers 10.
- The person on the call chooses tools: a founder, an operations lead or a lead developer.

Aim for this mix:

| Segment | Calls | Definition |
|---|---|---|
| Small | 2 | 1 to 5 people |
| Mid | 2 | 6 to 30 people |
| Larger or specialist | 1 | Over 30 people, or already sells accessibility work |

At least 1 agency should have clients selling into the EU.

## 3. Where to find them

Merchants, in this order:

1. Stores from the census on supported themes, after the suppression check. Only stores based in the US until a lawyer answers section 15 (see section 6). Message A leads with the research ask and offers a free report of their own store as a link (D-16). If the report is not ready, leave the link out.
2. Your own network and second-degree introductions.
3. LinkedIn: store founders and ecommerce managers who list a Shopify store.
4. Shopify Community and r/shopify. Read each forum's rules first and message the moderators before any recruiting post. Third-party summaries describe r/shopify as strict about promotion (via search, not opened; the subreddit's own rules are unverified). Never post the same message in many places.
5. Merchants who answer a helpful post or reply you wrote there, and ask to talk.

Agencies, in this order:

1. The Shopify Partner Directory, filtered by store build and theme customisation (via search, not opened).
2. Agencies credited in the footer of census stores ("Designed by ...").
3. LinkedIn and your own network.

## 4. Suppression check before every batch

Run these steps on every list before you approve it (Q-25).

Batch files hold names, emails and stores. Keep them, the opt-out list and the suppression list in private storage (section 8), never in this repo.

1. Remove every address and store on the opt-out list.
2. Remove every store recently named in an accessibility lawsuit. Until the team has a lawsuit list, an agent searches each store name and company name with "ADA lawsuit" and "accessibility lawsuit". It drops any store with a hit inside the window you set (section 14) and adds it to the suppression list. The batch file lists dropped stores without the reason, so it is not a list of sued stores. Never write a sued store's name in this repo.
3. Remove anyone contacted in the last 90 days.
4. For cold messages, keep only stores and agencies based in the US (section 6). Check the business address on the store's contact page or policies. If you cannot tell, leave the store out.
5. You read the batch and approve it. Agents never send.
6. Log the date sent. Follow up once after 5 business days. Then stop.
7. Honour opt-outs the same day if you can. The FTC's CAN-SPAM guide gives a ceiling of 10 business days (via search, not opened).

## 5. Screening questions

Send these as a short form or as plain questions in a reply. Use a form tool you already have. Do not sign up for a new one (D-04).

### Merchant screener

1. What is your store's web address?
2. What is your role? Owner or founder, ecommerce manager, marketing, developer, other.
3. Who decides which apps your store installs and pays for? Me. Me with someone else. Someone else.
4. About how many orders a month? Under 100, 100 to 300, 300 to 1,000, 1,000 to 3,000, over 3,000.
5. How many people work on the store, including you?
6. Where are most of your customers? US, Canada, UK, EU, other.
7. Which theme do you use, if you know? (We check this on the storefront too.)
8. Have you done anything about website accessibility? Nothing yet. Installed an app or widget. Hired a person or agency. Other.
9. Optional: have you, or a store you know, received an accessibility demand letter or lawsuit? Yes. No. Prefer not to say.
10. Can you do a 25-minute video or phone call in the next two weeks? Which time zone are you in?

Screen out: the store is not live, the person cannot decide and cannot bring the person who does, or the person works for an accessibility vendor. Question 9 never screens anyone in or out on its own.

### Agency screener

1. Agency name and website.
2. Your role.
3. How many live Shopify client stores do you look after?
4. About what share are on themes from the Shopify Theme Store, and what share are custom or headless?
5. How often do clients ask about accessibility? Never, a few times a year, monthly, more.
6. Do you sell accessibility work today? No. Now and then. As a listed service.
7. Which tools do you use for it, if any?
8. Can you do a 25-minute call in the next two weeks? Which time zone?

## 6. Recruiting messages

Rules for every message:

- Sent by you, under your real name, from your own address.
- Give the honest reason: you are building a Shopify app and want to learn.
- No fear tactics. Never write "you could be sued" or "you are at risk".
- No promise of compliance or protection (D-06).
- In a cold message, never quote an issue count or list issues. Lead with the research ask and offer the report as a link. "We scanned your store and found issues" reads like the lawsuit-mill and "rescue" emails merchants already fear (review-mining.md). The report itself says what the scan found and that automated scans miss some problems.
- Be straight about selling. Calls are mostly questions. At the end you may ask whether they would like to try the app when it is ready. Never promise "no pitch".
- One follow-up at most.
- Cold messages go only to stores and agencies based in the US until a lawyer answers (section 15). A cold message is A, C, D or E sent to someone you have not met. Canada (CASL), the UK (PECR) and some EU countries have stricter rules for cold email. CASL, for example, generally needs consent before the first message (via search, not opened). Reach people outside the US only through warm channels: introductions, your network, or people who reply to a public post and ask to talk.
- Fill every {placeholder}. Never send a message with a placeholder left in.

CAN-SPAM checklist for every email. CAN-SPAM covers commercial email, B2B included (FTC guide, via search, not opened). Whether a research request counts as commercial is a lawyer question, so follow every item anyway.

1. Accurate header. The From name is you. The From and Reply-To addresses are yours, and you read them.
2. A subject line that matches the body. No "Re:" or "Fwd:" on a first message.
3. Identify an ad as an ad. Every message says near the top that you are building a Shopify app. If a message offers the app, a price or a pilot, say plainly that it is about a product you are building. Whether this is clear enough is a lawyer question (section 15).
4. Your valid postal address in the signature.
5. A clear way to opt out: the "no thanks" line.
6. Honour opt-outs within 10 business days at most, and the same day if you can. Ask for nothing but a reply. Keep the reply address working for at least 30 days after sending. Never share or sell an address that opted out.
7. You stay responsible for any message sent for you. Agents only draft; you send.

### A. Merchant email, with a free report (census stores, US only)

Subject: 25 minutes on how {theme} stores handle accessibility?

> Hi {first name},
>
> I'm Harsh. I'm building Wide Aisle, a Shopify app that fixes common accessibility problems in theme code.
>
> Before I build more, I'm talking to store owners on {theme} about how they handle accessibility today, including if the answer is "we haven't". Would you do a 25-minute call? Most of it is my questions. At the end I may ask if you'd like to try the app when it's ready, and no is a fine answer.
>
> You can pick a time here: {booking link}. Or reply with a time that suits you.
>
> I also ran a free automated check of {store name}'s home, collection, product and cart pages. The short report is here if it's useful: {link}. It's yours to keep whether or not we talk. Automated checks cannot find every accessibility problem, so it's a starting point, not a verdict.
>
> If you'd rather not hear from me, reply "no thanks" and I won't write again.
>
> Harsh
> {signature with postal address}

### B. Merchant email, no report (warm intro or network)

Subject: 25 minutes on how you handle accessibility?

> Hi {first name},
>
> {Mutual contact} suggested I write. I'm Harsh, and I'm building a Shopify app that fixes common accessibility problems in theme code.
>
> Before I build more, I'm talking to store owners about how they handle accessibility today, including if the answer is "we haven't". Would you do a 25-minute call in the next two weeks? Most of it is my questions. At the end I may ask if you'd like to try the app when it's ready, and no is a fine answer. As thanks, I can send you a free automated scan of your key pages.
>
> Pick a time here: {booking link}, or reply with one that works.
>
> If you'd rather not, just reply "no thanks" and I won't follow up.
>
> Harsh
> {signature with postal address}

### C. Merchant DM (LinkedIn or a forum that allows DMs)

Keep it short. Platforms cap the length of connection notes; the exact cap is unverified. Cold DMs go only to people based in the US (rules above).

> Hi {first name}, I'm building a Shopify app that fixes common accessibility problems in theme code. I'm talking to store owners on {theme} about how they handle accessibility today. Would you do a 25-minute call? It's mostly my questions, and I can send a free scan of your store. If not, no worries, I won't message again.

### D. Agency email

Subject: How do your clients handle accessibility?

> Hi {first name},
>
> I'm Harsh. I'm building Wide Aisle, a Shopify app that fixes common accessibility problems in theme code and keeps a dated record of each fix. Agencies that look after many stores are a big part of who I want to build for.
>
> Could I ask you 25 minutes of questions about how accessibility comes up with your clients, what you do about it today and what you charge for it? At the end I may ask if you'd like to try the app when it's ready, and no is a fine answer. If it helps, I'll send free automated scans of two of your client stores, with their permission.
>
> Pick a time here: {booking link}, or reply with one that works.
>
> If this isn't for you, reply "no thanks" and I won't write again.
>
> Harsh
> {signature with postal address}

### E. Agency DM

> Hi {first name}, I'm building a Shopify app that fixes common accessibility problems in theme code, with reports agencies can share with clients. Could I ask you 25 minutes of questions about how accessibility comes up with your clients? It's mostly my questions. If not, no worries, I won't message again.

### F. One follow-up, 5 business days later

> Hi {first name}, a quick nudge on my note below about a 25-minute call. If now isn't a good time, no problem, and this is my last message.

### G. Confirmation, after they book

> Thanks, {first name}. We're set for {day, date, time in their time zone} at {call link}.
>
> I'll ask about your store, how accessibility has come up, what you've tried and what it cost. With your OK I'll record the call so I can take fewer notes. The recording, transcript and my notes stay in private storage that only I and my research tools can open. I delete the recording and transcript within {recording retention} and my notes within {notes retention}. I may publish a combined summary of all my calls, with no names or stores. You can ask me to delete anything about you at any time by replying to this email.
>
> If the time stops working, reply and we'll move it.

### H. Reply to an opt-out

> Understood. You won't hear from me again. Thanks for letting me know.

Add the address to the opt-out list the same day.

## 7. Scheduling

1. Use a booking page from a calendar tool you already have. Do not sign up for a paid tool (D-04).
2. Offer 25-minute slots with a 15-minute gap after each, so you can write notes.
3. Offer slots that land in business hours for US Eastern, US Pacific and Central Europe. Check each against your own time zone before you publish them.
4. Send the confirmation (message G) as soon as they book. Show the time in their time zone.
5. Send one reminder 24 hours before.
6. If someone does not show, offer one new time. If they miss that too, stop.
7. Aim for 4 to 6 calls a week. After call 5 and call 10, the research agent reads the summaries where they live (section 8) and suggests script changes. Keep the price questions the same throughout, so answers stay comparable.
8. Give each participant an ID: M01 to M15 for merchants, A01 to A05 for agencies. Keep the key that links IDs to names and stores in private storage (section 8).

## 8. Consent, recording and where notes live

### Where notes live

This repo is public (Q-32). Nothing that names a participant, or points to one, goes in it.

| What | Where it lives |
|---|---|
| Recordings, transcripts and per-call summaries | Private storage: the private ledger repo harsh-2711/wideaisle-ledger (D-18) once you create it (Q-07). Until then, your machine only, in a folder outside the repo clone |
| Batch files with names, emails and stores; screener answers; the key that links IDs to people | Private storage, as above |
| The opt-out list and the suppression list, including sued stores | Private storage, as above |
| The combined, anonymous synthesis (section 12) | This repo: docs/research/interview-synthesis.md |

An agent writes or reads per-call summaries only where it can reach private storage: on your machine, or in a clone of the ledger repo. Agents never commit them to this repo. Revisit this table once you decide Q-32.

### Transcripts

1. Record with the call tool you already use. Use its built-in transcript if your current plan has one.
2. If it has none, transcribe on your own machine with Whisper, OpenAI's open-source speech-to-text model, which runs locally for free (via search, not opened). The audio does not leave your machine at this step.
3. An agent summarises the transcript with the AI plan you already pay for (D-01).
4. Do not sign up for, or pay for, a transcription or note-taker service without your approval (D-04). A meeting bot that joins the call counts as a new service.

### Consent script

Read this out at the start of every call, before you press record:

> Before we start, a word on notes. I'd like to record this call so I can listen instead of typing. I use AI tools to transcribe the recording and summarise it. The recording, the transcript and my notes stay in private storage that only I and my research tools can open. I delete the recording and transcript within {recording retention}, and my notes within {notes retention}. My notes use a code, not your name or your store's name. I may publish a combined summary of all my calls. It has no names, no stores and nothing that points to you. I won't quote you by name, or name your store, unless you say yes in writing. You can ask me to delete anything about you at any time by replying to my email. Is it OK to record?

Then, once recording starts: "Just so it's on the recording: you're OK with me recording this call?"

Rules:

- Ask everyone on the call, every time. If anyone says no, take notes by hand. Hand notes follow the same storage rules.
- Some US states require consent from everyone on a call. Sources disagree on which states (via search, not opened), so ask everyone regardless of where they are.
- For people in the EU or UK, also tell them the purpose, who sees the data, how long you keep it, and how to ask for deletion. The script above covers this; keep it.
- Never share a recording outside the project.
- Per-call summaries never go in this repo. Only the combined synthesis does (section 12).
- If someone asks for deletion, delete their recording, transcript, summary, screener answers and contact details, and confirm by reply. Take their quotes out of the synthesis. If they also opted out, keep only their address on the opt-out list.
- If someone describes a demand letter or lawsuit, do not ask for documents, names of law firms or amounts they do not offer. Do not write any detail they share into any note. The summary records only yes, no or declined. Do not give legal advice. If asked, say: "I can't advise on that. A lawyer can."

## 9. Call script: merchants (25 minutes)

Ask about the past, not the future. "Tell me about the last time..." beats "Would you...". Talk less than they do. Do not describe the product until step 6.

**Before the call (5 minutes, not on the clock).** Open the store. Note the theme, any accessibility widget, and the scan result if you have one. Read the screener. Fill in the top rows of the summary template.

**1. Open (2 minutes).**
- Thank them. Say why you are calling: you are building a Shopify app and want to learn how stores handle accessibility today.
- "Most of this call is my questions. Near the end I'll describe the app, and I may ask if you'd like to try it when it's ready. No is a fine answer. Criticism helps me most."
- Consent to record (section 8).

**2. Context (3 minutes).**
- "Tell me about the store. What do you sell, and who are your customers?"
- "Who changes the theme when something needs changing? When did that last happen?"
- "Which apps do you rely on most?"

**3. Jobs and priorities (4 minutes).**
- "What's on your list for the store this quarter?"
- "Where does accessibility sit on that list, if at all?"
- "When did accessibility last come up? What happened?" Probe: who raised it, a customer, an agency, a news story, a letter, the EU rules.

**4. What they tried (6 minutes).**
- "Have you done anything about accessibility? Walk me through it."
- For each thing they tried, ask: when, why, who chose it, what it cost, what happened, are they still using it, and what annoys them about it.
- Probe each route by name if they do not mention it: an accessibility widget or overlay, a freelancer or agency, an accessibility app that edits code, switching themes, doing it themselves.
- "What would make you uninstall an app like that?"

**5. Demand letters and fears (4 minutes).** Sensitive. Let them skip.
- "Some merchants have had a demand letter or lawsuit about accessibility. Has that come up for you, or for someone you know? You're welcome to skip this."
- If yes: "What happened first? Who did you call? What did you need to show them? What do you wish you'd had on hand?" Ask about cost only as a rough range, and only if they seem open.
- For everyone: "What worries you most about changing your site for accessibility?" Listen for broken theme, slower site, an ugly widget, cost, time, not knowing what is enough.

**6. Concept check (3 minutes).** Read this neutral description. Do not add claims.

> "Wide Aisle scans your home, collection, product and cart pages. It fixes six common types of issue directly in your theme code, after you preview each change, and you can undo it in one click. It drafts image descriptions that you review. It keeps a dated record of what it found and fixed. It cannot find every accessibility problem, and it does not make any store compliant or protect it from lawsuits."

- "What would you need to see before you let it change your theme?"
- "What would worry you?"
- "Who else would need to say yes?"

**7. Price (4 minutes).** Ask the four Van Westendorp questions first, in this order, about a monthly price. Write the number they say.

1. "At what monthly price would this be so expensive you would not consider it?"
2. "At what monthly price would it start to feel expensive, but you would still consider it?"
3. "At what monthly price would it feel like a bargain, a great buy for the money?"
4. "At what monthly price would it be so cheap you would doubt it works?"

Then show the ladder (D-12):

| Plan | Price | Includes |
|---|---|---|
| Free | $0 | A scan of key pages, an issue report, a draft accessibility statement |
| Starter | $29 a month | The six fix types, alt text for up to 1,000 images a month, a weekly re-scan, the dated record |
| Pro | $79 a month | Starter plus daily re-scans, alerts after theme changes, priority support, an optional human spot check |

- "If this existed today, which would you pick, if any? Why?"
- "What would have to be true for you to pick the next one up?"
- "What do you pay today for anything accessibility-related?" Get a number or "nothing".

If you are short on time, skip the four questions and ask only the ladder.

**8. Offer a next step (2 minutes).** Make it an offer, not a push. Say: "If you'd like to try it when it's ready, here are a few ways." Offer these, strongest first. If they say no, thank them and move on. Write down exactly what they agreed to.

1. A paid pilot at the founding price, once you have confirmed the founding price (section 14). Billing goes through Shopify only (D-12). Never send an invoice or take payment outside Shopify.
2. Installing the pilot on a preview theme when it is ready, with a date.
3. An introduction to the person who decides or pays.
4. An introduction to another store owner or agency.

**9. Close (1 minute).** Thank them. Say what happens next and when. Send the scan report if you promised it.

## 10. Call script: agencies (25 minutes)

Same opening, consent and closing as the merchant script. The middle changes.

**Context (4 minutes).**
- "How many client stores do you look after? On which themes?"
- "What does a typical retainer cover?"

**How accessibility shows up (5 minutes).**
- "When did a client last ask about accessibility? What did they ask for?"
- "Has a client received a demand letter? What did they ask you to do?" Let them skip.
- "Do the EU rules come up with any clients?"

**What they do today (6 minutes).**
- "Walk me through the last accessibility job you did. Tools, hours, what you charged."
- "Do you use an overlay or widget for any clients? Why, or why not?"
- "What happens to that work after the next theme update?"
- "How do you show a client what you fixed?"

**Concept and price (6 minutes).** Read the same neutral description, then add: "For agencies there is a multi-store dashboard and reports with your branding."
- "Would you pay for this yourself, pass the cost to clients, or resell it?"
- "The Agency plan is $199 a month for up to 10 stores. How does that compare with what you charge clients for this work today?"
- "Would per-store pricing suit you better? Why?"
- "What share of revenue would a referral need to be worth your time?" Write the number.

**Next step (2 minutes).** Make it an offer, as in the merchant script. Strongest first:
1. A pilot on at least 3 client stores, billed through Shopify (one M5 exit path is 5 agencies with at least 3 stores each).
2. Permission to run free scans on 2 client stores, with the client's consent.
3. An introduction to another agency.

## 11. Per-call summary template

The research agent fills one table per call within 24 hours, from the transcript. Save each as `interviews/<ID>.md` in private storage (section 8), never in this repo. Use the participant ID only. Quotes are verbatim, short and anonymous.

| Field | Answer |
|---|---|
| ID, date, length | M01, 2026-10-xx, 24 min |
| Recorded | Yes or no |
| Segment | Merchant small, mid or larger; or agency small, mid or larger |
| Role | Owner, ecommerce manager, developer, agency founder |
| Theme and version | From the storefront |
| Markets | US, EU, UK, Canada, other |
| Orders a month (band) or client stores | From the screener |
| Top job this quarter | One line |
| Where accessibility ranks | Not on the list, low, medium, high |
| What triggered it last | Customer, agency, letter, news, EU rules, nothing |
| Demand letter or lawsuit | Yes, no or declined. No details |
| What they tried | Tool or person, when, cost, outcome, still in use |
| Fears and objections | Their words, short |
| Van Westendorp: too expensive | $ |
| Van Westendorp: expensive but considered | $ |
| Van Westendorp: bargain | $ |
| Van Westendorp: too cheap | $ |
| Ladder pick | Free, Starter, Pro, Agency or none, and why |
| Spend on accessibility today | $ a month or one-off, or nothing |
| Next step offered | Which one, or none |
| Commitment given | What exactly, with a date, or none |
| Evidence level (section 12) | 0 to 5 |
| H1 to H6 | For each: supports, against or no signal |
| Best quote | Verbatim, anonymous, with consent |
| Surprises | What we did not expect |
| Follow-ups | Who does what by when |

## 12. Synthesis template and what counts as willingness to pay

### Evidence levels

Score each call at its highest level reached. Compliments and future promises are level 0, however warm they feel.

| Level | Evidence | Example |
|---|---|---|
| 5 | Money: paid, or agreed in writing to a paid pilot at a stated price | Agrees in writing to a pilot at $X a month, billed through Shopify (D-12) |
| 4 | Current spend on the same job at or above our price, with an amount named | Pays $49 a month for an accessibility app, or paid a freelancer $1,500 last year |
| 3 | A concrete next step that costs them time or reputation, with a date | Will install on a preview theme on a set date; introduced the person who pays; agency names 3 client stores |
| 2 | A specific past pain with money attached | Spent money answering a demand letter; has a budget line for accessibility |
| 1 | Stated price only | Van Westendorp answers, or "I'd pay $29" |
| 0 | Compliments or vague interest | "Great idea", "Let me know when it launches" |

### Proposed bar for "evidence of willingness to pay" (M2 exit)

This bar is a proposal. The owner confirms it through the planner.

- At least 5 of 15 merchants reach level 3 or higher, and at least 2 of those reach level 4 or 5.
- At least 2 of 5 agencies reach level 3 or higher.
- The median "expensive but considered" answer for small and mid merchants is at or above $29.

With 15 people, Van Westendorp answers show a rough range, not a precise price. Report medians and ranges per segment. Do not draw curves or claim an optimal price from them. Pilots in M5 test price with real money (D-07).

### Synthesis outline

Write `docs/research/interview-synthesis.md`. It is the only interview file in this repo, and this repo is public (Q-32). Build it from the private summaries and keep it anonymous:

- No names, emails, store addresses, participant IDs or details that point to one person or store.
- Report counts by segment, never one row per call.
- Report demand letters and lawsuits only as one total across all calls. Never split that total by segment, theme or market, and never put it next to a quote.
- Quote only people who agreed on the recording, and strip any detail that points to them.
- If a segment has fewer than 3 people, merge it with the next one before you report it.

Sections, point first:

1. **Answer.** Will merchants pay $29 a month without a lawsuit hanging over them? Will agencies pay $199? Yes, no or unclear, with the evidence count.
2. **Who we spoke to.** Counts by segment, theme and market. No IDs.
3. **Willingness to pay.** Calls per evidence level, by segment. For levels 3 to 5, list the kinds of commitment given, without IDs.
4. **Price answers.** Medians and ranges of the four Van Westendorp answers by segment. Ladder picks by segment. Current spend on accessibility.
5. **Jobs.** The jobs people described, ranked by how many calls raised them.
6. **What they tried and why it fell short.** Overlays, freelancers, apps, agencies.
7. **Fears and objections.** Ranked by count, each with one short quote.
8. **Hypotheses.** H1 to H6: supported, contradicted or unclear, with counts.
9. **What changes.** Pricing, scope, onboarding, messaging and the outreach list. Each change says how many calls are behind it.
10. **Open questions.** What the M5 pilots must answer.

## 13. Words we use and words we never use

Never say or write, on a call or in a message (D-06):

- compliant, compliance (as something we deliver), certified, lawsuit-proof, 100% accessible
- "protects you from lawsuits", "ADA compliant", "WCAG compliant", "EAA compliant"

Say instead:

- "fixes {number} detected issues of six common types"
- "keeps a dated record of what was found and fixed"
- "re-checks after theme changes"
- "automated scans cannot find every accessibility problem"

If a merchant asks "Will this make me compliant?", answer: "No tool can promise that. Automated scans miss some problems. What we do is fix the common issues we detect, show you each fix, and keep a dated record. For what the law asks of your store, a lawyer is the right person."

## 14. Decide before the first batch

These go to the owner through the planner.

1. **What "recently" means for D-16.** Proposal: any accessibility lawsuit naming the store or its company in the last 24 months. Also confirm the check in section 4, step 2, until a lawsuit list exists.
2. **The founding price to offer on calls.** D-12 says "for example 50% off for 12 months", which would be $14.50 a month for Starter and $39.50 for Pro. Confirm before anyone hears a number.
3. **How long to keep recordings, transcripts and notes.** Proposal: delete recordings and transcripts 30 days after the summary is written. Delete per-call summaries 12 months after the call. The consent script and message G quote both periods.
4. **The willingness-to-pay bar** in section 12.
5. **A thank-you for participants.** The free scan report costs nothing. Any gift card or paid incentive needs your approval first (D-04).

## 15. Questions for a lawyer

This kit is not legal advice. Add these to the D-14 review list.

1. For calls with people in different US states and other countries, is asking everyone for consent at the start and on the recording enough?
2. Does a cold email asking for a research call, with a free scan report, count as commercial email under CAN-SPAM? If it does, is the opening line "I'm building a Shopify app" enough to identify it as an ad?
3. What applies to cold B2B email and DMs to people in Canada (CASL), the UK (PECR and UK GDPR) and the EU (each country's ePrivacy rules and GDPR)? Until you answer, cold messages go only to stores and agencies based in the US.
4. Is it a problem to run an automated scan of a store's public pages and send the owner the result without being asked?
5. If a participant tells us about a demand letter or lawsuit, what can we keep in our notes, and for how long?
6. Is the consent script enough notice under GDPR and UK GDPR for recording, AI transcription, keeping summaries and publishing a combined anonymous summary? Do we also need a written privacy notice?
7. Can we quote participants anonymously in public material later, and what written permission do we need?

## 16. Sources

Checked 2026-10-08. This container could not open these pages (the proxy denies them; owner queue Q-01). Each one was read only through a search summary.

- Van Westendorp price sensitivity meter, the four questions and the warning that it measures stated acceptability, not purchases: [Wikipedia](https://en.wikipedia.org/wiki/Van_Westendorp%27s_Price_Sensitivity_Meter) (via search, not opened); [Umbrex](https://umbrex.com/resources/frameworks/marketing-frameworks/van-westendorp-price-sensitivity-meter/) (via search, not opened).
- Interview method, asking about past behaviour and counting commitments of time, reputation or money: summaries of Rob Fitzpatrick's The Mom Test by [mtlynch.io](https://mtlynch.io/book-reports/the-mom-test/) and [Yevgeniy Brikman](https://www.ybrikman.com/blog/2023/03/29/the-mom-test/) (via search, not opened).
- Recording consent: lists of all-party consent states differ between sources, for example [Kilpatrick Townsend, July 2024](https://ktslaw.com/Insights/Alert/2024/7/Wiretap-Laws-in-the-United-States) and [Kixie](https://www.kixie.com/sales-blog/what-are-the-laws-governing-call-recordings) (via search, not opened). The exact list is unverified.
- CAN-SPAM covers B2B commercial email. It needs accurate header information, a subject line that matches the body, clear identification of an ad, a valid postal address and a clear opt-out. Opt-outs must be honoured within 10 business days, and the opt-out route must work for at least 30 days after sending. Opted-out addresses may not be sold or transferred. Source: [FTC compliance guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business) (via search, not opened; checked 2026-10-08).
- Cold email outside the US: CASL generally needs consent before a commercial message, and its B2B exemption needs an existing relationship between the organisations ([Torys, June 2020](https://www.torys.com/insights/publications/2020/06/fca-confirms-casl-is-constitutional-but-limits-business-communications-exemption), via search, not opened). Under PECR, cold email to a UK company needs no prior consent, but sole traders and some partnerships count as individuals ([Sprintlaw UK](https://sprintlaw.co.uk/articles/unsolicited-emails-in-the-uk-what-businesses-can-send-and-stay-compliant/), via search, not opened). Both checked 2026-10-08. Law-firm and vendor commentary, not primary texts; a lawyer question (section 15).
- Whisper, OpenAI's open-source speech-to-text model, runs on your own machine under the MIT licence: [github.com/openai/whisper](https://github.com/openai/whisper) (via search, not opened; seen through a mirror's metadata and third-party reviews; checked 2026-10-08).
- r/shopify promotion rules described as strict by third parties: [The Hive Index](https://thehiveindex.com/communities/r-shopify/) (via search, not opened). The subreddit's own rules are unverified.
- Shopify Partner Directory as a place to find agencies by service: [Shopify](https://www.shopify.com/partners/directory/partner/devxagency) (an example profile; via search, not opened).
- Plan inputs: docs/plan/roadmap.md and decisions D-01, D-04, D-06, D-07, D-08, D-12, D-14, D-16 and D-18 in this repo (opened).
