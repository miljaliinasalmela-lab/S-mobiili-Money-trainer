export type BasketId = 'regular_essentials' | 'irregular_essentials' | 'everyday_choices';

export type TrackerCategoryId =
  | 'housing'
  | 'groceries'
  | 'restaurants_cafes'
  | 'travel_taxis'
  | 'car_driving'
  | 'entertainment_electronics'
  | 'hobbies_sports'
  | 'clothing_appearance'
  | 'health'
  | 'pets'
  | 'insurance_bills'
  | 'other_repairs';

export type EditableTrackerField =
  | TrackerCategoryId
  | 'primaryIncomeEur'
  | 'sideIncomeEur';

export type TxSentiment = 'worth_it' | 'meh' | 'skip_next';

export interface WeeklyQuestProgress {
  id: string;
  daysCompleted: boolean[]; // 7 booleans: Mon..Sun
}

export interface CustomerInteractiveState {
  oopsJarSavedEur: number;
  txSentiments: Record<string, TxSentiment>;
  quests: Record<string, WeeklyQuestProgress>;
  loggedTransactions: SBankTransaction[];
  categoryTargetsEur: Partial<Record<TrackerCategoryId, number>>;
}

export interface InteractiveSummaryContext {
  oopsJarSavedEur: number;
  oopsJarTargetEur: number;
  ratedCount: number;
  worthItTotalEur: number;
  skipNextTotalEur: number;
  activeQuestDaysCompleted: number;
  estimatedWeeklyQuestSavingsEur: number;
  loggedSpendCount: number;
}

export interface CategoryDefinition {
  id: TrackerCategoryId;
  label: string;
  labelFi: string;
  shortLabel: string;
  basket: BasketId;
  description: string;
  sampleMccs: string[];
}

export interface BasketDefinition {
  id: BasketId;
  label: string;
  labelFi: string;
  subtitle: string;
  pedagogyNote: string;
}

export interface SReceiptLineItem {
  name: string;
  department?: string;
  amountEur: number;
  mappedCategory?: TrackerCategoryId;
}

export interface SBankTransaction {
  customer_id: string;
  bank_account_id: string;
  tx_date: string; // YYYY-MM-DD
  tx_timestamp: string; // ISO timestamp
  category: string; // Raw dataset category
  tx_amount_eur: number; // Positive for credit/income, negative for outflow
  balance_after_eur: number;
  transaction_type: string; // e.g. SALARY, SIDE_INCOME, CARD_PURCHASE, SEPA_DIRECT_DEBIT, BANK_TRANSFER
  merchant_id: string;
  mcc_code: string;
  merchant_label?: string;
  account_provider?: string; // e.g. 'S-Pankki' or 'Nordea (PSD2)'
  userLoggedId?: string;
  storeChain?: string; // e.g. 'Prisma', 'S-market', 'Alepa', 'Sokos'
  eReceiptItems?: SReceiptLineItem[];
}

export interface SBankCustomer {
  customer_id: string;
  customer_postal_code: string;
  customer_age: number;
  profileLabel?: string;
  householdSummary?: string;
}

export interface MonthlyRecord {
  monthKey: string; // YYYY-MM
  monthIndex: number; // 0..11
  monthShort: string; // Jan..Dec
  monthShortFi: string; // Tammi..Joulu
  monthFullFi: string; // Tammikuu..Joulukuu
  monthLabel: string; // January 2026
  primaryIncomeEur: number; // Päätulot
  sideIncomeEur: number; // Sivutulot
  categories: Record<TrackerCategoryId, number>;
  manualOverrides: Partial<Record<EditableTrackerField, number>>;
  txCount: number;
}

export interface TrackerDatasetContext {
  dataSource: 'synthetic-sample' | 'csv-import' | 'sbank-bridge';
  sourceLabel: string;
  isSynthetic: boolean;
  includePsd2External: boolean;
  splitEReceipts?: boolean;
  year: number;
  selectedMonthKey: string;
  customer: SBankCustomer;
  months: MonthlyRecord[];
  recentTransactions: SBankTransaction[];
  hasManualEdits: boolean;
  interactiveSummary?: InteractiveSummaryContext;
}

export interface ToolTraceItem {
  toolName: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

export interface CoachMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  mode?: 'gemini' | 'local-fallback';
  model?: string;
  fallbackReason?: string;
  supportingPeriod?: string;
  dataSource?: string;
  toolTraces?: ToolTraceItem[];
}

export interface CoachAskPayload {
  question: string;
  context: TrackerDatasetContext;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface CoachAskResponse {
  answer: string;
  mode: 'gemini' | 'local-fallback';
  model: string;
  fallbackReason?: string;
  supportingPeriod: string;
  dataSource: string;
  toolTraces: ToolTraceItem[];
}

export interface HealthStatusResponse {
  status: 'ok';
  provider: 'gemini';
  model: string;
  geminiConfigured: boolean;
}

export interface StatFinCohortBenchmark {
  cohortId: string;
  cohortLabel: string;
  regionLabel: string;
  sourceCitation: string;
  monthlyMedianByCategoryEur: Record<TrackerCategoryId, number>;
}

export interface SBankBridgeInterface {
  getTransactions: (options?: { customerId?: string; includePsd2?: boolean }) => Promise<{
    source: string;
    isSynthetic: boolean;
    customer: SBankCustomer;
    transactions: SBankTransaction[];
    period: string;
  }>;
  askCoach: (payload: CoachAskPayload) => Promise<CoachAskResponse>;
}

declare global {
  interface Window {
    SBankBridge?: SBankBridgeInterface;
    SBankHostAdapter?: {
      getTransactions?: (options?: { customerId?: string; includePsd2?: boolean }) => Promise<{
        source?: string;
        isSynthetic?: boolean;
        customer: SBankCustomer;
        transactions: SBankTransaction[];
        period?: string;
      }>;
    };
  }
}
