import { useEffect, useState } from 'react'
import { API, api, json, DEMO_MODE } from './api'
import { useLocale, formatDate } from './i18n'
import { EmptyState, Feedback, LoadingState } from './ui'

type Evidence = {
  id: string
  description: string
  original_name: string
  review_status: 'PENDING' | 'ACCEPTED' | 'NEEDS_MORE'
  reviewer_notes: string
  uploaded_at: string
}
type Decision = { result: 'COMPETENT' | 'NOT_YET'; notes: string; assessor_name: string; updated_at: string; needs_reconfirmation: boolean }
type PracticalTaskAttempt = {
  id: string
  description: string
  submitted_at: string
  evidence: { id: string; description: string; original_name: string; uploaded_at: string } | null
  review: { result: 'SATISFACTORY' | 'NEEDS_MORE'; notes: string; reviewed_at: string } | null
}
type PracticalTask = {
  id: string
  criterion_id: string
  title: string
  instructions: string
  rubric: string
  source_name: string
  source_url: string
  official: boolean
  attempts: PracticalTaskAttempt[]
}
type Criterion = {
  id: string
  code: string
  description: string
  mandatory: boolean
  requires_practical: boolean
  evidence: Evidence[]
  decision: Decision | null
}
type Case = {
  id: string
  status: string
  submitted_criteria: number
  mandatory_criteria: number
  worker: {
    id: string
    name: string
    trade: string
    experience_years: number
    service_area: string
    bio: string
    skills: { name: string; years_experience: number }[]
  }
  qualification: {
    id: string
    title: string
    code: string
    version: string
    source_name: string
    source_url: string
    official: boolean
  }
  criteria: Criterion[]
  practical_tasks: PracticalTask[]
}
type SuggestionOutput = {
  summary: string
  mappings: { criterion_id: string; evidence_ids: string[]; rationale: string }[]
  gaps: string[]
  uncertainty: string
  limitations: string[]
  evidence_references: { evidence_id: string; note: string }[]
}
type AiSuggestion = {
  id: string
  qualification_id: string
  qualification_version: string
  provider_id: string
  model_id: string | null
  template_version: string
  evidence_ids: string[]
  criterion_ids: string[]
  original_output: SuggestionOutput
  edited_output: SuggestionOutput | null
  disposition: 'PENDING' | 'ACCEPTED' | 'EDITED' | 'DISMISSED'
  request_at: string
  response_at: string
  label: string
}
type AiAvailability = { available: boolean; reason: string | null; manual_review_available: boolean }

export default function Assessor() {
  const [cases, setCases] = useState<Case[]>([])
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [aiAvailability, setAiAvailability] = useState<AiAvailability | null>(null)
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>([])
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiNotice, setAiNotice] = useState('')
  const { locale } = useLocale()

  async function load(initial = false) {
    if (initial) setLoading(true)
    try {
      setCases(await api<Case[]>('/assessor/cases'))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load queue')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load(true) }, [])

  async function run(fn: () => Promise<unknown>, message: string) {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      await fn()
      setNotice(message)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  const active = cases.find(item => item.id === selected) ?? cases.find(item => item.status !== 'VERIFIED') ?? cases[0]
  useEffect(() => {
    if (!active) return
    let cancelled = false
    setAiAvailability(null)
    setAiSuggestions([])
    setAiError('')
    void Promise.all([
      api<AiAvailability>('/assessor/ai-assistance'),
      api<AiSuggestion[]>(`/assessor/cases/${active.id}/ai-suggestions`),
    ]).then(([availability, suggestions]) => {
      if (!cancelled) { setAiAvailability(availability); setAiSuggestions(suggestions) }
    }).catch(cause => {
      if (!cancelled) setAiError(cause instanceof Error ? cause.message : 'Could not load AI assistance status')
    })
    return () => { cancelled = true }
  }, [active?.id])

  async function requestAiAssistance() {
    if (!active) return
    const evidence = assistanceEvidence(active)
    const criterionIds = [...new Set(evidence.map(item => item.criterion_id))]
    setAiBusy(true); setAiError(''); setAiNotice('')
    try {
      const suggestion = await api<AiSuggestion>(`/assessor/cases/${active.id}/ai-suggestions`, {
        method: 'POST', body: json({ evidence_ids: evidence.map(item => item.id), criterion_ids: criterionIds }),
      })
      setAiSuggestions(current => [...current, suggestion])
      setAiNotice('Unverified AI suggestion — not a competency decision')
    } catch (cause) {
      setAiError(cause instanceof Error ? cause.message : 'AI assistance failed. Continue manually.')
    } finally { setAiBusy(false) }
  }

  async function updateAiSuggestion(suggestionId: string, disposition: 'ACCEPTED' | 'EDITED' | 'DISMISSED', editedOutput?: SuggestionOutput) {
    if (!active) return
    const updated = await api<AiSuggestion>(`/assessor/cases/${active.id}/ai-suggestions/${suggestionId}`, {
      method: 'PATCH', body: json({ disposition, edited_output: editedOutput ?? null }),
    })
    setAiSuggestions(current => current.map(item => item.id === suggestionId ? updated : item))
  }
  if (loading) return <LoadingState label="Loading assessment queue…" />

  const openCount = cases.filter(item => item.status !== 'VERIFIED').length
  const mandatory = active?.criteria.filter(criterion => criterion.mandatory) ?? []
  const canVerify = mandatory.length > 0 && mandatory.every(criterion =>
    criterion.decision?.result === 'COMPETENT' && !criterion.decision.needs_reconfirmation,
  ) && (active?.practical_tasks ?? []).filter(task => mandatory.some(criterion => criterion.id === task.criterion_id)).every(task => {
    const latest = task.attempts.at(-1)
    return latest?.review?.result === 'SATISFACTORY'
  })

  return <>
    <div className="page-heading">
      <div><p className="eyebrow">HUMAN REVIEW</p><h1>Assessment queue</h1><p className="subtle">Review the submitted case and make each competency decision yourself.</p></div>
      <span className="status-tag">{openCount} OPEN CASES</span>
    </div>
    {error && <Feedback>{error}</Feedback>}{notice && <Feedback tone="success">{notice}</Feedback>}
    <div className="assessor-layout">
      <aside className="queue-list" aria-label="Submitted assessment cases">
        <div className="queue-title">CASES <span>{cases.length}</span></div>
        {cases.map(item => <button type="button" key={item.id} className={`queue-item ${active?.id === item.id ? 'selected' : ''}`} aria-current={active?.id === item.id ? 'true' : undefined} onClick={() => setSelected(item.id)}>
          <span className="avatar" aria-hidden="true">{item.worker.name.trim().charAt(0).toUpperCase()}</span>
          <span><b>{item.worker.name}</b><small>{item.qualification.code} · {item.qualification.version} · {item.worker.trade || 'Trade not set'}</small></span>
          <i aria-hidden="true" className={item.status === 'VERIFIED' ? 'green-dot' : ''} />
        </button>)}
        {!cases.length && <EmptyState title="No cases have been submitted yet." description="Submitted worker cases will appear here for human review." />}
      </aside>

      {active ? <section className="assessor-case" aria-labelledby="active-case-heading">
        <div className="case-title">
          <div><span className="eyebrow">{active.qualification.code} · VERSION {active.qualification.version}</span><h2 id="active-case-heading">{active.worker.name}</h2><p className="subtle">{active.worker.trade || 'Trade not set'} · {active.worker.experience_years} years · {active.worker.service_area || 'Service area not set'}</p></div>
          <span className={`status-tag ${active.status === 'VERIFIED' ? 'verified' : ''}`}>{active.status.replaceAll('_', ' ')}</span>
        </div>

        <div className="source-banner"><span>VERSIONED QUALIFICATION</span><p>{active.qualification.title} · {active.qualification.source_name}{active.qualification.source_url && <> · <a href={active.qualification.source_url} target="_blank" rel="noreferrer">Source ↗</a></>}</p>{!active.qualification.official && <small>Illustrative qualification; not official.</small>}</div>

        <section className="assessor-worker-context" aria-label="Worker profile context">
          <div><b>Worker profile</b><p>{active.worker.bio || 'No profile summary was provided.'}</p></div>
          <div><b>Declared skills</b><p>{active.worker.skills.length ? active.worker.skills.map(skill => `${skill.name} · ${skill.years_experience} years`).join(' / ') : 'No skills declared.'}</p><small>Self-declared experience is context for review, not verified competency.</small></div>
        </section>
        <p className="case-completeness">Evidence available for {active.submitted_criteria} of {active.mandatory_criteria} mandatory criteria · {active.criteria.length} criteria in this qualification version.</p>

        <section className="ai-assistance-panel" aria-labelledby="ai-assistance-heading">
          <div className="ai-assistance-heading"><div><p className="eyebrow">{active.qualification.code} · VERSION {active.qualification.version}</p><h3 id="ai-assistance-heading">AI evidence assistance</h3></div><span className="status-tag muted">Unverified AI suggestion — not a competency decision</span></div>
          <p className="subtle">AI suggestions are optional review aids. You must inspect the private evidence and make all formal decisions yourself.</p>
          {!aiAvailability && !aiError && <p role="status" aria-live="polite">Checking AI assistance availability…</p>}
          {aiAvailability && !aiAvailability.available && <Feedback>{aiAvailability.reason || 'AI assistance is unavailable. Continue your manual assessment.'}</Feedback>}
          {aiError && <Feedback>{aiError}</Feedback>}{aiNotice && <Feedback tone="success">{aiNotice}</Feedback>}
          <button type="button" className="button secondary small-button" disabled={aiBusy || !aiAvailability?.available || active.status === 'VERIFIED' || !assistanceEvidence(active).length} onClick={() => void requestAiAssistance()}>{aiBusy ? 'Requesting suggestion…' : 'Request AI assistance'}</button>
          {!assistanceEvidence(active).length && <small>Select a case with evidence to request assistance.</small>}
          {!aiSuggestions.length && aiAvailability?.available && <small>No AI suggestion has been generated for this case.</small>}
          {aiSuggestions.map(suggestion => <AiSuggestionCard key={suggestion.id} suggestion={suggestion} criteria={active.criteria} disabled={busy || active.status === 'VERIFIED'} locale={locale} onDisposition={updateAiSuggestion} />)}
        </section>

        {active.criteria.map(criterion => <article className="review-criterion" key={criterion.id}>
          <div className="criterion-head"><span className="criterion-code">{criterion.code}</span><span className="subtle small">{criterion.mandatory ? 'Required' : 'Optional'}{criterion.requires_practical ? ' · Practical' : ''}</span></div>
          <h3>{criterion.description}</h3>
          <div className="review-evidence">
            {criterion.evidence.map(evidence => <EvidenceReview key={evidence.id} evidence={evidence} disabled={busy || active.status === 'VERIFIED'} locale={locale} onSave={(status, notes) => run(() => api(`/assessor/evidence/${evidence.id}`, { method: 'PATCH', body: json({ status, notes }) }), 'Evidence review saved')} />)}
            {!criterion.evidence.length && <p className="empty-inline">No evidence submitted for this criterion.</p>}
          </div>
          {active.practical_tasks.filter(task => task.criterion_id === criterion.id).map(task => <PracticalTaskReview key={task.id} task={task} disabled={busy || active.status === 'VERIFIED'} onReview={(attemptId, result, notes) => run(() => api(`/assessor/task-attempts/${attemptId}/review`, { method: 'PUT', body: json({ result, notes }) }), result === 'NEEDS_MORE' ? 'Task remediation requested' : 'Practical task reviewed')} />)}
          <DecisionEditor criterion={criterion} disabled={busy || active.status === 'VERIFIED'} onSave={(result, notes) => run(() => api(`/assessor/cases/${active.id}/criteria/${criterion.id}`, { method: 'PUT', body: json({ result, notes }) }), 'Criterion decision saved')} />
        </article>)}

        <div className="verify-bar"><div><b>Final competency decision</b><small>Only your human assessment can verify competency. Every mandatory criterion needs a current competent decision, and applicable practical tasks need a satisfactory assessor review.</small>{active.status !== 'VERIFIED' && !canVerify && <small className="warning-note">Complete current criterion decisions and task reviews before final verification.</small>}</div>
          <button type="button" className="button primary" disabled={busy || active.status === 'VERIFIED' || !canVerify} onClick={() => void run(() => api(`/assessor/cases/${active.id}/verify`, { method: 'POST' }), 'Competency verified')}>{active.status === 'VERIFIED' ? 'Verified' : 'Verify competency'} <span aria-hidden="true">✓</span></button>
        </div>
      </section> : <EmptyState title="Select a case" description="Assessment cases appear here when workers submit evidence." />}
    </div>
  </>
}

function AiSuggestionCard({ suggestion, criteria, disabled, locale, onDisposition }: {
  suggestion: AiSuggestion
  criteria: Criterion[]
  disabled: boolean
  locale: 'en' | 'hi' | 'hne'
  onDisposition: (id: string, disposition: 'ACCEPTED' | 'EDITED' | 'DISMISSED', output?: SuggestionOutput) => Promise<void>
}) {
  const [summary, setSummary] = useState(suggestion.original_output.summary)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const output = suggestion.edited_output ?? suggestion.original_output
  const dispositionLabel = suggestion.disposition === 'ACCEPTED' ? 'Assessor accepted suggestion'
    : suggestion.disposition === 'EDITED' ? 'Assessor edited suggestion'
      : suggestion.disposition === 'DISMISSED' ? 'Assessor dismissed suggestion' : 'Pending assessor acknowledgement'

  async function save(disposition: 'ACCEPTED' | 'EDITED' | 'DISMISSED') {
    setBusy(true); setError('')
    try {
      const edited = disposition === 'EDITED' ? { ...suggestion.original_output, summary: summary.trim() } : undefined
      await onDisposition(suggestion.id, disposition, edited)
      setEditing(false)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save suggestion disposition') }
    finally { setBusy(false) }
  }

  return <article className="ai-suggestion-card">
    <div className="ai-suggestion-meta"><b>{suggestion.label}</b><span className="status-tag">{dispositionLabel}</span></div>
    <p className="subtle">{suggestion.provider_id}{suggestion.model_id ? ` · ${suggestion.model_id}` : ''} · {suggestion.template_version} · {formatDate(suggestion.response_at, locale, true)}</p>
    <p className="subtle">Qualification version: {suggestion.qualification_id} · {suggestion.qualification_version}</p>
    <h4>Summary</h4>
    {editing ? <label className="ai-edit-summary">Assessor-edited version<textarea value={summary} onChange={event => setSummary(event.target.value)} minLength={1} maxLength={3000} aria-label="Assessor-edited version" /></label>
      : <p>{output.summary}</p>}
    <h4>Suggested criterion mappings</h4>
    {output.mappings.length ? <ul>{output.mappings.map((mapping, index) => {
      const criterion = criteria.find(item => item.id === mapping.criterion_id)
      return <li key={`${mapping.criterion_id}-${index}`}>Criterion {criterion ? `${criterion.code} — ${criterion.description}` : mapping.criterion_id}: {mapping.rationale} · Evidence items: {mapping.evidence_ids.join(', ')}</li>
    })}</ul> : <p className="subtle">Not generated</p>}
    <h4>Evidence references</h4>
    {output.evidence_references.length ? <ul>{output.evidence_references.map(reference => <li key={reference.evidence_id}>{reference.evidence_id}: {reference.note}</li>)}</ul> : <p className="subtle">Not generated</p>}
    <h4>Gaps to investigate</h4><ul>{output.gaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul>
    <h4>Uncertainty</h4><p>{output.uncertainty}</p>
    <h4>Limitations</h4><ul>{output.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul>
    {suggestion.edited_output && <details><summary>Original AI suggestion</summary><p>{suggestion.original_output.summary}</p></details>}
    <small>This acknowledgement does not record a competency decision.</small>
    {suggestion.disposition === 'PENDING' && <div className="ai-suggestion-actions">
      {editing ? <><button type="button" className="button primary small-button" disabled={disabled || busy || !summary.trim()} onClick={() => void save('EDITED')}>{busy ? 'Saving…' : 'Save edited suggestion'}</button><button type="button" className="button secondary small-button" disabled={busy} onClick={() => { setEditing(false); setSummary(suggestion.original_output.summary) }}>Close</button></>
        : <><button type="button" className="button secondary small-button" disabled={disabled || busy} onClick={() => void save('ACCEPTED')}>Accept suggestion</button><button type="button" className="button secondary small-button" disabled={disabled || busy} onClick={() => setEditing(true)}>Edit suggestion</button><button type="button" className="button secondary small-button" disabled={disabled || busy} onClick={() => void save('DISMISSED')}>Dismiss suggestion</button></>}
    </div>}
    {error && <Feedback>{error}</Feedback>}
  </article>
}

function assistanceEvidence(item: Case) {
  return [
    ...item.criteria.flatMap(criterion => criterion.evidence.map(evidence => ({
      id: evidence.id, criterion_id: criterion.id,
    }))),
    ...item.practical_tasks.flatMap(task => task.attempts.flatMap(attempt => attempt.evidence ? [{
      id: attempt.evidence.id, criterion_id: task.criterion_id,
    }] : [])),
  ]
}

function PracticalTaskReview({ task, disabled, onReview }: {
  task: PracticalTask
  disabled: boolean
  onReview: (attemptId: string, result: 'SATISFACTORY' | 'NEEDS_MORE', notes: string) => Promise<void>
}) {
  const [notes, setNotes] = useState('')
  const [result, setResult] = useState<'SATISFACTORY' | 'NEEDS_MORE'>('SATISFACTORY')
  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState('')
  const [error, setError] = useState('')
  const pending = task.attempts.find(attempt => !attempt.review)
  const validNotes = notes.trim().length >= 3

  async function download(evidenceId: string, fileName: string) {
    setDownloading(evidenceId)
    setError('')
    try {
      const response = await fetch(`${API}/api/evidence/${evidenceId}/file`, { credentials: 'include' })
      if (!response.ok) {
        let message = `Request failed (${response.status})`
        try { const body = await response.json() as { detail?: string }; message = body.detail ?? message } catch { /* keep status */ }
        throw new Error(message)
      }
      const objectUrl = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = fileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not access private task evidence')
    } finally {
      setDownloading('')
    }
  }

  async function saveReview() {
    if (!pending) return
    setSaving(true)
    setError('')
    try {
      await onReview(pending.id, result, notes.trim())
      setNotes('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save task review')
    } finally {
      setSaving(false)
    }
  }

  return <section className="panel practical-task-card" aria-labelledby={`assessor-task-${task.id}`}>
    <div className="catalogue-detail-head"><div><p className="eyebrow">PRACTICAL TASK · {task.official ? 'SOURCED' : 'ILLUSTRATIVE'}</p><h4 id={`assessor-task-${task.id}`}>{task.title}</h4></div><span className={`status-tag ${task.official ? 'verified' : 'muted'}`}>{task.official ? 'Sourced task' : 'Illustrative, not official'}</span></div>
    <p>{task.instructions}</p>
    <p className="subtle"><b>Rubric:</b> {task.rubric}</p>
    <small>Source: {task.source_name}{task.source_url.startsWith('https://') && <> · <a href={task.source_url} target="_blank" rel="noreferrer">View source ↗</a></>}</small>
    {task.attempts.map((attempt, index) => <article className="task-attempt-record" key={attempt.id}>
      <div className="request-top"><b>Attempt {index + 1}</b><span className="status-tag">{attempt.review?.result === 'SATISFACTORY' ? 'Satisfactory' : attempt.review?.result === 'NEEDS_MORE' ? 'Remediation requested' : 'Awaiting review'}</span></div>
      <p>{attempt.description}</p>
      {attempt.evidence && <div className="evidence-file"><span aria-hidden="true">▧</span><div><b>{attempt.evidence.original_name}</b><small>{attempt.evidence.description}</small></div>{DEMO_MODE ? <small>Demo metadata only — no file was uploaded or stored.</small> : <button type="button" className="text-button" disabled={downloading === attempt.evidence.id} onClick={() => void download(attempt.evidence!.id, attempt.evidence!.original_name)}>{downloading === attempt.evidence.id ? 'Loading…' : 'Open private task evidence'}</button>}</div>}
      {attempt.review && <p className="review-note">Assessor feedback: {attempt.review.notes}</p>}
    </article>)}
    {pending && <div className="task-review-form">
      <label>Practical task outcome<select value={result} disabled={disabled || saving} onChange={event => setResult(event.target.value as 'SATISFACTORY' | 'NEEDS_MORE')}><option value="SATISFACTORY">Satisfactory against rubric</option><option value="NEEDS_MORE">Request remediation</option></select></label>
      <label>Assessor notes<textarea value={notes} disabled={disabled || saving} onChange={event => setNotes(event.target.value)} minLength={3} maxLength={2000} aria-invalid={!validNotes} aria-describedby={`task-review-note-${task.id}`} placeholder="Explain how the attempt meets the rubric or what the worker should address" /></label>
      <small id={`task-review-note-${task.id}`}>{validNotes ? 'A clear explanation is saved with this review.' : 'Add at least three characters before saving.'}</small>
      <button type="button" className="button secondary small-button" disabled={disabled || saving || !validNotes} onClick={() => void saveReview()}>{saving ? 'Saving…' : result === 'NEEDS_MORE' ? 'Request task remediation' : 'Save task review'}</button>
    </div>}
    {!pending && task.attempts.length > 0 && <p className="subtle">All submitted attempts have been reviewed. The latest review is used for this qualification case.</p>}
    {error && <Feedback>{error}</Feedback>}
  </section>
}

function EvidenceReview({ evidence, disabled, locale, onSave }: { evidence: Evidence; disabled: boolean; locale: 'en' | 'hi' | 'hne'; onSave: (status: string, notes: string) => Promise<void> }) {
  const [notes, setNotes] = useState(evidence.reviewer_notes)
  const [status, setStatus] = useState(evidence.review_status === 'ACCEPTED' ? 'ACCEPTED' : 'NEEDS_MORE')
  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    setNotes(evidence.reviewer_notes)
    setStatus(evidence.review_status === 'ACCEPTED' ? 'ACCEPTED' : 'NEEDS_MORE')
  }, [evidence.id, evidence.reviewer_notes, evidence.review_status])

  async function download() {
    setDownloading(true)
    setError('')
    try {
      const response = await fetch(`${API}/api/evidence/${evidence.id}/file`, { credentials: 'include' })
      if (!response.ok) {
        let message = `Request failed (${response.status})`
        try { const body = await response.json() as { detail?: string }; message = body.detail ?? message } catch { /* keep status */ }
        throw new Error(message)
      }
      const objectUrl = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = evidence.original_name
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not access private evidence')
    } finally {
      setDownloading(false)
    }
  }

  async function save() {
    setSaving(true)
    setError('')
    try { await onSave(status, notes.trim()) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save evidence review') } finally { setSaving(false) }
  }

  const validNotes = notes.trim().length >= 3
  return <div className="review-evidence-row">
    <div className="evidence-file"><span aria-hidden="true">▧</span><div><b>{evidence.original_name}</b><small>{evidence.description}</small><small>{formatDate(evidence.uploaded_at, locale, true)} · {evidence.review_status.replaceAll('_', ' ')}</small>{evidence.reviewer_notes && <small>{evidence.reviewer_notes}</small>}</div>{DEMO_MODE ? <small>Demo metadata only — no file was uploaded or stored.</small> : <button type="button" className="text-button" disabled={disabled || downloading} onClick={() => void download()}>{downloading ? 'Loading…' : 'Open private evidence'}</button>}</div>
    <div className="evidence-review-controls">
      <label>Evidence review<select value={status} onChange={event => setStatus(event.target.value)} disabled={disabled || saving}><option value="ACCEPTED">Accept evidence</option><option value="NEEDS_MORE">Needs more</option></select></label>
      <label>Feedback for the worker<input value={notes} onChange={event => setNotes(event.target.value)} disabled={disabled || saving} minLength={3} maxLength={2000} aria-invalid={!validNotes} aria-describedby={`evidence-note-${evidence.id}`} placeholder="Explain what the worker should improve" /></label>
      <small id={`evidence-note-${evidence.id}`}>{validNotes ? 'A clear explanation is saved with this review.' : 'Add at least three characters before saving.'}</small>
      <button type="button" className="text-button" disabled={disabled || saving || !validNotes} onClick={() => void save()}>{saving ? 'Saving…' : 'Save evidence review'}</button>
      {error && <Feedback>{error}</Feedback>}
    </div>
  </div>
}

function DecisionEditor({ criterion, disabled, onSave }: { criterion: Criterion; disabled: boolean; onSave: (result: string, notes: string) => Promise<void> }) {
  const [result, setResult] = useState<'COMPETENT' | 'NOT_YET'>(criterion.decision?.result ?? 'NOT_YET')
  const [notes, setNotes] = useState(criterion.decision?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const { locale } = useLocale()
  useEffect(() => {
    setResult(criterion.decision?.result ?? 'NOT_YET')
    setNotes(criterion.decision?.notes ?? '')
  }, [criterion.id, criterion.decision?.result, criterion.decision?.notes, criterion.decision?.updated_at])
  const validNotes = notes.trim().length >= 3

  async function save() {
    setSaving(true)
    setError('')
    try { await onSave(result, notes.trim()) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save criterion decision') } finally { setSaving(false) }
  }

  return <div className="decision-editor">
    <div><b>Assessor decision</b><small>Evidence review and formal competency decisions are separate records. Your decision is recorded with your account.</small>{criterion.decision && <small>Last saved by {criterion.decision.assessor_name} · {formatDate(criterion.decision.updated_at, locale, true)}</small>}{criterion.decision?.needs_reconfirmation && <small className="warning-note">New evidence arrived after the previous decision. Review it and save a current decision.</small>}</div>
    <label>Criterion outcome<select value={result} disabled={disabled || saving} onChange={event => setResult(event.target.value as 'COMPETENT' | 'NOT_YET')}><option value="NOT_YET">Not yet competent</option><option value="COMPETENT">Competent</option></select></label>
    <label>Decision notes<input value={notes} disabled={disabled || saving} onChange={event => setNotes(event.target.value)} minLength={3} maxLength={2000} aria-invalid={!validNotes} aria-describedby={`decision-note-${criterion.id}`} placeholder="Explain how the criterion was assessed" /></label>
    <small id={`decision-note-${criterion.id}`}>{validNotes ? 'A clear rationale is required and stored.' : 'Add at least three characters before saving.'}</small>
    <button type="button" className="button secondary small-button" disabled={disabled || saving || !validNotes} onClick={() => void save()}>{saving ? 'Saving…' : 'Save criterion decision'}</button>
    {error && <Feedback>{error}</Feedback>}
  </div>
}
