import type { FindingBuffer, FindingStore, StaticResourceDefinition } from "@cesteral/shared";

interface FindingResourceDeps {
  findingStore: FindingStore;
  getFindingBuffer: () => FindingBuffer | undefined;
}

export function createFindingResources(deps: FindingResourceDeps): StaticResourceDefinition[] {
  return [
    {
      uri: "findings://session/current",
      name: "Current Session Findings",
      description: "Evaluator findings buffered during the active session.",
      mimeType: "application/json",
      getContent: () => {
        const buffer = deps.getFindingBuffer();
        const findings = buffer?.getAll() ?? [];
        return JSON.stringify(
          {
            findings,
            count: findings.length,
          },
          null,
          2
        );
      },
    },
    {
      uri: "findings://patterns/all",
      name: "Detected Finding Patterns",
      description: "Recurring evaluator issue patterns across persisted sessions.",
      mimeType: "application/json",
      getContent: async () => JSON.stringify(await deps.findingStore.getPatterns({}), null, 2),
    },
    {
      uri: "findings://summary",
      name: "Findings Summary",
      description: "Aggregate finding counts by issue class/workflow with top patterns.",
      mimeType: "application/json",
      getContent: async () => JSON.stringify(await deps.findingStore.getSummary(), null, 2),
    },
  ];
}

