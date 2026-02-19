<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->
<!-- Source: skills/canonical/learnings-reviewer/SKILL.md -->
<!-- Regenerate: pnpm generate:skills -->


# Learnings Reviewer

Workflow ID: `mcp.improve.learnings_review`

## Use When

- Periodic review of accumulated learnings for actionable improvements.
- After a batch of new learnings has been submitted.
- When interaction logs show recurring patterns worth codifying.

## Steps

1. Read resources:
   - `learnings://agent-behaviors` to understand known agent behavior patterns.
   - `learnings://workflows` to understand cross-platform workflow learnings.
   - `learnings://platforms/{platform}` for platform-specific insights.
2. Scan recent interaction logs (`data/interactions/`) for recurring failures or low scores.
3. Cross-reference logs against existing learnings to identify gaps.
4. For each actionable insight:
   a. If it is a **skill improvement** — propose updates to canonical SKILL.md files.
   b. If it is a **code fix** — propose changes to tool handlers or services.
   c. If it is a **new learning** — draft a new entry for the learnings tree via `submit_learning`.
5. Summarize all proposals with rationale and evidence.

## Required Output Sections

- `LogAnalysis`
- `LearningsGaps`
- `Proposals`
- `Evidence`

## Constraints

- Never auto-merge proposals — always present for human review.
- Cite specific log entries or learnings as evidence.
- Prefer updating existing learnings over creating new files.
