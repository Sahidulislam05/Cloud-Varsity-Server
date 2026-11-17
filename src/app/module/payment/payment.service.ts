import crypto from "node:crypto";
import httpStatus from "http-status";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import { sslCommerz } from "../../lib/sslcommerz";
import { AppError } from "../../utils/appError";
import { TInvoiceListQuery } from "../finance/finance.interface";
import { NotificationService } from "../notification/notification.service";
import { AuditService } from "../audit/audit.service";
import { sendTemplatedEmail } from "../../utils/sendTemplatedEmail";
import { parsePagination } from "../../utils/pagination";

const initiatePayment = async (userId: string, invoiceId: string) => {
  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId },
    include: { user: true },
  });
  if (!studentProfile)
    throw new AppError(httpStatus.NOT_FOUND, "Student profile not found");

  // Cryptographic randomness: Math.random() produced guessable transaction
  // ids (predictable/sequential), which invites forged callback attempts.
  const transactionId = `CV${Date.now()}${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;

  // The row lock serialises this check against a payment completing at the
  // same moment, so a just-paid invoice cannot start another payment.
  const invoice = await prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<{ status: string }[]>`
      SELECT status FROM invoices
      WHERE id = ${invoiceId} AND "studentId" = ${studentProfile.id}
      FOR UPDATE
    `;
    if (!locked) throw new AppError(httpStatus.NOT_FOUND, "Invoice not found");
    if (locked.status === "PAID") {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "This invoice has already been paid",
      );
    }

    const lockedInvoice = await tx.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    await tx.payment.create({
      data: {
        invoiceId: lockedInvoice.id,
        studentId: studentProfile.id,
        transactionId,
        amount: lockedInvoice.amount,
        status: "PENDING",
      },
    });
    return lockedInvoice;
  });

  const apiResponse = await sslCommerz.init({
    total_amount: Number(invoice.amount),
    currency: "BDT",
    tran_id: transactionId,

    success_url: `${config.backend_url}/api/v1/payments/success`,
    fail_url: `${config.backend_url}/api/v1/payments/fail`,
    cancel_url: `${config.backend_url}/api/v1/payments/cancel`,
    ipn_url: `${config.backend_url}/api/v1/payments/ipn`,

    shipping_method: "NO",
    product_name: "Semester Tuition Fee",
    product_category: "Education",
    product_profile: "general",
    cus_name: studentProfile.user.name,
    cus_email: studentProfile.user.email,
    cus_add1: "Dhaka",
    cus_city: "Dhaka",
    cus_postcode: "1000",
    cus_country: "Bangladesh",
    cus_phone: studentProfile.user.phone || "01700000000",
  });

  if (apiResponse.status !== "SUCCESS") {
    throw new AppError(
      httpStatus.BAD_GATEWAY,
      "Failed to initiate payment with SSLCommerz",
    );
  }

  return { paymentUrl: apiResponse.GatewayPageURL, transactionId };
};

/**
 * Pure binding check between an SSLCommerz `validate()` response and OUR
 * payment record. Never trust the callback body's tran_id alone: tran_id,
 * status and amount must all line up with the record the val_id claims.
 */
export const isValidationBoundToPayment = (
  validation: Record<string, unknown>,
  payment: { transactionId: string; amount: unknown },
) =>
  validation.tran_id === payment.transactionId &&
  (validation.status === "VALID" || validation.status === "VALIDATED") &&
  Number(validation.amount) >= Number(payment.amount);

const completePayment = async (transactionId: string, valId: string) => {
  const payment = await prisma.payment.findUnique({
    where: { transactionId },
    include: { student: { include: { user: true } } },
  });
  if (!payment)
    throw new AppError(httpStatus.NOT_FOUND, "Payment record not found");

  if (payment.status === "SUCCESS" || payment.status === "REFUND_REQUIRED") {
    return;
  }

  const validation = await sslCommerz.validate({ val_id: valId });

  // Bind the gateway validation back to OUR payment record — see
  // isValidationBoundToPayment. A matching-but-unbound val_id is rejected
  // without touching the record; a bound-but-invalid status marks it FAILED.
  if (validation.tran_id === payment.transactionId) {
    if (!isValidationBoundToPayment(validation, payment)) {
      await prisma.payment.updateMany({
        where: { transactionId, status: "PENDING" },
        data: { status: "FAILED" },
      });
      throw new AppError(httpStatus.BAD_REQUEST, "Payment validation failed");
    }
  } else {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Payment validation does not match this transaction",
    );
  }

  // The gateway confirmed the money was taken, so the outcome is either
  // "settled the invoice" or "duplicate charge". Both conditional updates
  // lock their row, so the success callback and the IPN racing each other
  // (or two payment sessions for one invoice) resolve to exactly one winner.
  const outcome = await prisma.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({
      where: {
        transactionId,
        status: { notIn: ["SUCCESS", "REFUND_REQUIRED"] },
      },
      data: { status: "SUCCESS", paidAt: new Date() },
    });
    if (claimed.count === 0) return "ALREADY_PROCESSED" as const;

    const settled = await tx.invoice.updateMany({
      where: { id: payment.invoiceId, status: { not: "PAID" } },
      data: { status: "PAID" },
    });
    if (settled.count === 1) return "PAID" as const;

    await tx.payment.update({
      where: { transactionId },
      data: { status: "REFUND_REQUIRED" },
    });
    return "DUPLICATE" as const;
  });

  if (outcome === "ALREADY_PROCESSED") return;

  if (outcome === "DUPLICATE") {
    await NotificationService.createNotification({
      userId: payment.student.userId,
      title: "Duplicate Payment Received",
      message: `Your invoice was already paid, so the extra payment of ৳${payment.amount} (transaction ${payment.transactionId}) will be refunded.`,
    });
    await AuditService.logAction({
      userId: payment.student.userId,
      action: "PAYMENT_REFUND_REQUIRED",
      entityName: "Invoice",
      entityId: payment.invoiceId,
      newValue: {
        amount: Number(payment.amount),
        transactionId: payment.transactionId,
      },
    });
    return;
  }

  await NotificationService.createNotification({
    userId: payment.student.userId,
    title: "Payment Successful",
    message: `Your payment of ৳${payment.amount} has been received successfully.`,
  });

  await sendTemplatedEmail(
    payment.student.user.email,
    "Payment Confirmation - CloudVarsity",
    "payment-success",
    {
      name: payment.student.user.name,
      amount: Number(payment.amount).toFixed(2),
      transactionId: payment.transactionId,
      paidAt: new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
    },
  );

  await AuditService.logAction({
    userId: payment.student.userId,
    action: "PAYMENT_SUCCESS",
    entityName: "Invoice",
    entityId: payment.invoiceId,
    newValue: {
      amount: Number(payment.amount),
      transactionId: payment.transactionId,
    },
  });
};

const markPaymentFailed = async (transactionId: string) => {
  await prisma.payment.updateMany({
    where: { transactionId, status: "PENDING" },
    data: { status: "FAILED" },
  });
};

const markPaymentCancelled = async (transactionId: string) => {
  await prisma.payment.updateMany({
    where: { transactionId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
};

const getMyInvoices = async (userId: string) => {
  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId },
  });
  if (!studentProfile)
    throw new AppError(httpStatus.NOT_FOUND, "Student profile not found");

  return prisma.invoice.findMany({
    where: { studentId: studentProfile.id },
    include: { feeStructure: { include: { semester: true } }, payments: true },
    orderBy: { createdAt: "desc" },
  });
};

const getAllInvoices = async (query: TInvoiceListQuery) => {
  const { page, limit, skip } = parsePagination(query);
  const where = {
    ...(query.status && {
      status: query.status as "PENDING" | "PAID" | "OVERDUE",
    }),
  };

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      skip,
      take: limit,
      include: {
        student: { include: { user: { select: { name: true, email: true } } } },
        feeStructure: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.invoice.count({ where }),
  ]);

  return {
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    data: invoices,
  };
};

export const PaymentService = {
  initiatePayment,
  completePayment,
  markPaymentFailed,
  markPaymentCancelled,
  getMyInvoices,
  getAllInvoices,
};
