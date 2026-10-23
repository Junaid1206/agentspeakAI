import { Email } from "@convex-dev/auth/providers/Email";
import axios from "axios";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

const FREEBUFF_EMAIL_API_KEY = process.env.FREEBUFF_EMAIL_API_KEY;

export const emailOtp = Email({
  id: "email-otp",
  maxAge: 60 * 15, // 15 minutes
  // This function can be asynchronous
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    const alphabet = "0123456789";
    return generateRandomString(random, alphabet, 6);
  },
  async sendVerificationRequest({ identifier: email, token }) {
    if (!FREEBUFF_EMAIL_API_KEY) {
      throw new Error("Email OTP is not configured: set FREEBUFF_EMAIL_API_KEY in the Convex deployment environment.");
    }

    try {
      await axios.post(
        "https://auth.freebuff.app/send_otp",
        {
          to: email,
          otp: token,
          appName: process.env.VLY_APP_NAME || "a freebuff.com application",
        },
        {
          headers: {
            "x-api-key": FREEBUFF_EMAIL_API_KEY,
          },
        },
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const data = error.response?.data;
        const responseMessage = typeof data === "string" ? data : data?.message;
        const detail = responseMessage ? ": " + String(responseMessage).slice(0, 240) : "";
        throw new Error("Freebuff OTP email delivery failed" + (status ? " (HTTP " + status + ")" : "") + detail + ".");
      }
      throw new Error("Freebuff OTP email delivery failed.");
    }
  },
});
