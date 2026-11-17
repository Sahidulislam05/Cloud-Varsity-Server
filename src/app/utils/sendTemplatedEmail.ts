import ejs from "ejs";
import config from "../config";
import { transporter } from "../lib/nodemailer";
import { resolveTemplatePath } from "./templateResolver";

/**
 * Non-fatal templated email for notifications (welcome, result published,
 * payment confirmation, ...). Failures are logged, never thrown — the
 * business action that triggered the email must not break.
 */
export const sendTemplatedEmail = async (
  to: string,
  subject: string,
  templateName: string,
  data: Record<string, unknown>,
) => {
  try {
    const html = await ejs.renderFile(resolveTemplatePath(templateName), data);
    await transporter.sendMail({
      from: config.email_sender,
      to,
      subject,
      html,
    });
  } catch (error) {
    console.error(`Failed to send "${templateName}" email:`, error);
  }
};
