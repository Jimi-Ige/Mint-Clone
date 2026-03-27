import { z } from 'zod';

// --- Password rules ---
const PASSWORD_MIN = 8;
const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`)
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

// --- Auth ---
export const registerSchema = z.object({
  email: z.string().email('Invalid email address').max(255),
  password: passwordSchema,
  name: z.string().min(1, 'Name is required').max(100),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// --- Profile ---
export const profileUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  currentPassword: z.string().optional(),
  newPassword: passwordSchema.optional(),
}).refine(
  data => !data.newPassword || data.currentPassword,
  { message: 'Current password is required to set a new password', path: ['currentPassword'] }
);

export const preferencesSchema = z.object({
  preferences: z.object({
    dateFormat: z.enum(['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD']).optional(),
    defaultPage: z.string().max(50).optional(),
    compactMode: z.boolean().optional(),
    showCents: z.boolean().optional(),
  }),
});

// --- Accounts ---
export const createAccountSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  type: z.enum(['checking', 'savings', 'credit', 'investment', 'loan', 'other']).default('checking'),
  balance: z.number().default(0),
  currency: z.string().length(3, 'Currency must be a 3-letter code').default('USD'),
});

export const updateAccountSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['checking', 'savings', 'credit', 'investment', 'loan', 'other']).optional(),
  currency: z.string().length(3).optional(),
});

// --- Transactions ---
export const createTransactionSchema = z.object({
  account_id: z.number().int().positive(),
  category_id: z.number().int().positive().nullable().optional(),
  amount: z.number().positive('Amount must be greater than 0'),
  type: z.enum(['income', 'expense']),
  description: z.string().max(500).default(''),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Date must be YYYY-MM-DD format'),
});

export const updateTransactionSchema = z.object({
  account_id: z.number().int().positive().optional(),
  category_id: z.number().int().positive().nullable().optional(),
  amount: z.number().positive().optional(),
  type: z.enum(['income', 'expense']).optional(),
  description: z.string().max(500).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
});

// --- Budgets ---
export const createBudgetSchema = z.object({
  category_id: z.number().int().positive(),
  amount: z.number().positive('Budget amount must be greater than 0'),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
});

export const updateBudgetSchema = z.object({
  amount: z.number().positive(),
});

// --- Goals ---
export const createGoalSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  target_amount: z.number().positive('Target must be greater than 0'),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}/).nullable().optional(),
  icon: z.string().max(50).default('target'),
  color: z.string().max(20).default('#10b981'),
});

export const contributeSchema = z.object({
  amount: z.number().positive('Contribution must be greater than 0'),
});

// --- Categories ---
export const createCategorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(50),
  type: z.enum(['income', 'expense']).default('expense'),
  icon: z.string().max(50).optional(),
  color: z.string().max(20).optional(),
  parent_id: z.number().int().positive().nullable().optional(),
});

// --- Splits ---
export const splitSchema = z.object({
  splits: z.array(z.object({
    category_id: z.number().int().positive().nullable().optional(),
    amount: z.number().positive('Split amount must be > 0'),
    description: z.string().max(200).default(''),
  })).min(0), // empty array = unsplit
});

// --- Plaid ---
export const exchangeTokenSchema = z.object({
  public_token: z.string().min(1, 'public_token is required'),
  institution: z.object({
    name: z.string().optional(),
    institution_id: z.string().optional(),
  }).optional(),
});

// --- Import ---
export const importTransactionsSchema = z.object({
  transactions: z.array(z.object({
    date: z.string().min(1),
    description: z.string().optional().default(''),
    amount: z.union([z.string(), z.number()]),
    type: z.string().optional(),
    category: z.string().optional(),
    account: z.string().optional(),
  })).min(1, 'At least one transaction is required').max(1000, 'Maximum 1000 transactions per import'),
});
