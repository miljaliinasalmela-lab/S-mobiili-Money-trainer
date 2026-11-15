import type {
  BasketDefinition,
  CategoryDefinition,
  SBankCustomer,
  SBankTransaction,
  TrackerCategoryId,
} from './types.ts';

export const BASKETS: BasketDefinition[] = [
  {
    id: 'regular_essentials',
    label: 'Must & Usual',
    labelFi: 'Pakko & tuttu',
    subtitle: 'Rent, electricity, phone & insurance',
    pedagogyNote: 'On autopilot — check contracts once a year.',
  },
  {
    id: 'irregular_essentials',
    label: 'Must & Oops!',
    labelFi: 'Pakko & hups!',
    subtitle: 'Repairs, dentist, tyres & vet trips',
    pedagogyNote: 'Park your 12-mo average so surprise bills feel routine.',
  },
  {
    id: 'everyday_choices',
    label: 'Wants & Whims',
    labelFi: 'Huvit & mieliteot',
    subtitle: 'Groceries, cafés, taxis & hobbies',
    pedagogyNote: 'Keep what brings joy; trim what slips past unnoticed.',
  },
];

/**
 * Exact 12-row simplified Expense structure modeled directly on the user's Excel sheet:
 * Asumiskulut, Ruokakauppa, Ravintolat, Matkustaminen, Auto, Viihde ja elektroniikka,
 * Harrastukset ja liikunta, Vaatteet..., Terveys, Lemmikit, Vakuutukset, Muut kulut.
 */
export const CATEGORIES: CategoryDefinition[] = [
  {
    id: 'housing',
    label: 'Housing costs',
    labelFi: 'Asumiskulut',
    shortLabel: 'Housing',
    basket: 'regular_essentials',
    description: 'Rent, maintenance charge (vastike), electricity, water, and home broadband',
    sampleMccs: ['6513', '4900', '4814'],
  },
  {
    id: 'groceries',
    label: 'Groceries & household goods',
    labelFi: 'Ruokakauppa ja muut kulutustavarat',
    shortLabel: 'Groceries',
    basket: 'everyday_choices',
    description: 'Supermarkets, food stores, and daily household consumables',
    sampleMccs: ['5411', '5499'],
  },
  {
    id: 'restaurants_cafes',
    label: 'Restaurants, cafés & nightlife',
    labelFi: 'Ravintolat, kahvilat ja ulkona syöminen',
    shortLabel: 'Dining & cafés',
    basket: 'everyday_choices',
    description: 'Specialty coffees, workday lunches, restaurants, and bars',
    sampleMccs: ['5812', '5814', '5813', '5462'],
  },
  {
    id: 'travel_taxis',
    label: 'Travel, transit & taxis',
    labelFi: 'Matkustaminen',
    shortLabel: 'Travel & taxis',
    basket: 'everyday_choices',
    description: 'Public transport passes, trains, hotels, and taxi/rideshare trips (MCC 4121)',
    sampleMccs: ['4111', '4121', '4112', '7011'],
  },
  {
    id: 'car_driving',
    label: 'Car & driving',
    labelFi: 'Auto',
    shortLabel: 'Car',
    basket: 'irregular_essentials',
    description: 'Fuel, parking, seasonal tyres, inspection, and garage maintenance',
    sampleMccs: ['5541', '7538', '7523'],
  },
  {
    id: 'entertainment_electronics',
    label: 'Entertainment & electronics',
    labelFi: 'Viihde ja elektroniikka',
    shortLabel: 'Entertainment',
    basket: 'everyday_choices',
    description: 'Streaming services, cinema, concerts, games, and tech accessories',
    sampleMccs: ['5815', '7832', '5732'],
  },
  {
    id: 'hobbies_sports',
    label: 'Hobbies & sports',
    labelFi: 'Harrastukset ja liikunta',
    shortLabel: 'Hobbies',
    basket: 'everyday_choices',
    description: 'Gym memberships, sports gear, books, and hobby clubs',
    sampleMccs: ['7997', '5941', '5942'],
  },
  {
    id: 'clothing_appearance',
    label: 'Clothing, shoes & personal care',
    labelFi: 'Vaatteet, kengät, laukut ja ulkonäkö',
    shortLabel: 'Clothing',
    basket: 'irregular_essentials',
    description: 'Seasonal coats, footwear, apparel, and hairdresser/barber visits',
    sampleMccs: ['5651', '5661', '7230'],
  },
  {
    id: 'health',
    label: 'Health & pharmacy',
    labelFi: 'Terveys',
    shortLabel: 'Health',
    basket: 'irregular_essentials',
    description: 'Pharmacy prescriptions, dental checkups, optical, and medical clinics',
    sampleMccs: ['5912', '8011', '8021', '8099'],
  },
  {
    id: 'pets',
    label: 'Pets',
    labelFi: 'Lemmikit',
    shortLabel: 'Pets',
    basket: 'irregular_essentials',
    description: 'Pet food, supplies, and veterinary visits',
    sampleMccs: ['5995', '0742'],
  },
  {
    id: 'insurance_bills',
    label: 'Utilities, bills & insurance',
    labelFi: 'Sähkö, laskut ja vakuutukset',
    shortLabel: 'Utilities & bills',
    basket: 'regular_essentials',
    description: 'Utilities payments, electricity, water, phone contracts, and insurance policies',
    sampleMccs: ['4900', '6300', '4812'],
  },
  {
    id: 'other_repairs',
    label: 'Home, hardware & repairs',
    labelFi: 'Koti, remontti ja muut kulut',
    shortLabel: 'Home & repairs',
    basket: 'irregular_essentials',
    description: 'Home & Tech hardware, furnishings, appliance repairs (MCC 5200, 5251, 5712), and miscellaneous',
    sampleMccs: ['5200', '5251', '5712', '7629'],
  },
];

export const MONTH_NAMES = [
  { short: 'Jan', full: 'January', shortFi: 'Tammi', fullFi: 'Tammikuu' },
  { short: 'Feb', full: 'February', shortFi: 'Helmi', fullFi: 'Helmikuu' },
  { short: 'Mar', full: 'March', shortFi: 'Maalis', fullFi: 'Maaliskuu' },
  { short: 'Apr', full: 'April', shortFi: 'Huhti', fullFi: 'Huhtikuu' },
  { short: 'May', full: 'May', shortFi: 'Touko', fullFi: 'Toukokuu' },
  { short: 'Jun', full: 'June', shortFi: 'Kesä', fullFi: 'Kesäkuu' },
  { short: 'Jul', full: 'July', shortFi: 'Heinä', fullFi: 'Heinäkuu' },
  { short: 'Aug', full: 'August', shortFi: 'Elo', fullFi: 'Elokuu' },
  { short: 'Sep', full: 'September', shortFi: 'Syys', fullFi: 'Syyskuu' },
  { short: 'Oct', full: 'October', shortFi: 'Loka', fullFi: 'Lokakuu' },
  { short: 'Nov', full: 'November', shortFi: 'Marras', fullFi: 'Marraskuu' },
  { short: 'Dec', full: 'December', shortFi: 'Joulu', fullFi: 'Joulukuu' },
];

export const SYNTHETIC_CUSTOMERS: SBankCustomer[] = [
  {
    customer_id: 'CUST-10042',
    customer_postal_code: '00530',
    customer_age: 27,
    profileLabel: 'CUST-10042 · Helsinki (Age 27)',
    householdSummary:
      'Young urban renter in Kallio; steady salary + occasional freelance side income, frequent coffees & evening taxis, plus a broken washing machine in September.',
  },
  {
    customer_id: 'CUST-20418',
    customer_postal_code: '33100',
    customer_age: 39,
    profileLabel: 'CUST-20418 · Tampere (Age 39)',
    householdSummary:
      'Family household with a dog; predictable housing and supermarket baseline with seasonal car service and dental spikes.',
  },
  {
    customer_id: 'CUST-30891',
    customer_postal_code: '20100',
    customer_age: 33,
    profileLabel: 'CUST-30891 · Turku (Age 33)',
    householdSummary:
      'Designer combining main contract pay with active side-project income; explores dining and travel trade-offs.',
  },
];

function seededNoise(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

export function mapRawTransactionToCategory(
  rawCategory: string,
  mccCode: string,
  merchantLabel = ''
): TrackerCategoryId {
  const cat = (rawCategory || '').toLowerCase().trim();
  const mcc = (mccCode || '').trim();
  const merch = (merchantLabel || '').toLowerCase();

  // 1. Official S-Pankki Utilities -> Utilities, bills & insurance (regular_essentials)
  if (
    cat === 'utilities' ||
    cat.includes('utilit') ||
    cat.includes('insur') ||
    cat.includes('vakuut') ||
    cat.includes('phone') ||
    mcc === '6300' ||
    mcc === '4812'
  ) {
    return 'insurance_bills';
  }

  // 2. Official S-Pankki Housing -> Housing costs (regular_essentials)
  if (
    mcc === '6513' ||
    cat === 'housing' ||
    cat.includes('rent') ||
    cat.includes('housing') ||
    cat.includes('asumis')
  ) {
    return 'housing';
  }

  // 3. Official S-Pankki Groceries (MCC 5411, 5499, 5422, 5451)
  if (
    mcc === '5411' ||
    mcc === '5499' ||
    mcc === '5422' ||
    mcc === '5451' ||
    cat.includes('grocer') ||
    cat.includes('supermarket') ||
    cat.includes('ruoka') ||
    cat.includes('food_store')
  ) {
    return 'groceries';
  }

  // 4. Official S-Pankki Restaurants & Cafés (MCC 5812, 5813, 5814, 5462)
  if (
    mcc === '5812' ||
    mcc === '5814' ||
    mcc === '5813' ||
    mcc === '5462' ||
    cat.includes('cafe') ||
    cat.includes('café') ||
    cat.includes('restaurant') ||
    cat.includes('dining') ||
    cat.includes('lunch') ||
    cat.includes('ravintola') ||
    merch.includes('coffee') ||
    merch.includes('cafe')
  ) {
    return 'restaurants_cafes';
  }

  // 5. Fuel & Parking inside Transportation -> Car & driving (MCC 5541, 5542, 7523, 7538)
  if (
    mcc === '5541' ||
    mcc === '5542' ||
    mcc === '7538' ||
    mcc === '7523' ||
    cat.includes('car') ||
    cat.includes('auto') ||
    cat.includes('fuel') ||
    cat.includes('garage') ||
    cat.includes('tyre')
  ) {
    return 'car_driving';
  }

  // 6. Taxis (4121), Public Transit (4111), & Travel (4511, 4722, 7011, 7512) -> Travel & taxis
  if (
    mcc === '4111' ||
    mcc === '4121' ||
    mcc === '4112' ||
    mcc === '7011' ||
    mcc === '4511' ||
    mcc === '4722' ||
    mcc === '7512' ||
    cat === 'transportation' ||
    cat.includes('taxi') ||
    cat.includes('transit') ||
    cat.includes('travel') ||
    cat.includes('matkust') ||
    merch.includes('taxi') ||
    merch.includes('bolt') ||
    merch.includes('uber') ||
    merch.includes('hsl')
  ) {
    return 'travel_taxis';
  }

  // 7. Entertainment & Electronics (MCC 7832, 7922, 7991, 7996, 7999, 5732, 5734, 5815)
  if (
    mcc === '5815' ||
    mcc === '7832' ||
    mcc === '7922' ||
    mcc === '7991' ||
    mcc === '7996' ||
    mcc === '7999' ||
    mcc === '5732' ||
    mcc === '5734' ||
    cat.includes('entertain') ||
    cat.includes('viihde') ||
    cat.includes('electron') ||
    cat.includes('stream') ||
    cat.includes('cinema')
  ) {
    return 'entertainment_electronics';
  }

  // 8. Hobbies & Sports (Lifestyle MCC 5941, 5942, 5945, 7997)
  if (
    mcc === '7997' ||
    mcc === '5941' ||
    mcc === '5942' ||
    mcc === '5945' ||
    cat.includes('hobb') ||
    cat.includes('sport') ||
    cat.includes('harrast') ||
    cat.includes('gym')
  ) {
    return 'hobbies_sports';
  }

  // 9. Clothing & Personal Care (Lifestyle MCC 56xx apparel/footwear & 7230 personal care)
  if (
    mcc.startsWith('56') ||
    mcc === '7230' ||
    cat.includes('cloth') ||
    cat.includes('vaat') ||
    cat.includes('shoe') ||
    cat.includes('shirt') ||
    cat.includes('apparel') ||
    cat.includes('appearance')
  ) {
    return 'clothing_appearance';
  }

  // 10. Health & Pharmacy (MCC 5912, 8011, 8021, 8099)
  if (
    mcc === '5912' ||
    mcc === '8011' ||
    mcc === '8021' ||
    mcc === '8099' ||
    cat.includes('health') ||
    cat.includes('terveys') ||
    cat.includes('pharm') ||
    cat.includes('dental') ||
    cat.includes('medical')
  ) {
    return 'health';
  }
  if (
    mcc === '5995' ||
    mcc === '0742' ||
    cat.includes('pet') ||
    cat.includes('lemmik') ||
    cat.includes('vet')
  ) {
    return 'pets';
  }
  if (
    mcc === '6300' ||
    mcc === '4812' ||
    cat.includes('insur') ||
    cat.includes('vakuut') ||
    cat.includes('phone') ||
    cat.includes('telecom')
  ) {
    return 'insurance_bills';
  }

  return 'other_repairs';
}

export function generateSyntheticTransactions(
  customerId: string,
  year = 2026,
  includePsd2External = false
): SBankTransaction[] {
  const txs: SBankTransaction[] = [];
  const accountId =
    customerId === 'CUST-20418'
      ? 'FI42-SBANK-20418'
      : customerId === 'CUST-30891'
      ? 'FI42-SBANK-30891'
      : 'FI42-SBANK-10042';

  let runningBalance = customerId === 'CUST-20418' ? 4250 : customerId === 'CUST-30891' ? 3180 : 2140;

  const pushTx = (
    monthIdx: number,
    day: number,
    hour: number,
    category: string,
    amountSigned: number,
    txType: string,
    merchantId: string,
    mccCode: string,
    merchantLabel: string,
    provider: 'S-Pankki' | 'External Bank (PSD2)' = 'S-Pankki'
  ) => {
    const mStr = String(monthIdx + 1).padStart(2, '0');
    const dStr = String(Math.min(28, Math.max(1, day))).padStart(2, '0');
    const hStr = String(hour).padStart(2, '0');
    const rounded = Math.round(amountSigned * 100) / 100;
    if (provider === 'S-Pankki') {
      runningBalance = Math.round((runningBalance + rounded) * 100) / 100;
    }
    txs.push({
      customer_id: customerId,
      bank_account_id: provider === 'S-Pankki' ? accountId : 'FI88-EXT-PSD2-CARD',
      tx_date: `${year}-${mStr}-${dStr}`,
      tx_timestamp: `${year}-${mStr}-${dStr}T${hStr}:15:00Z`,
      category,
      tx_amount_eur: rounded,
      balance_after_eur: runningBalance,
      transaction_type: txType,
      merchant_id: merchantId,
      mcc_code: mccCode,
      merchant_label: merchantLabel,
      account_provider: provider,
    });
  };

  for (let m = 0; m < 12; m++) {
    const seedBase = (m + 1) * 100 + (customerId.charCodeAt(5) || 49);

    // 1. TULOT / INCOME: Primary income (Päätulot) + Side income (Sivutulot)
    const primaryIncome =
      customerId === 'CUST-20418'
        ? 3650 + (m === 5 ? 550 : 0)
        : customerId === 'CUST-30891'
        ? 2350
        : 2680 + (m === 5 ? 380 : 0);
    pushTx(m, 1, 8, 'PRIMARY_INCOME', primaryIncome, 'SALARY', 'EMP-FIN-01', '0000', 'Monthly Net Salary');

    // Side income (Sivutulot): freelance gigs, Tory/Vinted sales, S-Bonus / dividends
    if (customerId === 'CUST-30891') {
      const freelance = 320 + Math.round(seededNoise(seedBase + 2) * 480);
      pushTx(m, 15, 14, 'SIDE_INCOME', freelance, 'SIDE_INCOME', 'CLIENT-STUDIO-04', '0000', 'Freelance Design Invoice');
    } else if (m % 2 === 1 || m === 11) {
      const sideAmt = customerId === 'CUST-20418' ? 85 + Math.round(seededNoise(seedBase + 2) * 60) : 65 + Math.round(seededNoise(seedBase + 2) * 95);
      pushTx(m, 17, 16, 'SIDE_INCOME', sideAmt, 'SIDE_INCOME', 'SECOND-HAND-01', '0000', 'Secondhand Sale & Bonus Payout');
    }

    // 2. KULUT / EXPENSES (12 clean Excel categories)
    // Row 1: Housing costs (Asumiskulut)
    const rent = customerId === 'CUST-20418' ? 1150 : customerId === 'CUST-30891' ? 820 : 890;
    pushTx(m, 2, 9, 'HOUSING', -rent, 'BANK_TRANSFER', 'MCH-HOUSING-01', '6513', 'Monthly Rent / Housing Charge');
    const electric = (customerId === 'CUST-20418' ? 92 : 48) + (m <= 1 || m >= 10 ? 22 : 0);
    pushTx(m, 5, 10, 'UTILITIES', -electric, 'SEPA_DIRECT_DEBIT', 'MCH-ENERGY-02', '4900', 'Electricity & Home Broadband');

    // Row 2: Groceries & household goods (Ruokakauppa ja muut kulutustavarat)
    const weeklyGrocery = customerId === 'CUST-20418' ? 152 : customerId === 'CUST-30891' ? 84 : 88;
    for (let w = 0; w < 4; w++) {
      const amt = weeklyGrocery + Math.round((seededNoise(seedBase + 10 + w) - 0.4) * 24);
      pushTx(
        m,
        3 + w * 6,
        18,
        'GROCERIES',
        -amt,
        'CARD_PURCHASE',
        'MCH-PRISMA-01',
        '5411',
        w % 2 === 0 ? 'Prisma / S-market Groceries' : 'Alepa Everyday Goods'
      );
    }

    // Row 3: Restaurants, cafés & nightlife (Ravintolat, kahvilat...)
    const cafeVisits = customerId === 'CUST-10042' ? 7 : 5;
    for (let c = 0; c < cafeVisits; c++) {
      const isCoffee = c % 2 === 0;
      const amt = isCoffee
        ? 5.8 + Math.round(seededNoise(seedBase + 20 + c) * 65) / 10
        : 16.5 + Math.round(seededNoise(seedBase + 25 + c) * 260) / 10;
      pushTx(
        m,
        2 + c * 3,
        isCoffee ? 9 : 19,
        'RESTAURANTS_CAFES',
        -amt,
        'CARD_PURCHASE',
        isCoffee ? 'MCH-CAFE-02' : 'MCH-DINING-05',
        isCoffee ? '5814' : '5812',
        isCoffee ? 'Morning Coffee & Pastry' : 'Neighborhood Bistro Dinner'
      );
    }

    // Row 4: Travel, transit & taxis (Matkustaminen — includes searchable MCC 4121 taxis!)
    const transitPass = customerId === 'CUST-20418' ? 72 : 68;
    pushTx(m, 3, 8, 'PUBLIC_TRANSPORT', -transitPass, 'CARD_PURCHASE', 'MCH-HSL-01', '4111', 'Monthly Commuter Transit Pass');

    const taxiTrips = customerId === 'CUST-10042' ? (m === 8 || m === 9 ? 4 : 3) : 2;
    for (let t = 0; t < taxiTrips; t++) {
      const taxiAmt = 21 + Math.round(seededNoise(seedBase + 30 + t) * 18);
      pushTx(
        m,
        6 + t * 6,
        23,
        'TAXI_RIDESHARE',
        -taxiAmt,
        'CARD_PURCHASE',
        'MCH-TAXI-4121',
        '4121',
        t % 2 === 0 ? 'Lähitaksi Late Evening Ride' : 'City Taxi Rideshare (MCC 4121)'
      );
    }
    if (m === 6 || m === 11) {
      pushTx(m, 20, 11, 'TRAVEL_RAIL', -89, 'CARD_PURCHASE', 'MCH-VR-12', '4112', 'VR InterCity Holiday Train');
    }

    // Row 5: Car & driving (Auto)
    if (customerId === 'CUST-20418') {
      pushTx(m, 11, 17, 'CAR_FUEL', -(135 + Math.round(seededNoise(seedBase + 35) * 35)), 'CARD_PURCHASE', 'MCH-ABC-01', '5541', 'ABC Service Station Fuel');
      if (m === 3 || m === 9) {
        pushTx(m, 19, 15, 'CAR_MAINTENANCE', -360, 'CARD_PURCHASE', 'MCH-GARAGE-07', '7538', 'Seasonal Tyre Change & Annual Service');
      }
    } else if (m === 4 || m === 7) {
      pushTx(m, 18, 12, 'CAR_RENTAL_FUEL', -64, 'CARD_PURCHASE', 'MCH-CARSHARE-02', '5541', 'Weekend Shared Car & Fuel');
    }

    // Row 6: Entertainment & electronics (Viihde ja elektroniikka)
    const streaming = 34 + (m % 3 === 0 ? 48 : 0);
    pushTx(m, 8, 20, 'ENTERTAINMENT', -streaming, 'CARD_PURCHASE', 'MCH-MEDIA-04', '5815', m % 3 === 0 ? 'Streaming & Cinema / Small Tech' : 'Monthly Music & Video Subscriptions');

    // Row 7: Hobbies & sports (Harrastukset ja liikunta)
    const gymAmt = customerId === 'CUST-20418' ? 78 : 56 + (m === 1 || m === 8 ? 35 : 0);
    pushTx(m, 12, 18, 'HOBBIES_SPORTS', -gymAmt, 'CARD_PURCHASE', 'MCH-SPORT-08', '7997', 'Fitness Center & Sports Club');

    // Row 8: Clothing, shoes & personal care (Vaatteet, kengät...)
    if (m === 0 || m === 4 || m === 9 || m === 10) {
      const clothAmt = customerId === 'CUST-20418' ? 165 : 115 + Math.round(seededNoise(seedBase + 42) * 40);
      pushTx(m, 21, 16, 'CLOTHING', -clothAmt, 'CARD_PURCHASE', 'MCH-APPAREL-11', '5651', 'Seasonal Footwear & Weatherproof Jacket');
    } else {
      pushTx(m, 21, 15, 'PERSONAL_CARE', -38, 'CARD_PURCHASE', 'MCH-BARBER-03', '7230', 'Hairdresser / Personal Care');
    }

    // Row 9: Health & pharmacy (Terveys)
    if (m === 2 || m === 8) {
      const dental = customerId === 'CUST-20418' ? 235 : 165;
      pushTx(m, 14, 14, 'HEALTH', -dental, 'CARD_PURCHASE', 'MCH-DENTAL-09', '8021', 'Dental Checkup & Clinic Visit');
    } else if (m % 2 === 0) {
      pushTx(m, 16, 17, 'PHARMACY', -26, 'CARD_PURCHASE', 'MCH-PHARM-01', '5912', 'Pharmacy Prescription & Vitamins');
    }

    // Row 10: Pets (Lemmikit)
    if (customerId === 'CUST-20418') {
      pushTx(m, 9, 17, 'PETS', -62, 'CARD_PURCHASE', 'MCH-PET-01', '5995', 'Musti ja Mirri Pet Food');
      if (m === 5) {
        pushTx(m, 23, 13, 'VET_CARE', -185, 'CARD_PURCHASE', 'MCH-VET-02', '0742', 'Annual Veterinary Vaccination');
      }
    } else if (customerId === 'CUST-30891' && m % 2 === 0) {
      pushTx(m, 10, 17, 'PETS', -38, 'CARD_PURCHASE', 'MCH-PET-01', '5995', 'Cat Food & Litter Supplies');
    }

    // Row 11: Insurance & fixed bills (Vakuutukset)
    const insurance = customerId === 'CUST-20418' ? 108 : 64;
    pushTx(m, 7, 11, 'INSURANCE_BILLS', -insurance, 'SEPA_DIRECT_DEBIT', 'MCH-INS-03', '6300', 'Home Insurance & Phone Plan');

    // Row 12: Other expenses & appliance repairs (Muut kulut — e.g. broken washing machine!)
    if (m === 8 && customerId !== 'CUST-20418') {
      // Classic challenge example: mandatory & irregular broken washing machine!
      pushTx(m, 19, 13, 'APPLIANCE_REPAIR', -420, 'CARD_PURCHASE', 'MCH-REPAIR-99', '7629', 'Broken Washing Machine Replacement');
    } else if (m === 11) {
      pushTx(m, 22, 16, 'GIFTS_OTHER', -145, 'CARD_PURCHASE', 'MCH-RETAIL-19', '5999', 'Holiday Gifts & Household Items');
    } else {
      pushTx(m, 25, 16, 'OTHER_EXPENSES', -(22 + Math.round(seededNoise(seedBase + 50) * 28)), 'CARD_PURCHASE', 'MCH-MISC-19', '5999', 'Everyday Miscellaneous');
    }

    // Optional Bonus Angle: PSD2 External Bank Account (credit card + external side payouts)
    if (includePsd2External) {
      pushTx(
        m,
        13,
        20,
        'RESTAURANTS_CAFES',
        -54,
        'CARD_PURCHASE',
        'EXT-CARD-DINING',
        '5812',
        'PSD2 External Credit Card · Weekend Dining',
        'External Bank (PSD2)'
      );
      pushTx(
        m,
        18,
        10,
        'ENTERTAINMENT',
        -29,
        'CARD_PURCHASE',
        'EXT-CARD-CLOUD',
        '5815',
        'PSD2 External Card · Digital Subscriptions',
        'External Bank (PSD2)'
      );
      if (m === 9) {
        pushTx(
          m,
          22,
          15,
          'SIDE_INCOME',
          190,
          'SIDE_INCOME',
          'EXT-TAX-REFUND',
          '0000',
          'PSD2 External Account · Tax / Dividend Payout',
          'External Bank (PSD2)'
        );
      }
    }
  }

  return txs;
}

export function buildSampleCsvContent(customerId = 'CUST-10042'): string {
  const txs = generateSyntheticTransactions(customerId, 2026, false);
  const header =
    'customer_id,bank_account_id,tx_date,tx_timestamp,category,tx_amount_eur,balance_after_eur,transaction_type,merchant_id,mcc_code';
  const rows = txs.map((t) =>
    [
      t.customer_id,
      t.bank_account_id,
      t.tx_date,
      t.tx_timestamp,
      t.category,
      t.tx_amount_eur.toFixed(2),
      t.balance_after_eur.toFixed(2),
      t.transaction_type,
      t.merchant_id,
      t.mcc_code,
    ].join(',')
  );
  return '\uFEFF' + [header, ...rows].join('\n');
}
