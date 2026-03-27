import { Resend } from 'resend';
import { logger } from '../lib/logger';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_ADDRESS = process.env.EMAIL_FROM || 'Mint <notifications@mint-clone.app>';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: EmailOptions): Promise<boolean> {
  if (!resend) {
    logger.warn('Email skipped — RESEND_API_KEY not configured', { to, subject });
    return false;
  }

  try {
    await resend.emails.send({ from: FROM_ADDRESS, to, subject, html });
    logger.info('Email sent', { to, subject });
    return true;
  } catch (err) {
    logger.error('Email send failed', { to, subject, error: (err as Error).message });
    return false;
  }
}
