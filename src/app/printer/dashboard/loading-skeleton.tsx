export function DashboardSkeleton() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#F5F7F8] p-4">
      {/* Header */}
      <div className="relative mb-7 overflow-hidden rounded-3xl border border-[#0057B8]/15 bg-gradient-to-br from-[#004A70] via-[#0068B5] to-[#0097B8] p-5 shadow-lg md:p-6">
        {/* Glow */}
        <div className="pointer-events-none absolute right-0 top-0 -mr-16 -mt-16 h-72 w-72 rounded-full bg-[#00AEC7]/15 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 -mb-12 -ml-12 h-60 w-60 rounded-full bg-[#00AEC7]/10 blur-3xl" />

        <div className="relative flex flex-col gap-4">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            {/* Title */}
            <div className="min-w-0">
              <div className="mb-1.5 flex items-center gap-3">
                <div className="h-7 w-2 shrink-0 rounded-full bg-gradient-to-b from-[#00AEC7] to-[#0057B8]" />

                <div className="h-8 w-36 animate-pulse rounded-lg bg-white/20" />

                <div className="h-6 w-32 animate-pulse rounded-lg bg-[#BFEFF5]/20" />
              </div>

              <div className="ml-5 h-3 w-64 max-w-[80%] animate-pulse rounded bg-white/15" />
            </div>

            {/* Search + Refresh */}
            <div className="w-full min-w-0 space-y-3 md:max-w-[440px]">
              <div className="h-12 w-full animate-pulse rounded-2xl border border-white/15 bg-white/10" />

              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-white/10 pt-2.5">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#00B398]" />
                  <div className="h-3 w-32 animate-pulse rounded bg-white/15" />
                </div>

                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full w-2/3 animate-pulse rounded-full bg-[#00AEC7]/70" />
                  </div>

                  <div className="h-3 w-20 animate-pulse rounded bg-[#BFEFF5]/20" />

                  <div className="h-6 w-20 animate-pulse rounded-lg border border-white/10 bg-white/10" />
                </div>
              </div>
            </div>
          </div>

          {/* Pending File Panel */}
          <div className="w-full rounded-2xl border border-white/10 bg-[#00263A]/20 p-3 md:px-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 animate-pulse rounded-xl bg-[#FF6A13]/20" />

                <div className="space-y-1.5">
                  <div className="h-4 w-24 animate-pulse rounded bg-white/20" />
                  <div className="h-2.5 w-44 animate-pulse rounded bg-white/10" />
                </div>
              </div>

              <div className="h-8 w-20 animate-pulse rounded-full bg-[#FF6A13]/40" />
            </div>
          </div>
        </div>
      </div>

      {/* Cards — อยู่นอก Header ให้ตรงกับ Dashboard จริง */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="flex w-full flex-col overflow-hidden rounded-2xl border border-slate-200/85 border-l-4 border-l-[#0057B8]/35 bg-white shadow-sm"
          >
            {/* Card Header */}
            <div className="flex flex-col gap-3.5 border-b border-[#D9E1E2] bg-[#F8FBFD] px-5 py-4">
              <div className="flex items-center gap-2">
                <div className="h-5 w-16 animate-pulse rounded-lg bg-[#EAF3FC]" />
                <div className="h-5 w-20 animate-pulse rounded-full bg-[#E5F8FB]" />
              </div>

              <div className="h-5 w-4/5 animate-pulse rounded-md bg-slate-200" />

              <div className="flex items-center gap-2.5">
                <div className="h-5 w-16 animate-pulse rounded-lg bg-[#EAF3FC]" />
                <div className="h-5 w-24 animate-pulse rounded bg-slate-200" />
                <div className="h-6 w-6 animate-pulse rounded-md bg-[#EAF3FC]" />
              </div>

              <div className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200/40 bg-slate-100/60 p-1">
                {[...Array(6)].map((_, j) => (
                  <div
                    key={j}
                    className="h-8 w-8 animate-pulse rounded-lg bg-slate-200"
                  />
                ))}
              </div>
            </div>

            {/* Card Body */}
            <div className="flex flex-1 flex-col gap-4 p-5">
              {[0, 1].map((j) => (
                <div
                  key={j}
                  className="flex items-center justify-between gap-4"
                >
                  <div className="h-3 w-2/5 animate-pulse rounded bg-slate-100" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-slate-200" />
                </div>
              ))}

              <div className="border-t border-slate-100" />

              <div className="flex items-start justify-between gap-4">
                <div className="mt-1 h-3 w-2/5 animate-pulse rounded bg-slate-100" />

                <div className="flex flex-col items-end gap-1">
                  <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
                  <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
                </div>
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="mt-1 h-3 w-2/5 animate-pulse rounded bg-slate-100" />

                <div className="rounded-lg border border-[#C8102E]/10 bg-[#FCEAEC] px-2.5 py-1">
                  <div className="mb-1 h-3 w-16 animate-pulse rounded bg-[#C8102E]/10" />
                  <div className="h-3 w-16 animate-pulse rounded bg-[#C8102E]/10" />
                </div>
              </div>

              <div className="border-t border-slate-100" />

              <div className="flex items-center justify-between gap-4">
                <div className="h-3 w-2/5 animate-pulse rounded bg-slate-100" />
                <div className="h-5 w-20 animate-pulse rounded-lg bg-[#EAF3FC]" />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
                <div className="h-8 w-14 animate-pulse rounded-xl bg-[#E5F8FB]" />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-center border-t border-[#D9E1E2] bg-[#F0F3F4] px-4 py-3">
              <div className="h-3 w-40 animate-pulse rounded bg-[#D9E1E2]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}