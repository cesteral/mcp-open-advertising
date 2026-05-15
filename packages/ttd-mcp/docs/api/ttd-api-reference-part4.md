# The Trade Desk Platform API Reference — Part 4 of 5

> Source: https://open.thetradedesk.com/advertiser/docsApp/AdvertiserReferences/api/doc/ApiReferencePlatform
> Generated: 2026-05-14
> Coverage: Ispot · Language · Merchant Category · Merchant Product · Mobile Application · Mobile Carrier · My Reports · Nielsen · Offline Tracking Tag · Overview · Partner

---

## 46. Ispot

**Area URL:** `/api/area/Ispot`

iSpot Reporting Models only apply to impressions served in the U.S. geography.

### REST `POST /v3/ispot/brand/query`

Get all active iSpot brands.

**Request Body:** Standard paged query with optional `SearchTerms`.

**Response Fields:**

| Field     | Type   | Description            |
| --------- | ------ | ---------------------- |
| BrandId   | string | The iSpot brand ID.    |
| BrandName | string | The name of the brand. |

### REST `PUT /v3/ispot/reportsettings/campaign`

Update an iSpot Reporting Model for a given Campaign.

**Key Request Fields:**

| Field      | Type    | Required | Description                         |
| ---------- | ------- | -------- | ----------------------------------- |
| CampaignId | string  | REQUIRED | Platform ID of the campaign.        |
| BrandId    | string  | REQUIRED | The iSpot brand ID.                 |
| IsEnabled  | boolean | REQUIRED | Whether iSpot reporting is enabled. |

### REST `GET /v3/ispot/reportsettings/campaign/{campaignId}`

Get an existing iSpot Reporting Model by Campaign ID.

---

## 47. Language

**Area URL:** `/api/area/Language`

### REST `POST /v3/language/query`

Retrieve a list of languages that might be used for enabling language targeting in Ad Groups.

**Request Body:** Standard paged query with optional `SearchTerms` and `SortFields`.

**Response Fields:**

| Field        | Type   | Description                           |
| ------------ | ------ | ------------------------------------- |
| LanguageCode | string | The language code (e.g., `en`, `fr`). |
| LanguageName | string | The full name of the language.        |

### REST `GET /v3/language/query/facets`

Get the facets of Languages that can be queried.

---

## 48. Merchant Category

**Area URL:** `/api/area/Merchant%20Category`

All endpoints are for managing First Party categories in a merchant's product catalog. For details, see Merchant Product Catalog.

> **Note:** If your merchant is set up with a Third Party Category Provider (e.g., Google, Facebook, Shopify), you are not authorized to modify categories via these endpoints.

### REST `PUT /v3/ecommerce/category/batch`

Create new or update existing First Party categories in a merchant's product catalog. Upsert batch endpoint, supports partial success.

**Key Request Fields:**

| Field                        | Type     | Required | Description                                    |
| ---------------------------- | -------- | -------- | ---------------------------------------------- |
| MerchantId                   | string   | REQUIRED | Platform ID of the merchant.                   |
| Categories                   | object[] | REQUIRED | List of categories to create or update.        |
| &nbsp;&nbsp;CategoryId       | string   | optional | For updates, the existing category ID.         |
| &nbsp;&nbsp;Name             | string   | REQUIRED | Name of the category.                          |
| &nbsp;&nbsp;ParentCategoryId | string   | optional | Parent category ID for hierarchical structure. |

### REST `POST /v3/ecommerce/category/batch/delete`

Delete multiple categories from a merchant's product catalog. Batch endpoint, supports partial success.

> **Important:** To delete a category, you must first reassign or delete any associated products and reassign or delete its child categories.

### REST `POST /v3/ecommerce/category/batch/query`

Get multiple category details from a merchant's product catalog. Batch endpoint, supports partial success.

---

## 49. Merchant Product

**Area URL:** `/api/area/Merchant%20Product`

### REST `PUT /v3/ecommerce/advertiser/product/batch`

Allow brands or advertisers to access specified product SKUs in a merchant's catalog.

### REST `PUT /v3/ecommerce/advertiser/products/add`

Allow a brand or advertiser to access specified product SKUs in a merchant's catalog.

### REST `POST /v3/ecommerce/advertiser/products/query`

Get a list of product SKUs associated with a brand or advertiser.

### REST `PUT /v3/ecommerce/advertiser/products/remove`

Remove access to product SKUs in a merchant's catalog from a brand or advertiser.

### REST `PUT /v3/ecommerce/product/advertisers/add`

Allow multiple brands or advertisers to access a specific product SKU.

### REST `POST /v3/ecommerce/product/advertisers/query`

Get Advertiser ID(s) associated to a Merchant SKU.

### REST `PUT /v3/ecommerce/product/advertisers/remove`

Remove access to a product SKU in a merchant's catalog from multiple brands or advertisers.

### REST `PUT /v3/ecommerce/product/batch`

Create or update multiple products in a merchant's product catalog. Batch endpoint, supports partial success.

### REST `POST /v3/ecommerce/product/batch/delete`

Delete multiple products from a merchant's catalog. Batch endpoint, supports partial success.

### REST `POST /v3/ecommerce/product/batch/query`

Get multiple product details from a merchant's catalog. Batch endpoint, supports partial success.

---

## 50. Mobile Application

**Area URL:** `/api/area/Mobile%20Application`

### REST `GET /v3/application/name/{applicationId}`

Get the mobile application and platform names for the specified ID.

**Path Parameters:**

| Field         | Type   | Description                |
| ------------- | ------ | -------------------------- |
| applicationId | string | The mobile application ID. |

**Response Fields:**

| Field           | Type   | Description                        |
| --------------- | ------ | ---------------------------------- |
| ApplicationId   | string | The application ID.                |
| ApplicationName | string | The name of the application.       |
| Platform        | string | The platform (e.g., iOS, Android). |

---

## 51. Mobile Carrier

**Area URL:** `/api/area/Mobile%20Carrier`

### REST `POST /v3/mobilecarrier/query`

Get the mobile carriers supported by The Trade Desk.

**Request Body:** Standard paged query.

**Response Fields:**

| Field             | Type   | Description              |
| ----------------- | ------ | ------------------------ |
| MobileCarrierId   | string | The carrier ID.          |
| MobileCarrierName | string | The name of the carrier. |
| CountryCode       | string | ISO country code.        |

---

## 52. My Reports

**Area URL:** `/api/area/My%20Reports`

### GQL `reportTypes` Query

Returns a list of report types depending on the input.

### GQL `reportType` Query

Returns information about a specific report type ID.

### GQL `myReportsTemplateCreate` Mutation

Create a new report template.

### GQL `myReportsReportTemplates` Query

Query for existing report templates.

### GQL `myReportsTemplateUpdate` Mutation

Update an existing report template.

### GQL `derivedReportTemplate` Query

Retrieves the report template structure by its ID.

> **Note:** The returned template contains only the tabs and columns you can access.

### GQL `myReportsTemplateScheduleCreate` Mutation

Create a schedule using an existing report template.

### GQL `myReportsReportSchedules` Query

Query for existing report schedules.

> **Note:** At least one filter must be applied: partnerIdFilter, advertiserIdFilter, privateContractIdFilter, scheduleId, name, searchText, createdByUserId, or executions.id. Without a filter, results are limited to the current user's schedules.

### GQL `myReportsReportScheduleUpdate` Mutation

Update a report schedule.

### GQL `myReportsReportExecutionCancel` Mutation

Cancel a report execution.

### GQL `myReportsReportScheduleDelete` Mutation

Delete a report schedule.

### REST `POST /v3/myreports/conversionpixelnames`

Get conversion pixel names for report configuration.

### REST `GET /v3/myreports/reportdelivery/facets`

Get the facets of Report Deliveries.

### REST `GET /v3/myreports/reportexecution/facets`

Get the facets of Report Executions.

### REST `POST /v3/myreports/reportexecution/query/advertisers`

Get a page of Report Executions that match the Advertisers and filters in the specified query.

### REST `POST /v3/myreports/reportschedule`

Create a new report schedule.

**Key Request Fields:**

| Field            | Type   | Required | Description                                    |
| ---------------- | ------ | -------- | ---------------------------------------------- |
| TemplateName     | string | REQUIRED | Name of the report schedule.                   |
| ReportTemplateId | string | REQUIRED | ID of the report template to use.              |
| DeliverySettings | object | REQUIRED | Delivery configuration (email, SFTP, etc.).    |
| Schedule         | object | REQUIRED | Schedule settings (frequency, time, timezone). |

### REST `GET /v3/myreports/reportschedule/facets`

Get the facets of a Report Schedule.

### REST `POST /v3/myreports/reportschedule/query`

Get a page of Report Schedules that match the filters in the specified query.

### REST `GET /v3/myreports/reportschedule/{scheduleId}`

Get a report schedule.

### REST `DELETE /v3/myreports/reportschedule/{scheduleId}`

Delete the report schedule.

### REST `GET /v3/myreports/reporttemplate/facets`

Get the facets of Report Templates.

### REST `POST /v3/myreports/reporttemplateheader/query`

Get a page of Report Template Headers that match the filters in the specified query.

### REST `POST /v3/myreports/supportedtailaggregationprofiles/query`

Get the tail aggregation profiles that are supported by the Report Template in the specified query.

---

## 53. Nielsen

**Area URL:** `/api/area/Nielsen`

### REST `GET /v3/nielsen/reportingcountries`

Get the codes and names of countries that might be targeted using Nielsen. No request parameters required.

**Response Fields:**

| Field       | Type   | Description              |
| ----------- | ------ | ------------------------ |
| CountryCode | string | ISO country code.        |
| CountryName | string | The name of the country. |

---

## 54. Offline Tracking Tag

**Area URL:** `/api/area/Offline%20Tracking%20Tag`

### REST `POST /v3/offlinetrackingtag`

Create a new offline tracking tag.

**Key Request Fields:**

| Field           | Type   | Required | Description                           |
| --------------- | ------ | -------- | ------------------------------------- |
| AdvertiserId    | string | REQUIRED | Platform ID of the owning advertiser. |
| TrackingName    | string | REQUIRED | Name of the tracking tag.             |
| TrackingTagType | string | REQUIRED | Type of offline tracking tag.         |

### REST `PUT /v3/offlinetrackingtag`

Update an existing offline tracking tag.

> **Note:** Currently only the name can be updated — all other fields are read-only.

### REST `POST /v3/offlinetrackingtag/query/advertiser`

Get a page of offline tracking tags that belong to a specified advertiser.

### REST `GET /v3/offlinetrackingtag/query/facets`

Get the facets of offline tracking tags that can be queried.

### REST `GET /v3/offlinetrackingtag/{trackingTagId}`

Get an offline tracking tag.

---

## 55. Overview

**Area URL:** `/api/area/Overview`

Overview endpoints return a hierarchy of descendant relationships and essential properties, without full object detail. Use the entity-specific GET endpoints to retrieve full detail.

### REST `GET /v3/overview/partner/{partnerId}` 🔶 LEGACY

> Use the `partner` query in GraphQL instead.

Get a partner overview. Returns the hierarchy of descendant relationships and essential properties.

**Path Parameters:**

| Field     | Type   | Description     |
| --------- | ------ | --------------- |
| partnerId | string | The partner ID. |

---

## 56. Partner

**Area URL:** `/api/area/Partner`

### GQL `partner` Query

Get an existing partner by ID.

```graphql
partner(id: ID!): Partner
```

**Return Type: `Partner`** (key fields):

| Field              | Type                     | Description                           |
| ------------------ | ------------------------ | ------------------------------------- |
| id                 | ID!                      | NON-NULLABLE unique ID.               |
| name               | String!                  | Partner name.                         |
| advertisers        | AdvertisersConnection    | NULLABLE — Associated advertisers.    |
| accessGroups       | AccessGroupsConnection   | NULLABLE — Associated access groups.  |
| ownedBidLists      | BidListsConnection       | NULLABLE — Owned bid lists.           |
| associatedBidLists | BidListsConnection       | NULLABLE — Associated bid lists.      |
| firstPartyData     | FirstPartyDataConnection | NULLABLE — First-party data segments. |

### GQL `partners` Query

Get existing partners.

```graphql
partners(after: String, before: String, first: Int, last: Int, order: [...], where: ...): PartnersConnection
```

### GQL `partnerUpdate` Mutation

Updates partner.

### GQL `partnerAssociateBidList` Mutation

Associate or remove bid lists from a partner and enable or disable them for bidding.

### REST `PUT /v3/partner` 🔶 LEGACY

> Use the `partnerUpdate` mutation in GraphQL instead.

Update an existing partner.

### REST `POST /v3/partner/advertiser/bidlinecounts`

Paged query to retrieve the bidline counts for advertisers owned by a given partner. Maximum page size: 1,000.

### REST `GET /v3/partner/brand/{partnerId}`

Get the list of brands for a partner.

### REST `GET /v3/partner/{partnerId}` 🔶 LEGACY

> Use the `partner` query in GraphQL instead.

Get an existing partner by ID.

### REST `POST /v3/partner/query` 🔶 LEGACY

> Use the `partners` query in GraphQL instead.

Get all Partners that are accessible.

---

_End of Part 4 — Continue with Part 5 for: REDS · Right Media Offer Type · Seed · Seller · Supply Vendor · Supply Vendor Publisher · Third Party Data Rate · Third Party Data Taxonomy · Tracking · Tracking Tag · Universal Forecasting · Users · Weather Condition_
