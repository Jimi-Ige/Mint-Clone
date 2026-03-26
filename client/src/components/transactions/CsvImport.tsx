import { useState, useCallback } from 'react';
import Papa from 'papaparse';
import { api } from '../../lib/api';
import Modal from '../ui/Modal';
import { Upload, FileSpreadsheet, AlertCircle } from 'lucide-react';

interface CsvImportProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ParsedRow {
  date: string;
  description: string;
  amount: string;
  type: string;
  category: string;
  account: string;
}

const EXPECTED_FIELDS = ['date', 'description', 'amount', 'type', 'category', 'account'];

export default function CsvImport({ open, onClose, onSuccess }: CsvImportProps) {
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'result'>('upload');
  const [rawData, setRawData] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; duplicates: number; errors: string[] } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const reset = () => {
    setStep('upload');
    setRawData([]);
    setHeaders([]);
    setMapping({});
    setResult(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const processFile = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data.length === 0) return;
        const data = results.data as Record<string, string>[];
        const cols = Object.keys(data[0]);
        setRawData(data);
        setHeaders(cols);

        // Auto-map columns by name similarity
        const autoMap: Record<string, string> = {};
        for (const field of EXPECTED_FIELDS) {
          const match = cols.find(c =>
            c.toLowerCase().replace(/[^a-z]/g, '') === field.toLowerCase() ||
            c.toLowerCase().includes(field.toLowerCase())
          );
          if (match) autoMap[field] = match;
        }
        setMapping(autoMap);
        setStep('mapping');
      },
    });
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.tsv'))) {
      processFile(file);
    }
  }, []);

  const getMappedRows = (): ParsedRow[] => {
    return rawData.map(row => ({
      date: row[mapping.date] || '',
      description: row[mapping.description] || '',
      amount: row[mapping.amount] || '',
      type: row[mapping.type] || '',
      category: row[mapping.category] || '',
      account: row[mapping.account] || '',
    })).filter(r => r.date && r.amount);
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const transactions = getMappedRows();
      const res = await api.post<{ imported: number; duplicates: number; errors: string[]; total: number }>('/transactions/import', { transactions });
      setResult(res);
      setStep('result');
      if (res.imported > 0) onSuccess();
    } catch (err: any) {
      setResult({ imported: 0, duplicates: 0, errors: [err.message] });
      setStep('result');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Import Transactions from CSV">
      {step === 'upload' && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
            dragOver ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10' : 'border-gray-300 dark:border-gray-600'
          }`}
        >
          <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Drag and drop a CSV file here, or</p>
          <label className="btn-primary inline-block cursor-pointer text-sm">
            Browse Files
            <input type="file" accept=".csv,.tsv" onChange={handleFileInput} className="hidden" />
          </label>
          <p className="text-xs text-gray-400 mt-3">Expected columns: date, description, amount, type, category, account</p>
        </div>
      )}

      {step === 'mapping' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <FileSpreadsheet className="w-4 h-4" />
            <span>{rawData.length} rows found</span>
          </div>

          <div className="space-y-3">
            {EXPECTED_FIELDS.map(field => (
              <div key={field} className="flex items-center gap-3">
                <label className="text-sm font-medium w-28 capitalize">{field}{field === 'date' || field === 'amount' ? ' *' : ''}</label>
                <select
                  value={mapping[field] || ''}
                  onChange={e => setMapping({ ...mapping, [field]: e.target.value })}
                  className="input flex-1"
                >
                  <option value="">— skip —</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>

          {(!mapping.date || !mapping.amount) && (
            <p className="text-sm text-amber-600 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" /> Date and Amount columns are required
            </p>
          )}

          <div className="flex gap-2">
            <button onClick={() => setStep('upload')} className="btn-secondary flex-1">Back</button>
            <button
              onClick={() => setStep('preview')}
              disabled={!mapping.date || !mapping.amount}
              className="btn-primary flex-1"
            >
              Preview ({getMappedRows().length} rows)
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-4">
          <div className="max-h-64 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                <tr>
                  <th className="p-2 text-left font-medium">Date</th>
                  <th className="p-2 text-left font-medium">Description</th>
                  <th className="p-2 text-right font-medium">Amount</th>
                  <th className="p-2 text-left font-medium">Type</th>
                  <th className="p-2 text-left font-medium">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {getMappedRows().slice(0, 20).map((row, i) => (
                  <tr key={i}>
                    <td className="p-2">{row.date}</td>
                    <td className="p-2 max-w-[200px] truncate">{row.description}</td>
                    <td className="p-2 text-right font-mono">{row.amount}</td>
                    <td className="p-2 capitalize">{row.type || 'auto'}</td>
                    <td className="p-2">{row.category || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {getMappedRows().length > 20 && (
              <p className="text-xs text-gray-400 p-2 text-center">...and {getMappedRows().length - 20} more rows</p>
            )}
          </div>

          <div className="flex gap-2">
            <button onClick={() => setStep('mapping')} className="btn-secondary flex-1">Back</button>
            <button onClick={handleImport} disabled={importing} className="btn-primary flex-1">
              {importing ? 'Importing...' : `Import ${getMappedRows().length} Transactions`}
            </button>
          </div>
        </div>
      )}

      {step === 'result' && result && (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm"><span className="font-semibold text-emerald-500">{result.imported}</span> transactions imported</p>
            {result.duplicates > 0 && (
              <p className="text-sm"><span className="font-semibold text-amber-500">{result.duplicates}</span> duplicates skipped</p>
            )}
            {result.errors.length > 0 && (
              <div className="text-sm">
                <p className="font-semibold text-rose-500 mb-1">{result.errors.length} error(s):</p>
                <ul className="list-disc list-inside text-xs text-gray-500 max-h-32 overflow-auto">
                  {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
          </div>
          <button onClick={handleClose} className="btn-primary w-full">Done</button>
        </div>
      )}
    </Modal>
  );
}
