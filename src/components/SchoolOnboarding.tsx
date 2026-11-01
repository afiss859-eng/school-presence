import { useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { Building2, CheckCircle2, GraduationCap, LoaderCircle, LogOut } from "lucide-react";
import { supabase } from "../lib/supabase";

type SchoolType = "primary" | "middle" | "high" | "university" | "other";

interface Props {
  user: User;
  onCreated: () => void;
  onSignOut: () => void;
}

export default function SchoolOnboarding({ user, onCreated, onSignOut }: Props) {
  const [name, setName] = useState("");
  const [schoolType, setSchoolType] = useState<SchoolType>("middle");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!supabase) {
      setError("La connexion à Supabase n’est pas configurée.");
      return;
    }

    setLoading(true);
    try {
      const { error: insertError } = await supabase
        .from("schools")
        .insert({
          name: name.trim(),
          school_type: schoolType,
          city: city.trim() || null,
          created_by: user.id
        });

      if (insertError) throw insertError;
      onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible de créer l’établissement.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="onboarding-page">
      <header className="onboarding-top">
        <div className="auth-brand-mark"><GraduationCap size={24} /></div>
        <strong>SCHOOL <span>PRESENCE</span></strong>
        <button className="onboarding-logout" onClick={onSignOut}><LogOut size={16} /> Déconnexion</button>
      </header>
      <section className="onboarding-card">
        <div className="onboarding-icon"><Building2 size={25} /></div>
        <span className="auth-eyebrow">CONFIGURATION INITIALE</span>
        <h1>Enregistrons votre établissement.</h1>
        <p>Le compte connecté deviendra le premier administrateur de cet établissement. Vous pourrez ensuite organiser les classes et inviter les autres utilisateurs.</p>
        <form className="onboarding-form" onSubmit={handleSubmit}>
          <label className="auth-field"><span>Nom de l’établissement</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex. Lycée municipal de…" required minLength={2} maxLength={180} /></label>
          <label className="auth-field"><span>Type d’établissement</span><select value={schoolType} onChange={(event) => setSchoolType(event.target.value as SchoolType)}><option value="primary">École primaire</option><option value="middle">Collège</option><option value="high">Lycée</option><option value="university">Université / supérieur</option><option value="other">Autre établissement</option></select></label>
          <label className="auth-field"><span>Ville (facultatif)</span><input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Ex. Bobo-Dioulasso" /></label>
          {error && <div className="auth-message auth-error">{error}</div>}
          <button className="auth-submit" type="submit" disabled={loading}>{loading ? <><LoaderCircle className="spin" size={17} /> Création…</> : <>Créer mon établissement <CheckCircle2 size={17} /></>}</button>
        </form>
        <div className="onboarding-note">La création attribue automatiquement le rôle « Direction / Administrateur » au compte qui enregistre l’établissement.</div>
      </section>
    </main>
  );
}