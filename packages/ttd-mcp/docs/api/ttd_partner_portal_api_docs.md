# The Trade Desk Partner Portal API Documentation

> Source: https://partner.thetradedesk.com/v3/portal/api/
> Generated: 2026-04-14T11:16:46.447Z

---

## Table of Contents

1. [Create Advertisers](#create-advertisers)
2. [Advertiser Queries](#advertiser-queries)
3. [Python Scripts](#python-scripts)
4. [Entity Relationships](#entity-relationships)
5. [Seeds](#seeds)
6. [Goals and KPIs](#goals-and-kpis)
7. [Channels](#channels)
8. [Campaign Time Zones](#campaign-time-zones)
9. [REST API: Ad Group Budget Allocation for Campaigns](#rest-api-ad-group-budget-allocation-for-campaigns)
10. [Campaign Creation Workflows](#campaign-creation-workflows)
11. [Campaign Creation Workflow with REST](#campaign-creation-workflow-with-rest)
12. [Create Campaigns](#create-campaigns)
13. [Clone Campaigns](#clone-campaigns)
14. [Update Campaigns](#update-campaigns)
15. [Campaign Details and Insights](#campaign-details-and-insights)
16. [Campaign Connector](#campaign-connector)
17. [Building Audiences](#building-audiences)
18. [The Trade Desk Contextual Custom Categories](#the-trade-desk-contextual-custom-categories)
19. [Geo-Interest Expansion for CTV](#geointerest-expansion-for-ctv)
20. [Koa Optimizations](#koa-optimizations)
21. [Predictive Clearing: Win More Impressions with Lower CPMs](#predictive-clearing-win-more-impressions-with-lower-cpms)
22. [Bid Lists](#bid-lists)
23. [Create and Manage Bid Lists in GraphQL](#create-and-manage-bid-lists-in-graphql)
24. [Create and Manage Bid Lists in REST](#create-and-manage-bid-lists-in-rest)
25. [Default Bid Lists](#default-bid-lists)
26. [Multi-Dimensional Bidding](#multidimensional-bidding)
27. [Frequency](#frequency)
28. [Frequency Management Tasks and Endpoints](#frequency-management-tasks-and-endpoints)
29. [Frequency Caps](#frequency-caps)
30. [Frequency Goals](#frequency-goals)
31. [Frequency Bid Adjustments](#frequency-bid-adjustments)
32. [Custom Optimization Algorithms](#custom-optimization-algorithms)
33. [Dimensional Bidding Custom Algorithms](#dimensional-bidding-custom-algorithms)
34. [User Scoring Custom Algorithms](#user-scoring-custom-algorithms)
35. [Platform API Reference](#platform-api-reference)

---

# Create Advertisers

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/AdvertiserCreate](https://partner.thetradedesk.com/v3/portal/api/doc/AdvertiserCreate)

Create Advertisers

To set up campaigns in the API platform, you must first create an advertiser account. This provides you with an advertiser ID, which is required for many tasks, including creating campaigns, tracking tags, seeds, and data elements, as well as uploading creatives. Some settings you define when creating the advertiser, like currency code, default frequency, and bid lists, are propagated to associated campaigns and ad groups.

Configuring the advertiser is a "set and forget" experience, meaning it's a one-time setup. You only need to modify it to make rare global changes, like preferences for attribution and deduplication windows.

What You Need to Know

Here's what you need to know about creating an advertiser account:

To create an advertiser, you must have a partner ID, which was provided to you as part of your API credentials during your onboarding.
To find the industry categories that applies to your advertiser account, use the IAB Tech Lab Content Taxonomy version 2.2. If you want to see how version 1.0 maps to version 2.2, see IAB Content Taxonomy Mapping: Version 1.0 to 2.2.
Some advertiser tasks, such as uploading data, require additional credentials beyond the advertiser ID, like a secret key (also known as an advertiser key).
By default, your advertiser's currency code is set to the United States Dollar (USD) for budgeting and reporting purposes. If you select a different currency when creating an advertiser, you will not be able to change it and will have to create a new advertiser.
You can specify default frequency, bid lists, Prism settings, and other settings that will be automatically propagated to all campaigns and their ad groups created for the advertiser. You can change these settings for all individual instances as needed when creating or updating them. For details, see the Ownership Relationships diagram in Entity Relationships.

See also FAQs.

Additional Requirements

If you are running political campaigns or operating in specific regions of Europe, or use certain industry categories, additional requirements apply:

To improve transparency around which categories require additional attention, advertisers must include a valid subcategory when using categories that might have subcategories classified as sensitive. For example, an advertiser in the Shopping category must specify a valid subcategory because it includes the sensitive Lotteries and Scratch Cards subcategory.
If you are interested in running advertising campaigns for candidates or ballot measures for federal, state or local elections, there are additional requirements. For details, see Political Advertising.
If you are targeting anyone the European Economic Area, the United Kingdom (under the UK GDPR), or Switzerland, collectively General Data Protection Regulation (GDPR) regions, you must include the DSA properties and check policy restrictions. See also Digital Services Act Properties and EU Health Policy.
Recommended Options

We recommend the following options to enhance your campaigns:

For optimized audience-based buying, The Trade Desk has curated a pool of thousands of vetted, trusted sellers and publishers at no cost to you. Explore the Sellers and Publishers 500+ Marketplace to take advantage of this opportunity.
To help retailers understand how much of your spend is tied to impressions that use their audience data, you can share monthly reports of the partner cost.
Create Request Examples

To submit a successful create request, use either GraphQL or REST API and specify all required properties for the advertiser, such as attribution and deduplication windows. Each API call can create only one advertiser.

GraphQL API

To create an advertiser, use the advertiserCreate mutation. Here's an example that specifies the required properties and attribution and deduplication windows.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
mutation {
advertiserCreate(
input: {
partnerId: "PARTNER_ID_PLACEHOLDER"
name: "ADVERTISER_NAME_PLACEHOLDER"
description: "ADVERTISER_DESCRIPTION_PLACEHOLDER"
attributionClickLookbackWindowInSeconds: 5184000
attributionImpressionLookbackWindowInSeconds:5184000
clickDedupeWindowInSeconds: 7
conversionDedupeWindowInSeconds: 60
advertiserCategoryInput: {
categoryId: 8311
}
defaultRightMediaOfferTypeId: 1
domainAddress: "https://www.domain.com"
country: "US"
}
) {
data {
clickDedupeWindowInSeconds
conversionDeDupeWindowInSeconds
name
description
domainAddress
country{
id
}
}
errors{
... on MutationError{
message
field
}
}
}
}

A successful response returns the assigned advertiser ID and other information. To look up details, you can use GraphQL queries.

REST API

To create an advertiser, specify all the required properties and applicable preferences in a POST /v3/advertiser call.

For example:

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
{
"PartnerId":"{partnerid}",
"AdvertiserName":"Advertiser ABC",
"Description":"New advertiser",
"Country":"US",
"CurrencyCode":"USD",
"AttributionClickLookbackWindowInSeconds":5184000,
"AttributionImpressionLookbackWindowInSeconds":5184000,
"ClickDedupWindowInSeconds":7,
"ConversionDedupWindowInSeconds":60,
"DefaultRightMediaOfferTypeId":1,
"AdvertiserCategory":{
"CategoryId":8311
},
"DomainAddress":"https://www.domain.com"
}

A successful response returns the assigned advertiser ID and other information. To look up details, you can use GraphQL queries.

Configure Advertiser Preferences

For the new advertiser being set up, you can configure preferences for attribution and deduplication windows, and consent to sharing monthly reports of the partner costs with retailers.

Attribution Windows

An attribution window is the period of time after a click or impression occurs that a conversion is tracked for credit to the click or impression. The following table lists attribution examples.

Type	Property	Example
Click Lookback Window	AttributionClickLookbackWindowInSeconds	If the lookback window is set to 30 days, conversions or actions that take place 31 days after that impression is served do not count toward attribution credit and are not included in any reports.
Impression	AttributionImpressionLookbackWindowInSeconds	A 30-day impression attribution window credits any conversion made within 30 days after an impression is served.
Deduplication Windows

A deduplication window is the period during which duplicate clicks or conversions is disregarded for attribution. The following table lists deduplication examples.

Type	Property	Example
Click	ClickDedupWindowInSeconds	A window of seven seconds ensures that if a user clicks an ad more than once during those seven seconds, it is counted as one click.
Conversion	ConversionDedupWindowInSeconds	A window of 500 seconds ensures that if a user performs a desired conversion action (for example, a sale, newsletter sign-ups, or any other measurable result) more than once during those 500 seconds, it will be counted as one conversion.

During the deduplication process for conversions, the decision of whether a conversion event should be recorded or deduplicated depends on the referrer URL in the tracking tag. By default, if conversion events occur on different pages (but with the same TDID and tracking tag ID) within the deduplication window, they are still counted as separate conversions.

TIP: To count duplicate conversions only once within the deduplication window, choose to ignore the referrer URL for deduplication when defining the attribution windows for the advertiser.

Advertiser Consent for Sharing Partner Costs with Retailers

Partner cost is the total cost advertisers incur for impressions, calculated as the sum of media cost, data cost, fee features cost, and tech fees when a retailer's data is applied. Additional fees, such as margin fee, CPM fee, and flat CPM rate, are not included in the cost.

Sharing monthly reports of the partner cost with retailers helps them understand how much of your spend is tied to impressions that use their audience data. This visibility allows retailers to better assess your progress toward meeting commitments and confirm when those commitments have been fulfilled. You, as the advertiser, must give consent before the partner cost can be shared.

Cost Data Shared with Retailers

Retailers receive a monthly report with aggregated partner cost data for impressions targeting their audience segments. It can be delivered in Excel or CSV format.

NOTE: Partner cost is reported as a lump sum. Retailers do not see a breakdown of media costs, data costs, or fees.

The following table is an example of a report generated in April, including three advertisers who consented to share partner cost in March.

Example Report: Generated April

Month	Advertiser Name	Partner Cost
March	Advertiser A	$10,000
March	Advertiser B	$5,000
March	Advertiser C	$3,000
Consent to Share Partner Cost

To provide consent to share your partner cost data with retailers, use the following advertisers mutation with your advertiser ID and the merchant ID of the retailer in the retailCommitmentTrackerSettings object. You can use it for multiple advertisers and retailers.

1
2
3
4
5
6
7
mutation {
advertisers {
retailCommitmentTrackerSettings {
create(input: {advertiserId: "ADVERTISER_ID_PLACEHOLDER", merchantId: "MERCHANT_ID_PLACEHOLDER"})
}
}
}
Digital Services Act Properties

The Digital Services Act (DSA) is a set of regulations for the EU. Per DSA, online platforms—which will include certain publishers such as online marketplaces, social networks, travel and accommodation platforms, app stores, as well content-sharing platforms—must ensure that users in the EU have real-time access to certain information about any ad shown to them, including (amongst other things) the name of the advertiser and the name of the natural or legal person (individual or organization) who paid for the ad, if it is different from the advertiser.

If you are targeting anyone in the EU, review your advertiser properties and update your workflows to include the following new DSA properties: AdvertiserNameDsa and PayerNameDsa. If no DSA transparency information is provided in these properties, The Trade Desk will use default values by pulling them from the AdvertiserName API property and the CustomerName field from our internal business database.

The following table summarizes the details.

Required Information	DSA Property	Default Value	Notes
Advertiser’s name	AdvertiserNameDsa	AdvertiserName	The default value is read from the advertiser API.
Payer’s name	PayerNameDsa	CustomerName	The default value is read from our internal business database.

IMPORTANT: It is your responsibility, as required under our Master Services Agreement, to ensure any information you provide to us is truthful and correct. If you fail to confirm the values, you agree to us using the default values.

If you have questions or require more information, contact your Account Manager or Technical Account Manager.

EU Health Policy

NOTE: This section only applies to data coming from the European Economic Area, the United Kingdom (under the UK GDPR), or Switzerland, collectively GDPR regions.

The Trade Desk maintains an EU Health Policy that treats health data as sensitive data, which could impact advertisers that promote health-related products. If you are an advertiser that runs campaigns in the GDPR regions, then it may be subject to these policy restrictions.

The following table summarizes the scope of impact.

Endpoints	Condition	Notes
Bid Lists	Bid list contains atmospheric conditions.	Pollen risk targeting is disabled in GDPR regions.
Ad Groups	Ad group optimization uses Audience Booster, Prism, and Audience Predictor.	Certain ad group performance enhancements are not supported in GDPR regions. For details, see Performance-Enhancing Features.
In GraphQL API, the Prism is controlled at the advertiser level by the new prism property.
NOTE: Prism is disabled for advertisers whose partners have opted out of fee-based features.
CRM Data	Upload contains health data that originates within GDPR regions	Advertisers cannot upload health data that violates policy.

NOTE: Health advertisers are identified through self-categorization and review by The Trade Desk, of the advertised product.

Next Steps

Now that you have your advertiser ID, you can onboard your data. If you've already done that, then you can create your seeds and campaigns.

For the full workflow, see Get Started for Advertisers.

FAQs

The following is a list of frequently asked questions about creating advertiser accounts.

How do I find my industry category?

To retrieve categories in a taxonomy, make a GET categorytaxonomy/13/category/industrycategories call where 13 in the path is the (2.2) taxonomy ID.

Look through the list of the available categories and choose the one that applies to your industry. Here's a response snippet with two sample categories in IAB 2.2 taxonomy.

NOTE: The Trade Desk uses the IAB Tech Lab Content Taxonomy version 2.2 for assigning industry categories to advertisers. If you want to see how version 1.0 maps to version 2.2, see IAB Content Taxonomy Mapping: Version 1.0 to 2.2.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
[
{
"CategoryId": 8311,
"externalId": "568",
"parentCategoryId": "1234",
"name": "Women's Fashion",
"path": "Style & Fashion\\Fashion",
"children": [],
"mappingInformation": [
{
"CategoryTaxonomyId":2,
"CategoryId":292,
"ExternalId":"IAB18-5"
}
]
},
{
"categoryId": 7168,
"externalId": "432",
"parentCategoryId": "1234",
"name": "Celebrity Fan/Gossip",
"path": "Arts & Entertainment\\Celebrity Fan/Gossip",
"children": [],
"mappingInformation": [
{
"CategoryTaxonomyId": 13,
"categoryId": 3,
"externalId": "IAB1-2"
}
]
}
]
Are there limitations to using industry categories?

Special considerations apply to some features based on the advertiser industry category. Ad groups associated with advertisers assigned to some industry categories and subcategories cannot use Koa Audience Predictor or Prism. Some of these industries include Careers, Health and Fitness, Personal Finance, and Real Estate.

How do I attach a seed to an advertiser? And can I change the default seed for the advertiser?

The very first seed you create is automatically attached to the advertiser as the default seed. If you have more than one seed, you can replace the default seed with a different one. For details, see Change Default Seed for an Advertiser.

How do I disable deduplication?

To disable deduplication, do the following:

For clicks, set the ClickDedupWindowInSeconds property to 0.
For conversions, set the ConversionDedupWindowInSeconds property to 0.
Do I have to link to an advertiser logo or brand image?

No. It is not required, but it is recommended that this value be set because a logo URL is necessary to bid on certain types of inventory from select supply vendors.

How do I enable Prism for an advertiser?

You can enable Prism using GraphQL or REST. For details, see Prism.

Does changing Prism settings affect live ad groups?

No. Changing Prism settings does not affect any live ad groups.

Why does the partner cost in retailer spend reports differ from the reports I generate?

Partner cost is calculated differently in retailer spend reports and the reports you generate in the platform, which may cause discrepancies. Here's the difference:

Retailer spend reports aim to provide retailers with a simplified spend view by attributing the full partner cost to them.
Your generated reports may duplicate or split partner cost depending on the report type and settings.

If you’re unsure how to compare the numbers, contact your Account Manager.

Can I give consent to multiple retailers using bulk edits?

No. There are no bulk operations available. You must make multiple API calls.

How do I stop sharing partner costs?

If you need to stop sharing your partner cost data with retailers, contact the Client Services team.

---

# Advertiser Queries

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/AdvertiserGQLQueryExamples](https://partner.thetradedesk.com/v3/portal/api/doc/AdvertiserGQLQueryExamples)

Advertiser Queries

After creating the advertiser, you can retrieve advertiser details using either the GraphQL or REST APIs. While the REST endpoints allow you to retrieve only one advertiser at a time, the GraphQl API enables you to create custom queries to search across multiple associated child records.

TIP: If you're new to GraphQL, explore our GraphQL API Resource Hub to learn the basics—like query anatomy, authentication, and rate limits—as well as how to run bulk queries.

The following sections provide examples of the advertiser query that you can use to look up advertiser information.

Look Up Campaign Performance Metrics by Date Range

With the GraphQL API, you can create and customize advertiser queries and include reporting fields that provide key performance metrics for tracking KPIs, cost and bidding, media quality, and the overall effectiveness of all campaigns associated with the advertiser. You can either retrieve lifetime data or organize it by day or hour to help analyze trends, optimize bids, and measure engagement effectively. Whether you're evaluating media efficiency or optimizing your bidding strategy, these detailed performance metrics can help you make informed, data-driven decisions.

TIP: You can also use the reporting field to retrieve performance metrics at the campaign and ad group level.

Here's what you need to know about looking up advertiser performance metrics by date range:

These metrics also include data from all of the ad groups and campaigns associated with the advertiser.
You can filter the metrics only by date.
If you don't include a date range in the where filter, the query returns the lifetime metrics for all campaigns associated with the advertiser.
You can retrieve metrics at the following time intervals, specified in the dimensions field:
Hourly (last 30 days)
Daily (last year)
If you don’t include the dimensions field, the query returns aggregated totals for each metric without grouping data by time interval.

The following advertiser GraphQL query retrieves all metrics you can use to optimize campaign performance, manage spend and bidding, and so on. The date range is specified using gte (start, inclusive) and lte (end, inclusive) for the reporting period.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
49
50
51
52
53
54
55
56
57
58
59
60
61
62
63
64
65
66
67
68
69
70
71
72
73
query GetAdvertiserPerformanceMetricsbyDateRangeExample($advertiserId: ID!) {
advertiser(id: $advertiserId) {
reporting {
generalReporting(
where: { date: { gte: "2025-02-01", lte: "2025-02-28" } }
) {
nodes {
dimensions {
time {
day
}
}
metrics {
adPlays
baseBid {
advertiserCurrency
}
bidCpm {
advertiserCurrency
}
bids
clicks
completionRate
conversions
cpa {
advertiserCurrency
}
cpc {
advertiserCurrency
}
cpcv {
advertiserCurrency
}
cpm {
advertiserCurrency
}
ctr
customCpa {
advertiserCurrency
}
customRoas {
advertiserCurrency
}
impressions
mediaCost {
advertiserCurrency
}
mediaCpm {
advertiserCurrency
}
nielsenOtp
revenue
roas {
advertiserCurrency
}
spend {
advertiserCurrency
}
tvQualityCpm {
advertiserCurrency
}
tvQualityIndex
vCpm {
advertiserCurrency
}
viewability
winRate
}
}
}
}
}
}
Look Up Advertiser Details

The following GraphQL query retrieves key metric details, such as channel and funnel location counts, for an advertiser by its ID.

1
2
3
4
5
6
7
8
9
10
11
12
query GetAdvertiserKeyMetricDataExample($advertiserId: ID!) {
advertiser(id: $advertiserId) {
id
name
isFavoriteForUser
logo
channelCount
totalCampaignChannelCount
funnelLocationCount
totalFunnelLocationCount
}
}
Look Up Advertiser Seeds

The following GraphQL query retrieves seed details for an advertiser.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
query GetAdvertiserSeedsExample($advertiserId: ID!) {
advertiser(id: $advertiserId) {
id
name
seeds {
createdAt
id
isDefault
lastUpdatedAt
name
targetingData {
contextualInclusion {
ids
keyphrases
urls
}
countryFilter {
id
name
}
firstPartyInclusion {
name
}
targetingDataId
}
}
}
}
Look Up Advertiser Data Segments

The following GraphQL query retrieves advertiser first-party data segments. It is the equivalent of the dmp/firstparty/advertiser REST endpoint.

TIP: When querying for as much first-party data as possible, to minimize query complexity, avoid requesting the totalCount field.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
query GetFirstPartyDataExample($advertiserId: ID!) {
advertiser(id: $advertiserId) {
firstPartyData(
first: 10
where: {
name: { contains: "SEGMENT_NAME_OR_OTHER_SEARCH_TERM_PLACEHOLDER" }
}
) {
pageInfo {
hasNextPage
endCursor
}
nodes {
name
id
activeUniques {
householdCount
idsConnectedTvCount
idsCount
idsInAppCount
idsWebCount
personsCount
}
}
}
}
}

Multiple search terms can be combined in a single request. For example, to retrieve first-party data for multiple advertisers, use an array of advertiser IDs. The following is a code fragment example:

1
2
query GetFirstPartyDataForMultipleAdvertisersExample {
advertisers(first: 50, where: { id: { in: ["ADVERTISER_ID_PLACEHOLDER_01",
"ADVERTISER_ID_PLACEHOLDER_02", "ADVERTISER_ID_PLACEHOLDER_03"] } })
Look Up Advertiser Settings

The following GraphQL query retrieves advertiser settings (also known as preferences in the UI), such as attribution windows, viewability, tracking, and so on.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
49
50
51
52
53
54
55
56
57
58
59
60
61
62
63
64
65
66
67
68
69
70
71
72
73
74
75
76
77
78
79
80
81
82
83
84
85
86
87
88
89
90
91
92
93
94
95
96
97
98
99
100
101
102
103
104
105
106
107
108
109
110
111
112
113
114
115
116
117
118
119
120
121
122
123
124
125
126
127
query GetAdvertiserPreferencesExample($advertiserId: ID!) {
advertiser(id: $advertiserId) {
id
name
description
domainAddress
currency {
id
name
}
partner {
id
name
chinaMSASigned
}
clickDedupeWindowInSeconds
conversionDeDupeWindowInSeconds
ignoreReferralUrlInConversion
useMediaCostBasisForCampaignFees
logo
attribution {
clickLookbackWindow
clickInterval
impressionInterval
impressionLookbackWindow
}
defaultRightMediaOffer {
id
name
}
rightMediaOfferTypes {
id
name
}
availableIndustryCategories {
id
name
parentCategoryId
isDefault
isSensitive
}
availableIndustrySubCategories {
id
name
parentCategoryId
isDefault
isSensitive
}
industryCategory {
id
name
parentCategoryId
isDefault
isSensitive
}
industrySubCategory {
id
name
parentCategoryId
isDefault
isSensitive
}
brandOwner
assignedBrands {
id
name
owner
}
tracking {
defaultUrls {
selectedTrackingType
partnerDefault
advertiserDefault
creativeTypes
}
defaultThirdPartyTags {
selectedTrackingType
partnerDefault
advertiserDefault
creativeTypes
}
defaultClickUrl {
selectedTrackingType
partnerDefault
advertiserDefault
creativeTypes
}
}
viewability {
availableProviders {
displayName
id
isPartnerDefault
fees {
displayFee
videoFee
}
settings {
profileDisplayName
providerId
displaySamplingRate
videoSamplingRate
}
}
selectedProviderId
settingsOverride {
profileDisplayName
providerId
displaySamplingRate
videoSamplingRate
}
}
defaultPartnerViewabilitySettings {
profileDisplayName
providerId
displaySamplingRate
videoSamplingRate
}
political {
categoryIds
isBallotMeasure
isCandidateElection
candidateCount
}
isBlockedFromHhSolution
}
}
Look-Up Live Campaigns with Highest CPM

The following GraphQL GetHighestCpmLiveCampaignsExample query retrieves a list of live campaigns that have the highest CPM. See also On-Demand Reporting Queries.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
query GetHighestCpmLiveCampaignsExample($advertiserId: ID!) {
advertiser(id: $advertiserId) {
campaigns(
first: 25
where: { status: { in: [LIVE, LIVE_NOT_SPENDING] } }
order: [
{
campaignReporting: {
metric: CPM_IN_ADVERTISER_CURRENCY
direction: DESC
}
}
]
) {
nodes {
name
reporting {
generalReporting {
nodes {
metrics {
cpm {
advertiserCurrency
}
}
}
}
}
}
}
}
}
Look Up Advertiser Metadata

The following GraphQL query retrieves the programmatic tile metadata of an advertiser.

1
2
3
4
5
6
7
8
9
10
11
12
query GetAdvertiserTilesExample($advertiserId: ID!) {
advertiser(id: $advertiserId) {
id
name
programmaticTiles {
isKoaOptimized
isUserOptimized
metadataSummaries
type
}
}
}
Look Up Tracking Tags

The following GQL query uses a trackingTags filter to find the names and IDs of tracking tags used by an advertiser. To learn more about using filters, see GraphQL API Queries in our GraphQL Resource Hub.

1
2
3
4
5
6
7
8
9
10
query GetTrackingTagNamesExample {
advertiser(id: "ADVERTISER_ID_PLACEHOLDER") {
trackingTags(where: {name: {eq: "TRACKING_TAGS_OBJECT_NAME_PLACEHOLDER"}}) {
nodes {
name
id
}
}
}
}
Look Up Prism Settings

The following GraphQL query checks whether Prism is available and enabled for an advertiser.

1
2
3
4
5
6
7
8
9
10
11
query GetPrismStatusExample($advertiserId: ID!) {
advertiser(id: $advertiserId) {
dataSettings {
prism {
isAvailable
isEnabled
metadata
}
}
}
}

---

# Python Scripts

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/PythonScripts](https://partner.thetradedesk.com/v3/portal/api/doc/PythonScripts)

Python Scripts

To facilitate and illustrate the campaign upgrade, create, and other workflows in Kokai, we've provided a comprehensive collection of Python scripts for each API. These scripts are for an ever growing quickstart that focuses on the core functions in Kokai. The following sections list the available scripts grouped by API, sorted alphabetically, and provides links to relevant user guides for guidance on implementation details and requirements.

Here's what you need to know about our Python scripts:

You can access the latest version of our Python Scripts on GitHub.
Some scripts require you to fill-in-the-blank for placeholder values.
Scripts have a REST or GQL suffix to denote which API is supported.
Scripts with no suffix require the usage of both REST and GraphQL.
Scripts use a prefix to denote the type of operation, such as Create, Get, Clone, and so on.
Files are organized alphabetically and grouped by area, such as campaign, budgets, cloning, and more.
Git Directory

The following table lists the available directories on Github and links to user guides, sorted alphabetically.

Directory	Description	User Guide
Campaign	Create and manage campaigns for Kokai using GraphQL or REST.	Campaigns
Delta	Track periodic metadata-level changes using GraphQL or REST.	Platform Synchronization
Report	Download and query different kinds of reports using GraphQL.	Reports (More coming soon)
Seed	Create an ideal audience to target your campaigns using GraphQL.	Seeds
Campaign Scripts

Learn how to create and update campaigns for Kokai using GraphQL or REST. For details on which scripts to use, see Campaign Creation Workflows.

GraphQL API

Create campaigns in Kokai with the GraphQL API, through these fill-in-the-blank GQL Python scripts.

The following table lists the available scripts for GraphQL and user guides, sorted alphabetically.

Script	Description	User Guide
CloneCampaignGQL.py	Create one or more Kokai copies of an existing campaign using GraphQL.	Clone Campaigns with the GraphQL API
CreateCampaignWorkflowGQL.py	Create a Kokai campaign using GraphQL.	Campaign Creation Workflow with GraphQL
CreateCampaignsBulkGQL	Create multiple Kokai campaigns in a single request using GraphQL.	GraphQL Bulk Operations
GetCampaignBudgetGQL.py	Retrieve campaign budget settings using GraphQL.	Budget Allocation
GetCampaignGQL.py	Retrieve campaign information using GraphQL.	GraphQL Campaign Query Examples
REST API

Create campaigns in Kokai with the REST API, through these fill-in-the-blank REST Python scripts.

The following table lists the available scripts for REST and user guides, sorted alphabetically.

Script	Description	User Guide
CloneCampaignREST.py	Create a Kokai campaign copy of an existing campaign using REST.	Clone a Campaign with the REST API
CreateCampaignWorkflowREST.py	Create a Kokai campaign using REST.	Campaign Creation Workflow with REST
GetCampaignREST.py	Retrieve campaign information using REST.	Campaign REST Endpoints
Solimar-to-Kokai Upgrade

Upgrade campaigns and/or their budgets to be fully compatible with Kokai using both GraphQL and REST.

IMPORTANT: The following scripts are listed in alphabetical order. To determine which scripts must be run, see Upgrade Solimar Campaigns to Kokai.

The following table lists the available scripts and user guides.

Script	Description	User Guide
UpdateCampaignBudgetWorkflow.py	Check the campaign version (Kokai or Solimar) and update its budget accordingly, using REST and GraphQL.	Budget Allocation
UpgradeBudgetSettingsToKokaiGQL.py	Upgrade a campaign's Solimar budget to Kokai using GraphQL.	Budget Allocation
UpgradeCampaignToKokaiGQL.py	Upgrade a Solimar campaign to Kokai using GraphQL.	Upgrade Solimar Campaigns to Kokai
Data Scripts

NOTE: For samples on targeting data and rate information, see Data Insights.

Search through your data and audiences with scripts using GraphQL.

First-Party Data

The following table lists the available scripts for GraphQL and user guides, sorted alphabetically.

Script	Description	User Guide
GetAdvertiserFirstPartyDataGQL.py	Retrieve all first-party data elements for an advertiser.	Building Audiences
GetPartnerFirstPartyDataGQL.py	Retrieve first-party data from all advertisers under a partner.	N/A
Third-Party Data

The following table lists the available scripts for GraphQL and user guides, sorted alphabetically.

Script	Description	User Guide
GetAllThirdPartyDataForPartnerGQL.py	Retrieve all the third-party data elements of an audience.	Building Audiences

---

# Entity Relationships

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/EntityRelationships](https://partner.thetradedesk.com/v3/portal/api/doc/EntityRelationships)

Entity Relationships

To manage your campaigns efficiently, it's helpful to understand the relationship between entities within the API platform. There are two primary types of relationships: ownership and assignment.

For more details on these entities, their properties, and their relationships, see our API Reference.

Ownership Relationships

Owned entities exist within a hierarchical structure where the owner is the parent entity. For example, an advertiser owns key entities such as creatives, seeds, data, audiences, and campaigns, granting them the authority to create, update, or delete them. To create any of these items, you need an advertiser ID.

Owned entities automatically inherit certain properties or settings from their parent entities, with the option to override inherited attributes. This streamlines the setup process, ensures consistency across campaigns, and helps you focus on advertising strategy instead of repetitive manual configuration. By defining key properties like the currency code, default frequency, and bid lists at the advertiser level, you can automatically propagate these settings to all associated campaigns and ad groups as needed. For details on bid lists, see Bid List Relationships.

The following diagram shows the ownership relationships among API platform entities, from the partner to the ad-group level. The one-to-many arrows indicate how an entity can own multiple child entities. For example, a single advertiser can own multiple campaigns, but each campaign can only belong to one advertiser.

Assignment Relationships

In addition to ownership relationships, entities have assignment relationships, also known as associations. These relationships define how entities are associated with each other, often indicating specific roles or responsibilities. They determine how resources are allocated and performance is measured. Unlike ownership relationships, assignments can be transferred from one entity to another.

For example, the advertiser can assign creatives to multiple ad groups, each with different goals and targeting parameters. They can also reuse these creatives in different ad groups as needed.

The following diagram shows the ownership and assignment relationships among API platform entities, from the partner to the creative level. Solid lines represent ownership relationships, while dashed lines represent assignment relationships. Bid lists are an exception and are not shown in this diagram. These can be owned and assigned at any level of the major core entities: partner, advertiser, campaign, and ad group.

---

# Seeds

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/Seed](https://partner.thetradedesk.com/v3/portal/api/doc/Seed)

Seeds

Seeds are at the center of each campaign in Kokai. This representation of your most valuable customers powers real-time insights and AI optimizations—and should be considered the nucleus of your campaign decisions. To run impactful campaigns in Kokai, you need at least one high-quality seed, ideally sourced from first-party data.

NOTE: Even if you don't have access to first-party data, you can still create seeds with other sources, such as retail purchase data, providing a reliable foundation for effective targeting strategies. See Choose Seed Data Sources.

Before you get started, let's lay the foundation by clarifying some key Kokai terms and their definitions.

A seed is a representation of your converted customers. Converted customers are people who have taken valuable actions for your brand. These actions might include making purchases, signing up for your loyalty program, installing applications, and so on, as long as these actions align with your key objectives as an advertiser. Not all actions are valuable. For example, a landing page visit or creative click is not a valuable action. By creating a seed in the platform, you unlock relevance.

Relevance is the metric that effectively scores numerous dimensions for your ideal customer. Relevance scores are a comparison tool that enables you to better understand which strategies (or adjustments to strategies) are more likely than others to be successful, so you can spend your budget as efficiently as possible. Relevance scores are calculated based on your seed, and are part of campaign snapshots.

To learn more about seeds, consider watching these videos:

What is a seed? And how you can use it?
Tags and Seeds (in The Trade Desk platform UI)

See also FAQs.

Seed Quality

High-quality seeds are deterministic, precise, and durable. To ensure that you receive the best relevance scores, leading to better outcomes, be sure to regularly monitor the health of your seeds.

The following table provides information about seed quality scores.

NOTE: High-quality seeds represent converters—seeds that contain brand purchasers.

Quality	Type of Data	Details
High	First-party	Includes segments that are categorized in the Advertiser Data and Identity (One) tile as one of the following:
Purchase
Loyalty members
Voters for political advertisers

First-party segments are defined in two ways:
User-defined
Categorized daily by The Trade Desk through keyword matching

Third-party	Includes only segments that are categorized as purchase. Only brand purchase segments are allowed (no category purchase), and the segment cannot be modeled. The Trade Desk categorizes third-party segments based on the data partner’s methodology.
Medium	First-party	These segments are used in reporting and attribution.
Either or both of the following:
Third-party/retail targeting
Offline conversion segments
Includes the following segments:
Category purchasers
Modeled brand purchasers
Modeled category purchasers
Location visitors
Modeled pharma segments for medical health
Registered voters for political advertisers

Low	All else

TIP: The quality of the customers that make up the seed is more important than its initial size. A smaller seed with rich signals can be more effective because it provides a concentrated pool of users with the most desired behaviors for your brand.

The following table lists a few practical guidelines for creating, updating, and evaluating your seeds to ensure the best relevance scores.

Guideline	Description
Focus on converters	Prioritize seeds that represent converted audiences rather than proxy actions. Converters typically exhibit more distinct behaviors, enhancing the seed's utility for our algorithms.
Emphasize precision and concentration	Aim for the most precise and concentrated dataset possible. Our models do not rely on size to assess seed quality, and we need only 5000 IDs for modeling purposes, but platform averages typically range around 100,000.
Ensure behavior consistency	Ensure that the seed represents one behavior consistently. Avoid mixing homepage visits with conversion pixels or combining conversions from multiple product lines, as this can dilute the quality concentration of the seed and broaden the range of behaviors targeted.
Prioritize recent converters	When uploading first-party data, prioritize seeds containing individuals with recent conversion attributions. For example, seeds with converters from the last 30 days are more likely to appear in the bidstream for modeling, compared to those from the past six months.
Monitor seed health	Recognize that seeds can evolve over time. Regularly monitor the health of your seeds.
Track the number of active IDs	If a seed has fewer than 5000 active IDs, it does not impact bidding. When this happens, one way to improve the counts is to add contextual data. When the seed reaches 5000 active IDs, it prioritizes the segment again.
Choose Seed Data Sources

To create a high-quality seed, start with well-sourced data as your foundation. First-party data stands out as the prime choice, offering direct insights into your audience. Additionally, retail data serves as a valuable seed source, providing unique perspectives on consumer behavior. Third-party data and custom segments are also viable options, especially if they align with your target audience's conversion patterns. In the event that purchase data is unavailable, proxy seeds offer an alternative choice. For example, you might choose to include homepage visits, which serve as early signals of potential conversions, ensuring your seed remains robust even in circumstances that are less than ideal. You can use any combination of data sources for your seed.

IMPORTANT: If you use third-party data, you must check that the segment supports seeds and that you have permission to use the data. To check whether your data is eligible for seed creation, see FAQs.

The following table summarizes various data sources that you can use to create a seed, listing them in descending order of quality. See also FAQs.

Data Source	Seed Quality	Description
Real-time first-party conversion data	Converted audience	Online conversion events, such as purchases or sign-ups that we record. Best collected using pixels.
Imported conversions	Converted audience	CRM data or offline first-party segments.
Retail purchase data, precise and specific to the advertiser	Converted audience	Segments that The Trade Desk categorizes as including users who have made purchases from a specific brand. This might be a good choice, for example, if your product is for Consumer Packaged Goods (CPG), because you might not have the previous options.
Brand-specific third-party purchase data	Converted audience	Advertisers, such as pharmaceuticals, QSR, political advertisers. who might not have access to good first-party conversion or retail data.
Other real-time first-party data	Proxy audience	Tracking tags or app data, representing homepage landings or proxy actions (clicks) that express interest.
Brand-specific category or interest data	Proxy audience	Less valuable than purchase data, but can be a starting point for a temporary seed.
Custom keywords or sites	Proxy audience	A temporary solution for advertisers to create their first seed, until they can leverage a higher-quality data source.
Seeds with Multiple Segments: Applying Boolean Logic

You can create seeds using multiple segments. In this case, Boolean logic is applied to determine relevant users based on whether the segments are first-party or third-party data. Here's a high-level overview of the logic:

First-party data segments: These are treated as "OR" conditions. This means that a user needs to meet only one of the criteria. In other words, a user in any of the included segments is relevant, such as users who have interacted with your company's app or made a purchase at its store.

Third-party data segments: These are treated as "AND" conditions. This means that a user must meet all the criteria. In other words, to be considered relevant, users must belong to all listed third-party segments, such as users that are interested in sports and are located in a specific country.

The following table describes the Boolean logic for various data segments, listed in order of relevance from highest to lowest, as recommended for creating your seed.

Data Segment Type	Boolean Logic	Description
First-party data segments	OR	Users in any first-party data segment.
Retail converter data segments	OR	Users in any retail converter data segment (where they have made a purchase of a specific brand). Category purchasers are not included: for example, Coca-Cola purchasers are included, but soda purchasers are not.
TIP: Use brand-purchase data whenever possible, because it directly represents your customers.
Retail non-converter segments	AND	Only users found in all retail non-converter segments.
Offline measurement data segments	OR	Users in any offline measurement data segment.
Third-party data segments	AND	Only users found in all third-party data segments.
Keywords or URLs for custom data segments	OR	Users if they match any keyword or URL in any segment.
Across all data segments	OR	Users in any segment.
Get Started

Your partnership with us begins when you create your seed in the platform. You identify your ideal customer from the data uploaded to the platform, and we work together to find that type of person wherever they are on the internet.

If you've familiarized yourself with our guidelines for seed quality and data sources, you're ready to harness the power of audience-based buying and to unlock relevance through your seeds. Here's a high-level overview of the steps for you to follow:

Identify your seed data sources and make a list of segment IDs that you want to use for your seed. See also FAQs.
Create a seed.
Attach the seed to your campaigns.

The following sections define the seed object and provide examples of key tasks and use cases associated with seeds.

Seed Object

The following table lists the high-level fields that are part of a seed in the GraphQL API. When creating or updating seeds, you can specify some of them as input and others as response data to be returned.

Field	Data Type	Required?	Description
id	String	Required	The unique identifier for the seed, assigned at its creation. To update the seed, or to attach it to a campaign, you must provide the seed ID.
advertiser	Object	Required	The details of the advertiser that owns the seed.
targetingData	Object	Required	Depending on the data sources used for the seed, this might be a list of first-party, retail, or third-party data segment IDs, contextual key words and phrases, or URLs.
IMPORTANT: If you use third-party data, you must check that the segment supports seeds and that you have permission to use the data. To check whether your data is eligible for seed creation, see FAQs.
activeIds	Integer	Optional	The number of IDs seen in bidding within the past seven days. For details, see Unique ID Counting Methodologies.
createdAt	DateTime	Optional	The date and time when the seed was created.
lastUpdatedAt	DateTime	Optional	The date and time when the seed was last updated.
name	String	Optional	The seed name.
status	String	Optional	The current status of the seed. For possible values, see Seed Status Values.
uniqueHouseholds	Integer	Optional	The number of unique households that are in in the seed, based on matching it on the household graph.
campaigns	Object	Optional	The details of the campaigns to which the seed is attached.
Seed Status Values

The following table lists the possible seed status values.

Status	Description
Pending	We're currently gathering IDs for the seed. This might take up to 24 hours.
Ready	The seed contains sufficient high-quality signals, and is ready for use.
Error	The seed requires a minimum of 5,000 active IDs to be considered ready for use. Add more data segments.

The following sections provide examples of critical seed mutations and queries.

Create a Seed

IMPORTANT: Before you begin, be sure to review our guidelines for seed quality and data sources.

To create a seed, you must have the following:

Your advertiser ID
A name for your seed that describes it
Your selected targeting (source) data IDs
Approval to use your selected targeting (source) data IDs, if you are using third-party data


TIP: To look up targeting data IDs, use the POST /v3/dmp/firstparty/advertiser endpoint for first-party data or the POST /v3/dmp/thirdparty/advertiser endpoint for third-party data. For details, see the first-party data elements and third-party data elements look-up task examples under Audience.

Here's what you need to know about creating a seed:

You can create more than one seed per advertiser, but you can attach only one seed per campaign.
The first seed that you create is automatically set as your default seed, which is automatically attached to your campaigns in Kokai unless you specify a different seed. If you have more than one seed, you can change your default seed.

When you're ready, run a seedCreate mutation with your input information and specify the fields you want to be returned in the response, such as id. The following example includes different types of targeting data to illustrate how you can specify it as your input.

NOTE: In the targetingData object, the countryFilterIds filter is intended for use with contextual data only. It is not a seed-specific targeting setting, and does not apply country-level targeting to the seed. If you are not using contextual targeting in your seed, omit this filter.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
mutation {
seedCreate(
input: {
advertiserId: "abc123x"
name: "1pd-retail-3pd-custom-segment-seed"
targetingData: {
firstPartyDataInclusionIds: [572489361, 817405926]
retailDataInclusion: [
{thirdPartyDataId: 693210847, thirdPartyDataBrandId: "brandabc"},
{thirdPartyDataId: 856319742, thirdPartyDataBrandId: "xyzbrandid"}
]
thirdPartyDataInclusion: [
{thirdPartyDataId: 761834295, thirdPartyDataBrandId: "123brand"},
{thirdPartyDataId: 625039174, thirdPartyDataBrandId: "3pdbrandid"}
]
contextualInclusion: {
keyphrases: ["open internet", "kokai"],
urls: ["http://thetradedesk.com"]
}
countryFilterIds: ["US"]
}
}
) {
data {
id
}
}
}

A successful response returns the values that you specify: for example, the platform ID for the newly created seed.

IMPORTANT: To update the seed, or to attach it to a campaign, you must provide the seed ID.

If this is your first seed, it's automatically used as the default seed for all your campaigns. If you have more than one seed, you can attach your new seed to a campaign.

Attach a Seed to a Campaign

To take advantage of audience-based buying, each campaign in Kokai requires a seed.

NOTE: This section focuses on GraphQL instructions, but you can also use the REST API. For example, you can attach a seed when creating or cloning campaigns by including the optional SeedId property in your REST API call. For details, see Campaigns.

Here's what you need to know about seeds in campaigns:

You can attach only your own seeds to your campaigns. In other words, the seed and the campaign must both belong to the same advertiser.
You can have multiple seeds, but you can attach only one seed per campaign.
You can reuse the same seed in multiple campaigns.
You can update a campaign to attach a different seed to it.
To attach a seed to a campaign, you must have the campaign ID and the seed ID.
The same GraphQL campaignUpdateSeed mutation enables you to attach a new seed to a campaign or replace the existing seed.
You can update seeds and other data for multiple campaigns in a single GraphQL call. For details, see GraphQL API Bulk Operations.

TIP: To look up seed details, including the campaigns it's associated with, run a seed query. For an example, see Look Up Seed Details by Seed ID.

Here's an example of a campaignUpdateSeed mutation that attaches a seed to a campaign:

1
2
3
4
5
6
7
8
9
10
11
12
13
mutation {
campaignUpdateSeed(
input: {
campaignId: "xyz987b",
seedId: "klmp432o"
}
)
{
data {
id
}
}
}
Manage Seeds

The following table lists some of the common tasks associated with seeds that you might need to perform.

Task	GraphQL Operation	Notes
Look up details of a seed by its ID.	Query	You can look up seed details as well as campaign details in a single call.
Look up all seeds for an advertiser ID.	Query	You can look up seed details as well as advertiser details in a single call.
Update a seed.	Mutation	Updating seeds can help ensure their quality.
Replace a seed in a campaign.	Mutation	Use the same mutation to attach a new seed or to replace an existing one in a campaign.
Change default seed for an advertiser.	Mutation	If you have multiple seeds, you can designate a different seed as the default. Only applicable if you have multiple seeds.

TIP: For basic guidelines on GraphQL operations, and additional examples, see GraphQL queries.

The following sections provide details and examples for retrieving and updating seed information.

Look Up Seed Details by Seed ID

The following example of the seed query illustrates how to retrieve active IDs, seed name, status, targeting data IDs, and other details, as well as the IDs of the campaigns that use the seed.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
query GetSeedDetailsExample($seedId: ID!) {
seed(id: $seedId) {
activeIds
campaigns {
nodes {
id
}
}
targetingData {
targetingDataId
firstPartyInclusion {
advertiserTargetingDataId
name
}
thirdPartyDataInclusion {
fullPath
name
thirdPartyDataBrandId
thirdPartyDataId
}
}
createdAt
id
isDefault
lastUpdatedAt
name
status
uniqueHouseholds
}
}

TIP: In the preceding example, we recommend that you use pagination for node fields.

Use Pagination for Node Fields

we recommend using pagination for node fields, such as campaigns in the seed query example in Look Up Seed Details by Seed ID.

For example:

1
2
3
4
5
seed(id: $seedId) {
campaigns(first: 10, after: $cursor, where: $conditions) {
id
}
}
Look Up All Seeds for an Advertiser

The following example of an advertiser query retrieves all seeds associated with a specific advertiser.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
query GetAdvertiserSeedsExample($advertiserId: ID!) {
advertiser(id: $advertiserId) {
id
name
seeds {
createdAt
id
isDefault
lastUpdatedAt
name
targetingData {
contextualInclusion {
ids
keyphrases
urls
}
countryFilter {
id
name
}
firstPartyInclusion {
advertiserTargetingDataId
name
}
thirdPartyDataId
}
}
}
}
Update a Seed

To ensure the quality of your seeds, you might have to update seeds. This depends on the data sources you use for your seeds. For example:

If you use deterministic conversion data from first-party data sources and update your segments on a regular basis, you don't need to make any updates to your seed.
If you use self-updating data sources such as pixels, there's no need to manually update your seed.
If you use imported third-party data segments, you should update your seed every time you upload new data segments.

Whether you want to update the seed source data, its name, or any other seed details, you must have your seed ID and the targeting (source) or other data you want to update.

Here's an example of a seedUpdate mutation:

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
mutation {
seedUpdate(
input: {
id: "klmp432o"
advertiserId: "abc123x"
name: "1pd-retail-seed"
targetingData: {
firstPartyDataInclusionIds: [572489361, 817405926]
retailDataInclusion: [
{targetingDataId: 693210847, thirdPartyDataBrandId: "abcbrand"},
{targetingDataId: 856319742, thirdPartyDataBrandId: "3pdbrandid"}
]
}
}
) {
data {
id
}
}
}
Change Default Seed for an Advertiser

The first seed that you create is automatically set as your default seed, which is automatically attached to your campaigns in Kokai unless you specify a different seed. If you have more than one seed, you can change your default seed.

Here's an example of an advertiserSetDefaultSeed mutation:

1
2
3
4
5
6
7
mutation  {
advertiserSetDefaultSeed( { seedId: "123xyz2", advertiserId: "abc123x" } ) {
data {
id
}
}
}
FAQs

The following is a list of commonly asked questions about seeds.

Am I required to create a seed?

Yes. Without a seed, the platform cannot calculate relevance and QRI, both of which are powerful metrics that measure the overlap between your seed and your targeting. QRI, which is found in reporting, shows the relevance of a grain to the desired seed. Use this as a comparison to understand how similar the buy was to your highest quality data. Relevance is the metric that effectively scores numerous dimensions for your ideal customer, and is present throughout the UI.

Where can I find targeting data IDs for my seed?

To look up targeting data IDs, use the following endpoints:

Data	Endpoint	Look-up Task Examples
First-party	POST /v3/dmp/firstparty/advertiser	First-Party Data Elements
Third-party	POST /v3/dmp/thirdparty/advertiser	Third-Party Data Elements
How do I determine whether third-party and retail segments are eligible for seed creation?

Use the POST /v3/dmp/thirdparty/advertiser endpoint to check whether the IsEligibleForSeeds property is true.

What if I don't have enough data or any data to create a seed?

Don't worry! Think of your seed as a dynamic entity in which data changes over time. Even if you don't have enough data to start, you can still create a seed and keep updating it as more data sources become available. You don't need a lot of data for seeds to work because seeds allow you to put even a few thousand user sign-ups to work. You can use third-party data, retail data, or custom keywords.

Can I create multiple seeds?

Yes! In fact, we recommend that you create multiple seeds. For example, a shoe manufacturer might have two campaigns with different seeds as follows:

A campaign to sell running shoes, in which the seed includes customers who have previously purchased running shoes of the same brand.
A different campaign to sell basketball shoes, in which the seed includes customers who have previously purchased basketball shoes of the same brand.
Should my seed represent existing customers or desired customers?

Seeds should represent people who have interacted with your brand in a valuable way: for example, conversions.

How is seed different from audience?

Seed and audience are not the same:

A seed is a specific, concentrated group of individuals representing the core group of people that you want to target. This group typically consists of individuals who have taken valuable actions, or who exhibit traits that align with your campaign goals.
An audience is an expanded version of the core group. An audience includes the individuals in your seed, but also includes others who share similar traits or behaviors.
Will I have to manually set my default seed?

The first seed that you create is your default seed. If you have more than one seed, you can change the default at any time.

Do I need seeds if I primarily run reach campaigns?

Yes. Seeds can help you find the best quality reach, even if you're targeting large demographic, behavioral, or interest categories. The seed is used to prioritize impressions that share similar behaviors within these large audiences, and to help drive them down the funnel. Therefore, if you have any first-party conversion data, you should use it as a seed. See also Choose Seed Data Sources.

Do I need seeds if I run exclusively CTV campaigns?

Yes. Seeds can help you better understand the quality of your reach, even on devices without deterministic attribution. We apply the graph to be able to find people across households and devices.

What seed data should I use if I run full-funnel omnichannel campaigns for different KPIs?

If you have a single way to track the success of your advertising, such as a conversion pixel, this is probably the best seed for you. Regardless of the programmatic KPI, the platform always points towards finding the common behaviors of people that have bought the product through relevance. Relevance can help performance, but it does not always directly drive more KPI performance. Therefore, you can use a single conversion pixel across KPIs to help prioritize audience across all funnels, and to push them down the funnel based on the behaviors and attributions of lower-funnel converters.

How many seeds should I have if I have different product lines?

Generally, create at least one seed per product line. If you mix completely different groups of people that have interacted with your brand, this dilutes the quality concentration of the seed and broadens the range of behaviors targeted.

If I do measurement offline, can I use this data as a seed?

Yes! If you track any offline brand interactions—for example, through CRM lists or other first-party data collection methods—you can push them to the platform as onboarded first-party data.

TIP: To ensure this is good for our models, the best segments are those that consist of people who have interacted with the brand more recently and frequently. For example, a 14-day or 30-day lookback is better than people from a year ago. See also Seed Quality.

What should I do if I don't have any conversion data or want to reach a totally new demographic?

You can start by testing out how audiences react and refine a data set that represents true people that engage with your brand. To do so, you should start with a proxy action, such as a homepage visit. For example, create an empty pixel and add in a third-party data segment or other data type that represents your new customer. As the pixel gets attributed conversions, the seed automatically prioritizes the new first-party data as it comes in.

Why am I getting an error that an advertiser cannot access seeds?

Some advertisers have data policy restrictions in place that prevent them from creating, editing, or archiving seeds, or from assigning seeds to campaigns. For example, health advertisers in the European Union are blocked from using seeds in the API.

Blocked advertisers can still use campaign endpoints as usual by entering null as the seed ID.

Can I use tracking tags (pixels) in seeds?

Yes. Just add the first-party data ID of the tracking tag ID in the targetingData.firstPartyDataInclusionIds list.

IMPORTANT: Do not pass the tracking tag ID itself (a 7-character alphanumeric string): the tracking tag ID is not the same as the associated first-party data ID, and you'll get an error.

Why doesn’t the countryFilterIds filter apply country targeting to my seed?

The countryFilterIds field in the targetingData object is relevant only when using contextual data with your seed. It comes from the contextual data service and does not directly control seed-level targeting.

Can I delete a seed?

Yes. To delete a seed, contact your Technical Account Manager.

---

# Goals and KPIs

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/GoalsKPIs](https://partner.thetradedesk.com/v3/portal/api/doc/GoalsKPIs)

Goals and KPIs

A KPI, or key performance indicator, is a metric that enables you to measure the success of your ad campaigns, while driving performance and delivering results. You can set goals at the campaign and ad group level. If enabled, Koa Optimizations uses your ad group goals to select and prioritize the best-performing and most relevant inventory, making sure that the right price is paid on impressions.

The following table lists the available goals.

Goal	Has Target?	Description	Goal Object Property	Supported by Koa Optimizations?
Reach	No	This is a broad goal without any specific metrics used as primary benchmarks. Choose this goal if you want to reach as many unique users as possible in your intended audience given your specified base bid, max bid, and any bid adjustments.	MaximizeReach	Yes
Incremental Reach	No	Maximize the number of unique viewers beyond those who have already been reached through linear TV.
This goal prioritizes spend toward CTV PMP deals that improve unique or incremental reach of the ad group and deprioritize spends toward PMP deals that do the opposite.	MaximizeLtvIncrementalReach	Yes
CPC	Yes, currency amount	Cost per click. The amount the advertiser pays every time an ad is clicked. If your primary engagement metric is clicks, you may want to choose CPC as your goal. See also the CTR goal.	CPCInAdvertiserCurrency	Yes
CPA	Yes, currency amount	Cost Per Acquisition. The amount the advertiser pays based on the number of "acquisitions" (conversions) made.
If your goal is a specific action like a purchase or a newsletter sign up, you may want to choose CPA as your goal.	CPAInAdvertiserCurrency	Yes
vCPM	Yes, currency amount	(Estimated) Viewable Cost Per Mille (thousand). Setting this goal optimizes based on the cost of viewable inventory. vCPM is calculated by dividing eCPM by the in-view rate (vCPM = eCPM / in-view rate).
Unlike the Viewability goal, which optimizes toward an entered in-view target percentage, vCPM optimizes to inventory that is effective in terms of its viewable cost.	VCPMInAdvertiserCurrency	Yes
CPCV	Yes, currency amount	Cost Per Completed View. The amount the advertiser pays after a video has been viewed all the way through. Set this goal if your campaign is using video creatives and you want to encourage immediate engagement. This is a great option for brand-focused advertisers.	CPCVInAdvertiserCurrency	Yes
ROAS	Yes, percentage	Return On Ad Spend. The ratio of total revenue compared to total spend. Set this ROI-type of goal when you can pass specific revenue amounts to the platform in your conversion pixel.	ReturnOnAdSpendPercent	Yes
CTR	Yes, percentage	Click Through Rate. It is calculated by dividing the number of clicks by the number of impressions. A high CTR indicates a more successful campaign.
This alternative to CPC does not consider the cost of the media, but only how often a user clicks an ad.	CTRInPercent	Yes
VCR	Yes, percentage	Video Completion Rate. This goal allows optimization toward inventory where ads are viewed or heard to completion.	VCRInPercent	Yes
Viewability	Yes, percentage	Viewability is a metric that measures whether an ad impression has been viewed by a website user rather than simply being displayed.
Unlike the vCPM goal, which optimizes based on the cost of viewable inventory, Viewability optimizes toward an entered in-view target percentage.	ViewabilityInPercent	No
Nielsen OTP	Yes, percentage	Nielsen On Target Percentage. Setting this goal helps you optimize toward a percentage of impressions delivered to a chosen demographic (out of the total number of impressions served during your campaign).
Nielsen sets different percentage benchmarks for different demographics and different regions. Nielsen's suggested benchmarks can be found on their website. You can also contact your Account Manager to get a better sense of what your percentage should be.
When set, the demographic must be provided in the form of NielsenTrackingAttributes or you must set TargetDemographicSettingsEnabled to true.
If you select this goal, fees for Nielsen reporting may apply.	NielsenOTPInPercent	No
Miaozhen OTP	Yes, percentage	Miaozhen On Target Percentage. Setting this goal will help you optimize toward a percentage of impressions delivered to a chosen demographic (out of the total number of impressions served during your campaign).
When set, the demographic must be provided in MiaozhenTrackingAttributes.
If you select this goal, reporting fees may apply.	MiaozhenOTPInPercent	No

NOTE: Some goals may require special permissions. If needed, contact your Account Manager for appropriate access.

FAQs

The following is a list of frequently asked questions about goals and KPIs for campaigns and ad groups.

How are ad group KPIs set when there are multiple campaign goals?

The primary campaign goal becomes the default KPI for all ad groups in the campaign.

What happens if no ad groups meet their KPI targets?

The secondary and tertiary campaign goals are ignored by the Auto-Prioritized AutoAllocator until at least one ad group reaches the primary goal.

How often are rankings/priorities updated?

Every other day (after a 24-hour data collection cycle).

---

# Channels

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/Channel](https://partner.thetradedesk.com/v3/portal/api/doc/Channel)

Channels

After you've identified your ideal audience for targeting using seeds and established your budgets, consider the various campaigns and channels that can be used to reach them. In Kokai, channels are used to inform bidding behavior and provide recommendations and insights. For example, if you choose Display, we'll buy only display content for that campaign and ad group. If you choose TV for a campaign and ad group targeting display inventory, we won't bid.

By viewing consumers through an omnichannel lens, you can engage consumers across multiple devices and channels where they spend their time. This allows you to control bidding behavior without relying on device and media type. Expanding into additional channels, such as Connected TV (CTV), audio, and Digital Out-Of-Home (DOOH), can boost performance, optimize the consumer's journey, and drive conversions.

Best Practices

To successfully coordinate your funnel with your channels and audiences, follow these recommendations.

Recommendation	Notes
If you want to advertise on multiple channels, create a separate campaign for each channel you want to target. This ensures that your campaign settings, goals, and optimizations align with the channel attributes, signals, and inventory.	If you are using TV, display, and audio, set up three distinct campaigns in the platform.
To represent different stages of the funnel within the same campaign, equate each ad group with a unique audience.	Designate a channel for your campaign and then create three distinct ad groups. Each ad group targets a different part of the funnel in the same campaign: prospecting, conquesting, and retargeting audiences.
Set up distinct KPI goals for each campaign and ad group.	The prospecting ad group introduces the consumer to the product, the conquesting ad group might drive them toward the product homepage, and the retargeting ad group might drive them toward the actual purchase.

NOTE: The audiences described here correspond to ad group funnel locations (awareness, consideration, and conversion), although the ultimate goal for each audience is driving conversions and sales. For details, see Funnel Location.

Campaign and Ad Group Channels

Setting the PrimaryChannel property for your campaign allows the platform to provide specific recommendations and automatically optimize toward reaching your goals. Here's what you need to know about selecting channels:

When creating a campaign, you must select a channel. It is one of the requirements along with the primary goal.
All campaign ad groups should have the same value in their ChannelId properties as the channel of the parent campaign.
If needed, you can change the campaign channel when updating or cloning a campaign, but you cannot remove it.
If you want to bid on different types of inventory, you should create a separate campaign for each channel you want to use.
You cannot update the ad group channel after the flight starts.
The ad group creative type must match the channel.

Select a channel for your campaign and channel IDs for your ad groups from the following options.

Channel	Definition
Display	Ads served in standard, reserved spaces on web pages. These ads can be image- or text-based and found at the top of the webpage, in the middle, on the side, or at the bottom.
Video	Ads running before, during, and after video content playing on websites. Video ads can also be embedded within online articles or through banner ads.
Audio	The digital streaming of audio content, such as music, talk shows, and podcasts, through platforms like Spotify and Pandora.
TV	Premium, long-form content (such as full episodes) streaming through apps on CTVs or over-the-top devices. Ads can be served before content or during traditional commercial breaks.
NativeDisplay	Ads formatted to blend in with the design, function, and tone of the page on which they are placed. The disguised nature of native ads means consumers may not be able to easily distinguish a native ad from the publisher’s own content.
NativeVideo	Video ads that seamlessly integrate with the platform they appear in for amplified storytelling. A native video ad can extend up to five minutes.
DigitalOutOfHome	DOOH is primarily outdoor digital ad placements, such as digital billboards and signs in a variety of places including gas stations, airports, freeways, the sides of buildings, and so on. If you want to set DOOH as your channel but this option isn't available, contact your Technical Account Manager.
NOTE: The DOOH value for ad groups is OutOfHome.
Mixed	Ads that use various media or device channels. This is a valid channel category if you do not designate a channel ID in your API POST calls.

NOTE: Some ChannelId settings are specific to certain channels. For example, content genre targeting for CTV wouldn’t apply to the Display channel.

For details, examples, and specifications for each channel, see the Knowledge Portal.

FAQs

The following is a list of commonly asked questions about channels.

Can I assign multiple channels to a single campaign?

Yes. While you can assign multiple channels to a single campaign, only the ad group's channel is used for bidding. Make sure each ad group has only one channel.

For best practices, be sure ad groups have the same value in their ChannelId properties as the channel of the parent campaign. To target multiple channels and use the same campaign settings, clone the campaign and update the channel for the new copy of the campaign.

How do I update the ad group channel?

Update the ChannelId property for the ad group with the new channel option. For best practices, be sure it's the same value as the channel of the parent campaign.

NOTE: You cannot update the ad group channel after the flight starts.

The API reference says the Mixed value for the ChannelId property is deprecated, but here it lists Mixed as allowed. Can you clarify this?

Yes. Mixed is an allowed default value used as a placeholder when no channel ID is specified for an ad group. The API reference labels this as Deprecated, indicating it's not a value you should select.

---

# Campaign Time Zones

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/CampaignTimeZones](https://partner.thetradedesk.com/v3/portal/api/doc/CampaignTimeZones)

Campaign Time Zones

A time zone is a geographic area that uses the same standard time for legal, commercial, and social purposes. Time zones tend to follow the boundaries between countries and their subdivisions instead of strictly following longitude, because it is convenient for areas in frequent communication to keep the same time. All time zones are defined as offsets from Coordinated Universal Time (UTC), ranging from UTC−12:00 to UTC+14:00. The offsets are usually a whole number of hours, but a few zones are offset by an additional amount time, such as India, South Australia (30 minutes), and Nepal (45 minutes). For details and definitions of the different time zones, see the Wikipedia Time Zone article.

The Trade Desk platform uses time zones in campaigns, reports, and billing. To ensure that your campaign doesn't overspend and that your reporting is correct, keep time zone settings in mind when you set up your ad server reporting or your campaign. Here's what you need to know about time zones in The Trade Desk platform:

We use the standard Olson time zone names defined in the windowsZones.xml file.
By default, all campaigns are set to run in Coordinated Universal Time (UTC), which appears as Etc/GMT in the response.
You can select a different time zone for your campaign when you create or update it.
Reporting is done based on UTC regardless of how you set your campaign time zone.
How Time Zones Affect Pacing, Reporting, and Billing

IMPORTANT: Be sure you understand how pacing, bidding, and billing might be affected if you change time zones.

Since campaign pacing, bidding, and billing in The Trade Desk platform are standardized on UTC, here's what you need to know if you decide to change the time zone for a campaign:

You might see discrepancies between your campaign settings and reported metrics at the end of the month. For example:
If a campaign is set to end at midnight Eastern Standard Time (EST) on January 31st, the campaign will show spend through the morning of February 1st, because midnight EST is 5:00 AM UTC.
Alternatively, if your campaign is set to run in UTC, but your ad server reports in EST, then with a campaign flight of January 1st to January 31st (UTC), the campaign ends at midnight (UTC) but is reported as ending at 7:00 PM (EST), five hours early.
Since billing is tracked in UTC, be sure to note when the billing cycle ends in the campaign time zone, especially if you intend to keep your accounting within customary boundaries such as a billing month, fiscal year, and so on. For example, if you set a campaign to end at midnight Pacific Standard Time (PST, UTC -8) on December 31, spend and billing will continue through 8:00 AM UTC on January 1st.

The following diagram illustrates what happens to a campaign that is set to end on October 31 at midnight but actually ends early in the PDT and EDT time zones and runs over in the IST and SGT time zones. This affects pacing and monthly billing, respectively, because they are standardized on UTC.

Time Zone Names

The time zone names used in the platform are defined in the windowsZones.xml file. In this file, all time zones are organized into groups by UTC time zone specified in the comments. For example, here's the (UTC-08:00) Pacific Time (US & Canada) group.

1
2
3
4
5
<!-- (UTC-08\:00) Pacific Time (US & Canada) -->
<mapZone other="Pacific Standard Time" territory="001" type="America/Los_Angeles"/>
<mapZone other="Pacific Standard Time" territory="CA" type="America/Vancouver"/>
<mapZone other="Pacific Standard Time" territory="US" type="America/Los_Angeles"/>
<mapZone other="Pacific Standard Time" territory="ZZ" type="PST8PDT"/>

In each UTC time zone group, all territories share the same standard time specified by the other value. For example, in the (UTC-07:00) Arizona group, each time zone is in the US Mountain Standard Time region. Time zones that share the same region have the same time of day.

1
2
3
4
5
6
<!-- (UTC-07\:00) Arizona -->
<mapZone other="US Mountain Standard Time" territory="001" type="America/Phoenix"/>
<mapZone other="US Mountain Standard Time" territory="CA" type="America/Creston America/Dawson_Creek
America/Fort_Nelson"/>
<mapZone other="US Mountain Standard Time" territory="MX" type="America/Hermosillo"/>
<mapZone other="US Mountain Standard Time" territory="US" type="America/Phoenix"/>
<mapZone other="US Mountain Standard Time" territory="ZZ" type="Etc/GMT+7"/>

The specific time zone names that you can pass in your campaign requests are the type attribute values. For example, "TimeZone": "Asia/Singapore".

1
2
3
4
5
6
7
8
<!-- (UTC+08\:00) Kuala Lumpur, Singapore -->
<mapZone other="Singapore Standard Time" territory="001" type="Asia/Singapore"/>
<mapZone other="Singapore Standard Time" territory="BN" type="Asia/Brunei"/>
<mapZone other="Singapore Standard Time" territory="ID" type="Asia/Makassar"/>
<mapZone other="Singapore Standard Time" territory="MY" type="Asia/Kuala_Lumpur Asia/Kuching"/>
<mapZone other="Singapore Standard Time" territory="PH" type="Asia/Manila"/>
<mapZone other="Singapore Standard Time" territory="SG" type="Asia/Singapore"/>
<mapZone other="Singapore Standard Time" territory="ZZ" type="Etc/GMT-8"/>

The default time zone that all campaigns use is Etc/UTC, which is part of the (UTC) Coordinated Universal Time UTC group.

NOTE: You do not need to specify this value in the request.

1
2
3
<!-- (UTC) Coordinated Universal Time -->
<mapZone other="UTC" territory="001" type="Etc/UTC"/>
<mapZone other="UTC" territory="ZZ" type="Etc/UTC Etc/GMT"/>
Time Zone Names in Requests and Responses

You can pass any type attribute value from the same time zone group in your request, but the response will return only the time zone name with a territory value of 001, which is the main time zone name of the UTC group.

For example, if the time zone you want to use is America/Hermosillo in the (UTC-07:00) Arizona group, use the America/Phoenix value instead, as this is the value that will be returned in the response for any territory in the group.

TIP: To avoid confusion, include the type attribute value from the top row of the time zone group.

The following table provides an example of the (UTC-07:00) Arizona time zone values in requests and responses.

Request Value	Response Value
America/Phoenix	America/Phoenix
America/Creston America/Dawson_Creek America/Fort_Nelson	America/Phoenix
America/Hermosillo	America/Phoenix
Etc/GMT+7	America/Phoenix
Change a Campaign Time Zone

IMPORTANT: If you set up a campaign in your local time zone without considering the equivalent UTC time, you will likely see inconsistencies in the way your campaign paces and bids, as well as your billing for the campaign. For details, see How Time Zones Affect Pacing, Reporting, and Billing.

To change the campaign time zone, complete the following steps:

In the windowsZones.xml file, find the UTC group that has the time zone you want to use.
In the top row of the time zone group, with the territory value of 001, copy the top type attribute value. For example, if the time zone you want to use is in the (UTC-08:00) Pacific Time (US & Canada) group, copy the America/Los_Angeles value.
In a POST /v3/campaign or PUT /v3/campaign call, set the timezone property value to the time zone you have copied, as shown in the following code snippet. For a complete example with all required campaign properties, see Create a Campaign.
1
2
3
4
5
{
"AdvertiserId": "pt8jkg3",
"CampaignName": "New Campaign XYZ",
"TimeZone": "America/Los_Angeles"
}
FAQs

The following is a list of commonly asked questions about campaign time zones.

Why is the time zone name in the response different from the one I sent in the request?

The response returns only the main top-level time zone name that has a territory value of 001 regardless of which time zone name you set. However, since the returned time zone and the one you set share the same UTC time zone group, both names use the same time zone. For details, see Time Zone Names in Requests and Responses.

Where can I get a list of time zone values that I can use?

In the windowsZones.xml, use the corresponding type attribute value with the time zone name that you want to use. For details, see Time Zone Names.

Do I have to set the time zone for my campaign?

No. All campaigns are set to run in Coordinated Universal Time (UTC), so you do not need to set your campaign time zone unless you want to change it.

What time zone is Etc/GMT?

The standard Universal Coordinated Time (UTC) which is the default value that you will see in the response.

Can I pass a null or an empty time zone value?

No. If you send a null or empty timezone value in the request, you will receive an error.

Will adjusting the campaign time zone affect reporting?

Reporting is done based on UTC regardless of how you set your campaign time zone. For details, see How Time Zones Affect Pacing, Reporting, and Billing.

---

# REST API: Ad Group Budget Allocation for Campaigns

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/KokaiBudgetVersions](https://partner.thetradedesk.com/v3/portal/api/doc/KokaiBudgetVersions)

REST API: Ad Group Budget Allocation for Campaigns

To ensure a smooth transition to Kokai while maintaining backward compatibility with Solimar budget allocation, Kokai campaigns currently support two budgeting versions for campaigns and ad groups. In the REST API, these are indicated by the BudgetingVersion property with two respective values: Kokai and Solimar. The primary distinction between the two budgeting versions lies in how campaign budgets are allocated across ad groups. The following table highlights the differences.

Comparison Aspect	Kokai Budgeting Version (Recommended)	Solimar Budgeting Version
Campaign settings	Version=Kokai
BudgetingVersion=Kokai	Version=Kokai
BudgetingVersion=Solimar
Ad group budget allocation	Based on minimums. Ad groups start with zero allocation by default, and the platform algorithm distributes the flight budget dynamically.	Based on maximums. You set a fixed budget per ad group, and the platform ensures that it is not exceeded.
Fluid budget settings	Each ad group allocation in the campaign flight is set to 0.	Each unarchived ad group budget must be equal to the campaign budget.
Efficiency	More efficient, as the platform optimizes allocation based on value.	May lead to underspending if the flight budget is not fully allocated.
API	GraphQL (recommended) or REST	REST only
AllocationType Property

To differentiate between the campaign budget allocation types, we've introduce a new read-only property in the ad group REST endpoints—AllocationType. Here's what you need to know about this property:

The AllocationType property is optional and read-only.
Its value is currently inferred from the combination of the campaign version and budgeting version and is returned only in ad group GET responses as part of the AdGroup.RTBAttributes.BudgetSettings object.
The AllocationType property has the following default values:
Minimum (Kokai-budgeted Kokai campaigns)
Maximum (Solimar-budgeted Kokai campaigns and all Solimar campaigns)
You cannot change the default value of the property. Setting a different value during ad group creation or updates will result in an error.

Kokai-budgeted campaigns will eventually support different allocation types. Stay tuned for more enhancements!

FAQs

The following are commonly asked questions about budget allocation in Kokai.

How can I check the budgeting version of a campaign?

To check the budget allocation version of a campaign, use the GET /v3/campaign/{campaignId} endpoint and look up the BudgetingVersion property value in the response.

How do I create a Kokai campaign with Solimar budget allocation?

To create a campaign with Solimar budget allocation, in a POST /v3/campaign request, set the Version property value to Kokai and the BudgetingVersion value to Solimar. For details, see Create Campaigns.

How do I set the budgeting version to Kokai?

If you set the Version property to Kokai when creating a campaign, its BudgetingVersion value is automatically set to Kokai and returned in the response.

Do I have to update my current ad group workflows to manage campaign budgets in Kokai?

No. You can continue using your existing ad group REST workflows. For example, here's a request that creates an ad group in REST:

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
{
"CampaignId": "CAMPAIGN_ID_PLACEHOLDER",
"AdGroupName": "AD_GROUP_NAME_PLACEHOLDER",
"FunnelLocation": "Awareness",
"ChannelId": "Video",
"RTBAttributes": {
"BudgetSettings": {
"Budget": {
"Amount": 100,
"CurrencyCode": "USD"
},
"PacingMode": "PaceToEndOfDay"
},
"BaseBidCPM": {
"Amount": 1,
"CurrencyCode": "USD"
},
"MaxBidCPM": {
"Amount": 5,
"CurrencyCode": "USD"
},
"AudienceTargeting": {
"CrossDeviceVendorListForAudience": [
{
"CrossDeviceVendorId": 11,
"CrossDeviceVendorName": "Identity Alliance"
}
]
},
"ROIGoal": {
"CPAInAdvertiserCurrency": {
"Amount": 0.2,
"CurrencyCode": "USD"
}
}
}
}

NOTE: If the associated campaign is a Kokai campaign (its Version property is set to Kokai), the newly created ad group will have the AllocationType property set to Minimum.

How can I check the budget allocation type for an ad group?

To check the budget allocation type of an ad group, use the GET /v3/adgroup/{adGroupId} endpoint and look up the AllocationType value in the RTBAttributes.BudgetSettings object in the response.

Can I change the AllocationType value for my campaign?

Not at this time. The default AllocationType value cannot be changed, and attempting to set a different value during ad group creation or updates will result in an error. However, support for additional allocation types in Kokai-budgeted campaigns is planned for future updates.

What if I’ve already switched to GraphQL and the minimum-based budget allocation in Kokai?

Great job adopting the most efficient, value-driven budget allocation method! Continue leveraging the GraphQL API and platform algorithms to optimize your campaigns.

---

# Campaign Creation Workflows

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/CampaignCreateGQL](https://partner.thetradedesk.com/v3/portal/api/doc/CampaignCreateGQL)

Campaign Creation Workflows

This page outlines the options and steps you need to take if you want to create a campaign using the GraphQL API.

Workflow Diagram

The following diagram illustrates the process outlined in the next section, which also includes links to the respective user guides and scripts that provide additional guidance on the decisions you might need to make along the way.

Process Overview

The following table outlines the process step by step and provides links to detailed user guides, while the diagram in the preceding section illustrates the decision-making workflow.

Step		Description	Mutation or Query	User Guide	Notes
1		Ensure that you have a seed for your campaign.	seedCreate mutation	Seeds	To run impactful campaigns in Kokai, you need at least one high-quality seed, ideally sourced from first-party data. See also the Seed sample scripts in Python.
2		Choose how you want to create your Kokai campaign.	N/A	N/A	With GraphQL, you can create one or more campaigns at once with each operation.
a	Create a single campaign from scratch.	campaignCreate mutation	Create Campaigns	See also the Creating sample scripts in Python.
b	Create multiple campaigns from scratch.	bulkCreateCampaigns mutation	GraphQL API Bulk Operations	This option is best suited for creating over 100 campaigns at once.
c	Create one or more copies of one or more existing campaigns at once.	campaignClonesCreate mutation	Clone Campaigns	You can clone up to 50 different campaigns and create up to 1000 copies in a single call. For more details, see the user guide. See also the Cloning sample scripts in Python.
3		(Optional) Review the newly created campaigns, their versions, budgets, and other settings.	campaign query	GraphQL Campaign Query Examples	See also the Querying sample scripts in Python.

---

# Campaign Creation Workflow with REST

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/CampaignCreateREST](https://partner.thetradedesk.com/v3/portal/api/doc/CampaignCreateREST)

Campaign Creation Workflow with REST

This page outlines the options and steps you need to take if you want to create a campaign using the REST API. Note that this workflow requires still requires GraphQL for the Kokai-only features, such as seeds.

Workflow Diagram

The following diagram illustrates the process outlined in the next section, which also includes links to the respective user guides and scripts that provide additional guidance on the decisions you might need to make along the way.

Process Overview

The following table outlines the process step by step and provides links to detailed user guides, while the diagram in the preceding section illustrates the decision-making workflow.

Step		Description	REST Endpoint or GQL Mutation	User Guide	Notes
1		Ensure that you have a seed for your campaign.	seedCreate mutation	Seeds	To run impactful campaigns in Kokai, you need at least one high-quality seed, ideally sourced from first-party data. You can create seeds only with GraphQL. See also the Seed sample scripts in Python.
2		Choose how you want to create your Kokai campaign.	N/A	N/A	With REST, you can create only one campaign at at time with each operation.
a	Create a campaign from scratch.	POST /v3/campaign with the version property set to Kokai	Create Campaigns	See also the Creating sample scripts in Python.
b	Clone an existing campaign.	POST /v3/campaign/clone with the version property set to Kokai	Clone Campaigns	See also the Cloning sample scripts in Python.
3		Review the newly created campaign, its version, budget, and other settings.	GET /v3/campaign/{campaignId}	N/A	See also the Querying sample scripts in Python.

---

# Create Campaigns

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/CampaignCreate](https://partner.thetradedesk.com/v3/portal/api/doc/CampaignCreate)

Create Campaigns

This guide explains how to create a single campaign from scratch, but, depending on your needs, you can also clone existing campaigns. See also Campaign Creation Workflows.

To define your advertising strategies in the platform, you need to create a campaign with a specialized seed, clear and precise goals, and a channel in which you want to advertise. Here's what you need to know about the campaign creation process:

You can create a single campaign or multiple campaigns in one call.
To create individual campaigns, you can use either API: GraphQL or REST.
To create multiple campaigns in bulk, you must use GraphQL. This option is best suited for creating over 100 campaigns at once.
The requirements are the same for creating single campaigns or multiple campaigns in bulk—regardless of which API you use.
Campaign Requirements

To send a successful create request, you must provide your advertiser ID, the name of your campaign, and set the campaign primary goal and channel. However, there are other factors and properties you need to consider to create a successful campaign and bid on the most valuable impressions. See also Campaign Success Checklist.

Here's what you need to know about creating campaigns:

You can have your default seed automatically attached, or create a designated seed for your campaign (recommended) and attach it using the SeedId property in either API.
For campaign goals, only the primary goal is required. Secondary and tertiary goals are optional and hierarchically interdependent.
Each campaign requires at least one flight with a budget and a start date. For details on how to allocate the flight budget to its ad groups, see Budget Allocation.
The ChannelId value for each ad group in this campaign must match the campaign channel. The ad group creative type must match the selected channel.
Political advertising, live events, and conversion-focused campaigns require additional properties to be set. For details, see Political Advertising, Live Event Campaigns, and Conversion Reporting Columns.

TIP: To save time and ensure consistency across ad groups, you can include the advertiser’s default bid lists in campaigns and further propagate them to ad groups. For details, see Default Bid Lists.

Campaign Goals

Campaign goals are the main KPIs toward which the platform automatically optimizes performance.

Here’s what you need to know about campaign goals:

You can set up to three goals for a campaign. The PrimaryGoal is required, while the SecondaryGoal and TertiaryGoal are optional.
All three goals are hierarchically interdependent. For example, to set a tertiary goal, you must first set the secondary one.
Ad groups initially inherit only the PrimaryGoal from their parent campaign and may have their own goals.
All goal properties are mutually exclusive. In other words, in each goal object (PrimaryGoal, SecondaryGoal, and TertiaryGoal), you can include only one goal (property).
Some goals require a target set, which is the amount (in the advertiser's currency) or percentage.

For a complete list of goals that you can set in your campaign, see Goals and KPIs.

Conversion Reporting Columns

A conversion reporting column is the mapping of conversion tracking tags, or conversion pixels, to reporting columns. Here's what you need to know about conversion reporting columns:

If your campaign is not conversion-focused, send the CampaignConversionReportingColumns object empty.
You can include up to five reporting columns.
You can always update your reporting columns later, but new reports will not contain retroactive metrics for these conversions. If you assign different conversions to a previously-used reporting column, your long-term roll-up reports could be misleading.

To add a conversion reporting column to your campaign, include the CampaignConversionReportingColumns property with at least the following two fields.

Property	Notes
TrackingTagId	The tracking tag to which the ID belongs must have a type considered to be a conversion (for details, see the Tracking Tag and Tracking Tag Type APIs).
ReportingColumnId	Metrics about this conversion will appear in reports under this reporting column. Only one tracking tag ID and cross-device attribution model ID may be mapped to each column within a campaign. For details, see Set Up Cross-Device Attribution for a Conversion Campaign.
GraphQL Mutation Example

The following campaignCreate GraphQL mutation illustrates how to create a Kokai campaign with a Kokai budget version.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
mutation {
campaignCreate(
input: {
advertiserId: "ADVERTISER_ID_PLACEHOLDER"
primaryGoal: { maximizeReach: true }
campaignConversionReportingColumns: {}
flights: {
budgetInAdvertiserCurrency: 1200000
endDateExclusiveUTC: "2025-02-15T00:00:00"
startDateInclusiveUTC: "2025-03-15T00:00:00"
}
name: "CAMPAIGN_NAME_PLACEHOLDER"
primaryChannel: DISPLAY
seedId: "SEED_ID_PLACEHOLDER"
}
) {
userErrors {
field
message
}
data {
id
name
version
budget {
version
total
}
}
}
}
REST Request Example

Here's what you need to know about using the REST API to create campaigns:

You must set the Version property value to Kokai, otherwise you will create a Solimar campaign.
If your campaign is not conversion-focused, send the CampaignConversionReportingColumns object array empty. For details, see Conversion Reporting Columns.

Here's an example of a POST /v3/campaign request body for a campaign that has multiple goals.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
{
"AdvertiserId": "ADVERTISER_ID_PLACEHOLDER",
"CampaignName": "CAMPAIGN_NAME_PLACEHOLDER",
"Version": "Kokai",
"SeedId": "SEED_ID_PLACEHOLDER",
"Budget": {
"Amount": 1200000,
"CurrencyCode": "USD"
},
"StartDate": "2024-09-15T00:00:00",
"EndDate": "2024-08-15T00:00:00",
"CampaignConversionReportingColumns": [],
"PrimaryGoal": {
"MaximizeReach": true
},
"SecondaryGoal": {
"MaximizeLtvIncrementalReach": true
},
"TertiaryGoal": {
"VCPMInAdvertiserCurrency": {
"Amount": 28.00,
"CurrencyCode": "USD"
}
},
"PrimaryChannel": "Display",
"IncludeDefaultsFromAdvertiser": true
}
FAQs

The following is a list of frequently asked questions about creating campaigns.

How do I update a campaign after I create it?

Use the GraphQL campaignUpdate operation.

When creating a Kokai campaign, how do I set the budgeting version to Kokai?

In GraphQL, campaign and budget versions are set to Kokai by default. If you are using the REST API, just set the campaign Version property to Kokai, and the BudgetingVersion value is automatically set to Kokai and returned in the response.

How are ad group KPIs set when there are multiple campaign goals?

The primary campaign goal becomes the default KPI for all ad groups in the campaign.

How do I use the REST API to opt my campaign out of the Sellers and Publishers Marketplace 500+?

In a POST /v3/campaign call, set the MarketplaceOptOut value to true.

---

# Clone Campaigns

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/CampaignCloning](https://partner.thetradedesk.com/v3/portal/api/doc/CampaignCloning)

Clone Campaigns

Campaign cloning is the process of duplicating an existing campaign to create a new one with identical channels, strategies, budgets, and ad groups. Unlike creating campaigns from scratch individually or in bulk, cloning a campaign enables you to efficiently recreate successful campaigns for various purposes, such as targeting different audience segments while maintaining consistency in approach and resource allocation. This streamlined method ensures that proven strategies can be easily adapted and deployed, optimizing campaign management and maximizing results across diverse demographics and markets.

Here’s what you need to know about cloning campaigns:

Campaign cloning is a two-step asynchronous process where you submit a job for processing and check its progress.
You can use either the REST API or GraphQL API, both of which offer different options for cloning campaigns.
You can clone up to 50 different campaigns in a single call.
You can create up to 1000 campaign copies in a single call regardless of how many different campaigns you're cloning.
You can clone campaigns with up to 500 ad groups.
You can specify which ad groups you want to clone and modify some campaign settings.
Campaign Settings You Can Copy and Modify

Here’s what you need to know about which campaign settings you can clone and modify:

When you clone a campaign to create a copy of it, most settings are copied to the new campaign.
You can modify certain campaign settings for the copy, but not all.

The following table lists the campaign settings that are copied and which settings you can modify for the new copy.

Settings	Copied from the source campaign?	Modifiable during the cloning process?	Notes
Name	Not copied	Modifiable	You must provide the name for the new copy of the campaign.
Flights	Copied only if the flight ID is provided	Modifiable	None.
Channel	Copied	Modifiable	You can change the campaign channel but you cannot modify the ad group channels during the cloning process. To change ad group channels, update the cloned ad groups.
Goals	Copied	Modifiable	None.
Targeting	Copied	Modifiable	None.
Budget	Copied	Modifiable	If you clone campaigns using GraphQL or use REST with the version property set to Kokai, budgets for all new campaigns are automatically updated to use the Kokai budgeting version and settings. No additional updates are required.
Seed	Copied	Modifiable	None.
Frequency settings	Copied	Not modifiable	None.
Advanced frequency settings	Not copied	Not modifiable	The frequency settings set in the source campaign through the API.
IMPORTANT: To avoid unintentional spend, be sure to update frequency settings in the campaign copy.
Ad groups	Copied	Modifiable only with GraphQL	You can copy all, none, or specific ad groups from the source campaign by doing the following with both REST and GraphQL:
To clone all ad groups, set the ad group array to null.
To clone no ad groups, include an empty ad group array.
For details about which ad group settings you can modify in GraphQL for the copies, see Ad Group Settings.
Audiences	Copied only if an associated ad group has Prism enabled	Not modifiable	Copied with the - Copy suffix appended to the segment name, such as AUDIENCE_NAME_PLACEHOLDER - Copy.
Bid lists	Copied	Not modifiable	To modify the cloned bid list, use the bidListClone mutation.
All other settings	Copied	Not modifiable	None.
Ad Group Settings

Here's what you need to know about ad groups when cloning campaigns:

You cannot modify ad group settings using REST.
You can modify the following ad group settings using GraphQL:
Base and max bid
Funnel location
Inventory marketplace usage
Mixed is only accepted as a ChannelId property value if you do not designate a channel ID in your API POST calls. When cloning campaigns, update any ad groups with the ChannelId property set to Mixed to the appropriate value supported in Kokai.
When cloning a campaign, the platform also clones the audience associated with each ad group that has Prism enabled. The cloned audience has the - Copy suffix appended to its name, such as AUDIENCE_NAME_PLACEHOLDER - Copy. This duplication ensures Prism is optimized for each ad group.
Process Overview

To clone a campaign, use either the REST API or GraphQL API to complete the following steps:

Specify which campaign you want to clone and submit a job that starts the cloning process.
(Optional) Check the status of the job.

NOTE: Depending on the amount of data in a campaign, it may take from a few seconds to a few minutes to process.

The following table lists the differences between REST and GraphQL for cloning campaigns.

Comparison	REST	GraphQL
Number of campaigns you can clone	One campaign	Up to 50 different campaigns
Number of copies or clones you can create	One copy	Up to 1000 copies
Request Processing	2-step, asynchronous	2-step, asynchronous

TIP: For optimized audience-based buying, The Trade Desk has curated a pool of thousands of vetted, trusted sellers and publishers at no cost to you. Explore the Sellers and Publishers 500+ Marketplace to take advantage of this opportunity.

Clone Campaigns with the GraphQL API

To clone a campaign in GraphQL, complete the following steps.

Step	Task	Operation Type	Operation Name	Notes
1	Submit the cloning job.	Mutation	campaignClonesCreate	A successful response returns an ID that you can use to check the status of the job.
2	(Optional) Check the status of the job.	Query	campaignCloneJobsProgress	Include the job progress ID returned after you submitted the job.

NOTE: You can clone up to 50 campaigns at once and create up to 1000 campaign copies at a time.

To submit a job to clone a campaign in GraphQL, in a campaignClonesCreate mutation, specify at least the following for each campaign you want to clone:

The ID of the campaign you want to clone.
The number of campaign copies you want to create.
A list of names for each copy.
The campaign flight and other required information.

The following example illustrates how to clone two campaigns and make multiple copies of each campaign. One campaign creates copies of only specific ad groups assigned to it, while the other creates copies of all assigned ad groups.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
mutation {
campaignClonesCreate(
input: {
campaignCloneData: [
{
campaignId: "CAMPAIGN_ID_A_PLACEHOLDER"
numberOfClones: 1
defaultUseInventoryMarketPlace: true
cloneNames: ["CAMPAIGN_A_CLONE_PLACEHOLDER_01"]
campaignFlights: [
{
startDateInclusive: "2024-05-06T20:26:20.077Z",
budgetInAdvertiserCurrency: 12000000.00
}
]
selectedAdGroups: [
{ adGroupId: "AD_GROUP_ID_PLACEHOLDER_01", useInventoryMarketPlace: false },
{ adGroupId: "AD_GROUP_ID_PLACEHOLDER_02" },
{ adGroupId: "AD_GROUP_ID_PLACEHOLDER_03" }
]
}
{
campaignId: "CAMPAIGN_ID_B_PLACEHOLDER"
numberOfClones: 2
cloneNames: ["CAMPAIGN_B_CLONE_PLACEHOLDER_01", "CAMPAIGN_B_CLONE_PLACEHOLDER_02"]
campaignFlights: [
{
startDateInclusive: "2024-06-05T20:26:20.077Z",
budgetInAdvertiserCurrency: 23000000.00
}
]
}
]
}
) {
data {
id
}
userErrors {
message
field
}
}
}

A successful response returns an ID (or list of IDs) that you can use to check the status of the cloning job.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
{
"data": {
"campaignClonesCreate": {
"data": [
{
"id": 21
},
{
"id": 22
}
],
"userErrors": []
}
}
}

NOTE: If you are cloning multiple campaigns, you will have multiple job IDs, one for each campaign being cloned.

To check the status of your campaign cloning jobs in GraphQL, use the campaignCloneJobsProgress query and include the job ID returned when you submitted the job. The following example demonstrates how you can retrieve the status of four jobs and, for each job, information about the source and the copies of the ad groups and campaigns that you are cloning.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
query GetCampaignCloningStatusExample {
campaignCloneProgresses(where: { id: { in: [21, 22] } }) {
nodes {
id
status
cloneCount
sourceCampaign {
id
}
jobs {
totalCount
nodes {
id
status
progressPercentage
cloneReport
failureMessage
cloneInfo {
campaignClone {
id
}
adGroupCloneMap {
originalAdGroup {
id
}
clonedAdGroup {
id
}
}
}
failedAdGroups {
adGroup {
id
}
failureMessage
}
}
}
}
}
}
Clone a Campaign with the REST API

To clone a campaign using the platform REST API, complete the following steps.

Step	Task	Endpoint	Notes
1	Submit the cloning job.	POST /v3/campaign/clone	A successful response returns a reference ID that you can use to check the job progress.
2	(Optional) Check the status of the job.	GET /v3/campaign/clone/status/{referenceId}	Include the reference ID returned in the response after you submitted the job.

To clone a campaign with the REST API, in a POST /v3/campaign/clone call, include the following:

The ID of the campaign you want to clone.
The name of the new campaign.
Set the Version value to Kokai if you're cloning a campaign in Solimar.

This request clones a campaign with all its data, including ad groups and flight information, but not its frequency settings. If you want to make any changes to the other settings, be sure to include them in your request.

1
2
3
4
5
{
"CampaignId": "SOURCE_CAMPAIGN_ID_PLACEHOLDER",
"CampaignName": "CLONED_CAMPAIGN_NAME_PLACEHOLDER",
"Version": "Kokai"
}

A successful response returns a reference ID that you can use in a GET /v3/campaign/clone/status/{referenceId} call to check the status of the job.

Automatically Opt Cloned Ad Groups Into Marketplace

Cloning a campaign does not automatically opt in the cloned ad groups into the current inventory marketplace unless you set the DefaultUseInventoryMarketPlace property to true. This applies to all selected ad groups unless specified otherwise.

Here's what you need to know:

Ad groups must be eligible to join the marketplace. For example, an ad group is ineligible if it's configured for the private market only.
If you want to prevent an ad group from being automatically opted in, set its useInventoryMarketPlace property to false in the selectedAdGroups property.
If no value is set for the DefaultUseInventoryMarketPlace property, the mutation defaults to the isMarketplaceEnabledByDefault property.

The following is a snippet of the campaignClonesCreate mutation shown in Clone Campaigns with the GraphQL API. It illustrates how the first ad group will not be automatically opted into the marketplace because its useInventoryMarketPlace property is set to false. The other ad groups will be automatically opted in.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
mutation {
...
defaultUseInventoryMarketPlace: true
selectedAdGroups: [
{
adGroupId: "ADGROUP_ID_PLACEHOLDER_01",
useInventoryMarketPlace: false // This ad group will not be automatically opted into the
marketplace.
},
{
adGroupId: "ADGROUP_ID_PLACEHOLDER_02"
},
{
adGroupId: "AD_GROUP_ID_PLACEHOLDER_03"
}
]
}
FAQs

The following is a list of frequently asked questions about campaign cloning.

Can I add new ad groups to campaign copies when cloning a campaign?

No. You can add ad groups only after the campaign copies are created.

Are cloned ad groups automatically opted into my current marketplace?

No. Cloning a campaign does not automatically opt in the cloned ad groups into the current inventory marketplace unless you set the DefaultUseInventoryMarketPlace property to true. This applies to all selected ad groups unless specified otherwise. For details, see Automatically Opt Cloned Ad Groups Into Marketplace.

Can I clone multiple campaigns?

Yes, but using only the GraphQL API. For details, see Clone Campaigns with the GraphQL API.

Can I make multiple copies of the same campaign?

Yes, but using only the GraphQL API. You can specify how many copies of a campaign you want to create. For details, see Clone Campaigns with the GraphQL API.

How long does it take to process a cloning job?

On average, the processing time for cloning a single campaign is 10 seconds. This also depends on the amount of data in the campaign being cloned. For example, the amount of ad groups, bid lists, bid lines, and so on can increase the processing time.

Can I change the settings of the source campaign during the cloning process?

No. To make changes to an existing campaign that you cloned, use the campaignUpdate operation.

Can I make changes to the campaign clones during the campaign cloning process?

Yes. However, there's a limit to the type of settings you can change. For details, see Campaign Settings You Can Copy and Modify.

How do I make changes to all of the campaign clones at once?

Use the bulk campaign update operation. For details, see GraphQL API Bulk Operations.

Is there a limit to how many campaigns I can clone?

You can clone up to 50 campaigns at once and create up to 1000 campaign copies at a time.

Do I have to specify goals and channels when cloning campaigns?

No. If the campaign that you are trying to clone already has these properties set, they will be automatically copied.

Can I change goals and channels when cloning campaigns?

Yes. To apply a different primary goal and channel when cloning campaigns, in a campaignClonesCreate mutation, include the channel and primaryGoal fields.

Do I need to update budget settings for cloned Kokai campaigns?

All budgets are automatically updated to use the Kokai budgeting version and settings if you do either of the following:

If you cloned your campaigns using GraphQL.
If you cloned your campaigns using REST and set the version property to Kokai.

In these use cases, you do not need to run the campaignBudgetSettingsUpdate mutation to update the budget settings for the cloned campaigns. To upgrade campaigns with Solimar budgets, see Budget Allocation.

How do I add a new fee card to a new campaign clone?

Use the POST /v3/additionalfees endpoint.

I see a duplicate audience with "- Copy" in its name. Where did it come from?

When cloning a campaign, the platform also clones the audience associated with each ad group that has Prism enabled. The cloned audience has the - Copy suffix appended to its name, such as AUDIENCE_NAME_PLACEHOLDER - Copy. This duplication ensures Prism is optimized for each ad group.

---

# Update Campaigns

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/CampaignUpdate](https://partner.thetradedesk.com/v3/portal/api/doc/CampaignUpdate)

Update Campaigns

After you clone or create a campaign, you may need to make adjustments to maintain high effectiveness and relevance. This can include optimizing the settings for underperforming ad groups, creatives, or keywords. If you notice a shift in your target audience, you can adjust your targeting settings to help ensure your ads reach the right users. You can also reallocate your budget to focus on higher-performing segments or to accommodate new priorities. Additionally, modifying your campaign goals when conversion behavior changes can help keep your strategy aligned with performance trends. See also Drive Your KPIs to Success.

Here's what you need to know about updating campaigns:

Updating a campaign has most of the same requirements and dependencies as creating a campaign.
To update single campaigns, use the REST API. For updating multiple campaigns in bulk, use the GraphQL bulk operations.

This page explains how to update a single campaign. For details about updating bid lists, seeds, ad groups, and other settings, see the respective guides.

REST Request Example

To update a campaign, use the PUT /v3/campaign endpoint.

For example, to update the campaign goals in the example request, you can include the following PUT /v3/campaign request body:

1
2
3
4
5
6
7
{
"CampaignId": "CAMPAIGN_ID_PLACEHOLDER",
"PrimaryGoal": {
"MaximizeReach": true
},
"SecondaryGoal": null
}
Updating Campaign Goals

All three goals (primary, secondary, and tertiary) are hierarchically interdependent, for example, you cannot remove the secondary goal without removing the tertiary one. Here’s what you need to keep in mind about updating campaign goals:

You can update the campaign goals, however you cannot remove any existing values, except the secondary and tertiary goals.
To keep the currently set goal when updating the campaign, exclude the goal object from the request or send it empty.
If you update the primary goal of a campaign, its existing ad groups will not be automatically updated. To align them with the updated primary campaign goal, you need to update the ad group goals manually.

The following table details how you can update and remove a goal from a campaign.

Update Task	Notes
Update	To change a goal, set a different value for the corresponding property. This will automatically remove the previously set goal property.
IMPORTANT: If you update the primary goal of a campaign, its existing ad groups will not be automatically updated. To align them with the updated primary campaign goal, you need to update the ad group goals manually.
Remove	To remove the secondary or tertiary goal, pass null or set the value to false for the SecondaryGoal or TertiaryGoal object.
FAQs
Can I use the GraphQL API to update campaigns?

Yes, you can use the bulk operation mutations to update a single campaign or multiple campaigns at once.

Can I attach a different seed to a campaign I already created?

Yes. For details, see Seeds.

---

# Campaign Details and Insights

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/CampaignQueryExamplesGQL](https://partner.thetradedesk.com/v3/portal/api/doc/CampaignQueryExamplesGQL)

Campaign Details and Insights

The following sections provide a list of commonly used GraphQL queries that you can use to retrieve campaign information.

TIP: If you're new to GraphQL, explore our GraphQL API Resource Hub to learn the basics—like query anatomy, authentication, and rate limits—as well as how to run bulk queries.

Campaign Performance Reporting Queries

With the GraphQL API, you can create and customize campaign queries and include reporting fields that provide key performance metrics for tracking KPIs, cost and bidding, media quality, and overall effectiveness. You can either retrieve lifetime data or organize it by day or hour to help analyze trends, optimize bids, and measure engagement effectively. Whether you're evaluating media efficiency or optimizing your bidding strategy, these detailed performance metrics can help you make informed, data-driven decisions. For details, see On-Demand Reporting Queries.

TIP: You can also use the reporting field to retrieve performance metrics at the advertiser and ad group level.

The following sections provide GraphQL queries you can use to retrieve reporting metrics that track the performance of a campaign. These metrics can also be found in the Reports (Rp) tile in the platform UI.

Look Up Campaign Lifetime Impressions and Spend

The following campaign GraphQL query retrieves the number of impressions and total spend of a campaign across all its current and past flights.

1
2
3
4
5
6
7
8
query GetCampaignLifetimeMetricsExample($campaignId: ID!) {
campaign(id: $campaignId) {
reporting {
lifetimeImpressions
lifetimeSpendInAdvertiserCurrency
}
}
}

For more granular metrics, see Look Up Campaign Performance Metrics by Date Range.

Look Up Campaign Performance Metrics by Date Range

Here's what you need to know about looking up campaign performance metrics by date range:

These metrics also include data from all of the ad groups in a campaign.
You can filter the metrics only by date.
If you don't include a date range in the where filter, the query returns the campaign's lifetime metrics.
You can retrieve metrics at the following time intervals, specified in the dimensions field:
Hourly (last 30 days)
Daily (last year)
If you don’t include the dimensions field, the query returns aggregated totals for each metric without grouping data by time interval. See also Look Up Campaign Lifetime Impressions and Spend.

The following campaign GraphQL query retrieves all campaign metrics you can use to optimize campaign performance, manage spend and bidding, and so on. The date range is specified using gte (start, inclusive) and lte (end, inclusive) for the reporting period.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
49
50
51
52
53
54
55
56
57
58
59
60
61
62
63
64
65
66
67
68
69
70
71
72
73
query GetCampaignPerformanceMetricsbyDateRangeExample($campaignId: ID!) {
campaign(id: $campaignId) {
reporting {
generalReporting(
where: { date: { gte: "2025-02-01", lte: "2025-02-28" } }
) {
nodes {
dimensions {
time {
day
}
}
metrics {
adPlays
baseBid {
advertiserCurrency
}
bidCpm {
advertiserCurrency
}
bids
clicks
completionRate
conversions
cpa {
advertiserCurrency
}
cpc {
advertiserCurrency
}
cpcv {
advertiserCurrency
}
cpm {
advertiserCurrency
}
ctr
customCpa {
advertiserCurrency
}
customRoas {
advertiserCurrency
}
impressions
mediaCost {
advertiserCurrency
}
mediaCpm {
advertiserCurrency
}
nielsenOtp
revenue
roas {
advertiserCurrency
}
spend {
advertiserCurrency
}
tvQualityCpm {
advertiserCurrency
}
tvQualityIndex
vCpm {
advertiserCurrency
}
viewability
winRate
}
}
}
}
}
}
Look-Up Campaign Publisher Spending

The following campaign query retrieves a list of publishers a campaign spends on most and the CPA for each publisher.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
query GetTop10PublishersExamples($campaignId: ID!) {
campaign(id: $campaignId) {
reporting {
publisherReporting(
first: 10
where: {
date: { gte: "2026-03-01T00:00:00Z", lt: "2026-04-01T00:00:00Z" }
}
order: [{ spend: { advertiserCurrency: DESC } }]
) {
nodes {
dimensions {
publisherProperty {
name
}
}
metrics {
spend {
advertiserCurrency
}
cpa {
advertiserCurrency
}
}
}
}
}
}
}
Look-Up Campaign Flight ROAS Performance

The following campaign query retrieves the ROAS for the current campaign flight over time.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
query GetCurrentFlightROASOverTimeExample($campaignId: ID!) {
campaign(id: $campaignId) {
currentFlight {
reporting {
generalReporting {
nodes {
dimensions {
time {
day
}
}
metrics {
roas {
advertiserCurrency
}
}
}
}
}
}
}
}
Miscellaneous Campaign Data Queries

The following sections provide GraphQL queries you can use to look up inflight campaign data and key metrics such as projected spend and relevance.

TIP: If you are planning a campaign and want to test configurations based on predicted estimated spend and delivery metrics, see Forecasting.

Look Up Campaign with Ad Groups

The following GraphQL query retrieves the ID and name for a campaign and, for each campaign returned, the name and ID of each ad group in the campaign.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
query GetCampaignWithAdGroupsExample($campaignId: ID!) {
campaign(id: $campaignId) {
id
name
adGroups {
edges {
node {
id
name
}
}
pageInfo {
endCursor
hasNextPage
hasPreviousPage
startCursor
}
}
}
}
Look Up Campaign Flights

The following GraphQL query uses a flights filter to retrieve campaign flight IDs and the maximum amount each flight may spend. To learn more about using filters, see GraphQL API Queries in our GraphQL Resource Hub.

1
2
3
4
5
6
7
8
9
10
11
12
query GetFlightDataExample($campaignId: ID!, $campaignFlightId1: Long, $campaignFlightId2: Long) {
campaign(id: $campaignId){
id
name
flights(where: {id: {in: [$campaignFlightId1, $campaignFlightId2]}}){
nodes{
id
budgetInAdvertiserCurrency
}
}
}
}
FAQs

The following is a list of frequently asked questions about GraphQL queries for campaigns.

How often do the Projected Spend and Relevance metrics get updated?

The following table lists how frequently the Projected Spend and Relevance metrics are updated.

Metric	Update Frequency
Projected Spend
Approximately 2 hours after a campaign or ad group change
Once a day

Relevance
After a campaign change
Every two days

---

# Campaign Connector

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/CampaignConnector](https://partner.thetradedesk.com/v3/portal/api/doc/CampaignConnector)

Campaign Connector

A Campaign Connector is a direct API integration between The Trade Desk and your preferred tools for media operations.

Most agencies and ad platforms use some type of media-operations or order-booking platforms to keep track of the details and billing for a media campaign. During the campaign setup process, media-buying teams have to manually enter campaign details twice: once in their operations tools, and another time in The Trade Desk platform. These duplicate entries are inefficient and often result in discrepancies across platforms that then require troubleshooting and reconciliation. With Campaign Connector, media buyers no longer have to re-enter campaign flight dates and budgets into both platforms. Instead, campaign details can be entered into the order-booking platform and pushed to The Trade Desk.

The following image illustrates the workflow schema of a Campaign Connector.

Integration

TIP: To begin testing the integration process, download the sample code in Python, which demonstrates the call pattern and best practices for this use case.

The typical Campaign Connector build involves interaction with a number of endpoints. Depending on your scenario, you may interact with some (if not all) of the endpoints outlined in the workflow.

Call	Description
Authentication	The authentication endpoint generates a user token that will be needed to sign all subsequent actions. Set an expiration for your token and ensure you include the token in the header of any other endpoint interactions. The token should be stored and regenerated periodically. Keep in mind that this endpoint is rate limited, so you will not be able to authenticate on every API call. Instead, it is recommended that you generate a new token once every 24 hours.
Advertiser	To create campaigns, you will first need to create an advertiser or map an existing one. Remember to pass your authentication token in the header of the call.
Campaigns	Now that you have an advertiser created, you can create a campaign, where you will define the flight dates, budget allocation, and global pacing settings for your strategies.
Ad Groups	The ad group is where you define the details of your bidding strategy. In our example below, we've defined an ad-group template that outlines the budget, bids, sitelists, and enabled forms of Auto-Optimization. To help reduce redundant work and ensure your strategies are set up correctly, when designing your ad-group templates, think about the repetitive tasks your team handles that the API can define instead.
Additional Tasks

The Campaign Connector build isn't a strictly defined set of tasks. You can design your integration to automate any number of processes that would impact the efficiency of your day-to-day operations. Some partners look to also monitor the performance of their ad groups and campaigns by using the Reports endpoints to download insights. Managing the creative upload process by building a Creative Connector is another time-saving task that you can include in your design.

Best Practices

The following sections provide additional guidance for building a Campaign Connector:

Caching Responses and Partial Updates
Efficient Syncing using Delta Endpoints
Error Handling
Rate Limits

See also Platform Synchronization.

Caching Responses and Partial Updates

Every API call returns the entire entity in the response payload. If your platform is responsible for defining the settings of any entity, caching the response is the most efficient option for this integration. It will conserve resources for retrieving entity data from The Trade Desk before you need to make an update.

If updates need to be pushed, we allow the flexibility to do partial updates to all entities by just supplying the entity ID and the parameters that you would like to change. In the example below, we use a PUT call to make an update to the campaign budget. The GET - PUT workflow is not supported with our API, as there are parameters that are included in the GET response that are not allowed when pushing an update. Use the related delta endpoint if you need to understand an entity's state before pushing a change.

Efficient Syncing using Delta Endpoints

When two platforms are linked, it is often necessary to keep both systems in sync. If there are users in our platform who will be making adjustments to The Trade Desk settings, then it is important to understand any changes that were made before pushing an update. We have a suite of delta endpoints that allow you to request any entities that have been created or have changed since the last time you requested the state. See our section on delta endpoints that details the list of all available endpoints.

The following example demonstrates how you would use the delta endpoint to retrieve all ad groups that have changed since the last time you requested the state. Every response to this endpoint provides the token "LastChangeTrackingVersion", which identifies a point in time when an entity's state was provided. This value should be stored and used on the subsequent delta request, so that our system understands the timestamp to use to compute entity changes from your prior request.

API Call Example
curl -H "Content-Type: application/json" -H "TTD-Auth:|Token|" -X "POST
https://api.thetradedesk.com/v3/delta/adgroup/query/advertiser" -d '{"AdvertiserId": "|advertiserid|",
"ReturnEntireAdGroup": true, "LastChangeTrackingVersion": 361335703}'
API Response Example
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
{
"AdGroups": [
{
"CampaignId": "|campaignid|",
"AdGroupId": "|adgroupid|",
"AdGroupName": "Test Ad Group ",
"Description": "Testing Ad Group",
"IsEnabled": false,
"AdGroupCategory": 8311,
"RTBAttributes": {........}
}
],
"MoreAdGroupsAvailable": false,
"ElementIds": null,
"LastChangeTrackingVersion": 361337290
}

If you are operating your own UI, there are also use cases in which clients are making inputs while service teams are making changes within The Trade Desk platform. In these cases, where updates are being made across both systems, there may be a need to understand the complete state of The Trade Desk entities to resync both platforms. Our query endpoints can help you accomplish this, by retrieving all entity data. These endpoints are strictly rate limited and should only be used for infrequent retrieval. The example below shows how you would use the query endpoint to retrieve all ad groups that are associated with an advertiser.

API Call Example
curl -H "Content-Type: application/json" -H "TTD-Auth:|Token|" -X "POST
https://api.thetradedesk.com/v3/adgroup/query/advertiser" -d '{"AdvertiserId": "sample string 1",
"Availabilities": ["Available"], "PageStartIndex": 0, "PageSize": 100}'
Error Handling

When a request is successful, the API will return an HTTP response with a 200 status code and, if appropriate, a JSON response body. If an error occurs during request processing, the API will return an HTTP response with an appropriate non-200 status code and a JSON body describing the error. In the case of 5xx errors, please check our API Status page and contact your solutions architect to look further into your issue. If you received a 4xx error, the issue is typically a user error. Please monitor the messages in the JSON response so that you can self-correct.

Rate Limits

To ensure sufficient capacity at all times for all our partners, we have implemented rate limits across our API endpoints. If limits are exceeded, the API will return a 429 response code. The proper behavior for handling 429 errors is using an exponential back-off policy until you are able to successfully complete a transaction. For details, see Rate Limits.

---

# Building Audiences

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/Audience](https://partner.thetradedesk.com/v3/portal/api/doc/Audience)

Building Audiences

An audience is a specific person or group of people that you want to reach with a campaign. Audiences are made up of included and excluded data groups. Data groups are made up of data elements (first-party data segments or third-party data segments). When you add multiple elements to a data group, you grow the audience. When you add multiple data groups to an audience, you shrink the audience.

Data Elements

Data elements are segments of information like cookies and various IDs (such as device IDs and Unified IDs like UID2 and EUID).

Data Element Type	Description
First-Party	First-party data elements are segments that you've sent to the platform or that you've authorized another data provider to send to our platform on your behalf. There are no fees associated with using your own data.
Third-Party	Third-party data elements are segments that data providers have sent to the platform and are available for you to purchase and target in your audiences. These use a flat-fee CPM, a percentage of media cost, or a combination of both. These fees are clearly outlined in the platform.

Data elements can be combined into data groups.

Data Groups

A data group is a collection of first-party and/or third-party data elements that are combined using an OR (union) operator. For example, a data group with data element 1 and data element 2 would look for users that match both data element 1 or data element 2.

Data Element 1
Data Element 2
Included in Data Group

When creating an audience, you can use data groups to include or exclude their data elements for targeting. Included data groups target only the specified segments of users, while excluded data groups target everyone except the specified segments of users. You can use both included and excluded groups to create the audience you want to target.

Here's what you need to know about data groups when building your audience:

If more than one data group is included in an audience, a user must match all of the included data groups to be targeted.
If more than one data group is excluded in an audience, a user may match any of the excluded data groups to be removed from targeting.
If a user matches both included and excluded data groups, the user will be excluded from the audience.
Excluding third-party data elements from a data group has a $0.09 CPM fee, in addition to any fee charged by the data provider to use the segment.

The following diagram illustrates the audience segment that is targeted when multiple data groups are included and excluded within an audience.

IncludedData Group 1
IncludedData Group 2
ExcludedData Group 3
Targeted Audience

Audience Creation Workflow

To create an audience, complete the following steps:

Send first-party data or use third-party data buyable within the platform.
Look up first-party data and third-party data element IDs to use within a data group.
Create data groups to include in or exclude from audiences.
Assign data groups to audiences.
Assign audiences to ad groups.

The following sections provide examples for these and other related tasks.

Data Element Tasks

The following table lists the tasks for managing data elements in both the platform and data API.

NOTE: The data API requires a different authentication.

Task	API Suite	Endpoint or Further Reference	Notes
Populate first-party segment data.	Data	POST /data/advertiser	Populate your segments with cookies or acceptable types of IDs. For details, see Getting Started with Data Onboarding.
Create geofence segments.	Platform	Geofence Targeting	Create your own geofence segment and use points to define virtual boundaries to target specific areas.
Look up first-party data elements.	Platform	POST /v3/dmp/firstparty/advertiser	To find the FirstPartyDataId to use in a data group, use the Data.Name value that you assigned to the segment when populating first-party segment data as a SearchTerm.
Look up third-party data elements.	Platform	POST /v3/dmp/thirdparty/advertiser	Look up the ThirdPartyDataId to add to a data group.
Remove inactive users from first-party data segments.	Data	POST /data/advertiser	To remove an inactive user, set the TTLInMinutes property to 0 for that user in the request.
TIP: To delete the whole segment, set the TTLInMinutes property to 0 for all IDs in the segment.
Look up third-party data elements similar to your first-party data elements.	Platform	GET /v3/dmp/lookalikemodel/build/{firstPartyDataId}
POST /v3/dmp/lookalikethirdpartydata/query	Build a lookalike model and find similar ThirdPartyDataIds to your FirstPartyDataId.
First-Party Data Elements: Look-up Task Examples

You can look up first-party data elements by using a variety of filters and sorting, which can be combined to find relevant segments more efficiently.

NOTE: The lookup endpoints return the number of active IDs from the last 7 days and received IDs from the last 30 days. For details, see Unique ID Counting Methodologies.

The following sections provide examples of different ways of looking up first-party data elements:

By Advertiser
By Unique Count
By Search Terms
By Data Types
By Lookalike Model Result Status
Look up All First-Party Data Elements for an Advertiser

The following is a POST /v3/dmp/firstparty/advertiser request body example with the AdvertiserId property.

1
2
3
4
5
{
"AdvertiserId": "advabc",
"PageStartIndex": 0,
"PageSize": 10
}
Look up First-Party Data Elements by Unique Count

The following is a POST /v3/dmp/firstparty/advertiser request body example with the AdvertiserId and UniqueCountMinimum properties.

1
2
3
4
5
6
{
"AdvertiserId": "advabc",
"UniqueCountMinimum": 5000,
"PageStartIndex": 0,
"PageSize": 10
}
Look up First-Party Data Elements by Search Terms

Search terms may be added to the request to filter results where the search term matches the data element's FirstPartyDataId, Name, or DataType.

The following is a POST /v3/dmp/firstparty/advertiser request body example with search terms.

1
2
3
4
5
6
{
"AdvertiserId": "advabc",
"SearchTerms": ["auto"],
"PageStartIndex": 0,
"PageSize": 10
}
Look up First-Party Data Elements by Data Types

The following is a POST /v3/dmp/firstparty/advertiser request body example with data types.

1
2
3
4
5
6
{
"AdvertiserId": "advabc",
"DataTypes": ["ImportedAdvertiserData","Keyword"],
"PageStartIndex": 0,
"PageSize": 10
}
Look up First-Party Data Elements by Lookalike Model Result Status

The following is a POST /v3/dmp/firstparty/advertiser request body example with a LookAlikeModelResultStatuses property.

1
2
3
4
5
6
{
"AdvertiserId": "advabc",
"LookAlikeModelResultStatuses": "Ready",
"PageStartIndex": 0,
"PageSize": 10
}
Remove Inactive Users from First-Party Data Segments

To remove inactive users from your data segment, in a POST /data/advertiser call, set the TTLInMinutes property to 0 for that user.

TIP: To delete the whole segment, set the TTLInMinutes property to 0 for all IDs in the segment.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
{
"AdvertiserId":"yourAdvertiserId",
"Items":[
{
"TDID":"123e4567-e89b-12d3-a456-426652340000",
"Data":[
{
"Name":"1210",
"TimestampUtc": "2023-11-11T10:11:30+5000",
"TTLInMinutes":0
},
{
"Name":"1160",
"TimestampUtc": "2023-11-13T09:35:30+5000",
"TTLInMinutes":0
}
]
}
]
}
Third-Party Data Elements: Look-up Task Examples

You can look up third-party data elements by using a variety of filters and sorting, which can be combined to find relevant segments more efficiently.

NOTE: The lookup endpoints return the number of active IDs from the last 7 days and received IDs from the last 30 days. For details, see Unique ID Counting Methodologies.

The following sections provide examples of different ways of looking up third-party data elements:

By Advertiser
By Unique Count
By Search Terms
By Demographic Category
By Data Rate
By Ad Environment
Look up All Third-Party Data Elements for an Advertiser

The following is a POST /v3/dmp/thirdparty/advertiser request body example with the AdvertiserId property.

1
2
3
4
5
{
"AdvertiserId": "advabc",
"PageStartIndex": 0,
"PageSize": 10
}
Look up Third-Party Data Elements by Unique Count

The following is a POST /v3/dmp/thirdparty/advertiser request body example with the AdvertiserId and UniqueCountMinimum properties.

1
2
3
4
5
6
{
"AdvertiserId": "advabc",
"UniqueCountMinimum": 5000,
"PageStartIndex": 0,
"PageSize": 10
}
Look up Third-Party Data Elements by Search Terms

The following is a POST /v3/dmp/thirdparty/advertiser request body example with search terms.

IMPORTANT: All terms must be matched in the Name or FullPath in order for a result to be returned.

1
2
3
4
5
6
{
"AdvertiserId": "advabc",
"SearchTerms": ["auto"],
"PageStartIndex": 0,
"PageSize": 10
}
Look up Third-Party Data Elements by Demographic Category

To look up category IDs, use GET /v3/dmp/thirdparty/facets/{advertiserId}.

The following is a POST /v3/dmp/thirdparty/advertiser request body example with the CategoryId of 526 for the demographic category including ages 18-24 years.

1
2
3
4
5
6
{
"AdvertiserId": "advabc",
"CategoryIds": [526],
"PageStartIndex": 0,
"PageSize": 10
}
Look up Third-Party Data Elements by Data Rate

You can filter segments that have a certain data rate or data rate type.

The following is a POST /v3/dmp/thirdparty/advertiser request body example with the CPMFilter filter.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
{
"AdvertiserId": "advabc",
"DataRateFilters": {
"CPMFilter": {
"MinimumCPM": {
"Amount": 3,
"CurrencyCode": "USD"
},
"MaximumCPM": {
"Amount": 7,
"CurrencyCode": "USD"
}
}
},
"PageStartIndex": 0,
"PageSize": 10
}
Look up Third-Party Data Elements by Ad Environment

You can filter segments by either Web or InApp ad environment.

The following is a POST /v3/dmp/thirdparty/advertiser request body example with the InApp filter.

1
2
3
4
5
6
{
"AdvertiserId": "advabc",
"AdEnvironment": "InApp",
"PageStartIndex": 0,
"PageSize": 10
}
Third-Party Data Elements Similar to Your First-Party Data Element: Look-up Tasks

NOTE: Third-party data elements are only available in our production environment. They are not available in our sandbox environment.

Task	API Suite	Endpoint
Look up eligible first-party data segments	Platform	POST /v3/dmp/firstparty/advertiser
Build a lookalike model of third-party data elements	Platform	GET /v3/dmp/lookalikemodel/build/{firstPartyDataId}
Check the lookalike model build status	Platform	GET /v3/dmp/lookalikemodel/{firstPartyDataId}
Retrieve third-party data elements from the lookalike model	Platform	POST /v3/dmp/lookalikethirdpartydata/query/
Look up Eligible First-Party Data Segments

For the best probability of having enough first-party data to generate a lookalike model, search for eligible first-party segments that have a minimum unique count ranging from 1000 to 5000.

The following is a POST /v3/dmp/firstparty/advertiser request body example.

1
2
3
4
5
6
7
{
"AdvertiserId": "advabc",
"UniqueCountMinimum": 4000,
"LookAlikeModelEligibilities": ["Eligible"],
"PageStartIndex": 0,
"PageSize": 10
}
Build a Lookalike Model of Third-Party Data Elements

To build a lookalike model, make a request to GET /v3/dmp/lookalikemodel/build/{firstPartyDataId}.

Check the Lookalike Model Build Status

To check the build status of lookalike model, make a request to GET /v3/dmp/lookalikemodel/{firstPartyDataId}.

The response includes a LookAlikeBuildStatus, which indicates whether the lookalike model build is processing (Queued) or was completed (Built). The response also includes a LookAlikeModelResultStatus.

The following table explains the LookAlikeModelResultStatus values.

Status Value	Description
NoResults	The first-party data segment the model was generated from did not have enough overlap with third-party data to generate model.
Ready	The lookalike model has been generated and ThirdPartyDataIds can be retrieved to use in an audience.
Retrieve Third-Party Data Elements from the Lookalike Model

Search for the results of the build using the query endpoint. The Result object shows the third-party data segments similar to the first-party data segment, as well as a relevance ratio and value ratio to help you evaluate the best segments to use in your audience. Use Result.ThirdPartyData.ThirdPartyDataId in your data groups.

The following is a POST /v3/dmp/lookalikethirdpartydata/query request body example.

1
2
3
4
5
{
"FirstPartyDataId": 1234567,
"PageStartIndex": 0,
"PageSize": 10
}
Data Group Tasks
Task	API Suite	Endpoint	Notes
Create a data group	Platform	POST /v3/datagroup	All third-party data IDs in segments will be validated for biddability. Data group workflows will fail if the ThirdPartyDataIds array contains non-biddable IDs.
Retrieve details for an individual data group by ID	Platform	GET /v3/datagroup/{dataGroupId}	N/A
Look up all data groups for an advertiser	Platform	POST /v3/datagroup/query/advertiser	Use SearchTerms to search for matching terms in DataGroupId, DataGroupName, or Description.
Look up all data groups since the last change tracking version	Platform	POST /v3/delta/dmp/query/advertiser/firstparty	N/A
Update a data group	Platform	PUT /v3/datagroup	All third-party data IDs in segments will be validated for biddability. Data group workflows will fail if the ThirdPartyDataIds array contains non-biddable IDs.
Create Data Groups

NOTE: Data groups are created using the platform API endpoints. For details, see Foundations.

Here's what you need to know about data groups:

You share data groups among multiple audiences. Just set the IsSharable property to true.
To create the data group without third-party data segments that you are not authorized to use, set the SkipUnauthorizedThirdPartyData property to true when specifying third-party IDs. If not specified or set to false, attempting to create a data group with ThirdPartyDataIds you are unauthorized to use will result in an error.
All third-party data IDs in segments will be validated for biddability. Data group workflows will fail if the ThirdPartyDataIds array contains non-biddable IDs.

TIP: To check if segments are buyable beforehand, use the POST /v3/dmp/thirdparty/advertiser endpoint. Include only third-party data IDs listed in the response.

The following is a POST /v3/datagroup request body example.

1
2
3
4
5
6
7
8
9
10
11
12
{
"AdvertiserId": "advabc",
"DataGroupName": "Auto Interest",
"IsSharable": true,
"FirstPartyDataIds": [
1234567
],
"ThirdPartyDataIds": [
"1234567|bluekai"
],
"SkipUnauthorizedThirdPartyData": true
}
Audience Tasks
Task	API Suite	Endpoint	Notes
Create an Audience	Platform	POST /v3/audience	For details on what you need to know about data groups when creating audiences, see Data Groups.
Retrieve Details For An Individual Audience By Id	Platform	GET /v3/audience/{audienceId}	N/A
Look up all audiences for an advertiser	Platform	POST /v3/audience/query/advertiser	Use SearchTerms to search for matching terms in AudienceId, Audience, or Description.
Update an audience	Platform	PUT /v3/audience	For examples, see Assign an Audience to an Ad Group.
Create an Audience

The following is POST /v3/audience request body examples.

Target Certain Data Groups and Exclude One Data Group
1
2
3
4
5
6
7
8
9
10
11
12
{
"AdvertiserId": "adv123",
"AudienceName": "24-35 Cats Minus Low Value",
"Description": "Users in the age range 24-35 who are interested in cats and are not low-value users.",
"IncludedDataGroupIds": [
"aud1234",
"aud2345"
],
"ExcludedDataGroupIds": [
"aud3456"
]
}
Target Everyone Except One Data Group
1
2
3
4
5
6
7
8
9
{
"AdvertiserId": "adv123",
"AudienceName": "Everyone Except Low-Value Users",
"Description": "Exclude low value users",
"IncludedDataGroupIds": [],
"ExcludedDataGroupIds": [
"aud3456"
]
}
Assign an Audience to an Ad Group

The following is a PUT /v3/adgroup request example that shows how to assign an audience to an existing ad group.

1
2
3
4
5
6
7
8
{
"AdGroupId": "adgr123",
"RTBAttributes": {
"AudienceTargeting": {
"AudienceId": "aud1234"
}
}
}
To target everyone (run-of-exchange), do not enable any properties in the RTBAttributes.AudienceTargeting object of the ad group.
To target only trackable users, on the ad group, enable RTBAttributes.AudienceTargeting.TargetTrackableUsersEnabled to restrict targeting only to users that we can track (users we have a TDID or a device ID for).
We'll create a new audience for you that includes only trackable users.

NOTE: There is a fee to use this feature which you can be look up by using the ad group's RTBAttributes.AudienceTargeting.TargetTrackableUsersFee object.

To view a full list of Koa features, see Ad Groups.

FAQs

We've got answers to your most commonly asked questions.

How is audience different from seed?

Audience and seed are not the same. They are two discrete entities.

A seed is a specific, concentrated group of individuals who represent the core group of people that you want to target. This group typically consists of individuals who have taken valuable actions or exhibit traits that align with your campaign goals. An audience, on the other hand, is an expanded version of the core group, which includes not only the individuals in your seed but also extends to others who share similar traits or behaviors.

---

# The Trade Desk Contextual Custom Categories

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/ContextualCategoriesTTD](https://partner.thetradedesk.com/v3/portal/api/doc/ContextualCategoriesTTD)

The Trade Desk Contextual Custom Categories

NOTE: This guide is intended for advertisers who want to create their own customized contextual categories in The Trade Desk platform, not third-party data providers.

Contextual targeting with The Trade Desk (also known as "TTD contextual") focuses on extracted text content and user-declared keywords rather than relying on contextual categories offered by a publisher. For category types, benefits of using contextual targeting, and other details, see Contextual Categories.

Benefits

Here are some benefits of using contextual targeting:

This is an alternative to ID-based advertising: analyze the content being consumed instead of the person consuming it.
Spend only on inventory that meets your specific business goals with custom contextual categories.
Leverage the matching capabilities of contextual targeting to better match your ad placements.
Contextual targeting is supported both on web browsers and in in-app environments.
Troubleshoot the impact of your selected keywords by using the scale insights in the UI. Scale insights give you a clear view of the projected scale in-platform at the keyword and category level.

To get started, create TTD contextual custom categories and apply them to your ad groups via bid lists. After you enable your ad groups, they will include (target) or exclude (block) URLs where page content has text that matches your keywords or phrases.

For details on how this feature works in the platform UI, see The Trade Desk's contextual targeting solution in the Knowledge Portal.

TTD Contextual Custom Category Anatomy

A TTD contextual custom category consists of the following major properties that are used for category targeting:

A name that describes the category.
An ID that is assigned at creation and is subsequently used to manage the category or apply it to ad groups.
The category type:
Target (or 1) for inclusion categories, which allow bids on the URLs and apps that match your keywords and phrases.
Block (or 0) for exclusion categories, which block bids on the URLs and apps that match your keywords and phrases.
A list made up of at least one keyword of phrase.

Each keyword in a category has the following properties:

Property	Description
Value	The word or phrase to be searched for on webpages or in apps. For details, see Keyword Value Guidelines.
MatchType	The logic to be used for matching the keyword to webpages or apps. The possible values include the following:

ExactMatch: At least one specified keyword must be present on matched pages. (Or)
ExactRequired: All specified keywords must be present on matched pages. (And)
ExactAvoid: None of the specified keywords must be present on matched pages. (Not)
See also Keyword Matching Examples and Create a TTD Contextual Custom Category.
MatchApplication	The method for matching each keyword to webpages or apps. The possible values include the following:

Exact: Search only for words and phrases that exactly match the keyword string specified in the Value property. For example, for the keyword "cat", the exact match would be "cat".
If there are multiple words in a phrase, they must appear in the same order on webpages and in apps.
Similar: Based on the specified language, search for words and phrases that are similar to the keyword string in the Value property. For example, for the keyword "cat", similar words in English would be "cat", "cats", "bobcats", "catnip", and so on.
If there are multiple words in a phrase, their order on webpages or in apps might be different, and other words that are not part of the keyword phrase might appear between the matched words. See also Keyword Value Guidelines.

Here's a keyword example:

1
2
3
4
5
{
"Value": "cat",
"MatchType": "ExactRequired",
"MatchApplication": "Similar"
}
Keyword Matching Examples

Depending on the category type (Block or Target), keywords with the ExactAvoid match type value result in different bidding outcomes. Hence, it's worth taking time to understand the logic by reviewing the following examples.

NOTE: The following simplified examples are provided to illustrate only the logic of the ExactAvoid match type. Ultimately, bidding is allowed or blocked based on all category match settings satisfied in addition to the specific ones discussed in each example.

Example 1

For example, the following Target category would match all webpages and apps that mention pets, but not cats. If you change the custom category type to Block, then you match content only about cats, pets in general, and any other content that complies with the other match settings. In other words, instead of avoiding content with references to cats and blocking bidding on those pages, a Block category does the opposite.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
{
"CustomCategoryName": "Pets",
"CustomCategoryType": "Target",
"Keywords": [
{
"Value": "cat",
"MatchType": "ExactAvoid",
"MatchApplication": "Similar"
},
{
"Value": "pets",
"MatchType": "ExactMatch",
"MatchApplication": "Similar"
}
],
"LanguageCode": "eng",
"AdvertiserId": "abcd1234",
"CustomCategorySourceType": "TTDContextualCategory"
}
Example 2

Here's another example of a list of keywords in a TTD contextual custom category. Depending on the category type, bidding is either allowed or blocked for webpages and apps with the word religion that has its match type set to ExactAvoid, assuming that all other match conditions are met.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
[
{
"Value": "christmas",
"MatchType": "ExactRequired",
"MatchApplication": "Similar"
},
{
"Value": "easter",
"MatchType": "ExactRequired",
"MatchApplication": "Similar"
},
{
"Value": "baking",
"MatchType": "ExactMatch",
"MatchApplication": "Similar"
},
{
"Value": "religion",
"MatchType": "ExactAvoid",
"MatchApplication": "Similar"
}
]

Let's assume there are two sample inventories:

Website A that includes the following text: This is a blog about preparing for Easter and Christmas. The blog includes recipes, religious practices, and more!

Website B that includes the following text: This is a blog about preparing for Easter and Christmas. The blog includes a guide to preparing all the food and baked goods you could dream of! Click the "Recipes" tab for more.

If the keywords were used in an include (Target) category, then you would bid only on website B. If the keywords were used in an exclude (Block) category, then you would bid only on website A and any other website that is not like website B.

TTD Contextual Custom Category Tasks

The following table lists the common tasks for TTD contextual custom categories and the respective endpoints.

Task	Endpoint	Notes
Create a category.	POST /v3/customcategory	Be sure to review the Category Keyword List Requirements and Keyword Value Guidelines.
Update the keywords, category type, or language code of an existing category.	PUT /v3/customcategory	To rename a category, use the POST /v3/customcategory/rename endpoint.
Look up a specific category and its TTD contextual category ID.	GET /v3/customcategory/{customCategoryId}	Just specify the custom category ID as the path parameter in your request.
IMPORTANT: The response includes the TTDContextualCategoryId value that is required for including the category in bid lists.
Look up all custom categories for a specific advertiser.	GET /v3/customcategory/advertiser/{advertiserId}	Just specify the advertiser ID as the path parameter in your request.
Look up all custom categories for a specific partner.	POST /v3/customcategory/query	In the body of your request, specify the partner ID and set the CustomCategorySourceType property to TTDContextualCategory.
Delete a category.	DELETE /v3/customcategory/{customCategoryId}	Just specify the custom category ID as the path parameter in your request.
IMPORTANT: Deleting categories removes them from ad groups, which may result in the loss of historical usage data.
Include a category as a bid line in a bid list.	POST /v3/bidlist
PUT /v3/bidlist	Bid lines require the TTDContextualCategoryId value returned by GET /v3/customcategory/{customCategoryId} calls with the ttd-ct- prefix added to it.
Create a TTD Contextual Custom Category

To create a contextual custom category in The Trade Desk platform, in a POST /v3/customcategory request, specify its name, type, your advertiser or partner ID, and at least one keyword. For guidelines and requirements, see the following sections.

Category Keyword List Requirements

Here's what you need to know about keywords and phrases in a TTD contextual custom category:

The maximum limit is 5,000. For best results, lists should contain fewer than 2,000 keywords or phrases.
A category must have at least one keyword with the MatchType property value set to ExactMatch (Or).
You can add a maximum of five keywords with the MatchType property value set to ExactRequired (And) per category.
For any keywords with the MatchApplication property value set to Similar, be sure to specify the three-letter ISO639-3 language code. To get the list of supported languages and their codes, use the GET/customcategory/ttd/languages endpoint.

IMPORTANT: For exclusion categories (with the CustomCategoryType property set to Block), setting the keyword MatchType property value to ExactAvoid allows bids on pages and apps containing the specified keywords rather than blocking bids. For details, see Keyword Matching Examples.

Keyword Value Guidelines

You can specify any word or phrase as a keyword in a contextual custom category. Here's what you need to know:

Keywords and phrases are not case-sensitive. For example, "USA" and "usa" will result in duplicate keywords.
You can use only alphanumeric characters, spaces between words in the middle of a phrase, and apostrophes.
Spaces around keywords (namely, at the beginning or the end of the phrase) will be automatically removed. For example, "cat food" and " cat food " will result in duplicate keywords.
Do not use quotation marks when you enter keywords or phrases. If you use any special characters and punctuation other than apostrophes when you enter keywords or phrases, these be automatically removed during the matching and might result in duplicate keywords.
The maximum keyword string length is 100 characters, including spaces.
For any keywords with the MatchApplication property set to Similar, you don't need to enter permutations of the same word, such as the plural and singular nouns or different forms of the same verb. For example, if you enter keyword work, all other forms like works, worked, has been working, will have been worked, and workings are matched.
Create Request Body Example

The following is an example of POST /v3/customcategory request body that creates a TTD contextual custom category.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
{
"CustomCategoryName": "Cat Food",
"CustomCategoryType": "Target",
"Keywords": [
{
"Value": "cat",
"MatchType": "ExactRequired",
"MatchApplication": "Similar"
},
{
"Value": "food",
"MatchType": "ExactRequired",
"MatchApplication": "Similar"
},
{
"Value": "feline",
"MatchType": "ExactMatch",
"MatchApplication": "Similar"
},
{
"Value": "pet",
"MatchType": "ExactMatch",
"MatchApplication": "Similar"
},
{
"Value": "dog",
"MatchType": "ExactAvoid",
"MatchApplication": "Similar"
}
],
"LanguageCode": "eng",
"AdvertiserId": "abcd1234",
"CustomCategorySourceType": "TTDContextualCategory"
}
Response Example

The response returns the platform ID assigned to the category, its keyword count, and status.

1
2
3
4
5
6
7
8
9
10
{
"CustomCategoryId": "123456",
"CustomCategoryName": "Cat Food",
"CustomCategoryType": 1,
"KeywordCount": 5,
"AdvertiserId": "abcd1234",
"PartnerId": null,
"Status": "NotReady",
"LanguageCode": "eng"
}

For details on applying categories to ad groups, see Include TTD Contextual Custom Category in Bid Lines.

IMPORTANT: Be sure to wait until the category is live before enabling your ad groups, especially for exclusion categories (with the CustomCategoryType property value set to Block). It takes up to three hours to process a category, and any bidding on inventory before the category is fully processed might result in not blocking webpages or apps with the specified keywords.

Update a TTD Contextual Custom Category

To update the keywords, category type, or language code of an existing category, in a PUT /v3/customcategory request, specify the category ID, your advertiser or partner ID, and the keyword or language changes you want to make. To rename a category, use the POST /v3/customcategory/rename endpoint.

IMPORTANT: If updating keywords, be sure to review the Category Keyword List Requirements and Keyword Value Guidelines and send the whole list for every update, even if you are updating only the language code.

The following is an example of PUT /v3/customcategory request body with a keyword added to the list.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
{
"CustomCategoryId": "123456",
"Keywords": [
{
"Value": "cat",
"MatchType": "ExactRequired",
"MatchApplication": "Similar"
},
{
"Value": "food",
"MatchType": "ExactRequired",
"MatchApplication": "Similar"
},
{
"Value": "feline",
"MatchType": "ExactMatch",
"MatchApplication": "Similar"
},
{
"Value": "pet",
"MatchType": "ExactMatch",
"MatchApplication": "Similar"
},
{
"Value": "dog",
"MatchType": "ExactAvoid",
"MatchApplication": "Similar"
},
{
"Value": "canine",
"MatchType": "ExactAvoid",
"MatchApplication": "Similar"
}
],
"LanguageCode": "eng",
"AdvertiserId": "abcd1234",
"CustomCategorySourceType": "TTDContextualCategory"
}
Include a TTD Contextual Custom Category in Bid Lines

To apply a TTD contextual custom category to an ad group, you need to include the category ID as a TTDContextualCategoryId bid line to a bid list associated with the ad group.

Here's what you need to know:

You can add a contextual category to a bid list when creating or updating the bid list.
The bid line TTDContextualCategoryId value is not the same as the CustomCategoryId value returned by the Custom Category endpoints. It must be formatted for use in bid lists.
The Bid List endpoints ignore the custom category type specified for the custom category when it was created. Instead, be sure to set the bid line BidAdjustment property to 1 (target) or 0 (block).

To add a TTD contextual custom category to a bid list, follow these steps:

If you don't know your custom category ID, use the GET /v3/customcategory/advertiser/{advertiserId} to look it up.
Use the returned CustomCategoryId value as the path parameter in a GET /v3/customcategory/{customCategoryId} call, which returns the preformatted TTDContextualCategoryId value for the category.
Add the ttd-ct- prefix to the returned TTDContextualCategoryId value. For example, if the returned value is 123456, update it to ttd-ct-123456.
In a POST /v3/bidlist or PUT /v3/bidlist call, include the updated ID value with the prefix in the TTDContextualCategoryId bid line property.

Here's an example of a bid list request body snippet with an exclusion TTD contextual custom category included as a bid line with the bid adjustment set to 0 (block):

1
2
3
4
5
6
7
8
9
10
11
12
13
{
"Name": "CustomCategoryBidListTest",
"BidListAdjustmentType": "BlockList",
"ResolutionType": "ApplyMultiplyAdjustment",
"BidLines": [
{
"BidAdjustment": 0,
"TTDContextualCategoryId": "ttd-ct-123456"
}
],
"BidListOwner": "Advertiser",
"BidListOwnerId": "abcd1234"
}
FAQs

The following is a list of commonly asked questions about custom categories. See also the The Trade Desk's contextual targeting solution FAQs in the Knowledge Portal and Contextual Categories FAQs.

Does "TTD contextual" refer only to The Trade Desk contextual custom categories?

No. Even though this term is most commonly used with reference to The Trade Desk contextual custom categories, it may also refer to The Trade Desk contextual standard categories.

What happens if I have duplicate keywords in a category?

You will receive a validation error, and your category will not be created or updated.

IMPORTANT: Duplicate keywords might result from using different capitalization for the same words, spaces around key value strings, and special characters. For details, see Keyword Value Guidelines.

How can I tell how many keywords are in a category?

All Custom Category query endpoints, except GET /v3/customcategory/{customCategoryId}, return the number of keywords and phrases in the KeywordCount response property. The GET /v3/customcategory/{customCategoryId} endpoint returns a list of keywords.

How long does it take to process a newly created or updated category?

It takes up to three hours to process a category, and any bidding on inventory before the category is fully processed might result in not blocking webpages or apps with the specified keywords.

What happens if I assign categories in NotReady status to ad groups?

Assigning categories that are not processed yet to an ad group might result in unexpected bidding behavior.

IMPORTANT: We strongly recommend waiting until the category is live before enabling your ad groups, especially for exclusion categories (with the CustomCategoryType property value set to Block). It takes up to three hours to process a category, and any bidding on inventory before the category is fully processed might result in not blocking webpages or apps with the specified keywords.

Can I send a PUT request only with the keywords that I want to update?

No, you must send the whole list every time you update a category.

How do I apply TTD contextual custom categories to ad groups?

By including TTD contextual category IDs in bid lines of bid lists, which you then associate with ad groups when creating or updating ad groups. For details, see Include a TTD Contextual Custom Category in Bid Line.

What's the difference between the CustomCategoryId and TTDContextualCategoryId property values?

The CustomCategoryId value returned by the Custom Category endpoints. The TTDContextualCategoryId value is the formatted TTD contextual custom category ID intended for use in bid lists. For details, see Include a TTD Contextual Custom Category in Bid Line.

How do I target webpages by their URLs instead of their content?

By using the Direct URL Targeting Category endpoints. Be sure to contact your Technical Account Manager for access.

Troubleshooting
Why are webpages with the keywords that I expressly set to avoid get matched instead?

The following table provides possible solutions.

Possible Issue	Description	Solution
Category status	Your category might be still in NotReady status. It takes up to three hours to process a category, and any bidding on inventory before the category is fully processed might result in not blocking webpages or apps with the specified keywords.	Be sure to wait until the category is live before enabling your ad groups, especially for exclusion categories (with the CustomCategoryType property value set to Block).
Category and match type mismatch	The CustomCategoryType property to Block and the keyword MatchType property value to ExactAvoid. This allows bids on pages and apps that contain the specified keywords rather than blocking bids.	To block bidding on webpages or apps with certain keywords or phrases, change the CustomCategoryType property to Target. See the example after this table.

For example, with the following Block category, you bid only on content about cats and pets in general but won't bid on content about other specific pets. If you change the custom category type to Target, then you bid only on all webpages and apps that mention pets, but not cats. See also Keyword Matching Examples.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
{
"CustomCategoryName": "Pets",
"CustomCategoryType": "Block",
"Keywords": [
{
"Value": "cat",
"MatchType": "ExactAvoid",
"MatchApplication": "Similar"
},
{
"Value": "pets",
"MatchType": "ExactMatch",
"MatchApplication": "Similar"
}
],
"LanguageCode": "eng",
"AdvertiserId": "abcd1234",
"CustomCategorySourceType": "TTDContextualCategory"
}

---

# Geo-Interest Expansion for CTV

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/GeoInterestExpansion](https://partner.thetradedesk.com/v3/portal/api/doc/GeoInterestExpansion)

Geo-Interest Expansion for CTV

Geo-interest segments provide an ID-less audience targeting solution for CTV, where you target co-located people with potentially similar interests. For example, if you want to advertise to fast food lovers, you can build an audience in the platform to target those areas where there's interest in fast food.

Benefits

Here are some of the benefits of using geo-interest targeting:

To increase scale, use geo-interest targeting as a complement to the Identity Alliance household graph.
If you do not want to use hyper-personalized household targeting where you are targeting the individual household, use geo-interest segments to target multiple areas based on interest. This helps reduce customer frustration that may arise from 1:1 targeting.
Use geo-interest targeting as an additional targeting method for your existing campaigns.
How Geo-Interest Segments Are Created

To create geo-interest segments, The Trade Desk collects IP addresses from received bid requests, removes the last octet so they no longer correspond to a single household, and hashes the result into a geographical area code known as MCID, as shown in the following example.

Original IP Address	IP Address Without Last Octet	Area Code After Hashing (MCID)
102.89.159.92	102.89.159	18c74e02-a796-47ff-86ff-24b95bb7a25f"

Here's what The Trade Desk takes into consideration when creating geo-interest segments:
To determine the set of interests in each area, we look at the categories of sites visited by users in that area who have consented to our cookies. For example, Jessica is looking for a late-night bite and browses the website of her favorite fast-food restaurant. The Trade Desk classifies this website as fast food by using the standard TTD contextual taxonomy.
We also look at what other people in the area are interested in, and over time, we have a list of the top interests in the area.
We create a geo-interest segment for each interest category, and each segment maps to all the areas where users have those interests.

Here's what you need to know about geo-interest segments:
A single geo-interest segment can have multiple MCID area codes.
A single geographical MCID area code can be used in multiple interest segments.
The number of individuals in a geographical area varies depending on the population density of the area.
Geo-interest segments in the platform are refreshed daily.
Every geographical area has an MCID area code, and every MCID area code has a minimum threshold of people.
The platform has a geo-interest segment for each interest category and, behind the scenes, each segment maps to all the areas where users have those interests.

The following example illustrates a geo-interest segment that has multiple MCID area codes where fast food is a top interest category. On the left, the image shows a list of hashed MCIDs within the segment, while on the right, it shows a map of a geographical location with each point representing the area in which the MCIDs originated.

The following image provides a closeup of one of the MCIDs from the preceding image by illustrating how many people in this area are interested in fast food, which is the top interest in this location.



Set Up Geo-Interest Targeting

To target geo-interest segments, complete the following tasks.

Task	Endpoint or Further Reference	Notes
(Recommended) Set geo-interest targeting as your primary audience targeting strategy.	POST /v3/adgroup or
PUT /v3/adgroup	When you create or update an ad group, set the UseMcIdAsPrimary value to true.
Look up geo-interest data segments.	POST /v3/dmp/thirdparty/advertiser	Retrieve the third-party data ID of each geo-interest segment you want to use.
Include geo-interest segments in your audience.	Building Audiences	During audience creation, include the third-party data ID of the geo-interest segments you want to use in the ThirdPartyDataIds array of your audience data groups.
Set Geo-Interest Targeting as Your Primary Targeting Strategy

By default, ad groups that use geo-interest targeting can bid only on avails that other forms of audience targeting cannot reach. To enable an ad group with geo-interest targeting to bid on all avails, you need to set geo-interest as your primary audience targeting strategy.

For the best results, use geo-interest as the primary strategy in the following cases:

You're not using another form of audience targeting.
You're using a geo-based interest audience for the first time. (After you establish the maximum scale, you can always revert to the default behavior of geo-interest targeting. For details, see FAQs.)

To set geo-interest as your primary audience targeting strategy, in a POST /v3/adgroup or PUT /v3/adgroup call, set the RTBAttributes.AudienceTargeting.UseMcIdAsPrimary value to true as shown in the following code snippet.

1
2
3
4
5
6
7
8
9
10
11
12
{
"CampaignId":"t0ncimu",
"AdGroupName":"Strategy 1",
"AdGroupCategory":{
"CategoryId": 8311
},
"RTBAttributes":{
"AudienceTargeting":{
"UseMcIdAsPrimary": true
}
}
}

After you set geo-interest targeting as your primary strategy, look up the geo-interest segments that you want to include in your audience.

Look Up Geo-Interest Segments

To look up and retrieve a list of all geo-interest segments, in a POST /v3/dmp/thirdparty/advertiser call, include the following values:

In the BrandIds list, include ttdgeointerest as a value.
In the SearchTerms list, include Geo Interest Segments as a value.

TIP: To narrow your search, include additional search terms such as Beauty & Fashion.

1
2
3
4
5
6
7
{
"AdvertiserId": "lofgv9s",
"BrandIds": ["ttdgeointerest"],
"SearchTerms": ["Geo Interest Segments"],
"PageStartIndex": 0,
"PageSize": 10
}

A successful response returns a list of geo-interest segments with information such as the third-party data ID. The following code snippet is an example of a single geo-interest data segment returned in the response.

1
2
3
4
5
6
7
8
9
10
{
"ThirdPartyDataId": "10645207|ttdgeointerest",
"BrandId": "ttdgeointerest",
"BrandName": "Data Alliance",
"Name": "Accessories",
"FullPath": "Geo Interest Segments (beta) > Beauty & Fashion > Fashion > Accessories",
"Description": "Geo Interest Segments with eligible sites/apps classified in this category.",
"DevicesBrowsers30DayCount": 905000,
"UniqueUserCount": 665978000
}

When you are ready to create your audience, include the third-party data ID of each geo-segment you want to use in the data groups of your audience.

FAQs

The following is a list of commonly asked questions about geo-interest segments and targeting.

Are geo-interest segments different from geo segments?

Yes. Geo segments are used to target geographic areas, while geo-interest segments target co-located people with potentially similar interests, but not a specific area.

How is geo-interest targeting different from household targeting?

Household targeting works by targeting individuals in specific households based on IP addresses, whereas geo-interest segments target an entire area based on top interests in the area.

How do I revert to the default behavior of geo-interest targeting?

In a PUT /v3/adgroup call, set the UseMcIdAsPrimary value to false.

---

# Koa Optimizations

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/KoaOptimizations](https://partner.thetradedesk.com/v3/portal/api/doc/KoaOptimizations)

Koa Optimizations

IMPORTANT: This documentation explains how to use the Koa v3.5 API in Kokai. For details on using the Koa v3 API in Solimar, see Koa Optimizations (Solimar).

Optimizations are sets of bid dimensions and adjustments applied to ad groups to enhance the performance of your advertising campaigns. You can apply these optimizations manually or use Koa, the artificial intelligence that powers The Trade Desk platform, to generate them automatically. Applied optimizations are collected in bid lists.

Koa Optimizations is a machine-learning algorithm that works to achieve your goals by prioritizing spend on better-performing inventory and de-prioritizing spend on worse-performing inventory, using bid adjustments. In Kokai, the new Koa Optimizations feature offers dimension-level granularity, providing greater confidence, control, and flexibility.

Here's what you need to know about Koa Optimizations:

Koa Optimizations is off by default.
You can turn on Koa Optimizations for any combination of bid dimensions in ad groups while managing the remaining dimensions manually as needed.
When Koa Optimizations is on, Koa reviews ad group performance and automatically applies optimizations to the specified dimensions, approximately every two days.
If you manually apply bid adjustments to dimensions with Koa Optimizations enabled, both Koa-generated and user-created bid lists will be respected in the API. This is different from the UI where users must disable Koa Optimizations before manually applying bid adjustments to those dimensions.
For backward compatibility, the Koa v3 (Solimar) properties are returned in responses for Kokai ad groups. See also FAQs.

IMPORTANT: You must use only the new Koa v3.5 properties (KoaDimensions) to manage Koa Optimizations in Kokai. Using the Koa v3 properties can lead to a more complex integration and a degraded user experience.

Supported Bid Dimensions

The latest version of Koa Optimizations gives you singular control over the following eight bid dimensions: Ad Format, Geography, Site, Ad Environment, Device Type, Browser, OS, Fold Placement. Each dimension is represented by a Boolean value in the RTBAttributes.KoaOptimizationSettings.KoaDimensions object, which you can use to turn on or off the respective dimension when creating or updating ad groups. For example:

1
2
3
4
5
6
7
8
9
10
11
12
{
"KoaDimensions": {
"AdFormat": true,
"Geography": true,
"Site": true,
"AdEnvironment": false,
"DeviceType": true,
"Browser": false,
"OS": true,
"FoldPlacement": true
}
}

For details, see Managing Koa Optimizations.

Checking Potential Impact of Koa Optimizations

To help you stay informed and adapt to changes that Koa applies, the GET /v3/adgroup/koaapplieditems/{adGroupId} endpoint returns a PotentialImpact object, which includes the information on how optimizations recommended by Koa benefit the specified ad group and affect its goal performance and potential spend.

The following table explains the potential impact data.

Parameter	Description
GoalPerformancePercent	The expected percentage change in goal performance.
IsGoalImprovement	Indicates whether the GoalPerformancePercent value is a goal improvement.
SpendPercent	The percentage change impact that Koa expects the recommended optimizations to have on potential spend. When using Koa v3.5 this value will always be zero.
GeneratedOn	The date when the PotentialImpact data was generated.

Any features, user settings, or ad group performance data that may be negatively affecting Koa's ability to generate optimal strategies are indicated in the UpdateAttemptDetails and IncompatibleFeatures properties of the GET /v3/adgroup/koaapplieditems/{adGroupId}. For an example, see Retrieve Applied Koa Optimizations.

Managing Koa Optimizations

The following table lists all tasks that you might need to perform when managing optimizations applied or recommended by Koa.

Task	Endpoint	Notes
Verify the Koa Optimizations API version.	GET/adgroup/{adGroupId}	Check the value of KoaOptimizationsVersion property value.
Turn on Koa Optimizations for specified bid dimensions.	POST /v3/adgroup
PUT /v3/adgroup	IMPORTANT: To avoid unintended complex integrations and degraded experience, do not use the Koa v3 properties such as IsEnabled and OptionalDimensions to manage the Koa Optimizations settings, even if they are returned in responses for backward compatibility. Instead, use only the KoaDimensions object.
Retrieve applied optimizations for an ad group.	GET /v3/adgroup/koaapplieditems/{adGroupId}	Use the returned PotentialImpact object to interpret the benefits of the applied optimizations.
Turn off Koa Optimizations for an entire ad group or specified bid dimensions.	POST /v3/adgroup
PUT /v3/adgroup	IMPORTANT: To avoid unintended complex integrations and degraded experience, do not use the Koa v3 properties such as IsEnabled and OptionalDimensions to manage the Koa Optimizations settings, even if they are returned in responses for backward compatibility. Instead, use only the KoaDimensions object.
Verify the Koa Optimizations Version

You may not apply different Koa Optimizations version settings, such as v3 and v3.5 settings. Koa endpoints return an error when there is a version mismatch. To confirm the Koa version and to use the correct APIs, check the value of the KoaOptimizationsVersion and KoaOptimizationsMinorVersion properties in your ad groups. For example, a GET/adgroup/{adGroupId} call might return the following response.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
{
"AdGroupId":"cbgb9681",
"RTBAttributes":{
"KoaOptimizationSettings":{
"KoaDimensions":{
"AdFormat": true,
"Geography": true,
"Site": true,
"AdEnvironment": false,
"DeviceType": true,
"Browser": false,
"OS": true,
"FoldPlacement": true
},
"IsEnabled":true,
"OptionalDimensions":[
"HasAdFormatId",
"HasGeoSegmentId"
],
"IsBiddingUpEnabled":true
},
"KoaOptimizationsVersion":"V3",
"KoaOptimizationsMinorVersion": "5"
}
}

Note that the sample response also includes the Koa v3 properties, such as IsEnabled, OptionalDimensions, and IsBiddingUpEnabled, for backward compatibility.

KoaOptimizationsVersion and KoaOptimizationsMinorVersion are read-only properties that in conjunction indicate the version of Koa used to apply optimizations, if there are any, to the ad group. The following table explains their values.

Koa Optimizations Version Value	Koa Optimizations Minor Version Value	Description
None	None	The ad group is not using Koa for optimizations.
V3	0	The ad group is using Koa version 3 for optimizations. See Koa Optimizations (Solimar) for the Solimar experience.
V3	5	The ad group is using Koa version 3.5 for optimizations. Continue using this documentation.
Turn On Koa Optimizations

IMPORTANT: You must use only the new Koa v3.5 properties (KoaDimensions) to manage Koa Optimizations in Kokai. Using the Koa v3 properties can lead to a more complex integration and a degraded user experience.

Here's what you need to know about the KoaDimensions property when creating or updating an ad group in Kokai:

Each dimension is represented by a Boolean value. To turn on Koa Optimizations for a dimension, set its value to true.
To turn off Koa Optimizations for a dimension, set its to false or omit it from the list. See also Turn Off Koa Optimizations.
If you omit the entire object in your request, all optional dimensions will be disabled.

To apply Koa Optimizations to an ad group, in a POST /v3/adgroup or PUT /v3/adgroup request, in KoaOptimizationSettingsobject, include the KoaDimensions with the properties of bid dimensions that you want optimized set to true.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
{
"AdGroupId":"cbgb9681",
"RTBAttributes":{
"KoaOptimizationSettings":{
"KoaDimensions":{
"AdFormat": true,
"Geography": true,
"AdEnvironment": false,
"DeviceType": true,
"Browser": false,
"OS": true,
"FoldPlacement": true
}
}
}
}
Retrieve Applied Koa Optimizations

To get the list of Koa optimizations currently applied to an ad group, in a GET /v3/adgroup/koaapplieditems/{adGroupId} call, specify the ad group ID as the path parameter.

Here's an example of a GET /v3/adgroup/koaapplieditems/{adGroupId} response, which includes a list of applied optimizations as well as the details about the latest update attempt and any features or user settings (IncompatibleFeatures) that may have affected the generation of optimal strategies.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
49
50
51
52
53
54
55
56
57
58
59
60
61
62
63
64
65
{
"PotentialImpact": {
"GoalPerformancePercent": 23.0,
"IsGoalImprovement": true,
"SpendPercent": 0.0,
"GeneratedOn": "2024-04-26T04:40:44.127"
},
"Optimizations": [
{
"DimensionValues": {
"HasDomainFragmentId": "nbc.com"
},
"VolumeControlPriority": "Neutral",
"BidAdjustment": 2.0000,
"KoaOptimizationId": 25
},
{
"DimensionValues": {
"HasDomainFragmentId": "abc.com"
},
"VolumeControlPriority": "Neutral",
"BidAdjustment": 1.5000,
"KoaOptimizationId": 26
},
{
"DimensionValues": {
"HasAdFormatId": "Micro Bar (88x31)"
},
"VolumeControlPriority": "One",
"BidAdjustment": 2.0000,
"KoaOptimizationId": 16
},
{
"DimensionValues": {
"HasDeviceTypeId": "Digital Out Of Home"
},
"VolumeControlPriority": "Neutral",
"BidAdjustment": 1.2500,
"KoaOptimizationId": 27
},
{
"DimensionValues": {
"HasGeoSegmentId": "USA"
},
"VolumeControlPriority": "Neutral",
"BidAdjustment": 1.7500,
"KoaOptimizationId": 28
},
{
"DimensionValues": {
"HasDeviceTypeId": "Roku"
},
"VolumeControlPriority": "Neutral",
"BidAdjustment": 1.7500,
"KoaOptimizationId": 29
}
],
"UpdateAttemptDetails": {
"NoOptimizationsReasonId": "NotEnoughKpiEvents",
},
"OptimizationMode": "None",
"IncompatibleFeatures": [
"PacingASAP"
]
}
Turn Off Koa Optimizations

To turn off Koa Optimizations for all dimensions in an ad group, in a POST /v3/adgroup or PUT /v3/adgroup request, include an empty KoaOptimizationSettings object, as shown in the following example.

1
2
3
4
5
6
7
{
"AdGroupId":"cbgb9681",
"RTBAttributes":{
"KoaOptimizationSettings":{
}
}
}

TIP: To turn off Koa Optimizations for specific dimensions in an ad group, in the KoaDimensions object, set dimensions for which you want to turn off Koa Optimizations to false or omit them from the list.

The following examples show an ad group in which Koa Optimizations is turned off for all dimensions, except Geography.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
{
"AdGroupId":"cbgb9681",
"RTBAttributes":{
"KoaOptimizationSettings":{
"KoaDimensions":{
"AdFormat": false,
"Geography": true,
"Site": false,
"AdEnvironment": false,
"DeviceType": false,
"Browser": false,
"OS": false,
"FoldPlacement": false
}
}
}
}
1
2
3
4
5
6
7
8
9
10
{
"AdGroupId":"cbgb9681",
"RTBAttributes":{
"KoaOptimizationSettings":{
"KoaDimensions":{
"Geography":true
}
}
}
}
FAQs

The following is a list of commonly asked questions about Koa Optimizations.

How can I tell if Koa Optimizations is on for an ad group?

In Kokai, Koa Optimizations settings are configured at the dimension level rather than the ad group level. To check if the Koa Optimizations is enabled for any dimensions, query the ad group and check if the RTBAttributes.KoaOptimizationSettings.KoaDimensions object is present. For details, see Turn On Koa Optimizations.

If Koa is off by default, does that mean that my campaigns are not being optimized?

In Kokai, Koa functions as an augmentative, optional feature. To direct volume and bids toward inventory most likely to drive your ad group KPIs, you can apply optimizations manually or use Koa to generate them automatically. This is in addition to the platform's algorithms that automatically optimize your campaigns.

What happens if I omit a dimension from the KoaDimensions object in my request?

Whichever dimensions you exclude from the KoaDimensions object, Koa Optimizations will be turned off for those dimensions. If you pass an empty KoaDimensions object, Koa Optimizations will be turned off for all dimensions in the ad group. For more details and examples, see Turn Off Koa Optimizations.

What happens if I omit the KoaDimensions or KoaOptimizationSettings objects from my request?

For most advertisers, if you exclude the KoaDimensions or KoaOptimizationSettings objects from your request, Koa Optimizations will automatically be disabled for all ad group dimensions. However, for advertisers in certain industries—such as Careers, Medical Health, Personal Finance, and Real Estate—Koa Optimizations will be enabled by default for all dimensions except Site.

I thought Koa Optimizations was off by default for newly created ad groups. Why do I see it enabled?

While Koa Optimizations is off by default for new ad groups, there is an exception for certain industries. If a new ad group belongs to certain categories like Careers, Medical Health, Personal Finance, or Real Estate, Koa Optimizations is automatically enabled for all dimensions except Site. This is part of the platform's default behavior to optimize for specific advertiser categories in different geographies.

Can I check how effective optimizations are?

You can check the expected, not actual, impact of Koa Optimizations on ad group goal performance and potential spend at any time. For details, see Checking Potential Impact of Koa Optimizations.

How often does Koa generate and apply optimizations?

Approximately every two days.

Which Koa properties are intended to be used only in Solimar?

The Koa v3 properties intended to be used to manage Koa Optimizations only in Solimar include the following:

IsEnabled
OptionalDimensions
IsBiddingUpEnabled

IMPORTANT: To manage Koa Optimizations in Kokai, you must use only the new Koa v3.5 properties (KoaDimensions). Using the Koa v3 properties can lead to a more complex integration and a degraded user experience.

Can I use the IsEnabled property to turn Koa Optimizations on and off in Kokai?

No. The IsEnabled is a Koa v3 property not intended to be used in Kokai. To turn on and off Koa Optimizations in Kokai and to avoid confusion, be sure to use only the KoaDimensions object. For details, see Managing Koa Optimizations.

What's the difference between the OptionalDimensions and KoaDimensions objects?

The following table summarizes the differences between the two objects.

Property	Experience	Koa Version	Notes
KoaDimensions	Kokai	v3.5	This property enables you to turn on and off Koa Optimizations for all supported bid dimensions in Kokai.
OptionalDimensions	Solimar	v3	This property enables you to turn on Koa Optimizations only for the Ad Format and Geography bid dimensions that are optional in Solimar.

IMPORTANT: To avoid confusion and unintended optimizations, use only the KoaDimensions object in Kokai.

What happens to the Koa Optimizations settings after Solimar campaigns are upgraded to Kokai?

By default, during the upgrade, all campaigns are upgraded to Koa v3.5 and Koa Optimizations is turned off. For details, see Upgrade Solimar Campaigns to Kokai. The only exception is the campaigns with sensitive categories. For those campaigns, the following changes apply:

If all dimensions were off in Solimar, we turn on all dimensions except for the Site dimension.
If only some dimensions were on in Solimar, we keep these settings on and turn off only the Site dimension if it was on.
Can I use GraphQL to turn on Koa Optimizations?

Not yet. We're actively expanding GraphQL API capabilities by delivering new features incrementally. We encourage you to check for updates as we roll out new functionality and enhancements. We greatly appreciate your patience and feedback as we continue to improve your experience.

---

# Predictive Clearing: Win More Impressions with Lower CPMs

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/PredictiveClearing](https://partner.thetradedesk.com/v3/portal/api/doc/PredictiveClearing)

Predictive Clearing: Win More Impressions with Lower CPMs

Predictive Clearing enables you to win more impressions at a lower cost per mille (CPM) while optimizing ad spend and improving campaign performance. When you turn on Predictive Clearing, you enable Koa to analyze historical clearing prices to find a lower, optimal bid for each impression served in a first-price auction.

Here are some key terms that you need to be familiar with to understand the Predictive Clearing workflow.

Term	Definition
First-price auction	An auction in which the winning bidder pays the bid amount, no matter how much higher it is than the second-highest bid. Compare with a second-price auction, in which the winning bidder pays the amount of the second-highest bid plus one cent.
Clearing price	The amount paid by the winning bidder.
Win rate	The percentage of impressions won, calculated using the following formula:
(Number of impressions won / Number of impressions bid on) x 100

Predictive Clearing enables Koa, The Trade Desk AI, to analyze historical clearing prices and win rates across first-price auctions to select the optimal bid for each impression. Koa analyzes historical data around SSPs, publishers, sites, ad format, and how much the inventory is worth to other advertisers. This ensures that you (the advertiser) continue to win bids, but at the lowest price needed to win.

For example, you make an original bid of $5.50. Koa analyzes historical data and adjusts your bid to $3.50 before it is submitted. You win the auction and save $2.00 on the impression, which is over 36% of your original bid of $5.50.

Turn on Predictive Clearing

To ensure that your winning bids in first-party auctions have the lowest possible CPM, turn on Predictive Clearing. Here's what you need to know:

Predictive Clearing optimizes your winning bids only in first-price auctions.
You turn on Predictive Clearing for ad groups.
In the platform API, the default value for PredictiveClearingEnabled is false. In the platform UI, Predictive Clearing is turned on automatically for all ad groups.
You can see how much you saved with Predictive Clearing only in platform UI. For details, see View Predictive Clearing Reporting in the Knowledge Portal.

To turn on Predictive Clearing, in a POST /v3/adgroup or PUT /v3/adgroup call, set the PredictiveClearingEnabled property to true as shown in the following ad group code snippet. For a complete example with all required ad group properties, see Create an Ad Group.

1
2
3
4
5
{
"CampaignId": "t0ncimu",
"AdGroupName": "Retargeting",
"PredictiveClearingEnabled": true
}
FAQs

The following is a list of commonly asked questions about Predictive Clearing.

Does Predictive Clearing work for second-price auctions?

No. Predictive Clearing optimizes bids only in first-price auctions.

Can I see how much I saved from using Predictive Clearing?

Yes. You can run the report that has the Predictive Clearing metric in the platform UI. Be sure to select the Predictive Clearing metric. For details, see View Predictive Clearing Reporting in the Knowledge Portal.

Can I run a report for Predictive Clearing savings in the API?

No. You can run the report that has the Predictive Clearing metric only in the platform UI. Be sure to select the Predictive Clearing metric. For details, see View Predictive Clearing Reporting in the Knowledge Portal.

Do I need to change my bid strategy if I turn on Predictive Clearing?

No. You can bid as usual, and after you win an auction, Predictive Clearing makes adjustments to see if you can still win the auction with a lower CPM than what you originally bid.

Can Predictive Clearing lower my win rate?

Yes. Since Predictive Clearing lowers your original bid, it is possible for Predictive Clearing to also lower your win rate. However, even if you have a lower win rate, you still have a high chance of winning the auction.

---

# Bid Lists

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/BidList](https://partner.thetradedesk.com/v3/portal/api/doc/BidList)

Bid Lists

Bid lists are sets of bid dimensions and adjustments applied to ad groups to enhance the performance of your advertising campaigns. Each bid list is comprised of bid lines that define targeting, blocking, and bid factors based on shared dimensions (also known as vectors) including site, geography, and ad format. Unlike other entity relationships, bid lists can be owned by and associated with partners, advertisers, campaigns, or ad groups, and can be enabled or disabled as needed.

Terms and Definitions

The following table defines key terms used for bid lists.

Term	Definition
Bid list	A collection of bid lines with the same dimensions. It is used to target, block, or apply optimizations to adjust the base bid of an ad group. For example, a bid list might include bid lines that target specific domains or geographic locations. Bid list names typically describe the dimension and adjustment type, such as "Site/App Target List".
Bid line	A component of a bid list used in digital advertising to adjust an ad group's base bid based on specific criteria. Each bid line consists of dimensions and bid factors. For details, see bid factors.
Dimension	A specific attribute or data point used to categorize, filter, or analyze audiences, campaigns, or inventory. It serves as a parameter for targeting, helping advertisers define who sees an ad. For example, you can target users based on a geographical dimension or a device dimension.
Bid lists can be either single- or multi-dimensional.
Bid factor	A multiplier applied to your base bid to adjust the value placed on specific dimensions, such as location, device type, or audience segment.
Bid adjustment type/bid list type	The method for controlling bidding strategies by aligning adjustments with specific criteria for each impression. It establishes rules for modifying bids, including allowing or denying participation in bidding or applying specific adjustments based on predefined dimensions.
Bid list owner	The entity that owns a bid list, such as the partner, advertiser, campaign, or ad group. This ownership determines who can use and manage the bid list. Owning does not automatically associate or enable the bid list for use. For details, see Ownership.
Resolution type	The method for resolving multiple bid factors when an impression matches more than one bid line within the same bid list. Typically, this is done by multiplying bid factor values.
Bid Factors

To manage bid expressiveness and add value to your campaigns, set bid factors to increase or decrease bids dynamically. For example, setting a higher bid factor means you value an impression highly and are willing to pay more for it. This increases your chances of winning and leads to more volume.

Bid factors indicate the value and performance of the bid lists rather than their pricing. To reflect how users value impressions, the base bid can be multiplied using these bid factor examples:

0 to block bidding
0.5 indicates that impressions with a dimension matching this attribute are half as valuable (indicating you want fewer like this and would pay less for it)
1 to bid at the base bid price
1.25 indicates that impressions with a dimension matching this attribute are 25% more valuable (indicating you want more like this and would pay more for it)

To lower the value of a bid, decrease the bid factor. This strategy is useful if you want to de-prioritize certain publishers. On the other hand, to indicate high value, increase the bid factor to more than 1. For example, use a bid factor of 1.25 for users in a specific city or on a preferred device where performance is stronger.

To inform the bid price, these adjustments are factored in using our AI-driven algorithms, alongside metrics like KPI, relevance, and pacing. The final bid price is calculated based on this value but won't exceed the ad group's maximum bid. When pacing is on track, bid prices align with value influenced by the adjustments, impacting both volume and bid price direction.

Anatomy of a Bid List

A bid list is a collection of bid lines with the same dimensions. For example, the following diagram shows a campaign bid list with two example bid lines. Each bid line contains a domain fragment for the dimension and a bid factor. The bid list adjustment type is optimized with the resolution type of "Apply Multiply Adjustment," indicating matching bid factors are multiplied for the final adjustment. When activated (meaning it is associated and enabled), this bid list applies to the campaign and its ad groups. For details, see Bid List Relationships.

The following sections explore differences between using GraphQL and the REST APIs, entity relationships, and association and inheritance limitations.

Workflow

After you understand the relationships between the entities and leverage them for maximum efficiency, managing bid lists becomes straightforward. You can manage bid lists for ad groups individually by creating a bid list for each, or uniformly by leveraging a single bid list at a parent entity level. To account for variations, you can set the bid list adjustment type to block unwanted domains within individual ad groups without editing parent bid lists.

There are two key steps in the process of manually creating bid lists:

Create a bid list. This includes defining the correct level of ownership and key properties, such as bid factors.
Activate the bid list by associating and enabling it for its owner or descendants. The bid list activation propagates to any descendants. For example, bid lists activated for an advertiser automatically apply to all new campaigns and ad groups.

When The Trade Desk receives bid requests from publishers and SSPs, we do the following:

We match bid requests to bid lists and eligible ad groups.
For each matching line in the bid list, we multiply the base bid with the bid factor and determine the final adjustment using the bid list resolution type.
We calculate the final bid by multiplying the base bid for the ad group by its associated bid lists, bid factors, KPIs, relevance factors, pacing, and other signals.
What You Need to Know

Here's what you need to know about bid lists:

The ability to create a bid list requires permissions at the level of creation. For example, to create a partner-level bid list, you need partner-level permissions.
For target and block lists, a bid list is treated as a filter or restriction for your ad group. The more bid lists you apply, the fewer impressions are eligible for your bids because all requirements must be met.
Simply owning a bid list doesn't mean it's being used. To activate a bid list, associate it with the desired entity and enable it for the owner or a descendant.
Ad group bid lists override advertiser bid lists of the same type. For the purposes of your spend, the platform acts only on ad group bid lists, whether those are advertiser default bid lists inherited from the advertiser or bid lists created for that ad group.
When you edit an existing list, those changes are also applied to that list as inherited by the entity’s descendants. For details, see Inheritance.
Bid lists, whether created manually or generated through Koa Optimizations, respect both manual and Koa-generated adjustments.
GraphQL vs. REST

When it comes to managing bid lists, both GraphQL and REST APIs offer distinct advantages. For example, bid list cloning is only available through GraphQL.

The following table compares the bid list actions supported by each API. For a general comparison of our platform APIs, see Platform API: REST and GraphQL.

Action	GraphQL	REST
Create a bid list.	Supported	Supported
Clone a bid list.	Supported	Not supported
Associate a bid list.	Supported	Supported
Enable a bid list.	Supported	Supported
Look up a bid list.	Supported	Supported
Update a bid list.	Supported	Supported
Delete a bid list.	Not supported	Supported
Create or update multiple bid lists at once.	Not supported	Supported. Use batch requests.
Make bid adjustments.	Supported. Use these options:
INCLUSION
EXCLUSION
OPTIMIZED
Supported. Use these options:
TargetList
BlockList
Optimized
Bid List Relationships

Bid lists can be owned, associated, and inherited at various entity levels, including the partner, advertiser, campaign, and ad group. The following sections provide detailed information on each relationship and their specific uses.

IMPORTANT: There are limits to the number of bid lines owned by or associated with an entity. For details, see Relationship Limits.

Ownership

A bid list must have a single owner: a partner, advertiser, campaign, or ad group. Designating an owner allows the bid list to be propagated to its descendants, making it available for their use. For example, choosing a campaign as the owner of a bid list means that the campaign can share the bid list with its ad groups through association and inheritance, simplifying bid list management. On the other hand, selecting an ad group as the owner means the bid list is only available to that specific ad group and not to other ad groups within the campaign, other campaigns, or other advertisers.

NOTE: The Trade Desk also supports global bid lists, like our global block list, but they are not included in this guide because they are managed by our marketplace quality team and not by entities in your advertising campaign. To see available global lists that you can associate, use POST /v3/bidlistsummary/query/global.

Here's what you need to know about owning bid lists:

Ownership determines other bid list relationships, such as associations with and inheritance by its descendants.
Owning a bid list does not automatically associate or enable a bid list for the owner or its descendants. You must associate and enable bid lists explicitly. For details, see Association.

The following diagram shows bid-list ownership across different entity levels. Each entity can own many bid lists.

Association

For specific bid list adjustments to be applied, you must associate and enable bid lists for either the owner entity or a descendant for which the bid factors are intended. For details, see Workflow.

The following table lists the entities a bid list can be associated with based on its ownership. For example, a bid list owned by an advertiser can be associated only with that advertiser or one of its descendants (the campaigns and ad groups that the advertiser owns). The bid list cannot be associated with the parent partner or any other advertisers or their campaigns.

Bid List Owned By
Bid Lists Can Be Associated With	Partner	Advertiser	Campaign	Ad Group
Partner	Owning Partner Only	No	No	No
Advertiser	Yes	Owning Advertiser Only	No	No
Campaign	Yes	Yes	Owning Campaign Only	No
Ad Group	Yes	Yes	Yes	Owning Ad Group Only

TIP: As bid list associations at the campaign or advertiser level are not visible in the UI, it is a best practice to associate bid lists at the ad group level.

The following diagram shows bid list association relationships at different entity levels. For example, a campaign-owned bid list can be associated only with that campaign or its ad groups, not with advertisers or partners.

NOTE: Bid lists cannot be associated with and enabled for more than one entity type within the same relational tree. For example, a partner-owned bid list cannot be associated with and enabled for both a campaign and an ad group within that campaign.

Inheritance

To avoid needing to recreate, associate, and activate bid lists at multiple levels, entities and their descendants can inherit bid lines and bidding rules based on ownership. The following diagram shows bid-list inheritance relationships at different entity levels. For example, a campaign has its own bid lists while also inheriting bid lists from its parent entities, the partner and advertiser. This ensures that the campaign has the same associated and enabled bid lists as its parents without needing individual bid list activation at the campaign level.

Relationship Limits

There are limits to the number of bid lines owned by or associated with each ad group, advertiser, or partner.

TIP: To use bid lines efficiently, create bid lists at a parent-level entity that can be shared and inherited by the descendants.

Entity Type	Maximum Number of Bid Lines	Bid Lines Counted Toward Limit
Partner	20,000,000	Bid lines in bid lists owned by a partner, including its advertisers, campaigns, and ad groups.
Advertiser	5,000,000	Bid lines in bid lists owned by an advertiser, including its campaigns and ad groups.
Campaign	No campaign limit	While there are no bid line limits for campaign-owned bid lists, these bid lines still count toward advertiser and partner limits.
Ad group	10,000	This limit applies to bid lines in ad-group owned bid lists associated with the ad group. Unassociated ad-group owned bid lists only apply to advertiser and partner limits.

Exceeding bid line limits will cause bid list creation or updates to fail. The following limitations also apply:

These limitations do not apply to bid lists automatically generated by Koa. Manually created bid lists using Koa do count toward bid line limits.
To verify which bid lines are owned by an entity, use a GraphQL query or the POST /v3/bidlistsummary/query/{entity}/available endpoint in REST.
Bid lines within bid lists count toward partner and advertiser bid line limits until the bid list is deleted using the DELETE /v3/bidlist/{bidListId} endpoint.
FAQs

The following is a list of frequently asked questions about bid lists.

How is the final bid for an ad group determined?

When a bid request is received, the final bid is calculated by multiplying the base bid with the bid factors from the various bid lists associated with the ad group, along with other signals like KPIs, relevance factors, and pacing. However, it won’t exceed the ad group’s maximum bid. For example, including a block list sets the bid factor to 0, resulting in a $0 bid for the ad group regardless of other bid factors, effectively preventing bidding.

I created a bid list for an entity, but how do I turn it on?

After creating a bid list, you need to also associate and enable it for the owner or its descendant. This includes setting the isEnabled property to true.

How do I handle multiple bid list matches?

If an impression matches multiple bid lists, their adjustments apply. Target and block lists are restrictive: if an impression does not match a target list, or it matches a block list, it receives a bid factor of 0, overriding all other adjustments.

How do I resolve multiple bid line matches in a single bid list?

When an impression matches multiple bid lines in the same bid list, the final adjustment is determined by the bid list resolution type.

IMPORTANT: If you're using the target or block list bid adjustment type, you must set the resolution type to multiply bid factors from a bid list to calculate the final adjustment. It's recommended, but not required, for optimized lists.

An impression can match multiple bid lines in a few dimensions:

DomainFragment - An impression could match multiple sites or apps if the list includes both domains and subdomains.
GeoSegmentId - An impression for a geographical area could match multiple lines if it falls into different area types (country, state, region, city).
RecencyWindowInMinutes - If the bid list contains overlapping ranges, an impression could match multiple lines for recency. Avoid setting up overlapping ranges.
TemperatureRangeInCelsius - If the bid list contains overlapping ranges, an impression could match multiple lines for temperature. Avoid setting up overlapping ranges.
FrequencyTarget - If the bid list contains overlapping ranges, an impression could match multiple lines for frequency.
When creating a bid list with more than 1000 bid lines in GraphQL, I get a token limit error. How should I resolve this?

For better performance and stability, GraphQL restricts the number of tokens that can be included in a request. To manage token usage efficiently, use variables as a workaround.

The following code example shows a bidListCreate mutation that passes a BidLineCreateInput object using a $bidLines variable. Though only one bid line is shown, this method supports adding more than 1000 bid lines to the $bidlines variable, minimizing the risk of exceeding token limits.

1
2
3
mutation BidListCreate($bidLines: [BidLineCreateInput!]!) {
bidListCreate(input: {bidLines: $bidLines})
}

The corresponding variable is:

1
2
3
{
"bidLines":[{"domainFragment": "example.com"}]
}

For details on the error, see GraphQL API Errors and Complexity Limits.

---

# Create and Manage Bid Lists in GraphQL

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/BidListsCreateManageGQL](https://partner.thetradedesk.com/v3/portal/api/doc/BidListsCreateManageGQL)

Create and Manage Bid Lists in GraphQL

This guide walks you through the process of creating and updating bid lists in GraphQL, including defining their key properties and propagating them to associated campaigns and ad groups. You can either create bid lists from scratch or by cloning an existing list. Bid lists can then be owned and assigned at various levels within the core entities, including partner, advertiser, campaign, and ad group. To activate a bid list, associate and enable it for its owner or a descendant.

You can also use GraphQL to look up the data you need, especially for complex data requirements or when consolidating multiple queries into a single request.

TIP: If you are new to GraphQL, check out our GraphQL API Resource Hub and familiarize yourself with the basics.

To learn more about bid list terms and relationships, see Bid Lists. For instructions on using our REST API, see Create and Manage Bid Lists in REST.

Bid lines can be single- or multi-dimensional. This guide focuses on single-dimensional bid lines. To learn more about creating bid lists with multi-dimensional bid lines, see Multi-Dimensional Bidding.

Requirements and Guidelines

Here's what you need to know before making GraphQL calls for bid lists:

A bid list must contain at least one bid line.
If you try to create a bid list with bid lines of different dimensions, you will get a validation error (the bid list won't be created in that state). For example, if one bid line uses the DomainFragment dimension while another uses the GeoSegmentId dimension, it can lead to errors.
Some dimensions use third-party providers and might incur additional fees.
The number of bid lines may not exceed bid line relationship limits. To avoid needing to recreate bid lists at different levels, be sure to leverage inheritance. For details, see Inheritance.
The adjustment type and bid adjustment values must match. For details, see Adjustment Types.
The default resolution type is APPLY_MULTIPLY_ADJUSTMENT, which multiplies bid adjustments from a bid list to calculate the final bid adjustment. It is required for inclusion and exclusion lists and recommended for optimized lists.
To streamline the management of bid lists across multiple campaigns and ad groups, use default bid lists.

TIP: To create, look up, or update multiple bid lists at once, you can use batch requests through the REST API.

The following sections provide examples of bid list mutations and queries for creating, managing, and retrieving bid list information. For basic terms and definitions, see Bid Lists.

Adjustment Types

When creating a bid list, choose an adjustment type to determine bid adjustments based on bid line matches. Inclusion and exclusion lists allow and deny bidding based on specified dimensions. Optimized lists allow you to set bid adjustments when the request matches the bid lines.

The following table outlines the different types of bid list adjustments available.

Adjustment Type	Description	Bid Adjustment for Matched Bid Lines	Bid Adjustment for Non-Matched Bid Lines
INCLUSION	Includes the ad group in bidding without any bid adjustment when the request matches the bid lines.	1	0
EXCLUSION	Excludes the ad group from bidding when the request matches the bid lines.	0	1
OPTIMIZED	An optimized list can do the following:
When requests match bid lines, apply bid adjustments using decimals to ad groups, unlike inclusion or exclusion lists which are limited to 0 or 1.
Use the resolution type to determine the final bid adjustment when an impression matches multiple bid lines.
Allow bids for impressions that do not match any bid line.
Value specified	1
Create Bid Lists

To create a bid list in GraphQL, you can use the bidListCreate mutation and manually define its bid lines and key properties, including the dimensions and bid list adjustment type. To quickly create a bid list based on an existing one for a new owner, use the bidListClone mutation instead. For details, see Clone Bid Lists for New Owners.

TIP: To be efficient and stay within bid line relationship limits, instead of creating new bid lists, you can associate and enable bid lists for parent-level entities. This allows bid lists to be inherited across descendants like ad groups for greater impact.

Examples

The following are some common GraphQL mutation examples for creating bid lists, illustrating how to include or exclude impressions based on dimensions such as domain and video playback type.

Create a Bid List Based on Domains

The following GraphQL mutation example creates a bid list owned by an ad group that excludes impressions from the domains domainToExclude.com and otherDomainToExclude.com. The mutation returns the ID of the created bid list.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
mutation {
bidListCreate(
input: {
name: "BID_LIST_NAME_PLACEHOLDER",
dimensions: [HAS_DOMAIN_FRAGMENT_ID],
adjustmentType: EXCLUSION,
bidLines: [
{
bidAdjustment: 0,
volumeControlPriority: NEUTRAL,
domainFragment: "domainToExclude.com"
},
{
bidAdjustment: 0,
volumeControlPriority: NEUTRAL,
domainFragment: "otherDomainToExclude.com"
}
],
owner: { adGroupId: "ab1c23de" }
}
) {
data {
id
}
userErrors {
field
message
}
}
}
Create a Bid List Based on Video Playback Types

The following GraphQL mutation example creates a bid list owned by an ad group that targets CTV and video impressions specifically for "pre-roll" or "accompanying content" video playback types. The mutation returns the ID of the created bid list.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
mutation {
bidListCreate(
input: {
name: "BID_LIST_NAME_PLACEHOLDER",
dimensions: [HAS_VIDEO_PLAYBACK_TYPE_ID],
adjustmentType: OPTIMIZED,
bidLines: [
{
bidAdjustment: 1.5,
volumeControlPriority: NEUTRAL,
videoPlaybackType: PRE_ROLL
},
{
bidAdjustment: 2,
volumeControlPriority: NEUTRAL,
videoPlaybackType: ACCOMPANYING_CONTENT
}
],
owner: { adGroupId: "ab1c23de" }
}
) {
data {
id
}
userErrors {
field
message
}
}
}
Clone Bid Lists for New Owners

To quickly create a bid list based on an existing one for a new owner, use the bidListClone mutation. The original bid list remains unchanged, and the new bid list is automatically associated with and enabled at the new owner's entity level. Cloning counts toward the new owner's bid line relationship limits.

NOTE: You cannot update fields in the bidListClone mutation. After you have created the clone, use the AssociateBidList and bidListUpdate mutations to modify the cloned bid list. For details, see Associate Bid Lists and Update Bid Lists.

Example

The following bidListClone mutation clones a bid list and assigns it to a new owner (in this case, an ad group).

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
mutation {
bidListClone(
input: {
id: "BID_LIST_ID_PLACEHOLDER",
newOwner: {adGroupId: "NEW_OWNER_AD_GROUP_ID_EXAMPLE"}
}
) {
data {
id
}
userErrors {
field
message
}
}
}
Associate Bid Lists

Simply owning a bid list doesn't mean it's being used in bidding. You must activate bid lists. This means you must associate a bid list with a partner, advertiser, campaign, or ad group, and then enable them for their owner or its descendants. Here's what you need to know:

You can add, remove, and update the enabled status of multiple bid lists in a single call. In this context, "add" and "remove" means add to and remove from the association list.
You cannot associate a bid list with an entity if it's already associated to an ancestor. For check associations and other details, see Bid List Queries.
Make sure an ancestor owns the bid list, rather than a peer. For example, you cannot associate a bid list owned by an ad group with another ad group. For details, see Association.
To avoid disabling the bid list and potential validation issues in ad group calls, set the IsEnabled property to true for the associated bid list.
If you are using default bid lists, make sure only one bid list has the IsDefault property set to true for the same dimension combination and bid list type at the ad group level.

TIP: As bid list associations at the campaign and advertiser level are not visible in the UI, it is a best practice to associate bid lists at the ad group level.

Example

The following AssociateBidList mutation example adds and updates a bid list in the bidListsToAddOrUpdate array and removes an unwanted one in the bidListIdsToRemove array.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
mutation {
adGroupAssociateBidList(
input: {
adGroupId: "AD_GROUP_ID_PLACEHOLDER",
bidListsToAddOrUpdate: [
{
bidListId: "BID_LIST_ID_PLACEHOLDER_01",
isDefault: false,
isEnabled: true
}
],
bidListIdsToRemove: ["BID_LIST_ID_PLACEHOLDER_02"]
}
) {
data {
name
associatedBidLists {
nodes {
bidList {
id
}
}
}
}
userErrors {
field
message
}
}
}
Bid List Queries

To understand the nuances of bid list ownership and individual bid lines, you can look up bid list details, their associations, and whether they are enabled. The following sections provide examples of using the bidList query to look up key bid list details and an ad group's relationship with multiple bid lists.

Look Up Bid List Details

The following GraphQL query example retrieves key details of a specific bid list, including its ownership, individual bid lines, adjustment type, dimensions, and whether it is used only for volume control. Each ...on fragment retrieves the IDs for the corresponding owner type.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
query GetBidListDetailsExample {
bidList(id: "BID_LIST_ID_PLACEHOLDER") {
adjustmentType
bidLinesCount
dimensions
id
isAvailableForLibraryUse
name
owner {
...on AdGroup {
id
}
...on Campaign {
id
}
...on Advertiser {
id
}
...on Partner {
id
}
}
ownerType
source
volumeControlOnly
bidLines {
domainFragment
bidAdjustment
volumeControlPriority
}
}
}
Look Up Bid List Associations

The following ad group GraphQL query example retrieves details about an ad group's relationship with multiple bid lists, including ownership, associations, and active bidding status. This is helpful for checking bid line relationship limits and ensuring that specific bid lists are activated for your campaign strategy.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
query GetBidListAssociationsForAdGroupExample {
adGroup(id: "AD_GROUP_ID_PLACEHOLDER") {
id
name
ownedBidLists {
nodes {
id
}
}
associatedBidLists {
nodes {
isEnabled
bidList {
id
}
}
}
appliedBidLists {
nodes {
id
}
}
}
}
Update Bid Lists

To optimize your ad campaign, you can make adjustments to your bid list using different mutations as described in the following table.

Mutation	Description
bidListSet	Updates bid list details such as the bid list name, owner, and all its bid lines at once.
bidListUpdate	Adds and removes bid lines in a bid list.
bidFactorBulkUpdate	Updates multiple bid lists at once.

NOTE: You can also update bid lines for an entity by activating or deactivating bid lists inherited from parent entities. To update bid list associations, whether bid lists are defaults, and whether they are enabled, use an AssociateBidList mutation. For details, see Associate Bid Lists.

Here's what you need to know:

You cannot update its bid list adjustment type.
The bid list must stay within relationship limits.
Set a Specified Bid List

You can use the bidListSet mutation to update the following:

All the bid lines in a bid list with the same specified values.
The name of the bid list.
The owner of the bid list.
Example

To optimize bid list association and inheritance, you can re-set the ownership of a bid list to a higher-level parent entity. The following bidListSet mutation example shows how to update a bid list with its new name and owner. The new owner must be an ancestor of the current owner within the entity hierarchy.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
mutation {
bidListSet(input: { id: BID_LIST_ID_PLACEHOLDER, name:"NEW_BID_LIST_NAME_PLACEHOLDER", newOwner: {
partnerId: "PARTNER_ID_PLACEHOLDER" } }) {
data {
id
name
owner {
__typename
... on Partner {
id
name
}
... on Advertiser {
id
name
}
}
}
userErrors {
message
field
}
}
}
Add and Remove Bid Lines

The bidListUpdate mutation allows you to add and remove individual bid lines without requiring you to specify all lines. If there are existing bid lines that have the same dimensional values as the ones you provide, they will be replaced.

Example

The following bidListUpdate mutation shows how to update a bid list by adding a bid line and removing an existing one for the specified domains. The bid list now targets impressions with a bid adjustment of 1 and a neutral volume control priority.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
mutation {
bidListUpdate(
input: {
id: "BID_LIST_ID_PLACEHOLDER",
bidLinesToAdd: [
{
domainFragment: "DOMAIN_COM_1_PLACEHOLDER",
bidAdjustment: 1,
volumeControlPriority: NEUTRAL
}
],
bidLinesToRemove: [{domainFragment: "DOMAIN_COM_1_PLACEHOLDER"}]
}
) {
data {
id
}
userErrors {
field
message
}
}
}
Bulk Edit Bid Lines

The bidFactorBulkUpdate mutation allows you to update multiple bid lists within a single request. It supports the following bid dimensions:

HasGeoSegmentId
HasDomainFragmentId
HasLiveEventId
HasLiveEventTypeId
HasRenderingContextId
HasAdFormatId
HasBrowserId
HasDeviceTypeId
HasPlacementPositionRelativeToFoldId
HasOsId
HasDeviceModelId
HasCarrierId
HasInternetConnectionTypeId
Update Bid Factors Example

The following bidFactorBulkUpdate mutation shows how to update bid factors for an ad group associated with a specified geographic segment. This includes setting the bid adjustment value for optimized lists to 10%.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
mutation {
bidFactorBulkUpdate(
input: {
dimensions: [HAS_GEO_SEGMENT_ID_PLACEHOLDER]
bulkBidFactorsToUpdate: [{
adGroupId: "AD_GROUP_ID_PLACEHOLDER"
bidFactorsToUpdateOrAdd: [{
value: 10
bidFactorType: TARGET
geoSegmentId: "GEO_SEGMENT_ID_PLACEHOLDER"
volumeControlPriority: NEUTRAL
}]
}]
}
) {
data {
adGroups {
id
name
bidFactors(dimensions: [HAS_GEO_SEGMENT_ID_PLACEHOLDER]){
type
value
dimension{
geoSegment{
id
name
}
}
}

}
}
errors {
__typename
... on MutationError {
field
message
}
}
}
}
Remove Bid Factors Example

The following bidFactorBulkUpdate mutation shows how to remove bid factors for an ad group associated with a specified geographic segment.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
mutation BidFactorBulkUpdate {
bidFactorBulkUpdate(
input: {
bulkBidFactorsToUpdate: {
bidFactorsToRemove: [{ geoSegmentId: "GEO_SEGMENT_ID_PLACEHOLDER" }]
adGroupId: "AD_GROUP_ID_PLACEHOLDER"
}
dimensions: [HAS_GEO_SEGMENT_ID_PLACEHOLDER]
}
) {
data {
adGroups {
id
name
bidFactors(dimensions: [HAS_GEO_SEGMENT_ID_PLACEHOLDER]) {
type
value
dimension {
geoSegment {
id
name
}
}
}
}
}
errors {
__typename
... on MutationError {
field
message
}
}
}
}
Delete a Bid List

To permanently remove and disassociate a bid list from all associated partners, advertisers, campaigns, and ad groups, use the bidListDelete mutation.

1
2
3
4
5
6
7
8
9
10
11
12
13
mutation {
bidListDelete(input: { id: "BID_LIST_ID_PLACEHOLDER" }) {
data {
wasDeleted
}
errors {
...on InSchemaError {
field
message
}
}
}
}

TIP: Since GraphQL delta calls don't track bid list deletions, use REST instead. For details, see the POST /v3/delta/activity/query/adgroup endpoint.

FAQs

The following is a list of frequently asked questions about creating and managing bid lists in GraphQL.

I created a bid list for an owner entity, but how do I turn it on?

After creating a bid list, you need to also associate and enable it for the owner or its descendant. This includes setting the isEnabled property to true.

How do I update a single bid line in a bid list?

You can use the bidListUpdate mutation to add the updated bid line and remove the existing one, as there is no direct way to update a single line. For details, see Update Bid Lists.

---

# Create and Manage Bid Lists in REST

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/BidListsCreateManageREST](https://partner.thetradedesk.com/v3/portal/api/doc/BidListsCreateManageREST)

Create and Manage Bid Lists in REST

This guide walks you through the process of setting up bid lists in REST, defining their key properties, and propagating them to associated campaigns and ad groups. Use REST if you need to access legacy features of the platform, including those that might have been updated for Kokai but were present before its introduction.

A unique aspect of bid lists is their flexibility in terms of ownership and assignment. They can be owned and assigned at various levels within the core entities, including partner, advertiser, campaign, and ad group. For details, see Entity Relationships.

To learn more about bid list terms and relationships, see Bid Lists. For instructions on using our GraphQL API, see Create and Manage Bid Lists in GraphQL.

Requirements and Guidelines

Here's what you need to know before making GraphQL calls for bid lists:

A bid list must contain at least one bid line.
If you try to create a bid list with bid lines of different dimensions, you will get a validation error (the bid list won't be created in that state). For example, if one bid line uses the DomainFragment dimension while another uses the GeoSegmentId dimension, it can lead to errors.
Some dimensions use third-party providers and might incur additional fees.
The number of bid lines may not exceed bid line relationship limits. To avoid needing to recreate bid lists at different levels, be sure to leverage inheritance. For details, see Inheritance.
The adjustment type and bid adjustment values must match. For details, see Adjustment Types.
The default resolution type is ApplyMultiplyAdjustment, which multiplies bid adjustments from a bid list to calculate the final bid adjustment. It is required for inclusion and exclusion lists and recommended for optimized lists.
To streamline the management of bid lists across multiple campaigns and ad groups, use default bid lists.

TIP: To create, look up, or update multiple bid lists at once, you can use batch requests through the POST /v3/bidlist/batch endpoint.

The following sections provide examples of REST API calls for creating, managing, and retrieving bid list information. For basic terms and definitions, see Bid Lists.

Adjustment Types

When creating a bid list, choose an adjustment type to determine bid adjustments based on bid line matches. Target and block lists allow or deny bidding based on specified dimensions. Optimized lists offer flexible bid adjustments per bid line.

The following table outlines bid adjustment types in REST and their impact on matching and non-matching bid lines.

Adjustment Type	Description	Bid Adjustment for Matched Bid Lines	Bid Adjustment for Non-Matching Bid Lines
TargetList	Includes impressions that match the specified dimensions for targeting. Impressions that do not match any line in a target list are excluded from bidding.	1	0
BlockList	Excludes impressions that match the specified dimensions from targeting. Only impressions that do not match any line in a block list are included in bidding.	0	1
Optimized	Offers more more flexibility compared to block or target lists. Here are key points:
Unlike block or target lists, where bid adjustments are limited to 0 and 1, optimized bid adjustments can include decimals like 0.25 or 1.75.
Impressions matching a bid line get the specified adjustment.
If an impression matches multiple bid lines, the resolution type sets the final bid adjustment.
TIP: Use the ApplyMultiplyAdjustment property to multiply the bid adjustments of all matching bid lines. Impressions not matching any bid line continue to bid.	Value Specified	1
Create Bid Lists

The following table describes different methods for creating bid lists. You can create individual bid lists, multiple bid lists in a single request, or create a bid list as you're creating or updating an ad group.

Task	Endpoint	Notes
Create an individual bid list.	POST /v3/bidlist	N/A
Create multiple bid lists.	POST /v3/bidlist/batch	N/A
Create a bid list while creating or updating an ad group.	POST /v3/adgroup and PUT /v3/adgroup	Use the NewBidLists object.

The following request examples detail the requirements for creating different types of bid lists, such as target, block, and optimized.

Target and Block Bid Lists Example

The following table describes the required properties for creating target and block bid lists.

Property	Description
Name	A name to describe this bid list.
BidListAdjustmentType	Must be set to TargetList or BlockList.
BidListOwner	The entity type that owns this bid list.
BidListOwnerId	The partner, advertiser, campaign, or ad group that owns this bid list.
BidLines. Dimension	Choose one of the dimensions from the BidLines object. Commonly used dimensions include AdFormatId, DomainFragment, GeoSegmentId and RecencyWindowInMinutes.
NOTE: Some dimensions use third-party providers and may incur additional fees.

For target or block lists, the bid adjustment should not be passed, or if it is passed, it should be 1 for target lists and 0 for block lists.

The following is a target list example of a POST /v3/bidlist request.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
{
"Name": "Site/App Target List",
"BidListAdjustmentType": "TargetList",
"BidLines": [
{
"DomainFragment": "example.com"
},
{
"DomainFragment": "example.org"
}
],
"BidListOwner": "AdGroup",
"BidListOwnerId": "3f8ges2a"
}
Optimized Bid List Example

This table describes the required properties for creating optimized bid lists. These properties define the bid list's name, ownership, and the specific dimensions and adjustments to apply when an impression matches the criteria.

Property	Description
Name	A name to describe this bid list.
BidListAdjustmentType	Must be set to Optimized.
ResolutionType	Must be set to ApplyMultiplyAdjustment.
BidListOwner	The entity type that owns this bid list.
BidListOwnerId	The partner, advertiser, campaign, or ad group that owns this bid list.
BidLines.BidAdjustment	The adjustment applied to the base bid when an impression matches all of the dimensions in this bid line.
BidLines. Dimension	Choose one of the dimensions from the BidLines object. Commonly used dimensions include AdFormatId, DomainFragment, GeoSegmentId and RecencyWindowInMinutes.
NOTE: Some dimensions use third-party providers and may incur additional fees.

The following is an optimized example of a POST /v3/bidlist request.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
{
"Name": "Site/App Target List",
"BidListAdjustmentType": "Optimized",
"ResolutionType": "ApplyMultiplyAdjustment",
"BidLines":[
{
"BidAdjustment": 1.25,
"DomainFragment": "example.com"
},
{
"BidAdjustment": 1.1,
"DomainFragment": "example.org"
}
],
"BidListOwner": "AdGroup",
"BidListOwnerId": "3f8ges2a"
}
Common Errors

The following is common errors you may encounter when creating bid lists. They are usually caused by incorrect property values, mismatched dimensions, or exceeding platform limits.

You do not have access to the bid list owner for the bid list you are trying to create.
You do not have access to the bid line dimension for the bid list you are trying to create.
The bid list owner and type do not align. For example, you use an ad group ID with a campaign owner type.
You try to create a target list with bid adjustments other than 1.
You try to create a block list with adjustments other than 0.
You try to create a target or block list with a resolution type other than ApplyMultiplyAdjustment.
You try to create an optimized bid list and do not include the ResolutionType property.
The number of bid lines exceeded bid line limits.
Be sure to avoid dimension mismatches within a bid list.
Associate Bid Lists

The following table describes various methods to associate and enable bid lists with different entities. See Bid List Relationships for more information on ownership and association.

Task	Endpoints	Notes
Create, associate, and enable a bid list for an ad group.	POST /v3/adgroup
or
PUT /v3/adgroup	Use the NewBidLists property. To enable the new bid list upon creation, set IsEnabled to true in the AssociatedBidLists property for that bid list.
Associate existing bid lists to an ad group.	POST /v3/adgroup
or
PUT /v3/adgroup	Use the AssociatedBidLists property. To enable the bid list for the ad group, set IsEnabled to true in the AssociatedBidLists property for that bid list.
Associate a bid list to an ad group with existing associated bid lists.	GET /v3/adgroup/{adGroupId}
and
PUT /v3/adgroup	Do the following:
Retrieve the current associated bid lists using the GET /v3/adgroup/{adGroupId} endpoint.
Pass the existing and the added bid lists in the AssociatedBidLists property using the PUT /v3/adgroup endpoint.
To enable the bid list for the ad group, set IsEnabled to true in AssociatedBidLists property for that bid list.
Associate existing bid lists to a campaign.	POST /v3/campaign
or
PUT /v3/campaign	Use the AssociatedBidLists object. To enable the bid list for the campaign, set IsEnabled to true in AssociatedBidLists for that bid list.
Add a bid list to a campaign with existing associated bid lists.	GET /v3/campaign/{campaignId}
and
PUT /v3/campaign	1. Retrieve the current associated bid lists using GET /v3/campaign/{campaignId}.
2. Pass the existing and the added bid lists using the PUT /v3/campaign endpoint for the associated bid lists. To enable the bid list for the campaign, set IsEnabled to true in the AssociatedBidLists property for that bid list.
Associate existing bid lists to an advertiser.	POST /v3/advertiser
or
PUT /v3/advertiser	Use the AssociatedBidLists object. To enable the bid list for the advertiser, set IsEnabled to true in the AssociatedBidLists property for that bid list.
Associate a bid list to an advertiser with existing associated bid lists.	GET /v3/advertiser/{advertiserId}
and
PUT /v3/advertiser	1. Retrieve the current associated bid lists using GET /v3/advertiser/{advertiserId}.
2. Pass the existing and the added bid lists in PUT /v3/advertiser AssociatedBidLists. To enable the bid list for the ad group, set IsEnabled to true in the AssociatedBidLists property for that bid list.
Add existing bid lists to a partner.	PUT /v3/partner	Use the AssociatedBidLists object. To enable the bid list for the partner, set IsEnabled to true in the AssociatedBidLists property for that bid list.
Add a bid list to a partner with existing associated bid lists.	GET /v3/partner/{partnerId}
and
PUT /v3/partner	1. Retrieve the current associated bid lists using GET /v3/partner/{partnerId}.
2. Pass the existing and the bid lists in the PUT /v3/partner endpoint for the associated bid lists. To enable the bid list for the partner, set IsEnabled to true in the AssociatedBidLists property for that bid list.
Properties

The AssociatedBidLists object is a list of bid lists that can be associated with the partner, advertiser, campaign, and ad group entities through their relative endpoints (outlined in the previous section).

Bid lists included in the AssociatedBidLists object have a few more properties that can be sent along with their bid list IDs.

Property	Description
BidListId	The identifier of the bid list to associate.
IsEnabled	Whether or not the bid list is enabled for use with this association. The bid list must be both associated and enabled to take effect.
IsDefaultForDimension	Use the property to do the following:
Determine which bid list is primarily displayed in an Ad Group (Ag) tile.
Specify which bid list to log activity for user inline, bulk, or rollup updates that do not apply to an individual bid list.
This property only applies to associated bid lists at the ad group level. Be sure each ad group includes one bid list per dimension or dimension combination with this property set to true.
Example for Partners, Advertisers, and Campaigns

The following AssociatedBidLists object activates two bid lists by associating and enabling them at the partner, advertiser, or campaign level.

1
2
3
4
5
6
7
8
9
10
11
12
{
"AssociatedBidLists": [
{
"BidListId": 1234567,
"IsEnabled": true
},
{
"BidListId": 1234568,
"IsEnabled": true
}
]
}
Example for Ad Groups

The following AssociatedBidLists object activates two bid lists by associating and enabling them at the ad group level. The first bid list, with its IsDefaultForDimension property enabled, is the primary one displayed in the Ag tile and used for logging general updates (that do not apply to an individual bid list).

1
2
3
4
5
6
7
8
9
10
11
12
13
14
{
"AssociatedBidLists": [
{
"BidListId": 1234567,
"IsEnabled": true,
"IsDefaultForDimension": true
},
{
"BidListId": 1234568,
"IsEnabled": true,
"IsDefaultForDimension": false
}
]
}
Common Errors

The following is common errors you may encounter when associating bid lists. They are usually caused by conflicts with other bid list associations.

The bid list is already associated with an ancestor. For example, you are trying to associate a bid list already associated at the partner-level to an ad group beneath that partner.
A peer rather than an ancestor owns the bid list. For example, you are trying to associate a bid list owned by an ad group to another ad group.
More than one bid list has the IsDefaultForDimension property set to true for the same dimension combination and bid list type at the ad-group level.
Disassociate Bid Lists
Task	Endpoint	Notes
Disassociate or disable a bid list for an ad group.	GET /v3/adgroup/{adGroupId}
and
PUT /v3/adgroup	1. Use GET /v3/adgroup/{adGroupId} to retrieve all of the associated bid lists for the ad group.
2. Send all the associated bid lists with the request to PUT /v3/adgroup, removing any bid lists that should be disassociated, and changing IsEnabled to false for any bid lists that should be disabled.
Disassociate or disable a bid list for a campaign.	GET /v3/campaign/{campaignId}
and
PUT /v3/campaign	1. Use GET /v3/campaign/{campaignId} to retrieve all of the associated bid lists for campaign.
2. Send all the associated bid lists with the request to PUT /v3/campaign, removing any bid lists that should be disassociated, and changing IsEnabled to false for any bid lists that should be disabled.
Disassociate or disable a bid list for an advertiser.	GET /v3/advertiser/{advertiserId}
and
PUT /v3/advertiser	1. Use GET /v3/advertiser/{advertiserId} to retrieve all of the associated bid lists for the advertiser.
2. Send the associated bid lists with the request to PUT /v3/advertiser, removing any bid lists that should be disassociated, and changing IsEnabled to false for any bid lists that should be disabled.
Disassociate or disable a bid list for a partner.	GET /v3/partner/{partnerId}
and
PUT /v3/partner	1. Use GET /v3/partner/{partnerId} to retrieve all of the associated bid lists for the partner.
2. Send all the associated bid lists with the request to PUT /v3/partner, removing any bid lists that should be disassociated, and changing IsEnabled to false for any bid lists that should be disabled.
Common Errors

For each ad group, when more than one bid list of a bid list adjustment type exists for a dimension, not setting the remaining bid list's IsDefaultForDimension property to true at the ad-group level. Users in the UI may not be able to see the line items for that dimension.

Look Up Bid Lists

Use the following endpoints to look up bid list details or find available bid lists that can be associated with a target object.

Task	Endpoint	Full Bid Line Details?	Filters
Get details about an individual bid list.	GET /v3/bidlist/{bidListId}	Yes	N/A
Get details for multiple bid lists	POST /v3/bidlist/batch/get	Yes	N/A
Get a filterable, paginated list of bid lists available for association with a specific ad group.	POST /v3/bidlistsummary/query/adgroup/available	No	DimensionDescriptorFilters, MaximumLevel
Get a filterable, paginated list of bid lists available for association with a specific campaign.	POST /v3/bidlistsummary/query/campaign/available	No	DimensionDescriptorFilters, MaximumLevel
Get a filterable, paginated list of bid lists available for association with a specific advertiser.	POST /v3/bidlistsummary/query/advertiser/available	No	DimensionDescriptorFilters, MaximumLevel
Get a filterable, paginated list of bid lists available for association with a specific partner.	POST /v3/bidlistsummary/query/partner/available	No	DimensionDescriptorFilters, MaximumLevel
Get a list of global bid lists maintained by The Trade Desk marketplace quality team.	POST /v3/bidlistsummary/query/global	No	DimensionDescriptorFilters
Get Multiple Bid Lists

To retrieve multiple bid lists, in a POST /v3/bidlist/batch/get request, specify the ID of each bid list you want to return.

[12345,09876,45678]

IMPORTANT: In the request, be sure to pass a string array, not an object array.

Update Bid Lists

To optimize your ad campaign, you can make adjustments to your bid lists using different endpoints. Here's what you need to know:

You cannot update its bid list adjustment type.
The bid list must stay within relationship limits.

NOTE: You can also update bid lines for an entity by activating or deactivating bid lists inherited from parent entities. For details, see Associate Bid Lists.

The following table describes the endpoints for updating single or multiple bid lists.

Task	Endpoint	Notes
Update an individual bid list.	GET /v3/bidlist/{bidListId}
and
PUT /v3/bidlist	1. Use GET /v3/bidlist/{bidListId} to retrieve all of the bid lines for the bid list.
2. Send all the bid lines with the request to PUT /v3/bidlist, including any additions, changes, or deletions from the bid lines.
Update multiple bid lists.	POST /v3/bidlist/batch/get
and
PUT /v3/bidlist/batch	1. Use POST /v3/bidlist/batch/get to retrieve all of the bid lines for the bid lists.
2. Send all the bid lines with the request to PUT /v3/bidlist/batch, including any additions, changes, or deletions from the bid lines.
Common Errors

The following is common errors you may encounter when updating bid lists.

The bid list ID or bid list owner ID is incorrect.
An attempt to update the BidListAdjustmentType property, which is only configurable when the bid list is created.
All bid lines within a bid list do not specify the same dimension or dimension combination.
Delete Bid Lists

Deleting a bid list is permanent and disassociates the bid list from all associated partners, advertisers, campaigns, and ad groups.

Task	Endpoint	Notes
Delete an individual bid list.	DELETE /v3/bidlist/{bidListId}	After a bid list is deleted, it will still return in delta functions but will only show the bid list ID and IsDeleted property set to true.
Common Errors

When creating and updating bid lists, errors occur if the bid lines within a bid list do not have the same dimensions or dimension combinations. The following examples show you how to fix them.

Example 1

In this request, the two bid lines include different dimensions. Sending bid lines with different dimensions results in an error.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
{
"Name": "Site/App Target List",
"BidListAdjustmentType": "Optimized",
"ResolutionType": "ApplyMultiplyAdjustment",
"BidLines":[
{
"BidAdjustment": 1.25,
"DomainFragment": "example.com"
},
{
"BidAdjustment": 1.1,
"DeviceType": "Pc"
}
],
"BidListOwner": "AdGroup",
"BidListOwnerId": "3f8ges2a"
}

To fix the error, choose one dimension for this bid list. In this example, we changed all of the bid lines to include DomainFragment.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
{
"Name": "Site/App Target List",
"BidListAdjustmentType": "Optimized",
"ResolutionType": "ApplyMultiplyAdjustment",
"BidLines":[
{
"BidAdjustment": 1.25,
"DomainFragment": "example.com"
},
{
"BidAdjustment": 1.1,
"DomainFragment": "example.org"
}
],
"BidListOwner": "AdGroup",
"BidListOwnerId": "3f8ges2a"
}
Example 2

The first bid line includes the DomainFragment and DeviceType dimensions, but the last bid line only includes DomainFragment. This will cause an error.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
{
"Name": "Site/App Target List",
"BidListAdjustmentType": "Optimized",
"ResolutionType": "ApplyMultiplyAdjustment",
"BidLines":[
{
"BidAdjustment": 1.25,
"DomainFragment": "example.com",
"DeviceType": "Pc"
},
{
"BidAdjustment": 1.1,
"DomainFragment": "example.org"
}
],
"BidListOwner": "AdGroup",
"BidListOwnerId": "3f8ges2a"
}

To fix the error, remove DeviceType from the first bid line, or add DeviceType to the second bid line. In this example, we added DeviceType to the second bid line.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
{
"Name": "Site/App Target List",
"BidListAdjustmentType": "Optimized",
"ResolutionType": "ApplyMultiplyAdjustment",
"BidLines":[
{
"BidAdjustment": 1.25,
"DomainFragment": "example.com",
"DeviceType": "Pc"
},
{
"BidAdjustment": 1.1,
"DomainFragment": "example.org",
"DeviceType": "Pc"
}
],
"BidListOwner": "AdGroup",
"BidListOwnerId": "3f8ges2a"
}

---

# Default Bid Lists

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/BidListDefault](https://partner.thetradedesk.com/v3/portal/api/doc/BidListDefault)

Default Bid Lists

Default bid lists are intended for grouping bid lists that are common across most campaigns for a specific advertiser and/or across most ad groups under a campaign. Thus, instead of setting up bid lists for individual campaigns and ad groups, you can save time and effort by creating default bid lists that are housed at the advertiser or campaign level. The advertiser default lists can be propagated to any new campaigns created for the advertiser as needed and subsequently applied to any ad groups within those campaigns. The campaign default bid lists, which allow a wider variety of dimensions, can be applied to new ad groups under each campaign as needed. Once an advertiser or campaign default bid list is applied to an ad group, it is automatically enabled for bidding.

Standard vs. Default Bid Lists

Default bid lists are a subset of standard bid lists, which allows more user control, efficiency, and granularity in bid list management as well as complete parity and visibility in the UI. The following table provides a high-level comparison. For details on standard bid lists, see Bid Lists.

Comparison Aspect	Standard Bid Lists	Default Bid Lists
Ownership	Can be owned by:
- Partner
- Advertiser
- Campaign
- Ad group	Can be owned by:
- Partner
- Advertiser
- Campaign
Level Applied	N/A	Can be applied only to these levels:
- Advertiser
- Campaign
Association levels	Can be associated with the bid list owner and all respective descendants under it.
For details, see the Bid List Relationships section in Bid Lists.	Can be associated only with ad groups under a campaign that has applied advertiser- or campaign-level default bid lists.
Inheritance	All associated and enabled bid lists are automatically inherited by all respective descendants.	Advertiser- and campaign-owned default bid lists are not inherited automatically by their descendants. You, as the API user, determine if and when a bid list will be inherited by a lower entity.
Allowed bid adjustment types	- Target
- Block
- Optimized	- Target
- Block
Allowed dimensions	All	- All available at the campaign level
- Limited at the advertiser level
For details, see Allowed Dimensions.
Single- or multi-dimensional bid lists	Both	Only single-dimensional lists
Checking for inherited higher-level bid lists	For a given entity level, you can only see bid lists that are associated directly with that entity. You must query higher entity bid list associations to see all bid lists that are inherited and active for a lower entity level.	Since advertiser- or campaign-owned default bid lists are always associated only at the ad group level, you will always be able to query for all associated default bid lists at the ad group level.
Bid line limits and counts	No difference. For details, see the Bid Line Limits section in Bid Lists.	No difference. For details, see the Bid Line Limits section in Bid Lists.
Allowed Dimensions in Default Bid Lists
Default bid lists can be only single-dimensional. Multi-dimensional bid lists are currently not allowed.
Some dimensions may require permissions. If needed, please contact your Account Manager for help.
At the campaign level, default bid lists can include any dimensions, except HasVideoPlayerSizeId.
At the advertiser level, default bid lists can include only the following dimensions.
Category	Dimension Values
Brand Safety	HasGrapeshotBrandSafetyCategoryId
HasIntegralBrandSafetyCategoryId
HasDoubleVerifyBrandSafetyCategoryId
HasIntegralVideoBrandSafetyCategoryId
HasPeer39BrandSafetyCategoryId
Page Quality	HasIntegralPageQualityCategoryId
HasGrapeshotDisplayPageQualityCategoryId
HasGrapeshotVideoPageQualityCategoryId
HasPeer39PageQualityCategoryId
HasIntegralVideoPageQualityCategoryId
HasTencentPageQualityCategoryId
HasAdBugPageQualityCategoryId
HasAdBugVideoPageQualityCategoryId
HasRTBAsiaPageQualityCategoryId
HasRTBAsiaVideoPageQualityCategoryId
Viewability	HasDisplayViewabilityScoreRange
HasIntegralViewabilityCategoryId
HasVideoViewabilityScoreRange
HasDoubleVerifyViewabilityCategoryId
HasIntegralVideoViewabilityCategoryId
HasDoubleVerifyVideoViewabilityCategoryId
HasPeer39ViewabilityCategoryId
HasGrapeshotViewabilityCategoryId
HasGrapeshotVideoViewabilityCategoryIds
Language	HasLanguageId
HasGrapeshotLanguageId
HasPeer39LanguageId
Other Dimensions	HasAdsTxtSellerTypeId
HasGeoSegmentId
HasDomainFragmentId
HasPrivateContractId
HasSupplyVendorId
What You Need to Know

Here’s what you need to keep in mind when working with default bid lists. They:

Are optional and single-dimensional. You can associate bid lists with campaigns and ad groups on an individual basis as explained in Bid Lists.
Can be only of type TargetList or BlockList (specified in BidAdjustmentType). You cannot add Optimized bid lists, such as Volume Control bid lists, as default ones.
Can be defined only at the advertiser or campaign level. Advertiser default bid lists have a limited number of dimensions that can be used.
If included, get propagated sequentially to the descendants by following the bid list inheritance rules. For details, see Bid Lists.
For example, the advertiser’s default bid lists cannot be applied directly to ad groups without first including them in the advertiser’s campaigns.
Will not be automatically applied to the advertiser’s existing campaigns or their existing ad groups.
May be included only in the advertiser’s new campaigns, by setting the IncludeDefaultsFromAdvertiser parameter to true in the POST/campaign request. The applied default bid lists are automatically added to the DefaultBidLists array.
May be included only in new ad groups, using the IncludeDefaultsFromCampaign parameter to true in the POST/adgroup request. The applied default bid lists are automatically added to the AssociatedBidLists array with the following settings, which you can update as needed:
The IsEnabled parameter set to true.
The IsDefaultForDimension parameter set to false.
If the same bid list is already applied to the campaign or ad group, it will be included only once.
When included, the applied default bid lists in the DefaultBidLists array for campaigns and the AssociatedBidLists array for ad groups can be subsequently retrieved using the respective GET requests and updated using the respective PUT requests and as needed, but no new default bid lists can be included from the parent advertiser or campaign.
FAQs

The following table provides a matrix of answers to some default bid list FAQs about each entity involved.

Question	Advertiser	Campaign	Ad Group
Where can default bid lists be defined?	In DefaultBidLists array	In DefaultBidLists array	N/A
Can default bid list be multi-dimensional?	No	No	N/A
How can default bid lists be inherited from the parent?	N/A	Using IncludeDefaultsFromAdvertiser property, but only at creation	Using IncludeDefaultsFromCampaign property, but only at creation
Can other bid lists be included as default bid lists in addition to those from the parent at creation?	N/A	Yes, by setting IncludeDefaultsFromAdvertiser to true and adding bid list IDs to DefaultBidLists array	N/A
Can the items in the DefaultBidLists array be modified?	Yes, but changes will apply only to new campaigns	Yes, but changes will apply only to new ad groups	N/A
Can default bid lists be automatically added to AssociatedBidLists and enabled for bidding?	No	No	Yes, but only at creation
Any subsequent enabling or disabling of bid lists will affect only the current ad group.
If the contents of a default bid list are updated, are the changes automatically applied to all campaigns and ad groups that use it?	N/A	Yes	Yes
Endpoints

The following table lists the endpoints for creating, updating, applying, and retrieving default bid lists.

IMPORTANT: Since arrays in PUT requests replace the current ones instead of adding to them, if you want to add bid lists to any current arrays, make sure to retrieve them with the respective GET requests first and then include the current and new values in respective PUT requests with any other appropriate changes.

Endpoints	Advertiser	Campaign	Ad Group
For defining/adding default bid lists	POST/advertiser
PUT/advertiser	POST/campaign
PUT/campaign	N/A
For including default bid lists in descendants	N/A	POST/campaign	POST/adgroup
For updating default bid lists	PUT/advertiser	PUT/campaign	N/A
For retrieving default bid lists	GET/advertiser/{advertiserId}	GET/campaign/{campaignId}	N/A, the applied default bid lists will be returned in the AssociatedBidLists array

See also Request Examples.

Apply Advertiser's Default Bid Lists

The following table outlines the process of creating a set of default bid lists for an existing advertiser and including them as default bid lists in a new campaign and a new ad group for that campaign.

Step #	Description	Endpoints and Further Reference	Notes
1	(Optional, if you already have the necessary bid lists)
Create bid lists with the allowed dimensions common to most campaigns for the advertiser and make sure that the BidAdjustmentType is set to either TargetList or BlockList and the advertiser or partner is set as the bid list owner.	POST/bidlist
For details, see Create Bid Lists.	Request example snippet
2	Update the advertiser by adding the bid list IDs to the DefaultBidLists array.
IMPORTANT: If the advertiser already has an array of default bid lists to which you want to add the new ones, make sure to retrieve the current list using a GET request.	PUT/advertiser	Request example snippet
For an example with all required fields, see Create Advertiser.
3	Create a new campaign for the advertiser and set the IncludeDefaultsFromAdvertiser parameter to true.
If you want to include:
- Only advertiser’s default bid lists, do not include the DefaultBidLists array in the request.
- Other bid lists in addition to the advertiser’s default bid lists, include the IDs of the additional bid lists in the DefaultBidLists array in the request.	POST/campaign
For details on creating campaigns, see Campaigns.	Request example snippet
The response will include the DefaultBidLists array automatically populated with the advertiser’s default bid lists and any other bid lists that were specified in the request.
4	Create a new ad group for the campaign and set the IncludeDefaultsFromCampaign parameter to true.
If you want to include other bid lists in addition to the campaign default bid lists, include the IDs of the additional bid lists in the AssociatedBidLists array in the request and set the lists as enabled.	POST/adgroup
For details on creating ad groups, see Ad Groups.	Request example snippet
The response will include the AssociatedBidLists array automatically populated with the default bid lists from the specified campaign, already enabled for bidding, and any additional bid lists you may have included in the request.
Update Campaign Default Bid Lists

The following table outlines the process of creating a set of default bid lists for an existing campaign and including them as associated bid lists in a new ad group for that campaign. The sections that follow provide code examples for each request.

Step #	Description	Endpoints and Further Reference	Notes
1	(Optional, if you already have the necessary bid lists)
Create bid lists with dimensions common to all campaign’s ad groups and make sure that the BidAdjustmentType is set to either TargetList or BlockList and the campaign is set as the bid list owner.	POST/bidlist
For details, see Bid List.	Request example snippet
2	Retrieve the existing default bid lists for the campaign.	GET/campaign/{campaignId}	Request example snippet
3	Update the campaign by adding the new bid list IDs to the retrieved DefaultBidLists array.	PUT/campaign	Request example snippet
For an example with all required fields, see Campaigns.
4	Create a new ad group for the campaign and set the IncludeDefaultsFromCampaign parameter to true.
If you want to include other bid lists in addition to the campaign default bid lists, include the IDs of the additional bid lists in the AssociatedBidLists array in the request and set the lists as enabled.	POST/adgroup
For details on creating ad groups, see Ad Groups.	Request example snippet
The response will include the AssociatedBidLists array automatically populated with the default bid lists from the specified campaign, already enabled for bidding.
Request Examples

The following are code snippets of request examples illustrating the steps in the Applying Advertiser's Default Bid Lists and Updating Campaign Default Bid Lists procedures.

Create Bid Lists
Add Bid Lists as Defaults
Include Advertiser's Default Bid Lists in a New Campaign
Retrieve Campaign Information
Add Default Bid Lists to an Existing Campaign
Include Campaign Default Bid Lists in a New Ad Group
Create Default Bid Lists

To create default bid lists, set the BidListAdjustmentType property to TargetList or BlockList. The following is a POST /v3/bidlist request body example with that property set to TargetList.

1
2
3
4
5
6
7
8
9
10
{
"Name": "DEFAULT_BID_LIST_NAME_PLACEHOLDER",
"BidListAdjustmentType": "TargetList",
"BidLines": [
// Include the dimensions that you want applied to all campaigns.
],
"BidListOwner": "Advertiser",
"BidListOwnerId": "abcd1234"
// Include other required fields.
}
Add Bid Lists as Defaults

The following code snippet can be included in the respective POST and PUT advertiser or campaign requests.

IMPORTANT: Since arrays in PUT requests replace the current ones instead of adding to them, if you want to add bid lists to any current arrays, make sure to retrieve them with the respective GET requests first and then include the current and new values in respective PUT requests with any other appropriate changes.

1
2
3
4
5
6
7
8
9
10
11
{
"DefaultBidLists": [
{
"BidListId": "efgh5678"
},
{
"BidListId": "ijkl9012"
}
]
// Include other required fields.
}
Include Advertiser's Default Bid Lists in a New Campaign

To include an advertiser's default bid lists in a new campaign, set the IncludeDefaultsFromAdvertiser property to true. The applied default bid lists are automatically added to the DefaultBidLists array. The following is a POST /v3/campaign request body example with that property set to true.

TIP: If you want to include other bid lists to the campaign in addition to the advertiser’s default bid lists, include the DefaultBidLists array with the IDs of the additional bid lists in the request.

1
2
3
4
5
6
7
8
9
10
11
12
{
"AdvertiserId": "abcd1234",
"CampaignName": "CAMPAIGN_NAME_PLACEHOLDER",
"CampaignConversionReportingColumns":[
{
"TrackingTagId": "12345678ab",
"ReportingColumnId": 1
}
],
"IncludeDefaultsFromAdvertiser": true
// Include other required fields.
}
Retrieve Campaign Information

To retrieve campaign information such as associated default bid lists, use the GET /v3/campaign/{campaignId} endpoint. The following request example uses an authorization token, which is required by The Trade Desk API to authorize the request.

1
2
3
curl --location --request GET 'https://api.thetradedesk.com/v3/campaign/t0ncimu' \
--header 'Content-Type: application/json' \
--header 'TTD-Auth: yourauthtoken'
Add Default Bid Lists to an Existing Campaign

To add default bid lists to an existing campaign, use the PUT /v3/campaign endpoint. The following is an example of a request to update a campaign by adding two default bid lists.

IMPORTANT: Since arrays in PUT requests replace the current ones instead of adding to them, if you want to add bid lists to any current arrays, make sure to retrieve them with the respective GET requests first and then include the current and new values in respective PUT requests with any other appropriate changes.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
{
"AdvertiserId": "abcd1234",
"CampaignName": "CAMPAIGN_NAME_PLACEHOLDER",
"CampaignConversionReportingColumns":[
{
"TrackingTagId": "12345678ab",
"ReportingColumnId": 1
}
],
"DefaultBidLists": [
{
"BidListId": "efgh5678"
},
{
"BidListId": "ijkl9012"
}
]
// Include other required fields.
}
Include Campaign Default Bid Lists in a New Ad Group

To include campaign default bid lists in a new ad group, use the POST /v3/adgroup endpoint. All default bid lists associated with the campaign are automatically applied this ad group upon its creation. If the same bid list is already applied to the ad group, it will be included only once. The applied lists can be removed, as needed.

TIP: If you want to include other bid lists to the ad group in addition to the campaign default bid lists, include the AssociatedBidLists array with the IDs of the additional bid lists in the request and set them as enabled.

1
2
3
4
5
6
{
"CampaignId":"mnop3456",
"AdGroupName":"AD_GROUP_NAME_PLACEHOLDER",
"IncludeDefaultsFromCampaign": true
// Include other required fields.
}

---

# Multi-Dimensional Bidding

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/DimensionalBidding](https://partner.thetradedesk.com/v3/portal/api/doc/DimensionalBidding)

Multi-Dimensional Bidding

Multi-dimensional bidding applies a bid factor simultaneously across several dimensions (also known as vectors), unlike single-dimensional bidding. It uses combinations of dimensions, such as site and ad placement, to offer greater bid variety and more accurate targeting. For example, you can adjust bids higher or lower based on which supply-side platform (SSP) is requesting inventory, or block bids on display ads for websites if the ads are placed below the fold. For details on bid list ownership, terms, and requirements, see Bid Lists.

What You Need to Know

Here's what you need to know about multi-dimensional bidding:

By default, you can use multi-dimensional bidding for two dimensions. More than that will cause API errors. If you require combinations that include more than two dimensions, contact your Technical Account Manager.
Multi-dimensional bidding is available only in the API and not visible on the UI platform.

This guide focuses on multi-dimensional bid lines and provides examples in both GraphQL and REST.

Anatomy of a Multi-Dimensional Bid List

A multi-dimensional bid list is a collection of bid lines with the same combination of multiple dimensions. The following diagram compares a multi-dimensional bid list with a single-dimensional one. The main difference between them is that the multi-dimensional bid lines have the same combination of two dimensions (supply vendor, in red, and domain fragment), while the single-dimensional bid lines have one (domain fragment).

NOTE: The rest of the requirements are the same for both single- and multi-dimensional bid lists. For details, see What You Need to Know.

Bid Optimization Workflow

After you've created a campaign with a seed representing your top customers, you can optimize the campaign with multi-dimensional bidding. When The Trade Desk receives bid requests from publishers and SSPs, it translates them into combinations of dimensions to match your multi-dimensional bid list, such as:

SSP_One, example.com
SSP_Two, example.com

The optimization steps are:

We match these dimension combinations to bid lists and eligible ad groups.
For each matching line in the bid list, we multiply the base bid with the bid factor and determine the final adjustment using the bid list resolution type.
We calculate the final bid by multiplying the base bid for the ad group by its associated bid lists, bid factors, KPIs, relevance factors, pacing, and other signals.
Create a Multi-Dimensional Bid List

IMPORTANT: By default, you can use multi-dimensional bidding for up to two dimensions. More than that will cause API errors. If you require combinations that include more than two dimensions, contact your Technical Account Manager.

To create multi-dimensional bid lists, use either the GraphQL API or REST API. Unlike single-dimensional bid lists, add extra dimensions in the dimensions (GraphQL) or BidLines (REST) array.

For instructions on managing and retrieving bid list information, see Create and Manage Bid Lists in GraphQL or Create and Manage Bid Lists in REST.

GraphQL API

To create multi-dimensional bid lists in GraphQL, use the bidListCreate mutation as you would with single-dimensional bid lists but include the additional dimensions in the dimensions array.

The following GraphQL mutation example creates a multi-dimensional bid list for an ad group that excludes display ads below the fold from the domains example1.com and example2.com. The adjustmentType field is set to EXCLUSION, indicating the default bid factor is 0.

The mutation returns the ID of the created bid list.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
mutation {
bidListCreate(
input: {
name: "BID_LIST_NAME_PLACEHOLDER"
dimensions: [
HAS_PLACEMENT_POSITION_RELATIVE_TO_FOLD_ID
HAS_DOMAIN_FRAGMENT_ID
]
adjustmentType: EXCLUSION
bidLines: [
{
bidAdjustment: 0
volumeControlPriority: NEUTRAL
placementPositionRelativeToFold: BELOW
domainFragment: "example1.com"
}
{
bidAdjustment: 0
volumeControlPriority: NEUTRAL
placementPositionRelativeToFold: BELOW
domainFragment: "example2.com"
}
]
owner: { adGroupId: "AD_GROUP_ID_PLACEHOLDER" }
}
) {
data {
id
}
userErrors {
field
message
}
}
}
REST API

To create multi-dimensional bid lists in REST, use the POST /v3/bidlist endpoint as you would with single-dimensional bid lists but include the additional dimensions in the BidLines array.

The following is a block list example of a request that excludes display ads below the fold from the domains example1.com and example2.com. The BidListAdjustmentType property is set to BlockList, indicating the default bid factor is 0.

The response returns the ID of the created bid list.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
{
"Name": "Site/App Block List",
"BidListAdjustmentType": "BlockList",
"BidLines": [
{
"PlacementPositionRelativeToFold": "Below",
"DomainFragment": "example1.com"
},
{
"PlacementPositionRelativeToFold": "Below",
"DomainFragment": "example2.com"
}
],
"BidListOwner": "AdGroup",
"BidListOwnerId": "3f8ges2a"
}
FAQs

The following is a list of commonly asked questions about multi-dimensional bid lists.

Can I combine single-dimensional and multi-dimensional bid lists in an ad group?

Yes. You can include both single-dimensional and multi-dimensional bid lists in an ad group. However, remember that your bid lists are multiplied together.

For example, consider three bid lists with the following bid factors:

Dimensions	Bid Factors
example.com	1.25
example.com	1.15
SSP_One and example.com	1.5

If SSP One requests inventory on example.com, this would match both your bid factors for the SSP and the domain fragment and your bid factor for the combination of those dimensions. The result would be the product of all bid factors (1.25 * 1.15 * 1.5 = 2.16).

---

# Frequency

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/Frequency](https://partner.thetradedesk.com/v3/portal/api/doc/Frequency)

Frequency

Frequency is the number of times a user sees an ad within a given time period.

NOTE: Depending on the audience settings, the term "user" can refer to an ID, person, or household.

In the UI, the user is dependent on the cross-device setting selected in the Audience (Au) tile. In the API, the ID for the cross-device graph type can be specified in the following properties at the ad group level: RTBAttributes.AudienceTargeting.CrossDeviceVendorListForAudience.

There are several common ways of using frequency to optimize your bidding strategy for KPIs like reach, budget, or share of voice:

Frequency caps
Frequency goals
Frequency bid adjustments
Frequency Caps

A frequency cap, or an f-cap, limits the number of impressions a user can see within a given time period in a frequency cycle. Frequency caps are represented using fraction notation, where the numerator represents the number of impressions, and the denominator represents the frequency cycle interval, typically expressed in hours or minutes. For example, a 1/3-hour frequency cap indicates that a user can be served a maximum of 1 impression within each 3-hour time period.

IMPORTANT: Even though fractions such as 1/1 and 4/4 are equivalent mathematically, they are not equivalent frequency caps. For details and examples, see Understanding Fraction Notation and Pacing.

Low frequency caps target a user with a small number of ads during campaign flights. In campaigns with excessively low frequency caps, users may not see enough content to impact the user's behavior or brand perception. Utilizing a frequency goal helps prevent this scenario.

Frequency Goals

A frequency goal specifies the preferred number of impressions to be targeted for a user. The platform optimizes toward the number of impressions set as the frequency goal. For example, users who have already seen an ad are favored to see another impression over unknown users until the specified frequency goal is reached.

IMPORTANT: Frequency goals must have the minimum range of 1 per 24 hours.

Frequency Bid Adjustments

Frequency bid adjustments update bid amounts for a user based on the number of impressions seen within the frequency cycle. A frequency range in a bid line specifies the minimum and maximum number of impressions to be shown to a user. Multiple bid adjustments for individual frequency ranges may be grouped to increase or decrease bidding for users who have seen an ad a certain number of times over a specified time period. For details, see Frequency Bid Adjustments.

Frequency Framework

The platform frequency framework provides the flexibility for doing the following:

Decide how many user impressions to target.
Target user impressions at both campaign and ad group levels at the same time.
Customize which campaigns and/or ad groups increment a user's frequency count.
Create multiple frequency caps with different frequency intervals for a campaign and/or an ad group.
Decide to which campaigns or ad groups to assign frequency caps, frequency goals, bid adjustments, and reporting independently of the entities used to increment a user's frequency count.
Frequency Framework Elements

There are three individually configurable elements that make up the frequency framework and allow better leveraging of the frequency cycle.

Element	Definition
Counter	A container that holds the user’s frequency count information (the number of times the user has seen the ad) and defines the time interval (in minutes) after which the counter is reset.
Increment	An entity (partner, advertiser, campaign, and ad group) that serves impressions to users and increases the user's frequency count for the associated counter.
Bid List	Bid lists apply frequency settings to ad groups, campaigns, and other entities by associating the bid list with the entity and enabling the relationship for the entity.
Use bid lists to define frequency caps, set frequency goals, and adjust bids based on the associated counter.

TIP: While these elements are individually configurable, for basic configurations, it is most efficient to use the frequency configuration endpoints, which allow you to set up counters, increments, and bid lists in one step.

For details on how to create and manage each element, see Frequency Management Tasks and APIs.

Understanding Fraction Notation and Pacing

Frequency caps are often represented using fraction notation, where the numerator represents the number of impressions, and the denominator represents the frequency cycle interval, typically expressed in hours or minutes. This notation, however, may cause confusion regarding ad delivery. For example, fractions such as 4/4 and 1/1 are equivalent mathematically, but they are not equivalent frequency caps.

Setting a frequency cap as 4 ads within 4 hours (4/4) does not guarantee that the user will see ads evenly distributed throughout 4 hours. It is possible that an active user may hit their f-cap within the first minute and not be served ads for the remaining 3 hours and 59 minutes left on the counter. To ensure a more even delivery, it is better to set a frequency cap as 1 ad within 1 hour (1/1).

IMPORTANT: Frequency cap numerators with the value of 1 allow the platform to space delivery more evenly and improve performance.

The following diagrams illustrate the distribution of impressions for the 4/4 and 1/1 frequency caps. Assuming a user is active every hour during these hours, the platform would deliver up to 8 ads within 8 hours in each use case.

1/0
1/0
1/0
1/0
1/0
1/0
1/0
1/0
4/4 F-capOver 8 HoursFor One User
1/1 F-capOver 8 HoursFor One User
4/0
1
2
3
0/4
1
2
3
= One Impression

The following diagrams illustrate the distribution of impressions for the same frequency caps but with the assumption that the user is online for a total of 4 hours within the 8-hour time period and is offline between hours 2 and 6.

1/0
1/0
1
0
1/0
4/4 F-capOver 8 HoursFor One User Offline Hours 2-6
1/1 F-capOver 8 HoursFor One User Offline Hours 2-6
2/0
1
2
3
4
0
1
= One Impression

FAQs

The following are some of the commonly asked questions about frequency.

What’s the difference between a frequency cap and frequency goal?

A frequency cap limits the number of impressions a user can see within a certain time period. See also Frequency Caps.

A frequency goal aims to reach the user within the ad group the desired number of times. It is not guaranteed that this goal will be reached, as user behavior cannot be controlled. See also Frequency Goals.

Does setting a frequency goal per interval mean the same users are retargeted for that interval?

No. After the first exposure, frequency goals work to prioritize bidding on the users seen before over new users to the ad group within the time interval selected. After the interval expires, the counter is reset and users become unknown again.

What happens if a frequency cap is changed mid-cycle?

If a frequency cap is changed in the middle of a frequency cycle, the system keeps track of previous counts and applies them to the new frequency cap.

How long does the lifetime frequency interval last?

For the duration of the flight of the ad group and two weeks of inactivity after it ends.

---

# Frequency Management Tasks and Endpoints

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/FrequencyTasks](https://partner.thetradedesk.com/v3/portal/api/doc/FrequencyTasks)

Frequency Management Tasks and Endpoints

The following sections list the endpoints for managing the frequency framework elements and provide high-level guidelines for using them:

Counters
Increments
Bid Lists

For common use cases and setup instructions, see the guides for frequency caps, goals, and bid adjustments.

TIP: For basic configurations, it is most efficient to use the frequency configuration endpoints, which allow you to set up counters, increments, and bid lists in one step.

Counters

A counter is a container that holds the user’s frequency count information (the number of times the user has seen the ad) and defines the time interval (the ResetIntervalInMinutes field) after which the counter is reset.

Here's what you need to know about counters:

Counters are the key frequency setting. Querying frequency configurations requires a valid counter ID.
Use as few counters as possible to cover unique combinations of ResetIntervalInMinutes and Increments in your strategy.
Counters retain user counts for approximately two weeks after a campaign ends. This may affect your data if you decide to reuse counters.
Delete any counters that are no longer needed. Deleting a counter will also delete any increment links that reference that counter.
Creating Counters

The following table lists the endpoints you can use to create counters.

Task	Endpoint	Configuration	Notes
Create a counter, its increments, and bid lists.	POST /v3/frequency/config	Basic	For example, see Frequency Caps or Frequency Goals.
Create an individual counter.	POST /v3/frequency/counter	Advanced	This is one step in a multi-step workflow of manually configuring frequency.
TIP: For basic configurations, it is most efficient to use the frequency configuration endpoints, which allow you to create and manage counters.
Create a counter while creating or updating a campaign.	POST /v3/campaign
PUT /v3/campaign	Basic	Specify the counter details in the NewFrequencyConfigs object of the request. For example, see Frequency Caps or Frequency Goals.
Create a counter while creating or updating an ad group.	POST /v3/adgroup
PUT /v3/adgroup	Basic	Specify the counter details in the NewFrequencyConfigs object of the request. For example, see Frequency Caps or Frequency Goals.
Retrieving Counters

The following table lists the endpoints you can use to retrieve counter information.

Task	Endpoint	Configuration	Notes
Retrieve details for a counter, its increments, and bid lists.	GET /v3/frequency/config/{counterId}	Basic	Use this endpoint to retrieve entire frequency configuration, including counter information and other details at the same time. For details, see Look up Frequency Configuration for a Counter.
Retrieve details for an individual counter.	GET /v3/frequency/counter/{counterId}	Advanced	Use this endpoint to look up only counter details with no increment or bid list details.
Retrieve a paged and filterable list of frequency counters for a specific advertiser or partner.	POST /v3/frequency/counter/query	Basic	N/A
Retrieve a paged and filterable list of frequency configurations, including counters, for a specific entity.	POST /v3/frequency/config/query	Basic	N/A
Look up Frequency Configuration for a Counter

To view the frequency information for a specific counter, include its ID as the path parameter in a GET /v3/frequency/config/{counterId} request.

For example, for a counter with the ID of 2gbda7q, a GET /v3/frequency/config/2gbda7q request may return the following configuration details, which include an ad group that increments the counter and a bid list with which the frequency configuration is associated.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
{
"Counter":{
"CounterId":"2gbda7q",
"AdvertiserId":"7ftzaer",
"ResetIntervalInMinutes":300,
"CounterName":"Basic Frequency - AG: 8hbtm7p, Reset: 300",
"CounterAttribute":"None"
},
"Increments":{
"AdGroups":[
"qzjt6yn"
]
},
"BidLists":[
{
"BidListId":"62220626",
"Name":"Default Frequency Cap List",
"BidListOwner":"AdGroup",
"BidListOwnerId":"qzjt6yn",
"NumberOfBidLines":1,
"BidListAdjustmentType":"TargetList",
"AssociatedAdGroups":[
"qzjt6yn"
],
"BidLines":[
{
"Range":{
"Min":0,
"Max":1
},
"VolumeControlPriority":"Neutral",
"BidAdjustment":1.000000
}
]
}
]
}
Updating Counters

The following table lists the endpoints you can use to update counters.

Task	Endpoint	Configuration	Notes
Update a counter, its increments, and bid lists.	PUT /v3/frequency/config	Basic	N/A
Update an individual counter.	PUT /v3/frequency/counter	Advanced	Using this endpoint is more efficient if you want to edit only a counter name or reset interval.
Deleting Counters

The following table lists the endpoint you can use to delete counters.

Task	Endpoint	Configuration
Delete an individual frequency counter and all of its associated increments, and bid lists.	DELETE /v3/frequency/config/{counterId}	Basic
Increments

Increments are entities (partners, advertisers, campaigns, and ad groups) that serve impressions to users and increase the user's frequency count for the associated counter.

Descendant entities affect increment the counters of their higher-level entities set as increments. For example, a partner set as an increment would increase the counter any time a user sees an ad for any ad groups for any of its advertisers' campaigns.

TIP: Use the entity-level inheritance to set up frequency increments at the appropriate levels and reduce manual tasks.

For example, to increment frequency counts for every ad group in a campaign, set the campaign to increment the counter rather than individual ad groups. If an ad group is added to the campaign after frequency is set up, the campaign-level increment will apply to the new ad group, whereas if individual ad groups are specified as increments, the new ad group will need to be manually added.

Creating Increments
Task	Endpoint	Configuration	Notes
Create a counter, its increments, and bid lists.	POST /v3/frequency/config	Basic	For example, see Frequency Caps or Frequency Goals.
Add an ad group as an increment to a counter.	POST /v3/adgroup
PUT /v3/adgroup	Advanced	To increase counts each time a user sees an ad for this ad group, list the frequency CounterIds in the Increments array.
Add a campaign as an increment to a counter.	POST /v3/campaign
PUT /v3/campaign	Advanced	To increase counts each time a user sees an ad for this campaign, including any of its ad groups, list the frequency CounterIds in the Increments array.
Add an advertiser as an increment to this counter.	POST /v3/advertiser
PUT /v3/advertiser	Advanced	To increase counts each time a user sees an ad for this advertiser, including all of its campaigns and ad groups, list the frequency CounterIds in the Increments array.
Retrieving Increments

The endpoints listed below return all increments as a list of CounterIds in the Increments array. To retrieve individual counter details, use the GET /v3/frequency/counter/{counterId} endpoint.

Task	Endpoint	Configuration
Retrieve all increments for a specific counter.	GET /v3/frequency/config/{counterId}	Basic
Retrieve all counters incremented by an ad group.	GET /v3/adgroup/{adGroupId}	Basic
Retrieve all counters incremented by a campaign.	GET /v3/campaign/{campaignId}	Basic
Retrieve all counters incremented by an advertiser.	GET /v3/advertiser/{advertiserId}	Basic
Updating Increments
Task	Endpoint	Configuration	Notes
Update a counter, its increments, and bid lists.	PUT /v3/frequency/config	Basic	N/A
Update an ad group as an increment to a counter.	POST /v3/adgroup
PUT /v3/adgroup	Advanced	Update CounterIds in the Increments array as needed.
Update a campaign as an increment to a counter.	POST /v3/campaign
PUT /v3/campaign	Advanced	Update CounterIds in the Increments array as needed.
Update an advertiser as an increment to a counter.	POST /v3/advertiser
PUT /v3/advertiser	Advanced	Update CounterIds in the Increments array as needed.
Removing Increments
Task	Endpoint	Configuration	Notes
Update a counter, its increments, and bid lists.	PUT /v3/frequency/config	Basic	Remove entities from the Increments object.
Remove an ad group as an increment to a counter.	POST /v3/adgroup
PUT /v3/adgroup	Advanced	Remove CounterIds from the Increments array.
Remove a campaign as an increment to a counter.	POST /v3/campaign
PUT /v3/campaign	Advanced	Remove CounterIds from the Increments array.
Remove an advertiser as an increment to a counter.	POST /v3/advertiser
PUT /v3/advertiser	Advanced	Remove CounterIds from the Increments array.
Bid Lists

Use bid lists to apply frequency caps, frequency goals, and bid adjustments to partners, advertisers, campaigns, and ad groups by specifying the counter to use and configuring the relevant adjustments. For details, see Frequency Bid Adjustments.

---

# Frequency Caps

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/FrequencyConfigurationBasicCaps](https://partner.thetradedesk.com/v3/portal/api/doc/FrequencyConfigurationBasicCaps)

Frequency Caps

A frequency cap, or an f-cap, limits the number of impressions a user can see within a given time period in a frequency cycle.

A frequency cap uses a counter, increments (entities like campaigns or ad groups that increment the counter), and a bid list of type TargetList. For details on the frequency framework elements and how pacing is affected by frequency caps, see Frequency.

Create Ad Group Frequency Caps

There are two ways of creating ad group frequency caps:

When creating or updating an ad group
By creating a frequency configuration

The following sections explain each process and provide examples for creating a 1/24 (hr) frequency cap.

TIP: If you want your ad group frequency cap configuration to appear editable in the platform UI, see FAQs.

Create Frequency Caps When Creating or Updating Ad Groups

To create a frequency cap when creating or updating an ad group, you need to set a minimum of the following values in an ad group's NewFrequencyConfigsobject of the respective POST /v3/adgroup or PUT /v3/adgroup request.

Here's what you need to know:

The NewFrequencyConfigs object is returned in the response only if you include it in the request.
If at least one frequency configuration in the request includes invalid values, the whole request will fail.

The following is a snippet of a POST /v3/adgroup request with the NewFrequencyConfigs object for creating a 1/24 frequency cap.

1
2
3
4
5
6
7
8
9
10
{
"AdGroupId": "adgr1234",
"NewFrequencyConfigs": [
{
"CounterName": "adgr1234 24 Hours",
"ResetIntervalInMinutes": 1440,
"FrequencyCap": 1
}
]
}
Frequency Configuration Properties

The following table explains the NewFrequencyConfigs object properties.

Property	Value Example	Description
CounterName	advt1234 24 Hours	An optional alphanumeric string with whitespace to identify the counter.
ResetIntervalInMinutes	1440	A positive integer that defines the time interval (in minutes) after which the frequency counter is reset to 0. This is the denominator in the frequency cap fraction in minutes, for example, 24 hr x 60 min = 1440 min.
FrequencyCap	1	A positive integer that specifies the maximum number of ads to be shown to a user during the time interval specified in ResetIntervalInMinutes. This is the numerator in the frequency cap fraction.



This request creates a counter, sets the ad group to increment the counter, and creates a bid list that will appear in all bid list endpoints, for example, as shown in the following example.

Frequency Cap Bid List Response Example

The following is an example of a bid list created from the NewFrequencyConfigs settings in the request above.

NOTE: Setting the BidListAdjustmentType to TargetList allows ad groups to bid on users who appear within the specified frequency range. Once the user's frequency count is beyond range, the platform no longer bids on ads for that user.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
{
"IsGlobal": false,
"BidListDimensions": [
"HasFrequencyV2AdjustmentId"
],
"BidListType": ,
"BidListId": "1234567",
"Name": "Auto-Generated",
"BidListSource": "User",
"BidListAdjustmentType": "TargetList",
"ResolutionType": "ApplyMinimumAdjustment",
"BidLines": [
{
"BidLineId": "2345678",
"BidAdjustment": 1,
"FrequencyRange":{
"CounterId": "count123",
"TimesShown": {
"Min": 0,
"Max": 1
}
}
}
],
"BidListOwner": "AdGroup",
"BidListOwnerId": "adgr1234",
"IsAvailableForLibraryUse": false
}
Create Ad Group Frequency Caps Using Frequency Configuration

To create an ad group frequency cap by configuring frequency, use the POST /v3/frequency/config endpoint and do the following:

Create a counter in the frequency configuration with at least the AdvertiserId of the advertiser who owns the counter and the ResetIntervalInMinutes to specify the frequency cycle.
Create a frequency cap bid list with the bid list adjustment of type TargetList, bid line max and min ranges, AdGroup as the BidListOwner, and other properties as shown in the following example.
To add the ad group in AssociatedAdGroups as an increment for this counter, set IncrementByAllEntitiesAssociatedWithBidLists to true.

The following is a snippet of a POST /v3/frequency/config request for creating a 1/24 frequency cap for an ad group.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
{
"Counter": {
"AdvertiserId": "advt1234",
"ResetIntervalInMinutes": 1440,
"CounterName": "advt1234 24 Hours"
},
"BidLists": [
{
"Name": "adgr1234 1/24 Frequency Cap",
"BidListOwner": "AdGroup",
"BidListOwnerId": "adgr1234",
"BidListAdjustmentType": "TargetList",
"AssociatedAdGroups": [
"adgr1234"
],
"BidLines": [
{
"Range": {
"Min": 0,
"Max": 1
},
"BidAdjustment": 1
}
]
}
],
"IncrementByAllEntitiesAssociatedWithBidLists": true
}

The following tables explain the property values in the above request.

Counter Properties
Property	Value Example	Description
AdvertiserId	advt1234	The platform ID of the advertiser that owns this counter. This value cannot be updated after creation.
ResetIntervalInMinutes	1440	A positive integer that defines the time interval (in minutes) after which the frequency counter is reset to 0. This is the denominator in the frequency cap fraction in minutes, for example, 24 hr x 60 min = 1440 min.
CounterName	advt1234 24 Hours	An optional alphanumeric string with whitespace to identify the counter.
Bid List Properties
Property	Value Example	Description
Name	adgr1234 1/24 Frequency Cap	An alphanumeric string with whitespace to identify the bid list.
BidListOwner	AdGroup	The type of the owner of this bid list.
BidListOwnerId	adgr1234	The ID of the ad group that owns the bid lis.
BidListAdjustmentType	TargetList	Setting the BidListAdjustmentType to TargetList allows the ad group to bid only on users who appear within the specified frequency range. Once the user's frequency count is beyond the range, they are no longer served ads.
BidLines.Range.Min	0	The minimum number of times to show an ad to a user within the counter's ResetIntervalInMinutes.
To include users who have not yet seen the ad, set this value to 0.
BidLines.Range.Max	1	The maximum number of times to show an ad to a user within the counter's ResetIntervalInMinutes. This is the numerator in the frequency cap fraction.
BidLines.BidAdjustment	1	Bid lines in a TargetList must always be set to 1.
Create Campaign Frequency Caps

There are two ways of creating campaign frequency caps:

When creating or updating a campaign
By creating a frequency configuration

The following sections explain each process and provide examples for creating a 5/10080 (min) frequency cap.

Create Frequency Caps When Creating or Updating Campaigns

To create a frequency cap when creating or updating a campaign, you need to set a minimum of the following values in a campaign's NewFrequencyConfigs object of the respective POST /v3/campaign or PUT /v3/campaign request.

Here's what you need to know:

The NewFrequencyConfigs object is returned in the response only if you include it in the request.
If at least one frequency configuration in the request includes an invalid value, the whole request will fail.

The following is a snippet of a POST /v3/campaign request with the NewFrequencyConfigs object for creating a 5/10080 frequency cap.

1
2
3
4
5
6
7
8
9
10
{
"CampaignId": "camp1234",
"NewFrequencyConfigs": [
{
"CounterName": "camp1234 One Week",
"ResetIntervalInMinutes": 10080,
"FrequencyCap": 5
}
]
}
Frequency Configuration Properties

The following table explains the NewFrequencyConfigs object properties.

Property	Value Example	Description
CounterName	camp1234 One Week	An optional alphanumeric string with whitespace to identify the counter.
ResetIntervalInMinutes	10080	A positive integer that defines the time interval (in minutes) after which the frequency counter is reset to 0. This is the denominator in the frequency cap fraction in minutes.
FrequencyCap	5	A positive integer that specifies the maximum number of ads to be shown to a user during the time interval specified in ResetIntervalInMinutes. This is the numerator in the frequency cap fraction.
Create Campaign Frequency Caps Using Frequency Configuration

To create a campaign frequency cap by configuring frequency, use the POST /v3/frequency/config endpoint and do the following:

Create a counter in the frequency configuration with at least the AdvertiserId of the advertiser who owns the counter and the ResetIntervalInMinutes to specify the frequency cycle.
Create a frequency cap bid list with the bid list adjustment of type TargetList, bid line max and min ranges, Campaign as the BidListOwner, and other properties as shown in the following example.
To add the campaign in AssociatedCampaigns as an increment for this counter, set IncrementByAllEntitiesAssociatedWithBidLists to true.

The following is a snippet of a POST /v3/frequency/config request for creating a 5/10080 frequency cap for a campaign.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
{
"Counter": {
"AdvertiserId": "advt1234",
"ResetIntervalInMinutes": 10080,
"CounterName": "advt1234 One Week"
},
"BidLists": [
{
"Name": "camp1234 5/10080 Frequency Cap",
"BidListOwner": "Campaign",
"BidListOwnerId": "camp1234",
"BidListAdjustmentType": "TargetList",
"AssociatedCampaigns": [
"camp1234"
],
"BidLines": [
{
"Range": {
"Min": 0,
"Max": 5
},
"BidAdjustment": 1
}
]
},
],
"IncrementByAllEntitiesAssociatedWithBidLists": true
}

The following tables explain the property values in the above request.

Counter Properties
Property	Value Example	Description
AdvertiserId	advt1234	The platform ID of the advertiser that owns this counter. This value cannot be updated after creation.
ResetIntervalInMinutes	10080	A positive integer that defines the time interval (in minutes) after which the frequency counter is reset to 0. This is the denominator in the frequency cap fraction in minutes.
CounterName	advt1234 One Week	An optional alphanumeric string with whitespace to identify the counter.
Bid List Properties
Property	Value Example	Description
Name	camp1234 5/10080 Frequency Cap	An alphanumeric string with whitespace to identify the bid list.
BidListOwner	Campaign	The type of the owner of this bid list.
BidListOwnerId	camp1234	The ID of the campaign that owns the bid list.
BidListAdjustmentType	TargetList	Setting the BidListAdjustmentType to TargetList allows the campaign's ad groups to bid only on users who appear within the specified frequency range. Once the user's frequency count is beyond the range, they are no longer served ads.
BidLines.Range.Min	0	The minimum number of times to show an ad to a user within the counter's ResetIntervalInMinutes.
To include users who have not yet seen the ad, set this value to 0.
BidLines.Range.Max	5	The maximum number of times to show an ad to a user within the counter's ResetIntervalInMinutes. This is the numerator in the frequency cap fraction.
BidLines.BidAdjustment	1	Bid lines in a TargetList must always be set to 1.
FAQs

The following is a list of commonly asked questions about frequency caps.

How do I make sure that users can edit my ad group frequency cap configuration in the platform UI?

To make your frequency cap configuration editable in the platform UI, be sure to follow these requirements when creating it:

Create only one counter per ad group. If you reuse counters on multiple ad groups, you will not be able to edit values in the UI without using the Override Values button.
Associate and enable only one frequency cap bid list for the ad group. The bid list must be owned by the same ad group.
Make sure that the ad group’s Increments list includes the same counter ID as the bid list associated with the ad group.
If you are defining both a frequency cap and a frequency goal for an ad group, use separate counters, even if the cap and goal have the same reset interval.


---

# Frequency Goals

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/FrequencyConfigurationBasicGoals](https://partner.thetradedesk.com/v3/portal/api/doc/FrequencyConfigurationBasicGoals)

Frequency Goals

A frequency goal specifies the preferred number of impressions to be targeted for a user. The platform optimizes toward the number of impressions set as the frequency goal. For example, users who have already seen an ad are favored to see another impression over unknown users until the specified frequency goal is reached.

A frequency goal uses a counter, increments (entities like campaigns or ad groups that increment the counter), and an Optimized bid list with the VolumeControlPriority property set to FrequencyGoal. For details on the frequency framework elements, see Frequency.

IMPORTANT: Frequency goals must have the minimum range of 1 per 24 hours.

Create Ad Group Frequency Goals

There are two ways of creating ad group frequency goals:

When creating or updating an ad group
By creating a frequency configuration

The following sections explain each process and provide examples for creating a 1/24 (hr) frequency goal. See also Understanding Fraction Notation and Pacing.

TIP: If you want your ad group frequency goal configuration to appear editable in the platform UI, see FAQs.

Create Frequency Goals When Creating or Updating Ad Groups

To create a frequency goal when creating or updating an ad group, you need to set a minimum of the following values in the ad group's NewFrequencyConfigsobject of the respective POST /v3/adgroup or PUT /v3/adgroup request.

Here's what you need to know:

The NewFrequencyConfigs object is returned in the response only if you include it in the request.
If at least one frequency configuration in the request includes invalid values, the whole request will fail.

The following is a snippet of a POST /v3/adgroup request with the NewFrequencyConfigs object for creating a 1/24 frequency goal.

1
2
3
4
5
6
7
8
9
10
{
"AdGroupId": "adgr1234",
"NewFrequencyConfigs": [
{
"CounterName": "adgr1234 24 Hours",
"ResetIntervalInMinutes": 1440,
"FrequencyGoal": 2
}
]
}
Frequency Configuration Properties

The following table explains the NewFrequencyConfigs object properties.

Property	Value Example	Description
CounterName	adgr1234 24 Hours	An optional alphanumeric string with whitespace to identify the counter.
ResetIntervalInMinutes	1440	A positive integer that defines the time interval (in minutes) after which the frequency counter is reset to 0. This is the denominator in the frequency goal fraction in minutes, for example, 24 hr x 60 min = 1440 min.
FrequencyGoal	2	A positive integer that specifies the minimum number of ads to be shown to a user during the time interval specified in ResetIntervalInMinutes. For example, the value of 2 targets users who have been exposed to an ad once, while the value of 1 targets only new users, which may have a dramatic impact on bidding.
NOTE: The system will try to reach each user the designated number of times. It is not guaranteed that every user will reach this target, as user behavior cannot be controlled.



This request creates a counter, sets the ad group to increment the counter, and creates a bid list that will appear in all bid list endpoints, for example, as shown in the following example.

Frequency Goal Bid List Response Example

The following is an example of a bid list created from the NewFrequencyConfigs settings in the request above.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
{
"IsGlobal": true,
"BidListDImensions": [
"HasFrequencyV2AdjustmentId"
],
"BidListType": ,
"BidListId": "1234567",
"Name": "Auto-Generated",
"BidListSource": "User",
"BidListAdjustmentType": "Optimized",
"ResolutionType": "ApplyMinimumAdjustment",
"BidLines": [
{
"BidLineId": "2345678",
"BidAdjustment": 1,
"FrequencyRange":{
"CounterId": "count123",
"TimesShown": {
"Min": 0,
"Max": 1
},
"VolumeControlPriority": "FrequencyGoal"
}
}
],
"BidListOwner": "AdGroup",
"BidListOwnerId": "adgr1234",
"IsAvailableForLibraryUse": false
}
Create Ad Group Frequency Goals Using Frequency Configuration

To create an ad group frequency goal by configuring frequency, use the POST /v3/frequency/config endpoint and do the following:

Create a counter in the frequency configuration with at least the AdvertiserId of the advertiser who owns the counter and the ResetIntervalInMinutes to specify the frequency cycle.
Create a frequency goal bid list with the bid list adjustment of type Optimized, bid line max and min ranges, the bid line VolumeControlPriority property set to FrequencyGoal, AdGroup as the BidListOwner, and other properties as shown in the following example.
To add the ad group in AssociatedAdGroups as an increment for this counter, set IncrementByAllEntitiesAssociatedWithBidLists to true.

The following is a snippet of a POST /v3/frequency/config request for creating a 1/24 frequency goal for an ad group.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
{
"Counter":{
"AdvertiserId":"advt1234",
"ResetIntervalInMinutes":1440,
"CounterName":"advt1234 24 Hours"
},
"BidLists":[
{
"Name":"adgr1234 1/24 Frequency Goal",
"BidListOwner":"AdGroup",
"BidListOwnerId":"adgr1234",
"BidListAdjustmentType":"Optimized",
"ResolutionType":"ApplyMultiplyAdjustment",
"AssociatedAdGroups":[
"adgr1234"
],
"BidLines":[
{
"Range":{
"Min":0,
"Max":2
},
"BidAdjustment":1,
"VolumeControlPriority":"FrequencyGoal"
}
]
}
],
"IncrementByAllEntitiesAssociatedWithBidLists":true
}

The following tables explain the property values in the above request.

Counter Properties
Property	Value Example	Description
AdvertiserId	advt1234	The platform ID of the advertiser that owns this counter. This value cannot be updated after creation.
ResetIntervalInMinutes	1440	A positive integer that defines the time interval (in minutes) after which the frequency counter is reset to 0. This is the denominator in the frequency goal fraction in minutes, for example, 24 hr x 60 min = 1440 min.
CounterName	advt1234 24 Hours	An optional alphanumeric string with whitespace to identify the counter.
Bid List Properties
Property	Value Example	Description
Name	adgr1234 1/24 Frequency Goal	An alphanumeric string with whitespace to identify the bid list.
BidListOwner	AdGroup	The type of the owner of this bid list.
BidListOwnerId	adgr1234	The ID of the ad group that owns the bid list.
BidListAdjustmentType	Optimized	Setting the BidListAdjustmentType to Optimized allows the bid list to set the bid line VolumeControlPriority to FrequencyGoal.
BidLines.Range.Min	0	The minimum number of times to show an ad to a user within the counter's ResetIntervalInMinutes.
To include users who have not yet seen the ad, set this value to 0.
BidLines.Range.Max	2	The maximum number of times to show an ad to a user within the counter's ResetIntervalInMinutes. This is the numerator in the frequency goal fraction.
BidLines.BidAdjustment	1	Bid lines in a bid list using VolumeControlPriority must always have their bid adjustment set to 1.
BidLines.VolumeControlPriority	FrequencyGoal	The volume control priority to apply to this adjustment.
Create Campaign Frequency Goals

There are two ways of creating campaign frequency goals:

When creating or updating an campaign
By creating a frequency configuration

The following sections explain each process and provide examples for creating a 1/24 (hr) frequency goal. See also Understanding Fraction Notation and Pacing.

Create Frequency Goals When Creating or Updating Campaigns

To create a frequency goal when creating or updating a campaign, you need to set a minimum of the following values in the campaign's NewFrequencyConfigsobject of the respective POST /v3/campaign or PUT /v3/campaign request.

Here's what you need to know:

The NewFrequencyConfigs object is returned in the response only if you include it in the request.
If at least one frequency configuration in the request includes an invalid value, the whole request will fail.

The following is a snippet of a POST /v3/campaign request with the NewFrequencyConfigs object for creating a 1/24 frequency goal.

1
2
3
4
5
6
7
8
9
10
{
"CampaignId": "camp1234",
"NewFrequencyConfigs": [
{
"CounterName": "camp1234 24 Hours",
"ResetIntervalInMinutes": 1440,
"FrequencyGoal": 2
}
]
}
Frequency Configuration Properties

The following table explains the NewFrequencyConfigs object properties.

Property	Value Example	Description
CounterName	adgr1234 24 Hours	An optional alphanumeric string with whitespace to identify the counter.
ResetIntervalInMinutes	1440	A positive integer that defines the time interval (in minutes) after which the frequency counter is reset to 0. This is the denominator in the frequency goal fraction in minutes, for example, 24 hr x 60 min = 1440 min.
FrequencyGoal	2	A positive integer that specifies the minimum number of ads to be shown to a user during the time interval specified in ResetIntervalInMinutes. For example, the value of 2 targets users who have been exposed to an ad once, while the value of 1 targets only new users, which may have a dramatic impact on bidding.
NOTE: The system will try to reach each user the designated number of times. It is not guaranteed that every user will reach this target, as user behavior cannot be controlled.
Create Campaign Frequency Goals Using Frequency Configuration

To create a campaign frequency goal by configuring frequency, use the POST /v3/frequency/config endpoint and do the following:

Create a counter in the frequency configuration with at least the AdvertiserId of the advertiser who owns the counter and the ResetIntervalInMinutes to specify the frequency cycle.
Create a frequency goal bid list with the bid list adjustment of type Optimized, bid line max and min ranges, the bid line VolumeControlPriority property set to FrequencyGoal, Campaign as the BidListOwner, and other properties as shown in the following example.
To add the campaign in AssociatedCampaigns as an increment for this counter, set IncrementByAllEntitiesAssociatedWithBidLists to true.

The following is a snippet of a POST /v3/frequency/config request for creating a 1/24 frequency goal for a campaign.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
{
"Counter":{
"AdvertiserId":"advt1234",
"ResetIntervalInMinutes":1440,
"CounterName":"advt1234 24 Hours"
},
"BidLists":[
{
"Name":"camp1234 1/24 Frequency Goal",
"BidListOwner":"Campaign",
"BidListOwnerId":"camp1234",
"BidListAdjustmentType":"Optimized",
"ResolutionType":"ApplyMultiplyAdjustment",
"AssociatedCampaigns":[
"camp1234"
],
"BidLines":[
{
"Range":{
"Min":0,
"Max":2
},
"BidAdjustment":1,
"VolumeControlPriority":"FrequencyGoal"
}
]
}
],
"IncrementByAllEntitiesAssociatedWithBidLists":true
}

The following tables explain the property values in the above request.

Counter Properties
Property	Value Example	Description
AdvertiserId	advt1234	The platform ID of the advertiser that owns this counter. This value cannot be updated after creation.
ResetIntervalInMinutes	1440	A positive integer that defines the time interval (in minutes) after which the frequency counter is reset to 0. This is the denominator in the frequency goal fraction in minutes, for example, 24 hr x 60 min = 1440 min.
CounterName	advt1234 24 Hours	An optional alphanumeric string with whitespace to identify the counter.
Bid List Properties
Property	Value Example	Description
Name	camp1234 1/24 Frequency Goal	An alphanumeric string with whitespace to identify the bid list.
BidListOwner	Campaign	The type of the owner of this bid list.
BidListOwnerId	camp1234	The ID of the campaign that owns the bid list.
BidListAdjustmentType	Optimized	Setting the BidListAdjustmentType to Optimized allows the bid list to set the bid line VolumeControlPriority to FrequencyGoal.
BidLines.Range.Min	0	The minimum number of times to show an ad to a user within the counter's ResetIntervalInMinutes.
To include users who have not yet seen the ad, set this value to 0.
BidLines.Range.Max	2	The maximum number of times to show an ad to a user within the counter's ResetIntervalInMinutes. This is the numerator in the frequency goal fraction.
BidLines.BidAdjustment	1	Bid lines in a bid list using VolumeControlPriority must always have their bid adjustment set to 1.
BidLines.VolumeControlPriority	FrequencyGoal	The volume control priority to apply to this adjustment.
FAQs

The following is a list of commonly asked questions about frequency caps.

How do I make sure that users can edit my ad group frequency goal configuration in the platform UI?

To make your frequency goal configuration editable in the platform UI, be sure to follow these requirements when creating it:

Create only one counter per ad group. If you reuse counters on multiple ad groups, you will not be able to edit values in the UI without using the Override Values button.


Associate and enable only one frequency cap bid list for the ad group. The bid list must be owned by the same ad group.


Make sure that the ad group’s Increments list includes the same counter ID as the bid list associated with the ad group.


If you are defining both a frequency cap and a frequency goal for an ad group, use separate counters, even if the cap and goal have the same reset interval.


---

# Frequency Bid Adjustments

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/FrequencyConfigurationBasicBidAdjustments](https://partner.thetradedesk.com/v3/portal/api/doc/FrequencyConfigurationBasicBidAdjustments)

Frequency Bid Adjustments

Frequency bid adjustments update bid amounts for a user based on the number of impressions seen within the frequency cycle. A frequency range in a bid line specifies the minimum and maximum number of impressions to be shown to a user. Multiple bid adjustments for individual frequency ranges may be grouped to increase or decrease bidding for users who have seen an ad a certain number of times over a specified time period.

Here's what you need to know about frequency bid adjustments:

Frequency bid adjustments can be used in conjunction with frequency caps to fine tune the ad group strategy.
The bid list adjustment should be of type Optimized.
Bid lists with multiple bid adjustments may have gaps between ranges.
Any impressions that do not match the specified frequency ranges are treated as though their BidAdjustment is set to 1.
To create a frequency range that extends to the lifetime maximum for a user, set the TimesShown.Max value to 2147483647.

IMPORTANT: To avoid unintentionally inflating bid prices, use frequency ranges that are sequential and do not overlap.

For example, if a bid list includes the following two overlapping frequency ranges within the same bid list, the final bid adjustment will be calculated as 3.5 for an impression that matches both ranges.

0-3 times per 1 week with a bid adjustment of 2
2-4 times per 1 month with a bid adjustment of 1.5
Creating Bid Lists with Multiple Frequency Bid Adjustments

To create a bid list with multiple frequency bid adjustments, use the POST /v3/frequency/config endpoint and do the following:

Create a counter in the frequency configuration with at least the AdvertiserId of the advertiser who owns the counter and the ResetIntervalInMinutes to specify the frequency cycle.
Create a bid list with the bid list adjustment of type Optimized, bid lines with the sequential max and min ranges, AdGroup as the BidListOwner, and other properties as shown in the following example.
To add the ad group in AssociatedAdGroups as an increment for this counter, set IncrementByAllEntitiesAssociatedWithBidLists to true.

For example, the following POST /v3/frequency/config request sample illustrates how to create a bid list with the following three frequency ranges and bid adjustments for a 4-week interval:

Range Description	Min	Max	Bid Adjustment
No ads seen yet / first ad to be shown	0	1	1.75
Ad seen 1-4 times / to show ad 2-5 times	1	5	1.5
Ad seen 5-9 times / to show ad 6-10 times	5	10	1.25

Here's a request example:

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
{
"Counter":{
"AdvertiserId":"advt1234",
"ResetIntervalInMinutes":40320,
"CounterName":"advt1234 Four Weeks"
},
"BidLists":[
{
"Name":"adgr1234 Four Week Frequency",
"BidListOwner":"AdGroup",
"BidListOwnerId":"adgr1234",
"BidListAdjustmentType":"Optimized",
"ResolutionType":"ApplyMultiplyAdjustment",
"AssociatedAdGroups":[
"adgr1234"
],
"BidLines":[
{
"Range":{
"Min":0,
"Max":1
},
"BidAdjustment":1.75
},
{
"Range":{
"Min":1,
"Max":5
},
"BidAdjustment":1.5
},
{
"Range":{
"Min":5,
"Max":10
},
"BidAdjustment":1.25
}
]
}
],
"IncrementByAllEntitiesAssociatedWithBidLists":true
}

The following tables explain the property values in the above request.

Counter Properties
Property	Value Example	Description
AdvertiserId	advt1234	The platform ID of the advertiser that owns this counter. This value cannot be updated after creation.
ResetIntervalInMinutes	40320	A positive integer that defines the time interval (in minutes) after which the frequency counter is reset to 0. This is the denominator in the frequency cap fraction in minutes, for example, 4 weeks x 60 min = 40320 min.
CounterName	advt1234 Four Weeks	An optional alphanumeric string with whitespace to identify the counter.
Bid List Properties
Property	Value Example	Description
Name	adgr1234 Four Week Frequency	An alphanumeric string with whitespace to identify the bid list.
BidListOwner	AdGroup	The type of the owner of this bid list.
BidListOwnerId	adgr1234	The ID of the owning ad group.
BidListAdjustmentType	Optimized	The bid list adjustment type.
BidLines.Range.Min	N/A	The respective minimum number of times to show an ad to a user within the counter's ResetIntervalInMinutes for each frequency range in the bid list.
BidLines.Range.Max	N/A	The respective maximum number of times to show an ad to a user within the counter's ResetIntervalInMinutes for each frequency range in the bid list.
BidLines.BidAdjustment	N/A	The respective bid list adjustment amount for each frequency range in the bid list.

---

# Custom Optimization Algorithms

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/CustomOptimizationAlgorithms](https://partner.thetradedesk.com/v3/portal/api/doc/CustomOptimizationAlgorithms)

Custom Optimization Algorithms

The Trade Desk offers the following custom optimization algorithms:

Algorithm	Description
Dimensional Bidding	As a feature, dimensional bidding allows you to apply one bid factor to a combination of target vector values. For example, you could apply a bid factor of 3.14 to the combination of mobile (device type) and Singapore (geo). If you targeted each of those vectors separately with a different bid factor, your two bid factors would multiply together. Multiplying multiple bid factors together to target precise, high-value market niches can result in unnecessarily high bids, which may result in the need for a max bid to act as a cap on your bid possibilities. To solve for this, you can extend your current ad group strategy with dimensional bidding to look for small pockets of high value while avoiding an exponential rise in bid value.
User Scoring	By default, ad groups assign all users in an audience the same base bid for each impression. User scoring provides an opportunity to assign a discrete bid value for each user, thus allowing a partner to override an ad group's base bid when creating data segments in The Trade Desk platform. This functionality combined with the data available in REDS solves the problem of determining the value of users that haven't been seen before.

---

# Dimensional Bidding Custom Algorithms

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/BYOADimensionalBidding](https://partner.thetradedesk.com/v3/portal/api/doc/BYOADimensionalBidding)

Dimensional Bidding Custom Algorithms

Dimensional bidding is a feature that allows you to apply one bid factor to a combination of target vector values. For example, you could apply a bid factor of 3.14 to the combination of mobile (device type) and Singapore (geo). If you targeted each of those vectors separately with a different bid factor, your two bid factors would multiply together. Multiplying multiple bid factors together to target precise, high-value market niches can result in unnecessarily high bids, which may result in the need for a max bid to act as a cap on your bid possibilities. To solve for this, you can extend your current ad group strategy with dimensional bidding to look for small pockets of high value while avoiding an exponential rise in bid value.

The following diagram illustrates the workflow process.

Data Source Configuration

Dimensional bidding is key performance indicator (KPI)-agnostic, so it doesn't matter whether you choose CTR, CPA, or something else as your goal. Dimensional bidding is represented as a list of item combinations, and each bid list is accessible at a selected level in your platform architecture. The code samples below assume an ad group level bid list.

This guide uses data from the REDS service as its input source, but you can use any data available to you to tailor your bidding strategy. The KPI you choose will determine the type of REDS events that you need to ingest.

CPA	CTR	CPC	CPCV	TVCR	Viewability
Impressions	*	*	*	*	*	*
Conversions	*
Clicks	*	*	*
Video Events				*	*	*
Considerations

To create a bid list with more than two dimensions, like the examples in this article, please contact your Account Manager.

Maintaining multiple bid lists opens up the possibility of finding different kinds of small, high-value pockets of inventory. However, each bid list must contain a distinct combination type (e.g., site and geo, device type and ad environment, etc.).
Consider using the bid list at a single ad group level first, and, if the results are successful, copy the bid list to use in multiple ad groups under the same campaign or advertiser.
With dimensional bidding, you trade bid scale for specificity. To maintain scale, bear in mind that not all targeting needs to be made of bid combinations. By forcing your ad group's strategy into a bid list, you may risk losing the capability to bid competitively on a wider swath of the QPS (queries per second) available to you. Setting bid factors for vector combinations naturally limits the scope of what the ad group can bid on, as it requires the exact combination to be present in order to bid, rather than being able to bid on either of the vectors independently of each other.
You may want to incorporate statistical tests to show whether or not using dimensional bidding had a meaningful effect on your ad group's KPI. Assuming independence between one ad group without dimensional bidding and a test ad group with dimensional bidding, you could, as one example, implement an unpaired two-sample "T" test.
Identifying and Ingesting Data

Once you've selected your data source and selected the appropriate ad groups, you will be able to begin ingesting and parsing data.

Data Retrieval

Prior Knowledge Needed and Call-Outs

Before reading further, please familiarize yourself with the background information and best practices on our REDS page. This data analysis for dimensional bidding is performed with the logs provided by this service.
Download the Python code sample that walks you through retrieval of your log-level data from Amazon S3.

Below, you will find a Python code snippet that connects to the Amazon s3 API via a Boto package (2.x version) to retrieve two types of data events: impressions and conversions.

Each new data logs' rows are appended to a single CSV file, which occurs inside the function ingestGzipLogs.

The final result includes two master CSV data files:

One file for impressions
One file for clicks

You can reconfigure this code snippet to allow for more frequent retrievals of the data, as opposed to a one-day batch retrieval, depending on your individual needs.

3.1.1 Ingest Logs - Python Code Sample
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
def ingestGzipLogs(dateFilter):
for key in mybucket.list(FILTER_PATH + str(dateFilter)):
logName = key.name
if "impressions" in logName:
key = ReadOnce(key)
gz_file = gzip.GzipFile(fileobj=key, mode='rb')
for line in gz_file:
newLine = line.decode('utf-8').split('\t')
with open(impCSV, "a") as output:
writer = csv.writer(output)
writer.writerow(newLine)
elif "clicks" in logName:
key = ReadOnce(key)
gz_file = gzip.GzipFile(fileobj=key, mode='rb')
for line in gz_file:
newLine = line.decode('utf-8').split('\t')
with open(clicksCSV, "a") as output2:
writer = csv.writer(output2)
writer.writerow(newLine)
else:
continue

You will use the impression and click data to calculate CTR distributions at the ad group level for a particular dimensional bidding combination.

Analysis and Data Transformation

In this section, we'll be using the R language (with its quick prototyping advantages) to look at the main themes of performing data analysis and transformation.

Download R sample code to guide you through the data-transformation operations.

Reading CSV Files

To start, you can use the fread function from the data.table library package (as a faster alternative to read.table or read.csv) to quickly read your two CSV files from the initial retrieval. You may use functions such as dim(impData) or summary(impData) to get a general understanding of the dimensions of the data set, basic statistics along each column, and whether there are missing values.

1
2
3
4
5
6
7
8
impData <- fread("./DA_impressions_2018-02-16.csv", header = FALSE)
colnames(impData) <- c("logentryTime", "impID", "partnerID", "advertiserID", "campaignID", "adgroupID", "privateContractID",
"audienceID", "creativeID", "adformat", "frequency", "ssp", "publisherID", "dealID", "site", "referrerCatList", "foldPosition",
"userHourOfWeek",
"userAgent", "IPAddress", "TDID", "country", "region", "metro", "city", "deviceType", "OSFamily", "OS", "browser", "recency",
"languageCode", "mediaCost", "feeFeatureCost", "dataUsageCost", "TTDCost", "partnerCost",
"advertiserCost", "lat", "long", "deviceID", "zipcode", "processedTime", "deviceMake", "deviceModel", "renderingContext", "carrierID",
"tempCelsius", "tempBucketStartCelsius", "tempBucketEndCelsius","placementID")
#provide header for impressions data
clicksData <- fread("./CLICKS_DATA.csv", header = FALSE)
colnames(clicksData) <- c("logentryTime", "clickID", "IPAddress", "referrerURL", "redirectURL", "campaignID", "channelID",
"advertiserID", "displayImpressionID", "keyword", "keywordID", "matchType", "distributionNetwork", "TDID", "rawURL", "processedTime",
"deviceID")
#provide header for click data

The sample code above assumes that you want to produce a range of dimensional bidding combinations for every ad group under the partner. Of course, you do have the option to filter down to the appropriate subset of data.

The first major code snippet showcases the importance of choosing the most appropriate dimensional-bidding combination for your ad group. In this example, you may believe that the combination of SSP, publisher ID, site, and impression placement ID could be important. You can also experiment with different kinds of combinations in parallel to see which perform best.

1
2
subImpData <- impData2 %>% select(impID, advertiserID, campaignID, adgroupID, ssp, publisherID, site, placementID)
subImpData$SPSPID = paste(subImpData$ssp, subImpData$publisherID, subImpData$site, subImpData$placementID, sep="_")

Following your selection of specific combinations, you can then determine how to handle the calculation of the click-through rates (CTRs) for each combination (in this case, the combination of SSP, publisher, site, and impression placement ID). The CTR ratio requires the numerator count, or the number of times a combination has appeared for a specific campaign and ad group.

1
2
3
4
clickCountData <- joinedData %>% add_count(campaignID.x, adgroupID, SPSPID)
allCountData <- subImpData %>% add_count(campaignID, adgroupID)
colnames(clickCountData)[colnames(clickCountData)=="n"] <- "numeratorCTR"
colnames(allCountData)[colnames(allCountData)=="n"] <- "denominatorCTR"

Then, you can merge these datasets together to perform the CTR calculation.

joinedData2 <- merge(allCountData, clickCountData, by.x = 'impID', by.y = 'impID', all.x = TRUE)

Finally, using the "dplyr" package under R, you can string together a sequence of data transformations to finish the calculation.

transformedData <- joinedData2 %>% select(campaignID, adgroupID.x, SPSPID.x, numeratorCTR, denominatorCTR) %>% group_by(campaignID,
adgroupID.x) %>% mutate(ctr = numeratorCTR/denominatorCTR)

If you wanted to create distributions of CTR values per campaign and ad group, you could calculate the mean CTR and standard deviation of that distribution.

transformedData2 <- transformedData %>% group_by(campaignID, adgroupID.x) %>% mutate(ctrThreshold = mean(ctr) + sd(ctr))

With the above calculations finished, you could create a mathematical threshold that equates to keeping any combination that is one standard deviation above the mean for relatively high performance. In other words, you are employing a rule-based model to affect what the ad group optimizations should look like. There is also an additional step in which a "sdFactor" is calculated that effectively becomes the bid factor for a specific combination. This represents how far the calculated CTR is above the determined threshold (in a ratio term). Please note that the 0.1 constant dampens the effect of the sdFactor because of high variability based on one day's worth of won impressions.

1
2
3
transformedData3 <- transformedData2 %>% group_by(campaignID, adgroupID.x) %>% mutate(sdFactor = 0.1*(ctr/ctrThreshold))
transformedData3 <- unique(transformedData3, by = c("campaignID", "adgroupID.x", "SPSPID.x"))
finalData <- transformedData3 %>% filter(ctr >= ctrThreshold & ctr > 0)
Activate

Now it is time to activate the outcomes, which are the sdFactors from the previous step, via the Dimensional Bidding API.

Format Data Into A JSON Bid List

You can start by creating a subset on one ad group in the final dataset in R.

finalData[finalData$adgroupID.x =='ADGROUP_ID',][,3:8]

This results in the following:

The goal is to take the sdFactors and feed them into a dimensional-bidding bid list JSON structure, shown in the following request.

POST /v3/bidlist Request

In this example, we are creating the BidList at the AdGroup level.

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
{
"Name": "Bidlist 1",
"BidListAdjustmentType": "Optimized",
"ResolutionType": "ApplyMultiplyAdjustment",
"BidLines": [
{
"BidAdjustment": 1.02,
"DomainFragment": "com.strawdogstudios.simonscatcrunchtime",
"SupplyVendorId": 99,
"PublisherId": "FYBER-139222",
"ImpressionPlacementValue": "530c4d2894e444a1976f41d527c03a07"
},
{
"BidAdjustment": 1.02,
"DomainFragment": "com.pandora.android",
"SupplyVendorId": 50,
"PublisherId": "71711271",
"ImpressionPlacementValue": "cKClcPNTu1Te"
},
{
"BidAdjustment": 1.02,
"DomainFragment": "com.merriamwebster",
"SupplyVendorId": 118,
"PublisherId": "11653",
"ImpressionPlacementValue": "177976"
},
{
"BidAdjustment": 2.03,
"DomainFragment": "com.cardgame.solitaire.flat",
"SupplyVendorId": 1,
"PublisherId": "f77344fc701f4b1f981238390e0b8ffb",
"ImpressionPlacementValue": "f37ac1804f8040a4b49295e5d13167ff"
}
],
"BidListOwner": "AdGroup",
"BidListOwnerId": "sberg7l"
}
POST /v3/bidlist Response
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
49
50
51
{
"IsGlobal": false,
"BidListDimensions": [
"HasDomainFragmentId",
"HasSupplyVendorId",
"HasImpressionPlacementId",
"HasPublisherId"
],
"BidListId": "2131712",
"Name": "Bidlist 1",
"BidListSource": "User",
"BidListAdjustmentType": "Optimized",
"ResolutionType": "ApplyMultiplyAdjustment",
"BidLines": [
{
"BidLineId": "1216340",
"BidAdjustment": 2.030000,
"DomainFragment": "com.cardgame.solitaire.flat",
"SupplyVendorId": 1,
"PublisherId": "f77344fc701f4b1f981238390e0b8ffb",
"ImpressionPlacementValue": "f37ac1804f8040a4b49295e5d13167ff"
},
{
"BidLineId": "1216341",
"BidAdjustment": 1.020000,
"DomainFragment": "com.merriamwebster",
"SupplyVendorId": 118,
"PublisherId": "11653",
"ImpressionPlacementValue": "177976"
},
{
"BidLineId": "1216342",
"BidAdjustment": 1.020000,
"DomainFragment": "com.pandora.android",
"SupplyVendorId": 50,
"PublisherId": "71711271",
"ImpressionPlacementValue": "cKClcPNTu1Te"
},
{
"BidLineId": "1216343",
"BidAdjustment": 1.020000,
"DomainFragment": "com.strawdogstudios.simonscatcrunchtime",
"SupplyVendorId": 99,
"PublisherId": "FYBER-139222",
"ImpressionPlacementValue": "530c4d2894e444a1976f41d527c03a07"
}
],
"BidListOwner": "AdGroup",
"BidListOwnerId": "sberg7l",
"IsAvailableForLibraryUse": false
}
Associate The New Bid List To An Ad Group

The last step is to associate the BidListId with the AdGroup AssociatedBidLists so that the AdGroup uses the correct bid lists during live bidding.

Adding A Bid List To An Existing Ad Group

When using PUT /v3/adgroup to associate a new bid list to an existing ad group, it's important to check if there are any other bid lists already associated to that ad group. PUT /v3/adgroup replaces the contents of the AssociatedBidLists object with what is sent in the request.

When adding a BidList to an AdGroup that was previously created, use GET /v3/adgroup/{adGroupId} to gather the current state of all editable properties in the AdGroup before using PUT /v3/adgroup to send through the same information, appending the existing BidList to AssociatedBidLists.

IsDefaultForDimension for each AssociatedBidList should be sent with each PUT request. If the value is currently true and is not passed with the PUT request, it will revert back to the default of false and may cause unexpected behavior.

GET /v3/adgroup/{adGroupId} curl Request
1
2
3
4
curl --location --request GET 'https://api.thetradedesk.com/v3/adgroup/sberg7l' \
--header 'Content-Type: application/json' \
--header 'TTD-Auth: yourauthtoken' \
--data-raw ''
GET /v3/adgroup/{adGroupId} Response
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
{
"CampaignId": "t0ncimu",
"AdGroupId": "sberg7l",
"AdGroupName": "2020-03-09 Ad Group Test",
"Description": null,
"IsEnabled": false,
"IsHighFillRate": false,
"AdGroupCategory":{
"CategoryId": 8311
},
"RTBAttributes": {}, /*This object was collapsed to save page space.*/
"Availability": "Available",
"CreatedAtUTC": "2020-03-11T00:39:53.227",
"LastUpdatedAtUTC": "2020-03-11T00:39:53.227",
"AssociatedBidLists": [
{
"BidListId": "2131711",
"IsEnabled": true,
"IsDefaultForDimension": true,
"BidListSource": "User",
"BidListAdjustmentType": "Optimized",
"BidListDimensions": [
"HasGeoSegmentId"
]
}
],
"AvailableRecommendations": [],
"CustomLabels": [],
"AreFutureKoaFeaturesEnabled": false,
"PredictiveClearingEnabled": false,
"CurrentAndFutureAdditionalFeeCards": []
}
PUT /v3/adgroup Request
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
{
"AdGroupId": "sberg7l",
"AssociatedBidLists": [
{
"BidListId": "2131711",
"IsEnabled": true,
"IsDefaultForDimension": true,
"BidListAdjustmentType": "Optimized",
},
{
"BidListId": "2131712",
"IsEnabled": true,
"IsDefaultForDimension": true,
"BidListAdjustmentType": "Optimized",
}
]
}
PUT /v3/adgroup Response
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
{
"CampaignId": "t0ncimu",
"AdGroupId": "sberg7l",
"AdGroupName": "2020-03-09 Ad Group Test",
"Description": null,
"IsEnabled": false,
"IsHighFillRate": false,
"AdGroupCategory":{
"CategoryId": 8311
},
"RTBAttributes": {}, /*This object was collapsed to save page space.*/
"Availability": "Available",
"CreatedAtUTC": "2020-03-11T00:39:53.227",
"LastUpdatedAtUTC": "2020-03-11T00:39:53.227",
"AssociatedBidLists": [
{
"BidListId": "2131711",
"IsEnabled": true,
"IsDefaultForDimension": true,
"BidListSource": "User",
"BidListAdjustmentType": "Optimized",
"BidListDimensions": [
"HasGeoSegmentId"
]
},
{
"BidListId": "2131712",
"IsEnabled": true,
"IsDefaultForDimension": true,
"BidListSource": "User",
"BidListAdjustmentType": "Optimized",
"BidListDimensions": [
"HasDomainFragmentId",
"HasSupplyVendorId",
"HasImpressionPlacementId",
"HasPublisherId"
]
}
],
"AvailableRecommendations": [],
"NewBidLists": [],
"CustomLabels": [],
"AreFutureKoaFeaturesEnabled": false,
"PredictiveClearingEnabled": false,
"CurrentAndFutureAdditionalFeeCards": []
}

---

# User Scoring Custom Algorithms

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/UserScoringBaseBidCPM](https://partner.thetradedesk.com/v3/portal/api/doc/UserScoringBaseBidCPM)

User Scoring Custom Algorithms

User Scoring allows any buying partner to answer the question: How can I value an individual user by assigning them a unique base bid?

By default, an ad group assigns all users in an audience the same base bid for each impression. User Scoring provides an opportunity to assign a discrete bid value for each user, allowing a partner to override an ad group's base bid when creating data segments in The Trade Desk platform. This functionality combined with the data available in our Raw Event Data Stream solves the problem of determining the value of users that haven't been seen before.

The following diagram illustrates the workflow process.

Initial Configuration
Step One - Identify a Data Source

Once a business problem has been identified and the relevant Key Performance Indicator (KPI) selected, the right data set needs to be identified to correctly build the model. The table below shows the most common data sources depending on the main KPI:

CPA	CTR	CPC	CPCV	TVCR	Viewability
Impressions	*	*	*	*	*	*
Conversions	*
Clicks	*	*	*
Video Events				*	*	*
Step Two - Choose an Ad Group

Once you've decided on a data source, you should next consider which ad group will be used to build a model for User Scoring predictions. Whichever ad group or groups you select, remember that their configuration will act as a statistical experiment to generate the sample data that will be used for modeling.

What to consider:

Targeting Strategy: The model will end up reflecting the targeting strategy of the chosen ad group. For example, if an ad group bid adjusts on certain inventory sources, geolocations, or times, then the historical log data associated with the ad group will reflect those tactics.
Number of Ad Groups: You can also consider building the model to reflect multiple ad groups, if they all use the same strategy or bid adjust in the same way on the same vectors.
Flight Duration: The longer the time frame for data collection (how long will the chosen ad group be active?), the more accurate the model's predictions can become. However, longer time frames also mean more data, which requires more computation power and storage capacity.
Best Practices for Choosing Duration

Test Shorter Time Frames First: Consider modeling on shorter time frames, such as one full day of raw log data, and note the amount of computing resources and storage used.

Decide on Balance of Time and Accuracy: Shorter time frames may result in less accurate data, while longer ones may result in greater accuracy. For example, if you need realistic conversion rates at the user level to create an initial set of user base bids, it may be best to choose a longer time frame, since this will result in more realistic rates.

Understand How Time and Conversions Interact: The type of conversion event can influence how long the time frame should be (e.g., it will take longer to collect car purchase data than service subscriptions). And the time frame can affect how many users don't convert (this problem is known as "right censored data"). By reasonably assuming that the non-converters could have converted given more time, there are mathematical methods to impute missing rates or user base bid scores.

Identifying and Ingesting Data

Prior Knowledge Needed and Call Outs

Before reading further, please familiarize yourself with the background information and best practices on our Raw Event Data Stream (REDS).
Using the BaseBidCPM parameter in our POST /data/advertiser is an API-only feature and UI users will not know this feature is being used. Please coordinate with your trading teams to ensure they know which data elements are adopting User Scoring.
Using cross-device targeting for the ad groups tied to cookie-scoring segments will have unintended consequences.
For example, if you uploaded 2 cookies with different BaseBidCPM values to your segment and a cross-device vendor determines that those 2 cookies are associated with the same user, we will overwrite the BaseBidCPM of all associated cookie IDs using the value of the last user that was uploaded.

Once you've set up your data source and ad group, you will be able to begin identifying and ingesting the data.

Data Retrieval

Download the Python code sample for managing log-level data. The section below references this code sample.

Below you will find a Python code snippet that connects to the Amazon s3 API via a Boto package (2.x version) to retrieve two types of data events: impressions and conversions.

Each new data logs' rows are appended to a single CSV file, which occurs inside the function ingestGzipLogs.

The final result includes two master CSV data files:

One file for impressions
One file for conversions

You can reconfigure this code snippet to allow for more frequent retrievals of the data, as opposed to a one-day batch retrieval, depending on your individual needs.

REDS Ingest
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
BUCKET_PATH = 'thetradedesk-useast-partner-datafeed'
FILTER_PATH = 'PARTNER_ID/redf5/date=DATE/hour='
conn = boto.connect_s3('USER_KEY', 'ACCESS_KEY')
mybucket = conn.get_bucket(BUCKET_PATH)
...
def ingestGzipLogs(dateFilter):
for key in mybucket.list(FILTER_PATH + str(dateFilter)):
logName = key.name
if "impressions" in logName:
key = ReadOnce(key)
gz_file = gzip.GzipFile(fileobj=key, mode='rb')
for line in gz_file:
newLine = line.decode('utf-8').split('\t')
with open(impCSV, "a") as output:
writer = csv.writer(output)
writer.writerow(newLine)
elif "conversions" in logName:
key = ReadOnce(key)
gz_file = gzip.GzipFile(fileobj=key, mode='rb')
for line in gz_file:
newLine = line.decode('utf-8').split('\t')
with open(convCSV, "a") as output2:
writer = csv.writer(output2)
writer.writerow(newLine)
else:
continue
...
Preliminary Data Analysis and Transformations

In this section, we'll be using the R language, with its quick prototyping advantages, to look at the main ideas when performing data analysis and transformation.

Download the code sample for analyzing user data using R. The section below reference this code sample.

Reading CSV Files

To start, you can use the fread function from the data.table library package (as a faster alternative to read.table or read.csv) to quickly read your two CSV files from the initial retrieval.

You may use functions such as dim(impData) or summary(impData) to get a general understanding of the dimensions of the data set, basic statistics along each column, and whether there are missing values.

1
2
3
4
impData <- fread("./Impressions.csv", header = FALSE)
colnames(impData) <- c("logentryTime", "impID", "partnerID", "advertiserID", "campaignID", "adgroupID", "privateContractID", "audienceID", "creativeID", "adformat",
"frequency", "ssp", "publisherID", "dealID", "site", "referrerCatList", "foldPosition", "userHourOfWeek", "userAgent", "IPAddress", "TDID", "country", "region", "metro",
"city", "deviceType", "OSFamily", "OS", "browser", "recency", "languageCode", "mediaCost", "feeFeatureCost", "dataUsageCost", "TTDCost", "partnerCost", "advertiserCost",
"lat", "long", "deviceID", "zipcode", "processedTime", "deviceMake", "deviceModel", "renderingContext", "carrierID", "tempCelsius", "tempBucketStartCelsius",
"tempBucketEndCelsius","placementID") #provide header for impressions data
convData <- fread("./Conversions.csv", header = FALSE)
colnames(convData) <- c("logentryTime", "convID", "advertiserID", "convType", "TDID", "IPAddress", "referrerURL", "monetaryValue", "monetaryValueCurrency", "orderID", "TD1",
"TD2", "TD3", "TD4", "TD5", "TD6", "TD7", "TD8", "TD9", "TD10", "processedTime") #provide header for conversion data
Filtering to Data Subset

Next, you will have have to filter down to the appropriate subset of data. In the following code, the filter is placed at the advertiser ID level, but the filter can be adjusted to be at the campaign or ad group level.

subsetImps <- impData[impData[,impData$advertiserID=='ADVERTISER_ID'],]

There are other important things the code is doing. By only including view-through conversions, you will have to take the impressions data and conversion data, and perform a join across the TDID key.

joinedData <- merge(impDedupData, convData, by.x = 'TDID', by.y = 'TDID', all.x = TRUE)
Assigning Attribution Credit

Next, it is important to check for last-touch attribution, and assign attribution credit to the appropriate set of impressions. The idea is to take the difference between the log-entry times of matched impressions by TDID and legitimate conversions to match the conversions to the most recently served impressions.

Note that the following code snippet measures the difference in seconds.

summary(abs(difftime(matchedConvData$logentryTime.x ,matchedConvData$logentryTime.y)) <= attWin)
Formatting Your Target Column

Before training a machine learning model, you need to initialize your target column – in this case, your user base bid scores.

The following R code shows a sequence of data transformation actions piped together by the %>% operator under the dplyr package. This carefully constructs the probability of a user to convert (i.e., individual user conversion rate), and multiplies it by:

A "0.005" constant, which compensates for raw impression data gathered over a short time frame (e.g., one day) that would otherwise result in unrealistic and inflated conversion probabilities. * This brings us back to the trade off between accuracy (tied to time frame) and computational power. To avoid inaccuracy, you can ingest data over a longer time frame, but this requires more computing resources.
The ad group goal target, expressed as an integer (Key Performance Indicator)
"1000" (to convert into CPM units)
testGrouping <- joinedData2 %>% select(TDID.x, conv) %>% add_count(TDID.x) %>% group_by(TDID.x) %>% mutate(convSum = sum(conv)) %>% mutate(convRate = convSum/n) %>%
mutate(userBaseBidCPM = 0.005*convRate*40*1000)

Once your user scores have been initialized, you can create a boxplot of the score distribution by using the boxplot function in R. The following snippet is one illustration of how to use it:

boxplot(filterGroupsWithCPM$userBaseBidCPM, data=filterGroupsWithCPM$userBaseBidCPM,main="User Base Bid Distribution",col=c("red","green"), notch=F, ylab="User Base Bid CPMs")

Gathering Additional Columns

Once you are satisfied with initializing the user base bid CPM values that will train your model, you will need to join back this new data to the impression details data to gather additional columns such as:

SSP
Publisher ID
Site
Placement ID

We can summarize the combination of these fields as SPSP.

Why these fields? For one approach to the problem, the unique combinations of these four values could serve as a rough proxy for user behavior.

1
2
trainingData <- joinedData2 %>% select(TDID.x, ssp.x, publisherID.x, site.x, placementID.x)
trainingData <- merge(filteredData, trainingData, by.x = 'TDID.x', by.y = 'TDID.x')

After identifying all possible impression data associated with the conversion pool of TDIDs, you will need to transpose the unique combinations of SPSP into individual column features. You may use the dplyr package for this transformation.

testGrouping2 <- trainingData %>% select(TDID.x, SPSPID) %>% group_by(TDID.x, SPSPID) %>% count(SPSPID) %>% filter(n < 20) %>% spread(SPSPID, n, fill = 0)
Possible Issues
Encountering IDs with No Base Bid CPMs

You will eventually encounter a situation where a subset of unique TDIDs did not see any conversions take place (verified through last-touch attribution). These TDIDs will not have any user base bid CPMs associated with them.

This usually happens because the data's time frame was not long enough to see a conversion occur – in other words, for IDs that have no conversion data, it may just be a result of not giving the users enough time to convert.

If you assume that these TDIDs have some probability of conversion (i.e., the users would have converted at some point in the future), you could use data imputation techniques to approximate what those missing CPM values should be. One popular technique is K-Nearest Neighbor (KNN) Imputation, which has the following advantages:

Can handle variables or features with multiple missing values
Can be used against both qualitative and quantitative attributes
1
2
3
4
5
6
knnTrainingData <- modelTrainingData[which(!is.na(modelTrainingData$userBaseBidCPM)),]
knnTestData <- modelTrainingData[which(is.na(modelTrainingData$userBaseBidCPM)),]
trctrl <- trainControl(method = "repeatedcv", number = 10, repeats = 1)
knn_model <-train(userBaseBidCPM~.,data=knnTrainingData,method="knn", trControl=trctrl, preProcess = c("center", "scale"), tuneLength = 10)
print(knn_model)
test_userBaseBidCPM_preds <- predict(knn_model, newdata = knnTestData)
Data Sets with Too Many Columns

Before training your first machine learning model, you may need to deal with the potential issue of having too many columns in the training data set. This problem is typically referred to as the curse of dimensionality. To solve this issue, you can use Principal Components Analysis (PCA) to determine the number of variables needed to represent important data signals or variability.

An example of this is shown in the following code snippet that helps determine how many features are needed.

plot(cumsum(pcaData$sdev)/sum(pcaData$sdev)*100,main='Cumulative proportion of variance explained',ylab='cumulative variance')

This results in the following plot:

Training and Deploying the Model

Now you are ready to build your first trained model!

In order to showcase a portfolio of options for your own machine learning tech infrastructure, this documentation illustrates three ways you can start using your model as soon as possible.

R Language

The R language contains a lot of popular packages that cover a wide swath of machine learning algorithms. Since our training data set has numerical features with a numerical target column (i.e., user base bid scores), we could easily choose a linear regression algorithm with the assumption that a linear approximation works for our use case. The following code snippet combines functionality from caret (essentially a wrapper for multiple algorithms) and glmnet.

1
2
3
4
5
trctrl <- trainControl(method = "repeatedcv", number = 10, repeats = 1)
#use GLMNET with Regularized Regression
paramGrid <- expand.grid(lambda = 10^seq(10, -2, length=100), alpha = c(0,1))
regularizedReg_model <- train(userBaseBidCPM ~., data = trainingDataWithPCA, method = "glmnet", trControl=trctrl, preProcess = c("center", "scale"), tuneGrid = paramGrid)
print(regularizedReg_model)

This results in 200 possible models (since the paramGrid looks at over 200 possible combinations of two tuning parameters: lambda and alpha) after K Cross Validation is applied for each model combination.

Lambda controls how much regularization (protects against overfitting) there needs to be
Alpha controls whether the regularization is done using the Lasso or Ridge technique

The final result includes the model with the best tuned parameters (lambda and alpha) for making score predictions.

Download the Python code sample for deploying Amazon ML. The section below reference this code sample.

Amazon Machine Learning

Amazon Machine Learning creates a simplified environment for the user to quickly deploy a machine learning model.

After making an AWS account, this process first requires that you upload a data set into S3 storage to create the data source that the machine learning model will use.

Next, you may create a model that points to the training data source with a narrow set of custom settings.

Note that none of the necessary data preprocessing that was done in R is available in Amazing Machine Learning.

Interestingly, Amazon allows you no control over the exact selection of the machine learning algorithm. It instead decides on a regression method for you, since the target column (user base bid scores) is numeric in nature.

You will eventually be prompted to create an evaluation of your model. The only metric used in this evaluation is Root Mean Square Error (RMSE). A model with perfect predictions would have a RMSE score of zero. For simplification purposes, the model uses 30 column features for training the model.

For further information on Amazon ML services, please see https://aws.amazon.com/machine-learning/

To deploy, you must navigate to the Prediction section of the model evaluation, where you can enable the desired endpoint. Enabling an endpoint for the model renders it live for prediction data retrieval via the API.

By taking advantage of the endpoint URL at https://realtime.machinelearning.us-east-1.amazonaws.com, you can easily integrate your deployed model into a larger ML pipeline for generating user base bid scores.

Any new observations that are sent as part of the JSON request could result in an output similar to the following structure:

1
2
3
4
5
6
7
8
9
{
"Prediction": {
"details": {
"Algorithm": "SGD",
"PredictiveModelType": "REGRESSION"
},
"predictedValue": 64.68316650390625
}
}

Please see sample code for how to hit a deployed model API endpoint with Amazon ML (link sample code).

Download the Python code sample for deploying Azure ML. The section below reference this code sample.

Azure Machine Learning

Microsoft Azure Machine Learning Studio provides a visual interface for beginning and advanced users alike to control data preprocessing, feature engineering, model testing, and deployment.

Individual actions, such as importing data or filtering data, are taken in a module, and multiple modules can be wired together to produce a machine learning pipeline. As with R, you may use K Cross Validation to evaluate your training data with the chosen algorithm (in this case, Linear Regression with L2 regularization and the Stochastic Gradient Descent optimizer).

This method uses the full power of fast experimental testing, since the training data can be wired to a set of multiple machine learning algorithms, and, consequently, simultaneous evaluations can be done within a user interface.

After running the Azure ML modules to perform K Cross Validation, we can see the RMSE metric for each K fold.

Scrolling down in the same evaluation metrics window, you will see the mean RMSE metric across all K folds, which determines how good the model and its tuning parameters are.

For simplification purposes, the model uses 30 column features for training.

For further information on Azure ML Studio services, please see https://studio.azureml.net.

Making sure that the training experiment runs without error, you can then create a predictive experiment that is deployed as a web service.

This service effectively runs live behind a REST API endpoint, which can be integrated into a larger machine learning pipeline for real-time predictions.

Once you choose to deploy the predictive experiment as a web service, the UI will bring you to the endpoint management section, where you may choose to test the endpoint, view the input schema, copy the API key, etc.

By using the API key and REST endpoint, you may have the opportunity to hit a live deployed model to retrieve model predictions. A successful REST call would result in something similar like in the following:

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
{
"Results":{
"output1":[
{
"yieldmo_764343212726492773_www.cnn.com_764345183319563885":"0",
"gumgum_11602_blend.oola.com_25465":"2",
"pubmatic_79532_www.topixstars.com_1071234":"0",
"appnexus_7519_www.trend-chaser.com_10552680":"1",
"technorati_81529_www.kake.com_73975":"0",
"userBaseBidCPM":"0",
"gumgum_11645_www.findagrave.com_25466":"12",
"rubicon_13344_issuu.com_828762":"0",
"appnexus_3135_www.reuters.com_12251195":"0",
"Scored Labels":"104.732474708338",
"gumgum_11645_www.spanishdict.com_25465":"0",
"federatedmedia_248396_smallbusiness.chron.com_487224":"1",
"gumgum_1000006_www.thegamer.com_25465":"0",
"appnexus_1613_ancient-origins.net_12483184":"0",
"pubmatic_155959_www.spanishdict.com_800421":"0",
"pubmatic_156078_eternallysunny.com_904294":"0",
"pubmatic_79532_www.topixoffbeat.com_1130751":"1",
"appnexus_1908_www.spanishdict.com_6448088":"1",
"federatedmedia_83744_www.merriam-webster.com_378385":"0",
"appnexus_1908_www.icepop.com_10251970":"2",
"gumgum_239_toofab.com_25465":"0",
"gumgum_12366_hellogiggles.com_25465":"10",
"gumgum_12900_www.everylastbite.com_30471":"0",
"appnexus_1613_allthatsinteresting.com_9116152":"0",
"pubmatic_156078_zdnzwf5-a.akamaihd.net_904294":"0",
"adconductor_812726633_www.geekycamel.com_171220103":"0",
"appnexus_3135_www.findagrave.com_12573855":"0",
"appnexus_1908_www.sparkpeople.com_11133351":"0",
"federatedmedia_235520_list25.com_501113":"1",
"pubmatic_156078_www.rawstory.com_904294":"0",
"technorati_81858_stocktwits.com_79581":"1",
"pubmatic_156636_www.cleveland.com_1281684":"0"
}
]
}
}

Please see sample code for how to hit a deployed model API endpoint with Azure ML.

Pushing Audiences to The Trade Desk Platform

Prior Knowledge Needed and Call Outs

Before reading further, please familiarize yourself with the background information and best practices on Anonymous ID Data Integration.
Using the BaseBidCPM parameter in our POST /data/advertiser is an API-only feature and UI users will have no insight into that this feature is being leveraged. Please coordinate with your trading teams to ensure they know which data elements are adopting cookie scoring
Using cross device on your adgroups tied to cookie scoring segments will have unintended consequnces..
For example: You upload 2 cookies in your segment with different BaseBidCPM values. If a cross device vendor determines that those 2 cookies are the same persona, we will overwrite the BaseBidCPM of all associated cookieIDs using the value of the last user that was uploaded.

Once your model is deployed behind a live API endpoint, you may integrate it into a larger machine learning workflow, in which new data or new user observations are pushed to the API endpoint to retrieve user scoring predictions.

These new observations would initially come from your REDS data, but you also have the power to merge other data sets from outside of The Trade Desk to better improve the predictive power of your model. After a specific time period of testing performance, you can push these new score predictions into The Trade Desk Data API and activate the user base bids within an ad group in our platform.

Our POST /data/advertiser guide covers all the necessary integration considerations however in order to assign a user base bid cpm, you will need to include a new parameter in the JSON payload as Items.Data.BaseBidCPM. See below for details and an example.

POST Fields	Required?	Description
AdvertiserID	Yes	The ID for the advertiser that will use this data
Items.TDID	Yes, if DAID is blank	The Trade Desk ID for the user
It is a requirement to use either a Trade Desk ID (TDID) or Device Advertising ID (DAID)
Items.DAID	Yes, if TDID is blank	The DAID for the user; can be the iOS IDFA or AAID
It is a requirement to use either a TDID or DAID
Items.Data.Name	Yes	A name that describes the data being assigned to this user; will be used as the element name in the UI for targeting
Items.Data.TimestampUTC	No	Used for recency targeting; omitting this field assumes the user was put into the segment as soon as The Trade Desk processed the data, instead of when the user was actually eligible for the data segment
Items.Data.TTLinMinutes	Yes	How long this user will remain active, relative to Items.Data.TimestampUTC; once it has expired, this data will not be used for targeting
Items.Data.BaseBidCPM	No	A base bid override for this user. When this is not empty, it will override the ad group's base bid.
If more than one base bid is assigned to a user across multiple data elements, then the highest base bid will be used.
BaseBidCPM in Data API
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
{
"AdvertiserID":"abcdefg",
"Items":[
{
"TDID":"f5320d1f-69f0-4cf7-bc2b-1f20eb591f110",
"Data":[
{
"Name":"Segment 1",
"TtlInMinutes":43200,
"BaseBidCPM":4.32
}
]
}
]
}
Appendix

The following R libraries and versions were used for the sample code:

glmnet_3.0-2
randomForest_4.6-14
caret_6.0-84
tidyr_1.0.0
dplyr_0.8.3
data.table_1.12.2

---

# Platform API Reference

**Source:** [https://partner.thetradedesk.com/v3/portal/api/doc/ApiReferencePlatform](https://partner.thetradedesk.com/v3/portal/api/doc/ApiReferencePlatform)

Platform API Reference

The Platform API reference is an auto-generated alphabetical list of all platform operations, with the most up-to-date information. This reference describes the Platform API structure for both GraphQL operations and REST endpoints.

Here's what you need to know about operations and endpoints:

Both methods follow the same API Token Authentication.
Both operations and endpoints are grouped by area, also known as domain.
Not all API domains support both REST and GraphQL options, and the two formats do not map to each other one‑to‑one.

The following sections provide specific details on GraphQL Operations and REST Endpoints.

GraphQL Operations

The following conventions apply across all GraphQL resources:

There are two types of GraphQL operations: Query (read data) and Mutation (create/update data).
Each GraphQL operation has a GQL tag.
Each operation page includes a description, basic code snippet of required fields, arguments, type section, and entity section, containing fields.
Click on the children of the type section to open an expandable entity section that shows all fields, nested types, and nullability.

TIP: If you are new to GraphQL, check out our GraphQL API Resource Hub and familiarize yourself with the basics.

REST Endpoints

The following conventions apply across all REST API resources:

Each REST endpoint starts with /v3/.
Most endpoints are grouped by their area, which goes directly after /v3/, such as /v3/advertiser/.
Endpoints follow the REST convention and have GET, PUT, POST, or DELETE tags.
Endpoint properties have SOLIMAR and KOKAI labels to differentiate between incompatible versions of the Platform API.
Hidden endpoints may require additional access through your Technical Account Manager.
There are exceptions to the list order, such as /v3/ecommerce, which contains a large set of endpoints that are grouped differently.

---

