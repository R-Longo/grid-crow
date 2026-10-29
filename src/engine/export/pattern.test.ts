import { describe, expect, it } from "vitest";

import { foundationChain, startingSteps } from "./pattern";
describe("starting instructions", () => {
  it("chains the width plus one, whatever the height", () => {
    expect(foundationChain(64)).toBe(65);
    expect(startingSteps(64)[0]).toEqual({ heading: "FOUNDATION", text: "Chain 65." });
    expect(startingSteps(64)[1].text).toContain("work 64 single crochet");
    expect(startingSteps(64)[2].text).toContain("Chain 1, turn. Work 64 single crochet");
    expect(startingSteps(36)[0].text).toBe("Chain 37.");
  });
});
