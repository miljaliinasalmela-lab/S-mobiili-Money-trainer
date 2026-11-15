import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import type { Content, FunctionDeclaration, Part } from '@google/genai';
import {
  buildDeterministicCoachFallback,
  executeAllowListedTool,
} from './src/shared/calculations.ts';
import { parseOfficialCsvLine } from './src/shared/officialDatasetCustomers.ts';
import type {
  CoachAskPayload,
  CoachAskResponse,
  HealthStatusResponse,
  SBankCustomer,
  SBankTransaction,
  ToolTraceItem,
} from './src/shared/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-4-hydrogen';

function getValidGeminiApiKey(): string | null {
  const raw = process.env.GEMINI_API_KEY?.trim();
  if (!raw || raw === 'MY_GEMINI_API_KEY' || raw === 'YOUR_GEMINI_API_KEY') {
    return null;
  }
  return raw;
}

const COACH_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'get_category_spending',
    description:
      'Calculate deterministic spending totals, monthly averages, and share of total expenses for any of the 12 tracker categories (housing, groceries, restaurants_cafes, travel_taxis, car_driving, entertainment_electronics, hobbies_sports, clothing_appearance, health, pets, insurance_bills, other_repairs, or "all") over a month ("2026-10", "last_month") or "year".',
    parameters: {
      type: Type.OBJECT,
      properties: {
        categoryQuery: {
          type: Type.STRING,
          description: 'Category ID or keyword, or "all".',
        },
        month: {
          type: Type.STRING,
          description: 'Target month ("YYYY-MM", "last_month", short month name, or "year").',
        },
        startMonth: {
          type: Type.STRING,
          description: 'Optional range start month in YYYY-MM format.',
        },
        endMonth: {
          type: Type.STRING,
          description: 'Optional range end month in YYYY-MM format.',
        },
      },
    },
  },
  {
    name: 'compare_with_previous_month',
    description:
      'Deterministically compare a target month against the immediately preceding month across income, expenses, remaining cash, savings rate %, the three baskets, and largest category shifts.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        month: {
          type: Type.STRING,
          description: 'Target month in YYYY-MM format (defaults to user selected month).',
        },
      },
    },
  },
  {
    name: 'get_basket_totals',
    description:
      'Calculate deterministic totals for Primary income, Side income, Total Expenses, Savings Rate %, and the Three Baskets ("Must & Usual" for mandatory & regular, "Must & Oops!" for mandatory & irregular, and "Wants & Whims" for everyday spending), plus the 12-month monthly Oops-buffer.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        month: {
          type: Type.STRING,
          description: 'Target month in YYYY-MM format, "last_month", or "year".',
        },
      },
    },
  },
  {
    name: 'calculate_safe_to_spend_and_save',
    description:
      'Deterministically calculate Safe-to-Spend This Week (€/week for Wants & Whims) and Safe-to-Save This Month (€/month) after deducting "Must & Usual" bills and the 12-month "Must & Oops!" buffer. Always state that this is a planning estimate, not a live account balance.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        month: {
          type: Type.STRING,
          description: 'Target month in YYYY-MM format.',
        },
      },
    },
  },
  {
    name: 'analyze_spender_profile',
    description:
      'Answer "What kind of spender am I?" by deterministically analyzing 12-month basket shares, savings rate, coffee/dining and taxi transaction frequencies, and irregular expense spikes.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'compare_with_population_benchmark',
    description:
      'Compare the customer’s monthly average spending by category against Statistics Finland (Tilastokeskus) open population reference medians for their age cohort and Finnish postal region.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        categoryQuery: {
          type: Type.STRING,
          description: 'Category keyword or "all" for full cohort comparison.',
        },
      },
    },
  },
  {
    name: 'simulate_what_if_reduction',
    description:
      'Deterministically simulate a "what-if" spending reduction (e.g. "How much could I save if I reduced dining out by 20%?"), returning monthly, 12-month, 3-year savings, and updated savings rate %.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        targetQuery: {
          type: Type.STRING,
          description:
            'Category or basket to adjust, e.g. "restaurants_cafes", "travel_taxis", "groceries", "everyday_choices".',
        },
        percentReduction: {
          type: Type.NUMBER,
          description: 'Percentage reduction between 1 and 100 (e.g. 20 for 20%).',
        },
        monthlyAmountReductionEur: {
          type: Type.NUMBER,
          description: 'Optional fixed monthly euro reduction instead of percentage.',
        },
        month: {
          type: Type.STRING,
          description: 'Baseline month in YYYY-MM format.',
        },
      },
    },
  },
  {
    name: 'lookup_merchant_or_mcc_spending',
    description:
      'Search transaction records deterministically by merchant keyword or MCC code (e.g. MCC "4121" for taxis/rideshares) for a specific month ("last_month", "2026-09") or "year".',
    parameters: {
      type: Type.OBJECT,
      properties: {
        searchTerm: {
          type: Type.STRING,
          description: 'Keyword such as "taxi", "coffee", "washing machine", "dental", or "psd2".',
        },
        mccCode: {
          type: Type.STRING,
          description: 'Optional 4-digit MCC code such as "4121" (taxis) or "5411" (groceries).',
        },
        month: {
          type: Type.STRING,
          description: 'Month filter ("YYYY-MM", "last_month", or "year").',
        },
      },
    },
  },
  {
    name: 'get_interactive_habits_summary',
    description:
      'Retrieve deterministic totals from the user’s Daily Pulse interactive activities: Worth-It vs Skip-Next purchase ratings, Must & Oops! Cushion Jar progress, 7-Day Micro-Quest streak savings, and logged purchases.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'get_ereceipt_split_summary',
    description:
      'Retrieve deterministic S-ryhmä digital e-receipt (kassakuitti) line-item splitting totals for Prisma/S-market baskets, showing how much non-food spend (e.g. a €15 shirt → clothing_appearance, frying pan → other_repairs, dog food → pets) was separated out of MCC 5411 Groceries.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        month: {
          type: Type.STRING,
          description: 'Target month ("YYYY-MM", "last_month", or "year").',
        },
      },
    },
  },
];

function buildSystemInstruction(payload: CoachAskPayload): string {
  const { context } = payload;
  return [
    'You are S-buddy, the friendly personal economic trainer inside an S-mobiili mobile experience built for the Junction S-Pankki challenge.',
    'Core pedagogy & MyData principles:',
    '1. Use our Three Baskets: "Must & Usual" (fixed bills), "Must & Oops!" (irregular essentials smoothed via a monthly Oops Buffer), and "Wants & Whims" (everyday choices).',
    '2. S-ryhmä digital e-receipts (kassakuitit) automatically split mixed Prisma/hypermarket trips (MCC 5411) item-by-item into true categories (e.g. €15 shirt → Clothing, frying pan → Home & repairs, dog food → Pets) when splitEReceipts is ON.',
    '3. Never shame or dictate cuts. Help users spot habits, test "what-if" tweaks, review their 7-day streak, Worth-It tags, or Oops! Jar, and compare neutrally with Statistics Finland benchmarks.',
    '4. STRICT NUMERIC INTEGRITY: Always call the allow-listed backend calculation tools before quoting any euro amounts, counts, percentages, or benchmarks. Never invent math.',
    '5. For Safe-to-Spend or weekly pace, state briefly that it is a planning estimate, not a live bank balance.',
    '6. SCANNABLE BUBBLE FORMAT (CRITICAL): Write 2 to 3 ultra-short blocks separated by double newlines (\\n\\n) — our UI renders each block as its own separate chat bubble! Block 1: The direct bold headline figure in 1 short sentence. Block 2: 2–3 crisp bullet points (max 8–10 words per bullet). Block 3: One 1-sentence friendly takeaway. Keep total length under 70 words. Do NOT repeat source/period footers.',
    `Session context: customer_id=${context.customer.customer_id}, age=${context.customer.customer_age}, postal=${context.customer.customer_postal_code}, selectedMonthKey=${context.selectedMonthKey}, includePsd2External=${context.includePsd2External}, splitEReceipts=${context.splitEReceipts !== false}, dataSource="${context.sourceLabel}".`,
  ].join('\n');
}

const OFFICIAL_TX_LFS_URL =
  'https://media.githubusercontent.com/media/hackjunction/Junction-2026-S-pankki/main/tx_junction_transactions.csv';
const OFFICIAL_CUSTOMERS_URL =
  'https://raw.githubusercontent.com/hackjunction/Junction-2026-S-pankki/main/tx_customers_junction.csv';
const OFFICIAL_MTG_LINK_URL =
  'https://raw.githubusercontent.com/hackjunction/Junction-2026-S-pankki/main/mtg_tx_customer_link_and_final_mtg_infio.csv';

let cachedCustomersMap: Map<string, { postal: string; age: number }> | null = null;
let cachedMtgMap: Map<string, { decision: string; loanEur: number; propertyEur: number }> | null =
  null;
let cachedLfsTotalBytes = 362796501;

async function ensureOfficialMetadataLoaded(): Promise<void> {
  if (!cachedCustomersMap) {
    const resp = await fetch(OFFICIAL_CUSTOMERS_URL);
    if (resp.ok) {
      const text = (await resp.text()).replace(/^\uFEFF/, '');
      const map = new Map<string, { postal: string; age: number }>();
      const lines = text.split(/\r?\n/);
      for (let i = 1; i < lines.length; i++) {
        const [cid, postal, age] = lines[i].split(',');
        if (cid) map.set(cid.trim(), { postal: (postal || '00100').trim(), age: Number(age) || 35 });
      }
      cachedCustomersMap = map;
    }
  }
  if (!cachedMtgMap) {
    const resp = await fetch(OFFICIAL_MTG_LINK_URL);
    if (resp.ok) {
      const text = (await resp.text()).replace(/^\uFEFF/, '');
      const map = new Map<string, { decision: string; loanEur: number; propertyEur: number }>();
      const lines = text.split(/\r?\n/);
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (cols.length >= 6 && cols[1]) {
          map.set(cols[1].trim(), {
            decision: cols[2]?.trim() || 'unknown',
            propertyEur: Number(cols[4]) || 0,
            loanEur: Number(cols[5]) || 0,
          });
        }
      }
      cachedMtgMap = map;
    }
  }
}

async function fetchRangeChunk(start: number, end: number): Promise<string> {
  const safeStart = Math.max(0, Math.floor(start));
  const safeEnd = Math.min(cachedLfsTotalBytes - 1, Math.floor(end));
  const resp = await fetch(OFFICIAL_TX_LFS_URL, {
    headers: { Range: `bytes=${safeStart}-${safeEnd}` },
  });
  if (!resp.ok && resp.status !== 206) {
    throw new Error(`GitHub LFS Range request failed with HTTP ${resp.status}`);
  }
  const contentRange = resp.headers.get('content-range');
  if (contentRange) {
    const slashIdx = contentRange.lastIndexOf('/');
    const total = Number(contentRange.slice(slashIdx + 1));
    if (Number.isFinite(total) && total > 0) cachedLfsTotalBytes = total;
  }
  return await resp.text();
}

async function fetchOfficialCustomerFromGitHubLfs(targetId: string): Promise<SBankTransaction[]> {
  let low = 0;
  let high = cachedLfsTotalBytes - 1;

  // Binary search sorted 346 MB tx_junction_transactions.csv via tiny 16 KB HTTP Range probes
  for (let step = 0; step < 16 && high - low > 380000; step++) {
    const mid = Math.floor((low + high) / 2);
    const probe = await fetchRangeChunk(mid, mid + 8192);
    const lines = probe.split(/\r?\n/);
    // Drop partial first & last lines
    const completeLines = lines.slice(1, -1).filter((l) => l.startsWith('CUST'));
    if (completeLines.length === 0) break;
    const firstCid = completeLines[0].slice(0, completeLines[0].indexOf(','));
    const lastCid =
      completeLines[completeLines.length - 1].slice(
        0,
        completeLines[completeLines.length - 1].indexOf(',')
      );

    if (lastCid < targetId) {
      low = mid;
    } else if (firstCid > targetId) {
      high = mid;
    } else {
      // targetId starts before or inside probe!
      low = Math.max(0, mid - 260000);
      high = Math.min(cachedLfsTotalBytes - 1, mid + 260000);
      break;
    }
  }

  const windowStart = Math.max(0, low - 140000);
  const windowEnd = Math.min(cachedLfsTotalBytes - 1, high + 180000);
  const rawWindow = (await fetchRangeChunk(windowStart, windowEnd)).replace(/^\uFEFF/, '');
  const rawLines = rawWindow.split(/\r?\n/);
  if (windowStart > 0) rawLines.shift();
  if (windowEnd < cachedLfsTotalBytes - 1) rawLines.pop();

  const matched: SBankTransaction[] = [];
  for (const line of rawLines) {
    if (!line.startsWith(targetId + ',')) continue;
    const parsed = parseOfficialCsvLine(line);
    if (parsed) matched.push(parsed);
  }
  return matched;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    const apiKey = getValidGeminiApiKey();
    const body: HealthStatusResponse = {
      status: 'ok',
      provider: 'gemini',
      model: DEFAULT_GEMINI_MODEL,
      geminiConfigured: Boolean(apiKey),
    };
    res.json(body);
  });

  app.get('/api/dataset/customer/:customerId', async (req, res) => {
    try {
      const rawParam = String(req.params.customerId || '').trim().toUpperCase();
      const normalizedId = /^\d+$/.test(rawParam)
        ? `CUST${rawParam.padStart(5, '0')}`
        : rawParam;

      if (!/^CUST\d{5}$/.test(normalizedId)) {
        res.status(400).json({
          error: 'Enter an official S-Pankki customer ID between CUST00001 and CUST05100.',
        });
        return;
      }

      await ensureOfficialMetadataLoaded();
      const meta = cachedCustomersMap?.get(normalizedId);
      if (!meta) {
        res.status(404).json({
          error: `Customer ${normalizedId} was not found in tx_customers_junction.csv (CUST00001–CUST05100).`,
        });
        return;
      }

      const transactions = await fetchOfficialCustomerFromGitHubLfs(normalizedId);
      if (transactions.length === 0) {
        res.status(404).json({
          error: `No transactions matched for ${normalizedId} in tx_junction_transactions.csv.`,
        });
        return;
      }

      const mtg = cachedMtgMap?.get(normalizedId);
      const mtgNote = mtg
        ? ` · Mortgage link: ${mtg.decision} (€${Math.round(mtg.loanEur).toLocaleString()} loan on €${Math.round(mtg.propertyEur).toLocaleString()} property)`
        : '';

      const customer: SBankCustomer = {
        customer_id: normalizedId,
        customer_postal_code: meta.postal,
        customer_age: meta.age,
        profileLabel: `${normalizedId} · Postal ${meta.postal} (Age ${meta.age})`,
        householdSummary: `Official S-Pankki Junction 2026 dataset (${transactions.length} transactions, 2024–2026)${mtgNote}.`,
      };

      res.json({
        customer,
        transactions,
        year: 2025,
        sourceLabel: `Official S-Pankki GitHub Dataset (${normalizedId})`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch from GitHub dataset.';
      res.status(502).json({ error: msg });
    }
  });

  app.post('/api/coach', async (req, res) => {
    const payload = req.body as CoachAskPayload | undefined;
    if (!payload || !payload.question || !payload.context) {
      res.status(400).json({ error: 'Missing required question or tracker context.' });
      return;
    }

    const question = String(payload.question).trim();
    const apiKey = getValidGeminiApiKey();

    if (!apiKey) {
      const fallback = buildDeterministicCoachFallback(
        question,
        payload.context,
        'Local deterministic mode — GEMINI_API_KEY not configured on server'
      );
      const responseBody: CoachAskResponse = {
        answer: fallback.answer,
        mode: 'local-fallback',
        model: 'deterministic-calculator',
        fallbackReason:
          'GEMINI_API_KEY is not configured on the server; answered with local deterministic calculations.',
        supportingPeriod: fallback.supportingPeriod,
        dataSource: fallback.dataSource,
        toolTraces: fallback.toolTraces,
      };
      res.json(responseBody);
      return;
    }

    const toolTraces: ToolTraceItem[] = [];

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const contents: Content[] = [];
      if (Array.isArray(payload.history)) {
        for (const turn of payload.history.slice(-6)) {
          if (turn && typeof turn.content === 'string' && turn.content.trim()) {
            contents.push({
              role: turn.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: turn.content }],
            });
          }
        }
      }
      contents.push({
        role: 'user',
        parts: [{ text: question }],
      });

      const systemInstruction = buildSystemInstruction(payload);
      let finalAnswerText = '';

      for (let step = 0; step < 5; step++) {
        const response = await ai.models.generateContent({
          model: DEFAULT_GEMINI_MODEL,
          contents,
          config: {
            systemInstruction,
            tools: [{ functionDeclarations: COACH_TOOL_DECLARATIONS }],
          },
        });

        const calls = response.functionCalls;
        if (!calls || calls.length === 0) {
          finalAnswerText = (response.text ?? '').trim();
          break;
        }

        const candidateContent = response.candidates?.[0]?.content;
        if (candidateContent) {
          contents.push(candidateContent);
        }

        const responseParts: Part[] = [];
        for (const call of calls) {
          const toolName = call.name || 'unknown_tool';
          const callArgs = (call.args as Record<string, unknown>) || {};
          const deterministicResult = executeAllowListedTool(toolName, callArgs, payload.context);

          toolTraces.push({
            toolName,
            args: callArgs,
            result: deterministicResult,
          });

          responseParts.push({
            functionResponse: {
              id: call.id,
              name: toolName,
              response: deterministicResult,
            },
          });
        }

        contents.push({
          role: 'user',
          parts: responseParts,
        });
      }

      if (!finalAnswerText) {
        const fallback = buildDeterministicCoachFallback(
          question,
          payload.context,
          'Gemini returned empty text after tool execution'
        );
        finalAnswerText = fallback.answer;
        if (toolTraces.length === 0) {
          toolTraces.push(...fallback.toolTraces);
        }
      }

      const detectedPeriod =
        (toolTraces[0]?.result?.period as string | undefined) || payload.context.selectedMonthKey;

      const responseBody: CoachAskResponse = {
        answer: finalAnswerText,
        mode: 'gemini',
        model: DEFAULT_GEMINI_MODEL,
        supportingPeriod: detectedPeriod,
        dataSource: payload.context.sourceLabel,
        toolTraces,
      };
      res.json(responseBody);
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : String(err);
      let friendlyReason = 'Gemini service error — answered using deterministic backend calculations.';
      if (
        errMessage.includes('403') ||
        errMessage.includes('API_KEY_INVALID') ||
        errMessage.includes('400')
      ) {
        friendlyReason =
          'Gemini API key rejected or invalid (check Settings > Secrets or GEMINI_API_KEY env var) — using deterministic fallback.';
      } else if (errMessage.includes('429') || errMessage.includes('RESOURCE_EXHAUSTED')) {
        friendlyReason = 'Gemini API rate limit reached — using deterministic fallback.';
      }

      const fallback = buildDeterministicCoachFallback(question, payload.context, friendlyReason);
      const responseBody: CoachAskResponse = {
        answer: fallback.answer,
        mode: 'local-fallback',
        model: 'deterministic-calculator',
        fallbackReason: friendlyReason,
        supportingPeriod: fallback.supportingPeriod,
        dataSource: fallback.dataSource,
        toolTraces: toolTraces.length > 0 ? toolTraces : fallback.toolTraces,
      };
      res.json(responseBody);
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    const hasKey = Boolean(getValidGeminiApiKey());
    console.log(
      `Personal Economic Trainer server listening on http://0.0.0.0:${PORT} (Gemini configured: ${hasKey}, model: ${DEFAULT_GEMINI_MODEL})`
    );
  });
}

startServer();
