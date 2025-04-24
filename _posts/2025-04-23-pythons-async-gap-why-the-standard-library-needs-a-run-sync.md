---
title: "Python’s Async Gap: Why the Standard Library Needs a run_sync()"
excerpt: Python still lacks a standard way to run async code from sync. When 1Password’s async-only SDK broke my Playwright script, I had to hack around...
date: 2025-04-23 19:39 -0700
---

I recently updated a small script I wrote to automate file uploads to a website with no API. It uses the excellent [Playwright](https://playwright.dev/) project to drive a browser - making the tedious task of filling out forms painless.

But there was one big annoyance: authentication.

The upload forms sit behind a login screen that requires a username, password, and TOTP token. To get around this, I initially used [Playwright's `launch_persistent_context`](https://playwright.dev/python/docs/api/class-browsertype#browser-type-launch-persistent-context) so that cookies could persist across sessions. This worked fine, but I still had to log in every 7 days when the session expired.

I wanted to fix that.

## Enter 1Password

The credentials to this website are stored in my personal 1Password Vault. 1Password also has a [Python SDK](https://github.com/1Password/onepassword-sdk-python). Perfect, right?

Well...

For reasons I still don’t fully understand, 1Password provides **only** an **async** Python SDK—no synchronous methods at all.

Naively, I installed the SDK and started calling it from my existing (synchronous) Playwright code.

Now the script could fetch credentials including the TOTP from 1Password. That meant I no longer needed persistent context or manual logins. But then I hit this error:

```
Error: It looks like you are using Playwright Sync API inside the asyncio loop. Please use the Async API instead.
```

Playwright smartly offers both sync and async APIs. So I switched to using `async_playwright` and then tediously sprinkled `async`/`await` throughout my code.

That fixed the issue. The script now worked.

## Wait...But why?

Before committing these changes, I paused. Had I just rewritten a bunch of working code to accommodate one library's decision?

Was there no way to bridge async and sync without a full rewrite?

It turns out there is:

```python
def run_sync(coro):
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        # No running loop
        return asyncio.run(coro)
    else:
        # Already in an event loop (e.g. Jupyter, FastAPI, etc.)
        # Run the coroutine in a new thread
        result_container = {}

        def runner():
            result = asyncio.run(coro)
            result_container["result"] = result

        thread = threading.Thread(target=runner)
        thread.start()
        thread.join()
        return result_container["result"]
```

This gnarly snippet lets you run an `async` function and retrieve its result in synchronous code.

How it works:

1. Attempt to fetch the [running async loop](https://docs.python.org/3/library/asyncio-eventloop.html#asyncio.get_running_loop)
   1. If a loop is available we create a container for our async functions result
   1. Create an inner function `runner` to execute our async function and push the result into the container
   1. Create a thread to execute our `runner` function
   1. [Start](https://docs.python.org/3/library/threading.html#threading.Thread.start) the thread
   1. [Join](https://docs.python.org/3/library/threading.html#threading.Thread.join) the thread (this blocks our current thread until the `thread` is finished)
   1. Return the result
1. If a `RuntimeError` is raised, no loop is running, we catch the exception and return a call to [`run`](https://docs.python.org/3/library/asyncio-runner.html#asyncio.run) which takes care of executing our async function for us

Now I could move all my 1Password interactions to a dedicated async function:

```python
async def get_onepassword_creds():
	# ...
	pass

with sync_playwright() as p:
	# ...
	credentials = run_sync(get_onepassword_creds())
```

No more full async rewrite.

## Why Isn’t This Built-In?

I was happy with this result - but it begs the question. Why is all of this required? Surely this is a common enough problem that a standard library solution is warranted?

Well...

> I am unenthusiastic about providing this functionality in the stdlib. This is really not something that a well-behaved async application should do, and having the API would legitimize an idiom that is likely to come back and stab you in the back when you least need it. You would be better off refactoring your application so you don’t need this ugly hack. (Of course, I understand that realistically that’s not always possible, but if your specific app’s transition to an async world requires this hack, well, it’s only 7 lines of code.)
>
> _Guido van Rossum_

[Source](https://discuss.python.org/t/calling-coroutines-from-sync-code-2/24093/2)

That thread includes a simpler (but less robust) example:

```python
def call(coro):
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    else:
        return loop.run_until_complete(coro)
```

But this fails if the current loop is already running—like in Jupyter, FastAPI, or some test environments.

## The Mess We’re In

So there you have it.

Want to call async code from sync Python? Just copy-paste these ~~7~~ 15 lines into every project.

It’s not ideal. And it's brittle: `get_running_loop()` wasn’t even available before Python 3.7.

There are other real-world use cases too - like debugging with `pdb`:

```
# fail
(Pdb) await my_async_func()
*** SyntaxError: 'await' outside function

# works
(Pdb) result = run_sync(my_async_func())
(Pdb) print(result)
```

A poor developer experience.

## Conclusion

As more libraries adopt async-only interfaces and as more developers try to mix async and sync code, this problem will only get worse.

Python needs a standard library solution for this. It’s time the core team reconsiders their position.
