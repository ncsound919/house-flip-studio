import RehabControlRoom from "@/components/rehab/RehabControlRoom";

export const metadata = { title: "Rehab Control | NC House Flip Studio" };

export default function RehabPage() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-zinc-900">Rehab Control</h1>
        <p className="text-sm text-zinc-500">
          Budget health across every active rehab, plus contractor scorecards built from real bids vs actuals.
        </p>
      </div>
      <RehabControlRoom />
    </div>
  );
}
