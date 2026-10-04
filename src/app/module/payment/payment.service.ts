import httpStatus from "http-status";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import { sslCommerz } from "../../lib/sslcommerz";
import { AppError } from "../../utils/appError";
import { TInvoiceListQuery } from "../finance/finance.interface";
import { NotificationService } from "../notification/notification.service";
import { AuditService } from "../audit/audit.service";
import { sendTemplatedEmail } from "../../utils/sendTemplatedEmail";

const initiatePayment = async (userId: string, invoiceId: string) => {
  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId },
    include: { user: true },
  });
  if (!studentProfile)
    throw new AppError(httpStatus.NOT_FOUND, "Student profile not found");

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, studentId: studentProfile.id },
  });
  if (!invoice) throw new AppError(httpStatus.NOT_FOUND, "Invoice not found");

  if (invoice.status === "PAID") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "This invoice has already been paid",
    );
  }

  const transactionId = `CV${Date.now()}${Math.floor(Math.random() * 1000)}`;

  await prisma.payment.create({
    data: {
      invoiceId: invoice.id,
      studentId: studentProfile.id,
      transactionId,
      amount: invoice.amount,
      status: "PENDING",
    },
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

const completePayment = async (transactionId: string, valId: string) => {
  const payment = await prisma.payment.findUnique({
    where: { transactionId },
    include: { student: { include: { user: true } } },
  });
  if (!payment)
    throw new AppError(httpStatus.NOT_FOUND, "Payment record not found");

  if (payment.status === "SUCCESS") return payment;

  const validation = await sslCommerz.validate({ val_id: valId });

  if (validation.status !== "VALID" && validation.status !== "VALIDATED") {
    await prisma.payment.update({
      where: { transactionId },
      data: { status: "FAILED" },
    });
    throw new AppError(httpStatus.BAD_REQUEST, "Payment validation failed");
  }

  const result = await prisma.$transaction(async (tx) => {
    const updatedPayment = await tx.payment.update({
      where: { transactionId },
      data: { status: "SUCCESS", paidAt: new Date() },
    });
    await tx.invoice.update({
      where: { id: payment.invoiceId },
      data: { status: "PAID" },
    });
    return updatedPayment;
  });

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
  return result;
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
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;
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
