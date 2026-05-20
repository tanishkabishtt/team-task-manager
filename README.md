# Team Task Manager (TTM)

An enterprise-grade, high-performance project collaboration and sprint management platform designed for hyper-growth engineering teams. Built with **React**, **Vite**, **Express (Node.js)**, and **PostgreSQL**.

---

## 🌟 Key Capabilities & Workflows

### 1. ⏱️ Workday Attendance & Accountability Flow
* **Verification Gate:** Standard members are presented with a "Workday Offline" gate upon logging in. They must **Punch In** to activate their workday before accessing project sprint boards or updating objectives.
* **Delivery Guard:** To prevent premature sign-offs, TTM enforces a strict productivity rule: members must complete and deliver at least **one objective** status change to `Done` today before they are permitted to **Punch Out**.

### 2. 🛡️ Multi-Tier Role-Based Access Control (RBAC)
* **System Administrator:** Oversees global workspace operations, creates new projects, and manages pending member registration requests via a dedicated administrative control panel.
* **Project Administrator:** Configures project preferences, invites contributors, demotes/promotes project members, and creates or deletes tasks (sprint objectives).
* **Project Contributor (Member):** Focuses on execution. They can view tasks assigned to them (or where they are set as backup), transition task statuses on the Kanban board, and track their daily logs.

### 3. 🎯 Task & Backup Assignment
* **Dual Assignee System:** Tasks support both a **Primary Assignee** and an optional **Backup Assignee** to guarantee clear ownership and fallback redundancy for critical path sprint deliverables.

### 4. 💾 Hybrid Database Layer
* **Production Pooling:** Utilizes connection pooling via `pg` for high-throughput PostgreSQL queries in production.
* **Zero-Setup Local Development:** Automatically detects if `DATABASE_URL` is absent and falls back to `pg-mem` (an in-memory PostgreSQL engine), allowing developers to clone and run the app locally in one click without configuring a database.

---

## 🛠️ Technology Stack

* **Frontend:** React 19, React Router v7, Lucide Icons, Vanilla CSS (Premium Glassmorphism Design System)
* **Backend:** Node.js, Express 5, JWT Authentication, bcryptjs
* **Validation & Safety:** Zod (Type-safe input schema validation)
* **Database:** PostgreSQL / pg-mem fallback engine
* **Bundler & Server:** Vite, nodemon, concurrently

---

## 🏗️ Project Architecture

```mermaid
graph TD
    Client[React Frontend / Vite] -->|Fetch APIs with JWT| Server[Express API Server]
    Server -->|Router Validation: Zod| DB_Router{DB Configuration}
    DB_Router -->|DATABASE_URL exists| PG[(PostgreSQL Production)]
    DB_Router -->|No DATABASE_URL| MemDB[(pg-mem In-Memory DB)]
```

---

## 🚦 API Endpoints

### 🔐 Authentication & Session
* `POST /api/auth/signup` - Register standard users (unapproved) or system admins (requires admin key).
* `POST /api/auth/login` - Authenticate users and return session tokens.
* `GET /api/me` - Retrieve current session details.
* `GET /api/me/settings` / `PUT /api/me/settings` - Manage account display name, password, or API key.
* `DELETE /api/me` - Delete account.

### 📂 Workspaces & Projects
* `GET /api/projects` - List all projects associated with the user's role.
* `POST /api/projects` - Create a new project (System Admin only).
* `GET /api/projects/discover` - Browse public/discoverable workspaces.
* `POST /api/projects/:id/join` - Request access to a project.
* `GET /api/projects/:id` - Retrieve project detail & directory list.

### 👥 Membership & Access Control
* `POST /api/projects/:id/members` - Invite a contributor (Project Admin only).
* `PATCH /api/projects/:id/members/:userId/role` - Update role (Project Admin only).
* `DELETE /api/projects/:id/members/:userId` - Remove a member (Project Admin only).
* `GET /api/projects/:id/requests` - List pending project join requests.
* `POST /api/projects/:id/requests/:userId/approve` - Approve join request.
* `POST /api/projects/:id/requests/:userId/reject` - Decline join request.

### 📋 Sprints & Objectives
* `GET /api/projects/:id/tasks` - List tasks filterable by role and assignment.
* `POST /api/projects/:id/tasks` - Create a sprint objective.
* `PATCH /api/projects/:id/tasks/:taskId` - Update task details or status.
* `DELETE /api/projects/:id/tasks/:taskId` - Delete task (Project Admin only).

### ⏱️ Attendance & Metrics
* `GET /api/dashboard` - Get dashboard workload and state analytics.
* `GET /api/attendance/today` - Retrieve today's punch-in/out log and daily objectives count.
* `POST /api/attendance/punch-in` - Begin workday session.
* `POST /api/attendance/punch-out` - Complete workday session (verifies at least 1 objective completed).

### 👑 System Admin Dashboard
* `GET /api/admin/users` - View global team productivity directory, attendance status, and total workload.
* `POST /api/admin/users/:userId/approve` - Approve new registrations.
* `POST /api/admin/users/:userId/reject` - Decline and delete pending accounts.

---

## 💻 Local Development Setup

Follow these steps to run the application on your local machine:

### 1. Prerequisites
Ensure you have **Node.js (>= 20)** installed.

### 2. Installation
Clone the repository and install the project dependencies:
```bash
npm install
```

### 3. Environment Variables Configuration
Copy the template to create a new environment variable file:
```bash
# Windows PowerShell
copy .env.example .env

# macOS / Linux
cp .env.example .env
```
Open `.env` and fill in the values:
```text
DATABASE_URL=postgresql://user:password@localhost:5432/team_task_manager
JWT_SECRET=your-secure-random-jwt-signing-key
PORT=8080
```
*Note: If you leave `DATABASE_URL` empty, the system automatically runs using `pg-mem` as a fallback database.*

### 4. Running the App
Start both the Vite client server and Node server concurrently:
```bash
npm run dev
```
Open your browser and navigate to: **`http://localhost:5173`**

---

## 🚀 Deployment (Railway / Production)

1. Push your repository to GitHub.
2. Spin up a new project on **Railway** and choose **Provision PostgreSQL**.
3. Link your GitHub repository as a web service card.
4. Set the environment variables in the Railway dashboard:
   - `DATABASE_URL`: `${{Postgres.DATABASE_URL}}`
   - `JWT_SECRET`: `your-jwt-production-secret`
   - `NODE_ENV`: `production`
5. Railway will automatically detect the entry point, build, and deploy the application. Generate a public domain under **Settings -> Networking** to access the live app.
