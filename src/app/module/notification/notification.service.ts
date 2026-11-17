import httpStatus from "http-status";
import config from "../../config";
import { transporter } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/appError";
import type {
  TCreateNotificationPayload,
  TNotificationListQuery,
} from "./notification.interface";
import { parsePagination } from "../../utils/pagination";

// এটাই মূল reusable function — অন্য যেকোনো module সরাসরি import করে কল করবে
const createNotification = async (payload: TCreateNotificationPayload) => {
  try {
    return await prisma.notification.create({ data: payload });
  } catch (error) {
    console.error("Failed to create notification:", error);
    return null;
  }
};

const sendEmailNotification = async (
  to: string,
  subject: string,
  message: string,
) => {
  try {
    await transporter.sendMail({
      from: config.email_sender,
      to,
      subject,
      html: `<p>${message}</p>`,
    });
  } catch (error) {
    console.error("Failed to send notification email:", error);
  }
};

const getMyNotifications = async (
  userId: string,
  query: TNotificationListQuery,
) => {
  const { page, limit, skip } = parsePagination(query);

  const where = {
    userId,
    ...(query.isRead !== undefined && { isRead: query.isRead === "true" }),
  };

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  return {
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      unreadCount,
    },
    data: notifications,
  };
};

const markAsRead = async (userId: string, notificationId: string) => {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
  });
  if (!notification)
    throw new AppError(httpStatus.NOT_FOUND, "Notification not found");

  return prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true },
  });
};

const markAllAsRead = async (userId: string) => {
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
};

export const NotificationService = {
  createNotification,
  sendEmailNotification,
  getMyNotifications,
  markAsRead,
  markAllAsRead,
};
