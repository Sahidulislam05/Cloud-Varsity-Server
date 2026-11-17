import { describe, expect, it } from "vitest";
import { isValidationBoundToPayment } from "../src/app/module/payment/payment.service";

const payment = { transactionId: "CV1234567890ABCD1234", amount: 5000 };

describe("isValidationBoundToPayment", () => {
  it("accepts a validation that matches transaction id, status and amount", () => {
    expect(
      isValidationBoundToPayment(
        { tran_id: payment.transactionId, status: "VALID", amount: 5000 },
        payment,
      ),
    ).toBe(true);
    expect(
      isValidationBoundToPayment(
        { tran_id: payment.transactionId, status: "VALIDATED", amount: 6000 },
        payment,
      ),
    ).toBe(true);
  });

  it("rejects a validation for a DIFFERENT transaction (unbound val_id)", () => {
    expect(
      isValidationBoundToPayment(
        { tran_id: "CV9999999999ZZZZ9999", status: "VALID", amount: 5000 },
        payment,
      ),
    ).toBe(false);
  });

  it("rejects non-VALID statuses", () => {
    expect(
      isValidationBoundToPayment(
        { tran_id: payment.transactionId, status: "FAILED", amount: 5000 },
        payment,
      ),
    ).toBe(false);
  });

  it("rejects when the validated amount is lower than the payment amount", () => {
    expect(
      isValidationBoundToPayment(
        { tran_id: payment.transactionId, status: "VALID", amount: 4999.99 },
        payment,
      ),
    ).toBe(false);
  });
});
