# The Trade Desk Platform API Reference — Part 1 of 5
> Source: https://open.thetradedesk.com/advertiser/docsApp/AdvertiserReferences/api/doc/ApiReferencePlatform
> Generated: 2026-05-14
> Coverage: Access Groups · Activity Log · Ad Format · Ad Group · Ad Technology · Additional Fees · Advertiser · Advertiser Merchant Permission · Advertiser Product List · Advertiser Product List Tracking Tag

---

## Platform API Reference Overview

The Platform API reference is an auto-generated alphabetical list of all platform operations. It covers both **GraphQL (GQL)** operations and **REST** endpoints.

**GraphQL conventions:**
- Two operation types: `Query` (read) and `Mutation` (create/update)
- Each operation includes: description, code snippet, arguments, type definition, and entity fields
- Nullability: `NULLABLE` or `NON-NULLABLE`

**REST conventions:**
- All endpoints start with `/v3/`
- Methods: `GET`, `PUT`, `POST`, `DELETE`
- Labels: `SOLIMAR`, `KOKAI`, `LEGACY`, `DEPRECATED`
- Request/Response schemas include field names, types, and descriptions

---

## 1. Access Groups

**Area URL:** `/api/area/Access%20Groups`

### GQL `accessGroup` Query

Get an access group by ID.

**Signature:**
```graphql
accessGroup(
  id: ID!
): AccessGroup!
```

**Arguments:**
- `accessGroup.id` ● `ID!` non-null scalar

**Return Type: `AccessGroup`**

| Field | Type | Nullability | Description |
|---|---|---|---|
| advertisers | AdvertisersConnection | NULLABLE | The advertisers mapped to the access group. |
| allAdvertisers | AllAdvertisersConnection | NULLABLE | All advertisers either directly mapped or from mapped partners. |
| ancestors | AncestorsConnection | NULLABLE | Ancestors of the AccessGroup ordered by closest ancestor first. |
| archivedAt | DateTime | NULLABLE | Date when the access group was archived. |
| description | String | NULLABLE | The description of the access group. |
| disabledAt | DateTime | NULLABLE | Date when the access group was disabled. |
| hasSubAccessGroups | Boolean! | NON-NULLABLE | Has child access groups. |
| id | ID! | NON-NULLABLE | Unique ID. |
| invitedMemberGroup | MemberGroup | NULLABLE | The invited member group (to be deprecated — use MemberGroups instead). |
| isAnchor | Boolean! | NON-NULLABLE | Whether the access group is an anchor. |
| lineage | [AccessGroup!]! | LIST NON-NULLABLE | The lineage of the AccessGroup. |
| memberGroups | MemberGroupsConnection | NULLABLE | All member groups mapped to the access group. |
| name | String! | NON-NULLABLE | The name of the access group. |
| organization | UserOrganization | NULLABLE | The user organization the access group belongs to. |
| ownedMemberGroup | MemberGroup | NULLABLE | The owned member group (to be deprecated — use MemberGroups instead). |
| parentAccessGroup | AccessGroup | NULLABLE | The parent access group, if any. |
| partnerGroup | PartnerGroup | NULLABLE DEPRECATED | Deprecated as of 2026-02-23 — not populated in DB. |
| partners | PartnersConnection | NULLABLE | The partners mapped to the access group. |
| subAccessGroups | SubAccessGroupsConnection | NULLABLE | The child access groups. |
| tenant | Tenant! | NON-NULLABLE | The tenant which the access group belongs to. |
| users | UsersConnection | NULLABLE | The users mapped to the access group. |
| indexedUsers | IndexedUserQueryResult! | NON-NULLABLE | Indexed user query result. |

---

### GQL `accessGroups` Query

Get top level access groups.

**Signature:**
```graphql
accessGroups(
  after: String
  before: String
  first: Int
  last: Int
  order: [AccessGroupProjectionSortInput!]
  where: AccessGroupProjectionFilterInput
): AccessGroupsConnection
```

**Arguments:**
- `after` ● String — Returns elements after the specified cursor.
- `before` ● String — Returns elements before the specified cursor.
- `first` ● Int — Returns the first n elements.
- `last` ● Int — Returns the last n elements.
- `order` ● [AccessGroupProjectionSortInput!] — Sort input.
- `where` ● AccessGroupProjectionFilterInput — Filter input.

**Return Type: `AccessGroupsConnection`** — A connection to a list of items.

| Field | Type | Description |
|---|---|---|
| edges | [AccessGroupsEdge!] | A list of edges. |
| nodes | [AccessGroup!] | A flattened list of nodes. |
| pageInfo | PageInfo! | Pagination info. |

---

### GQL `accessGroupUpdate` Mutation

Update access group.

**Signature:**
```graphql
accessGroupUpdate(
  input: AccessGroupUpdateInput!
): PayloadWithErrorsOfAccessGroup!
```

**Arguments:**
- `input` ● AccessGroupUpdateInput! — non-null input

**Return Type: `PayloadWithErrorsOfAccessGroup`**

| Field | Type | Description |
|---|---|---|
| data | AccessGroup | NULLABLE — Data returned by the operation. |
| userErrors | [UserError!]! | NON-NULLABLE LIST — Any user errors encountered. |

---

### GQL `accessGroupDisable` Mutation

Disable access group.

**Signature:**
```graphql
accessGroupDisable(
  input: AccessGroupStatusUpdateInput!
): PayloadWithErrorsOfAccessGroup!
```

**Arguments:**
- `input` ● AccessGroupStatusUpdateInput! — non-null input

**Return Type: `PayloadWithErrorsOfAccessGroup`** (same as above)

---

### GQL `accessGroupEnable` Mutation

Enable access group.

**Signature:**
```graphql
accessGroupEnable(
  input: AccessGroupStatusUpdateInput!
): PayloadWithErrorsOfAccessGroup!
```

**Arguments:**
- `input` ● AccessGroupStatusUpdateInput! — non-null input

**Return Type: `PayloadWithErrorsOfAccessGroup`** (same as above)

---

### GQL `accessGroupBulkDisable` Mutation

Disable access group (bulk).

**Signature:**
```graphql
accessGroupBulkDisable(
  input: [AccessGroupStatusUpdateInput!]!
): PayloadWithErrorsOfListOfAccessGroup!
```

**Return Type: `PayloadWithErrorsOfListOfAccessGroup`**

| Field | Type | Description |
|---|---|---|
| data | [AccessGroup] | NULLABLE LIST |
| userErrors | [UserError!]! | NON-NULLABLE LIST |

---

### GQL `accessGroupBulkEnable` Mutation

Bulk enable access group.

**Signature:**
```graphql
accessGroupBulkEnable(
  input: [AccessGroupStatusUpdateInput!]!
): PayloadWithErrorsOfListOfAccessGroup!
```

**Return Type:** Same as `accessGroupBulkDisable`.

---

### GQL `accessGroupCreateChild` Mutation

Create sub-access group.

**Signature:**
```graphql
accessGroupCreateChild(
  input: ChildAccessGroupCreateInput!
): PayloadWithErrorsOfAccessGroup!
```

**Arguments:**
- `input` ● ChildAccessGroupCreateInput! — non-null input

**Return Type: `PayloadWithErrorsOfAccessGroup`** (same as above)

---

## 2. Activity Log

**Area URL:** `/api/area/Activity%20Log`

### REST `PUT /v3/activity`

Create or update the `Note` property for an existing activity log. `Note` is the only property that accepts changes — all other property updates are silently ignored.

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| Id | integer<int64> | REQUIRED | Unique activity log ID. |
| Note | string(512) | optional | A descriptive message of the reason for the change. |

**Response (HTTP 200):** Returns the updated activity log object (see GET /v3/activity/{activityLogId} for the full schema).

---

### REST `GET /v3/activity/{activityLogId}`

Retrieve detail for an activity log entry by ActivityLogId.

**Path Parameters:**

| Field | Type | Required | Description |
|---|---|---|---|
| activityLogId | integer<int64> | REQUIRED | The ID of the Activity to retrieve. |

**Response (HTTP 200):**

| Field | Type | Description |
|---|---|---|
| ActivityRollupTimeUtc | string<date-time> | Timestamp of the rollup window (15-minute windows). |
| ActivityTimeUtc | string<date-time> | Timestamp of when the change occurred in the system. |
| BidLineChanges | object[] NULLABLE | Detailed bid line list of changes. |
| &nbsp;&nbsp;BidDimensionId | integer<int64> | The bid dimension ID. |
| &nbsp;&nbsp;BidDimensionType | string NULLABLE | The bid dimension type (e.g., Site, SSP/Audience/Contract Name/Ad Format). |
| &nbsp;&nbsp;Op | string NULLABLE | Operation: I=Inserted, U=Updated, D=Deleted, Optimized. |
| &nbsp;&nbsp;ValueFrom | string NULLABLE | Original bid factor value (null/0 for inserts). |
| &nbsp;&nbsp;ValueTo | string NULLABLE | New bid factor value (null/0 for deletes). |
| &nbsp;&nbsp;VolumeControlValueFrom | string NULLABLE | Original volume control value. |
| &nbsp;&nbsp;VolumeControlValueTo | string NULLABLE | New volume control value. |
| Entity | string NULLABLE | Name of the system entity that changed (e.g., Site, Ad Group, Fold Placement). |
| HasBidListChanges | boolean | Whether bid list changes occurred. |
| Note | string(512) | Descriptive message of the reason for the change. |
| OwnerAdGroupId | string NULLABLE | Platform ID of the ad group. |
| OwnerCampaignId | string NULLABLE | Platform ID of the campaign. |
| Source | string | Source of change: `Ui`, `Api`, `Other`, `Unknown`. |

---

### REST `POST /v3/activity/query/adgroup`

Retrieve and optionally filter a paged list of activity log entries for the specified ad group.

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| PageSize | integer<int32> | REQUIRED NULLABLE | Page size. Null = all elements. 0 = zero elements (for count only). Recommended range: 100–1000. |
| PageStartIndex | integer<int32> | REQUIRED | Zero-based index into the result set. |
| AdGroupId | string | required | The platform ID of the ad group for which to retrieve logged activity data. |
| DateTimeEndUtc | string<date-time> | optional | Filter to changes before/on this UTC date-time. Defaults to current UTC. |
| DateTimeStartUtc | string<date-time> | optional | Filter to changes after/on this UTC date-time. |
| IncludeBidLineDetails | boolean | optional | If true, includes bid line details in response. May slightly increase response time. |
| Source | string | optional | Filter by source: `Ui`, `Api`, `Other`, `Unknown`. |
| UpdatedBy | string | optional | Filter by username. |
| UpdatedIn | string[] | optional | Filter by entity names. Use POST /activity/query/adgroup/facets for available entity names. |

**Response (HTTP 200):** Paged list of activity log entries (same schema as GET /v3/activity/{activityLogId}).

---

### REST `POST /v3/activity/query/campaign`

Retrieve and optionally filter a paged list of activity log entries for the specified campaign. Identical structure to the adgroup query but uses `CampaignId` instead of `AdGroupId`.

---

### REST `POST /v3/activity/query/facets`

Retrieve a summary of changed properties and usernames for the specified ad group or campaign. Results can be used to filter the adgroup/campaign query endpoints. Either `AdGroupId` or `CampaignId` is required.

**Request Body:**

| Field | Type | Description |
|---|---|---|
| AdGroupId | string | Platform ID of the ad group. |
| CampaignId | string | Platform ID of the campaign. |
| DateTimeEndUtc | string<date-time> | Filter to before/on this UTC date-time. Defaults to current UTC. |
| DateTimeStartUtc | string<date-time> | Filter to after/on this UTC date-time. |

**Response (HTTP 200):** Returns facet summary including available usernames and entity names.

---

## 3. Ad Format

**Area URL:** `/api/area/Ad%20Format`

### REST `POST /v3/adformat/query`

Get the Ad Formats supported by The Trade Desk.

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| PageSize | integer<int32> | REQUIRED NULLABLE | Page size (see pagination conventions). |
| PageStartIndex | integer<int32> | REQUIRED | Zero-based start index. |
| SearchTerms | string[] NULLABLE | optional | Filter by search terms matched against ID, label, IAB name, or display name. All terms must match. |
| SortFields | object[] NULLABLE | optional | Sort fields. If omitted, defaults to Name ascending. |
| &nbsp;&nbsp;FieldId | string REQUIRED | — | Sort field ID. Possible value: `Name`. |
| &nbsp;&nbsp;Ascending | boolean | — | True = ascending, false = descending. Defaults to true. |

**Response (HTTP 200):**

| Field | Type | Description |
|---|---|---|
| Result | object[] | Matching Ad Formats. |
| &nbsp;&nbsp;AdFormatId | string | The ID of the Ad Format. |
| &nbsp;&nbsp;AdFormatName | string | The name of the Ad Format. |
| &nbsp;&nbsp;Height | integer<int32> | Height in pixels. |
| &nbsp;&nbsp;InventoryType | string | One of: Unknown, Display, Video, Native, Audio, NativeVideo. |
| &nbsp;&nbsp;IsDisplayRTBEligible | boolean | Whether supported in general display RTB. |
| &nbsp;&nbsp;Width | integer<int32> | Width in pixels. |
| ResultCount | integer<int64> | Total number of results. |

---

### REST `GET /v3/adformat/query/facets`

Get the facets of Ad Formats that can be queried. No request parameters required.

**Response (HTTP 200):** Returns available facet/sort field definitions.

---

## 4. Ad Group

**Area URL:** `/api/area/Ad%20Group`

### GQL `adGroup` Query
Get an existing ad group.

```graphql
adGroup(id: ID!): AdGroup
```

### GQL `adGroups` Query
Get existing ad groups.

```graphql
adGroups(after: String, before: String, first: Int, last: Int, order: [...], where: ...): AdGroupsConnection
```

### GQL `adGroupCreate` Mutation
Create an ad group.

### GQL `adGroupUpdate` Mutation
Update an ad group.

### GQL `adGroupSpendPrioritizationUpdate` Mutation
Updates the ad group spend prioritization settings.

### REST `POST /v3/adgroup`
Create a new Ad Group.

### REST `PUT /v3/adgroup`
Update an existing Ad Group.

### REST `GET /v3/adgroup/{adGroupId}` ⚠️ DEPRECATED
> Use the `adGroup` GraphQL query instead for improved performance.

Get an existing Ad Group by ID.

### REST `GET /v3/adgroup/analyticsreport/{adGroupId}`
Get the analytics report(s) for an existing Ad Group.

### REST `GET /v3/adgroup/koaapplieditems/{adGroupId}`
Retrieve Koa optimizations applied to the specified ad group, including impact and last attempt details.

### REST `GET /v3/adgroup/koarecommendations/{adGroupId}`
Retrieve the current list of available optimizations recommended by Koa for the specified ad group.

### REST `POST /v3/adgroup/query/advertiser` ⚠️ DEPRECATED
> Use the `adGroups` query with filtering in GraphQL instead.

Look up and optionally filter a list of ad groups for a specified advertiser.

### REST `POST /v3/adgroup/query/campaign` ⚠️ DEPRECATED
> Use the `adGroups` query with filtering in GraphQL instead.

Look up and optionally filter a list of ad groups for a specified campaign.

### REST `POST /v3/adgroup/query/campaign/template`
Look up and optionally filter a list of ad groups for a specified campaign template.

---

## 5. Ad Technology

**Area URL:** `/api/area/Ad%20Technology`

### REST `POST /v3/adtechnology/query`
Get the available Ad Technologies.

**Request Body:** Standard paged query (PageSize, PageStartIndex, optional filters).

**Response (HTTP 200):** Paged list of Ad Technology objects.

### REST `GET /v3/adtechnology/query/facets`
Get the facets of Ad Technologies that can be queried. No request parameters.

---

## 6. Additional Fees

**Area URL:** `/api/area/Additional%20Fees`

### REST `POST /v3/additionalfees`
Creates an additional fee card with the given properties, including a list of fees to be applied on the given owner type/id.

> **Note:** All additional fee card creates/updates must be scheduled at least one hour in the future unless the fee rate card is created within two minutes of campaign/ad group creation.

### REST `PUT /v3/additionalfees`
Updates the card with the given owner type/id with the given fees list, scheduled to become active at the given start time. Overwrites any and all fees at that start time. There can only be one pending update at any given time.

> **Note:** All updates must be scheduled at least one hour in the future.

### REST `POST /v3/additionalfees/changelog`
Returns a list of changes to the additional fee card made (or scheduled to be made) between the start and end dates for the given owner type/id.

### REST `GET /v3/additionalfees/defaultfeecard/{advertiserId}`
Returns the default fee card for the partner, useful for populating the `InitialFeeCard` property on the create campaign endpoint.

**Path Parameters:**

| Field | Type | Description |
|---|---|---|
| advertiserId | string | The advertiser ID. |

### REST `GET /v3/additionalfees/{ownerType}/{ownerId}`
Gets the current fee card for the given owner type/id.

> **Note:** In some cases there will be no current fee card. Use the changelog endpoint to view future/past fee cards.

### REST `POST /v3/additionalfees/stop`
Ends the card at the end date given. This **cannot be undone**.

> **Note:** All ends must be scheduled at least one hour in the future. Use PUT with an empty fees list to nullify without ending permanently.

---

## 7. Advertiser

**Area URL:** `/api/area/Advertiser`

### GQL `advertiser` Query
Get an existing advertiser by ID.

```graphql
advertiser(id: ID!): Advertiser
```

### GQL `advertisers` Query
Get existing advertisers.

```graphql
advertisers(after: String, before: String, first: Int, last: Int, order: [...], where: ...): AdvertisersConnection
```

### GQL `advertiserCreate` Mutation
Create a new advertiser.

### GQL `advertiserUpdate` Mutation
Update an advertiser.

### GQL `advertiserDelta` Query
Get all changed advertisers for a partner since the last change-tracking version.

### REST `POST /v3/advertiser/adgroup/bidlinecounts`
Paged query to retrieve the bidline counts for adgroups owned by a given advertiser. Maximum page size: 1,000.

### REST `GET /v3/advertiser/{advertiserId}` 🔶 LEGACY
> Use the `advertiser` GraphQL query instead.

Get an existing advertiser by ID.

### REST `POST /v3/advertiser/query/partner` 🔶 LEGACY
> Use the `partner` query with filtering in GraphQL instead.

Get Advertisers that belong to the specified Partner.

---

## 8. Advertiser Merchant Permission

**Area URL:** `/api/area/Advertiser%20Merchant%20Permission`

### REST `POST /v3/ecommerce/permission`
Grant a brand or advertiser access to a merchant's data.

For details, see Managing Access to Merchant Product Catalog.

### REST `POST /v3/ecommerce/permission/delete`
Remove an advertiser's access to the merchant's data.

### REST `POST /v3/ecommerce/permission/query`
Retrieve the details about the merchant's data and data usage that the advertiser can access.

---

## 9. Advertiser Product List

**Area URL:** `/api/area/Advertiser%20Product%20List`

All endpoints below are batch endpoints that support partial success. For details, see the Commerce API Usage Overview section in Retail Data Integration API.

### REST `POST /v3/ecommerce/list/batch`
Create multiple lists for retargeting and measurement using a merchant's product data.

### REST `PUT /v3/ecommerce/list/batch`
Update the names and/or descriptions of multiple product lists.

### REST `POST /v3/ecommerce/list/batch/clone`
Clone multiple product lists along with their contents (product SKUs from a merchant's catalog).

### REST `POST /v3/ecommerce/list/batch/delete`
Delete multiple product lists.

### REST `POST /v3/ecommerce/list/batch/query`
Get the names and IDs of multiple product lists.

### REST `PUT /v3/ecommerce/list/products/add`
Add multiple SKUs from a merchant's catalog to a product list.

### REST `PUT /v3/ecommerce/list/products/remove`
Remove multiple SKUs from a product list.

### REST `PUT /v3/ecommerce/list/rules/add`
Ensure the provided rules are applied to a dynamic list. Missing rules are created, existing ones are validated.

### REST `POST /v3/ecommerce/list/rules/query`
Query rules applied to a dynamic list.

### REST `PUT /v3/ecommerce/list/rules/remove`
Remove the specified rules applied to a dynamic list.

### REST `POST /v3/ecommerce/list/sku/batch/query`
Get SKUs of all products added to multiple product lists.

### REST `POST /v3/ecommerce/list/targetingdata`
Create multiple targeting data for a product list.

### REST `POST /v3/ecommerce/list/trackingtag`
Create product list tracking tags for merchant event names.

---

## 10. Advertiser Product List Tracking Tag

**Area URL:** `/api/area/Advertiser%20Product%20List%20Tracking%20Tag`

### REST `POST /v3/ecommerce/campaigns/trackingtag/lists/query`
Get campaign IDs, tracking tags, product lists and their associated advertisers for a given merchant ID.

For details, see Product List Tracking Tags.

### REST `POST /v3/ecommerce/trackingtag/lists/batch/query`
Get the names and IDs of product lists for multiple tracking tag IDs.

This is a batch endpoint that supports partial success.

### REST `POST /v3/ecommerce/trackingtag/lists/query`
Get all tracking tags and their associated product lists for a given advertiser ID.

For details, see Product List Tracking Tags.

---

*End of Part 1 — Continue with Part 2 for: Audience · Authentication · Bid List · Campaign · Campaign Flight · Campaign Group · Category · Category Taxonomy · Comscore · Content · Contract · Contract Group · Creative · CRM Data · Cross Device · Currency · Custom Category · Custom Label · Data Group · Delivery Profile · Delta*
