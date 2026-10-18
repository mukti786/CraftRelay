/**
 * CraftRelay — expanded shared types (Part 2).
 * All domain types used by mock data and UI.
 * Backend API types are aligned to the Part 1 contracts.
 */

// ── Roles ─────────────────────────────────────────────────
export type UserRole = 'worker' | 'assessor' | 'customer' | 'admin';

// ── API response envelope ─────────────────────────────────
export interface ApiResponse<T> {
  data: T;
  message?: string;
}
export interface ApiErrorResponse {
  detail: string;
  code?: string;
}
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

// ── Users ─────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
}

// ── Worker profile ────────────────────────────────────────
export interface WorkerProfile {
  id: string;
  user_id: string;
  full_name: string;
  trade: string;
  experience_years: number;
  service_area: string;
  bio: string;
  avatar_initials: string;
  is_available: boolean;
  declared_skills: DeclaredSkill[];
  verified_competencies: VerifiedCompetency[];
  average_rating: number;
  review_count: number;
}

export interface DeclaredSkill {
  id: string;
  skill_name: string;
  declared_at: string;
  evidence_count: number;
  assessment_status: AssessmentStatus;
}

export interface VerifiedCompetency {
  id: string;
  skill_name: string;
  qualification_code: string;
  qualification_title: string;
  verified_by: string;
  verified_at: string;
  note: string;
}

// ── Assessment ────────────────────────────────────────────
export type AssessmentStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'AWAITING_ASSESSOR'
  | 'NEEDS_REVISION'
  | 'COMPLETED';

export type CriterionStatus =
  | 'GAP'
  | 'PENDING_REVIEW'
  | 'ADDITIONAL_EVIDENCE_REQUIRED'
  | 'PRACTICAL_VERIFICATION_REQUIRED'
  | 'READY_FOR_ASSESSOR_DECISION'
  | 'VERIFIED';

export interface Qualification {
  id: string;
  code: string;
  title: string;
  version: string;
  note: string;
  effective_date: string;
  criteria: QualificationCriterion[];
}

export interface QualificationCriterion {
  id: string;
  text: string;
  mandatory: boolean;
  status: CriterionStatus;
  linked_evidence: EvidenceItem[];
  assessor_notes?: string;
}

export interface EvidenceItem {
  id: string;
  worker_id: string;
  skill_name: string;
  description: string;
  file_type: 'image' | 'document' | 'video';
  submitted_at: string;
  review_status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewer_notes?: string;
}

export interface AssessmentCase {
  id: string;
  worker: WorkerProfile;
  qualification: Qualification;
  status: AssessmentStatus;
  submitted_at: string;
  updated_at: string;
  assessor_id?: string;
  criteria_summary: {
    total: number;
    gap: number;
    pending: number;
    verified: number;
    needs_action: number;
  };
}

// ── Approved tasks ────────────────────────────────────────
export interface ApprovedTask {
  id: string;
  title: string;
  description: string;
  linked_criterion_id: string;
  rubric_reference: string;
  estimated_duration: string;
}

// ── Service requests ──────────────────────────────────────
export type ServiceRequestStatus =
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'IN_PROGRESS'
  | 'COMPLETION_PENDING'
  | 'COMPLETED'
  | 'CANCELLED';

export interface ServiceRequest {
  id: string;
  customer_id: string;
  customer_name: string;
  worker_id: string;
  worker: WorkerProfile;
  skill_requested: string;
  description: string;
  location: string;
  preferred_date: string;
  status: ServiceRequestStatus;
  created_at: string;
  updated_at: string;
  customer_confirmed: boolean;
  worker_confirmed: boolean;
}

// ── Reviews ───────────────────────────────────────────────
export interface CustomerReview {
  id: string;
  service_request_id: string;
  customer_name: string;
  rating: number;
  comment: string;
  created_at: string;
}
