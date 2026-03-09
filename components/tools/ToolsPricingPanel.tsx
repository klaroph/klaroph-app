import PlanFeaturePremiumIcon from '@/components/ui/PlanFeaturePremiumIcon'
import {
  FREE_PLAN_FEATURES,
  FREE_PLAN_TOOLS,
  PRO_PLAN_FEATURES,
  PRO_PLAN_TOOLS,
  PLAN_SECTION_TOOLS_LABEL,
} from '@/lib/planFeatures'

export function ToolsPricingFree() {
  return (
    <aside className="tools-pricing-col tools-pricing-col-free">
      <h2 className="tools-pricing-heading">KlaroPH Plans</h2>
      <div className="landing-plan-card">
        <h3>FREE PLAN</h3>
        <p className="plan-section-title">Core</p>
        <ul>
          {FREE_PLAN_FEATURES.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <p className="plan-section-title plan-section-tools">{PLAN_SECTION_TOOLS_LABEL}</p>
        <ul>
          {FREE_PLAN_TOOLS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
    </aside>
  )
}

export function ToolsPricingPro() {
  return (
    <aside className="tools-pricing-col tools-pricing-col-pro">
      <div className="landing-plan-card landing-plan-pro">
        <span className="landing-plan-badge">Most Popular</span>
        <h3>PRO PLAN</h3>
        <p className="landing-plan-price">₱5<span>/month</span></p>
        <p className="landing-plan-value">Less than ₱5 per day.</p>
        <p className="plan-section-title">Core</p>
        <ul>
          {PRO_PLAN_FEATURES.map(({ label, premium }) => (
            <li key={label}>
              {premium ? (
                <span className="plan-feature-premium">
                  <PlanFeaturePremiumIcon />
                  {label}
                </span>
              ) : (
                label
              )}
            </li>
          ))}
        </ul>
        <p className="plan-section-title plan-section-tools">{PLAN_SECTION_TOOLS_LABEL}</p>
        <ul>
          {PRO_PLAN_TOOLS.map(({ label, premium }) => (
            <li key={label}>
              {premium ? (
                <span className="plan-feature-premium">
                  <PlanFeaturePremiumIcon />
                  {label}
                </span>
              ) : (
                label
              )}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}
