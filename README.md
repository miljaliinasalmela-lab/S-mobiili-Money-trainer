# S-mobiili Money Trainer & S-buddy

An interactive **S-mobiili personal economic trainer** built for the **Junction 2026 S-Pankki** challenge. It transforms passive bank transactions and **S-ryhmä digital e-receipts (*kassakuitit*)** into a playful daily money habit—backed by **S-buddy**, a zero-hallucination personal financial coach.

---

## Key Features

- **Playful Daily Check-Ins (`Today`)**
  - **"Can I Buy This Today?"**: Instant check against your weekly safe-to-spend allowance with 1-tap presets, live sheet logging, and undo.
  - **7-Day Micro-Quest Streaks**: Bite-sized weekly savings challenges (*Brew at home*, *Transit over taxi*, *No-impulse day*).
- **S-ryhmä Digital e-Receipt (*Kassakuitti*) Item Splitting (`MyData → e-Receipts`)**
  - Automatically differentiates bought goods inside mixed **Prisma / S-ryhmä** hypermarket receipts (`MCC 5411`)—sorting everyday food into *Groceries* while moving a €15 shirt to *Clothing, shoes & personal care*, kitchenware to *Home & repairs*, pet food to *Pets*, and vitamins to *Health* down to the cent.
  - Live **Split ON/OFF** toggle and interactive Prisma receipt builder.
- **The Three Baskets (`Baskets`)**
  - Organizes 12 spending categories into **Must & Usual** *(fixed bills)*, **Must & Oops!** *(irregular essentials smoothed via an interactive Oops! Cushion Jar)*, and **Wants & Whims** *(everyday choices with a Quick Sort Game and What-If Slider)*.
- **Auto-Filled Monthly Sheet (`Sheet`)**
  - Pre-loaded with the **Official S-Pankki Junction 2026 dataset** (`CUST00001`–`CUST05100`), CSV import, PSD2 external bank toggle, cell-level transaction/e-receipt inspection, inline overrides, category caps, and CSV export.
- **S-buddy Verified Coach (`S-buddy`)**
  - Answers natural-language money questions in short, scannable chat bubbles.
  - **100% Deterministic Math**: Every euro figure, percentage, and **Statistics Finland (*Tilastokeskus*)** peer benchmark comes from 10 allow-listed TypeScript calculation tools—never guessed by an LLM.

---

## Quick Start (Local Development)

```bash
# 1. Install dependencies
npm install

# 2. (Optional) Configure Gemini API key for conversational S-buddy phrasing
#    Without a key, S-buddy automatically runs in deterministic local mode!
cp .env.example .env

# 3. Start Express + Vite server on http://localhost:3000
npm run dev
```

### Production Build

```bash
npm run build
NODE_ENV=production npx tsx server.ts
```

---

## Host Integration (`window.SBankBridge`)

See [`INTEGRATION.md`](./INTEGRATION.md) for embedding inside a native S-mobiili WebView via `window.SBankHostAdapter` and `window.SBankBridge`.
