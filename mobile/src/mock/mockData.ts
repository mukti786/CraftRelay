/**
 * CraftRelay — fictional mock data for Part 2 UI development.
 *
 * ⚠️  MOCK DATA — Development only.
 * These records are entirely fictional and do not persist on any server.
 * All qualification data is ILLUSTRATIVE ONLY — not official government standards.
 * Mock interactions do not reflect real backend behaviour.
 */

import type {
  WorkerProfile,
  AssessmentCase,
  Qualification,
  ApprovedTask,
  ServiceRequest,
  CustomerReview,
  User,
  EvidenceItem,
} from '../types';

// ── Demo users ────────────────────────────────────────────
export const MOCK_USERS: User[] = [
  {
    id: 'u-worker-001',
    email: 'arjun.sharma@demo.craftrelay',
    full_name: 'Arjun Sharma',
    role: 'worker',
    created_at: '2026-01-15T09:00:00Z',
  },
  {
    id: 'u-assessor-001',
    email: 'dr.menon@demo.craftrelay',
    full_name: 'Dr. Suresh Menon',
    role: 'assessor',
    created_at: '2026-01-10T09:00:00Z',
  },
  {
    id: 'u-customer-001',
    email: 'meera.iyer@demo.craftrelay',
    full_name: 'Meera Iyer',
    role: 'customer',
    created_at: '2026-02-01T09:00:00Z',
  },
  {
    id: 'u-admin-001',
    email: 'admin@demo.craftrelay',
    full_name: 'CraftRelay Admin',
    role: 'admin',
    created_at: '2026-01-01T09:00:00Z',
  },
];

// ── Evidence items ─────────────────────────────────────────
export const MOCK_EVIDENCE: EvidenceItem[] = [
  {
    id: 'ev-001',
    worker_id: 'u-worker-001',
    skill_name: 'Low-voltage wiring',
    description: 'Photo of completed domestic wiring in a 2BHK apartment, Jaipur. All connections made with correct AWG wire, properly terminated.',
    file_type: 'image',
    submitted_at: '2026-03-10T10:30:00Z',
    review_status: 'APPROVED',
    reviewer_notes: 'Clear photo, correct termination visible.',
  },
  {
    id: 'ev-002',
    worker_id: 'u-worker-001',
    skill_name: 'MCB panel installation',
    description: 'Video walkthrough of MCB panel installation with correct rating selection for 20A circuits.',
    file_type: 'video',
    submitted_at: '2026-03-12T14:00:00Z',
    review_status: 'PENDING',
  },
  {
    id: 'ev-003',
    worker_id: 'u-worker-001',
    skill_name: 'Earthing and grounding',
    description: 'Earthing continuity test result sheet for a commercial property installation.',
    file_type: 'document',
    submitted_at: '2026-03-15T11:00:00Z',
    review_status: 'REJECTED',
    reviewer_notes: 'Document quality too low — please resubmit clearer scan.',
  },
];

// ── Qualifications (ILLUSTRATIVE — not official standards) ─
export const MOCK_QUALIFICATIONS: Qualification[] = [
  {
    id: 'qual-001',
    code: 'CR-ELEC-2024-001',
    title: 'Basic Electrical Wiring',
    version: '1.0',
    note: '⚠️  ILLUSTRATIVE qualification — not an official NCVT/NSDC/PMKVY record.',
    effective_date: '2024-01-01',
    criteria: [
      {
        id: 'crit-001',
        text: 'Safely terminate and connect conductors using correct tooling and AWG selection',
        mandatory: true,
        status: 'VERIFIED',
        linked_evidence: [MOCK_EVIDENCE[0]],
        assessor_notes: 'Evidence satisfactory.',
      },
      {
        id: 'crit-002',
        text: 'Identify and install appropriate MCB ratings for domestic circuits (6A–32A)',
        mandatory: true,
        status: 'PENDING_REVIEW',
        linked_evidence: [MOCK_EVIDENCE[1]],
      },
      {
        id: 'crit-003',
        text: 'Demonstrate correct earthing continuity testing procedure using a calibrated tester',
        mandatory: false,
        status: 'ADDITIONAL_EVIDENCE_REQUIRED',
        linked_evidence: [MOCK_EVIDENCE[2]],
        assessor_notes: 'Document resubmission required.',
      },
      {
        id: 'crit-004',
        text: 'Correctly identify and mark live, neutral, and earth conductors per IS 732 colour coding',
        mandatory: true,
        status: 'GAP',
        linked_evidence: [],
      },
    ],
  },
  {
    id: 'qual-002',
    code: 'CR-PLMB-2024-001',
    title: 'Domestic Plumbing Fundamentals',
    version: '1.0',
    note: '⚠️  ILLUSTRATIVE qualification — not an official NCVT/NSDC/PMKVY record.',
    effective_date: '2024-01-01',
    criteria: [
      {
        id: 'crit-101',
        text: 'Select and cut pipe materials appropriate to water pressure and temperature requirements',
        mandatory: true,
        status: 'VERIFIED',
        linked_evidence: [],
      },
      {
        id: 'crit-102',
        text: 'Install and test a hot-water cylinder pressure-relief valve',
        mandatory: true,
        status: 'PRACTICAL_VERIFICATION_REQUIRED',
        linked_evidence: [],
      },
    ],
  },
];

// ── Worker profiles ────────────────────────────────────────
export const MOCK_WORKERS: WorkerProfile[] = [
  {
    id: 'wp-001',
    user_id: 'u-worker-001',
    full_name: 'Arjun Sharma',
    trade: 'Electrician',
    experience_years: 5,
    service_area: 'Jaipur, Rajasthan',
    bio: 'Experienced domestic and commercial electrician. Specialize in wiring, panel upgrades, and fault diagnosis.',
    avatar_initials: 'AS',
    is_available: true,
    declared_skills: [
      {
        id: 'ds-001',
        skill_name: 'Low-voltage wiring',
        declared_at: '2026-02-01T09:00:00Z',
        evidence_count: 1,
        assessment_status: 'AWAITING_ASSESSOR',
      },
      {
        id: 'ds-002',
        skill_name: 'MCB panel installation',
        declared_at: '2026-02-01T09:00:00Z',
        evidence_count: 1,
        assessment_status: 'IN_PROGRESS',
      },
      {
        id: 'ds-003',
        skill_name: 'Earthing and grounding',
        declared_at: '2026-02-01T09:00:00Z',
        evidence_count: 1,
        assessment_status: 'NEEDS_REVISION',
      },
    ],
    verified_competencies: [],
    average_rating: 4.3,
    review_count: 7,
  },
  {
    id: 'wp-002',
    user_id: 'u-worker-002',
    full_name: 'Priya Nair',
    trade: 'Plumber',
    experience_years: 8,
    service_area: 'Kochi, Kerala',
    bio: 'Certified plumber with expertise in residential and light-commercial sanitary systems.',
    avatar_initials: 'PN',
    is_available: true,
    declared_skills: [
      {
        id: 'ds-004',
        skill_name: 'Pipe fitting',
        declared_at: '2026-01-15T09:00:00Z',
        evidence_count: 3,
        assessment_status: 'COMPLETED',
      },
      {
        id: 'ds-005',
        skill_name: 'Sanitary installations',
        declared_at: '2026-01-15T09:00:00Z',
        evidence_count: 2,
        assessment_status: 'COMPLETED',
      },
    ],
    verified_competencies: [
      {
        id: 'vc-001',
        skill_name: 'Pipe fitting',
        qualification_code: 'CR-PLMB-2024-001',
        qualification_title: 'Domestic Plumbing Fundamentals (Illustrative)',
        verified_by: 'Dr. Suresh Menon',
        verified_at: '2026-03-15T09:00:00Z',
        note: 'All mandatory criteria satisfied. Formal assessor decision recorded.',
      },
    ],
    average_rating: 4.8,
    review_count: 23,
  },
  {
    id: 'wp-003',
    user_id: 'u-worker-003',
    full_name: 'Ravi Kumar',
    trade: 'Carpenter',
    experience_years: 12,
    service_area: 'Bengaluru, Karnataka',
    bio: 'Expert furniture maker and site carpenter. Modular kitchens, wardrobes, and custom woodwork.',
    avatar_initials: 'RK',
    is_available: false,
    declared_skills: [
      {
        id: 'ds-006',
        skill_name: 'Furniture assembly',
        declared_at: '2026-01-10T09:00:00Z',
        evidence_count: 5,
        assessment_status: 'COMPLETED',
      },
    ],
    verified_competencies: [],
    average_rating: 4.6,
    review_count: 41,
  },
];

// ── Assessment cases ───────────────────────────────────────
export const MOCK_ASSESSMENT_CASES: AssessmentCase[] = [
  {
    id: 'ac-001',
    worker: MOCK_WORKERS[0],
    qualification: MOCK_QUALIFICATIONS[0],
    status: 'IN_PROGRESS',
    submitted_at: '2026-03-10T09:00:00Z',
    updated_at: '2026-03-16T11:00:00Z',
    criteria_summary: { total: 4, gap: 1, pending: 1, verified: 1, needs_action: 1 },
  },
  {
    id: 'ac-002',
    worker: MOCK_WORKERS[1],
    qualification: MOCK_QUALIFICATIONS[1],
    status: 'AWAITING_ASSESSOR',
    submitted_at: '2026-03-01T09:00:00Z',
    updated_at: '2026-03-12T09:00:00Z',
    criteria_summary: { total: 2, gap: 0, pending: 0, verified: 1, needs_action: 1 },
  },
];

// ── Approved practical tasks ───────────────────────────────
export const MOCK_APPROVED_TASKS: ApprovedTask[] = [
  {
    id: 'task-001',
    title: 'Live/Neutral/Earth Identification Practical',
    description: 'Under assessor observation, identify and correctly mark L/N/E conductors on a 6-way consumer unit using IS 732 colour coding.',
    linked_criterion_id: 'crit-004',
    rubric_reference: 'CraftRelay Practical Rubric CR-ELEC-R01 (Illustrative)',
    estimated_duration: '30 minutes',
  },
  {
    id: 'task-002',
    title: 'Pressure Relief Valve Installation Practical',
    description: 'Install and pressure-test a PRV on a hot-water cylinder under assessor supervision. Record test pressures.',
    linked_criterion_id: 'crit-102',
    rubric_reference: 'CraftRelay Practical Rubric CR-PLMB-R01 (Illustrative)',
    estimated_duration: '45 minutes',
  },
];

// ── Service requests ───────────────────────────────────────
export const MOCK_SERVICE_REQUESTS: ServiceRequest[] = [
  {
    id: 'sr-001',
    customer_id: 'u-customer-001',
    customer_name: 'Meera Iyer',
    worker_id: 'wp-002',
    worker: MOCK_WORKERS[1],
    skill_requested: 'Pipe fitting',
    description: 'Leaking kitchen pipe and bathroom tap replacement. 2BHK apartment, third floor.',
    location: 'Kochi, Kerala',
    preferred_date: '2026-04-05',
    status: 'IN_PROGRESS',
    created_at: '2026-04-01T10:00:00Z',
    updated_at: '2026-04-03T09:00:00Z',
    customer_confirmed: false,
    worker_confirmed: false,
  },
  {
    id: 'sr-002',
    customer_id: 'u-customer-001',
    customer_name: 'Meera Iyer',
    worker_id: 'wp-003',
    worker: MOCK_WORKERS[2],
    skill_requested: 'Furniture assembly',
    description: 'Modular wardrobe assembly — 3 units delivered, need installation.',
    location: 'Bengaluru, Karnataka',
    preferred_date: '2026-03-20',
    status: 'COMPLETED',
    created_at: '2026-03-15T08:00:00Z',
    updated_at: '2026-03-22T15:00:00Z',
    customer_confirmed: true,
    worker_confirmed: true,
  },
];

// ── Customer reviews ───────────────────────────────────────
export const MOCK_REVIEWS: CustomerReview[] = [
  {
    id: 'rev-001',
    service_request_id: 'sr-002',
    customer_name: 'Meera Iyer',
    rating: 5,
    comment: 'Ravi was punctual, professional, and the work was neat. Highly recommend.',
    created_at: '2026-03-23T10:00:00Z',
  },
];

// ── Admin summary ──────────────────────────────────────────
export const MOCK_ADMIN_STATS = {
  total_workers: 148,
  verified_workers: 62,
  pending_assessments: 23,
  active_service_requests: 37,
  total_qualifications: 2,
  total_customers: 210,
};
