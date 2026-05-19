# Team Task Manager

A clean and responsive project collaboration app built with React, Vite, Express, and PostgreSQL.

## Overview

Team Task Manager enables teams to create projects, invite members, assign tasks, and track work progress with role-based access.

### Core capabilities

- Signup and login with JWT authentication
- Admin and member access levels within each project
- Create and manage projects, tasks, and team members
- Track status for tasks in columns: `To Do`, `In Progress`, and `Done`
- Dashboard metrics for task counts and overdue items
- Responsive UI that works on desktop and mobile

## Features

- User authentication (signup/login)
- Project creation and project list navigation
- Task creation, assignment, due dates, and priority settings
- Role badges for admins and members in the UI
- Member list with role labels and admin management controls
- Dashboard summary of total, in-progress, done, and overdue tasks
- In-memory DB fallback for local development when no PostgreSQL URL exists

## Tech stack

- Frontend: React, Vite, CSS
- Backend: Node.js, Express
- Database: PostgreSQL (preferred), pg-mem local fallback
- Auth: JWT, bcrypt
- Validation: Zod

## Project structure

- `src/main.jsx` — React application entry point
- `src/styles.css` — frontend styling and responsive layout
- `server/index.js` — Express API server and static file serving
- `server/db.js` — database initialization and query helper
- `vite.config.js` — development proxy configuration
- `railway.json` — deploy settings for hosted environments

## Local setup

1. Open terminal in the project folder.
2. Install dependencies:

```bash
npm install
```

3. Copy environment variables:

```powershell
copy .env.example .env
```

4. Edit `.env` and set the values:

```text
DATABASE_URL=postgresql://user:password@localhost:5432/team_task_manager
JWT_SECRET=your-long-random-secret
PORT=8080
```

5. Start the app in development mode:

```bash
npm run dev
```

6. Open the frontend at `http://localhost:5173`.

### Production build locally

```bash
npm run build
npm start
```

Then open `http://localhost:8080`.

## Environment variables

- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — JWT signing secret
- `PORT` — server port (default `8080`)
- `NODE_ENV` — set to `production` for production deploy

## Deployment

1. Push the repository to your Git provider.
2. Configure a PostgreSQL database and capture its connection URL.
3. Set environment variables in your hosting platform:

```text
DATABASE_URL=<your-postgres-url>
JWT_SECRET=<long-random-secret>
NODE_ENV=production
```

4. Use the commands below to build and start the service:

```bash
npm install && npm run build
npm start
```

## Usage flow

1. Signup and login.
2. Create a new project.
3. Invite members by email to the project.
4. Create tasks, assign them, and set priorities.
5. Move tasks through the Kanban-style status board.
6. Monitor team progress in the dashboard.

## API endpoints

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/me`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`
- `POST /api/projects/:id/members`
- `DELETE /api/projects/:id/members/:userId`
- `GET /api/projects/:id/tasks`
- `POST /api/projects/:id/tasks`
- `PATCH /api/projects/:id/tasks/:taskId`
- `DELETE /api/projects/:id/tasks/:taskId`
- `GET /api/dashboard`

## Notes

- Admin controls are available only to project admins.
- Members can view tasks assigned to them and update task status.
- In production, the backend serves the React app from `dist/` and handles API requests under `/api`.
