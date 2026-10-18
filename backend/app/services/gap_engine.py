"""
CraftRelay — Deterministic Gap Engine.

Pure functions, zero DB calls, zero randomness, zero AI.
Used to compute per-criterion assessment status and aggregate gap summaries.
"""

from enum import Enum


class CriterionGapStatus(str, Enum):
    GAP = "GAP"
    PENDING_REVIEW = "PENDING_REVIEW"
    ADDITIONAL_EVIDENCE_REQUIRED = "ADDITIONAL_EVIDENCE_REQUIRED"
    PRACTICAL_VERIFICATION_REQUIRED = "PRACTICAL_VERIFICATION_REQUIRED"
    READY_FOR_ASSESSOR_DECISION = "READY_FOR_ASSESSOR_DECISION"
    VERIFIED = "VERIFIED"


def compute_criterion_status(
    criterion_id: str,
    evidence_items: list,
    verified_criterion_ids: set[str],
) -> tuple[CriterionGapStatus, str]:
    """
    Deterministic rules applied in priority order:

    1. criterion_id in verified_criterion_ids
       → VERIFIED, 'Assessor decision recorded'
    2. No evidence submitted
       → GAP, 'No evidence submitted for this criterion'
    3. All evidence REJECTED
       → ADDITIONAL_EVIDENCE_REQUIRED, 'All submitted evidence was rejected by assessor'
    4. Any evidence PENDING
       → PENDING_REVIEW, 'Evidence submitted and awaiting assessor review'
    5. All evidence APPROVED (but not yet formally verified)
       → READY_FOR_ASSESSOR_DECISION, 'Evidence accepted — awaiting formal assessor decision'
    6. Otherwise (mixed with no PENDING, not all approved, not all rejected)
       → GAP, 'Insufficient evidence'
    """
    # Rule 1 — already formally verified
    if criterion_id in verified_criterion_ids:
        return CriterionGapStatus.VERIFIED, "Assessor decision recorded"

    if not evidence_items:
        return CriterionGapStatus.GAP, "No evidence submitted for this criterion"

    statuses: list[str] = [item.review_status if hasattr(item, "review_status") else item["review_status"] for item in evidence_items]

    all_rejected = all(s == "REJECTED" for s in statuses)
    any_pending = any(s == "PENDING" for s in statuses)
    all_approved = all(s == "APPROVED" for s in statuses)

    # Rule 3
    if all_rejected:
        return (
            CriterionGapStatus.ADDITIONAL_EVIDENCE_REQUIRED,
            "All submitted evidence was rejected by assessor",
        )

    # Rule 4
    if any_pending:
        return (
            CriterionGapStatus.PENDING_REVIEW,
            "Evidence submitted and awaiting assessor review",
        )

    # Rule 5
    if all_approved:
        return (
            CriterionGapStatus.READY_FOR_ASSESSOR_DECISION,
            "Evidence accepted — awaiting formal assessor decision",
        )

    # Rule 6 — fallthrough (some approved, some rejected, none pending)
    return CriterionGapStatus.GAP, "Insufficient evidence"


def compute_gap_summary(statuses: list[CriterionGapStatus]) -> dict:
    """Aggregate list of criterion statuses into a gap summary dict."""
    return {
        "total": len(statuses),
        "gap": sum(1 for s in statuses if s == CriterionGapStatus.GAP),
        "pending": sum(
            1
            for s in statuses
            if s
            in (
                CriterionGapStatus.PENDING_REVIEW,
                CriterionGapStatus.ADDITIONAL_EVIDENCE_REQUIRED,
                CriterionGapStatus.READY_FOR_ASSESSOR_DECISION,
            )
        ),
        "verified": sum(1 for s in statuses if s == CriterionGapStatus.VERIFIED),
        "needs_action": sum(
            1
            for s in statuses
            if s == CriterionGapStatus.PRACTICAL_VERIFICATION_REQUIRED
        ),
    }
