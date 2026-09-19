# Chirpy

A RESTful backend API for a small social media application, built with TypeScript, Express, PostgreSQL, and Drizzle ORM.

## Features

* User registration and login
* Password hashing with Argon2
* JWT authentication
* Refresh token authentication
* Create, read, and delete chirps
* Chirp profanity filtering
* Filter chirps by author
* Sort chirps by creation date
* User profile updates
* Chirpy Red account upgrades through a webhook
* PostgreSQL database with Drizzle ORM
* Database migrations

## Tech Stack

* TypeScript
* Node.js
* Express
* PostgreSQL
* Drizzle ORM
* JWT
* Argon2

## Getting Started

### 1. Clone the repository

```bash
git clone <your-repository-url>
cd Chirpy
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file:

```env
DB_URL="postgres://postgres:postgres@localhost:5432/chirpy?sslmode=disable"
PORT=8080
PLATFORM="dev"
JWT_SECRET="your-secret"
POLKA_KEY="your-polka-key"
```

### 4. Run database migrations

```bash
npx drizzle-kit migrate
```

### 5. Start the development server

```bash
npm run dev
```

The API will be available at:

```text
http://localhost:8080
```

## Example Endpoints

```text
POST   /api/users
POST   /api/login
PUT    /api/users
POST   /api/chirps
GET    /api/chirps
GET    /api/chirps/:chirpId
DELETE /api/chirps/:chirpId
POST   /api/refresh
POST   /api/revoke
POST   /api/polka/webhooks
```

The chirp endpoint supports filtering and sorting:

```text
GET /api/chirps?authorId=<user-id>
GET /api/chirps?sort=asc
GET /api/chirps?sort=desc
```

## Project Structure

```text
src/
├── auth.ts                 # Password hashing and authentication helpers
├── config.ts               # Environment configuration
├── index.ts                # Express server and API routes
└── db/
    ├── index.ts            # Database connection
    ├── schema.ts           # Database schema
    └── queries/
        ├── users.ts        # User database queries
        ├── chirps.ts      # Chirp database queries
        └── refreshTokens.ts # Refresh token queries
```

## Note

This project was built as part of the Boot.dev backend development path.
