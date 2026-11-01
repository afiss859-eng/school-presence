import { useState, type FormEvent } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, GraduationCap, LockKeyhole, Mail, UserRound } from "lucide-react";
import { supabase } from "../lib/supabase";

type AuthMode = "signin" | "signup";

export default function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!supabase) {
      setError("La connexion à Supabase n’est pas configurée.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: window.location.origin
          }
        });

        if (authError) throw authError;

        if (data.session) {
          setNotice("Compte créé. Ouverture de votre espace…");
        } else {
          setNotice("Compte créé. Consultez votre boîte e-mail pour confirmer votre adresse avant de vous connecter.");
        }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });
        if (authError) throw authError;
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Une erreur inattendue est survenue.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-brand-side">
        <div className="auth-brand">
          <div className="auth-brand-mark"><GraduationCap size={27} /></div>
          <div><strong>SCHOOL <span>PRESENCE</span></strong><small>La vie scolaire, simplifiée</small></div>
        </div>
        <div className="auth-pitch">
          <span className="auth-eyebrow">UNE ÉCOLE MIEUX CONNECTÉE</span>
          <h1>La gestion scolaire devient plus simple.</h1>
          <p>Les appels, la vie scolaire et la communication avec les familles réunis dans un seul espace.</p>
          <div className="auth-benefits">
            <span><CheckCircle2 size={17} /> Un suivi clair des présences</span>
            <span><CheckCircle2 size={17} /> Des informations organisées par établissement</span>
            <span><CheckCircle2 size={17} /> Un accès adapté à chaque rôle</span>
          </div>
        </div>
        <div className="auth-footer-note">Une solution pensée pour les établissements du Burkina Faso.</div>
      </section>

      <section className="auth-form-side">
        <div className="auth-form-card">
          <div className="auth-mobile-brand">
            <div className="auth-brand-mark"><GraduationCap size={24} /></div>
            <strong>SCHOOL <span>PRESENCE</span></strong>
          </div>
          <span className="auth-eyebrow">{mode === "signin" ? "BON RETOUR" : "BIENVENUE"}</span>
          <h2>{mode === "signin" ? "Connectez-vous" : "Créez votre compte"}</h2>
          <p className="auth-description">
            {mode === "signin"
              ? "Accédez à votre espace de gestion de la vie scolaire."
              : "Créez votre compte. Vous pourrez ensuite enregistrer votre établissement."}
          </p>

          <form onSubmit={handleSubmit} className="auth-form">
            {mode === "signup" && (
              <label className="auth-field">
                <span>Nom complet</span>
                <div className="auth-input-wrap"><UserRound size={17} /><input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" placeholder="Ex. Awa Ouédraogo" required minLength={2} /></div>
              </label>
            )}
            <label className="auth-field">
              <span>Adresse e-mail</span>
              <div className="auth-input-wrap"><Mail size={17} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="nom@exemple.com" required /></div>
            </label>
            <label className="auth-field">
              <span>Mot de passe</span>
              <div className="auth-input-wrap"><LockKeyhole size={17} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "signin" ? "current-password" : "new-password"} placeholder="8 caractères minimum" required minLength={8} /></div>
            </label>

            {error && <div className="auth-message auth-error"><AlertCircle size={16} /><span>{error}</span></div>}
            {notice && <div className="auth-message auth-success"><CheckCircle2 size={16} /><span>{notice}</span></div>}

            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? "Veuillez patienter…" : mode === "signin" ? "Se connecter" : "Créer mon compte"}
              {!loading && <ArrowRight size={17} />}
            </button>
          </form>

          <div className="auth-switch">
            {mode === "signin" ? "Vous n’avez pas encore de compte ?" : "Vous avez déjà un compte ?"}
            <button onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setNotice(""); }}>
              {mode === "signin" ? "Créer un compte" : "Se connecter"}
            </button>
          </div>
          <div className="auth-security-note"><LockKeyhole size={14} /> Connexion sécurisée par Supabase Auth.</div>
        </div>
      </section>
    </main>
  );
}