#!/bin/bash

# Test Database Management Script
# Usage: ./scripts/test-db.sh [start|stop|reset|logs]

set -e

DOCKER_COMPOSE_FILE=".dev/docker-compose.yml"
TEST_DB_URL="postgresql://postgres:postgres@localhost:5433/nestled_template_test"

case "$1" in
  "start")
    echo "🚀 Starting test database..."
    docker-compose -f $DOCKER_COMPOSE_FILE --profile testing up -d postgres-test
    
    echo "⏳ Waiting for test database to be ready..."
    timeout=30
    while ! docker exec nestled_postgres_test pg_isready -U postgres > /dev/null 2>&1; do
      sleep 1
      timeout=$((timeout - 1))
      if [ $timeout -eq 0 ]; then
        echo "❌ Test database failed to start within 30 seconds"
        exit 1
      fi
    done
    
    echo "✅ Test database is ready on port 5433"
    echo "📄 Connection string: $TEST_DB_URL"
    ;;
    
  "stop")
    echo "🛑 Stopping test database..."
    docker-compose -f $DOCKER_COMPOSE_FILE stop postgres-test
    echo "✅ Test database stopped"
    ;;
    
  "reset")
    echo "🔄 Resetting test database..."
    docker-compose -f $DOCKER_COMPOSE_FILE --profile testing down postgres-test
    docker-compose -f $DOCKER_COMPOSE_FILE --profile testing up -d postgres-test
    
    echo "⏳ Waiting for test database to be ready..."
    timeout=30
    while ! docker exec nestled_postgres_test pg_isready -U postgres > /dev/null 2>&1; do
      sleep 1
      timeout=$((timeout - 1))
      if [ $timeout -eq 0 ]; then
        echo "❌ Test database failed to start within 30 seconds"
        exit 1
      fi
    done
    
    echo "✅ Test database reset complete"
    ;;
    
  "logs")
    echo "📋 Test database logs:"
    docker-compose -f $DOCKER_COMPOSE_FILE logs postgres-test
    ;;
    
  "migrate")
    echo "🔄 Running Prisma migrations on test database..."
    export DATABASE_URL=$TEST_DB_URL
    pnpm prisma migrate deploy
    echo "✅ Test database migrations complete"
    ;;
    
  *)
    echo "Test Database Management"
    echo ""
    echo "Usage: ./scripts/test-db.sh [command]"
    echo ""
    echo "Commands:"
    echo "  start   - Start the test database container"
    echo "  stop    - Stop the test database container"
    echo "  reset   - Reset the test database (destroys data)"
    echo "  logs    - Show test database logs"
    echo "  migrate - Run Prisma migrations on test database"
    echo ""
    echo "Test DB URL: $TEST_DB_URL"
    ;;
esac