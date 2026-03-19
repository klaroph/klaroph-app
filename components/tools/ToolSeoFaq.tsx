'use client'

export type ToolSeoFaqItem = {
  question: string
  answer: string
}

export default function ToolSeoFaq({
  title,
  items,
}: {
  title: string
  items: ToolSeoFaqItem[]
}) {
  return (
    <section className="tool-page-faq" aria-label={`${title} section`}>
      <h2 className="tool-page-faq-title">{title}</h2>
      {items.map((item) => (
        <div key={item.question} className="tool-page-faq-item">
          <h3 className="tool-page-faq-q">{item.question}</h3>
          <p className="tool-page-faq-a">{item.answer}</p>
        </div>
      ))}
    </section>
  )
}

