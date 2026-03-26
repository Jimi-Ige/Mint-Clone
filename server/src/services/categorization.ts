import Anthropic from '@anthropic-ai/sdk';

const CATEGORIES = [
  'Salary', 'Freelance', 'Investments', 'Other Income',
  'Groceries', 'Rent', 'Utilities', 'Transportation',
  'Entertainment', 'Dining Out', 'Healthcare', 'Shopping',
  'Education', 'Subscriptions', 'Travel', 'Insurance',
  'Gifts & Donations', 'Personal Care', 'Home Maintenance',
  'Uncategorized',
];

interface TransactionInput {
  id: number;
  description: string;
  merchant_name?: string | null;
  amount: number;
  type: string;
  date: string;
}

interface CategorizeResult {
  id: number;
  category: string;
  reason: string;
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export async function categorizeTransactions(transactions: TransactionInput[]): Promise<CategorizeResult[]> {
  if (transactions.length === 0) return [];

  const anthropic = getClient();

  const txnList = transactions.map((t, i) =>
    `${i + 1}. ID=${t.id} | "${t.description}"${t.merchant_name ? ` (merchant: ${t.merchant_name})` : ''} | $${t.amount} ${t.type} | ${t.date}`
  ).join('\n');

  const prompt = `Categorize each transaction into exactly one of these categories:
${CATEGORIES.join(', ')}

Transactions:
${txnList}

Respond with a JSON array. Each element must have: "id" (the transaction ID), "category" (one of the listed categories), "reason" (brief explanation, max 15 words).
Return ONLY the JSON array, no other text.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    // Extract JSON array from response
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No JSON array in response');

    const results: CategorizeResult[] = JSON.parse(match[0]);

    // Validate categories
    return results.map(r => ({
      id: r.id,
      category: CATEGORIES.includes(r.category) ? r.category : 'Uncategorized',
      reason: r.reason || '',
    }));
  } catch (err: any) {
    console.error('Categorization error:', err.message);
    // Return uncategorized for all on failure
    return transactions.map(t => ({
      id: t.id,
      category: 'Uncategorized',
      reason: `Categorization failed: ${err.message}`,
    }));
  }
}

export { CATEGORIES };
