FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates \
    libpq5 \
 && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv

WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
RUN uv sync --frozen --no-dev || uv sync --no-dev

EXPOSE 5001
USER 10001:10001
CMD ["uv", "run", "uvicorn", "twin_api.main:app", "--host", "0.0.0.0", "--port", "5001"]
