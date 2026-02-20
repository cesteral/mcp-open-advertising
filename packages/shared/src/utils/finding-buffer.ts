import type { FindingBuffer, PersistedFinding } from "./finding-types.js";

export function createFindingBuffer(maxSize = 500): FindingBuffer {
  if (!Number.isInteger(maxSize) || maxSize <= 0) {
    throw new Error("maxSize must be a positive integer");
  }

  const ring = new Array<PersistedFinding | undefined>(maxSize);
  let head = 0; // points at oldest entry
  let count = 0;

  const getAll = (): PersistedFinding[] => {
    const items: PersistedFinding[] = [];
    for (let i = 0; i < count; i++) {
      const idx = (head + i) % maxSize;
      const item = ring[idx];
      if (item) items.push(item);
    }
    return items;
  };

  return {
    push(finding: PersistedFinding): void {
      if (count < maxSize) {
        const idx = (head + count) % maxSize;
        ring[idx] = finding;
        count++;
        return;
      }

      ring[head] = finding;
      head = (head + 1) % maxSize;
    },

    getAll,

    getByWorkflow(workflowId: string): PersistedFinding[] {
      return getAll().filter((f) => f.workflowId === workflowId);
    },

    size(): number {
      return count;
    },

    clear(): PersistedFinding[] {
      const items = getAll();
      head = 0;
      count = 0;
      ring.fill(undefined);
      return items;
    },
  };
}

