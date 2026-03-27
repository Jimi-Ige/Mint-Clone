import pool from './connection';
import { runMigrations } from './migrate';

export async function initializeDatabase() {
  await runMigrations(pool);
}

export async function seedUserData(userId: number) {
  const client = await pool.connect();
  try {
    // Check if user already has categories
    const { rows } = await client.query('SELECT COUNT(*) as count FROM categories WHERE user_id = $1', [userId]);
    if (parseInt(rows[0].count) > 0) return;

    // Parent categories (no parent_id)
    const parentCategories: [string, string, string, string][] = [
      ['Income', 'income', 'wallet', '#10b981'],
      ['Food & Drink', 'expense', 'utensils', '#f59e0b'],
      ['Housing', 'expense', 'home', '#ef4444'],
      ['Transportation', 'expense', 'car', '#8b5cf6'],
      ['Entertainment', 'expense', 'film', '#ec4899'],
      ['Health', 'expense', 'heart-pulse', '#14b8a6'],
      ['Shopping', 'expense', 'shopping-bag', '#a855f7'],
      ['Education', 'expense', 'book-open', '#3b82f6'],
      ['Bills & Subscriptions', 'expense', 'repeat', '#6366f1'],
      ['Travel', 'expense', 'plane', '#0ea5e9'],
    ];

    const parentMap: Record<string, number> = {};
    for (const [name, type, icon, color] of parentCategories) {
      const result = await client.query(
        'INSERT INTO categories (user_id, name, type, icon, color) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
        [userId, name, type, icon, color]
      );
      parentMap[name] = result.rows[0].id;
    }

    // Subcategories: [name, type, icon, color, parentName]
    const subcategories: [string, string, string, string, string][] = [
      ['Salary', 'income', 'banknote', '#10b981', 'Income'],
      ['Freelance', 'income', 'laptop', '#8b5cf6', 'Income'],
      ['Investments', 'income', 'trending-up', '#3b82f6', 'Income'],
      ['Other Income', 'income', 'plus-circle', '#6366f1', 'Income'],
      ['Groceries', 'expense', 'shopping-cart', '#f59e0b', 'Food & Drink'],
      ['Dining Out', 'expense', 'utensils', '#f43f5e', 'Food & Drink'],
      ['Coffee', 'expense', 'coffee', '#92400e', 'Food & Drink'],
      ['Rent', 'expense', 'home', '#ef4444', 'Housing'],
      ['Utilities', 'expense', 'zap', '#f97316', 'Housing'],
      ['Home Insurance', 'expense', 'shield', '#dc2626', 'Housing'],
      ['Gas', 'expense', 'fuel', '#7c3aed', 'Transportation'],
      ['Public Transit', 'expense', 'train', '#6d28d9', 'Transportation'],
      ['Parking', 'expense', 'square', '#5b21b6', 'Transportation'],
      ['Movies & Games', 'expense', 'gamepad-2', '#ec4899', 'Entertainment'],
      ['Streaming', 'expense', 'tv', '#db2777', 'Entertainment'],
      ['Concerts & Events', 'expense', 'music', '#be185d', 'Entertainment'],
      ['Doctor', 'expense', 'stethoscope', '#14b8a6', 'Health'],
      ['Pharmacy', 'expense', 'pill', '#0d9488', 'Health'],
      ['Gym', 'expense', 'dumbbell', '#0f766e', 'Health'],
      ['Clothing', 'expense', 'shirt', '#a855f7', 'Shopping'],
      ['Electronics', 'expense', 'smartphone', '#9333ea', 'Shopping'],
      ['General Shopping', 'expense', 'shopping-bag', '#7e22ce', 'Shopping'],
      ['Tuition', 'expense', 'graduation-cap', '#3b82f6', 'Education'],
      ['Books & Courses', 'expense', 'book-open', '#2563eb', 'Education'],
      ['Subscriptions', 'expense', 'repeat', '#6366f1', 'Bills & Subscriptions'],
      ['Phone & Internet', 'expense', 'wifi', '#4f46e5', 'Bills & Subscriptions'],
      ['Insurance', 'expense', 'shield-check', '#4338ca', 'Bills & Subscriptions'],
      ['Flights', 'expense', 'plane', '#0ea5e9', 'Travel'],
      ['Hotels', 'expense', 'bed', '#0284c7', 'Travel'],
      ['Travel Activities', 'expense', 'map', '#0369a1', 'Travel'],
    ];

    for (const [name, type, icon, color, parentName] of subcategories) {
      await client.query(
        'INSERT INTO categories (user_id, parent_id, name, type, icon, color) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING',
        [userId, parentMap[parentName], name, type, icon, color]
      );
    }

    // Seed default tags
    const defaultTags = [
      ['recurring', '#6366f1'],
      ['transfer', '#3b82f6'],
      ['refund', '#10b981'],
      ['tax-deductible', '#f59e0b'],
      ['travel', '#0ea5e9'],
      ['business', '#8b5cf6'],
      ['one-time', '#ec4899'],
      ['essential', '#ef4444'],
    ];
    for (const [name, color] of defaultTags) {
      await client.query(
        'INSERT INTO tags (user_id, name, color) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [userId, name, color]
      );
    }

    // Seed a default account
    const accResult = await client.query(
      'INSERT INTO accounts (user_id, name, type, balance) VALUES ($1, $2, $3, $4) RETURNING id',
      [userId, 'Main Checking', 'checking', 5000]
    );
    const accountId = accResult.rows[0].id;

    // Get category IDs for seeding transactions
    const catRows = await client.query('SELECT id, name FROM categories WHERE user_id = $1', [userId]);
    const catMap: Record<string, number> = {};
    catRows.rows.forEach((r: any) => { catMap[r.name] = r.id; });

    // Seed sample transactions
    const now = new Date();
    let totalBalance = 0;

    for (let i = 0; i < 6; i++) {
      const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = (m: Date, day: number) => {
        const d = new Date(m.getFullYear(), m.getMonth(), day);
        return d.toISOString().split('T')[0];
      };

      const txns: [number, number, string, string, string][] = [
        [catMap['Salary'], 5000, 'income', 'Monthly Salary', monthStr(month, 1)],
        [catMap['Groceries'], 320 + Math.round(Math.random() * 80), 'expense', 'Grocery Shopping', monthStr(month, 3)],
        [catMap['Rent'], 1500, 'expense', 'Monthly Rent', monthStr(month, 1)],
        [catMap['Utilities'], 120 + Math.round(Math.random() * 30), 'expense', 'Electric & Water', monthStr(month, 5)],
        [catMap['Transportation'], 80 + Math.round(Math.random() * 40), 'expense', 'Gas & Transit', monthStr(month, 8)],
        [catMap['Entertainment'], 50 + Math.round(Math.random() * 50), 'expense', 'Movies & Games', monthStr(month, 12)],
        [catMap['Dining Out'], 60 + Math.round(Math.random() * 40), 'expense', 'Restaurant', monthStr(month, 18)],
        [catMap['Subscriptions'], 45, 'expense', 'Netflix & Spotify', monthStr(month, 1)],
      ];

      if (i % 2 === 0) txns.push([catMap['Freelance'], 1200, 'income', 'Freelance Project', monthStr(month, 15)]);
      if (i < 3) txns.push([catMap['Shopping'], 200, 'expense', 'New Shoes', monthStr(month, 20)]);

      for (const [catId, amount, type, desc, date] of txns) {
        await client.query(
          'INSERT INTO transactions (user_id, account_id, category_id, amount, type, description, date) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [userId, accountId, catId, amount, type, desc, date]
        );
        totalBalance += type === 'income' ? amount : -amount;
      }
    }

    await client.query('UPDATE accounts SET balance = $1 WHERE id = $2', [totalBalance, accountId]);
    console.log(`Seeded data for user ${userId}`);
  } finally {
    client.release();
  }
}
