# SCHOOL PRESENCE

Plateforme web de gestion intelligente de la vie scolaire, conçue pour les réalités des établissements du Burkina Faso : primaire, collège, lycée et université.

## Objectif

Simplifier les appels, centraliser les informations de vie scolaire et améliorer la communication entre enseignants, vie scolaire, administration et parents. L'établissement doit pouvoir choisir son organisation : appel direct par enseignant, cahier numérique collectif ou transition papier + numérique.

## Fonctions déjà préparées

- Interface web responsive : tableau de bord, appel interactif, classes, vie scolaire et rapports de démonstration.
- Gestion connectée des classes et des élèves via Supabase (création réservée à la direction, lecture filtrée par RLS).
- Authentification e-mail/mot de passe avec Supabase Auth.
- Création du premier établissement par le compte connecté.
- Attribution automatique du rôle school_admin au créateur de l'établissement.
- Profil utilisateur créé à l'inscription.
- Modèle PostgreSQL multi-établissements, rôles et RLS.
- Distinction entre absence/retard, expulsion de cours et exclusion de l'établissement.

> Important : les indicateurs, élèves et événements visibles dans le tableau de bord restent des exemples locaux. L'appel affiché dans l'interface n'est pas encore enregistré dans PostgreSQL. Les fonctionnalités métier seront raccordées dans les prochaines étapes.

## Démarrage local

1. Installer Node.js 22.12 ou une version ultérieure.
2. Installer les dépendances : npm install.
3. Copier .env.example vers .env.local.
4. Renseigner l'URL Supabase et la clé publishable.
5. Lancer : npm run dev.
6. Vérifier le build : npm run build.

## Configuration Supabase

Créer un projet Supabase dédié à SCHOOL PRESENCE, puis récupérer l'URL du projet et sa clé publishable dans la fenêtre Connect / API Keys.

Variables locales et Vercel :

- VITE_SUPABASE_URL
- VITE_SUPABASE_PUBLISHABLE_KEY

Les deux valeurs sont publiques côté navigateur. **Ne jamais y placer une clé service_role ou une clé secrète.**

Appliquer les migrations du dossier supabase/migrations dans l'ordre chronologique avec la Supabase CLI :

```bash
supabase login
supabase link --project-ref VOTRE_PROJECT_REF
supabase db push
```

Les migrations créent les tables, les déclencheurs de profil et d'administration initiale, les droits Data API et les politiques RLS. Le schéma interne app_private n'est pas destiné à être exposé par la Data API.

Dans Supabase, configurer Authentication > URL Configuration :
- Site URL : l'URL réelle de l'application.
- Redirect URLs : l'URL locale de développement et l'URL de production.
- Garder la confirmation de l'adresse e-mail activée pour les inscriptions publiques.

## Sécurité et règles métier

- Chaque donnée métier appartient à un établissement via school_id.
- Les autorisations sont vérifiées par PostgreSQL RLS, pas uniquement dans l'interface.
- Les fonctions SECURITY DEFINER utilisées pour les contrôles sont rangées dans app_private, hors du schéma exposé.
- Les enseignants et chefs de classe sont limités aux classes auxquelles ils sont affectés.
- Un parent peut justifier une absence ou un retard, mais ne peut pas modifier une expulsion de cours ou une sanction officielle.
- Une expulsion de cours est un événement distinct d'une exclusion de l'établissement.
- La clé service_role ne doit jamais être utilisée dans le navigateur.

## Structure

```
src/
  App.tsx
  components/
    AuthScreen.tsx
    SchoolOnboarding.tsx
  lib/
    domain.ts
    supabase.ts
  main.tsx
  styles.css
  styles-auth.css
supabase/
  migrations/
    20261101000100_initial_schema.sql
    20261101000200_school_onboarding.sql
    20261101000300_class_scoped_permissions.sql
    20261101000400_school_visibility_for_members.sql
    20261101000500_school_creation_rpc_only.sql
    20261101000600_auth_and_data_api_security.sql
    20261101000700_private_rls_helpers.sql
    20261101000800_class_overview.sql
    20261101000900_restore_school_creator_insert.sql
    20261101001000_submit_attendance.sql
    20261101001100_attendance_resubmission_safety.sql
```

## Feuille de route

1. Authentification, profils et création des établissements.
2. Classes, élèves et registre d’appel connectés à Supabase.
3. Affectations des enseignants, chefs de classe et responsables légaux.
4. Cahier numérique collectif et clôture par la vie scolaire.
5. Justifications, événements disciplinaires, rapports et audit.
6. Notifications multi-canaux, licences annuelles et paiements Mobile Money.
7. Application Android et synchronisation hors ligne.

## État du projet

Cette branche contient la fondation de la version initiale. La connexion au projet Supabase réel et l'application des migrations doivent encore être effectuées ; ne pas saisir de données scolaires réelles avant les tests de sécurité.

## Licence

Projet privé en cours de développement.