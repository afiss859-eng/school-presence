import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  FileBarChart,
  GraduationCap,
  LayoutDashboard,
  Menu,
  Search,
  ShieldAlert,
  Users,
  X
} from "lucide-react";
import type { AttendanceStatus, StudentAttendance } from "./lib/domain";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import type { User } from "@supabase/supabase-js";
import AuthScreen from "./components/AuthScreen";
import SchoolOnboarding from "./components/SchoolOnboarding";

type Page = "overview" | "attendance" | "life" | "classes" | "reports";

const initialStudents: StudentAttendance[] = [
  { id: "s-01", firstName: "Aminata", lastName: "Ouédraogo", studentCode: "SP-001", status: "present" },
  { id: "s-02", firstName: "Issa", lastName: "Traoré", studentCode: "SP-002", status: "absent" },
  { id: "s-03", firstName: "Mariama", lastName: "Sawadogo", studentCode: "SP-003", status: "present" },
  { id: "s-04", firstName: "Adama", lastName: "Kaboré", studentCode: "SP-004", status: "late" },
  { id: "s-05", firstName: "Fatou", lastName: "Zongo", studentCode: "SP-005", status: "present" },
  { id: "s-06", firstName: "Moussa", lastName: "Compaoré", studentCode: "SP-006", status: "present" },
  { id: "s-07", firstName: "Aïcha", lastName: "Diallo", studentCode: "SP-007", status: "absent" },
  { id: "s-08", firstName: "Oumar", lastName: "Bationo", studentCode: "SP-008", status: "present" }
];

const navigation = [
  { id: "overview" as const, label: "Vue d’ensemble", icon: LayoutDashboard },
  { id: "attendance" as const, label: "Faire l’appel", icon: ClipboardCheck },
  { id: "life" as const, label: "Vie scolaire", icon: ShieldAlert },
  { id: "classes" as const, label: "Classes et élèves", icon: Users },
  { id: "reports" as const, label: "Rapports", icon: FileBarChart }
];

const statusLabels: Record<AttendanceStatus, string> = {
  present: "Présent",
  absent: "Absent",
  late: "En retard"
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(value + "T12:00:00"));
}

interface SchoolInfo {
  id: string;
  name: string;
  school_type: string;
  city: string | null;
}

interface SchoolMembership {
  id: string;
  school_id: string;
  role: string;
  school: SchoolInfo | null;
}

interface DashboardProps {
  school: SchoolInfo;
  role: string;
  userEmail: string;
  userName: string;
  onSignOut: () => void;
}

function Dashboard({ school, role, userEmail, userName, onSignOut }: DashboardProps) {
  const [page, setPage] = useState<Page>("overview");
  const [students, setStudents] = useState<StudentAttendance[]>(initialStudents);
  const [selectedClass, setSelectedClass] = useState("3e A");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState("");
  const [saved, setSaved] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const totals = useMemo(() => {
    return students.reduce(
      (result, student) => {
        result[student.status] += 1;
        return result;
      },
      { present: 0, absent: 0, late: 0 }
    );
  }, [students]);

  const filteredStudents = students.filter((student) => {
    const fullName = (student.firstName + " " + student.lastName).toLowerCase();
    return fullName.includes(search.toLowerCase()) || student.studentCode.toLowerCase().includes(search.toLowerCase());
  });

  function setStudentStatus(studentId: string, status: AttendanceStatus) {
    setStudents((current) =>
      current.map((student) => (student.id === studentId ? { ...student, status } : student))
    );
    setSaved(false);
  }

  function changePage(nextPage: Page) {
    setPage(nextPage);
    setMobileMenuOpen(false);
    setSaved(false);
  }

  const activePage = navigation.find((item) => item.id === page)?.label ?? "Vue d’ensemble";

  return (
    <div className="app-shell">
      <aside className={"sidebar " + (mobileMenuOpen ? "sidebar-open" : "")}>
        <div className="brand">
          <div className="brand-mark"><GraduationCap size={25} /></div>
          <div>
            <strong>SCHOOL <span>PRESENCE</span></strong>
            <small>La vie scolaire, simplifiée</small>
          </div>
          <button className="icon-button close-menu" onClick={() => setMobileMenuOpen(false)} aria-label="Fermer le menu">
            <X size={19} />
          </button>
        </div>

        <div className="school-switcher">
          <div className="school-avatar">CM</div>
          <div className="school-copy">
            <strong>{school.name}</strong>
            <span>{school.city || "Établissement"} · {role}</span>
          </div>
          <ChevronDown size={16} />
        </div>

        <p className="nav-caption">ESPACE ÉTABLISSEMENT</p>
        <nav className="main-nav" aria-label="Navigation principale">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={"nav-link " + (page === item.id ? "active" : "")}
                key={item.id}
                onClick={() => changePage(item.id)}
              >
                <Icon size={19} />
                <span>{item.label}</span>
                {item.id === "life" && <i className="nav-dot" />}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon"><BookOpen size={18} /></div>
            <strong>Besoin d’aide ?</strong>
            <p>Consultez le guide de prise en main de votre établissement.</p>
            <button onClick={() => window.alert("Le guide sera ajouté dans une prochaine version.")}>Consulter le guide</button>
          </div>
          <div className="profile-row">
            <div className="profile-avatar">AD</div>
            <div className="profile-copy"><strong>{userName}</strong><span>{role} · {userEmail}</span></div>
            <button className="icon-button" onClick={onSignOut} aria-label="Se déconnecter"><ChevronDown size={17} /></button>
          </div>
        </div>
      </aside>

      {mobileMenuOpen && <button className="mobile-scrim" onClick={() => setMobileMenuOpen(false)} aria-label="Fermer le menu" />}

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button menu-button" onClick={() => setMobileMenuOpen(true)} aria-label="Ouvrir le menu"><Menu size={21} /></button>
            <div><span className="breadcrumb">Établissement</span><span className="breadcrumb-separator">/</span><strong>{activePage}</strong></div>
          </div>
          <div className="topbar-actions">
            <div className="system-status"><span /> Compte connecté · démo locale</div>
            <button className="icon-button notification-button" aria-label="Notifications"><Bell size={19} /><i /></button>
            <div className="topbar-avatar">AD</div>
          </div>
        </header>

        <div className="page-content">
          <div className="welcome-row">
            <div>
              <p className="eyebrow">ESPACE DE PILOTAGE</p>
              <h1>{page === "overview" ? "Bonjour, bienvenue 👋" : activePage}</h1>
              <p className="page-subtitle">
                {page === "overview" && "Voici ce qui se passe dans votre établissement aujourd’hui."}
                {page === "attendance" && "Enregistrez rapidement la présence des élèves de votre classe."}
                {page === "life" && "Retrouvez les événements et les éléments à traiter par la vie scolaire."}
                {page === "classes" && "Consultez les classes et les effectifs de l’établissement."}
                {page === "reports" && "Suivez les indicateurs et préparez les rapports de votre établissement."}
              </p>
            </div>
            <div className="date-pill"><CalendarDays size={17} /> {formatDate(selectedDate)}</div>
          </div>

          <div className="demo-notice">
            <span className="notice-icon"><Activity size={17} /></span>
            <p><strong>Version de démarrage.</strong> Les noms et chiffres affichés sont fictifs. Les enregistrements restent dans cette démonstration et ne sont pas encore envoyés à une base de données.</p>
            <button onClick={() => changePage("attendance")}>Tester un appel <span>→</span></button>
          </div>

          {page === "overview" && (
            <>
              <section className="metric-grid">
                <MetricCard title="Élèves suivis" value="248" note="Effectif de démonstration" icon={<Users size={20} />} tone="blue" />
                <MetricCard title="Présents aujourd’hui" value="226" note="91,1 % de l’effectif" icon={<Check size={20} />} tone="green" />
                <MetricCard title="Absences" value="14" note="À vérifier par la vie scolaire" icon={<CalendarDays size={20} />} tone="orange" />
                <MetricCard title="Retards" value="8" note="Sur l’ensemble des classes" icon={<Clock3 size={20} />} tone="purple" />
              </section>

              <section className="content-grid">
                <div className="panel attendance-panel">
                  <div className="panel-heading">
                    <div><h2>Suivi des présences</h2><p>Situation indicative de la journée</p></div>
                    <button className="text-button" onClick={() => changePage("attendance")}>Faire l’appel <span>→</span></button>
                  </div>
                  <div className="attendance-summary">
                    <div className="donut-wrap"><div className="donut"><div><strong>91%</strong><span>Présence</span></div></div></div>
                    <div className="legend-list">
                      <LegendRow color="green" label="Présents" value="226" />
                      <LegendRow color="orange" label="Absents" value="14" />
                      <LegendRow color="purple" label="Retards" value="8" />
                    </div>
                  </div>
                  <div className="panel-footnote"><span className="status-dot green-dot" /> Données de démonstration — aucun appel réel n’a été transmis.</div>
                </div>

                <div className="panel tasks-panel">
                  <div className="panel-heading"><div><h2>À traiter</h2><p>Exemples de tâches de suivi</p></div><span className="counter-badge">3</span></div>
                  <TaskRow icon={<ClipboardCheck size={17} />} title="Appels non terminés" detail="2 classes à vérifier" color="orange" />
                  <TaskRow icon={<FileBarChart size={17} />} title="Justifications en attente" detail="5 demandes à examiner" color="blue" />
                  <TaskRow icon={<ShieldAlert size={17} />} title="Événements disciplinaires" detail="1 événement à consulter" color="purple" />
                </div>
              </section>

              <section className="panel classes-panel">
                <div className="panel-heading"><div><h2>Activité par classe</h2><p>Vue indicative des appels du jour</p></div><button className="text-button" onClick={() => changePage("classes")}>Toutes les classes <span>→</span></button></div>
                <div className="class-table">
                  <div className="table-row table-head"><span>Classe</span><span>Effectif</span><span>Présents</span><span>Absents</span><span>État de l’appel</span></div>
                  <ClassRow name="6e A" count="42" present="39" absent="3" state="Terminé" />
                  <ClassRow name="5e B" count="38" present="35" absent="3" state="Terminé" />
                  <ClassRow name="3e A" count="34" present="30" absent="4" state="À vérifier" />
                  <ClassRow name="2nde C" count="41" present="38" absent="3" state="En cours" />
                </div>
              </section>
            </>
          )}

          {page === "attendance" && (
            <section className="panel call-panel">
              <div className="panel-heading call-heading">
                <div><h2>Registre d’appel</h2><p>Marquez chaque élève présent, absent ou en retard.</p></div>
                <div className="call-controls">
                  <label className="select-control"><span>Classe</span><select value={selectedClass} onChange={(event) => setSelectedClass(event.target.value)}><option>3e A</option><option>6e A</option><option>5e B</option><option>2nde C</option></select></label>
                  <label className="select-control"><span>Date</span><input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label>
                </div>
              </div>
              <div className="call-summary">
                <span><i className="summary-dot green-dot" /> Présents <strong>{totals.present}</strong></span>
                <span><i className="summary-dot orange-dot" /> Absents <strong>{totals.absent}</strong></span>
                <span><i className="summary-dot purple-dot" /> Retards <strong>{totals.late}</strong></span>
                <div className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un élève..." /></div>
              </div>
              <div className="student-list">
                <div className="student-row student-head"><span>ÉLÈVE</span><span>IDENTIFIANT</span><span>STATUT</span></div>
                {filteredStudents.map((student) => (
                  <div className="student-row" key={student.id}>
                    <div className="student-name"><span className="student-initials">{student.firstName[0]}{student.lastName[0]}</span><strong>{student.firstName} {student.lastName}</strong></div>
                    <span className="student-code">{student.studentCode}</span>
                    <div className="status-actions">
                      {(["present", "absent", "late"] as AttendanceStatus[]).map((status) => (
                        <button key={status} className={"status-choice " + status + (student.status === status ? " selected" : "")} onClick={() => setStudentStatus(student.id, status)}>
                          {status === "present" && <Check size={14} />}{status === "absent" && <X size={14} />}{status === "late" && <Clock3 size={14} />}
                          <span>{statusLabels[status]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {filteredStudents.length === 0 && <div className="empty-state">Aucun élève ne correspond à cette recherche.</div>}
              </div>
              <div className="call-footer">
                <span>{students.length} élèves dans cette démonstration · {formatDate(selectedDate)}</span>
                <button className="primary-button" onClick={() => setSaved(true)}><Check size={17} /> {saved ? "Appel préparé" : "Préparer l’enregistrement"}</button>
              </div>
              {saved && <p className="success-note">L’appel a été mis à jour dans cette démonstration locale. La sauvegarde en base sera activée avec l’authentification Supabase.</p>}
            </section>
          )}

          {page === "life" && (
            <section className="panel life-panel">
              <div className="panel-heading"><div><h2>Registre de vie scolaire</h2><p>Exemples d’événements à examiner, sans action disciplinaire automatique.</p></div><span className="counter-badge">3 éléments</span></div>
              <EventRow type="Absence" student="Issa Traoré" detail="3e A · Aujourd’hui à 08:00" state="Justification attendue" tone="orange" />
              <EventRow type="Retard" student="Adama Kaboré" detail="3e A · Aujourd’hui à 08:18" state="À examiner" tone="purple" />
              <EventRow type="Expulsion de cours" student="Élève de démonstration" detail="2nde C · Cours de mathématiques · Motif à consulter" state="Événement enregistré" tone="blue" />
              <div className="discipline-separation"><ShieldAlert size={19} /><div><strong>Absence, retard et discipline restent séparés.</strong><p>Un parent peut justifier une absence ou un retard. Il ne peut ni effacer une expulsion de cours ni modifier une sanction officielle.</p></div></div>
            </section>
          )}

          {page === "classes" && (
            <section className="class-card-grid">
              {[
                ["6e A", "42", "1 enseignant principal"],
                ["5e B", "38", "Équipe pédagogique"],
                ["3e A", "34", "Équipe pédagogique"],
                ["2nde C", "41", "Équipe pédagogique"]
              ].map(([name, count, detail]) => (
                <div className="panel class-card" key={name}>
                  <div className="class-card-icon"><Users size={20} /></div><span className="class-level">CLASSE</span><h2>{name}</h2><p>{detail}</p>
                  <div className="class-card-bottom"><strong>{count} <small>élèves</small></strong><button className="text-button" onClick={() => { setSelectedClass(name); changePage("attendance"); }}>Ouvrir l’appel →</button></div>
                </div>
              ))}
            </section>
          )}

          {page === "reports" && (
            <section className="panel reports-panel">
              <div className="panel-heading"><div><h2>Rapports et statistiques</h2><p>Indicateurs de démonstration, non issus d’un établissement réel.</p></div><span className="report-period"><CalendarDays size={16} /> Période actuelle</span></div>
              <div className="report-grid">
                <ReportMetric label="Taux de présence" value="91,1 %" hint="Exemple" />
                <ReportMetric label="Absences recensées" value="14" hint="Aujourd’hui" />
                <ReportMetric label="Retards recensés" value="8" hint="Aujourd’hui" />
              </div>
              <div className="report-placeholder"><FileBarChart size={28} /><strong>Rapports détaillés</strong><p>Les exports PDF/Excel et les statistiques par classe, période et établissement seront ajoutés après la mise en place de la base de données.</p></div>
            </section>
          )}

          <footer className="page-footer"><span>© {new Date().getFullYear()} SCHOOL PRESENCE</span><span>Conçu pour simplifier la vie scolaire au Burkina Faso</span><span className={isSupabaseConfigured ? "config-ready" : ""}>{isSupabaseConfigured ? "Configuration Supabase détectée" : "Base de données à configurer"}</span></footer>
        </div>
      </main>
    </div>
  );
}

function MetricCard({ title, value, note, icon, tone }: { title: string; value: string; note: string; icon: ReactNode; tone: string }) {
  return <div className="metric-card"><div className={"metric-icon " + tone}>{icon}</div><span>{title}</span><strong>{value}</strong><small>{note}</small></div>;
}
function LegendRow({ color, label, value }: { color: string; label: string; value: string }) {
  return <div className="legend-row"><span className={"legend-dot " + color} /><span>{label}</span><strong>{value}</strong></div>;
}
function TaskRow({ icon, title, detail, color }: { icon: ReactNode; title: string; detail: string; color: string }) {
  return <div className="task-row"><div className={"task-icon " + color}>{icon}</div><div><strong>{title}</strong><span>{detail}</span></div><ChevronDown className="task-arrow" size={17} /></div>;
}
function ClassRow({ name, count, present, absent, state }: { name: string; count: string; present: string; absent: string; state: string }) {
  return <div className="table-row"><strong>{name}</strong><span>{count}</span><span className="green-text">{present}</span><span className="orange-text">{absent}</span><span><i className={"state-indicator " + (state === "Terminé" ? "state-done" : "state-pending")} />{state}</span></div>;
}
function EventRow({ type, student, detail, state, tone }: { type: string; student: string; detail: string; state: string; tone: string }) {
  return <div className="event-row"><div className={"event-icon " + tone}><ShieldAlert size={18} /></div><div className="event-copy"><strong>{type}</strong><span>{student}</span><small>{detail}</small></div><span className={"event-state " + tone}>{state}</span></div>;
}
function ReportMetric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="report-metric"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [memberships, setMemberships] = useState<SchoolMembership[]>([]);
  const [membershipsLoading, setMembershipsLoading] = useState(false);
  const [membershipError, setMembershipError] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        setMembershipError(error.message);
      }
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const authenticatedUser = user;
    const client = supabase;
    if (!authenticatedUser || !client) {
      setMemberships([]);
      setMembershipsLoading(false);
      setMembershipError("");
      return;
    }

    let cancelled = false;
    setMembershipsLoading(true);
    setMembershipError("");

    async function loadMemberships() {
      const { data, error } = await client
        .from("school_members")
        .select("id, school_id, role, schools(id, name, school_type, city)")
        .eq("user_id", authenticatedUser.id)
        .eq("is_active", true);

      if (cancelled) return;
      if (error) {
        setMembershipError(error.message);
        setMemberships([]);
      } else {
        const rows = (data ?? []) as unknown as Array<{
          id: string;
          school_id: string;
          role: string;
          schools: SchoolInfo | SchoolInfo[] | null;
        }>;
        setMemberships(rows.map((row) => ({
          id: row.id,
          school_id: row.school_id,
          role: row.role,
          school: Array.isArray(row.schools) ? (row.schools[0] ?? null) : row.schools
        })));
      }
      setMembershipsLoading(false);
    }

    void loadMemberships();
    return () => { cancelled = true; };
  }, [user, refreshToken]);

  const client = supabase;
  if (!isSupabaseConfigured || !client) {
    return <SetupRequired />;
  }

  if (!authReady) {
    return <LoadingScreen label="Vérification de votre session…" />;
  }

  if (!user) {
    return <AuthScreen />;
  }

  if (membershipsLoading) {
    return <LoadingScreen label="Chargement de votre établissement…" />;
  }

  if (membershipError) {
    return (
      <ConnectionError
        message={membershipError}
        onRetry={() => setRefreshToken((value) => value + 1)}
        onSignOut={() => { void client.auth.signOut(); }}
      />
    );
  }

  const membership = memberships.find((item) => item.school !== null);
  if (!membership?.school) {
    return (
      <SchoolOnboarding
        user={user}
        onCreated={() => setRefreshToken((value) => value + 1)}
        onSignOut={() => { void client.auth.signOut(); }}
      />
    );
  }

  const roleLabels: Record<string, string> = {
    super_admin: "Super administrateur",
    school_admin: "Direction",
    life_supervisor: "Vie scolaire",
    teacher: "Enseignant",
    class_delegate: "Chef de classe",
    student: "Élève",
    parent: "Parent"
  };

  return (
    <Dashboard
      school={membership.school}
      role={roleLabels[membership.role] ?? membership.role}
      userEmail={user.email ?? ""}
      userName={String(user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "Utilisateur")}
      onSignOut={() => { void client.auth.signOut(); }}
    />
  );
}

function LoadingScreen({ label }: { label: string }) {
  return <main className="auth-state-page"><div className="auth-state-card"><div className="auth-brand-mark"><GraduationCap size={25} /></div><strong>SCHOOL <span>PRESENCE</span></strong><p>{label}</p></div></main>;
}

function SetupRequired() {
  return (
    <main className="auth-state-page">
      <div className="auth-state-card setup-card">
        <div className="auth-brand-mark"><GraduationCap size={25} /></div>
        <strong>SCHOOL <span>PRESENCE</span></strong>
        <h1>Connexion à la base de données à configurer</h1>
        <p>Ajoutez l’URL du projet Supabase et sa clé <strong>publishable</strong> dans les variables d’environnement de déploiement.</p>
        <code>VITE_SUPABASE_URL</code>
        <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>
        <p className="setup-warning">N’utilisez jamais une clé service_role ou une clé secrète dans le navigateur. Appliquez d’abord les migrations SQL du dossier <code>supabase/migrations</code>.</p>
      </div>
    </main>
  );
}

function ConnectionError({ message, onRetry, onSignOut }: { message: string; onRetry: () => void; onSignOut: () => void }) {
  return (
    <main className="auth-state-page">
      <div className="auth-state-card setup-card">
        <div className="auth-brand-mark"><GraduationCap size={25} /></div>
        <strong>SCHOOL <span>PRESENCE</span></strong>
        <h1>Impossible de charger votre espace</h1>
        <p>{message}</p>
        <p>Vérifiez que toutes les migrations SQL ont été appliquées et que l’API Data de Supabase est accessible.</p>
        <button className="auth-submit" onClick={onRetry}>Réessayer</button>
        <button className="onboarding-logout" onClick={onSignOut}>Se déconnecter</button>
      </div>
    </main>
  );
}