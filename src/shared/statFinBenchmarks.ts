import type { SBankCustomer, StatFinCohortBenchmark, TrackerCategoryId } from './types.ts';

/**
 * Open population reference benchmarks modeled on Statistics Finland (Tilastokeskus)
 * Household Consumption Survey (Kotitalouksien kulutus, 1person / compact urban household
 * vs family household monthly medians, adjusted by postal region).
 * Used strictly as neutral context in the spirit of MyData — never as prescriptive targets.
 */
const BASE_BENCHMARK_UNDER_30: Record<TrackerCategoryId, number> = {
  housing: 860,
  groceries: 330,
  restaurants_cafes: 135,
  travel_taxis: 115,
  car_driving: 70,
  entertainment_electronics: 85,
  hobbies_sports: 65,
  clothing_appearance: 60,
  health: 45,
  pets: 25,
  insurance_bills: 65,
  other_repairs: 55,
};

const BASE_BENCHMARK_30_TO_44: Record<TrackerCategoryId, number> = {
  housing: 1120,
  groceries: 540,
  restaurants_cafes: 155,
  travel_taxis: 130,
  car_driving: 210,
  entertainment_electronics: 105,
  hobbies_sports: 85,
  clothing_appearance: 85,
  health: 75,
  pets: 40,
  insurance_bills: 105,
  other_repairs: 85,
};

const BASE_BENCHMARK_45_PLUS: Record<TrackerCategoryId, number> = {
  housing: 1040,
  groceries: 490,
  restaurants_cafes: 125,
  travel_taxis: 110,
  car_driving: 225,
  entertainment_electronics: 90,
  hobbies_sports: 75,
  clothing_appearance: 70,
  health: 95,
  pets: 40,
  insurance_bills: 115,
  other_repairs: 95,
};

export function getStatFinBenchmarkForCustomer(customer: SBankCustomer): StatFinCohortBenchmark {
  const age = customer.customer_age || 30;
  const postal = (customer.customer_postal_code || '00100').trim();

  const base =
    age < 30
      ? BASE_BENCHMARK_UNDER_30
      : age < 45
      ? BASE_BENCHMARK_30_TO_44
      : BASE_BENCHMARK_45_PLUS;

  const ageLabel = age < 30 ? 'Age 18–29' : age < 45 ? 'Age 30–44' : 'Age 45+';

  let housingMultiplier = 1.0;
  let regionLabel = 'Urban Finland';

  if (postal.startsWith('00') || postal.startsWith('01') || postal.startsWith('02')) {
    housingMultiplier = 1.12;
    regionLabel = 'Helsinki Capital Region (00–02xxx)';
  } else if (postal.startsWith('33')) {
    housingMultiplier = 0.96;
    regionLabel = 'Tampere / Pirkanmaa (33xxx)';
  } else if (postal.startsWith('20')) {
    housingMultiplier = 0.93;
    regionLabel = 'Turku / Southwest Finland (20xxx)';
  } else {
    housingMultiplier = 0.88;
    regionLabel = `Postal Region ${postal.slice(0, 2)}xxx`;
  }

  const adjusted = { ...base };
  adjusted.housing = Math.round(base.housing * housingMultiplier);

  return {
    cohortId: `${ageLabel.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${postal.slice(0, 2)}`,
    cohortLabel: `${ageLabel} · ${regionLabel}`,
    regionLabel,
    sourceCitation:
      'Open reference benchmark modeled on Statistics Finland (Tilastokeskus) Household Consumption Survey structure',
    monthlyMedianByCategoryEur: adjusted,
  };
}
