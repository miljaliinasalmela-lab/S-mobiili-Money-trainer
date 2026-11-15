import React, { useMemo, useState } from 'react';
import { Home, Wrench, Coffee, Check, Sparkles, ShieldCheck } from 'lucide-react';
import { BASKETS, CATEGORIES } from '../shared/syntheticData.ts';
import {
  computeMonthSummary,
  getEffectiveCategoryAmount,
  roundEur,
  toolCalculateSafeToSpendAndSave,
} from '../shared/calculations.ts';
import { WhatIfExplorer } from './WhatIfExplorer.tsx';
import type { BasketId, TrackerCategoryId, TrackerDatasetContext } from '../shared/types.ts';

interface BasketsPedagogySectionProps {
  context: TrackerDatasetContext;
  oopsJarSavedEur: number;
  oopsJarTargetEur: number;
  onAdjustOopsJar: (deltaEur: number, resetToZero?: boolean) => void;
  onApplyToSelectedMonth: (categoryId: TrackerCategoryId, newAmountEur: number) => void;
  onAskSbuddy: (question: string) => void;
}

const SURPRISE_CURVEBALLS: Array<{ id: string; label: string; costEur: number }> = [
  { id: 'dentist', label: 'Dentist €165', costEur: 165 },
  { id: 'tyres', label: 'Tyres €320', costEur: 320 },
  { id: 'washer', label: 'Washer €380', costEur: 380 },
];

const BASKET_QUIZ_ITEMS: Array<{
  item: string;
  answer: BasketId;
  winHint: string;
}> = [
  {
    item: 'Broken washer · €380',
    answer: 'irregular_essentials',
    winHint: 'Must & Oops! Smooth it monthly.',
  },
  {
    item: 'Friday oat latte · €5.40',
    answer: 'everyday_choices',
    winHint: 'Wants & Whims! Pure daily treat.',
  },
  {
    item: 'Monthly rent · €890',
    answer: 'regular_essentials',
    winHint: 'Must & Usual! Fixed on autopilot.',
  },
  {
    item: 'Winter tyres · €320',
    answer: 'irregular_essentials',
    winHint: 'Must & Oops! Predictable plot twist.',
  },
  {
    item: 'Late-night taxi · €26',
    answer: 'everyday_choices',
    winHint: 'Wants & Whims! Easy to tweak.',
  },
];

const BASKET_ICONS: Record<BasketId, React.ComponentType<{ className?: string }>> = {
  regular_essentials: Home,
  irregular_essentials: Wrench,
  everyday_choices: Coffee,
};

const BASKET_SHORT_TAGS: Record<BasketId, string> = {
  regular_essentials: 'Autopilot',
  irregular_essentials: 'Plot twists',
  everyday_choices: 'Daily fun',
};

export const BasketsPedagogySection: React.FC<BasketsPedagogySectionProps> = ({
  context,
  oopsJarSavedEur,
  oopsJarTargetEur,
  onAdjustOopsJar,
  onApplyToSelectedMonth,
  onAskSbuddy,
}) => {
  const [subMode, setSubMode] = useState<'baskets' | 'what-if'>('baskets');
  const [selectedBasket, setSelectedBasket] = useState<BasketId>('everyday_choices');
  const [selectedCurveballId, setSelectedCurveballId] = useState<string>('washer');
  const [checkedContracts, setCheckedContracts] = useState<Record<string, boolean>>({
    elec: true,
    phone: false,
    ins: false,
  });

  const [quizIdx, setQuizIdx] = useState<number>(0);
  const [pickedQuizBasket, setPickedQuizBasket] = useState<BasketId | null>(null);
  const [quizScore, setQuizScore] = useState<number>(0);

  const activeMonth =
    context.months.find((m) => m.monthKey === context.selectedMonthKey) || context.months[0];
  const summary = computeMonthSummary(activeMonth);
  const safeGuidance = toolCalculateSafeToSpendAndSave(context, { month: activeMonth.monthKey });

  const safeWeekly = Number(safeGuidance.safeToSpendWeeklyEur || 0);
  const irregularBufferMonthly = Number(safeGuidance.irregularEssentialsMonthlyBufferEur || 0);

  const basketCategories = useMemo(() => {
    return CATEGORIES.filter((c) => c.basket === selectedBasket)
      .map((c) => ({
        id: c.id,
        label: c.shortLabel,
        amount: roundEur(getEffectiveCategoryAmount(activeMonth, c.id)),
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [activeMonth, selectedBasket]);

  const activeCurveball =
    SURPRISE_CURVEBALLS.find((c) => c.id === selectedCurveballId) || SURPRISE_CURVEBALLS[2];
  const jarCoveredEur = Math.min(oopsJarSavedEur, activeCurveball.costEur);
  const cashflowHitEur = Math.max(0, activeCurveball.costEur - jarCoveredEur);
  const jarProgressPct = Math.min(
    100,
    Math.max(4, Math.round((oopsJarSavedEur / Math.max(1, oopsJarTargetEur)) * 100))
  );

  const checkedCount = Object.values(checkedContracts).filter(Boolean).length;

  const currentQuiz = BASKET_QUIZ_ITEMS[quizIdx % BASKET_QUIZ_ITEMS.length];
  const isQuizCorrect = pickedQuizBasket === currentQuiz.answer;

  const handlePickQuiz = (guess: BasketId) => {
    if (pickedQuizBasket !== null) return;
    setPickedQuizBasket(guess);
    if (guess === currentQuiz.answer) {
      setQuizScore((s) => s + 1);
    }
  };

  const handleNextQuiz = () => {
    setPickedQuizBasket(null);
    setQuizIdx((i) => (i + 1) % BASKET_QUIZ_ITEMS.length);
  };

  const shareReg = summary.basketSharesOfSpendingPercent.regular_essentials;
  const shareIrr = summary.basketSharesOfSpendingPercent.irregular_essentials;
  const shareWhim = summary.basketSharesOfSpendingPercent.everyday_choices;

  return (
    <section id="baskets" className="space-y-4">
      {/* Sub-mode Pill Switcher */}
      <div className="grid grid-cols-2 p-1 bg-white rounded-full border border-[#E6E6E6]">
        <button
          type="button"
          onClick={() => setSubMode('baskets')}
          className={`min-h-[38px] px-3 py-1.5 rounded-full text-xs font-bold transition-colors cursor-pointer ${
            subMode === 'baskets'
              ? 'bg-[#004628] text-white'
              : 'text-[#363636] hover:text-[#004628]'
          }`}
        >
          3 Baskets
        </button>
        <button
          type="button"
          onClick={() => setSubMode('what-if')}
          className={`min-h-[38px] px-3 py-1.5 rounded-full text-xs font-bold transition-colors cursor-pointer ${
            subMode === 'what-if'
              ? 'bg-[#004628] text-white'
              : 'text-[#363636] hover:text-[#004628]'
          }`}
        >
          What-If Slider
        </button>
      </div>

      {subMode === 'what-if' ? (
        <WhatIfExplorer
          context={context}
          onApplyToSelectedMonth={onApplyToSelectedMonth}
          onAskSbuddyScenario={onAskSbuddy}
        />
      ) : (
        <>
          {/* Visual Split Bar + 3 Tappable Basket Tiles */}
          <div className="bg-white border border-[#E6E6E6] rounded-2xl p-3.5 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-[#004628]">
                {activeMonth.monthShort} Split · Tap a basket
              </span>
              <span className="font-mono-num font-bold text-[#007841]">
                €{Math.round(summary.totalSpendingEur).toLocaleString('en-IE')}
              </span>
            </div>

            {/* Stacked Visual Split Bar */}
            <div className="w-full h-3 rounded-full overflow-hidden flex gap-0.5 bg-[#F5F5F5]">
              <div
                className="h-full bg-[#004628]"
                style={{ width: `${Math.max(5, shareReg)}%` }}
                title="Must & Usual"
              />
              <div
                className="h-full bg-[#007841]"
                style={{ width: `${Math.max(5, shareIrr)}%` }}
                title="Must & Oops!"
              />
              <div
                className="h-full bg-[#00AA46]"
                style={{ width: `${Math.max(5, shareWhim)}%` }}
                title="Wants & Whims"
              />
            </div>

            {/* 3 Tappable Quirky Basket Cards */}
            <div className="grid grid-cols-3 gap-2">
              {BASKETS.map((basket) => {
                const Icon = BASKET_ICONS[basket.id];
                const isSelected = selectedBasket === basket.id;
                const val = summary.baskets[basket.id];
                const pct = summary.basketSharesOfSpendingPercent[basket.id];

                return (
                  <button
                    key={basket.id}
                    type="button"
                    onClick={() => setSelectedBasket(basket.id)}
                    className={`p-2.5 rounded-2xl text-left transition-colors cursor-pointer border flex flex-col justify-between min-h-[108px] ${
                      isSelected
                        ? 'bg-[#004628] text-white border-[#004628]'
                        : 'bg-[#F5F5F5] text-[#1F1F1F] border-[#E6E6E6] hover:bg-[#EBF7EC]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          isSelected
                            ? 'bg-[#91FA9B] text-[#004628]'
                            : 'bg-white text-[#004628]'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <span
                        className={`text-[10px] font-mono-num font-bold ${
                          isSelected ? 'text-[#91FA9B]' : 'text-[#007841]'
                        }`}
                      >
                        {pct.toFixed(0)}%
                      </span>
                    </div>

                    <div className="mt-2">
                      <div className="text-[11px] font-bold leading-tight truncate">
                        {basket.label}
                      </div>
                      <div className="text-sm font-bold font-mono-num mt-0.5">
                        €{Math.round(val)}
                      </div>
                      <div
                        className={`text-[10px] truncate ${
                          isSelected ? 'text-white/75' : 'text-[#666666]'
                        }`}
                      >
                        {BASKET_SHORT_TAGS[basket.id]}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interactive Playground for the Selected Basket */}
          {selectedBasket === 'everyday_choices' && (
            <div className="bg-[#EBF7EC] border border-[#99D59F]/60 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="px-3 py-1 rounded-2xl rounded-bl-xs bg-white border border-[#99D59F]/60 text-xs font-bold text-[#004628]">
                  Wants &amp; Whims · ~€{Math.round(safeWeekly)}/wk safe
                </span>
                <button
                  type="button"
                  onClick={() => setSubMode('what-if')}
                  className="min-h-[34px] px-3 py-1 rounded-full bg-[#91FA9B] hover:bg-[#49F37B] text-xs font-bold text-[#004628] cursor-pointer whitespace-nowrap"
                >
                  Slider →
                </button>
              </div>

              <div className="space-y-2">
                {basketCategories.slice(0, 4).map((cat) => {
                  const maxVal = Math.max(basketCategories[0]?.amount || 1, 1);
                  return (
                    <div
                      key={cat.id}
                      className="bg-white rounded-xl px-3 py-2 space-y-1 border border-[#99D59F]/40"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-[#004628]">{cat.label}</span>
                        <span className="font-mono-num font-bold text-[#1F1F1F]">
                          €{Math.round(cat.amount)}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-[#F5F5F5] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#00AA46] rounded-full"
                          style={{ width: `${Math.min(100, (cat.amount / maxVal) * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() =>
                  onAskSbuddy(
                    `Show me my fun Wants & Whims habits in ${activeMonth.monthLabel}!`
                  )
                }
                className="w-full min-h-[40px] px-4 py-2 rounded-full bg-white border border-[#007841] text-xs font-bold text-[#007841] hover:bg-[#D2FCD5]/40 cursor-pointer"
              >
                Ask S-buddy about Wants &amp; Whims →
              </button>
            </div>
          )}

          {selectedBasket === 'irregular_essentials' && (
            <div className="bg-[#EBF7EC] border border-[#99D59F]/60 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="px-3 py-1 rounded-2xl rounded-bl-xs bg-white border border-[#99D59F]/60 text-xs font-bold text-[#004628]">
                  Oops! Jar · €{Math.round(irregularBufferMonthly)}/mo avg
                </span>
                <span className="font-mono-num text-xs font-bold text-[#004628]">
                  €{Math.round(oopsJarSavedEur)} / €{Math.round(oopsJarTargetEur)}
                </span>
              </div>

              <div className="w-full h-2.5 bg-white rounded-full overflow-hidden border border-[#99D59F]/50">
                <div
                  className="h-full bg-[#00AA46] rounded-full"
                  style={{ width: `${jarProgressPct}%` }}
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[10, 25, 50].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => onAdjustOopsJar(amt)}
                    className="min-h-[36px] px-3.5 py-1 rounded-full bg-[#91FA9B] hover:bg-[#49F37B] text-xs font-bold text-[#004628] cursor-pointer"
                  >
                    +€{amt}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => onAdjustOopsJar(0, true)}
                  className="min-h-[36px] px-3 py-1 rounded-full bg-white border border-[#99D59F]/60 text-xs font-bold text-[#363636] cursor-pointer"
                >
                  Reset
                </button>
              </div>

              <div className="bg-white rounded-2xl p-3 space-y-2 border border-[#99D59F]/40">
                <div className="text-xs font-bold text-[#004628] flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#007841]" />
                  <span>Spin a surprise bill:</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SURPRISE_CURVEBALLS.map((cb) => (
                    <button
                      key={cb.id}
                      type="button"
                      onClick={() => setSelectedCurveballId(cb.id)}
                      className={`min-h-[34px] px-3 py-1 rounded-full text-xs font-bold cursor-pointer ${
                        cb.id === activeCurveball.id
                          ? 'bg-[#004628] text-white'
                          : 'bg-[#F5F5F5] text-[#363636]'
                      }`}
                    >
                      {cb.label}
                    </button>
                  ))}
                </div>
                <div className="text-xs font-bold text-[#007841] bg-[#EBF7EC] rounded-xl px-3 py-2">
                  {cashflowHitEur === 0
                    ? '100% shielded by your Oops! Jar!'
                    : `Jar shields €${Math.round(jarCoveredEur)} · €${Math.round(cashflowHitEur)} left`}
                </div>
              </div>
            </div>
          )}

          {selectedBasket === 'regular_essentials' && (
            <div className="bg-[#EBF7EC] border border-[#99D59F]/60 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="px-3 py-1 rounded-2xl rounded-bl-xs bg-white border border-[#99D59F]/60 text-xs font-bold text-[#004628]">
                  Yearly Bill Checkup
                </span>
                <span className="text-xs font-bold font-mono-num text-[#007841]">
                  ~€{checkedCount * 7}/mo saved
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'elec', label: 'Electricity' },
                  { id: 'phone', label: 'Phone plan' },
                  { id: 'ins', label: 'Insurance' },
                ].map((item) => {
                  const done = Boolean(checkedContracts[item.id]);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        setCheckedContracts((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                      }
                      className={`min-h-[48px] px-2 py-2 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-0.5 cursor-pointer border ${
                        done
                          ? 'bg-[#004628] text-[#91FA9B] border-[#004628]'
                          : 'bg-white text-[#363636] border-[#99D59F]/50'
                      }`}
                    >
                      <span>{item.label}</span>
                      {done && <Check className="w-3.5 h-3.5" />}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {basketCategories.map((cat) => (
                  <div
                    key={cat.id}
                    className="bg-white rounded-xl px-3 py-2 border border-[#99D59F]/40 flex items-center justify-between text-xs"
                  >
                    <span className="text-[#363636] truncate">{cat.label}</span>
                    <span className="font-mono-num font-bold text-[#004628]">
                      €{Math.round(cat.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fun 1-Tap "Which Basket?" Mini-Game */}
          <div className="bg-white border border-[#E6E6E6] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#004628]">
                <Sparkles className="w-4 h-4 text-[#00AA46]" />
                <span>Quick Sort Game</span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-[#EBF7EC] text-xs font-bold font-mono-num text-[#007841]">
                Score {quizScore}
              </span>
            </div>

            <div className="bg-[#F5F5F5] rounded-2xl rounded-bl-xs px-3.5 py-2.5 text-sm font-bold text-[#004628] text-center">
              {currentQuiz.item}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'regular_essentials' as const, label: 'Usual' },
                  { id: 'irregular_essentials' as const, label: 'Oops!' },
                  { id: 'everyday_choices' as const, label: 'Whims' },
                ] as const
              ).map((opt) => {
                const isChosen = pickedQuizBasket === opt.id;
                const isRightChoice = pickedQuizBasket !== null && opt.id === currentQuiz.answer;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handlePickQuiz(opt.id)}
                    className={`min-h-[40px] rounded-full text-xs font-bold transition-colors cursor-pointer border ${
                      isRightChoice
                        ? 'bg-[#91FA9B] text-[#004628] border-[#00AA46]'
                        : isChosen
                        ? 'bg-[#004628] text-white border-[#004628]'
                        : 'bg-[#F5F5F5] hover:bg-[#EBF7EC] text-[#004628] border-[#E6E6E6]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {pickedQuizBasket !== null && (
              <div className="flex items-center justify-between gap-2 bg-[#EBF7EC] border border-[#99D59F]/60 rounded-2xl rounded-bl-xs px-3.5 py-2 text-xs">
                <span className="font-bold text-[#004628]">
                  {isQuizCorrect ? 'Spot on! ' : 'Aha! '}
                  <span className="font-normal text-[#363636]">{currentQuiz.winHint}</span>
                </span>
                <button
                  type="button"
                  onClick={handleNextQuiz}
                  className="min-h-[30px] px-3 py-1 rounded-full bg-[#004628] text-white font-bold cursor-pointer shrink-0"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
};
