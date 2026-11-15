# Personal Economic Trainer — Integration & Setup Notes

Independent prototype created for the **Junction 2026 S-Pankki Challenge**.  
*Note: This application uses synthetic data and open population reference figures only. It is not an official S-Pankki product. Authentication, PSD2 consent, and live banking APIs belong to S-Pankki’s approved services.*

---

## 1. Simplified Auto-Filled Monthly Sheet (Excel Template Structure)

The monthly tracker (`src/components/TrackerSection.tsx`) mirrors the clean two-block layout of a personal household spreadsheet while filling every cell **100% automatically** from raw customer transactions (`SALARY`, `SIDE_INCOME`, `category`, and `mcc_code`):

- **INCOME (`TULOT`)**: `Primary income` (`Päätulot`), `Side income` (`Sivutulot`) → **`TOTAL INCOME` (`TULOT YHTEENSÄ`)**
- **EXPENSES (`KULUT`)** — 12 intuitive rows:
  1. `Housing costs` (`Asumiskulut`) — *Mandatory & regular*
  2. `Groceries & household goods` (`Ruokakauppa ja muut kulutustavarat`) — *Everyday spending*
  3. `Restaurants, cafés & nightlife` (`Ravintolat, kahvilat ja ulkona syöminen`) — *Everyday spending*
  4. `Travel, transit & taxis` (`Matkustaminen`, includes MCC `4121` taxis) — *Everyday spending*
  5. `Car & driving` (`Auto`) — *Mandatory & irregular*
  6. `Entertainment & electronics` (`Viihde ja elektroniikka`) — *Everyday spending*
  7. `Hobbies & sports` (`Harrastukset ja liikunta`) — *Everyday spending*
  8. `Clothing, shoes & personal care` (`Vaatteet, kengät, laukut ja ulkonäkö`) — *Mandatory & irregular*
  9. `Health & pharmacy` (`Terveys`) — *Mandatory & irregular*
  10. `Pets` (`Lemmikit`) — *Mandatory & irregular*
  11. `Insurance & fixed bills` (`Vakuutukset`) — *Mandatory & regular*
  12. `Other expenses & appliance repairs` (`Muut kulut`, e.g., broken washing machine) — *Mandatory & irregular*
  - **`TOTAL EXPENSES` (`KULUT YHTEENSÄ`)**
- **Summary Rows**: **`INCOME − EXPENSES` (`TULOT - KULUT`)** and **`SAVINGS RATE %` (`SÄÄSTÖPROSENTTI`)** (with safe zero-income handling so `#JAKO/0!` never occurs).
- **MyData Drill-Down & EN/FI Toggle**: Click any cell to inspect the exact transactions that summed up to that figure, double-click/tap to override values manually, switch between English and Finnish (`Suomi (Excel)`) labels, or export the auto-filled sheet to CSV.

---

## 2. Server-Side Gemini Function Calling (`@google/genai`)

`server.ts` exposes `POST /api/coach` using `gemini-4-hydrogen` (configurable via `GEMINI_MODEL`) with `GEMINI_API_KEY` kept strictly server-side. Gemini calls eight allow-listed deterministic TypeScript tools (`src/shared/calculations.ts`) and never invents balances or arithmetic:

1. `get_category_spending` — Category spend, monthly average, and share of total expenses.
2. `compare_with_previous_month` — Month-over-month deltas across income, expenses, baskets, and top category shifts.
3. `get_basket_totals` — Breakdown across **Mandatory & regular**, **Mandatory & irregular**, and **Everyday spending**, plus the 12-month monthly irregular-cost buffer.
4. `calculate_safe_to_spend_and_save` — Answers *“What is safe for me to spend this week?”* and *Safe-to-Save* monthly guidance after fixed bills and the 12-month irregular buffer (explicitly marked as a planning estimate, not a live account balance).
5. `analyze_spender_profile` — Answers *“What kind of spender am I?”* using 12-month basket shares, savings rate, coffee/dining and taxi habit frequencies, and irregular spikes.
6. `compare_with_population_benchmark` — Compares customer monthly averages against **Statistics Finland (*Tilastokeskus*)** open household consumption reference cohorts by age group and postal region.
7. `simulate_what_if_reduction` — Answers *“How much could I save if I reduced dining out by 20%?”* with 1-month, 12-month, and 3-year projections + updated savings rate %.
8. `lookup_merchant_or_mcc_spending` — Answers *“How much did I spend on taxis last month?”* via MCC `4121` and merchant/category matching.

If `GEMINI_API_KEY` is missing or unavailable, the server and client automatically fall back to the deterministic local coach and label responses transparently.

---

## 3. Dataset Streaming, MyData Benchmarks & Optional PSD2 Multi-Bank View

- **Large CSV Streaming (`src/utils/csvStreamParser.ts`)**: Streams multi-hundred-MB UTF-8 BOM CSV exports (`customer_id, bank_account_id, tx_date, tx_timestamp, category, tx_amount_eur, balance_after_eur, transaction_type, merchant_id, mcc_code`) via `ReadableStream` chunks without loading the whole file into memory.
- **MyData & Statistics Finland Benchmarks (`src/components/MyDataBenchmarksSection.tsx`)**: Lets customers freely search/filter their own raw data and compare monthly category averages with Statistics Finland age & regional cohorts.
- **PSD2 Multi-Bank View**: Toggling `PSD2 Multi-Bank` merges external synthetic bank card and side-income transactions into the sheet, Safe-to-Spend allowance, and Coach context.
- **S-mobiili Bridge (`src/services/sbankBridge.ts`)**: Preserves `window.SBankBridge.getTransactions({ customerId, includePsd2 })` and `window.SBankBridge.askCoach({ question, context })`.

---

## 4. Running the Project

```bash
npm install
cp .env.example .env   # Set GEMINI_API_KEY in .env locally (or Settings > Secrets in AI Studio)
npm run dev            # Starts full-stack Express + Vite server on http://localhost:3000
```
