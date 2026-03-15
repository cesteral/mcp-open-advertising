// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import pino from "pino";

/**
 * Create a configured logger instance
 */
export function createLogger(serviceName: string) {
  const isDevelopment = process.env.NODE_ENV === "development";

  return pino({
    name: serviceName,
    level: process.env.LOG_LEVEL || "info",
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(isDevelopment && {
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
        },
      },
    }),
  });
}

export type Logger = ReturnType<typeof createLogger>;