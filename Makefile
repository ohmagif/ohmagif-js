SHELL := /bin/bash

.DEFAULT_GOAL := help

.PHONY: help
help: ## List the targets
	@grep -hE '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  %-18s %s\n", $$1, $$2}'

.PHONY: install
install: ## Install the dependencies
	npm ci --no-audit --no-fund

.PHONY: lint
lint: ## tsc
	npx tsc --noEmit

.PHONY: test
test: ## vitest, gated at 100% coverage
	npx vitest run --coverage

.PHONY: test-integration
test-integration: ## The client against the live API, with OHMAGIF_API_KEY (OHMAGIF_BASE_URL for another ohmagif)
	npx vitest run --config vitest.integration.config.ts

.PHONY: build
build: ## Build dist/
	npm run build

.PHONY: example
example: ## A chat with a GIF picker on http://localhost:8082/, with OHMAGIF_API_KEY (?base= for another ohmagif)
	npm run example

.PHONY: example-build
example-build: ## Build the example into examples/dist/, as GitHub Pages serves it
	npx vite build examples --logLevel warn

.PHONY: e2e
e2e: ## Playwright against the running example (make example first)
	npx playwright test

# CI's browser run: the example built as Pages serves it, on a port of its
# own, against the live API.
.PHONY: e2e-ci
e2e-ci: example-build ## Serve the built example on :8083 and run Playwright against it (CI)
	./node_modules/.bin/vite preview examples --port 8083 --strictPort --logLevel warn & server=$$!; \
	trap 'kill $$server 2>/dev/null || true' EXIT; \
	for i in $$(seq 1 30); do curl -sf http://localhost:8083/ >/dev/null && break; sleep 1; done; \
	OHMAGIF_JS_E2E_URL=http://localhost:8083/ npx playwright test

# A version with a hyphen (1.2.0-rc.1) goes out under the dist-tag next, so
# `npm install @ohmagif/js` keeps getting the last release.
.PHONY: publish
publish: ## Publish to npm (CI, on a version tag)
	version="$$(node -p 'require("./package.json").version')"; \
	[[ "$$version" == *-* ]] && tag=next || tag=latest; \
	npm publish --provenance --access public --tag "$$tag"

.PHONY: clean
clean: ## Remove build and test output
	rm -rf ./dist ./coverage ./*.tgz ./examples/dist ./test-results ./playwright-report
