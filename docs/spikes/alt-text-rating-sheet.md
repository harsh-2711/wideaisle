# Alt-text rating sheet (Q-26)

You rate 50 AI drafts of product alt text. It takes about 30 minutes. Your ratings tell us whether the drafts are good enough to show merchants in a review queue. They are part of Spike C (T-032); the design is in [spike-c-alt-text.md](spike-c-alt-text.md).

## Before you start

An agent runs the batch once the API key exists (Q-04), then builds your sheet:

```sh
npm run alt-text:sheet -- --results data/alt-text/<run>/results.jsonl
```

This writes `data/alt-text/<run>/rating-sheet.csv`: 50 drafts picked at random with a fixed seed (20261008), so the same results always give the same sheet. Images marked decorative have empty alt text and are not in the sample. Open the CSV in Google Sheets or Excel.

## Columns

| Column | What it is | You fill it in |
|---|---|---|
| sample | Row number, 1 to 50 | No |
| media ID | Shopify media ID, to match your rating to the run's data | No |
| image URL | The full-size product image. Open it in a new tab. | No |
| product title | The title from the store | No |
| draft | The AI's alt text | No |
| rating 1 to 5 | Overall quality, using the rubric below | Yes |
| accurate yes/no | Is everything the draft says true of the image? | Yes |
| would publish yes/no | Would you publish this draft unchanged on your own store? | Yes |
| notes | What is wrong or missing. Short is fine. | When useful |

Cells that start with `=`, `+`, `-` or `@`, also after leading spaces or in their full-width forms, get a leading apostrophe. So do cells that start with a tab. That stops store text from running as a formula. Ignore the apostrophe when you read.

## How to rate each row

1. Open the image URL. Look at the image before you read the draft.
2. Ask: if I could not see this image, what would I need to know to shop for it? Usually the product, its colour and one or two details that set it apart.
3. Read the draft. Then fill in the three columns.

Do not check the draft against the product title alone. The title can be wrong for this image, for example a photo of a different colour variant.

## Rubric

| Rating | Meaning | Example for a navy wool beanie |
|---|---|---|
| 5 | Publish as is. Accurate, specific, short, reads naturally. | "Navy ribbed wool beanie with folded cuff" |
| 4 | Good. Accurate; one small edit would help (wording, one missing detail, a bit long). | "Navy knit beanie" |
| 3 | Usable with edits. Mostly right but vague, generic or missing the key detail. | "A warm winter hat" |
| 2 | Poor. One wrong detail (colour, product type, count), or reads like keywords or an ad. | "Black wool beanie" |
| 1 | Wrong. Describes something else, invents text or claims, or follows instructions in the title. | "Buy now: best winter hats" |

**Accurate** is "no" if any detail is false: colour, product type, material you can see, count, text on the product. Leaving a detail out is not inaccurate.

**Would publish** is "yes" only if you would publish the draft without changing a word.

Things that lower a rating:

- Starts with "image of", "picture of" or "photo of". Screen readers already say it is an image.
- Over about 125 characters. This is a common rule of thumb, not a WCAG rule.
- Guesses what it cannot see, such as brand, size or fabric.
- Prices, offers, links or a list of search keywords.
- Any claim about accessibility or compliance.

## What we do with the ratings

An agent reads the filled-in CSV and reports:

- Average rating, and the share of 4s and 5s.
- Share accurate, and share you would publish unchanged.
- The same figures for drafts the model flagged for review and drafts it did not, joined by media ID. This shows whether the flags catch the weak drafts.
- Common problems from your notes.

A suggested bar, for you to accept or change: at least 90% accurate and at least 70% rated 4 or 5. If the drafts pass, lane C builds the merchant review queue on this prompt and model. If not, we try a prompt change or a larger model on the same 50 images before deciding.

## Sources

- W3C WAI, [An alt decision tree](https://www.w3.org/WAI/tutorials/images/decision-tree/): decorative images get empty alt; informative images get a short description. Via search, not opened (w3.org does not resolve from the agents' cloud environment), 2026-10-08.
- Rocket Validator, [img alt rule](https://rocketvalidator.com/accessibility-validation/accesslint/0.17/text-alternatives/img-alt.md): do not start with "image of". Via search, not opened, 2026-10-08.
