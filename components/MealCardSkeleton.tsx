export default function MealCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gray-200 rounded-full" />
          <div>
            <div className="h-4 w-20 bg-gray-200 rounded mb-2" />
            <div className="h-3 w-32 bg-gray-200 rounded" />
          </div>
        </div>
        <div className="h-10 w-24 bg-gray-200 rounded-xl" />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-4 w-24 bg-gray-200 rounded" />
          <div className="h-4 w-16 bg-gray-200 rounded" />
        </div>
        <div className="flex items-center justify-between">
          <div className="h-4 w-32 bg-gray-200 rounded" />
          <div className="h-4 w-16 bg-gray-200 rounded" />
        </div>
        <div className="flex items-center justify-between">
          <div className="h-4 w-28 bg-gray-200 rounded" />
          <div className="h-4 w-16 bg-gray-200 rounded" />
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <div className="flex-1 h-10 bg-gray-200 rounded-xl" />
        <div className="flex-1 h-10 bg-gray-200 rounded-xl" />
      </div>
    </div>
  )
}
