import { describe, expect, it } from "vitest";
import { countUniqueProductIds } from "./careerMetrics";

describe("Career Metrics SKU definition", () => {
  it("counts unique fgcode IDs as unique SKUs", () => {
    expect(
      countUniqueProductIds([{ id: "PRODUCT-A" }, { id: "PRODUCT-B" }]),
    ).toBe(2);
  });

  it("does not let multiple orders for one product increase the SKU count", () => {
    const productMaster = [{ id: "PRODUCT-A" }];
    const orders = [
      { product_id: "PRODUCT-A", lot_number: "001" },
      { product_id: "PRODUCT-A", lot_number: "002" },
      { product_id: "PRODUCT-A", lot_number: "003" },
    ];

    expect(orders).toHaveLength(3);
    expect(countUniqueProductIds(productMaster)).toBe(1);
  });

  it("does not let different LOT values create another SKU", () => {
    const productsWithOrderContext = [
      { id: "PRODUCT-A", lot_number: "001" },
      { id: "PRODUCT-A", lot_number: "002" },
    ];

    expect(countUniqueProductIds(productsWithOrderContext)).toBe(1);
  });

  it("counts FRONT and BACK as two SKUs when their immutable IDs differ", () => {
    expect(
      countUniqueProductIds([
        { id: "MIFACID-1KG-FRONT" },
        { id: "MIFACID-1KG-BACK" },
      ]),
    ).toBe(2);
  });
});
