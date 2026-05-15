# The Trade Desk – Foundations Documentation

> Source: [open.thetradedesk.com](https://open.thetradedesk.com/advertiser/docsApp/Foundations/resources/doc/Apis)

---

## Table of Contents

1. [Our Users and APIs](#1-our-users-and-apis)
2. [API Token Authentication](#2-api-token-authentication)
3. [User Management Platform](#3-user-management-platform)
4. [Configure External User SSO](#4-configure-external-user-sso)
5. [Partner Sandbox](#5-partner-sandbox)
6. [REST and GraphQL](#6-rest-and-graphql)
7. [GraphQL API Calls](#7-graphql-api-calls)
8. [REST API Calls](#8-rest-api-calls)
9. [Call Execution Tool](#9-call-execution-tool)
10. [Strict Mode](#10-strict-mode)
11. [Return Codes](#11-return-codes)
12. [Rate Limits](#12-rate-limits)
13. [GraphQL API Resource Hub](#13-graphql-api-resource-hub)
14. [Data Privacy and Transparency](#14-data-privacy-and-transparency)

---

## 1. Our Users and APIs

**URL:** https://open.thetradedesk.com/advertiser/docsApp/Foundations/resources/doc/Apis

Whether you're an advertiser, provider, or seller, The Trade Desk APIs give you the tools to build, integrate, and scale. Our APIs power The Trade Desk platform, Deal Desk, and other products and solutions, as well as partner offerings.

### Our Users

The Trade Desk platform serves three fundamentally different roles in the programmatic advertising ecosystem, and each role interacts with the platform in a distinct way.

| User Group | Description | Example Tasks | Example Users |
|---|---|---|---|
| **Advertiser** | A brand or agency that runs campaigns, creatives, and reports for purchasing media on the Open Internet. | Upload first-party data. Manage campaigns and drive KPIs. Run reports. | Brand, agency, holding company, DSP |
| **Provider** | A third party that provides targeting or measurement data, lift studies, or partner-specific integrations. | Onboard third-party data and make it available in the DMP. Upload first-party data on behalf of an advertiser. Monetize audience and sales data. | Audience, contextual, geo, or measurement data provider; retailer (merchant), lift study or MMM provider, integrated partner, data onboarder |
| **Seller** | An inventory source or path that supplies ad space on the Open Internet to sell to advertisers. | Propose deals to advertisers and manage live deal performance. Create direct connections to supply through OpenPath. | Supply vendor, publisher, SSP, intermediary |

### Our APIs

The Trade Desk offers three API suites built around distinct platform activities.

> **NOTE:** Your user role determines which APIs you'll primarily work with, though some Data and Platform API endpoints might overlap across advertiser and provider workflows.

| API | Technology | Description | Intended User Group | Authentication | Notes |
|---|---|---|---|---|---|
| **Data API** | REST | Onboard large-scale data into The Trade Desk's servers for data integration, and ID deletion and opt-out management. | Provider, advertiser | API Token Signature Header | Some data workflows require selecting a target data center. |
| **Platform API** | REST and GraphQL | Manage campaigns, creatives, audiences, bid lists, and retrieve performance reports. | Advertiser, provider | API Token | Providers can use the API to manage taxonomies and data rates for third-party data, and to run reports. |
| **PDP API** (Price Discovery and Provisioning) | GraphQL | Create and manage deals and provisioning data between sellers and buyers. | Seller | API Token | Access is restricted. Contact your Technical Account Manager to enable access. |

---

## 2. API Token Authentication

**URL:** https://open.thetradedesk.com/advertiser/docsApp/Foundations/resources/doc/PlatformAuthentication

To authenticate your requests to the REST or GraphQL API, you must generate access tokens in the UI. These tokens have a lifetime from one week to one year.

To access the REST and GraphQL API, you need the following:
- The API credentials provided by your Account Manager.
- An authentication token that you need to generate and place in the header of your integration.

You must create and revoke API tokens using the interactive UI experience available through **Manage API tokens**.

> **TIP:** To change the lifetime of a token or otherwise update it, you need to revoke it, generate a new token, and then replace the tokens in your integration.

### Create an API Token

To generate an API token, complete the following steps:

1. Log in with your The Trade Desk account credentials.
2. Navigate directly to **Manage API tokens**.
3. Click **Generate Token / Key**. The Generate API Token dialog appears.
4. Enter a descriptive name for your token.
5. In the **Application** field, select your corresponding token type. For assistance, see Our APIs.
6. Select the token lifetime based on your key rotation strategy and integration needs.
7. Click **Save**. A confirmation message appears with an API token.
8. Copy the displayed API token, save it to your secrets management system for future reference, and then close the message.
9. Include the token as the `TTD-Auth` value in the headers of all API calls that use tokens.

> **IMPORTANT:** Be sure to save your generated API token to a secrets management system, as you won't be able to look up or regenerate the same token. If you forget your token, you should revoke the old token and generate a new one.

### Check Your API Token Information

To check the creation and expiration dates or the names of your generated API tokens:

1. Log in with your The Trade Desk account credentials.
2. Navigate directly to **Manage API tokens**.

### Revoke an API Token

If your API token has been compromised, is no longer needed, or needs to be replaced, you can revoke the token at any time.

1. Log in with your The Trade Desk account credentials.
2. Navigate directly to **Manage API tokens**.
3. Find the row with the name of the token you want to revoke, then in the **Actions** column on the far right, click **Revoke**.
4. A confirmation message appears. Verify that you've selected the correct token and click **Continue**.
5. Update the integration where the token was used as needed.

### FAQs

**When generating an API token, what do I do if the Application option I need is unavailable?**
Contact your Technical Account Manager for assistance.

**What if I need a token that lasts for less than one week?**
You can create a short-lived token that lasts for up to 24 hours. For details, see Short-Lived API tokens.
> **NOTE:** This feature is not available for PDP or OpenPath tokens.

---

## 3. User Management Platform

**URL:** https://open.thetradedesk.com/advertiser/docsApp/Foundations/resources/doc/UserManagementPlatform

The User Management Platform (UMP) allows its administrators to manage their own access and permissions, get detailed user insights, and oversee access and permissions for their team members.

Key points about the UMP:
- As an administrator, you're granted either view-only or full editing permissions.
- You can quickly configure permissions through bulk editing or assigning users to access groups.
- For more granular control, you can nest access groups so that each group inherits permission settings from its parent group.
- Each sub-admin must belong to a single access group, and cannot be directly assigned to specific partners or advertisers.

> **NOTE:** Legacy and non-standard roles and permissions are not accessible in the UMP.

### Get Started

Before you start, make sure you meet the following requirements:
- You belong to an enrolled organization.
- You have user-management permissions.
- You are assigned to at least one access group.
- (Optional) You are invited to brand-agency shared access.

### Group Relationships

| Group Type | Description |
|---|---|
| **Organization** | A primary ownership boundary for user management, such as a brand or agency. |
| **Root access group** | A special system-defined access group that every organization has exactly one of, and that all other access groups are based on. |
| **Access group** | A unit of access control for permissions and scope is assigned to users within an organization. |

### Brand vs. Agency Access

In a brand‑owned, agency‑operated setup, the brand and agency maintain separate organizations while collaborating through shared access. The brand retains full ownership and control, while granting the agency the ability to manage access for day‑to‑day operations.

| Area | Brand User Manager | Agency User Manager |
|---|---|---|
| Organization | Owns and manages brand organization and brand-managed access groups. | Owns and manages agency organization and agency-managed access groups. |
| User management | Full view and editing access to all brand users. | Full view and editing access to all agency users. |
| Visibility | Limited visibility into invited agency users (profiles and limited assignments). | No direct management of brand users. |
| Ownership | Retains full ownership and final control. | Operates within permissions granted by the brand. |

### Roles

| Role | Description |
|---|---|
| Campaign Manager (View-Only) | View partner, advertiser, and campaign details. |
| Campaign Manager (View/Edit) | View and update partner, advertiser, and campaign details. |
| Reporting Manager (View-Only) | View and download user-defined reports. |
| Reporting Manager (View/Edit) | Create, view, and download user-defined reports. |
| PMP Manager (View-Only) | View first-party deals and commitments. |
| PMP Manager (View/Edit) | Create and manage first-party deals and commitments. |
| DMP Manager | Create and manage audiences under Data Marketplace. |
| User Manager (View-Only) | View user details, roles, and access groups. |
| User Manager (View/Edit) | Add and update user details, roles, and access groups. Can also make bulk edits. |

### Manage Users

If you have the **User Manager (View/Edit)** role, you can:
- View user details.
- Add a user.
- Update user roles and permissions, either individually or in bulk.
- Disable a user.

#### Add a User

1. In the Manage Users tab, at the top-right, click **Add User**.
2. In the Add User panel, follow the instructional text to enter user information correctly.
3. Click **Submit**.

#### Update a Single User

1. In the Manage Users tab, click the name of a user to go to their User Details page.
2. Click the **Edit** button for the section you want to update.
3. In the popup for that section, follow the instructional text to update information correctly.
4. Click **Save**.

#### Update Multiple Users at Once

1. In the Manage Users tab, select the checkboxes next to the users whose details you want to update.
2. In the blue banner, select one of the following options: Disable Users, Enable Users, Add Groups, Remove Groups, Add Roles, or Remove Roles.
3. In the bulk-edit popup, follow the instructional text.
4. Click **Submit**.

#### Disable a User

1. In the Manage Users tab, click the name of a user.
2. At the top-right, click **Disable User**.

### Manage Access Groups

If you have the **User Manager (View/Edit)** role, you can assign individuals to access groups. Access groups can be nested hierarchically.

#### Add an Access Group

1. At the lower left, click **Add Access Group**.
2. In the Add Access Group panel, follow the instructional text.
3. Click **Submit**.

#### Disable an Access Group

Near the Edit button at the top-right corner, click the menu button then select **Disable**.

### Create a Report

1. Go to the **Report Creation** tab.
2. In the **Run a Report on** dropdown menu, select **User Details** or **User Change Log (last 90 days)**.
3. Select your filters, as needed.
4. Click **Generate My Report**.
5. To download as a CSV file, click **Download**.

### Troubleshooting

| Problem | Resolution |
|---|---|
| Adding a user from another organization. | Admins only manage users within their own organizations. Contact your Technical Account Manager. |
| Assigning an admin with the User Management role directly to an organization. | These admins must belong to an access group. Remove any admin access to partners and advertisers, and instead assign an access group. |
| Assigning certain restricted user types to an access group. | Determine if a different, eligible external admin can be used instead. Contact your Technical Account Manager. |

### FAQs

**How do I activate my API login?**
After receiving the "Welcome to The Trade Desk!" email, click the Activate Account button and follow the instructions. The activation email expires in seven days.

**Why do I get "Access Denied" when trying to log in to the Platform UI?**
Logins are typically restricted to OpenTTD and the API. If you try to access the Platform UI with this login type, you will receive an "Access Denied" message.

**Can I sort users by role, access group, or identity provider in the UMP?**
No. However, you can export a CSV file of the users and then sort by any criteria.

**Can I delete a user or access group?**
No. You can only disable users and access groups, not delete them.

---

## 4. Configure External User SSO

**URL:** https://open.thetradedesk.com/advertiser/docsApp/Foundations/resources/doc/UserManagementExternalSSO

Platform customers with multiple users can collaborate with The Trade Desk to configure user single sign-on (SSO) access for their own users. The Trade Desk platform is a federated service that uses Okta as the SSO identity provider for all client accounts.

### Benefits of External SSO Configuration

A company-wide SSO solution provides a uniform interface for all employees in a specific company, allowing them to access authorized apps with just one login.

### Types of SSO Supported

The Trade Desk uses SAML to support all major identity providers, including:
- Okta
- Microsoft Entra (formerly Azure Active Directory)
- Ping Identity

### Applications Covered by External SSO

- The Trade Desk platform (Desk UI)
- OpenTTD
- Edge Academy
- OpenPath UI

### Before You Start

Answer the following questions before setting up SSO:
- What is your motivation for integrating your single sign-on solution with The Trade Desk platform?
- How do you currently authenticate users—which identity provider do you use?
- Do you have approval from your legal and security teams to integrate your SSO?
- Who will be the main point of contact in your company?

### Setup Process

| Step | Description | Responsible Party |
|---|---|---|
| 1 | Establish a trust relationship between identity providers. | You and The Trade Desk |
| 2 | Test the functionality. | You and The Trade Desk |
| 3 | Test with a small working group. | You and The Trade Desk |
| 4 | Make final migrations and configuration with mapping spreadsheet. | You and The Trade Desk |
| 5 | Final signoff on integration. | You |

#### Step 1: Establish Trust Relationship Between Identity Providers

- Both parties: Configure identity provider for federation.
- Both parties: Securely exchange credentials for the identity provider.
- You: Create a security group that contains the users who will have access to The Trade Desk platform.

> **IMPORTANT:** You must predefine the specific users. The Trade Desk does not support just-in-time provisioning.

#### Step 2: Test the Functionality

- Using test accounts, test the functionality, including granting and revoking access.
- Create a spreadsheet to map between existing accounts and future accounts using the identity provider.
- Document the accounts that will not use federation (usually API or service-type accounts).
- Create and test the link to The Trade Desk application.

#### Step 3: Test with Small Working Group

- Select one or two users to be your testers.
- Test granting and revoking of access of accounts.
- When everything is verified, move those accounts into the application access group.

#### Step 4: Make Final Migrations and Configuration

- Move specified accounts into application access group.
- The Trade Desk alters existing accounts and creates new accounts as needed.
- Both sides: Final testing.

#### Step 5: Final Signoff

When satisfied that SSO functionality is working correctly, confirm through email.

> **IMPORTANT:** The Trade Desk requires final approval from a senior manager in your company in the form of an email acknowledging that access control is now managed through SSO.

### FAQs

**What identity provider does The Trade Desk use?**
The Trade Desk uses Okta for platform access. It supports all major identity providers.

**Does The Trade Desk platform support third-party SSO with SAML?**
Yes. The platform supports SAML for third-party SSO setup.

**Does The Trade Desk platform support SCIM?**
No. The platform does not support user provisioning with SCIM.

**Does The Trade Desk platform support OIDC?**
No. For external SSO access, the platform currently supports only SAML.

**Can an SSO implementation run in parallel with existing direct logins?**
Yes. Any existing direct logins are not automatically affected by the SSO implementation.

**Is the user's email address the unique identifier for SSO accounts?**
Yes. The user's email address is the unique identifier.

**How can I contact someone who has administrator access to my third-party SSO account?**
Send details to: platform.auth@thetradedesk.com.

---

## 5. Partner Sandbox

**URL:** https://open.thetradedesk.com/advertiser/docsApp/Foundations/resources/doc/PartnerSandbox

The Partner Sandbox is an isolated environment for testing features of the Platform API without impacting your production data or billing cycle. The Partner Sandbox environment contains a clone of your production data that refreshes on a regular weekly basis.

Key facts about the sandbox:
- No real spend from campaigns or ad groups occurs in the Partner Sandbox.
- Your Partner Sandbox partner ID, provider ID, and brand IDs are the same as your production IDs.
- Data is copied from your production environment on a weekly cadence, every Thursday night, and is ready for use by Friday morning in North America.
- The Partner Sandbox contents are wiped clean and refreshed weekly. However, your generated tokens remain untouched for reuse.
- During the refresh, any production changes are synced into the Partner Sandbox, but changes made in the Partner Sandbox do not affect your production environment.

### Setup

Before using the Partner Sandbox, be sure to:
- Verify that the data you are testing on has been synced with the Partner Sandbox.
- Have an existing API token or equivalent production key. For details, see API token authentication.
- If you need access to any hidden endpoints, contact your Technical Account Manager.

### Partner Sandbox Endpoints

| API | Root URL | Description |
|---|---|---|
| REST | https://ext-api.sb.thetradedesk.com/v3/ | The root URL for all REST Partner Sandbox requests. |
| GraphQL | https://ext-api.sb.thetradedesk.com/graphql | The root URL for all GraphQL Partner Sandbox requests. |

> **TIP:** In the Platform UI, you can view the results of your API calls at https://ext-desk.sb.thetradedesk.com.

### FAQs

**How long does it take for the data refresh to complete?**
The data refresh completion time varies. You may experience variations in refresh start and end times.

**Can I upload audience data into the Partner Sandbox?**
No. Audience data is uploaded using header authentication for the Data API, which is incompatible with the Partner Sandbox. You must upload your audience data into production and then wait for the weekly sync.

**What are some best practices to run Sandbox tests?**
Run test workflows as early as possible after refresh on Friday morning, and complete them within one to two days post-refresh.

**Which Platform API endpoints are not supported in the Partner Sandbox?**
None of the `/v3/study` endpoints related to lift studies are supported.

---

## 6. REST and GraphQL

**URL:** https://open.thetradedesk.com/advertiser/docsApp/Foundations/resources/doc/ApisPlatformOpenTTD

The Trade Desk uses both Representational State Transfer (REST) and GraphQL for designing our Platform APIs. The choice between REST and GraphQL often depends on factors such as the complexity of data requirements, your preferences, and the task at hand. You can also leverage both technologies concurrently.

| API | When to Use |
|---|---|
| **REST API** | Use it to access any features available on the platform, including campaign creation and budget management. The only exception is brand-new, Kokai-only features and bulk operations, which are available exclusively through GraphQL. |
| **GraphQL API** | Use it to access Kokai-only features or when you need a flexible way to query specific data, download dimension-specific reports, create seeds or campaigns, or perform bulk operations. |

### FAQs

**Is the GraphQL API only for Kokai, and the REST API only for Solimar?**
Not exactly. While the GraphQL API is designed to support newer Kokai-first experiences, both APIs can be used interchangeably for most core features. REST remains essential for accessing legacy functionality, while GraphQL offers streamlined access to new Kokai-exclusive features and more efficient capabilities such as bulk queries.

**Will the GraphQL API eventually replace the REST API?**
Currently, the GraphQL API is an augmentative feature within the platform API infrastructure. There is no specific timeline or roadmap for any transition.

---

## 7. GraphQL API Calls

**URL:** https://open.thetradedesk.com/advertiser/docsApp/Foundations/resources/doc/GqlApiCallsPlatform

To make a GraphQL API call, you need the following:
- The Trade Desk Platform API credentials provided by your Account Manager.
- Your API token. For details, see Authentication.
- Your tool or method of choice for making API calls (for example, Postman or Python).
- A header (`TTD-Auth`) with your API token.
- The URL for the environment you want to use.

### Environment URLs

| Environment | URL | Note |
|---|---|---|
| Production | https://api.thetradedesk.com/graphql | Build and deploy on production for professional use. |
| Sandbox | https://ext-api.sb.thetradedesk.com/graphql | Use the sandbox environment to test platform API integrations without breaking changes. |

> **IMPORTANT:** Complexity and rate limits apply to all platform GraphQL API calls.

### Making GraphQL Calls in Postman

1. In the left panel, click **New** and choose **GraphQL** as your request type.
2. Enter the URL for the environment you want to use.
3. Click the **Headers** tab, and enter `TTD-Auth` as the key and your API token as the value.
4. To retrieve your schema, go to the **Schema** tab and click **Use GraphQL Introspective**.
5. On the **Query** tab, build your query using the available fields or manually.
6. Click the blue **Query** button to send your request.

### Making GraphQL Calls in Python

Use the `requests` library (e.g., the GraphQL Python library on GitHub). Replace all placeholder values shown in ALL CAPS.

### Platform GraphQL API Resources

| Resource | Description |
|---|---|
| GraphQL API Resource Hub | A high-level introduction to GraphQL concepts, query and mutation anatomy, best practices, response errors, and other non-platform-specific information. |
| Partner Sandbox | A testing environment for workflows before implementing changes in production. |

---

## 8. REST API Calls

**URL:** https://open.thetradedesk.com/advertiser/docsApp/Foundations/resources/doc/ApiUsageGuidelines

### Environments

To specify which production environment to make calls to, use the root URL that corresponds to your platform:

| Platform | Root URL |
|---|---|
| The Trade Desk | https://api.thetradedesk.com/v3/ |
| Walmart DSP | https://api.dsp.walmart.com/v3/ |

For details on generating authentication tokens, see Authentication.

> **IMPORTANT:** To run test processes, use the sandbox environment for Platform API integrations, since the sandbox code is synced with the codebase of our production environment. For details, see Partner Sandbox.

### Protocol

Communication with The Trade Desk Platform API is performed using JSON over HTTPS. When sending JSON requests to the API, be sure to set the HTTP Content-Type header:

```
Content-Type: application/json
```

When a request is successful, the API returns an HTTP response with a **200** status code and, if appropriate, a JSON response body. If an error occurs, the API returns an HTTP response with an appropriate error code and a JSON body describing the error.

### Partial Object Updates

The API differentiates between:
- **Required properties**, which must be present in a request.
- **Nullable properties**, which, if present, may be set to null.

When submitting a request to the API, any properties included in the request will be updated, even if they have null values.

To update only a subset of properties, submit the object ID and the properties that need to be updated in the JSON request. For example:

```json
{
  "AdvertiserId": "akj3m3",
  "Description": "Updated"
}
```

> **IMPORTANT:** Ensure that your JSON serialization library will allow unknown properties to appear in the JSON response without causing an error.

### Best Practices

- Do not paste the entire GET response schema, as this slows down your request processing time.
- Modify only the values of the properties that you want to update and include only them in the PUT request schema.
- Arrays in PUT requests **replace** the current ones instead of adding to them. If you want to add items to any current arrays, make sure to retrieve them first with the respective GET requests.
- Track and log the 400 errors returned so you can detect potential coding mistakes.

See also: Rate limits and Strict mode.

---

## 9. Call Execution Tool

**URL:** https://open.thetradedesk.com/advertiser/docsApp/Foundations/resources/doc/RestApiCallExecutionTool

The Trade Desk offers a Platform API endpoint to allow enterprise clients to build DSP-related automation services. This article describes how to execute a Python-based code tool to test a Platform API call on The Trade Desk platform.

> **NOTE:** The code was tested in Python version 3.9.10.

### Prerequisites

- Install Python on a local machine (Windows: https://www.python.org/downloads/windows/ | Mac: https://www.python.org/downloads/mac-osx/).
- Have a text editor available for modifying the code.
- Download the ZIP file with the complete code sample from the provided download link.

### Execute an API Call

#### Step 1: Inspect and Update the Code

1. If you have not done so, download the tool.
2. Open up the downloaded Python code file in a text editor.
3. In **SECTION 1**, in the Login and Password properties, provide your platform username and password.
4. In **SECTION 2**, instead of the provided sample `/adgroup/query/advertiser` endpoint, specify the URL of the endpoint that you want to use and provide the required input parameter values.
5. Save the updated file.

#### Step 2: Execute the Code

1. Open the command line and navigate to the directory where the updated Python code script is located.
2. Enter the execution command with the name of your Python script and press Enter.
3. The execution output will appear in the terminal. The full output with the response in JSON format appears in the same directory.

> **NOTE:** This sample execution took approximately 15 seconds, but execution time may vary from machine to machine.

---

## 10. Strict Mode

**URL:** https://open.thetradedesk.com/advertiser/docsApp/Foundations/resources/doc/StrictMode

Strict mode is an API feature that performs additional checks to highlight unrecognized elements in the API call. When enabled, strict mode returns an error response if either of the following conditions is true:
- The request body contains an unrecognized property.
- The request body specifies a value for a read-only property.

### Discover Unrecognized Properties

Normally, when a request body contains an unrecognized property, the API ignores the error and returns a 200 success response. With strict mode enabled, the API responds with a **400** error for unknown properties. Strict mode is particularly useful for catching typos.

### Recognize Read-Only Properties

When a request attempts to assign a value to a read-only property, the API normally ignores the error and returns a 200 success response. With strict mode enabled, the API responds with a **400** error for read-only properties.

### How the API Manages Read-Only Properties

| Read-Only Type | Description | Field Example |
|---|---|---|
| **Always Read-Only** | These are always read-only. Any values entered will be ignored. | CreatedAtUTC |
| **Read-Only On Create** | These are read-only on create but may be required for updates. | AdGroupId, CampaignId, BidListId |
| **Read-Only On Update** | These can be set when an entity is created but cannot be modified after. | IsHighFillRate |

### Enable Strict Mode

To enable strict mode when creating an API request, set the following values in the header:
- Enter `TTD-Strict-Mode` as a new key value.
- Set the `TTD-Strict-Mode` value to `true`.

To disable strict mode, set it to `false`.

> **IMPORTANT:** Since requests that normally succeed may fail under strict mode, use strict mode only when developing your integration. Using strict mode in your production application may cause unexpected failures.

### Change Strict Mode Default Settings

The default setting for strict mode is **off**. If you want to enable strict mode as your default user setting, contact your Account Manager.

### Best Practices

- Enable strict mode as a testing feature during the integration stage only.
- When you move the strict mode-enabled code from integration to production, make sure that it is vetted and suitable for production requests.
- To minimize risk, introduce strict mode incrementally in existing production code.
- Track and log the 400 errors returned by strict mode.
- When updating entities, avoid copying GET payloads to PUT requests.

---

## 11. Return Codes

**URL:** https://open.thetradedesk.com/advertiser/docsApp/Foundations/resources/doc/ReturnCodes

The REST API supports the following HTTP response codes to indicate the request status.

| Numeric Code | Message | Description |
|---|---|---|
| 200 | OK | The request was successful. |
| 240 | No Content | The request was successful, but there is no content to return. |
| 400 | Bad Request | The request did not contain all required input, had malformed syntax, or the included input failed validation. |
| 401 | Unauthorized | The user does not have valid authentication credentials to access the requested resource. |
| 403 | Forbidden | The user does not have access to this endpoint or the entity for which they made the call; or the endpoint or entity does not exist. |
| 404 | Not Found | The requested resource has not been found. |
| 409 | Conflict | The request conflicts with the current state of the server. |
| 410 | Gone | The request uses a deprecated endpoint or property. |
| 429 | Too Many Requests | The number of sent requests to the endpoint has exceeded the rate limit. |
| 500 | Internal Server Error | The server encountered an unexpected condition, which prevented it from fulfilling the request. |
| 503 | Service Unavailable | The server was unable to handle the request due to a temporary overload. Use the 'Retry-After' header as guidance on when to retry your request. |

See also the HTTP status codes RFC.

---

## 12. Rate Limits

**URL:** https://open.thetradedesk.com/advertiser/docsApp/Foundations/resources/doc/RateLimits

The API enforces resource governance to ensure all clients can use The Trade Desk services effectively. API endpoint rate limits are an essential part of resource governance and are defined to both protect the platform and inform callers of excessive use.

API endpoint limits are defined as a maximum number of calls a client can make to each platform endpoint within a time period (usually a minute). System-level usage is also monitored and can result in further dynamic reductions to the rate limits.

### FAQs

**How are rate limits enforced?**
When the rate limit for an API endpoint is exceeded, the endpoint returns an HTTP **429** status code and prevents execution. After a period of time of reduced number of calls, the call rate will drop to a level allowing successful execution.

**How can I avoid exceeding rate limits?**
Your code should be able to handle 429 errors and retry after waiting a reasonable amount of time. If you receive the 429 status code too often, consider:
- Limit concurrency to four callers per endpoint.
- Cache data that does not change frequently.
- Utilize delta endpoints that reduce execution times and call frequency. For details, see Platform synchronization.

**How should I handle 429 responses?**
Implement one of the following solutions:
- A fixed delay between calls or wait 1 minute after a failed call before retry.
- An exponential backoff policy: `Delay = Min(max_delay, base_delay * 2 ^ retrycount)`
- Inspect the `retry-after` header in the HTTP response and extract the value (in seconds).

### Query Performance Guidance for Retrieving Third-Party Data

The following table explains how to maximize performance when using the `POST /v3/dmp/thirdparty/advertiser` endpoint:

| Scenario | Guidance | Impact |
|---|---|---|
| You don't utilize TotalFilteredCount or TotalUnfilteredCount. | Set `ExcludeTotalCounts` to `true` in your request. | Improves performance and reduces likelihood of timeout. |
| You perform searches with wide-open filters. | Reduce the scope of the query by utilizing `BrandIds` in your request. | Improving performance. |
| You refresh third-party data by querying all records. | Use `ThirdPartyDataIds` to refresh information for specific IDs. | Improves performance. |
| You use a PageSize greater than 1000. | Consider using a PageSize of around 1000. | Improves performance and reduces likelihood of timeout. |

### Additional Resources

- HTTP status codes RFC
- Exponential Backoff and Jitter
- Implementing HTTP Call Retries with Exponential Backoff with Polly

---

## 13. GraphQL API Resource Hub

**URL:** https://open.thetradedesk.com/advertiser/docsApp/Foundations/resources/doc/GqlApiHub

Welcome to The Trade Desk GraphQL Resource Hub, your one-stop destination for all things GraphQL.

### Why GraphQL?

GraphQL offers a query language and runtime that enables you to request exactly the data you need—no more, no less. It provides an intuitive and powerful alternative to REST, especially for complex data requirements or when consolidating multiple queries into a single request.

### Foundational Concepts

| Concept | Description |
|---|---|
| **Schemas** | Define the structure and capabilities of the GraphQL API, including data types and relationships. |
| **Queries** | Request specific data from a single endpoint. You can customize queries to return specific fields across multiple entities, reducing complexity and response times. |
| **Mutations** | Create and update values in the schema. GraphQL mutations function similarly to POST, PUT, and DELETE requests. |
| **Bulk operation** | Run large-scale GraphQL operations without relying on spreadsheets or tedious manual pagination. |
| **Fields and Aliases** | Fields represent pieces of data requested in a query. Aliases let you rename fields in the response. |
| **Arguments and Filters** | Allow parameters to be passed to fields or mutations, enabling filters and sorting. |
| **Introspective** | Schema self-discovery allows clients to explore the schema programmatically. |

### Key Tasks You Can Master

- Retrieve the data you need with powerful and flexible query structures.
- Modify data and perform actions efficiently.
- Access the API securely.
- Make API calls in Postman and Python.
- Troubleshoot issues and understand system constraints.
- Optimize your API usage while adhering to usage guidelines.

### REST vs. GraphQL Comparison

| Comparison Aspect | REST API | GraphQL API |
|---|---|---|
| Architecture | Is an architectural style. | Is a query language. |
| Communication | Uses HTTP methods (GET, POST, PUT, DELETE). | Sends queries to a single endpoint with the POST HTTP method. |
| Data Fetching | Provides a fixed data structure per endpoint. Can lead to over-fetching or under-fetching. | You can specify exactly what data you need. Eliminates over-fetching and under-fetching. |
| Data Retrieval | Requires additional requests for additional data. | Retrieve multiple resources and related data in one request. |
| Schema | Has no formal schema; endpoints represent resources. | Requires a defined schema specifying capabilities and available data types. |
| Flexibility | Fixed structure. | Flexible; you specify data needs in the query. |
| Developer Experience | Simplicity and scalability. | Efficiency and ability to optimize data fetching for your needs. |

### FAQs

**Which of The Trade Desk products use GraphQL?**
GraphQL functionality is being added incrementally to all products.

**Can I use GraphQL to bypass rate limiting?**
No. Reasonable limits are in place to prevent abuse and server overload.

**Will GraphQL API eventually replace REST API?**
Currently, the GraphQL API is an augmentative feature. There is no specific roadmap for a transition.

**Is there a test environment for GraphQL API?**
Yes. For the Platform GraphQL API, the Partner Sandbox is available for testing without breaking changes to your production environment.

---

## 14. Data Privacy and Transparency

**URL:** https://open.thetradedesk.com/advertiser/docsApp/Foundations/resources/doc/PrivacyTransparencyRegulations

The Trade Desk is committed to supporting a transparent programmatic ecosystem. The following table lists data privacy and transparency policies supported.

> **NOTE:** The list of relevant articles may not be exhaustive. Some pages may require access permissions. If you can't access a page, try logging in or contact your Technical Account Manager.

| Policy or Regulation | Description | Affected Features |
|---|---|---|
| **General Data Protection Regulation (GDPR)** | A comprehensive data privacy and protection law that imposes obligations onto organizations worldwide if they target or collect data related to people in the EU and EEA. Supported via Transparency and Consent Framework (TCF). | Pass Users' Choices in Static Tracking Tags; Universal Pixel Data Processing Options; REDS Data Practices; Cookie Mapping; Real-Time Conversion Events; POST /providerapi/offlineconversion; Geofence Targeting |
| **Global Privacy Platform (GPP)** | A protocol designed by IAB Tech Lab to streamline the transmission of privacy, consent, and consumer choice signals from sites and apps to ad tech providers. Supports CCPA, CPRA, CPA, and others. | Universal Pixel Workflow with CMP Integration; Pass Users' Choices in Static Tracking Tags; Real-Time Conversion Events; REDS Data Practices; POST /providerapi/offlineconversion; Geofence Targeting |
| **Limited Data Use (LDU)** | An alternative to an IAB-compliant CMP or the GPP framework to signal user opt-out choices under US state privacy laws using data processing option strings. | Universal Pixel Data Processing Options; Pass Users' Choices in Static Tracking Tags; Real-Time Conversion Events; Passing User Choices via Limited Data Use Strings |
| **The Digital Services Act (DSA)** | A set of regulations for the EU that requires online platforms to ensure that users in the EU have real-time access to certain information about any ad shown to them. | DSA Advertiser Properties |
