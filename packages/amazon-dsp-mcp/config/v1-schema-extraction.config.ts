// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

export interface V1SchemaExtractionConfig {
  inputSpecPath: string;
  apiVersion: string;
  rootOperations: string[];
  output: {
    filteredSpecPath: string;
    typesPath: string;
    zodPath: string;
  };
}

export const V1_SCHEMA_EXTRACTION_CONFIG: V1SchemaExtractionConfig = {
  inputSpecPath: "docs/openapi.json",
  apiVersion: "v1",
  rootOperations: [
    "DSPListCommitment",
    "DSPCreateCommitment",
    "DSPRetrieveCommitment",
    "DSPUpdateCommitment",
    "DSPRetrieveCampaignForecast",
    "DSPRetrieveCommitmentSpend",
  ],
  output: {
    filteredSpecPath: ".tmp-specs/amazon-ads-api-v1.filtered.json",
    typesPath: "src/generated/v1/types.ts",
    zodPath: "src/generated/v1/zod.ts",
  },
};
