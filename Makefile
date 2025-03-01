# AshleyConnor.co.uk Makefile
# This Makefile provides shortcuts for common Jekyll commands

JEKYLL = bundle exec jekyll
DATE = $(shell date +%Y-%m-%d)
.DEFAULT_GOAL := help

# Extract the first argument after the target as NAME
NAME := $(word 2, $(MAKECMDGOALS))

.PHONY: serve draft post til publish unpublish page help

help:
	@echo "Usage: make <command> <name>"
	@echo "Commands: serve, draft, post, til, publish, unpublish, page"

serve:
	$(JEKYLL) serve --drafts

draft post til publish unpublish page:
	@[ "$(NAME)" ] || (echo "Usage: make $@ <name>" && exit 1)
	$(JEKYLL) $@ "$(NAME)"

# Prevent Make from treating arguments as targets
%:
	@:
