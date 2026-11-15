import type {
  CustomerInteractiveState,
  SBankTransaction,
  TrackerCategoryId,
} from './types.ts';

export interface QuestTemplate {
  id: string;
  title: string;
  bubbleHint: string;
  eurPerDay: number;
  categoryId: TrackerCategoryId;
}

export const WEEKLY_QUEST_TEMPLATES: QuestTemplate[] = [
  {
    id: 'brew-coffee',
    title: 'Home-brew coffee day',
    bubbleHint: '+€5 / day checked',
    eurPerDay: 5,
    categoryId: 'restaurants_cafes',
  },
  {
    id: 'walk-transit',
    title: 'Transit or walk over taxi',
    bubbleHint: '+€12 / day checked',
    eurPerDay: 12,
    categoryId: 'travel_taxis',
  },
  {
    id: 'impulse-pause',
    title: '24h pause on impulse buys',
    bubbleHint: '+€8 / day checked',
    eurPerDay: 8,
    categoryId: 'entertainment_electronics',
  },
];

export const DAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

export function getTxSentimentKey(tx: SBankTransaction): string {
  if (tx.userLoggedId) return `logged:${tx.userLoggedId}`;
  return `${tx.tx_timestamp}|${tx.merchant_id}|${tx.tx_amount_eur.toFixed(2)}`;
}

const STORAGE_PREFIX = 'pet_interactive_v1_';

export function createDefaultInteractiveState(
  defaultOopsSeedEur = 120
): CustomerInteractiveState {
  return {
    oopsJarSavedEur: Math.max(40, Math.round(defaultOopsSeedEur)),
    txSentiments: {},
    quests: {
      'brew-coffee': {
        id: 'brew-coffee',
        daysCompleted: [true, true, false, false, false, false, false],
      },
      'walk-transit': {
        id: 'walk-transit',
        daysCompleted: [false, true, false, false, false, false, false],
      },
      'impulse-pause': {
        id: 'impulse-pause',
        daysCompleted: [true, false, false, false, false, false, false],
      },
    },
    loggedTransactions: [],
    categoryTargetsEur: {},
  };
}

export function loadInteractiveState(
  customerId: string,
  defaultOopsSeedEur = 120
): CustomerInteractiveState {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${customerId}`);
    if (!raw) return createDefaultInteractiveState(defaultOopsSeedEur);
    const parsed = JSON.parse(raw) as Partial<CustomerInteractiveState>;
    const fallback = createDefaultInteractiveState(defaultOopsSeedEur);
    return {
      oopsJarSavedEur:
        typeof parsed.oopsJarSavedEur === 'number'
          ? parsed.oopsJarSavedEur
          : fallback.oopsJarSavedEur,
      txSentiments: parsed.txSentiments || {},
      quests: { ...fallback.quests, ...(parsed.quests || {}) },
      loggedTransactions: Array.isArray(parsed.loggedTransactions)
        ? parsed.loggedTransactions
        : [],
      categoryTargetsEur: parsed.categoryTargetsEur || {},
    };
  } catch {
    return createDefaultInteractiveState(defaultOopsSeedEur);
  }
}

export function saveInteractiveState(
  customerId: string,
  state: CustomerInteractiveState
): void {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${customerId}`, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors in restricted frames
  }
}

export function calculateQuestStats(state: CustomerInteractiveState): {
  daysCompleted: number;
  weeklySavingsEur: number;
} {
  let daysCompleted = 0;
  let weeklySavingsEur = 0;

  for (const tpl of WEEKLY_QUEST_TEMPLATES) {
    const q = state.quests[tpl.id];
    if (!q || !Array.isArray(q.daysCompleted)) continue;
    const count = q.daysCompleted.filter(Boolean).length;
    daysCompleted += count;
    weeklySavingsEur += count * tpl.eurPerDay;
  }

  return { daysCompleted, weeklySavingsEur };
}
