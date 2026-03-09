"use client";

import React, { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { computeFromOrders, Inputs, OrderRow, Outputs } from "@/lib/calc";

declare global {
  interface Window {
    plausible?: (event: string, options?: Record<string, unknown>) => void;
  }
}

const EARLY_ACCESS_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSe4u_eAaiF8S1cVBG9IdgkD8fESN0ibIH718DFRTllpHp_H_Q/viewform";

type ParsedCSV = {
  headers: string[];
  rows: Record<string, string>[];
};

function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  const cleaned = s.replace(/[$,]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

const pctToDecimal = (pct: number) => pct / 100;

const fmtMoney = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD" });

const fmtX = (n: number) => `${n.toFixed(2)}x`;

const fmtPct = (d: number) => `${(d * 100).toFixed(2)}%`;

export default function HomePage() {
  const [csv, setCsv] = useState<ParsedCSV | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [revenueCol, setRevenueCol] = useState<string>("");
  const [refundCol, setRefundCol] = useState<string>("");

  const [adSpend, setAdSpend] = useState<number>(0);
  const [cogsPct, setCogsPct] = useState<number>(30);
  const [stripeFeePct, setStripeFeePct] = useState<number>(2.9);
  const [stripeFixedFee, setStripeFixedFee] = useState<number>(0.3);

  const [outputs, setOutputs] = useState<Outputs | null>(null);
  const [error, setError] = useState<string>("");

  const [revAutoDetected, setRevAutoDetected] = useState(false);
  const [refAutoDetected, setRefAutoDetected] = useState(false);

  const headers = csv?.headers ?? [];
  const canCalculate = !!csv && !!revenueCol;

  const tooFewRows = !!csv && csv.rows.length < 2;

  const noRevenueDetected = !!csv && !revenueCol;

  const revenueColIsEmpty = useMemo(() => {
    if (!csv || !revenueCol) return false;
    const values = csv.rows.map((r) => toNumber(r[revenueCol]));
    const nonZero = values.filter((v) => v > 0);
    return values.length > 0 && nonZero.length / values.length < 0.1;
  }, [csv, revenueCol]);

  const suggestedRevenue = useMemo(() => {
    const candidates = headers.filter((h) =>
      /revenue|total|amount|gross|price|subtotal/i.test(h)
    );
    return candidates[0] ?? "";
  }, [headers]);

  const suggestedRefund = useMemo(() => {
    const candidates = headers.filter((h) => /refund|returned/i.test(h));
    return candidates[0] ?? "";
  }, [headers]);

  function onFile(file: File) {
    setError("");
    setOutputs(null);
    setFileName(file.name);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const fields = (results.meta.fields ?? []).filter(Boolean) as string[];
        const rows = (results.data ?? []).filter((r) => Object.keys(r).length > 0);

        if (!fields.length) {
          setError("Could not detect headers. Make sure row 1 contains column names.");
          setCsv(null);
          return;
        }

        setCsv({ headers: fields, rows });

        const rev =
          fields.find((h) => h === suggestedRevenue) ??
          fields.find((h) => /revenue|amount|gross|total/i.test(h)) ??
          "";
        const ref =
          fields.find((h) => h === suggestedRefund) ??
          fields.find((h) => /refund/i.test(h)) ??
          "";

        setRevenueCol(rev);
        setRefundCol(ref);
        setRevAutoDetected(!!rev);
        setRefAutoDetected(!!ref);
      },
      error: (err) => {
        setError(`CSV parse error: ${err.message}`);
        setCsv(null);
      },
    });
  }

  function calculate() {
    setError("");
    setOutputs(null);

    if (!csv) return setError("Upload a CSV first.");
    if (!revenueCol) return setError("Select which column contains gross revenue.");

    const orders: OrderRow[] = csv.rows.map((r) => ({
      grossRevenue: toNumber(r[revenueCol]),
      refund: refundCol ? toNumber(r[refundCol]) : 0,
    }));

    const inputs: Inputs = {
      adSpend,
      cogsPct: pctToDecimal(cogsPct),
      stripeFeePct: pctToDecimal(stripeFeePct),
      stripeFixedFee,
    };

    setOutputs(computeFromOrders(inputs, orders));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}>
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <rect x="1" y="8" width="3" height="6" rx="0.75" fill="white" />
                <rect x="6" y="5" width="3" height="9" rx="0.75" fill="white" />
                <rect x="11" y="1" width="3" height="13" rx="0.75" fill="white" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-gray-900 tracking-tight">Scale Sanity Check</span>
          </div>
          <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">v1 beta</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Page title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Scale Sanity Check</h1>
          <p className="mt-1.5 text-sm text-gray-500 max-w-lg">
            Most ecommerce brands don&apos;t know their true ROAS. Upload your orders CSV and instantly see your real contribution margin, break-even ROAS, and whether your ad spend is actually profitable.
          </p>
        </div>

        {/* Early access banner */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl bg-gray-900 px-5 py-4">
          <p className="flex-1 text-sm text-gray-300 leading-relaxed">
            We&apos;re building smarter tools — ad scaling simulations, spend recommendations, and insights based on your actual numbers.
          </p>
          <a
            href={EARLY_ACCESS_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => window.plausible?.("EarlyAccessClick")}
            className="shrink-0 text-xs font-semibold px-4 py-2.5 rounded-lg bg-white text-gray-900 hover:bg-gray-100 transition-colors"
          >
            Join Early Access
          </a>
        </div>

        {/* Steps */}
        <div className="space-y-3 mt-10">

          {/* Step 1: Upload */}
          <StepCard step={1} title="Upload Orders CSV" complete={!!csv}>
            <div
              className={`relative border-2 border-dashed rounded-xl transition-all duration-150 cursor-pointer ${
                isDragging
                  ? "border-gray-400 bg-gray-100"
                  : csv
                  ? "border-green-200 bg-green-50 hover:border-green-300"
                  : "border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-white"
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
              <div className="flex items-center justify-center gap-4 py-8">
                {csv ? (
                  <>
                    <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M3.5 9.5L7.5 13.5L14.5 5.5" stroke="#16a34a" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{fileName}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        <span className="font-medium text-gray-700">{csv.rows.length}</span> rows &middot; <span className="font-medium text-gray-700">{csv.headers.length}</span> columns detected
                      </p>
                    </div>
                    <span className="ml-auto mr-2 text-xs text-gray-400 hover:text-gray-600 transition-colors">Click to replace</span>
                  </>
                ) : (
                  <>
                    <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M9 12V6M9 6L6.5 8.5M9 6L11.5 8.5" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M3 13v2a1 1 0 001 1h10a1 1 0 001-1v-2" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">
                        Drop your CSV here, or <span className="text-gray-900 underline underline-offset-2 decoration-gray-400">browse files</span>
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">Row 1 must contain column headers</p>
                      <p className="text-xs text-gray-400 mt-1">Needs a revenue column (e.g. <span className="font-medium">Total</span>, <span className="font-medium">Gross Revenue</span>, <span className="font-medium">Subtotal</span>, <span className="font-medium">Amount</span>) and optionally a refunds column.</p>
                    </div>
                  </>
                )}
              </div>
              {tooFewRows && (
                <div className="flex items-start gap-2 px-4 pb-4 -mt-1">
                  <svg className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" viewBox="0 0 16 16" fill="none">
                    <path d="M8 2L14.5 13H1.5L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                    <path d="M8 6.5V9.5M8 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  <p className="text-xs text-amber-700">Your CSV only has {csv!.rows.length} row of data — make sure you exported all orders, not just a summary.</p>
                </div>
              )}
              {!csv && <ExportGuide />}
            </div>
          </StepCard>

          {/* Steps 2 & 3 in a two-column grid */}
          <div className="grid grid-cols-2 gap-3">

            {/* Step 2: Map Columns */}
            <StepCard step={2} title="Map Columns" locked={!csv}>
              <div className="space-y-4">
                {noRevenueDetected && (
                  <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
                    <svg className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" viewBox="0 0 16 16" fill="none">
                      <path d="M8 2L14.5 13H1.5L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                      <path d="M8 6.5V9.5M8 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <p className="text-xs text-amber-800 leading-relaxed">We couldn&apos;t find a revenue column automatically — look for a column named <span className="font-medium">Total</span>, <span className="font-medium">Gross Revenue</span>, <span className="font-medium">Subtotal</span>, or <span className="font-medium">Amount</span> and select it below.</p>
                  </div>
                )}
                <Field label="Which column is your order revenue?" required hint="required" autoDetected={revAutoDetected}>
                  <SelectInput
                    value={revenueCol}
                    onChange={(v) => { setRevenueCol(v); setRevAutoDetected(false); }}
                    disabled={!csv}
                    placeholder={csv ? "Select a column…" : "Upload CSV first"}
                    options={headers}
                  />
                  {revenueColIsEmpty && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700">
                      <svg className="w-3 h-3 shrink-0 text-amber-500" viewBox="0 0 16 16" fill="none">
                        <path d="M8 2L14.5 13H1.5L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                        <path d="M8 6.5V9.5M8 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                      The column you selected looks empty — double check you picked the right one.
                    </p>
                  )}
                </Field>
                <Field label="Which column shows refunds or returns?" hint="optional" autoDetected={refAutoDetected}>
                  <SelectInput
                    value={refundCol}
                    onChange={(v) => { setRefundCol(v); setRefAutoDetected(false); }}
                    disabled={!csv}
                    placeholder="No refunds column"
                    options={headers}
                  />
                </Field>
              </div>
            </StepCard>

            {/* Step 3: Cost Inputs + Run */}
            <StepCard step={3} title="Cost Inputs">
              <div className="grid grid-cols-2 gap-3 mb-4">
                <Field label="Ad Spend" hint="$/mo">
                  <NumberInput value={adSpend} onChange={setAdSpend} prefix="$" step={100} />
                </Field>
                <Field label="COGS" hint="% of gross">
                  <NumberInput value={cogsPct} onChange={setCogsPct} suffix="%" step={1} />
                </Field>
                <Field label="Stripe Fee" hint="% per txn">
                  <NumberInput value={stripeFeePct} onChange={setStripeFeePct} suffix="%" step={0.1} />
                </Field>
                <Field label="Stripe Fixed" hint="$ per txn">
                  <NumberInput value={stripeFixedFee} onChange={setStripeFixedFee} prefix="$" step={0.01} />
                </Field>
              </div>

              <button
                onClick={calculate}
                disabled={!canCalculate}
                className={`w-full py-3 px-4 rounded-lg text-sm font-semibold transition-all duration-150 ${
                  canCalculate
                    ? "bg-gray-900 text-white hover:bg-gray-800 active:scale-[0.99] shadow-sm cursor-pointer"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}
              >
                Run Analysis
              </button>
            </StepCard>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mt-4 flex items-start gap-2.5 px-4 py-3 rounded-xl border border-red-200 bg-red-50">
            <svg className="w-4 h-4 mt-0.5 shrink-0 text-red-500" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 5.5V8.5M8 10.5h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Results dashboard */}
        {outputs && (
          <div className="mt-10 space-y-6">
            <div className="flex items-baseline justify-between border-b border-gray-200 pb-3">
              <h2 className="text-base font-bold text-gray-900">Results</h2>
              <span className="text-xs text-gray-400">{csv?.rows.length} orders · {csv?.headers.length} columns</span>
            </div>

            {/* Summary callout */}
            <Summary outputs={outputs} />

            {/* Recommendations */}
            <Recommendations outputs={outputs} />

            {/* Revenue breakdown */}
            <MetricGroup label="Revenue">
              <MetricCard
                title="Gross Revenue"
                value={fmtMoney(outputs.grossRevenue)}
                tooltip="Total revenue from orders before refunds, fees, or any deductions."
              />
              <MetricCard
                title="Total Refunds"
                value={fmtMoney(outputs.totalRefunds)}
                sub={fmtPct(outputs.refundRatePct) + " refund rate"}
                tone="negative"
                tooltip="Total value of refunded orders during this period."
              />
              <MetricCard
                title="Stripe Fees"
                value={fmtMoney(outputs.totalStripeFees)}
                tone="negative"
                tooltip="Estimated payment processing costs based on your fee rate and fixed fee per transaction."
              />
              <MetricCard
                title="Net Revenue"
                value={fmtMoney(outputs.netRevenue)}
                emphasis
                tooltip="Gross revenue minus refunds and Stripe fees — what actually lands in your account."
              />
              <MetricCard
                title="AOV"
                value={fmtMoney(outputs.aov)}
                tooltip="Average revenue per order after refunds — the typical value of a single transaction."
              />
            </MetricGroup>

            {/* Profitability */}
            <MetricGroup label="Profitability">
              <MetricCard
                title="COGS Total"
                value={fmtMoney(outputs.cogsTotal)}
                tone="negative"
                tooltip="Estimated cost of goods sold, calculated as your COGS % applied to gross revenue."
              />
              <MetricCard
                title="Contribution Profit"
                value={fmtMoney(outputs.contributionProfit)}
                tone={outputs.contributionProfit >= 0 ? "positive" : "negative"}
                tooltip="What's left after COGS, fees, and refunds — before ad spend."
              />
              <MetricCard
                title="Profit After Ads"
                value={fmtMoney(outputs.profitAfterAds)}
                tone={outputs.profitAfterAds >= 0 ? "positive" : "negative"}
                emphasis
                tooltip="Your bottom-line profit after all costs including ad spend."
              />
              <MetricCard
                title="Order Count"
                value={`${outputs.orderCount}`}
                sub="orders analyzed"
                tooltip="Total number of orders included in this analysis."
              />
            </MetricGroup>

            {/* Efficiency */}
            <MetricGroup label="Efficiency">
              <MetricCard
                title="True ROAS"
                value={fmtX(outputs.trueRoasX)}
                emphasis
                tooltip="Revenue generated for every $1 spent on ads after refunds and fees."
              />
              <MetricCard
                title="Break-even ROAS"
                value={outputs.breakEvenRoasX > 0 ? fmtX(outputs.breakEvenRoasX) : "—"}
                sub="minimum to cover costs"
                tooltip="The minimum ROAS you need to cover all costs — below this you're losing money."
              />
              <MetricCard
                title="Contribution Margin"
                value={fmtPct(outputs.contributionMarginPct)}
                tone={outputs.contributionMarginPct > 0 ? "positive" : "negative"}
                tooltip="What's left after COGS, fees, and refunds as a percentage of gross revenue — before ad spend."
              />
              <MetricCard
                title="Margin Buffer"
                value={`${(outputs.marginBufferPct * 100).toFixed(1)}%`}
                tone={outputs.marginBufferPct >= 0 ? "positive" : "negative"}
                sub={outputs.marginBufferPct >= 0 ? "above break-even" : "below break-even"}
                tooltip="How far your current ROAS is above or below break-even — positive means you have room to scale."
              />
            </MetricGroup>

            <p className="text-xs text-gray-400 pb-4">
              V1 · COGS modeled as % of gross revenue · Shipping and tax not included
            </p>

            {/* Early access CTA — shown after results */}
            <EarlyAccessCard />
          </div>
        )}
      </main>

    </div>
  );
}

/* ─── Sub-components ────────────────────────────────────────── */

function ExportGuide() {
  const [open, setOpen] = useState(false);

  function downloadSampleXLSX() {
    const data = [
      { "Order ID": "ORD-1001", "Gross Revenue": 127.50, "Refund Amount": 0.00 },
      { "Order ID": "ORD-1002", "Gross Revenue": 89.00,  "Refund Amount": 0.00 },
      { "Order ID": "ORD-1003", "Gross Revenue": 54.99,  "Refund Amount": 54.99 },
      { "Order ID": "ORD-1004", "Gross Revenue": 163.00, "Refund Amount": 0.00 },
      { "Order ID": "ORD-1005", "Gross Revenue": 42.50,  "Refund Amount": 0.00 },
      { "Order ID": "ORD-1006", "Gross Revenue": 98.75,  "Refund Amount": 0.00 },
      { "Order ID": "ORD-1007", "Gross Revenue": 175.00, "Refund Amount": 0.00 },
      { "Order ID": "ORD-1008", "Gross Revenue": 67.25,  "Refund Amount": 67.25 },
      { "Order ID": "ORD-1009", "Gross Revenue": 149.99, "Refund Amount": 0.00 },
      { "Order ID": "ORD-1010", "Gross Revenue": 38.00,  "Refund Amount": 0.00 },
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Orders");
    XLSX.writeFile(wb, "sample-orders.xlsx");
  }

  const platforms = [
    {
      name: "Shopify",
      steps: ["Go to Orders in your Shopify admin", "Click Export (top right)", "Choose All orders", "Select CSV for Excel and export"],
    },
    {
      name: "WooCommerce",
      steps: ["Go to WooCommerce → Orders", "Click the Export button", "Choose CSV as the format", "Export all orders"],
    },
    {
      name: "Any other platform",
      steps: ["Export your orders as a CSV file", "Make sure row 1 has column headers", "Include at least one column for order revenue (e.g. Total, Amount, Gross Revenue)"],
    },
  ];

  return (
    <div className="border-t border-gray-100 mt-1">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
        >
          <span className="font-medium">How to export your CSV</span>
          <svg
            className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            viewBox="0 0 14 14" fill="none"
          >
            <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); downloadSampleXLSX(); }}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
        >
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
            <path d="M6 1v6M6 7l-2-2M6 7l2-2M1.5 9.5v.5a1 1 0 001 1h7a1 1 0 001-1v-.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Download sample spreadsheet
        </button>
      </div>

      {open && (
        <div className="px-4 pb-4 grid grid-cols-3 gap-4">
          {platforms.map((p) => (
            <div key={p.name}>
              <p className="text-[11px] font-semibold text-gray-500 mb-2">{p.name}</p>
              <ol className="space-y-1.5">
                {p.steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="shrink-0 w-4 h-4 rounded-full bg-gray-100 text-gray-400 text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                    <span className="text-[11px] text-gray-500 leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StepCard({
  step,
  title,
  children,
  complete,
  locked,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
  complete?: boolean;
  locked?: boolean;
}) {
  return (
    <div className={`bg-white rounded-2xl border ${locked ? "border-gray-100" : "border-gray-200"} transition-colors`}>
      <div className="px-5 py-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
              complete
                ? "bg-green-100 text-green-700"
                : locked
                ? "bg-gray-100 text-gray-400"
                : "bg-gray-900 text-white"
            }`}
          >
            {complete ? (
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M2 5.5L4.5 8L9 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              step
            )}
          </div>
          <h2 className={`text-sm font-semibold ${locked ? "text-gray-400" : "text-gray-800"}`}>{title}</h2>
        </div>
        <div className={locked ? "opacity-40 pointer-events-none select-none" : ""}>{children}</div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  autoDetected,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  autoDetected?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <label className="text-xs font-medium text-gray-700 truncate">
            {label}
            {required && <span className="text-red-400 ml-0.5">*</span>}
          </label>
          {autoDetected && (
            <span className="shrink-0 text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full leading-none">
              Auto-detected
            </span>
          )}
        </div>
        {hint && <span className="text-xs text-gray-400 shrink-0">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function SelectInput({
  value,
  onChange,
  disabled,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder: string;
  options: string[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-3 py-2.5 pr-8 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-40 disabled:cursor-not-allowed appearance-none"
      >
        <option value="">{placeholder}</option>
        {options.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M3.5 5.5L7 9L10.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  prefix,
  suffix,
  step,
}: {
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
}) {
  return (
    <div className="relative flex items-center">
      {prefix && (
        <span className="absolute left-3 text-xs text-gray-400 pointer-events-none z-10">{prefix}</span>
      )}
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(toNumber(e.target.value))}
        className={`w-full py-2.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent ${
          prefix ? "pl-6 pr-3" : suffix ? "pl-3 pr-7" : "px-3"
        }`}
      />
      {suffix && (
        <span className="absolute right-3 text-xs text-gray-400 pointer-events-none">{suffix}</span>
      )}
    </div>
  );
}

function MetricGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">{label}</p>
      <div className="grid grid-cols-4 gap-3">{children}</div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  tone,
  hint,
  sub,
  emphasis,
  tooltip,
}: {
  title: string;
  value: string;
  tone?: "positive" | "negative";
  hint?: string;
  sub?: string;
  emphasis?: boolean;
  tooltip?: string;
}) {
  const valueClass =
    tone === "positive"
      ? "text-green-700"
      : tone === "negative"
      ? "text-red-600"
      : "text-gray-900";

  return (
    <div
      className={`rounded-xl px-4 py-3.5 border transition-colors ${
        emphasis
          ? "bg-gray-50 border-gray-200"
          : "bg-white border-gray-100 hover:border-gray-200"
      }`}
    >
      <div className="flex items-center gap-1 mb-1.5">
        <p className="text-xs font-medium text-gray-500 truncate">{title}</p>
        {tooltip && (
          <div className="relative group shrink-0">
            <svg className="w-3 h-3 text-gray-300 hover:text-gray-400 transition-colors cursor-default" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 7v4M8 5.5h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10 w-52 bg-gray-900 text-white text-[11px] leading-snug rounded-lg px-2.5 py-2 shadow-lg pointer-events-none">
              {tooltip}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
            </div>
          </div>
        )}
      </div>
      <p className={`text-[17px] font-bold leading-none tracking-tight ${valueClass}`}>{value}</p>
      {(sub || hint) && (
        <p className="text-[11px] text-gray-400 mt-1.5 leading-tight">{sub ?? hint}</p>
      )}
    </div>
  );
}

function EarlyAccessCard() {
  return (
    <div className="rounded-2xl bg-gray-900 px-6 py-6 flex flex-col sm:flex-row sm:items-center gap-5">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Early access</p>
        <h3 className="text-base font-bold text-white">Want deeper analysis?</h3>
        <p className="text-sm text-gray-400 mt-1 leading-relaxed">
          I&apos;m exploring a deeper version of this tool — with ad scaling simulations, spend recommendations, and actionable insights based on your actual numbers.
        </p>
      </div>
      <div className="shrink-0">
        <a
          href={EARLY_ACCESS_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => window.plausible?.("EarlyAccessClick")}
          className="inline-block py-2.5 px-5 rounded-xl text-sm font-semibold bg-white text-gray-900 hover:bg-gray-100 transition-colors"
        >
          Join Early Access
        </a>
      </div>
    </div>
  );
}

function Recommendations({ outputs }: { outputs: Outputs }) {
  type Rec = { tone: "positive" | "negative" | "neutral"; headline: string; body: string };
  const recs: Rec[] = [];

  // Card 1: ad spend action
  if (outputs.profitAfterAds < 0) {
    if (outputs.contributionProfit > 0) {
      const reduceBy = Math.abs(outputs.profitAfterAds);
      recs.push({
        tone: "negative",
        headline: `Cut ad spend by ${fmtMoney(reduceBy)} to reach break-even`,
        body: `At current revenue, reducing ad spend by ${fmtMoney(reduceBy)} would bring profit to exactly $0. Any reduction beyond that puts you in the black.`,
      });
    } else {
      recs.push({
        tone: "negative",
        headline: "Contribution margin is negative — ads aren't the root problem",
        body: `Even with zero ad spend you'd be losing money. Focus on reducing COGS or increasing prices before scaling ads.`,
      });
    }
  } else if (outputs.contributionProfit > 0 && outputs.breakEvenRoasX > 0) {
    const adSpend = outputs.contributionProfit - outputs.profitAfterAds;
    const roomToGrow = (outputs.contributionProfit / outputs.breakEvenRoasX) - adSpend;
    if (roomToGrow > 0) {
      recs.push({
        tone: "positive",
        headline: `Room to scale — up to ${fmtMoney(roomToGrow)} more in ad spend`,
        body: `Based on your break-even ROAS of ${fmtX(outputs.breakEvenRoasX)}, you could increase ad spend by up to ${fmtMoney(roomToGrow)} before profit hits zero.`,
      });
    }
  }

  // Card 2: AOV improvement
  if (outputs.aov > 0 && outputs.orderCount > 0 && outputs.contributionMarginPct > 0) {
    const targetAOV = outputs.aov * 1.1;
    const additionalProfit = outputs.orderCount * outputs.aov * 0.1 * outputs.contributionMarginPct;
    recs.push({
      tone: "neutral",
      headline: `Raising AOV from ${fmtMoney(outputs.aov)} to ${fmtMoney(targetAOV)} adds ~${fmtMoney(additionalProfit)} in profit`,
      body: `A 10% increase in average order value — through upsells, bundles, or minimum order thresholds — would add approximately ${fmtMoney(additionalProfit)} in contribution profit at your current order volume.`,
    });
  }

  if (recs.length === 0) return null;

  const toneStyles = {
    positive: { card: "border-green-100 bg-green-50", icon: "bg-green-100", dot: "#16a34a", path: "M2 6l3.5 3.5L11 3" },
    negative: { card: "border-red-100 bg-red-50",   icon: "bg-red-100",   dot: "#dc2626", path: "M6 2v4M6 8h.01"   },
    neutral:  { card: "border-gray-100 bg-gray-50", icon: "bg-gray-100",  dot: "#6b7280", path: "M6 3v3M6 8h.01"   },
  };

  return (
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">Recommendations</p>
      <div className="space-y-2">
        {recs.map((rec, i) => {
          const s = toneStyles[rec.tone];
          return (
            <div key={i} className={`flex items-start gap-3 rounded-xl border px-4 py-4 ${s.card}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${s.icon}`}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d={s.path} stroke={s.dot} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 leading-snug">{rec.headline}</p>
                <p className="text-xs text-gray-600 mt-1 leading-relaxed">{rec.body}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Summary({ outputs }: { outputs: Outputs }) {
  const profitable = outputs.profitAfterAds > 0;
  const bufferAbs = (Math.abs(outputs.marginBufferPct) * 100).toFixed(1);

  const profitLine = profitable
    ? `Profitable after ads — generating ${fmtMoney(outputs.profitAfterAds)} this period.`
    : `Not profitable after ads — losing ${fmtMoney(Math.abs(outputs.profitAfterAds))} this period.`;

  const breakevenLine =
    outputs.breakEvenRoasX > 0
      ? `Break-even requires a minimum ROAS of ${fmtX(outputs.breakEvenRoasX)}.`
      : "Break-even ROAS cannot be calculated (contribution margin \u2264 0).";

  const bufferLine =
    outputs.marginBufferPct >= 0
      ? `Current ROAS of ${fmtX(outputs.trueRoasX)} is ${bufferAbs}% above break-even — ad spend has room to grow.`
      : `Current ROAS of ${fmtX(outputs.trueRoasX)} is ${bufferAbs}% below break-even — reduce spend or increase revenue.`;

  return (
    <div
      className={`rounded-2xl border-2 px-5 py-4 ${
        profitable ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
            profitable ? "bg-green-200" : "bg-red-200"
          }`}
        >
          {profitable ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1.5 5L4 7.5L8.5 2.5" stroke="#15803d" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M5 2.5v3.5M5 8h.01" stroke="#b91c1c" strokeWidth="1.75" strokeLinecap="round"/>
            </svg>
          )}
        </div>
        <h3 className={`text-sm font-bold ${profitable ? "text-green-800" : "text-red-800"}`}>
          {profitable ? "Profitable" : "Unprofitable"}
        </h3>
      </div>
      <div className="space-y-1.5">
        <p className="text-sm text-gray-800 leading-relaxed">{profitLine}</p>
        <p className="text-sm text-gray-600 leading-relaxed">{breakevenLine}</p>
        <p className="text-sm text-gray-600 leading-relaxed">{bufferLine}</p>
      </div>
    </div>
  );
}
