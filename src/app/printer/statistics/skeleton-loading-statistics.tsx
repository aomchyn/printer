export default function StatisticsSkeleton() {
    return (
        <div className="w-full animate-pulse">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className={`bg-white/5 border border-white/10 rounded-2xl p-4 md:p-5 h-28 ${i >= 2 ? 'col-span-2 md:col-span-1' : ''}`} />
                ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="bg-white/5 border border-white/8 rounded-2xl p-6 h-[380px]" />
                <div className="bg-white/5 border border-white/8 rounded-2xl p-6 h-[380px]" />
            </div>
        </div>
    );
}
