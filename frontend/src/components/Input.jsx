import React from 'react'

export default function Input({
  type = 'text',
  placeholder = '',
  value,
  onChange,
  disabled = false,
  className = '',
  icon: Icon,
  ...props
}) {
  return (
    <div className="relative w-full">
      {Icon && (
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
          <Icon className="w-5 h-5" />
        </div>
      )}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full rounded-xl bg-slate-900/90 border border-slate-700/80 px-4 py-3.5 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/50 focus:border-rose-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
          Icon ? 'pl-11' : ''
        } ${className}`}
        {...props}
      />
    </div>
  )
}
