export default function AnimatedBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {/* 漸層背景 */}
      <div 
        className="absolute inset-0 bg-gradient-to-br from-primary-100 via-primary-50 to-accent-50"
        style={{
          backgroundSize: '200% 200%',
          animation: 'gradient-shift 15s ease infinite'
        }}
      />
      
      {/* 浮動裝飾圓形 */}
      <div className="absolute top-10 -left-20 w-96 h-96 bg-primary-300 rounded-full blur-3xl opacity-20 animate-float" />
      <div className="absolute -bottom-20 -right-20 w-[32rem] h-[32rem] bg-accent-200 rounded-full blur-3xl opacity-20 animate-float" style={{ animationDelay: '1s' }} />
      <div className="absolute top-1/2 right-1/4 w-64 h-64 bg-primary-200 rounded-full blur-3xl opacity-20 animate-float" style={{ animationDelay: '2s' }} />
    </div>
  )
}