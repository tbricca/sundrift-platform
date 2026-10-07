import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  simulateCampaign,
  DEMO_CAMPAIGNS,
  DEMO_PRODUCTS,
} from "../../../packages/shared/src/demo-catalog.ts";

describe("weekender revenue simulation", () => {
  it("matches the hero conference numbers", () => {
    const campaign = DEMO_CAMPAIGNS.find(
      (entry) => entry.id === "campaign_weekender_midwest",
    );
    expect(campaign).toBeTruthy();
    const result = simulateCampaign(campaign!);
    expect(result).toMatchObject({
      baselineSessions: 9421,
      simulatedSessions: 10589,
      baselineConversionPct: 4.52,
      simulatedConversionPct: 6.12,
      baselineAov: 52.37,
      simulatedAov: 54.41,
    });
    expect(result!.baselineRevenue).toBeCloseTo(22300.68, 2);
    expect(result!.simulatedRevenue).toBeCloseTo(35260.23, 2);
  });

  it("keeps travel products in the analytics seed", () => {
    const file = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../analytics/seeds/dashboards/sundrift-product-traffic.json",
    );
    const raw = readFileSync(file, "utf8");
    expect(raw).toContain("The Weekender");
    expect(raw).toContain("9421");
    expect(raw).toContain("Packing cubes");
    expect(raw).toContain("Care+ lounge");
    expect(raw.toLowerCase()).not.toContain("away");
    for (const product of DEMO_PRODUCTS) {
      expect(raw).toContain(product.name);
    }
  });
});
