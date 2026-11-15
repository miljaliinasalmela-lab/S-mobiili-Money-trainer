import React, { useEffect, useMemo, useState } from 'react';
import {
  Zap,
  Table2,
  Layers,
  Database,
  MessageSquareText,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Link2,
  Building2,
  Upload,
  Receipt,
} from 'lucide-react';
import {
  CATEGORIES,
  SYNTHETIC_CUSTOMERS,
  generateSyntheticTransactions,
} from './shared/syntheticData.ts';
import {
  OFFICIAL_JUNCTION_CUSTOMERS,
  getOfficialCustomerTransactions,
} from './shared/officialDatasetCustomers.ts';
import {
  aggregateTransactionsToMonths,
  buildDeterministicCoachFallback,
  computeMonthSummary,
  roundEur,
} from './shared/calculations.ts';
import { attachSGroupEReceipts } from './shared/eReceipts.ts';
import {
  calculateQuestStats,
  createDefaultInteractiveState,
  getTxSentimentKey,
  loadInteractiveState,
  saveInteractiveState,
} from './shared/interactiveStore.ts';
import {
  askCoachViaBridge,
  fetchServerHealth,
  registerSBankBridge,
  syncBridgeDatasetState,
} from './services/sbankBridge.ts';
import { DailyPulseSection } from './components/DailyPulseSection.tsx';
import { TrackerSection } from './components/TrackerSection.tsx';
import { BasketsPedagogySection } from './components/BasketsPedagogySection.tsx';
import { MyDataBenchmarksSection } from './components/MyDataBenchmarksSection.tsx';
import { CoachPanel } from './components/CoachPanel.tsx';
import { CsvImportModal } from './components/CsvImportModal.tsx';
import type {
  CoachMessage,
  CustomerInteractiveState,
  EditableTrackerField,
  HealthStatusResponse,
  InteractiveSummaryContext,
  MonthlyRecord,
  SBankCustomer,
  SBankTransaction,
  SReceiptLineItem,
  TrackerCategoryId,
  TrackerDatasetContext,
  TxSentiment,
} from './shared/types.ts';

export type AppTabId = 'pulse' | 'tracker' | 'baskets' | 'mydata' | 'coach';

const TAB_DEFINITIONS: Array<{
  id: AppTabId;
  headerTitle: string;
  mobileLabel: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'pulse',
    headerTitle: 'Today',
    mobileLabel: 'Today',
    Icon: Zap,
  },
  {
    id: 'tracker',
    headerTitle: 'Monthly Sheet',
    mobileLabel: 'Sheet',
    Icon: Table2,
  },
  {
    id: 'baskets',
    headerTitle: '3 Baskets',
    mobileLabel: 'Baskets',
    Icon: Layers,
  },
  {
    id: 'mydata',
    headerTitle: 'MyData',
    mobileLabel: 'MyData',
    Icon: Database,
  },
  {
    id: 'coach',
    headerTitle: 'S-buddy',
    mobileLabel: 'S-buddy',
    Icon: MessageSquareText,
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTabId>('pulse');
  const [customers, setCustomers] = useState<SBankCustomer[]>([
    ...OFFICIAL_JUNCTION_CUSTOMERS,
    ...SYNTHETIC_CUSTOMERS,
  ]);
  const [activeCustomerId, setActiveCustomerId] = useState<string>(
    OFFICIAL_JUNCTION_CUSTOMERS[0].customer_id
  );
  const [includePsd2External, setIncludePsd2External] = useState<boolean>(false);
  const [splitEReceipts, setSplitEReceipts] = useState<boolean>(true);
  const [dataSourceType, setDataSourceType] = useState<
    'synthetic-sample' | 'csv-import' | 'sbank-bridge'
  >('synthetic-sample');
  const [importedTransactions, setImportedTransactions] = useState<SBankTransaction[] | null>(
    null
  );
  const [sourceLabel, setSourceLabel] = useState<string>(
    `Official S-Pankki Junction Dataset (${OFFICIAL_JUNCTION_CUSTOMERS[0].customer_id})`
  );
  const [activeYear, setActiveYear] = useState<number>(2025);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('2025-10');
  const [manualOverridesByMonth, setManualOverridesByMonth] = useState<
    Record<string, MonthlyRecord['manualOverrides']>
  >({});

  const [interactiveState, setInteractiveState] = useState<CustomerInteractiveState>(() =>
    loadInteractiveState(OFFICIAL_JUNCTION_CUSTOMERS[0].customer_id, 140)
  );

  const [isAccountSheetOpen, setIsAccountSheetOpen] = useState<boolean>(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState<boolean>(false);
  const [bridgeStatusNote, setBridgeStatusNote] = useState<string | null>(null);

  const [health, setHealth] = useState<HealthStatusResponse | null>(null);
  const [isAskingCoach, setIsAskingCoach] = useState<boolean>(false);
  const [coachMessages, setCoachMessages] = useState<CoachMessage[]>([]);

  useEffect(() => {
    registerSBankBridge();
    fetchServerHealth().then(setHealth);

    if (window.SBankHostAdapter?.getTransactions && window.SBankBridge) {
      window.SBankBridge.getTransactions().then((res) => {
        if (res.transactions && res.transactions.length > 0) {
          setCustomers((prev) =>
            prev.some((c) => c.customer_id === res.customer.customer_id)
              ? prev
              : [res.customer, ...prev]
          );
          setActiveCustomerId(res.customer.customer_id);
          setImportedTransactions(res.transactions);
          setDataSourceType('sbank-bridge');
          setSourceLabel(res.source);
        }
      });
    }
  }, []);

  useEffect(() => {
    setInteractiveState(loadInteractiveState(activeCustomerId, 140));
  }, [activeCustomerId]);

  const updateInteractive = (
    updater: (prev: CustomerInteractiveState) => CustomerInteractiveState
  ) => {
    setInteractiveState((prev) => {
      const next = updater(prev);
      saveInteractiveState(activeCustomerId, next);
      return next;
    });
  };

  const activeCustomer = useMemo(
    () => customers.find((c) => c.customer_id === activeCustomerId) || customers[0],
    [customers, activeCustomerId]
  );

  const baseTransactions: SBankTransaction[] = useMemo(() => {
    const psd2Extra = includePsd2External
      ? generateSyntheticTransactions(activeCustomerId, activeYear, true).filter(
          (t) => t.account_provider && t.account_provider !== 'S-Pankki'
        )
      : [];

    if (
      (dataSourceType === 'csv-import' || dataSourceType === 'sbank-bridge') &&
      importedTransactions
    ) {
      return includePsd2External ? [...importedTransactions, ...psd2Extra] : importedTransactions;
    }

    const officialTxs = getOfficialCustomerTransactions(activeCustomerId);
    if (officialTxs) {
      return includePsd2External ? [...officialTxs, ...psd2Extra] : officialTxs;
    }

    return generateSyntheticTransactions(activeCustomerId, activeYear, includePsd2External);
  }, [
    dataSourceType,
    importedTransactions,
    activeCustomerId,
    activeYear,
    includePsd2External,
  ]);

  const transactions: SBankTransaction[] = useMemo(
    () => attachSGroupEReceipts([...baseTransactions, ...interactiveState.loggedTransactions]),
    [baseTransactions, interactiveState.loggedTransactions]
  );

  const availableYears = useMemo(() => {
    const yrs = new Set<number>();
    for (const tx of transactions) {
      if (tx.tx_date && tx.tx_date.length >= 4) {
        const y = Number(tx.tx_date.slice(0, 4));
        if (y >= 2020 && y <= 2030) yrs.add(y);
      }
    }
    const sorted = Array.from(yrs).sort((a, b) => a - b);
    return sorted.length > 0 ? sorted : [activeYear];
  }, [transactions, activeYear]);

  const months = useMemo(
    () =>
      aggregateTransactionsToMonths(
        transactions,
        activeYear,
        manualOverridesByMonth,
        splitEReceipts
      ),
    [transactions, activeYear, manualOverridesByMonth, splitEReceipts]
  );

  const oopsJarTargetEur = useMemo(() => {
    const populated = months.filter(
      (m) => m.txCount > 0 || Object.keys(m.manualOverrides).length > 0
    );
    const divisor = Math.max(1, populated.length);
    const avgIrregular =
      populated.reduce((s, m) => s + computeMonthSummary(m).baskets.irregular_essentials, 0) /
      divisor;
    return Math.max(250, Math.round(avgIrregular * 3));
  }, [months]);

  const interactiveSummary: InteractiveSummaryContext = useMemo(() => {
    let ratedCount = 0;
    let worthItTotalEur = 0;
    let skipNextTotalEur = 0;

    for (const tx of transactions) {
      if (tx.tx_amount_eur >= 0 || !tx.tx_date.startsWith(selectedMonthKey)) continue;
      const s = interactiveState.txSentiments[getTxSentimentKey(tx)];
      if (!s) continue;
      ratedCount += 1;
      const amt = Math.abs(tx.tx_amount_eur);
      if (s === 'worth_it') worthItTotalEur += amt;
      if (s === 'skip_next') skipNextTotalEur += amt;
    }

    const qStats = calculateQuestStats(interactiveState);

    return {
      oopsJarSavedEur: roundEur(interactiveState.oopsJarSavedEur),
      oopsJarTargetEur,
      ratedCount,
      worthItTotalEur: roundEur(worthItTotalEur),
      skipNextTotalEur: roundEur(skipNextTotalEur),
      activeQuestDaysCompleted: qStats.daysCompleted,
      estimatedWeeklyQuestSavingsEur: qStats.weeklySavingsEur,
      loggedSpendCount: interactiveState.loggedTransactions.length,
    };
  }, [transactions, selectedMonthKey, interactiveState, oopsJarTargetEur]);

  const hasManualEdits = useMemo(
    () =>
      Object.values(manualOverridesByMonth).some((ovr) => ovr && Object.keys(ovr).length > 0) ||
      interactiveState.loggedTransactions.length > 0,
    [manualOverridesByMonth, interactiveState.loggedTransactions.length]
  );

  const effectiveSourceLabel = useMemo(() => {
    const psd2Suffix = includePsd2External ? ' + PSD2 External Accounts' : '';
    const editsSuffix = hasManualEdits ? ' + live edits' : '';
    return `${sourceLabel}${psd2Suffix}${editsSuffix}`;
  }, [sourceLabel, includePsd2External, hasManualEdits]);

  const datasetContext: TrackerDatasetContext = useMemo(
    () => ({
      dataSource: dataSourceType,
      sourceLabel: effectiveSourceLabel,
      isSynthetic: dataSourceType !== 'sbank-bridge',
      includePsd2External,
      splitEReceipts,
      year: activeYear,
      selectedMonthKey,
      customer: activeCustomer,
      months,
      recentTransactions: transactions,
      hasManualEdits,
      interactiveSummary,
    }),
    [
      dataSourceType,
      effectiveSourceLabel,
      includePsd2External,
      splitEReceipts,
      activeYear,
      selectedMonthKey,
      activeCustomer,
      months,
      transactions,
      hasManualEdits,
      interactiveSummary,
    ]
  );

  useEffect(() => {
    syncBridgeDatasetState({
      sourceLabel: datasetContext.sourceLabel,
      isSynthetic: datasetContext.isSynthetic,
      customer: activeCustomer,
      transactions,
      period: String(activeYear),
    });
  }, [
    datasetContext.sourceLabel,
    datasetContext.isSynthetic,
    activeCustomer,
    transactions,
    activeYear,
  ]);

  useEffect(() => {
    const initial = buildDeterministicCoachFallback(
      `What is safe for me to spend this week?`,
      datasetContext,
      health?.geminiConfigured
        ? 'Initial deterministic snapshot — ask S-buddy any question'
        : 'Local deterministic snapshot'
    );
    setCoachMessages([
      {
        id: `welcome-${activeCustomer.customer_id}-${includePsd2External ? 'psd2' : 'sbank'}`,
        role: 'assistant',
        content: initial.answer,
        timestamp: new Date().toISOString(),
        mode: 'local-fallback',
        model: 'deterministic-calculator',
        supportingPeriod: initial.supportingPeriod,
        dataSource: initial.dataSource,
        toolTraces: initial.toolTraces,
      },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCustomer.customer_id, includePsd2External]);

  const handleSelectYear = (nextYear: number) => {
    setActiveYear(nextYear);
    const matchingMonths = transactions
      .filter((tx) => tx.tx_date.startsWith(`${nextYear}-`))
      .map((tx) => tx.tx_date.slice(0, 7))
      .sort();
    if (matchingMonths.length > 0) {
      const octKey = `${nextYear}-10`;
      const augKey = `${nextYear}-08`;
      if (matchingMonths.includes(octKey)) {
        setSelectedMonthKey(octKey);
      } else if (matchingMonths.includes(augKey)) {
        setSelectedMonthKey(augKey);
      } else {
        setSelectedMonthKey(matchingMonths[matchingMonths.length - 1]);
      }
    } else {
      setSelectedMonthKey(`${nextYear}-10`);
    }
  };

  const handleCustomerChange = (nextCustomerId: string) => {
    setActiveCustomerId(nextCustomerId);
    const isOfficial = OFFICIAL_JUNCTION_CUSTOMERS.some((c) => c.customer_id === nextCustomerId);
    const isSynthetic = SYNTHETIC_CUSTOMERS.some((c) => c.customer_id === nextCustomerId);
    if (isOfficial) {
      setImportedTransactions(null);
      setActiveYear(2025);
      setSelectedMonthKey('2025-10');
      setManualOverridesByMonth({});
      setDataSourceType('synthetic-sample');
      setSourceLabel(`Official S-Pankki Junction Dataset (${nextCustomerId})`);
    } else if (isSynthetic) {
      setImportedTransactions(null);
      setActiveYear(2026);
      setSelectedMonthKey('2026-10');
      setManualOverridesByMonth({});
      setDataSourceType('synthetic-sample');
      setSourceLabel(`Synthetic S-Bank Demo (${nextCustomerId})`);
    }
  };

  const handleUpdateCell = (monthKey: string, field: EditableTrackerField, value: number) => {
    setManualOverridesByMonth((prev) => ({
      ...prev,
      [monthKey]: {
        ...(prev[monthKey] || {}),
        [field]: value,
      },
    }));
  };

  const handleResetCell = (monthKey: string, field: EditableTrackerField) => {
    setManualOverridesByMonth((prev) => {
      const monthCopy = { ...(prev[monthKey] || {}) };
      delete monthCopy[field];
      return {
        ...prev,
        [monthKey]: monthCopy,
      };
    });
  };

  const handleLogPurchase = ({
    label,
    amountEur,
    categoryId,
  }: {
    label: string;
    amountEur: number;
    categoryId: TrackerCategoryId;
  }) => {
    const catDef = CATEGORIES.find((c) => c.id === categoryId) || CATEGORIES[2];
    const loggedId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newTx: SBankTransaction = {
      customer_id: activeCustomerId,
      bank_account_id: `${activeCustomerId}_LIVE`,
      tx_date: `${selectedMonthKey}-28`,
      tx_timestamp: `${selectedMonthKey}-28T14:30:00Z`,
      category: catDef.label,
      tx_amount_eur: -Math.abs(roundEur(amountEur)),
      balance_after_eur: 1500,
      transaction_type: 'CARD_PURCHASE',
      merchant_id: `LOGGED_${loggedId}`,
      mcc_code: catDef.sampleMccs[0] || '5814',
      merchant_label: `${label} (Logged)`,
      account_provider: 'S-Pankki',
      userLoggedId: loggedId,
    };

    updateInteractive((prev) => ({
      ...prev,
      loggedTransactions: [newTx, ...prev.loggedTransactions],
    }));
  };

  const handleRemoveLoggedPurchase = (loggedId: string) => {
    updateInteractive((prev) => ({
      ...prev,
      loggedTransactions: prev.loggedTransactions.filter((t) => t.userLoggedId !== loggedId),
    }));
  };

  const handleLogPrismaReceipt = (items: SReceiptLineItem[]) => {
    const cleanItems = items
      .map((it) => ({
        ...it,
        amountEur: roundEur(Math.abs(it.amountEur)),
      }))
      .filter((it) => it.amountEur > 0);
    if (cleanItems.length === 0) return;

    const totalAbs = roundEur(cleanItems.reduce((s, it) => s + it.amountEur, 0));
    const loggedId = `receipt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newTx: SBankTransaction = {
      customer_id: activeCustomerId,
      bank_account_id: `${activeCustomerId}_LIVE`,
      tx_date: `${selectedMonthKey}-28`,
      tx_timestamp: `${selectedMonthKey}-28T16:15:00Z`,
      category: 'Groceries',
      tx_amount_eur: -totalAbs,
      balance_after_eur: 1500,
      transaction_type: 'CARD_PURCHASE',
      merchant_id: `PRISMA_${loggedId}`,
      mcc_code: '5411',
      merchant_label: 'Prisma Hypermarket · e-Receipt (Logged)',
      account_provider: 'S-Pankki',
      userLoggedId: loggedId,
      storeChain: 'Prisma',
      eReceiptItems: cleanItems,
    };

    updateInteractive((prev) => ({
      ...prev,
      loggedTransactions: [newTx, ...prev.loggedTransactions],
    }));
  };

  const handleRateTransaction = (txKey: string, sentiment: TxSentiment) => {
    updateInteractive((prev) => ({
      ...prev,
      txSentiments: {
        ...prev.txSentiments,
        [txKey]: sentiment,
      },
    }));
  };

  const handleToggleQuestDay = (questId: string, dayIdx: number) => {
    updateInteractive((prev) => {
      const existing = prev.quests[questId]?.daysCompleted || [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
      ];
      const nextDays = existing.map((v, i) => (i === dayIdx ? !v : v));
      return {
        ...prev,
        quests: {
          ...prev.quests,
          [questId]: { id: questId, daysCompleted: nextDays },
        },
      };
    });
  };

  const handleAdjustOopsJar = (deltaEur: number, resetToZero = false) => {
    updateInteractive((prev) => ({
      ...prev,
      oopsJarSavedEur: resetToZero ? 0 : Math.max(0, roundEur(prev.oopsJarSavedEur + deltaEur)),
    }));
  };

  const handleSetCategoryTarget = (catId: TrackerCategoryId, targetEur: number | null) => {
    updateInteractive((prev) => {
      const nextTargets = { ...prev.categoryTargetsEur };
      if (targetEur === null) {
        delete nextTargets[catId];
      } else {
        nextTargets[catId] = targetEur;
      }
      return {
        ...prev,
        categoryTargetsEur: nextTargets,
      };
    });
  };

  const handleCsvImportComplete = (payload: {
    customer: SBankCustomer;
    transactions: SBankTransaction[];
    year: number;
    sourceLabel: string;
  }) => {
    setCustomers((prev) => {
      const exists = prev.some((c) => c.customer_id === payload.customer.customer_id);
      return exists ? prev : [payload.customer, ...prev];
    });
    setActiveCustomerId(payload.customer.customer_id);
    setImportedTransactions(payload.transactions);
    setActiveYear(payload.year);
    const monthsInTargetYear = payload.transactions
      .filter((tx) => tx.tx_date.startsWith(`${payload.year}-`))
      .map((tx) => tx.tx_date.slice(0, 7))
      .sort();
    const preferredOct = `${payload.year}-10`;
    const firstPopulatedMonth = monthsInTargetYear.includes(preferredOct)
      ? preferredOct
      : monthsInTargetYear[monthsInTargetYear.length - 1] || preferredOct;
    setSelectedMonthKey(firstPopulatedMonth);
    setManualOverridesByMonth({});
    setDataSourceType('csv-import');
    setSourceLabel(payload.sourceLabel);
    setIsAccountSheetOpen(false);
    setActiveTab('pulse');
  };

  const handleTestBridgeSync = async () => {
    if (!window.SBankBridge) return;
    const res = await window.SBankBridge.getTransactions({
      customerId: activeCustomerId,
      includePsd2: includePsd2External,
    });
    if (!res.isSynthetic && res.transactions.length > 0) {
      setCustomers((prev) =>
        prev.some((c) => c.customer_id === res.customer.customer_id)
          ? prev
          : [res.customer, ...prev]
      );
      setActiveCustomerId(res.customer.customer_id);
      setImportedTransactions(res.transactions);
      setDataSourceType('sbank-bridge');
      setSourceLabel(res.source);
    }
    setBridgeStatusNote(`SBankBridge OK · ${res.transactions.length} tx`);
    window.setTimeout(() => setBridgeStatusNote(null), 3500);
  };

  const handleSendSbuddyQuestion = async (question: string) => {
    const userMsg: CoachMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: question,
      timestamp: new Date().toISOString(),
    };

    const historyForBackend = coachMessages.slice(-6).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setActiveTab('coach');
    setCoachMessages((prev) => [...prev, userMsg]);
    setIsAskingCoach(true);

    try {
      const response = await askCoachViaBridge({
        question,
        context: datasetContext,
        history: historyForBackend,
      });

      const assistantMsg: CoachMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: response.answer,
        timestamp: new Date().toISOString(),
        mode: response.mode,
        model: response.model,
        fallbackReason: response.fallbackReason,
        supportingPeriod: response.supportingPeriod,
        dataSource: response.dataSource,
        toolTraces: response.toolTraces,
      };
      setCoachMessages((prev) => [...prev, assistantMsg]);
    } finally {
      setIsAskingCoach(false);
    }
  };

  const activeTabMeta = TAB_DEFINITIONS.find((t) => t.id === activeTab) || TAB_DEFINITIONS[0];

  const renderActiveTabContent = () => {
    switch (activeTab) {
      case 'pulse':
        return (
          <DailyPulseSection
            context={datasetContext}
            interactiveState={interactiveState}
            onLogPurchase={handleLogPurchase}
            onRemoveLoggedPurchase={handleRemoveLoggedPurchase}
            onToggleQuestDay={handleToggleQuestDay}
            onAskSbuddy={handleSendSbuddyQuestion}
          />
        );
      case 'tracker':
        return (
          <TrackerSection
            year={activeYear}
            availableYears={availableYears}
            months={months}
            transactions={transactions}
            selectedMonthKey={selectedMonthKey}
            customerLabel={activeCustomer.customer_id}
            onSelectYear={handleSelectYear}
            onSelectMonth={setSelectedMonthKey}
            onUpdateCell={handleUpdateCell}
            onResetCell={handleResetCell}
            categoryTargetsEur={interactiveState.categoryTargetsEur}
            onSetCategoryTarget={handleSetCategoryTarget}
            forceMobileSingleMonth={true}
            splitEReceipts={splitEReceipts}
          />
        );
      case 'baskets':
        return (
          <BasketsPedagogySection
            context={datasetContext}
            oopsJarSavedEur={interactiveState.oopsJarSavedEur}
            oopsJarTargetEur={oopsJarTargetEur}
            onAdjustOopsJar={handleAdjustOopsJar}
            onApplyToSelectedMonth={(catId, amt) => {
              handleUpdateCell(selectedMonthKey, catId, amt);
              setActiveTab('tracker');
            }}
            onAskSbuddy={handleSendSbuddyQuestion}
          />
        );
      case 'mydata':
        return (
          <MyDataBenchmarksSection
            context={datasetContext}
            txSentiments={interactiveState.txSentiments}
            onRateTransaction={handleRateTransaction}
            onAskCoachBenchmark={handleSendSbuddyQuestion}
            splitEReceipts={splitEReceipts}
            onToggleSplitEReceipts={() => setSplitEReceipts((v) => !v)}
            onLogPrismaReceipt={handleLogPrismaReceipt}
            onJumpToSheet={() => setActiveTab('tracker')}
          />
        );
      case 'coach':
        return (
          <CoachPanel
            context={datasetContext}
            messages={coachMessages}
            isAsking={isAskingCoach}
            health={health}
            onSendQuestion={handleSendSbuddyQuestion}
          />
        );
    }
  };

  return (
    <div className="min-h-dvh w-full bg-[#EBF7EC] flex items-center justify-center sm:p-4 text-[#1F1F1F]">
      {/* =====================================================================
          DEDICATED S-MOBIILI MOBILE APP SHELL
          Full-bleed on phones (< sm), sleek 404px phone shell on larger screens
         ===================================================================== */}
      <div className="w-full sm:w-[404px] h-dvh sm:h-[min(852px,calc(100dvh-2rem))] bg-[#F5F5F5] sm:border-[7px] sm:border-[#1F1F1F] sm:rounded-[38px] overflow-hidden flex flex-col sm:shadow-xl">
        {/* S-mobiili Forest-Green App Header (#004628) */}
        <header className="bg-[#004628] text-white px-4 pt-3 pb-3 shrink-0">
          <div className="flex items-center justify-between gap-2 text-[11px] text-white/80">
            <span className="font-semibold tracking-tight">S-mobiili · Money Trainer</span>

            <button
              type="button"
              onClick={() => setIsAccountSheetOpen((v) => !v)}
              className="min-h-[26px] px-2.5 py-0.5 rounded-full bg-white/15 hover:bg-white/25 text-white font-mono-num text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
            >
              {(includePsd2External || hasManualEdits) && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#91FA9B]" />
              )}
              <span>{activeCustomer.customer_id}</span>
              {isAccountSheetOpen ? (
                <ChevronUp className="w-3 h-3 text-[#91FA9B]" />
              ) : (
                <ChevronDown className="w-3 h-3 text-[#91FA9B]" />
              )}
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 mt-1">
            <h1 className="text-lg font-bold tracking-tight truncate">
              {activeTabMeta.headerTitle}
            </h1>
            <button
              type="button"
              onClick={() => setActiveTab('tracker')}
              className="px-2.5 py-0.5 rounded-full bg-[#91FA9B] text-[#004628] text-xs font-bold font-mono-num shrink-0 cursor-pointer"
            >
              {selectedMonthKey}
            </button>
          </div>
        </header>

        {/* Compact Collapsible In-Phone Account & Dataset Bar */}
        {isAccountSheetOpen && (
          <div className="bg-[#EBF7EC] border-b border-[#99D59F]/60 px-3 py-1.5 space-y-1.5 shrink-0">
            <div className="flex items-center gap-1.5">
              <select
                id="smobiili-customer-select"
                aria-label="Select customer profile"
                value={activeCustomerId}
                onChange={(e) => handleCustomerChange(e.target.value)}
                className="flex-1 min-w-0 h-7 px-2.5 rounded-full border border-[#007841]/35 bg-white text-[11px] font-bold text-[#004628] focus:outline-none focus:border-[#007841]"
              >
                {customers.map((c) => (
                  <option key={c.customer_id} value={c.customer_id}>
                    {c.profileLabel || `${c.customer_id} · Postal ${c.customer_postal_code}`}
                  </option>
                ))}
              </select>
              <span className="text-[10px] font-mono-num text-[#666666] whitespace-nowrap shrink-0">
                {transactions.length} tx · {activeCustomer.customer_postal_code}
              </span>
            </div>

            <div className="flex items-center gap-1 overflow-x-auto">
              <button
                type="button"
                onClick={() => setIsCsvModalOpen(true)}
                className="h-6 px-2.5 rounded-full bg-[#91FA9B] hover:bg-[#49F37B] text-[#004628] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Upload className="w-2.5 h-2.5" />
                <span>CSV</span>
              </button>

              <button
                type="button"
                onClick={() => setSplitEReceipts((v) => !v)}
                className={`h-6 px-2.5 rounded-full border text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                  splitEReceipts
                    ? 'border-[#007841] bg-[#004628] text-[#91FA9B]'
                    : 'border-[#E6E6E6] bg-white text-[#363636]'
                }`}
              >
                <Receipt className="w-2.5 h-2.5" />
                <span>e-Receipts {splitEReceipts ? 'On' : 'Off'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIncludePsd2External((v) => !v)}
                className={`h-6 px-2.5 rounded-full border text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                  includePsd2External
                    ? 'border-[#007841] bg-[#004628] text-white'
                    : 'border-[#E6E6E6] bg-white text-[#363636]'
                }`}
              >
                <Building2 className="w-2.5 h-2.5" />
                <span>PSD2 {includePsd2External ? 'On' : 'Off'}</span>
              </button>

              <button
                type="button"
                onClick={handleTestBridgeSync}
                className="h-6 px-2.5 rounded-full border border-[#E6E6E6] bg-white text-[11px] font-bold text-[#004628] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Link2 className="w-2.5 h-2.5 text-[#007841]" />
                <span>Bridge</span>
              </button>

              {hasManualEdits && (
                <button
                  type="button"
                  onClick={() => {
                    setManualOverridesByMonth({});
                    const fresh = createDefaultInteractiveState(140);
                    setInteractiveState(fresh);
                    saveInteractiveState(activeCustomerId, fresh);
                  }}
                  className="h-6 px-2.5 rounded-full border border-[#007841] bg-white text-[11px] font-bold text-[#007841] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  <span>Reset</span>
                </button>
              )}
            </div>

            {bridgeStatusNote && (
              <p className="text-[10px] font-bold text-[#007841] leading-tight">
                {bridgeStatusNote}
              </p>
            )}
          </div>
        )}

        {/* @container Scrollable Mobile Viewport */}
        <main className="@container flex-1 overflow-y-auto p-3.5">
          {renderActiveTabContent()}
        </main>

        {/* S-mobiili 5-Tab Bottom Bar */}
        <nav
          aria-label="S-mobiili tabs"
          role="tablist"
          className="h-16 bg-white border-t border-[#E6E6E6] grid grid-cols-5 items-center px-1.5 shrink-0"
        >
          {TAB_DEFINITIONS.map(({ id, mobileLabel, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(id)}
                className={`py-1.5 flex flex-col items-center justify-center rounded-xl transition-colors cursor-pointer ${
                  active ? 'text-[#004628] font-bold' : 'text-[#666666] font-normal'
                }`}
              >
                <span
                  className={`px-3 py-1 rounded-full transition-colors ${
                    active ? 'bg-[#91FA9B] text-[#004628]' : 'text-[#666666]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </span>
                <span className="text-[10px] leading-tight mt-1 truncate max-w-full">
                  {mobileLabel}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      <CsvImportModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        onImportComplete={handleCsvImportComplete}
      />
    </div>
  );
}
