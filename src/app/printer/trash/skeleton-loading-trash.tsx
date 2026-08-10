export default function TrashSkeleton() {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 animate-pulse">
            {[...Array(6)].map((_, i) => (
                <div key={i} className="flex flex-col rounded-2xl border bg-gray-900/60 border-white/15 overflow-hidden">
                    <div className="px-4 pt-4 pb-3 border-b border-white/15 flex justify-between items-start">
                        <div className="space-y-2 w-2/3">
                            <div className="h-5 bg-white/20 rounded w-full" />
                            <div className="flex gap-2">
                                <div className="h-4 bg-white/10 rounded w-12" />
                                <div className="h-4 bg-indigo-500/20 rounded w-16" />
                            </div>
                        </div>
                        <div className="h-10 w-12 bg-gray-800/80 rounded-xl" />
                    </div>
                    <div className="px-4 py-3 space-y-3">
                        <div className="h-3 bg-white/10 rounded w-full" />
                        <div className="h-3 bg-white/10 rounded w-4/5" />
                        <div className="h-3 bg-white/10 rounded w-full" />
                    </div>
                    <div className="px-3 pb-3 pt-2 border-t border-white/15 flex gap-2">
                        <div className="h-8 bg-emerald-500/20 rounded-xl w-full" />
                        <div className="h-8 bg-rose-500/20 rounded-xl w-12" />
                    </div>
                </div>
            ))}
        </div>
    );
}
