import { ApiError, Criterion, Qualification, User, Worker, WorkRequest } from './api'

type DemoEvidence = {
  id: string
  criterion_id: string
  description: string
  original_name: string
  review_status: 'PENDING' | 'ACCEPTED' | 'NEEDS_MORE'
  reviewer_notes: string
  uploaded_at: string
  content_type: string
  size: number
}
type DemoCase = {
  id: string
  worker_id: string
  status: string
  qualification_id: string
  evidence: DemoEvidence[]
  decisions: Record<string, { result: 'COMPETENT' | 'NOT_YET'; notes: string; assessor_name: string; updated_at: string; needs_reconfirmation: boolean }>
}
export type DemoRequestStatus = 'REQUESTED' | 'ACCEPTED' | 'DECLINED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
type DemoWorkRequest = WorkRequest & {
  customer_id: string; customer_name: string; worker_id: string; title: string; service_type: string
  description: string; location: string; preferred_date: string; status: DemoRequestStatus
  history: { status: DemoRequestStatus; at: string }[]; review: { rating: number; comment: string } | null
}
type DemoState = { version: 2; profile: Worker; skills: Worker['skills']; cases: DemoCase[]; requests: DemoWorkRequest[]; activeRole: User['role'] | null }

const storageKey = 'craftrelay.sih-demo.v1'
const workerUser: User = { id: 'demo-worker-asha', email: 'asha.worker@demo.craftrelay', full_name: 'Asha Patel', role: 'worker' }
const assessorUser: User = { id: 'demo-assessor-ravi', email: 'ravi.assessor@demo.craftrelay', full_name: 'Ravi Verma', role: 'assessor' }
const customerUser: User = { id: 'demo-customer-meera', email: 'meera.customer@demo.craftrelay', full_name: 'Meera Singh', role: 'customer' }
const demoQualification: Qualification = {
  id: 'demo-qualification-masonry-v1', code: 'CR-MAS-01', version: '1.0',
  title: 'Masonry Work — Illustrative Qualification', source_name: 'CraftRelay illustrative catalogue',
  source_url: '', official: false, criterion_count: 2,
}
const criteria: Criterion[] = [
  { id: 'demo-criterion-layout', code: 'CR1', description: 'Prepare the work area and set out a level, consistent masonry line.', mandatory: true, requires_practical: false, evidence_count: 0 },
  { id: 'demo-criterion-mortar', code: 'CR2', description: 'Select and apply mortar safely and consistently for the task.', mandatory: true, requires_practical: false, evidence_count: 0 },
]
const initialEvidence: DemoEvidence[] = [
  { id: 'demo-evidence-layout', criterion_id: criteria[0].id, description: 'Synthetic sample metadata: photo showing the prepared work area and first course.', original_name: 'sample-work-area.jpg', review_status: 'PENDING', reviewer_notes: '', uploaded_at: '2026-01-12T10:30:00.000Z', content_type: 'image/jpeg', size: 384000 },
  { id: 'demo-evidence-mortar', criterion_id: criteria[1].id, description: 'Synthetic sample metadata: short work note describing mortar preparation and use.', original_name: 'sample-mortar-notes.pdf', review_status: 'PENDING', reviewer_notes: '', uploaded_at: '2026-01-12T10:35:00.000Z', content_type: 'application/pdf', size: 92000 },
]

function initialState(): DemoState {
  return {
    version: 2,
    profile: {
      id: workerUser.id, full_name: workerUser.full_name, trade: 'Masonry worker', experience_years: 7,
      service_area: 'Raipur, Chhattisgarh', bio: 'Experienced with residential masonry and site preparation.',
      available: true, skills: [], verified_qualifications: [],
    },
    skills: [
      { id: 'demo-skill-brickwork', name: 'Bricklaying', years_experience: 7 },
      { id: 'demo-skill-site', name: 'Site preparation', years_experience: 5 },
    ],
    cases: [{ id: 'demo-case-asha-001', worker_id: workerUser.id, status: 'SUBMITTED', qualification_id: demoQualification.id,
      evidence: structuredClone(initialEvidence), decisions: {} }],
    requests: [{ id: 'request-sample-001', customer_id: customerUser.id, customer_name: customerUser.full_name,
      worker_id: workerUser.id, title: 'Repair a courtyard boundary wall', service_type: 'Masonry',
      description: 'Repair loose bricks and restore a short section of the courtyard wall.', location: 'Raipur, Chhattisgarh',
      preferred_date: '', status: 'REQUESTED', history: [{ status: 'REQUESTED', at: new Date().toISOString() }], review: null }],
    activeRole: null,
  }
}

const requestStatuses: DemoRequestStatus[] = ['REQUESTED', 'ACCEPTED', 'DECLINED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']
function normalizeRequest(value: unknown): DemoWorkRequest | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<DemoWorkRequest>
  if (typeof item.id !== 'string' || typeof item.customer_id !== 'string' || typeof item.worker_id !== 'string'
    || typeof item.customer_name !== 'string' || typeof item.description !== 'string' || typeof item.location !== 'string'
    || typeof item.status !== 'string' || !requestStatuses.includes(item.status as DemoRequestStatus)) return null
  const history = Array.isArray(item.history) ? item.history.filter(entry => entry && typeof entry.status === 'string'
    && requestStatuses.includes(entry.status as DemoRequestStatus) && typeof entry.at === 'string')
    .map(entry => ({ status: entry.status as DemoRequestStatus, at: entry.at })) : []
  const review = item.review && Number.isInteger(item.review.rating) && item.review.rating >= 1 && item.review.rating <= 5
    && typeof item.review.comment === 'string' ? item.review : null
  return { id: item.id, customer_id: item.customer_id, customer_name: item.customer_name, worker_id: item.worker_id,
    title: typeof item.title === 'string' ? item.title : item.description,
    service_type: typeof item.service_type === 'string' ? item.service_type : '', description: item.description,
    location: item.location, preferred_date: typeof item.preferred_date === 'string' ? item.preferred_date : '',
    status: item.status as DemoRequestStatus, history, review }
}

let memoryState: DemoState | null = null
function readState(): DemoState {
  try {
    const saved = typeof localStorage === 'undefined' ? null : localStorage.getItem(storageKey)
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<DemoState>
      const validProfile = !!parsed.profile && typeof parsed.profile.id === 'string' && typeof parsed.profile.full_name === 'string'
        && typeof parsed.profile.trade === 'string' && typeof parsed.profile.service_area === 'string'
        && typeof parsed.profile.bio === 'string' && typeof parsed.profile.experience_years === 'number'
      const validSkills = Array.isArray(parsed.skills) && parsed.skills.every(skill => skill && typeof skill.id === 'string'
        && typeof skill.name === 'string' && typeof skill.years_experience === 'number')
      const validCases = Array.isArray(parsed.cases) && parsed.cases.every(item => item && typeof item.id === 'string'
        && typeof item.worker_id === 'string' && typeof item.status === 'string' && typeof item.qualification_id === 'string'
        && Array.isArray(item.evidence) && item.evidence.every(evidence => evidence && typeof evidence.id === 'string'
          && typeof evidence.criterion_id === 'string' && typeof evidence.description === 'string')
        && item.decisions && typeof item.decisions === 'object')
      if (validProfile && validCases && validSkills) {
        // Upgrade the previous local schema in memory without replacing user records.
        return { ...initialState(), ...parsed, version: 2,
          profile: parsed.profile!, skills: parsed.skills!, cases: parsed.cases!,
          requests: Array.isArray(parsed.requests) ? parsed.requests.map(normalizeRequest).filter((request): request is DemoWorkRequest => request !== null) : [],
          activeRole: ['worker', 'assessor', 'customer', 'admin'].includes(String(parsed.activeRole)) ? parsed.activeRole! : null }
      }
    }
  } catch { /* Fall back to the in-memory demo state when storage is unavailable. */ }
  memoryState ??= initialState()
  return memoryState
}
function writeState(state: DemoState) {
  memoryState = state
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(storageKey, JSON.stringify(state)) } catch { /* The current session still works in memory. */ }
}
function currentUser(state = readState()): User | null {
  return state.activeRole === 'worker' ? workerUser : state.activeRole === 'assessor' ? assessorUser : state.activeRole === 'customer' ? customerUser : null
}
function requireRole(...roles: User['role'][]) {
  const state = readState()
  const user = currentUser(state)
  if (!user) throw new ApiError('Sign in to your workspace first.', 401)
  if (!roles.includes(user.role)) throw new ApiError('This workspace is not available for the current role.', 403)
  return { state, user }
}
function bodyOf(options: RequestInit): Record<string, unknown> {
  if (typeof options.body !== 'string') return {}
  try { return JSON.parse(options.body) as Record<string, unknown> } catch { return {} }
}
function qualification() { return { ...demoQualification, criteria: structuredClone(criteria) } }
function workerCase(item: DemoCase) {
  return { ...item, qualification: demoQualification, criteria: structuredClone(criteria).map(criterion => ({
    ...criterion, evidence_count: item.evidence.filter(evidence => evidence.criterion_id === criterion.id).length,
  })), evidence: item.evidence, practical_tasks: [] }
}
function assessorCase(item: DemoCase) {
  const current = structuredClone(criteria)
  const pendingEvidence = item.evidence
  return {
    id: item.id, status: item.status,
    submitted_criteria: current.filter(c => c.mandatory && pendingEvidence.some(e => e.criterion_id === c.id)).length,
    mandatory_criteria: current.filter(c => c.mandatory).length,
    worker: { id: workerUser.id, name: workerUser.full_name, trade: readState().profile.trade,
      experience_years: readState().profile.experience_years, service_area: readState().profile.service_area,
      bio: readState().profile.bio, skills: readState().skills },
    qualification: demoQualification,
    criteria: current.map(criterion => ({ ...criterion,
      evidence: pendingEvidence.filter(evidence => evidence.criterion_id === criterion.id),
      decision: item.decisions[criterion.id] ?? null,
    })), practical_tasks: [],
  }
}
function parseCaseId(path: string) { return path.match(/\/cases\/([^/]+)/)?.[1] }
function ensureDemoCase(state: DemoState, caseId: string) {
  const item = state.cases.find(candidate => candidate.id === caseId)
  if (!item) throw new ApiError('Assessment case was not found.', 404)
  return item
}

export function loginDemoRole(role: 'worker' | 'assessor' | 'customer') {
  const state = readState()
  state.activeRole = role
  writeState(state)
  return role === 'worker' ? workerUser : role === 'assessor' ? assessorUser : customerUser
}
export function resetDemoState() {
  const next = initialState()
  writeState(next)
}

export async function demoUpload<T>(path: string, form: FormData, onProgress: (percentage: number) => void): Promise<T> {
  const { state, user } = requireRole('worker')
  const caseId = parseCaseId(path)
  if (!caseId) throw new ApiError('Assessment case was not specified.', 400)
  const item = ensureDemoCase(state, caseId)
  if (item.worker_id !== user.id) throw new ApiError('You cannot change another worker’s case.', 403)
  if (item.status !== 'IN_PROGRESS' && item.status !== 'NEEDS_MORE') throw new ApiError('Evidence metadata is locked after submission.', 409)
  const file = form.get('file')
  const description = String(form.get('description') ?? '').trim()
  const criterionId = String(form.get('criterion_id') ?? '')
  if (!(file instanceof File)) throw new ApiError('Choose a file for the local metadata preview.', 400)
  const allowed = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
  if (!allowed.has(file.type)) throw new ApiError('Choose a PDF, JPEG, PNG, or WebP file.', 422)
  if (file.size > 20 * 1024 * 1024) throw new ApiError('Files must be 20 MB or smaller.', 422)
  if (description.length < 5) throw new ApiError('Describe the evidence in at least five characters.', 422)
  if (!criteria.some(criterion => criterion.id === criterionId)) throw new ApiError('Choose a criterion from this qualification.', 422)
  item.evidence.push({ id: `demo-evidence-${crypto.randomUUID()}`, criterion_id: criterionId,
    description: `${description} (file details only; file not stored)`, original_name: file.name.slice(0, 180),
    review_status: 'PENDING', reviewer_notes: '', uploaded_at: new Date().toISOString(), content_type: file.type,
    size: file.size })
  writeState(state)
  onProgress(100)
  return undefined as T
}

export async function demoApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase()
  const data = bodyOf(options)
  const state = readState()

  if (path === '/auth/me' && method === 'GET') {
    const user = currentUser(state)
    if (!user) throw new ApiError('No active workspace session.', 401)
    return user as T
  }
  if (path === '/auth/logout' && method === 'POST') { state.activeRole = null; writeState(state); return undefined as T }

  const route = path.split('?')[0]
  if (route === '/worker/requests' && method === 'GET') {
    const { state: active, user } = requireRole('worker')
    return active.requests.filter(request => request.worker_id === user.id).map(request => ({ ...request })) as T
  }
  if (route === '/customers/workers' && method === 'GET') {
    const { state: active } = requireRole('customer')
    const params = new URLSearchParams(path.split('?')[1] ?? '')
    const q = (params.get('q') ?? '').toLocaleLowerCase()
    const area = (params.get('area') ?? '').toLocaleLowerCase()
    const verified = active.cases.some(item => item.worker_id === active.profile.id && item.status === 'VERIFIED')
    const qualifications = verified ? [{ title: demoQualification.title, code: demoQualification.code, version: demoQualification.version,
      source_name: demoQualification.source_name, source_url: demoQualification.source_url, official: false }] : []
    const worker: Worker = { ...active.profile, skills: active.skills, verified_qualifications: qualifications }
    const haystack = `${worker.trade} ${worker.skills.map(skill => skill.name).join(' ')}`.toLocaleLowerCase()
    return worker.available && (!q || haystack.includes(q)) && (!area || worker.service_area.toLocaleLowerCase().includes(area)) ? [worker] as T : [] as T
  }
  if (route === '/customer/requests' && method === 'GET') {
    const { state: active, user } = requireRole('customer')
    return active.requests.filter(request => request.customer_id === user.id).map(request => ({
      ...request, worker_name: active.profile.full_name, worker_trade: active.profile.trade,
      worker_service_area: active.profile.service_area,
    })) as T
  }
  if (route === '/customer/requests' && method === 'POST') {
    const { state: active, user } = requireRole('customer')
    if (data.worker_id !== active.profile.id || !active.profile.available) throw new ApiError('This worker is not available for requests.', 404)
    const title = String(data.title ?? '').trim()
    const serviceType = String(data.service_type ?? '').trim()
    const description = String(data.description ?? '').trim()
    const location = String(data.location ?? '').trim()
    const preferredDate = String(data.preferred_date ?? '').trim()
    if (title.length < 3 || title.length > 120) throw new ApiError('Enter a request title between 3 and 120 characters.', 422)
    if (serviceType.length < 2 || serviceType.length > 80) throw new ApiError('Enter a service type between 2 and 80 characters.', 422)
    if (description.length < 5 || description.length > 2000) throw new ApiError('Describe the work in 5 to 2,000 characters.', 422)
    if (location.length < 2 || location.length > 200) throw new ApiError('Enter a job location between 2 and 200 characters.', 422)
    if (preferredDate && !/^\d{4}-\d{2}-\d{2}$/.test(preferredDate)) throw new ApiError('Enter a valid preferred date.', 422)
    if (active.requests.some(item => item.customer_id === user.id && item.worker_id === data.worker_id
      && item.title === title && item.description === description && item.location === location
      && ['REQUESTED', 'ACCEPTED', 'IN_PROGRESS'].includes(item.status))) throw new ApiError('A matching work request is already open.', 409)
    const request: DemoWorkRequest = { id: `request-${crypto.randomUUID()}`, customer_id: user.id,
      customer_name: user.full_name, worker_id: active.profile.id, title, service_type: serviceType, description,
      location, preferred_date: preferredDate, status: 'REQUESTED', history: [{ status: 'REQUESTED', at: new Date().toISOString() }], review: null }
    active.requests.unshift(request)
    writeState(active)
    return { ...request, worker_name: active.profile.full_name, worker_trade: active.profile.trade,
      worker_service_area: active.profile.service_area } as T
  }
  const requestStatusMatch = path.match(/^\/requests\/([^/?]+)$/)
  if (requestStatusMatch && method === 'PATCH') {
    const { state: active, user } = requireRole('customer', 'worker')
    const request = active.requests.find(item => item.id === requestStatusMatch[1])
    if (!request || (user.role === 'customer' ? request.customer_id !== user.id : request.worker_id !== user.id)) throw new ApiError('Request not found', 404)
    const next = data.status as DemoRequestStatus
    const transitions: Record<DemoRequestStatus, DemoRequestStatus[]> = {
      REQUESTED: user.role === 'worker' ? ['ACCEPTED', 'DECLINED'] : ['CANCELLED'],
      ACCEPTED: user.role === 'worker' ? ['IN_PROGRESS'] : ['CANCELLED'],
      IN_PROGRESS: user.role === 'worker' ? ['COMPLETED'] : [],
      DECLINED: [], COMPLETED: [], CANCELLED: [],
    }
    if (!transitions[request.status]?.includes(next)) throw new ApiError('That status change is not allowed', 409)
    request.status = next
    request.history.push({ status: next, at: new Date().toISOString() })
    writeState(active)
    return { ...request } as T
  }
  const reviewMatch = path.match(/^\/customer\/requests\/([^/?]+)\/review$/)
  if (reviewMatch && method === 'POST') {
    const { state: active, user } = requireRole('customer')
    const request = active.requests.find(item => item.id === reviewMatch[1] && item.customer_id === user.id)
    if (!request) throw new ApiError('Request not found', 404)
    if (request.status !== 'COMPLETED') throw new ApiError('Reviews are available after the service is completed', 409)
    if (request.review) throw new ApiError('This request has already been reviewed', 409)
    const rating = Number(data.rating)
    const comment = String(data.comment ?? '').trim()
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length > 2000) throw new ApiError('Enter a rating from 1 to 5 and a comment under 2,000 characters.', 422)
    request.review = { rating, comment }
    writeState(active)
    return { ...request.review } as T
  }

  if (path === '/worker/profile' && method === 'GET') {
    const { state: active } = requireRole('worker')
    const verified = active.cases.some(item => item.worker_id === active.profile.id && item.status === 'VERIFIED')
      ? [{ title: demoQualification.title, code: demoQualification.code, version: demoQualification.version,
        source_name: demoQualification.source_name, source_url: demoQualification.source_url, official: false }]
      : []
    return { ...active.profile, skills: active.skills, verified_qualifications: verified } as T
  }
  if (path === '/worker/profile' && method === 'PUT') {
    const { state: active } = requireRole('worker')
    active.profile = { ...active.profile,
      trade: String(data.trade ?? active.profile.trade), experience_years: Number(data.experience_years ?? active.profile.experience_years),
      service_area: String(data.service_area ?? active.profile.service_area), bio: String(data.bio ?? active.profile.bio),
      available: Boolean(data.available), skills: active.skills }
    writeState(active)
    return active.profile as T
  }
  if (path === '/worker/skills' && method === 'POST') {
    const { state: active } = requireRole('worker')
    const name = String(data.name ?? '').trim()
    if (name.length < 2) throw new ApiError('Skill name must have at least two characters.', 422)
    active.skills.push({ id: `demo-skill-${crypto.randomUUID()}`, name, years_experience: Number(data.years_experience ?? 0) })
    writeState(active)
    return active.skills.at(-1) as T
  }
  const deleteSkill = path.match(/^\/worker\/skills\/([^/]+)$/)
  if (deleteSkill && method === 'DELETE') {
    const { state: active } = requireRole('worker')
    active.skills = active.skills.filter(skill => skill.id !== deleteSkill[1])
    active.profile.skills = active.skills
    writeState(active)
    return undefined as T
  }
  if (path === '/qualifications' && method === 'GET') { requireRole('worker'); return [demoQualification] as T }
  if (path === `/qualifications/${demoQualification.id}` && method === 'GET') { requireRole('worker'); return qualification() as T }
  if (path === '/worker/cases' && method === 'GET') {
    const { state: active, user } = requireRole('worker')
    return active.cases.filter(item => item.worker_id === user.id).map(workerCase) as T
  }
  if (path === '/worker/cases' && method === 'POST') {
    const { state: active, user } = requireRole('worker')
    if (data.qualification_id !== demoQualification.id) throw new ApiError('This qualification is not available in the catalogue.', 422)
    const item: DemoCase = { id: `demo-case-${crypto.randomUUID()}`, worker_id: user.id, status: 'IN_PROGRESS', qualification_id: demoQualification.id, evidence: [], decisions: {} }
    active.cases.push(item)
    writeState(active)
    return workerCase(item) as T
  }
  if (path.startsWith('/worker/cases/') && path.endsWith('/submit') && method === 'POST') {
    const { state: active, user } = requireRole('worker')
    const item = ensureDemoCase(active, parseCaseId(path) ?? '')
    if (item.worker_id !== user.id) throw new ApiError('You cannot submit another worker’s case.', 403)
    if (item.status !== 'IN_PROGRESS' && item.status !== 'NEEDS_MORE') throw new ApiError('This case cannot be submitted in its current state.', 409)
    const missing = criteria.filter(criterion => criterion.mandatory && !item.evidence.some(evidence => evidence.criterion_id === criterion.id))
    if (missing.length) throw new ApiError('Add evidence metadata for each required criterion before submitting.', 422)
    item.status = 'SUBMITTED'
    for (const decision of Object.values(item.decisions)) decision.needs_reconfirmation = true
    writeState(active)
    return workerCase(item) as T
  }
  if (path === '/assessor/cases' && method === 'GET') {
    const { state: active } = requireRole('assessor')
    return active.cases.filter(item => item.status === 'SUBMITTED').map(assessorCase) as T
  }
  if (path === '/assessor/ai-assistance' && method === 'GET') {
    requireRole('assessor')
    return { available: false, reason: 'AI assistance is not available in this workspace.', manual_review_available: true } as T
  }
  if (path.includes('/ai-suggestions') && method === 'GET') { requireRole('assessor'); return [] as T }
  if (path.includes('/ai-suggestions') && method === 'POST') {
    requireRole('assessor')
    throw new ApiError('AI assistance is unavailable in this workspace. Continue with manual review.', 503)
  }
  const evidenceMatch = path.match(/^\/assessor\/evidence\/([^/]+)$/)
  if (evidenceMatch && method === 'PATCH') {
    const { state: active } = requireRole('assessor')
    const item = active.cases.find(candidate => candidate.evidence.some(evidence => evidence.id === evidenceMatch[1]))
    if (!item || item.status !== 'SUBMITTED') throw new ApiError('Evidence is not open for assessor review.', 409)
    const evidence = item.evidence.find(candidate => candidate.id === evidenceMatch[1])!
    if (data.status !== 'ACCEPTED' && data.status !== 'NEEDS_MORE') throw new ApiError('Choose an allowed evidence review status.', 422)
    const notes = String(data.notes ?? '').trim()
    if (notes.length < 3) throw new ApiError('Add a clear assessor note of at least three characters.', 422)
    evidence.review_status = data.status
    evidence.reviewer_notes = notes
    if (data.status === 'NEEDS_MORE') item.status = 'NEEDS_MORE'
    writeState(active)
    return evidence as T
  }
  const criterionMatch = path.match(/^\/assessor\/cases\/([^/]+)\/criteria\/([^/]+)$/)
  if (criterionMatch && method === 'PUT') {
    const { state: active, user } = requireRole('assessor')
    const item = ensureDemoCase(active, criterionMatch[1])
    if (item.status !== 'SUBMITTED') throw new ApiError('This case is not open for assessor decisions.', 409)
    if (!criteria.some(criterion => criterion.id === criterionMatch[2])) throw new ApiError('Criterion does not belong to this qualification.', 404)
    if (data.result !== 'COMPETENT' && data.result !== 'NOT_YET') throw new ApiError('Choose a supported assessor decision.', 422)
    const notes = String(data.notes ?? '').trim()
    if (notes.length < 3) throw new ApiError('Add a clear decision note of at least three characters.', 422)
    item.decisions[criterionMatch[2]] = { result: data.result, notes, assessor_name: user.full_name, updated_at: new Date().toISOString(), needs_reconfirmation: false }
    writeState(active)
    return item.decisions[criterionMatch[2]] as T
  }
  const verifyMatch = path.match(/^\/assessor\/cases\/([^/]+)\/verify$/)
  if (verifyMatch && method === 'POST') {
    const { state: active } = requireRole('assessor')
    const item = ensureDemoCase(active, verifyMatch[1])
    if (item.status !== 'SUBMITTED') throw new ApiError('This case is not open for verification.', 409)
    const complete = criteria.filter(c => c.mandatory).every(c => item.decisions[c.id]?.result === 'COMPETENT' && !item.decisions[c.id]?.needs_reconfirmation)
    if (!complete) throw new ApiError('All required criteria need a current competent assessor decision.', 409)
    item.status = 'VERIFIED'
    writeState(active)
    return { status: item.status } as T
  }
  throw new ApiError('This action is unavailable in this workspace.', 501)
}
