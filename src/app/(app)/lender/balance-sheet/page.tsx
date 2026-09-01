import LenderNav from "@/components/lender/LenderNav";
import BalanceSheet from "@/components/lender/BalanceSheet";

export const metadata = { title: "Balance Sheet | NC House Flip Studio" };

export default function BalanceSheetPage() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-zinc-900">Balance Sheet</h1>
        <p className="text-sm text-zinc-500">Company-level assets and liabilities. Update after each deal closes.</p>
      </div>
      <LenderNav />
      <BalanceSheet />
    </div>
  );
}
