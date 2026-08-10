export default function PaperReportSkeleton() {
    return (
        <div className="w-full animate-pulse space-y-6">
            <div className="mb-10">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 bg-slate-200 rounded-full" />
                    <div className="h-6 w-64 bg-slate-200 rounded-lg" />
                </div>
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm h-16 mb-6" />
                <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 h-32" />
                    ))}
                </div>
            </div>
        </div>
    );
}
