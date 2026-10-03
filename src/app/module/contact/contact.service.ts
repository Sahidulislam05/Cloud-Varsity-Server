import config from "../../config";
import { transporter } from "../../lib/nodemailer";

type TContactPayload = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

const sendContactMessage = async (payload: TContactPayload) => {
  await transporter.sendMail({
    from: config.email_sender,
    to: config.email_sender,
    replyTo: { name: payload.name, address: payload.email },
    subject: `[CloudVarsity Contact] ${payload.subject}`,
    text: `Name: ${payload.name}\nEmail: ${payload.email}\n\n${payload.message}`,
  });
};

export const ContactService = { sendContactMessage };
