# The Trade Desk GraphQL API Documentation

This document contains the content from the following pages:
- [GraphQL API Resource Hub](https://partner.thetradedesk.com/v3/portal/resources/doc/GqlApiHub)
- [Queries](https://partner.thetradedesk.com/v3/portal/resources/doc/GqlApiQueries)
- [Mutations](https://partner.thetradedesk.com/v3/portal/resources/doc/GqlApiMutations)
- [Authentication](https://partner.thetradedesk.com/v3/portal/resources/doc/GqlApiAuthentication)
- [Making Calls](https://partner.thetradedesk.com/v3/portal/resources/doc/GqlApiCalls)
- [Errors and Limits](https://partner.thetradedesk.com/v3/portal/resources/doc/GqlResponses)

---

# GraphQL API Resource Hub

**Source:** https://partner.thetradedesk.com/v3/portal/resources/doc/GqlApiHub

---

GraphQL API Resource Hub

Welcome to The Trade Desk GraphQL Resource Hub, your one-stop destination for all things GraphQL. Whether you're a seasoned developer or just getting started, this hub is designed to empower you with the tools and knowledge needed to make the most of our GraphQL APIs.

Why GraphQL?
GraphQL offers a query language and runtime that enables you to request exactly the data you need—no more, no less. It provides an intuitive and powerful alternative to REST, especially for complex data requirements or when consolidating multiple queries into a single request. While you can choose between REST and GraphQL based on your needs, both technologies can complement each other to maximize your capabilities.

Here’s a rundown of the foundational concepts that will help you get started:

Concept | Description
Schemas | Define the structure and capabilities of the GraphQL API, including data types and relationships.
Queries | GraphQL queries request specific data from a single endpoint, unlike REST’s multiple endpoints. The GraphQL API enables you to construct and run queries to retrieve only the information you need. It can customize queries to return specific fields across multiple entities. This empowers you to precisely define the request, reduce complexity, and response times, by limiting the scope of information.
IMPORTANT: While support for nested queries allows retrieving related data in a single call, complexity limits apply.
Mutations | The GraphQL API enables you to construct and run mutations to create and update values in the schema. It accepts parameters to specify details, making them versatile for different use cases. GraphQL mutations function similarly to POST, PUT, and DELETE requests.
Bulk Operation | The GraphQL API enables you to run large-scale GraphQL operations without relying on spreadsheets or tedious manual pagination.
Fields and Aliases | Fields represent pieces of data requested in a query, allowing for optimized, selective data retrieval. Aliases in queries let you rename fields in the response, which is useful for retrieving the same type of data multiple times in a query.
Arguments and Filters | Arguments allow parameters to be passed to fields or mutations, enabling filters and sorting. You can apply filters to data requests to control the data returned.
Introspective | Schema self-discovery allows clients to explore the schema programmatically, helping developers discover available types, fields, and mutations.

TIP: For a quick overview, see GraphQL Explained in 100 Seconds on YouTube.

Master the Basics of Our GraphQL API

Discover the foundational skills and concepts you need to unlock the full potential of our GraphQL API. The Resource Hub pages provide a focused overview of key capabilities, practical tools, and troubleshooting techniques to help you navigate and optimize your API interactions effectively. Here are some of the key tasks you can master with the help of this resource, regardless of The Trade Desk product you intend to use:

Retrieve the data you need with powerful and flexible query structures.
Modify data and perform actions efficiently.
Access the API securely.
Make API calls in Postman and Python.
Troubleshoot issues and understand system constraints.
Optimize your API usage while adhering to usage guidelines.
FAQs

The following are some of the commonly asked questions about GraphQL.

Which of The Trade Desk products use GraphQL?

We've been adding GraphQL functionality incrementally to all of our products. We encourage you to check for updates as we roll out new functionality and enhancements. We greatly appreciate your patience and feedback as we continue to improve your experience.

Can I use GraphQL to bypass rate limiting?

No. Although rate limiting won't work quite the same with the customizable nature of GraphQL, we have reasonable limits in place to prevent abuse and server overload. For details, see GraphQL API Rate Limits.

Will GraphQL API eventually replace REST API?

Currently, the GraphQL API is an augmentative feature within our API infrastructure to give users more control over their data than the REST API.

How are GraphQL mutations similar to REST?

GraphQL mutations are similar to REST in that both enable you to modify server data through a request-response model. Like REST's HTTP methods (POST, PUT, DELETE), mutations allow for creating, updating, and deleting data, with inputs specified through arguments in GraphQL or request bodies in REST. Both provide feedback on the operation's success or failure—GraphQL through its response payload and REST via HTTP status codes and response bodies. While GraphQL mutations use a single endpoint for all operations, similar to REST's specific endpoints, both approaches ensure structured communication for data modification.

Is there a test environment for GraphQL API?

It depends on the product. For example, for the Platform GraphQL API, we offer a Partner Sandbox where you can test platform API integrations without breaking changes to your production environment.

Is there a GraphQL API reference?

Yes, the API reference shows both GraphQL anhd REST API endpoints.

What exactly is the difference between the two API technologies?

The following table provides a high-level comparison of the REST and GraphQL technologies.

Comparison Aspect | REST API | GraphQL API
Architecture | Is an architectural style. | Is a query language.
Communication | Uses HTTP methods (GET, POST, PUT, DELETE) to perform CRUD (Create, Read, Update, Delete) operations on resources. | Is technically transport-agnostic, but in practice sends queries to create, export, and update data to a single endpoint with the POST HTTP method.
Data Fetching | Provides a fixed data structure for each endpoint. Can lead to over-fetching or under-fetching. | You can specify exactly what data you need in the query. Eliminates over-fetching and under-fetching.
Data Retrieval | Requires additional requests for additional data. | Retrieve multiple resources and related data in one request.
Schema | Has no formal schema, endpoints represent resources. | Requires a defined schema specifying capabilities and available data types.
Flexibility | Fixed structure; you must send additional requests for more data. | Flexible; you specify data needs in the query.
Developer Experience | Simplicity and scalability. | Efficiency and ability to optimize data fetching for your needs.

For more details on each technology, see the following YouTube videos:

GraphQL Explained in 100 Seconds
RESTful APIs in 100 Seconds (the first 2.5 minutes)

On this page:

Why GraphQL?
Master the Basics of Our GraphQL API
FAQs

---

# GraphQL API Queries

**Source:** https://partner.thetradedesk.com/v3/portal/resources/doc/GqlApiQueries

---

GraphQL API Queries

The GraphQL API enables you to construct and run queries to retrieve only the information you need. In contrast to our REST API, which provides a fixed structure of information for a single entity, GraphQL can customize queries to return specific fields across multiple entities. This empowers you to precisely define the request, reduce complexity, and response times, by limiting the scope of information.

NOTE: To edit information, use mutations instead of queries.

Here's what you need to know about GraphQL queries and their best practices:

Even though it's optional, it is always a best practice to name your queries. This makes it easier to distinguish between multiple queries.
You can retrieve individual fields (ID, name, description, and so on) or lists (flights, ad groups, and so on).
You can filter and refine your results.
For lists, be sure to follow best practices for cursor-based pagination to limit results per query.
Do not enclose enum values in quotation marks unless you're passing them as variables in a JSON object. For example, funnelLocation: CONSIDERATION.
Avoid creating overly complex calls, such as those containing many levels of nested fields. For details, see System Errors.
Rate limits apply to GraphQL calls.

TIP: To retrieve your schema, run an introspection query. For details, see Making GraphQL API Calls.

The following sections explain the anatomy of a query and best practices, using Platform API examples. These concepts apply to all API products at The Trade Desk that use GraphQL.

Query Anatomy

A GraphQL query consists of top-level fields and nested fields, which provides a structured approach to constructing your query and retrieving specific information from the platform.

IMPORTANT: This structure must map to values in the schema and gets more complex as you delve deeper into nested fields, or query for a wide arrange of items.

Here's an example of a query that passes the ad group ID to retrieve the ID, name, and details of an ad group. It starts at the ad group level and nests down to retrieve detailed information such as spend priority and total budget, with an alias used to customize the response.

The following table details the components of the query example.

Component | Required? | Description
query | Required | The type of GraphQL operation. Possible values include query and mutation.
GetAdGroupDetailsExample | Optional | The custom name of the query that you create.
IMPORTANT: Do not include spaces in the name.
$adGroupId: ID! | Optional | A variable. Here's what you need to know about variables:
You can only use variables in arguments.
You can specify which variables are required.
You must specify the variable data type (float, string, ID, and so on).

adGroup(id: $adGroupId) | Required | A top-level field that specifies the ad group information you want to retrieve. Here's what you need to know about top-level fields:
If needed, you can include multiple top-level fields in your query.
Most top-level fields require arguments by which to filter the results. For example, an adGroup top-level field requires an id argument to return only the results related to a single ad group.

id, name, budget, total | Required | The fields (from the schema) to be returned for the ad group specified in the top-level field.
IMPORTANT: Avoid creating too many layers of nested fields. For details, see System Errors.
TotalBudget | Optional | 

An alias that you can use to rename the total field to make it more specific in the response.
Filter and Refine Results

To filter and narrow your search by specific criteria, include the arguments that correspond to the fields by which you want to filter.

IMPORTANT: Not all queries have arguments that can narrow your search. Be sure to check your schema to view which arguments are available for the fields you want to include.

Here’s a query that retrieves ad groups with either the awareness or consideration objective or funnel location.

NOTE: This filter is for demonstration purposes and is not optimized. If it takes a long time to run, consider pagination.

Paginate Lists

GraphQL supports cursor-based pagination to select a subset of data per query to reduce complexity and runtime when returning lists. It relies on using cursors, which mark a location in the data, to give users more fine-tuned control over how much data they want back and which direction to load the pages from. GraphQL does not use page numbering to traverse lists.

Here's an example of retrieving the channel, ID, and name for a list of ad groups, using pagination.

The following table explains the pagination fields used in the preceding adGroups query example.

Field | Required? | Description
edges | Recommended | A field that contains the node and cursor used to traverse a list.
IMPORTANT: If your query doesn't use a list, avoid using this property.
cursor | Required | A unique ID that marks the current page of the paginated results.
node | Required | A field that contains the items returned on the page, such as the details of the ad group.
totalCount | Recommended | The number of items that can be returned. In this case, the total number of available ad group.
pageInfo | Required | An object containing the metadata on the pagination state, such as cursor IDs and page information.
endCursor | Recommended | A cursor ID that marks the end of the current page.
hasNextPage | Optional | If the value is true, indicates that the end cursor ID has items after it. Otherwise, there is no next page.
hasPreviousPage | Optional | If the value is true, indicates that the start cursor ID has items before it. Otherwise, there is no previous page.
startCursor | Optional | A cursor ID that marks the start of the current page.

A successful response returns the paginated data and two cursor IDs, corresponding to the end cursor ID and start cursor ID. These cursor IDs are used to mark a location in the response to start processing data from.

To navigate to the next page, pass the end cursor ID output to the after field, in the main function. Here's an example that navigates to the next page, with a page size of 10. By default, all queries return the first 10 items.

To fetch backwards, pass the corresponding cursor ID as the before value, and set the query to use the last filter, to override the default first filter. Here's an example that retrieves the last 10 items from the cursor location.

On this page:

Query Anatomy
Filter and Refine Results
Paginate Lists

---

# GraphQL API Mutations

**Source:** https://partner.thetradedesk.com/v3/portal/resources/doc/GqlApiMutations

---

GraphQL API Mutations

The GraphQL API enables you to construct and run mutations to create and update values in the schema. In contrast to our REST API, which provides a fixed structure of information for a single entity, GraphQL offers more customization and batch requests. GraphQL mutations function similarly to POST, PUT, and DELETE requests. To access read-only information, use queries.

Here's what you need to know about GraphQL mutations:

You can use only mutations that your account has access to.
You can create and edit fields based on the mutation schema.
Most mutation names follow the format of entityNameOperation. For example, to clone campaigns, the mutation is campaignClonesCreate.
Don't enclose enumeration values in quotation marks unless you're passing them as variables in a JSON object. For example, funnelLocation: CONVERSION.

IMPORTANT: Each mutation has a set complexity cost. If your mutation exceeds the complexity limit set by GraphQL, the execution is cancelled.

The following sections use Platform API examples to illustrate GraphQL mutation concepts and conventions. These concepts apply to all API products at The Trade Desk that use GraphQL.

Mutation Anatomy

In our GraphQL API, a mutation is made up of three core components, a mutation name, data object, and mutation errors. Each object can consist of top-level fields and nested fields to provide additional information to the mutation. Each core component formats what the request is and what information to return. The valid fields for each object are defined in the schema.

Here's an example of a mutation to create a new ad group in GraphQL. It returns the data of the newly created ad group. For details on troubleshooting mutations, see Mutation Errors.

The following sections explain the core components of a mutation: name, data, and errors.

Mutation Name

Inside the mutation, the first object must be the name of the mutation you want to use and pass an input object as an argument. The inputs field names must match the variables in the schema.

Here's an example of a basic mutation that requests the bare minimum.

The following table describes the adGroupCreate mutation.

Field | Required? | Description
mutation | Required | The type of GraphQL operation. Possible values include query and mutation.
NOTE: To avoid confusion with mutation names in our API and optional mutation descriptions, mutation descriptions aren't included in our examples.
adGroupCreate | Required | The name of the GraphQL mutation denoted in the schema.
NOTE: The mutation name format is entityNameOperation. Here, adGroup is the entity name and create is the operation.
You must not modify or rename the mutation name.
input | Required | An object that contains all arguments for the mutation.
campaignId, name, channel, funnelLocation | Required | A variable. Here's what you need to know about variables:
You can only use variables inside the input field.
The schema specifies which variables are required with the ! symbol.
You must specify all required variables to use the mutation.
Data Object

To check for additional information from the response of a mutation, you can include fields to return inside the data object. This structure is similar to a query, but is limited to the data returned by the mutation, rather than the entire schema.

Here's an example of a mutation that requests the id and name fields to be returned.

In the context of the adGroupCreate mutation, this returns the ID, name, channel, and funnel location of the ad group you created.

The following table describes the data object.

Property | Required? | Description
data | Optional | An object that returns information on updates made by the mutation.
id, name, channel | Optional | The name of the field to return in the response.
IMPORTANT: The field must match the response in the schema.
To specify multiple fields, add them into the data object on each line.
Objective | Optional | An alias that you can use to rename a field for your needs in the response.
Mutation Errors

IMPORTANT: A mutation can send error information through the errors or userErrors objects, and doesn't check for some errors unless specified.

To find which error object to use, inspect your schema based on which mutations you're using. Inside the mutation, the schema shows whether it has an errors or userErrors object. For details on the error type pattern, see FAQs.

Here's what you need to know about errors in GraphQL mutations:

All error information is stored in the message and field property. Some errors can have additional fields with more information.
Check your GraphQL mutations to determine what values exist in your error. For details on retrieving the schema, see Making GraphQL API Calls.
Error messages only appear when you add the corresponding error object to your mutation body.

The following table describes the properties of an error.

Property | Required? | Description
errors | Depends | An error object that denotes information, such as error messages, bad fields, and more.
userErrors | Depends | A legacy error object that can contain the bad field and error messages.
field | Recommended | A field that when specified returns the list of fields that caused errors. Leave this as field.
message | Recommended | A field that when specified contains any error messages returned by the GraphQL API. Leave this as message.

NOTE: Errors can have other properties not listed. For details on which properties are available, see the error type in the schema.

After you've identified which object to use, refer to Errors Object or UserErrors Object.

Errors Object

To check if your request failed with the errors object, you must include the __typename field. GraphQL mutations that support the errors object in the mutation are more versatile and can return more properties than the userErrors object. To check for all possible errors, use MutationError.

Catch-All Errors Object Example

Here's an example GraphQL mutation that checks for all possible errors and returns back the type of error, field, and error message.

To return additional fields related to the error, refer to the schema and use the individual error type.

Individual Errors Object Example

Here's an example JSON response that troubleshoots for specific errors in a mutation. Each individual error type can be found in the errors property of the schema.

UserErrors Object

Older mutations might use the userErrors object instead of the errors object. Both objects function similarly, but userErrors doesn't have additional error fields.

When the GraphQL API sends error information through the userErrors object, it includes the fields that caused the error, and an error message. Here's an example of a mutation that uses the userErrors object to return any invalid fields and error messages.

FAQs

The following is a list of commonly asked questions about our GraphQL API mutations.

Are mutations supported in Solimar?

No. All mutations apply to only Kokai. To upgrade to Kokai and use mutations, see Campaign Creation Workflow with GraphQL.

How are GraphQL mutations similar to REST?

Similar to REST, mutations can be used to accomplish POST, PUT, and DELETE operations. Some of these operations include campaign create, campaign clone, and campaign flight deletion.

Can I use aliases in mutations?

No. Mutation names must match the schema. There is no alias for them. However, you can alias the data object values returned. For details, see GraphQL API Queries.

What's the difference between the errors object sent in a mutation and the GraphQL errors object?

The errors object is part of the mutation structure and contains information on expected errors. The GraphQL errors object reports unexpected errors related to the server, and isn't contained inside any mutations or queries. For details on error types, see GraphQL Errors and Limits.

Why am I receiving a "cannot represent value" error in Postman?

When using the schema in Postman to create a mutation, Postman automatically adds quotation marks (") to all inline argument field values even if they're not strings. To avoid errors, remove the inserted quotation marks before you submit your request. For example, instead of budgetInAdvertiserCurrency: "10000", use budgetInAdvertiserCurrency: 10000.

How do I check which error object to use through my editor?

To check whether your mutation supports the errors or userErrors object, look at the return type of the error in the schema. The mutations should match the following patterns:

If the mutation supports the errors object, the error return type ends with Payload.
If the mutation supports the userErrors object, the error return type starts with PayloadWithErrors.

On this page:

Mutation Anatomy
Mutation Name
Data Object
Mutation Errors
Errors Object
UserErrors Object
FAQs

---

# GraphQL API Authentication

**Source:** https://partner.thetradedesk.com/v3/portal/resources/doc/GqlApiAuthentication

---

GraphQL API Authentication

To access our GraphQL API, you need the following:

 The Platform API credentials provided by your Account Manager.
 An authentication token that you need to generate and place in the header of your integration.


You can create and revoke your API tokens using the interactive UI experience available through Manage API Tokens.

TIP: To change the lifetime of a token or otherwise update it, you need to revoke it, generate a new token, and then replace the tokens in your integration.

Create an API Token

IMPORTANT: Be sure to save your generated API token to your secrets management system, as you will not be able to look it up or regenerate the same token. If you do not save your token, you will need to generate a new one.

To generate an API token, complete the following steps:

Log in with your The Trade Desk account credentials.
Navigate directly to Manage API Tokens.
Click Generate Token. The Generate API Token dialog appears.
Enter a descriptive name for your token. For example, include the tool name for which it will be used or any other details that will help you distinguish between multiple tokens later.
In the Application field, select Platform API.
Select the token lifetime (from one week to a year) based on your key rotation strategy and integration needs.
Click Save. A confirmation message appears with an API token.
Copy the displayed API token, save it to your secrets management system for future reference, and then close the message.

For details on using your API token, see Making GraphQL API Calls.

Check Your API Token Information

To check the creation and expiration dates or the names of your generated API tokens, complete the following steps:

Log in with your The Trade Desk account credentials.
Navigate directly to Manage API Tokens.

TIP: To update a token, you need to revoke it, generate a new token, and then replace the tokens in your integration.

Revoke an API Token

If your API token has been compromised, is no longer needed, or needs to be replaced with a new token with a longer or shorter lifetime, you can revoke the token at any time.

To revoke a API token, complete the following steps:

Log in with your The Trade Desk account credentials.
Navigate directly to Manage API Tokens.
Find the row with the name of the token you want to revoke, then in the Actions column on the far right, click Revoke. A confirmation message appears.
Verify that you've selected the correct token and click Continue.
Update the integration where the token was used as needed (for example, by generating a new token and replacing the old one in the integration).

On this page:

Create an API Token
Check Your API Token Information
Revoke an API Token

---

# Making GraphQL API Calls

**Source:** https://partner.thetradedesk.com/v3/portal/resources/doc/GqlApiCalls

---

Making GraphQL API Calls

To make a GraphQL API call, you need the following:

 The Trade Desk API credentials provided by your representative at The Trade Desk.
 Your API token. For details, see Authentication.
 Your tool or method of choice for making API calls (for example, Postman or Python).
 A header (TTD-Auth) with your API token.
 The URL for the environment you want to use.


IMPORTANT: Complexity and rate limits apply to all platform GraphQL API calls. For details, see Rate Limits and System Errors.

Although you can use any tool of your choice to execute a GraphQL call, the following sections explain how to do so in Postman and Python.

Postman

To make a GraphQL call in Postman, complete the following steps:

To create a new request, in the left panel and at the top, click New and choose GraphQL as your request type.
Enter the URL for the environment you want to use (sandbox or production).
Click the Headers tab, and in the Key field, enter TTD-Auth, and in the Value field, enter your API token.
To retrieve your schema, go to the Schema tab and click Use GraphQL Introspective.
On the Query tab, do either of the following:
To automatically generate and add fields to your query, select the available fields in the left pane and enter the appropriate values as needed.
To manually create your query, use the right pane.
To send your request to the GraphQL Platform API, click the blue Query button at the top-right.

The response appears in the bottom pane with the details you requested. For details, see GraphQL API Queries. For a list of client libraries, see Code Using GraphQL.

Python

The following example demonstrates a GraphQL call in Python using variables.

IMPORTANT: To make GraphQL API calls with Python, be sure to have the requests library installed on your system; for example, the GraphQLPythonlibrary on GitHub. See also Code Using GraphQL.

On this page:

Postman
Python

---

# GraphQL API Errors and Complexity Limits

**Source:** https://partner.thetradedesk.com/v3/portal/resources/doc/GqlResponses

---

GraphQL API Errors and Complexity Limits

To optimize performance and prevent overload, The Trade Desk has GraphQL query complexity limits and other rate-limiting rules. Query complexity refers to the amount of work needed to process your request. It increases with the depth of search and breadth of fields to return.

Here's what you need to know about the error types and responses that you might receive when making calls with the GraphQL API:

All errors are returned with an HTTP 200 status code.
An error can contain an error code, message, or more fields in the response.
There are two types of errors as shown in the following table.
Type of Error | Description | Example
Unexpected | Top-level errors that occur outside of the expected query or mutation workflow. These errors might include internal server errors, syntax errors, and more | An internal server error where your request contains too many tokens.
Expected | Field-specific errors that are defined in the GraphQL schema as possible outcomes for certain queries or mutations | A validation error where your mutation input doesn't meet the schema requirements.

TIP: To receive detailed messages about potential errors, always include appropriate error fields in your requests.

Unexpected Errors

When using GraphQL, certain limits can cause two types of unexpected errors. These errors appear inside the errors object outside of your data object, as a list of error objects. This is different from the expected errors, which are returned inside the body of the response, as an object.

Error | Description | Example
System Errors | Errors due to the system configuration limits of the GraphQL software. | Complexity limit reached.
API Gateway Errors | Errors due to GraphQL API usage but excludes REST API usage. | Account request limit exceeded.
System Errors

System errors occur due to queries or mutations that violate rules set up by the GraphQL software. Most commonly, this happens when you have a query that's too complex to run. The GraphQL API calculates the complexity of each query and mutation, then determines if a call will cause overload. When you encounter a system error, the GraphQL API returns an errors object nested under the data object in your response.

To reduce complexity, see the following tips:

Limit query scope to optimize results and return less items. For example, narrow the focus of your query by specifying identifiers (like BrandIds or ThirdPartyDataIds) whenever possible.
Limit data requests in GraphQL to query for only the values you need.
Limit optional data processing in GraphQL unless required. For example, when querying for data, avoid requesting the totalCount field unless you need it.
Limit page size to around 1000 in your paginated requests.
Complexity Limit Error Example

Here's an example JSON response for a GraphQL API call that failed due to high complexity.

NOTE: Complexity limits are put in place to reduce heavy workloads, but if your query is slow or unresponsive, you can still have a complexity issue. For examples of complex queries, see GraphQL Queries.

API Gateway Errors

API Gateway errors occur when you have too much workload in your queries or mutations for our servers to handle. You may be causing an infinite loop, or your query may require too many resources to run. In an API Gateway error, you receive a 429 status code with a message describing the cause. For details, see Rate Limits.

Error Codes

When you surpass the limits of GraphQL, you will receive an error message and code that describes that went wrong. Depending on the type of error, GraphQL may hide the message unless explicitly asked for in your request.

The following table lists the possible GraphQL errors that appear in the code field of the response.

Error Response Code | Description | Type of Error
AUTHENTICATION_FAILURE | The user doesn't have valid authentication credentials to access the requested resource. | Expected Error
INTERNAL_SERVER_ERROR | The server encountered an unexpected condition, which prevented it from fulfilling the request or serving the response. | Unexpected Error
RESOURCE_LIMIT_EXCEEDED | The request exceeded the threshold on the rate limit or complexity limit. | Unexpected Error
SERVICE_UNAVAILABLE | The service is temporarily unavailable. | Unexpected Error
NOT_FOUND | The requested resource isn't found, or the authenticated user isn't authorized to perform the requested action. | Expected Error
VALIDATION_FAILURE | The request didn't have all required input values, had malformed syntax, or the included input that failed validation. | Expected Error
Error Code Examples

Here's an example of an unexpected execution error for AUTHENTICATION_FAILURE with a detailed message.

Here's an example of an unexpected execution error for INTERNAL_SERVER_ERROR.

Here's an example of an expected error for NOT_FOUND that doesn't use the system error object. For details, see GraphQL Mutations.

On this page:

Unexpected Errors
System Errors
API Gateway Errors
Error Codes
Error Code Examples

