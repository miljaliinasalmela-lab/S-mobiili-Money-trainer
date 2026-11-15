import React, { useState } from 'react';
import { CATEGORIES } from '../shared/syntheticData.ts';
import {
  getEffectiveCategoryAmount,
  roundEur,
  toolSimulateWhatIfReduction,
} from '../shared/calculations.ts';
import type { TrackerCategoryId, TrackerDatasetContext } from '../shared/types.ts';

interface WhatIfExplorerProps {
  context: TrackerDatasetContext;
  onApplyToSelectedMonth: (categoryId: TrackerCategoryId, newAmountEur: number) => void;
  onAskSbuddyScenario: (question: string) => void;
}

const EXPLORABLE_TARGETS: Array<{ id: string; label: string; categoryId?: TrackerCategoryId }> = [
  { id: 'everyday_choices', label: 'All Wants & Whims' },
  ...CATEGORIES.filter((c) => c.basket === 'everyday_choices').map((c) => ({
    id: c.id,
    label: c.shortLabel,
    categoryId: c.id,
  })),
];

export const WhatIfExplorer: React.FC<WhatIfExplorerProps> = ({
  context,
  onApplyToSelectedMonth,
  onAskSbuddyScenario,
}) => {
  const [selectedTarget, setSelectedTarget] = useState<string>('restaurants_cafes');
  const [percentReduction, setPercentReduction] = useState<number>(20);

  const activeMonth =
    context.months.find((m) => m.monthKey === context.selectedMonthKey) || context.months[0];

  const sim = toolSimulateWhatIfReduction(context, {
    targetQuery: selectedTarget,
    percentReduction,
    month: activeMonth.monthKey,
  });

  const targetMeta =
    EXPLORABLE_TARGETS.find((t) => t.id === selectedTarget) || EXPLORABLE_TARGETS[0];

  const baselineEur = Number(sim.baselineMonthlyEur || 0);
  const monthlySavedEur = Number(sim.monthlySavedEur || 0);
  const newMonthlyEur = Number(sim.newMonthlyTargetSpendEur || 0);
  const annualSavedEur = Number(sim.annualSavedEur || 0);
  const threeYearCashEur = Number(sim.threeYearBufferNoReturnEur || 0);
  const threeYearInvestedEur = Number(sim.threeYearIllustrative4PctEur || 0);

  const handleApplyToMonth = () => {
    if (!targetMeta.categoryId) return;
    const currentVal = getEffectiveCategoryAmount(activeMonth, targetMeta.categoryId);
    const updated = roundEur(Math.max(0, currentVal * (1 - percentReduction / 100)));
    onApplyToSelectedMonth(targetMeta.categoryId, updated);
  };

  return (
    <div className="bg-white border border-[#E6E6E6] rounded-2xl p-4 space-y-4">
      {/* Tap Category Pills */}
      <div className="flex flex-wrap gap-1.5">
        {EXPLORABLE_TARGETS.map((item) => {
          const active = selectedTarget === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedTarget(item.id)}
              className={`min-h-[36px] px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-[#004628] text-white'
                  : 'bg-[#F5F5F5] text-[#363636] hover:bg-[#EBF7EC]'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Trim Slider + Presets */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-bold text-[#004628]">Trim −{percentReduction}%</span>
          <span className="px-2.5 py-0.5 rounded-full bg-[#EBF7EC] font-mono-num font-bold text-[#007841]">
            €{baselineEur.toFixed(0)} → €{newMonthlyEur.toFixed(0)}/mo
          </span>
        </div>

        <input
          type="range"
          min={5}
          max={60}
          step={5}
          value={percentReduction}
          onChange={(e) => setPercentReduction(Number(e.target.value))}
          aria-label="Percentage reduction"
          className="w-full h-2 bg-[#E6E6E6] rounded-lg appearance-none cursor-pointer accent-[#00AA46]"
        />

        <div className="grid grid-cols-4 gap-1.5">
          {[10, 20, 30, 50].map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => setPercentReduction(pct)}
              className={`min-h-[36px] rounded-full text-xs font-bold font-mono-num transition-colors cursor-pointer ${
                percentReduction === pct
                  ? 'bg-[#004628] text-white'
                  : 'bg-[#F5F5F5] text-[#1F1F1F] hover:bg-[#EBF7EC]'
              }`}
            >
              −{pct}%
            </button>
          ))}
        </div>
      </div>

      {/* 4 Punchy Outcome Bubbles */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-[#EBF7EC] border border-[#99D59F]/60 rounded-2xl rounded-bl-xs p-3 min-w-0">
          <div className="text-[11px] text-[#363636]">1 Month</div>
          <div className="text-xl font-bold font-mono-num text-[#007841] mt-0.5">
            +€{monthlySavedEur.toFixed(0)}
          </div>
        </div>

        <div className="bg-[#EBF7EC] border border-[#99D59F]/60 rounded-2xl rounded-bl-xs p-3 min-w-0">
          <div className="text-[11px] text-[#363636]">1 Year</div>
          <div className="text-xl font-bold font-mono-num text-[#004628] mt-0.5">
            +€{annualSavedEur.toFixed(0)}
          </div>
        </div>

        <div className="bg-[#F5F5F5] border border-[#E6E6E6] rounded-2xl rounded-bl-xs p-3 min-w-0">
          <div className="text-[11px] text-[#666666]">3 Yrs Cash</div>
          <div className="text-lg font-bold font-mono-num text-[#004628] mt-0.5">
            €{threeYearCashEur.toLocaleString('en-IE', { maximumFractionDigits: 0 })}
          </div>
        </div>

        <div className="bg-[#F5F5F5] border border-[#E6E6E6] rounded-2xl rounded-bl-xs p-3 min-w-0">
          <div className="text-[11px] text-[#666666]">3 Yrs (4%/yr)</div>
          <div className="text-lg font-bold font-mono-num text-[#007841] mt-0.5">
            €{threeYearInvestedEur.toLocaleString('en-IE', { maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        {targetMeta.categoryId && (
          <button
            type="button"
            onClick={handleApplyToMonth}
            className="flex-1 min-h-[42px] px-4 py-2 rounded-full bg-[#91FA9B] hover:bg-[#49F37B] active:bg-[#00EB5A] text-[#004628] text-xs font-bold transition-colors cursor-pointer text-center whitespace-nowrap"
          >
            Apply to {activeMonth.monthShort}
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            onAskSbuddyScenario(
              `How much could I save if I reduced ${targetMeta.label.toLowerCase()} by ${percentReduction}%?`
            )
          }
          className="min-h-[42px] px-4 py-2 rounded-full border border-[#007841] bg-white hover:bg-[#EBF7EC] text-[#007841] text-xs font-bold transition-colors cursor-pointer text-center whitespace-nowrap"
        >
          Ask S-buddy →
        </button>
      </div>
    </div>
  );
};
