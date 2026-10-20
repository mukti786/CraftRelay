"""Provider-neutral, fail-closed boundary for optional assessor assistance.

Production currently has no provider adapter. Test adapters can exercise validation and
disposition behavior without presenting stub output as live model output.
"""

from collections.abc import Sequence
from typing import Annotated, Protocol

from pydantic import BaseModel, ConfigDict, Field


class AssistanceUnavailable(Exception):
    pass


class AssistanceTimeout(Exception):
    pass


class AssistanceRateLimited(Exception):
    pass


class AssistanceRefused(Exception):
    pass


class AssistanceProviderError(Exception):
    pass


class EvidenceReference(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    evidence_id: str = Field(min_length=1, max_length=36)
    note: str = Field(min_length=1, max_length=500)


class CriterionMapping(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    criterion_id: str = Field(min_length=1, max_length=36)
    evidence_ids: list[str] = Field(min_length=1, max_length=20)
    rationale: str = Field(min_length=1, max_length=1000)


class SuggestionOutput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    summary: str = Field(min_length=1, max_length=3000)
    mappings: list[CriterionMapping] = Field(max_length=30)
    gaps: list[Annotated[str, Field(min_length=1, max_length=1000)]] = Field(max_length=30)
    uncertainty: str = Field(min_length=1, max_length=1000)
    limitations: list[Annotated[str, Field(min_length=1, max_length=1000)]] = Field(
        min_length=1, max_length=20
    )
    evidence_references: list[EvidenceReference] = Field(max_length=20)


class AssistanceContext(BaseModel):
    """Only the chosen case/version/criteria/evidence are provided to an adapter."""

    case_id: str
    qualification_id: str
    qualification_code: str
    qualification_version: str
    qualification_title: str
    criteria: list[dict[str, str | bool]]
    evidence: list[dict[str, str]]


class ProviderResult(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    provider_id: str = Field(min_length=1, max_length=100)
    model_id: str | None = Field(default=None, max_length=160)
    template_version: str = Field(min_length=1, max_length=40)
    output: SuggestionOutput


class EvidenceAssistanceProvider(Protocol):
    async def generate(self, context: AssistanceContext) -> ProviderResult: ...


class ProviderRegistry:
    """Runtime registry. No adapter is configured in the current application."""

    def __init__(self, configured_provider: str = "none"):
        self.configured_provider = configured_provider
        self.provider: EvidenceAssistanceProvider | None = None

    @property
    def available(self) -> bool:
        return self.provider is not None

    @property
    def unavailable_reason(self) -> str:
        if self.configured_provider == "none":
            return "No AI assistance provider is configured. Continue the manual assessment."
        return (
            "The configured AI assistance provider is unsupported. Continue the manual assessment."
        )

    async def generate(self, context: AssistanceContext) -> ProviderResult:
        if self.provider is None:
            raise AssistanceUnavailable(self.unavailable_reason)
        return await self.provider.generate(context)


def validate_scope(
    output: SuggestionOutput,
    allowed_evidence_ids: Sequence[str],
    allowed_criterion_ids: Sequence[str],
) -> None:
    evidence_ids = set(allowed_evidence_ids)
    criterion_ids = set(allowed_criterion_ids)
    referenced_evidence: set[str] = set()
    for reference in output.evidence_references:
        if reference.evidence_id not in evidence_ids:
            raise ValueError("Provider output referenced evidence outside the requested case scope")
        referenced_evidence.add(reference.evidence_id)
    for mapping in output.mappings:
        if mapping.criterion_id not in criterion_ids:
            raise ValueError("Provider output referenced an unknown qualification criterion")
        if not set(mapping.evidence_ids).issubset(evidence_ids):
            raise ValueError("Provider output referenced evidence outside the requested case scope")
        if not set(mapping.evidence_ids).issubset(referenced_evidence):
            raise ValueError("Criterion mapping evidence must have a matching evidence reference")
