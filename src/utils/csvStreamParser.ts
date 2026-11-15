import { describeOfficialMerchant } from '../shared/officialDatasetCustomers.ts';
import type { SBankCustomer, SBankTransaction } from '../shared/types.ts';

export interface CsvDiscoveryResult {
  customerIds: string[];
  detectedYear: number;
  rowsScanned: number;
  bytesRead: number;
  totalBytes: number;
}

export interface CsvCustomerImportResult {
  customerId: string;
  year: number;
  transactions: SBankTransaction[];
  rowsMatched: number;
  rowsScanned: number;
}

function splitCsvRow(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function stripUtf8Bom(input: string): string {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
}

/**
 * Streams the beginning (or full length) of a large Junction 2026 S-Pankki transactions CSV
 * without loading the entire 346 MB file into memory at once. Discovers up to `maxCustomers`
 * unique customer_ids so the user can choose which customer to inspect.
 */
export async function discoverCustomersFromCsvStream(
  file: File,
  maxCustomers = 40,
  maxScanBytes = 25 * 1024 * 1024,
  onProgress?: (bytesRead: number, totalBytes: number) => void
): Promise<CsvDiscoveryResult> {
  const reader = file.stream().getReader();
  const decoder = new TextDecoder('utf-8');
  let leftover = '';
  let headerMap: Record<string, number> | null = null;
  const customerSet = new Set<string>();
  const yearCounts = new Map<number, number>();
  let rowsScanned = 0;
  let bytesRead = 0;
  let isFirstChunk = true;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      onProgress?.(bytesRead, file.size);

      let chunkText = decoder.decode(value, { stream: true });
      if (isFirstChunk) {
        chunkText = stripUtf8Bom(chunkText);
        isFirstChunk = false;
      }

      const combined = leftover + chunkText;
      const lines = combined.split(/\r?\n/);
      leftover = lines.pop() ?? '';

      for (const rawLine of lines) {
        if (!rawLine.trim()) continue;
        if (!headerMap) {
          const cols = splitCsvRow(stripUtf8Bom(rawLine));
          headerMap = {};
          cols.forEach((col, idx) => {
            headerMap![col.toLowerCase().trim()] = idx;
          });
          continue;
        }

        rowsScanned++;
        const cols = splitCsvRow(rawLine);
        const custIdx = headerMap['customer_id'] ?? 0;
        const dateIdx = headerMap['tx_date'] ?? 2;

        const cid = cols[custIdx];
        if (cid) customerSet.add(cid);

        const txDate = cols[dateIdx];
        if (txDate && txDate.length >= 4) {
          const yr = Number(txDate.slice(0, 4));
          if (yr >= 2015 && yr <= 2035) {
            yearCounts.set(yr, (yearCounts.get(yr) || 0) + 1);
          }
        }

        if (customerSet.size >= maxCustomers && bytesRead >= Math.min(file.size, maxScanBytes)) {
          await reader.cancel();
          break;
        }
      }

      if (customerSet.size >= maxCustomers && bytesRead >= Math.min(file.size, maxScanBytes)) {
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  let detectedYear = 2026;
  let topCount = -1;
  for (const [yr, cnt] of yearCounts.entries()) {
    if (cnt > topCount) {
      topCount = cnt;
      detectedYear = yr;
    }
  }

  return {
    customerIds: Array.from(customerSet),
    detectedYear,
    rowsScanned,
    bytesRead,
    totalBytes: file.size,
  };
}

/**
 * Streams the entire CSV file chunk-by-chunk, retaining ONLY transactions matching `targetCustomerId`.
 * Keeps memory footprint tiny even on multi-hundred-MB CSV exports.
 */
export async function streamCustomerTransactionsFromCsv(
  file: File,
  targetCustomerId: string,
  onProgress?: (bytesRead: number, totalBytes: number, matched: number) => void
): Promise<CsvCustomerImportResult> {
  const reader = file.stream().getReader();
  const decoder = new TextDecoder('utf-8');
  let leftover = '';
  let headerMap: Record<string, number> | null = null;
  const transactions: SBankTransaction[] = [];
  const yearCounts = new Map<number, number>();
  let rowsScanned = 0;
  let bytesRead = 0;
  let isFirstChunk = true;

  const processLine = (rawLine: string) => {
    if (!rawLine.trim()) return;
    if (!headerMap) {
      const cols = splitCsvRow(stripUtf8Bom(rawLine));
      headerMap = {};
      cols.forEach((col, idx) => {
        headerMap![col.toLowerCase().trim()] = idx;
      });
      return;
    }

    rowsScanned++;
    // Fast pre-check before splitting if targetCustomerId isn't even in rawLine
    if (targetCustomerId && !rawLine.includes(targetCustomerId)) {
      return;
    }

    const cols = splitCsvRow(rawLine);
    const getCol = (name: string, fallbackIdx: number) => {
      const idx = headerMap![name];
      return idx !== undefined ? cols[idx] ?? '' : cols[fallbackIdx] ?? '';
    };

    const cid = getCol('customer_id', 0);
    if (targetCustomerId && cid !== targetCustomerId) return;

    const txDate = getCol('tx_date', 2);
    const amountRaw = Number(getCol('tx_amount_eur', 5).replace(',', '.'));
    const balanceRaw = Number(getCol('balance_after_eur', 6).replace(',', '.'));
    const txType = getCol('transaction_type', 7) || 'CARD_PURCHASE';
    const category = getCol('category', 4) || 'OTHER';
    const mccCode = getCol('mcc_code', 9) || '';
    const merchantId = getCol('merchant_id', 8) || '';
    const merchantLabel =
      headerMap!['merchant_label'] !== undefined
        ? cols[headerMap!['merchant_label']]
        : headerMap!['description'] !== undefined
        ? cols[headerMap!['description']]
        : undefined;

    if (txDate && txDate.length >= 4) {
      const yr = Number(txDate.slice(0, 4));
      if (yr >= 2015 && yr <= 2035) {
        yearCounts.set(yr, (yearCounts.get(yr) || 0) + 1);
      }
    }

    // Normalize sign: keep investment_deposit negative; only treat salary / other_income / withdrawal as positive inflows
    let signedAmount = Number.isFinite(amountRaw) ? amountRaw : 0;
    const upperType = txType.toUpperCase();
    const upperCat = category.toUpperCase();
    const isIncome =
      (upperType === 'SALARY' ||
        upperType.includes('OTHER_INCOME') ||
        upperType.includes('SIDE_INCOME') ||
        upperCat.includes('INCOME')) &&
      !upperType.includes('SWEEP');

    if (
      !isIncome &&
      signedAmount > 0 &&
      (upperType.includes('CARD') ||
        upperType.includes('DEBIT') ||
        upperType.includes('PAYMENT') ||
        upperType.includes('PURCHASE'))
    ) {
      signedAmount = -signedAmount;
    }

    transactions.push({
      customer_id: cid || targetCustomerId,
      bank_account_id: getCol('bank_account_id', 1) || 'CSV-ACCOUNT',
      tx_date: txDate,
      tx_timestamp: getCol('tx_timestamp', 3) || `${txDate}T12:00:00Z`,
      category,
      tx_amount_eur: signedAmount,
      balance_after_eur: Number.isFinite(balanceRaw) ? balanceRaw : 0,
      transaction_type: txType,
      merchant_id: merchantId,
      mcc_code: mccCode,
      merchant_label:
        merchantLabel || describeOfficialMerchant(merchantId, mccCode, category, txType),
      account_provider: 'S-Pankki',
    });
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;

      let chunkText = decoder.decode(value, { stream: true });
      if (isFirstChunk) {
        chunkText = stripUtf8Bom(chunkText);
        isFirstChunk = false;
      }

      const combined = leftover + chunkText;
      const lines = combined.split(/\r?\n/);
      leftover = lines.pop() ?? '';

      for (const line of lines) {
        processLine(line);
      }

      onProgress?.(bytesRead, file.size, transactions.length);
    }

    if (leftover.trim()) {
      processLine(leftover);
    }
  } finally {
    reader.releaseLock();
  }

  let detectedYear = 2026;
  let topCount = -1;
  for (const [yr, cnt] of yearCounts.entries()) {
    if (cnt > topCount) {
      topCount = cnt;
      detectedYear = yr;
    }
  }

  return {
    customerId: targetCustomerId,
    year: detectedYear,
    transactions,
    rowsMatched: transactions.length,
    rowsScanned,
  };
}

export async function parseCustomersMetadataCsv(
  file: File
): Promise<Map<string, SBankCustomer>> {
  const text = stripUtf8Bom(await file.text());
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const map = new Map<string, SBankCustomer>();
  if (lines.length < 2) return map;

  const headerCols = splitCsvRow(lines[0]).map((c) => c.toLowerCase().trim());
  const idIdx = headerCols.indexOf('customer_id');
  const postalIdx = headerCols.indexOf('customer_postal_code');
  const ageIdx = headerCols.indexOf('customer_age');

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvRow(lines[i]);
    const cid = cols[idIdx >= 0 ? idIdx : 0];
    if (!cid) continue;
    const postal = cols[postalIdx >= 0 ? postalIdx : 1] || '00100';
    const age = Number(cols[ageIdx >= 0 ? ageIdx : 2]) || 30;
    map.set(cid, {
      customer_id: cid,
      customer_postal_code: postal,
      customer_age: age,
      profileLabel: `${cid} · Postal ${postal} (Age ${age})`,
      householdSummary: `Imported Junction 2026 customer profile (${postal}, age ${age}).`,
    });
  }

  return map;
}
