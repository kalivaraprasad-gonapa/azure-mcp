# syntax=docker/dockerfile:1
FROM python:3-alpine
ENV PYTHONUNBUFFERED=1

# Install coreutils for nproc (used in entrypoint.sh)
RUN apk add --no-cache coreutils

WORKDIR /usr/src/app
COPY src/requirements.txt /usr/src/app/
RUN pip install -U -r requirements.txt
COPY ./src/web /usr/src/app/
COPY src/entrypoint.sh /
RUN chmod +x /entrypoint.sh # Make entrypoint executable
ENTRYPOINT ["/entrypoint.sh"]
