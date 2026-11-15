import React, { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Check,
  Pencil,
  Search,
  X,
  Download,
} from 'lucide-react';
import { BASKETS, CATEGORIES, mapRawTransactionToCategory } from '../shared/syntheticData.ts';
import { resolveReceiptItemCategory } from '../shared/eReceipts.ts';
import {
  computeMonthSummary,
  getEffectiveCategoryAmount,
  getEffectivePrimaryIncome,
  getEffectiveSideIncome,
  roundEur,
} from '../shared/calculations.ts';
import type {
  EditableTrackerField,
  MonthlyRecord,
  SBankTransaction,
  TrackerCategoryId,
} from '../shared/types.ts';

interface TrackerSectionProps {
  year: number;
  availableYears?: number[];
  months: MonthlyRecord[];
  transactions: SBankTransaction[];
  selectedMonthKey: string;
  customerLabel: string;
  onSelectYear?: (year: number) => void;
  onSelectMonth: (monthKey: string) => void;
  onUpdateCell: (monthKey: string, field: EditableTrackerField, value: number) => void;
  onResetCell: (monthKey: string, field: EditableTrackerField) => void;
  categoryTargetsEur?: Partial<Record<TrackerCategoryId, number>>;
  onSetCategoryTarget?: (categoryId: TrackerCategoryId, targetEur: number | null) => void;
  forceMobileSingleMonth?: boolean;
  splitEReceipts?: boolean;
}

function formatEur(val: number): string {
  const sign = val < 0 ? '−' : '';
  const abs = Math.round(Math.abs(val));
  return `${sign}€${abs.toLocaleString('en-IE')}`;
}

function formatRate(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return '—';
  return `${rate.toFixed(1)}%`;
}

function getColumnHeaderStyle(monthIndex: number, isSelected: boolean): string {
  if (isSelected) {
    return 'bg-[#004628] text-white border-t-[3px] border-t-[#91FA9B]';
  }
  if (monthIndex <= 3) {
    return 'bg-[#F5F5F5] text-[#004628] border-t-[3px] border-t-[#00AA46] hover:bg-[#EBF7EC]';
  }
  if (monthIndex <= 7) {
    return 'bg-[#F5F5F5] text-[#004628] border-t-[3px] border-t-[#007841] hover:bg-[#EBF7EC]';
  }
  return 'bg-[#F5F5F5] text-[#004628] border-t-[3px] border-t-[#99D59F] hover:bg-[#EBF7EC]';
}

export const TrackerSection: React.FC<TrackerSectionProps> = ({
  year,
  availableYears = [2024, 2025, 2026],
  months,
  transactions,
  selectedMonthKey,
  customerLabel,
  onSelectYear,
  onSelectMonth,
  onUpdateCell,
  onResetCell,
  categoryTargetsEur = {},
  onSetCategoryTarget,
  forceMobileSingleMonth = false,
  splitEReceipts = true,
}) => {
  const [lang, setLang] = useState<'en' | 'fi'>('en');
  const [editingCell, setEditingCell] = useState<{
    monthKey: string;
    field: EditableTrackerField;
  } | null>(null);
  const [draftValue, setDraftValue] = useState<string>('');
  const [inspectedCategory, setInspectedCategory] = useState<{
    monthKey: string;
    categoryId: TrackerCategoryId;
  } | null>(null);

  const selectedIdx = Math.max(
    0,
    months.findIndex((m) => m.monthKey === selectedMonthKey)
  );
  const activeMonth = months[selectedIdx] || months[0];
  const activeSummary = computeMonthSummary(activeMonth);

  const annualSummaries = useMemo(() => months.map((m) => computeMonthSummary(m)), [months]);
  const annualPrimaryIncome = roundEur(
    annualSummaries.reduce((s, m) => s + m.primaryIncomeEur, 0)
  );
  const annualSideIncome = roundEur(annualSummaries.reduce((s, m) => s + m.sideIncomeEur, 0));
  const annualTotalIncome = roundEur(annualPrimaryIncome + annualSideIncome);
  const annualTotalExpenses = roundEur(
    annualSummaries.reduce((s, m) => s + m.totalSpendingEur, 0)
  );
  const annualRemaining = roundEur(annualTotalIncome - annualTotalExpenses);
  const annualSavingsRate =
    annualTotalIncome > 0 ? roundEur((annualRemaining / annualTotalIncome) * 100) : null;

  const startEditing = (monthKey: string, field: EditableTrackerField, currentVal: number) => {
    setEditingCell({ monthKey, field });
    setDraftValue(String(Math.round(currentVal * 100) / 100));
  };

  const commitEdit = () => {
    if (!editingCell) return;
    const parsed = Number(draftValue.replace(',', '.'));
    if (Number.isFinite(parsed) && parsed >= 0) {
      onUpdateCell(editingCell.monthKey, editingCell.field, roundEur(parsed));
    }
    setEditingCell(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitEdit();
    else if (e.key === 'Escape') setEditingCell(null);
  };

  const goPrevMonth = () => {
    const nextIdx = selectedIdx > 0 ? selectedIdx - 1 : months.length - 1;
    onSelectMonth(months[nextIdx].monthKey);
  };

  const goNextMonth = () => {
    const nextIdx = selectedIdx < months.length - 1 ? selectedIdx + 1 : 0;
    onSelectMonth(months[nextIdx].monthKey);
  };

  const inspectedDetails = useMemo(() => {
    if (!inspectedCategory) return null;
    const cat = CATEGORIES.find((c) => c.id === inspectedCategory.categoryId);
    const monthObj = months.find((m) => m.monthKey === inspectedCategory.monthKey);
    if (!cat || !monthObj) return null;

    const matchingEntries: Array<{
      key: string;
      title: string;
      subtitle: string;
      amountEur: number;
      isEReceiptSplit?: boolean;
    }> = [];

    for (const tx of transactions) {
      if (tx.tx_amount_eur >= 0) continue;
      if (!tx.tx_date.startsWith(inspectedCategory.monthKey)) continue;
      const txTypeUpper = (tx.transaction_type || '').toUpperCase();
      if (
        txTypeUpper.includes('SAVING') ||
        txTypeUpper.includes('INVEST') ||
        txTypeUpper.includes('SWEEP') ||
        tx.mcc_code === '6211'
      ) {
        continue;
      }

      if (splitEReceipts && tx.eReceiptItems && tx.eReceiptItems.length > 0) {
        const matchedItems = tx.eReceiptItems.filter(
          (it) => resolveReceiptItemCategory(it) === cat.id && Math.abs(it.amountEur) > 0
        );
        const itemsSum = roundEur(
          tx.eReceiptItems.reduce((s, it) => s + Math.abs(it.amountEur), 0)
        );
        const txAbs = Math.abs(tx.tx_amount_eur);
        const remainder = roundEur(txAbs - itemsSum);
        const baseCat = mapRawTransactionToCategory(tx.category, tx.mcc_code, tx.merchant_label);
        const matchedItemsSum = roundEur(
          matchedItems.reduce((s, it) => s + Math.abs(it.amountEur), 0)
        );
        const totalForCat = roundEur(
          matchedItemsSum + (remainder > 0.01 && baseCat === cat.id ? remainder : 0)
        );

        if (totalForCat > 0) {
          const itemNames = matchedItems.map((i) => i.name).join(' + ');
          matchingEntries.push({
            key: `${tx.tx_timestamp}-${tx.merchant_id}`,
            title:
              cat.id === 'groceries'
                ? `${tx.storeChain || 'Prisma'} e-Receipt · Food portion`
                : `${tx.storeChain || 'Prisma'} e-Receipt · ${itemNames || cat.shortLabel}`,
            subtitle: `${tx.tx_date} · Split from €${txAbs.toFixed(2)} receipt (MCC ${tx.mcc_code || '5411'})`,
            amountEur: totalForCat,
            isEReceiptSplit: cat.id !== 'groceries',
          });
        }
        continue;
      }

      if (mapRawTransactionToCategory(tx.category, tx.mcc_code, tx.merchant_label) === cat.id) {
        matchingEntries.push({
          key: `${tx.tx_timestamp}-${tx.merchant_id}`,
          title: tx.merchant_label || tx.merchant_id,
          subtitle: `${tx.tx_date} · ${tx.category} · MCC ${tx.mcc_code || '—'} · ${tx.account_provider || 'S-Pankki'}`,
          amountEur: Math.abs(tx.tx_amount_eur),
        });
      }
    }

    const basket = BASKETS.find((b) => b.id === cat.basket);
    return { cat, monthObj, basket, matchingEntries };
  }, [inspectedCategory, transactions, months, splitEReceipts]);

  const handleExportTrackerCsv = () => {
    const monthCols = months.map((m) => (lang === 'fi' ? m.monthFullFi : m.monthShort));
    const lines: string[] = [];
    lines.push([String(year), ...monthCols, lang === 'fi' ? 'Yhteensä' : 'Total'].join(','));
    lines.push([lang === 'fi' ? 'Tulot' : 'Income', ...months.map(() => ''), ''].join(','));
    lines.push(
      [
        lang === 'fi' ? 'Päätulot' : 'Primary income',
        ...months.map((m) => Math.round(getEffectivePrimaryIncome(m))),
        Math.round(annualPrimaryIncome),
      ].join(',')
    );
    lines.push(
      [
        lang === 'fi' ? 'Sivutulot' : 'Side income',
        ...months.map((m) => Math.round(getEffectiveSideIncome(m))),
        Math.round(annualSideIncome),
      ].join(',')
    );
    lines.push(
      [
        lang === 'fi' ? 'Tulot yhteensä' : 'Total income',
        ...annualSummaries.map((s) => Math.round(s.incomeEur)),
        Math.round(annualTotalIncome),
      ].join(',')
    );
    lines.push([lang === 'fi' ? 'Kulut' : 'Expenses', ...months.map(() => ''), ''].join(','));
    for (const cat of CATEGORIES) {
      const yrSum = months.reduce((s, m) => s + getEffectiveCategoryAmount(m, cat.id), 0);
      lines.push(
        [
          `"${lang === 'fi' ? cat.labelFi : cat.label}"`,
          ...months.map((m) => Math.round(getEffectiveCategoryAmount(m, cat.id))),
          Math.round(yrSum),
        ].join(',')
      );
    }
    lines.push(
      [
        lang === 'fi' ? 'Kulut yhteensä' : 'Total expenses',
        ...annualSummaries.map((s) => Math.round(s.totalSpendingEur)),
        Math.round(annualTotalExpenses),
      ].join(',')
    );
    lines.push(
      [
        lang === 'fi' ? 'Tulot - kulut' : 'Income - expenses',
        ...annualSummaries.map((s) => Math.round(s.remainingAfterSpendingEur)),
        Math.round(annualRemaining),
      ].join(',')
    );
    lines.push(
      [
        lang === 'fi' ? 'Säästöprosentti' : 'Savings rate %',
        ...annualSummaries.map((s) => formatRate(s.savingsRatePercent)),
        formatRate(annualSavingsRate),
      ].join(',')
    );

    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auto_filled_budget_${year}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const t = {
    incomeHeader: lang === 'fi' ? 'Tulot' : 'Income',
    primaryIncome: lang === 'fi' ? 'Päätulot' : 'Primary income',
    sideIncome: lang === 'fi' ? 'Sivutulot' : 'Side income',
    totalIncome: lang === 'fi' ? 'Tulot yhteensä' : 'Total income',
    expensesHeader: lang === 'fi' ? 'Kulut' : 'Expenses',
    totalExpenses: lang === 'fi' ? 'Kulut yhteensä' : 'Total expenses',
    netRow: lang === 'fi' ? 'Tulot − kulut' : 'Income − expenses',
    savingsRateRow: lang === 'fi' ? 'Säästöprosentti' : 'Savings rate',
  };

  return (
    <section id="tracker" className="space-y-4">
      {/* Selected Month Top 4-Metric Summary Card (2x2 on mobile/S-mobiili, 4-col on wide) */}
      <div className="bg-white border border-[#E6E6E6] rounded-2xl p-3.5 @2xl:p-5">
        <div className="flex flex-col @3xl:flex-row @3xl:items-center justify-between gap-2.5 pb-3.5 border-b border-[#E6E6E6]">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={goPrevMonth}
                aria-label="Previous month"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-full border border-[#E6E6E6] bg-[#F5F5F5] text-[#004628] hover:bg-[#EBF7EC] transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="min-w-[122px] text-center px-3 py-1.5 rounded-full border border-[#E6E6E6] bg-[#F5F5F5]">
                <span className="text-xs @2xl:text-sm font-bold text-[#004628] whitespace-nowrap">
                  {lang === 'fi' ? `${activeMonth.monthFullFi} ${year}` : activeMonth.monthLabel}
                </span>
              </div>
              <button
                type="button"
                onClick={goNextMonth}
                aria-label="Next month"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-full border border-[#E6E6E6] bg-[#F5F5F5] text-[#004628] hover:bg-[#EBF7EC] transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Dataset Year Switcher (2024 / 2025 / 2026) */}
            {onSelectYear && availableYears.length > 1 && (
              <div className="inline-flex items-center p-0.5 bg-[#F5F5F5] rounded-full border border-[#E6E6E6]">
                {availableYears.map((yr) => (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => onSelectYear(yr)}
                    className={`min-h-[32px] px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                      year === yr
                        ? 'bg-[#004628] text-white'
                        : 'text-[#363636] hover:text-[#004628]'
                    }`}
                  >
                    {yr}
                  </button>
                ))}
              </div>
            )}

            <span className="hidden @6xl:inline text-xs text-[#666666] ml-1">
              {customerLabel}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center p-0.5 bg-[#F5F5F5] rounded-full border border-[#E6E6E6]">
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`min-h-[32px] px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  lang === 'en' ? 'bg-[#004628] text-white' : 'text-[#363636] hover:text-[#004628]'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setLang('fi')}
                className={`min-h-[32px] px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  lang === 'fi' ? 'bg-[#004628] text-white' : 'text-[#363636] hover:text-[#004628]'
                }`}
              >
                Suomi
              </button>
            </div>

            <button
              type="button"
              onClick={handleExportTrackerCsv}
              className="min-h-[36px] px-3.5 py-1.5 rounded-full border border-[#007841] bg-white hover:bg-[#EBF7EC] text-xs font-bold text-[#007841] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* 4 Scannable KPI Bubbles (2x2 on S-mobiili, 4-col on >= 672px) */}
        <div className="grid grid-cols-2 @2xl:grid-cols-4 gap-2.5 @2xl:gap-3.5 pt-3.5">
          <div className="min-w-0 bg-[#F5F5F5] rounded-2xl rounded-bl-xs p-3">
            <div className="text-[11px] font-normal text-[#666666] truncate">{t.totalIncome}</div>
            <div className="text-lg @2xl:text-2xl font-bold font-mono-num text-[#004628] mt-0.5 truncate">
              {formatEur(activeSummary.incomeEur)}
            </div>
          </div>
          <div className="min-w-0 bg-[#F5F5F5] rounded-2xl rounded-bl-xs p-3">
            <div className="text-[11px] font-normal text-[#666666] truncate">{t.totalExpenses}</div>
            <div className="text-lg @2xl:text-2xl font-bold font-mono-num text-[#1F1F1F] mt-0.5 truncate">
              {formatEur(activeSummary.totalSpendingEur)}
            </div>
          </div>
          <div className="min-w-0 bg-[#EBF7EC] rounded-2xl rounded-bl-xs p-3">
            <div className="text-[11px] font-normal text-[#363636] truncate">{t.netRow}</div>
            <div
              className={`text-lg @2xl:text-2xl font-bold font-mono-num mt-0.5 truncate ${
                activeSummary.remainingAfterSpendingEur >= 0 ? 'text-[#007841]' : 'text-[#B70000]'
              }`}
            >
              {formatEur(activeSummary.remainingAfterSpendingEur)}
            </div>
          </div>
          <div className="min-w-0 bg-[#EBF7EC] rounded-2xl rounded-bl-xs p-3">
            <div className="text-[11px] font-normal text-[#363636] truncate">{t.savingsRateRow}</div>
            <div
              className={`text-lg @2xl:text-2xl font-bold font-mono-num mt-0.5 truncate ${
                (activeSummary.savingsRatePercent ?? 0) >= 0 ? 'text-[#007841]' : 'text-[#B70000]'
              }`}
            >
              {formatRate(activeSummary.savingsRatePercent)}
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          MOBILE / S-MOBIILI TIGHT SINGLE-MONTH SHEET
         ===================================================================== */}
      <div className={forceMobileSingleMonth ? 'block' : 'block @5xl:hidden'}>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2.5">
          {months.map((m) => {
            const isSelected = m.monthKey === selectedMonthKey;
            return (
              <button
                key={m.monthKey}
                type="button"
                onClick={() => onSelectMonth(m.monthKey)}
                className={`min-h-[36px] px-3 py-1 rounded-full text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-[#004628] text-white'
                    : 'bg-white border border-[#E6E6E6] text-[#363636] hover:border-[#007841]'
                }`}
              >
                {lang === 'fi' ? m.monthShortFi : m.monthShort}
              </button>
            );
          })}
        </div>

        <div className="bg-white border border-[#E6E6E6] rounded-2xl overflow-hidden text-xs @2xl:text-sm">
          {/* INCOME BLOCK */}
          <div className="px-3.5 py-2 bg-[#F5F5F5] border-b border-[#E6E6E6] font-bold text-xs text-[#004628]">
            {t.incomeHeader}
          </div>
          {(
            [
              {
                field: 'primaryIncomeEur' as const,
                label: t.primaryIncome,
                val: getEffectivePrimaryIncome(activeMonth),
                edited: activeMonth.manualOverrides.primaryIncomeEur !== undefined,
              },
              {
                field: 'sideIncomeEur' as const,
                label: t.sideIncome,
                val: getEffectiveSideIncome(activeMonth),
                edited: activeMonth.manualOverrides.sideIncomeEur !== undefined,
              },
            ] as const
          ).map((row) => {
            const isEditing =
              editingCell?.monthKey === activeMonth.monthKey && editingCell?.field === row.field;
            return (
              <div
                key={row.field}
                className="px-3.5 py-1.5 flex items-center justify-between gap-2 border-b border-[#E6E6E6]/70 min-h-[40px]"
              >
                <span className="text-[#1F1F1F] min-w-0 flex-1 truncate">
                  {row.label}
                  {row.edited && (
                    <span className="ml-1.5 text-[11px] text-[#007841]">· edited</span>
                  )}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  {row.edited && !isEditing && (
                    <button
                      type="button"
                      onClick={() => onResetCell(activeMonth.monthKey, row.field)}
                      aria-label={`Reset ${row.label}`}
                      className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-full text-[#666666] hover:bg-[#F5F5F5]"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {isEditing ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        autoFocus
                        value={draftValue}
                        onChange={(e) => setDraftValue(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={handleKeyDown}
                        className="w-20 px-2 py-1 text-right font-mono-num border border-[#00AA46] rounded-lg text-xs"
                      />
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={commitEdit}
                        className="min-h-[30px] min-w-[30px] flex items-center justify-center rounded-lg bg-[#91FA9B] text-[#004628]"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEditing(activeMonth.monthKey, row.field, row.val)}
                      className="min-h-[34px] px-2 py-0.5 rounded-lg hover:bg-[#F5F5F5] font-mono-num font-bold text-[#004628] inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>{formatEur(row.val)}</span>
                      <Pencil className="w-3 h-3 text-[#666666]/60" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <div className="px-3.5 py-2 bg-[#F5F5F5] border-b border-[#E6E6E6] flex items-center justify-between font-bold text-[#004628]">
            <span>{t.totalIncome}</span>
            <span className="font-mono-num">{formatEur(activeSummary.incomeEur)}</span>
          </div>

          {/* EXPENSES BLOCK */}
          <div className="px-3.5 py-2 bg-[#F5F5F5] border-b border-[#E6E6E6] font-bold text-xs text-[#004628]">
            {t.expensesHeader}
          </div>
          {CATEGORIES.map((cat) => {
            const val = getEffectiveCategoryAmount(activeMonth, cat.id);
            const edited = activeMonth.manualOverrides[cat.id] !== undefined;
            const isEditing =
              editingCell?.monthKey === activeMonth.monthKey && editingCell?.field === cat.id;

            return (
              <div
                key={cat.id}
                className="px-3.5 py-1.5 flex items-center justify-between gap-2 border-b border-[#E6E6E6]/70 min-h-[40px]"
              >
                <button
                  type="button"
                  onClick={() =>
                    setInspectedCategory({ monthKey: activeMonth.monthKey, categoryId: cat.id })
                  }
                  className="text-left text-[#1F1F1F] hover:text-[#007841] truncate cursor-pointer min-w-0 flex-1 py-0.5"
                >
                  {lang === 'fi' ? cat.labelFi : cat.label}
                  {edited && <span className="ml-1.5 text-[11px] text-[#007841]">· edited</span>}
                  {categoryTargetsEur[cat.id] !== undefined && (
                    <span
                      className={`ml-1.5 text-[11px] font-mono-num font-bold ${
                        val <= (categoryTargetsEur[cat.id] || 0)
                          ? 'text-[#007841]'
                          : 'text-[#B70000]'
                      }`}
                    >
                      / €{Math.round(categoryTargetsEur[cat.id] || 0)} cap
                    </span>
                  )}
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  {edited && !isEditing && (
                    <button
                      type="button"
                      onClick={() => onResetCell(activeMonth.monthKey, cat.id)}
                      aria-label={`Reset ${cat.label}`}
                      className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-full text-[#666666] hover:bg-[#F5F5F5]"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {isEditing ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        autoFocus
                        value={draftValue}
                        onChange={(e) => setDraftValue(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={handleKeyDown}
                        className="w-20 px-2 py-1 text-right font-mono-num border border-[#00AA46] rounded-lg text-xs"
                      />
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={commitEdit}
                        className="min-h-[30px] min-w-[30px] flex items-center justify-center rounded-lg bg-[#91FA9B] text-[#004628]"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEditing(activeMonth.monthKey, cat.id, val)}
                      className="min-h-[34px] px-2 py-0.5 rounded-lg hover:bg-[#F5F5F5] font-mono-num font-bold text-[#004628] inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>{formatEur(val)}</span>
                      <Pencil className="w-3 h-3 text-[#666666]/60" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          <div className="px-3.5 py-2 bg-[#F5F5F5] border-b border-[#E6E6E6] flex items-center justify-between font-bold text-[#004628]">
            <span>{t.totalExpenses}</span>
            <span className="font-mono-num">{formatEur(activeSummary.totalSpendingEur)}</span>
          </div>

          <div className="px-3.5 py-2 bg-white border-b border-[#E6E6E6] flex items-center justify-between font-bold">
            <span className="text-[#004628]">{t.netRow}</span>
            <span
              className={`font-mono-num ${
                activeSummary.remainingAfterSpendingEur >= 0 ? 'text-[#007841]' : 'text-[#B70000]'
              }`}
            >
              {formatEur(activeSummary.remainingAfterSpendingEur)}
            </span>
          </div>
          <div className="px-3.5 py-2.5 bg-[#EBF7EC] flex items-center justify-between font-bold">
            <span className="text-[#004628]">{t.savingsRateRow}</span>
            <span
              className={`font-mono-num ${
                (activeSummary.savingsRatePercent ?? 0) >= 0 ? 'text-[#007841]' : 'text-[#B70000]'
              }`}
            >
              {formatRate(activeSummary.savingsRatePercent)}
            </span>
          </div>
        </div>
      </div>

      {/* =====================================================================
          DESKTOP FULL-YEAR TIGHT S-PANKKI SHEET
         ===================================================================== */}
      {!forceMobileSingleMonth && (
        <div className="hidden @5xl:block bg-white border border-[#E6E6E6] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs leading-tight">
              <thead>
                <tr className="border-b border-[#E6E6E6]">
                  <th className="sticky left-0 z-10 bg-white text-left py-2.5 px-3 font-bold text-[#004628] min-w-[180px] border-r border-[#E6E6E6]">
                    {year}
                  </th>
                  {months.map((m, idx) => {
                    const isSelected = m.monthKey === selectedMonthKey;
                    const headerTone = getColumnHeaderStyle(idx, isSelected);
                    return (
                      <th
                        key={m.monthKey}
                        className={`py-2 px-1.5 text-right font-bold min-w-[58px] border-r border-[#E6E6E6]/80 transition-colors ${headerTone}`}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectMonth(m.monthKey)}
                          className="w-full text-right cursor-pointer font-bold whitespace-nowrap"
                        >
                          {lang === 'fi' ? m.monthShortFi : m.monthShort}
                        </button>
                      </th>
                    );
                  })}
                  <th className="py-2 px-2.5 text-right font-bold text-[#004628] bg-[#F5F5F5] min-w-[76px] border-l border-[#E6E6E6]">
                    {lang === 'fi' ? 'Yhteensä' : 'Year'}
                  </th>
                </tr>
              </thead>

              <tbody>
                <tr className="bg-[#F5F5F5] border-b border-[#E6E6E6]">
                  <td
                    colSpan={14}
                    className="sticky left-0 py-1.5 px-3 font-bold text-xs text-[#004628]"
                  >
                    {t.incomeHeader}
                  </td>
                </tr>

                {(
                  [
                    {
                      field: 'primaryIncomeEur' as const,
                      label: t.primaryIncome,
                      getter: getEffectivePrimaryIncome,
                      annual: annualPrimaryIncome,
                    },
                    {
                      field: 'sideIncomeEur' as const,
                      label: t.sideIncome,
                      getter: getEffectiveSideIncome,
                      annual: annualSideIncome,
                    },
                  ] as const
                ).map((incRow) => (
                  <tr
                    key={incRow.field}
                    className="border-b border-[#E6E6E6]/70 hover:bg-[#F5F5F5]/80 transition-colors"
                  >
                    <td className="sticky left-0 z-10 bg-white py-1 px-3 text-[#1F1F1F] border-r border-[#E6E6E6] whitespace-nowrap">
                      {incRow.label}
                    </td>
                    {months.map((m) => {
                      const val = incRow.getter(m);
                      const isSelected = m.monthKey === selectedMonthKey;
                      const isEditing =
                        editingCell?.monthKey === m.monthKey &&
                        editingCell?.field === incRow.field;
                      const isEdited = m.manualOverrides[incRow.field] !== undefined;

                      return (
                        <td
                          key={m.monthKey}
                          className={`py-1 px-1.5 text-right font-mono-num border-r border-[#E6E6E6]/60 ${
                            isSelected
                              ? 'bg-[#EBF7EC] font-bold text-[#004628]'
                              : 'text-[#363636]'
                          }`}
                        >
                          {isEditing ? (
                            <input
                              type="number"
                              min="0"
                              autoFocus
                              value={draftValue}
                              onChange={(e) => setDraftValue(e.target.value)}
                              onBlur={commitEdit}
                              onKeyDown={handleKeyDown}
                              className="w-full px-1 py-0.5 text-right bg-white border border-[#00AA46] rounded text-xs font-mono-num focus:outline-none"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEditing(m.monthKey, incRow.field, val)}
                              title="Click to edit amount"
                              className={`w-full text-right rounded hover:bg-[#EBF7EC] px-1 py-0.5 cursor-pointer ${
                                isEdited ? 'underline decoration-[#00AA46] font-bold text-[#007841]' : ''
                              }`}
                            >
                              {Math.round(val).toLocaleString('en-IE')}
                            </button>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-1 px-2.5 text-right font-mono-num font-bold bg-[#F5F5F5] border-l border-[#E6E6E6] text-[#004628]">
                      {formatEur(incRow.annual)}
                    </td>
                  </tr>
                ))}

                <tr className="border-t border-b-2 border-[#E6E6E6] bg-[#F5F5F5] font-bold">
                  <td className="sticky left-0 z-10 bg-[#F5F5F5] py-1.5 px-3 text-[#004628] border-r border-[#E6E6E6]">
                    {t.totalIncome}
                  </td>
                  {annualSummaries.map((s, idx) => {
                    const isSelected = months[idx].monthKey === selectedMonthKey;
                    return (
                      <td
                        key={months[idx].monthKey}
                        className={`py-1.5 px-1.5 text-right font-mono-num border-r border-[#E6E6E6]/70 text-[#004628] ${
                          isSelected ? 'bg-[#D2FCD5]/70' : ''
                        }`}
                      >
                        {Math.round(s.incomeEur).toLocaleString('en-IE')}
                      </td>
                    );
                  })}
                  <td className="py-1.5 px-2.5 text-right font-mono-num bg-[#EBF7EC] border-l border-[#E6E6E6] text-[#004628]">
                    {formatEur(annualTotalIncome)}
                  </td>
                </tr>

                <tr className="h-2 bg-white border-b border-[#E6E6E6]">
                  <td colSpan={14} />
                </tr>

                <tr className="bg-[#F5F5F5] border-b border-[#E6E6E6]">
                  <td
                    colSpan={14}
                    className="sticky left-0 py-1.5 px-3 font-bold text-xs text-[#004628]"
                  >
                    {t.expensesHeader}
                  </td>
                </tr>

                {CATEGORIES.map((cat) => {
                  const rowYearTotal = roundEur(
                    months.reduce((s, m) => s + getEffectiveCategoryAmount(m, cat.id), 0)
                  );
                  return (
                    <tr
                      key={cat.id}
                      className="border-b border-[#E6E6E6]/70 hover:bg-[#F5F5F5]/80 transition-colors"
                    >
                      <td className="sticky left-0 z-10 bg-white py-1 px-3 text-[#1F1F1F] border-r border-[#E6E6E6] whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() =>
                            setInspectedCategory({
                              monthKey: selectedMonthKey,
                              categoryId: cat.id,
                            })
                          }
                          title="Click to inspect auto-filled transactions"
                          className="text-left hover:text-[#007841] hover:underline underline-offset-2 cursor-pointer"
                        >
                          {lang === 'fi' ? cat.labelFi : cat.label}
                        </button>
                      </td>
                      {months.map((m) => {
                        const val = getEffectiveCategoryAmount(m, cat.id);
                        const isSelected = m.monthKey === selectedMonthKey;
                        const isEditing =
                          editingCell?.monthKey === m.monthKey && editingCell?.field === cat.id;
                        const isEdited = m.manualOverrides[cat.id] !== undefined;

                        return (
                          <td
                            key={m.monthKey}
                            className={`py-1 px-1.5 text-right font-mono-num border-r border-[#E6E6E6]/60 ${
                              isSelected
                                ? 'bg-[#EBF7EC] font-bold text-[#004628]'
                                : 'text-[#363636]'
                            }`}
                          >
                            {isEditing ? (
                              <input
                                type="number"
                                min="0"
                                autoFocus
                                value={draftValue}
                                onChange={(e) => setDraftValue(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={handleKeyDown}
                                className="w-full px-1 py-0.5 text-right bg-white border border-[#00AA46] rounded text-xs font-mono-num focus:outline-none"
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  onSelectMonth(m.monthKey);
                                  setInspectedCategory({
                                    monthKey: m.monthKey,
                                    categoryId: cat.id,
                                  });
                                }}
                                onDoubleClick={() => startEditing(m.monthKey, cat.id, val)}
                                title="Click to view transactions · Double-click to edit"
                                className={`w-full text-right rounded hover:bg-[#EBF7EC] px-1 py-0.5 cursor-pointer ${
                                  isEdited
                                    ? 'text-[#007841] font-bold underline decoration-[#00AA46]'
                                    : ''
                                }`}
                              >
                                {Math.round(val).toLocaleString('en-IE')}
                              </button>
                            )}
                          </td>
                        );
                      })}
                      <td className="py-1 px-2.5 text-right font-mono-num font-bold bg-[#F5F5F5] border-l border-[#E6E6E6] text-[#004628]">
                        {formatEur(rowYearTotal)}
                      </td>
                    </tr>
                  );
                })}

                <tr className="border-t border-b-2 border-[#E6E6E6] bg-[#F5F5F5] font-bold">
                  <td className="sticky left-0 z-10 bg-[#F5F5F5] py-1.5 px-3 text-[#004628] border-r border-[#E6E6E6]">
                    {t.totalExpenses}
                  </td>
                  {annualSummaries.map((s, idx) => {
                    const isSelected = months[idx].monthKey === selectedMonthKey;
                    return (
                      <td
                        key={months[idx].monthKey}
                        className={`py-1.5 px-1.5 text-right font-mono-num border-r border-[#E6E6E6]/70 text-[#004628] ${
                          isSelected ? 'bg-[#D2FCD5]/70' : ''
                        }`}
                      >
                        {Math.round(s.totalSpendingEur).toLocaleString('en-IE')}
                      </td>
                    );
                  })}
                  <td className="py-1.5 px-2.5 text-right font-mono-num bg-[#EBF7EC] border-l border-[#E6E6E6] text-[#004628]">
                    {formatEur(annualTotalExpenses)}
                  </td>
                </tr>

                <tr className="h-2 bg-white border-b border-[#E6E6E6]">
                  <td colSpan={14} />
                </tr>

                <tr className="border-b border-[#E6E6E6] bg-white font-bold">
                  <td className="sticky left-0 z-10 bg-white py-1.5 px-3 text-[#004628] border-r border-[#E6E6E6]">
                    {t.netRow}
                  </td>
                  {annualSummaries.map((s, idx) => {
                    const rem = s.remainingAfterSpendingEur;
                    const isSelected = months[idx].monthKey === selectedMonthKey;
                    return (
                      <td
                        key={months[idx].monthKey}
                        className={`py-1.5 px-1.5 text-right font-mono-num border-r border-[#E6E6E6]/60 ${
                          rem >= 0 ? 'text-[#007841]' : 'text-[#B70000]'
                        } ${isSelected ? 'bg-[#EBF7EC]' : ''}`}
                      >
                        {rem < 0
                          ? `−${Math.round(Math.abs(rem))}`
                          : Math.round(rem).toLocaleString('en-IE')}
                      </td>
                    );
                  })}
                  <td
                    className={`py-1.5 px-2.5 text-right font-mono-num bg-[#F5F5F5] border-l border-[#E6E6E6] ${
                      annualRemaining >= 0 ? 'text-[#007841]' : 'text-[#B70000]'
                    }`}
                  >
                    {formatEur(annualRemaining)}
                  </td>
                </tr>

                <tr className="bg-[#EBF7EC] font-bold">
                  <td className="sticky left-0 z-10 bg-[#EBF7EC] py-1.5 px-3 text-[#004628] border-r border-[#E6E6E6]">
                    {t.savingsRateRow}
                  </td>
                  {annualSummaries.map((s, idx) => {
                    const rate = s.savingsRatePercent;
                    const isSelected = months[idx].monthKey === selectedMonthKey;
                    return (
                      <td
                        key={months[idx].monthKey}
                        className={`py-1.5 px-1.5 text-right font-mono-num border-r border-[#99D59F]/40 ${
                          (rate ?? 0) >= 0 ? 'text-[#007841]' : 'text-[#B70000]'
                        } ${isSelected ? 'bg-[#D2FCD5]' : ''}`}
                      >
                        {formatRate(rate)}
                      </td>
                    );
                  })}
                  <td className="py-1.5 px-2.5 text-right font-mono-num bg-[#D2FCD5]/80 border-l border-[#E6E6E6] text-[#007841]">
                    {formatRate(annualSavingsRate)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="px-3.5 py-2 bg-[#F5F5F5] border-t border-[#E6E6E6] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#363636]">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="px-2.5 py-0.5 rounded-full bg-white border border-[#E6E6E6]">
                Click cell → transactions
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-white border border-[#E6E6E6]">
                Double-click → override
              </span>
            </div>
            <span>EUR</span>
          </div>
        </div>
      )}

      {/* =====================================================================
          INLINE MYDATA CELL DRILL-DOWN DRAWER
         ===================================================================== */}
      {inspectedDetails && (
        <div className="bg-[#EBF7EC] border border-[#99D59F] rounded-2xl p-4 @2xl:p-5 space-y-3">
          <div className="flex flex-col @2xl:flex-row @2xl:items-start justify-between gap-3 border-b border-[#99D59F]/50 pb-3">
            <div className="min-w-0">
              <div className="text-xs text-[#363636] flex items-center gap-1.5 flex-wrap">
                <Search className="w-3.5 h-3.5 text-[#007841] shrink-0" />
                <span>
                  Auto-Filled Cell · {inspectedDetails.monthObj.monthLabel} ·{' '}
                  <strong className="text-[#004628]">{inspectedDetails.basket?.label}</strong>
                </span>
              </div>
              <h3 className="text-base font-bold text-[#004628] mt-1">
                {lang === 'fi' ? inspectedDetails.cat.labelFi : inspectedDetails.cat.label} —{' '}
                {formatEur(
                  getEffectiveCategoryAmount(inspectedDetails.monthObj, inspectedDetails.cat.id)
                )}
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {onSetCategoryTarget && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const current = getEffectiveCategoryAmount(
                        inspectedDetails.monthObj,
                        inspectedDetails.cat.id
                      );
                      const cap = Math.max(20, Math.round(current * 0.9));
                      onSetCategoryTarget(inspectedDetails.cat.id, cap);
                    }}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-full bg-white border border-[#007841] hover:bg-[#D2FCD5]/50 text-xs font-bold text-[#007841] cursor-pointer whitespace-nowrap"
                  >
                    {categoryTargetsEur[inspectedDetails.cat.id] !== undefined
                      ? `Cap: €${Math.round(categoryTargetsEur[inspectedDetails.cat.id] || 0)} (−10%)`
                      : 'Set −10% Cap'}
                  </button>
                  {categoryTargetsEur[inspectedDetails.cat.id] !== undefined && (
                    <button
                      type="button"
                      onClick={() => onSetCategoryTarget(inspectedDetails.cat.id, null)}
                      className="min-h-[38px] px-3 py-1.5 rounded-full bg-white border border-[#E6E6E6] text-xs font-bold text-[#666666] hover:text-[#1F1F1F] cursor-pointer whitespace-nowrap"
                    >
                      Clear Cap
                    </button>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  const val = getEffectiveCategoryAmount(
                    inspectedDetails.monthObj,
                    inspectedDetails.cat.id
                  );
                  startEditing(inspectedDetails.monthObj.monthKey, inspectedDetails.cat.id, val);
                }}
                className="min-h-[38px] px-4 py-1.5 rounded-full bg-[#91FA9B] hover:bg-[#49F37B] active:bg-[#00EB5A] text-xs font-bold text-[#004628] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Override Cell</span>
              </button>
              <button
                type="button"
                onClick={() => setInspectedCategory(null)}
                aria-label="Close transaction breakdown"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-full bg-white border border-[#E6E6E6] text-[#363636] hover:text-[#004628] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {inspectedDetails.matchingEntries.length === 0 ? (
            <p className="text-xs text-[#363636]">
              No raw transactions recorded in this category for{' '}
              {inspectedDetails.monthObj.monthLabel}.
            </p>
          ) : (
            <div className="divide-y divide-[#99D59F]/40 max-h-52 overflow-y-auto">
              {inspectedDetails.matchingEntries.map((entry, idx) => (
                <div
                  key={`${entry.key}-${idx}`}
                  className="py-2 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-[#004628] truncate flex items-center gap-1.5">
                      {entry.isEReceiptSplit && (
                        <span className="px-1.5 py-0.5 rounded-full bg-[#91FA9B] text-[#004628] text-[10px] font-bold shrink-0">
                          e-Receipt
                        </span>
                      )}
                      <span className="truncate">{entry.title}</span>
                    </div>
                    <div className="text-[#363636] font-normal truncate">{entry.subtitle}</div>
                  </div>
                  <div className="font-mono-num font-bold text-[#004628] shrink-0">
                    €{entry.amountEur.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
