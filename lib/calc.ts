// lib/calc.ts

export type Inputs = {
  adSpend: number;        // monthly ad spend
  cogsPct: number;        // decimal (0.30 for 30%)
  stripeFeePct: number;   // decimal (0.029 for 2.9%)
  stripeFixedFee: number; // e.g. 0.30
};

export type OrderRow = {
  grossRevenue: number;
  refund: number;
};

export type Outputs = {
  orderCount: number;
  grossRevenue: number;
  totalRefunds: number;
  totalStripeFees: number;
  netRevenue: number;
  cogsTotal: number;
  contributionProfit: number;
  profitAfterAds: number;
  refundRatePct: number;
  trueRoasX: number;
  contributionMarginPct: number;
  breakEvenRoasX: number;
  marginBufferPct: number;
};

export type HealthSignal = "great" | "ok" | "caution" | "danger";

// Per-scenario assumption overrides; all values are relative % deltas
// e.g. conversionRateAdj = -10 means 10% fewer orders per dollar at this spend level
export type ScenarioAdjustments = {
  conversionRateAdj: number;
  aovAdj: number;
  refundRateAdj: number;
};

export type ScenarioResult = {
  adSpend: number;
  projectedOrders: number;
  grossRevenue: number;
  totalRefunds: number;
  contributionProfit: number;
  profitAfterAds: number;
  trueRoasX: number;
  marginBufferPct: number;
  healthSignal: HealthSignal;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function getHealthSignal(profitAfterAds: number, marginBufferPct: number): HealthSignal {
  if (profitAfterAds > 0 && marginBufferPct >= 20) return "great";
  if (profitAfterAds > 0) return "ok";
  if (marginBufferPct >= -20) return "caution";
  return "danger";
}

export function computeFromOrders(inputs: Inputs, orders: OrderRow[]): Outputs {
  const orderCount = orders.length;

  const grossRevenue = orders.reduce(
    (sum, o) => sum + (Number.isFinite(o.grossRevenue) ? o.grossRevenue : 0),
    0
  );

  const totalRefunds = orders.reduce(
    (sum, o) => sum + (Number.isFinite(o.refund) ? o.refund : 0),
    0
  );

  const totalStripeFees = orders.reduce((sum, o) => {
    const fee = o.grossRevenue * inputs.stripeFeePct + inputs.stripeFixedFee;
    return sum + (Number.isFinite(fee) ? fee : 0);
  }, 0);

  const netRevenue = grossRevenue - totalRefunds - totalStripeFees;
  const cogsTotal = grossRevenue * inputs.cogsPct;
  const contributionProfit = netRevenue - cogsTotal;
  const profitAfterAds = contributionProfit - inputs.adSpend;

  const refundRatePct = grossRevenue > 0 ? totalRefunds / grossRevenue : 0;
  const trueRoasX = inputs.adSpend > 0 ? grossRevenue / inputs.adSpend : 0;
  const contributionMarginPct = grossRevenue > 0 ? contributionProfit / grossRevenue : 0;
  const breakEvenRoasX = contributionMarginPct > 0 ? 1 / contributionMarginPct : 0;
  const marginBufferPct =
    breakEvenRoasX > 0 ? (trueRoasX / breakEvenRoasX - 1) * 100 : 0;

  return {
    orderCount,
    grossRevenue: round2(grossRevenue),
    totalRefunds: round2(totalRefunds),
    totalStripeFees: round2(totalStripeFees),
    netRevenue: round2(netRevenue),
    cogsTotal: round2(cogsTotal),
    contributionProfit: round2(contributionProfit),
    profitAfterAds: round2(profitAfterAds),
    refundRatePct,
    trueRoasX,
    contributionMarginPct,
    breakEvenRoasX,
    marginBufferPct,
  };
}

// Projects performance at a scaled ad spend level.
// Returns null if baseline lacks the data needed for projection.
export function computeScenario(
  baseline: Outputs,
  baseInputs: Inputs,
  multiplier: number,
  adj: ScenarioAdjustments
): ScenarioResult | null {
  if (baseInputs.adSpend <= 0 || baseline.orderCount === 0 || baseline.grossRevenue <= 0) {
    return null;
  }

  const baseAOV = baseline.grossRevenue / baseline.orderCount;
  const impliedCPA = baseInputs.adSpend / baseline.orderCount;
  const scenarioAdSpend = round2(baseInputs.adSpend * multiplier);

  // Order count scales with spend; conversion efficiency adj applies on top
  const projectedOrders = Math.max(
    0,
    Math.round((scenarioAdSpend / impliedCPA) * (1 + adj.conversionRateAdj / 100))
  );

  const projectedAOV = Math.max(0, baseAOV * (1 + adj.aovAdj / 100));
  const grossRevenue = round2(projectedOrders * projectedAOV);

  // Refund rate: relative % change on current rate
  const projectedRefundRate = Math.max(0, baseline.refundRatePct * (1 + adj.refundRateAdj / 100));
  const totalRefunds = round2(grossRevenue * projectedRefundRate);

  const totalStripeFees = round2(
    projectedOrders * (projectedAOV * baseInputs.stripeFeePct + baseInputs.stripeFixedFee)
  );

  const netRevenue = grossRevenue - totalRefunds - totalStripeFees;
  const cogsTotal = grossRevenue * baseInputs.cogsPct;
  const contributionProfit = round2(netRevenue - cogsTotal);
  const profitAfterAds = round2(contributionProfit - scenarioAdSpend);

  const trueRoasX = scenarioAdSpend > 0 ? grossRevenue / scenarioAdSpend : 0;
  const contributionMarginPct = grossRevenue > 0 ? contributionProfit / grossRevenue : 0;
  const breakEvenRoasX = contributionMarginPct > 0 ? 1 / contributionMarginPct : 0;
  const marginBufferPct = breakEvenRoasX > 0 ? (trueRoasX / breakEvenRoasX - 1) * 100 : 0;

  return {
    adSpend: scenarioAdSpend,
    projectedOrders,
    grossRevenue,
    totalRefunds,
    contributionProfit,
    profitAfterAds,
    trueRoasX,
    marginBufferPct,
    healthSignal: getHealthSignal(profitAfterAds, marginBufferPct),
  };
}
