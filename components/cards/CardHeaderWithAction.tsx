'use client'

type CardHeaderWithActionProps = {
  title: string
  actions?: React.ReactNode
  /** Optional title element: 'h2' | 'h3'; default 'h2' */
  titleAs?: 'h2' | 'h3'
  /** Optional id for the title (e.g. for aria-labelledby) */
  titleId?: string
}

export default function CardHeaderWithAction({
  title,
  actions,
  titleAs: TitleTag = 'h2',
  titleId,
}: CardHeaderWithActionProps) {
  return (
    <div className="dash-card-header focus-goals-header">
      <TitleTag id={titleId} className="dash-card-title" style={{ margin: 0 }}>
        {title}
      </TitleTag>
      {actions != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {actions}
        </div>
      )}
    </div>
  )
}
