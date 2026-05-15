# The Trade Desk Platform API Reference — Part 3 of 5
> Source: https://open.thetradedesk.com/advertiser/docsApp/AdvertiserReferences/api/doc/ApiReferencePlatform
> Generated: 2026-05-14
> Coverage: Device Make Model · DMP · Dynamic Creative Optimization · Dynamic Parameter Retargeting · Factual Proximity Design · Forecast · Frequency Config · Frequency Counter · Geo Event · Geo Segment · Geo Target Segment · Interest Targeting · Inventory Classification · IP Targeting List

---

## 32. Device Make Model

**Area URL:** `/api/area/Device%20Make%20Model`

### REST `POST /v3/devicemakemodel/query`
Get the device makes and models supported by The Trade Desk.

**Request Body:** Standard paged query with optional `SearchTerms` and `SortFields`.

**Response Fields:**

| Field | Type | Description |
|---|---|---|
| DeviceMakeModelId | string | The ID of the device make/model. |
| DeviceMake | string | The device manufacturer (e.g., Apple, Samsung). |
| DeviceModel | string | The device model name. |
| DeviceType | string | Type of device (e.g., Phone, Tablet). |

---

## 33. DMP

**Area URL:** `/api/area/DMP`

The DMP (Data Management Platform) area covers both first-party and third-party data segment operations.

### GQL `firstPartyDataDelta` Query
Get all changed first-party data for an advertiser since the last change-tracking version.

### GQL `thirdPartyData` Query
Get a third-party data segment by ID.

```graphql
thirdPartyData(id: ID!): ThirdPartyData
```

### GQL `thirdPartyDatas` Query
Get third-party data segments.

```graphql
thirdPartyDatas(after: String, before: String, first: Int, last: Int, order: [...], where: ...): ThirdPartyDatasConnection
```

### GQL `thirdPartyDataProvider` Query
Gets a third-party data provider by provider ID.

### GQL `thirdPartyDataProviders` Query
Get third-party data providers.

### REST `POST /v3/dmp/firstparty/advertiser` ⚠️ DEPRECATED
> Use the `advertiser → firstPartyData` query with filtering in GraphQL instead.

Retrieve first-party data for a given advertiser ID.

### REST `GET /v3/dmp/firstparty/facets`
Get the facets of first-party data that can be queried.

### REST `GET /v3/dmp/lookalikemodel/build/{firstPartyDataId}`
Build a Look-Alike model for the specified first-party data. The model must be `Ready` before using the look-alike query endpoint.

**Path Parameters:**

| Field | Type | Description |
|---|---|---|
| firstPartyDataId | string | The ID of the first-party data segment to build a model for. |

### REST `GET /v3/dmp/lookalikemodel/{firstPartyDataId}`
Get the status of a Look-Alike model.

**Look-Alike Model Build Status values:** `Ready`, `Queued`, `Building`, `Failed`.

### REST `GET /v3/dmp/lookalikethirdpartydata/facets/{advertiserId}`
Get the facets by which Look-Alike Third Party data may be retrieved/queried.

### REST `POST /v3/dmp/lookalikethirdpartydata/query`
Retrieve Third Party Data that is statistically similar to the First Party Data. Model must be `Ready` before calling.

> **Note:** Do not request look-alikes for models with `Queued` status as you may receive outdated data. Models are re-generated periodically.

### REST `POST /v3/dmp/thirdparty/advertiser` ⚠️ DEPRECATED
> Use the `thirdPartyDatas` query in GraphQL instead.

Retrieve third-party data that matches the request.

> **Important:** Segments are returned only if either active ID or received ID count is not null and greater than zero.

---

## 34. Dynamic Creative Optimization

**Area URL:** `/api/area/Dynamic%20Creative%20Optimization`

### REST `POST /v3/dynamiccreativerule`
Create a new dynamic creative rule that can be attached to a creative.

> For more details, log into the platform and view the Dynamic Creative Rules Knowledge Portal article.

**Key Request Fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| AdvertiserId | string | REQUIRED | Platform ID of the owning advertiser. |
| Name | string | REQUIRED | Name of the rule. |
| Description | string | optional | Description of the rule. |
| RuleType | string | REQUIRED | Type of dynamic creative rule. |

### REST `PUT /v3/dynamiccreativerule`
Update an existing dynamic creative rule.

### REST `GET /v3/dynamiccreativerule/{dynamicCreativeRuleId}`
Retrieve the details for an existing dynamic creative rule.

### REST `POST /v3/dynamiccreativerule/query/advertiser`
Retrieve a paged, sortable and filterable list of dynamic creative rules owned by a specific advertiser.

Use `GET /dynamiccreativerule/query/facets` to look up properties available for sorting.

### REST `GET /v3/dynamiccreativerule/query/facets`
Retrieve the dynamic creative rule properties that can be used for sorting on the POST query/advertiser endpoint.

---

## 35. Dynamic Parameter Retargeting

**Area URL:** `/api/area/Dynamic%20Parameter%20Retargeting`

### REST `POST /v3/dynamicparameterretargeting`
Create a Dynamic Parameter Retargeting rule.

### REST `PUT /v3/dynamicparameterretargeting`
Edit a Dynamic Parameter Retargeting rule.

### REST `POST /v3/dynamicparameterretargeting/archive`
Archive Dynamic Parameter Retargeting rules (based on a list of IDs) for a given advertiser.

### REST `POST /v3/dynamicparameterretargeting/query/advertiser`
Query for a page of Dynamic Parameter Retargeting Rules within an Advertiser.

### REST `GET /v3/dynamicparameterretargeting/query/facets`
Get the facets of Dynamic Parameter Retargeting that can be queried.

### REST `GET /v3/dynamicparameterretargeting/{ruleId}`
Get a Dynamic Parameter Retargeting rule.

---

## 36. Factual Proximity Design

**Area URL:** `/api/area/Factual%20Proximity%20Design`

### REST `POST /v3/factualproximitydesign/query/partner`
Get the FactualProximityDesigns associated with a partner.

**Request Body:** Standard paged query with `PartnerId` (required).

---

## 37. Forecast

**Area URL:** `/api/area/Forecast`

### GQL `forecastCreate` Mutation
Create Forecast.

```graphql
forecastCreate(input: ForecastCreateInput!): PayloadWithErrorsOfForecast!
```

### GQL `forecastAssociateBidList` Mutation
Associate Bid List with Forecast.

### GQL `forecastSettingsUpdate` Mutation
Update forecast settings.

---

## 38. Frequency Config

**Area URL:** `/api/area/Frequency%20Config`

Frequency Config endpoints streamline the creation and management of frequency counters and their associated bid lists.

### REST `POST /v3/frequency/config`
Create a frequency configuration. Streamlines:
- Creating a frequency counter
- Associating entities to increment the counter
- Applying the frequency configuration to bid lists
- Associating bid lists to entities

See also: Basic Frequency Configuration Guidelines.

**Key Request Fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| Name | string | REQUIRED | Name of the frequency configuration. |
| CounterType | string | REQUIRED | Type of frequency counter. |
| MaxImpressions | integer | REQUIRED | Maximum impression count. |
| TimeWindowInMinutes | integer | REQUIRED | Time window for the frequency cap in minutes. |
| OwnerType | string | REQUIRED | Owner type (e.g., Advertiser, Campaign, AdGroup). |
| OwnerId | string | REQUIRED | Platform ID of the owner. |

### REST `PUT /v3/frequency/config`
Update a frequency configuration.

### REST `GET /v3/frequency/config/{counterId}`
Retrieve the frequency configuration for the specified counter ID. Returns frequency counter info, entities associated to increment the counter, and bid lists.

### REST `DELETE /v3/frequency/config/{counterId}`
Delete a frequency configuration.

### REST `POST /v3/frequency/config/query`
Retrieve a paged, sorted, and filterable list of frequency configurations.

### REST `POST /v3/frequency/config/query/bidlist`
Retrieve a paged, sorted, and filterable list of frequency configurations for specified bid list IDs.

### REST `POST /v3/frequency/config/query/counter`
Retrieve a paged, sorted, and filterable list of frequency configurations for specified frequency counter IDs.

---

## 39. Frequency Counter

**Area URL:** `/api/area/Frequency%20Counter`

### REST `POST /v3/frequency/counter`
Create a frequency counter, returning the created counter.

**Key Request Fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| Name | string | REQUIRED | Name of the frequency counter. |
| CounterType | string | REQUIRED | Type of counter (e.g., `Impression`, `Click`). |
| OwnerType | string | REQUIRED | Owner type (Advertiser, Campaign, AdGroup). |
| OwnerId | string | REQUIRED | Platform ID of the owner. |

### REST `PUT /v3/frequency/counter`
Update a frequency counter, returning the updated counter.

### REST `GET /v3/frequency/counter/{counterId}`
Gets the frequency counter definition.

### REST `POST /v3/frequency/counter/query`
Retrieve a paged, sorted, and filterable list of frequency counters for a specific advertiser or partner.

---

## 40. Geo Event

**Area URL:** `/api/area/Geo%20Event`

### REST `PUT /v3/geoevent`
Update an existing geo event. Currently allows setting of locations only — does not support event name updates.

**Key Request Fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| ProviderId | string | REQUIRED | The provider ID. |
| GeoEventId | string | REQUIRED | The geo event ID. |
| Locations | object[] | REQUIRED | List of geo locations to set for this event. |

### REST `GET /v3/geoevent/{providerId}/{geoEventId}`
Get an existing geo event.

**Path Parameters:**

| Field | Type | Description |
|---|---|---|
| providerId | string | The provider ID. |
| geoEventId | string | The geo event ID. |

---

## 41. Geo Segment

**Area URL:** `/api/area/Geo%20Segment`

### REST `GET /v3/geosegment/name/{geoSegmentId}`
Get the identifier and name for a GeoSegment based on identifier.

### REST `POST /v3/geosegment/query/advertiser`
Query Geo Segments for use by an Advertiser.

### REST `GET /v3/geosegment/query/facets`
Get the facets of Geo Segments that can be queried.

### REST `POST /v3/geosegment/query/partner`
Query Geo Segments available for all advertisers for a partner.

---

## 42. Geo Target Segment

**Area URL:** `/api/area/Geo%20Target%20Segment`

### REST `POST /v3/geotargetsegment/addgeotargets/{providerId}/{providerElementId}`
Add specified points or polygons to a geo target segment. Limit: 10,000 points or polygons per request. Submit multiple requests for more than 10,000.

### REST `POST /v3/geotargetsegment/cleargeotargets/{providerId}/{providerElementId}`
Clear all points or polygons from a geo target segment.

### REST `POST /v3/geotargetsegment/deletegeotargets/{providerId}/{providerElementId}`
Delete specified points or polygons from a geo target segment. Limit: 10,000 points or polygons per request.

### REST `POST /v3/geotargetsegment/generatepolygonfileuploadurl/{providerId}/{fileName}`
Get an AWS S3 upload URL for adding a polygon file.

For polygon file requirements, rate limits, and other details, see Geotargeting Data Integration.

### REST `GET /v3/geotargetsegment/{providerId}/{providerElementId}`
Get an existing geo target segment.

---

## 43. Interest Targeting

**Area URL:** `/api/area/Interest%20Targeting`

### REST `GET /v3/interesttargeting/query`
Get the codes and names of targetable Interest Categories. No request parameters required.

**Response Fields:**

| Field | Type | Description |
|---|---|---|
| InterestCategoryId | string | The ID of the interest category. |
| InterestCategoryName | string | The name of the interest category. |

---

## 44. Inventory Classification

**Area URL:** `/api/area/Inventory%20Classification`

### REST `POST /v3/inventoryclassification/domainclasses/query`
Retrieve a list of domain classes.

> **Important:** Per Marketplace Quality policies, enumeration of this data is not allowed. Use this endpoint only to check a single entry, not to retrieve the entire list.

Domain classes allow restricting spend on specific types of inventory unless the buyer explicitly opts in. They are more transparent and flexible than exclusion lists.

If a domain has a class set to block spend, only ad groups using domain targeting, seller targeting, or a single-publisher private contract can bid on it.

### REST `GET /v3/inventoryclassification/name/{domainClassId}`
Get the identifier and name for a DomainClass based on identifier.

### REST `POST /v3/inventoryclassification/query`
Retrieve a list of domains, apps, or app names that match the SearchTerm, along with their statuses. Returns a maximum of 500 results.

**Key Request Fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| SearchTerm | string | REQUIRED | The domain, app, or app name to search for. |

---

## 45. IP Targeting List

**Area URL:** `/api/area/IP%20Targeting%20List`

Each Advertiser has a quota for the total number of IP targeting ranges across all their IP Targeting Lists.

### REST `POST /v3/iptargetinglist`
Create a new IP Targeting List.

> Returns an IP Targeting List Summary on success (not the full list) for efficiency.
> If creating the list would exceed the advertiser's overall quota, the list will not be created and an error will be returned.

**Key Request Fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| AdvertiserId | string | REQUIRED | Platform ID of the owning advertiser. |
| Name | string | REQUIRED | Name of the IP Targeting List. |
| IpRanges | string[] | REQUIRED | List of IP address ranges (CIDR notation). |

### REST `PUT /v3/iptargetinglist`
Update an existing IP Targeting List.

> Returns an IP Targeting List Summary on success.
> If updating would exceed the advertiser's quota, the update will not be applied.

### REST `GET /v3/iptargetinglist/{ipTargetingListId}`
Get an existing IP Targeting List.

### REST `POST /v3/iptargetinglist/query/advertiser`
Get a page of summaries of IP Targeting Lists that belong to the specified Advertiser.

### REST `GET /v3/iptargetinglist/query/facets`
Get the facets of IP Targeting Lists that can be queried.

### REST `GET /v3/iptargetinglist/usage/{advertiserId}`
Get the cumulative IP Targeting Lists usage for an Advertiser (current usage vs. quota).

---

*End of Part 3 — Continue with Part 4 for: Ispot · Language · Merchant Category · Merchant Product · Mobile Application · Mobile Carrier · My Reports · Nielsen · Offline Tracking Tag · Overview · Partner*
