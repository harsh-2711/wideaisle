// The six failure types v1 fixes (D-08), mapped to the axe-core rules that
// detect them. Every lane (scanner, fixers, evidence pack) uses this list.
export const FAILURE_TYPES = {
  "low-contrast": { label: "Low-contrast text", axeRules: ["color-contrast"] },
  "missing-alt": { label: "Missing alt text", axeRules: ["image-alt", "input-image-alt", "role-img-alt"] },
  "missing-label": { label: "Missing form labels", axeRules: ["label", "select-name"] },
  "empty-link": { label: "Empty links", axeRules: ["link-name"] },
  "empty-button": { label: "Empty buttons", axeRules: ["button-name"] },
  "missing-lang": { label: "Missing page language", axeRules: ["html-has-lang", "html-lang-valid"] },
} as const;

export type FailureType = keyof typeof FAILURE_TYPES;

export const SIX_AXE_RULES: string[] = Object.values(FAILURE_TYPES).flatMap((f) => [...f.axeRules]);

export function failureTypeForRule(ruleId: string): FailureType | null {
  for (const [type, f] of Object.entries(FAILURE_TYPES)) {
    if ((f.axeRules as readonly string[]).includes(ruleId)) return type as FailureType;
  }
  return null;
}
