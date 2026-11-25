# Skills over MCP: prototype and decision

**Status:** Prototype on a branch, off by default. Nothing deployed and no server's default changed.

## What was built

The Skills over MCP extension (SEP-2640, `io.modelcontextprotocol/skills`) went into public beta in Claude and Claude Code on 2026-11-24. This prototype publishes one skill from the fleet with it.

- **`createPlatformMcpServer({ skills })`** in `@cesteral/shared` takes `{ folder }` (a folder of skill folders, loaded with the SDK's `loadSkills`) or `{ files }` (the same layout in memory, loaded with `SkillsExtension.load(memorySkillFiles(...))`). It attaches the catalog with the SDK 2.4.0 `attach(server)`, which is marked experimental. `attach` registers the `skill://{+path}` template and the `skills/list`, `skills/get` and `resources/directory/read` handlers. It also declares the extension in the capabilities, so the extension shows up in both `initialize` and `server/discover`. The Skills module is imported only when a server asks for skills, and the catalog is built once per source, because the stateless 2026-07-28 path builds a server for every request.
- **Registration order:** skills are registered last, after prompts. A server that turns them on keeps every existing entry where it was. The skill template is added at the end of `resources/templates/list`, and each `SKILL.md` is added at the end of `resources/list`. The test pins both.
- **`skill://cross-platform-campaign-setup/SKILL.md`** is built in `cross-platform-skills.ts` by the same `getCrossPlatformCampaignSetupMessage()` that renders the `cross_platform_campaign_setup` prompt. The three prompt arguments are left as `{placeholders}`, with a one-line preamble telling the model to fill them in. Changing the prompt changes the skill, and a test checks that the skill body is the prompt text.
- **meta-mcp** attaches it when `MCP_SKILLS_ENABLED=true`. The default is `false`.

## Side effects checked

| Check                                                                                                | Result                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tool-definition-hashes`                                                                             | No change. No tool definition changed, and the snapshot test passes.                                                                                                                                                            |
| Cache hints                                                                                          | `skills/list`, `skills/get`, skill `resources/read` and directory reads use `STATIC_CATALOG_CACHE_HINT` (public, 1h). The SDK default would be `0`/`private`. 2025-era clients get no cache fields, as with every other result. |
| `resources/list` hint                                                                                | Stays `public` on meta-mcp, which has no `report-csv://`. On a server with `report-csv://`, the listing is already `private`.                                                                                                   |
| Server card                                                                                          | No change. The card's `capabilities` block is static (`tools`/`prompts`/`resources`/`elicitation`) and never lists extensions, even with skills on. If skills ship, the card should declare the extension. That is a follow-up. |
| `prompt-tool-references`                                                                             | Now also checks every file in `CROSS_PLATFORM_SKILL_FILES` against the fleet's tool and prompt names. The fleet snapshot boots servers with the flag off, so the skill would otherwise go unchecked.                            |
| `cross-platform-prompts`, `workflow-id-maps`, `server-info`, `tools-list-determinism`, `cache-hints` | All pass.                                                                                                                                                                                                                       |
| Untrusted content (#204)                                                                             | Not affected. Skill text is written by the server, not taken from the platform.                                                                                                                                                 |

The test is `packages/shared/tests/utils/skills-extension.test.ts`. It drives a factory-built server through the SDK's `createMcpHandler` (2026-07-28) and covers `skills/list`, `skills/get`, `resources/read`, `resources/directory/read`, the `-32602` error for an unknown skill, `server/discover` with skills on and off, list order, and loading from a folder on disk.

## Decision: keep both, don't migrate

**Recommendation: keep the prompts as they are and add skills next to them, generated from the same source. Don't migrate prompts to skills.**

- A prompt is picked by the user. A skill can be pulled in by the model in the middle of a task. They serve different moments, and one shared source means having both costs nothing in drift.
- Client reach is uneven. Skills over MCP is on by default for Pro, Max and Ultra. On Team, an admin has to turn it on. **Enterprise support has not shipped yet**, and agency and enterprise accounts are the users this fleet is most likely to serve. Other hosts still list it as partial or not at all. Removing prompts now would cut off the users we most need to reach.
- The SDK wiring (`attach`) is experimental and may change in a minor release. One small shared entry point keeps that risk in a single place.
- A skill takes no arguments. Prompts whose text branches on their arguments lose that branching as a skill. An example is `cross_platform_performance_comparison`, which maps a date-range preset into each platform's own preset names.

### Next prompts worth turning into skills

The best fits are guidance a model should reach for on its own, with little or no argument branching:

1. **`*_troubleshoot_entity` / `troubleshoot_underdelivery` / `troubleshoot_report`.** Diagnosis is exactly where the model notices a problem by itself and needs a playbook. This is the strongest case.
2. **Per-platform `*_campaign_setup_workflow`** (and DV360's `full_campaign_setup_workflow`). The cross-platform skill already refers to them. As skills, they would let the model move into the platform's steps without asking the user to pick a prompt.
3. **`*_bulk_operations_workflow` and `*_entity_update_workflow`.** These carry write-safety rules (dry run first, pause before edit) that the model should load before it writes, not only when asked.
4. **Money units.** A small standalone skill built from the Step 5 table, since every write needs it.

Weaker fits: `tool_schema_exploration`, which duplicates what the resources and `*_search_tools` already give, and `cross_platform_performance_comparison`, which depends on its arguments (see above).

### Before this leaves prototype

- Decide on the frontmatter `description`. It drives automatic activation, and today it is the prompt description plus one sentence.
- Declare the extension in the server card.
- Choose between one fleet-wide flag in `BaseConfigSchema` and per-server opt-in.
- Run a live check in Claude Code (beta) that the skill is found and activated.
