import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Compass,
  FolderKanban,
  LogOut,
  Plus,
  Search,
  Shield,
  Trash2,
  UserPlus,
  Users,
  GripVertical,
  Eye,
  EyeOff,
  Settings,
  Activity,
  TerminalSquare,
  Cpu,
  RadioTower,
  Power,
  Settings2,
  Filter,
} from "lucide-react";
import { BrowserRouter, Routes, Route, useNavigate, useParams } from "react-router-dom";
import "./styles.css";

const API = "/api";
const statuses = ["To Do", "In Progress", "Done"];
const priorities = ["Low", "Medium", "High"];

function useApi() {
  const [token, setToken] = useState(localStorage.getItem("ttm_token") || "");

  function saveToken(next) {
    if (next) localStorage.setItem("ttm_token", next);
    else localStorage.removeItem("ttm_token");
    setToken(next);
  }

  async function request(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  return { token, saveToken, request };
}

function AuthScreen({ api, onAuthed }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "", globalRole: "Member", adminKey: "" });
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const payload = mode === "signup" ? form : { email: form.email, password: form.password };
      const data = await api.request(`/auth/${mode}`, { method: "POST", body: JSON.stringify(payload) });
      api.saveToken(data.token);
      onAuthed(data.user);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-mark" style={{ fontSize: "2rem", display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
          <FolderKanban size={56} style={{ color: "var(--accent)" }} /> Team Task Manager
        </div>
        <h1>The Intelligent Workspace for Hyper-Growth Teams.</h1>
        <p>Streamline your engineering, align your product roadmap, and accelerate execution with a beautiful, high-performance workspace.</p>
      </section>
      <form className="auth-card" onSubmit={submit}>
        <div className="segmented">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }}>Login</button>
          <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setError(""); }}>Signup</button>
        </div>
        {mode === "signup" && (
          <>
            <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
            <label>Account Type
              <select value={form.globalRole} onChange={(e) => setForm({ ...form, globalRole: e.target.value })}>
                <option>Member</option>
                <option>System Admin</option>
              </select>
            </label>
            {form.globalRole === "System Admin" && (
              <label>Admin Access Key<input type="password" value={form.adminKey} onChange={(e) => setForm({ ...form, adminKey: e.target.value })} required placeholder="Enter the secret key" /></label>
            )}
          </>
        )}
        <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
        <label>
          Password
          <div className="password-input-wrapper">
            <input type={showPassword ? "text" : "password"} minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            <button type="button" className="show-password-btn" onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <small style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: "-0.25rem" }}>Password should be 8 characters or numbers</small>
        </label>
        {error && <p className="error" style={{ fontSize: "0.85rem", lineHeight: "1.4" }}>{error}</p>}
        <button className="primary" type="submit">{mode === "signup" ? "Create account" : "Enter workspace"}</button>
        
        <div style={{ marginTop: "2rem", paddingTop: "1rem", borderTop: "1px solid var(--border)", textAlign: "center" }}>
          <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: "0.5rem" }}>Having issues signing up?</p>
          <button type="button" className="ghost danger" onClick={async () => {
            if (confirm("Are you sure you want to completely wipe the database? This will fix corrupted schema issues.")) {
              await fetch("/api/dev/reset");
              alert("Database wiped! Try signing up now.");
              window.location.reload();
            }
          }}>Wipe & Reset Database</button>
        </div>
      </form>
    </main>
  );
}

function App({ routeProjectId = null, routeMemberId = null }) {
  const api = useApi();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [activeId, setActiveId] = useState(routeProjectId);
  const [projectDetail, setProjectDetail] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [viewMode, setViewMode] = useState("workspace");
  const [discoverable, setDiscoverable] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [allUsers, setAllUsers] = useState([]);
  const [toast, setToast] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState("");
  const [activeProfileId, setActiveProfileId] = useState(routeMemberId);

  const [attendance, setAttendance] = useState(null);
  const [tasksCompletedToday, setTasksCompletedToday] = useState(0);
  const [adminUsers, setAdminUsers] = useState([]);

  async function loadAttendance(currUser = user) {
    const checkUser = currUser || user;
    if (checkUser && checkUser.global_role === "Member") {
      try {
        const res = await api.request("/attendance/today");
        setAttendance(res.attendance);
        setTasksCompletedToday(res.tasksCompletedToday);
      } catch (err) {
        console.error("Error loading attendance", err);
      }
    }
  }

  async function loadAdminUsers(currUser = user) {
    const checkUser = currUser || user;
    if (checkUser && checkUser.global_role === "System Admin") {
      try {
        const res = await api.request("/admin/users");
        setAdminUsers(res.users);
      } catch (err) {
        console.error("Error loading admin users", err);
      }
    }
  }



  async function loadDiscoverable() {
    const data = await api.request("/projects/discover");
    setDiscoverable(data.projects);
  }

  async function loadAll(nextActive = routeProjectId || activeId) {
    const [projectData, dashData] = await Promise.all([api.request("/projects"), api.request("/dashboard")]);
    setProjects(projectData.projects);
    setDashboard(dashData);
    const targetId = nextActive || projectData.projects[0]?.id || null;
    setActiveId(targetId);
    setSearchQuery("");
    if (targetId) {
      await loadProject(targetId);
      setViewMode("workspace");
    } else {
      setProjectDetail(null);
      setTasks([]);
      if (!nextActive && projectData.projects.length === 0) setViewMode("explore");
    }
    loadAttendance();
    loadAdminUsers();
  }

  async function loadProject(projectId) {
    const [detail, taskData] = await Promise.all([
      api.request(`/projects/${projectId}`),
      api.request(`/projects/${projectId}/tasks`),
    ]);
    setProjectDetail(detail);
    setTasks(taskData.tasks);
    
    if (detail?.role === "Admin" || user?.global_role === "System Admin") {
      api.request(`/users`).then(res => setAllUsers(res?.users || []));
    } else {
      setAllUsers([]);
    }
  }

  useEffect(() => {
    if (!api.token) return;
    api.request("/me")
      .then((data) => {
        setUser(data.user);
        loadAttendance(data.user);
        loadAdminUsers(data.user);
        return loadAll(routeProjectId);
      })
      .catch((err) => {
        console.error("Initialization error:", err);
      });
  }, [api.token, routeProjectId]);

  useEffect(() => {
    if (routeProjectId && routeProjectId !== activeId) {
      setActiveId(routeProjectId);
    }
  }, [routeProjectId]);

  useEffect(() => {
    setActiveProfileId(routeMemberId);
  }, [routeMemberId]);

  if (!api.token || !user) return <AuthScreen api={api} onAuthed={setUser} />;

  const role = projectDetail?.role;
  const isAdmin = role === "Admin" || user?.global_role === "System Admin";
  const profileMember = activeProfileId ? projectDetail?.members.find((member) => member.id === activeProfileId) : null;

  async function createProject(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const data = await api.request("/projects", {
      method: "POST",
      body: JSON.stringify({ name: form.get("name"), description: form.get("description") }),
    });
    formElement.reset();
    await loadAll(data.project.id);
  }

  async function joinProject(id) {
    await api.request(`/projects/${id}/join`, { method: "POST" });
    await loadAll(id);
    setToast("Joined Workspace!");
  }

  async function addMember(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const email = new FormData(formElement).get("email");
    try {
      await api.request(`/projects/${activeId}/members`, { method: "POST", body: JSON.stringify({ email }) });
      formElement.reset();
      await loadProject(activeId);
      setToast("Member added");
    } catch (err) {
      alert("Error adding member: " + err.message);
    }
  }

  async function createTask(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const assignedTo = Number(form.get("assignedTo"));
    const backupAssignedTo = Number(form.get("backupAssignedTo"));
    try {
      await api.request(`/projects/${activeId}/tasks`, {
        method: "POST",
        body: JSON.stringify({
          title: form.get("title"),
          description: form.get("description"),
          dueDate: form.get("dueDate") || null,
          priority: form.get("priority"),
          assignedTo: assignedTo || null,
          backupAssignedTo: backupAssignedTo || null,
        }),
      });
      formElement.reset();
      await Promise.all([loadProject(activeId), loadAll(activeId), loadAdminUsers()]);
    } catch (err) {
      alert("Error creating task: " + err.message);
    }
  }

  async function updateStatus(task, status) {
    await api.request(`/projects/${activeId}/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await Promise.all([loadProject(activeId), loadAll(activeId), loadAttendance()]);
  }

  async function promoteMember(id) {
    await api.request(`/projects/${activeId}/members/${id}/role`, { method: "PATCH", body: JSON.stringify({ role: "Admin" }) });
    await loadProject(activeId);
    setToast("Promoted to Admin");
  }

  async function removeMember(id) {
    await api.request(`/projects/${activeId}/members/${id}`, { method: "DELETE" });
    await loadProject(activeId);
  }

  async function removeTask(id) {
    await api.request(`/projects/${activeId}/tasks/${id}`, { method: "DELETE" });
    await Promise.all([loadProject(activeId), loadAll(activeId)]);
  }

  const isMember = user.global_role === "Member";
  const hasPunchedIn = attendance && attendance.punch_in;
  const hasPunchedOut = attendance && attendance.punch_out;

  if (isMember && !hasPunchedIn) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div className="brand-mark" style={{ fontSize: "2rem", display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
            <FolderKanban size={56} style={{ color: "var(--accent)" }} /> Team Task Manager
          </div>
          <h1>Good day, {user.name}.</h1>
          <p>Please initialize your workday to review assigned initiatives and update sprint progress.</p>
        </section>
        <div className="auth-card glass-panel" style={{ display: 'grid', placeItems: 'center', padding: '3.5rem', textAlign: 'center', gap: '2rem' }}>
          <RadioTower size={48} className="pulse-icon" style={{ color: 'var(--accent)' }} />
          <div>
            <h2>Workday Offline</h2>
            <p style={{ color: 'var(--muted)', marginTop: '0.5rem' }}>Your current attendance is not marked for today.</p>
          </div>
          <button className="primary" style={{ width: '100%' }} onClick={async () => {
            await api.request("/attendance/punch-in", { method: "POST" });
            await loadAttendance();
            await loadAll();
          }}>
            Punch In to Workday
          </button>
        </div>
      </main>
    );
  }

  if (isMember && hasPunchedOut) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div className="brand-mark" style={{ fontSize: "2rem", display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
            <FolderKanban size={56} style={{ color: "var(--accent)" }} /> Team Task Manager
          </div>
          <h1>Excellent progress, {user.name}!</h1>
          <p>You have successfully delivered today's objectives. Your workday logs have been filed.</p>
        </section>
        <div className="auth-card glass-panel" style={{ display: 'grid', placeItems: 'center', padding: '3.5rem', textAlign: 'center', gap: '2rem' }}>
          <CheckCircle2 size={48} style={{ color: 'var(--success)' }} />
          <div>
            <h2>Workday Complete</h2>
            <p style={{ color: 'var(--muted)', marginTop: '0.5rem' }}>Punched out successfully.</p>
            <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '12px' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>Objectives Delivered Today</span>
              <strong style={{ fontSize: '1.8rem', color: 'var(--text)' }}>{tasksCompletedToday}</strong>
            </div>
          </div>
          <button className="ghost logout" style={{ width: '100%' }} onClick={() => { api.saveToken(""); setUser(null); }}>
            Logout & Close
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-top-section">
          <div className="custom-profile-badge">
            <div className="profile-badge-stack">
              {projectDetail?.role && (
                <div className={`role-pill ${projectDetail.role.toLowerCase()}`} title={projectDetail.role}>
                  <Shield size={14} />
                </div>
              )}
              <div className="avatar-box">
                {user.name?.[0]?.toUpperCase() || "?"}
              </div>
            </div>
            <div className="profile-text">
              <strong>{user.name}</strong>
              <span>{projectDetail?.role || "Operator"}</span>
            </div>
          </div>
          <div className="brand-mark"><FolderKanban size={22} /> TTM</div>
        </div>
        {user.global_role === "System Admin" && (
          <form className="mini-form" onSubmit={createProject}>
            <input name="name" placeholder="New project name" required />
            <textarea name="description" placeholder="Project brief" rows="3" />
            <button className="primary" type="submit"><Plus size={16} /> Create project</button>
          </form>
        )}
        <nav className="project-list">
          <button className={`nav-link ${viewMode === "explore" ? "active" : ""}`} onClick={() => { setViewMode("explore"); loadDiscoverable(); }}>
            <Compass size={16} /> Explore Workspaces
          </button>
          <hr />
          {projects.map((project) => (
            <button key={project.id} className={project.id === activeId && viewMode === "workspace" ? "active" : ""} onClick={() => { setActiveId(project.id); navigate(`/projects/${project.id}`); loadProject(project.id); setViewMode("workspace"); }}>
              <div className="project-list-top">
                <span>{project.name}</span>
                <small>{project.role}</small>
              </div>
              <div className="progress-track"><div className="progress-fill" style={{ width: `${(project.done_count / Math.max(1, project.task_count)) * 100}%` }}></div></div>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          {isMember && hasPunchedIn && !hasPunchedOut && (
            <div className="attendance-widget" style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '1rem',
              marginBottom: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              textAlign: 'center'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Workday Active</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text)' }}>
                  In: {attendance.punch_in ? new Date(attendance.punch_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--accent)', marginTop: '4px' }}>
                  Objectives: {tasksCompletedToday} / 1
                </span>
              </div>
              <button 
                className={`primary ${tasksCompletedToday < 1 ? 'outline' : ''}`}
                style={{ width: '100%', fontSize: '0.85rem', padding: '0.6rem' }}
                disabled={tasksCompletedToday < 1}
                onClick={async () => {
                  try {
                    await api.request("/attendance/punch-out", { method: "POST" });
                    await loadAttendance();
                  } catch (err) {
                    alert(err.message);
                  }
                }}
              >
                {tasksCompletedToday < 1 ? "Deliver 1 to Punch Out" : "Punch Out"}
              </button>
            </div>
          )}
          <button className="ghost logout" onClick={() => { api.saveToken(""); setUser(null); }}><LogOut size={16} /> Logout</button>
          <button className="ghost danger" onClick={async () => {
            if (confirm("Are you sure you want to permanently delete your account? This cannot be undone.")) {
              await api.request("/me", { method: "DELETE" });
              api.saveToken("");
              setUser(null);
            }
          }}><Trash2 size={16} /> Delete Account</button>
        </div>
      </aside>

      <section className="workspace">
        {viewMode === "explore" ? (
          <section className="explore-view">
            <header className="project-header">
              <h1>Explore Workspaces</h1>
              <p>Discover and request access to active workspaces in your organization.</p>
            </header>
            <div className="discover-grid">
              {discoverable.length === 0 ? (
                <p>No active workspaces available to join at this time.</p>
              ) : (
                discoverable.map((p) => (
                  <article key={p.id} className="project-card">
                    <h3>{p.name}</h3>
                    <p>{p.description || "No description"}</p>
                    <div className="task-meta">
                      <span>{p.member_count} members</span>
                      <span>{p.task_count} tasks</span>
                      <span>By {p.creator_name}</span>
                    </div>
                    <button className="primary" onClick={() => joinProject(p.id)}>Join Workspace</button>
                  </article>
                ))
              )}
            </div>
          </section>
        ) : !projectDetail ? (
          <section className="empty-state cyberpunk-empty">
            <RadioTower size={42} className="pulse-icon" />
            <h2>Workspace Inactive</h2>
            <p>Select or create a workspace to begin tracking your sprints.</p>
          </section>
        ) : profileMember ? (
          <section className="profile-page">
            <div className="profile-back">
              <button className="ghost" onClick={() => { setActiveProfileId(null); navigate(`/projects/${activeId}`); }}>
                <ArrowLeft size={16} /> Back to project
              </button>
            </div>
            <div className="profile-card">
              <div className="profile-avatar-large">{profileMember.name?.[0]?.toUpperCase()}</div>
              <div>
                <h2>{profileMember.name}</h2>
                <p>{profileMember.email}</p>
                <span className={`member-role ${profileMember.role.toLowerCase()}`}>{profileMember.role}</span>
              </div>
            </div>
            <div className="profile-details">
              <h3>Contributor Profile</h3>
              <p>This team member is assigned to this project with role-based access to sprint boards.</p>
            </div>
          </section>
        ) : (
          <>
            <Dashboard dashboard={dashboard} />
            {user.global_role === "System Admin" && (
              <section className="admin-tracker-section" style={{ marginBottom: '2.5rem' }}>
                <h2 style={{ fontSize: '1.25rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Users size={20} /> Team Productivity & Attendance
                </h2>
                


                <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '0.75rem 1rem', color: 'var(--muted)', fontWeight: '600', fontSize: '0.85rem', textTransform: 'uppercase' }}>Contributor</th>
                        <th style={{ padding: '0.75rem 1rem', color: 'var(--muted)', fontWeight: '600', fontSize: '0.85rem', textTransform: 'uppercase' }}>Role</th>
                        <th style={{ padding: '0.75rem 1rem', color: 'var(--muted)', fontWeight: '600', fontSize: '0.85rem', textTransform: 'uppercase' }}>Today's Status</th>
                        <th style={{ padding: '0.75rem 1rem', color: 'var(--muted)', fontWeight: '600', fontSize: '0.85rem', textTransform: 'uppercase' }}>Punch In/Out</th>
                        <th style={{ padding: '0.75rem 1rem', color: 'var(--muted)', fontWeight: '600', fontSize: '0.85rem', textTransform: 'uppercase' }}>Objectives Done (Today / Total)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminUsers.map(u => {
                        let statusText = "Away";
                        let statusColor = "var(--muted)";
                        if (u.punch_in && !u.punch_out) {
                          statusText = "Active / Punched In";
                          statusColor = "var(--success)";
                        } else if (u.punch_in && u.punch_out) {
                          statusText = "Completed / Punched Out";
                          statusColor = "var(--accent)";
                        } else if (u.global_role === 'System Admin') {
                          statusText = "Admin Active";
                          statusColor = "var(--accent)";
                        }
                        
                        return (
                          <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                            <td style={{ padding: '1rem' }}>
                              <strong>{u.name}</strong>
                              <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{u.email}</div>
                            </td>
                            <td style={{ padding: '1rem' }}>
                              <span className={`member-role-badge ${u.global_role.toLowerCase()}`} style={{
                                padding: '2px 8px',
                                background: u.global_role === 'System Admin' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                                color: u.global_role === 'System Admin' ? 'var(--accent)' : 'var(--muted)',
                                borderRadius: '12px',
                                fontSize: '0.75rem',
                                fontWeight: '600'
                              }}>{u.global_role}</span>
                            </td>
                            <td style={{ padding: '1rem', color: statusColor, fontWeight: '600', fontSize: '0.9rem' }}>
                              {statusText}
                            </td>
                            <td style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                              {u.punch_in ? (
                                <>
                                  In: {new Date(u.punch_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  {u.punch_out && ` - Out: ${new Date(u.punch_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                                </>
                              ) : "—"}
                            </td>
                            <td style={{ padding: '1rem' }}>
                              <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>{u.done_today}</span>
                              <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}> / {u.done_tasks} done total ({u.total_tasks} assigned)</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            <header className="project-header">
              <div className="header-info">
                <span className="eyebrow">{projectDetail.role} Workspace</span>
                <h1>{projectDetail.project.name}</h1>
                <p>{projectDetail.project.description || "No workspace description yet."}</p>
                <div className="header-progress">
                  <div className="progress-track"><div className="progress-fill" style={{ width: `${(tasks.filter(t => t.status === "Done").length / Math.max(1, tasks.length)) * 100}%` }}></div></div>
                  <small>{tasks.filter(t => t.status === "Done").length} of {tasks.length} objectives delivered</small>
                </div>
              </div>
              <div className="header-actions">
                <span className={`role-chip ${isAdmin ? "admin" : ""}`}><Shield size={15} /> {projectDetail.role}</span>
                <div className="profile-dropdown">
                  <button className="profile-button" onClick={() => setProfileMenuOpen((open) => !open)}>
                    {user.name?.[0]?.toUpperCase() || "U"}
                  </button>
                  {profileMenuOpen && (
                    <div className="profile-menu">
                      <div className="profile-menu-item">
                        <strong>{user.name}</strong>
                        <span>{user.email}</span>
                      </div>
                      <button className="ghost" onClick={() => { setProfileMenuOpen(false); setSettingsOpen(true); }}>
                        Account Settings
                      </button>
                      <button className="ghost" onClick={() => { setProfileMenuOpen(false); navigate(`/projects/${activeId}`); }}>
                        Refresh project link
                      </button>
                      <button className="ghost danger" onClick={() => { setProfileMenuOpen(false); api.saveToken(""); setUser(null); }}>
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </header>

            <section className="split-layout">
              <div className="task-board-container">
                <div className="search-bar">
                  <Search size={18} className="search-icon" />
                  <input type="text" placeholder="Filter sprint objectives by title or description..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                  <div className="filters">
                    <Filter size={16} />
                    <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                      <option value="">All Priorities</option>
                      {priorities.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
                <div className="task-board">
                  {statuses.map((status) => {
                    const filteredTasks = tasks.filter(t => t.status === status && (!searchQuery || t.title.toLowerCase().includes(searchQuery.toLowerCase()) || t.description?.toLowerCase().includes(searchQuery.toLowerCase())) && (!priorityFilter || t.priority === priorityFilter));
                    return (
                      <TaskColumn
                        key={status}
                        status={status}
                        tasks={filteredTasks}
                        onStatus={updateStatus}
                        onDelete={isAdmin ? removeTask : null}
                      />
                    );
                  })}
                </div>
              </div>

              <aside className="control-rail">
                {isAdmin && (
                  <>

                    <Panel title="Create Objective" icon={<Plus size={18} />}>
                      <form className="stack-form" onSubmit={createTask}>
                        <input name="title" placeholder="Objective title" required />
                        <textarea name="description" placeholder="Description" rows="3" />
                        <input name="dueDate" type="date" />
                        <select name="priority" defaultValue="Medium">{priorities.map((item) => <option key={item}>{item}</option>)}</select>
                        <label style={{ display: 'grid', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                          Primary Assignee
                          <select name="assignedTo" defaultValue="">
                            <option value="">Unassigned</option>
                            {projectDetail.members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}
                          </select>
                        </label>
                        <label style={{ display: 'grid', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                          Backup Assignee (Optional)
                          <select name="backupAssignedTo" defaultValue="">
                            <option value="">No Backup Assignee</option>
                            {projectDetail.members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}
                          </select>
                        </label>
                        <button className="primary" type="submit">Create Objective</button>
                      </form>
                    </Panel>
                    <Panel title="Invite Contributor" icon={<UserPlus size={18} />}>
                      <form className="stack-form" onSubmit={addMember}>
                        <select name="email" required defaultValue="">
                          <option value="" disabled>Select contributor to invite...</option>
                          {allUsers.filter(u => !projectDetail.members.some(m => m.id === u.id)).map(u => (
                            <option key={u.id} value={u.email}>{u.name} ({u.email})</option>
                          ))}
                        </select>
                        <button className="primary" type="submit">Add to Workspace</button>
                      </form>
                    </Panel>
                  </>
                )}
                <Panel title="Workspace Directory" icon={<Users size={18} />}>
                  <div className="member-list">
                    {projectDetail.members.map((member) => (
                      <div className="member" key={member.id} onClick={() => { setActiveProfileId(member.id); navigate(`/projects/${activeId}/profile/${member.id}`); }}>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <strong>{member.name}</strong>
                          <small>{member.email}</small>
                          <small className="member-role-badge" style={{
                            display: 'inline-block',
                            marginTop: '4px',
                            padding: '2px 8px',
                            background: member.role === 'Admin' ? 'rgba(168, 85, 247, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                            color: member.role === 'Admin' ? 'var(--accent)' : 'var(--muted)',
                            borderRadius: '12px',
                            fontSize: '0.7rem',
                            fontWeight: '600',
                            width: 'fit-content'
                          }}>
                            {member.role}
                          </small>
                        </span>
                        {isAdmin && member.id !== user.id && (
                          <div className="member-actions">
                            {member.role === "Member" && <button className="icon-button" onClick={(event) => { event.stopPropagation(); promoteMember(member.id); }} aria-label="Make Admin" title="Make Admin"><Shield size={15} /></button>}
                            <button className="icon-button danger" onClick={(event) => { event.stopPropagation(); removeMember(member.id); }} aria-label="Remove member" title="Remove Member"><Trash2 size={15} /></button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Panel>
              </aside>
            </section>
          </>
        )}
        {toast && <button className="toast" onAnimationEnd={() => setToast("")}>{toast}</button>}
      </section>
          {settingsOpen && <SettingsModal api={api} onClose={() => setSettingsOpen(false)} />}
    </main>
  );
}

function Dashboard({ dashboard }) {
  const summary = dashboard?.summary || {};
  const cards = [
    ["Total objectives", summary.total_tasks || 0, <ClipboardList size={18} />],
    ["In progress", summary.in_progress || 0, <FolderKanban size={18} />],
    ["Delivered", summary.done || 0, <CheckCircle2 size={18} />],
    ["Breached", summary.overdue || 0, <AlertTriangle size={18} />],
  ];
  return (
    <section className="dashboard-strip">
      {cards.map(([label, value, icon]) => (
        <article className="metric" key={label}>
          {icon}<span>{label}</span><strong>{value}</strong>
        </article>
      ))}
      <article className="metric wide">
        <Users size={18} /><span>Workloads per Contributor</span>
        <div className="user-bars">
          {(dashboard?.perUser || []).map((item) => <i key={item.name} style={{ "--w": `${Math.max(8, item.count * 16)}px` }}>{item.name}: {item.count}</i>)}
        </div>
      </article>
    </section>
  );
}

function TaskColumn({ status, tasks, onStatus, onDelete }) {
  const [isOver, setIsOver] = useState(false);

  return (
    <section 
      className={`column ${isOver ? 'drag-over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setIsOver(true); }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsOver(false);
        const taskId = Number(e.dataTransfer.getData("taskId"));
        if (taskId) onStatus({ id: taskId }, status);
      }}
    >
      <header><h2>{status}</h2><span>{tasks.length}</span></header>
      <div className="task-stack">
        {tasks.map((task) => <TaskCard key={task.id} task={task} onStatus={onStatus} onDelete={onDelete} />)}
        {tasks.length === 0 && <div className="empty-column-state">Drag & drop objectives here</div>}
      </div>
    </section>
  );
}

function TaskCard({ task, onStatus, onDelete }) {
  const overdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== "Done";
  const formattedDate = useMemo(() => (task.due_date ? new Date(task.due_date).toLocaleDateString() : "No due date"), [task.due_date]);
  return (
    <article 
      className={`task-card priority-${task.priority.toLowerCase()} ${overdue ? "overdue" : ""}`}
      draggable="true"
      onDragStart={(e) => {
        e.dataTransfer.setData("taskId", task.id.toString());
        e.currentTarget.style.opacity = '0.5';
      }}
      onDragEnd={(e) => {
        e.currentTarget.style.opacity = '1';
      }}
    >
      <div className="task-top">
        <div className="task-title-group">
          <GripVertical size={16} className="drag-handle" />
          <strong>{task.title}</strong>
        </div>
        {onDelete && <button className="icon-button danger" onClick={() => onDelete(task.id)} aria-label="Delete task"><Trash2 size={15} /></button>}
      </div>
      <p>{task.description || "No description"}</p>
      <div className="task-meta">
        <span>{task.priority}</span>
        <span>{formattedDate}</span>
        <span>{task.assignee_name || "Unassigned"}</span>
        {task.backup_assignee_name && (
          <span style={{ border: '1px dashed var(--accent)', color: 'var(--accent)' }}>
            Backup: {task.backup_assignee_name}
          </span>
        )}
      </div>
      <select value={task.status} onChange={(event) => onStatus(task, event.target.value)}>
        {statuses.map((status) => <option key={status}>{status}</option>)}
      </select>
    </article>
  );
}

function Panel({ title, icon, children }) {
  return (
    <section className="panel">
      <h2>{icon}{title}</h2>
      {children}
    </section>
  );
}


function SettingsModal({ api, onClose }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    api.request("/me/settings").then(res => {
      if (res?.settings) {
        setName(res.settings.name);
        setApiKey(res.settings.api_key || "");
      }
    });
  }, [api]);

  async function submit(e) {
    e.preventDefault();
    await api.request("/me/settings", {
      method: "PUT",
      body: JSON.stringify({ name, password: password || undefined, api_key: apiKey })
    });
    onClose();
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-content glass-panel" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2><Settings2 size={18} /> Workspace Preferences</h2>
          <button className="icon-button" onClick={onClose}>&times;</button>
        </div>
        <form className="stack-form" onSubmit={submit}>
          <label>Display Name<input value={name} onChange={e => setName(e.target.value)} required /></label>
          <label>Update Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Leave blank to keep current" /></label>
          <label>
            OpenAI API Token (Autonomous Agent Integration)
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-..." />
          </label>
          <button className="primary" type="submit">Save Preferences</button>
        </form>
      </div>
    </div>
  );
}

function RouterWrapper() {
  const params = useParams();
  return <App routeProjectId={params.projectId ? Number(params.projectId) : null} routeMemberId={params.memberId ? Number(params.memberId) : null} />;
}

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<RouterWrapper />} />
      <Route path="/projects/:projectId" element={<RouterWrapper />} />
      <Route path="/projects/:projectId/profile/:memberId" element={<RouterWrapper />} />
      <Route path="*" element={<RouterWrapper />} />
    </Routes>
  </BrowserRouter>
);
