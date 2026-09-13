FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MOLOCH_DB=/app/data/moloch.db \
    MOLOCH_SEED_DIR=/seed-data \
    PORT=8000

WORKDIR /app

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --requirement requirements.txt

COPY backend/moloch ./moloch
COPY frontend/public/data /seed-data

RUN addgroup --system moloch \
    && adduser --system --ingroup moloch --home /app moloch \
    && mkdir -p /app/data \
    && chown -R moloch:moloch /app /seed-data

USER moloch

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:' + __import__('os').environ.get('PORT', '8000') + '/api/health', timeout=3)"

CMD ["sh", "-c", "python -m moloch.bootstrap && exec uvicorn moloch.api:app --host 0.0.0.0 --port ${PORT:-8000}"]

