---
title: Automatically Activating a Virtual Environment with direnv
---

When working with Python projects, activating a virtual environment ([venv](https://docs.python.org/3/library/venv.html)) manually every time you switch to a project directory can be tedious. Fortunately, [direnv](https://direnv.net/) provides a way to automate this process.

## Automatically Activating a Virtual Environment

When navigating to a project's root directory, you likely want the associated virtual environment to activate automatically. A common approach is using direnv with a `.envrc` file:

```shell
source .venv/bin/activate
```

With this setup, direnv loads the virtual environment when you enter the directory and unloads it when you leave:

```shell
❯ cd blog/
direnv: loading ~/Projects/blog/.envrc
direnv: export +VIRTUAL_ENV +VIRTUAL_ENV_PROMPT ~PATH
❯ cd ..
direnv: unloading
```

## An Official Approach

A better and officially supported method for achieving this in direnv is:

```shell
export VIRTUAL_ENV=".venv"
layout python
```

This approach leverages direnv's built-in `layout` function which is available for [range of programming languages, editors, & tools](https://github.com/direnv/direnv/wiki#project-layouts).

## Reusing the Setup Across Projects

For even greater convenience, you can define a custom function to standardize environment activation across all your projects. Check out the [direnv wiki](https://github.com/direnv/direnv/wiki/Python) for more details.
