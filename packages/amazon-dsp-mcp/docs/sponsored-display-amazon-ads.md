# Sponsored Display Amazon Ads API Documentation

> **API:** Amazon Ads API v1  
> **Version:** 1  
> **Spec:** OAS 3.0.1  
> **Source:** https://advertising.amazon.com/API/docs/en-us/amazon-ads/1-0/apis  
> **Product:** Sponsored Display

---

## Common Headers

All endpoints require the following HTTP headers:

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `Amazon-Ads-AccountId` | string | No | The identifier of an Amazon Ads Advertiser Account. |
| `Amazon-Ads-ClientId` | string | **Yes** | The identifier of a client associated with a 'Login with Amazon' account. |
| `Amazon-Advertising-API-Scope` | string | No | The identifier of a profile associated with the advertiser account. Use GET method on Profiles resource to list profiles associated with the access token passed in the HTTP Authorization header and choose profile id `profileId` from the response to pass it as input. |

**Authorization:** OAuth2

---

## Common Response Codes

| Code | Meaning |
|------|---------|
| `200` | OK |
| `207` | Multi-Status |
| `400` | Bad Request |
| `401` | Unauthorized |
| `403` | Forbidden |
| `404` | Not Found |
| `413` | Content Too Large |
| `429` | Too Many Requests |
| `500` | Internal Server Error |
| `502` | Bad Gateway |
| `503` | Service Unavailable |
| `504` | Gateway Timeout |

> **Note:** Batch size limits are specific to each ad product. Refer to the ad-product-specific documentation for applicable limits.

---

## AdGroups

Operations for creating, deleting, querying, and updating Sponsored Display ad groups.

---

### SDCreateAdGroup

**`POST`** `/adsApi/v1/create/adGroups`

Create ad groups.

**Required Permissions:** `advertiser_campaign_edit` | `campaign_edit` | `dsp_campaign_edit`

#### Request Body Schema: `application/json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `adGroups` | Array of objects (`SDAdGroupCreate`) | No | Array of ad groups to create. [ 1 .. 100 ] items |

#### Request Sample

```json
{
  "adGroups": [
    {}
  ]
}
```

#### Response Codes

| Code | Description |
|------|-------------|
| `207` | SDCreateAdGroup 207 response |
| `400` | BadRequest |
| `401` | Unauthorized |
| `403` | Forbidden |
| `404` | NotFound |
| `413` | ContentTooLarge |
| `429` | TooManyRequests |
| `500` | InternalServerError |
| `502` | BadGateway |
| `503` | ServiceUnavailableError |
| `504` | GatewayTimeout |

#### Response Sample (207)

```json
{
  "error": [{}],
  "success": [{}]
}
```

---

### SDDeleteAdGroup

**`POST`** `/adsApi/v1/delete/adGroups`

Delete ad groups.

**Required Permissions:** `advertiser_campaign_edit`

#### Request Body Schema: `application/json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `adGroupIds` | Array of strings | No | IDs of the ad groups to delete. [ 1 .. 100 ] items |

#### Request Sample

```json
{
  "adGroupIds": [
    "string"
  ]
}
```

#### Response Codes

| Code | Description |
|------|-------------|
| `207` | SDDeleteAdGroup 207 response |
| `400` | BadRequest |
| `401` | Unauthorized |
| `403` | Forbidden |
| `404` | NotFound |
| `413` | ContentTooLarge |
| `429` | TooManyRequests |
| `500` | InternalServerError |
| `502` | BadGateway |
| `503` | ServiceUnavailableError |
| `504` | GatewayTimeout |

#### Response Sample (207)

```json
{
  "error": [{}],
  "success": [{}]
}
```

---

### SDQueryAdGroup

**`POST`** `/adsApi/v1/query/adGroups`

List ad groups.

**Required Permissions:** `advertiser_campaign_edit` | `dsp_campaign_view` | `campaign_view` | `advertiser_campaign_view`

#### Request Body Schema: `application/json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `adGroupIdFilter` | object (`SDAdGroupAdGroupIdFilter`) | No | Filter by ad group IDs. |
| `adProductFilter` | object (`SDAdGroupAdProductFilter`) | **Yes** | Filter by ad product. |
| `campaignIdFilter` | object (`SDAdGroupCampaignIdFilter`) | No | Filter by campaign IDs. |
| `maxResults` | integer `<int32>` [ 1 .. 100 ] | No | Maximum number of results. Default: `100` |
| `nameFilter` | object (`SDAdGroupNameFilter`) | No | Filter by ad group name. |
| `nextToken` | string | No | Pagination token for retrieving the next page of results. |
| `stateFilter` | object (`SDAdGroupStateFilter`) | No | Filter by ad group state. |

#### Request Sample

```json
{
  "adGroupIdFilter": {
    "include": []
  },
  "adProductFilter": {
    "include": []
  },
  "campaignIdFilter": {
    "include": []
  },
  "maxResults": 100,
  "nameFilter": {
    "include": [],
    "queryTermMatchType": "BROAD_MATCH"
  },
  "nextToken": "string",
  "stateFilter": {
    "include": []
  }
}
```

#### Response Codes

| Code | Description |
|------|-------------|
| `200` | SDQueryAdGroup 200 response |
| `400` | BadRequest |
| `401` | Unauthorized |
| `403` | Forbidden |
| `404` | NotFound |
| `413` | ContentTooLarge |
| `429` | TooManyRequests |
| `500` | InternalServerError |
| `502` | BadGateway |
| `503` | ServiceUnavailableError |
| `504` | GatewayTimeout |

#### Response Sample (200)

```json
{
  "adGroups": [{}],
  "nextToken": "string"
}
```

---

### SDUpdateAdGroup

**`POST`** `/adsApi/v1/update/adGroups`

Update ad groups.

**Required Permissions:** `advertiser_campaign_edit` | `campaign_edit` | `dsp_campaign_edit`

#### Request Body Schema: `application/json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `adGroups` | Array of objects (`SDAdGroupUpdate`) | No | Array of ad groups to update. [ 1 .. 100 ] items |

#### Request Sample

```json
{
  "adGroups": [
    {}
  ]
}
```

#### Response Codes

| Code | Description |
|------|-------------|
| `207` | SDUpdateAdGroup 207 response |
| `400` | BadRequest |
| `401` | Unauthorized |
| `403` | Forbidden |
| `404` | NotFound |
| `413` | ContentTooLarge |
| `429` | TooManyRequests |
| `500` | InternalServerError |
| `502` | BadGateway |
| `503` | ServiceUnavailableError |
| `504` | GatewayTimeout |

#### Response Sample (207)

```json
{
  "error": [{}],
  "success": [{}]
}
```

---

## Ads

Operations for creating, deleting, querying, and updating Sponsored Display ads.

---

### SDCreateAd

**`POST`** `/adsApi/v1/create/ads`

Create ads.

**Required Permissions:** `advertiser_campaign_edit` | `creatives_edit`

#### Request Body Schema: `application/json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ads` | Array of objects (`SDAdCreate`) | No | Array of ads to create. [ 1 .. 100 ] items |

#### Request Sample

```json
{
  "ads": [
    {}
  ]
}
```

#### Response Codes

| Code | Description |
|------|-------------|
| `207` | SDCreateAd 207 response |
| `400` | BadRequest |
| `401` | Unauthorized |
| `403` | Forbidden |
| `404` | NotFound |
| `413` | ContentTooLarge |
| `429` | TooManyRequests |
| `500` | InternalServerError |
| `502` | BadGateway |
| `503` | ServiceUnavailableError |
| `504` | GatewayTimeout |

#### Response Sample (207)

```json
{
  "error": [{}],
  "success": [{}]
}
```

---

### SDDeleteAd

**`POST`** `/adsApi/v1/delete/ads`

Delete ads.

**Required Permissions:** `advertiser_campaign_edit`

#### Request Body Schema: `application/json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `adIds` | Array of strings | No | IDs of the ads to delete. [ 1 .. 100 ] items |

#### Request Sample

```json
{
  "adIds": [
    "string"
  ]
}
```

#### Response Codes

| Code | Description |
|------|-------------|
| `207` | SDDeleteAd 207 response |
| `400` | BadRequest |
| `401` | Unauthorized |
| `403` | Forbidden |
| `404` | NotFound |
| `413` | ContentTooLarge |
| `429` | TooManyRequests |
| `500` | InternalServerError |
| `502` | BadGateway |
| `503` | ServiceUnavailableError |
| `504` | GatewayTimeout |

#### Response Sample (207)

```json
{
  "error": [{}],
  "success": [{}]
}
```

---

### SDQueryAd

**`POST`** `/adsApi/v1/query/ads`

List ads.

**Required Permissions:** `advertiser_campaign_edit` | `creatives_view` | `creatives_edit` | `advertiser_campaign_view`

#### Request Body Schema: `application/json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `adProductFilter` | object (`SDAdAdProductFilter`) | **Yes** | Filter by ad product. |
| `maxResults` | integer `<int32>` [ 1 .. 100 ] | No | Maximum number of results. Default: `100` |
| `nextToken` | string | No | Pagination token for retrieving the next page of results. |

#### Request Sample

```json
{
  "adProductFilter": {
    "include": []
  },
  "maxResults": 100,
  "nextToken": "string"
}
```

#### Response Codes

| Code | Description |
|------|-------------|
| `200` | SDQueryAd 200 response |
| `400` | BadRequest |
| `401` | Unauthorized |
| `403` | Forbidden |
| `404` | NotFound |
| `413` | ContentTooLarge |
| `429` | TooManyRequests |
| `500` | InternalServerError |
| `502` | BadGateway |
| `503` | ServiceUnavailableError |
| `504` | GatewayTimeout |

#### Response Sample (200)

```json
{
  "ads": [{}],
  "nextToken": "string"
}
```

---

### SDUpdateAd

**`POST`** `/adsApi/v1/update/ads`

Update ads.

**Required Permissions:** `advertiser_campaign_edit` | `creatives_edit`

#### Request Body Schema: `application/json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ads` | Array of objects (`SDAdUpdate`) | No | Array of ads to update. [ 1 .. 100 ] items |

#### Request Sample

```json
{
  "ads": [
    {}
  ]
}
```

#### Response Codes

| Code | Description |
|------|-------------|
| `207` | SDUpdateAd 207 response |
| `400` | BadRequest |
| `401` | Unauthorized |
| `403` | Forbidden |
| `404` | NotFound |
| `413` | ContentTooLarge |
| `429` | TooManyRequests |
| `500` | InternalServerError |
| `502` | BadGateway |
| `503` | ServiceUnavailableError |
| `504` | GatewayTimeout |

#### Response Sample (207)

```json
{
  "error": [{}],
  "success": [{}]
}
```

---

## Campaigns

Operations for creating, deleting, querying, and updating Sponsored Display campaigns.

---

### SDCreateCampaign

**`POST`** `/adsApi/v1/create/campaigns`

Create campaigns.

**Required Permissions:** `advertiser_campaign_edit` | `campaign_edit` | `dsp_campaign_edit`

#### Request Body Schema: `application/json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `campaigns` | Array of objects (`SDCampaignCreate`) | No | Array of campaigns to create. [ 1 .. 100 ] items |

#### Request Sample

```json
{
  "campaigns": [
    {}
  ]
}
```

#### Response Codes

| Code | Description |
|------|-------------|
| `207` | SDCreateCampaign 207 response |
| `400` | BadRequest |
| `401` | Unauthorized |
| `403` | Forbidden |
| `404` | NotFound |
| `413` | ContentTooLarge |
| `429` | TooManyRequests |
| `500` | InternalServerError |
| `502` | BadGateway |
| `503` | ServiceUnavailableError |
| `504` | GatewayTimeout |

#### Response Sample (207)

```json
{
  "error": [{}],
  "success": [{}]
}
```

---

### SDDeleteCampaign

**`POST`** `/adsApi/v1/delete/campaigns`

Delete campaigns.

**Required Permissions:** `advertiser_campaign_edit`

#### Request Body Schema: `application/json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `campaignIds` | Array of strings | No | IDs of the campaigns to delete. [ 1 .. 100 ] items |

#### Request Sample

```json
{
  "campaignIds": [
    "string"
  ]
}
```

#### Response Codes

| Code | Description |
|------|-------------|
| `207` | SDDeleteCampaign 207 response |
| `400` | BadRequest |
| `401` | Unauthorized |
| `403` | Forbidden |
| `404` | NotFound |
| `413` | ContentTooLarge |
| `429` | TooManyRequests |
| `500` | InternalServerError |
| `502` | BadGateway |
| `503` | ServiceUnavailableError |
| `504` | GatewayTimeout |

#### Response Sample (207)

```json
{
  "error": [{}],
  "success": [{}]
}
```

---

### SDQueryCampaign

**`POST`** `/adsApi/v1/query/campaigns`

Query campaigns.

**Required Permissions:** `advertiser_campaign_edit` | `dsp_campaign_view` | `campaign_view` | `advertiser_campaign_view`

#### Request Body Schema: `application/json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `adProductFilter` | object (`SDCampaignAdProductFilter`) | **Yes** | Filter by ad product. |
| `campaignIdFilter` | object (`SDCampaignCampaignIdFilter`) | No | Filter by campaign IDs. |
| `maxResults` | integer `<int32>` [ 1 .. 100 ] | No | Maximum number of results. Default: `100` |
| `nameFilter` | object (`SDCampaignNameFilter`) | No | Filter by campaign name. |
| `nextToken` | string | No | Pagination token for retrieving the next page of results. |
| `portfolioIdFilter` | object (`SDCampaignPortfolioIdFilter`) | No | Filter by portfolio IDs. |
| `stateFilter` | object (`SDCampaignStateFilter`) | No | Filter by campaign state. |

#### Request Sample

```json
{
  "adProductFilter": {
    "include": []
  },
  "campaignIdFilter": {
    "include": []
  },
  "maxResults": 100,
  "nameFilter": {
    "include": [],
    "queryTermMatchType": "BROAD_MATCH"
  },
  "nextToken": "string",
  "portfolioIdFilter": {
    "include": []
  },
  "stateFilter": {
    "include": []
  }
}
```

#### Response Codes

| Code | Description |
|------|-------------|
| `200` | SDQueryCampaign 200 response |
| `400` | BadRequest |
| `401` | Unauthorized |
| `403` | Forbidden |
| `404` | NotFound |
| `413` | ContentTooLarge |
| `429` | TooManyRequests |
| `500` | InternalServerError |
| `502` | BadGateway |
| `503` | ServiceUnavailableError |
| `504` | GatewayTimeout |

#### Response Sample (200)

```json
{
  "campaigns": [{}],
  "nextToken": "string"
}
```

---

### SDUpdateCampaign

**`POST`** `/adsApi/v1/update/campaigns`

Update campaigns.

**Required Permissions:** `advertiser_campaign_edit` | `campaign_edit` | `dsp_campaign_edit`

#### Request Body Schema: `application/json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `campaigns` | Array of objects (`SDCampaignUpdate`) | No | Array of campaigns to update. [ 1 .. 100 ] items |

#### Request Sample

```json
{
  "campaigns": [
    {}
  ]
}
```

#### Response Codes

| Code | Description |
|------|-------------|
| `207` | SDUpdateCampaign 207 response |
| `400` | BadRequest |
| `401` | Unauthorized |
| `403` | Forbidden |
| `404` | NotFound |
| `413` | ContentTooLarge |
| `429` | TooManyRequests |
| `500` | InternalServerError |
| `502` | BadGateway |
| `503` | ServiceUnavailableError |
| `504` | GatewayTimeout |

#### Response Sample (207)

```json
{
  "error": [{}],
  "success": [{}]
}
```

---

## Targets

Operations for creating, deleting, querying, and updating Sponsored Display targets.

---

### SDCreateTarget

**`POST`** `/adsApi/v1/create/targets`

Create targets.

**Required Permissions:** `advertiser_campaign_edit` | `campaign_edit` | `dsp_campaign_edit`

#### Request Body Schema: `application/json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `targets` | Array of objects (`SDTargetCreate`) | No | Array of targets to create. [ 1 .. 1000 ] items |

#### Request Sample

```json
{
  "targets": [
    {}
  ]
}
```

#### Response Codes

| Code | Description |
|------|-------------|
| `207` | SDCreateTarget 207 response |
| `400` | BadRequest |
| `401` | Unauthorized |
| `403` | Forbidden |
| `404` | NotFound |
| `413` | ContentTooLarge |
| `429` | TooManyRequests |
| `500` | InternalServerError |
| `502` | BadGateway |
| `503` | ServiceUnavailableError |
| `504` | GatewayTimeout |

#### Response Sample (207)

```json
{
  "error": [{}],
  "success": [{}]
}
```

---

### SDDeleteTarget

**`POST`** `/adsApi/v1/delete/targets`

Delete targets.

**Required Permissions:** `advertiser_campaign_edit` | `campaign_edit` | `dsp_campaign_edit`

#### Request Body Schema: `application/json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `targetIds` | Array of strings | No | IDs of the targets to delete. [ 1 .. 1000 ] items |

#### Request Sample

```json
{
  "targetIds": [
    "string"
  ]
}
```

#### Response Codes

| Code | Description |
|------|-------------|
| `207` | SDDeleteTarget 207 response |
| `400` | BadRequest |
| `401` | Unauthorized |
| `403` | Forbidden |
| `404` | NotFound |
| `413` | ContentTooLarge |
| `429` | TooManyRequests |
| `500` | InternalServerError |
| `502` | BadGateway |
| `503` | ServiceUnavailableError |
| `504` | GatewayTimeout |

#### Response Sample (207)

```json
{
  "error": [{}],
  "success": [{}]
}
```

---

### SDQueryTarget

**`POST`** `/adsApi/v1/query/targets`

List targets.

**Required Permissions:** `advertiser_campaign_edit` | `dsp_campaign_view` | `campaign_view` | `advertiser_campaign_view` | `campaign_edit` | `dsp_campaign_edit`

#### Request Body Schema: `application/json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `adGroupIdFilter` | object (`SDTargetAdGroupIdFilter`) | No | Filter by ad group IDs. |
| `adProductFilter` | object (`SDTargetAdProductFilter`) | **Yes** | Filter by ad product. |
| `campaignIdFilter` | object (`SDTargetCampaignIdFilter`) | No | Filter by campaign IDs. |
| `maxResults` | integer `<int32>` [ 1 .. 5000 ] | No | Maximum number of results. Default: `5000` |
| `nextToken` | string | No | Pagination token for retrieving the next page of results. |
| `stateFilter` | object (`SDTargetStateFilter`) | No | Filter by target state. |
| `targetIdFilter` | object (`SDTargetTargetIdFilter`) | No | Filter by target IDs. |

#### Request Sample

```json
{
  "adGroupIdFilter": {
    "include": []
  },
  "adProductFilter": {
    "include": []
  },
  "campaignIdFilter": {
    "include": []
  },
  "maxResults": 5000,
  "nextToken": "string",
  "stateFilter": {
    "include": []
  },
  "targetIdFilter": {
    "include": []
  }
}
```

#### Response Codes

| Code | Description |
|------|-------------|
| `200` | SDQueryTarget 200 response |
| `400` | BadRequest |
| `401` | Unauthorized |
| `403` | Forbidden |
| `404` | NotFound |
| `413` | ContentTooLarge |
| `429` | TooManyRequests |
| `500` | InternalServerError |
| `502` | BadGateway |
| `503` | ServiceUnavailableError |
| `504` | GatewayTimeout |

#### Response Sample (200)

```json
{
  "nextToken": "string",
  "targets": [{}]
}
```

---

### SDUpdateTarget

**`POST`** `/adsApi/v1/update/targets`

Update targets.

**Required Permissions:** `advertiser_campaign_edit`

#### Request Body Schema: `application/json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `targets` | Array of objects (`SDTargetUpdate`) | No | Array of targets to update. [ 1 .. 1000 ] items |

#### Request Sample

```json
{
  "targets": [
    {}
  ]
}
```

#### Response Codes

| Code | Description |
|------|-------------|
| `207` | SDUpdateTarget 207 response |
| `400` | BadRequest |
| `401` | Unauthorized |
| `403` | Forbidden |
| `404` | NotFound |
| `413` | ContentTooLarge |
| `429` | TooManyRequests |
| `500` | InternalServerError |
| `502` | BadGateway |
| `503` | ServiceUnavailableError |
| `504` | GatewayTimeout |

#### Response Sample (207)

```json
{
  "error": [{}],
  "success": [{}]
}
```

---

*Documentation sourced from Amazon Ads Advanced Tools Center — API Reference.*  
*© 2023 Amazon.com, Inc. or its affiliates.*
