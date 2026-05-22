export function DashboardSkeleton() {
  return (
    <div className="min-h-screen p-4 overflow-x-hidden" style={{ background: "#f1f4f9" }}>

      {/* Header */}
     <div
  className="rounded-3xl p-6 mb-6 relative overflow-hidden"
  style={{ background: "linear-gradient(135deg, #0f1e3d 0%, #152a54 50%, #1e3a8a 100%)" }}
>
  {/* Title row */}
  <div className="flex items-center gap-3 mb-2">
    <div className="w-1 h-7 rounded-full shrink-0"
      style={{ background: "linear-gradient(180deg,#60a5fa,#818cf8)" }} />
    <div className="h-7 w-36 rounded-lg animate-pulse"
      style={{ background: "rgba(255,255,255,0.1)" }} />
    <div className="h-5 w-28 rounded-lg animate-pulse"
      style={{ background: "rgba(255,255,255,0.07)" }} />
  </div>

  {/* Subtitle */}
  <div className="h-3 w-56 rounded animate-pulse ml-4 mb-5"
    style={{ background: "rgba(255,255,255,0.06)" }} />

  {/* Search bar — เต็มความกว้างแบบมือถือ */}
  <div className="h-12 w-full rounded-2xl animate-pulse"
    style={{ background: "rgba(255,255,255,0.08)" }} />

  {/* Stats row — 4 กล่องแถวล่าง */}
  <div
    className="grid grid-cols-4 gap-2 mt-4 pt-4"
    style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
  >
    {[...Array(4)].map((_, i) => (
      <div
        key={i}
        className="rounded-xl p-2.5 flex flex-col gap-1.5"
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.08)"
        }}
      >
        <div className="h-5 w-3/4 rounded animate-pulse"
          style={{ background: "rgba(255,255,255,0.1)" }} />
        <div className="h-2.5 w-full rounded animate-pulse"
          style={{ background: "rgba(255,255,255,0.06)" }} />
      </div>
    ))}
  </div>
</div>

      {/* Loading label */}
      <div className="flex items-center justify-center gap-2 mb-5">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-blue-500 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
        <span className="text-slate-400 text-xs font-semibold tracking-widest ml-1">
          กำลังโหลดคำสั่งพิมพ์...
        </span>
      </div>

      {/* Cards */}
      <div
  className="grid gap-4 overflow-hidden"
  style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(340px, 100%), 1fr))" }}
>
  {[...Array(6)].map((_, i) => (
    <div
      key={i}
      className="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm w-full"
      style={{ borderLeft: "4px solid #e2e8f0" }}
    >
            {/* Card header */}
            <div className="bg-slate-50 border-b border-slate-100 p-5 flex flex-col gap-3">
              <div className="flex gap-2">
                <div className="h-5 w-16 rounded-full bg-slate-200 animate-pulse" />
                <div className="h-5 w-20 rounded-full bg-slate-200 animate-pulse" />
              </div>
              <div className="h-5 w-4/5 rounded-md bg-slate-200 animate-pulse" />
              <div className="flex gap-2">
                <div className="h-4 w-14 rounded bg-slate-200 animate-pulse" />
                <div className="h-4 w-28 rounded bg-slate-200 animate-pulse" />
              </div>
              {/* Buttons row */}
              <div className="flex justify-center gap-2 bg-slate-100 rounded-xl p-1.5">
                {[...Array(5)].map((_, j) => (
                  <div key={j} className="h-8 w-8 rounded-xl bg-slate-200 animate-pulse" />
                ))}
              </div>
            </div>

            {/* Card body */}
            <div className="p-5 flex flex-col gap-3">
              {[["40%", "55%"], ["35%", "45%"], ["38%", "50%"]].map(([l, r], j) => (
                <div key={j} className="flex justify-between">
                  <div className="h-3 rounded bg-slate-100 animate-pulse" style={{ width: l }} />
                  <div className="h-3 rounded bg-slate-100 animate-pulse" style={{ width: r }} />
                </div>
              ))}
              <div className="border-t border-slate-100 my-1" />
              {[["42%", "30%"], ["36%", "35%"]].map(([l, r], j) => (
                <div key={j} className="flex justify-between">
                  <div className="h-3 rounded bg-slate-100 animate-pulse" style={{ width: l }} />
                  <div className="h-3 rounded bg-slate-100 animate-pulse" style={{ width: r }} />
                </div>
              ))}
              <div className="mt-1 p-3 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center">
                <div className="h-3 w-2/5 rounded bg-slate-100 animate-pulse" />
                <div className="h-5 w-1/4 rounded-full bg-slate-200 animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
