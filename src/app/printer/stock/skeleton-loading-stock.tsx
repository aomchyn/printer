import { Package } from "lucide-react"

export function StockSkeleton() {
    return (
        <div className="min-h-screen bg-gray-50 overflow-x-hidden" style={{
            backgroundImage: 'radial-gradient(ellipse at 0% 0%, rgba(59,102,199,0.07) 0%, transparent 60%), radial-gradient(ellipse at 100% 100%, rgba(107,56,202,0.05) 0%, transparent 60%)',
        }}>
            {/* ── Page header ── */}
            <div className="bg-white/90 backdrop-blur-sm border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-3 sticky top-0 z-30">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-slate-200 flex items-center justify-center shrink-0 animate-pulse">
                        <Package className="w-5 h-5 text-slate-400" />
                    </div>
                    <div className="min-w-0">
                        <div className="h-5 w-40 bg-slate-200 rounded-md animate-pulse mb-1" />
                        <div className="h-3 w-32 bg-slate-100 rounded animate-pulse hidden sm:block" />
                    </div>
                </div>
            </div>

            <div className="p-3 sm:p-5 max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* ── Left column: form + balances ── */}
                <div className="flex flex-col gap-4 lg:col-span-1">
                    {/* Form Skeleton */}
                    <div className="bg-white border border-[#dde8f5] rounded-2xl p-5 shadow-sm">
                        <div className="h-4 w-32 bg-slate-200 rounded animate-pulse mb-4" />
                        <div className="space-y-4">
                            <div>
                                <div className="h-3 w-24 bg-slate-200 rounded animate-pulse mb-2" />
                                <div className="h-[42px] w-full bg-slate-100 rounded-lg animate-pulse" />
                            </div>
                            <div>
                                <div className="h-3 w-20 bg-slate-200 rounded animate-pulse mb-2" />
                                <div className="h-[42px] w-full bg-slate-100 rounded-lg animate-pulse" />
                            </div>
                            <div className="h-[44px] w-full bg-slate-200 rounded-lg animate-pulse mt-2" />
                        </div>
                    </div>

                    {/* Balances Skeleton */}
                    <div className="bg-gradient-to-br from-[#0f1e3d] to-[#152a54] border border-[#0f1e3d] rounded-2xl p-5 shadow-sm relative overflow-hidden">
                        <div className="absolute inset-0 bg-white/5 animate-pulse" />
                        <div className="h-3 w-36 bg-white/20 rounded animate-pulse mb-3 relative z-10" />
                        <div className="grid grid-cols-2 gap-2.5 relative z-10">
                            {[...Array(7)].map((_, i) => (
                                <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-2.5 flex flex-col items-center">
                                    <div className="h-2.5 w-20 bg-white/20 rounded animate-pulse mb-2.5" />
                                    <div className="h-6 w-14 bg-white/30 rounded animate-pulse" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── Right column: history ── */}
                <div className="lg:col-span-2 bg-white border border-[#dde8f5] rounded-2xl p-5 shadow-sm flex flex-col h-[740px]">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-5 gap-3">
                        <div className="h-4 w-36 bg-slate-200 rounded animate-pulse" />
                        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                            <div className="h-[30px] w-24 bg-white rounded-md shadow-sm animate-pulse" />
                            <div className="h-[30px] w-20 bg-slate-200/50 rounded-md animate-pulse" />
                        </div>
                    </div>
                    <div className="flex-1 space-y-3">
                        {[...Array(8)].map((_, i) => (
                            <div key={i} className="flex items-center justify-between gap-3 bg-white border border-slate-100 rounded-xl px-3.5 py-3 shadow-sm border-l-4 border-l-slate-200">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-lg bg-slate-100 animate-pulse shrink-0" />
                                    <div className="flex flex-col gap-2">
                                        <div className="h-3.5 w-40 bg-slate-200 rounded animate-pulse" />
                                        <div className="h-2.5 w-28 bg-slate-100 rounded animate-pulse" />
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <div className="h-4 w-12 bg-slate-200 rounded animate-pulse" />
                                    <div className="h-2.5 w-20 bg-slate-100 rounded animate-pulse" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
