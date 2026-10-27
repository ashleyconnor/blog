---
title: Reading a file in Elixir
date: "2025-04-12T09:00:00-07:00"
tags: [elixir, tools]
excerpt: Use File.read!/1 when a missing file is a bug, File.read/1 when it is expected.
---

`File.read/1` returns a tagged tuple, so a missing file is just another case to match on:

```elixir title="read.exs"
case File.read("notes.txt") do
  {:ok, text} -> IO.puts(text)
  {:error, :enoent} -> IO.puts("no notes yet")
end
```

The image lives next to the posts, outside the TIL folder:

![A small diagram](../posts/advanced-post/diagram.png)
