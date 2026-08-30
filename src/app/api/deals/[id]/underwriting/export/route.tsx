import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { createAdminClient, requireOrgId } from "@/lib/apiHelpers";
import { calculateUnderwriting } from "@/lib/underwriting";

type Params = { params: Promise<{ id: string }> };

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, lineHeight: 1.5, color: "#111827" },
  title: { fontSize: 16, fontWeight: "bold", marginBottom: 4 },
  subtitle: { fontSize: 9, color: "#6B7280", marginBottom: 16 },
  h2: { fontSize: 11, fontWeight: "bold", marginTop: 14, marginBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  label: { color: "#4B5563" },
  value: { fontWeight: "medium" },
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
  pass: { color: "#059669", fontWeight: "bold" },
  fail: { color: "#DC2626", fontWeight: "bold" },
});

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const pct = (n: number) => `${n.toFixed(1)}%`;

export async function GET(_request: Request, { params }: Params) {
  try {
    const { orgId } = await requireOrgId();
    const { id } = await params;
    const admin = createAdminClient();

    const { data: deal } = await admin.from("deals").select("*").eq("id", id).single();
    if (!deal || deal.org_id !== orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: saved } = await admin.from("underwriting").select("*").eq("deal_id", id).single();

    const input = {
      arv: Number(saved?.arv) || 0,
      rehabEstimate: Number(saved?.rehab_estimate) || 0,
      purchasePrice: Number(saved?.purchase_price) || Number(deal.asking_price) || 0,
      holdingMonths: Number(saved?.holding_months) || 6,
      downPaymentPct: Number(saved?.down_payment_pct) || 20,
      interestRate: Number(saved?.interest_rate) || 10,
      loanPoints: Number(saved?.loan_points) || 0,
    };
    const r = calculateUnderwriting(input);

    const pdf = (
      <Document>
        <Page size="LETTER" style={styles.page}>
          <Text style={styles.title}>Underwriting Summary</Text>
          <Text style={styles.subtitle}>
            {deal.address} · Generated {new Date().toLocaleDateString("en-US")}
          </Text>

          <Text style={styles.h2}>Inputs</Text>
          {[
            ["ARV", money(input.arv)],
            ["Rehab estimate", money(input.rehabEstimate)],
            ["Purchase price", money(input.purchasePrice)],
            ["Holding period", `${input.holdingMonths} months`],
            ["Down payment", pct(input.downPaymentPct)],
            ["Interest rate", pct(input.interestRate)],
            ["Loan points", pct(input.loanPoints)],
          ].map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.value}>{value}</Text>
            </View>
          ))}

          <Text style={styles.h2}>Results</Text>
          {[
            ["70% MAO", money(r.maxOffer)],
            ["Final purchase price", money(r.finalPurchasePrice)],
            ["70% rule", r.passes70Rule ? "PASSES" : "FAILS"],
            ["Acquisition costs", money(r.acquisitionCosts)],
            ["Holding costs (total)", money(r.holdingCosts * input.holdingMonths)],
            ["Selling costs (8% of ARV)", money(r.sellingCosts)],
            ["Financing costs", money(r.financingCosts)],
            ["Total project cost", money(r.totalProjectCost)],
            ["Projected profit", money(r.projectedProfit)],
            ["ROI", pct(r.roi)],
            ["Cash-on-cash", pct(r.cashOnCash)],
          ].map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={styles.label}>{label}</Text>
              <Text style={label === "70% rule" ? (r.passes70Rule ? styles.pass : styles.fail) : styles.value}>
                {value}
              </Text>
            </View>
          ))}

          <Text style={styles.footer}>
            Deterministic calculations — no AI involved. Draft for internal planning; not financial advice.
          </Text>
        </Page>
      </Document>
    );

    const buffer = await renderToBuffer(pdf);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="underwriting-${id}.pdf"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json(
      { error: message },
      { status: message === "Not found" ? 404 : message === "Unauthorized" ? 401 : 500 }
    );
  }
}
