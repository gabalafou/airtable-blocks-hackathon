# Other Usage Limits

From: https://developers.google.com/maps/documentation/distance-matrix/usage-and-billing

While you are no longer limited to a maximum number of elements per day (EPD), the following usage limits are still in place for the Distance Matrix API:

- Maximum of 25 origins or 25 destinations per request.
- Maximum 100 elements per server-side request.
- Maximum 100 elements per client-side request.
- 1000 elements per second (EPS), calculated as the sum of client-side and server-side queries.


# Response Status Codes

From: https://developers.google.com/maps/documentation/javascript/distancematrix

Status codes that apply to the DistanceMatrixResponse are passed in the DistanceMatrixStatus object and include:

- `OK` — The request is valid. This status can be returned even if no routes were found between any of the - origins and destinations. See Element Status Codes for the element-level status information.
- `INVALID_REQUEST` — The provided request was invalid. This is often due to missing required fields. See the - list of supported fields above.
- `MAX_ELEMENTS_EXCEEDED` — The product of origins and destinations exceeds the per-query limit.
- `MAX_DIMENSIONS_EXCEEDED` — Your request contained more than 25 origins, or more than 25 destinations.
- `OVER_QUERY_LIMIT` — Your application has requested too many elements within the allowed time period. The - request should succeed if you try again after a reasonable amount of time.
- `REQUEST_DENIED` — The service denied use of the Distance Matrix service by your web page.
- `UNKNOWN_ERROR` — A Distance Matrix request could not be processed due to a server error. The request may succeed if you try again.


# Element Status Codes

From: https://developers.google.com/maps/documentation/javascript/distancematrix

The following status codes apply to specific DistanceMatrixElement objects:

- `NOT_FOUND` — The origin and/or destination of this pairing could not be geocoded.
- `OK` — The response contains a valid result.
- `ZERO_RESULTS` — No route could be found between the origin and destination.


# Usage limits exceeded

From: https://developers.google.com/maps/premium/previous-licenses/articles/usage-limits#limitexceeded

If you exceed the usage limits you will get an OVER_QUERY_LIMIT status code as a response.

This means that the web service will stop providing normal responses and switch to returning only status code OVER_QUERY_LIMIT until more usage is allowed again. This can happen:

Within a few seconds, if the error was received because your application sent too many requests per second.
Within the next 24 hours, if the error was received because your application sent too many requests per day. The daily quotas are reset at midnight, Pacific Time.
This screencast provides a step-by-step explanation of proper request throttling and error handling, which is applicable to all web services.


Upon receiving a response with status code OVER_QUERY_LIMIT, your application should determine which usage limit has been exceeded. This can be done by pausing for 2 seconds and resending the same request. If status code is still OVER_QUERY_LIMIT, your application is sending too many requests per day. Otherwise, your application is sending too many requests per second.


# Reference

https://developers.google.com/maps/documentation/javascript/reference/distance-matrix
