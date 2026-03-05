"use client";

import React, { useMemo, useState } from "react";
import Papa from "papaparse";
import { computeFromOrders, Inputs, OrderRow, Outputs } from "@/lib/calc";

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

export default function UploadPage() {
  const [csv, setCsv] = useState<ParsedCSV | null>(null);

  // Column mapping
  const [revenueCol, setRevenueCol] = useState<string>("");
  const [refundCol, setRefundCol] = useState<string>("");

  // Inputs (match your sheet)
  const [adSpend, setAdSpend] = useState<number>(0);
  const [cogsPct, setCogsPct] = useState<number>(30); // percent
  const [stripeFeePct, setStripeFeePct] = useState<number>(2.9); // percent
  const [stripeFixedFee, setStripeFixedFee] = useState<number>(0.3);

  const [outputs, setOutputs] = useState<Outputs | null>(null);
  const [error, setError] = useState<string>("");

  const headers = csv?.headers ?? [];
  const canCalculate = !!csv && !!revenueCol;

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

        // Auto-suggest mappings
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

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6 }}>
        Scale Sanity Check
      </h1>
      <p style={{ marginTop: 0, color: "#555" }}>
        Upload an orders CSV, map revenue/refunds, and calculate true profitability (v1).
      </p>

      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 0 }}>1) Upload CSV</h2>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        {csv && (
          <div style={{ marginTop: 10, color: "#555" }}>
            Detected <b>{csv.rows.length}</b> rows and <b>{csv.headers.length}</b> columns.
          </div>
        )}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 0 }}>2) Map Columns</h2>

          <label style={{ display: "block", marginBottom: 6 }}>
            Gross Revenue Column (required)
          </label>
          <select
            value={revenueCol}
            onChange={(e) => setRevenueCol(e.target.value)}
            style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
            disabled={!csv}
          >
            <option value="">{csv ? "Select a column..." : "Upload CSV first"}</option>
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>

          <label style={{ display: "block", marginTop: 12, marginBottom: 6 }}>
            Refund Column (optional)
          </label>
          <select
            value={refundCol}
            onChange={(e) => setRefundCol(e.target.value)}
            style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
            disabled={!csv}
          >
            <option value="">No refunds column</option>
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </section>

        <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 0 }}>3) Inputs</h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Monthly Ad Spend ($)">
              <input
                type="number"
                value={adSpend}
                onChange={(e) => setAdSpend(toNumber(e.target.value))}
                style={inputStyle}
              />
            </Field>

            <Field label="COGS (%)">
              <input
                type="number"
                value={cogsPct}
                onChange={(e) => setCogsPct(toNumber(e.target.value))}
                style={inputStyle}
              />
            </Field>

            <Field label="Stripe Fee (%)">
              <input
                type="number"
                value={stripeFeePct}
                onChange={(e) => setStripeFeePct(toNumber(e.target.value))}
                style={inputStyle}
              />
            </Field>

            <Field label="Stripe Fixed Fee ($)">
              <input
                type="number"
                value={stripeFixedFee}
                step="0.01"
                onChange={(e) => setStripeFixedFee(toNumber(e.target.value))}
                style={inputStyle}
              />
            </Field>
          </div>

          <button
            onClick={calculate}
            disabled={!canCalculate}
            style={{
              marginTop: 14,
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #111",
              background: canCalculate ? "#111" : "#888",
              color: "#fff",
              cursor: canCalculate ? "pointer" : "not-allowed",
              fontWeight: 700,
            }}
          >
            Calculate
          </button>
        </section>
      </div>

      {error && (
        <div style={{ marginTop: 16, padding: 12, borderRadius: 12, border: "1px solid #f3c0c0", background: "#fff5f5", color: "#900" }}>
          {error}
        </div>
      )}

      {outputs && (
        <section style={{ marginTop: 16, border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 0 }}>Results</h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <Card title="Orders" value={`${outputs.orderCount}`} />
            <Card title="Gross Revenue" value={fmtMoney(outputs.grossRevenue)} />
            <Card title="Refund Rate" value={fmtPct(outputs.refundRatePct)} />

            <Card title="Total Refunds" value={fmtMoney(outputs.totalRefunds)} />
            <Card title="Total Stripe Fees" value={fmtMoney(outputs.totalStripeFees)} />
            <Card title="Net Revenue" value={fmtMoney(outputs.netRevenue)} />

            <Card title="COGS Total" value={fmtMoney(outputs.cogsTotal)} />
            <Card title="Contribution Profit" value={fmtMoney(outputs.contributionProfit)} />
            <Card title="Profit After Ads" value={fmtMoney(outputs.profitAfterAds)} />

            <Card title="True ROAS" value={fmtX(outputs.trueRoasX)} />
            <Card
              title="Contribution Margin"
              value={fmtPct(outputs.contributionMarginPct)}
              highlight={outputs.contributionMarginPct > 0 ? "positive" : "negative"}
            />
            <Card
              title="Break-even ROAS"
              value={outputs.breakEvenRoasX > 0 ? fmtX(outputs.breakEvenRoasX) : "—"}
            />
            <Card
              title="Margin Buffer"
              value={`${outputs.marginBufferPct.toFixed(1)}%`}
              highlight={outputs.marginBufferPct >= 0 ? "positive" : "negative"}
            />
          </div>

          <Summary outputs={outputs} />

          <p style={{ marginTop: 12, fontSize: 13, color: "#666" }}>
            V1: COGS modeled as % of gross revenue. Shipping/tax not included.
          </p>
        </section>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 10,
  border: "1px solid #ccc",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

function Card({
  title,
  value,
  highlight,
}: {
  title: string;
  value: string;
  highlight?: "positive" | "negative";
}) {
  const valueColor =
    highlight === "positive" ? "#166534" : highlight === "negative" ? "#991b1b" : undefined;
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: valueColor }}>{value}</div>
    </div>
  );
}

function Summary({ outputs }: { outputs: Outputs }) {
  const profitable = outputs.profitAfterAds > 0;
  const bufferAbs = Math.abs(outputs.marginBufferPct).toFixed(1);

  let profitLine: string;
  if (profitable) {
    profitLine = `This business is profitable after ads, generating ${fmtMoney(outputs.profitAfterAds)} in profit this period.`;
  } else {
    profitLine = `This business is not profitable after ads — it is losing ${fmtMoney(Math.abs(outputs.profitAfterAds))} this period.`;
  }

  const breakevenLine =
    outputs.breakEvenRoasX > 0
      ? `To cover all costs before ads, you need a ROAS of at least ${fmtX(outputs.breakEvenRoasX)}.`
      : "Break-even ROAS cannot be calculated (contribution margin is zero or negative).";

  let bufferLine: string;
  if (outputs.marginBufferPct >= 0) {
    bufferLine = `Your current ROAS of ${fmtX(outputs.trueRoasX)} gives you a ${bufferAbs}% margin buffer above break-even — meaning ad spend could increase by that margin before the business stops covering its costs.`;
  } else {
    bufferLine = `Your current ROAS of ${fmtX(outputs.trueRoasX)} is ${bufferAbs}% below break-even — ad spend needs to be reduced or revenue increased to reach profitability.`;
  }

  return (
    <div
      style={{
        marginTop: 16,
        padding: 16,
        borderRadius: 12,
        border: `1px solid ${profitable ? "#bbf7d0" : "#fecaca"}`,
        background: profitable ? "#f0fdf4" : "#fff5f5",
      }}
    >
      <h3 style={{ fontSize: 15, fontWeight: 700, marginTop: 0, marginBottom: 8 }}>
        Summary
      </h3>
      <p style={{ margin: "0 0 8px", fontSize: 14, lineHeight: 1.6 }}>{profitLine}</p>
      <p style={{ margin: "0 0 8px", fontSize: 14, lineHeight: 1.6 }}>{breakevenLine}</p>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{bufferLine}</p>
    </div>
  );
}