/**
 * Curated entity examples for common DV360 operations
 *
 * Provides full example payloads showing correct data structure,
 * updateMask values, and usage notes for common entity updates.
 */

export interface EntityExample {
  operation: string;
  description: string;
  data: Record<string, any>;
  updateMask: string;
  notes: string;
  category?: 'status' | 'bid' | 'budget' | 'flight' | 'targeting' | 'general';
}

export interface EntityExamplesCollection {
  entityType: string;
  examples: EntityExample[];
}

/**
 * Curated examples for LineItem entities
 */
const LINE_ITEM_EXAMPLES: EntityExample[] = [
  {
    operation: "Update CPM bid",
    description: "Change the fixed bid amount for a line item",
    category: "bid",
    data: {
      bidStrategy: {
        fixedBid: {
          bidAmountMicros: 5000000, // $5 CPM
        },
      },
    },
    updateMask: "bidStrategy.fixedBid.bidAmountMicros",
    notes: "Bid amount is in micros (1 USD = 1,000,000 micros). Only use fixedBid if the line item uses a fixed bidding strategy.",
  },
  {
    operation: "Update max average CPM bid (auto-bidding)",
    description: "Change the maximum average CPM bid for maximize spend auto-bidding",
    category: "bid",
    data: {
      bidStrategy: {
        maximizeSpendAutoBid: {
          maxAverageCpmBidAmountMicros: 8000000, // $8 max CPM
        },
      },
    },
    updateMask: "bidStrategy.maximizeSpendAutoBid.maxAverageCpmBidAmountMicros",
    notes: "Use this for auto-bidding line items with maximize spend strategy. Bid amount is in micros.",
  },
  {
    operation: "Pause line item",
    description: "Set line item status to paused",
    category: "status",
    data: {
      entityStatus: "ENTITY_STATUS_PAUSED",
    },
    updateMask: "entityStatus",
    notes: "Valid statuses: ENTITY_STATUS_ACTIVE, ENTITY_STATUS_PAUSED, ENTITY_STATUS_ARCHIVED. Note: Cannot unarchive once archived.",
  },
  {
    operation: "Activate line item",
    description: "Set line item status to active",
    category: "status",
    data: {
      entityStatus: "ENTITY_STATUS_ACTIVE",
    },
    updateMask: "entityStatus",
    notes: "Line item must meet all requirements (flight dates, budget, targeting) to serve.",
  },
  {
    operation: "Update flight dates",
    description: "Change line item start and end dates",
    category: "flight",
    data: {
      flight: {
        dateRange: {
          startDate: { year: 2025, month: 1, day: 15 },
          endDate: { year: 2025, month: 2, day: 15 },
        },
      },
    },
    updateMask: "flight.dateRange",
    notes: "Dates must be in the future (or current for start date) and end date must be after start date. Use YYYY-MM-DD format converted to date object.",
  },
  {
    operation: "Update line item budget",
    description: "Change line item budget amount",
    category: "budget",
    data: {
      budget: {
        budgetAmountMicros: 50000000000, // $50,000
      },
    },
    updateMask: "budget.budgetAmountMicros",
    notes: "Budget amount is in micros. Line item budget cannot exceed insertion order budget.",
  },
  {
    operation: "Update pacing to ahead",
    description: "Change pacing type to spend ahead of schedule",
    category: "general",
    data: {
      pacing: {
        pacingType: "PACING_TYPE_AHEAD",
      },
    },
    updateMask: "pacing.pacingType",
    notes: "Valid pacing types: PACING_TYPE_EVEN, PACING_TYPE_AHEAD, PACING_TYPE_ASAP. ASAP spends budget as quickly as possible.",
  },
  {
    operation: "Update revenue margin (markup)",
    description: "Change the revenue margin percentage for partner revenue model",
    category: "budget",
    data: {
      partnerRevenueModel: {
        markupType: "PARTNER_REVENUE_MODEL_MARKUP_TYPE_CPM",
        markupAmount: {
          amountMicros: 500000, // $0.50 markup
        },
      },
    },
    updateMask: "partnerRevenueModel",
    notes: "Markup amount is in micros. This is the margin added on top of media costs. Common for reseller models.",
  },
];

/**
 * Curated examples for Campaign entities
 */
const CAMPAIGN_EXAMPLES: EntityExample[] = [
  {
    operation: "Update campaign budget",
    description: "Change campaign budget amount",
    category: "budget",
    data: {
      campaignBudgets: [
        {
          budgetAmountMicros: 100000000000, // $100,000
        },
      ],
    },
    updateMask: "campaignBudgets",
    notes: "Budget amount is in micros. Use campaignBudgets array even for single budget. All insertion orders under this campaign share this budget.",
  },
  {
    operation: "Pause campaign",
    description: "Set campaign status to paused",
    category: "status",
    data: {
      entityStatus: "ENTITY_STATUS_PAUSED",
    },
    updateMask: "entityStatus",
    notes: "Pausing a campaign pauses all child insertion orders and line items.",
  },
  {
    operation: "Update campaign flight dates",
    description: "Change campaign start and end dates",
    category: "flight",
    data: {
      campaignFlight: {
        plannedDates: {
          startDate: { year: 2025, month: 1, day: 1 },
          endDate: { year: 2025, month: 12, day: 31 },
        },
      },
    },
    updateMask: "campaignFlight.plannedDates",
    notes: "Campaign flight dates must encompass all child insertion order and line item flight dates.",
  },
  {
    operation: "Update campaign performance goal",
    description: "Set campaign performance goal type",
    category: "general",
    data: {
      campaignGoal: {
        performanceGoalType: "PERFORMANCE_GOAL_TYPE_CPA",
        performanceGoalAmountMicros: 25000000, // $25 CPA target
      },
    },
    updateMask: "campaignGoal",
    notes: "Common goal types: CPA, CPC, CTR, VIEWABILITY, CPIAVC (Cost per Incremental Attributed Viewable Conversion).",
  },
];

/**
 * Curated examples for InsertionOrder entities
 */
const INSERTION_ORDER_EXAMPLES: EntityExample[] = [
  {
    operation: "Update insertion order budget",
    description: "Change insertion order budget amount",
    category: "budget",
    data: {
      budget: {
        budgetAmountMicros: 25000000000, // $25,000
      },
    },
    updateMask: "budget.budgetAmountMicros",
    notes: "Budget amount is in micros. IO budget cannot exceed campaign budget. Line items under this IO share this budget.",
  },
  {
    operation: "Pause insertion order",
    description: "Set insertion order status to paused",
    category: "status",
    data: {
      entityStatus: "ENTITY_STATUS_PAUSED",
    },
    updateMask: "entityStatus",
    notes: "Pausing an insertion order pauses all child line items.",
  },
  {
    operation: "Update pacing with daily max",
    description: "Set pacing type and daily maximum spend",
    category: "budget",
    data: {
      pacing: {
        pacingType: "PACING_TYPE_EVEN",
        dailyMaxMicros: 1000000000, // $1,000 daily max
      },
    },
    updateMask: "pacing",
    notes: "Daily max is optional and caps spending per day. Useful for even budget distribution.",
  },
  {
    operation: "Update KPI (Key Performance Indicator)",
    description: "Set performance goal for the insertion order",
    category: "general",
    data: {
      kpi: {
        kpiType: "KPI_TYPE_CPA",
        kpiAmountMicros: 20000000, // $20 CPA
      },
    },
    updateMask: "kpi",
    notes: "Common KPI types: CPA, CPC, CPM, CTR. This guides optimization but doesn't enforce constraints.",
  },
];

/**
 * Curated examples for Advertiser entities
 */
const ADVERTISER_EXAMPLES: EntityExample[] = [
  {
    operation: "Update advertiser display name",
    description: "Change the advertiser's display name",
    category: "general",
    data: {
      displayName: "Updated Advertiser Name",
    },
    updateMask: "displayName",
    notes: "Display name is shown in DV360 UI and reporting.",
  },
  {
    operation: "Pause advertiser",
    description: "Set advertiser status to paused",
    category: "status",
    data: {
      entityStatus: "ENTITY_STATUS_PAUSED",
    },
    updateMask: "entityStatus",
    notes: "Pausing an advertiser pauses all campaigns, insertion orders, and line items under it. Use with caution.",
  },
];

/**
 * Curated examples for Creative entities
 */
const CREATIVE_EXAMPLES: EntityExample[] = [
  {
    operation: "Update creative display name",
    description: "Change the creative's display name",
    category: "general",
    data: {
      displayName: "New Creative Name - Q1 2025",
    },
    updateMask: "displayName",
    notes: "Display name helps identify creatives in reporting and UI.",
  },
  {
    operation: "Archive creative",
    description: "Set creative status to archived",
    category: "status",
    data: {
      entityStatus: "ENTITY_STATUS_ARCHIVED",
    },
    updateMask: "entityStatus",
    notes: "Archived creatives cannot be reactivated. Use PAUSED if you might need to reactivate later.",
  },
];

/**
 * Curated examples for AdGroup entities
 */
const AD_GROUP_EXAMPLES: EntityExample[] = [
  {
    operation: "Update ad group display name",
    description: "Change the ad group's display name",
    category: "general",
    data: {
      displayName: "Mobile - 18-34 - Prospecting",
    },
    updateMask: "displayName",
    notes: "Use descriptive names that indicate targeting strategy (device, audience, intent).",
  },
  {
    operation: "Pause ad group",
    description: "Set ad group status to paused",
    category: "status",
    data: {
      entityStatus: "ENTITY_STATUS_PAUSED",
    },
    updateMask: "entityStatus",
    notes: "Pausing an ad group pauses all ads within it.",
  },
];

/**
 * Curated examples for CustomBiddingAlgorithm entities
 */
const CUSTOM_BIDDING_ALGORITHM_EXAMPLES: EntityExample[] = [
  {
    operation: "Create SCRIPT_BASED algorithm (advertiser-owned)",
    description: "Create a custom bidding algorithm owned by a specific advertiser",
    category: "general",
    data: {
      displayName: "My Custom Bidding Algorithm",
      customBiddingAlgorithmType: "SCRIPT_BASED",
      entityStatus: "ENTITY_STATUS_ACTIVE",
      advertiserId: "123456789",
    },
    updateMask: "displayName,customBiddingAlgorithmType,entityStatus,advertiserId",
    notes: "Use the dv360_create_custom_bidding_algorithm tool. Algorithm type is immutable after creation. Advertiser ownership is also immutable.",
  },
  {
    operation: "Create SCRIPT_BASED algorithm (partner-owned, shared)",
    description: "Create a partner-level algorithm shared with multiple advertisers",
    category: "general",
    data: {
      displayName: "Partner Custom Bidding Algorithm",
      customBiddingAlgorithmType: "SCRIPT_BASED",
      entityStatus: "ENTITY_STATUS_ACTIVE",
      partnerId: "987654321",
      sharedAdvertiserIds: ["123456789", "234567890"],
    },
    updateMask: "displayName,customBiddingAlgorithmType,entityStatus,partnerId,sharedAdvertiserIds",
    notes: "Partner-owned algorithms can be shared with multiple advertisers via sharedAdvertiserIds. Useful for agency-wide bidding strategies.",
  },
  {
    operation: "Create RULE_BASED algorithm",
    description: "Create a rule-based custom bidding algorithm (requires allowlisting)",
    category: "general",
    data: {
      displayName: "Rule-Based Bidding Algorithm",
      customBiddingAlgorithmType: "RULE_BASED",
      entityStatus: "ENTITY_STATUS_ACTIVE",
      advertiserId: "123456789",
    },
    updateMask: "displayName,customBiddingAlgorithmType,entityStatus,advertiserId",
    notes: "RULE_BASED algorithms are restricted to allowlisted customers. Contact Google support if you need access to this feature.",
  },
  {
    operation: "Update algorithm display name",
    description: "Change the algorithm's display name",
    category: "general",
    data: {
      displayName: "Updated Algorithm Name",
    },
    updateMask: "displayName",
    notes: "Display name can be updated at any time. Max 240 bytes UTF-8 encoded.",
  },
  {
    operation: "Archive algorithm",
    description: "Set algorithm status to archived",
    category: "status",
    data: {
      entityStatus: "ENTITY_STATUS_ARCHIVED",
    },
    updateMask: "entityStatus",
    notes: "Archived algorithms cannot be used for bidding. Valid statuses: ENTITY_STATUS_ACTIVE, ENTITY_STATUS_ARCHIVED.",
  },
  {
    operation: "Example script content",
    description: "Sample custom bidding script for impression scoring",
    category: "general",
    data: {
      scriptContent: `// Custom bidding script example
// Available variables: impression, advertiser, creative, etc.
// Return a score between 0 and 1

function main() {
  var score = 0.5; // Default score

  // Adjust score based on device
  if (impression.device.type === 'MOBILE') {
    score *= 1.2;
  }

  // Adjust score based on time of day
  var hour = new Date().getHours();
  if (hour >= 9 && hour <= 17) {
    score *= 1.1; // Boost during business hours
  }

  // Cap score at 1.0
  return Math.min(score, 1.0);
}`,
    },
    updateMask: "scriptContent",
    notes: "Use the dv360_manage_custom_bidding_script tool with action='upload' to upload scripts. Scripts are processed asynchronously - check state for ACCEPTED/REJECTED.",
  },
];

/**
 * Registry of all entity examples
 */
const ENTITY_EXAMPLES_REGISTRY: Record<string, EntityExample[]> = {
  lineItem: LINE_ITEM_EXAMPLES,
  campaign: CAMPAIGN_EXAMPLES,
  insertionOrder: INSERTION_ORDER_EXAMPLES,
  advertiser: ADVERTISER_EXAMPLES,
  creative: CREATIVE_EXAMPLES,
  adGroup: AD_GROUP_EXAMPLES,
  customBiddingAlgorithm: CUSTOM_BIDDING_ALGORITHM_EXAMPLES,
};

/**
 * Get all examples for a specific entity type
 */
export function getEntityExamples(entityType: string): EntityExample[] {
  return ENTITY_EXAMPLES_REGISTRY[entityType] || [];
}

/**
 * Get examples for a specific entity type and category
 */
export function getEntityExamplesByCategory(
  entityType: string,
  category: EntityExample['category']
): EntityExample[] {
  const examples = getEntityExamples(entityType);
  return category ? examples.filter((ex) => ex.category === category) : examples;
}

/**
 * Get a specific example by operation name
 */
export function getEntityExampleByOperation(
  entityType: string,
  operation: string
): EntityExample | undefined {
  const examples = getEntityExamples(entityType);
  return examples.find((ex) => ex.operation === operation);
}

/**
 * Get all entity types that have curated examples
 */
export function getEntityTypesWithExamples(): string[] {
  return Object.keys(ENTITY_EXAMPLES_REGISTRY);
}

/**
 * Format example as human-readable text (for tool descriptions or help)
 */
export function formatExampleAsText(example: EntityExample): string {
  return `
Operation: ${example.operation}
Description: ${example.description}
Category: ${example.category || 'general'}

Data:
${JSON.stringify(example.data, null, 2)}

Update Mask: ${example.updateMask}

Notes: ${example.notes}
`.trim();
}

/**
 * Format all examples for an entity type as text
 */
export function formatEntityExamplesAsText(entityType: string): string {
  const examples = getEntityExamples(entityType);

  if (examples.length === 0) {
    return `No curated examples available for entity type: ${entityType}`;
  }

  const header = `# Examples for ${entityType}\n\n`;
  const examplesText = examples
    .map((ex, idx) => `## Example ${idx + 1}: ${ex.operation}\n\n${formatExampleAsText(ex)}`)
    .join('\n\n---\n\n');

  return header + examplesText;
}

/**
 * Get example operations grouped by category
 */
export function getExamplesByCategory(entityType: string): Record<string, EntityExample[]> {
  const examples = getEntityExamples(entityType);
  const grouped: Record<string, EntityExample[]> = {};

  for (const example of examples) {
    const category = example.category || 'general';
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(example);
  }

  return grouped;
}

/**
 * Get a summary of available examples for an entity type
 */
export function getExamplesSummary(entityType: string): string {
  const examples = getEntityExamples(entityType);

  if (examples.length === 0) {
    return `No examples available for ${entityType}`;
  }

  const operations = examples.map((ex) => `- ${ex.operation}`).join('\n');
  return `Available examples for ${entityType} (${examples.length} total):\n${operations}`;
}

/**
 * Validate that an update matches a known example pattern
 * Returns the matching example if found, otherwise null
 */
export function findMatchingExample(
  entityType: string,
  data: Record<string, any>,
  updateMask: string
): EntityExample | null {
  const examples = getEntityExamples(entityType);

  for (const example of examples) {
    if (example.updateMask === updateMask) {
      // Check if data structure matches (shallow check)
      const exampleKeys = Object.keys(example.data);
      const dataKeys = Object.keys(data);

      if (exampleKeys.every((key) => dataKeys.includes(key))) {
        return example;
      }
    }
  }

  return null;
}
