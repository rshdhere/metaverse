import { Resend } from "resend";
import { RESEND_API_KEY } from "@repo/config";
import { FRONTEND_URL } from "@repo/config/constants";

const resend = new Resend(RESEND_API_KEY);

export async function sendVerificationEmail(
  email: string,
  token: string,
): Promise<{ success: boolean; error?: string }> {
  const verificationUrl = `${FRONTEND_URL}/auth/verify-email?token=${token}`;

  try {
    const { error } = await resend.emails.send({
      from: "auth@updates.raashed.xyz",
      to: email,
      subject: "Verify your email address",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px; background-color: #f9fafb;">
            <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 8px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <h1 style="margin: 0 0 24px; font-size: 24px; font-weight: 600; color: #111827;">
                Verify your email
              </h1>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.5; color: #4b5563;">
                Thanks for signing up at <b>rshdhere technologies</b>! Please click the button below to verify your email address.
              </p>
              <a href="${verificationUrl}" style="display: inline-block; padding: 12px 24px; background-color: #111827; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">
                Verify Email
              </a>
              <p style="margin: 24px 0 0; font-size: 14px; line-height: 1.5; color: #6b7280;">
                If you didn't create an account, you can safely ignore this email.
              </p>
              <p style="margin: 16px 0 0; font-size: 12px; color: #9ca3af;">
                This link will expire in 24 hours.
              </p>
            </div>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error("Failed to send verification email:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error("Error sending verification email:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to send email",
    };
  }
}
