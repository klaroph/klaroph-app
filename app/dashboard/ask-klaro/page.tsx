'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import KlaroPageHeader from '@/components/layout/KlaroPageHeader'
import { useSubscription } from '@/contexts/SubscriptionContext'
import { useUpgradeTrigger } from '@/contexts/UpgradeTriggerContext'
import { KLARO_AI_CHAT_LIMITS } from '@/lib/ai/chatLimits'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTIONS = [
  'How is my budget doing?',
  'Where am I spending the most?',
  'How are my goals progressing?',
  'What changed this month?',
  "What's my net worth?",
]

const CAPABILITIES = [
  'Explain your budget, spending, goals, and financial health',
  'Answer follow-up questions naturally',
  'Compare this month with other periods',
  'Explore “what if” scenarios, like taking out a loan',
  'Ask a quick question when it needs more details',
]

type Block = { type: 'p'; text: string } | { type: 'ul'; items: string[] }

/** Splits a plain-text reply into paragraphs and bullet lists for readable spacing. */
function toBlocks(content: string): Block[] {
  const blocks: Block[] = []
  for (const chunk of content.split(/\n\s*\n/)) {
    const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean)
    let para: string[] = []
    let list: string[] = []
    const flushPara = () => {
      if (para.length) blocks.push({ type: 'p', text: para.join('\n') })
      para = []
    }
    const flushList = () => {
      if (list.length) blocks.push({ type: 'ul', items: list })
      list = []
    }
    for (const line of lines) {
      const bullet = line.match(/^[-•*]\s+(.*)$/)
      if (bullet) {
        flushPara()
        list.push(bullet[1])
      } else {
        flushList()
        para.push(line)
      }
    }
    flushPara()
    flushList()
  }
  return blocks
}

function MessageBody({ content }: { content: string }) {
  return (
    <div className="ask-klaro-bubble-text">
      {toBlocks(content).map((b, i) =>
        b.type === 'p' ? (
          <p key={i}>{b.text}</p>
        ) : (
          <ul key={i}>
            {b.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        )
      )}
    </div>
  )
}

type Notice = { kind: 'error' | 'cooldown' | 'limit'; text: string }

export default function AskKlaroPage() {
  const { isPro, loading: planLoading } = useSubscription()
  const { openUpgradeModal } = useUpgradeTrigger()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const hasConversation = messages.length > 0 || loading

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (hasConversation) shellRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [hasConversation])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
  }, [input])

  async function sendMessage(raw: string) {
    const text = raw.trim()
    if (!text || loading) return

    setNotice(null)
    setInput('')
    const optimisticId = `local-${Date.now()}`
    setMessages((prev) => [...prev, { id: optimisticId, role: 'user', content: text }])
    setLoading(true)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          ...(conversationId ? { conversationId } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data?.success || typeof data.message !== 'string') {
        setNotice({
          kind:
            data?.code === 'rate_limited' ? 'limit' : data?.code === 'cooldown' ? 'cooldown' : 'error',
          text:
            typeof data.error === 'string'
              ? data.error
              : 'Klaro could not answer right now. Please try again.',
        })
        setLoading(false)
        return
      }

      if (typeof data.conversationId === 'string') {
        setConversationId(data.conversationId)
      }

      const assistantContent = data.message.trim()
      // Length-only client diagnostic — never log message body
      console.info('[KLARO CHAT DEBUG]', {
        source: typeof data.source === 'string' ? data.source : 'unknown',
        apiLength: typeof data.message === 'string' ? data.message.length : 0,
        renderedLength: assistantContent.length,
      })

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: assistantContent,
        },
      ])
    } catch {
      setNotice({ kind: 'error', text: 'Something went wrong. Please try again.' })
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void sendMessage(input)
  }

  const freeLimit = KLARO_AI_CHAT_LIMITS.FREE_DAILY_MESSAGES
  const proLimit = KLARO_AI_CHAT_LIMITS.PRO_DAILY_MESSAGES

  return (
    <div className="ask-klaro-page">
      <KlaroPageHeader
        title={
          <span className="ask-klaro-title">
            Ask Klaro
            <span className="ask-klaro-beta">Beta</span>
          </span>
        }
        description="Your financial picture, explained clearly."
      />

      <section className="ask-klaro-guide" aria-labelledby="ask-klaro-guide-title">
        <div className="ask-klaro-guide-main">
          <h3 id="ask-klaro-guide-title" className="ask-klaro-guide-title">
            How Ask Klaro works
          </h3>
          <ul className="ask-klaro-capabilities">
            {CAPABILITIES.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>

        <div className="ask-klaro-guide-side">
          <div className={`ask-klaro-plan${!planLoading && isPro ? ' ask-klaro-plan--pro' : ''}`}>
            {planLoading ? (
              <p className="ask-klaro-plan-other">
                Free: {freeLimit} messages/day · Pro: {proLimit} messages/day
              </p>
            ) : (
              <>
                <p className="ask-klaro-plan-name">{isPro ? 'Pro plan' : 'Free plan'}</p>
                <p className="ask-klaro-plan-limit">{isPro ? proLimit : freeLimit} messages/day</p>
                {isPro ? (
                  <p className="ask-klaro-plan-other">Free plan: {freeLimit} messages/day</p>
                ) : (
                  <button
                    type="button"
                    className="ask-klaro-plan-upgrade"
                    onClick={() => openUpgradeModal()}
                  >
                    Upgrade to Pro for {proLimit} messages/day
                  </button>
                )}
              </>
            )}
          </div>
          <p className="ask-klaro-scope">
            Ask Klaro can only answer using the financial information you track in KlaroPH. If
            something isn&apos;t recorded here, Klaro may not have enough information to answer it.
          </p>
        </div>

        <details className="ask-klaro-deeper">
          <summary>Need deeper planning?</summary>
          <p>
            Ask Klaro is built around the data you track in KlaroPH. For broader planning questions,
            you can also explore general-purpose AI assistants such as ChatGPT, Claude, or Gemini. If
            you do, avoid sharing sensitive financial information unless you&apos;re comfortable with
            that service&apos;s privacy terms.
          </p>
        </details>
      </section>

      <div
        ref={shellRef}
        className={`ask-klaro-shell${hasConversation ? ' ask-klaro-shell--active' : ''}`}
      >
        <div
          className="ask-klaro-thread"
          ref={listRef}
          role="log"
          aria-live="polite"
          aria-label="Conversation with Klaro"
        >
          {!hasConversation && (
            <div className="ask-klaro-empty">
              <span className="ask-klaro-avatar ask-klaro-avatar--lg" aria-hidden="true">
                K
              </span>
              <h3 className="ask-klaro-empty-title">How can I help with your KlaroPH numbers?</h3>
              <p className="ask-klaro-empty-lead">
                Ask about your budget, spending, goals, or net worth. Tap a question to start.
              </p>
              <ul className="ask-klaro-suggestions" aria-label="Suggested questions">
                {SUGGESTIONS.map((q) => (
                  <li key={q}>
                    <button
                      type="button"
                      className="ask-klaro-suggestion"
                      onClick={() => void sendMessage(q)}
                    >
                      {q}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`ask-klaro-turn ask-klaro-turn--${m.role}`}>
              {m.role === 'assistant' && (
                <span className="ask-klaro-avatar" aria-hidden="true">
                  K
                </span>
              )}
              <div className={`ask-klaro-bubble ask-klaro-bubble--${m.role}`}>
                <p className="ask-klaro-bubble-label">{m.role === 'user' ? 'You' : 'Klaro'}</p>
                <MessageBody content={m.content} />
              </div>
            </div>
          ))}

          {loading && (
            <div className="ask-klaro-turn ask-klaro-turn--assistant">
              <span className="ask-klaro-avatar" aria-hidden="true">
                K
              </span>
              <div className="ask-klaro-bubble ask-klaro-bubble--assistant ask-klaro-bubble--loading">
                <p className="ask-klaro-bubble-label">Klaro</p>
                <p className="ask-klaro-typing">
                  <span className="sr-only">Klaro is thinking…</span>
                  <span className="ask-klaro-typing-dot" aria-hidden="true" />
                  <span className="ask-klaro-typing-dot" aria-hidden="true" />
                  <span className="ask-klaro-typing-dot" aria-hidden="true" />
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="ask-klaro-footer">
          {notice && (
            <div
              className={`ask-klaro-notice ask-klaro-notice--${notice.kind === 'error' ? 'error' : 'info'}`}
              role={notice.kind === 'error' ? 'alert' : 'status'}
            >
              <p className="ask-klaro-notice-text">
                {notice.text}
                {notice.kind === 'limit' && isPro && ` Your ${proLimit} Pro messages refresh tomorrow.`}
              </p>
              {notice.kind === 'limit' && !isPro && (
                <button
                  type="button"
                  className="ask-klaro-notice-action"
                  onClick={() => openUpgradeModal()}
                >
                  Upgrade to Pro
                </button>
              )}
            </div>
          )}

          <form className="ask-klaro-composer" onSubmit={onSubmit}>
            <label htmlFor="ask-klaro-input" className="sr-only">
              Message Klaro
            </label>
            <textarea
              id="ask-klaro-input"
              ref={inputRef}
              className="ask-klaro-input"
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Klaro about your KlaroPH numbers…"
              maxLength={KLARO_AI_CHAT_LIMITS.MAX_MESSAGE_LENGTH}
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void sendMessage(input)
                }
              }}
            />
            <button
              type="submit"
              className="ask-klaro-send"
              disabled={loading || !input.trim()}
              aria-label={loading ? 'Sending message' : 'Send message'}
            >
              <span>{loading ? 'Sending…' : 'Send'}</span>
              <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
                <path
                  d="M3.4 16.6 17.5 10 3.4 3.4l.9 5.3L12 10l-7.7 1.3z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </form>
          <p className="ask-klaro-disclaimer">
            Ask Klaro is in beta. AI responses can occasionally be inaccurate or incomplete. Check
            important financial decisions against your actual KlaroPH records and other trusted
            sources.
          </p>
        </div>
      </div>
    </div>
  )
}
