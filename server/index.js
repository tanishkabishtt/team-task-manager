import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { initDb, query } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 8080;
const jwtSecret = process.env.JWT_SECRET || "development-secret-change-me";

app.use(cors());
app.use(express.json());

const signupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(100),
  globalRole: z.enum(["System Admin", "Member"]).optional().default("Member"),
  adminKey: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1),
});

const projectSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(600).optional().default(""),
});

const taskSchema = z.object({
  title: z.string().trim().min(2).max(140),
  description: z.string().trim().max(1000).optional().default(""),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  priority: z.enum(["Low", "Medium", "High"]),
  status: z.enum(["To Do", "In Progress", "Done"]).optional().default("To Do"),
  assignedTo: z.number().int().positive().optional().nullable(),
  backupAssignedTo: z.number().int().positive().optional().nullable(),
});

function tokenFor(user) {
  return jwt.sign({ id: user.id, email: user.email }, jwtSecret, { expiresIn: "7d" });
}

function sendAuth(res, user) {
  res.json({
    token: tokenFor(user),
    user: { id: user.id, name: user.name, email: user.email, globalRole: user.global_role },
  });
}

function validate(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid request" });
    }
    req.body = parsed.data;
    next();
  };
}

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Authentication required" });
    const payload = jwt.verify(token, jwtSecret);
    const { rows } = await query("SELECT id, name, email, global_role, approved FROM users WHERE id = $1", [payload.id]);
    if (!rows[0]) return res.status(401).json({ error: "Invalid session" });
    if (!rows[0].approved) return res.status(403).json({ error: "Account access revoked or pending approval" });
    req.user = rows[0];
    next();
  } catch {
    res.status(401).json({ error: "Invalid session" });
  }
}

async function membership(projectId, userId) {
  const { rows } = await query(
    "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
    [projectId, userId],
  );
  return rows[0] || null;
}

async function requireMember(req, res, next) {
  const projectId = Number(req.params.projectId || req.params.id);
  if (!Number.isInteger(projectId)) return res.status(400).json({ error: "Invalid project id" });
  if (req.user.global_role === "System Admin") {
    req.projectId = projectId;
    req.memberRole = "Admin";
    return next();
  }
  const member = await membership(projectId, req.user.id);
  if (!member) return res.status(403).json({ error: "Project access denied" });
  req.projectId = projectId;
  req.memberRole = member.role;
  next();
}

async function requireAdmin(req, res, next) {
  if (req.memberRole !== "Admin") return res.status(403).json({ error: "Admin access required" });
  next();
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/auth/signup", validate(signupSchema), async (req, res) => {
  try {
    const isSysAdmin = req.body.globalRole === "System Admin";
    if (isSysAdmin && req.body.adminKey !== "Admin123") {
      return res.status(403).json({ error: "Invalid Admin Access Key" });
    }
    const hash = await bcrypt.hash(req.body.password, 12);
    const approved = isSysAdmin ? true : false;
    const { rows } = await query(
      "INSERT INTO users (name, email, password_hash, global_role, approved) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, global_role, approved",
      [req.body.name, req.body.email, hash, req.body.globalRole, approved],
    );
    if (!approved) {
      return res.status(201).json({
        message: "Registration successful! Your account is pending administrator approval.",
        pending: true
      });
    }
    sendAuth(res.status(201), rows[0]);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Email is already registered" });
    res.status(500).json({ error: "Could not create account. DB Error: " + error.message });
  }
});

app.post("/api/auth/login", validate(loginSchema), async (req, res) => {
  const { rows } = await query("SELECT * FROM users WHERE email = $1", [req.body.email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(req.body.password, user.password_hash))) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  if (!user.approved) {
    return res.status(403).json({ error: "Your account is pending administrator approval." });
  }
  sendAuth(res, user);
});

app.get("/api/me", requireAuth, (req, res) => res.json({ user: req.user }));

app.get("/api/me/settings", requireAuth, async (req, res) => {
  const { rows } = await query("SELECT name, email, api_key FROM users WHERE id = $1", [req.user.id]);
  res.json({ settings: rows[0] });
});

app.put("/api/me/settings", requireAuth, async (req, res) => {
  const { name, password, api_key } = req.body;
  if (name) {
    await query("UPDATE users SET name = $1 WHERE id = $2", [name, req.user.id]);
  }
  if (api_key !== undefined) {
    await query("UPDATE users SET api_key = $1 WHERE id = $2", [api_key, req.user.id]);
  }
  if (password && password.length >= 8) {
    const hash = await bcrypt.hash(password, 10);
    await query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, req.user.id]);
  }
  res.json({ ok: true });
});

app.delete("/api/me", requireAuth, async (req, res) => {
  await query("DELETE FROM users WHERE id = $1", [req.user.id]);
  res.json({ ok: true });
});

app.get("/api/dev/reset", async (req, res) => {
  await query("DROP TABLE IF EXISTS project_members, tasks, projects, users CASCADE");
  await initDb();
  res.json({ message: "Database completely wiped and recreated." });
});

app.get("/api/users", requireAuth, async (req, res) => {
  const { rows } = await query("SELECT id, name, email FROM users ORDER BY name ASC");
  res.json({ users: rows });
});

app.get("/api/projects", requireAuth, async (req, res) => {
  if (req.user.global_role === "System Admin") {
    const { rows } = await query(
      `SELECT p.*, 'Admin' AS role,
        COUNT(DISTINCT t.id)::INT AS task_count,
        COUNT(DISTINCT CASE WHEN t.status = 'Done' THEN t.id END)::INT AS done_count
       FROM projects p
       LEFT JOIN tasks t ON t.project_id = p.id
       GROUP BY p.id
       ORDER BY p.created_at DESC`
    );
    return res.json({ projects: rows });
  }

  const { rows } = await query(
    `SELECT p.*, pm.role,
      COUNT(DISTINCT t.id)::INT AS task_count,
      COUNT(DISTINCT CASE WHEN t.status = 'Done' THEN t.id END)::INT AS done_count
     FROM projects p
     JOIN project_members pm ON pm.project_id = p.id
     LEFT JOIN tasks t ON t.project_id = p.id
     WHERE pm.user_id = $1
     GROUP BY p.id, pm.role
     ORDER BY p.created_at DESC`,
    [req.user.id],
  );
  res.json({ projects: rows });
});

app.post("/api/projects", requireAuth, validate(projectSchema), async (req, res) => {
  if (req.user.global_role !== "System Admin") {
    return res.status(403).json({ error: "Only System Admins can create new projects." });
  }
  const client = await query("INSERT INTO projects (name, description, created_by) VALUES ($1, $2, $3) RETURNING *", [
    req.body.name,
    req.body.description,
    req.user.id,
  ]);
  const project = client.rows[0];
  await query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'Admin')", [project.id, req.user.id]);
  res.status(201).json({ project: { ...project, role: "Admin" } });
});

app.get("/api/projects/discover", requireAuth, async (req, res) => {
  if (req.user.global_role === "System Admin") {
    return res.json({ projects: [] });
  }

  const { rows } = await query(
    `SELECT p.*, u.name AS creator_name,
      COUNT(DISTINCT pm.user_id)::INT AS member_count,
      COUNT(DISTINCT t.id)::INT AS task_count,
      (SELECT status FROM project_join_requests WHERE project_id = p.id AND user_id = $1 LIMIT 1) AS request_status
     FROM projects p
     JOIN users u ON u.id = p.created_by
     LEFT JOIN project_members pm ON pm.project_id = p.id
     LEFT JOIN tasks t ON t.project_id = p.id
     WHERE p.id NOT IN (SELECT project_id FROM project_members WHERE user_id = $1)
     GROUP BY p.id, u.name
     ORDER BY p.created_at DESC`,
    [req.user.id],
  );
  res.json({ projects: rows });
});

app.post("/api/projects/:id/join", requireAuth, async (req, res) => {
  const projectId = Number(req.params.id);
  if (!Number.isInteger(projectId)) return res.status(400).json({ error: "Invalid project id" });
  await query(
    `INSERT INTO project_join_requests (project_id, user_id, status)
     VALUES ($1, $2, 'Pending')
     ON CONFLICT (project_id, user_id) DO UPDATE SET status = 'Pending', created_at = NOW()`,
    [projectId, req.user.id],
  );
  res.status(201).json({ ok: true });
});

app.get("/api/projects/:id", requireAuth, requireMember, async (req, res) => {
  const projectRows = await query("SELECT * FROM projects WHERE id = $1", [req.projectId]);
  const members = await query(
    `SELECT u.id, u.name, u.email, pm.role
     FROM project_members pm JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = $1 ORDER BY pm.role, u.name`,
    [req.projectId],
  );
  
  const memberList = members.rows;
  if (req.user.global_role === "System Admin") {
    if (!memberList.find(m => m.id === req.user.id)) {
      memberList.unshift({ id: req.user.id, name: req.user.name, email: req.user.email, role: "Admin" });
    }
  }

  res.json({ project: { ...projectRows.rows[0], role: req.memberRole }, members: memberList });
});

app.post("/api/projects/:id/members", requireAuth, requireMember, requireAdmin, async (req, res) => {
  const parsed = z.object({ email: z.string().email().transform((value) => value.toLowerCase()) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Valid email is required" });
  const user = await query("SELECT id FROM users WHERE email = $1", [parsed.data.email]);
  if (!user.rows[0]) return res.status(404).json({ error: "No user found with that email" });
  await query(
    `INSERT INTO project_members (project_id, user_id, role)
     VALUES ($1, $2, 'Member')
     ON CONFLICT (project_id, user_id) DO NOTHING`,
    [req.projectId, user.rows[0].id],
  );
  res.status(201).json({ ok: true });
});

app.patch("/api/projects/:id/members/:userId/role", requireAuth, requireMember, requireAdmin, async (req, res) => {
  const userId = Number(req.params.userId);
  const parsed = z.object({ role: z.enum(["Admin", "Member"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Valid role is required" });
  if (userId === req.user.id && parsed.data.role === "Member") return res.status(400).json({ error: "Admins cannot demote themselves" });
  await query("UPDATE project_members SET role = $1 WHERE project_id = $2 AND user_id = $3", [parsed.data.role, req.projectId, userId]);
  res.json({ ok: true });
});

app.delete("/api/projects/:id/members/:userId", requireAuth, requireMember, requireAdmin, async (req, res) => {
  const userId = Number(req.params.userId);
  if (userId === req.user.id) return res.status(400).json({ error: "Admins cannot remove themselves" });
  await query("DELETE FROM project_members WHERE project_id = $1 AND user_id = $2", [req.projectId, userId]);
  res.json({ ok: true });
});

app.get("/api/projects/:id/requests", requireAuth, requireMember, requireAdmin, async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, r.status, r.created_at
     FROM project_join_requests r
     JOIN users u ON u.id = r.user_id
     WHERE r.project_id = $1 AND r.status = 'Pending'
     ORDER BY r.created_at ASC`,
    [req.projectId]
  );
  res.json({ requests: rows });
});

app.post("/api/projects/:id/requests/:userId/approve", requireAuth, requireMember, requireAdmin, async (req, res) => {
  const userId = Number(req.params.userId);
  await query("UPDATE project_join_requests SET status = 'Approved' WHERE project_id = $1 AND user_id = $2", [req.projectId, userId]);
  await query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'Member') ON CONFLICT DO NOTHING", [req.projectId, userId]);
  res.json({ ok: true });
});

app.post("/api/projects/:id/requests/:userId/reject", requireAuth, requireMember, requireAdmin, async (req, res) => {
  const userId = Number(req.params.userId);
  await query("UPDATE project_join_requests SET status = 'Rejected' WHERE project_id = $1 AND user_id = $2", [req.projectId, userId]);
  res.json({ ok: true });
});

app.get("/api/projects/:id/tasks", requireAuth, requireMember, async (req, res) => {
  const memberFilter = req.memberRole === "Admin" ? "" : "AND (t.assigned_to = $2 OR t.backup_assigned_to = $2 OR t.created_by = $2)";
  const params = req.memberRole === "Admin" ? [req.projectId] : [req.projectId, req.user.id];
  const { rows } = await query(
    `SELECT t.*, u.name AS assignee_name, u2.name AS backup_assignee_name, c.name AS creator_name
     FROM tasks t
     LEFT JOIN users u ON u.id = t.assigned_to
     LEFT JOIN users u2 ON u2.id = t.backup_assigned_to
     JOIN users c ON c.id = t.created_by
     WHERE t.project_id = $1 ${memberFilter}
     ORDER BY
      CASE t.status WHEN 'To Do' THEN 1 WHEN 'In Progress' THEN 2 ELSE 3 END,
      t.due_date NULLS LAST,
      t.created_at DESC`,
    params,
  );
  res.json({ tasks: rows });
});

app.post("/api/projects/:id/tasks", requireAuth, requireMember, requireAdmin, validate(taskSchema), async (req, res) => {
  if (req.body.assignedTo) {
    const assigneeUser = await query("SELECT global_role FROM users WHERE id = $1", [req.body.assignedTo]);
    if (assigneeUser.rows[0]?.global_role !== "System Admin") {
      const assignee = await membership(req.projectId, req.body.assignedTo);
      if (!assignee) return res.status(400).json({ error: "Assignee must be a project member" });
    }
  }
  if (req.body.backupAssignedTo) {
    const backupAssigneeUser = await query("SELECT global_role FROM users WHERE id = $1", [req.body.backupAssignedTo]);
    if (backupAssigneeUser.rows[0]?.global_role !== "System Admin") {
      const backupAssignee = await membership(req.projectId, req.body.backupAssignedTo);
      if (!backupAssignee) return res.status(400).json({ error: "Backup Assignee must be a project member" });
    }
  }
  const { rows } = await query(
    `INSERT INTO tasks (project_id, title, description, due_date, priority, status, assigned_to, backup_assigned_to, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      req.projectId,
      req.body.title,
      req.body.description,
      req.body.dueDate || null,
      req.body.priority,
      req.body.status,
      req.body.assignedTo || null,
      req.body.backupAssignedTo || null,
      req.user.id,
    ],
  );
  res.status(201).json({ task: rows[0] });
});

app.patch("/api/projects/:id/tasks/:taskId", requireAuth, requireMember, async (req, res) => {
  const taskId = Number(req.params.taskId);
  const current = await query("SELECT * FROM tasks WHERE id = $1 AND project_id = $2", [taskId, req.projectId]);
  const task = current.rows[0];
  if (!task) return res.status(404).json({ error: "Task not found" });
  const isAssignedMember = (task.assigned_to === req.user.id || task.backup_assigned_to === req.user.id) && req.memberRole === "Member";
  if (req.memberRole !== "Admin" && !isAssignedMember) return res.status(403).json({ error: "Task access denied" });

  const patchSchema = req.memberRole === "Admin" ? taskSchema.partial() : z.object({ status: z.enum(["To Do", "In Progress", "Done"]) });
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid task update" });

  const next = { ...task, ...parsed.data };
  if (parsed.data.assignedTo !== undefined) {
    next.assigned_to = parsed.data.assignedTo;
  }
  if (parsed.data.backupAssignedTo !== undefined) {
    next.backup_assigned_to = parsed.data.backupAssignedTo;
  }
  if (next.assigned_to) {
    const assigneeUser = await query("SELECT global_role FROM users WHERE id = $1", [next.assigned_to]);
    if (assigneeUser.rows[0]?.global_role !== "System Admin") {
      const assignee = await membership(req.projectId, Number(next.assigned_to));
      if (!assignee) return res.status(400).json({ error: "Assignee must be a project member" });
    }
  }
  if (next.backup_assigned_to) {
    const backupAssigneeUser = await query("SELECT global_role FROM users WHERE id = $1", [next.backup_assigned_to]);
    if (backupAssigneeUser.rows[0]?.global_role !== "System Admin") {
      const backupAssignee = await membership(req.projectId, Number(next.backup_assigned_to));
      if (!backupAssignee) return res.status(400).json({ error: "Backup Assignee must be a project member" });
    }
  }
  const { rows } = await query(
    `UPDATE tasks SET title = $1, description = $2, due_date = $3, priority = $4, status = $5,
      assigned_to = $6, backup_assigned_to = $7, updated_at = NOW()
     WHERE id = $8 AND project_id = $9 RETURNING *`,
    [
      next.title,
      next.description,
      parsed.data.dueDate !== undefined ? parsed.data.dueDate : next.due_date,
      next.priority,
      next.status,
      next.assigned_to || null,
      next.backup_assigned_to || null,
      taskId,
      req.projectId,
    ],
  );
  res.json({ task: rows[0] });
});

app.delete("/api/projects/:id/tasks/:taskId", requireAuth, requireMember, requireAdmin, async (req, res) => {
  await query("DELETE FROM tasks WHERE id = $1 AND project_id = $2", [Number(req.params.taskId), req.projectId]);
  res.json({ ok: true });
});

app.get("/api/dashboard", requireAuth, async (req, res) => {
  if (req.user.global_role === "System Admin") {
    const { rows } = await query(
      `SELECT
        COUNT(t.id)::INT AS total_tasks,
        COUNT(CASE WHEN t.status = 'To Do' THEN 1 END)::INT AS todo,
        COUNT(CASE WHEN t.status = 'In Progress' THEN 1 END)::INT AS in_progress,
        COUNT(CASE WHEN t.status = 'Done' THEN 1 END)::INT AS done,
        COUNT(CASE WHEN t.due_date < CURRENT_DATE AND t.status <> 'Done' THEN 1 END)::INT AS overdue
       FROM tasks t`
    );
    const perUser = await query(
      `SELECT COALESCE(u.name, 'Unassigned') AS name, COUNT(t.id)::INT AS count
       FROM tasks t
       LEFT JOIN users u ON u.id = t.assigned_to
       GROUP BY u.name ORDER BY count DESC, name LIMIT 8`
    );
    return res.json({ summary: rows[0], perUser: perUser.rows });
  }

  const { rows } = await query(
    `SELECT
      COUNT(t.id)::INT AS total_tasks,
      COUNT(CASE WHEN t.status = 'To Do' THEN 1 END)::INT AS todo,
      COUNT(CASE WHEN t.status = 'In Progress' THEN 1 END)::INT AS in_progress,
      COUNT(CASE WHEN t.status = 'Done' THEN 1 END)::INT AS done,
      COUNT(CASE WHEN t.due_date < CURRENT_DATE AND t.status <> 'Done' THEN 1 END)::INT AS overdue
     FROM tasks t
     JOIN project_members pm ON pm.project_id = t.project_id
     WHERE pm.user_id = $1 AND (pm.role = 'Admin' OR t.assigned_to = $1 OR t.created_by = $1)`,
    [req.user.id],
  );
  const perUser = await query(
    `SELECT COALESCE(u.name, 'Unassigned') AS name, COUNT(t.id)::INT AS count
     FROM tasks t
     JOIN project_members pm ON pm.project_id = t.project_id
     LEFT JOIN users u ON u.id = t.assigned_to
     WHERE pm.user_id = $1 AND (pm.role = 'Admin' OR t.assigned_to = $1 OR t.created_by = $1)
     GROUP BY u.name ORDER BY count DESC, name LIMIT 8`,
    [req.user.id],
  );
  res.json({ summary: rows[0], perUser: perUser.rows });
});

app.get("/api/attendance/today", requireAuth, async (req, res) => {
  const { rows } = await query(
    "SELECT * FROM attendance WHERE user_id = $1 AND date = CURRENT_DATE",
    [req.user.id]
  );
  const tasksDone = await query(
    `SELECT COUNT(*)::INT AS count FROM tasks
     WHERE (assigned_to = $1 OR backup_assigned_to = $1)
       AND status = 'Done'
       AND updated_at >= CURRENT_DATE`,
     [req.user.id]
  );
  res.json({
    attendance: rows[0] || null,
    tasksCompletedToday: tasksDone.rows[0]?.count || 0
  });
});

app.post("/api/attendance/punch-in", requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `INSERT INTO attendance (user_id, date, punch_in)
       VALUES ($1, CURRENT_DATE, NOW())
       ON CONFLICT (user_id, date) DO UPDATE SET punch_in = NOW()
       RETURNING *`,
      [req.user.id]
    );
    res.status(201).json({ attendance: rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/attendance/punch-out", requireAuth, async (req, res) => {
  try {
    const tasksDone = await query(
      `SELECT COUNT(*)::INT AS count FROM tasks
       WHERE (assigned_to = $1 OR backup_assigned_to = $1)
         AND status = 'Done'
         AND updated_at >= CURRENT_DATE`,
       [req.user.id]
    );
    const completedCount = tasksDone.rows[0]?.count || 0;
    if (completedCount < 1) {
      return res.status(400).json({ error: "You must complete at least 1 objective today before you can punch out." });
    }
    const { rows } = await query(
      `UPDATE attendance SET punch_out = NOW()
       WHERE user_id = $1 AND date = CURRENT_DATE AND punch_out IS NULL
       RETURNING *`,
      [req.user.id]
    );
    if (!rows[0]) {
      return res.status(400).json({ error: "No active punch-in found for today or you are already punched out." });
    }
    res.json({ attendance: rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/admin/users", requireAuth, async (req, res) => {
  if (req.user.global_role !== "System Admin") {
    return res.status(403).json({ error: "Access denied. System Admins only." });
  }
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.global_role, u.approved, u.created_at,
       a.punch_in, a.punch_out,
       (SELECT COUNT(*)::INT FROM tasks t WHERE t.assigned_to = u.id OR t.backup_assigned_to = u.id) AS total_tasks,
       (SELECT COUNT(*)::INT FROM tasks t WHERE (t.assigned_to = u.id OR t.backup_assigned_to = u.id) AND t.status = 'Done') AS done_tasks,
       (SELECT COUNT(*)::INT FROM tasks t WHERE (t.assigned_to = u.id OR t.backup_assigned_to = u.id) AND t.status = 'Done' AND t.updated_at >= CURRENT_DATE) AS done_today
     FROM users u
     LEFT JOIN attendance a ON a.user_id = u.id AND a.date = CURRENT_DATE
     ORDER BY u.global_role DESC, u.name ASC`
  );
  res.json({ users: rows });
});

app.post("/api/admin/users/:userId/approve", requireAuth, async (req, res) => {
  if (req.user.global_role !== "System Admin") {
    return res.status(403).json({ error: "Access denied" });
  }
  const userId = Number(req.params.userId);
  await query("UPDATE users SET approved = TRUE WHERE id = $1", [userId]);
  res.json({ ok: true });
});

app.post("/api/admin/users/:userId/reject", requireAuth, async (req, res) => {
  if (req.user.global_role !== "System Admin") {
    return res.status(403).json({ error: "Access denied" });
  }
  const userId = Number(req.params.userId);
  if (userId === req.user.id) {
    return res.status(400).json({ error: "Cannot reject yourself" });
  }
  await query("DELETE FROM users WHERE id = $1 AND approved = FALSE", [userId]);
  res.json({ ok: true });
});

const distPath = path.resolve(__dirname, "../dist");
app.use(express.static(distPath));
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api")) {
    return next();
  }
  res.sendFile(path.join(distPath, "index.html"));
});

initDb()
  .then(() => {
    app.listen(port, () => console.log(`Team Task Manager listening on ${port}`));
  })
  .catch((error) => {
    console.error("Failed to initialize database", error);
    process.exit(1);
  });
