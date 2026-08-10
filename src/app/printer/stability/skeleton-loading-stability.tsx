export function StabilitySkeleton() {
    return (
        <div className="min-h-screen bg-[#f4f7fc] py-6 md:py-8 px-3 md:px-6 flex flex-col items-center gap-8 text-gray-800" style={{
            backgroundImage: 'radial-gradient(ellipse at 0% 0%, rgba(59,102,199,0.07) 0%, transparent 60%), radial-gradient(ellipse at 100% 100%, rgba(107,56,202,0.05) 0%, transparent 60%)',
        }}>
            {/* Top collapsed card */}
            <div className="w-full max-w-2xl md:max-w-3xl bg-white border border-slate-200/80 rounded-2xl md:rounded-3xl shadow-xl shadow-blue-900/5 p-4 md:p-8">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-200 animate-pulse" />
                    <div className="h-6 w-56 rounded-lg bg-slate-200 animate-pulse" />
                    <div className="h-3 w-44 rounded bg-slate-100 animate-pulse mt-1" />
                </div>
            </div>

            {/* Search bar */}
            <div className="w-full max-w-5xl">
                <div className="h-[54px] w-full rounded-xl md:rounded-2xl bg-white border border-slate-200/80 shadow-sm animate-pulse" />
            </div>

            {/* Logs table card */}
            <div className="w-full max-w-5xl bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100/60 overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-slate-50 to-white px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 animate-pulse" />
                    <div className="h-4 w-52 rounded bg-slate-200 animate-pulse" />
                </div>

                {/* Mobile cards skeleton */}
                <div className="xl:hidden flex flex-col gap-4 p-4 bg-slate-50/50">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col relative">
                            <div className="border-b border-slate-100 pb-3 mb-3 pr-10">
                                <div className="h-3 w-32 rounded bg-slate-100 animate-pulse mb-2" />
                                <div className="h-4 w-3/4 rounded bg-slate-200 animate-pulse mb-2" />
                                <div className="flex items-center gap-2">
                                    <div className="h-3 w-16 rounded bg-slate-100 animate-pulse" />
                                    <div className="h-3 w-20 rounded bg-slate-100 animate-pulse" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                {[...Array(4)].map((_, j) => (
                                    <div key={j} className="flex flex-col bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 gap-1.5">
                                        <div className="h-3 w-14 rounded bg-slate-200 animate-pulse" />
                                        <div className="h-3.5 w-20 rounded bg-slate-100 animate-pulse" />
                                    </div>
                                ))}
                                <div className="flex flex-col bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 gap-1.5 col-span-2">
                                    <div className="h-3 w-16 rounded bg-slate-200 animate-pulse" />
                                    <div className="h-3.5 w-20 rounded bg-slate-100 animate-pulse" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Desktop table skeleton */}
                <div className="hidden xl:block overflow-x-auto">
                    <table className="w-full text-[13px] text-left">
                        <thead className="text-[11px] text-slate-500 uppercase bg-slate-50/50 border-b border-slate-200">
                            <tr>
                                {['วันที่บันทึก', 'ล็อต', 'สินค้า', 'Initial', '3M', '6M', '9M', '12M', 'จัดการ'].map((h) => (
                                    <th key={h} className="px-3 py-3 font-bold">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {[...Array(5)].map((_, i) => (
                                <tr key={i}>
                                    <td className="px-3 py-3">
                                        <div className="h-3 w-20 rounded bg-slate-100 animate-pulse mb-1" />
                                        <div className="h-3 w-14 rounded bg-slate-100 animate-pulse" />
                                    </td>
                                    <td className="px-3 py-3"><div className="h-3 w-16 rounded bg-slate-200 animate-pulse" /></td>
                                    <td className="px-3 py-3">
                                        <div className="h-3 w-32 rounded bg-slate-200 animate-pulse mb-1" />
                                        <div className="h-3 w-20 rounded bg-slate-100 animate-pulse" />
                                    </td>
                                    {[...Array(5)].map((_, j) => (
                                        <td key={j} className="px-3 py-3 text-center"><div className="h-3 w-14 rounded bg-slate-100 animate-pulse mx-auto" /></td>
                                    ))}
                                    <td className="px-3 py-3 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="h-6 w-6 rounded-lg bg-slate-100 animate-pulse" />
                                            <div className="h-6 w-6 rounded-lg bg-slate-100 animate-pulse" />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
