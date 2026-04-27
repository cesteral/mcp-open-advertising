# Custom Bidding Algorithms — Implementation Status

## Status: Complete

All custom bidding algorithm support for dv360-mcp is fully implemented and working in production.

---

## Implemented Tools (4)

| Tool                                    | Description                                           | Actions                                       |
| --------------------------------------- | ----------------------------------------------------- | --------------------------------------------- |
| `dv360_create_custom_bidding_algorithm` | Create a new custom bidding algorithm                 | Creates SCRIPT_BASED or RULE_BASED algorithms |
| `dv360_manage_custom_bidding_script`    | Upload and manage scripts for SCRIPT_BASED algorithms | `upload`, `list`, `get`, `getActive`          |
| `dv360_manage_custom_bidding_rules`     | Upload and manage rules for RULE_BASED algorithms     | `upload`, `list`, `get`, `getActive`          |
| `dv360_list_custom_bidding_algorithms`  | List algorithms with filtering                        | Filter by partner/advertiser, status, etc.    |

---

## DV360Service Methods (8)

All methods are implemented in `src/services/dv360/DV360-service.ts`:

**Script methods:**

- `uploadCustomBiddingScript` — Upload script file content
- `createCustomBiddingScript` — Create script resource from upload reference
- `listCustomBiddingScripts` — List scripts for an algorithm
- `getCustomBiddingScript` — Get a specific script by ID

**Rules methods:**

- `uploadCustomBiddingRules` — Upload rules file content
- `createCustomBiddingRules` — Create rules resource from upload reference
- `listCustomBiddingRules` — List rules for an algorithm
- `getCustomBiddingRules` — Get a specific rules resource by ID

---

## API Endpoints Reference

| Operation        | Method | Path                                                                |
| ---------------- | ------ | ------------------------------------------------------------------- |
| List algorithms  | GET    | `/v4/customBiddingAlgorithms`                                       |
| Get algorithm    | GET    | `/v4/customBiddingAlgorithms/{id}`                                  |
| Create algorithm | POST   | `/v4/customBiddingAlgorithms`                                       |
| Patch algorithm  | PATCH  | `/v4/customBiddingAlgorithms/{id}`                                  |
| Upload script    | POST   | `/upload/displayvideo/v4/customBiddingAlgorithms/{id}:uploadScript` |
| Create script    | POST   | `/v4/customBiddingAlgorithms/{id}/scripts`                          |
| List scripts     | GET    | `/v4/customBiddingAlgorithms/{id}/scripts`                          |
| Get script       | GET    | `/v4/customBiddingAlgorithms/{id}/scripts/{scriptId}`               |
| Upload rules     | POST   | `/upload/displayvideo/v4/customBiddingAlgorithms/{id}:uploadRules`  |
| Create rules     | POST   | `/v4/customBiddingAlgorithms/{id}/rules`                            |
| List rules       | GET    | `/v4/customBiddingAlgorithms/{id}/rules`                            |
| Get rules        | GET    | `/v4/customBiddingAlgorithms/{id}/rules/{rulesId}`                  |

---

## Key Reference

### Script States

- `PENDING` — Processing by backend
- `ACCEPTED` — Ready for scoring impressions
- `REJECTED` — Has errors (check `errors[]` field)

### Algorithm Types

- `SCRIPT_BASED` — Custom JavaScript-like bidding logic
- `RULE_BASED` — Declarative rules (allowlisted customers only)

### Ownership

- Either `advertiserId` OR `partnerId` (mutually exclusive)
- `sharedAdvertiserIds[]` allows sharing across advertisers

### Immutable Fields

- `customBiddingAlgorithmType` — Cannot change after creation
- `partnerId`/`advertiserId` — Cannot transfer ownership

---

## Future Enhancements

These features are not currently implemented and may be considered for future iterations:

- **Model management** — Track and manage custom bidding models across algorithm versions
- **Rollback support** — Revert to a previous script/rules version if a new upload is rejected
- **Dry-run validation** — Client-side validation of script/rules content before uploading to DV360
- **MCP Resources for custom bidding** — Dedicated resources (e.g., `custom-bidding://script-format`) for script format documentation and examples
