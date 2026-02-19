# DV360 Entity Patterns

Common patterns for DV360 entity management.

## Entity creation order matters
- **Date**: 2026-02-19
- **Source**: Workflow design
- **Context**: DV360 entities must be created in hierarchy order: Campaign -> Insertion Order -> Line Item -> Targeting. Each child requires its parent's ID.
- **Recommendation**: Follow the `full_campaign_setup_workflow` prompt for step-by-step guidance. Verify each parent entity exists before creating children.
- **Applies to**: dv360-mcp, `dv360_create_entity`

## Insertion Orders should be created as DRAFT
- **Date**: 2026-02-19
- **Source**: API behavior
- **Context**: IOs can and should be created as ENTITY_STATUS_DRAFT so line items and targeting can be configured before activation. This is different from campaigns which cannot be DRAFT.
- **Recommendation**: Create IOs as DRAFT, configure all child entities, then update status to ACTIVE.
- **Applies to**: dv360-mcp, `dv360_create_entity`
