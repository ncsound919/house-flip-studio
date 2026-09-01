import LenderNav from "@/components/lender/LenderNav";
import Learning from "@/components/lender/Learning";

export const metadata = { title: "Learning | NC House Flip Studio" };

export default function LearningPage() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-zinc-900">Learning</h1>
        <p className="text-sm text-zinc-500">Outcomes distilled into lessons, and market signals tracked over time.</p>
      </div>
      <LenderNav />
      <Learning />
    </div>
  );
}
