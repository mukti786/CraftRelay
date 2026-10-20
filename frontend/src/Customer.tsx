import { useEffect, useState } from 'react'
import { api, json, Worker } from './api'
import { EmptyState, Feedback, LoadingState } from './ui'

type Request = {
  id: string
  worker_id: string
  worker_name: string
  worker_trade: string
  worker_service_area: string
  description: string
  location: string
  status: string
  review: { rating: number; comment: string } | null
}

const statusLabels: Record<string, string> = {
  REQUESTED: 'Awaiting worker response',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

export default function Customer({ section }: { section: 'market' | 'requests' }) {
  const [workers, setWorkers] = useState<Worker[]>([])
  const [requests, setRequests] = useState<Request[]>([])
  const [query, setQuery] = useState('')
  const [area, setArea] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [appliedArea, setAppliedArea] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')

  async function load() {
    setError('')
    setLoading(true)
    try {
      if (section === 'market') {
        setWorkers(await api(`/customers/workers?q=${encodeURIComponent(appliedQuery)}&area=${encodeURIComponent(appliedArea)}`))
      } else {
        setRequests(await api('/customer/requests'))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this page')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [section, appliedQuery, appliedArea])

  async function submitRequest(worker: Worker, form: HTMLFormElement) {
    const data = new FormData(form)
    setError('')
    setNotice('')
    const description = String(data.get('description') || '').trim()
    const location = String(data.get('location') || '').trim()
    if (description.length < 5) {
      setError('Describe the work in at least five characters')
      return
    }
    if (location.length < 2) {
      setError('Enter a job location with at least two characters')
      return
    }
    setBusyId(worker.id)
    try {
      await api('/customer/requests', {
        method: 'POST',
        body: json({ worker_id: worker.id, description, location }),
      })
      setNotice(`Request sent to ${worker.full_name}`)
      form.reset()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send request')
    } finally {
      setBusyId('')
    }
  }

  async function change(request: Request, status: string) {
    setError('')
    setNotice('')
    setBusyId(request.id)
    try {
      await api(`/requests/${request.id}`, { method: 'PATCH', body: json({ status }) })
      setNotice(status === 'CANCELLED' ? 'Request cancelled' : 'Request updated')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update request')
    } finally {
      setBusyId('')
    }
  }

  async function review(request: Request, form: HTMLFormElement) {
    const data = new FormData(form)
    setError('')
    setNotice('')
    setBusyId(request.id)
    try {
      await api(`/customer/requests/${request.id}/review`, {
        method: 'POST',
        body: json({ rating: Number(data.get('rating')), comment: data.get('comment') }),
      })
      setNotice('Service review saved')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save review')
    } finally {
      setBusyId('')
    }
  }

  if (loading) return <LoadingState label={section === 'market' ? 'Loading workers…' : 'Loading service requests…'} />

  if (section === 'market') return <>
    <div className="page-heading">
      <div>
        <p className="eyebrow">LOCAL SKILLS, REAL EXPERIENCE</p>
        <h1>Find a skilled worker</h1>
        <p className="subtle">Search by trade or service area. Verified qualifications are shown separately from declared skills.</p>
      </div>
    </div>
    <form className="search-row" onSubmit={event => { event.preventDefault(); setAppliedQuery(query.trim()); setAppliedArea(area.trim()) }}>
      <label><span>TRADE OR SKILL</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="e.g. carpentry, tailoring" /></label>
      <label><span>SERVICE AREA</span><input value={area} onChange={event => setArea(event.target.value)} placeholder="City or district" /></label>
      <button className="button primary" type="submit">Search <span aria-hidden="true">⌕</span></button>
    </form>
    {error && <Feedback>{error}</Feedback>}
    {notice && <Feedback tone="success">{notice}</Feedback>}
    <div className="worker-grid">
      {workers.map(worker => <article className="worker-card" key={worker.id}>
        <div className="worker-card-head">
          <span className="avatar large" aria-hidden="true">{worker.full_name.charAt(0).toUpperCase()}</span>
          <span className="verified-count">{Array.isArray(worker.verified_qualifications) ? worker.verified_qualifications.length : 0} verified</span>
        </div>
        <h2>{worker.full_name}</h2>
        <p className="trade-line">{worker.trade || 'Skilled worker'} · {worker.experience_years} years</p>
        <p className="subtle">⌖ {worker.service_area || 'Area not specified'}</p>
        {worker.bio && <p className="worker-bio">{worker.bio}</p>}
        {worker.skills.length > 0 && <div>
          <p className="eyebrow">Self-declared skills</p>
          <div className="worker-skills">{worker.skills.map(skill => <span key={skill.id}>{skill.name}</span>)}</div>
        </div>}
        {Array.isArray(worker.verified_qualifications) && worker.verified_qualifications.map(qualification => <div className="qualification-badge" key={`${qualification.code}-${qualification.version}`}>
          ✓ {qualification.title} · {qualification.code} v{qualification.version}{!qualification.official ? ' · illustrative' : ''}
          <small>{qualification.source_name}{qualification.source_url.startsWith('https://') && <> · <a href={qualification.source_url} target="_blank" rel="noreferrer">Source</a></>}</small>
        </div>)}
        {(!Array.isArray(worker.verified_qualifications) || worker.verified_qualifications.length === 0) && <p className="subtle">No verified qualifications listed. Profile skills are self-declared.</p>}
        <form className="contact-form" onSubmit={event => { event.preventDefault(); void submitRequest(worker, event.currentTarget) }}>
          <label className="sr-only" htmlFor={`request-description-${worker.id}`}>Describe the work you need</label>
          <input id={`request-description-${worker.id}`} name="description" required minLength={5} maxLength={2000} placeholder="What work do you need?" />
          <label className="sr-only" htmlFor={`request-location-${worker.id}`}>Job location</label>
          <input id={`request-location-${worker.id}`} name="location" required minLength={2} maxLength={200} placeholder="Job location" />
          <button className="button secondary full" disabled={busyId === worker.id}>{busyId === worker.id ? 'Sending…' : 'Send work request'} <span aria-hidden="true">→</span></button>
        </form>
        <p className="fine-print">A service review can be left after the work is marked complete.</p>
      </article>)}
      {!workers.length && !error && <EmptyState className="wide" icon="⌕" title="No workers found" description="Try a different skill or service area." />}
    </div>
  </>

  return <>
    <div className="page-heading"><div><p className="eyebrow">YOUR ACTIVITY</p><h1>Service requests</h1><p className="subtle">Reviews describe service experience and are separate from skill verification.</p></div></div>
    {error && <Feedback>{error}</Feedback>}
    {notice && <Feedback tone="success">{notice}</Feedback>}
    <div className="request-list">
      {requests.map(request => <article className="request-card" key={request.id}>
        <div className="request-top"><span className="eyebrow">WORKER · {request.worker_name.toUpperCase()}</span><span className="status-tag">{statusLabels[request.status] || request.status}</span></div>
        {(request.worker_trade || request.worker_service_area) && <p className="subtle">{request.worker_trade || 'Skilled worker'} · {request.worker_service_area || 'Area not specified'}</p>}
        <h3>{request.description}</h3>
        <p className="subtle">⌖ {request.location}</p>
        {(request.status === 'REQUESTED' || request.status === 'ACCEPTED') && <button className="text-button danger-text" disabled={busyId === request.id} onClick={() => void change(request, 'CANCELLED')}>Cancel request</button>}
        {request.status === 'COMPLETED' && !request.review && <form className="review-form" onSubmit={event => { event.preventDefault(); void review(request, event.currentTarget) }}>
          <label>Service rating<select name="rating" defaultValue="5"><option value="5">5 — Great</option><option value="4">4 — Good</option><option value="3">3 — Okay</option><option value="2">2 — Poor</option><option value="1">1 — Bad</option></select></label>
          <label className="sr-only" htmlFor={`review-comment-${request.id}`}>Describe your service experience</label>
          <input id={`review-comment-${request.id}`} name="comment" maxLength={2000} placeholder="What was your service experience?" />
          <button className="button primary small-button" disabled={busyId === request.id}>{busyId === request.id ? 'Saving…' : 'Leave review'}</button>
        </form>}
        {request.review && <div className="review-saved" aria-label="Customer service review">★ {request.review.rating}/5 · {request.review.comment || 'No comment'}</div>}
      </article>)}
      {!requests.length && !error && <EmptyState icon="↗" title="No service requests yet" description="Find a worker and send a request to begin." />}
    </div>
  </>
}
