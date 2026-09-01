import LenderNav from "@/components/lender/LenderNav";
import DebtSchedule from "@/components/lender/DebtSchedule";

export const metadata = { title: "Debt Schedule | NC House Flip Studio" };

export default function DebtsPage() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-zinc-900">Debt Schedule</h1>
        <p className="text-sm text-zinc-500">Every loan, HELOC, and note with its cost — the full liability picture.</p>
      </div>
      <LenderNav />
      <DebtSchedule />
    </div>
  );
}
