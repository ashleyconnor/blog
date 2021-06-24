---
title: Authenticated Server Rendered pages with SvelteKit and Supabase
excerpt: A quick overview of how you can use Supabase auth with SvelteKit to produce authenticated server rendered pages.
description: A quick overview of how you can use Supabase auth with SvelteKit to produce authenticated server rendered pages.
---

If your [SvelteKit](https://kit.svelte.dev) web application has an authenticated page that contains private data from [Supabase](https://supabase.io) and you want to provide your users with a server rendered page, you'll need a way to make authenticated calls from your [SvelteKit endpoints](https://kit.svelte.dev/docs#routing-endpoints).

In this post I'll explain how you can pass your Supabase [JWT](https://jwt.io) to your SvelteKit endpoint and store it as a cookie.

This cookie can then be used to make authenticated calls to Supabase on a users behalf which allows you to generate authenticated server rendered pages.

## Why

Server Side Rendering provides a better user experience as it provides the browser with a an immediate response that can be rendered without waiting on Javascript requests.

A user may have Javascript disabled on their browser and SSR will provide a somewhat usable experience.

I personally dislike the "flicker" that is common to web applications that depend on data retrieved after the page has first loaded.

## How

In order to make authenticated calls to Supabase within our SvelteKit endpoints we need to send the JWT to the server and respond with a cookie.

We can do this in our `auth.onAuthStateChange()` callback:

```javascript
// src/routes/__layout.svelte
import { session } from '$app/stores';
import { supabase } from '$lib/supabaseClient';
import { setAuthCookie, unsetAuthCookie } from '$lib/utils/session';

// this should run on every page so I put this code in my `__layout.svelte` file
supabase.auth.onAuthStateChange(async (event, _session) => {
  if (event !== 'SIGNED_OUT') {
    session.set({ user: _session.user });
    await setAuthCookie(_session);
  } else {
    session.set({ user: { guest: true } });
    await unsetAuthCookie();
  }
});
```

The `setAuthCookie` makes a request to an endpoint with the JWT and responds with a cookie and `unsetAuthCookie` unsets the same cookie:

```javascript
// src/lib/utils/session.js
export async function setServerSession(event, session) {
  await fetch('/api/auth.json', {
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    credentials: 'same-origin',
    body: JSON.stringify({ event, session })
  });
}

export const setAuthCookie = async (session) => await setServerSession('SIGNED_IN', session);
export const unsetAuthCookie = async () => await setServerSession('SIGNED_OUT', null);
```

It's important to include the event as the `supabase-js` library expects it.

Our endpoint to set the cookie looks like so:

```javascript
// src/routes/api/auth.json.js
export async function post(req /*, res: Response (read the notes below) */) {
  // Unlike, Next.js API handlers you don't get the response object in a SvelteKit endpoint. As a result, you cannot invoke the below method to set cookies on the responses.
  // await supabaseClient.auth.api.setAuthCookie(req, res);
  // `supabaseClient.auth.api.setAuthCookie(req, res)` is dependent on both the request and the responses
  // `req` used to perform few validations before setting the cookies
  // `res` is used for setting the cookies
  return {
    status: 200,
    body: null
  };
}
```

You're probably thinking - "Where is the cookie set?" - that has to be done in our SvelteKit [`hook`](https://kit.svelte.dev/docs#hooks) because we don't have access to the response object to pass to the `supabase.auth.setAuthCookie` function.

So our `hooks.js` file looks like this:

```javascript
// src/hooks.js
export const handle = async ({ request, resolve }) => {
  // Parses `req.headers.cookie` adding them as attribute `req.cookies, as `auth.api.getUserByCookie` expects parsed cookies on attribute `req.cookies`
  const expressStyleRequest = toExpressRequest(request);
  // We can then fetch the authenticated user using this cookie
  const { user } = await auth.api.getUserByCookie(expressStyleRequest);

  // Add the user and the token to our locals so they are available on all SSR pages
  request.locals.token = expressStyleRequest.cookies['sb:token'] || undefined;
  request.locals.user = user || { guest: true };

  // If we have a token, set the supabase client to use it so we can make authorized requests as that user
  if (request.locals.token) {
    supabase.auth.setAuth(request.locals.token);
  }

  let response = await resolve(request);

  // if auth request - set cookie in response headers
  if (request.method == 'POST' && request.path === '/api/auth.json') {
    auth.api.setAuthCookie(request, toExpressResponse(response));
    response = toSvelteKitResponse(response);
  }

  return response;
};
```

Our helper functions `toExpressRequest`, `toExpressResponse`, `toSvelteKitResponse` look like this:

```javascript
// src/lib/utils/expressify.js
import * as cookie from 'cookie';

/**
 * Converts a SvelteKit request to a Express compatible request.
 * Supabase expects the cookies to be parsed.
 * @param {SvelteKit.Request} req
 * @returns Express.Request
 */
export function toExpressRequest(req) {
  return {
    ...req,
    cookies: cookie.parse(req.headers.cookie || '')
  };
}

/**
 * Converts a SvelteKit response into an Express compatible response.
 * @param {SvelteKit.Response} resp
 * @returns Express.Response
 */
export function toExpressResponse(resp) {
  return {
    ...resp,
    getHeader: (header) => resp.headers[header.toLowerCase()],
    setHeader: (header, value) => (resp.headers[header.toLowerCase()] = value),
    status: (_) => ({ json: (_) => {} })
  };
}

/**
 * Converts an Express style response to a SvelteKit compatible response
 * @param {Express.Response} resp
 * @returns SvelteKit.Response
 */
export function toSvelteKitResponse(resp) {
  const { getHeader, setHeader, ...returnAbleResp } = resp;
  return returnAbleResp;
}
```

## Issues

This works but it isn't ideal for the following reasons:

1. Supabase stores the refresh token in `localstorage` which makes it vulnerable to [XSS](https://owasp.org/www-community/attacks/xss/). This is done so the `supabase-js` client library can refresh the token on the users behalf.
2. There's no refresh mechanism on a SSR request.
3. It doesn't follow the best practices for [JWTs on frontend clients](https://hasura.io/blog/best-practices-of-using-jwt-with-graphql/).

## Potential improvements

Any improvement will likely make Supbase Auth more difficult to use, so what I'm proposing would be opt-in for users that want to improve their auth security.

1. Allow configuration of the refresh endpoint so we can proxy the request to Supabase ourselves. This would allow us to set a refresh token in a cookie and remove it from localstorage. There would need to be some extra security work in order to make sure a client wasn't sending the request directly to a Supabase auth endpoint.
2. Expose a function to generate the cookie using just the token. This would save us having to generate Express-style request/response objects just to get the cookie.

## Code

All of the code above and more is available in my repository [sveltekit-supabase-demo](https://github.com/ashleyconnor/sveltekit-supabase-demo). If you have any suggestions or feedback feel free to open an issue or PR.

## Thanks

A huge thanks to [Aftab Alam](https://github.com/one-aalam) for providing a [SvelteKit template](https://github.com/one-aalam/svelte-starter-kit/tree/auth-supabase) that was a source for much of the code above.

