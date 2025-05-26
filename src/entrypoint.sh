#!/bin/sh
set -e

# Calculate default workers, ensuring nproc is available.
# If nproc isn't available (e.g. coreutils not installed), default to a safe number like 2.
if command -v nproc > /dev/null; then
    DEFAULT_WORKERS=$(( ($(nproc --all) * 2) + 1 ))
else
    DEFAULT_WORKERS=2 # Fallback if nproc is not available
    echo "Warning: nproc not found. Defaulting to ${DEFAULT_WORKERS} workers. Consider installing coreutils."
fi

WORKERS=${WEB_CONCURRENCY:-$DEFAULT_WORKERS}
TIMEOUT=${GUNICORN_TIMEOUT:-120}
LOG_LEVEL=${GUNICORN_LOG_LEVEL:-info}

# Ensure Gunicorn is run from the correct directory if app:app is relative
# Assuming WORKDIR /usr/src/app is set in web.Dockerfile and app.py is there.
# cd /usr/src/app # Uncomment if app:app needs this context explicitly

echo "Starting Gunicorn with ${WORKERS} workers, timeout ${TIMEOUT}s, log level ${LOG_LEVEL}"

exec gunicorn \
    -w "${WORKERS}" \
    -b "0.0.0.0:5000" \
    --timeout "${TIMEOUT}" \
    --access-logfile "-" \
    --error-logfile "-" \
    --log-level "${LOG_LEVEL}" \
    "app:app"
    # The application module is src.web.app:app if run from root, 
    # or app:app if run from /usr/src/app (where app.py is)
    # Given WORKDIR /usr/src/app, app:app is correct.
