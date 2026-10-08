import { describe, expect, it } from "vitest";
import { FAILURE_TYPES, SIX_AXE_RULES, failureTypeForRule } from "../../app/lib/a11y/rules";

describe("failure types", () => {
  it("covers the six v1 failure types", () => {
    expect(Object.keys(FAILURE_TYPES)).toHaveLength(6);
  });

  it("maps each axe rule back to one failure type", () => {
    for (const rule of SIX_AXE_RULES) expect(failureTypeForRule(rule)).not.toBeNull();
    expect(new Set(SIX_AXE_RULES).size).toBe(SIX_AXE_RULES.length);
    expect(failureTypeForRule("color-contrast")).toBe("low-contrast");
    expect(failureTypeForRule("region")).toBeNull();
  });
});
