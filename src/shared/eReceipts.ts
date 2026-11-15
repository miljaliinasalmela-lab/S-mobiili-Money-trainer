import type {
  SBankTransaction,
  SReceiptLineItem,
  TrackerCategoryId,
} from './types.ts';

function round2(val: number): number {
  return Math.round((Number.isFinite(val) ? val : 0) * 100) / 100;
}

/**
 * Deterministic product-line classifier for S-ryhmä digital receipts (Kassakuitti)
 * across Prisma, S-market, Sokos, Alepa, Sale, and Kodin Terra.
 * Maps individual bought goods (both Finnish & English labels + S-ryhmä departments)
 * to our 12 monthly tracker categories.
 */
export function classifyReceiptLineItem(
  name: string,
  department = ''
): TrackerCategoryId {
  const txt = `${name || ''} ${department || ''}`.toLowerCase().trim();

  // 1. Clothing, shoes & personal care (Pukeutuminen & kosmetiikka)
  if (
    txt.includes('shirt') ||
    txt.includes('paita') ||
    txt.includes('sukat') ||
    txt.includes('sock') ||
    txt.includes('kengät') ||
    txt.includes('shoe') ||
    txt.includes('takki') ||
    txt.includes('jacket') ||
    txt.includes('housut') ||
    txt.includes('farkut') ||
    txt.includes('jeans') ||
    txt.includes('mekko') ||
    txt.includes('alusvaat') ||
    txt.includes('pipo') ||
    txt.includes('hanska') ||
    txt.includes('shampoo') ||
    txt.includes('hoitoaine') ||
    txt.includes('ihovoide') ||
    txt.includes('kosmetiikka') ||
    txt.includes('deodorant') ||
    txt.includes('meikki') ||
    txt.includes('pukeutuminen') ||
    txt.includes('vaat') ||
    txt.includes('apparel') ||
    txt.includes('clothing')
  ) {
    return 'clothing_appearance';
  }

  // 2. Pets (Lemmikit)
  if (
    txt.includes('koira') ||
    txt.includes('kissa') ||
    txt.includes('kissanhiekka') ||
    txt.includes('lemmik') ||
    txt.includes('dog') ||
    txt.includes('cat ') ||
    txt.includes('cat food') ||
    txt.includes('pet') ||
    txt.includes('hau-hau') ||
    txt.includes('whiskas')
  ) {
    return 'pets';
  }

  // 3. Health & pharmacy / wellness (Terveys)
  if (
    txt.includes('vitamiin') ||
    txt.includes('vitamin') ||
    txt.includes('laastari') ||
    txt.includes('plaster') ||
    txt.includes('särkylääke') ||
    txt.includes('melatoniin') ||
    txt.includes('maitohappo') ||
    txt.includes('flunssa') ||
    txt.includes('ensiapu') ||
    txt.includes('terveys') ||
    txt.includes('health')
  ) {
    return 'health';
  }

  // 4. Entertainment & electronics (Viihde ja elektroniikka)
  if (
    txt.includes('kuulok') ||
    txt.includes('headphone') ||
    txt.includes('airpod') ||
    txt.includes('usb') ||
    txt.includes('laturi') ||
    txt.includes('charger') ||
    txt.includes('hdmi') ||
    txt.includes('ps5') ||
    txt.includes('nintendo') ||
    txt.includes('videopeli') ||
    txt.includes('kaiutin') ||
    txt.includes('elektroniik') ||
    txt.includes('electronics')
  ) {
    return 'entertainment_electronics';
  }

  // 5. Hobbies & sports (Harrastukset ja liikunta)
  if (
    txt.includes('joogamatto') ||
    txt.includes('yoga') ||
    txt.includes('kahvakuula') ||
    txt.includes('käsipaino') ||
    txt.includes('urheilu') ||
    txt.includes('liikunta') ||
    txt.includes('sulkapallo') ||
    txt.includes('jalkapallo') ||
    txt.includes('kirja') ||
    txt.includes('book') ||
    txt.includes('lautapeli') ||
    txt.includes('neulelanka') ||
    txt.includes('sport') ||
    txt.includes('hobby')
  ) {
    return 'hobbies_sports';
  }

  // 6. Car & driving supplies at Prisma (Autoilu)
  if (
    txt.includes('lasinpesu') ||
    txt.includes('washer fluid') ||
    txt.includes('moottoriöljy') ||
    txt.includes('motor oil') ||
    txt.includes('jääraappa') ||
    txt.includes('pyyhkijä') ||
    txt.includes('auton ') ||
    txt.includes('autoilu')
  ) {
    return 'car_driving';
  }

  // 7. Home, kitchenware, hardware & repairs (Koti ja käyttötavara)
  if (
    txt.includes('paistinpannu') ||
    txt.includes('frying pan') ||
    txt.includes('kattila') ||
    txt.includes('lamppu') ||
    txt.includes('led-') ||
    txt.includes('bulb') ||
    txt.includes('paristo') ||
    txt.includes('battery') ||
    txt.includes('jatkojohto') ||
    txt.includes('säilytys') ||
    txt.includes('storage box') ||
    txt.includes('lakana') ||
    txt.includes('pyyhe') ||
    txt.includes('towel') ||
    txt.includes('työkalu') ||
    txt.includes('tool') ||
    txt.includes('fiskars') ||
    txt.includes('kodin ') ||
    txt.includes('käyttötavara')
  ) {
    return 'other_repairs';
  }

  // 8. Ready-to-eat café / sushi counter inside S-ryhmä
  if (
    txt.includes('sushi bar') ||
    txt.includes('itsudemo') ||
    txt.includes('take-away kahvi') ||
    txt.includes('ravintola')
  ) {
    return 'restaurants_cafes';
  }

  // Default: Everyday food & household consumables
  return 'groceries';
}

export function resolveReceiptItemCategory(item: SReceiptLineItem): TrackerCategoryId {
  return item.mappedCategory || classifyReceiptLineItem(item.name, item.department);
}

const PRISMA_NON_FOOD_ROTATION: Array<{
  name: string;
  department: string;
  priceEur: number;
}> = [
  {
    name: 'House Cotton Shirt (T-paita)',
    department: 'Pukeutuminen',
    priceEur: 15.0,
  },
  {
    name: 'Fiskars Frying Pan (Paistinpannu)',
    department: 'Koti & keittiö',
    priceEur: 24.9,
  },
  {
    name: 'Hau-Hau Dog Food & Treats (Lemmikit)',
    department: 'Lemmikit',
    priceEur: 13.5,
  },
  {
    name: 'Braided USB-C Charger (Elektroniikka)',
    department: 'Viihde & elektroniikka',
    priceEur: 16.9,
  },
  {
    name: 'Vitamin D & First-Aid Plasters',
    department: 'Terveys',
    priceEur: 11.4,
  },
  {
    name: 'Merino Wool Socks & Shampoo',
    department: 'Pukeutuminen & kauneus',
    priceEur: 17.9,
  },
  {
    name: 'Yoga Mat & Sports Bottle',
    department: 'Urheilu & liikunta',
    priceEur: 19.9,
  },
  {
    name: 'Windshield Washer Fluid 5L (Lasinpesu)',
    department: 'Autoilu',
    priceEur: 8.9,
  },
];

function hashTxString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Enriches S-ryhmä supermarket/hypermarket transactions (MCC 5411 / 5499)
 * with realistic S-Etukortti digital e-receipts (Kassakuitti) when not already provided,
 * while preserving any explicit `eReceiptItems` passed by the user or `window.SBankHostAdapter`.
 */
export function attachSGroupEReceipts(
  transactions: SBankTransaction[]
): SBankTransaction[] {
  return transactions.map((tx) => {
    // Keep explicit e-receipts untouched
    if (tx.eReceiptItems && tx.eReceiptItems.length > 0) {
      return tx;
    }

    if (tx.tx_amount_eur >= 0) return tx;
    if (tx.account_provider && tx.account_provider !== 'S-Pankki') return tx;

    const isSupermarket =
      tx.mcc_code === '5411' ||
      tx.mcc_code === '5499' ||
      tx.category.toLowerCase().includes('grocer');
    if (!isSupermarket) return tx;

    const totalAbs = round2(Math.abs(tx.tx_amount_eur));
    const seed = hashTxString(`${tx.customer_id}-${tx.tx_timestamp}-${tx.merchant_id}`);

    // Smaller trips (< €52): S-market or Alepa pure food basket
    if (totalAbs < 52) {
      const chain = totalAbs < 28 ? 'Alepa' : 'S-market';
      return {
        ...tx,
        storeChain: tx.storeChain || chain,
        merchant_label:
          tx.merchant_label?.includes('MRC-GRO')
            ? `${chain} · Kassakuitti (${tx.merchant_id})`
            : tx.merchant_label,
      };
    }

    // Hypermarket baskets (>= €52): Prisma trip with digital e-receipt!
    // Roughly 2 out of 3 Prisma hypermarket baskets contain 1–2 non-food goods alongside groceries
    const hasMixedGoods = seed % 3 !== 2;
    const pickA = PRISMA_NON_FOOD_ROTATION[seed % PRISMA_NON_FOOD_ROTATION.length];
    const pickB = PRISMA_NON_FOOD_ROTATION[(seed + 3) % PRISMA_NON_FOOD_ROTATION.length];

    const items: SReceiptLineItem[] = [];
    let nonFoodSum = 0;

    if (hasMixedGoods && totalAbs >= pickA.priceEur + 24) {
      items.push({
        name: pickA.name,
        department: pickA.department,
        amountEur: pickA.priceEur,
      });
      nonFoodSum = round2(nonFoodSum + pickA.priceEur);

      if (totalAbs >= nonFoodSum + pickB.priceEur + 48 && pickB.name !== pickA.name) {
        items.push({
          name: pickB.name,
          department: pickB.department,
          amountEur: pickB.priceEur,
        });
        nonFoodSum = round2(nonFoodSum + pickB.priceEur);
      }
    }

    const foodTotal = round2(Math.max(0, totalAbs - nonFoodSum));
    const dairyAndBread = round2(Math.min(foodTotal, Math.max(8.4, foodTotal * 0.36)));
    const freshFoodRest = round2(Math.max(0, foodTotal - dairyAndBread));

    const finalItems: SReceiptLineItem[] = [
      {
        name: 'Kotimaista Fresh Food, Fruit & Protein',
        department: 'Elintarvikkeet',
        amountEur: freshFoodRest,
      },
      {
        name: 'Oat Milk, Bread, Coffee & Pantry',
        department: 'Elintarvikkeet',
        amountEur: dairyAndBread,
      },
      ...items,
    ].filter((it) => it.amountEur > 0);

    return {
      ...tx,
      storeChain: 'Prisma',
      merchant_label:
        tx.merchant_label?.includes('MRC-GRO') || tx.merchant_label?.includes('Groceries')
          ? `Prisma Hypermarket · e-Receipt`
          : tx.merchant_label,
      eReceiptItems: finalItems,
    };
  });
}

export interface EReceiptSplitSummary {
  receiptCount: number;
  totalReceiptSpendEur: number;
  pureGroceriesEur: number;
  reclassifiedNonFoodEur: number;
  byCategoryEur: Partial<Record<TrackerCategoryId, number>>;
}

export function summarizeEReceiptSplits(
  transactions: SBankTransaction[],
  monthPrefix?: string
): EReceiptSplitSummary {
  let receiptCount = 0;
  let totalReceiptSpendEur = 0;
  let pureGroceriesEur = 0;
  let reclassifiedNonFoodEur = 0;
  const byCategoryEur: Partial<Record<TrackerCategoryId, number>> = {};

  for (const tx of transactions) {
    if (tx.tx_amount_eur >= 0) continue;
    if (monthPrefix && monthPrefix !== 'year' && !tx.tx_date.startsWith(monthPrefix)) continue;
    if (!tx.eReceiptItems || tx.eReceiptItems.length === 0) continue;

    receiptCount += 1;
    totalReceiptSpendEur = round2(totalReceiptSpendEur + Math.abs(tx.tx_amount_eur));

    for (const item of tx.eReceiptItems) {
      const cat = resolveReceiptItemCategory(item);
      const amt = round2(Math.abs(item.amountEur));
      if (cat === 'groceries') {
        pureGroceriesEur = round2(pureGroceriesEur + amt);
      } else {
        reclassifiedNonFoodEur = round2(reclassifiedNonFoodEur + amt);
        byCategoryEur[cat] = round2((byCategoryEur[cat] || 0) + amt);
      }
    }
  }

  return {
    receiptCount,
    totalReceiptSpendEur,
    pureGroceriesEur,
    reclassifiedNonFoodEur,
    byCategoryEur,
  };
}
