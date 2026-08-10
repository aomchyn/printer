export function DashboardSkeleton() {
  return (
    <div className="min-h-screen p-4 overflow-x-hidden" style={{ background: "#f1f4f9" }}>

      {/* Header */}
      <div
        className="rounded-3xl p-6 md:p-8 mb-8 border border-blue-900/10 shadow-xl relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0f1e3d 0%, #152a54 50%, #1e3a8a 100%)" }}
      >

        {/* Title row */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-2 h-7 rounded-full shrink-0"
            style={{ background: "linear-gradient(180deg,#60a5fa,#818cf8)" }} />
          <div className="h-7 w-36 rounded-lg animate-pulse"
            style={{ background: "rgba(255,255,255,0.1)" }} />
          <div className="h-5 w-28 rounded-lg animate-pulse"
            style={{ background: "rgba(255,255,255,0.07)" }} />
        </div>

        {/* Subtitle */}
        <div className="h-3 w-56 rounded animate-pulse ml-4 mb-5"
          style={{ background: "rgba(255,255,255,0.06)" }} />

        {/* Search bar */}
        <div className="h-12 w-full md:w-80 rounded-2xl animate-pulse"
          style={{ background: "rgba(255,255,255,0.08)" }} />


        {/* Refresh status row */}
        <div
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-4 pt-4"
          style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div className="h-3 w-40 rounded animate-pulse"
            style={{ background: "rgba(255,255,255,0.08)" }} />
          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 rounded-full animate-pulse"
              style={{ background: "rgba(255,255,255,0.1)" }} />
            <div className="h-3 w-20 rounded animate-pulse"
              style={{ background: "rgba(255,255,255,0.08)" }} />
            <div className="h-6 w-20 rounded-lg animate-pulse"
              style={{ background: "rgba(255,255,255,0.1)" }} />
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
                {/* LOT NO. row */}
                <div className="flex items-center gap-2.5 mt-1">
                  <div className="h-4 w-16 rounded-lg bg-indigo-100 animate-pulse" />
                  <div className="h-4 w-24 rounded bg-slate-200 animate-pulse" />
                  <div className="w-6 h-6 rounded-md bg-slate-200 animate-pulse" />
                </div>

                {/* Buttons row */}
                <div className="flex gap-1.5 items-center flex-wrap w-full bg-slate-100/60 border border-slate-200/40 rounded-xl p-1 justify-center">
                  {[...Array(4)].map((_, j) => (
                    <div key={j} className="w-8 h-8 rounded-lg bg-slate-200 animate-pulse" />
                  ))}
                </div>


              </div>

              {/* Card body */}
              <div className="p-5 flex flex-col gap-3">
                {/* เวลาสั่ง / ผู้สั่ง — ค่าบรรทัดเดียว */}
                {["40%", "38%"].map((l, j) => (
                  <div key={j} className="flex justify-between items-center">
                    <div className="h-3 rounded bg-slate-100 animate-pulse" style={{ width: l }} />
                    <div className="h-3 w-1/3 rounded bg-slate-100 animate-pulse" />
                  </div>
                ))}
                <div className="border-t border-slate-100 my-1" />
                {/* วันที่ผลิต — ค่า 2 บรรทัด (พ.ศ./ค.ศ.) */}
                <div className="flex justify-between items-start">
                  <div className="h-3 w-[42%] rounded bg-slate-100 animate-pulse mt-0.5" />
                  <div className="flex flex-col items-end gap-1">
                    <div className="h-3 w-20 rounded bg-slate-100 animate-pulse" />
                    <div className="h-3 w-20 rounded bg-slate-100 animate-pulse" />
                  </div>
                </div>
                {/* วันหมดอายุ — ในกรอบสีชมพู */}
                <div className="flex justify-between items-start">
                  <div className="h-3 w-[36%] rounded bg-slate-100 animate-pulse mt-0.5" />
                  <div className="flex flex-col items-end gap-1 bg-rose-50/60 border border-rose-100/40 rounded-lg px-2.5 py-1">
                    <div className="h-3 w-16 rounded bg-rose-100 animate-pulse" />
                    <div className="h-3 w-16 rounded bg-rose-100 animate-pulse" />
                  </div>
                </div>
                <div className="border-t border-slate-100 my-1" />
                {/* อายุผลิตภัณฑ์ — ในกรอบสีฟ้า */}
                <div className="flex justify-between items-center">
                  <div className="h-3 w-2/5 rounded bg-slate-100 animate-pulse" />
                  <div className="h-4 w-20 rounded-lg bg-blue-100 animate-pulse" />
                </div>
                {/* จำนวน — ตัวเลขใหญ่ในกรอบสีเขียว */}
                <div className="flex justify-between items-center">
                  <div className="h-3 w-1/3 rounded bg-slate-100 animate-pulse" />
                  <div className="h-7 w-14 rounded-xl bg-emerald-100 animate-pulse" />
                </div>
              </div>

              {/* Card footer — สถานะ (default: รอดำเนินการ) */}
              <div className="p-4 bg-slate-100 flex items-center justify-center">
                <div className="h-3 w-40 rounded bg-slate-200 animate-pulse" />
              </div>
            </div>
          ))}

        </div>
      </div>
    </div>
  );
}

