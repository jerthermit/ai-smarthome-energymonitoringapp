## 🧠 System Overview

This project is a functional prototype of an AI-powered Smart Home Energy Monitoring Platform. It allows users to:

- Register and log in securely
- Add and view their connected devices
- Ingest real-time energy telemetry data
- Visualize energy usage over time
- Ask natural-language questions like:
  - “How much energy did my fridge use yesterday?”
  - “Which device used the most power last week?”

The platform consists of the following services:

- **Authentication Service** – Handles user registration, login, JWT issuance, and role-based access control.
- **Telemetry Service** – Accepts, stores, and aggregates timestamped energy readings per device.
- **Conversational AI Service** – Interprets user questions and returns structured summaries and visualizable breakdowns.

The system is fully containerized via Docker and orchestrated using `docker-compose`. All services run independently and communicate via RESTful APIs, each with auto-generated Swagger/OpenAPI documentation. The frontend is a single-page React application that integrates all backend APIs for a seamless user experience.

This is a greenfield build where architectural and product direction was entirely up to the developer.

## 🧰 Tech Stack

### 🔙 Backend
- **Language**: Python 3.11
- **Framework**: FastAPI 0.104.1
- **Database**: PostgreSQL with TimescaleDB (time-series optimized)
- **ORM & Migrations**: SQLAlchemy + Alembic
- **Authentication**: JWT (JSON Web Tokens)
- **Async Support**: Uvicorn + asyncio
- **Validation**: Pydantic 2.11.7
- **API Documentation**: Swagger/OpenAPI (auto-generated via FastAPI)
- **Testing**: Pytest, HTTPX test client

### 🔛 AI Integration
- **Conversational Engine**: Together AI (via API)
- **Natural Language Parsing**: Custom logic and AI orchestration

### 🖥 Frontend
- **Language**: TypeScript 5+
- **Framework**: React 19.1.0
- **State Management**: TanStack Query (React Query), React Hook Form
- **UI/Styling**: Tailwind CSS, Radix UI, Headless UI, Lucide & Hero Icons
- **Data Visualization**: Recharts, Chart.js
- **Routing**: React Router DOM
- **Date Handling**: date-fns
- **Animation**: Framer Motion

### ⚙ DevOps & Tooling
- **Containerization**: Docker (Python-slim and Node-slim base images)
- **Orchestration**: Docker Compose
- **Linting & Formatting**:
  - Python: Black, Flake8, mypy
  - Frontend: ESLint, Prettier
- **Environment Management**: `.env` files for frontend and backend
- **Version Control**: Git with Husky for git hooks

## ⚙️ Setup Instructions

### 1. 📁 Clone the Repository

```
git clone https://github.com/your-username/smart-home-energy-monitor.git
cd smart-home-energy-monitor
```

---

### 2. 🧪 Environment Variables

Both the backend and frontend use environment variables. Sample `.env.example` files are provided:

```
# Backend
cp backend/env.example backend/.env

# Frontend
cp frontend/.env.example frontend/.env
```

⚠️ You’ll need a **Together AI API Key** to enable natural-language queries.  
Add it to the backend `.env` file as:

```
TOGETHER_API_KEY=your_key_here
```

---

### 3. 🐳 Run the Full Stack via Docker Compose

Ensure **Docker** and **Docker Compose** are installed.

```
# Stop and clean previous runs
docker compose down -v

# Build and start all services
docker compose up --build
```

This will spin up the following containers:

- `backend`: FastAPI service at [http://localhost:8000](http://localhost:8000)
- `frontend`: React app at [http://localhost:5173](http://localhost:5173)
- `db`: PostgreSQL + TimescaleDB

---

### 4. 🛰 Seed Simulated Telemetry Data

Once the backend is running, run the data simulator:

```
docker compose exec backend python simulate.py
```

This will:

- Register a test user
- Seed devices
- Upload sample telemetry data

---

### 5. ✅ Access the App

- **Frontend**: [http://localhost:5173](http://localhost:5173)  
- **API Docs (Swagger)**: [http://localhost:8000/docs](http://localhost:8000/docs)  
- **OpenAPI Schema**: [http://localhost:8000/api/v1/openapi.json](http://localhost:8000/api/v1/openapi.json)

## 📘 API Documentation

This project uses FastAPI, which automatically generates interactive API documentation.

You can explore and test all endpoints using the following interfaces:

- **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)
- **OpenAPI Schema (JSON)**: [http://localhost:8000/api/v1/openapi.json](http://localhost:8000/api/v1/openapi.json)

You may also import the OpenAPI JSON link into Postman or Insomnia to generate a fully interactive API client for testing.

> All backend services are accessible via RESTful endpoints and grouped under `/api/v1`.

## 📮 API Usage Examples

Below are sample requests you can try using Swagger UI, Postman, or `curl`.

---

### 🔐 1. Register a New User

**Endpoint**: `POST /api/v1/auth/register`  
**Payload**:

```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "full_name": "Jane Doe"
}
```

---

### 🔑 2. Log In

**Endpoint**: `POST /api/v1/auth/login`  
**Payload**:

```json
{
  "username": "user@example.com",
  "password": "securepassword"
}
```

> Returns a JWT access token. Use this token as a Bearer token for authenticated routes.

---

### 📈 3. Ingest Telemetry Data

**Endpoint**: `POST /api/v1/telemetry`  
**Headers**: `Authorization: Bearer <your_token>`  
**Payload**:

```json
{
  "device_id": "ac-unit-1",
  "timestamp": "2025-07-28T10:00:00Z",
  "energy_kwh": 1.4
}
```

---

### 📊 4. Get Energy Summary per Device

**Endpoint**: `GET /api/v1/telemetry/energy_summary`  
**Headers**: `Authorization: Bearer <your_token>`

Returns a list of devices and their total energy consumption within a specified range (e.g., last 7 days).

---

### 🤖 5. Ask a Question via AI

**Endpoint**: `POST /api/v1/ai/chat`  
**Headers**: `Authorization: Bearer <your_token>`  
**Payload**:

```json
{
  "question": "How much energy did my fridge use yesterday?"
}
```

**Response**:

```json
{
  "summary": "Your fridge used 2.3 kWh yesterday.",
  "data_points": [
    {
      "timestamp": "2025-07-28T00:00:00Z",
      "energy_kwh": 2.3
    }
  ]
}
```

---

You can test all of these using the live Swagger UI at [http://localhost:8000/docs](http://localhost:8000/docs).

## 📌 Assumptions Made

To keep the project focused and aligned with the core scope, the following assumptions were made:

- 🐳 **Docker and Docker Compose** are installed locally.
- 🧪 Environment variables are expected to be configured by copying from `.env.example` files in both frontend and backend.
- 🔑 A **Together AI API key** is required to enable the AI assistant and must be added to `backend/.env`.
- 🛰 **Simulated telemetry data** (including user, devices, and readings) is loaded by running:
  ```
  docker compose exec backend python simulate.py
  ```
- 🎯 The system is intended for **local development and testing** only — no production deployment (e.g., HTTPS, CI/CD) is included.
- 🌐 The **frontend assumes the backend is running at** `http://localhost:8000`, and API calls are authenticated using JWT tokens.
- 🔐 Most endpoints require an **authenticated session** (e.g., telemetry, AI queries).
- 🤖 Natural-language requests hit the **live Together AI API** and may incur actual usage depending on your API key plan.
- ⏱ Token expiry is supported but **no refresh token mechanism** is included.
- ⛔ UI features like device editing or pagination were **intentionally left out** to prioritize full-stack integration.

## 🧪 Testing

This project includes unit tests for core backend logic and one integration test to validate end-to-end functionality.

To run the test suite inside the backend container:

```
docker compose exec backend pytest
```

The following areas are covered:

- ✅ Auth service logic (registration, login, JWT issuance)
- ✅ Telemetry service (data creation, aggregation logic)
- ✅ AI query orchestration (input parsing, structured response)
- ✅ Integration test for energy flow: from ingestion → AI → summary output

> Note: Test coverage is focused on backend logic. Frontend testing and CI pipelines were not included due to time prioritization toward full functional delivery.

## 🌟 Stretch Goals Achieved

In addition to the core requirements, the following stretch goals were successfully implemented:

- ✅ **Conversational Frontend UI**  
  Users can submit natural-language queries directly from the frontend interface and receive structured AI-generated responses rendered in the chat window.

- ✅ **Real-Time Chart Updates**  
  Energy usage charts automatically update in near real-time via WebSockets. No page refresh is required to reflect new telemetry data.

- ✅ **Aggregate and Ranked Analytics**  
  The system computes and displays:
  - Top energy-consuming devices
  - Hourly and daily consumption summaries
  - Aggregated usage over custom date ranges

These features were integrated end-to-end across backend logic, API design, and frontend visual presentation, providing a seamless and interactive experience.