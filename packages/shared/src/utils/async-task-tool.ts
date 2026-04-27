// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Shared helper for registering MCP Tasks-based async tools (SEP-1686).
 *
 * Wraps `server.experimental.tasks.registerToolTask()` so each server only
 * supplies the tool name, schemas, and the work function — no boilerplate
 * around task lifecycle, error capture, or background execution.
 */

import type { z } from "zod";
import type { Logger } from "pino";
import { extractZodShape } from "./zod-helpers.js";

const DEFAULT_TASK_TTL_MS = 5 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 3000;

interface ToolAnnotationsLike {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  openWorldHint?: boolean;
  idempotentHint?: boolean;
}

interface ContentBlock {
  type: string;
  text?: string;
  [key: string]: unknown;
}

/**
 * Structural type for the experimental tasks API on the MCP TypeScript SDK.
 * Avoids a direct import of @modelcontextprotocol/sdk from @cesteral/shared.
 */
interface TaskStoreLike {
  createTask(opts: { ttl?: number; pollInterval?: number }): Promise<{ taskId: string }>;
  storeTaskResult(
    taskId: string,
    status: "completed" | "failed",
    result: { content: ContentBlock[]; structuredContent?: unknown; isError?: boolean }
  ): Promise<void>;
  getTask(taskId: string): Promise<unknown>;
  getTaskResult(taskId: string): Promise<unknown>;
}

interface ServerWithTasks {
  experimental: {
    tasks: {
      registerToolTask(
        name: string,
        config: {
          title?: string;
          description: string;
          inputSchema: z.ZodRawShape;
          outputSchema?: z.ZodRawShape;
          annotations?: ToolAnnotationsLike;
          execution?: { taskSupport: "required" | "optional" };
        },
        handlers: {
          createTask: (
            args: Record<string, unknown>,
            extra: { taskStore: TaskStoreLike }
          ) => Promise<{ task: { taskId: string } }>;
          getTask: (
            args: Record<string, unknown>,
            extra: { taskId: string; taskStore: TaskStoreLike }
          ) => Promise<unknown>;
          getTaskResult: (
            args: Record<string, unknown>,
            extra: { taskId: string; taskStore: TaskStoreLike }
          ) => Promise<unknown>;
        }
      ): void;
    };
  };
}

export interface AsyncTaskValidationError {
  message: string;
}

export interface AsyncTaskToolConfig<TInput, TOutput> {
  name: string;
  title?: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  outputSchema?: z.ZodTypeAny;
  annotations?: ToolAnnotationsLike;
  taskTtlMs?: number;
  taskPollIntervalMs?: number;
  /**
   * Eager synchronous-or-async validation. If it returns errors, the tool
   * fails with InvalidParams *before* a task is created.
   */
  validate?: (input: TInput) => AsyncTaskValidationError[] | Promise<AsyncTaskValidationError[]>;
  /**
   * Long-running unit of work. Runs on a detached promise after createTask
   * returns so the client gets the task handle immediately.
   */
  execute: (input: TInput, ctx: AsyncTaskExecuteContext) => Promise<TOutput>;
  /**
   * Format the work output as MCP content blocks. The same content is also
   * stored alongside `structuredContent: output` for clients that prefer it.
   */
  formatContent: (output: TOutput, input: TInput) => ContentBlock[];
}

export interface AsyncTaskExecuteContext {
  taskId: string;
  sessionId?: string;
  requestId: string;
}

interface RegisterAsyncTaskToolOptions<TInput, TOutput> {
  server: ServerWithTasks;
  logger: Logger;
  sessionId?: string;
  config: AsyncTaskToolConfig<TInput, TOutput>;
  /**
   * Thrown when validation fails. Defaults to a plain Error so the SDK's
   * error mapping turns it into a JSON-RPC InvalidParams response. Servers
   * pass their own McpError factory to keep error codes consistent.
   */
  invalidParams?: (message: string) => Error;
}

/**
 * Register a Tasks-aware async version of a tool.
 */
export function registerAsyncTaskTool<TInput, TOutput>(
  options: RegisterAsyncTaskToolOptions<TInput, TOutput>
): void {
  const { server, logger, sessionId, config, invalidParams } = options;
  const inputShape = extractZodShape(config.inputSchema);
  const outputShape = config.outputSchema ? extractZodShape(config.outputSchema) : undefined;
  const ttl = config.taskTtlMs ?? DEFAULT_TASK_TTL_MS;
  const pollInterval = config.taskPollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  server.experimental.tasks.registerToolTask(
    config.name,
    {
      title: config.title,
      description: config.description,
      inputSchema: inputShape,
      outputSchema: outputShape,
      annotations: config.annotations,
      execution: { taskSupport: "required" },
    },
    {
      createTask: async (args, { taskStore }) => {
        const input = args as TInput;

        if (config.validate) {
          const errors = await config.validate(input);
          if (errors.length > 0) {
            const message = `Validation failed: ${errors.map((e) => e.message).join("; ")}`;
            throw (invalidParams ?? ((m: string) => new Error(m)))(message);
          }
        }

        const task = await taskStore.createTask({ ttl, pollInterval });

        logger.info({ taskId: task.taskId, sessionId, tool: config.name }, "Created async task");

        void runInBackground(taskStore, task.taskId, logger, config, input, sessionId);

        return { task };
      },
      getTask: async (_args, { taskId, taskStore }) => taskStore.getTask(taskId),
      getTaskResult: async (_args, { taskId, taskStore }) => taskStore.getTaskResult(taskId),
    }
  );

  logger.info({ tool: config.name }, "Registered async task tool");
}

async function runInBackground<TInput, TOutput>(
  taskStore: TaskStoreLike,
  taskId: string,
  logger: Logger,
  config: AsyncTaskToolConfig<TInput, TOutput>,
  input: TInput,
  sessionId: string | undefined
): Promise<void> {
  try {
    const output = await config.execute(input, {
      taskId,
      sessionId,
      requestId: `task-${taskId}`,
    });
    const content = config.formatContent(output, input);
    await taskStore.storeTaskResult(taskId, "completed", {
      content,
      structuredContent: output as unknown,
    });
    logger.info({ taskId, tool: config.name }, "Async task completed");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error({ taskId, tool: config.name, error: message }, "Async task failed");
    await taskStore
      .storeTaskResult(taskId, "failed", {
        content: [{ type: "text", text: `Task failed: ${message}` }],
        isError: true,
      })
      .catch((err) => logger.error({ taskId, err }, "Failed to record async task failure result"));
  }
}
