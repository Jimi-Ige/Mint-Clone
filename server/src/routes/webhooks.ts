import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import pool from '../db/connection';

const router = Router();

/**
 * Plaid webhook receiver.
 * Verifies the webhook signature when PLAID_WEBHOOK_SECRET is configured,
 * then processes the event.
 *
 * Plaid sends webhooks with a JWT in the Plaid-Verification header.
 * For simplicity and because Plaid's verification uses JWKs,
 * we use a shared-secret HMAC approach if configured,
 * otherwise we accept but log a warning.
 */
router.post('/plaid', async (req: Request, res: Response) => {
  const webhookSecret = process.env.PLAID_WEBHOOK_SECRET;

  // Verify signature if secret is configured
  if (webhookSecret) {
    const signature = req.headers['plaid-verification'] as string;
    if (!signature) {
      console.warn('[WEBHOOK] Missing Plaid-Verification header');
      return res.status(401).json({ error: 'Missing webhook signature' });
    }

    // Compute HMAC of raw body for verification
    const rawBody = JSON.stringify(req.body);
    const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      console.warn('[WEBHOOK] Invalid Plaid webhook signature');
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
  } else {
    console.warn('[WEBHOOK] PLAID_WEBHOOK_SECRET not set — accepting webhook without verification');
  }

  const { webhook_type, webhook_code, item_id, error } = req.body;

  console.log(`[WEBHOOK] Plaid: ${webhook_type}.${webhook_code} for item ${item_id}`);

  try {
    switch (webhook_type) {
      case 'TRANSACTIONS': {
        await handleTransactionWebhook(webhook_code, item_id);
        break;
      }
      case 'ITEM': {
        await handleItemWebhook(webhook_code, item_id, error);
        break;
      }
      default:
        console.log(`[WEBHOOK] Unhandled webhook type: ${webhook_type}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[WEBHOOK] Processing error:', err);
    // Return 200 to prevent Plaid from retrying (we log the error internally)
    res.json({ received: true, error: 'Processing failed' });
  }
});

async function handleTransactionWebhook(code: string, itemId: string): Promise<void> {
  switch (code) {
    case 'SYNC_UPDATES_AVAILABLE': {
      // Mark the institution as needing sync — the client will trigger sync on next load
      await pool.query(
        `UPDATE institutions SET status = 'pending_sync' WHERE plaid_item_id = $1`,
        [itemId]
      );
      console.log(`[WEBHOOK] Marked item ${itemId} for sync`);
      break;
    }
    case 'INITIAL_UPDATE':
    case 'HISTORICAL_UPDATE': {
      // Same treatment — flag for sync
      await pool.query(
        `UPDATE institutions SET status = 'pending_sync' WHERE plaid_item_id = $1`,
        [itemId]
      );
      break;
    }
    case 'TRANSACTIONS_REMOVED': {
      // Will be handled by next sync via removed array
      console.log(`[WEBHOOK] Transactions removed for item ${itemId} — will clean up on next sync`);
      break;
    }
    default:
      console.log(`[WEBHOOK] Unhandled TRANSACTIONS code: ${code}`);
  }
}

async function handleItemWebhook(code: string, itemId: string, error?: any): Promise<void> {
  switch (code) {
    case 'ERROR': {
      const errorCode = error?.error_code;
      if (errorCode === 'ITEM_LOGIN_REQUIRED') {
        await pool.query(
          `UPDATE institutions SET status = 'login_required' WHERE plaid_item_id = $1`,
          [itemId]
        );
        console.warn(`[WEBHOOK] Item ${itemId} requires re-authentication`);
      } else {
        await pool.query(
          `UPDATE institutions SET status = 'error' WHERE plaid_item_id = $1`,
          [itemId]
        );
        console.error(`[WEBHOOK] Item ${itemId} error: ${errorCode}`);
      }
      break;
    }
    case 'PENDING_EXPIRATION': {
      await pool.query(
        `UPDATE institutions SET status = 'expiring' WHERE plaid_item_id = $1`,
        [itemId]
      );
      console.warn(`[WEBHOOK] Item ${itemId} access consent expiring soon`);
      break;
    }
    default:
      console.log(`[WEBHOOK] Unhandled ITEM code: ${code}`);
  }
}

export default router;
