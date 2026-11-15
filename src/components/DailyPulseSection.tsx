import React, { useMemo, useState } from 'react';
import { Plus, Undo2, Check, Flame } from 'lucide-react';
import { CATEGORIES, mapRawTransactionToCategory } from '../shared/syntheticData.ts';
import {
  computeMonthSummary,
  roundEur,
  toolCalculateSafeToSpendAndSave,
} from '../shared/calculations.ts';
import {
  DAY_INITIALS,
  WEEKLY_QUEST_TEMPLATES,
  calculateQuestStats,
} from '../shared/interactiveStore.ts';
import type {
  CustomerInteractiveState,
  TrackerCategoryId,
  TrackerDatasetContext,
} from '../shared/types.ts';

interface DailyPulseSectionProps {
  context: TrackerDatasetContext;
  interactiveState: CustomerInteractiveState;
  onLogPurchase: (params: {
    label: string;
    amountEur: number;
    categoryId: TrackerCategoryId;
  }) => void;
  onRemoveLoggedPurchase: (loggedId: string) => void;
  onToggleQuestDay: (questId: string, dayIdx: number) => void;
  onAskSbuddy: (question: string) => void;
}

const QUICK_BUY_PRESETS: Array<{
  label: string;
  amountEur: number;
  categoryId: TrackerCategoryId;
}> = [
  { label: 'Coffee €6', amountEur: 6, categoryId: 'restaurants_cafes' },
  { label: 'Lunch €15', amountEur: 15, categoryId: 'restaurants_cafes' },
  { label: 'Taxi €26', amountEur: 26, categoryId: 'travel_taxis' },
  { label: 'Groceries €48', amountEur: 48, categoryId: 'groceries' },
  { label: 'Jacket €85', amountEur: 85, categoryId: 'clothing_appearance' },
];

export const DailyPulseSection: React.FC<DailyPulseSectionProps> = ({
  context,
  interactiveState,
  onLogPurchase,
  onRemoveLoggedPurchase,
  onToggleQuestDay,
  onAskSbuddy,
}) => {
  const [checkAmountInput, setCheckAmountInput] = useState<string>('26');
  const [checkLabelInput, setCheckLabelInput] = useState<string>('Evening Taxi');
  const [checkCategoryId, setCheckCategoryId] = useState<TrackerCategoryId>('travel_taxis');

  const activeMonth =
    context.months.find((m) => m.monthKey === context.selectedMonthKey) || context.months[0];
  const monthSummary = computeMonthSummary(activeMonth);
  const safeGuidance = toolCalculateSafeToSpendAndSave(context, { month: activeMonth.monthKey });

  const safeWeeklyBudget = Math.max(40, roundEur(Number(safeGuidance.safeToSpendWeeklyEur || 160)));

  const currentWeekSpentEur = useMemo(() => {
    const monthTxs = context.recentTransactions.filter(
      (tx) => tx.tx_amount_eur < 0 && tx.tx_date.startsWith(activeMonth.monthKey)
    );
    const dates = Array.from(new Set(monthTxs.map((t) => t.tx_date))).sort();
    const latestDate = dates[dates.length - 1] || `${activeMonth.monthKey}-28`;
    const latestDayNum = Number(latestDate.slice(8, 10)) || 28;
    const minDayNum = Math.max(1, latestDayNum - 6);

    let sum = 0;
    for (const tx of monthTxs) {
      const dNum = Number(tx.tx_date.slice(8, 10)) || 1;
      if (dNum < minDayNum && !tx.userLoggedId) continue;
      const catId = mapRawTransactionToCategory(tx.category, tx.mcc_code, tx.merchant_label);
      const catDef = CATEGORIES.find((c) => c.id === catId);
      if (catDef?.basket === 'everyday_choices' || tx.userLoggedId) {
        sum += Math.abs(tx.tx_amount_eur);
      }
    }
    return roundEur(sum);
  }, [context.recentTransactions, activeMonth.monthKey]);

  const parsedCheckAmt = Math.max(0, Number(checkAmountInput.replace(',', '.')) || 0);
  const remainingBeforeBuy = roundEur(safeWeeklyBudget - currentWeekSpentEur);
  const remainingAfterBuy = roundEur(remainingBeforeBuy - parsedCheckAmt);
  const dailyPaceLeft = roundEur(Math.max(0, remainingAfterBuy) / 3);

  const prevSavingsRate = monthSummary.savingsRatePercent ?? 0;
  const newSavingsRate =
    monthSummary.incomeEur > 0
      ? roundEur(
          ((monthSummary.remainingAfterSpendingEur - parsedCheckAmt) / monthSummary.incomeEur) * 100
        )
      : 0;

  const questStats = useMemo(
    () => calculateQuestStats(interactiveState),
    [interactiveState]
  );

  const handleSelectPreset = (preset: (typeof QUICK_BUY_PRESETS)[number]) => {
    setCheckAmountInput(String(preset.amountEur));
    setCheckLabelInput(preset.label.replace(/\s*€\d+$/, ''));
    setCheckCategoryId(preset.categoryId);
  };

  const handleLogClick = () => {
    if (parsedCheckAmt <= 0) return;
    onLogPurchase({
      label: checkLabelInput.trim() || 'Logged purchase',
      amountEur: parsedCheckAmt,
      categoryId: checkCategoryId,
    });
  };

  const weekProgressPct = Math.min(
    100,
    Math.max(4, Math.round((currentWeekSpentEur / Math.max(1, safeWeeklyBudget)) * 100))
  );

  return (
    <section id="daily-pulse" className="space-y-4">
      {/* 2 Crisp Front-Page Status Bubbles */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-[#EBF7EC] border border-[#99D59F]/60 rounded-2xl rounded-bl-xs p-3.5 min-w-0">
          <div className="text-[11px] text-[#363636] truncate">Left This Week</div>
          <div
            className={`text-xl font-bold font-mono-num mt-0.5 truncate ${
              remainingBeforeBuy >= 0 ? 'text-[#007841]' : 'text-[#B70000]'
            }`}
          >
            {remainingBeforeBuy >= 0
              ? `€${Math.round(remainingBeforeBuy)}`
              : `−€${Math.round(Math.abs(remainingBeforeBuy))}`}
          </div>
          <div className="text-[11px] text-[#363636] font-mono-num truncate">
            of ~€{Math.round(safeWeeklyBudget)}/wk pace
          </div>
        </div>

        <div className="bg-white border border-[#E6E6E6] rounded-2xl rounded-bl-xs p-3.5 min-w-0">
          <div className="text-[11px] text-[#666666] flex items-center gap-1 truncate">
            <Flame className="w-3.5 h-3.5 text-[#00AA46] shrink-0" />
            <span>7-Day Streak</span>
          </div>
          <div className="text-xl font-bold font-mono-num text-[#007841] mt-0.5 truncate">
            +€{questStats.weeklySavingsEur}
          </div>
          <div className="text-[11px] text-[#666666] truncate">
            {questStats.daysCompleted} check-ins done
          </div>
        </div>
      </div>

      {/* ===================================================================
          1. CAN I BUY THIS TODAY? + LIVE SPEND LOGGER
         =================================================================== */}
      <div className="bg-white border border-[#E6E6E6] rounded-2xl p-4 space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-[#004628]">Can I Buy This Today?</h2>
            <p className="text-xs text-[#666666]">Tap an item to test or log it</p>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-[#EBF7EC] text-xs font-bold font-mono-num text-[#004628] shrink-0">
            {weekProgressPct}% used
          </span>
        </div>

        {/* Weekly Safe-to-Spend Bar */}
        <div className="space-y-1">
          <div className="w-full h-2.5 bg-[#F5F5F5] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-opacity duration-150 ${
                remainingBeforeBuy >= 0 ? 'bg-[#00AA46]' : 'bg-[#B70000]'
              }`}
              style={{ width: `${weekProgressPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono-num text-[#666666]">
            <span>Spent €{Math.round(currentWeekSpentEur)} (7d)</span>
            <span>Safe ~€{Math.round(safeWeeklyBudget)}/wk</span>
          </div>
        </div>

        {/* Tap Presets */}
        <div className="flex flex-wrap gap-1.5">
          {QUICK_BUY_PRESETS.map((preset) => {
            const active = Math.round(parsedCheckAmt) === preset.amountEur;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className={`min-h-[38px] px-3 py-1 rounded-2xl rounded-bl-xs text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[#004628] text-white'
                    : 'bg-[#F5F5F5] text-[#1F1F1F] hover:bg-[#EBF7EC]'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* Compact Mobile Inputs */}
        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-4 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#004628]">
              €
            </span>
            <input
              type="number"
              min="1"
              value={checkAmountInput}
              onChange={(e) => setCheckAmountInput(e.target.value)}
              aria-label="Purchase amount in euros"
              className="w-full min-h-[42px] pl-6 pr-2 py-2 rounded-xl border border-[#E6E6E6] bg-[#F5F5F5] text-sm font-bold font-mono-num text-[#004628] focus:outline-none focus:bg-white focus:border-[#00AA46]"
            />
          </div>
          <input
            type="text"
            value={checkLabelInput}
            onChange={(e) => setCheckLabelInput(e.target.value)}
            placeholder="Item…"
            aria-label="Purchase description"
            className="col-span-8 min-h-[42px] px-3 py-2 rounded-xl border border-[#E6E6E6] bg-[#F5F5F5] text-xs font-bold text-[#1F1F1F] focus:outline-none focus:bg-white focus:border-[#00AA46]"
          />
          <select
            value={checkCategoryId}
            onChange={(e) => setCheckCategoryId(e.target.value as TrackerCategoryId)}
            aria-label="Purchase category"
            className="col-span-12 min-h-[40px] px-3 py-1.5 rounded-xl border border-[#E6E6E6] bg-[#F5F5F5] text-xs font-bold text-[#004628] focus:outline-none focus:border-[#00AA46]"
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.shortLabel}
              </option>
            ))}
          </select>
        </div>

        {/* Instant Result Bubbles */}
        <div className="grid grid-cols-2 gap-2.5">
          <div
            className={`rounded-2xl rounded-bl-xs p-3 border ${
              remainingAfterBuy >= 0
                ? 'bg-[#EBF7EC] border-[#99D59F]/60'
                : 'bg-[#F5F5F5] border-[#B70000]/40'
            }`}
          >
            <div className="text-[11px] text-[#363636]">
              {remainingAfterBuy >= 0 ? 'Fits weekly pace' : 'Over weekly pace'}
            </div>
            <div
              className={`text-base font-bold font-mono-num mt-0.5 ${
                remainingAfterBuy >= 0 ? 'text-[#007841]' : 'text-[#B70000]'
              }`}
            >
              {remainingAfterBuy >= 0
                ? `€${Math.round(remainingAfterBuy)} left`
                : `−€${Math.round(Math.abs(remainingAfterBuy))} over`}
            </div>
            <div className="text-[11px] text-[#666666] font-mono-num">
              ~€{Math.round(dailyPaceLeft)}/day after
            </div>
          </div>

          <div className="rounded-2xl rounded-bl-xs p-3 bg-[#F5F5F5] border border-[#E6E6E6]">
            <div className="text-[11px] text-[#666666]">Savings Rate</div>
            <div className="text-base font-bold font-mono-num text-[#004628] mt-0.5">
              {prevSavingsRate.toFixed(0)}% → {newSavingsRate.toFixed(0)}%
            </div>
            <div className="text-[11px] text-[#666666]">{activeMonth.monthShort} est.</div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <button
            type="button"
            onClick={handleLogClick}
            className="flex-1 min-h-[44px] px-4 py-2 rounded-full bg-[#91FA9B] hover:bg-[#49F37B] active:bg-[#00EB5A] text-[#004628] text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Log €{Math.round(parsedCheckAmt)}</span>
          </button>

          <button
            type="button"
            onClick={() =>
              onAskSbuddy(
                `Can I comfortably spend €${Math.round(parsedCheckAmt)} on ${checkLabelInput || 'this purchase'} this week?`
              )
            }
            className="min-h-[44px] px-4 py-2 rounded-full border border-[#007841] bg-white hover:bg-[#EBF7EC] text-xs font-bold text-[#007841] cursor-pointer transition-colors whitespace-nowrap"
          >
            Ask S-buddy →
          </button>
        </div>

        {interactiveState.loggedTransactions.length > 0 && (
          <div className="pt-2 border-t border-[#E6E6E6] space-y-1.5">
            <div className="text-[11px] font-bold text-[#004628]">Logged today</div>
            {interactiveState.loggedTransactions.slice(0, 3).map((tx) => (
              <div
                key={tx.userLoggedId}
                className="px-3 py-1.5 rounded-xl bg-[#F5F5F5] flex items-center justify-between gap-2 text-xs"
              >
                <span className="font-bold text-[#004628] truncate">
                  {tx.merchant_label} · €{Math.abs(tx.tx_amount_eur).toFixed(0)}
                </span>
                <button
                  type="button"
                  onClick={() => tx.userLoggedId && onRemoveLoggedPurchase(tx.userLoggedId)}
                  className="min-h-[30px] px-2.5 py-0.5 rounded-full bg-white border border-[#E6E6E6] text-[11px] font-bold text-[#363636] hover:text-[#B70000] inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Undo2 className="w-3 h-3" />
                  <span>Undo</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===================================================================
          2. 7-DAY STREAK (TAP DAY BUBBLES)
         =================================================================== */}
      <div className="bg-white border border-[#E6E6E6] rounded-2xl p-4 space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-[#004628] flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-[#00AA46]" />
              <span>7-Day Streak</span>
            </h2>
            <p className="text-xs text-[#666666]">Tap days completed</p>
          </div>
          <span className="px-3 py-1 rounded-full bg-[#91FA9B] text-xs font-bold font-mono-num text-[#004628] shrink-0">
            +€{questStats.weeklySavingsEur} this wk
          </span>
        </div>

        <div className="space-y-2.5">
          {WEEKLY_QUEST_TEMPLATES.map((tpl) => {
            const progress = interactiveState.quests[tpl.id]?.daysCompleted || [
              false,
              false,
              false,
              false,
              false,
              false,
              false,
            ];
            const count = progress.filter(Boolean).length;

            return (
              <div
                key={tpl.id}
                className="bg-[#F5F5F5] border border-[#E6E6E6] rounded-2xl p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-[#004628] truncate">{tpl.title}</span>
                  <span className="font-mono-num font-bold text-[#007841] shrink-0">
                    +€{count * tpl.eurPerDay}
                  </span>
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                  {DAY_INITIALS.map((dayLetter, dIdx) => {
                    const done = Boolean(progress[dIdx]);
                    return (
                      <button
                        key={`${tpl.id}-${dIdx}`}
                        type="button"
                        onClick={() => onToggleQuestDay(tpl.id, dIdx)}
                        aria-pressed={done}
                        aria-label={`${tpl.title} day ${dIdx + 1}`}
                        className={`min-h-[40px] rounded-xl text-xs font-bold flex flex-col items-center justify-center transition-colors cursor-pointer ${
                          done
                            ? 'bg-[#004628] text-[#91FA9B]'
                            : 'bg-white border border-[#E6E6E6] text-[#363636] hover:border-[#00AA46]'
                        }`}
                      >
                        <span>{dayLetter}</span>
                        {done && <Check className="w-3 h-3 mt-0.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
