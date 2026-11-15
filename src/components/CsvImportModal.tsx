import React, { useState } from 'react';
import {
  X,
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  CloudDownload,
  Loader2,
} from 'lucide-react';
import { buildSampleCsvContent } from '../shared/syntheticData.ts';
import {
  discoverCustomersFromCsvStream,
  parseCustomersMetadataCsv,
  streamCustomerTransactionsFromCsv,
} from '../utils/csvStreamParser.ts';
import type { SBankCustomer, SBankTransaction } from '../shared/types.ts';

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (payload: {
    customer: SBankCustomer;
    transactions: SBankTransaction[];
    year: number;
    sourceLabel: string;
  }) => void;
}

export const CsvImportModal: React.FC<CsvImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
}) => {
  const [githubCustomerId, setGithubCustomerId] = useState<string>('CUST00922');
  const [isFetchingGithub, setIsFetchingGithub] = useState<boolean>(false);

  const [txFile, setTxFile] = useState<File | null>(null);
  const [customerMap, setCustomerMap] = useState<Map<string, SBankCustomer>>(new Map());
  const [discoveredCustomerIds, setDiscoveredCustomerIds] = useState<string[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [manualCustomerId, setManualCustomerId] = useState<string>('');
  const [statusText, setStatusText] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFetchFromOfficialGitHub = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = githubCustomerId.trim();
    if (!trimmed || isFetchingGithub) return;

    setErrorText(null);
    setIsFetchingGithub(true);
    setStatusText(
      `Streaming ${trimmed} via HTTP Range binary search from hackjunction/Junction-2026-S-pankki (346 MB LFS)…`
    );

    try {
      const resp = await fetch(`/api/dataset/customer/${encodeURIComponent(trimmed)}`);
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      onImportComplete({
        customer: data.customer,
        transactions: data.transactions,
        year: data.year || 2025,
        sourceLabel: data.sourceLabel,
      });
      onClose();
    } catch (err) {
      setErrorText(
        err instanceof Error ? err.message : 'Could not fetch customer from GitHub dataset.'
      );
    } finally {
      setIsFetchingGithub(false);
    }
  };

  const handleTxFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTxFile(file);
    setErrorText(null);
    setIsStreaming(true);
    setProgressPercent(5);
    setStatusText('Streaming CSV header & discovering customer IDs (UTF-8 BOM safe)…');

    try {
      const discovery = await discoverCustomersFromCsvStream(
        file,
        50,
        25 * 1024 * 1024,
        (read, total) => {
          setProgressPercent(Math.min(100, Math.round((read / Math.max(1, total)) * 100)));
        }
      );
      setDiscoveredCustomerIds(discovery.customerIds);
      if (discovery.customerIds.length > 0) {
        setSelectedCustomerId(discovery.customerIds[0]);
      }
      setStatusText(
        `Scanned ${discovery.rowsScanned.toLocaleString()} rows (${(
          discovery.bytesRead /
          (1024 * 1024)
        ).toFixed(1)} MB) · Found ${discovery.customerIds.length} customer IDs.`
      );
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Could not read transactions CSV.');
    } finally {
      setIsStreaming(false);
    }
  };

  const handleCustomerMetaSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseCustomersMetadataCsv(file);
      setCustomerMap(parsed);
      setStatusText(`Loaded metadata for ${parsed.size.toLocaleString()} customers.`);
    } catch {
      setErrorText('Could not parse customer metadata CSV.');
    }
  };

  const handleRunCustomerStream = async () => {
    if (!txFile) return;
    const targetId = (manualCustomerId.trim() || selectedCustomerId).trim();
    if (!targetId) {
      setErrorText('Select or enter a customer_id to stream.');
      return;
    }

    setErrorText(null);
    setIsStreaming(true);
    setProgressPercent(0);
    setStatusText(`Streaming ${txFile.name} and filtering rows for ${targetId}…`);

    try {
      const result = await streamCustomerTransactionsFromCsv(
        txFile,
        targetId,
        (bytesRead, totalBytes, matched) => {
          const pct = Math.min(100, Math.round((bytesRead / Math.max(1, totalBytes)) * 100));
          setProgressPercent(pct);
          setStatusText(
            `Processed ${(bytesRead / (1024 * 1024)).toFixed(1)} / ${(
              totalBytes /
              (1024 * 1024)
            ).toFixed(1)} MB · ${matched} transactions matched`
          );
        }
      );

      if (result.transactions.length === 0) {
        setErrorText(`No transactions found for customer_id "${targetId}" in ${txFile.name}.`);
        setIsStreaming(false);
        return;
      }

      const knownCustomer = customerMap.get(targetId) || {
        customer_id: targetId,
        customer_postal_code: '00100',
        customer_age: 34,
        profileLabel: `${targetId} · Imported CSV`,
        householdSummary: `Imported ${result.transactions.length} transactions from ${txFile.name}.`,
      };

      onImportComplete({
        customer: knownCustomer,
        transactions: result.transactions,
        year: result.year,
        sourceLabel: `CSV Import (${txFile.name} · ${targetId})`,
      });
      onClose();
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Streaming CSV import failed.');
    } finally {
      setIsStreaming(false);
    }
  };

  const handleDownloadSampleCsv = () => {
    const csvContent = buildSampleCsvContent('CUST-10042');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'junction_2026_sbank_sample_CUST-10042.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#004628]/45 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="csv-modal-title"
    >
      <div className="w-full sm:max-w-[392px] bg-white rounded-t-3xl sm:rounded-3xl border border-[#E6E6E6] p-5 space-y-4 max-h-[88vh] overflow-y-auto shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="csv-modal-title" className="text-lg font-bold text-[#004628]">
              Load Dataset or CSV
            </h2>
            <p className="text-xs font-normal text-[#363636] mt-0.5">
              Load any <code className="font-mono-num">CUST00001–CUST05100</code> or drop a CSV.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full text-[#363636] hover:bg-[#F5F5F5] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Option A: Instant Live Fetch from Official GitHub 346MB LFS Repo */}
        <form
          onSubmit={handleFetchFromOfficialGitHub}
          className="p-4 rounded-2xl bg-[#EBF7EC] border border-[#99D59F]/60 space-y-2.5"
        >
          <label
            htmlFor="github-cust-id"
            className="block text-xs font-bold text-[#004628]"
          >
            Instant Fetch from Official GitHub Repo (CUST00001 – CUST05100)
          </label>
          <div className="flex items-center gap-2">
            <input
              id="github-cust-id"
              type="text"
              value={githubCustomerId}
              onChange={(e) => setGithubCustomerId(e.target.value)}
              placeholder="e.g. CUST00922 or CUST02400"
              className="min-w-0 flex-1 min-h-[42px] px-3.5 py-1.5 rounded-full border border-[#99D59F] bg-white text-xs font-mono-num text-[#004628] focus:outline-none focus:border-[#007841]"
            />
            <button
              type="submit"
              disabled={isFetchingGithub || !githubCustomerId.trim()}
              className="min-h-[42px] px-4 py-1.5 rounded-full bg-[#91FA9B] hover:bg-[#49F37B] active:bg-[#00EB5A] disabled:opacity-50 text-[#004628] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors"
            >
              {isFetchingGithub ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CloudDownload className="w-3.5 h-3.5" />
              )}
              <span>{isFetchingGithub ? 'Fetching…' : 'Load Customer'}</span>
            </button>
          </div>
          <p className="text-[11px] font-normal text-[#363636]">
            Streams customer rows directly from the 346 MB official GitHub LFS dataset.
          </p>
        </form>

        {/* Option B: Local File Upload */}
        <div className="space-y-3 pt-2 border-t border-[#E6E6E6]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-[#004628]">
              Or Stream Local CSV File (UTF-8 BOM Safe)
            </span>
            <button
              type="button"
              onClick={handleDownloadSampleCsv}
              className="min-h-[32px] px-3 py-1 rounded-full bg-[#F5F5F5] border border-[#E6E6E6] hover:border-[#00AA46] text-[11px] font-bold text-[#004628] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3 h-3 text-[#007841]" />
              <span>Sample CSV</span>
            </button>
          </div>

          <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-dashed border-[#00AA46] bg-[#F5F5F5] hover:bg-[#EBF7EC] cursor-pointer transition-colors">
            <div className="flex items-center gap-2.5 min-w-0">
              <FileSpreadsheet className="w-4 h-4 text-[#007841] shrink-0" />
              <span className="text-xs font-bold text-[#004628] truncate">
                {txFile
                  ? `${txFile.name} (${(txFile.size / (1024 * 1024)).toFixed(2)} MB)`
                  : 'Choose tx_junction_transactions.csv…'}
              </span>
            </div>
            <span className="text-xs font-bold text-[#007841] shrink-0">Browse</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleTxFileSelect}
              className="hidden"
            />
          </label>

          <label className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-[#E6E6E6] bg-white hover:bg-[#F5F5F5] cursor-pointer transition-colors">
            <span className="text-xs text-[#666666] truncate">
              {customerMap.size > 0
                ? `Loaded ${customerMap.size} customer profiles`
                : 'Optional: attach tx_customers_junction.csv…'}
            </span>
            <span className="text-xs font-bold text-[#004628] shrink-0">Attach</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleCustomerMetaSelect}
              className="hidden"
            />
          </label>
        </div>

        {/* Select or type customer_id when local file chosen */}
        {txFile && (
          <div className="space-y-2.5 pt-2 border-t border-[#E6E6E6]">
            {discoveredCustomerIds.length > 0 && (
              <div>
                <label
                  htmlFor="discovered-cid"
                  className="block text-xs font-bold text-[#004628] mb-1"
                >
                  Select discovered customer_id
                </label>
                <select
                  id="discovered-cid"
                  value={selectedCustomerId}
                  onChange={(e) => {
                    setSelectedCustomerId(e.target.value);
                    setManualCustomerId('');
                  }}
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-[#E6E6E6] bg-[#F5F5F5] text-xs font-mono-num text-[#004628]"
                >
                  {discoveredCustomerIds.map((cid) => {
                    const meta = customerMap.get(cid);
                    return (
                      <option key={cid} value={cid}>
                        {meta
                          ? `${cid} (Postal ${meta.customer_postal_code}, Age ${meta.customer_age})`
                          : cid}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            <div>
              <label
                htmlFor="manual-cid"
                className="block text-xs font-bold text-[#004628] mb-1"
              >
                Or enter exact customer_id in file
              </label>
              <input
                id="manual-cid"
                type="text"
                value={manualCustomerId}
                onChange={(e) => setManualCustomerId(e.target.value)}
                placeholder="e.g. CUST00001"
                className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-[#E6E6E6] bg-white text-xs font-mono-num text-[#004628]"
              />
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                disabled={!txFile || isStreaming}
                onClick={handleRunCustomerStream}
                className="min-h-[42px] px-5 py-2 rounded-full bg-[#91FA9B] hover:bg-[#49F37B] active:bg-[#00EB5A] disabled:opacity-50 text-[#004628] text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{isStreaming ? 'Streaming…' : 'Stream Local File into Sheet'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Streaming Progress & Status */}
        {statusText && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-[#363636]">
              <CheckCircle2 className="w-4 h-4 text-[#00AA46] shrink-0" />
              <span>{statusText}</span>
            </div>
            {isStreaming && (
              <div className="w-full h-1.5 bg-[#E6E6E6] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#00AA46] transition-opacity duration-150"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            )}
          </div>
        )}

        {errorText && <p className="text-xs font-bold text-[#B70000]">{errorText}</p>}
      </div>
    </div>
  );
};
