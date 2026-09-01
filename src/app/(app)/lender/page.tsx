import LenderNav from "@/components/lender/LenderNav";
import TrackRecord from "@/components/lender/TrackRecord";

export const metadata = { title: "Track Record | NC House Flip Studio" };

export default function LenderPage() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-zinc-900">Lender</h1>
        <p className="text-sm text-zinc-500">Your bank-readiness package: track record, balance sheet, debt, entity docs.</p>
      </div>
      <LenderNav />
      <TrackRecord />
    </div>
  );
}
