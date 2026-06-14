interface Tab {
  id: string
  label: string
  count?: number
}

interface TabsProps {
  tabs: Tab[]
  active: string
  onChange: (id: string) => void
  className?: string
}

export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <div className={`no-scrollbar flex gap-7 overflow-x-auto border-b border-line ${className ?? ''}`}>
      {tabs.map((tab) => {
        const isActive = tab.id === active
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`eyebrow shrink-0 whitespace-nowrap border-b-2 pb-3 transition-colors ${
              isActive
                ? 'border-accent text-ink'
                : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={`ml-1.5 ${isActive ? 'text-accent' : ''}`}>{tab.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
