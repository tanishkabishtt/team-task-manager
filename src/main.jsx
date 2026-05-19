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
        <h1>Where brilliant teams bring ideas to life.</h1>
        <p>A beautifully simple workspace to organize tasks, collaborate with your team, and ship faster.</p>
      </section>
      <form className="auth-card" onSubmit={submit}>
        <div className="segmented">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Login</button>
          <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Signup</button>
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
  const [requests, setRequests] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [toast, setToast] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState("");
  const [activeProfileId, setActiveProfileId] = useState(routeMemberId);

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
  }

  async function loadProject(projectId) {
    const [detail, taskData] = await Promise.all([
      api.request(`/projects/${projectId}`),
      api.request(`/projects/${projectId}/tasks`),
    ]);
    setProjectDetail(detail);
    setTasks(taskData.tasks);
    
    if (detail?.role === "Admin" || user?.global_role === "System Admin") {
      api.request(`/projects/${projectId}/requests`).then(res => setRequests(res?.requests || []));
      api.request(`/users`).then(res => setAllUsers(res?.users || []));
    } else {
      setRequests([]);
      setAllUsers([]);
    }
  }

  useEffect(() => {
    if (!api.token) return;
    api.request("/me")
      .then((data) => {
        setUser(data.user);
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
    await loadDiscoverable();
    setToast("Request Sent!");
  }

  async function handleRequest(userId, action) {
    await api.request(`/projects/${activeId}/requests/${userId}/${action}`, { method: "POST" });
    await loadProject(activeId);
    setToast(`Request ${action}d`);
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
    try {
      await api.request(`/projects/${activeId}/tasks`, {
        method: "POST",
        body: JSON.stringify({
          title: form.get("title"),
          description: form.get("description"),
          dueDate: form.get("dueDate") || null,
          priority: form.get("priority"),
          assignedTo: assignedTo || null,
        }),
      });
      formElement.reset();
      await Promise.all([loadProject(activeId), loadAll(activeId)]);
    } catch (err) {
      alert("Error creating task: " + err.message);
    }
  }

  async function updateStatus(task, status) {
    await api.request(`/projects/${activeId}/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await Promise.all([loadProject(activeId), loadAll(activeId)]);
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
            <Compass size={16} /> Explore Projects
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
              <h1>Explore Projects</h1>
              <p>Discover and join public projects in your organization.</p>
            </header>
            <div className="discover-grid">
              {discoverable.length === 0 ? (
                <p>No new projects available to join.</p>
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
                    {p.request_status === 'Pending' ? (
                      <button className="primary outline" disabled>Request Sent</button>
                    ) : (
                      <button className="primary" onClick={() => joinProject(p.id)}>Join Project</button>
                    )}
                  </article>
                ))
              )}
            </div>
          </section>
        ) : !projectDetail ? (
          <section className="empty-state cyberpunk-empty">
            <RadioTower size={42} className="pulse-icon" />
            <h2>System Standby</h2>
            <p>Awaiting operator input to initialize project parameters.</p>
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
              <h3>Operator profile</h3>
              <p>This operator is assigned to the current project and can collaborate on tasks based on their role.</p>
            </div>
          </section>
        ) : (
          <>
            <Dashboard dashboard={dashboard} />
            <header className="project-header">
              <div className="header-info">
                <span className="eyebrow">{projectDetail.role} workspace</span>
                <h1>{projectDetail.project.name}</h1>
                <p>{projectDetail.project.description || "No project description yet."}</p>
                <div className="header-progress">
                  <div className="progress-track"><div className="progress-fill" style={{ width: `${(tasks.filter(t => t.status === "Done").length / Math.max(1, tasks.length)) * 100}%` }}></div></div>
                  <small>{tasks.filter(t => t.status === "Done").length} of {tasks.length} tasks completed</small>
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
                  <input type="text" placeholder="Search tasks by title or description..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
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
                    {requests.length > 0 && (
                      <Panel title="Join Requests" icon={<UserPlus size={18} />}>
                        <div className="member-list">
                          {requests.map(req => (
                            <div className="member" key={req.id}>
                              <span>{req.name}<small>{req.email}</small></span>
                              <div className="member-actions">
                                <button className="icon-button" onClick={() => handleRequest(req.id, 'approve')} aria-label="Approve" title="Approve"><CheckCircle2 size={15} color="var(--success)" /></button>
                                <button className="icon-button danger" onClick={() => handleRequest(req.id, 'reject')} aria-label="Reject" title="Reject"><Trash2 size={15} /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </Panel>
                    )}
                    <Panel title="Create Task" icon={<Plus size={18} />}>
                      <form className="stack-form" onSubmit={createTask}>
                        <input name="title" placeholder="Task title" required />
                        <textarea name="description" placeholder="Description" rows="3" />
                        <input name="dueDate" type="date" />
                        <select name="priority" defaultValue="Medium">{priorities.map((item) => <option key={item}>{item}</option>)}</select>
                        <select name="assignedTo" defaultValue="">
                          <option value="">Unassigned</option>
                          {projectDetail.members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}
                        </select>
                        <button className="primary" type="submit">Add task</button>
                      </form>
                    </Panel>
                    <Panel title="Add Member" icon={<UserPlus size={18} />}>
                      <form className="stack-form" onSubmit={addMember}>
                        <select name="email" required defaultValue="">
                          <option value="" disabled>Select a user to invite...</option>
                          {allUsers.filter(u => !projectDetail.members.some(m => m.id === u.id)).map(u => (
                            <option key={u.id} value={u.email}>{u.name} ({u.email})</option>
                          ))}
                        </select>
                        <button className="primary" type="submit">Add to project</button>
                      </form>
                    </Panel>
                  </>
                )}
                <Panel title="Team" icon={<Users size={18} />}>
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
    ["Total tasks", summary.total_tasks || 0, <ClipboardList size={18} />],
    ["In progress", summary.in_progress || 0, <FolderKanban size={18} />],
    ["Done", summary.done || 0, <CheckCircle2 size={18} />],
    ["Overdue", summary.overdue || 0, <AlertTriangle size={18} />],
  ];
  return (
    <section className="dashboard-strip">
      {cards.map(([label, value, icon]) => (
        <article className="metric" key={label}>
          {icon}<span>{label}</span><strong>{value}</strong>
        </article>
      ))}
      <article className="metric wide">
        <Users size={18} /><span>Tasks per user</span>
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
        {tasks.length === 0 && <div className="empty-column-state">Drop tasks here</div>}
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



function TelemetryDashboard({ dashboard }) {
  const summary = dashboard?.summary || {};
  const [logs, setLogs] = useState([]);
  
  useEffect(() => {
    const interval = setInterval(() => {
      const actions = ["[SYS] Cluster node optimized", "[AI] Model degradation < 0.01%", "[NET] Latency steady at 12ms", "[SEC] No anomalies detected", "[AUTH] Handshake successful", "[SYS] Workload balanced"];
      setLogs(prev => [actions[Math.floor(Math.random() * actions.length)], ...prev].slice(0, 5));
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  const cards = [
    ["System Uptime", "99.99%", <RadioTower size={18} />],
    ["Network Latency", "12ms", <Activity size={18} />],
    ["Active Tasks", summary.total_tasks || 0, <ClipboardList size={18} />],
    ["Cluster Load", `${Math.floor(Math.random() * 20) + 30}%`, <Cpu size={18} />],
  ];

  return (
    <section className="telemetry-dashboard">
      <div className="telemetry-metrics">
        {cards.map(([label, value, icon]) => (
          <article className="metric-glass" key={label}>
            <div className="icon-glow">{icon}</div>
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          </article>
        ))}
      </div>
      <div className="telemetry-terminal">
        <div className="terminal-header"><TerminalSquare size={14} /> AI Operations Log</div>
        <div className="terminal-feed">
          {logs.map((log, i) => <p key={i} style={{ opacity: 1 - i * 0.2 }}>{log}</p>)}
          {logs.length === 0 && <p>Awaiting initialization...</p>}
        </div>
      </div>
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
          <h2><Settings2 size={18} /> System Configurations</h2>
          <button className="icon-button" onClick={onClose}>&times;</button>
        </div>
        <form className="stack-form" onSubmit={submit}>
          <label>Operator Name<input value={name} onChange={e => setName(e.target.value)} required /></label>
          <label>Update Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Leave blank to keep current" /></label>
          <label>
            OpenAI API Key (Required for Autonomous Ops)
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-..." />
          </label>
          <button className="primary" type="submit">Save Configurations</button>
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
