# Tool annotation rules (MCP hints)

Every tool declares `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint`. They follow one rule set, from what the tool does, and a ratchet enforces it from the fleet snapshot: [`scripts/lib/tool-hints.test.mjs`](../../scripts/lib/tool-hints.test.mjs). The rules live in [`scripts/lib/tool-hint-rules.mjs`](../../scripts/lib/tool-hint-rules.mjs); change them there, and this page's table is the record of the change that introduced them (#235, #248).

## Why a rule set

The 2026-09 fleet review ([`_cross-fleet.md`](../reviews/2026-09-fleet-review/_cross-fleet.md) #11, #12) found identical operations carrying different hints per server: `update_entity` destructive on six servers and not on five, `msads_create_entity` all-false, `openWorldHint` set per server by hand. Its proposed canon was not copied. It wanted every tool `openWorldHint: true` and `create`, `duplicate` and `upload` destructive=false, the opposite of what ten governed servers shipped. The rules below follow the MCP definitions literally and were checked against what each tool does; they agree with the review on `create`/`duplicate`/`upload` (additive, so not destructive) and on `update` (overwrites, so destructive).

## The rules

| Hint              | Rule                                                                                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readOnlyHint`    | `true` for a tool that changes nothing on the platform. A report job started to be read back (`*_get_report`, `*_download_report`) is a read. `submit_report` is not: it leaves a job and, on some platforms, a stored report behind. |
| `destructiveHint` | Read-only: `false`. A write that **can delete or overwrite**: `true`. A write that **only adds** something new: `false`.                                                                                                              |
| `idempotentHint`  | Read-only: `true`. A write that sets state to the values it is given (absolute values), or removes something: `true`. A write whose retry **adds another** (a second entity, asset, report job, schedule): `false`.                   |
| `openWorldHint`   | `true` for every tool that calls the ad platform. `false` only for a tool that never leaves the process (listed below).                                                                                                               |

A write is classified by its name suffix into one of four classes:

| Class     | destructive | idempotent | What it means                                                                                     | Tools (name without the server prefix)                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------- | ----------- | ---------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| additive  | F           | F          | adds something new; a retry adds another                                                          | `create_entity`, `bulk_create_entities`, `duplicate_entity`, `upload_image`, `upload_video`, `attach_creative`, `submit_report`, `create_report_schedule`, `create_template_schedule`, `create_report_template`, `rerun_report_schedule`, `execute_entity_report`, `graphql_query_bulk`, `create_commitment`, `create_smart_plus_entity`, `create_assigned_targeting`, `create_custom_bidding_algorithm`, `insert_conversions`, `import_from_google`, `manage_budget_schedule` |
| overwrite | T           | T          | sets existing state to the given values; can overwrite, including a status that is a one-way door | `update_entity`, `bulk_update_entities`, `bulk_update_status`, `bulk_manage_bid_lists`, `adjust_bids`, `adjust_line_item_bids`, `update_commitment`, `update_smart_plus_entity`, `update_report_template`, `update_report_schedule`, `update_conversions`                                                                                                                                                                                                                      |
| remove    | T           | T          | removes, archives or cancels; a repeat finds nothing left to do                                   | `delete_entity`, `remove_entity`, `delete_report_schedule`, `delete_assigned_targeting`, `archive_entities`, `update_smart_plus_status`, `cancel_report_execution`, `graphql_cancel_bulk_job`                                                                                                                                                                                                                                                                                  |
| multi     | T           | F          | one tool with several actions: it can create and also overwrite or delete                         | `manage_bid_list`, `manage_seed`, `manage_custom_bidding_script`, `manage_custom_bidding_rules`, `manage_ad_extensions`, `manage_criterions`, `bulk_mutate`, `graphql_query`, `graphql_mutation_bulk`                                                                                                                                                                                                                                                                          |

`openWorldHint: false` (never leaves the process): suffixes `get_pacing_status`, `validate_entity`, `validate_conversion`, `search_tools`, and the tools `msads_search_targeting`, `msads_get_targeting_options`, `meta_get_available_metrics`, `sa360_get_change_history`, `msads_create_report_schedule`, `msads_delete_report_schedule`. The last two msads tools are unsupported stubs that always fail without a platform call.

A new write tool must be added to `WRITE_SUFFIX_CLASS`: the ratchet fails naming it. A new read tool needs only `readOnlyHint: true`.

## Judgement calls

- **Upload idempotency.** `upload_image` and `upload_video` are `idempotent: false` on every server. Meta de-duplicates identical image bytes by hash, so a retry there is harmless in effect, but no other platform promises that, and one rule per operation was the point.
- **`update_*` is destructive.** An update overwrites the previous value, and a status update can be a one-way door (Google Ads `REMOVED`, TikTok `DELETE`, TTD `Archived`). `destructiveHint` means "may delete or overwrite", so it is `true` on all of them, including the five servers that shipped `false`.
- **`adjust_bids` is idempotent.** Every variant takes absolute bid values, so a retry leaves the same state. Percentage adjustments, if ever added, would make it `false`.
- **`msads_{create,delete}_report_schedule`** are stubs. They keep their suffix class (a real implementation would be additive and remove) and are `openWorld: false` because they make no call today.
- **`ttd_bulk_manage_bid_lists`** (batch get or batch update) is classed `overwrite`: its writes set values.

## Effect on the destructive-op confirmation prompt (#244, #396)

None. The prompt is requested by each handler (`elicitArchiveConfirmation`, `elicitDeleteConfirmation`, `elicitBulkStatusChangeConfirmation`, `elicitBidChangeConfirmation`, ...) and nothing in `createPlatformMcpServer`, the tool-handler factory or the confirmation rounds reads an annotation. No operation gains or loses a prompt from this change. Since then `destructiveHint` is tied to the prompts the other way: every tool that carries it must confirm an irreversible path as irreversible or be exempt with a reason (`scripts/lib/irreversible-confirmation.test.mjs`, [confirmation-mrtr.md](confirmation-mrtr.md#the-ratchet)). What does change is what a client that gates on `destructiveHint` itself sees: it now flags `update`, `bulk_update`, `bulk_update_status`, `adjust_bids` and the `manage_*` tools everywhere, and no longer flags `create`, `bulk_create`, `duplicate` or `upload`.

## Movement

324 tools, 214 with at least one hint changed. Hints moved: destructive 54, idempotent 33, openWorld 195. `readOnlyHint` moved on 0.

## Audit table

Hint columns are `readOnly destructive idempotent openWorld` (T/F). Governed tools carry an `annotations.cesteral` block.

### amazon-dsp-mcp

| Tool                                         | Class     | Before | After | Moved                  |
| -------------------------------------------- | --------- | ------ | ----- | ---------------------- |
| `amazon_dsp_list_entities`                   | read      | TFTF   | TFTT  | openWorld              |
| `amazon_dsp_get_entity` (governed)           | read      | TFTF   | TFTT  | openWorld              |
| `amazon_dsp_get_pacing_status`               | read      | TFTF   | TFTF  | -                      |
| `amazon_dsp_create_entity` (governed)        | additive  | FTFF   | FFFT  | destructive, openWorld |
| `amazon_dsp_update_entity` (governed)        | overwrite | FFTF   | FTTT  | destructive, openWorld |
| `amazon_dsp_delete_entity` (governed)        | remove    | FTFF   | FTTT  | idempotent, openWorld  |
| `amazon_dsp_list_advertisers`                | read      | TFTF   | TFTT  | openWorld              |
| `amazon_dsp_get_report`                      | read      | TFFF   | TFTT  | idempotent, openWorld  |
| `amazon_dsp_get_report_breakdowns`           | read      | TFFF   | TFTT  | idempotent, openWorld  |
| `amazon_dsp_submit_report` (governed)        | additive  | FFFF   | FFFT  | openWorld              |
| `amazon_dsp_check_report_status`             | read      | TFTF   | TFTT  | openWorld              |
| `amazon_dsp_download_report`                 | read      | TFTT   | TFTT  | -                      |
| `amazon_dsp_bulk_update_status` (governed)   | overwrite | FFTF   | FTTT  | destructive, openWorld |
| `amazon_dsp_bulk_create_entities` (governed) | additive  | FTFF   | FFFT  | destructive, openWorld |
| `amazon_dsp_bulk_update_entities` (governed) | overwrite | FFTF   | FTTT  | destructive, openWorld |
| `amazon_dsp_adjust_bids` (governed)          | overwrite | FTTF   | FTTT  | openWorld              |
| `amazon_dsp_get_ad_preview`                  | read      | TFTF   | TFTT  | openWorld              |
| `amazon_dsp_duplicate_entity` (governed)     | additive  | FFFF   | FFFT  | openWorld              |
| `amazon_dsp_validate_entity`                 | read      | TFTF   | TFTF  | -                      |
| `amazon_dsp_upload_video` (governed)         | additive  | FTFT   | FFFT  | destructive            |
| `amazon_dsp_list_commitments`                | read      | TFTF   | TFTT  | openWorld              |
| `amazon_dsp_get_commitments`                 | read      | TFTF   | TFTT  | openWorld              |
| `amazon_dsp_get_commitment` (governed)       | read      | TFTF   | TFTT  | openWorld              |
| `amazon_dsp_create_commitment` (governed)    | additive  | FTFF   | FFFT  | destructive, openWorld |
| `amazon_dsp_update_commitment` (governed)    | overwrite | FFTF   | FTTT  | destructive, openWorld |
| `amazon_dsp_get_campaign_forecast`           | read      | TFTF   | TFTT  | openWorld              |
| `amazon_dsp_get_commitment_spend`            | read      | TFTF   | TFTT  | openWorld              |
| `amazon_dsp_search_tools`                    | read      | TFTF   | TFTF  | -                      |

### cm360-mcp

| Tool                                      | Class     | Before | After | Moved       |
| ----------------------------------------- | --------- | ------ | ----- | ----------- |
| `cm360_list_user_profiles`                | read      | TFTT   | TFTT  | -           |
| `cm360_list_entities`                     | read      | TFTT   | TFTT  | -           |
| `cm360_get_entity` (governed)             | read      | TFTT   | TFTT  | -           |
| `cm360_get_pacing_status`                 | read      | TFTF   | TFTF  | -           |
| `cm360_create_entity` (governed)          | additive  | FTFT   | FFFT  | destructive |
| `cm360_update_entity` (governed)          | overwrite | FTTT   | FTTT  | -           |
| `cm360_delete_entity` (governed)          | remove    | FTTT   | FTTT  | -           |
| `cm360_validate_entity`                   | read      | TFTF   | TFTF  | -           |
| `cm360_get_report`                        | read      | TFFT   | TFTT  | idempotent  |
| `cm360_get_report_breakdowns`             | read      | TFFT   | TFTT  | idempotent  |
| `cm360_submit_report` (governed)          | additive  | FFFT   | FFFT  | -           |
| `cm360_check_report_status`               | read      | TFTT   | TFTT  | -           |
| `cm360_download_report`                   | read      | TFTT   | TFTT  | -           |
| `cm360_create_report_schedule` (governed) | additive  | FFFT   | FFFT  | -           |
| `cm360_list_report_schedules`             | read      | TFTT   | TFTT  | -           |
| `cm360_delete_report_schedule` (governed) | remove    | FTTT   | FTTT  | -           |
| `cm360_bulk_update_status` (governed)     | overwrite | FTTT   | FTTT  | -           |
| `cm360_bulk_create_entities` (governed)   | additive  | FTFT   | FFFT  | destructive |
| `cm360_bulk_update_entities` (governed)   | overwrite | FTTT   | FTTT  | -           |
| `cm360_get_ad_preview`                    | read      | TFTT   | TFTT  | -           |
| `cm360_list_targeting_options`            | read      | TFTT   | TFTT  | -           |
| `cm360_search_tools`                      | read      | TFTF   | TFTF  | -           |

### dbm-mcp

| Tool                          | Class | Before | After | Moved     |
| ----------------------------- | ----- | ------ | ----- | --------- |
| `dbm_get_campaign_delivery`   | read  | TFTF   | TFTT  | openWorld |
| `dbm_get_performance_metrics` | read  | TFTF   | TFTT  | openWorld |
| `dbm_get_historical_metrics`  | read  | TFTF   | TFTT  | openWorld |
| `dbm_get_pacing_status`       | read  | TFTF   | TFTF  | -         |
| `dbm_run_custom_query`        | read  | TFTF   | TFTT  | openWorld |
| `dbm_search_tools`            | read  | TFTF   | TFTF  | -         |

### dv360-mcp

| Tool                                               | Class     | Before | After | Moved                  |
| -------------------------------------------------- | --------- | ------ | ----- | ---------------------- |
| `dv360_list_entities`                              | read      | TFTF   | TFTT  | openWorld              |
| `dv360_get_entity` (governed)                      | read      | TFTF   | TFTT  | openWorld              |
| `dv360_create_entity` (governed)                   | additive  | FTFF   | FFFT  | destructive, openWorld |
| `dv360_update_entity` (governed)                   | overwrite | FTTF   | FTTT  | openWorld              |
| `dv360_delete_entity` (governed)                   | remove    | FTFF   | FTTT  | idempotent, openWorld  |
| `dv360_adjust_line_item_bids` (governed)           | overwrite | FTFF   | FTTT  | idempotent, openWorld  |
| `dv360_bulk_update_status` (governed)              | overwrite | FTTF   | FTTT  | openWorld              |
| `dv360_bulk_create_entities` (governed)            | additive  | FTFT   | FFFT  | destructive            |
| `dv360_bulk_update_entities` (governed)            | overwrite | FTTT   | FTTT  | -                      |
| `dv360_create_custom_bidding_algorithm` (governed) | additive  | FTFF   | FFFT  | destructive, openWorld |
| `dv360_manage_custom_bidding_script` (governed)    | multi     | FTFF   | FTFT  | openWorld              |
| `dv360_manage_custom_bidding_rules` (governed)     | multi     | FTFF   | FTFT  | openWorld              |
| `dv360_list_custom_bidding_algorithms`             | read      | TFTF   | TFTT  | openWorld              |
| `dv360_list_assigned_targeting`                    | read      | TFTF   | TFTT  | openWorld              |
| `dv360_get_assigned_targeting`                     | read      | TFTF   | TFTT  | openWorld              |
| `dv360_create_assigned_targeting` (governed)       | additive  | FTFF   | FFFT  | destructive, openWorld |
| `dv360_delete_assigned_targeting` (governed)       | remove    | FTTF   | FTTT  | openWorld              |
| `dv360_validate_targeting_config`                  | read      | TFTF   | TFTT  | openWorld              |
| `dv360_validate_entity`                            | read      | TFTF   | TFTF  | -                      |
| `dv360_get_ad_preview`                             | read      | TFTF   | TFTT  | openWorld              |
| `dv360_upload_image` (governed)                    | additive  | FTFT   | FFFT  | destructive            |
| `dv360_upload_video` (governed)                    | additive  | FTFT   | FFFT  | destructive            |
| `dv360_attach_creative` (governed)                 | additive  | FFFT   | FFFT  | -                      |
| `dv360_duplicate_entity` (governed)                | additive  | FTFF   | FFFT  | destructive, openWorld |
| `dv360_get_delivery_estimate`                      | read      | TFTF   | TFTT  | openWorld              |
| `dv360_get_pacing_status`                          | read      | TFTF   | TFTF  | -                      |
| `dv360_search_tools`                               | read      | TFTF   | TFTF  | -                      |

### gads-mcp

| Tool                                   | Class     | Before | After | Moved                  |
| -------------------------------------- | --------- | ------ | ----- | ---------------------- |
| `gads_gaql_search`                     | read      | TFTT   | TFTT  | -                      |
| `gads_list_accounts`                   | read      | TFTF   | TFTT  | openWorld              |
| `gads_get_entity` (governed)           | read      | TFTF   | TFTT  | openWorld              |
| `gads_list_entities`                   | read      | TFTF   | TFTT  | openWorld              |
| `gads_get_insights`                    | read      | TFTT   | TFTT  | -                      |
| `gads_create_entity` (governed)        | additive  | FTFF   | FFFT  | destructive, openWorld |
| `gads_update_entity` (governed)        | overwrite | FTFF   | FTTT  | idempotent, openWorld  |
| `gads_remove_entity` (governed)        | remove    | FTFF   | FTTT  | idempotent, openWorld  |
| `gads_duplicate_entity` (governed)     | additive  | FFFF   | FFFT  | openWorld              |
| `gads_bulk_mutate` (governed)          | multi     | FTFF   | FTFT  | openWorld              |
| `gads_bulk_create_entities` (governed) | additive  | FTFF   | FFFT  | destructive, openWorld |
| `gads_bulk_update_status` (governed)   | overwrite | FTTF   | FTTT  | openWorld              |
| `gads_adjust_bids` (governed)          | overwrite | FTTF   | FTTT  | openWorld              |
| `gads_validate_entity`                 | read      | TFTF   | TFTF  | -                      |
| `gads_get_ad_preview`                  | read      | TFTF   | TFTT  | openWorld              |
| `gads_get_pacing_status`               | read      | TFTF   | TFTF  | -                      |
| `gads_upload_image` (governed)         | additive  | FTFT   | FFFT  | destructive            |
| `gads_upload_video` (governed)         | additive  | FTFT   | FFFT  | destructive            |
| `gads_attach_creative` (governed)      | additive  | FFFT   | FFFT  | -                      |
| `gads_search_tools`                    | read      | TFTF   | TFTF  | -                      |

### linkedin-mcp

| Tool                                       | Class     | Before | After | Moved                  |
| ------------------------------------------ | --------- | ------ | ----- | ---------------------- |
| `linkedin_list_entities`                   | read      | TFTF   | TFTT  | openWorld              |
| `linkedin_get_entity` (governed)           | read      | TFTF   | TFTT  | openWorld              |
| `linkedin_get_pacing_status`               | read      | TFTF   | TFTF  | -                      |
| `linkedin_create_entity` (governed)        | additive  | FTFF   | FFFT  | destructive, openWorld |
| `linkedin_update_entity` (governed)        | overwrite | FTFF   | FTTT  | idempotent, openWorld  |
| `linkedin_delete_entity` (governed)        | remove    | FTFF   | FTTT  | idempotent, openWorld  |
| `linkedin_list_ad_accounts`                | read      | TFTF   | TFTT  | openWorld              |
| `linkedin_get_analytics`                   | read      | TFTF   | TFTT  | openWorld              |
| `linkedin_get_analytics_breakdowns`        | read      | TFTF   | TFTT  | openWorld              |
| `linkedin_bulk_update_status` (governed)   | overwrite | FTTF   | FTTT  | openWorld              |
| `linkedin_bulk_create_entities` (governed) | additive  | FTFF   | FFFT  | destructive, openWorld |
| `linkedin_bulk_update_entities` (governed) | overwrite | FTTF   | FTTT  | openWorld              |
| `linkedin_adjust_bids` (governed)          | overwrite | FTTT   | FTTT  | -                      |
| `linkedin_search_targeting`                | read      | TFTT   | TFTT  | -                      |
| `linkedin_get_targeting_options`           | read      | TFTT   | TFTT  | -                      |
| `linkedin_duplicate_entity` (governed)     | additive  | FTFF   | FFFT  | destructive, openWorld |
| `linkedin_get_delivery_forecast`           | read      | TFTT   | TFTT  | -                      |
| `linkedin_get_audience_count`              | read      | TFTT   | TFTT  | -                      |
| `linkedin_get_ad_preview`                  | read      | TFTF   | TFTT  | openWorld              |
| `linkedin_upload_image` (governed)         | additive  | FTFT   | FFFT  | destructive            |
| `linkedin_upload_video` (governed)         | additive  | FTFT   | FFFT  | destructive            |
| `linkedin_validate_entity`                 | read      | TFTF   | TFTF  | -                      |
| `linkedin_search_tools`                    | read      | TFTF   | TFTF  | -                      |

### meta-mcp

| Tool                                     | Class     | Before | After | Moved                  |
| ---------------------------------------- | --------- | ------ | ----- | ---------------------- |
| `meta_list_entities`                     | read      | TFTF   | TFTT  | openWorld              |
| `meta_get_entity` (governed)             | read      | TFTF   | TFTT  | openWorld              |
| `meta_create_entity` (governed)          | additive  | FTFF   | FFFT  | destructive, openWorld |
| `meta_update_entity` (governed)          | overwrite | FTTF   | FTTT  | openWorld              |
| `meta_delete_entity` (governed)          | remove    | FTFF   | FTTT  | idempotent, openWorld  |
| `meta_list_ad_accounts`                  | read      | TFTF   | TFTT  | openWorld              |
| `meta_get_insights`                      | read      | TFTF   | TFTT  | openWorld              |
| `meta_get_insights_breakdowns`           | read      | TFTF   | TFTT  | openWorld              |
| `meta_get_available_metrics`             | read      | TFTF   | TFTF  | -                      |
| `meta_submit_report` (governed)          | additive  | FFFF   | FFFT  | openWorld              |
| `meta_check_report_status`               | read      | TFTF   | TFTT  | openWorld              |
| `meta_download_report`                   | read      | TFTF   | TFTT  | openWorld              |
| `meta_bulk_update_status` (governed)     | overwrite | FTTF   | FTTT  | openWorld              |
| `meta_bulk_create_entities` (governed)   | additive  | FTFF   | FFFT  | destructive, openWorld |
| `meta_bulk_update_entities` (governed)   | overwrite | FTFF   | FTTT  | idempotent, openWorld  |
| `meta_search_targeting`                  | read      | TFTF   | TFTT  | openWorld              |
| `meta_get_targeting_options`             | read      | TFTF   | TFTT  | openWorld              |
| `meta_duplicate_entity` (governed)       | additive  | FTFF   | FFFT  | destructive, openWorld |
| `meta_get_delivery_estimate`             | read      | TFTF   | TFTT  | openWorld              |
| `meta_get_ad_preview`                    | read      | TFTF   | TFTT  | openWorld              |
| `meta_adjust_bids` (governed)            | overwrite | FTTT   | FTTT  | -                      |
| `meta_upload_image` (governed)           | additive  | FFFT   | FFFT  | -                      |
| `meta_upload_video` (governed)           | additive  | FFFT   | FFFT  | -                      |
| `meta_attach_creative` (governed)        | additive  | FFFT   | FFFT  | -                      |
| `meta_manage_budget_schedule` (governed) | additive  | FFFT   | FFFT  | -                      |
| `meta_get_pacing_status`                 | read      | TFTF   | TFTF  | -                      |
| `meta_validate_entity`                   | read      | TFTF   | TFTF  | -                      |
| `meta_search_tools`                      | read      | TFTF   | TFTF  | -                      |

### msads-mcp

| Tool                                      | Class     | Before | After | Moved                  |
| ----------------------------------------- | --------- | ------ | ----- | ---------------------- |
| `msads_list_entities`                     | read      | TFTF   | TFTT  | openWorld              |
| `msads_get_entity` (governed)             | read      | TFTF   | TFTT  | openWorld              |
| `msads_get_pacing_status`                 | read      | TFTF   | TFTF  | -                      |
| `msads_create_entity` (governed)          | additive  | FFFF   | FFFT  | openWorld              |
| `msads_update_entity` (governed)          | overwrite | FFTF   | FTTT  | destructive, openWorld |
| `msads_delete_entity` (governed)          | remove    | FTFF   | FTTT  | idempotent, openWorld  |
| `msads_duplicate_entity` (governed)       | additive  | FFFF   | FFFT  | openWorld              |
| `msads_list_accounts`                     | read      | TFTF   | TFTT  | openWorld              |
| `msads_get_report`                        | read      | TFFF   | TFTT  | idempotent, openWorld  |
| `msads_get_report_breakdowns`             | read      | TFFF   | TFTT  | idempotent, openWorld  |
| `msads_submit_report` (governed)          | additive  | FFFF   | FFFT  | openWorld              |
| `msads_check_report_status`               | read      | TFTF   | TFTT  | openWorld              |
| `msads_download_report`                   | read      | TFTF   | TFTT  | openWorld              |
| `msads_bulk_create_entities` (governed)   | additive  | FFFF   | FFFT  | openWorld              |
| `msads_bulk_update_entities` (governed)   | overwrite | FFTF   | FTTT  | destructive, openWorld |
| `msads_bulk_update_status` (governed)     | overwrite | FTTF   | FTTT  | openWorld              |
| `msads_adjust_bids` (governed)            | overwrite | FFTF   | FTTT  | destructive, openWorld |
| `msads_manage_ad_extensions` (governed)   | multi     | FTFF   | FTFT  | openWorld              |
| `msads_manage_criterions` (governed)      | multi     | FTFF   | FTFT  | openWorld              |
| `msads_get_ad_details`                    | read      | TFTF   | TFTT  | openWorld              |
| `msads_validate_entity`                   | read      | TFTF   | TFTF  | -                      |
| `msads_import_from_google` (governed)     | additive  | FFFF   | FFFT  | openWorld              |
| `msads_search_targeting`                  | read      | TFTF   | TFTF  | -                      |
| `msads_get_targeting_options`             | read      | TFTF   | TFTF  | -                      |
| `msads_create_report_schedule` (governed) | additive  | FFFF   | FFFF  | -                      |
| `msads_list_report_schedules`             | read      | TFTF   | TFTT  | openWorld              |
| `msads_delete_report_schedule` (governed) | remove    | FTTF   | FTTF  | -                      |
| `msads_search_tools`                      | read      | TFTF   | TFTF  | -                      |

### pinterest-mcp

| Tool                                        | Class     | Before | After | Moved                  |
| ------------------------------------------- | --------- | ------ | ----- | ---------------------- |
| `pinterest_list_entities`                   | read      | TFTF   | TFTT  | openWorld              |
| `pinterest_get_entity` (governed)           | read      | TFTF   | TFTT  | openWorld              |
| `pinterest_get_pacing_status`               | read      | TFTF   | TFTF  | -                      |
| `pinterest_create_entity` (governed)        | additive  | FTFF   | FFFT  | destructive, openWorld |
| `pinterest_update_entity` (governed)        | overwrite | FFTF   | FTTT  | destructive, openWorld |
| `pinterest_delete_entity` (governed)        | remove    | FTFF   | FTTT  | idempotent, openWorld  |
| `pinterest_list_ad_accounts`                | read      | TFTF   | TFTT  | openWorld              |
| `pinterest_get_report`                      | read      | TFFF   | TFTT  | idempotent, openWorld  |
| `pinterest_get_report_breakdowns`           | read      | TFFF   | TFTT  | idempotent, openWorld  |
| `pinterest_submit_report` (governed)        | additive  | FFFF   | FFFT  | openWorld              |
| `pinterest_check_report_status`             | read      | TFTF   | TFTT  | openWorld              |
| `pinterest_download_report`                 | read      | TFTT   | TFTT  | -                      |
| `pinterest_bulk_update_status` (governed)   | overwrite | FTTF   | FTTT  | openWorld              |
| `pinterest_bulk_create_entities` (governed) | additive  | FTFF   | FFFT  | destructive, openWorld |
| `pinterest_bulk_update_entities` (governed) | overwrite | FFTF   | FTTT  | destructive, openWorld |
| `pinterest_adjust_bids` (governed)          | overwrite | FTTT   | FTTT  | -                      |
| `pinterest_search_targeting`                | read      | TFTF   | TFTT  | openWorld              |
| `pinterest_get_targeting_options`           | read      | TFTF   | TFTT  | openWorld              |
| `pinterest_duplicate_entity` (governed)     | additive  | FFFF   | FFFT  | openWorld              |
| `pinterest_get_delivery_estimate`           | read      | TFTF   | TFTT  | openWorld              |
| `pinterest_get_ad_preview`                  | read      | TFTF   | TFTT  | openWorld              |
| `pinterest_validate_entity`                 | read      | TFTF   | TFTF  | -                      |
| `pinterest_upload_video` (governed)         | additive  | FFFT   | FFFT  | -                      |
| `pinterest_search_tools`                    | read      | TFTF   | TFTF  | -                      |

### sa360-mcp

| Tool                                  | Class     | Before | After | Moved       |
| ------------------------------------- | --------- | ------ | ----- | ----------- |
| `sa360_gaql_search`                   | read      | TFTT   | TFTT  | -           |
| `sa360_list_accounts`                 | read      | TFTT   | TFTT  | -           |
| `sa360_get_entity`                    | read      | TFTT   | TFTT  | -           |
| `sa360_get_pacing_status`             | read      | TFTF   | TFTF  | -           |
| `sa360_list_entities`                 | read      | TFTT   | TFTT  | -           |
| `sa360_get_insights`                  | read      | TFTT   | TFTT  | -           |
| `sa360_get_insights_breakdowns`       | read      | TFTT   | TFTT  | -           |
| `sa360_list_custom_columns`           | read      | TFTT   | TFTT  | -           |
| `sa360_search_fields`                 | read      | TFTT   | TFTT  | -           |
| `sa360_list_report_columns`           | read      | TFTT   | TFTT  | -           |
| `sa360_submit_report` (governed)      | additive  | FFFT   | FFFT  | -           |
| `sa360_check_report_status`           | read      | TFTT   | TFTT  | -           |
| `sa360_download_report`               | read      | TFTT   | TFTT  | -           |
| `sa360_insert_conversions` (governed) | additive  | FFFT   | FFFT  | -           |
| `sa360_update_conversions` (governed) | overwrite | FFTT   | FTTT  | destructive |
| `sa360_validate_conversion`           | read      | TFTF   | TFTF  | -           |
| `sa360_get_change_history`            | read      | TFTT   | TFTF  | openWorld   |
| `sa360_search_tools`                  | read      | TFTF   | TFTF  | -           |

### snapchat-mcp

| Tool                                       | Class     | Before | After | Moved                  |
| ------------------------------------------ | --------- | ------ | ----- | ---------------------- |
| `snapchat_list_entities`                   | read      | TFTF   | TFTT  | openWorld              |
| `snapchat_get_entity` (governed)           | read      | TFTF   | TFTT  | openWorld              |
| `snapchat_get_pacing_status`               | read      | TFTF   | TFTF  | -                      |
| `snapchat_create_entity` (governed)        | additive  | FTFF   | FFFT  | destructive, openWorld |
| `snapchat_update_entity` (governed)        | overwrite | FFTF   | FTTT  | destructive, openWorld |
| `snapchat_delete_entity` (governed)        | remove    | FTFF   | FTTT  | idempotent, openWorld  |
| `snapchat_duplicate_entity` (governed)     | additive  | FFFF   | FFFT  | openWorld              |
| `snapchat_list_ad_accounts`                | read      | TFTF   | TFTT  | openWorld              |
| `snapchat_get_report`                      | read      | TFFF   | TFTT  | idempotent, openWorld  |
| `snapchat_get_report_breakdowns`           | read      | TFFF   | TFTT  | idempotent, openWorld  |
| `snapchat_submit_report` (governed)        | additive  | FFFF   | FFFT  | openWorld              |
| `snapchat_check_report_status`             | read      | TFTF   | TFTT  | openWorld              |
| `snapchat_download_report`                 | read      | TFTT   | TFTT  | -                      |
| `snapchat_bulk_update_status` (governed)   | overwrite | FTTF   | FTTT  | openWorld              |
| `snapchat_bulk_create_entities` (governed) | additive  | FTFF   | FFFT  | destructive, openWorld |
| `snapchat_bulk_update_entities` (governed) | overwrite | FFTF   | FTTT  | destructive, openWorld |
| `snapchat_adjust_bids` (governed)          | overwrite | FTTT   | FTTT  | -                      |
| `snapchat_search_targeting`                | read      | TFTF   | TFTT  | openWorld              |
| `snapchat_get_targeting_options`           | read      | TFTF   | TFTT  | openWorld              |
| `snapchat_get_audience_estimate`           | read      | TFTF   | TFTT  | openWorld              |
| `snapchat_get_ad_preview`                  | read      | TFTF   | TFTT  | openWorld              |
| `snapchat_validate_entity`                 | read      | TFTF   | TFTF  | -                      |
| `snapchat_upload_image` (governed)         | additive  | FFFT   | FFFT  | -                      |
| `snapchat_upload_video` (governed)         | additive  | FFFT   | FFFT  | -                      |
| `snapchat_search_tools`                    | read      | TFTF   | TFTF  | -                      |

### tiktok-mcp

| Tool                                         | Class     | Before | After | Moved                  |
| -------------------------------------------- | --------- | ------ | ----- | ---------------------- |
| `tiktok_list_entities`                       | read      | TFTF   | TFTT  | openWorld              |
| `tiktok_get_entity` (governed)               | read      | TFTF   | TFTT  | openWorld              |
| `tiktok_get_pacing_status`                   | read      | TFTF   | TFTF  | -                      |
| `tiktok_create_entity` (governed)            | additive  | FTFF   | FFFT  | destructive, openWorld |
| `tiktok_update_entity` (governed)            | overwrite | FFTF   | FTTT  | destructive, openWorld |
| `tiktok_delete_entity` (governed)            | remove    | FTFF   | FTTT  | idempotent, openWorld  |
| `tiktok_get_smart_plus_entity` (governed)    | read      | TFTF   | TFTT  | openWorld              |
| `tiktok_create_smart_plus_entity` (governed) | additive  | FTFF   | FFFT  | destructive, openWorld |
| `tiktok_update_smart_plus_entity` (governed) | overwrite | FFTF   | FTTT  | destructive, openWorld |
| `tiktok_update_smart_plus_status` (governed) | remove    | FTTF   | FTTT  | openWorld              |
| `tiktok_list_advertisers`                    | read      | TFTF   | TFTT  | openWorld              |
| `tiktok_get_report`                          | read      | TFFF   | TFTT  | idempotent, openWorld  |
| `tiktok_get_report_breakdowns`               | read      | TFFF   | TFTT  | idempotent, openWorld  |
| `tiktok_submit_report` (governed)            | additive  | FFFF   | FFFT  | openWorld              |
| `tiktok_check_report_status`                 | read      | TFTF   | TFTT  | openWorld              |
| `tiktok_download_report`                     | read      | TFTT   | TFTT  | -                      |
| `tiktok_bulk_update_status` (governed)       | overwrite | FTTF   | FTTT  | openWorld              |
| `tiktok_bulk_create_entities` (governed)     | additive  | FTFF   | FFFT  | destructive, openWorld |
| `tiktok_bulk_update_entities` (governed)     | overwrite | FFTF   | FTTT  | destructive, openWorld |
| `tiktok_adjust_bids` (governed)              | overwrite | FTTT   | FTTT  | -                      |
| `tiktok_search_targeting`                    | read      | TFTF   | TFTT  | openWorld              |
| `tiktok_get_targeting_options`               | read      | TFTF   | TFTT  | openWorld              |
| `tiktok_duplicate_entity` (governed)         | additive  | FFFF   | FFFT  | openWorld              |
| `tiktok_get_audience_estimate`               | read      | TFTF   | TFTT  | openWorld              |
| `tiktok_get_ad_preview`                      | read      | TFTF   | TFTT  | openWorld              |
| `tiktok_upload_image` (governed)             | additive  | FFFT   | FFFT  | -                      |
| `tiktok_upload_video` (governed)             | additive  | FFFT   | FFFT  | -                      |
| `tiktok_validate_entity`                     | read      | TFTF   | TFTF  | -                      |
| `tiktok_search_tools`                        | read      | TFTF   | TFTF  | -                      |

### ttd-mcp

| Tool                                      | Class     | Before | After | Moved                              |
| ----------------------------------------- | --------- | ------ | ----- | ---------------------------------- |
| `ttd_get_context`                         | read      | TFTF   | TFTT  | openWorld                          |
| `ttd_list_entities`                       | read      | TFTF   | TFTT  | openWorld                          |
| `ttd_get_entity` (governed)               | read      | TFTF   | TFTT  | openWorld                          |
| `ttd_get_pacing_status`                   | read      | TFTF   | TFTF  | -                                  |
| `ttd_create_entity` (governed)            | additive  | FTFF   | FFFT  | destructive, openWorld             |
| `ttd_update_entity` (governed)            | overwrite | FTFF   | FTTT  | idempotent, openWorld              |
| `ttd_delete_entity` (governed)            | remove    | FTFF   | FTTT  | idempotent, openWorld              |
| `ttd_duplicate_entity` (governed)         | additive  | FFFF   | FFFT  | openWorld                          |
| `ttd_get_report`                          | read      | TFFF   | TFTT  | idempotent, openWorld              |
| `ttd_download_report`                     | read      | TFTT   | TFTT  | -                                  |
| `ttd_submit_report` (governed)            | additive  | FFFF   | FFFT  | openWorld                          |
| `ttd_check_report_status`                 | read      | TFTF   | TFTT  | openWorld                          |
| `ttd_bulk_create_entities` (governed)     | additive  | FTFF   | FFFT  | destructive, openWorld             |
| `ttd_bulk_update_entities` (governed)     | overwrite | FTFF   | FTTT  | idempotent, openWorld              |
| `ttd_bulk_update_status` (governed)       | overwrite | FTTF   | FTTT  | openWorld                          |
| `ttd_archive_entities` (governed)         | remove    | FTTF   | FTTT  | openWorld                          |
| `ttd_adjust_bids` (governed)              | overwrite | FTFF   | FTTT  | idempotent, openWorld              |
| `ttd_manage_bid_list` (governed)          | multi     | FTFF   | FTFT  | openWorld                          |
| `ttd_bulk_manage_bid_lists` (governed)    | overwrite | FFFF   | FTTT  | destructive, idempotent, openWorld |
| `ttd_manage_seed` (governed)              | multi     | FFFT   | FTFT  | destructive                        |
| `ttd_graphql_query` (governed)            | multi     | FFFT   | FTFT  | destructive                        |
| `ttd_validate_entity`                     | read      | TFTF   | TFTF  | -                                  |
| `ttd_upload_video` (governed)             | additive  | FTFT   | FFFT  | destructive                        |
| `ttd_graphql_query_bulk` (governed)       | additive  | FFFT   | FFFT  | -                                  |
| `ttd_graphql_mutation_bulk` (governed)    | multi     | FTFT   | FTFT  | -                                  |
| `ttd_graphql_bulk_job`                    | read      | TFTF   | TFTT  | openWorld                          |
| `ttd_graphql_cancel_bulk_job` (governed)  | remove    | FTTF   | FTTT  | openWorld                          |
| `ttd_get_ad_preview`                      | read      | TFTF   | TFTT  | openWorld                          |
| `ttd_create_report_schedule` (governed)   | additive  | FFFF   | FFFT  | openWorld                          |
| `ttd_update_report_schedule` (governed)   | overwrite | FFTT   | FTTT  | destructive                        |
| `ttd_list_report_schedules`               | read      | TFTF   | TFTT  | openWorld                          |
| `ttd_get_report_schedule`                 | read      | TFTF   | TFTT  | openWorld                          |
| `ttd_delete_report_schedule` (governed)   | remove    | FTTF   | FTTT  | openWorld                          |
| `ttd_list_report_templates`               | read      | TFTF   | TFTT  | openWorld                          |
| `ttd_create_template_schedule` (governed) | additive  | FFFT   | FFFT  | -                                  |
| `ttd_cancel_report_execution` (governed)  | remove    | FTFT   | FTTT  | idempotent                         |
| `ttd_rerun_report_schedule` (governed)    | additive  | FFFT   | FFFT  | -                                  |
| `ttd_get_report_executions`               | read      | TFTT   | TFTT  | -                                  |
| `ttd_execute_entity_report` (governed)    | additive  | FFFT   | FFFT  | -                                  |
| `ttd_get_entity_report_types`             | read      | TFTT   | TFTT  | -                                  |
| `ttd_list_report_types`                   | read      | TFTT   | TFTT  | -                                  |
| `ttd_get_report_type_schema`              | read      | TFTT   | TFTT  | -                                  |
| `ttd_create_report_template` (governed)   | additive  | FFFT   | FFFT  | -                                  |
| `ttd_update_report_template` (governed)   | overwrite | FTFT   | FTTT  | idempotent                         |
| `ttd_get_report_template`                 | read      | TFTT   | TFTT  | -                                  |
| `ttd_search_tools`                        | read      | TFTF   | TFTF  | -                                  |
