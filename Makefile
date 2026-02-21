.PHONY: help dev up down logs db-migrate db-upgrade db-downgrade test test-e2e lint clean setup

# Default target
help: ## Show this help message
	@echo "Pandocast Development Commands"
	@echo "=============================="
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ---- Setup ----
setup: ## Initial project setup (copy env, install deps, start services)
	@echo "Setting up Pandocast..."
	@test -f .env || cp .env.example .env
	@echo "Installing API dependencies..."
	cd apps/api && pip install -r requirements.txt
	@echo "Installing Web dependencies..."
	cd apps/web && npm install
	@echo "Starting infrastructure..."
	docker compose up -d postgres redis
	@echo "Waiting for database..."
	@sleep 3
	@echo "Running migrations..."
	cd apps/api && alembic upgrade head
	@echo "Setup complete! Run 'make dev' to start."

# ---- Development ----
dev: ## Start all services for local development
	docker compose up -d postgres redis
	@echo "Infrastructure running. Start services:"
	@echo "  API:  cd apps/api && uvicorn app.main:app --reload --port 8000"
	@echo "  Web:  cd apps/web && npm run dev"

up: ## Start all services with Docker Compose
	docker compose up -d

down: ## Stop all services
	docker compose down

logs: ## Tail logs from all services
	docker compose logs -f

logs-api: ## Tail API logs
	docker compose logs -f api

logs-web: ## Tail Web logs
	docker compose logs -f web

# ---- Database ----
db-migrate: ## Create a new Alembic migration (usage: make db-migrate msg="add users table")
	cd apps/api && alembic revision --autogenerate -m "$(msg)"

db-upgrade: ## Run all pending migrations
	cd apps/api && alembic upgrade head

db-downgrade: ## Rollback last migration
	cd apps/api && alembic downgrade -1

db-reset: ## Reset database (WARNING: destroys all data)
	docker compose down -v
	docker compose up -d postgres redis
	@sleep 3
	cd apps/api && alembic upgrade head
	@echo "Database reset complete."

# ---- Testing ----
test: ## Run all tests
	cd apps/api && python -m pytest tests/ -v
	cd apps/web && npm test 2>/dev/null || true

test-api: ## Run API tests only
	cd apps/api && python -m pytest tests/ -v

test-web: ## Run Web tests only
	cd apps/web && npm test

test-e2e: ## Run E2E tests
	cd apps/web && npx playwright test

# ---- Linting ----
lint: ## Run linters
	cd apps/api && python -m ruff check .
	cd apps/web && npm run lint

# ---- Cleanup ----
clean: ## Remove generated files and caches
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name node_modules -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .next -exec rm -rf {} + 2>/dev/null || true
	@echo "Cleaned."

# ---- Docker ----
docker-build: ## Build Docker images
	docker compose build

docker-clean: ## Remove all Pandocast Docker resources
	docker compose down -v --rmi local
	@echo "Docker resources cleaned."
