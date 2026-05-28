# Amazon Ads API – Get Started Documentation

> Sourced from the [Amazon Ads Advanced Tools Center](https://advertising.amazon.com/API/docs/en-us/guides/get-started/overview)  
> Date captured: 2026-05-12

---

## Table of Contents

1. [Overview](#1-overview)
2. [Step 1: Create an Authorization Grant](#2-step-1-create-an-authorization-grant)
3. [Step 2: Generate Access and Refresh Tokens](#3-step-2-generate-access-and-refresh-tokens)
4. [Step 3: Retrieve a Profile ID](#4-step-3-retrieve-a-profile-id)
5. [Quickstart Guide: Postman Collection](#5-quickstart-guide-postman-collection)
6. [Make Your First Call](#6-make-your-first-call)
7. [Monitor Your API Performance](#7-monitor-your-api-performance)

---

## 1. Overview

**Page:** Getting started with the Amazon Ads API

The Amazon Ads API enables you to manage the advertising resources associated with an Amazon advertiser using a REST API. Three credentials are required to authorize most requests to the API:

- The **client ID** of a Login with Amazon application
- An **access token** representing permission for the client application to act on behalf of a user account
- The **profile ID** for the user's advertising account in a specific marketplace

This guide explains how to retrieve these required credentials.

### Before You Begin

To complete this guide, you will need:

- A Login with Amazon **client application** approved to use the Amazon Ads API. If you have not yet established an approved client, see [Onboarding](https://advertising.amazon.com/API/docs/en-us/guides/onboarding/overview).
- Login credentials for an Amazon user account that manages Amazon Ads accounts. (If you do not have login credentials for an Amazon Ads account, learn about test accounts.)

### Authorization and Identity in the Amazon Ads API

Requests to the Amazon Ads API are made by a **client application** on behalf of a **user account** with access to Amazon Ads accounts. A user account must grant explicit authorization to a client application using **Login with Amazon (LwA)**.

For conceptual information about this relationship, you may wish to read the following before proceeding:

- [Amazon Ads API authorization overview](https://advertising.amazon.com/API/docs/en-us/guides/account-management/authorization/overview)
- [Login with Amazon (LwA) concepts](https://developer.amazon.com/docs/login-with-amazon/conceptual-overview.html)

### Steps in This Process

Retrieving credentials to access data and services for an advertiser involves three steps:

1. **Create an authorization grant** – Enable an advertising user account to grant access to your LwA client.
2. **Generate access and refresh tokens** – Redeem the authorization grant for an access token (used to call the API) and a refresh token (used to generate new access tokens).
3. **Retrieve a profile** – Retrieve a profile ID representing the user account in a specific advertising marketplace.

Along with your LwA client ID, the access token and profile ID retrieved here can be used to authorize future requests to the API.

> **Tip – Getting started with our Postman collection**  
> For some customers, the Amazon Ads API Postman collection may offer a simplified approach to completing these steps through the Postman user interface. See the [Quickstart Guide: Postman Collection](#5-quickstart-guide-postman-collection) section below.

### Get Started Pathways

If you're ready to begin calling the Amazon Ads API, follow one of these two pathways:

**"Getting Started" walkthrough**  
Our step-by-step walkthrough includes instructions for creating authorization grants, generating access tokens, and retrieving profiles. To begin, see [Step 1: Create an Authorization Grant](#2-step-1-create-an-authorization-grant).

> **Note:** This process requires technical understanding of HTTP requests and the ability to send requests and read responses. Examples using cURL are provided for each step.

**Amazon Ads API Postman collection**  
Our collection for Postman includes scripts to help manage auth, as well as readymade templates for some common requests to the API. To begin, see [Quickstart Guide: Postman Collection](#5-quickstart-guide-postman-collection).

---

## 2. Step 1: Create an Authorization Grant

**Page:** [Create an authorization grant](https://advertising.amazon.com/API/docs/en-us/guides/get-started/create-authorization-grant)

An approved client application may make calls to the Amazon Ads API on behalf of an Amazon user account with access to Amazon Ads accounts.

The relationship between client application and user account is administered by Login with Amazon (LwA). The user account must explicitly grant authorization to the client application through LwA's **Authorization Code Grant** process to generate an authorization code as described below.

There are two scenarios for requesting and granting authorization:

- **Direct Advertiser** – You want to use the API to access the advertising data and services associated with your own Amazon account.
- **Partner** – A third party wants to authorize you to access the advertising data and services associated with their Amazon account.

For either scenario, you will create an **authorization URL**.

### Create an Authorization URL

To retrieve an authorization code, create an authorization URL that enables a user account to grant authorization to your client application. This process involves three steps:

1. Allow a return URL
2. Determine the URL prefix for your region
3. Determine the values for the required query parameters

#### 1. Allow a Return URL

Log in to the Amazon Developer console using your Amazon Developer account and select **Login with Amazon** from the top menu. Choose the security profile you used to apply for API access, click the gear icon under **Manage**, and select **Web Settings**.

From the Web Settings panel, click **Edit**. Add a valid address in the **Allowed Return URLs** field and click **Save**.

> **What is an Allowed Return URL?**  
> Any URL added to the "Allowed Return URLs" list may be used as the `redirect_uri` parameter. After an advertiser grants authorization, they will be redirected to the specified URL with the authorization code appended as a query parameter.

#### 2. Determine the URL Prefix for Your Region

| Region | URL Prefix |
|--------|-----------|
| North America (NA) | `https://www.amazon.com/ap/oa` |
| Europe (EU) | `https://eu.account.amazon.com/ap/oa` |
| Far East (FE) | `https://apac.account.amazon.com/ap/oa` |

> **Note:** An authorization code retrieved from any of these URLs can be used to access the advertising API in any region.

> **Important:** If this authorization grant is for the Data Provider API, you must repeat this process three times, once for each region.

#### 3. Determine the Values for the Required Query Parameters

| Parameter | Description |
|-----------|-------------|
| `client_id` | The Client ID associated with your Login with Amazon client application. |
| `scope` | The OAuth 2.0 permission scope. For DSP, Sponsored Brands, Sponsored Display, Sponsored Products, and Amazon Attribution APIs, set to `advertising::campaign_management`. For the Data Provider API, set to `advertising::audiences`. |
| `response_type` | The type of response. Always set to `code`. |
| `redirect_uri` | The value from the Allowed Return URLs field of your Login with Amazon security profile. |

**Example authorization URL (NA region):**

```
https://www.amazon.com/ap/oa
  ?client_id=amzn1.application-oa2-client.12345678901234567890
  &scope=advertising::campaign_management
  &response_type=code
  &redirect_uri=https://amazon.com
```

> **Note:** LwA clients approved before October 2020 may need to set scope to `cpc_advertising:campaign_management`.

### To Grant Access to Your Own Amazon Ads Data

1. Paste the authorization URL into your browser's address bar and navigate to it.
2. Sign in using an Amazon user account with access to the Amazon Ads accounts you want to manage.
3. You will be redirected to a consent form. Select **Allow** to grant access.
4. You will be redirected to the `redirect_uri` with query parameters appended. Note the value of the `code` parameter:

```
https://www.amazon.com/?code=xxxxxxxxxxxxxxxxxxx&scope=advertising%3A%3Acampaign_management
```

### To Gain Access to a Third Party's Amazon Ads Data

1. Send the authorization URL to the third party with instructions to paste it into their browser.
2. Instruct them to sign in with the Amazon user account that has access to their Amazon Ads accounts.
3. They will be shown a consent form – instruct them to select **Allow**.
4. They will be redirected to the `redirect_uri`. Have them send you this URL.
5. Note the value of the `code` parameter in the URL.

### Next Steps

The `code` parameter is the **authorization code** — use it in [Step 2: Generate Access and Refresh Tokens](#3-step-2-generate-access-and-refresh-tokens).

> **Important:** Authorization codes expire after **5 minutes**. A new code may be generated by repeating the steps above.

---

## 3. Step 2: Generate Access and Refresh Tokens

**Page:** [Retrieve access and refresh tokens](https://advertising.amazon.com/API/docs/en-us/guides/get-started/retrieve-access-token)

In step 1, you created an authorization grant. Login with Amazon generated an authorization code, which you will now use to retrieve an access token for calling the API.

### Step 1: Retrieve Your Client ID and Client Secret

Sign in to Amazon Developer with the Amazon account you used to create your Login with Amazon client. Navigate to the Login with Amazon console and locate the **client ID** and **client secret** for the security profile to which you assigned API access.

### Step 2: Call the Authorization URL to Request Tokens

Select the authorization URL for your region:

| Region | Authorization URL |
|--------|------------------|
| North America (NA) | `https://api.amazon.com/auth/o2/token` |
| Europe (EU) | `https://api.amazon.co.uk/auth/o2/token` |
| Far East (FE) | `https://api.amazon.co.jp/auth/o2/token` |

Construct a **POST** request with the following parameters:

| Parameter | Description |
|-----------|-------------|
| `grant_type` | Must be `authorization_code`. |
| `code` | The authorization code retrieved in step 1. Expires after 5 minutes. |
| `redirect_uri` | One of the values in the Allowed Return URLs field in your Login with Amazon account. |
| `client_id` | The Client ID of your Login with Amazon account. |
| `client_secret` | The Client Secret of your Login with Amazon account. |

**Example cURL request:**

```bash
curl \
  -X POST \
  --data "grant_type=authorization_code&code=AUTH_CODE&redirect_uri=YOUR_RETURN_URL&client_id=YOUR_CLIENT_ID&client_secret=YOUR_SECRET_KEY" \
  https://api.amazon.com/auth/o2/token
```

### Access Token Response

A successful response returns a JSON object:

| Field | Description |
|-------|-------------|
| `access_token` | The access token. |
| `token_type` | Always `bearer`. |
| `expires_in` | Time until the access token expires, in seconds. |
| `refresh_token` | The refresh token. |

**Example response:**

```json
{
  "access_token": "Atza|IQEBLjAsAhRmHjNgHpi0U-Dme37rR6CuUpSR...",
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "Atzr|IQEBLzAtAhRPpMJxdwVz2Nn6f2y-tpJX2DeX..."
}
```

> **Note:** Access tokens are valid for **60 minutes**. Access tokens begin with `Atza|`, refresh tokens begin with `Atzr|`. These characters are part of the token and must be included wherever the token is used.

> **Refresh tokens do not expire.** A new access token can be generated at any time using the refresh token.

### Using Refresh Tokens

Once tokens have been retrieved using the authorization code, a new access token can be retrieved at any time using the refresh token by calling the same URL with different parameters.

### Next Steps

You now have two essential credentials:

- The **client ID** of your Login with Amazon client application
- The **access token** that enables your client to access advertising data and services

Continue to [Step 3: Retrieve a Profile ID](#4-step-3-retrieve-a-profile-id).

---

## 4. Step 3: Retrieve a Profile ID

**Page:** [Retrieve and use a profile ID](https://advertising.amazon.com/API/docs/en-us/guides/get-started/retrieve-profiles)

Nearly all requests to the API require a **profile ID** representing the user's advertising account in a specific marketplace. Once you have generated an access token, follow these steps to retrieve a profile ID.

### Access the Profiles Resource

To retrieve a list of available profiles, make a **GET** request to the `/v2/profiles` endpoint in the region where the user account manages advertising accounts.

**Required headers:**

| Header | Value |
|--------|-------|
| `Amazon-Advertising-API-ClientId` | The client identifier of the LwA client application. |
| `Authorization` | The string `Bearer` prepended to the access token. |

**Example cURL request (North America):**

```bash
curl \
  -H "Amazon-Advertising-API-ClientId: amzn1.application-oa2-client.bb48851ca..." \
  -H "Authorization: Bearer Atza|IQEBLjAsAhRmHjNgHpi0U-Dme37rR6CuUpSR..." \
  https://advertising-api.amazon.com/v2/profiles
```

### Profiles Response

A successful response includes a list of profiles associated with the user account.

**Example response:**

```json
[
  {
    "profileId": 888888888,
    "countryCode": "MX",
    "currencyCode": "MXN",
    "timezone": "America/Los_Angeles",
    "accountInfo": {
      "marketplaceStringId": "A1AM78C64UM0Y8",
      "id": "ENTITY2Ihjasdjkeru",
      "type": "vendor",
      "name": "Name of the Account",
      "validPaymentMethod": false
    }
  }
]
```

> **Do you see multiple profiles?** Each profile represents an advertising account in a different marketplace. Note the `countryCode` value to determine the marketplace.

> **Don't see any profiles?** An empty array (`[]`) indicates authorization was successful but the user account has no advertising accounts with View and Edit permissions in this region.

> **Don't see Amazon DSP advertiser accounts?** The `/v2/profiles` endpoint does not return ADSP Advertiser Accounts. Use the Query Advertiser Accounts API instead.

> **Using a manager account?** If the authorizing user is a manager account, the response includes all accounts in the current region for which the manager account has Editor access.

### Pass the Profile ID in Subsequent Requests

Aside from the `/v2/profiles` endpoint, requests to the Amazon Ads API can access resources for only one profile at a time. Pass three required headers:

| Header | Value |
|--------|-------|
| `Amazon-Advertising-API-ClientID` | Your client ID. |
| `Authorization` | `Bearer` + access token. |
| `Amazon-Advertising-API-Scope` | The profile ID for an advertising account in a specific marketplace. |

> **Note:** Access tokens expire after 60 minutes. To generate a new token, use the refresh token.

### Next Steps

Continue to [Make Your First Call](#6-make-your-first-call).

---

## 5. Quickstart Guide: Postman Collection

**Page:** [Quickstart guide – Postman](https://advertising.amazon.com/API/docs/en-us/guides/get-started/using-postman-collection)

The Amazon Ads API Postman collection includes scripts to ease the management of authentication and authorization credentials, as well as pre-built requests for demonstrating common uses of the API.

### Before You Begin

- The client ID and client secret of a Login with Amazon client application approved to use the Amazon Ads API.
- Login credentials for an Amazon user account that manages Amazon Ads accounts.
- Postman (desktop or web-based application).

### Quick Setup

#### 1. Import the Collection and Environment Files

1. Download the Postman environment file and collection file from [GitHub](https://github.com/amzn/ads-advanced-tools-docs).
2. Import both files into Postman.
3. Select the **Collections** icon – you should see the **Amazon Ads API** collection.
4. Select the **Environments** icon – you should see the **Amazon Ads API Environment**.
5. From the Environments selector, activate the **Amazon Ads API Environment**.

#### 2. Configure the Environment

From the left sidebar, select **Environments**, then select the **Amazon Ads API Environment**. Manually set the **Current Value** for the following variables:

| Variable | Description |
|----------|-------------|
| `client_id` | The client ID of the Login with Amazon client application. |
| `client_secret` | The client secret of the Login with Amazon client application. |
| `redirect_uri` | A URL included in the "Allowed Return URLs" configuration of your Login with Amazon application (defaults to `https://amazon.com`). |

> **Note:** The default environment accesses the North American host. For other regions, see the [Regions](#regions) section below.

Save the changes to your environment.

#### 3. Generate an Authorization Grant Code

1. In Collections, open **Auth folder > GET Auth grant login**.
2. Open the **Console** in the Postman footer.
3. **Send** the request. This logs the authorization URL to the console.
4. Copy the URL, visit it in a web browser, and sign in with your Amazon Ads account.
5. You are redirected to your `redirect_uri`. Copy the `code` query parameter from the URL:

```
https://amazon.com/?code=XXXXX&scope=advertising%3A%3Acampaign_management
```

> **Note:** Authorization grant codes expire in **5 minutes**.

#### 4. Retrieve Access and Refresh Tokens

1. From the **Auth** folder, select **POST Access token from auth grant**.
2. In the **Body**, enter the `code` from the previous step.
3. **Send** the request.

A successful request sets the `access_token` and `refresh_token` variables in your environment automatically.

> **Token expiry:** Access tokens expire in 60 minutes. Refresh tokens do not expire. The collection uses the refresh token to generate new access tokens automatically.

#### 5. Retrieve a Profile ID

1. Select the **Accounts** folder in the collection.
2. Select **GET Profiles** and send the request.
3. The response is a list of profiles. A script in the collection sets the `profileId` variable to the first profile returned.

### Next Steps

Your Postman environment now has the required credentials:

- Your client ID
- An access token
- A profile ID

The Postman collection is configured to include these values in the headers for subsequent requests. See [Make Your First Call](#6-make-your-first-call) to test a typical first call.

### Optional Changes

#### Regions

The provided environment is configured for the North American host. To access other regions, change the `api_url`, `auth_grant_url`, and `token_url` variables:

| Region | `api_url` | `auth_grant_url` | `token_url` |
|--------|-----------|-----------------|------------|
| NA | `https://advertising-api.amazon.com` | `https://www.amazon.com/ap/oa` | `https://api.amazon.com/auth/o2/token` |
| EU | `https://advertising-api-eu.amazon.com` | `https://eu.account.amazon.com/ap/oa` | `https://api.amazon.co.uk/auth/o2/token` |
| FE | `https://advertising-api-fe.amazon.com` | `https://apac.account.amazon.com/ap/oa` | `https://api.amazon.co.jp/auth/o2/token` |

---

## 6. Make Your First Call

**Page:** [Make your first call](https://advertising.amazon.com/API/docs/en-us/guides/get-started/first-call)

This tutorial helps you understand how to list all of your active sponsored ads (Sponsored Products, Sponsored Brands, and Sponsored Display) campaigns using the relevant GET campaigns endpoint.

### Before You Begin

Make sure you have:

- Access to the Ads API
- A Login with Amazon application client ID
- A valid access token
- A profile ID for an Amazon Ads account (for campaign management)
- An advertising account ID (for reporting and cross-product operations)

### Request URL Prefixes

| URL | Region & Marketplaces |
|-----|-----------------------|
| `https://advertising-api.amazon.com` | North America (NA): US, CA, MX, BR |
| `https://advertising-api-eu.amazon.com` | Europe (EU): UK, FR, IT, ES, DE, NL, SE, PL, BE, ZA, EG, AE, SA, TR, IN |
| `https://advertising-api-fe.amazon.com` | Far East (FE): JP, AU, SG |

### Common Headers

| Header | Required? | Description |
|--------|-----------|-------------|
| `Amazon-Ads-ClientId` | Yes | The client ID related to a Login with Amazon application. |
| `Authorization` | Yes | A valid API access token in the format `Bearer access_token`. Valid for one hour. |
| `Amazon-Advertising-API-Scope` | Campaign management | Amazon Ads profile ID. Required for campaign management operations. |
| `Amazon-Ads-AccountId` | Reporting | Advertising account ID. Required for reporting and cross-product operations. |
| `Accept` | No | Specifies the version. Defaults to `application/json` if not specified. |

### Sample Requests

#### Sponsored Products

**Full reference:** `POST sp/campaigns/list`

```bash
curl --location --request POST 'https://advertising-api.amazon.com/sp/campaigns/list' \
  --header 'Amazon-Ads-ClientId: amzn1.application-oa2-client.xxxxxxxxxx' \
  --header 'Amazon-Advertising-API-Scope: xxxxxxxxx' \
  --header 'Authorization: Bearer xxxxxxxxxxxx' \
  --header 'Accept: application/vnd.spCampaign.v3+json' \
  --header 'Content-Type: application/vnd.spCampaign.v3+json'
```

#### Sponsored Brands

**Full reference:** `POST sb/v4/campaigns/list`

```bash
curl --location --request GET 'https://advertising-api.amazon.com/sb/v4/campaigns/list' \
  --header 'Amazon-Ads-ClientId: amzn1.application-oa2-client.xxxxxxxxxx' \
  --header 'Amazon-Advertising-API-Scope: xxxxxxxxx' \
  --header 'Authorization: Bearer xxxxxxxxxxxx' \
  --header 'Accept: application/vnd.sbcampaignresource.v4+json' \
  --header 'Content-Type: application/vnd.sbcampaignresource.v4+json'
```

#### Sponsored Display

**Full reference:** `GET sd/campaigns`

```bash
curl --location --request GET 'https://advertising-api.amazon.com/sd/campaigns' \
  --header 'Amazon-Ads-ClientId: amzn1.application-oa2-client.xxxxxxxxxx' \
  --header 'Amazon-Advertising-API-Scope: xxxxxxxxx' \
  --header 'Authorization: Bearer xxxxxxxxxxxx'
```

### Response

A successful response returns a **200** status code. The response body contains a JSON array of campaign objects.

**Sample Sponsored Display campaign response:**

```json
[
  {
    "campaignId": 127519806194475,
    "name": "SdTestCampaign-26/01/2022 15:37:31",
    "tactic": "T00020",
    "startDate": "20220126",
    "state": "enabled",
    "costType": "cpc",
    "budget": 100,
    "budgetType": "daily",
    "deliveryProfile": "as_soon_as_possible"
  }
]
```

> **Receiving an empty response?** If you don't have any campaigns of a certain ad type, you'll receive a 200 response with an empty array (`[]`). Check the Amazon advertising console to verify your active campaigns.

> **Tip:** If you are new to Amazon Ads and don't have any campaigns, try creating a test account to practice building campaigns without impacting your spend.

### Next Steps

- **For advertisers with active campaigns:** Pull sponsored ads performance data, retrieve all sponsored ads campaigns/ad groups/ads/targets, or create a Sponsored Products manual campaign.
- **For advertisers new to Amazon Ads:** Create a test account or get started with Sponsored Products auto campaigns.

---

## 7. Monitor Your API Performance

**Page:** [Monitor your API performance](https://advertising.amazon.com/API/docs/en-us/guides/get-started/api-integration-dashboard)

The Amazon Ads API **integration dashboard** helps you monitor and improve your Ads API performance.

### Features

The dashboard provides metrics to analyze your Ads API performance, identify bottlenecks, and discover opportunities for improvement, including:

- Call volume, throttle rate, and error rates
- Breakdown by dimensions: products, functions, API resources, and geography
- Daily, weekly, and monthly trends
- Filtering on specific API call subsets
- Hourly breakdown to identify when error spikes occurred

The dashboard is built using **Amazon QuickSight**.

### Access the Dashboard

When you sign into the Advanced Tools Center with an account that has access to the Ads API, access your dashboard from the **My Apps** tab in the navigation bar.

> **Note:** If you have access to the Ads API but don't see a dashboard, your Amazon developer account may require Administrator or Developer permissions.

### Use the Dashboard

To learn more about the dashboard, click **Dashboard help** from within the dashboard.

---

*Documentation sourced from the [Amazon Ads Advanced Tools Center](https://advertising.amazon.com/API/docs/en-us/guides/get-started/overview). All content is the property of Amazon.com, Inc. or its affiliates.*
