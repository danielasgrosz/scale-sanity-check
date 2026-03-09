// lib/calc.ts

export type Inputs = {
  adSpend: number;        // monthly ad spend
  cogsPct: number;        // decimal (0.30 for 30%)
  stripeFeePct: number;   // decimal (0.029 for 2.9%)
  stripeFixedFee: number; // e.g. 0.30
};

export type OrderRow = {
  grossRevenue: number; // per-order revenue
  refund: number;       // per-order refunds (0 if none)
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
  refundRatePct: number; // 0..1
  trueRoasX: number;     // multiplier (e.g. 2.50)

  // NEW METRICS
  contributionMarginPct: number; // 0..1
  breakEvenRoasX: number;        // multiplier
  marginBufferPct: number;       // 0..1 (can be negative)
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

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

  // Stripe fee per order: gross * % + fixed
  const totalStripeFees = orders.reduce((sum, o) => {
    const fee = o.grossRevenue * inputs.stripeFeePct + inputs.stripeFixedFee;
    return sum + (Number.isFinite(fee) ? fee : 0);
  }, 0);

  const netRevenue = grossRevenue - totalRefunds - totalStripeFees;

  // COGS as a % of gross revenue (simple V1)
  const cogsTotal = grossRevenue * inputs.cogsPct;

  const contributionProfit = netRevenue - cogsTotal;

  const profitAfterAds = contributionProfit - inputs.adSpend;

  const refundRatePct = grossRevenue > 0 ? totalRefunds / grossRevenue : 0;

  const trueRoasX = inputs.adSpend > 0 ? grossRevenue / inputs.adSpend : 0;

  // NEW METRICS
  const contributionMarginPct =
    grossRevenue > 0 ? contributionProfit / grossRevenue : 0;

  const breakEvenRoasX =
    contributionMarginPct > 0 ? 1 / contributionMarginPct : 0;

  // store as DECIMAL (0.25 = 25%). can be negative if below break-even.
  const marginBufferPct =
    breakEvenRoasX > 0 ? (trueRoasX / breakEvenRoasX - 1) : 0;

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