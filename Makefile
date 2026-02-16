.PHONY: start dev install lint help

# Default target
help:
	@echo "CoRBi Development Commands"
	@echo ""
	@echo "  make start [CORBI_DATA_DIR=/path/to/data]  Start dev server with optional data directory"
	@echo "  make dev                                   Start dev server (uses .env in repo root)"
	@echo "  make install                               Install dependencies"
	@echo "  make lint                                  Run ESLint"
	@echo ""
	@echo "Examples:"
	@echo "  make start CORBI_DATA_DIR=/Users/me/corbi-data"
	@echo "  make dev"
	@echo "  make install && make dev"

# Start with optional CORBI_DATA_DIR parameter
# Priority: command-line CORBI_DATA_DIR > repo .env > defaults to repo root
start:
ifdef CORBI_DATA_DIR
	CORBI_DATA_DIR=$(CORBI_DATA_DIR) pnpm dev
else
	pnpm dev
endif

# Alias for pnpm dev (uses repo .env if present)
dev:
	pnpm dev

# Install dependencies
install:
	pnpm install

# Lint code
lint:
	pnpm lint

# Lint with auto-fix
lint-fix:
	pnpm lint --fix
