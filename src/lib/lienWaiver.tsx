import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

export interface LienWaiverData {
  propertyAddress: string;
  contractorName: string;
  ownerName: string;
  drawAmount: number;
  milestoneTitle: string;
  date: string; // ISO date string (YYYY-MM-DD)
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Helvetica",
    fontSize: 11,
    lineHeight: 1.5,
    color: "#111827",
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: "#6B7280",
    marginBottom: 20,
  },
  section: {
    marginTop: 14,
  },
  field: {
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 10,
    color: "#6B7280",
  },
  fieldValue: {
    fontSize: 11,
  },
  body: {
    marginTop: 16,
    fontSize: 10.5,
  },
  signatureRow: {
    marginTop: 32,
    flexDirection: "row",
    gap: 40,
  },
  signatureBlock: {
    flex: 1,
  },
  signatureLine: {
    borderBottom: 1,
    borderBottomColor: "#111827",
    height: 1,
    marginBottom: 6,
    marginTop: 24,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    borderTop: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 8,
    fontSize: 8.5,
    color: "#9CA3AF",
    textAlign: "center",
  },
});

export function LienWaiverPdf({ data }: { data: LienWaiverData }) {
  const draw = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(data.drawAmount);
  const date = new Date(data.date + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>Conditional Lien Waiver</Text>
        <Text style={styles.subtitle}>North Carolina — N.C. Gen. Stat. § 44A-12</Text>

        <View style={styles.section}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Property Address</Text>
            <Text style={styles.fieldValue}>{data.propertyAddress}</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Contractor</Text>
            <Text style={styles.fieldValue}>{data.contractorName}</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Owner / Payor</Text>
            <Text style={styles.fieldValue}>{data.ownerName}</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Milestone / Work Description</Text>
            <Text style={styles.fieldValue}>{data.milestoneTitle}</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Draw Amount</Text>
            <Text style={styles.fieldValue}>{draw}</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Date</Text>
            <Text style={styles.fieldValue}>{date}</Text>
          </View>
        </View>

        <Text style={styles.body}>
          {`The undersigned contractor, ${data.contractorName}, in consideration of the sum of ${draw} to be paid by or on behalf of ${data.ownerName} in connection with work performed or to be performed at ${data.propertyAddress}, waives and releases any and all lien and claim of lien the undersigned has on the above-described property for labor, services, or materials furnished through the date of this waiver.`}
        </Text>

        <Text style={[styles.body, { fontStyle: "italic", fontSize: 9.5, color: "#4B5563" }]}>
          This is a conditional waiver on progress payment. The waiver becomes effective only upon receipt of payment. This document is a DRAFT generated for informational purposes and is not a substitute for the advice of a licensed North Carolina attorney.
        </Text>

        <View style={styles.signatureRow}>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine} />
            <Text style={styles.fieldValue}>{data.contractorName} — Signature</Text>
          </View>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine} />
            <Text style={styles.fieldValue}>Date</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          DRAFT — Not legal advice. Not notarized. Consult a licensed NC real estate attorney before signing. NC G.S. 44A-12.
        </Text>
      </Page>
    </Document>
  );
}

export function buildLienWaiverPdf(data: LienWaiverData) {
  return <LienWaiverPdf data={data} />;
}
