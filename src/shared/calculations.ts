import { resolveReceiptItemCategory, summarizeEReceiptSplits } from './eReceipts.ts';
import { getStatFinBenchmarkForCustomer } from './statFinBenchmarks.ts';
import { BASKETS, CATEGORIES, MONTH_NAMES, mapRawTransactionToCategory } from './syntheticData.ts';
import type {
  BasketId,
  MonthlyRecord,
  SBankTransaction,
  ToolTraceItem,
  TrackerCategoryId,
  TrackerDatasetContext,
} from './types.ts';

export function createEmptyCategoryRecord(): Record<TrackerCategoryId, number> {
  return {
    housing: 0,
    groceries: 0,
    restaurants_cafes: 0,
    travel_taxis: 0,
    car_driving: 0,
    entertainment_electronics: 0,
    hobbies_sports: 0,
    clothing_appearance: 0,
    health: 0,
    pets: 0,
    insurance_bills: 0,
    other_repairs: 0,
  };
}

export function roundEur(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

export function aggregateTransactionsToMonths(
  transactions: SBankTransaction[],
  year = 2026,
  existingOverrides?: Record<string, MonthlyRecord['manualOverrides']>,
  splitEReceipts = true
): MonthlyRecord[] {
  const months: MonthlyRecord[] = MONTH_NAMES.map((m, idx) => {
    const monthKey = `${year}-${String(idx + 1).padStart(2, '0')}`;
    return {
      monthKey,
      monthIndex: idx,
      monthShort: m.short,
      monthShortFi: m.shortFi,
      monthFullFi: m.fullFi,
      monthLabel: `${m.full} ${year}`,
      primaryIncomeEur: 0,
      sideIncomeEur: 0,
      categories: createEmptyCategoryRecord(),
      manualOverrides: existingOverrides?.[monthKey] ? { ...existingOverrides[monthKey] } : {},
      txCount: 0,
    };
  });

  for (const tx of transactions) {
    if (!tx.tx_date || tx.tx_date.length < 7) continue;
    const txYear = Number(tx.tx_date.slice(0, 4));
    const txMonth = Number(tx.tx_date.slice(5, 7)) - 1;
    if (txYear !== year || txMonth < 0 || txMonth > 11) continue;

    const record = months[txMonth];
    record.txCount += 1;

    const txTypeUpper = (tx.transaction_type || '').toUpperCase();
    const catUpper = (tx.category || '').toUpperCase();

    // Ignore internal saving/investment transfers & salary sweeps so Expenses and Income reflect real cashflow
    if (
      txTypeUpper.includes('SAVING') ||
      txTypeUpper.includes('INVEST') ||
      txTypeUpper.includes('SWEEP') ||
      catUpper.includes('SAVING') ||
      catUpper.includes('INVEST') ||
      catUpper.includes('SWEEP') ||
      tx.mcc_code === '6211'
    ) {
      continue;
    }

    if (
      tx.tx_amount_eur > 0 ||
      txTypeUpper === 'SALARY' ||
      txTypeUpper === 'SIDE_INCOME' ||
      txTypeUpper === 'OTHER_INCOME' ||
      catUpper.includes('INCOME')
    ) {
      const amt = Math.abs(tx.tx_amount_eur);
      if (
        txTypeUpper.includes('SIDE') ||
        txTypeUpper.includes('OTHER_INCOME') ||
        catUpper.includes('SIDE') ||
        catUpper.includes('OTHER INCOME') ||
        catUpper.includes('BONUS') ||
        catUpper.includes('FREELANCE') ||
        catUpper.includes('REFUND')
      ) {
        record.sideIncomeEur = roundEur(record.sideIncomeEur + amt);
      } else {
        record.primaryIncomeEur = roundEur(record.primaryIncomeEur + amt);
      }
      continue;
    }

    const mappedCat = mapRawTransactionToCategory(tx.category, tx.mcc_code, tx.merchant_label);
    const txAbs = Math.abs(tx.tx_amount_eur);

    if (splitEReceipts && tx.eReceiptItems && tx.eReceiptItems.length > 0) {
      let itemsSum = 0;
      for (const item of tx.eReceiptItems) {
        const itemAmt = roundEur(Math.abs(item.amountEur));
        if (itemAmt <= 0) continue;
        const itemCat = resolveReceiptItemCategory(item);
        record.categories[itemCat] = roundEur(record.categories[itemCat] + itemAmt);
        itemsSum = roundEur(itemsSum + itemAmt);
      }
      const remainder = roundEur(txAbs - itemsSum);
      if (remainder > 0.01) {
        record.categories[mappedCat] = roundEur(record.categories[mappedCat] + remainder);
      }
    } else {
      record.categories[mappedCat] = roundEur(record.categories[mappedCat] + txAbs);
    }
  }

  return months;
}

export function getEffectivePrimaryIncome(month: MonthlyRecord): number {
  return month.manualOverrides.primaryIncomeEur !== undefined
    ? month.manualOverrides.primaryIncomeEur
    : month.primaryIncomeEur;
}

export function getEffectiveSideIncome(month: MonthlyRecord): number {
  return month.manualOverrides.sideIncomeEur !== undefined
    ? month.manualOverrides.sideIncomeEur
    : month.sideIncomeEur;
}

export function getEffectiveTotalIncome(month: MonthlyRecord): number {
  return roundEur(getEffectivePrimaryIncome(month) + getEffectiveSideIncome(month));
}

export function getEffectiveCategoryAmount(month: MonthlyRecord, catId: TrackerCategoryId): number {
  return month.manualOverrides[catId] !== undefined
    ? (month.manualOverrides[catId] as number)
    : month.categories[catId];
}

export interface MonthComputedSummary {
  monthKey: string;
  monthLabel: string;
  primaryIncomeEur: number;
  sideIncomeEur: number;
  incomeEur: number; // TULOT YHTEENSÄ
  totalSpendingEur: number; // KULUT YHTEENSÄ
  remainingAfterSpendingEur: number; // TULOT - KULUT
  savingsRatePercent: number | null; // SÄÄSTÖPROSENTTI (null when income is 0 -> avoids #JAKO/0!)
  baskets: Record<BasketId, number>;
  basketSharesOfSpendingPercent: Record<BasketId, number>;
}

export function computeMonthSummary(month: MonthlyRecord): MonthComputedSummary {
  const primaryIncomeEur = roundEur(getEffectivePrimaryIncome(month));
  const sideIncomeEur = roundEur(getEffectiveSideIncome(month));
  const incomeEur = roundEur(primaryIncomeEur + sideIncomeEur);

  const baskets: Record<BasketId, number> = {
    regular_essentials: 0,
    irregular_essentials: 0,
    everyday_choices: 0,
  };

  for (const cat of CATEGORIES) {
    const val = getEffectiveCategoryAmount(month, cat.id);
    baskets[cat.basket] = roundEur(baskets[cat.basket] + val);
  }

  const totalSpendingEur = roundEur(
    baskets.regular_essentials + baskets.irregular_essentials + baskets.everyday_choices
  );
  const remainingAfterSpendingEur = roundEur(incomeEur - totalSpendingEur);
  const savingsRatePercent =
    incomeEur > 0 ? roundEur((remainingAfterSpendingEur / incomeEur) * 100) : null;

  const basketSharesOfSpendingPercent: Record<BasketId, number> = {
    regular_essentials:
      totalSpendingEur > 0 ? roundEur((baskets.regular_essentials / totalSpendingEur) * 100) : 0,
    irregular_essentials:
      totalSpendingEur > 0 ? roundEur((baskets.irregular_essentials / totalSpendingEur) * 100) : 0,
    everyday_choices:
      totalSpendingEur > 0 ? roundEur((baskets.everyday_choices / totalSpendingEur) * 100) : 0,
  };

  return {
    monthKey: month.monthKey,
    monthLabel: month.monthLabel,
    primaryIncomeEur,
    sideIncomeEur,
    incomeEur,
    totalSpendingEur,
    remainingAfterSpendingEur,
    savingsRatePercent,
    baskets,
    basketSharesOfSpendingPercent,
  };
}

function resolveMonthsWindow(
  context: TrackerDatasetContext,
  periodMonth?: string,
  startMonth?: string,
  endMonth?: string
): { selectedMonths: MonthlyRecord[]; periodLabel: string } {
  if (periodMonth && periodMonth.toLowerCase() === 'year') {
    const populated = context.months.filter(
      (m) => m.txCount > 0 || Object.keys(m.manualOverrides).length > 0
    );
    const list = populated.length > 0 ? populated : context.months;
    return {
      selectedMonths: list,
      periodLabel: `Full Year ${context.year} (${list.length} months)`,
    };
  }

  if (periodMonth && periodMonth.toLowerCase() === 'last_month') {
    const activeIdx = context.months.findIndex((m) => m.monthKey === context.selectedMonthKey);
    const prevIdx = activeIdx > 0 ? activeIdx - 1 : Math.max(0, activeIdx);
    const m = context.months[prevIdx] || context.months[0];
    return { selectedMonths: [m], periodLabel: m.monthLabel };
  }

  if (startMonth && endMonth) {
    const filtered = context.months.filter(
      (m) => m.monthKey >= startMonth && m.monthKey <= endMonth
    );
    if (filtered.length > 0) {
      return {
        selectedMonths: filtered,
        periodLabel: `${filtered[0].monthLabel} – ${filtered[filtered.length - 1].monthLabel}`,
      };
    }
  }

  if (periodMonth) {
    const normalized = periodMonth.trim().toLowerCase();
    const match = context.months.find(
      (m) =>
        m.monthKey.toLowerCase() === normalized ||
        m.monthShort.toLowerCase() === normalized ||
        m.monthFullFi.toLowerCase() === normalized ||
        m.monthLabel.toLowerCase().startsWith(normalized)
    );
    if (match) {
      return { selectedMonths: [match], periodLabel: match.monthLabel };
    }
  }

  const fallback =
    context.months.find((m) => m.monthKey === context.selectedMonthKey) ||
    context.months[9] ||
    context.months[0];
  return { selectedMonths: [fallback], periodLabel: fallback.monthLabel };
}

function matchCategoryByQuery(query: string): typeof CATEGORIES {
  const q = (query || '').toLowerCase().trim();
  if (!q || q === 'all') return CATEGORIES;
  const direct = CATEGORIES.filter(
    (c) =>
      c.id.toLowerCase() === q ||
      c.label.toLowerCase().includes(q) ||
      c.labelFi.toLowerCase().includes(q) ||
      c.shortLabel.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q)
  );
  if (direct.length > 0) return direct;

  if (q.includes('coffee') || q.includes('lunch') || q.includes('dining') || q.includes('eat') || q.includes('cafe') || q.includes('café')) {
    return CATEGORIES.filter((c) => c.id === 'restaurants_cafes');
  }
  if (q.includes('food') || q.includes('market') || q.includes('prisma') || q.includes('grocer')) {
    return CATEGORIES.filter((c) => c.id === 'groceries');
  }
  if (q.includes('taxi') || q.includes('commut') || q.includes('bus') || q.includes('train') || q.includes('transit')) {
    return CATEGORIES.filter((c) => c.id === 'travel_taxis');
  }
  if (q.includes('car') || q.includes('fuel') || q.includes('tyre')) {
    return CATEGORIES.filter((c) => c.id === 'car_driving');
  }
  if (q.includes('rent') || q.includes('home') || q.includes('apart')) {
    return CATEGORIES.filter((c) => c.id === 'housing');
  }
  if (q.includes('doctor') || q.includes('dent') || q.includes('med')) {
    return CATEGORIES.filter((c) => c.id === 'health');
  }
  if (q.includes('wash') || q.includes('repair') || q.includes('appliance')) {
    return CATEGORIES.filter((c) => c.id === 'other_repairs');
  }
  return CATEGORIES;
}

// ============================================================================
// ALLOW-LISTED DETERMINISTIC BACKEND CALCULATIONS (FOR GEMINI FUNCTION CALLING)
// ============================================================================

export function toolGetCategorySpending(
  context: TrackerDatasetContext,
  args: { categoryQuery?: string; month?: string; startMonth?: string; endMonth?: string }
): Record<string, unknown> {
  const { selectedMonths, periodLabel } = resolveMonthsWindow(
    context,
    args.month,
    args.startMonth,
    args.endMonth
  );
  const matchedCategories = matchCategoryByQuery(args.categoryQuery || 'all');

  let grandTotalSpending = 0;
  for (const m of selectedMonths) {
    grandTotalSpending += computeMonthSummary(m).totalSpendingEur;
  }
  grandTotalSpending = roundEur(grandTotalSpending);

  const breakdown = matchedCategories.map((cat) => {
    const totalEur = roundEur(
      selectedMonths.reduce((acc, m) => acc + getEffectiveCategoryAmount(m, cat.id), 0)
    );
    const monthlyAverageEur = roundEur(totalEur / Math.max(1, selectedMonths.length));
    const shareOfTotalSpendingPercent =
      grandTotalSpending > 0 ? roundEur((totalEur / grandTotalSpending) * 100) : 0;

    return {
      categoryId: cat.id,
      categoryLabel: cat.label,
      categoryLabelFi: cat.labelFi,
      basket: cat.basket,
      totalEur,
      monthlyAverageEur,
      shareOfTotalSpendingPercent,
    };
  });

  const queriedTotalEur = roundEur(breakdown.reduce((s, b) => s + b.totalEur, 0));

  return {
    calculationType: 'category_spending',
    period: periodLabel,
    monthsCount: selectedMonths.length,
    dataSource: context.sourceLabel,
    includePsd2External: context.includePsd2External,
    customerId: context.customer.customer_id,
    queriedTotalEur,
    periodTotalSpendingEur: grandTotalSpending,
    categories: breakdown.sort((a, b) => b.totalEur - a.totalEur),
  };
}

export function toolCompareWithPreviousMonth(
  context: TrackerDatasetContext,
  args: { month?: string }
): Record<string, unknown> {
  const { selectedMonths } = resolveMonthsWindow(context, args.month);
  const target = selectedMonths[0];
  const prevIndex = target.monthIndex - 1;

  if (prevIndex < 0) {
    const summary = computeMonthSummary(target);
    return {
      calculationType: 'month_comparison',
      period: target.monthLabel,
      previousPeriod: null,
      note: `${target.monthLabel} is the first month in the ${context.year} tracker, so there is no earlier month in the same year to compare against.`,
      currentMonth: summary,
      dataSource: context.sourceLabel,
    };
  }

  const previous = context.months[prevIndex];
  const currSum = computeMonthSummary(target);
  const prevSum = computeMonthSummary(previous);

  const categoryDeltas = CATEGORIES.map((cat) => {
    const currentEur = getEffectiveCategoryAmount(target, cat.id);
    const previousEur = getEffectiveCategoryAmount(previous, cat.id);
    const deltaEur = roundEur(currentEur - previousEur);
    const deltaPercent = previousEur > 0 ? roundEur((deltaEur / previousEur) * 100) : null;
    return {
      categoryId: cat.id,
      categoryLabel: cat.label,
      basket: cat.basket,
      currentEur,
      previousEur,
      deltaEur,
      deltaPercent,
    };
  }).sort((a, b) => Math.abs(b.deltaEur) - Math.abs(a.deltaEur));

  return {
    calculationType: 'month_comparison',
    period: `${previous.monthLabel} vs ${target.monthLabel}`,
    dataSource: context.sourceLabel,
    customerId: context.customer.customer_id,
    currentMonth: currSum,
    previousMonth: prevSum,
    totalSpendingDeltaEur: roundEur(currSum.totalSpendingEur - prevSum.totalSpendingEur),
    totalSpendingDeltaPercent:
      prevSum.totalSpendingEur > 0
        ? roundEur(
            ((currSum.totalSpendingEur - prevSum.totalSpendingEur) / prevSum.totalSpendingEur) * 100
          )
        : null,
    remainingMoneyDeltaEur: roundEur(
      currSum.remainingAfterSpendingEur - prevSum.remainingAfterSpendingEur
    ),
    basketDeltasEur: {
      regular_essentials: roundEur(
        currSum.baskets.regular_essentials - prevSum.baskets.regular_essentials
      ),
      irregular_essentials: roundEur(
        currSum.baskets.irregular_essentials - prevSum.baskets.irregular_essentials
      ),
      everyday_choices: roundEur(
        currSum.baskets.everyday_choices - prevSum.baskets.everyday_choices
      ),
    },
    largestCategoryChanges: categoryDeltas.slice(0, 5),
  };
}

export function toolGetBasketTotals(
  context: TrackerDatasetContext,
  args: { month?: string }
): Record<string, unknown> {
  const { selectedMonths, periodLabel } = resolveMonthsWindow(context, args.month);

  let primaryIncomeTotal = 0;
  let sideIncomeTotal = 0;
  let incomeTotal = 0;
  let spendingTotal = 0;
  const basketTotals: Record<BasketId, number> = {
    regular_essentials: 0,
    irregular_essentials: 0,
    everyday_choices: 0,
  };

  for (const m of selectedMonths) {
    const s = computeMonthSummary(m);
    primaryIncomeTotal += s.primaryIncomeEur;
    sideIncomeTotal += s.sideIncomeEur;
    incomeTotal += s.incomeEur;
    spendingTotal += s.totalSpendingEur;
    basketTotals.regular_essentials += s.baskets.regular_essentials;
    basketTotals.irregular_essentials += s.baskets.irregular_essentials;
    basketTotals.everyday_choices += s.baskets.everyday_choices;
  }

  primaryIncomeTotal = roundEur(primaryIncomeTotal);
  sideIncomeTotal = roundEur(sideIncomeTotal);
  incomeTotal = roundEur(incomeTotal);
  spendingTotal = roundEur(spendingTotal);

  const populatedMonths = context.months.filter(
    (m) => m.txCount > 0 || Object.keys(m.manualOverrides).length > 0
  );
  const annualIrregularTotal = populatedMonths.reduce(
    (sum, m) => sum + computeMonthSummary(m).baskets.irregular_essentials,
    0
  );
  const recommendedMonthlyIrregularBufferEur = roundEur(
    annualIrregularTotal / Math.max(1, populatedMonths.length)
  );

  const basketDetails = BASKETS.map((b) => {
    const totalEur = roundEur(basketTotals[b.id]);
    return {
      basketId: b.id,
      basketLabel: b.label,
      totalEur,
      monthlyAverageEur: roundEur(totalEur / Math.max(1, selectedMonths.length)),
      shareOfSpendingPercent: spendingTotal > 0 ? roundEur((totalEur / spendingTotal) * 100) : 0,
      shareOfIncomePercent: incomeTotal > 0 ? roundEur((totalEur / incomeTotal) * 100) : 0,
    };
  });

  const remaining = roundEur(incomeTotal - spendingTotal);
  const savingsRatePercent = incomeTotal > 0 ? roundEur((remaining / incomeTotal) * 100) : 0;

  return {
    calculationType: 'three_baskets_summary',
    period: periodLabel,
    monthsCount: selectedMonths.length,
    dataSource: context.sourceLabel,
    customerId: context.customer.customer_id,
    primaryIncomeEur: primaryIncomeTotal,
    sideIncomeEur: sideIncomeTotal,
    incomeTotalEur: incomeTotal,
    spendingTotalEur: spendingTotal,
    remainingAfterSpendingEur: remaining,
    savingsRatePercent,
    recommendedMonthlyIrregularBufferEur,
    baskets: basketDetails,
  };
}

export function toolCalculateSafeToSpendAndSave(
  context: TrackerDatasetContext,
  args: { month?: string }
): Record<string, unknown> {
  const { selectedMonths, periodLabel } = resolveMonthsWindow(context, args.month);
  const targetMonth = selectedMonths[0];
  const summary = computeMonthSummary(targetMonth);

  const populatedMonths = context.months.filter(
    (m) => m.txCount > 0 || Object.keys(m.manualOverrides).length > 0
  );
  const divisor = Math.max(1, populatedMonths.length);

  // 12-month monthly irregular buffer so uneven essentials (broken washing machine, dental, tyres) are smoothed
  const annualIrregular = populatedMonths.reduce(
    (s, m) => s + computeMonthSummary(m).baskets.irregular_essentials,
    0
  );
  const irregularMonthlyBufferEur = roundEur(annualIrregular / divisor);

  // Historical average monthly surplus
  const avgMonthlyRemaining = roundEur(
    populatedMonths.reduce((s, m) => s + computeMonthSummary(m).remainingAfterSpendingEur, 0) /
      divisor
  );

  // Safe-to-Save recommendation: gentle, realistic ~10% of income or 60% of average positive surplus
  const tenPctIncome = summary.incomeEur * 0.1;
  const rawSafeToSave =
    avgMonthlyRemaining > 0 ? Math.min(tenPctIncome, avgMonthlyRemaining * 0.65) : summary.incomeEur * 0.05;
  const safeToSaveMonthlyEur = roundEur(Math.max(0, rawSafeToSave));

  const daysInMonth =
    [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][targetMonth.monthIndex] || 30;
  const weeksInMonth = roundEur(daysInMonth / 7);

  // Remaining room for everyday spending (groceries, cafés, transit/taxis, entertainment, hobbies)
  const monthlySafeEverydayPoolEur = roundEur(
    Math.max(
      0,
      summary.incomeEur -
        summary.baskets.regular_essentials -
        irregularMonthlyBufferEur -
        safeToSaveMonthlyEur
    )
  );

  const safeToSpendWeeklyEur = roundEur(monthlySafeEverydayPoolEur / weeksInMonth);
  const actualEverydayWeeklyPaceEur = roundEur(summary.baskets.everyday_choices / weeksInMonth);

  return {
    calculationType: 'safe_to_spend_and_save_estimate',
    isEstimate: true,
    estimateDisclaimer:
      'Planning estimate calculated from monthly tracker figures and 12-month irregular buffer — NOT a live S-Pankki account balance.',
    period: periodLabel,
    dataSource: context.sourceLabel,
    includePsd2External: context.includePsd2External,
    customerId: context.customer.customer_id,
    daysInMonth,
    weeksInMonth,
    monthlyIncomeEur: summary.incomeEur,
    mandatoryRegularBillsEur: summary.baskets.regular_essentials,
    irregularEssentialsMonthlyBufferEur: irregularMonthlyBufferEur,
    safeToSaveMonthlyEur,
    monthlySafeEverydayPoolEur,
    safeToSpendWeeklyEur,
    actualSelectedMonthEverydayWeeklyPaceEur: actualEverydayWeeklyPaceEur,
    projectedMonthEndRemainingActualEur: summary.remainingAfterSpendingEur,
  };
}

export function toolAnalyzeSpenderProfile(
  context: TrackerDatasetContext
): Record<string, unknown> {
  const populated = context.months.filter(
    (m) => m.txCount > 0 || Object.keys(m.manualOverrides).length > 0
  );
  const divisor = Math.max(1, populated.length);
  const summaries = populated.map((m) => computeMonthSummary(m));

  const avgIncome = roundEur(summaries.reduce((s, m) => s + m.incomeEur, 0) / divisor);
  const avgSpending = roundEur(summaries.reduce((s, m) => s + m.totalSpendingEur, 0) / divisor);
  const avgRemaining = roundEur(avgIncome - avgSpending);
  const avgSavingsRatePercent = avgIncome > 0 ? roundEur((avgRemaining / avgIncome) * 100) : 0;

  const avgRegular = roundEur(
    summaries.reduce((s, m) => s + m.baskets.regular_essentials, 0) / divisor
  );
  const avgIrregular = roundEur(
    summaries.reduce((s, m) => s + m.baskets.irregular_essentials, 0) / divisor
  );
  const avgEveryday = roundEur(
    summaries.reduce((s, m) => s + m.baskets.everyday_choices, 0) / divisor
  );

  const everydaySharePct = avgSpending > 0 ? roundEur((avgEveryday / avgSpending) * 100) : 0;
  const maxIrregularMonth = summaries.reduce(
    (best, cur) =>
      cur.baskets.irregular_essentials > best.baskets.irregular_essentials ? cur : best,
    summaries[0]
  );

  // Small-habit frequency from transaction stream
  const cafeTxs = context.recentTransactions.filter(
    (t) => t.tx_amount_eur < 0 && (t.mcc_code === '5814' || t.mcc_code === '5812')
  );
  const taxiTxs = context.recentTransactions.filter(
    (t) => t.tx_amount_eur < 0 && t.mcc_code === '4121'
  );

  let profileTitle = 'Balanced Everyday Planner';
  let profileSummary =
    'Your fixed commitments and flexible habits stay well balanced across the year, with occasional uneven bills.';

  if (everydaySharePct >= 44 && cafeTxs.length + taxiTxs.length > 60) {
    profileTitle = 'Experience & Convenience Spender';
    profileSummary =
      'Fixed housing costs are predictable, while convenience habits (coffees, dining out, and evening rides) make up a lively share of everyday cash flow.';
  } else if (maxIrregularMonth.baskets.irregular_essentials > avgIrregular * 2.1) {
    profileTitle = 'Steady Baseline with Lumpy Seasonal Spikes';
    profileSummary =
      'Day-to-day spending is consistent, and your biggest month-to-month swings come from necessary irregular events (such as repairs, car maintenance, or healthcare).';
  } else if (avgSavingsRatePercent >= 18) {
    profileTitle = 'High-Margin Cushion Builder';
    profileSummary =
      'You consistently keep expenses comfortably below total income, building strong monthly breathing room.';
  }

  // Top 3 non-housing categories
  const nonHousingRanking = CATEGORIES.filter((c) => c.id !== 'housing')
    .map((cat) => {
      const avg = roundEur(
        populated.reduce((s, m) => s + getEffectiveCategoryAmount(m, cat.id), 0) / divisor
      );
      return { categoryLabel: cat.label, basket: cat.basket, monthlyAverageEur: avg };
    })
    .sort((a, b) => b.monthlyAverageEur - a.monthlyAverageEur)
    .slice(0, 4);

  return {
    calculationType: 'spender_profile_analysis',
    period: `Full Year ${context.year} (${divisor} months)`,
    dataSource: context.sourceLabel,
    customerId: context.customer.customer_id,
    profileTitle,
    profileSummary,
    monthlyAverageIncomeEur: avgIncome,
    monthlyAverageSpendingEur: avgSpending,
    monthlyAverageRemainingEur: avgRemaining,
    averageSavingsRatePercent: avgSavingsRatePercent,
    monthlyBasketAveragesEur: {
      mandatoryRegular: avgRegular,
      mandatoryIrregular: avgIrregular,
      everydaySpending: avgEveryday,
    },
    everydayShareOfSpendingPercent: everydaySharePct,
    peakIrregularMonth: {
      monthLabel: maxIrregularMonth.monthLabel,
      irregularAmountEur: maxIrregularMonth.baskets.irregular_essentials,
    },
    annualHabitFrequencies: {
      diningAndCoffeeTransactions: cafeTxs.length,
      diningAndCoffeeTotalEur: roundEur(
        cafeTxs.reduce((s, t) => s + Math.abs(t.tx_amount_eur), 0)
      ),
      taxiTransactionsMcc4121: taxiTxs.length,
      taxiTotalEur: roundEur(taxiTxs.reduce((s, t) => s + Math.abs(t.tx_amount_eur), 0)),
    },
    topEverydayAndIrregularCategories: nonHousingRanking,
  };
}

export function toolCompareWithPopulationBenchmark(
  context: TrackerDatasetContext,
  args: { categoryQuery?: string }
): Record<string, unknown> {
  const benchmark = getStatFinBenchmarkForCustomer(context.customer);
  const populated = context.months.filter(
    (m) => m.txCount > 0 || Object.keys(m.manualOverrides).length > 0
  );
  const divisor = Math.max(1, populated.length);

  const matchedCats = matchCategoryByQuery(args.categoryQuery || 'all');

  const comparisons = matchedCats.map((cat) => {
    const userMonthlyAvgEur = roundEur(
      populated.reduce((s, m) => s + getEffectiveCategoryAmount(m, cat.id), 0) / divisor
    );
    const peerMedianEur = benchmark.monthlyMedianByCategoryEur[cat.id];
    const diffEur = roundEur(userMonthlyAvgEur - peerMedianEur);
    const diffPercent = peerMedianEur > 0 ? roundEur((diffEur / peerMedianEur) * 100) : 0;

    return {
      categoryId: cat.id,
      categoryLabel: cat.label,
      basket: cat.basket,
      userMonthlyAvgEur,
      statFinPeerMedianEur: peerMedianEur,
      differenceEur: diffEur,
      differencePercent: diffPercent,
    };
  });

  return {
    calculationType: 'population_benchmark_comparison',
    period: `${context.year} monthly average (${divisor} months)`,
    dataSource: context.sourceLabel,
    benchmarkCohort: benchmark.cohortLabel,
    benchmarkSource: benchmark.sourceCitation,
    customerId: context.customer.customer_id,
    comparisons,
    pedagogyNote:
      'Population medians are descriptive open-data context (MyData spirit), not rules for how anyone should live.',
  };
}

export function toolSimulateWhatIfReduction(
  context: TrackerDatasetContext,
  args: {
    targetQuery?: string;
    percentReduction?: number;
    monthlyAmountReductionEur?: number;
    month?: string;
  }
): Record<string, unknown> {
  const { selectedMonths, periodLabel } = resolveMonthsWindow(context, args.month);
  const targetMonth = selectedMonths[0];
  const monthSummary = computeMonthSummary(targetMonth);

  const q = (args.targetQuery || 'restaurants_cafes').toLowerCase().trim();
  let targetLabel = 'Wants & Whims (everyday choices)';
  let baselineMonthlyEur = monthSummary.baskets.everyday_choices;

  const basketMatch = BASKETS.find((b) => b.id === q || b.label.toLowerCase().includes(q));
  if (basketMatch) {
    targetLabel = basketMatch.label;
    baselineMonthlyEur = monthSummary.baskets[basketMatch.id];
  } else {
    const matchedCats = matchCategoryByQuery(q);
    if (matchedCats.length > 0 && matchedCats.length < CATEGORIES.length) {
      targetLabel = matchedCats.map((c) => c.label).join(', ');
      baselineMonthlyEur = roundEur(
        matchedCats.reduce((s, c) => s + getEffectiveCategoryAmount(targetMonth, c.id), 0)
      );
    }
  }

  let monthlySavedEur = 0;
  let effectivePercent = 0;

  if (args.monthlyAmountReductionEur !== undefined && args.monthlyAmountReductionEur > 0) {
    monthlySavedEur = roundEur(Math.min(baselineMonthlyEur, args.monthlyAmountReductionEur));
    effectivePercent =
      baselineMonthlyEur > 0 ? roundEur((monthlySavedEur / baselineMonthlyEur) * 100) : 0;
  } else {
    const pct = Math.min(100, Math.max(1, args.percentReduction ?? 20));
    effectivePercent = roundEur(pct);
    monthlySavedEur = roundEur(baselineMonthlyEur * (pct / 100));
  }

  const newMonthlyTargetSpendEur = roundEur(Math.max(0, baselineMonthlyEur - monthlySavedEur));
  const annualSavedEur = roundEur(monthlySavedEur * 12);
  const threeYearBufferNoReturnEur = roundEur(annualSavedEur * 3);
  const monthlyRate = 0.04 / 12;
  const threeYearWithModest4PctReturnEur = roundEur(
    monthlySavedEur * ((Math.pow(1 + monthlyRate, 36) - 1) / monthlyRate)
  );

  const newRemaining = roundEur(monthSummary.remainingAfterSpendingEur + monthlySavedEur);
  const newSavingsRatePercent =
    monthSummary.incomeEur > 0 ? roundEur((newRemaining / monthSummary.incomeEur) * 100) : null;

  return {
    calculationType: 'what_if_scenario',
    period: `${periodLabel} baseline projected over 12–36 months`,
    dataSource: context.sourceLabel,
    customerId: context.customer.customer_id,
    targetLabel,
    baselineMonthlyEur,
    effectivePercentReduction: effectivePercent,
    newMonthlyTargetSpendEur,
    monthlySavedEur,
    annualSavedEur,
    newMonthlyRemainingAfterSpendingEur: newRemaining,
    previousSavingsRatePercent: monthSummary.savingsRatePercent,
    newSavingsRatePercent,
    threeYearBufferNoReturnEur,
    threeYearIllustrative4PctEur: threeYearWithModest4PctReturnEur,
  };
}

export function toolLookupMerchantOrMccSpending(
  context: TrackerDatasetContext,
  args: { searchTerm?: string; mccCode?: string; month?: string }
): Record<string, unknown> {
  const query = (args.searchTerm || '').toLowerCase().trim();
  const mccQuery = (args.mccCode || '').trim();
  const rawMonthArg = (args.month || '').trim().toLowerCase();

  let resolvedMonthPrefix = '';
  let periodDescription = `Full Year ${context.year}`;

  if (rawMonthArg && rawMonthArg !== 'year' && rawMonthArg !== 'all') {
    const { selectedMonths, periodLabel } = resolveMonthsWindow(context, rawMonthArg);
    resolvedMonthPrefix = selectedMonths[0].monthKey;
    periodDescription = periodLabel;
  }

  const inferredMcc =
    mccQuery ||
    (query.includes('taxi') || query.includes('cab') || query.includes('rideshare') ? '4121' : '');

  const filteredByPeriod = context.recentTransactions.filter((tx) => {
    if (!resolvedMonthPrefix) return tx.tx_date.startsWith(String(context.year));
    return tx.tx_date.startsWith(resolvedMonthPrefix);
  });

  const matches = filteredByPeriod.filter((tx) => {
    if (tx.tx_amount_eur >= 0) return false;
    const txTypeUpper = (tx.transaction_type || '').toUpperCase();
    if (txTypeUpper.includes('INVEST') || txTypeUpper.includes('SWEEP')) return false;
    const matchesMcc = inferredMcc ? tx.mcc_code === inferredMcc : false;
    const matchesReceiptItem =
      query && tx.eReceiptItems
        ? tx.eReceiptItems.some(
            (it) =>
              it.name.toLowerCase().includes(query) ||
              (it.department || '').toLowerCase().includes(query)
          )
        : false;
    const matchesText = query
      ? (tx.merchant_label || '').toLowerCase().includes(query) ||
        (tx.merchant_id || '').toLowerCase().includes(query) ||
        (tx.category || '').toLowerCase().includes(query) ||
        (tx.storeChain || '').toLowerCase().includes(query) ||
        matchesReceiptItem
      : false;
    return matchesMcc || matchesText;
  });

  const totalEur = roundEur(matches.reduce((sum, tx) => sum + Math.abs(tx.tx_amount_eur), 0));
  const hasReadableLabels = context.recentTransactions.some((tx) => Boolean(tx.merchant_label));

  return {
    calculationType: 'merchant_or_mcc_lookup',
    period: periodDescription,
    dataSource: context.sourceLabel,
    customerId: context.customer.customer_id,
    searchTerm: args.searchTerm || null,
    mccCodeUsed: inferredMcc || null,
    searchableMerchantLabelsAvailable: hasReadableLabels,
    matchingTransactionCount: matches.length,
    totalSpendingEur: totalEur,
    averageTransactionEur: matches.length > 0 ? roundEur(totalEur / matches.length) : 0,
    sampleMatches: matches.slice(0, 6).map((m) => ({
      date: m.tx_date,
      amountEur: Math.abs(m.tx_amount_eur),
      mcc: m.mcc_code,
      category: m.category,
      merchant: m.merchant_label || m.merchant_id,
      provider: m.account_provider || 'S-Pankki',
    })),
  };
}

export function toolGetInteractiveHabitsSummary(
  context: TrackerDatasetContext
): Record<string, unknown> {
  const inter = context.interactiveSummary || {
    oopsJarSavedEur: 0,
    oopsJarTargetEur: 450,
    ratedCount: 0,
    worthItTotalEur: 0,
    skipNextTotalEur: 0,
    activeQuestDaysCompleted: 0,
    estimatedWeeklyQuestSavingsEur: 0,
    loggedSpendCount: 0,
  };
  return {
    calculationType: 'interactive_habits_summary',
    period: context.selectedMonthKey,
    customerId: context.customer.customer_id,
    ...inter,
    annualizedSkipNextSavingsEur: roundEur(inter.skipNextTotalEur * 12),
    oopsJarCoveragePercent:
      inter.oopsJarTargetEur > 0
        ? roundEur((inter.oopsJarSavedEur / inter.oopsJarTargetEur) * 100)
        : 0,
  };
}

export function toolGetEReceiptSplitSummary(
  context: TrackerDatasetContext,
  args: { month?: string } = {}
): Record<string, unknown> {
  const rawMonthArg = (args.month || context.selectedMonthKey).trim().toLowerCase();
  let monthPrefix = context.selectedMonthKey;
  let periodLabel = context.selectedMonthKey;

  if (rawMonthArg === 'year' || rawMonthArg === 'all') {
    monthPrefix = `${context.year}-`;
    periodLabel = `Full Year ${context.year}`;
  } else {
    const { selectedMonths, periodLabel: resolvedLabel } = resolveMonthsWindow(context, rawMonthArg);
    monthPrefix = selectedMonths[0].monthKey;
    periodLabel = resolvedLabel;
  }

  const splitSummary = summarizeEReceiptSplits(context.recentTransactions, monthPrefix);
  const shiftedCategories = Object.entries(splitSummary.byCategoryEur)
    .map(([catId, amount]) => {
      const catDef = CATEGORIES.find((c) => c.id === catId);
      return {
        categoryId: catId,
        categoryLabel: catDef?.label || catId,
        shortLabel: catDef?.shortLabel || catId,
        basket: catDef?.basket || 'everyday_choices',
        shiftedAmountEur: roundEur(Number(amount || 0)),
      };
    })
    .filter((c) => c.shiftedAmountEur > 0)
    .sort((a, b) => b.shiftedAmountEur - a.shiftedAmountEur);

  return {
    calculationType: 's_group_ereceipt_split_summary',
    period: periodLabel,
    customerId: context.customer.customer_id,
    splitEReceiptsActive: context.splitEReceipts !== false,
    receiptCount: splitSummary.receiptCount,
    totalHypermarketReceiptSpendEur: splitSummary.totalReceiptSpendEur,
    pureGroceriesPortionEur: splitSummary.pureGroceriesEur,
    reclassifiedNonFoodEur: splitSummary.reclassifiedNonFoodEur,
    shiftedCategories,
  };
}

export function executeAllowListedTool(
  toolName: string,
  args: Record<string, unknown>,
  context: TrackerDatasetContext
): Record<string, unknown> {
  switch (toolName) {
    case 'get_category_spending':
      return toolGetCategorySpending(context, {
        categoryQuery: typeof args.categoryQuery === 'string' ? args.categoryQuery : undefined,
        month: typeof args.month === 'string' ? args.month : undefined,
        startMonth: typeof args.startMonth === 'string' ? args.startMonth : undefined,
        endMonth: typeof args.endMonth === 'string' ? args.endMonth : undefined,
      });
    case 'compare_with_previous_month':
      return toolCompareWithPreviousMonth(context, {
        month: typeof args.month === 'string' ? args.month : undefined,
      });
    case 'get_basket_totals':
      return toolGetBasketTotals(context, {
        month: typeof args.month === 'string' ? args.month : undefined,
      });
    case 'calculate_safe_to_spend_and_save':
    case 'estimate_weekly_cash_flow_pace':
      return toolCalculateSafeToSpendAndSave(context, {
        month: typeof args.month === 'string' ? args.month : undefined,
      });
    case 'analyze_spender_profile':
      return toolAnalyzeSpenderProfile(context);
    case 'compare_with_population_benchmark':
      return toolCompareWithPopulationBenchmark(context, {
        categoryQuery: typeof args.categoryQuery === 'string' ? args.categoryQuery : undefined,
      });
    case 'simulate_what_if_reduction':
      return toolSimulateWhatIfReduction(context, {
        targetQuery: typeof args.targetQuery === 'string' ? args.targetQuery : undefined,
        percentReduction:
          typeof args.percentReduction === 'number' ? args.percentReduction : undefined,
        monthlyAmountReductionEur:
          typeof args.monthlyAmountReductionEur === 'number'
            ? args.monthlyAmountReductionEur
            : undefined,
        month: typeof args.month === 'string' ? args.month : undefined,
      });
    case 'lookup_merchant_or_mcc_spending':
      return toolLookupMerchantOrMccSpending(context, {
        searchTerm: typeof args.searchTerm === 'string' ? args.searchTerm : undefined,
        mccCode: typeof args.mccCode === 'string' ? args.mccCode : undefined,
        month: typeof args.month === 'string' ? args.month : undefined,
      });
    case 'get_interactive_habits_summary':
      return toolGetInteractiveHabitsSummary(context);
    case 'get_ereceipt_split_summary':
      return toolGetEReceiptSplitSummary(context, {
        month: typeof args.month === 'string' ? args.month : undefined,
      });
    default:
      return { error: `Tool "${toolName}" is not in the allow-listed financial calculator set.` };
  }
}

// ============================================================================
// TRANSPARENT LOCAL DETERMINISTIC COACH COMPOSER (FALLBACK WHEN GEMINI KEY UNSET)
// ============================================================================

export function buildDeterministicCoachFallback(
  question: string,
  context: TrackerDatasetContext,
  _fallbackReason: string
): {
  answer: string;
  supportingPeriod: string;
  dataSource: string;
  toolTraces: ToolTraceItem[];
} {
  const q = question.toLowerCase();
  const toolTraces: ToolTraceItem[] = [];

  if (
    q.includes('skip-list') ||
    q.includes('skip list') ||
    q.includes('worth it') ||
    q.includes('oops jar') ||
    q.includes('quest')
  ) {
    const result = toolGetInteractiveHabitsSummary(context);
    toolTraces.push({ toolName: 'get_interactive_habits_summary', args: {}, result });
    const skipMo = Number(result.skipNextTotalEur || 0);
    const skipYr = Number(result.annualizedSkipNextSavingsEur || 0);
    const worthEur = Number(result.worthItTotalEur || 0);
    const jarEur = Number(result.oopsJarSavedEur || 0);
    const jarTarget = Number(result.oopsJarTargetEur || 450);
    const questEur = Number(result.estimatedWeeklyQuestSavingsEur || 0);

    const answer =
      `Your active check-ins unlocked **+€${skipMo.toFixed(0)}/mo** (**€${skipYr.toFixed(0)}/yr**) in painless "skip next time" wins.\n\n` +
      `- **Worth every cent:** **€${worthEur.toFixed(0)}** rated pure joy\n` +
      `- **Oops! Jar:** **€${jarEur.toFixed(0)} / €${jarTarget.toFixed(0)}** (${result.oopsJarCoveragePercent}% ready)\n` +
      `- **7-Day Quests:** **+€${questEur.toFixed(0)}** earned this week\n\n` +
      `Trimming only what felt "meh" protects the habits you genuinely enjoy.`;

    return {
      answer,
      supportingPeriod: context.selectedMonthKey,
      dataSource: context.sourceLabel,
      toolTraces,
    };
  }

  let monthArg: string | undefined = context.selectedMonthKey;
  if (q.includes('last month')) {
    monthArg = 'last_month';
  } else if (q.includes('full year') || q.includes('this year') || q.includes('annual')) {
    monthArg = 'year';
  } else {
    for (const m of context.months) {
      if (
        q.includes(m.monthLabel.toLowerCase().split(' ')[0]) ||
        q.includes(m.monthFullFi.toLowerCase()) ||
        q.includes(m.monthKey.toLowerCase())
      ) {
        monthArg = m.monthKey;
        break;
      }
    }
  }

  // 0. S-ryhmä e-Receipts (Kassakuitti) item splitting
  if (
    q.includes('receipt') ||
    q.includes('kuitti') ||
    q.includes('prisma') ||
    q.includes('shirt') ||
    q.includes('paita') ||
    q.includes('s-ryhm') ||
    q.includes('non-food')
  ) {
    const args = { month: monthArg };
    const result = toolGetEReceiptSplitSummary(context, args);
    toolTraces.push({ toolName: 'get_ereceipt_split_summary', args, result });

    const count = Number(result.receiptCount || 0);
    const shifted = Number(result.reclassifiedNonFoodEur || 0);
    const foodOnly = Number(result.pureGroceriesPortionEur || 0);
    const period = String(result.period);
    const cats = (result.shiftedCategories as Array<Record<string, unknown>>) || [];
    const splitOn = Boolean(result.splitEReceiptsActive);

    const catBullets =
      cats.length > 0
        ? cats
            .slice(0, 3)
            .map(
              (c) =>
                `- **${c.shortLabel}:** **€${Number(c.shiftedAmountEur).toFixed(2)}** moved from Groceries`
            )
            .join('\n')
        : `- **Pure groceries:** **€${foodOnly.toFixed(2)}** across ${count} receipts`;

    const answer =
      `S-ryhmä e-receipts split **€${shifted.toFixed(2)}** of non-food goods out of Groceries in **${period}** (${count} Prisma receipts).\n\n` +
      `${catBullets}\n\n` +
      `e-Receipt Split is currently **${splitOn ? 'ON' : 'OFF'}** — items like a €15 Prisma shirt land directly in **Clothing**.`;

    return { answer, supportingPeriod: period, dataSource: context.sourceLabel, toolTraces };
  }

  // 1. "How much did I spend on taxis last month?"
  if (q.includes('taxi') || q.includes('rideshare') || q.includes('mcc') || q.includes('cab')) {
    const args = { searchTerm: 'taxi', mccCode: '4121', month: monthArg };
    const result = toolLookupMerchantOrMccSpending(context, args);
    toolTraces.push({ toolName: 'lookup_merchant_or_mcc_spending', args, result });

    const count = Number(result.matchingTransactionCount || 0);
    const total = Number(result.totalSpendingEur || 0);
    const avg = Number(result.averageTransactionEur || 0);
    const period = String(result.period);

    const answer =
      count > 0
        ? `**€${total.toFixed(2)}** across **${count} taxi rides** in **${period}** (avg **€${avg.toFixed(2)}/ride**, MCC \`4121\`).\n\n` +
          `Lives in **Wants & Whims** — skipping 1 ride/mo frees **~€${avg.toFixed(0)}/mo** (**€${(avg * 12).toFixed(0)}/yr**).`
        : `**€0** on taxis (MCC \`4121\`) in **${period}**.`;

    return { answer, supportingPeriod: period, dataSource: context.sourceLabel, toolTraces };
  }

  // 2. "What kind of spender am I?"
  if (q.includes('what kind of spender') || q.includes('spender am i') || q.includes('my profile') || q.includes('spending style')) {
    const result = toolAnalyzeSpenderProfile(context);
    toolTraces.push({ toolName: 'analyze_spender_profile', args: {}, result });
    const period = String(result.period);
    const habits = result.annualHabitFrequencies as Record<string, number>;
    const peak = result.peakIrregularMonth as Record<string, unknown>;

    const answer =
      `Spender style: **${result.profileTitle}** (**${result.averageSavingsRatePercent}%** avg savings rate).\n\n` +
      `- Income **€${Number(result.monthlyAverageIncomeEur).toFixed(0)}/mo** vs expenses **€${Number(result.monthlyAverageSpendingEur).toFixed(0)}/mo**\n` +
      `- **Wants & Whims (${result.everydayShareOfSpendingPercent}%):** ${habits.diningAndCoffeeTransactions} café/dining visits (€${habits.diningAndCoffeeTotalEur.toFixed(0)}/yr) · ${habits.taxiTransactionsMcc4121} taxis (€${habits.taxiTotalEur.toFixed(0)}/yr)\n` +
      `- Biggest **Must & Oops!** spike: **${peak.monthLabel}** (**€${Number(peak.irregularAmountEur).toFixed(0)}**)`;

    return { answer, supportingPeriod: period, dataSource: context.sourceLabel, toolTraces };
  }

  // 3. "What is safe for me to spend this week?" / Safe-to-save
  if (q.includes('safe') || q.includes('week') || q.includes('pace') || q.includes('allowance')) {
    const args = { month: monthArg === 'year' ? context.selectedMonthKey : monthArg };
    const result = toolCalculateSafeToSpendAndSave(context, args);
    toolTraces.push({ toolName: 'calculate_safe_to_spend_and_save', args, result });
    const period = String(result.period);

    const answer =
      `Safe for **Wants & Whims**: **~€${Number(result.safeToSpendWeeklyEur).toFixed(0)} / week** in **${period}**.\n\n` +
      `- Fixed **Must & Usual** covered: **€${Number(result.mandatoryRegularBillsEur).toFixed(0)}/mo**\n` +
      `- **Must & Oops!** buffer: **€${Number(result.irregularEssentialsMonthlyBufferEur).toFixed(0)}/mo**\n` +
      `- Safe to save: **€${Number(result.safeToSaveMonthlyEur).toFixed(0)}/mo**\n\n` +
      `*Planning estimate from tracker data — not a live account balance.*`;

    return { answer, supportingPeriod: period, dataSource: context.sourceLabel, toolTraces };
  }

  // 4. Statistics Finland Benchmark comparison
  if (q.includes('benchmark') || q.includes('statistics finland') || q.includes('tilastokeskus') || q.includes('peer') || q.includes('average finn')) {
    const args = { categoryQuery: 'all' };
    const result = toolCompareWithPopulationBenchmark(context, args);
    toolTraces.push({ toolName: 'compare_with_population_benchmark', args, result });
    const period = String(result.period);
    const comps = (result.comparisons as Array<Record<string, unknown>>)
      .slice()
      .sort((a, b) => Math.abs(Number(b.differenceEur)) - Math.abs(Number(a.differenceEur)))
      .slice(0, 4);

    const lines = comps
      .map((c) => {
        const diff = Number(c.differenceEur);
        const sign = diff >= 0 ? `+€${diff.toFixed(0)}` : `−€${Math.abs(diff).toFixed(0)}`;
        return `- **${c.categoryLabel}:** €${Number(c.userMonthlyAvgEur).toFixed(0)}/mo (${sign} vs €${Number(c.statFinPeerMedianEur).toFixed(0)} peer)`;
      })
      .join('\n');

    const answer =
      `You vs. **${result.benchmarkCohort}** medians:\n\n` +
      `${lines}\n\n` +
      `Open-data context only — spend where you get real value.`;

    return { answer, supportingPeriod: period, dataSource: context.sourceLabel, toolTraces };
  }

  // 5. "How much could I save if I reduced dining out by 20%?"
  if (q.includes('what if') || q.includes('reduce') || q.includes('cut') || q.includes('save if') || q.includes('%')) {
    const pctMatch = q.match(/(\d+(?:\.\d+)?)\s*%/);
    const eurMatch = q.match(/€\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:eur|euro)/i);
    let targetQuery = 'restaurants_cafes';
    if (q.includes('grocer')) targetQuery = 'groceries';
    else if (q.includes('taxi') || q.includes('travel')) targetQuery = 'travel_taxis';
    else if (q.includes('entertain')) targetQuery = 'entertainment_electronics';
    else if (q.includes('everyday')) targetQuery = 'everyday_choices';

    const args: {
      targetQuery: string;
      percentReduction?: number;
      monthlyAmountReductionEur?: number;
      month: string;
    } = {
      targetQuery,
      month: monthArg === 'year' || monthArg === 'last_month' ? context.selectedMonthKey : (monthArg || context.selectedMonthKey),
    };
    if (eurMatch) {
      args.monthlyAmountReductionEur = Number(eurMatch[1] || eurMatch[2]);
    } else {
      args.percentReduction = pctMatch ? Number(pctMatch[1]) : 20;
    }

    const result = toolSimulateWhatIfReduction(context, args);
    toolTraces.push({ toolName: 'simulate_what_if_reduction', args, result });
    const period = String(result.period);

    const answer =
      `Trimming **${result.targetLabel}** by **${result.effectivePercentReduction}%** saves **+€${Number(result.monthlySavedEur).toFixed(0)}/mo**.\n\n` +
      `- **1 year:** **€${Number(result.annualSavedEur).toFixed(0)}** (savings rate **${result.previousSavingsRatePercent ?? 0}% → ${result.newSavingsRatePercent ?? 0}%**)\n` +
      `- **3 years:** **€${Number(result.threeYearBufferNoReturnEur).toFixed(0)}** cash (**~€${Number(result.threeYearIllustrative4PctEur).toFixed(0)}** at 4%/yr)`;

    return { answer, supportingPeriod: period, dataSource: context.sourceLabel, toolTraces };
  }

  // 6. Month comparison
  if (q.includes('compar') || q.includes('previous') || q.includes('change') || q.includes('spike')) {
    const args = { month: monthArg === 'year' ? context.selectedMonthKey : monthArg };
    const result = toolCompareWithPreviousMonth(context, args);
    toolTraces.push({ toolName: 'compare_with_previous_month', args, result });
    const period = String(result.period);

    if (!result.previousMonth) {
      return {
        answer: `${result.note}`,
        supportingPeriod: period,
        dataSource: context.sourceLabel,
        toolTraces,
      };
    }

    const delta = Number(result.totalSpendingDeltaEur || 0);
    const dir = delta >= 0 ? `+€${delta.toFixed(0)}` : `−€${Math.abs(delta).toFixed(0)}`;
    const topChanges = (result.largestCategoryChanges as Array<Record<string, unknown>>).slice(0, 3);
    const bullets = topChanges
      .map((c) => {
        const d = Number(c.deltaEur || 0);
        return `- **${c.categoryLabel}:** €${Number(c.currentEur).toFixed(0)} (${d >= 0 ? '+' : '−'}€${Math.abs(d).toFixed(0)})`;
      })
      .join('\n');

    const answer =
      `**${period}** total shift: **${dir}**\n\n${bullets}\n\n` +
      `Check if one-off **Must & Oops!** bills drove the swing.`;

    return { answer, supportingPeriod: period, dataSource: context.sourceLabel, toolTraces };
  }

  // Default: Three Baskets + Safe-to-Spend overview
  const args = { month: monthArg };
  const result = toolGetBasketTotals(context, args);
  toolTraces.push({ toolName: 'get_basket_totals', args, result });
  const baskets = result.baskets as Array<Record<string, unknown>>;
  const period = String(result.period);

  const lines = baskets
    .map(
      (b) =>
        `- **${b.basketLabel}:** **€${Number(b.totalEur).toFixed(0)}** (${b.shareOfSpendingPercent}%)`
    )
    .join('\n');

  const answer =
    `**${period}** net: **€${Number(result.remainingAfterSpendingEur).toFixed(0)}** (**${result.savingsRatePercent}%** saved)\n\n` +
    `${lines}\n\n` +
    `Suggested **Must & Oops!** buffer: **€${Number(result.recommendedMonthlyIrregularBufferEur).toFixed(0)}/mo**.`;

  return { answer, supportingPeriod: period, dataSource: context.sourceLabel, toolTraces };
}

export interface ContextualTip {
  id: string;
  kicker: string;
  title: string;
  body: string;
  metricText: string;
}

export function generateContextualTips(context: TrackerDatasetContext): ContextualTip[] {
  const activeMonth =
    context.months.find((m) => m.monthKey === context.selectedMonthKey) ||
    context.months[9] ||
    context.months[0];
  const summary = computeMonthSummary(activeMonth);

  const populatedMonths = context.months.filter(
    (m) => m.txCount > 0 || Object.keys(m.manualOverrides).length > 0
  );
  const divisor = Math.max(1, populatedMonths.length);
  const annualIrregularTotal = roundEur(
    populatedMonths.reduce((acc, m) => acc + computeMonthSummary(m).baskets.irregular_essentials, 0)
  );
  const irregularBufferMonthly = roundEur(annualIrregularTotal / divisor);

  const everydayChoicesList = CATEGORIES.filter((c) => c.basket === 'everyday_choices')
    .map((c) => ({
      cat: c,
      amount: roundEur(getEffectiveCategoryAmount(activeMonth, c.id)),
    }))
    .sort((a, b) => b.amount - a.amount);
  const topEveryday = everydayChoicesList[0];
  const tenPercentAnnualShift = topEveryday ? Math.round(topEveryday.amount * 0.1 * 12) : 0;

  const tips: ContextualTip[] = [
    {
      id: 'irregular-smoothing',
      kicker: 'Must & Oops!',
      title:
        summary.baskets.irregular_essentials > irregularBufferMonthly * 1.15
          ? `Plot-twist month (€${Math.round(summary.baskets.irregular_essentials)})`
          : `Oops buffer on track`,
      body:
        summary.baskets.irregular_essentials > irregularBufferMonthly * 1.15
          ? `Above your €${Math.round(irregularBufferMonthly)}/mo average — uneven essentials, not bad habits.`
          : `Parking €${Math.round(irregularBufferMonthly)}/mo covers surprise repairs painlessly.`,
      metricText: `Avg €${Math.round(irregularBufferMonthly)}/mo`,
    },
    {
      id: 'everyday-priorities',
      kicker: 'Wants & Whims',
      title: topEveryday
        ? `Top habit: ${topEveryday.cat.shortLabel} (€${Math.round(topEveryday.amount)})`
        : `Wants & Whims (${summary.basketSharesOfSpendingPercent.everyday_choices}%)`,
      body: topEveryday
        ? `Keep if you love it — or a 10% trim frees ~€${tenPercentAnnualShift}/yr.`
        : `${summary.basketSharesOfSpendingPercent.everyday_choices}% of ${activeMonth.monthShort} spending.`,
      metricText: `−10% = +€${tenPercentAnnualShift}/yr`,
    },
    {
      id: 'monthly-margin',
      kicker: 'Net Margin',
      title:
        summary.remainingAfterSpendingEur >= 0
          ? `+€${Math.round(summary.remainingAfterSpendingEur)} left over`
          : `−€${Math.round(Math.abs(summary.remainingAfterSpendingEur))} dip`,
      body:
        summary.remainingAfterSpendingEur >= 0
          ? `${summary.savingsRatePercent ?? 0}% of ${activeMonth.monthShort} income stayed unspent.`
          : `Check one-off bills or test a tweak in What-If.`,
      metricText: `${summary.savingsRatePercent !== null ? `${summary.savingsRatePercent.toFixed(1)}%` : '—'} rate`,
    },
  ];

  return tips;
}

