import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { CurrencyInfo, Account } from '../../types';
import { Leaf, ChevronRight, Check, Globe, Wallet, Target, Sparkles } from 'lucide-react';

const steps = [
  { id: 'welcome', title: 'Welcome', icon: Sparkles },
  { id: 'currency', title: 'Currency', icon: Globe },
  { id: 'account', title: 'Account', icon: Wallet },
  { id: 'goals', title: 'Get Started', icon: Target },
];

export default function OnboardingWizard() {
  const { user, updateBaseCurrency, completeOnboarding } = useAuth();
  const [step, setStep] = useState(0);
  const [currencies, setCurrencies] = useState<CurrencyInfo[]>([]);
  const [selectedCurrency, setSelectedCurrency] = useState(user?.base_currency || 'USD');
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState('checking');
  const [accountBalance, setAccountBalance] = useState('');
  const [existingAccounts, setExistingAccounts] = useState<Account[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<CurrencyInfo[]>('/currency/supported').then(setCurrencies).catch(() => {});
    api.get<Account[]>('/accounts').then(setExistingAccounts).catch(() => {});
  }, []);

  const handleCurrencySelect = async () => {
    if (selectedCurrency !== user?.base_currency) {
      await api.put('/currency/preference', { base_currency: selectedCurrency });
      updateBaseCurrency(selectedCurrency);
    }
    setStep(2);
  };

  const handleCreateAccount = async () => {
    if (!accountName.trim()) {
      setStep(3);
      return;
    }
    setSaving(true);
    try {
      await api.post('/accounts', {
        name: accountName.trim(),
        type: accountType,
        balance: parseFloat(accountBalance) || 0,
        currency: selectedCurrency,
      });
    } catch {
      // Account creation failed, but continue
    }
    setSaving(false);
    setStep(3);
  };

  const handleFinish = async () => {
    setSaving(true);
    await completeOnboarding();
    setSaving(false);
  };

  const accountTypes = [
    { value: 'checking', label: 'Checking', desc: 'Everyday spending' },
    { value: 'savings', label: 'Savings', desc: 'Savings account' },
    { value: 'credit', label: 'Credit Card', desc: 'Credit card balance' },
    { value: 'investment', label: 'Investment', desc: 'Brokerage account' },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4 py-8">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-2">
            <Leaf className="w-8 h-8 text-primary-500" />
            <span className="text-2xl font-bold bg-gradient-to-r from-primary-500 to-accent-500 bg-clip-text text-transparent">Mint</span>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                i < step ? 'bg-primary-500 text-white' :
                i === step ? 'bg-primary-500 text-white ring-4 ring-primary-500/20' :
                'bg-gray-200 dark:bg-gray-700 text-gray-500'
              }`}>
                {i < step ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className={`w-8 h-0.5 ${i < step ? 'bg-primary-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="card p-6 md:p-8">
          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-primary-50 dark:bg-primary-500/10 flex items-center justify-center mx-auto">
                <Sparkles className="w-8 h-8 text-primary-500" />
              </div>
              <h2 className="text-xl font-bold">Welcome, {user?.name}!</h2>
              <p className="text-gray-500 dark:text-gray-400">
                Let's set up your finance tracker in just a few steps. This will only take a minute.
              </p>
              <div className="grid grid-cols-1 gap-2 text-left text-sm pt-2">
                {[
                  'Choose your preferred currency',
                  'Set up your first account',
                  'Start tracking your finances',
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <div className="w-5 h-5 rounded-full bg-primary-50 dark:bg-primary-500/10 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-primary-500" />
                    </div>
                    {item}
                  </div>
                ))}
              </div>
              <button onClick={() => setStep(1)} className="btn-primary w-full flex items-center justify-center gap-2 mt-4">
                Get Started <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Step 1: Currency */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="text-center">
                <Globe className="w-10 h-10 text-primary-500 mx-auto mb-2" />
                <h2 className="text-xl font-bold">Choose Your Currency</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  This will be your default display currency. You can change it later.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                {currencies.map(c => (
                  <button
                    key={c.code}
                    onClick={() => setSelectedCurrency(c.code)}
                    className={`p-3 rounded-xl text-left text-sm transition-colors ${
                      selectedCurrency === c.code
                        ? 'bg-primary-50 dark:bg-primary-500/10 ring-2 ring-primary-500 text-primary-700 dark:text-primary-300'
                        : 'bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <span className="font-medium">{c.symbol} {c.code}</span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{c.name}</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setStep(0)} className="btn-secondary flex-1">Back</button>
                <button onClick={handleCurrencySelect} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  Continue <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Account */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="text-center">
                <Wallet className="w-10 h-10 text-primary-500 mx-auto mb-2" />
                <h2 className="text-xl font-bold">Add an Account</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {existingAccounts.length > 0
                    ? `You already have ${existingAccounts.length} account(s). Add another or skip this step.`
                    : 'Add your main bank account to start tracking.'}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Account Name</label>
                <input
                  type="text"
                  value={accountName}
                  onChange={e => setAccountName(e.target.value)}
                  className="input"
                  placeholder="e.g. Chase Checking"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {accountTypes.map(at => (
                  <button
                    key={at.value}
                    onClick={() => setAccountType(at.value)}
                    className={`p-3 rounded-xl text-left text-sm transition-colors ${
                      accountType === at.value
                        ? 'bg-primary-50 dark:bg-primary-500/10 ring-2 ring-primary-500'
                        : 'bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <span className="font-medium">{at.label}</span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">{at.desc}</span>
                  </button>
                ))}
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Current Balance ({selectedCurrency})</label>
                <input
                  type="number"
                  step="0.01"
                  value={accountBalance}
                  onChange={e => setAccountBalance(e.target.value)}
                  className="input"
                  placeholder="0.00"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setStep(1)} className="btn-secondary flex-1">Back</button>
                <button onClick={handleCreateAccount} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {saving ? 'Saving...' : accountName.trim() ? 'Create & Continue' : 'Skip'}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Finish */}
          {step === 3 && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mx-auto">
                <Check className="w-8 h-8 text-emerald-500" />
              </div>
              <h2 className="text-xl font-bold">You're All Set!</h2>
              <p className="text-gray-500 dark:text-gray-400">
                Your finance tracker is ready. Here's what you can do next:
              </p>
              <div className="grid grid-cols-1 gap-2 text-left text-sm">
                {[
                  'Add transactions manually or import from CSV',
                  'Set up budgets for your spending categories',
                  'Create savings goals to track progress',
                  'Connect bank accounts via Plaid (Settings)',
                  'Explore Insights for spending analytics',
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-gray-600 dark:text-gray-400 py-1">
                    <Target className="w-4 h-4 text-primary-500 flex-shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
              <button
                onClick={handleFinish}
                disabled={saving}
                className="btn-primary w-full flex items-center justify-center gap-2 mt-4"
              >
                {saving ? 'Finishing...' : 'Go to Dashboard'}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
