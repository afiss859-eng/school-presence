import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
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
  Plus,
  Search,
  ShieldAlert,
  Users,
  X
} from "lucide-react";
import type { AttendanceStatus } from "./lib/domain";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import type { User } from "@supabase/supabase-js";
import AuthScreen from "./components/AuthScreen";
import SchoolOnboarding from "./components/SchoolOnboarding";

type Page = "overview" | "attendance" | "life" | "classes" | "students" | "reports";

const navigation = [
  { id: "overview" as const, label: "Vue d’ensemble", icon: LayoutDashboard },
  { id: "attendance" as const, label: "Faire l’appel", icon: ClipboardCheck },
  { id: "life" as const, label: "Vie scolaire", icon: ShieldAlert },
  { id: "classes" as const, label: "Classes", icon: BookOpen },
  { id: "students" as const, label: "Élèves", icon: Users },
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

interface SchoolClass {
  id: string;
  name: string;
  level: string | null;
  class_mode: string;
  student_count: number;
}

interface SchoolStudent {
  id: string;
  first_name: string;
  last_name: string;
  student_code: string | null;
  current_class_id: string | null;
}

interface DashboardProps {
  school: SchoolInfo;
  role: string;
  roleCode: string;
  userEmail: string;
  userName: string;
  onSignOut: () => void;
}

function Dashboard({ school, role, roleCode, userEmail, userName, onSignOut }: DashboardProps) {
  const [page, setPage] = useState<Page>("overview");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedAttendanceClassId, setSelectedAttendanceClassId] = useState("");
  const [attendancePeriod, setAttendancePeriod] = useState("Cours du matin");
  const [attendanceStudents, setAttendanceStudents] = useState<SchoolStudent[]>([]);
  const [attendanceStudentsLoading, setAttendanceStudentsLoading] = useState(false);
  const [attendanceStudentsError, setAttendanceStudentsError] = useState("");
  const [attendanceMarks, setAttendanceMarks] = useState<Record<string, AttendanceStatus>>({});
  const [attendanceSearch, setAttendanceSearch] = useState("");
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [attendanceSaveError, setAttendanceSaveError] = useState("");
  const [attendanceSavedSessionId, setAttendanceSavedSessionId] = useState<string | null>(null);

  const dbClient = supabase;
  const isSchoolAdmin = roleCode === "school_admin" || roleCode === "super_admin";
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  const [classesLoading, setClassesLoading] = useState(false);
  const [classesError, setClassesError] = useState("");
  const [classesRefresh, setClassesRefresh] = useState(0);
  const [newClassName, setNewClassName] = useState("");
  const [newClassLevel, setNewClassLevel] = useState("");
  const [classSaving, setClassSaving] = useState(false);
  const [classSaveError, setClassSaveError] = useState("");
  const [selectedStudentClassId, setSelectedStudentClassId] = useState("");
  const [schoolStudents, setSchoolStudents] = useState<SchoolStudent[]>([]);
  const [schoolStudentsLoading, setSchoolStudentsLoading] = useState(false);
  const [schoolStudentsError, setSchoolStudentsError] = useState("");
  const [studentsRefresh, setStudentsRefresh] = useState(0);
  const [studentSearch, setStudentSearch] = useState("");
  const [newStudentFirstName, setNewStudentFirstName] = useState("");
  const [newStudentLastName, setNewStudentLastName] = useState("");
  const [newStudentCode, setNewStudentCode] = useState("");
  const [studentSaving, setStudentSaving] = useState(false);
  const [studentSaveError, setStudentSaveError] = useState("");

  useEffect(() => {
    if (!dbClient) return;
    const client: NonNullable<typeof dbClient> = dbClient;
    let cancelled = false;
    setClassesLoading(true);
    setClassesError("");

    async function loadClasses() {
      const { data, error } = await client.rpc("get_school_class_overview", {
        target_school_id: school.id
      });
      if (cancelled) return;
      if (error) {
        setClassesError(error.message);
        setSchoolClasses([]);
      } else {
        const rows = (data ?? []) as unknown as SchoolClass[];
        setSchoolClasses(rows);
        setSelectedStudentClassId((current) =>
          rows.some((item) => item.id === current) ? current : (rows[0]?.id ?? "")
        );
        setSelectedAttendanceClassId((current) =>
          rows.some((item) => item.id === current) ? current : (rows[0]?.id ?? "")
        );
      }
      setClassesLoading(false);
    }

    void loadClasses();
    return () => { cancelled = true; };
  }, [dbClient, school.id, classesRefresh]);

  useEffect(() => {
    if (!dbClient || !selectedStudentClassId) {
      setSchoolStudents([]);
      setSchoolStudentsLoading(false);
      setSchoolStudentsError("");
      return;
    }
    const client: NonNullable<typeof dbClient> = dbClient;
    let cancelled = false;
    setSchoolStudentsLoading(true);
    setSchoolStudentsError("");

    async function loadStudents() {
      const { data, error } = await client
        .from("students")
        .select("id, first_name, last_name, student_code, current_class_id")
        .eq("school_id", school.id)
        .eq("current_class_id", selectedStudentClassId)
        .eq("is_active", true)
        .order("last_name", { ascending: true });

      if (cancelled) return;
      if (error) {
        setSchoolStudentsError(error.message);
        setSchoolStudents([]);
      } else {
        setSchoolStudents((data ?? []) as SchoolStudent[]);
      }
      setSchoolStudentsLoading(false);
    }

    void loadStudents();
    return () => { cancelled = true; };
  }, [dbClient, school.id, selectedStudentClassId, studentsRefresh]);

  useEffect(() => {
    if (!dbClient || !selectedAttendanceClassId) {
      setAttendanceStudents([]);
      setAttendanceStudentsLoading(false);
      setAttendanceStudentsError("");
      return;
    }
    const client: NonNullable<typeof dbClient> = dbClient;
    let cancelled = false;
    setAttendanceStudentsLoading(true);
    setAttendanceStudentsError("");
    setAttendanceSavedSessionId(null);

    async function loadAttendanceStudents() {
      const { data, error } = await client
        .from("students")
        .select("id, first_name, last_name, student_code, current_class_id")
        .eq("school_id", school.id)
        .eq("current_class_id", selectedAttendanceClassId)
        .eq("is_active", true)
        .order("last_name", { ascending: true });

      if (cancelled) return;
      if (error) {
        setAttendanceStudentsError(error.message);
        setAttendanceStudents([]);
      } else {
        const rows = (data ?? []) as SchoolStudent[];
        setAttendanceStudents(rows);
        setAttendanceMarks((current) => {
          const next: Record<string, AttendanceStatus> = {};
          rows.forEach((student) => {
            next[student.id] = current[student.id] ?? "present";
          });
          return next;
        });
      }
      setAttendanceStudentsLoading(false);
    }

    void loadAttendanceStudents();
    return () => { cancelled = true; };
  }, [dbClient, school.id, selectedAttendanceClassId]);

  const visibleSchoolStudents = schoolStudents.filter((student) => {
    const fullName = (student.first_name + " " + student.last_name).toLowerCase();
    const code = (student.student_code ?? "").toLowerCase();
    const query = studentSearch.toLowerCase();
    return fullName.includes(query) || code.includes(query);
  });

  async function handleCreateClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dbClient || !isSchoolAdmin) return;
    setClassSaveError("");
    setClassSaving(true);
    try {
      const classMode = school.school_type === "primary"
        ? "primary"
        : school.school_type === "university" ? "university" : "secondary";
      const { error } = await dbClient.from("classes").insert({
        school_id: school.id,
        name: newClassName.trim(),
        level: newClassLevel.trim() || null,
        class_mode: classMode
      });
      if (error) throw error;
      setNewClassName("");
      setNewClassLevel("");
      setClassesRefresh((value) => value + 1);
    } catch (caught) {
      setClassSaveError(caught instanceof Error ? caught.message : "Impossible de créer la classe.");
    } finally {
      setClassSaving(false);
    }
  }

  async function handleCreateStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dbClient || !isSchoolAdmin || !selectedStudentClassId) return;
    setStudentSaveError("");
    setStudentSaving(true);
    try {
      const { error } = await dbClient.from("students").insert({
        school_id: school.id,
        current_class_id: selectedStudentClassId,
        first_name: newStudentFirstName.trim(),
        last_name: newStudentLastName.trim(),
        student_code: newStudentCode.trim() || null
      });
      if (error) throw error;
      setNewStudentFirstName("");
      setNewStudentLastName("");
      setNewStudentCode("");
      setStudentsRefresh((value) => value + 1);
      setClassesRefresh((value) => value + 1);
    } catch (caught) {
      setStudentSaveError(caught instanceof Error ? caught.message : "Impossible d’ajouter cet élève.");
    } finally {
      setStudentSaving(false);
    }
  }

  const attendanceTotals = useMemo(() => {
    return attendanceStudents.reduce(
      (result, student) => {
        result[attendanceMarks[student.id] ?? "present"] += 1;
        return result;
      },
      { present: 0, absent: 0, late: 0 }
    );
  }, [attendanceStudents, attendanceMarks]);

  const filteredAttendanceStudents = attendanceStudents.filter((student) => {
    const fullName = (student.first_name + " " + student.last_name).toLowerCase();
    const studentCode = (student.student_code ?? "").toLowerCase();
    const query = attendanceSearch.toLowerCase();
    return fullName.includes(query) || studentCode.includes(query);
  });

  function setAttendanceMark(studentId: string, status: AttendanceStatus) {
    setAttendanceMarks((current) => ({ ...current, [studentId]: status }));
    setAttendanceSavedSessionId(null);
    setAttendanceSaveError("");
  }

  async function handleSubmitAttendance() {
    if (!dbClient || !selectedAttendanceClassId || attendanceStudents.length === 0) return;
    setAttendanceSaving(true);
    setAttendanceSaveError("");
    setAttendanceSavedSessionId(null);
    try {
      const records = attendanceStudents.map((student) => ({
        student_id: student.id,
        status: attendanceMarks[student.id] ?? "present"
      }));
      const { data, error } = await dbClient.rpc("submit_attendance", {
        p_school_id: school.id,
        p_class_id: selectedAttendanceClassId,
        p_session_date: selectedDate,
        p_period_label: attendancePeriod.trim() || "Cours",
        p_records: records
      });
      if (error) throw error;
      setAttendanceSavedSessionId(String(data));
    } catch (caught) {
      setAttendanceSaveError(caught instanceof Error ? caught.message : "Impossible d’enregistrer l’appel.");
    } finally {
      setAttendanceSaving(false);
    }
  }

  function changePage(nextPage: Page) {
    setPage(nextPage);
    setMobileMenuOpen(false);
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
                {page === "classes" && "Consultez les classes enregistrées dans votre établissement."}
                {page === "students" && "Consultez les élèves et gérez leurs inscriptions par classe."}
                {page === "reports" && "Suivez les indicateurs et préparez les rapports de votre établissement."}
              </p>
            </div>
            <div className="date-pill"><CalendarDays size={17} /> {formatDate(selectedDate)}</div>
          </div>

          <div className="demo-notice">
            <span className="notice-icon"><Activity size={17} /></span>
            <p><strong>Version de démarrage.</strong> Les classes et les élèves sont chargés depuis Supabase. Les appels, indicateurs et rapports affichés ailleurs restent des exemples et ne sont pas encore enregistrés.</p>
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
                <div><h2>Registre d’appel</h2><p>Les présents, absents et retards seront enregistrés dans la base de données.</p></div>
                <div className="call-controls">
                  <label className="select-control"><span>Classe</span><select value={selectedAttendanceClassId} onChange={(event) => { setSelectedAttendanceClassId(event.target.value); setAttendanceSavedSessionId(null); }} disabled={schoolClasses.length === 0}><option value="">Sélectionner une classe</option>{schoolClasses.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</option>)}</select></label>
                  <label className="select-control"><span>Date</span><input type="date" value={selectedDate} onChange={(event) => { setSelectedDate(event.target.value); setAttendanceSavedSessionId(null); }} /></label>
                  <label className="select-control"><span>Période / cours</span><input value={attendancePeriod} onChange={(event) => { setAttendancePeriod(event.target.value); setAttendanceSavedSessionId(null); }} maxLength={80} /></label>
                </div>
              </div>
              <div className="call-summary">
                <span><i className="summary-dot green-dot" /> Présents <strong>{attendanceTotals.present}</strong></span>
                <span><i className="summary-dot orange-dot" /> Absents <strong>{attendanceTotals.absent}</strong></span>
                <span><i className="summary-dot purple-dot" /> Retards <strong>{attendanceTotals.late}</strong></span>
                <div className="search-field"><Search size={16} /><input value={attendanceSearch} onChange={(event) => setAttendanceSearch(event.target.value)} placeholder="Rechercher un élève…" /></div>
              </div>
              {attendanceStudentsError && <div className="inline-error"><strong>Impossible de charger les élèves.</strong><p>{attendanceStudentsError}</p></div>}
              {schoolClasses.length === 0 ? (
                <div className="empty-data-state"><Users size={24} /><strong>Aucune classe accessible</strong><p>Ajoutez une classe ou demandez à la direction de vous affecter à une classe.</p></div>
              ) : attendanceStudentsLoading ? (
                <div className="empty-data-state">Chargement de la liste des élèves…</div>
              ) : attendanceStudents.length === 0 ? (
                <div className="empty-data-state"><Users size={24} /><strong>Aucun élève dans cette classe</strong><p>Inscrivez les élèves avant de faire l’appel.</p></div>
              ) : (
                <div className="student-list">
                  <div className="student-row student-head"><span>ÉLÈVE</span><span>MATRICULE</span><span>STATUT</span></div>
                  {filteredAttendanceStudents.map((student) => {
                    const currentStatus = attendanceMarks[student.id] ?? "present";
                    return (
                      <div className="student-row" key={student.id}>
                        <div className="student-name"><span className="student-initials">{student.first_name[0]}{student.last_name[0]}</span><strong>{student.first_name} {student.last_name}</strong></div>
                        <span className="student-code">{student.student_code || "—"}</span>
                        <div className="status-actions">
                          {(["present", "absent", "late"] as AttendanceStatus[]).map((status) => (
                            <button key={status} className={"status-choice " + status + (currentStatus === status ? " selected" : "")} onClick={() => setAttendanceMark(student.id, status)}>
                              {status === "present" && <Check size={14} />}{status === "absent" && <X size={14} />}{status === "late" && <Clock3 size={14} />}
                              <span>{statusLabels[status]}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {filteredAttendanceStudents.length === 0 && <div className="empty-state">Aucun élève ne correspond à cette recherche.</div>}
                </div>
              )}
              <div className="call-footer">
                <span>{attendanceStudents.length} élèves · {formatDate(selectedDate)}</span>
                <button className="primary-button" onClick={handleSubmitAttendance} disabled={attendanceSaving || attendanceStudentsLoading || attendanceStudents.length === 0 || Boolean(attendanceSavedSessionId)}>
                  <Check size={17} /> {attendanceSaving ? "Enregistrement…" : attendanceSavedSessionId ? "Appel enregistré" : "Enregistrer l’appel"}
                </button>
              </div>
              {attendanceSaveError && <p className="form-error">{attendanceSaveError}</p>}
              {attendanceSavedSessionId && <p className="success-note">Appel transmis à la base de données. Référence de séance : {attendanceSavedSessionId}</p>}
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
            <>
              {isSchoolAdmin && (
                <form className="panel entity-create-form" onSubmit={handleCreateClass}>
                  <div className="entity-form-heading"><div><h2>Créer une classe</h2><p>La classe sera enregistrée dans cet établissement.</p></div><span className="entity-form-icon"><Plus size={18} /></span></div>
                  <div className="entity-form-fields">
                    <label className="entity-field"><span>Nom de la classe</span><input value={newClassName} onChange={(event) => setNewClassName(event.target.value)} placeholder="Ex. 4e B" minLength={1} maxLength={80} required /></label>
                    <label className="entity-field"><span>Niveau (facultatif)</span><input value={newClassLevel} onChange={(event) => setNewClassLevel(event.target.value)} placeholder="Ex. 4e" maxLength={80} /></label>
                    <button className="primary-button" type="submit" disabled={classSaving || !newClassName.trim()}>{classSaving ? "Enregistrement…" : <><Plus size={16} /> Ajouter la classe</>}</button>
                  </div>
                  {classSaveError && <p className="form-error">{classSaveError}</p>}
                </form>
              )}
              {classesError && <div className="panel inline-error"><strong>Impossible de charger les classes.</strong><p>{classesError}</p><button className="text-button" onClick={() => setClassesRefresh((value) => value + 1)}>Réessayer</button></div>}
              {classesLoading ? (
                <div className="panel empty-data-state">Chargement des classes…</div>
              ) : schoolClasses.length === 0 ? (
                <div className="panel empty-data-state"><Users size={25} /><strong>Aucune classe enregistrée</strong><p>Ajoutez les premières classes de votre établissement pour commencer à inscrire les élèves.</p></div>
              ) : (
                <section className="class-card-grid">
                  {schoolClasses.map((schoolClass) => (
                    <div className="panel class-card" key={schoolClass.id}>
                      <div className="class-card-icon"><Users size={20} /></div>
                      <span className="class-level">{schoolClass.level || schoolClass.class_mode}</span>
                      <h2>{schoolClass.name}</h2>
                      <p>{schoolClass.class_mode === "primary" ? "Organisation primaire" : schoolClass.class_mode === "university" ? "Groupe universitaire" : "Classe secondaire"}</p>
                      <div className="class-card-bottom"><strong>{schoolClass.student_count} <small>élèves</small></strong><button className="text-button" onClick={() => { setSelectedStudentClassId(schoolClass.id); changePage("students"); }}>Voir les élèves →</button></div>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}

          {page === "students" && (
            <section className="panel students-management-panel">
              <div className="panel-heading students-heading">
                <div><h2>Registre des élèves</h2><p>Les informations sont limitées aux classes accessibles à votre compte.</p></div>
                <span className="counter-badge">{schoolStudents.length} élèves</span>
              </div>
              <div className="students-toolbar">
                <label className="select-control"><span>Classe</span><select value={selectedStudentClassId} onChange={(event) => setSelectedStudentClassId(event.target.value)} disabled={schoolClasses.length === 0}><option value="">Sélectionner une classe</option>{schoolClasses.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</option>)}</select></label>
                <div className="search-field"><Search size={16} /><input value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="Rechercher un élève…" /></div>
              </div>
              {isSchoolAdmin && selectedStudentClassId && (
                <form className="student-create-form" onSubmit={handleCreateStudent}>
                  <div className="entity-form-heading"><div><h2>Ajouter un élève</h2><p>L’élève sera inscrit dans la classe sélectionnée.</p></div><span className="entity-form-icon"><Plus size={18} /></span></div>
                  <div className="entity-form-fields student-form-fields">
                    <label className="entity-field"><span>Prénom</span><input value={newStudentFirstName} onChange={(event) => setNewStudentFirstName(event.target.value)} placeholder="Prénom" required maxLength={100} /></label>
                    <label className="entity-field"><span>Nom</span><input value={newStudentLastName} onChange={(event) => setNewStudentLastName(event.target.value)} placeholder="Nom de famille" required maxLength={100} /></label>
                    <label className="entity-field"><span>Matricule (facultatif)</span><input value={newStudentCode} onChange={(event) => setNewStudentCode(event.target.value)} placeholder="Ex. SP-2026-001" maxLength={60} /></label>
                    <button className="primary-button" type="submit" disabled={studentSaving || !newStudentFirstName.trim() || !newStudentLastName.trim()}>{studentSaving ? "Enregistrement…" : <><Plus size={16} /> Ajouter</>}</button>
                  </div>
                  {studentSaveError && <p className="form-error">{studentSaveError}</p>}
                </form>
              )}
              {schoolStudentsError && <div className="inline-error"><strong>Impossible de charger les élèves.</strong><p>{schoolStudentsError}</p><button className="text-button" onClick={() => setStudentsRefresh((value) => value + 1)}>Réessayer</button></div>}
              {schoolClasses.length === 0 ? (
                <div className="empty-data-state"><Users size={24} /><strong>Aucune classe accessible</strong><p>Créez une classe ou demandez à la direction de vous affecter à une classe.</p></div>
              ) : schoolStudentsLoading ? (
                <div className="empty-data-state">Chargement des élèves…</div>
              ) : (
                <div className="student-directory">
                  <div className="student-directory-row student-directory-head"><span>ÉLÈVE</span><span>MATRICULE</span><span>CLASSE</span></div>
                  {visibleSchoolStudents.map((student) => (
                    <div className="student-directory-row" key={student.id}>
                      <div className="student-name"><span className="student-initials">{student.first_name[0]}{student.last_name[0]}</span><strong>{student.first_name} {student.last_name}</strong></div>
                      <span className="student-code">{student.student_code || "Non renseigné"}</span>
                      <span className="student-code">{schoolClasses.find((item) => item.id === student.current_class_id)?.name ?? "—"}</span>
                    </div>
                  ))}
                  {visibleSchoolStudents.length === 0 && <div className="empty-state">{studentSearch ? "Aucun élève ne correspond à la recherche." : "Aucun élève inscrit dans cette classe."}</div>}
                </div>
              )}
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
    if (!user || !supabase) {
      setMemberships([]);
      setMembershipsLoading(false);
      setMembershipError("");
      return;
    }

    const authenticatedUser: User = user;
    const client: NonNullable<typeof supabase> = supabase;
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
      roleCode={membership.role}
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