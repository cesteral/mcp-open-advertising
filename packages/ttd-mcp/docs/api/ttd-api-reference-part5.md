# The Trade Desk Platform API Reference — Part 5 of 5

> Source: https://open.thetradedesk.com/advertiser/docsApp/AdvertiserReferences/api/doc/ApiReferencePlatform
> Generated: 2026-05-14
> Coverage: REDS · Right Media Offer Type · Seed · Seller · Supply Vendor · Supply Vendor Publisher · Third Party Data Rate · Third Party Data Taxonomy · Tracking · Tracking Tag · Universal Forecasting · Users · Weather Condition

---

## 57. REDS

**Area URL:** `/api/area/REDS`

REDS = Raw Event Data Stream. These endpoints provide access to raw impression and video event data streams.

### REST `GET /v3/redsfeed/{feedId}`

Gets a list of all columns for the feed ID.

**Path Parameters:**

| Field  | Type   | Description              |
| ------ | ------ | ------------------------ |
| feedId | string | The ID of the REDS feed. |

**Response Fields:**

| Field                  | Type     | Description                              |
| ---------------------- | -------- | ---------------------------------------- |
| Columns                | object[] | List of available columns for this feed. |
| &nbsp;&nbsp;ColumnId   | string   | The column identifier.                   |
| &nbsp;&nbsp;ColumnName | string   | The display name of the column.          |
| &nbsp;&nbsp;DataType   | string   | The data type of the column.             |

### REST `POST /v3/redsfeed/query`

Gets metadata of all available feeds.

**Request Body:** Standard paged query.

**Response Fields:**

| Field       | Type   | Description                                 |
| ----------- | ------ | ------------------------------------------- |
| FeedId      | string | The feed identifier.                        |
| FeedName    | string | The name of the feed.                       |
| FeedType    | string | The type of feed (e.g., Impression, Video). |
| Description | string | Description of the feed.                    |

### REST `GET /v3/reds/impressions/facets`

Gets a list of all enumeration maps for the Raw Event Data Stream Impression event type.

### REST `GET /v3/reds/video/facets`

Gets a list of all enumeration maps for the Raw Event Data Stream Video event type that the specified requester is authorized to view.

---

## 58. Right Media Offer Type

**Area URL:** `/api/area/Right%20Media%20Offer%20Type`

### REST `POST /v3/rightmediaoffertype/query`

Get the available Right Media Offer Types.

**Request Body:** Standard paged query with optional `SearchTerms` and `SortFields`.

**Response Fields:**

| Field                   | Type   | Description                 |
| ----------------------- | ------ | --------------------------- |
| RightMediaOfferTypeId   | string | The ID of the offer type.   |
| RightMediaOfferTypeName | string | The name of the offer type. |

### REST `GET /v3/rightmediaoffertype/query/facets`

Get the facets of Right Media Offer Types that can be queried.

---

## 59. Seed

**Area URL:** `/api/area/Seed`

Seeds are audience definitions that can be associated with advertisers and campaigns to improve audience targeting.

### GQL `seed` Query

Get an existing seed by ID.

```graphql
seed(id: ID!): Seed
```

### GQL `seedCreate` Mutation

Create Seed.

```graphql
seedCreate(input: SeedCreateInput!): PayloadWithErrorsOfSeed!
```

### GQL `seedUpdate` Mutation

Update Seed.

### GQL `advertiserCreateDefaultSeed` Mutation

Create a default seed for an advertiser.

```graphql
advertiserCreateDefaultSeed(input: AdvertiserCreateDefaultSeedInput!): PayloadWithErrorsOfSeed!
```

### GQL `advertiserSetDefaultSeed` Mutation

Set Default Seed for Advertiser.

### GQL `advertiserUpdateSeedForCampaigns` Mutation

Applies a seed to the designated campaigns under an advertiser.

### GQL `campaignUpdateSeed` Mutation

Saves a campaign seed using the specified campaignId.

---

## 60. Seller

**Area URL:** `/api/area/Seller`

### REST `POST /v3/seller/query`

Retrieve a paged, filterable list of sellers, seller domains, and whether they can be targeted as a `SellerDomain` in a bid list.

> **Note:** Only returns sellers that have spent through the platform.

**Key Request Fields:**

| Field          | Type     | Required | Description                                               |
| -------------- | -------- | -------- | --------------------------------------------------------- |
| PageSize       | integer  | REQUIRED | Page size.                                                |
| PageStartIndex | integer  | REQUIRED | Zero-based start index.                                   |
| SearchTerms    | string[] | optional | Filter by seller domain name.                             |
| TargetableOnly | boolean  | optional | If true, only returns sellers targetable as SellerDomain. |

**Response Fields:**

| Field        | Type    | Description                                        |
| ------------ | ------- | -------------------------------------------------- |
| SellerDomain | string  | The seller domain (e.g., `openx.com`).             |
| SellerName   | string  | The seller name.                                   |
| IsTargetable | boolean | Whether this seller can be targeted in a bid list. |

### REST `GET /v3/seller/query/facets`

Retrieve the properties that can be used for sorting and filtering seller results in POST /seller/query.

### REST `GET /v3/seller/{sellerDomain}`

Retrieve seller details for a specific seller domain.

> **Note:** Returns ALL sellers regardless of whether they have spent through the platform.

---

## 61. Supply Vendor

**Area URL:** `/api/area/Supply%20Vendor`

### REST `POST /v3/supplyvendor/query/advertiser`

Get the Supply Vendors available to this Advertiser.

**Key Request Fields:**

| Field          | Type    | Required | Description                    |
| -------------- | ------- | -------- | ------------------------------ |
| AdvertiserId   | string  | REQUIRED | Platform ID of the advertiser. |
| PageSize       | integer | REQUIRED | Page size.                     |
| PageStartIndex | integer | REQUIRED | Zero-based start index.        |

### REST `GET /v3/supplyvendor/query/facets`

Get the facets of Supply Vendors that can be queried.

### REST `POST /v3/supplyvendor/query/partner`

Get the Supply Vendors available to this Partner.

---

## 62. Supply Vendor Publisher

**Area URL:** `/api/area/Supply%20Vendor%20Publisher`

### REST `GET /v3/supplyvendorpublisher/{supplyVendorId}/{supplyVendorPublisherId}`

Get the supply vendor publisher information for given platform IDs.

**Path Parameters:**

| Field                   | Type   | Description                              |
| ----------------------- | ------ | ---------------------------------------- |
| supplyVendorId          | string | The supply vendor platform ID.           |
| supplyVendorPublisherId | string | The supply vendor publisher platform ID. |

**Response Fields:**

| Field                   | Type   | Description                    |
| ----------------------- | ------ | ------------------------------ |
| SupplyVendorId          | string | The supply vendor ID.          |
| SupplyVendorPublisherId | string | The publisher ID.              |
| PublisherName           | string | The name of the publisher.     |
| SupplyVendorName        | string | The name of the supply vendor. |

---

## 63. Third Party Data Rate

**Area URL:** `/api/area/Third%20Party%20Data%20Rate`

> **Note:** All endpoints in this area are available only to data providers. Contact your Technical Account Manager for access.

### REST `POST /v3/datarate/batch`

Stage a batch of third-party taxonomy data rates for processing and approval. Maximum 5,000 rates per batch.

For details and examples, see the Assign Rates to Data Elements section in Third-Party Data Integration.

**Key Request Fields:**

| Field                         | Type     | Required | Description                                      |
| ----------------------------- | -------- | -------- | ------------------------------------------------ |
| ProviderId                    | string   | REQUIRED | The data provider ID.                            |
| Rates                         | object[] | REQUIRED | List of data rates to create/update (max 5,000). |
| &nbsp;&nbsp;ProviderElementId | string   | REQUIRED | The provider's element ID.                       |
| &nbsp;&nbsp;RateType          | string   | REQUIRED | Type of rate (e.g., CPM).                        |
| &nbsp;&nbsp;RateValue         | number   | REQUIRED | The rate value.                                  |

### REST `GET /v3/datarate/batch/{batchId}`

Get the processing and approval status for a batch of submitted data rates.

### REST `GET /v3/datarate/brands/{providerId}`

Retrieve a list of brands for a specific data provider ID.

For details, see Third-Party Data Management.

### REST `POST /v3/datarate/query`

Retrieve a filterable, paged list of data rates.

---

## 64. Third Party Data Taxonomy

**Area URL:** `/api/area/Third%20Party%20Data%20Taxonomy`

> **Note:** All endpoints in this area are available only to data providers. Contact your Technical Account Manager for access.

### REST `POST /v3/thirdpartydata`

Create a new data element (segment) in your third-party data taxonomy.

For details and examples, see Third-Party Data Integration.

**Key Request Fields:**

| Field                   | Type    | Required | Description                                     |
| ----------------------- | ------- | -------- | ----------------------------------------------- |
| ProviderId              | string  | REQUIRED | The data provider ID.                           |
| ProviderElementId       | string  | REQUIRED | Your internal identifier for the element.       |
| Name                    | string  | REQUIRED | Name of the data element.                       |
| Description             | string  | optional | Description of the data element.                |
| IsBuyable               | boolean | REQUIRED | Whether customers can buy this through the DMP. |
| ParentProviderElementId | string  | optional | Parent element ID for hierarchical taxonomy.    |

### REST `PUT /v3/thirdpartydata`

Update the name, description, or buyable status for a data element in your taxonomy.

### REST `POST /v3/thirdpartydata/query`

Retrieve a paged, filterable list of data elements for a specific data provider.

### REST `GET /v3/thirdpartydata/status/{providerId}/{providerElementId}`

Retrieve the approval status of third-party taxonomy data changes for the specified element.

For a list of possible statuses, see Check Data Change Status.

---

## 65. Tracking

**Area URL:** `/api/area/Tracking`

### REST `POST /v3/tracking/appeventtracker`

Create a new AppEventTracker for an advertiser.

**Key Request Fields:**

| Field               | Type   | Required | Description                              |
| ------------------- | ------ | -------- | ---------------------------------------- |
| AdvertiserId        | string | REQUIRED | Platform ID of the owning advertiser.    |
| AppEventTrackerName | string | REQUIRED | Name of the app event tracker.           |
| VendorId            | string | REQUIRED | The vendor ID for the app event tracker. |

### REST `PUT /v3/tracking/appeventtracker`

Update an existing AppEventTracker.

### REST `GET /v3/tracking/appeventtracker/{appEventTrackerId}`

Get details of a particular AppEventTracker.

### REST `POST /v3/tracking/appeventtrackerwithactivity/advertiser/query`

Retrieve a list of AppEventTrackers set up for a particular advertiser, along with basic activity statistics.

### REST `POST /v3/tracking/trackedappvendor/query`

Retrieve a list of supported AppEventTracker vendors.

### REST `POST /v3/tracking/universalpixel`

Create a new UniversalPixel.

**Key Request Fields:**

| Field              | Type   | Required | Description                           |
| ------------------ | ------ | -------- | ------------------------------------- |
| AdvertiserId       | string | REQUIRED | Platform ID of the owning advertiser. |
| UniversalPixelName | string | REQUIRED | Name of the universal pixel.          |

### REST `PUT /v3/tracking/universalpixel`

Update an existing UniversalPixel.

### REST `POST /v3/tracking/universalpixelmappingwithactivity/universalpixel/query`

Return a list of UniversalPixelMappings set up for a UniversalPixel along with basic activity statistics.

> **Note:** Always returns a paged result. Maximum PageSize: 100.

### REST `GET /v3/tracking/universalpixel/pixelcode/china/{universalPixelId}`

Get the China-specific pixel code for a Universal Pixel.

### REST `GET /v3/tracking/universalpixel/pixelcode/{universalPixelId}`

Get the pixel code for a Universal Pixel.

### REST `GET /v3/tracking/universalpixel/{universalPixelId}`

Get a Universal Pixel.

### REST `POST /v3/tracking/universalpixelwithactivity/advertiser/query`

Return a list of UniversalPixels set up for the Advertiser along with basic activity statistics.

> **Note:** Always returns a paged result. Maximum PageSize: 100.

> TIP: Using the equivalent advertiser GraphQL query, you can enhance performance and customize criteria. See also: Look Up Tracking Tags.

---

## 66. Tracking Tag

**Area URL:** `/api/area/Tracking%20Tag`

### REST `POST /v3/trackingtag`

Create a new tracking tag.

**Key Request Fields:**

| Field           | Type   | Required | Description                                                  |
| --------------- | ------ | -------- | ------------------------------------------------------------ |
| AdvertiserId    | string | REQUIRED | Platform ID of the owning advertiser.                        |
| TrackingTagName | string | REQUIRED | Name of the tracking tag.                                    |
| TrackingTagType | string | REQUIRED | Type of tracking tag (e.g., `UniversalPixel`, `Impression`). |
| ClickUrl        | string | optional | The click-through URL.                                       |
| ImpressionUrl   | string | optional | The impression URL.                                          |

### REST `PUT /v3/trackingtag`

Update an existing tracking tag.

> **Note:** Offline tracking tags are read-only and may not be modified using this endpoint.

### REST `POST /v3/trackingtag/query/advertiser`

Retrieve a paged, filterable list of tracking tags owned by or shared with the specified advertiser.

### REST `GET /v3/trackingtag/query/facets`

Get the facets of Tracking Tags that can be queried.

### REST `GET /v3/trackingtag/{trackingTagId}`

Get a tracking tag.

---

## 67. Universal Forecasting

**Area URL:** `/api/area/Universal%20Forecasting`

### REST `POST /v3/universalforecasting/generate`

Generate a forecast based on the data available at the time the forecast is requested.

> Because available data changes as time passes, forecasts generated with the same parameters at different times return unique results optimized for each point in time.

**Key Request Fields:**

| Field            | Type         | Required | Description                                |
| ---------------- | ------------ | -------- | ------------------------------------------ |
| AdvertiserId     | string       | REQUIRED | Platform ID of the advertiser.             |
| ForecastType     | string       | REQUIRED | Type of forecast to generate.              |
| StartDate        | string<date> | REQUIRED | The start date for the forecast period.    |
| EndDate          | string<date> | REQUIRED | The end date for the forecast period.      |
| Budget           | number       | optional | Target budget for the forecast.            |
| TargetingDetails | object       | optional | Targeting details to use for the forecast. |

**Response Fields:**

| Field                | Type    | Description                             |
| -------------------- | ------- | --------------------------------------- |
| EstimatedImpressions | integer | Estimated number of impressions.        |
| EstimatedReach       | integer | Estimated unique reach.                 |
| EstimatedClicks      | integer | Estimated number of clicks.             |
| ConfidenceScore      | number  | Confidence level of the forecast (0–1). |

---

## 68. Users

**Area URL:** `/api/area/Users`

### GQL `users` Query

Get existing users.

```graphql
users(after: String, before: String, first: Int, last: Int, order: [...], where: ...): UsersConnection
```

### GQL `userByLoginEmail` Query

Get an existing user by email address.

```graphql
userByLoginEmail(loginEmail: String!): User
```

### GQL `identityProvidersLookup` Query

Lookup applicable Identity Providers for a set of user emails.

### GQL `userCreateWithPlatformAttributes` Mutation

Create user with access to the provided partners, advertisers, access groups, permissions, and permission groups.

```graphql
userCreateWithPlatformAttributes(input: UserCreateWithPlatformAttributesInput!): PayloadWithErrorsOfUser!
```

### GQL `userUpdatePlatformAttributes` Mutation

Update the user's accessible partners, advertisers, access groups, permissions, and permission groups.

### GQL `userBulkCreateWithPlatformAttributes` Mutation

Bulk create users with access to the provided partners, advertisers, access groups, permissions, and permission groups.

### GQL `userBulkUpdatePlatformAttributes` Mutation

Bulk update the users' accessible partners, advertisers, access groups, permissions, and permission groups.

### GQL `userResetPassword` Mutation

Reset a user's password.

```graphql
userResetPassword(input: UserResetPasswordInput!): PayloadWithErrorsOfUser!
```

### GQL `userResetFactors` Mutation

Reset all MFA factors for a user.

### GQL `userReactivate` Mutation

Reactivate a deactivated user account.

---

## 69. Weather Condition

**Area URL:** `/api/area/Weather%20Condition`

### REST `GET /v3/weathercondition/query/available`

Get all the available weather conditions. No request parameters required.

**Response Fields:**

| Field                | Type   | Description                           |
| -------------------- | ------ | ------------------------------------- |
| WeatherConditionId   | string | The weather condition ID.             |
| WeatherConditionName | string | The name of the weather condition.    |
| Description          | string | Description of the weather condition. |

---

## Appendix: Common Conventions

### Standard Pagination Parameters (REST)

All paged REST query endpoints share these common request fields:

| Field          | Type           | Required            | Description                                                                    |
| -------------- | -------------- | ------------------- | ------------------------------------------------------------------------------ |
| PageSize       | integer<int32> | REQUIRED (NULLABLE) | Number of results per page. Null = all. 0 = count only. Recommended: 100–1000. |
| PageStartIndex | integer<int32> | REQUIRED            | Zero-based index into the result set.                                          |

### Standard Pagination Response Fields (REST)

| Field       | Type           | Description                       |
| ----------- | -------------- | --------------------------------- |
| Result      | object[]       | The matching objects.             |
| ResultCount | integer<int64> | Total number of matching results. |

### Status Labels

| Label        | Meaning                                                           |
| ------------ | ----------------------------------------------------------------- |
| `LEGACY`     | Old endpoint; use GraphQL equivalent for improved performance.    |
| `DEPRECATED` | Endpoint will be removed; migrate to the recommended alternative. |
| `KOKAI`      | Available only in Kokai platform version.                         |
| `SOLIMAR`    | Property/behavior specific to Solimar platform version.           |

### GraphQL Pagination Arguments

All GraphQL connection queries support cursor-based pagination:

| Argument | Type   | Description                                   |
| -------- | ------ | --------------------------------------------- |
| after    | String | Returns elements after the specified cursor.  |
| before   | String | Returns elements before the specified cursor. |
| first    | Int    | Returns the first n elements.                 |
| last     | Int    | Returns the last n elements.                  |

### GraphQL Connection Response Type

All GraphQL connections return:

| Field      | Type       | Description                             |
| ---------- | ---------- | --------------------------------------- |
| edges      | [XxxEdge!] | List of edges with cursor information.  |
| nodes      | [Xxx!]     | Flattened list of nodes.                |
| pageInfo   | PageInfo!  | Pagination metadata.                    |
| totalCount | Int!       | Total count of items (where supported). |

### Error Handling (GraphQL)

Mutations return `PayloadWithErrorsOfXxx` containing:

| Field      | Type          | Description                                              |
| ---------- | ------------- | -------------------------------------------------------- |
| data       | Xxx           | NULLABLE — The result data if successful.                |
| userErrors | [UserError!]! | NON-NULLABLE LIST — Validation or business logic errors. |

---

_End of Part 5 — This completes all 5 parts of the Platform API Reference documentation._

## File Index

| File                       | Areas Covered                                                                                                                                                                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ttd-api-reference-part1.md | Access Groups, Activity Log, Ad Format, Ad Group, Ad Technology, Additional Fees, Advertiser, Advertiser Merchant Permission, Advertiser Product List, Advertiser Product List Tracking Tag                                                                                |
| ttd-api-reference-part2.md | Audience, Authentication, Bid List, Campaign, Campaign Flight, Campaign Group, Category, Category Taxonomy, Comscore, Content, Contract, Contract Group, Creative, CRM Data, Cross Device, Currency, Custom Category, Custom Label, Data Group, Delivery Profile, Delta    |
| ttd-api-reference-part3.md | Device Make Model, DMP, Dynamic Creative Optimization, Dynamic Parameter Retargeting, Factual Proximity Design, Forecast, Frequency Config, Frequency Counter, Geo Event, Geo Segment, Geo Target Segment, Interest Targeting, Inventory Classification, IP Targeting List |
| ttd-api-reference-part4.md | Ispot, Language, Merchant Category, Merchant Product, Mobile Application, Mobile Carrier, My Reports, Nielsen, Offline Tracking Tag, Overview, Partner                                                                                                                     |
| ttd-api-reference-part5.md | REDS, Right Media Offer Type, Seed, Seller, Supply Vendor, Supply Vendor Publisher, Third Party Data Rate, Third Party Data Taxonomy, Tracking, Tracking Tag, Universal Forecasting, Users, Weather Condition + Common Conventions Appendix                                |
