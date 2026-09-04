import Link from "next/link";

export function CareerNavigation({ current }: { current: "overview" | "achievements" }) {
  return (
    <nav aria-label="Career Portfolio" className="mb-5 flex flex-wrap gap-2">
      {([
        ["overview", "/printer/career-metrics", "ภาพรวม"],
        ["achievements", "/printer/career-metrics/achievements", "บันทึกผลงาน"],
      ] as const).map(([key, href, label]) => (
        <Link key={key} href={href} aria-current={current === key ? "page" : undefined}
          className={`rounded-xl px-4 py-2.5 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0057B8] ${current === key ? "bg-[#0057B8] text-white" : "border border-[#D9E1E2] bg-white text-[#00263A]"}`}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
