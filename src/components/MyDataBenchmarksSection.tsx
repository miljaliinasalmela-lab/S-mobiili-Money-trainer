import React, { useMemo, useState } from 'react';
import {
  Search,
  Smile,
  ThumbsDown,
  Receipt,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  Check,
} from 'lucide-react';
import { BASKETS, CATEGORIES, mapRawTransactionToCategory } from '../shared/syntheticData.ts';
import { roundEur, toolCompareWithPopulationBenchmark } from '../shared/calculations.ts';
import {
  classifyReceiptLineItem,
  resolveReceiptItemCategory,
  summarizeEReceiptSplits,
} from '../shared/eReceipts.ts';
import { getTxSentimentKey } from '../shared/interactiveStore.ts';
import type {
  BasketId,
  SReceiptLineItem,
  TrackerDatasetContext,
  TxSentiment,
} from '../shared/types.ts';

interface MyDataBenchmarksSectionProps {
  context: TrackerDatasetContext;
  txSentiments?: Record<string, TxSentiment>;
  onRateTransaction?: (txKey: string, sentiment: TxSentiment) => void;
  onAskCoachBenchmark: (question: string) => void;
  splitEReceipts: boolean;
  onToggleSplitEReceipts: () => void;
  onLogPrismaReceipt: (items: SReceiptLineItem[]) => void;
  onJumpToSheet?: () => void;
}

const QUICK_PRISMA_ITEMS: Array<{ label: string; name: string; department: string; amountEur: number }> = [
  { label: '+ Shirt €15', name: 'House Cotton Shirt (T-paita)', department: 'Pukeutuminen', amountEur: 15 },
  { label: '+ Pan €24', name: 'Fiskars Frying Pan (Paistinpannu)', department: 'Koti & keittiö', amountEur: 24 },
  { label: '+ Dog food €12', name: 'Hau-Hau Dog Food (Lemmikit)', department: 'Lemmikit', amountEur: 12 },
  { label: '+ Vitamins €9', name: 'Vitamin D & Plasters', department: 'Terveys', amountEur: 9 },
  { label: '+ Charger €17', name: 'USB-C Charger Cable', department: 'Elektroniikka', amountEur: 17 },
];

export const MyDataBenchmarksSection: React.FC<MyDataBenchmarksSectionProps> = ({
  context,
  txSentiments = {},
  onRateTransaction,
  onAskCoachBenchmark,
  splitEReceipts,
  onToggleSplitEReceipts,
  onLogPrismaReceipt,
  onJumpToSheet,
}) => {
  const [subView, setSubView] = useState<'ereceipts' | 'benchmarks' | 'transactions'>('ereceipts');
  const [basketFilter, setBasketFilter] = useState<'all' | BasketId | 'worth_it' | 'skip_next'>(
    'all'
  );
  const [txSearch, setTxSearch] = useState<string>('');
  const [expandedReceiptIdx, setExpandedReceiptIdx] = useState<number | null>(0);

  // Interactive S-ryhmä Receipt Builder state (defaults to €32 food + €15 shirt!)
  const [draftItems, setDraftItems] = useState<SReceiptLineItem[]>([
    { name: 'Kotimaista Milk, Bread & Veg', department: 'Elintarvikkeet', amountEur: 32 },
    { name: 'House Cotton Shirt (T-paita)', department: 'Pukeutuminen', amountEur: 15 },
  ]);
  const [customItemName, setCustomItemName] = useState<string>('');
  const [customItemPrice, setCustomItemPrice] = useState<string>('19');
  const [justLoggedBanner, setJustLoggedBanner] = useState<string | null>(null);

  const benchmarkResult = useMemo(
    () => toolCompareWithPopulationBenchmark(context, { categoryQuery: 'all' }),
    [context]
  );

  const comparisons = (benchmarkResult.comparisons as Array<Record<string, unknown>>) || [];

  const splitSummary = useMemo(
    () => summarizeEReceiptSplits(context.recentTransactions, context.selectedMonthKey),
    [context.recentTransactions, context.selectedMonthKey]
  );

  const monthEReceiptTxs = useMemo(
    () =>
      context.recentTransactions
        .filter(
          (tx) =>
            tx.tx_amount_eur < 0 &&
            tx.tx_date.startsWith(context.selectedMonthKey) &&
            tx.eReceiptItems &&
            tx.eReceiptItems.length > 0
        )
        .slice()
        .reverse(),
    [context.recentTransactions, context.selectedMonthKey]
  );

  const filteredTransactions = useMemo(() => {
    const q = txSearch.toLowerCase().trim();
    return context.recentTransactions
      .filter((tx) => {
        const key = getTxSentimentKey(tx);
        if (basketFilter === 'worth_it') {
          if (txSentiments[key] !== 'worth_it') return false;
        } else if (basketFilter === 'skip_next') {
          if (txSentiments[key] !== 'skip_next') return false;
        } else if (basketFilter !== 'all') {
          if (tx.tx_amount_eur >= 0) return false;
          const catId = mapRawTransactionToCategory(tx.category, tx.mcc_code, tx.merchant_label);
          const catDef = CATEGORIES.find((c) => c.id === catId);
          if (catDef?.basket !== basketFilter) return false;
        }
        if (!q) return true;
        const matchesItem = tx.eReceiptItems?.some((it) => it.name.toLowerCase().includes(q));
        return (
          (tx.merchant_label || '').toLowerCase().includes(q) ||
          (tx.merchant_id || '').toLowerCase().includes(q) ||
          (tx.category || '').toLowerCase().includes(q) ||
          (tx.mcc_code || '').includes(q) ||
          (tx.account_provider || '').toLowerCase().includes(q) ||
          tx.tx_date.includes(q) ||
          Boolean(matchesItem)
        );
      })
      .slice()
      .reverse();
  }, [context.recentTransactions, basketFilter, txSearch, txSentiments]);

  const draftTotalEur = useMemo(
    () => roundEur(draftItems.reduce((s, it) => s + Math.abs(it.amountEur), 0)),
    [draftItems]
  );

  const liveCustomCatId = useMemo(
    () => classifyReceiptLineItem(customItemName || 'shirt'),
    [customItemName]
  );
  const liveCustomCatDef = CATEGORIES.find((c) => c.id === liveCustomCatId) || CATEGORIES[1];

  const handleAddCustomItem = (e: React.FormEvent) => {
    e.preventDefault();
    const name = customItemName.trim();
    const price = roundEur(Number(customItemPrice.replace(',', '.')));
    if (!name || !Number.isFinite(price) || price <= 0) return;
    setDraftItems((prev) => [...prev, { name, amountEur: price }]);
    setCustomItemName('');
  };

  const handleCommitReceipt = () => {
    if (draftItems.length === 0) return;
    onLogPrismaReceipt(draftItems);
    setJustLoggedBanner(`Logged €${draftTotalEur.toFixed(2)} Prisma e-receipt!`);
    window.setTimeout(() => setJustLoggedBanner(null), 4500);
  };

  const getShortCatLabel = (catId: string) =>
    CATEGORIES.find((c) => c.id === catId)?.shortLabel || catId;

  return (
    <section id="mydata" className="space-y-3.5">
      {/* Top 3-Pill Segmented Switcher */}
      <div className="grid grid-cols-3 p-1 bg-white rounded-full border border-[#E6E6E6]">
        <button
          type="button"
          onClick={() => setSubView('ereceipts')}
          className={`min-h-[36px] px-2 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer whitespace-nowrap text-center truncate ${
            subView === 'ereceipts'
              ? 'bg-[#004628] text-white'
              : 'text-[#363636] hover:text-[#004628]'
          }`}
        >
          e-Receipts
        </button>
        <button
          type="button"
          onClick={() => setSubView('benchmarks')}
          className={`min-h-[36px] px-2 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer whitespace-nowrap text-center truncate ${
            subView === 'benchmarks'
              ? 'bg-[#004628] text-white'
              : 'text-[#363636] hover:text-[#004628]'
          }`}
        >
          Benchmarks
        </button>
        <button
          type="button"
          onClick={() => setSubView('transactions')}
          className={`min-h-[36px] px-2 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer whitespace-nowrap text-center truncate ${
            subView === 'transactions'
              ? 'bg-[#004628] text-white'
              : 'text-[#363636] hover:text-[#004628]'
          }`}
        >
          Ledger ({context.recentTransactions.length})
        </button>
      </div>

      {/* =====================================================================
          1. S-RYHMÄ DIGITAL E-RECEIPTS (KASSAKUITTI) ITEM SPLITTING
         ===================================================================== */}
      {subView === 'ereceipts' && (
        <div className="space-y-3">
          {/* Bubble 1: Live Split Status & Shifted Euros */}
          <div className="bg-[#EBF7EC] border border-[#99D59F]/80 rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#007841]">
                  <Receipt className="w-3.5 h-3.5 shrink-0" />
                  <span>S-ryhmä Kassakuitti · {context.selectedMonthKey}</span>
                </div>
                <div className="text-base font-bold text-[#004628] mt-0.5">
                  {splitEReceipts ? (
                    <>
                      <span className="font-mono-num">
                        €{splitSummary.reclassifiedNonFoodEur.toFixed(0)}
                      </span>{' '}
                      sorted out of Groceries
                    </>
                  ) : (
                    <>Receipt item split paused</>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={onToggleSplitEReceipts}
                className={`min-h-[32px] px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer shrink-0 ${
                  splitEReceipts
                    ? 'bg-[#004628] text-[#91FA9B]'
                    : 'bg-white border border-[#E6E6E6] text-[#666666]'
                }`}
              >
                Split: {splitEReceipts ? 'ON' : 'OFF'}
              </button>
            </div>

            {Object.keys(splitSummary.byCategoryEur).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(splitSummary.byCategoryEur).map(([catId, eur]) => (
                  <span
                    key={catId}
                    className={`px-2.5 py-1 rounded-2xl rounded-bl-xs text-[11px] font-bold font-mono-num ${
                      splitEReceipts
                        ? 'bg-white text-[#004628] border border-[#99D59F]/60'
                        : 'bg-white/60 text-[#666666] line-through'
                    }`}
                  >
                    {getShortCatLabel(catId)} €{Number(eur || 0).toFixed(0)}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Bubble 2: Interactive Prisma e-Receipt Simulator (e.g. €15 Shirt + Food) */}
          <div className="bg-white border border-[#E6E6E6] rounded-2xl p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-[#004628]">Test a Prisma e-Receipt</h3>
                <p className="text-[11px] text-[#666666]">
                  1 card swipe (MCC 5411) → auto-sorted by item
                </p>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-[#F5F5F5] text-xs font-bold font-mono-num text-[#004628]">
                €{draftTotalEur.toFixed(2)}
              </span>
            </div>

            {/* Quick-Add S-ryhmä Goods */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {QUICK_PRISMA_ITEMS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() =>
                    setDraftItems((prev) => [
                      ...prev,
                      {
                        name: preset.name,
                        department: preset.department,
                        amountEur: preset.amountEur,
                      },
                    ])
                  }
                  className="min-h-[30px] px-2.5 py-1 rounded-full bg-[#F5F5F5] hover:bg-[#EBF7EC] text-[11px] font-bold text-[#004628] cursor-pointer whitespace-nowrap shrink-0"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom Receipt Line Input with Live Auto-Category Preview */}
            <form onSubmit={handleAddCustomItem} className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={customItemName}
                  onChange={(e) => setCustomItemName(e.target.value)}
                  placeholder="Type item (e.g. shirt, paita, shampoo, pan)…"
                  className="flex-1 min-w-0 min-h-[36px] px-3 py-1 rounded-full border border-[#E6E6E6] bg-[#F5F5F5] text-xs text-[#1F1F1F] placeholder:text-[#666666] focus:outline-none focus:bg-white focus:border-[#00AA46]"
                />
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  value={customItemPrice}
                  onChange={(e) => setCustomItemPrice(e.target.value)}
                  aria-label="Item price in euros"
                  className="w-16 min-h-[36px] px-2.5 py-1 rounded-full border border-[#E6E6E6] bg-[#F5F5F5] text-xs font-mono-num font-bold text-[#004628] text-center focus:outline-none focus:bg-white focus:border-[#00AA46]"
                />
                <button
                  type="submit"
                  disabled={!customItemName.trim()}
                  className="min-h-[36px] min-w-[36px] rounded-full bg-[#004628] disabled:opacity-40 text-white flex items-center justify-center cursor-pointer shrink-0"
                  aria-label="Add item to receipt"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {customItemName.trim().length > 0 && (
                <div className="text-[11px] text-[#363636] px-2">
                  Auto-sorts to:{' '}
                  <strong className="text-[#007841]">{liveCustomCatDef.shortLabel}</strong>
                </div>
              )}
            </form>

            {/* Receipt Paper Preview */}
            <div className="bg-[#F5F5F5] rounded-xl p-2.5 space-y-1.5 border border-dashed border-[#CCCCCC]">
              {draftItems.map((it, idx) => {
                const catId = resolveReceiptItemCategory(it);
                const isNonFood = catId !== 'groceries';
                return (
                  <div
                    key={`${it.name}-${idx}`}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0 flex-1 flex items-center gap-1.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                          isNonFood
                            ? 'bg-[#91FA9B] text-[#004628]'
                            : 'bg-white text-[#363636] border border-[#E6E6E6]'
                        }`}
                      >
                        {getShortCatLabel(catId)}
                      </span>
                      <span className="truncate text-[#1F1F1F]">{it.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-mono-num font-bold text-[#004628]">
                        €{it.amountEur.toFixed(2)}
                      </span>
                      {draftItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setDraftItems((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-[#666666] hover:text-[#1F1F1F] cursor-pointer"
                          aria-label="Remove item"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCommitReceipt}
                className="flex-1 min-h-[40px] px-4 py-2 rounded-full bg-[#91FA9B] hover:bg-[#49F37B] active:bg-[#00EB5A] text-[#004628] text-xs font-bold transition-colors cursor-pointer"
              >
                + Log €{draftTotalEur.toFixed(2)} Prisma Receipt
              </button>
              <button
                type="button"
                onClick={() =>
                  onAskCoachBenchmark(
                    'How much non-food spending did S-ryhmä e-receipts split out of my groceries?'
                  )
                }
                className="min-h-[40px] px-3.5 py-2 rounded-full bg-[#EBF7EC] hover:bg-[#D2FCD5] text-[#004628] text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
              >
                Ask S-buddy →
              </button>
            </div>

            {justLoggedBanner && (
              <div className="px-3 py-2 rounded-xl bg-[#EBF7EC] border border-[#00AA46]/40 flex items-center justify-between gap-2 text-xs">
                <span className="font-bold text-[#004628] inline-flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-[#007841]" />
                  {justLoggedBanner}
                </span>
                {onJumpToSheet && (
                  <button
                    type="button"
                    onClick={onJumpToSheet}
                    className="font-bold text-[#007841] underline cursor-pointer shrink-0"
                  >
                    See Sheet →
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Bubble 3: Recent S-ryhmä Digital Receipts in Selected Month */}
          <div className="bg-white border border-[#E6E6E6] rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-[#004628]">
                {context.selectedMonthKey} Prisma Receipts ({monthEReceiptTxs.length})
              </h3>
              <span className="text-[11px] text-[#666666]">Tap to inspect items</span>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {monthEReceiptTxs.map((tx, idx) => {
                const isOpen = expandedReceiptIdx === idx;
                const nonFoodCount =
                  tx.eReceiptItems?.filter((i) => resolveReceiptItemCategory(i) !== 'groceries')
                    .length || 0;

                return (
                  <div
                    key={`${tx.tx_timestamp}-${idx}`}
                    className="bg-[#F5F5F5] rounded-xl overflow-hidden border border-[#E6E6E6]"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedReceiptIdx(isOpen ? null : idx)}
                      className="w-full px-3 py-2.5 flex items-center justify-between gap-2 text-left cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-[#004628] truncate flex items-center gap-1.5">
                          <span>{tx.storeChain || 'Prisma'}</span>
                          {nonFoodCount > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-[#91FA9B] text-[#004628] text-[10px] font-bold">
                              +{nonFoodCount} non-food
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#666666]">{tx.tx_date} · MCC 5411</div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs font-bold font-mono-num text-[#1F1F1F]">
                          €{Math.abs(tx.tx_amount_eur).toFixed(2)}
                        </span>
                        {isOpen ? (
                          <ChevronUp className="w-3.5 h-3.5 text-[#666666]" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-[#666666]" />
                        )}
                      </div>
                    </button>

                    {isOpen && tx.eReceiptItems && (
                      <div className="px-3 pb-2.5 pt-1 border-t border-[#E6E6E6] bg-white space-y-1.5">
                        {tx.eReceiptItems.map((item, iIdx) => {
                          const cId = resolveReceiptItemCategory(item);
                          const nonFood = cId !== 'groceries';
                          return (
                            <div
                              key={iIdx}
                              className="flex items-center justify-between gap-2 text-[11px]"
                            >
                              <div className="min-w-0 flex items-center gap-1.5">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                                    nonFood
                                      ? 'bg-[#EBF7EC] text-[#007841]'
                                      : 'bg-[#F5F5F5] text-[#666666]'
                                  }`}
                                >
                                  {getShortCatLabel(cId)}
                                </span>
                                <span className="truncate text-[#1F1F1F]">{item.name}</span>
                              </div>
                              <span className="font-mono-num font-bold text-[#004628] shrink-0">
                                €{Math.abs(item.amountEur).toFixed(2)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {monthEReceiptTxs.length === 0 && (
                <p className="text-xs text-[#666666] py-3 text-center">
                  No hypermarket e-receipts in {context.selectedMonthKey}. Log one above!
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          2. STATISTICS FINLAND COHORT BENCHMARKS
         ===================================================================== */}
      {subView === 'benchmarks' && (
        <div className="bg-white border border-[#E6E6E6] rounded-2xl p-4 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E6E6E6] pb-3">
            <div className="space-y-1">
              <div className="text-xs font-bold text-[#004628]">
                {String(benchmarkResult.benchmarkCohort)}
              </div>
              <div className="flex items-center gap-3 text-[11px] text-[#666666]">
                <span className="inline-flex items-center gap-1.5 font-bold text-[#004628]">
                  <span className="w-2.5 h-2 rounded-full bg-[#00AA46]" />
                  You
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2 rounded-full bg-[#004628]/30" />
                  StatFin peer
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                onAskCoachBenchmark(
                  'How does my monthly spending compare with Statistics Finland benchmarks for my age and postal area?'
                )
              }
              className="min-h-[36px] px-3.5 py-1.5 rounded-full bg-[#91FA9B] hover:bg-[#49F37B] active:bg-[#00EB5A] text-[#004628] text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
            >
              Ask S-buddy →
            </button>
          </div>

          <div className="space-y-2.5">
            {comparisons.map((item) => {
              const userAvg = Number(item.userMonthlyAvgEur || 0);
              const peerMed = Number(item.statFinPeerMedianEur || 0);
              const diff = Number(item.differenceEur || 0);
              const maxScale = Math.max(userAvg, peerMed, 1) * 1.15;

              return (
                <div
                  key={String(item.categoryId)}
                  className="bg-[#F5F5F5] rounded-2xl p-3 space-y-1.5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-xs">
                    <span className="font-bold text-[#004628]">{String(item.categoryLabel)}</span>
                    <span className="font-mono-num text-[#363636]">
                      <strong className="text-[#004628]">€{Math.round(userAvg)}</strong> vs €
                      {Math.round(peerMed)} (
                      {diff >= 0 ? `+€${Math.round(diff)}` : `−€${Math.round(Math.abs(diff))}`})
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="w-full h-2 bg-white rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#00AA46] rounded-full"
                        style={{ width: `${Math.min(100, (userAvg / maxScale) * 100)}%` }}
                      />
                    </div>
                    <div className="w-full h-1.5 bg-white rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#004628]/30 rounded-full"
                        style={{ width: `${Math.min(100, (peerMed / maxScale) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =====================================================================
          3. RAW TRANSACTION LEDGER + WORTH-IT / SKIP-NEXT TAGS
         ===================================================================== */}
      {subView === 'transactions' && (
        <div className="bg-white border border-[#E6E6E6] rounded-2xl p-3.5 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#666666] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={txSearch}
              onChange={(e) => setTxSearch(e.target.value)}
              placeholder="Search merchant, shirt, MCC (4121), date…"
              aria-label="Search raw transactions"
              className="w-full min-h-[40px] pl-9 pr-3.5 py-1.5 rounded-full border border-[#E6E6E6] bg-[#F5F5F5] text-xs text-[#1F1F1F] placeholder:text-[#666666] focus:outline-none focus:bg-white focus:border-[#00AA46]"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setBasketFilter('all')}
              className={`min-h-[32px] px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                basketFilter === 'all'
                  ? 'bg-[#004628] text-white'
                  : 'bg-[#F5F5F5] text-[#363636] hover:text-[#004628]'
              }`}
            >
              All
            </button>
            {BASKETS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBasketFilter(b.id)}
                className={`min-h-[32px] px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  basketFilter === b.id
                    ? 'bg-[#004628] text-white'
                    : 'bg-[#F5F5F5] text-[#363636] hover:text-[#004628]'
                }`}
              >
                {b.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setBasketFilter('worth_it')}
              className={`min-h-[32px] px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                basketFilter === 'worth_it'
                  ? 'bg-[#004628] text-white'
                  : 'bg-[#EBF7EC] text-[#004628]'
              }`}
            >
              Worth it
            </button>
            <button
              type="button"
              onClick={() => setBasketFilter('skip_next')}
              className={`min-h-[32px] px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                basketFilter === 'skip_next'
                  ? 'bg-[#004628] text-white'
                  : 'bg-[#EBF7EC] text-[#004628]'
              }`}
            >
              Skip next
            </button>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredTransactions.slice(0, 80).map((tx, idx) => {
              const isPositive = tx.tx_amount_eur > 0;
              const txKey = getTxSentimentKey(tx);
              const sentiment = txSentiments[txKey];
              const hasEReceipt = Boolean(tx.eReceiptItems && tx.eReceiptItems.length > 0);

              return (
                <div
                  key={`${tx.tx_timestamp}-${idx}`}
                  className="px-3 py-2.5 bg-[#F5F5F5] rounded-2xl flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[#004628] truncate flex items-center gap-1.5">
                      {hasEReceipt && (
                        <span className="px-1.5 py-0.5 rounded-full bg-[#91FA9B] text-[#004628] text-[10px] font-bold shrink-0">
                          e-Receipt
                        </span>
                      )}
                      <span className="truncate">{tx.merchant_label || tx.merchant_id}</span>
                    </div>
                    <div className="text-[11px] text-[#666666] truncate">
                      {tx.tx_date} · {tx.category} · MCC {tx.mcc_code || '—'}
                    </div>
                  </div>

                  {!isPositive && onRateTransaction && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onRateTransaction(txKey, 'worth_it')}
                        title="Tag Worth It"
                        aria-label="Tag Worth It"
                        className={`min-h-[30px] min-w-[30px] rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                          sentiment === 'worth_it'
                            ? 'bg-[#91FA9B] text-[#004628]'
                            : 'bg-white text-[#666666] hover:text-[#004628]'
                        }`}
                      >
                        <Smile className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRateTransaction(txKey, 'skip_next')}
                        title="Tag Skip Next Time"
                        aria-label="Tag Skip Next Time"
                        className={`min-h-[30px] min-w-[30px] rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                          sentiment === 'skip_next'
                            ? 'bg-[#004628] text-white'
                            : 'bg-white text-[#666666] hover:text-[#004628]'
                        }`}
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <div
                    className={`font-mono-num font-bold shrink-0 ${
                      isPositive ? 'text-[#007841]' : 'text-[#1F1F1F]'
                    }`}
                  >
                    {isPositive ? '+' : '−'}€{Math.abs(tx.tx_amount_eur).toFixed(2)}
                  </div>
                </div>
              );
            })}
            {filteredTransactions.length === 0 && (
              <p className="py-6 text-center text-xs text-[#666666]">No matching transactions.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
