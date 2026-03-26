import { useState, useCallback } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { api } from '../../lib/api';
import { Building2 } from 'lucide-react';

interface PlaidLinkButtonProps {
  onSuccess: () => void;
}

export default function PlaidLinkButton({ onSuccess }: PlaidLinkButtonProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createLinkToken = async () => {
    setLoading(true);
    setError(null);
    try {
      const { link_token } = await api.post<{ link_token: string }>('/plaid/create-link-token', {});
      setLinkToken(link_token);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleSuccess = useCallback(async (publicToken: string, metadata: any) => {
    try {
      await api.post('/plaid/exchange-token', {
        public_token: publicToken,
        institution: metadata.institution,
      });
      setLinkToken(null);
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    }
  }, [onSuccess]);

  const handleExit = useCallback(() => {
    setLinkToken(null);
    setLoading(false);
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: handleSuccess,
    onExit: handleExit,
  });

  // Auto-open Plaid Link when token is ready
  if (linkToken && ready) {
    open();
  }

  return (
    <div>
      <button
        onClick={createLinkToken}
        disabled={loading}
        className="btn-primary flex items-center gap-2 text-sm"
      >
        <Building2 className="w-4 h-4" />
        {loading ? 'Connecting...' : 'Link Bank Account'}
      </button>
      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
    </div>
  );
}
