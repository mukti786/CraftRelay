import { FormEvent, useEffect, useState } from 'react'
import { api, json, upload, Criterion, Qualification, Worker as WorkerProfile, WorkRequest, DEMO_MODE } from './api'
import { EmptyState, Feedback, LoadingState } from './ui'
import { Localized } from './i18n'

type EvidenceRow = {
  id: string
  criterion_id: string
  description: string
  original_name: string
  review_status: string
  reviewer_notes: string
}

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

type Case = {
  id: string
  status: string
  qualification: Qualification
  criteria: Criterion[]
  evidence: EvidenceRow[]
  practical_tasks: PracticalTask[]
}

type QualificationDetails = Qualification & { criteria: Criterion[] }
export default function Worker({ section }: { section: 'profile' | 'assessment' | 'requests' }) {
  const [profile, setProfile] = useState<WorkerProfile | null>(null)
  const [quals, setQuals] = useState<Qualification[]>([])
  const [selectedQualification, setSelectedQualification] = useState<QualificationDetails | null>(null)
  const [cases, setCases] = useState<Case[]>([])
  const [requests, setRequests] = useState<WorkRequest[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function load(quiet = false) {
    setError('')
    if (!quiet) setLoading(true)
    try {
      if (section === 'profile') setProfile(await api('/worker/profile'))
      if (section === 'assessment') {
        const [catalogue, workerCases] = await Promise.all([
          api<Qualification[]>('/qualifications'),
          api<Case[]>('/worker/cases'),
        ])
        setQuals(catalogue)
        setCases(workerCases)
      }
      if (section === 'requests') setRequests(await api<WorkRequest[]>('/worker/requests'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load workspace')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [section])
  useEffect(() => {
    const refresh = (event: StorageEvent) => { if (event.key === 'craftrelay.sih-demo.v1') void load(true) }
    window.addEventListener('storage', refresh)
    return () => window.removeEventListener('storage', refresh)
  }, [section])

  async function action(fn: () => Promise<unknown>, message: string): Promise<boolean> {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await fn()
      setNotice(message)
      await load(true)
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Action failed')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function chooseQualification(id: string) {
    setSelectedQualification(null)
    setError('')
    if (!id) return
    try {
      setSelectedQualification(await api<QualificationDetails>(`/qualifications/${id}`))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load qualification details')
    }
  }

  if (loading) return <LoadingState label={section === 'assessment' ? 'Loading qualifications…' : section === 'requests' ? 'Loading service requests…' : 'Loading your workspace…'} />

  if (section === 'profile') return <Localized><>
    <div className="page-heading">
      <div><p className="eyebrow">YOUR STORY</p><h1>Worker profile</h1><p className="subtle">Help customers understand your work and experience.</p></div>
      <span className="status-tag">WORKER</span>
    </div>
    {error && <Feedback>{error}</Feedback>}{notice && <Feedback tone="success">{notice}</Feedback>}
    {profile && <div className="panel form-panel">
      <h2>About your work</h2>
      <p className="subtle">Your declared experience helps with discovery. It does not count as a verified qualification.</p>
      <form className="form-grid" onSubmit={event => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        void action(() => api('/worker/profile', { method: 'PUT', body: json({
          trade: form.get('trade'), experience_years: Number(form.get('experience_years')),
          service_area: form.get('service_area'), bio: form.get('bio'), available: form.get('available') === 'on',
        }) }), 'Profile saved')
      }}>
        <label>Trade<input name="trade" defaultValue={profile.trade} maxLength={100} placeholder="e.g. Masonry" /></label>
        <label>Years of experience<input name="experience_years" type="number" min="0" max="60" defaultValue={profile.experience_years} /></label>
        <label>Service area<input name="service_area" defaultValue={profile.service_area} maxLength={160} placeholder="City, district, or region" /></label>
        <label className="check-label"><input name="available" type="checkbox" defaultChecked={profile.available} /> Available for work</label>
        <label className="wide">Short introduction<textarea name="bio" rows={4} maxLength={2000} defaultValue={profile.bio} placeholder="What kind of work do you do? What should a customer know?" /></label>
        <div className="wide"><button className="button primary" disabled={busy}>Save profile <span>→</span></button></div>
      </form>
      <div className="divider" />
      <h3>Skills you declare</h3>
      <p className="subtle small">These are self-declared and shown as experience, not formal verification.</p>
      <div className="skill-list">
        {profile.skills.map(skill => <div className="skill-row" key={skill.id}>
          <span><b>{skill.name}</b><small>{skill.years_experience} years · Self-declared</small></span>
          <button type="button" className="text-button danger-text" disabled={busy} onClick={() => void action(() => api(`/worker/skills/${skill.id}`, { method: 'DELETE' }), 'Skill removed')}>Remove</button>
        </div>)}
        {!profile.skills.length && <p className="empty-inline">No skills added yet.</p>}
      </div>
      <SkillForm busy={busy} onAdd={(name, years) => action(() => api('/worker/skills', { method: 'POST', body: json({ name, years_experience: years }) }), 'Skill added')} />
      <div className="divider" />
      <section aria-labelledby="formal-competencies-heading" className="verified-profile">
        <h3 id="formal-competencies-heading">Formally verified competencies</h3>
        <p className="subtle small">Only an authorized assessor can add a formal competency decision. Your declarations and uploaded evidence do not verify a skill.</p>
        {Array.isArray(profile.verified_qualifications) && profile.verified_qualifications.length > 0
          ? profile.verified_qualifications.map((qualification, index) => <div className="qualification-badge" key={`${qualification.code}-${qualification.version}-${index}`}>
            ✓ {qualification.title} · {qualification.code} v{qualification.version}{qualification.official ? ' · Official source' : ' · Illustrative, not official'}
          </div>)
          : <p className="empty-inline">No assessor-verified competencies yet.</p>}
      </section>
    </div>}
  </></Localized>

  if (section === 'assessment') return <Localized><>
    <div className="page-heading">
      <div><p className="eyebrow">RECOGNITION OF PRIOR LEARNING</p><h1>Skill assessment</h1><p className="subtle">Choose a qualification version, then share evidence against its criteria for assessor review.</p></div>
      <span className="source-note">Only sourced qualifications are marked official.</span>
    </div>
    {error && <Feedback>{error}</Feedback>}{notice && <Feedback tone="success">{notice}</Feedback>}
    <div className="panel start-case">
      <div><h2>Start an assessment</h2><p>Each case remains linked to the selected qualification version and criteria.</p></div>
      <label className="sr-only" htmlFor="qualification-select">Choose qualification version</label>
      <select id="qualification-select" value={selectedQualification?.id ?? ''} onChange={event => void chooseQualification(event.target.value)}>
        <option value="">Choose qualification…</option>
        {quals.map(qualification => <option value={qualification.id} key={qualification.id}>
          {qualification.code} · v{qualification.version} · {qualification.title}{qualification.official ? '' : ' · illustrative'}
        </option>)}
      </select>
      <button className="button primary" disabled={busy || !selectedQualification || !selectedQualification.criteria.some(criterion => criterion.mandatory)} onClick={() => {
        if (!selectedQualification) return
        void action(() => api('/worker/cases', { method: 'POST', body: json({ qualification_id: selectedQualification.id }) }), 'Assessment opened')
      }}>Open assessment <span>→</span></button>
    </div>
    {selectedQualification && <section className="catalogue-detail panel" aria-label="Selected qualification details">
      <div className="catalogue-detail-head"><div><p className="eyebrow">{selectedQualification.code} · VERSION {selectedQualification.version}</p><h2>{selectedQualification.title}</h2></div>
        <span className={`status-tag ${selectedQualification.official ? 'verified' : 'muted'}`}>{selectedQualification.official ? 'Official source' : 'Illustrative, not official'}</span>
      </div>
      <p className="subtle">Source: {selectedQualification.source_name}{selectedQualification.source_url && <> · <a href={selectedQualification.source_url} target="_blank" rel="noreferrer">View source ↗</a></>}</p>
      <h3>Criteria in this version</h3>
      {selectedQualification.criteria.length
        ? <ul className="catalogue-criteria">{selectedQualification.criteria.map(criterion => <li key={criterion.id}>
          <span className="criterion-code">{criterion.code}</span><span>{criterion.description}</span><small>{criterion.mandatory ? 'Required' : 'Optional'}{criterion.requires_practical ? ' · Practical' : ''}</small>
        </li>)}</ul>
        : <p className="empty-inline">No criteria have been published for this version.</p>}
      {selectedQualification.criteria.length > 0 && !selectedQualification.criteria.some(criterion => criterion.mandatory) && <p className="warning-note">No mandatory criteria are available for this version.</p>}
    </section>}
    {!quals.length && <EmptyState title="No qualifications available" description="An administrator must publish a versioned qualification before you can start an assessment." />}
    {quals.length > 0 && !cases.length && !error && <EmptyState title="No assessments yet" description="Choose a qualification version to begin sharing evidence." />}
    {cases.map(item => <section className="case-section" key={item.id}>
      <div className="case-title"><div><span className="eyebrow">{item.qualification.code} · VERSION {item.qualification.version}</span><h2>{item.qualification.title}</h2>
        <p className="subtle">Source: {item.qualification.source_name}{item.qualification.source_url && <> · <a href={item.qualification.source_url} target="_blank" rel="noreferrer">View source ↗</a></>}
          {!item.qualification.official && <span className="status-tag muted">Illustrative, not official</span>}
        </p></div>
        <span className={`status-tag ${item.status === 'VERIFIED' ? 'verified' : ''}`}>{item.status.replace('_', ' ')}</span>
      </div>
      {item.status === 'IN_PROGRESS' || item.status === 'NEEDS_MORE' ? <div className="submit-case"><div>
        <b>{item.status === 'NEEDS_MORE' ? 'More evidence requested' : 'Ready for assessor review?'}</b>
        <small>{item.status === 'NEEDS_MORE' ? 'Add evidence for the requested criteria, then resubmit.' : 'Evidence supports review; an authorized assessor alone decides competency.'}</small>
      </div>
        <button className="button primary small-button" disabled={busy} onClick={() => void action(() => api(`/worker/cases/${item.id}/submit`, { method: 'POST' }), 'Assessment submitted to the assessor queue')}>{item.status === 'NEEDS_MORE' ? 'Resubmit for review' : 'Submit for review'} <span>→</span></button>
      </div> : <div className="submit-case"><div><b>{item.status === 'VERIFIED' ? 'Assessor decision recorded' : 'Submitted for assessor review'}</b><small>Evidence is locked while the assessor reviews this version.</small></div></div>}
      <div className="criteria-list">{item.criteria.map(criterion => <CriterionRow key={criterion.id} criterion={criterion} evidence={item.evidence.filter(evidence => evidence.criterion_id === criterion.id)} tasks={item.practical_tasks.filter(task => task.criterion_id === criterion.id)} caseId={item.id} disabled={item.status !== 'IN_PROGRESS' && item.status !== 'NEEDS_MORE'} onUploaded={async () => {
        setNotice('Evidence uploaded for assessor review')
        await load(true)
      }} />)}</div>
    </section>)}
  </></Localized>

  return <Localized><>
    <div className="page-heading"><div><p className="eyebrow">CUSTOMER CONNECTIONS</p><h1>Work requests</h1><p className="subtle">Respond to requests and keep service status up to date.</p></div></div>
    {error && <Feedback>{error}</Feedback>}{notice && <Feedback tone="success">{notice}</Feedback>}
    <div className="request-list">{requests.map(request => <article className="request-card" key={request.id}>
      <div className="request-top"><span className="eyebrow">REQUEST FROM {(request.customer_name ?? 'Customer').toUpperCase()}</span><span className="status-tag">{request.status.replace('_', ' ')}</span></div>
      <h3>{request.title || request.description}</h3><p className="subtle">{request.service_type ? `${request.service_type} · ` : ''}⌖ {request.location}</p><p>{request.description}</p>
      {request.preferred_date && <p className="subtle">Preferred date: {request.preferred_date}</p>}
      {request.history && <ol className="request-history" aria-label="Request status history">{request.history.map((entry, index) => <li key={`${entry.status}-${index}`}>{entry.status.replace('_', ' ')}</li>)}</ol>}
      <div className="request-actions">
        {request.status === 'REQUESTED' && <><button className="button primary small-button" disabled={busy} onClick={() => void action(() => api(`/requests/${request.id}`, { method: 'PATCH', body: json({ status: 'ACCEPTED' }) }), 'Request accepted')}>Accept request</button>
          <button className="button secondary small-button" disabled={busy} onClick={() => void action(() => api(`/requests/${request.id}`, { method: 'PATCH', body: json({ status: 'DECLINED' }) }), 'Request declined')}>Decline</button></>}
        {request.status === 'ACCEPTED' && DEMO_MODE && <button className="button primary small-button" disabled={busy} onClick={() => void action(() => api(`/requests/${request.id}`, { method: 'PATCH', body: json({ status: 'IN_PROGRESS' }) }), 'Service marked in progress')}>Start service</button>}
        {request.status === 'ACCEPTED' && !DEMO_MODE && <button className="button primary small-button" disabled={busy} onClick={() => void action(() => api(`/requests/${request.id}`, { method: 'PATCH', body: json({ status: 'COMPLETED' }) }), 'Request marked complete')}>Mark service complete</button>}
        {request.status === 'IN_PROGRESS' && <button className="button primary small-button" disabled={busy} onClick={() => void action(() => api(`/requests/${request.id}`, { method: 'PATCH', body: json({ status: 'COMPLETED' }) }), 'Request marked complete')}>Mark service complete</button>}
      </div>
    </article>)}{!requests.length && <EmptyState icon="↗" title="No work requests yet" description="Requests from customers will appear here." />}</div>
  </></Localized>
}

function SkillForm({ busy, onAdd }: { busy: boolean; onAdd: (name: string, years: number) => Promise<boolean> }) {
  const [saving, setSaving] = useState(false)
  const [validation, setValidation] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const name = String(data.get('name') ?? '').trim()
    if (name.length < 2) { setValidation('Enter a skill name with at least two characters.'); return }
    setValidation('')
    setSaving(true)
    const saved = await onAdd(name, Number(data.get('years') || 0))
    if (saved) form.reset()
    setSaving(false)
  }
  return <Localized><form className="inline-form" onSubmit={event => void submit(event)}>
    <label className="sr-only" htmlFor="declared-skill">Add a skill</label><input id="declared-skill" name="name" required minLength={2} maxLength={120} placeholder="Add a skill" aria-describedby={validation ? 'skill-validation' : undefined} />
    <label className="sr-only" htmlFor="skill-years">Years of experience</label><input id="skill-years" name="years" type="number" min="0" max="60" placeholder="Years" />
    <button className="button secondary" disabled={busy || saving}>{saving ? 'Saving…' : 'Add skill'}</button>
    {validation && <span id="skill-validation" className="form-error" role="alert">{validation}</span>}
  </form></Localized>
}

function CriterionRow({ criterion, evidence, tasks, caseId, disabled, onUploaded }: {
  criterion: Criterion
  evidence: EvidenceRow[]
  tasks: PracticalTask[]
  caseId: string
  disabled: boolean
  onUploaded: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<number | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const file = form.elements.namedItem('file') as HTMLInputElement
    if (!file.files?.[0]) { setError('Choose a file before uploading.'); return }
    const data = new FormData(form)
    setBusy(true)
    setError('')
    setProgress(0)
    try {
      await upload(`/worker/cases/${caseId}/evidence`, data, setProgress)
      form.reset()
      await onUploaded()
      setProgress(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Upload failed. You can retry.')
      setProgress(null)
    } finally {
      setBusy(false)
    }
  }

  return <Localized><article className="criterion-row">
    <div className="criterion-head"><span className="criterion-code">{criterion.code}</span><span className="subtle small">{criterion.mandatory ? 'Required' : 'Optional'}{criterion.requires_practical ? ' · Practical' : ''}</span></div>
      <h3>{criterion.description}</h3>
    <div className="evidence-items">{evidence.map(item => <div className="evidence-item" key={item.id}>
      <span aria-hidden="true">▧</span><div><b>{item.original_name}</b><small>{item.description}</small></div>
      <span className={`status-tag ${item.review_status === 'ACCEPTED' ? 'verified' : ''}`}>{item.review_status.replace('_', ' ')}</span>
      {item.reviewer_notes && <small className="review-note">Assessor: {item.reviewer_notes}</small>}
    </div>)}</div>
    {tasks.map(task => <TaskAttemptForm key={task.id} task={task} caseId={caseId} disabled={disabled} onUploaded={onUploaded} />)}
    {!disabled && <form className="evidence-form" onSubmit={event => void submit(event)}>
      <input type="hidden" name="criterion_id" value={criterion.id} />
      <label className="sr-only" htmlFor={`evidence-description-${criterion.id}`}>Briefly describe this evidence</label>
      <input id={`evidence-description-${criterion.id}`} name="description" required minLength={5} maxLength={2000} placeholder="Briefly describe this evidence" />
      <label className="sr-only" htmlFor={`evidence-file-${criterion.id}`}>Choose a private evidence file</label>
      <input id={`evidence-file-${criterion.id}`} name="file" type="file" required accept=".pdf,image/jpeg,image/png,image/webp" />
      <button disabled={busy} className="button secondary small-button">{busy ? DEMO_MODE ? 'Saving metadata…' : 'Uploading…' : DEMO_MODE ? 'Save evidence metadata' : 'Add evidence'}</button>
      {progress !== null && <div className="upload-progress" role="status" aria-live="polite">
        <progress max="100" value={progress} aria-label="Evidence upload progress" />
        <span>{DEMO_MODE ? 'Evidence details saved in this browser · file not stored' : progress < 100 ? `Uploading ${progress}%` : 'Upload sent · validating securely…'}</span>
      </div>}
      {error && <span className="form-error" role="alert">{error}</span>}
      <small>{DEMO_MODE ? 'PDF, JPEG, PNG, or WebP · max 20 MB. The file name, type, size, and note are saved in this browser; the file itself is not stored.' : 'PDF, JPEG, PNG, or WebP · max 20 MB · stored privately. Evidence is reviewed by an assessor.'}</small>
    </form>}
  </article></Localized>
}

function TaskAttemptForm({ task, caseId, disabled, onUploaded }: {
  task: PracticalTask
  caseId: string
  disabled: boolean
  onUploaded: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const latest = task.attempts.at(-1)
  const canAttempt = !latest || latest.review?.result === 'NEEDS_MORE'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const file = form.elements.namedItem('file') as HTMLInputElement
    const description = String(new FormData(form).get('description') || '').trim()
    if (description.length < 5) { setError('Describe the attempt in at least five characters.'); return }
    if (!file.files?.[0]) { setError('Choose a file before submitting the task attempt.'); return }
    const body = new FormData(form)
    body.set('description', description)
    setBusy(true)
    setError('')
    setProgress(0)
    try {
      await upload(`/worker/cases/${caseId}/tasks/${task.id}/attempts`, body, setProgress)
      form.reset()
      await onUploaded()
      setProgress(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Task attempt submission failed. You can retry.')
      setProgress(null)
    } finally {
      setBusy(false)
    }
  }

  return <Localized><section className="panel practical-task-card" aria-labelledby={`task-${task.id}`}>
    <div className="catalogue-detail-head"><div><p className="eyebrow">PRACTICAL TASK</p><h4 id={`task-${task.id}`}>{task.title}</h4></div><span className={`status-tag ${task.official ? 'verified' : 'muted'}`}>{task.official ? 'Sourced task' : 'Illustrative, not official'}</span></div>
    <p>{task.instructions}</p>
    <p className="subtle"><b>Assessment rubric:</b> {task.rubric}</p>
    <small>Source: {task.source_name}{task.source_url.startsWith('https://') && <> · <a href={task.source_url} target="_blank" rel="noreferrer">View source ↗</a></>}</small>
    {task.attempts.map((attempt, index) => <div className="task-attempt-record" key={attempt.id}>
      <b>Attempt {index + 1}</b><span className="status-tag">{attempt.review?.result === 'SATISFACTORY' ? 'Assessor reviewed' : attempt.review?.result === 'NEEDS_MORE' ? 'More evidence requested' : 'Awaiting assessor review'}</span>
      <p>{attempt.description}</p>
      {attempt.evidence && <small>{attempt.evidence.original_name}</small>}
      {attempt.review && <p className="review-note">Assessor feedback: {attempt.review.notes}</p>}
    </div>)}
    {!disabled && canAttempt && <form className="evidence-form" onSubmit={event => void submit(event)}>
      <label htmlFor={`task-description-${task.id}`}>Describe what you did</label>
      <textarea id={`task-description-${task.id}`} name="description" rows={3} minLength={5} maxLength={2000} required aria-describedby={`task-description-help-${task.id}`} placeholder="Describe the work shown in your evidence" />
      <small id={`task-description-help-${task.id}`}>Describe the activity and what the attached evidence shows.</small>
      <label htmlFor={`task-evidence-${task.id}`}>Choose private task evidence</label>
      <input id={`task-evidence-${task.id}`} name="file" type="file" required accept=".pdf,image/jpeg,image/png,image/webp" />
      <button className="button secondary small-button" disabled={busy}>{busy ? 'Submitting…' : latest ? 'Submit remediation attempt' : 'Submit task attempt'}</button>
      {progress !== null && <div className="upload-progress" role="status" aria-live="polite"><progress max="100" value={progress} aria-label="Task evidence upload progress"/><span>{progress < 100 ? `Uploading ${progress}%` : 'Upload sent · validating securely…'}</span></div>}
      {error && <span className="form-error" role="alert">{error}</span>}
      <small>PDF, JPEG, PNG, or WebP · max 20 MB · stored privately. Evidence is reviewed by an authorized assessor.</small>
    </form>}
    {!disabled && latest && !canAttempt && <p className="subtle">This task has an assessor-reviewed attempt. A new attempt is available only if the assessor requests remediation.</p>}
  </section></Localized>
}
