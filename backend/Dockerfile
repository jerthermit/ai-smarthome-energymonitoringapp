# backend/Dockerfile

# 1. Use a lightweight Python image
FROM python:3.11-slim

# 2. Set working directory
WORKDIR /app

# 3. Install OS dependencies for psycopg2
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      gcc \
      libpq-dev \
 && rm -rf /var/lib/apt/lists/*

# 4. Copy and install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 5. Copy application code
COPY backend/ ./

# 6. Expose FastAPI port
EXPOSE 8000

# 7. Launch Uvicorn
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--reload"]