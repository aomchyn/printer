import { Users } from "lucide-react"

export function UserSkeleton() {
    return (
        <div className="min-h-screen bg-[#f4f7fc]" style={{
            backgroundImage: 'radial-gradient(ellipse at 0% 0%, rgba(59,102,199,0.07) 0%, transparent 60%), radial-gradient(ellipse at 100% 100%, rgba(107,56,202,0.05) 0%, transparent 60%)',
        }}>
            {/* ── Page header ── */}
            <div className="bg-white/80 backdrop-blur-md border-b border-[#dde8f5] px-4 py-3.5 flex items-center justify-between gap-3 sticky top-0 z-30">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-slate-200 flex items-center justify-center shrink-0 animate-pulse">
                        <Users className="w-4.5 h-4.5 text-slate-400" />
                    </div>
                    <div className="min-w-0">
                        <div className="h-6 w-32 bg-slate-200 rounded-md animate-pulse mb-1.5" />
                        <div className="h-3 w-40 bg-slate-100 rounded animate-pulse hidden sm:block" />
                    </div>
                </div>
                <div className="h-9 w-28 bg-slate-200 rounded-xl animate-pulse shrink-0" />
            </div>

            <div className="p-3 sm:p-5 max-w-7xl mx-auto w-full">

                {/* ── Stat cards ── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="bg-white border border-slate-100 rounded-2xl p-3.5 flex items-center gap-3.5 shadow-sm">
                            <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center shrink-0 animate-pulse" />
                            <div className="min-w-0 flex-1">
                                <div className="h-6 w-12 bg-slate-200 rounded-md animate-pulse mb-1.5" />
                                <div className="h-2.5 w-20 bg-slate-100 rounded animate-pulse" />
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── Search bar ── */}
                <div className="mb-5 relative">
                    <div className="h-[46px] w-full bg-white border border-[#dde8f5] rounded-2xl shadow-sm animate-pulse flex items-center px-4">
                        <div className="w-4 h-4 bg-slate-200 rounded-full" />
                        <div className="w-48 h-3 bg-slate-100 rounded ml-3" />
                    </div>
                </div>

                {/* ── User groups ── */}
                <div className="space-y-6">
                    {[3, 2, 4].map((count, groupIdx) => (
                        <div key={groupIdx}>
                            <div className="flex items-center gap-2 mb-3.5">
                                <div className="w-3.5 h-3.5 rounded-sm bg-slate-200 animate-pulse shrink-0" />
                                <div className="h-3 w-24 bg-slate-200 rounded animate-pulse" />
                                <div className="flex-1 h-px bg-[#dde8f5]" />
                                <div className="h-5 w-12 bg-slate-100 rounded-full animate-pulse border border-[#dde8f5]" />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {[...Array(count)].map((_, i) => (
                                    <div key={i} className="bg-white border border-slate-100 border-l-4 border-l-slate-200 rounded-2xl p-4 flex flex-col justify-between h-full shadow-sm">
                                        <div className="flex items-start gap-3">
                                            <div className="w-10 h-10 min-w-[40px] rounded-xl bg-slate-200 animate-pulse shrink-0 mt-0.5" />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
                                                    <div className="h-4 w-16 bg-slate-100 rounded-full animate-pulse" />
                                                </div>
                                                <div className="flex items-center gap-1.5 mb-3">
                                                    <div className="w-3 h-3 bg-slate-100 rounded-full animate-pulse shrink-0" />
                                                    <div className="h-3 w-40 bg-slate-100 rounded animate-pulse" />
                                                </div>
                                                <div className="flex flex-wrap gap-1.5 mb-1">
                                                    <div className="h-5 w-16 bg-slate-100 rounded-md animate-pulse" />
                                                    <div className="h-5 w-20 bg-slate-100 rounded-md animate-pulse" />
                                                    <div className="h-5 w-14 bg-slate-100 rounded-md animate-pulse" />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 pt-3 mt-3 border-t border-slate-50 justify-end">
                                            <div className="h-[28px] w-16 bg-slate-100 rounded-lg animate-pulse" />
                                            <div className="h-[28px] w-16 bg-slate-100 rounded-lg animate-pulse" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
