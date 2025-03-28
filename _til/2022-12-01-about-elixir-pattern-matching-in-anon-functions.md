---
title: About Elixir Pattern Matching in Anon Functions
---

I was watching a [recording of José Valim livecoding solutions to the 2021 Advent of Code problems](https://www.youtube.com/watch?v=1rFlhFbJ1_s) and I noticed a piece of code that I didn't know was valid Elixir syntax.

In Elixir, anonymous functions can use pattern matching on their input to execute different code based on the match.

This works similarly to a cond statement:

```elixir
cond do
  2 + 2 == 5 ->
    "This will not be true"
  2 * 2 == 3 ->
    "Nor this"
  1 + 1 == 2 ->
    "But this will"
end
```

This pattern matching capability enables code like this from the video:

```elixir
input
|> String.split("\n", trim: true)
|> Enum.map(fn
  "forward " <> number -> {:forward, String.to_integer(number)}
  "down " <> number -> {:down, String.to_integer(number)}
  "up " <> number -> {:up, String.to_integer(number)}
end)
|> Enum.reduce({ _depth = 0, _position = 0}, fn
  {:forward, value}, {depth, position} -> {depth, position + value}
  {:down, value}, {depth, position} -> {depth + value, position}
  {:up, value}, {depth, position} -> {depth - value, position}
end)
|> then(fn {depth, position} -> depth * position end)
```
