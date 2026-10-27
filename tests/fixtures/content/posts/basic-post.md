---
title: A basic post
date: "2025-04-23T19:39:00-07:00"
tags: [python]
excerpt: A plain Markdown post used to exercise typography, code blocks and the table of contents.
---

Calling async code from sync code is still awkward. Here is [what I tried](https://example.com/) and why it should be built in, with some `inline code` for good measure.

## Why it matters

Most of the time `asyncio.run` is fine. But inside a library you do not own the loop.

- First point
- Second point

> A short quotation to check blockquote colours.

## What I tried

```py title="example.py"
import asyncio

def main():
    # sync entrypoint
    asyncio.run(fetch("https://example.com"))
```

### A smaller idea

Some more prose under a third-level heading.

## What I would change

A plain paragraph.

## Wrapping up

The end.
