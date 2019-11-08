all: build
.PHONY: build test dev test-dev

build:
	npm run-script build

dev:
	npm run-script dev

test:
	npm run-script test

test-dev:
	npm run-script test-dev
