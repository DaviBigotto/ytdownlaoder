import React from 'react'

export default function Button({
  children,
  onClick,
  variant = 'primary', // 'primary' | 'secondary' | 'outline'
  disabled = false,
  loading = false,
  className = '',
  icon: Icon,
  type = 'button',
  ...props
}) {
  const baseStyles = "inline-flex items-center justify-center font-medium rounded-xl px-5 py-3.5 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 shadow-sm"
  
  const variants = {
    primary: "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/40 hover:shadow-lg hover:shadow-rose-600/20 border border-rose-500/30",
    secondary: "bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700/80",
    outline: "bg-transparent hover:bg-slate-850 text-slate-300 hover:text-white border border-slate-700"
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${baseStyles} ${variants[variant] || variants.primary} ${className}`}
      {...props}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-5 w-5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>Carregando...</span>
        </span>
      ) : (
        <span className="flex items-center gap-2">
          {Icon && <Icon className="w-5 h-5" />}
          <span>{children}</span>
        </span>
      )}
    </button>
  )
}
