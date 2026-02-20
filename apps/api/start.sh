#!/bin/sh
set -e

echo "Creating database tables..."
python create_tables.py

echo "Starting Pandocast API on port ${PORT:-8000}..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
