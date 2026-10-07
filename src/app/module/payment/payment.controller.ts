import type { Request, Response } from "express";
import httpStatus from "http-status";
import config from "../../config";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { PaymentService } from "./payment.service";
import { TInvoiceListQuery } from "../finance/finance.interface";

const frontendBase = () =>
  (config.frontend_url ?? "").split(",")[0].trim().replace(/\/$/, "");

const redirectToFrontend = (
  res: Response,
  path: string,
  params: Record<string, string | undefined>,
) => {
  const url = new URL(`${frontendBase()}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  res.redirect(httpStatus.SEE_OTHER, url.toString());
};

const getBodyString = (body: unknown, key: string): string | undefined => {
  const value = (body as Record<string, unknown> | undefined)?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const initiatePayment = catchAsync(async (req: Request, res: Response) => {
  const result = await PaymentService.initiatePayment(
    req.user!.userId,
    req.params.invoiceId,
  );
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Payment session created",
    data: result,
  });
});

const paymentSuccess = catchAsync(async (req: Request, res: Response) => {
  const tranId = getBodyString(req.body, "tran_id");
  const valId = getBodyString(req.body, "val_id");

  let verified = false;
  try {
    if (tranId && valId) {
      await PaymentService.completePayment(tranId, valId);
      verified = true;
    }
  } catch {
    // SSLCommerz এর validate ব্যর্থ হলে ইউজারকে JSON error না দেখিয়ে ব্যর্থতার পেজে পাঠাই
    verified = false;
  }

  if (verified)
    redirectToFrontend(res, "/payment/success", { tran_id: tranId });
  else
    redirectToFrontend(res, "/payment/cancel", {
      tran_id: tranId,
      reason: "failed",
    });
});

const paymentFail = catchAsync(async (req: Request, res: Response) => {
  const tranId = getBodyString(req.body, "tran_id");
  // ⚠️ tran_id না থাকলে updateMany এর where ফাঁকা হয়ে যেত আর সবার PENDING payment FAILED হয়ে যেত
  if (tranId) await PaymentService.markPaymentFailed(tranId);
  redirectToFrontend(res, "/payment/cancel", {
    tran_id: tranId,
    reason: "failed",
  });
});

const paymentCancel = catchAsync(async (req: Request, res: Response) => {
  const tranId = getBodyString(req.body, "tran_id");
  if (tranId) await PaymentService.markPaymentCancelled(tranId);
  redirectToFrontend(res, "/payment/cancel", { tran_id: tranId });
});

const paymentIpn = catchAsync(async (req: Request, res: Response) => {
  const tranId = getBodyString(req.body, "tran_id");
  const valId = getBodyString(req.body, "val_id");

  try {
    if (tranId && valId) await PaymentService.completePayment(tranId, valId);
  } catch {
    // IPN কে সবসময় 200 দিয়ে জানাতে হয়, নইলে SSLCommerz বারবার retry করে
  }
  res.status(httpStatus.OK).send("IPN received");
});

const getMyInvoices = catchAsync(async (req: Request, res: Response) => {
  const result = await PaymentService.getMyInvoices(req.user!.userId);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Invoices retrieved successfully",
    data: result,
  });
});

const getAllInvoices = catchAsync(async (req: Request, res: Response) => {
  const result = await PaymentService.getAllInvoices(
    req.query as TInvoiceListQuery,
  );
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Invoices retrieved successfully",
    data: result.data,
    meta: result.meta,
  });
});

export const PaymentController = {
  initiatePayment,
  paymentSuccess,
  paymentFail,
  paymentCancel,
  paymentIpn,
  getMyInvoices,
  getAllInvoices,
};
