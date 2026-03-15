# PRD: Media Library for Cesteral Intelligence

**Status:** Ready for Implementation
**Target project:** `cesteral-intelligence`
**Extracted from:** `cesteral-mcp-servers/packages/media-mcp` (removed in this commit)
**Date:** 2026-03-10

---

## Why Move

media-mcp wraps Cesteral's own Supabase infrastructure, not a third-party ad platform API. Unlike the open-source MCP connector servers in this repository, the media library is a **product feature** scoped to Cesteral Intelligence users. It belongs in the proprietary hosted product, not the open-source connector layer.

---

## Overview

A Supabase Storage-backed media asset library that enables **upload-once-use-everywhere** workflows. AI agents upload creative assets (images, videos) from URLs, then reference stable public URLs when creating ad creatives across any platform.

### Core Value Proposition
1. **Centralized asset management** — one place for all creative assets across campaigns and platforms
2. **URL-proxy upload** — agent provides any public URL, server downloads and stores durably
3. **Cross-platform reuse** — Supabase public URLs work as input to any platform's upload tool (`meta_upload_image`, `tiktok_upload_video`, `linkedin_upload_image`, etc.)
4. **Tagging and organization** — metadata tags for categorization and retrieval

---

## Tools (6)

### 1. `media_upload_asset` (primary tool)

Downloads a file from a public URL server-side and uploads it to Supabase Storage. Returns a permanent public URL and full metadata.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `mediaUrl` | `string` (URL) | Yes | Publicly accessible URL of the file to upload |
| `advertiserId` | `string` | No | Organizes assets by advertiser account |
| `filename` | `string` | No | Override filename (otherwise derived from URL) |
| `tags` | `Record<string, string>` | No | Key-value metadata tags |
| `platform` | `string` | No | Target platform hint (meta, tiktok, linkedin, dv360) |

**Returns:** `assetId` (UUID), `storagePath`, `publicUrl`, `contentType`, `sizeBytes`, `uploadedAt`, `advertiserId`, `platform`, `assetType`, `filename`

### 2. `media_list_assets`

Lists assets with optional filters and offset-based pagination.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `advertiserId` | `string` | No | Filter by advertiser |
| `platform` | `string` | No | Filter by platform |
| `assetType` | `string` | No | Filter: image, video, audio, file |
| `limit` | `number` (1-100) | No | Default 50 |
| `cursor` | `number` | No | Offset for pagination |

### 3. `media_get_asset`

Get full metadata for a single asset by `storagePath`.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `storagePath` | `string` | Yes | Path from upload (e.g., `global/image/uuid.jpg`) |

### 4. `media_delete_asset`

Permanently deletes an asset and its tags sidecar.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `storagePath` | `string` | Yes | Storage path of the asset |

### 5. `media_tag_asset`

Add or update key-value metadata tags. Tags merge with existing ones via sidecar JSON.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `assetId` | `string` | Yes | UUID from upload |
| `storagePath` | `string` | Yes | Storage path |
| `tags` | `Record<string, string>` | Yes | Tags to add/merge |

### 6. `media_get_upload_url`

Generate a 1-hour signed upload URL for direct client-side binary upload (bypasses server download for large files).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `filename` | `string` | Yes | Filename |
| `contentType` | `string` | Yes | MIME type |
| `advertiserId` | `string` | No | Advertiser prefix |

**Important limitation:** Files uploaded via signed URL do NOT get library metadata and will not appear in `media_list_assets`. The server-side `media_upload_asset` is the recommended path.

---

## Architecture

### Storage Layout

```
cesteral-media/                          (bucket, configurable)
  {advertiserId|global}/
    image/{uuid}.jpg
    video/{uuid}.mp4
    audio/{uuid}.mp3
    file/{uuid}.ext
    .tags/{uuid}.json                    (sidecar tag files)
```

### Key Design Decisions

1. **Sidecar tag pattern**: Supabase Storage object metadata is immutable after upload. Post-upload tag updates are stored in JSON sidecar files at `{prefix}/.tags/{assetId}.json`, merged on read.

2. **Directory-aware listing**: Supabase `.list()` is not recursive. `listAssets()` iterates over `image/`, `video/`, `audio/`, `file/` subdirectories and merges results.

3. **URL-proxy upload**: Primary upload path downloads server-side using `downloadFileToBuffer` (120-second timeout for large videos), then uploads to Supabase with full metadata. This ensures all assets get proper library metadata.

4. **Rate limiting**: 100 requests/minute default via `RateLimiter` from shared.

### Service Layer

| Service | Responsibility |
|---|---|
| `SupabaseStorageClient` | Low-level Supabase storage wrapper (upload, list, delete, signed URLs, public URLs) |
| `MediaService` | Business logic (upload, list, get, tag, delete) with sidecar tag merging |

### Auth Pattern

| Mode | How It Works |
|---|---|
| `supabase-bearer` (default) | Bearer token from `Authorization` header → creates Supabase client → validates via `storage.listBuckets()` |
| `jwt` | Standard JWT validation, then uses configured service role key |
| `none` | No auth (dev only) |

**Stdio mode:** Reads `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from environment.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SUPABASE_URL` | (required) | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | (required) | Supabase service role key |
| `SUPABASE_BUCKET_NAME` | `cesteral-media` | Storage bucket name |
| `MEDIA_MCP_PORT` | `3008` | HTTP server port |
| `MEDIA_RATE_LIMIT_PER_MINUTE` | `100` | Rate limit |
| `MCP_AUTH_MODE` | `supabase-bearer` | Auth mode |

---

## Cross-Platform Integration

The media library integrates with platform servers **through the AI agent**, not via code. The workflow:

1. Agent calls `media_upload_asset` with a source URL → gets a stable `publicUrl`
2. Agent calls platform-specific upload tool with `publicUrl` as `mediaUrl`:
   - `meta_upload_image({ mediaUrl: publicUrl })` / `meta_upload_video({ mediaUrl: publicUrl })`
   - `tiktok_upload_image({ mediaUrl: publicUrl })` / `tiktok_upload_video({ mediaUrl: publicUrl })`
   - `linkedin_upload_image({ mediaUrl: publicUrl })`
3. Agent tags the asset in media library for organization

All platform upload tools use `downloadFileToBuffer` from `@cesteral/shared`, so the Supabase public URL works seamlessly.

---

## Dependencies

| Package | Purpose |
|---|---|
| `@supabase/supabase-js` ^2.49.4 | Core storage API |
| `@cesteral/shared` | Auth base classes, `downloadFileToBuffer`, `SessionServiceStore`, `registerToolsFromDefinitions`, telemetry, logging |
| `@modelcontextprotocol/sdk` | MCP server + transport |
| `@hono/mcp` + `hono` | Streamable HTTP transport |
| `zod` | Schema validation |
| `pino` | Structured logging |

---

## Known Gotchas

1. **Signed upload URL limitation**: Files uploaded via `media_get_upload_url` don't get library metadata — they won't appear in `media_list_assets`. Recommend warning users and documenting the limitation clearly.

2. **Listing performance**: Requires iterating 4 subdirectories per advertiser prefix. Consider caching or a metadata index if asset counts grow large.

3. **Bucket must pre-exist**: `ensureBucketExists()` method exists but wasn't called during startup. The bucket must be created beforehand (or call this during initialization).

4. **No prompts or resources registered**: The original implementation had empty prompt and resource registries. Consider adding workflow prompts when re-implementing.

---

## Implementation Notes

The original source code is available in git history at commit `6d6d139` (last commit before removal) under `packages/media-mcp/`. Key files:

- `src/mcp-server/tools/definitions/` — 6 tool definitions
- `src/services/supabase/media-service.ts` — business logic
- `src/services/supabase/supabase-storage-client.ts` — storage wrapper
- `src/services/session-services.ts` — per-session service container
- `src/auth/` — Supabase bearer auth strategy
- `src/config/` — environment configuration

To retrieve: `git show 6d6d139:packages/media-mcp/`
