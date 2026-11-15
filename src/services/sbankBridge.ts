import { buildDeterministicCoachFallback } from '../shared/calculations.ts';
import type {
  CoachAskPayload,
  CoachAskResponse,
  HealthStatusResponse,
  SBankCustomer,
  SBankTransaction,
} from '../shared/types.ts';

interface ActiveBridgeState {
  sourceLabel: string;
  isSynthetic: boolean;
  customer: SBankCustomer;
  transactions: SBankTransaction[];
  period: string;
}

let currentBridgeState: ActiveBridgeState | null = null;

export function syncBridgeDatasetState(nextState: ActiveBridgeState): void {
  currentBridgeState = nextState;
}

export async function fetchServerHealth(): Promise<HealthStatusResponse> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return (await res.json()) as HealthStatusResponse;
  } catch {
    return {
      status: 'ok',
      provider: 'gemini',
      model: 'gemini-4-hydrogen',
      geminiConfigured: false,
    };
  }
}

export async function askCoachViaBridge(payload: CoachAskPayload): Promise<CoachAskResponse> {
  if (typeof window !== 'undefined' && window.SBankBridge?.askCoach) {
    return window.SBankBridge.askCoach(payload);
  }
  return invokeCoachBackendOrLocal(payload);
}

async function invokeCoachBackendOrLocal(payload: CoachAskPayload): Promise<CoachAskResponse> {
  try {
    const response = await fetch('/api/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Coach server returned HTTP ${response.status}`);
    }

    return (await response.json()) as CoachAskResponse;
  } catch {
    const fallback = buildDeterministicCoachFallback(
      payload.question,
      payload.context,
      'Offline browser deterministic fallback'
    );
    return {
      answer: fallback.answer,
      mode: 'local-fallback',
      model: 'deterministic-calculator',
      fallbackReason: 'Backend server unreachable — answered locally with deterministic calculations.',
      supportingPeriod: fallback.supportingPeriod,
      dataSource: fallback.dataSource,
      toolTraces: fallback.toolTraces,
    };
  }
}

/**
 * Initializes `window.SBankBridge` so an embedding host (such as an S-mobiili WebView wrapper)
 * can supply pre-authenticated, aggregated/filtered customer transactions via `window.SBankHostAdapter`
 * or invoke `window.SBankBridge.getTransactions()` and `window.SBankBridge.askCoach({ question, context })`.
 */
export function registerSBankBridge(): void {
  if (typeof window === 'undefined') return;

  window.SBankBridge = {
    async getTransactions(options?: { customerId?: string; includePsd2?: boolean }) {
      if (window.SBankHostAdapter?.getTransactions) {
        const hostResult = await window.SBankHostAdapter.getTransactions(options);
        return {
          source: hostResult.source || 'S-mobiili Host WebView Bridge',
          isSynthetic: hostResult.isSynthetic ?? false,
          customer: hostResult.customer,
          transactions: hostResult.transactions,
          period: hostResult.period || 'Host-supplied period',
        };
      }

      if (currentBridgeState) {
        return {
          source: currentBridgeState.sourceLabel,
          isSynthetic: currentBridgeState.isSynthetic,
          customer: currentBridgeState.customer,
          transactions: currentBridgeState.transactions,
          period: currentBridgeState.period,
        };
      }

      return {
        source: 'Synthetic Sample Fallback',
        isSynthetic: true,
        customer: {
          customer_id: options?.customerId || 'CUST-10042',
          customer_postal_code: '00530',
          customer_age: 27,
        },
        transactions: [],
        period: '2026',
      };
    },

    async askCoach(payload: CoachAskPayload): Promise<CoachAskResponse> {
      return invokeCoachBackendOrLocal(payload);
    },
  };
}
