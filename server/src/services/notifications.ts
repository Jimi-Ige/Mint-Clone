import pool from '../db/connection';
import { sendEmail } from './email';
import { logger } from '../lib/logger';

/**
 * Check all notification triggers for all users.
 * Called on a timer from index.ts — runs once per hour.
 */
export async function checkNotifications(): Promise<void> {
  try {
    const { rows: users } = await pool.query(
      `SELECT id, email, name, preferences FROM users`
    );

    for (const user of users) {
      const prefs = user.preferences || {};
      if (!prefs.emailNotifications) continue;

      await Promise.allSettled([
        prefs.budgetAlerts !== false && checkBudgetAlerts(user),
        prefs.billReminders !== false && checkBillReminders(user),
      ]);
    }
  } catch (err) {
    logger.error('Notification check failed', { error: (err as Error).message });
  }
}

/**
 * Budget alerts: notify when spending reaches 80% or 100% of budget.
 */
async function checkBudgetAlerts(user: any): Promise<void> {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const periodKey = `${year}-${String(month).padStart(2, '0')}`;

  const { rows: budgets } = await pool.query(
    `SELECT b.id, b.amount, c.name as category_name,
       COALESCE((
         SELECT SUM(t.amount) FROM transactions t
         WHERE t.user_id = $1 AND t.category_id = b.category_id
           AND t.type = 'expense' AND t.is_transfer = FALSE
           AND EXTRACT(MONTH FROM t.date) = $2
           AND EXTRACT(YEAR FROM t.date) = $3
       ), 0) +
       COALESCE((
         SELECT SUM(ts.amount) FROM transaction_splits ts
         JOIN transactions t ON ts.transaction_id = t.id
         WHERE t.user_id = $1 AND ts.category_id = b.category_id
           AND t.type = 'expense' AND t.is_transfer = FALSE
           AND EXTRACT(MONTH FROM t.date) = $2
           AND EXTRACT(YEAR FROM t.date) = $3
       ), 0) as spent
     FROM budgets b
     JOIN categories c ON b.category_id = c.id
     WHERE b.user_id = $1 AND b.month = $2 AND b.year = $3`,
    [user.id, month, year]
  );

  for (const budget of budgets) {
    const spent = parseFloat(budget.spent);
    const limit = parseFloat(budget.amount);
    const pct = spent / limit;

    let threshold: string | null = null;
    if (pct >= 1.0) threshold = '100';
    else if (pct >= 0.8) threshold = '80';

    if (!threshold) continue;

    // Check if already sent for this budget + month + threshold
    const refKey = `${periodKey}-${threshold}`;
    const { rows: existing } = await pool.query(
      `SELECT id FROM notifications
       WHERE user_id = $1 AND type = 'budget_alert' AND reference_id = $2 AND reference_key = $3`,
      [user.id, budget.id, refKey]
    );
    if (existing.length > 0) continue;

    const subject = threshold === '100'
      ? `Budget exceeded: ${budget.category_name}`
      : `Budget warning: ${budget.category_name} at ${threshold}%`;

    const html = buildBudgetAlertEmail(user.name, budget.category_name, spent, limit, parseInt(threshold));

    const sent = await sendEmail({ to: user.email, subject, html });
    if (sent) {
      await pool.query(
        `INSERT INTO notifications (user_id, type, reference_id, reference_key, subject)
         VALUES ($1, 'budget_alert', $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [user.id, budget.id, refKey, subject]
      );
    }
  }
}

/**
 * Bill reminders: notify 3 days before a recurring bill is due.
 */
async function checkBillReminders(user: any): Promise<void> {
  const reminderDays = user.preferences?.reminderDays ?? 3;
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + reminderDays);
  const targetStr = targetDate.toISOString().split('T')[0];

  const { rows: upcoming } = await pool.query(
    `SELECT id, description, merchant_name, amount, next_expected, frequency
     FROM recurring_patterns
     WHERE user_id = $1 AND status = 'active' AND next_expected = $2`,
    [user.id, targetStr]
  );

  for (const bill of upcoming) {
    const refKey = bill.next_expected;
    const { rows: existing } = await pool.query(
      `SELECT id FROM notifications
       WHERE user_id = $1 AND type = 'bill_reminder' AND reference_id = $2 AND reference_key = $3`,
      [user.id, bill.id, refKey]
    );
    if (existing.length > 0) continue;

    const name = bill.merchant_name || bill.description;
    const subject = `Upcoming bill: ${name} — $${parseFloat(bill.amount).toFixed(2)}`;
    const html = buildBillReminderEmail(user.name, name, parseFloat(bill.amount), bill.next_expected, bill.frequency);

    const sent = await sendEmail({ to: user.email, subject, html });
    if (sent) {
      await pool.query(
        `INSERT INTO notifications (user_id, type, reference_id, reference_key, subject)
         VALUES ($1, 'bill_reminder', $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [user.id, bill.id, refKey, subject]
      );
    }
  }
}

// --- Email templates ---

function buildBudgetAlertEmail(name: string, category: string, spent: number, limit: number, pct: number): string {
  const color = pct >= 100 ? '#ef4444' : '#f59e0b';
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto;">
      <div style="background: ${color}; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">Budget ${pct >= 100 ? 'Exceeded' : 'Warning'}</h2>
      </div>
      <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="margin: 0 0 16px;">Hi ${name},</p>
        <p style="margin: 0 0 16px;">
          Your <strong>${category}</strong> budget has reached <strong>${pct}%</strong>.
        </p>
        <div style="background: white; padding: 16px; border-radius: 6px; border: 1px solid #e5e7eb; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span>Spent</span><strong>$${spent.toFixed(2)}</strong>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>Budget</span><strong>$${limit.toFixed(2)}</strong>
          </div>
          <div style="background: #e5e7eb; border-radius: 4px; height: 8px; margin-top: 12px; overflow: hidden;">
            <div style="background: ${color}; height: 100%; width: ${Math.min(pct, 100)}%; border-radius: 4px;"></div>
          </div>
        </div>
        <p style="margin: 0; color: #6b7280; font-size: 13px;">— Mint Finance Tracker</p>
      </div>
    </div>`;
}

function buildBillReminderEmail(name: string, billName: string, amount: number, dueDate: string, frequency: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto;">
      <div style="background: #10b981; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">Upcoming Bill</h2>
      </div>
      <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="margin: 0 0 16px;">Hi ${name},</p>
        <p style="margin: 0 0 16px;">
          Your ${frequency} payment for <strong>${billName}</strong> is coming up.
        </p>
        <div style="background: white; padding: 16px; border-radius: 6px; border: 1px solid #e5e7eb; margin-bottom: 16px;">
          <div style="margin-bottom: 8px;"><strong>$${amount.toFixed(2)}</strong></div>
          <div style="color: #6b7280; font-size: 14px;">Due: ${dueDate}</div>
        </div>
        <p style="margin: 0; color: #6b7280; font-size: 13px;">— Mint Finance Tracker</p>
      </div>
    </div>`;
}

export { checkBudgetAlerts, checkBillReminders };
