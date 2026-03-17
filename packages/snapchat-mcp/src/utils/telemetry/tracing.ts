// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

export {
  initializeOpenTelemetry,
  shutdownOpenTelemetry,
  getOpenTelemetrySDK,
  isOpenTelemetryEnabled,
  otelLogMixin,
  getTracer,
  withSpan,
  withToolSpan,
  setSpanAttribute,
  recordSpanError,
  createPlatformSpanHelper,
  type Span,
} from "@cesteral/shared";

import { createPlatformSpanHelper } from "@cesteral/shared";

export const withSnapchatApiSpan = createPlatformSpanHelper("snapchat");
