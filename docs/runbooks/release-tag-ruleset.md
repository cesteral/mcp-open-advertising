# Release tag ruleset (#299 item d)

Release publishing (`.github/workflows/release.yml`) starts when a tag matching `v*.*.*` or `contract-v*.*.*` is pushed, so tag creation is the gate on every published package. As of 2026-11-18 `gh api repos/cesteral/mcp-open-advertising/rulesets` returns `[]`: nothing beyond repository write access limits who can create, move or delete those tags.

This is a repository admin setting. It is not applied by any code in this repo; an admin runs it once.

## Apply

Run as an account with admin rights on the repository. `bypass_actors` below lets only the repository **Admin** role (`actor_id` 5; Maintain and Write roles do not bypass) create, move and delete release tags. Keep it: with `creation` restricted and no bypass actor, nobody can create matching tags, so no release can start. To change who may release, replace it with an explicitly authorized actor rather than removing it. If published tags should be immutable even for release operators, add a separate ruleset restricting only `update` and `deletion` with no bypass.

```bash
gh api -X POST repos/cesteral/mcp-open-advertising/rulesets --input - <<'JSON'
{
  "name": "release-tags",
  "target": "tag",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["refs/tags/v*", "refs/tags/contract-v*"],
      "exclude": []
    }
  },
  "rules": [
    { "type": "creation" },
    { "type": "update" },
    { "type": "deletion" },
    { "type": "non_fast_forward" }
  ],
  "bypass_actors": [
    { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" }
  ]
}
JSON
```

With `creation`, `update` and `deletion` restricted, only a bypass actor can create, move or delete a matching tag.

## Verify

Capture the ID, then read the full ruleset as an admin and check `conditions`, `rules` and `bypass_actors`, not only the summary:

```bash
id=$(gh api repos/cesteral/mcp-open-advertising/rulesets --jq '.[] | select(.name=="release-tags") | .id')
gh api repos/cesteral/mcp-open-advertising/rulesets/$id --jq '{target, enforcement, include: .conditions.ref_name.include, rules: [.rules[].type], bypass_actors}'
```

Expect `target: tag`, `enforcement: active`, include `refs/tags/v*` and `refs/tags/contract-v*`, rules `creation update deletion non_fast_forward`, and the single Admin bypass actor.

## Optional: protected Environment for publishing

Run the publishing jobs in a GitHub Environment with required reviewers so a tag push waits for approval. This changes `release.yml` (`environment:` on the publish jobs); npm provenance records the workflow path and tag ref, not the environment, so the published identity is unchanged. Not enabled yet: it needs the Environment created in repository settings first.

## Constraint

Keep publishing in `.github/workflows/release.yml` with tags of the shape `vX.Y.Z` and `contract-vX.Y.Z`; downstream consumers verify both from the npm provenance.

## Next release (#299 item e)

Cut the next release only after the ruleset is applied and verified, so the published provenance comes from the hardened workflow and a protected tag. Tag the `main` commit that carries the workflow hardening and this runbook, and record that commit SHA in the release notes. The release regenerates every governed tool's `definitionHash` manifest (see [release-attestation.md](../architecture/release-attestation.md)); tell the downstream governance repo which tag and commit to admit before the tag is pushed.
