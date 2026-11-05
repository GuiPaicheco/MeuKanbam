import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  Columns3,
  List,
  CalendarDays,
  CalendarOff,
  Plus,
  Search,
  ArrowUpRight,
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
  X,
  Check,
  Link as LinkIcon,
  Clock,
  CheckCircle2,
  PauseCircle,
  MoreHorizontal,
  Flag,
  LogOut,
  Download,
  LoaderCircle,
  ShieldCheck,
  Menu,
  SlidersHorizontal,
  Activity,
  RefreshCw,
  Trash2,
  MessageSquare,
  CheckSquare,
  LockKeyhole,
  ArrowRight,
  Inbox,
  ExternalLink,
} from "lucide-react";
import { api } from "./api";
import "./styles.css";
const statuses = {
  doing: "Em andamento",
  todo: "A fazer",
  paused: "Pausadas",
  questions: "Dúvidas",
  routine: "Rotineiras",
  done: "Concluídas",
};
const priorities = {
  P1: "Urgente",
  P2: "Alta",
  P3: "Média",
  P4: "Baixa",
  permanent: "Permanente",
};
const uid = () =>
  crypto.randomUUID?.() ||
  "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (
      Number(c) ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))
    ).toString(16),
  );
const today = () => new Date().toLocaleDateString("en-CA");
const dateLabel = (v) =>
  v
    ? new Date(v.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
      })
    : "Sem prazo";
const overdue = (t) =>
  t.due_date && t.due_date < today() && t.status !== "done";
const percent = (t) =>
  t.status === "done"
    ? 100
    : t.subtasks?.length
      ? Math.round(
          (t.subtasks.filter((s) => s.done).length / t.subtasks.length) * 100,
        )
      : Number(t.progress || 0);
const blankTask = () => ({
  id: uid(),
  title: "",
  description: "",
  status: "todo",
  priority: "P3",
  progress: 0,
  due_date: "",
  assignee: "",
  tags: [],
  subtasks: [],
  dependencies: [],
  links: [],
  comments: [],
  recurrence: "",
  created_at: new Date().toISOString(),
});
function download(name, content, type = "application/json") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function googleCalendar(e) {
  const dt = (d) => d?.slice(0, 10).replaceAll("-", "");
  const end = new Date((e.end_date || e.start_date).slice(0, 10) + "T12:00:00");
  end.setDate(end.getDate() + 1);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(e.title)}&dates=${dt(e.start_date)}/${dt(end.toLocaleDateString("en-CA"))}&details=${encodeURIComponent(e.description || "")}`;
}
function calendarExport(events) {
  const clean = (v) =>
    String(v || "")
      .replaceAll("\\", "\\\\")
      .replaceAll("\n", "\\n")
      .replaceAll(",", "\\,")
      .replaceAll(";", "\\;");
  let lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MeuKanbam//PT-BR"];
  events
    .filter((e) => e.start_date)
    .forEach((e) => {
      const end = new Date(
        (e.end_date || e.start_date).slice(0, 10) + "T12:00:00",
      );
      end.setDate(end.getDate() + 1);
      lines.push(
        "BEGIN:VEVENT",
        `UID:${e.id}@meukanbam`,
        `DTSTAMP:${new Date()
          .toISOString()
          .replace(/[-:]/g, "")
          .replace(/\.\d{3}/, "")}`,
        `DTSTART;VALUE=DATE:${e.start_date.slice(0, 10).replaceAll("-", "")}`,
        `DTEND;VALUE=DATE:${end.toLocaleDateString("en-CA").replaceAll("-", "")}`,
        `SUMMARY:${clean(e.title)}`,
        `DESCRIPTION:${clean(e.description)}`,
        "END:VEVENT",
      );
    });
  lines.push("END:VCALENDAR");
  download("meukanbam-agenda.ics", lines.join("\r\n"), "text/calendar");
}
function Empty({
  title = "Um espaço para suas próximas entregas",
  text = "Adicione a primeira tarefa e transforme suas pendências em um plano claro.",
  action,
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Inbox size={28} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <button className="primary" onClick={action}>
          <Plus size={16} /> Criar tarefa
        </button>
      )}
    </div>
  );
}
function App() {
  const [session, setSession] = useState(null),
    [authLoading, setAuthLoading] = useState(true),
    [recoveryMode, setRecoveryMode] = useState(
      location.hash.includes("type=recovery"),
    ),
    [tasks, setTasks] = useState([]),
    [events, setEvents] = useState([]),
    [activity, setActivity] = useState([]),
    [view, setView] = useState("dashboard"),
    [search, setSearch] = useState(""),
    [priority, setPriority] = useState(""),
    [statusFilter, setStatusFilter] = useState(""),
    [ownerFilter, setOwnerFilter] = useState(""),
    [task, setTask] = useState(null),
    [event, setEvent] = useState(null),
    [loading, setLoading] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [mobile, setMobile] = useState(false),
    [exportMenu, setExportMenu] = useState(false),
    [month, setMonth] = useState(new Date()),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.resolve(api.getSession())
      .then((s) => setSession(s))
      .catch((e) => setError(e.message))
      .finally(() => setAuthLoading(false));
    const sub = api.onAuthStateChange?.((s, event) => {
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
      setSession(s);
    });
    return () => {
      if (typeof sub === "function") sub();
      else sub?.unsubscribe?.();
    };
  }, []);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const [t, e, a] = await Promise.all([
        api.getTasks(),
        api.getEvents(),
        api.getActivity(),
      ]);
      setTasks(t || []);
      setEvents(e || []);
      setActivity(a || []);
    } catch (e) {
      setError(e.message || "Não foi possível carregar os dados.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (session) load();
    else {
      setTasks([]);
      setEvents([]);
      setActivity([]);
    }
  }, [session]);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  useEffect(() => {
    if (!task && !event) return;
    const fn = (e) => {
      if (e.key === "Escape") {
        setTask(null);
        setEvent(null);
      }
    };
    document.addEventListener("keydown", fn);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", fn);
    };
  }, [!!task, !!event]);
  async function saveTask(t) {
    if (!t.title.trim()) throw Error("Informe o título da tarefa.");
    if (t.dependencies?.includes(t.id))
      throw Error("Uma tarefa não pode depender dela mesma.");
    const graph = new Map(
      [...tasks.filter((x) => x.id !== t.id), t].map((x) => [
        x.id,
        x.dependencies || [],
      ]),
    );
    const visited = new Set();
    function cycle(id, path = new Set()) {
      if (path.has(id)) return true;
      if (visited.has(id)) return false;
      const next = new Set(path);
      next.add(id);
      for (const dep of graph.get(id) || []) if (cycle(dep, next)) return true;
      visited.add(id);
      return false;
    }
    if (cycle(t.id))
      throw Error(
        "As dependências formam um ciclo. Revise os vínculos antes de salvar.",
      );
    const updated = await api.saveTask({
      ...t,
      title: t.title.trim(),
      due_date: t.due_date || null,
      progress: t.status === "done" ? 100 : percent(t),
    });
    setTasks((all) =>
      all.some((x) => x.id === t.id)
        ? all.map((x) => (x.id === t.id ? updated : x))
        : [updated, ...all],
    );
    setNotice("Tarefa salva com sucesso.");
  }
  async function move(t, status) {
    try {
      await saveTask({ ...t, status });
    } catch (e) {
      setError(e.message);
    }
  }
  const filtered = tasks.filter(
    (t) =>
      (!search ||
        [t.title, t.description, t.assignee, ...(t.tags || [])]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (!priority || t.priority === priority) &&
      (!statusFilter || t.status === statusFilter) &&
      (!ownerFilter || t.assignee === ownerFilter),
  );
  const active = tasks.filter((t) => t.status !== "done"),
    done = tasks.filter((t) => t.status === "done"),
    late = active.filter(overdue),
    soon = active
      .filter((t) => t.due_date)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .slice(0, 5);
  const nav = [
    ["dashboard", LayoutDashboard, "Visão geral"],
    ["board", Columns3, "Quadro de tarefas"],
    ["list", List, "Lista de tarefas"],
    ["calendar", CalendarDays, "Agenda"],
    ["absences", CalendarOff, "Ausências"],
  ];
  function navigate(v) {
    setView(v);
    setMobile(false);
  }
  const title = {
    dashboard: "Seu trabalho, em perspectiva.",
    board: "Quadro de tarefas",
    list: "Todas as tarefas",
    calendar: "Agenda compartilhada",
    absences: "Ausências e planejamento",
  }[view];
  if (authLoading)
    return (
      <div className="splash">
        <span className="brand-mark">
          m<span>.</span>
        </span>
        <LoaderCircle className="spin" />
      </div>
    );
  if (!session || recoveryMode)
    return (
      <Login
        onLogin={setSession}
        externalError={error}
        recoveryMode={recoveryMode}
        onRecovered={() => {
          setRecoveryMode(false);
          setSession(null);
        }}
      />
    );
  return (
    <div className="app">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("dashboard");
          }}
        >
          <span className="brand-mark">
            m<span>.</span>
          </span>
          <span>
            meukanbam<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="workspace-label">ESPAÇO DE TRABALHO</div>
        <div className="workspace">
          <div className="workspace-icon">D</div>
          <div>
            <strong>Meu trabalho</strong>
            <small>Organização compartilhada</small>
          </div>
          <span className="workspace-dot" />
        </div>
        <div className="nav-label">ORGANIZAR</div>
        <nav>
          {nav.map(([id, Icon, label]) => (
            <button
              key={id}
              className={view === id ? "selected" : ""}
              onClick={() => navigate(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === "board" && <b>{active.length}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="note-spark">✦</span>
          <strong>Clareza para seguir em frente.</strong>
          <p>Uma prioridade de cada vez. Cada pequena entrega conta.</p>
          <div className="note-line" />
        </div>
        <div className="sidebar-bottom">
          <div className="secure">
            <ShieldCheck size={15} /> Ambiente de acesso restrito
          </div>
          <div className="user">
            <div className="avatar">
              {session.user?.email?.[0]?.toUpperCase() || "U"}
            </div>
            <div>
              <strong>Minha conta</strong>
              <small title={session.user?.email}>{session.user?.email}</small>
            </div>
            <button
              title="Sair da conta"
              aria-label="Sair da conta"
              onClick={async () => {
                await api.logout();
                setSession(null);
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      {mobile && (
        <div className="sidebar-scrim" onClick={() => setMobile(false)} />
      )}
      <main>
        <header className="topbar">
          <button
            className="icon-btn mobile-toggle"
            aria-label="Abrir menu"
            onClick={() => setMobile(true)}
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            Meu trabalho <ChevronRight size={13} />
            <strong>{nav.find((n) => n[0] === view)?.[2]}</strong>
          </div>
          <div className="topbar-right">
            <span className="today-label">
              {new Date().toLocaleDateString("pt-BR", {
                weekday: "short",
                day: "numeric",
                month: "long",
              })}
            </span>
            <div className="avatar small">
              {session.user?.email?.[0]?.toUpperCase() || "U"}
            </div>
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">SEU ESPAÇO DE ORGANIZAÇÃO</div>
              <h1>{title}</h1>
              <p>
                {view === "dashboard"
                  ? "Uma visão clara das prioridades, dos próximos passos e de tudo que já avançou."
                  : view === "board"
                    ? "Do primeiro passo à entrega. Acompanhe cada etapa do seu trabalho."
                    : view === "calendar"
                      ? "Compromissos, prazos e planejamento no mesmo lugar."
                      : view === "absences"
                        ? "Antecipe ausências e mantenha a equipe alinhada."
                        : "Encontre, organize e acompanhe cada pendência."}
              </p>
            </div>
            <div className="heading-actions">
              <div className="export-wrap">
                <button
                  className="secondary"
                  onClick={() => setExportMenu(!exportMenu)}
                >
                  <Download size={16} />
                  <span>Exportar</span>
                </button>
                {exportMenu && (
                  <div className="dropdown">
                    <button
                      onClick={() => {
                        download(
                          "meukanbam-backup.json",
                          JSON.stringify(
                            {
                              version: 1,
                              exported_at: new Date().toISOString(),
                              tasks,
                              events,
                            },
                            null,
                            2,
                          ),
                        );
                        setExportMenu(false);
                      }}
                    >
                      Backup completo (.json)
                    </button>
                    <button
                      onClick={() => {
                        const esc = (v) =>
                          '"' +
                          (/^[=+@\-\t\r]/.test(String(v ?? ""))
                            ? "'" + String(v ?? "")
                            : String(v ?? "")
                          ).replaceAll('"', '""') +
                          '"';
                        download(
                          "meukanbam-tarefas.csv",
                          "\uFEFF" +
                            [
                              [
                                "Título",
                                "Status",
                                "Prioridade",
                                "Progresso",
                                "Prazo",
                                "Responsável",
                              ],
                              ...tasks.map((t) => [
                                t.title,
                                statuses[t.status],
                                priorities[t.priority],
                                percent(t) + "%",
                                t.due_date,
                                t.assignee,
                              ]),
                            ]
                              .map((r) => r.map(esc).join(";"))
                              .join("\r\n"),
                          "text/csv",
                        );
                        setExportMenu(false);
                      }}
                    >
                      Tarefas (.csv)
                    </button>
                    <button
                      onClick={() => {
                        calendarExport(events);
                        setExportMenu(false);
                      }}
                    >
                      Agenda (.ics)
                    </button>
                  </div>
                )}
              </div>
              <button
                className="primary"
                onClick={() =>
                  view === "calendar" || view === "absences"
                    ? setEvent({
                        id: uid(),
                        title: "",
                        description: "",
                        start_date: today(),
                        end_date: today(),
                        kind: view === "absences" ? "absence" : "event",
                      })
                    : setTask(blankTask())
                }
              >
                <Plus size={18} />
                {view === "calendar"
                  ? "Novo compromisso"
                  : view === "absences"
                    ? "Nova ausência"
                    : "Nova tarefa"}
              </button>
            </div>
          </div>
          {error && (
            <div className="alert error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Fechar aviso">
                <X size={16} />
              </button>
            </div>
          )}
          {loading ? (
            <div className="loading">
              <LoaderCircle className="spin" />
              Carregando seu espaço…
            </div>
          ) : (
            <>
              {view === "dashboard" && (
                <>
                  <div className="stats">
                    <Stat
                      label="Tarefas em aberto"
                      value={active.length}
                      Icon={Columns3}
                      subtitle="Seu próximo passo começa aqui"
                      color="teal"
                    />
                    <Stat
                      label="Em andamento"
                      value={tasks.filter((t) => t.status === "doing").length}
                      Icon={Clock}
                      subtitle="Projetos ganhando forma"
                      color="blue"
                    />
                    <Stat
                      label="Concluídas"
                      value={done.length}
                      Icon={CheckCircle2}
                      subtitle={`${tasks.length ? Math.round((done.length / tasks.length) * 100) : 0}% de todas as tarefas`}
                      color="green"
                    />
                    <Stat
                      label="Prazos em atraso"
                      value={late.length}
                      Icon={Flag}
                      subtitle={
                        late.length
                          ? "Precisam de atenção"
                          : "Tudo sob controle por aqui"
                      }
                      color="orange"
                    />
                  </div>
                  <div className="dashboard-grid">
                    <section className="panel focus-panel">
                      <div className="panel-heading">
                        <div>
                          <span className="section-kicker">
                            FOCO DO MOMENTO
                          </span>
                          <h2>
                            Em andamento{" "}
                            <span className="count">
                              {tasks.filter((t) => t.status === "doing").length}
                            </span>
                          </h2>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => navigate("board")}
                        >
                          Ver quadro <ArrowUpRight size={16} />
                        </button>
                      </div>
                      <div className="focus-tasks">
                        {tasks.filter((t) => t.status === "doing").length ? (
                          tasks
                            .filter((t) => t.status === "doing")
                            .slice(0, 4)
                            .map((t) => (
                              <TaskCard
                                key={t.id}
                                t={t}
                                onOpen={() => setTask(structuredClone(t))}
                              />
                            ))
                        ) : (
                          <Empty
                            title="Qual vai ser o foco de hoje?"
                            text="Escolha uma tarefa e mova para “Em andamento” para acompanhar por aqui."
                            action={() =>
                              setTask({ ...blankTask(), status: "doing" })
                            }
                          />
                        )}
                      </div>
                    </section>
                    <section className="panel deadline-panel">
                      <div className="panel-heading">
                        <div>
                          <span className="section-kicker">
                            OLHO NO CALENDÁRIO
                          </span>
                          <h2>Próximos prazos</h2>
                        </div>
                        <CalendarDays size={20} className="muted" />
                      </div>
                      {soon.length ? (
                        <div className="deadline-list">
                          {soon.map((t) => (
                            <button
                              key={t.id}
                              onClick={() => setTask(structuredClone(t))}
                            >
                              <div
                                className={`date-tile ${overdue(t) ? "late" : ""}`}
                              >
                                <b>
                                  {new Date(t.due_date + "T12:00:00").getDate()}
                                </b>
                                <span>
                                  {new Date(
                                    t.due_date + "T12:00:00",
                                  ).toLocaleDateString("pt-BR", {
                                    month: "short",
                                  })}
                                </span>
                              </div>
                              <div>
                                <strong>{t.title}</strong>
                                <small>
                                  {overdue(t)
                                    ? "Prazo em atraso"
                                    : statuses[t.status]}
                                </small>
                              </div>
                              <ChevronRight size={16} />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <Empty
                          title="Sem prazos por enquanto"
                          text="Defina datas nas tarefas para planejar suas próximas entregas."
                        />
                      )}
                    </section>
                    <section className="panel distribution">
                      <div className="panel-heading">
                        <div>
                          <span className="section-kicker">PANORAMA</span>
                          <h2>Cada etapa importa</h2>
                        </div>
                      </div>
                      <div className="distribution-bar">
                        {Object.entries(statuses).map(([s, label]) => (
                          <div
                            key={s}
                            title={`${label}: ${tasks.filter((t) => t.status === s).length}`}
                            className={`segment ${s}`}
                            style={{
                              flex:
                                tasks.filter((t) => t.status === s).length ||
                                0.1,
                            }}
                          />
                        ))}
                      </div>
                      <div className="distribution-grid">
                        {Object.entries(statuses).map(([s, label]) => (
                          <button
                            onClick={() => {
                              setStatusFilter(s);
                              navigate("list");
                            }}
                            key={s}
                          >
                            <span className={`dot ${s}`} />
                            <span>{label}</span>
                            <strong>
                              {tasks.filter((t) => t.status === s).length}
                            </strong>
                          </button>
                        ))}
                      </div>
                    </section>
                    <section className="panel activity">
                      <div className="panel-heading">
                        <div>
                          <span className="section-kicker">EM EQUIPE</span>
                          <h2>Últimas atualizações</h2>
                        </div>
                        <Activity size={20} className="muted" />
                      </div>
                      {activity.length ? (
                        <div className="activity-list">
                          {activity.slice(0, 4).map((a, i) => (
                            <div key={a.id || i}>
                              <span className="activity-point" />
                              <div>
                                <strong>
                                  {a.summary ||
                                    a.description ||
                                    a.action ||
                                    "Tarefa atualizada"}
                                </strong>
                                <small>
                                  {a.actor_email || a.author || ""} ·{" "}
                                  {a.created_at
                                    ? new Date(a.created_at).toLocaleString(
                                        "pt-BR",
                                      )
                                    : ""}
                                </small>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="quiet">
                          <Activity size={24} />
                          <p>As atualizações da equipe aparecerão aqui.</p>
                        </div>
                      )}
                    </section>
                  </div>
                </>
              )}
              {(view === "board" || view === "list") && (
                <>
                  <div className="filters">
                    <div className="search">
                      <Search size={17} />
                      <input
                        placeholder="Buscar tarefa, assunto ou responsável…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        aria-label="Buscar tarefas"
                      />
                      {search && (
                        <button
                          className="icon-btn"
                          onClick={() => setSearch("")}
                          aria-label="Limpar busca"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    <div className="filter-select">
                      <SlidersHorizontal size={15} />
                      <select
                        aria-label="Filtrar por prioridade"
                        value={priority}
                        onChange={(e) => setPriority(e.target.value)}
                      >
                        <option value="">Todas as prioridades</option>
                        {Object.entries(priorities).map(([s, l]) => (
                          <option key={s} value={s}>
                            {s === "permanent" ? "" : s + " · "}
                            {l}
                          </option>
                        ))}
                      </select>
                    </div>
                    <select
                      aria-label="Filtrar por etapa"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                    >
                      <option value="">Todas as etapas</option>
                      {Object.entries(statuses).map(([s, l]) => (
                        <option value={s} key={s}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Filtrar por responsável"
                      value={ownerFilter}
                      onChange={(e) => setOwnerFilter(e.target.value)}
                    >
                      <option value="">Todos os responsáveis</option>
                      {[
                        ...new Set(
                          tasks.map((t) => t.assignee).filter(Boolean),
                        ),
                      ].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                    <button
                      title="Atualizar dados"
                      className="icon-btn"
                      onClick={load}
                    >
                      <RefreshCw size={16} />
                    </button>
                  </div>
                  <div className="results-label">
                    {filtered.length} tarefa{filtered.length !== 1 ? "s" : ""}{" "}
                    <span>•</span>{" "}
                    {view === "board"
                      ? "Mova pelo menu de etapa em cada cartão"
                      : "Clique em uma tarefa para ver os detalhes"}
                  </div>
                  {view === "board" ? (
                    <div className="board">
                      {Object.entries(statuses)
                        .filter(([s]) => !statusFilter || s === statusFilter)
                        .map(([s, label]) => (
                          <section className={`column ${s}`} key={s}>
                            <div className="column-heading">
                              <span className={`dot ${s}`} />
                              <h2>{label}</h2>
                              <span className="count">
                                {filtered.filter((t) => t.status === s).length}
                              </span>
                              <button
                                aria-label={`Adicionar em ${label}`}
                                onClick={() =>
                                  setTask({ ...blankTask(), status: s })
                                }
                              >
                                <Plus size={16} />
                              </button>
                            </div>
                            <div className="column-body">
                              {filtered
                                .filter((t) => t.status === s)
                                .map((t) => (
                                  <TaskCard
                                    key={t.id}
                                    t={t}
                                    onOpen={() => setTask(structuredClone(t))}
                                    onMove={(status) => move(t, status)}
                                  />
                                ))}
                              <button
                                className="add-card"
                                onClick={() =>
                                  setTask({ ...blankTask(), status: s })
                                }
                              >
                                <Plus size={15} /> Adicionar tarefa
                              </button>
                            </div>
                          </section>
                        ))}
                    </div>
                  ) : (
                    <section className="panel table-panel">
                      {filtered.length ? (
                        <div className="table-scroll">
                          <table>
                            <thead>
                              <tr>
                                <th>Tarefa</th>
                                <th>Etapa</th>
                                <th>Prioridade</th>
                                <th>Progresso</th>
                                <th>Prazo</th>
                                <th>Responsável</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filtered.map((t) => (
                                <tr
                                  key={t.id}
                                  onClick={() => setTask(structuredClone(t))}
                                >
                                  <td>
                                    <button className="table-title">
                                      {t.title}
                                    </button>
                                    {t.tags?.length > 0 && (
                                      <small>{t.tags.join(" · ")}</small>
                                    )}
                                  </td>
                                  <td>
                                    <span className="status-pill">
                                      <span className={`dot ${t.status}`} />
                                      {statuses[t.status]}
                                    </span>
                                  </td>
                                  <td>
                                    <Priority value={t.priority} />
                                  </td>
                                  <td>
                                    <div className="table-progress">
                                      <div className="progress">
                                        <i
                                          style={{ width: percent(t) + "%" }}
                                        />
                                      </div>
                                      <span>{percent(t)}%</span>
                                    </div>
                                  </td>
                                  <td className={overdue(t) ? "overdue" : ""}>
                                    {dateLabel(t.due_date)}
                                  </td>
                                  <td>{t.assignee || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <Empty
                          title="Nenhuma tarefa encontrada"
                          text="Ajuste os filtros ou adicione uma nova tarefa."
                          action={() => setTask(blankTask())}
                        />
                      )}
                    </section>
                  )}
                </>
              )}
              {view === "calendar" && (
                <section className="panel calendar">
                  <div className="calendar-heading">
                    <h2>
                      {month.toLocaleDateString("pt-BR", {
                        month: "long",
                        year: "numeric",
                      })}
                    </h2>
                    <div>
                      <button
                        className="secondary"
                        onClick={() => setMonth(new Date())}
                      >
                        Hoje
                      </button>
                      <button
                        className="icon-btn"
                        aria-label="Mês anterior"
                        onClick={() =>
                          setMonth(
                            new Date(
                              month.getFullYear(),
                              month.getMonth() - 1,
                              1,
                            ),
                          )
                        }
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button
                        className="icon-btn"
                        aria-label="Próximo mês"
                        onClick={() =>
                          setMonth(
                            new Date(
                              month.getFullYear(),
                              month.getMonth() + 1,
                              1,
                            ),
                          )
                        }
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="calendar-grid">
                    {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(
                      (x) => (
                        <div key={x} className="weekday">
                          {x}
                        </div>
                      ),
                    )}
                    {Array.from(
                      {
                        length: new Date(
                          month.getFullYear(),
                          month.getMonth(),
                          1,
                        ).getDay(),
                      },
                      (_, i) => (
                        <div key={"blank" + i} className="calendar-day blank" />
                      ),
                    )}
                    {Array.from(
                      {
                        length: new Date(
                          month.getFullYear(),
                          month.getMonth() + 1,
                          0,
                        ).getDate(),
                      },
                      (_, i) => {
                        const date = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
                        return (
                          <div
                            key={date}
                            className={
                              "calendar-day " +
                              (date === today() ? "is-today" : "")
                            }
                          >
                            <button
                              className="day-number"
                              onClick={() =>
                                setEvent({
                                  id: uid(),
                                  title: "",
                                  description: "",
                                  start_date: date,
                                  end_date: date,
                                  kind: "event",
                                })
                              }
                            >
                              {i + 1}
                            </button>
                            {events
                              .filter(
                                (e) =>
                                  e.start_date &&
                                  e.start_date.slice(0, 10) <= date &&
                                  (e.end_date || e.start_date).slice(0, 10) >=
                                    date,
                              )
                              .map((e) => (
                                <button
                                  key={e.id}
                                  className={`calendar-item ${e.kind === "absence" ? "absence" : ""}`}
                                  onClick={() => setEvent({ ...e })}
                                >
                                  {e.title}
                                </button>
                              ))}
                            {tasks
                              .filter((t) => t.due_date?.slice(0, 10) === date)
                              .map((t) => (
                                <button
                                  key={t.id}
                                  className={`calendar-item task-date ${t.status === "done" ? "complete" : ""}`}
                                  onClick={() => setTask(structuredClone(t))}
                                >
                                  {t.title}
                                </button>
                              ))}
                          </div>
                        );
                      },
                    )}
                  </div>
                  {events.some((e) => !e.start_date) && (
                    <div className="undated-events">
                      <strong>Datas a confirmar</strong>
                      {events
                        .filter((e) => !e.start_date)
                        .map((e) => (
                          <button key={e.id} onClick={() => setEvent({ ...e })}>
                            {e.title}
                            <span>{e.description}</span>
                            <ArrowUpRight size={14} />
                          </button>
                        ))}
                    </div>
                  )}
                  <div className="calendar-legend">
                    <span>
                      <i className="legend-dot" /> Compromisso
                    </span>
                    <span>
                      <i className="legend-dot task-date" /> Prazo de tarefa
                    </span>
                    <span>
                      <i className="legend-dot absence" /> Ausência
                    </span>
                  </div>
                </section>
              )}
              {view === "absences" && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="section-kicker">
                        PLANEJAMENTO COMPARTILHADO
                      </span>
                      <h2>
                        Ausências registradas{" "}
                        <span className="count">
                          {events.filter((e) => e.kind === "absence").length}
                        </span>
                      </h2>
                    </div>
                  </div>
                  {events.filter((e) => e.kind === "absence").length ? (
                    <div className="absence-list">
                      {events
                        .filter((e) => e.kind === "absence")
                        .sort((a, b) =>
                          (a.start_date || "9999").localeCompare(
                            b.start_date || "9999",
                          ),
                        )
                        .map((e) => (
                          <button key={e.id} onClick={() => setEvent({ ...e })}>
                            <span className="absence-icon">
                              <CalendarOff size={20} />
                            </span>
                            <div>
                              <strong>{e.title}</strong>
                              <p>{e.description}</p>
                              <small>
                                {e.start_date
                                  ? dateLabel(e.start_date)
                                  : "Data a confirmar"}
                                {e.end_date && e.end_date !== e.start_date
                                  ? " — " + dateLabel(e.end_date)
                                  : ""}
                              </small>
                            </div>
                            <ArrowUpRight size={18} />
                          </button>
                        ))}
                    </div>
                  ) : (
                    <Empty
                      title="Planeje com antecedência"
                      text="Registre férias, saídas e outros períodos de ausência para manter a coordenação informada."
                    />
                  )}
                </section>
              )}
            </>
          )}
          <footer>
            <span>
              meukanbam<span className="brand-dot">.</span>{" "}
              <span className="footer-divider">/</span> Mais clareza. Mais
              organização.
            </span>
            <span>
              <LockKeyhole size={12} /> Acesso privado
            </span>
          </footer>
        </div>
      </main>
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {notice}
        </div>
      )}
      {task && (
        <TaskModal
          initial={task}
          allTasks={tasks}
          email={session.user?.email}
          onClose={() => setTask(null)}
          onSave={async (t) => {
            await saveTask(t);
            setTask(null);
          }}
          onDelete={async (id) => {
            await api.deleteTask(id);
            setTasks((all) => all.filter((x) => x.id !== id));
            setTask(null);
            setNotice("Tarefa excluída.");
          }}
        />
      )}
      {event && (
        <EventModal
          initial={event}
          onClose={() => setEvent(null)}
          onSave={async (e) => {
            const saved = await api.saveEvent(e);
            setEvents((all) =>
              all.some((x) => x.id === e.id)
                ? all.map((x) => (x.id === e.id ? saved : x))
                : [...all, saved],
            );
            setEvent(null);
            setNotice("Registro salvo.");
          }}
          onDelete={async (id) => {
            await api.deleteEvent(id);
            setEvents((all) => all.filter((x) => x.id !== id));
            setEvent(null);
          }}
        />
      )}
    </div>
  );
}
function Stat({ label, value, Icon, subtitle, color }) {
  return (
    <div className="stat">
      <div className="stat-top">
        <span>{label}</span>
        <span className={"stat-icon " + color}>
          <Icon size={18} />
        </span>
      </div>
      <strong>{value.toString().padStart(2, "0")}</strong>
      <small>{subtitle}</small>
    </div>
  );
}
function Priority({ value }) {
  return (
    <span className={"priority " + value}>
      <span />
      {value === "permanent" ? "Permanente" : value + " · " + priorities[value]}
    </span>
  );
}
function TaskCard({ t, onOpen, onMove }) {
  return (
    <article className="task-card">
      <div className="card-top">
        <Priority value={t.priority} />
        {t.recurrence && <RefreshCw size={12} className="muted" />}
        <button
          className="icon-btn"
          aria-label={`Abrir ${t.title}`}
          onClick={onOpen}
        >
          <MoreHorizontal size={18} />
        </button>
      </div>
      <button className="task-title" onClick={onOpen}>
        {t.title}
      </button>
      {t.description && <p className="card-description">{t.description}</p>}
      {t.tags?.length > 0 && (
        <div className="tags">
          {t.tags.slice(0, 3).map((x) => (
            <span key={x}>{x}</span>
          ))}
        </div>
      )}
      <div className="card-progress">
        <div>
          <span>Progresso</span>
          <b>{percent(t)}%</b>
        </div>
        <div className="progress">
          <i style={{ width: percent(t) + "%" }} />
        </div>
      </div>
      <div className="card-bottom">
        <span className={overdue(t) ? "overdue" : ""}>
          <CalendarDays size={12} />
          {dateLabel(t.due_date)}
        </span>
        <div>
          {!!t.subtasks?.length && (
            <span>
              <CheckSquare size={12} />
              {t.subtasks.filter((x) => x.done).length}/{t.subtasks.length}
            </span>
          )}
          {!!t.comments?.length && (
            <span>
              <MessageSquare size={12} />
              {t.comments.length}
            </span>
          )}
          {t.assignee && (
            <span className="mini-avatar" title={t.assignee}>
              {t.assignee[0].toUpperCase()}
            </span>
          )}
        </div>
      </div>
      {onMove && (
        <select
          className="move-select"
          aria-label={`Mover ${t.title} para etapa`}
          value={t.status}
          onChange={(e) => onMove(e.target.value)}
        >
          {Object.entries(statuses).map(([s, l]) => (
            <option key={s} value={s}>
              {l}
            </option>
          ))}
        </select>
      )}
    </article>
  );
}
function Login({ onLogin, externalError, recoveryMode, onRecovered }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [recovery, setRecovery] = useState(
      recoveryMode || location.hash.includes("type=recovery"),
    );
  useEffect(() => {
    if (recoveryMode) setRecovery(true);
  }, [recoveryMode]);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (recovery) {
        await api.updatePassword(password);
        await api.logout();
        setRecovery(false);
        setMessage("Senha atualizada. Entre com sua nova senha.");
        history.replaceState(null, "", location.pathname);
        onRecovered?.();
      } else {
        const result = await api.login(email, password);
        onLogin(result);
      }
    } catch (e) {
      setError(e.message || "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <section className="login-story">
        <a className="brand" href="/">
          <span className="brand-mark">
            m<span>.</span>
          </span>
          <span>
            meukanbam<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="login-story-body">
          <span className="login-kicker">ORGANIZAÇÃO QUE FAZ SENTIDO</span>
          <h1>
            Seu trabalho.
            <br />
            Um lugar para
            <br />
            <em>ver acontecer.</em>
          </h1>
          <p>
            Das ideias às entregas, acompanhe suas prioridades e mantenha a
            equipe na mesma página.
          </p>
          <div className="login-graphic" aria-hidden="true">
            <div className="mini-column">
              <span>
                <i />A fazer <b>03</b>
              </span>
              <div>
                <span className="mini-tag" />
                <i />
                <i />
              </div>
              <div>
                <span className="mini-tag green" />
                <i />
                <i />
              </div>
            </div>
            <div className="mini-column raised">
              <span>
                <i />
                Em andamento <b>02</b>
              </span>
              <div>
                <span className="mini-tag orange" />
                <i />
                <i />
                <div className="mini-progress">
                  <b />
                </div>
              </div>
              <div>
                <span className="mini-tag" />
                <i />
                <i />
              </div>
            </div>
            <div className="mini-column">
              <span>
                <i />
                Concluído <b>04</b>
              </span>
              <div className="mini-done">
                <CheckCircle2 size={24} />
                <i />
                <i />
              </div>
            </div>
          </div>
        </div>
        <div className="login-bottom">
          <ShieldCheck size={16} /> Privado por princípio. Compartilhado com
          quem importa.
        </div>
      </section>
      <section className="login-form-side">
        <div className="login-form-box">
          <div className="login-lock">
            <LockKeyhole size={23} />
          </div>
          <span className="section-kicker">BEM-VINDO AO SEU ESPAÇO</span>
          <h2>
            {recovery ? "Defina uma nova senha" : "Vamos organizar o dia?"}
          </h2>
          <p>
            {recovery
              ? "Escolha uma senha forte para proteger sua conta."
              : "Entre com sua conta autorizada para continuar."}
          </p>
          {api.configured === false && (
            <div className="alert">
              O ambiente está em configuração. O acesso será liberado após a
              conexão segura com o banco de dados.
            </div>
          )}
          {(error || externalError) && (
            <div className="alert error" role="alert">
              {error || externalError}
            </div>
          )}
          {message && (
            <div className="alert success" role="status">
              {message}
            </div>
          )}
          <form onSubmit={submit}>
            {!recovery && (
              <label>
                E-mail
                <input
                  type="email"
                  autoComplete="username"
                  required
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            )}
            <label>
              {recovery ? "Nova senha" : "Senha"}
              <input
                type="password"
                autoComplete={recovery ? "new-password" : "current-password"}
                required
                minLength={recovery ? 6 : 1}
                placeholder={recovery ? "No mínimo 6 caracteres" : "Sua senha"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {!recovery && (
              <button
                type="button"
                className="forgot"
                onClick={async () => {
                  if (!email) {
                    setError("Informe seu e-mail para receber as instruções.");
                    return;
                  }
                  try {
                    await api.resetPassword(email);
                    setError("");
                    setMessage(
                      "Se o e-mail estiver autorizado, você receberá as instruções de recuperação.",
                    );
                  } catch (e) {
                    setError(e.message);
                  }
                }}
              >
                Esqueci minha senha
              </button>
            )}
            <button
              className="primary login-submit"
              disabled={busy || api.configured === false}
            >
              {busy ? (
                <LoaderCircle size={18} className="spin" />
              ) : (
                <>
                  {recovery ? "Atualizar senha" : "Entrar no meu espaço"}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
          <div className="login-private">
            <ShieldCheck size={16} />
            <p>
              Acesso exclusivo para contas autorizadas.
              <br />
              Não há cadastro público.
            </p>
          </div>
        </div>
        <div className="login-copyright">
          MeuKanbam · Feito para manter o trabalho em movimento.
        </div>
      </section>
    </div>
  );
}
function TaskModal({ initial, allTasks, email, onClose, onSave, onDelete }) {
  const [t, setT] = useState({ ...blankTask(), ...initial }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sub, setSub] = useState(""),
    [comment, setComment] = useState(""),
    [link, setLink] = useState(""),
    [confirmDelete, setConfirmDelete] = useState(false);
  const change = (key, val) => setT((x) => ({ ...x, [key]: val }));
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave(t);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const blocked = (t.dependencies || [])
    .map((id) => allTasks.find((x) => x.id === id))
    .filter((x) => x && x.status !== "done");
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="modal task-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-title"
      >
        <div className="modal-heading">
          <div>
            <span className="section-kicker">DETALHES DA TAREFA</span>
            <h2 id="task-modal-title">
              {allTasks.some((x) => x.id === t.id)
                ? "Cada passo, mais perto."
                : "Uma nova prioridade."}
            </h2>
          </div>
          <button
            className="icon-btn"
            aria-label="Fechar"
            onClick={onClose}
            disabled={busy}
          >
            <X size={21} />
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            <label>
              Título
              <input
                autoFocus
                required
                maxLength={300}
                placeholder="O que precisa ser feito?"
                value={t.title}
                onChange={(e) => change("title", e.target.value)}
              />
            </label>
            <label>
              Descrição
              <textarea
                rows={3}
                placeholder="Contexto, orientações e informações importantes…"
                value={t.description}
                onChange={(e) => change("description", e.target.value)}
              />
            </label>
            <div className="form-grid">
              <label>
                Etapa
                <select
                  value={t.status}
                  onChange={(e) => change("status", e.target.value)}
                >
                  {Object.entries(statuses).map(([s, l]) => (
                    <option key={s} value={s}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Prioridade
                <select
                  value={t.priority}
                  onChange={(e) => change("priority", e.target.value)}
                >
                  {Object.entries(priorities).map(([s, l]) => (
                    <option key={s} value={s}>
                      {s === "permanent" ? "" : s + " · "}
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Prazo
                <input
                  type="date"
                  value={t.due_date || ""}
                  onChange={(e) => change("due_date", e.target.value)}
                />
              </label>
              <label>
                Responsável
                <input
                  value={t.assignee || ""}
                  placeholder="Nome ou e-mail"
                  onChange={(e) => change("assignee", e.target.value)}
                />
              </label>
              <label>
                Recorrência
                <select
                  value={t.recurrence || ""}
                  onChange={(e) => change("recurrence", e.target.value)}
                >
                  <option value="">Sem recorrência</option>
                  <option value="daily">Diária</option>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensal</option>
                  <option value="yearly">Anual</option>
                </select>
              </label>
              <label>
                Marcadores
                <input
                  placeholder="Ex.: SIAPS, relatório"
                  value={(t.tags || []).join(", ")}
                  onChange={(e) =>
                    change(
                      "tags",
                      e.target.value
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean),
                    )
                  }
                />
              </label>
            </div>
            {t.recurrence && (
              <p className="field-hint">
                A recorrência fica registrada para seu planejamento; uma nova
                ocorrência deve ser criada ao concluir.
              </p>
            )}
            <label className="range-label">
              Progresso <strong>{percent(t)}%</strong>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                disabled={!!t.subtasks?.length || t.status === "done"}
                value={percent(t)}
                onChange={(e) => change("progress", Number(e.target.value))}
              />
            </label>
            {!!t.subtasks?.length && (
              <p className="field-hint">
                Calculado automaticamente pelas subtarefas concluídas.
              </p>
            )}
            <div className="modal-section">
              <h3>
                <CheckSquare size={17} /> Subtarefas{" "}
                <span className="count">{t.subtasks?.length || 0}</span>
              </h3>
              <div className="subtask-list">
                {(t.subtasks || []).map((s) => (
                  <div key={s.id}>
                    <label className={s.done ? "checked" : ""}>
                      <input
                        type="checkbox"
                        checked={s.done}
                        onChange={(e) =>
                          change(
                            "subtasks",
                            t.subtasks.map((x) =>
                              x.id === s.id
                                ? { ...x, done: e.target.checked }
                                : x,
                            ),
                          )
                        }
                      />
                      <span>{s.title}</span>
                    </label>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Remover subtarefa"
                      onClick={() =>
                        change(
                          "subtasks",
                          t.subtasks.filter((x) => x.id !== s.id),
                        )
                      }
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="inline-add">
                <input
                  placeholder="Adicionar um próximo passo…"
                  value={sub}
                  onChange={(e) => setSub(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (sub.trim()) {
                        change("subtasks", [
                          ...(t.subtasks || []),
                          { id: uid(), title: sub.trim(), done: false },
                        ]);
                        setSub("");
                      }
                    }
                  }}
                />
                <button
                  type="button"
                  className="secondary"
                  disabled={!sub.trim()}
                  onClick={() => {
                    change("subtasks", [
                      ...(t.subtasks || []),
                      { id: uid(), title: sub.trim(), done: false },
                    ]);
                    setSub("");
                  }}
                >
                  <Plus size={17} />
                </button>
              </div>
            </div>
            <div className="modal-section">
              <h3>
                <LinkIcon size={17} /> Dependências
              </h3>
              <select
                value=""
                aria-label="Adicionar dependência"
                onChange={(e) => {
                  if (e.target.value)
                    change("dependencies", [
                      ...(t.dependencies || []),
                      e.target.value,
                    ]);
                }}
              >
                <option value="">Esta tarefa depende de…</option>
                {allTasks
                  .filter(
                    (x) => x.id !== t.id && !t.dependencies?.includes(x.id),
                  )
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.title}
                    </option>
                  ))}
              </select>
              <div className="dependency-list">
                {(t.dependencies || []).map((id) => {
                  const item = allTasks.find((x) => x.id === id);
                  return (
                    <div key={id}>
                      <span
                        className={`dot ${item?.status === "done" ? "done" : "paused"}`}
                      />
                      <span>{item?.title || "Tarefa removida"}</span>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Remover dependência"
                        onClick={() =>
                          change(
                            "dependencies",
                            t.dependencies.filter((x) => x !== id),
                          )
                        }
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
              {blocked.length > 0 && (
                <p className="dependency-warning">
                  {blocked.length} dependência{blocked.length > 1 ? "s" : ""}{" "}
                  ainda não concluída{blocked.length > 1 ? "s" : ""}.
                </p>
              )}
            </div>
            <div className="modal-section">
              <h3>
                <ExternalLink size={17} /> Links de referência
              </h3>
              {(t.links || []).map((l, i) => (
                <div className="link-row" key={i}>
                  <a
                    href={safeUrl(l.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {l.title || l.url}
                    <ArrowUpRight size={13} />
                  </a>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Remover link"
                    onClick={() =>
                      change(
                        "links",
                        t.links.filter((_, j) => i !== j),
                      )
                    }
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <div className="inline-add">
                <input
                  type="url"
                  placeholder="https://…"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                />
                <button
                  type="button"
                  className="secondary"
                  disabled={!link.trim()}
                  onClick={() => {
                    if (!safeUrl(link)) {
                      setError(
                        "Use um link válido começando por https:// ou http://.",
                      );
                      return;
                    }
                    change("links", [
                      ...(t.links || []),
                      { title: link, url: link },
                    ]);
                    setLink("");
                  }}
                >
                  <Plus size={17} />
                </button>
              </div>
            </div>
            <div className="modal-section">
              <h3>
                <MessageSquare size={17} /> Notas e comentários
              </h3>
              <div className="comments">
                {(t.comments || []).map((c) => (
                  <div key={c.id}>
                    <strong>
                      {c.author || "Usuário"}
                      <time>
                        {c.created_at
                          ? new Date(c.created_at).toLocaleDateString("pt-BR")
                          : ""}
                      </time>
                    </strong>
                    <p>{c.text}</p>
                  </div>
                ))}
              </div>
              <div className="inline-add">
                <textarea
                  rows={2}
                  placeholder="Registre uma atualização para a equipe…"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <button
                  type="button"
                  className="secondary"
                  disabled={!comment.trim()}
                  onClick={() => {
                    change("comments", [
                      ...(t.comments || []),
                      {
                        id: uid(),
                        text: comment.trim(),
                        author: email,
                        created_at: new Date().toISOString(),
                      },
                    ]);
                    setComment("");
                  }}
                >
                  <Plus size={17} />
                </button>
              </div>
              <p className="field-hint">
                As alterações e os comentários são publicados ao salvar a
                tarefa.
              </p>
            </div>
          </div>
          <div className="modal-footer">
            {allTasks.some((x) => x.id === t.id) && (
              <button
                type="button"
                className="danger-button"
                disabled={busy}
                onClick={async () => {
                  if (!confirmDelete) {
                    setConfirmDelete(true);
                    return;
                  }
                  setBusy(true);
                  try {
                    await onDelete(t.id);
                  } catch (e) {
                    setError(e.message);
                    setBusy(false);
                  }
                }}
              >
                <Trash2 size={16} />
                {confirmDelete ? "Confirmar exclusão" : "Excluir"}
              </button>
            )}
            <span />
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={onClose}
            >
              Cancelar
            </button>
            <button className="primary" disabled={busy}>
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Check size={16} />
              )}
              Salvar tarefa
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
function safeUrl(value) {
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
}
function EventModal({ initial, onClose, onSave, onDelete }) {
  const [e, setE] = useState({
      ...initial,
      start_date: initial.start_date?.slice(0, 10) || "",
      end_date: initial.end_date?.slice(0, 10) || "",
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  const change = (k, v) => setE({ ...e, [k]: v });
  return (
    <div className="modal-backdrop">
      <section
        className="modal event-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-modal-title"
      >
        <div className="modal-heading">
          <div>
            <span className="section-kicker">PLANEJAMENTO</span>
            <h2 id="event-modal-title">
              {e.kind === "absence"
                ? "Registro de ausência"
                : "Compromisso na agenda"}
            </h2>
          </div>
          <button className="icon-btn" aria-label="Fechar" onClick={onClose}>
            <X size={21} />
          </button>
        </div>
        <form
          onSubmit={async (ev) => {
            ev.preventDefault();
            if (e.end_date < e.start_date) {
              setError("A data final deve ser igual ou posterior à inicial.");
              return;
            }
            setBusy(true);
            try {
              await onSave(e);
            } catch (err) {
              setError(err.message);
              setBusy(false);
            }
          }}
        >
          <div className="modal-body">
            {error && <div className="alert error">{error}</div>}
            <label>
              Título
              <input
                autoFocus
                required
                value={e.title}
                onChange={(ev) => change("title", ev.target.value)}
                placeholder="Nome do compromisso ou ausência"
              />
            </label>
            <label>
              Tipo
              <select
                value={e.kind}
                onChange={(ev) => change("kind", ev.target.value)}
              >
                <option value="event">Compromisso</option>
                <option value="absence">Ausência</option>
              </select>
            </label>
            <div className="form-grid">
              <label>
                Data inicial
                <input
                  required
                  type="date"
                  value={e.start_date}
                  onChange={(ev) => change("start_date", ev.target.value)}
                />
              </label>
              <label>
                Data final
                <input
                  required
                  type="date"
                  min={e.start_date}
                  value={e.end_date || e.start_date}
                  onChange={(ev) => change("end_date", ev.target.value)}
                />
              </label>
            </div>
            <label>
              Informações
              <textarea
                rows={4}
                value={e.description || ""}
                onChange={(ev) => change("description", ev.target.value)}
                placeholder="Horários, local, motivo e observações"
              />
            </label>
            {e.start_date && (
              <a
                className="calendar-link"
                href={googleCalendar(e)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <CalendarDays size={16} />
                Adicionar ao Google Agenda
                <ArrowUpRight size={14} />
              </a>
            )}
            <p className="field-hint">
              Abre um rascunho na sua agenda. Você revisa e confirma; não há
              sincronização automática.
            </p>
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="danger-button"
              disabled={busy}
              onClick={async () => {
                if (!confirm) {
                  setConfirm(true);
                  return;
                }
                setBusy(true);
                try {
                  await onDelete(e.id);
                } catch (err) {
                  setError(err.message);
                  setBusy(false);
                }
              }}
            >
              <Trash2 size={16} />
              {confirm ? "Confirmar exclusão" : "Excluir"}
            </button>
            <span />
            <button type="button" className="secondary" onClick={onClose}>
              Cancelar
            </button>
            <button className="primary" disabled={busy}>
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Check size={16} />
              )}
              Salvar
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
