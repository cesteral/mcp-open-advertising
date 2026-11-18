# Release tag ruleset (#299 item d)

Release publishing (`.github/workflows/release.yml`) starts when a tag matching `v*.*.*` or `contract-v*.*.*` is pushed, so tag creation is the gate on every published package. As of 2026-11-18 `gh api repos/cesteral/mcp-open-advertising/rulesets` returns `[]`: nothing beyond repository write access limits who can create, move or delete those tags.

This is a repository admin setting. It is not applied by any code in this repo; an admin runs it once.

## Apply

Run as an account with admin rights on the repository. `bypass_actors` below lets the repository admin role (`actor_id` 5) bypass the rule so maintainers can still cut releases; drop it to make the rule apply to admins too.

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

```bash
gh api repos/cesteral/mcp-open-advertising/rulesets --jq '.[] | {name, target, enforcement}'
```

## Optional: protected Environment for publishing

Run the publishing jobs in a GitHub Environment with required reviewers so a tag push waits for approval. This changes `release.yml` (`environment:` on the publish jobs); npm provenance records the workflow path and tag ref, not the environment, so the published identity is unchanged. Not enabled yet: it needs the Environment created in repository settings first.

## Constraint

Keep publishing in `.github/workflows/release.yml` with tags of the shape `vX.Y.Z` and `contract-vX.Y.Z`; downstream consumers verify both from the npm provenance.
