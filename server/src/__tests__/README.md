# Server API Route Tests

These integration tests require a running PostgreSQL database.

## Running Locally

### Option 1: Docker (recommended)
```bash
# Start a test database
docker run -d --name mint-test-db -p 5433:5432 \
  -e POSTGRES_DB=mint_clone_test \
  -e POSTGRES_USER=test \
  -e POSTGRES_PASSWORD=test \
  postgres:16-alpine

# Run tests
DATABASE_URL="postgresql://test:test@localhost:5433/mint_clone_test" \
JWT_SECRET="test-secret" \
npm test -w server

# Clean up
docker stop mint-test-db && docker rm mint-test-db
```

### Option 2: Local PostgreSQL
```bash
createdb mint_clone_test

DATABASE_URL="postgresql://localhost:5432/mint_clone_test" \
JWT_SECRET="test-secret" \
npm test -w server
```

## In CI
The CI workflow starts a PostgreSQL service container automatically.
Tests run against it with the `DATABASE_URL` set by the workflow.
