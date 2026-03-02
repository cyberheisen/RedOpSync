FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1     PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends     curl     && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY . /app

EXPOSE 8000
# Retry alembic until DB is reachable (handles startup order / DNS delay)
CMD ["sh", "-c", "for i in 1 2 3 4 5 6 7 8 9 10; do if alembic upgrade head; then break; fi; echo \"Waiting for database... ($i/10)\"; sleep 3; done && uvicorn main:app --host 0.0.0.0 --port 8000 --timeout-keep-alive 300"]
