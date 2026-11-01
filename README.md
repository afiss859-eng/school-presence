# SCHOOL PRESENCE

Plateforme web et mobile de gestion de la vie scolaire, conçue pour les réalités des établissements du Burkina Faso : primaire, collège, lycée et université.

## Objectif du produit

Simplifier les appels, centraliser les informations de vie scolaire et améliorer la communication entre enseignants, vie scolaire, administration et parents. L'établissement doit pouvoir choisir son organisation : appel direct par enseignant, cahier numérique collectif ou transition papier + numérique.

## Première version du dépôt

- Application web responsive React + TypeScript + Vite.
- Première interface de tableau de bord et de saisie d'appel (données de démonstration locales).
- Modèle PostgreSQL Supabase initial avec isolation par établissement et politiques RLS.
- Fondations pour distinguer absences/retards, expulsions de cours et exclusions disciplinaires.

> Important : cette version est un socle de développement. Les données visibles dans l'interface sont fictives et locales. L'authentification, la persistance Supabase, les notifications et l'application Android ne sont pas encore activées.

## Démarrage local

1. Installer Node.js LTS.
2. Installer les dépendances : \`npm install\`.
3. Copier \`.env.example\` vers \`.env\` et renseigner les clés publiques Supabase quand le projet sera configuré.
4. Lancer : \`npm run dev\`.
5. Créer le build : \`npm run build\`.

## Variables d'environnement

- \`VITE_SUPABASE_URL\` : URL du projet Supabase.
- \`VITE_SUPABASE_ANON_KEY\` : clé publique/anon du projet.

Ne jamais placer une clé \`service_role\`, un mot de passe ou un secret serveur dans une variable \`VITE_*\` ou dans le navigateur.

## Structure

\`\`\`
src/
  App.tsx
  main.tsx
  styles.css
  lib/
    domain.ts
    supabase.ts
supabase/
  migrations/
    0001_initial_schema.sql
\`\`\`

## Principes de sécurité

- Chaque donnée métier appartient à un établissement via \`school_id\`.
- Les autorisations sont contrôlées côté base avec Row Level Security (RLS), et pas uniquement dans l'interface.
- Un parent peut demander la justification d'une absence ou d'un retard, mais ne peut pas modifier une expulsion de cours ou une sanction officielle.
- Une expulsion de cours est un événement distinct d'une exclusion de l'établissement.
- Le journal d'audit et les notifications seront ajoutés avant toute mise en production.

## Feuille de route

1. Authentification, profils, établissements et invitations.
2. Gestion des classes, élèves, enseignants et responsables légaux.
3. Appels par cours et cahier numérique collectif, avec clôture par la vie scolaire.
4. Justifications, événements disciplinaires, rapports et audit.
5. Notifications multi-canaux avec maîtrise des coûts.
6. Licences annuelles et paiements Mobile Money.
7. Application Android et synchronisation hors ligne.

## Licence

Projet privé en cours de développement.