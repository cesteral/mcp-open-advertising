# Creative asset resolution

A governed creative push names its media instead of linking it (cesteral/mcp-open-advertising#363,
governance-layer #2161). The upload tools take `asset` **or** `mediaUrl`, exactly one:

```json
{
  "asset": {
    "source": "cesteral_media_library",
    "assetId": "<uuid>",
    "filename": "a.png",
    "contentType": "image/png",
    "sizeBytes": 183245
  }
}
```

Tools: `meta_upload_image`, `meta_upload_video`, `gads_upload_image`, `dv360_upload_image`,
`dv360_upload_video`. `gads_upload_video` creates a YouTube-reference asset and uploads no bytes, so it
takes no `asset`.

## Rules

- `asset` stays in the executable args (`executableArgsExclude` is `["dry_run"]` only), so the decision
  token's `actionHash` binds the exact asset.
- A `dry_run` checks the reference's `contentType` and `sizeBytes` against the platform's limits and
  makes **no** network call. A real execute resolves the asset first.
- `resolveCreativeAsset` (`@cesteral/shared`, `utils/http/creative-asset.ts`) does the resolution:
  `POST {CESTERAL_CONTROL_PLANE_URL}/api/connector/media-assets/{assetId}` with `X-Cesteral-Decision-Token`
  (the token received on this `tools/call`) and `{ executableArgs }` (the raw wire args canonicalized with
  the tool's exclude list, as the verifier did). `303` carries a 5-minute storage URL, fetched at once
  with no credential header; any other status is a refusal `{ reasonCode }` and nothing is uploaded.
- The fetched bytes must match the reference (`contentType` equal, byte length equal `sizeBytes`).
- The storage URL is never stored, logged, returned or put in an error.
- No decision token on the call, or no `CESTERAL_CONTROL_PLANE_URL`, is a refusal. The origin must be
  https (plain http only for a loopback host) and is operator configuration, never a tool argument,
  because the token is sent to it.
- The control plane needs `GOVERNANCE_DECISION_TOKEN_SECRET` too; until it is set the resolver answers
  `503 SECRET_UNCONFIGURED` and no asset can be fetched.

Changing a tool's input schema moves its governed `definitionHash`; the governance layer must admit the
new hash (see [release-attestation.md](release-attestation.md)).

## Attaching the upload (governance-layer #2161)

An upload only puts the media in the ad account's library. The attach tools put it on an ad entity, as
their own governed write:

| Tool                    | Parent       | What one call does                                                                                                |
| ----------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------- |
| `meta_attach_creative`  | `adSetId`    | `POST /act_{id}/ads`: one PAUSED ad, creative inline (`imageHash` or `videoId` + thumbnail)                       |
| `gads_attach_creative`  | `adGroupId`  | `adGroupAds:mutate`: one PAUSED image ad naming the asset's resource name                                         |
| `dv360_attach_creative` | `lineItemId` | reads the line item, creates a PAUSED hosted creative from the media id, adds it to the line item's `creativeIds` |

- They are effect-class writes (`<slug>.attach_creative.v1`, operation `create`, `entityKinds: []`,
  `entityIdArgs` = the parent), not a canonical creative entity kind (owner ruling 2026-11-17). Their
  `effect` is `creative_attached` with the parent, the asset handle and the created id.
- `dry_run` is symbolic and sends nothing (`EffectDryRunResult` admits no native source), although Meta
  (`execution_options: ["validate_only"]`) and Google Ads (`validateOnly`) have native validation.
- What they create is paused (on DV360 the creative; the line item's own status is untouched), so an
  attach never starts delivery by itself.
- DV360's attach is two upstream writes. If the line-item update fails after the creative was created,
  the error carries the `creativeId`; retry with `existingCreativeId` so no second creative is made.
