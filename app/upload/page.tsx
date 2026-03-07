"use client";

import React, { useMemo, useRef, useState } from "react";
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
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmtX = (n: number) => `${n.toFixed(2)}x`;
const fmtPct = (d: number) => `${(d * 100).toFixed(2)}%`;

// ─── Design tokens ─────────────────────────────────────────────────────────
const C = {
  bg: "#F8F9FB",
  surface: "#FFFFFF",
  border: "#E2E8F0",
  borderHover: "#CBD5E1",
  primary: "#4F46E5",
  primaryHover: "#4338CA",
  primaryLight: "#EEF2FF",
  success: "#059669",
  successLight: "#ECFDF5",
  successBorder: "#A7F3D0",
  danger: "#DC2626",
  dangerLight: "#FEF2F2",
  dangerBorder: "#FECACA",
  textPrimary: "#0F172A",
  textSecondary: "#64748B",
  textMuted: "#94A3B8",
};

// ─── Shared styles ──────────────────────────────────────────────────────────
const inputBase: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${C.border}`,
  fontSize: 14,
  color: C.textPrimary,
  background: C.surface,
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s",
};

const selectBase: React.CSSProperties = {
  ...inputBase,
  appearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 10px center",
  paddingRight: 36,
  cursor: "pointer",
};

// ─── Main page ──────────────────────────────────────────────────────────────
export default function UploadPage() {
  const [csv, setCsv] = useState<ParsedCSV | null>(null);
  const [revenueCol, setRevenueCol] = useState<string>("");
  const [refundCol, setRefundCol] = useState<string>("");
  const [adSpend, setAdSpend] = useState<number>(0);
  const [cogsPct, setCogsPct] = useState<number>(30);
  const [stripeFeePct, setStripeFeePct] = useState<number>(2.9);
  const [stripeFixedFee, setStripeFixedFee] = useState<number>(0.3);
  const [outputs, setOutputs] = useState<Outputs | null>(null);
  const [error, setError] = useState<string>("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const headers = csv?.headers ?? [];
  const canCalculate = !!csv && !!revenueCol;

  const suggestedRevenue = useMemo(
    () => headers.find((h) => /revenue|amount|gross|total|subtotal|price/i.test(h)) ?? "",
    [headers]
  );
  const suggestedRefund = useMemo(
    () => headers.find((h) => /refund|returned/i.test(h)) ?? "",
    [headers]
  );

  function onFile(file: File) {
    setError("");
    setOutputs(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const fields = (results.meta.fields ?? []).filter(Boolean) as string[];
        const rows = results.data.filter((r) => Object.keys(r).length > 0);
        if (!fields.length) {
          setError("Could not detect headers. Ensure row 1 contains column names.");
          setCsv(null);
          return;
        }
        setCsv({ headers: fields, rows });
        setRevenueCol(
          fields.find((h) => /revenue|amount|gross|total/i.test(h)) ?? ""
        );
        setRefundCol(fields.find((h) => /refund/i.test(h)) ?? "");
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
    if (!revenueCol) return setError("Select the gross revenue column.");

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
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "var(--font-geist-sans, system-ui, sans-serif)" }}>
      {/* ── Top nav ── */}
      <header
        style={{
          background: C.surface,
          borderBottom: `1px solid ${C.border}`,
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "0 24px",
            height: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <LogoMark />
            <span style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, letterSpacing: "-0.2px" }}>
              Scale Sanity Check
            </span>
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: C.textMuted,
              background: "#F1F5F9",
              padding: "3px 8px",
              borderRadius: 20,
              letterSpacing: "0.3px",
            }}
          >
            v1 · E-commerce Profitability
          </span>
        </div>
      </header>

      {/* ── Page hero ── */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "36px 24px 32px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <h1
            style={{
              fontSize: 30,
              fontWeight: 800,
              color: C.textPrimary,
              margin: 0,
              letterSpacing: "-0.8px",
              lineHeight: 1.2,
            }}
          >
            Know your true profitability.
          </h1>
          <p style={{ fontSize: 15, color: C.textSecondary, margin: "10px 0 0", lineHeight: 1.6, maxWidth: 520 }}>
            Upload order data, configure your cost structure, and get an honest picture of what you're actually making — after ads, refunds, and processor fees.
          </p>
        </div>
      </div>

      {/* ── Main ── */}
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 80px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Step 1: Upload */}
          <StepSection number={1} title="Upload your orders CSV" done={!!csv}>
            <UploadZone
              csv={csv}
              dragging={dragging}
              fileRef={fileRef}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files[0];
                if (f) onFile(f);
              }}
              onClick={() => fileRef.current?.click()}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            />
          </StepSection>

          {/* Steps 2 + 3 side-by-side */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Step 2: Map columns */}
            <StepSection number={2} title="Map your columns" done={!!revenueCol && !!csv}>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <SelectField
                  label="Gross Revenue Column"
                  badge="required"
                  value={revenueCol}
                  onChange={setRevenueCol}
                  disabled={!csv}
                  placeholder={csv ? "Select a column…" : "Upload a CSV first"}
                  options={headers}
                  suggested={suggestedRevenue}
                />
                <SelectField
                  label="Refund Column"
                  badge="optional"
                  value={refundCol}
                  onChange={setRefundCol}
                  disabled={!csv}
                  placeholder="No refunds column"
                  options={headers}
                  suggested={suggestedRefund}
                  includeEmpty
                />
              </div>
            </StepSection>

            {/* Step 3: Cost inputs */}
            <StepSection number={3} title="Enter your cost structure">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <NumberField
                  label="Monthly Ad Spend"
                  prefix="$"
                  value={adSpend}
                  onChange={setAdSpend}
                />
                <NumberField
                  label="COGS"
                  suffix="%"
                  value={cogsPct}
                  onChange={setCogsPct}
                  step="1"
                />
                <NumberField
                  label="Stripe Fee"
                  suffix="%"
                  value={stripeFeePct}
                  onChange={setStripeFeePct}
                  step="0.1"
                />
                <NumberField
                  label="Stripe Fixed Fee"
                  prefix="$"
                  value={stripeFixedFee}
                  onChange={setStripeFixedFee}
                  step="0.01"
                />
              </div>

              <button
                onClick={calculate}
                disabled={!canCalculate}
                style={{
                  marginTop: 16,
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: canCalculate ? C.primary : "#CBD5E1",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: canCalculate ? "pointer" : "not-allowed",
                  letterSpacing: "0.2px",
                  transition: "background 0.15s",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
                onMouseEnter={(e) => { if (canCalculate) (e.target as HTMLButtonElement).style.background = C.primaryHover; }}
                onMouseLeave={(e) => { if (canCalculate) (e.target as HTMLButtonElement).style.background = C.primary; }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M9 7H6a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-3" />
                  <path d="M9 15h3l8.5-8.5a1.5 1.5 0 00-3-3L9 12v3" />
                  <path d="M16 5l3 3" />
                </svg>
                Calculate Profitability
              </button>
            </StepSection>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              marginTop: 16,
              padding: "12px 16px",
              borderRadius: 8,
              border: `1px solid ${C.dangerBorder}`,
              background: C.dangerLight,
              color: C.danger,
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
            </svg>
            {error}
          </div>
        )}

        {/* ── Results ── */}
        {outputs && (
          <div ref={resultsRef} style={{ marginTop: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: C.textPrimary, margin: 0, letterSpacing: "-0.4px" }}>
                Results
              </h2>
              <ProfitBadge profitable={outputs.profitAfterAds > 0} />
            </div>

            {/* Revenue row */}
            <MetricGroup label="Revenue">
              <MetricCard title="Orders" value={`${outputs.orderCount.toLocaleString()}`} icon="📦" />
              <MetricCard title="Gross Revenue" value={fmtMoney(outputs.grossRevenue)} icon="💰" />
              <MetricCard title="Total Refunds" value={fmtMoney(outputs.totalRefunds)} icon="↩️" sentiment={outputs.totalRefunds > 0 ? "negative" : undefined} />
              <MetricCard title="Refund Rate" value={fmtPct(outputs.refundRatePct)} icon="%" sentiment={outputs.refundRatePct > 0.05 ? "negative" : "neutral"} />
            </MetricGroup>

            {/* Costs row */}
            <MetricGroup label="Cost breakdown" style={{ marginTop: 16 }}>
              <MetricCard title="Stripe Fees" value={fmtMoney(outputs.totalStripeFees)} icon="💳" />
              <MetricCard title="COGS Total" value={fmtMoney(outputs.cogsTotal)} icon="🏭" />
              <MetricCard title="Net Revenue" value={fmtMoney(outputs.netRevenue)} icon="📊" sentiment={outputs.netRevenue >= 0 ? "positive" : "negative"} prominent />
            </MetricGroup>

            {/* Profitability row */}
            <MetricGroup label="Profitability" style={{ marginTop: 16 }}>
              <MetricCard title="Contribution Profit" value={fmtMoney(outputs.contributionProfit)} icon="📈" sentiment={outputs.contributionProfit >= 0 ? "positive" : "negative"} />
              <MetricCard title="Profit After Ads" value={fmtMoney(outputs.profitAfterAds)} icon="🎯" sentiment={outputs.profitAfterAds >= 0 ? "positive" : "negative"} prominent />
              <MetricCard title="Contribution Margin" value={fmtPct(outputs.contributionMarginPct)} icon="%" sentiment={outputs.contributionMarginPct > 0 ? "positive" : "negative"} />
            </MetricGroup>

            {/* ROAS row */}
            <MetricGroup label="Ad performance" style={{ marginTop: 16 }}>
              <MetricCard title="True ROAS" value={fmtX(outputs.trueRoasX)} icon="🚀" />
              <MetricCard title="Break-even ROAS" value={outputs.breakEvenRoasX > 0 ? fmtX(outputs.breakEvenRoasX) : "—"} icon="⚖️" />
              <MetricCard
                title="Margin Buffer"
                value={`${outputs.marginBufferPct > 0 ? "+" : ""}${outputs.marginBufferPct.toFixed(1)}%`}
                icon="🛡️"
                sentiment={outputs.marginBufferPct >= 0 ? "positive" : "negative"}
                prominent
              />
            </MetricGroup>

            {/* Summary */}
            <SummaryCard outputs={outputs} />

            <p style={{ marginTop: 16, fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>
              v1 model: COGS calculated as % of gross revenue. Shipping costs and tax not included.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function LogoMark() {
  return (
    <div
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        background: `linear-gradient(135deg, ${C.primary} 0%, #7C3AED 100%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    </div>
  );
}

function StepSection({
  number,
  title,
  done,
  children,
}: {
  number: number;
  title: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 24,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: done ? C.success : C.primary,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            transition: "background 0.2s",
          }}
        >
          {done ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{number}</span>
          )}
        </div>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, margin: 0, letterSpacing: "-0.2px" }}>
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

function UploadZone({
  csv,
  dragging,
  fileRef,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
  onChange,
}: {
  csv: ParsedCSV | null;
  dragging: boolean;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onDragOver: React.DragEventHandler;
  onDragLeave: React.DragEventHandler;
  onDrop: React.DragEventHandler;
  onClick: () => void;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
}) {
  return (
    <div>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onClick}
        style={{
          border: `2px dashed ${dragging ? C.primary : csv ? C.successBorder : C.border}`,
          borderRadius: 10,
          padding: "32px 24px",
          textAlign: "center",
          cursor: "pointer",
          background: dragging ? C.primaryLight : csv ? C.successLight : "#FAFBFC",
          transition: "all 0.15s",
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: "none" }}
          onChange={onChange}
        />
        {csv ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.success} strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <polyline points="9 15 11 17 15 13" />
            </svg>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.success }}>CSV loaded successfully</div>
              <div style={{ fontSize: 13, color: C.textSecondary, marginTop: 2 }}>
                <b style={{ color: C.textPrimary }}>{csv.rows.length.toLocaleString()}</b> rows ·{" "}
                <b style={{ color: C.textPrimary }}>{csv.headers.length}</b> columns detected
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: C.primaryLight,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 12px",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary }}>
              Drop your CSV here, or click to browse
            </div>
            <div style={{ fontSize: 13, color: C.textSecondary, marginTop: 4 }}>
              Exports from Shopify, WooCommerce, Stripe, etc.
            </div>
          </div>
        )}
      </div>
      {csv && (
        <button
          onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
          style={{
            marginTop: 10,
            fontSize: 13,
            color: C.textSecondary,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            textDecoration: "underline",
          }}
        >
          Upload a different file
        </button>
      )}
    </div>
  );
}

function SelectField({
  label,
  badge,
  value,
  onChange,
  disabled,
  placeholder,
  options,
  suggested,
  includeEmpty,
}: {
  label: string;
  badge: "required" | "optional";
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  placeholder: string;
  options: string[];
  suggested: string;
  includeEmpty?: boolean;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary }}>{label}</label>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: badge === "required" ? C.primary : C.textMuted,
            background: badge === "required" ? C.primaryLight : "#F1F5F9",
            padding: "1px 6px",
            borderRadius: 20,
            letterSpacing: "0.3px",
          }}
        >
          {badge}
        </span>
      </div>
      <div style={{ position: "relative" }}>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          style={{
            ...selectBase,
            opacity: disabled ? 0.5 : 1,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          <option value="">{placeholder}</option>
          {includeEmpty && <option value="">— None —</option>}
          {options.map((h) => (
            <option key={h} value={h}>
              {h}{h === suggested ? " ✓" : ""}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function NumberField({
  label,
  prefix,
  suffix,
  value,
  onChange,
  step = "any",
}: {
  label: string;
  prefix?: string;
  suffix?: string;
  value: number;
  onChange: (n: number) => void;
  step?: string;
}) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.textPrimary, marginBottom: 6 }}>
        {label}
      </label>
      <div style={{ position: "relative" }}>
        {prefix && (
          <span
            style={{
              position: "absolute",
              left: 11,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 13,
              color: C.textMuted,
              pointerEvents: "none",
              fontFamily: "var(--font-geist-mono, monospace)",
            }}
          >
            {prefix}
          </span>
        )}
        <input
          type="number"
          value={value}
          step={step}
          onChange={(e) => onChange(toNumber(e.target.value))}
          style={{
            ...inputBase,
            paddingLeft: prefix ? 24 : 12,
            paddingRight: suffix ? 30 : 12,
            fontFamily: "var(--font-geist-mono, monospace)",
            fontSize: 14,
          }}
        />
        {suffix && (
          <span
            style={{
              position: "absolute",
              right: 11,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 13,
              color: C.textMuted,
              pointerEvents: "none",
              fontFamily: "var(--font-geist-mono, monospace)",
            }}
          >
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function MetricGroup({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={style}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        {children}
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  icon,
  sentiment,
  prominent,
}: {
  title: string;
  value: string;
  icon: string;
  sentiment?: "positive" | "negative" | "neutral";
  prominent?: boolean;
}) {
  const valueColor =
    sentiment === "positive"
      ? C.success
      : sentiment === "negative"
      ? C.danger
      : C.textPrimary;

  const bg =
    prominent && sentiment === "positive"
      ? C.successLight
      : prominent && sentiment === "negative"
      ? C.dangerLight
      : C.surface;

  const borderColor =
    prominent && sentiment === "positive"
      ? C.successBorder
      : prominent && sentiment === "negative"
      ? C.dangerBorder
      : C.border;

  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: 10,
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{ fontSize: 12, color: C.textSecondary, fontWeight: 500 }}>{title}</span>
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 800,
          color: valueColor,
          letterSpacing: "-0.5px",
          fontFamily: "var(--font-geist-mono, monospace)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ProfitBadge({ profitable }: { profitable: boolean }) {
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 700,
        color: profitable ? C.success : C.danger,
        background: profitable ? C.successLight : C.dangerLight,
        border: `1px solid ${profitable ? C.successBorder : C.dangerBorder}`,
        padding: "3px 10px",
        borderRadius: 20,
        letterSpacing: "0.3px",
        display: "flex",
        alignItems: "center",
        gap: 5,
      }}
    >
      <span>{profitable ? "▲" : "▼"}</span>
      {profitable ? "Profitable" : "Not Profitable"}
    </span>
  );
}

function SummaryCard({ outputs }: { outputs: Outputs }) {
  const profitable = outputs.profitAfterAds > 0;
  const bufferAbs = Math.abs(outputs.marginBufferPct).toFixed(1);

  const profitLine = profitable
    ? `Generating ${fmtMoney(outputs.profitAfterAds)} in net profit after all costs and ad spend.`
    : `Losing ${fmtMoney(Math.abs(outputs.profitAfterAds))} after all costs and ad spend this period.`;

  const breakevenLine =
    outputs.breakEvenRoasX > 0
      ? `To cover all costs before ads, you need a minimum ROAS of ${fmtX(outputs.breakEvenRoasX)}.`
      : "Break-even ROAS cannot be calculated — contribution margin is zero or negative.";

  const bufferLine =
    outputs.marginBufferPct >= 0
      ? `Your ROAS of ${fmtX(outputs.trueRoasX)} sits ${bufferAbs}% above break-even — ad spend could increase by that margin before costs exceed revenue.`
      : `Your ROAS of ${fmtX(outputs.trueRoasX)} is ${bufferAbs}% below break-even — reduce ad spend or grow revenue to reach profitability.`;

  return (
    <div
      style={{
        marginTop: 20,
        padding: "20px 24px",
        borderRadius: 12,
        border: `1px solid ${profitable ? C.successBorder : C.dangerBorder}`,
        background: profitable ? C.successLight : C.dangerLight,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: profitable ? C.success : C.danger,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            {profitable ? (
              <polyline points="20 6 9 17 4 12" />
            ) : (
              <>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </>
            )}
          </svg>
        </div>
        <h3
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: profitable ? "#065F46" : "#7F1D1D",
            margin: 0,
          }}
        >
          {profitable ? "Business is Profitable" : "Business is Not Profitable"}
        </h3>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[profitLine, breakevenLine, bufferLine].map((line, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ fontSize: 13, color: profitable ? C.success : C.danger, marginTop: 1, flexShrink: 0 }}>—</span>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: profitable ? "#065F46" : "#7F1D1D" }}>
              {line}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
