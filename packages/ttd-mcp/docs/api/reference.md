# The Trade Desk Platform API Reference

> **Source:** [open.thetradedesk.com](https://open.thetradedesk.com/advertiser/docsApp/AdvertiserReferences/api/doc/ApiReferencePlatform)
> **Last documented:** 2026-05-14

The Platform API reference is an auto-generated alphabetical list of all platform operations, with the most up-to-date information. This reference describes the Platform API structure for both GraphQL operations and REST endpoints.

**Key conventions:**

- Both methods follow the same API token authentication.
- Both operations and endpoints are grouped by area (domain).
- Not all API domains support both REST and GraphQL options, and the two formats do not map to each other one-to-one.

**GraphQL operations:**

- Two types: `Query` (read data) and `Mutation` (create/update data).
- Each operation has a `GQL` tag.
- Each operation page includes a description, basic code snippet of required fields, arguments, type section, and entity section.

**REST endpoints:**

- Each endpoint starts with `/v3/`.
- Most endpoints are grouped by their area directly after `/v3/`, e.g. `/v3/advertiser/`.
- Endpoints follow REST convention with `GET`, `PUT`, `POST`, or `DELETE` tags.
- Endpoint properties have `SOLIMAR` and `KOKAI` labels to differentiate incompatible platform versions.
- Hidden endpoints may require additional access through your Technical Account Manager.

---

## Table of Contents

1. [Access Groups](#access-groups)
2. [Activity Log](#activity-log)
3. [Ad Format](#ad-format)
4. [Ad Group](#ad-group)
5. [Ad Technology](#ad-technology)
6. [Additional Fees](#additional-fees)
7. [Advertiser](#advertiser)
8. [Advertiser Merchant Permission](#advertiser-merchant-permission)
9. [Advertiser Product List](#advertiser-product-list)
10. [Advertiser Product List Tracking Tag](#advertiser-product-list-tracking-tag)
11. [Audience](#audience)
12. [Authentication](#authentication)
13. [Bid List](#bid-list)
14. [Campaign](#campaign)
15. [Campaign Flight](#campaign-flight)
16. [Campaign Group](#campaign-group)
17. [Category](#category)
18. [Category Taxonomy](#category-taxonomy)
19. [Comscore](#comscore)
20. [Content](#content)
21. [Contract](#contract)
22. [Contract Group](#contract-group)
23. [Creative](#creative)
24. [CRM Data](#crm-data)
25. [Cross Device](#cross-device)
26. [Currency](#currency)
27. [Custom Category](#custom-category)
28. [Custom Label](#custom-label)
29. [Data Group](#data-group)
30. [Delivery Profile](#delivery-profile)
31. [Delta](#delta)
32. [Device Make Model](#device-make-model)
33. [DMP](#dmp)
34. [Dynamic Creative Optimization](#dynamic-creative-optimization)
35. [Dynamic Parameter Retargeting](#dynamic-parameter-retargeting)
36. [Factual Proximity Design](#factual-proximity-design)
37. [Forecast](#forecast)
38. [Frequency Config](#frequency-config)
39. [Frequency Counter](#frequency-counter)
40. [Geo Event](#geo-event)
41. [Geo Segment](#geo-segment)
42. [Geo Target Segment](#geo-target-segment)
43. [Interest Targeting](#interest-targeting)
44. [Inventory Classification](#inventory-classification)
45. [IP Targeting List](#ip-targeting-list)
46. [Ispot](#ispot)
47. [Language](#language)
48. [Merchant Category](#merchant-category)
49. [Merchant Product](#merchant-product)
50. [Mobile Application](#mobile-application)
51. [Mobile Carrier](#mobile-carrier)
52. [My Reports](#my-reports)
53. [Nielsen](#nielsen)
54. [Offline Tracking Tag](#offline-tracking-tag)
55. [Overview](#overview)
56. [Partner](#partner)
57. [REDS](#reds)
58. [Right Media Offer Type](#right-media-offer-type)
59. [Seed](#seed)
60. [Seller](#seller)
61. [Supply Vendor](#supply-vendor)
62. [Supply Vendor Publisher](#supply-vendor-publisher)
63. [Third Party Data Rate](#third-party-data-rate)
64. [Third Party Data Taxonomy](#third-party-data-taxonomy)
65. [Tracking](#tracking)
66. [Tracking Tag](#tracking-tag)
67. [Universal Forecasting](#universal-forecasting)
68. [Users](#users)
69. [Weather Condition](#weather-condition)

---

## Access Groups

**URL:** `/advertiser/docsApp/AdvertiserReferences/api/area/Access%20Groups`

| Tag   | Operation                         | Description                  |
| ----- | --------------------------------- | ---------------------------- |
| `GQL` | `accessGroup` Query               | Get an access group by ID.   |
| `GQL` | `accessGroups` Query              | Get top level access groups. |
| `GQL` | `accessGroupUpdate` Mutation      | Update access group.         |
| `GQL` | `accessGroupDisable` Mutation     | Disable access group.        |
| `GQL` | `accessGroupEnable` Mutation      | Enable access group.         |
| `GQL` | `accessGroupBulkDisable` Mutation | Disable access group.        |
| `GQL` | `accessGroupBulkEnable` Mutation  | Bulk enable access group.    |
| `GQL` | `accessGroupCreateChild` Mutation | Create sub-access group.     |

---

## Activity Log

**URL:** `/advertiser/docsApp/AdvertiserReferences/api/area/Activity%20Log`

| Method | Endpoint                       | Description                                                                                                                                                                                            |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PUT`  | `/v3/activity`                 | Create or update the Note property for an existing activity log. Note is the only property that accepts changes. All other property updates are silently ignored.                                      |
| `GET`  | `/v3/activity/{activityLogId}` | Retrieve detail for an activity log entry by ActivityLogId.                                                                                                                                            |
| `POST` | `/v3/activity/query/adgroup`   | Retrieve and optionally filter a paged list of activity log entries for the specified ad group.                                                                                                        |
| `POST` | `/v3/activity/query/campaign`  | Retrieve and optionally filter a paged list of activity log entries for the specified campaign.                                                                                                        |
| `POST` | `/v3/activity/query/facets`    | Retrieve a summary of changed properties and usernames responsible for the changes within the specified date range for the specified ad group or campaign. Either AdGroupId or CampaignId is required. |

---

## Ad Format

**URL:** `/advertiser/docsApp/AdvertiserReferences/api/area/Ad%20Format`

| Method | Endpoint                    | Description                                       |
| ------ | --------------------------- | ------------------------------------------------- |
| `POST` | `/v3/adformat/query`        | Get the Ad Formats supported by The Trade Desk.   |
| `GET`  | `/v3/adformat/query/facets` | Get the facets of Ad Formats that can be queried. |

---

## Ad Group

**URL:** `/advertiser/docsApp/AdvertiserReferences/api/area/Ad%20Group`

| Tag    | Operation / Endpoint                         | Description                                                                                                      |
| ------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `GQL`  | `adGroup` Query                              | Get an existing ad group.                                                                                        |
| `GQL`  | `adGroups` Query                             | Get existing ad groups.                                                                                          |
| `GQL`  | `adGroupCreate` Mutation                     | Create an ad group.                                                                                              |
| `GQL`  | `adGroupUpdate` Mutation                     | Update an ad group.                                                                                              |
| `GQL`  | `adGroupSpendPrioritizationUpdate` Mutation  | Updates the ad group spend prioritization settings.                                                              |
| `POST` | `/v3/adgroup`                                | Create a new Ad Group.                                                                                           |
| `PUT`  | `/v3/adgroup`                                | Update an existing Ad Group.                                                                                     |
| `GET`  | `/v3/adgroup/{adGroupId}` `DEPRECATED`       | Get an existing Ad Group. (Use the `adGroup` GraphQL query instead.)                                             |
| `GET`  | `/v3/adgroup/analyticsreport/{adGroupId}`    | Get the analytics report(s) for an existing Ad Group.                                                            |
| `GET`  | `/v3/adgroup/koaapplieditems/{adGroupId}`    | Retrieve Koa optimizations applied to the specified ad group, including impact and last attempt details.         |
| `GET`  | `/v3/adgroup/koarecommendations/{adGroupId}` | Retrieve the current list of available optimizations recommended by Koa for the specified ad group.              |
| `POST` | `/v3/adgroup/query/advertiser` `DEPRECATED`  | Look up and optionally filter a list of ad groups for a specified advertiser. (Use `adGroups` query in GraphQL.) |
| `POST` | `/v3/adgroup/query/campaign` `DEPRECATED`    | Look up and optionally filter a list of ad groups for a specified campaign. (Use `adGroups` query in GraphQL.)   |
| `POST` | `/v3/adgroup/query/campaign/template`        | Look up and optionally filter a list of ad groups for a specified campaign template.                             |

---

## Ad Technology

**URL:** `/advertiser/docsApp/AdvertiserReferences/api/area/Ad%20Technology`

| Method | Endpoint                        | Description                                            |
| ------ | ------------------------------- | ------------------------------------------------------ |
| `POST` | `/v3/adtechnology/query`        | Get the available Ad Technologies.                     |
| `GET`  | `/v3/adtechnology/query/facets` | Get the facets of Ad Technologies that can be queried. |

---

## Additional Fees

**URL:** `/advertiser/docsApp/AdvertiserReferences/api/area/Additional%20Fees`

| Method | Endpoint                                           | Description                                                                                                                                                                                                           |
| ------ | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/v3/additionalfees`                               | Creates an additional fee card with the given properties. All creates/updates must be scheduled at least one hour in the future unless the fee rate card is created within two minutes of campaign/ad group creation. |
| `PUT`  | `/v3/additionalfees`                               | Updates the card with the given owner type/id. Overwrites any and all fees with the given fee list at that start time. Note: all updates must be scheduled at least one hour in the future.                           |
| `POST` | `/v3/additionalfees/changelog`                     | Returns a list of changes to the additional fee card made (or scheduled) between the start and end dates for the given owner type/id.                                                                                 |
| `GET`  | `/v3/additionalfees/defaultfeecard/{advertiserId}` | Returns the default fee card for the partner, useful for populating the InitialFeeCard property on the create campaign endpoint.                                                                                      |
| `GET`  | `/v3/additionalfees/{ownerType}/{ownerId}`         | Gets the current fee card for the given owner type/id.                                                                                                                                                                |
| `POST` | `/v3/additionalfees/stop`                          | Ends the card at the end date given. This cannot be undone. Note: all ends must be scheduled at least one hour in the future.                                                                                         |

---

## Advertiser

**URL:** `/advertiser/docsApp/AdvertiserReferences/api/area/Advertiser`

| Tag    | Operation / Endpoint                     | Description                                                                                                        |
| ------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `GQL`  | `advertiser` Query                       | Get an existing advertiser by ID.                                                                                  |
| `GQL`  | `advertisers` Query                      | Get existing advertisers.                                                                                          |
| `GQL`  | `advertiserCreate` Mutation              | Create a new advertiser.                                                                                           |
| `GQL`  | `advertiserUpdate` Mutation              | Update an advertiser.                                                                                              |
| `GQL`  | `advertiserDelta` Query                  | Get all changed advertisers for a partner since the last change-tracking version.                                  |
| `POST` | `/v3/advertiser/adgroup/bidlinecounts`   | Paged query to retrieve the bidline counts for adgroups owned by a given advertiser. Maximum page size: 1,000.     |
| `GET`  | `/v3/advertiser/{advertiserId}` `LEGACY` | Get an existing advertiser by ID. (Use the `advertiser` GraphQL query instead.)                                    |
| `POST` | `/v3/advertiser/query/partner` `LEGACY`  | Get Advertisers that belong to the specified Partner. (Use the `partner` query with filtering in GraphQL instead.) |

---

## Advertiser Merchant Permission

**URL:** `/advertiser/docsApp/AdvertiserReferences/api/area/Advertiser%20Merchant%20Permission`

| Method | Endpoint                          | Description                                                                                   |
| ------ | --------------------------------- | --------------------------------------------------------------------------------------------- |
| `POST` | `/v3/ecommerce/permission`        | Grant a brand or advertiser access to a merchant's data.                                      |
| `POST` | `/v3/ecommerce/permission/delete` | Remove an advertiser's access to the merchant's data.                                         |
| `POST` | `/v3/ecommerce/permission/query`  | Retrieve the details about the merchant's data and data usage that the advertiser can access. |

---

## Advertiser Product List

**URL:** `/advertiser/docsApp/AdvertiserReferences/api/area/Advertiser%20Product%20List`

| Method | Endpoint                             | Description                                                                                                                                |
| ------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST` | `/v3/ecommerce/list/batch`           | Create multiple lists for retargeting and measurement using a merchant's product data. Batch endpoint, supports partial success.           |
| `PUT`  | `/v3/ecommerce/list/batch`           | Update the names and/or descriptions of multiple product lists. Batch endpoint, supports partial success.                                  |
| `POST` | `/v3/ecommerce/list/batch/clone`     | Clone multiple product lists along with their contents (product SKUs from a merchant's catalog). Batch endpoint, supports partial success. |
| `POST` | `/v3/ecommerce/list/batch/query`     | Get the names and IDs of multiple product lists. Batch endpoint, supports partial success.                                                 |
| `POST` | `/v3/ecommerce/list/batch/delete`    | Delete multiple product lists. Batch endpoint, supports partial success.                                                                   |
| `PUT`  | `/v3/ecommerce/list/products/add`    | Add multiple SKUs from a merchant's catalog to a product list.                                                                             |
| `PUT`  | `/v3/ecommerce/list/products/remove` | Remove multiple SKUs from a product list.                                                                                                  |
| `PUT`  | `/v3/ecommerce/list/rules/add`       | Ensure the provided rules are applied to a dynamic list. Missing rules are created, existing ones are validated.                           |
| `POST` | `/v3/ecommerce/list/rules/query`     | Query rules applied to a dynamic list.                                                                                                     |
| `PUT`  | `/v3/ecommerce/list/rules/remove`    | Remove the specified rules applied to a dynamic list.                                                                                      |
| `POST` | `/v3/ecommerce/list/sku/batch/query` | Get SKUs of all products added to multiple product lists. Batch endpoint, supports partial success.                                        |
| `POST` | `/v3/ecommerce/list/targetingdata`   | Create multiple targeting data for a product list. Batch endpoint, supports partial success.                                               |
| `POST` | `/v3/ecommerce/list/trackingtag`     | Create product list tracking tags for merchant event names. Batch endpoint, supports partial success.                                      |

---

## Advertiser Product List Tracking Tag

**URL:** `/advertiser/docsApp/AdvertiserReferences/api/area/Advertiser%20Product%20List%20Tracking%20Tag`

| Method | Endpoint                                          | Description                                                                                                     |
| ------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `POST` | `/v3/ecommerce/campaigns/trackingtag/lists/query` | Get campaign IDs, tracking tags, product lists and their associated advertisers for a given merchant ID.        |
| `POST` | `/v3/ecommerce/trackingtag/lists/batch/query`     | Get the names and IDs of product lists for multiple tracking tag IDs. Batch endpoint, supports partial success. |
| `POST` | `/v3/ecommerce/trackingtag/lists/query`           | Get all tracking tags and their associated product lists for a given advertiser ID.                             |

---

## Audience

**URL:** `/advertiser/docsApp/AdvertiserReferences/api/area/Audience`

| Tag    | Operation / Endpoint                                  | Description                                                                                                                            |
| ------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `GQL`  | `audience` Query                                      | Get an existing audience by ID.                                                                                                        |
| `GQL`  | `audiences` Query                                     | Get existing audiences.                                                                                                                |
| `POST` | `/v3/audience`                                        | Create a new Audience.                                                                                                                 |
| `PUT`  | `/v3/audience`                                        | Update an existing Audience.                                                                                                           |
| `GET`  | `/v3/audience/{audienceId}`                           | Get an existing Audience by ID.                                                                                                        |
| `GET`  | `/v3/audience/{audienceId}/{geoForCounts}`            | Get an existing Audience by ID, and filter the returned counts by geo.                                                                 |
| `GET`  | `/v3/audience/availableaudienceacceleratorexclusions` | Retrieve the third-party data ID and name of the segments that you can add to the audience accelerator exclusions list of an ad group. |
| `POST` | `/v3/audience/insights/appssites`                     | Retrieve app and site audience insights for the specified audience and geographic areas.                                               |
| `POST` | `/v3/audience/insights/browser`                       | Retrieve browser insights for the specified audience and geographic areas.                                                             |
| `POST` | `/v3/audience/insights/geo`                           | Retrieve geo location audience insights for the specified audience and geographic areas.                                               |
| `POST` | `/v3/audience/insights/interests`                     | Retrieve interest audience insights for the specified audience and geographic areas.                                                   |
| `POST` | `/v3/audience/insights/marketmix`                     | Retrieve market mix for the specified audience and geographic areas.                                                                   |
| `POST` | `/v3/audience/insights/os`                            | Retrieve browser operating system for the specified audience and geographic areas.                                                     |
| `POST` | `/v3/audience/insights/privatecontract`               | Retrieve the private contract audience insights for the specified audience and geographic areas.                                       |
| `GET`  | `/v3/audience/name/{audienceId}`                      | Get the identifier and name for an Audience based on identifier.                                                                       |
| `POST` | `/v3/audience/query/advertiser`                       | Query for a page of Audiences within an Advertiser.                                                                                    |
| `GET`  | `/v3/audience/query/facets`                           | The facets of Audiences that can be queried.                                                                                           |

---

## Authentication

**URL:** `/advertiser/docsApp/AdvertiserReferences/api/area/Authentication`

| Method | Endpoint             | Description                                                                                                                                                                                                                       |
| ------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/v3/authentication` | Create and retrieve a short-lived API token with an expiration of up to 24 hours (1440 minutes). To create a long-lived API token, use the interactive UI available through the Manage API Tokens option in the Developer Portal. |

---

## Bid List

**URL:** `/advertiser/docsApp/AdvertiserReferences/api/area/Bid%20List`

| Tag      | Operation / Endpoint                                         | Description                                                                                            |
| -------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `GQL`    | `bidList` Query                                              | Get a bid list by ID.                                                                                  |
| `GQL`    | `bidListCreate` Mutation                                     | Create a bid list.                                                                                     |
| `GQL`    | `bidListUpdate` Mutation                                     | Updates a bid list; lets you set lines to add and lines to remove without specifying all bid lines.    |
| `GQL`    | `bidListSet` Mutation                                        | Updates a bid list by setting all lines to what is in the input.                                       |
| `GQL`    | `bidListDelete` Mutation                                     | Deletes a bid list.                                                                                    |
| `GQL`    | `adGroupAssociateBidList` Mutation                           | Associate or remove bid lists from an ad group and enable or disable them for bidding.                 |
| `GQL`    | `advertiserAssociateBidList` Mutation                        | Associate or remove bid lists from an advertiser and enable or disable them for bidding.               |
| `POST`   | `/v3/bidlist` `DEPRECATED`                                   | Create a bid list, returning the created bid list. (Use `bidListCreate` in GraphQL.)                   |
| `PUT`    | `/v3/bidlist` `DEPRECATED`                                   | Update the bid list for the given ID. (Use `bidListUpdate` in GraphQL.)                                |
| `POST`   | `/v3/bidlist/batch` `DEPRECATED`                             | Create multiple bid lists at once. (Use `bidListCreate` in GraphQL.)                                   |
| `PUT`    | `/v3/bidlist/batch` `DEPRECATED`                             | Update multiple bid lists at once. (Use `bidListUpdate` in GraphQL.)                                   |
| `GET`    | `/v3/bidlist/{bidListId}` `DEPRECATED`                       | Retrieve the content of a bid list including all bid dimension line items. (Use `bidList` in GraphQL.) |
| `DELETE` | `/v3/bidlist/{bidListId}` `DEPRECATED`                       | Delete a user bid list and its associations. (Use `bidListDelete` in GraphQL.)                         |
| `POST`   | `/v3/bidlist/query/unassociated`                             | Retrieve a paged list of unassociated bid lists at a given level of ownership.                         |
| `POST`   | `/v3/bidlistsummary/query/adgroup/available` `DEPRECATED`    | Retrieve a paged list of bid lists available to associate with the provided ad group.                  |
| `POST`   | `/v3/bidlistsummary/query/advertiser/available` `DEPRECATED` | Retrieve a paged list of bid lists available to associate with the provided advertiser.                |
| `POST`   | `/v3/bidlistsummary/query/campaign/available` `DEPRECATED`   | Retrieve a paged list of bid lists available to associate with the provided campaign.                  |
| `POST`   | `/v3/bidlistsummary/query/global`                            | Retrieve a paged list of global bid lists.                                                             |
| `POST`   | `/v3/bidlistsummary/query/partner/available` `DEPRECATED`    | Retrieve a paged list of bid lists available to associate with the provided partner.                   |

---

## Campaign

**URL:** `/advertiser/docsApp/AdvertiserReferences/api/area/Campaign`

| Tag    | Operation / Endpoint                     | Description                                                                                                                                                                          |
| ------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GQL`  | `campaignCreate` Mutation                | Create a new campaign.                                                                                                                                                               |
| `GQL`  | `campaign` Query                         | Get an existing campaign by ID.                                                                                                                                                      |
| `GQL`  | `campaigns` Query                        | Get existing campaigns.                                                                                                                                                              |
| `GQL`  | `campaignUpdate` Mutation                | Update a campaign.                                                                                                                                                                   |
| `GQL`  | `campaignBudgetSettingsUpdate` Mutation  | Updates the campaign budget settings.                                                                                                                                                |
| `GQL`  | `campaignClonesCreate` Mutation          | Clones the specified campaigns and their components. Returns an ID to track job progress. Requires Kokai access.                                                                     |
| `GQL`  | `campaignAssociateBidList` Mutation      | Associate or remove bid lists from a campaign and enable or disable them for bidding.                                                                                                |
| `GQL`  | `campaignVersionUpgrade` Mutation        | Upgrades the specified campaigns, performing necessary migrations in the process.                                                                                                    |
| `POST` | `/v3/campaign` `LEGACY`                  | Create a new campaign. (Use `campaignCreate` in GraphQL.)                                                                                                                            |
| `PUT`  | `/v3/campaign` `LEGACY`                  | Update an existing campaign. (Use `campaignUpdate` in GraphQL.)                                                                                                                      |
| `GET`  | `/v3/campaign/{campaignId}` `LEGACY`     | Get an existing campaign by ID. (Use `campaign` in GraphQL.)                                                                                                                         |
| `POST` | `/v3/campaign/query/advertiser` `LEGACY` | Get campaigns for a specified advertiser. (Use `campaigns` in GraphQL.)                                                                                                              |
| `POST` | `/v3/campaign/clone`                     | Clone a campaign. The API does not wait for completion. Check status via `GET /campaign/clone/status/{referenceId}`. NOTE: Cannot be used on campaigns with more than 500 ad groups. |
| `POST` | `/v3/campaign/template/query/advertiser` | Get a page of Campaign templates that belong to the specified Advertiser.                                                                                                            |

---

## Campaign Flight

**URL:** `/advertiser/docsApp/AdvertiserReferences/api/area/Campaign%20Flight`

| Tag      | Operation / Endpoint                             | Description                                                                                                                                                                                                                                        |
| -------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GQL`    | `campaignFlightCreate` Mutation                  | Create a campaign flight using the data specified in the input.                                                                                                                                                                                    |
| `GQL`    | `campaignFlightUpdate` Mutation                  | Updates a campaign flight using the data specified in the input.                                                                                                                                                                                   |
| `GQL`    | `campaignFlightDelete` Mutation                  | Deletes a campaign flight using the campaign flight ID provided in the input.                                                                                                                                                                      |
| `DELETE` | `/v3/campaignflight/{campaignFlightId}` `LEGACY` | Delete an existing campaign flight. Restrictions: only permits deleting past flights if it is the last flight; cannot delete the only flight in a campaign; cannot delete if the flight has already started spending; cannot delete a past flight. |

---

## Campaign Group

**URL:** `/advertiser/docsApp/AdvertiserReferences/api/area/Campaign%20Group`

| Tag   | Operation                               | Description                                                |
| ----- | --------------------------------------- | ---------------------------------------------------------- |
| `GQL` | `campaignGroup` Query                   | Get an existing campaign group by ID.                      |
| `GQL` | `campaignGroupCreate` Mutation          | Create a campaign group.                                   |
| `GQL` | `campaignGroupUpdate` Mutation          | Update a campaign group.                                   |
| `GQL` | `campaignGroupAttachCampaigns` Mutation | Attach provided campaigns to the specified campaign group. |
| `GQL` | `campaignGroupArchive` Mutation         | Archive the specified campaign group.                      |

---

## Category

**URL:** `/advertiser/docsApp/AdvertiserReferences/api/area/Category`

| Method | Endpoint                    | Description                                                                          |
| ------ | --------------------------- | ------------------------------------------------------------------------------------ |
| `POST` | `/v3/category/query`        | Retrieve a list of IDs within a category that can be used for dimensional targeting. |
| `GET`  | `/v3/category/query/facets` | Get a list of facets by which to query categories in a taxonomy.                     |

---

## Category Taxonomy

**URL:** `/advertiser/docsApp/AdvertiserReferences/api/area/Category%20Taxonomy`

| Method | Endpoint                                                                | Description                                                                                           |
| ------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `GET`  | `/v3/categorytaxonomy/{categoryTaxonomyId}/category/industrycategories` | Get a complete tree of industry categories, including root categories, for the specified taxonomy ID. |
| `GET`  | `/v3/categorytaxonomy/industrycategorytaxonomies`                       | Get a list of the available industry category taxonomies.                                             |

---

## Comscore

**URL:** `/advertiser/docsApp/AdvertiserReferences/api/area/Comscore`

| Method | Endpoint                                    | Description                                                                                        |
| ------ | ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `GET`  | `/v3/comscore/populationdemographicmembers` | Get the populations and the demographic members within them that might be targeted using Comscore. |

---

## Content

**URL:** `/advertiser/docsApp/AdvertiserReferences/api/area/Content`

| Method | Endpoint                   | Description                                       |
| ------ | -------------------------- | ------------------------------------------------- |
| `GET`  | `/v3/content/genre/query`  | Retrieve a list of all available content genres.  |
| `GET`  | `/v3/content/rating/query` | Retrieve a list of all available content ratings. |

---

## Contract

**URL:** `/advertiser/docsApp/AdvertiserReferences/api/area/Contract`

| Method | Endpoint                                    | Description                                                                                           |
| ------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `POST` | `/v3/contract`                              | Create a new Contract.                                                                                |
| `PUT`  | `/v3/contract`                              | Update an existing Contract.                                                                          |
| `POST` | `/v3/contract/buyers/query/advertisers`     | Query for Advertisers that may act as buyers of Contracts offered by the chosen Partner.              |
| `POST` | `/v3/contract/buyers/query/partners`        | Query for info about all Partners that may act as buyers for Contracts offered by the chosen Partner. |
| `GET`  | `/v3/contract/{contractId}`                 | Get an existing Contract.                                                                             |
| `GET`  | `/v3/contract/name/{contractId}`            | Get the identifier and name for a Contract based on identifier.                                       |
| `POST` | `/v3/contract/query/advertiser/available`   | Query for a page of Contracts available for the chosen Advertiser to buy.                             |
| `POST` | `/v3/contract/query/deliveryprofile`        | Query for a page of Contracts associated with a specified DeliveryProfileId.                          |
| `POST` | `/v3/contract/query/partner`                | Query for a page of Contracts owned by the chosen Partner.                                            |
| `POST` | `/v3/contract/query/supplyvendordeal`       | Query for a page of Contracts associated with the specific SupplyVendorDealId.                        |
| `POST` | `/v3/contract/report/impressions/available` | Query for a page of an Available Impressions Report for a specific Contract.                          |

---

## Contract Group

**URL:** `/advertiser/docsApp/AdvertiserReferences/api/area/Contract%20Group`

| Method | Endpoint                                         | Description                                                                        |
| ------ | ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `POST` | `/v3/contractgroup`                              | Create a new Contract Group.                                                       |
| `PUT`  | `/v3/contractgroup`                              | Update an existing Contract Group.                                                 |
| `GET`  | `/v3/contractgroup/{contractGroupId}`            | Get an existing Contract Group.                                                    |
| `GET`  | `/v3/contractgroup/name/{contractGroupId}`       | Get the identifier and name for a Contract Group based on identifier.              |
| `POST` | `/v3/contractgroup/query/advertiser/available`   | Get the page of Contract Groups that a specific Advertiser is allowed to buy.      |
| `POST` | `/v3/contractgroup/query/deliveryprofile`        | Query for a page of Contract Groups associated with a specified DeliveryProfileId. |
| `POST` | `/v3/contractgroup/query/partner`                | Get the page of Contract Groups owned by Partner.                                  |
| `POST` | `/v3/contractgroup/report/impressions/available` | Query for a page of an Available Impressions Report for a specific Contract Group. |

---

## Creative

**URL:** `/advertiser/docsApp/AdvertiserReferences/api/area/Creative`

| Tag    | Operation / Endpoint                             | Description                                                             |
| ------ | ------------------------------------------------ | ----------------------------------------------------------------------- |
| `GQL`  | `creative` Query                                 | Get a creative.                                                         |
| `GQL`  | `creatives` Query                                | Get creatives.                                                          |
| `GQL`  | `creativeCreate` Mutation                        | Create a single creative.                                               |
| `GQL`  | `creativeCreatePresignedUrlGenerate` Mutation    | Generate a presigned URL for a single creative upload.                  |
| `GQL`  | `creativeUpdate` Mutation                        | Update Creative.                                                        |
| `GQL`  | `creativeAdGroupAssociate` Mutation              | Associate adgroups with the specified creative.                         |
| `GQL`  | `adGroupCreativeSettingsUpdate` Mutation         | Set the ad group creative settings for the ad group.                    |
| `POST` | `/v3/creative`                                   | Create a new creative.                                                  |
| `PUT`  | `/v3/creative`                                   | Update an existing creative.                                            |
| `GET`  | `/v3/creative/{creativeId}`                      | Get a creative.                                                         |
| `POST` | `/v3/creative/generateuploadurlforaudiocreative` | Generates a URL for uploading audio files before calling POST creative. |
| `POST` | `/v3/creative/generateuploadurlforvideocreative` | Generates a URL for uploading video files before calling POST creative. |
| `GET`  | `/v3/creative/name/{creativeId}`                 | Get the identifier and name for a Creative based on identifier.         |
| `POST` | `/v3/creative/query/advertiser`                  | Get a page of Creatives that belong to the specified Advertiser.        |
| `GET`  | `/v3/creative/query/facets`                      | Get the facets of Creatives that can be queried.                        |

---

## CRM Data

**URL:** `/advertiser/docsApp/AdvertiserReferences/api/area/Crm%20Data`

| Method   | Endpoint                                                                     | Description                                                            |
| -------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `POST`   | `/v3/crmdata/segment`                                                        | Create a new CRM data segment.                                         |
| `POST`   | `/v3/crmdata/{segmentType}/segment`                                          | Create a new CRM data segment (by segment type).                       |
| `POST`   | `/v3/crmdata/{segmentType}/segment/{advertiserId}/{crmDataId}`               | Create a new drop for a CRM data segment.                              |
| `GET`    | `/v3/crmdata/{segmentType}/segment/{advertiserId}/{crmDataId}`               | Retrieve the status of a CRM data segment.                             |
| `GET`    | `/v3/crmdata/{segmentType}/segment/{advertiserId}/{crmDataId}/{referenceId}` | Check the processing status of a CRM data drop (upload for a segment). |
| `GET`    | `/v3/crmdata/segment/{advertiserId}`                                         | Retrieve all CRM data segments for the specified advertiser.           |
| `DELETE` | `/v3/crmdata/segment/{advertiserId}/{crmDataId}`                             | Delete a segment and purge its data.                                   |
| `GET`    | `/v3/crmdata/segment/{advertiserId}/{crmDataId}/{referenceId}`               | Check the processing status of a CRM data drop (upload for a segment). |

---

## Cross Device

**URL:** `/advertiser/docsApp/AdvertiserReferences/api/area/Cross%20Device`

| Method | Endpoint                                           | Description                                                                                                                             |
| ------ | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/v3/crossdeviceattributionmodel/query/advertiser` | Query for a page of Cross Device Attribution Models available for an advertiser. Sorted in ascending order of Model Name by default.    |
| `POST` | `/v3/crossdevicevendor/query/advertiser`           | Query for a page of Cross Device Vendors available for an advertiser. Sorted in ascending order of Cross Device Vendor Name by default. |

---

## Currency

**URL:** `/advertiser/docsApp/AdvertiserReferences/api/area/Currency`

| Tag    | Operation / Endpoint        | Description                                       |
| ------ | --------------------------- | ------------------------------------------------- |
| `GQL`  | `currencies` Query          | Get a list of available currencies.               |
| `POST` | `/v3/currency/query`        | Get the currencies supported by The Trade Desk.   |
| `GET`  | `/v3/currency/query/facets` | Get the facets of Currencies that can be queried. |

---

## Custom Category

**URL:** `/advertiser/docsApp/AdvertiserReferences/api/area/Custom%20Category`

| Method   | Endpoint                                       | Description                                                                                                                    |
| -------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `POST`   | `/v3/customcategory`                           | Create a contextual custom category (TTD contextual only; for third-party or direct URL targeting, request separate access).   |
| `PUT`    | `/v3/customcategory`                           | Update the keywords or the language code of an existing contextual custom category.                                            |
| `GET`    | `/v3/customcategory/advertiser/{advertiserId}` | Retrieve a list of all TTD contextual custom categories that belong to a specific advertiser.                                  |
| `GET`    | `/v3/customcategory/{customCategoryId}`        | Get an existing TTD contextual custom category.                                                                                |
| `DELETE` | `/v3/customcategory/{customCategoryId}`        | Delete an existing custom category. Will not remove from any bid lists of ad groups.                                           |
| `GET`    | `/v3/customcategory/name/{customCategoryId}`   | Get the identifier and name for a custom category by type and data provider.                                                   |
| `POST`   | `/v3/customcategory/rename`                    | Rename an existing custom category.                                                                                            |
| `GET`    | `/v3/customcategory/ttd/languages`             | Retrieve the names and codes of supported languages for matching TTD contextual custom category keywords to webpages and apps. |

---

## Custom Label

**URL:** `/advertiser/docsApp/AdvertiserReferences/api/area/Custom%20Label`

| Method | Endpoint                    | Description                                                                                                                                     |
| ------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/v3/label`                 | Creates a new Custom Label. Once added, labels can be applied to Advertisers, Campaigns, and Ad Groups via their respective POST/PUT endpoints. |
| `GET`  | `/v3/label/{customLabelId}` | Gets a Custom Label.                                                                                                                            |
| `POST` | `/v3/label/query/partner`   | Gets all Custom Labels for a Partner.                                                                                                           |

---

## Data Group

**URL:** `/advertiser/docsApp/AdvertiserReferences/api/area/Data%20Group`

| Method | Endpoint                                     | Description                                                        |
| ------ | -------------------------------------------- | ------------------------------------------------------------------ |
| `POST` | `/v3/datagroup`                              | Create a new Data Group.                                           |
| `PUT`  | `/v3/datagroup`                              | Update an existing Data Group.                                     |
| `GET`  | `/v3/datagroup/{dataGroupId}`                | Get an existing Data Group.                                        |
| `GET`  | `/v3/datagroup/{dataGroupId}/{geoForCounts}` | Get an existing Data Group, and filter the returned counts by geo. |
| `GET`  | `/v3/datagroup/name/{dataGroupId}`           | Get the identifier and name for a DataGroup based on identifier.   |
| `POST` | `/v3/datagroup/query/advertiser`             | Get a page of Data Groups that belong to the specified Advertiser. |
| `GET`  | `/v3/datagroup/query/facets`                 | Get the facets of Data Groups that can be queried.                 |

---

## Delivery Profile

**URL:** `/advertiser/docsApp/AdvertiserReferences/api/area/Delivery%20Profile`

| Method | Endpoint                                       | Description                                                             |
| ------ | ---------------------------------------------- | ----------------------------------------------------------------------- |
| `POST` | `/v3/deliveryProfile`                          | Create a new DeliveryProfile.                                           |
| `PUT`  | `/v3/deliveryProfile`                          | Update an existing DeliveryProfile.                                     |
| `GET`  | `/v3/deliveryProfile/{deliveryProfileId}`      | Get an existing DeliveryProfile.                                        |
| `POST` | `/v3/deliveryProfile/query/partner`            | Query for a page of Delivery Profiles available to the chosen Partners. |
| `GET`  | `/v3/deliveryprofile/name/{deliveryProfileId}` | Get the identifier and name for a DeliveryProfile based on identifier.  |
| `GET`  | `/v3/deliveryprofile/query/facets`             | Get the facets of DeliveryProfiles that can be used in queries.         |

---

## Delta

**URL:** `/advertiser/docsApp/AdvertiserReferences/api/area/Delta`

| Tag    | Operation / Endpoint                          | Description                                                                                                                      |
| ------ | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `GQL`  | `adGroupDelta` Query                          | Get all changed ad groups for an advertiser or campaign since the last change-tracking version.                                  |
| `GQL`  | `campaignDelta` Query                         | Get all changed campaigns for an advertiser since the last change-tracking version.                                              |
| `GQL`  | `creativeDelta` Query                         | Get all changed creatives for an advertiser since the last change-tracking version.                                              |
| `GQL`  | `trackingTagDelta` Query                      | Get all changed tracking tags for an advertiser since the last change-tracking version.                                          |
| `POST` | `/v3/delta/activity/query/adgroup`            | Retrieve a list of IDs of all activity logs for the specified ad group that were updated since the last change tracking version. |
| `POST` | `/v3/delta/adgroup/query/advertiser` `LEGACY` | Retrieve a list of IDs of ad groups that were modified since the last change tracking version. (Use `adGroupDelta` in GraphQL.)  |
| `POST` | `/v3/delta/bidlist/query/partner`             | Retrieve a list of IDs of partner bid lists that were modified since the last change                                             |
