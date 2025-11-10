/**
 * @fileoverview Runtime capability detection for Node.js environment.
 * Campaign Guardian runs in Node.js on GCP Cloud Run/Functions.
 * @module src/utils/internal/runtime
 */

export interface RuntimeCapabilities {
  isNode: boolean;
  isWorkerLike: boolean; // Kept for compatibility, always false for Campaign Guardian
  isBrowserLike: boolean; // Kept for compatibility, always false for Campaign Guardian
  hasProcess: boolean;
  hasBuffer: boolean;
  hasTextEncoder: boolean;
  hasPerformanceNow: boolean;
}

// Best-effort static detection without throwing in restricted envs
const safeHas = (key: string): boolean => {
  try {
    // @ts-expect-error index access on globalThis
    return typeof globalThis[key] !== 'undefined';
  } catch {
    return false;
  }
};

/**
 * Safely checks if process.versions.node exists and is a string.
 * Uses try-catch to handle environments where property access might be restricted.
 */
const hasNodeVersion = (): boolean => {
  try {
    return (
      typeof process !== 'undefined' &&
      typeof process.versions === 'object' &&
      process.versions !== null &&
      typeof process.versions.node === 'string'
    );
  } catch {
    return false;
  }
};

/**
 * Safely checks if globalThis.performance.now is a function.
 * Uses try-catch to handle environments where property access might be restricted.
 */
const hasPerformanceNowFunction = (): boolean => {
  try {
    return (
      typeof globalThis.performance === 'object' &&
      globalThis.performance !== null &&
      typeof globalThis.performance.now === 'function'
    );
  } catch {
    return false;
  }
};

const isNode = hasNodeVersion();
const hasProcess = typeof process !== 'undefined';
const hasBuffer = typeof Buffer !== 'undefined';
const hasTextEncoder = safeHas('TextEncoder');
const hasPerformanceNow = hasPerformanceNowFunction();

/**
 * Safely checks if WorkerGlobalScope exists.
 * Not used in Campaign Guardian (GCP Node.js only), kept for compatibility.
 */
const hasWorkerGlobalScope = (): boolean => {
  try {
    return 'WorkerGlobalScope' in globalThis;
  } catch {
    return false;
  }
};

// For Campaign Guardian on GCP, these should always be false (Node.js only)
const isWorkerLike = !isNode && hasWorkerGlobalScope();
const isBrowserLike = !isNode && !isWorkerLike && safeHas('window');

export const runtimeCaps: RuntimeCapabilities = {
  isNode,
  isWorkerLike,
  isBrowserLike,
  hasProcess,
  hasBuffer,
  hasTextEncoder,
  hasPerformanceNow,
};
