import { describe, expect, it } from "vitest";
import type { CandidateListing, ExchangeRates } from "../lib/schema";
import {
  overallStatus,
  productGroup,
  sourceDomain,
  unitPrice,
  verifyField,
  verifyGroup,
} from "./verifier";
const fx: ExchangeRates = {
  base: "AUD",
  rates: { AUD: 1, USD: 2, EUR: 1.5, GBP: 2 },
  source: "Test fixture",
  checkedAt: "2026-01-01T00:00:00Z",
  fallback: true,
};
function listing(
  url: string,
  amount: number,
  extra: Partial<CandidateListing> = {},
): CandidateListing {
  return {
    partId: "arm",
    supplier: "Maker",
    productName: "Arm 300",
    productUrl: url,
    price: { amount, currency: "AUD", qty: 1 },
    stock: "in_stock",
    leadTimeDays: 7,
    shipsToDestination: true,
    specsFound: {},
    evidence: [
      {
        field: "price",
        value: amount,
        sourceUrl: url,
        quote: `AUD ${amount}`,
        checkedAt: fx.checkedAt,
      },
      {
        field: "stock",
        value: "in_stock",
        sourceUrl: url,
        quote: "In stock",
        checkedAt: fx.checkedAt,
      },
      {
        field: "leadTimeDays",
        value: 7,
        sourceUrl: url,
        quote: "Delivery in 7 days",
        checkedAt: fx.checkedAt,
      },
      {
        field: "shipsToDestination",
        value: true,
        sourceUrl: url,
        quote: "Ships to Australia",
        checkedAt: fx.checkedAt,
      },
    ],
    ...extra,
  };
}
describe("independent source verifier", () => {
  it("keeps missing values unknown", () =>
    expect(verifyField([], "price", fx)).toEqual({
      status: "unknown",
      evidence: [],
      sourceCount: 0,
    }));
  it("does not trust a listing without field evidence", () =>
    expect(
      verifyField(
        [listing("https://a.com", 100, { evidence: [] })],
        "price",
        fx,
      ).status,
    ).toBe("unknown"));
  it("drops evidence with no quotation", () => {
    const l = listing("https://a.com", 100);
    l.evidence[0].quote = undefined;
    expect(verifyField([l], "price", fx).status).toBe("unknown");
  });
  it("marks one independent source", () =>
    expect(
      verifyField([listing("https://a.com/p", 100)], "price", fx).status,
    ).toBe("single_source"));
  it("does not count subdomains or two pages as independent", () => {
    const f = verifyField(
      [
        listing("https://shop.maker.com.au/a", 100),
        listing("https://review.maker.com.au/b", 100),
      ],
      "price",
      fx,
    );
    expect(f.sourceCount).toBe(1);
    expect(f.status).toBe("single_source");
    expect(f.evidence).toHaveLength(2);
  });
  it("resolves public suffixes", () =>
    expect(sourceDomain("https://shop.vendor.co.uk/p")).toBe("vendor.co.uk"));
  it("agrees at the inclusive 5 percent boundary", () =>
    expect(
      verifyField(
        [listing("https://a.com", 100), listing("https://b.com", 105)],
        "price",
        fx,
      ).status,
    ).toBe("agreed"));
  it("keeps all conflicting prices and their range", () => {
    const f = verifyField(
      [listing("https://a.com", 100), listing("https://b.com", 106)],
      "price",
      fx,
    );
    expect(f.status).toBe("conflicting");
    expect(f.min).toBe(100);
    expect(f.max).toBe(106);
    expect(f.evidence).toHaveLength(2);
  });
  it("does not hide a third source's disagreement", () =>
    expect(
      verifyField(
        [
          listing("https://a.com", 100),
          listing("https://b.com", 101),
          listing("https://c.com", 200),
        ],
        "price",
        fx,
      ).status,
    ).toBe("conflicting"));
  it("normalizes currencies and pack sizes before comparison", () => {
    const b = listing("https://b.com", 100, {
      price: { amount: 100, currency: "USD", qty: 2 },
    });
    expect(
      verifyField([listing("https://a.com", 100), b], "price", fx).status,
    ).toBe("agreed");
  });
  it("strips explicitly known tax", () =>
    expect(
      unitPrice(
        listing("https://a.com", 110, {
          price: {
            amount: 110,
            currency: "AUD",
            qty: 1,
            includesTax: true,
            taxRate: 0.1,
          },
        }),
        fx,
      ),
    ).toBeCloseTo(100));
  it("does not guess a missing tax rate", () =>
    expect(
      unitPrice(
        listing("https://a.com", 110, {
          price: { amount: 110, currency: "AUD", qty: 1, includesTax: true },
        }),
        fx,
      ),
    ).toBe(110));
  it("allows a three day lead-time difference", () => {
    const b = listing("https://b.com", 100, { leadTimeDays: 10 });
    b.evidence[2].value = 10;
    expect(
      verifyField([listing("https://a.com", 100), b], "leadTimeDays", fx)
        .status,
    ).toBe("agreed");
    b.leadTimeDays = 11;
    b.evidence[2].value = 11;
    expect(
      verifyField([listing("https://a.com", 100), b], "leadTimeDays", fx)
        .status,
    ).toBe("conflicting");
  });
  it("requires booleans to match", () => {
    const b = listing("https://b.com", 100, { shipsToDestination: false });
    b.evidence[3].value = false;
    expect(
      verifyField([listing("https://a.com", 100), b], "shipsToDestination", fx)
        .status,
    ).toBe("conflicting");
  });
  it("treats unknown stock as missing evidence", () => {
    const b = listing("https://b.com", 100, { stock: "unknown" });
    b.evidence[1].value = "unknown";
    expect(verifyField([b], "stock", fx).status).toBe("unknown");
  });
  it("excludes rejected listings", () =>
    expect(
      verifyField(
        [listing("https://a.com", 100, { rejectedReason: "Payload too low" })],
        "price",
        fx,
      ).status,
    ).toBe("unknown"));
  it("does not merge distinct models or sellers", () => {
    expect(productGroup(listing("https://a.com", 100))).not.toBe(
      productGroup(listing("https://b.com", 100, { productName: "Arm 500" })),
    );
    expect(productGroup(listing("https://a.com", 100))).not.toBe(
      productGroup(listing("https://b.com", 100, { supplier: "Other" })),
    );
  });
  it("normalizes casing and whitespace in product identity", () =>
    expect(productGroup(listing("https://a.com", 100))).toBe(
      productGroup(
        listing("https://b.com", 100, {
          supplier: " MAKER ",
          productName: " arm   300 ",
        }),
      ),
    ));
  it("uses the newest value per domain", () => {
    const b = listing("https://a.com/new", 120);
    b.evidence[0].checkedAt = "2026-02-01T00:00:00Z";
    expect(
      verifyField([listing("https://a.com/old", 100), b], "price", fx).value,
    ).toBe(120);
  });
  it("does not mark a partially unverified row agreed", () => {
    const l = listing("https://a.com", 100);
    l.evidence = l.evidence.filter((e) => e.field !== "stock");
    const r = verifyGroup([l], fx);
    expect(overallStatus(r)).toBe("single_source");
  });
});
