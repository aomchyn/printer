export default function LogsSkeleton() {
    return (
        <div className="space-y-4 animate-pulse">
            <div className="md:hidden flex flex-col gap-3">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="bg-[#0f1e3d] border border-white/10 rounded-2xl overflow-hidden h-32" />
                ))}
            </div>
            <div className="hidden md:block bg-[#0c1628] rounded-2xl shadow-2xl border border-white/8 overflow-hidden">
                <div className="px-5 py-4 border-b border-white/8 bg-white/5 flex gap-4">
                    <div className="h-4 bg-white/10 rounded w-24" />
                    <div className="h-4 bg-white/10 rounded w-32" />
                    <div className="h-4 bg-white/10 rounded w-24" />
                    <div className="h-4 bg-white/10 rounded w-64" />
                </div>
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="px-5 py-4 border-b border-white/5 flex gap-4 items-center">
                        <div className="h-3 bg-white/10 rounded w-24" />
                        <div className="h-8 bg-white/5 rounded w-32" />
                        <div className="h-6 bg-white/10 rounded-lg w-24" />
                        <div className="h-3 bg-white/5 rounded w-full max-w-xs" />
                    </div>
                ))}
            </div>
        </div>
    );
}
