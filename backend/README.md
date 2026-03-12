# HRMS Backend (Auth)

Node, Express, PostgreSQL — auth only.

## Setup

1. **PostgreSQL**: Create a database (e.g. `hrms`).

2. **Env**: Copy `.env.example` to `.env` and set:
   - `DATABASE_URL` — e.g. `postgresql://user:password@localhost:5432/hrms`
   - `JWT_SECRET` — long random string for production
   - `PORT` (optional, default 4000)

3. **Init DB**:
   ```bash
   psql -U your_user -d hrms -f db/init.sql
   ```
   Or run the SQL in `db/init.sql` in your DB client.

4. **Install & run**:
   ```bash
   cd backend
   npm install
   npm run dev
   ```

## API (Auth)

| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | `{ email, password, name, role }` | Register; `role`: `employee` or `admin`. Returns `{ user, token }`. |
| POST | `/api/auth/login` | `{ email, password }` | Login. Returns `{ user, token }`. |
| GET | `/api/auth/me` | — | Current user (header: `Authorization: Bearer <token>`). Returns `{ user }`. |

**User shape**: `{ id, email, name, role }` (matches frontend `User` type).

Frontend should send `Authorization: Bearer <token>` on protected requests and store the token (e.g. localStorage) after login/register.
