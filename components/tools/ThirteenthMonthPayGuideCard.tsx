'use client'

export default function ThirteenthMonthPayGuideCard() {
  return (
    <aside className="salary-calc-info-card" aria-label="13th month pay guide Philippines">
      <header className="salary-guide-card-header">
        <h2 className="salary-guide-card-title">13th Month Pay Guide Philippines</h2>
        <p className="salary-guide-card-badge" aria-hidden="true">
          Understand what&apos;s included and how it may be taxed
        </p>
      </header>

      <div className="salary-guide-card-inner">
        <div className="salary-guide-col salary-guide-col-left">
          <section className="salary-guide-section">
            <h3 className="salary-guide-section-title">Standard Formula</h3>
            <div className="salary-guide-formula-box">Basic Salary × Months Worked ÷ 12</div>
          </section>

          <section className="salary-guide-section">
            <h3 className="salary-guide-section-title">Included in Basic Salary</h3>
            <ul className="salary-guide-list">
              <li>Fixed monthly salary</li>
            </ul>
          </section>

          <section className="salary-guide-section">
            <h3 className="salary-guide-section-title">Not Included</h3>
            <ul className="salary-guide-list">
              <li>Overtime</li>
              <li>Allowances</li>
              <li>Bonuses</li>
            </ul>
          </section>
        </div>

        <div className="salary-guide-col">
          <section className="salary-guide-section">
            <h3 className="salary-guide-section-title">Tax Rule</h3>
            <div className="salary-guide-note-box">
              <p>13th month pay is tax-exempt up to ₱90,000 under Philippine rules.</p>
            </div>
          </section>
        </div>
      </div>

      <section className="salary-guide-section salary-guide-disclaimer">
        <p className="salary-guide-disclaimer-text">
          Use this guide with your inputs in the calculator. Actual payroll can vary based on your employer&apos;s
          classification, deductions, and year-to-date adjustments.
        </p>
      </section>
    </aside>
  )
}

