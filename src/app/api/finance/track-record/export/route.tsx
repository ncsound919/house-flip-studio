import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { requireOrgId } from "@/lib/apiHelpers";
import { loadTrackRecordForOrg } from "@/lib/finance/loadTrackRecord";
import type { TrackRecordRow } from "@/lib/finance/trackRecord";

const money = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const pct = (n: number | null | undefined) => (n == null ? "—" : `${n.toFixed(1)}%`);

// --- CSV ---

function toCsv(rows: TrackRecordRow[]): string {
  const header = [
    "Address",
    "City",
    "State",
    "Stage",
    "Label",
    "Sale Price",
    "Purchase Price",
    "Acquisition Costs",
    "Rehab Actual",
    "Financing Costs",
    "Selling Costs",
    "Profit",
    "ROI %",
    "Cycle Days",
    "Holding Months",
  ];
  const lines = rows.map((r) =>
    [
      `"${String(r.address).replace(/"/g, '""')}"`,
      `"${r.city ?? ""}"`,
      `"${r.state}"`,
      `"${r.stage}"`,
      r.isRealized ? "realized" : "projected",
      r.salePrice ?? "",
      r.purchasePrice ?? "",
      r.acquisitionCosts ?? "",
      r.rehabActual ?? "",
      r.financingCosts ?? "",
      r.sellingCosts ?? "",
      r.profit ?? "",
      r.roi ?? "",
      r.cycleDays ?? "",
      r.holdingMonths ?? "",
    ].join(",")
  );
  return [header.join(","), ...lines].join("\n");
}

// --- PDF ---

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, lineHeight: 1.5, color: "#111827" },
  title: { fontSize: 16, fontWeight: "bold", marginBottom: 4 },
  subtitle: { fontSize: 9, color: "#6B7280", marginBottom: 16 },
  h2: { fontSize: 11, fontWeight: "bold", marginTop: 14, marginBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  label: { color: "#4B5563" },
  value: { fontWeight: "medium" },
  tableHead: { flexDirection: "row", borderBottom: 1, borderBottomColor: "#D1D5DB", paddingBottom: 4, marginBottom: 4 },
  th: { fontSize: 8, color: "#6B7280", fontWeight: "bold" },
  tr: { flexDirection: "row", borderBottom: 1, borderBottomColor: "#F3F4F6", paddingVertical: 3 },
  td: { fontSize: 8 },
  colAddress: { width: "34%" },
  colNum: { width: "11%", textAlign: "right" },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    borderTop: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 8,
    fontSize: 8,
    color: "#9CA3AF",
    textAlign: "center",
  },
});

export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgId();
    const { rows, summary } = await loadTrackRecordForOrg(orgId);
    const format = new URL(request.url).searchParams.get("format");

    if (format === "csv") {
      return new NextResponse(toCsv(rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="track-record.csv"`,
        },
      });
    }

    const realized = rows.filter((r) => r.isRealized);

    const pdf = (
      <Document>
        <Page size="LETTER" style={styles.page}>
          <Text style={styles.title}>Track Record — Lender Summary</Text>
          <Text style={styles.subtitle}>
            Generated {new Date().toLocaleDateString("en-US")} · Realized figures only from Closed deals with a recorded sale price
          </Text>

          <Text style={styles.h2}>Summary</Text>
          {[
            ["Completed flips (realized)", String(summary.realizedCount)],
            ["Total realized profit", money(summary.realizedProfit)],
            ["Average profit per flip", money(summary.avgProfit)],
            ["Average cycle time", summary.avgCycleDays != null ? `${summary.avgCycleDays} days` : "—"],
            ["Total capital invested", money(summary.totalInvested)],
            ["Realized ROI (on invested capital)", pct(summary.roi)],
          ].map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.value}>{value}</Text>
            </View>
          ))}

          <Text style={styles.h2}>Deal Detail</Text>
          {realized.length === 0 ? (
            <Text style={{ fontSize: 9, color: "#6B7280" }}>
              No realized flips yet. Closed deals with a recorded sale price will appear here.
            </Text>
          ) : (
            <View>
              <View style={styles.tableHead}>
                <Text style={[styles.th, styles.colAddress]}>Address</Text>
                <Text style={[styles.th, styles.colNum]}>Purchase</Text>
                <Text style={[styles.th, styles.colNum]}>Rehab</Text>
                <Text style={[styles.th, styles.colNum]}>Sale</Text>
                <Text style={[styles.th, styles.colNum]}>Profit</Text>
                <Text style={[styles.th, styles.colNum]}>ROI</Text>
                <Text style={[styles.th, styles.colNum]}>Days</Text>
              </View>
              {realized.map((r) => (
                <View key={r.dealId} style={styles.tr}>
                  <Text style={[styles.td, styles.colAddress]}>{r.address}</Text>
                  <Text style={[styles.td, styles.colNum]}>{money(r.purchasePrice)}</Text>
                  <Text style={[styles.td, styles.colNum]}>{money(r.rehabActual)}</Text>
                  <Text style={[styles.td, styles.colNum]}>{money(r.salePrice)}</Text>
                  <Text style={[styles.td, styles.colNum]}>{money(r.profit)}</Text>
                  <Text style={[styles.td, styles.colNum]}>{pct(r.roi)}</Text>
                  <Text style={[styles.td, styles.colNum]}>{r.cycleDays ?? "—"}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.footer}>
            Deterministic calculations from recorded deal data — no AI involved. Draft for lender review; not financial advice.
          </Text>
        </Page>
      </Document>
    );

    const buffer = await renderToBuffer(pdf);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="track-record.pdf"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 500 }
    );
  }
}
