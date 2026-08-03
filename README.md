# BHM Time Management V2

Nouvelle version simplifiée du système de gestion mensuelle des horaires BHM.
L'ancien projet reste indépendant et n'est pas utilisé par cette version.

## Stack

- Angular 20 et Tailwind CSS
- NestJS 11
- PostgreSQL 17 et Prisma 7
- Cloudinary pour les documents
- API Anthropic Claude pour l'extraction structurée
- Docker, GitHub et Railway

## Flux cible

1. Importer une liste active d'employés.
2. Scanner les feuilles depuis le QR permanent.
3. Recevoir le JSON structuré extrait par Claude.
4. Lancer le calcul lorsque les employés et les feuilles sont prêts.
5. Vérifier, corriger et exporter les résultats.
6. Réinitialiser les données opérationnelles tout en conservant les documents archivés.

## Règles fondatrices

- Un seul cycle est actif.
- Un mois de paie couvre la période du 20 du mois précédent au 19 du mois courant.
- Le code `T` représente une journée de travail à la tâche, sans ajout d'heures.
- Une date avec `T` est comptée une seule fois par employé, même si elle apparaît sur plusieurs feuilles.
- Aucun écran de connexion dans la première version.

## Développement local

1. Copier `.env.example` vers `.env`.
2. Démarrer PostgreSQL avec `docker compose up -d`.
3. Installer les dépendances avec `npm install`.
4. Générer Prisma avec `npm run db:generate`.
5. Appliquer les migrations avec `npm run db:migrate`.
6. Démarrer l'application avec `npm run dev`.
7. Ouvrir le frontend sur `http://127.0.0.1:4202`.

L'API est disponible sur `http://127.0.0.1:3006`.
Pour tester sans appeler Claude, définir `ENABLE_MOCK_EXTRACTION="true"` dans
le fichier `.env`. Cette option doit rester à `false` dans un environnement réel.

## Déploiement Railway

- Configurer `backend` comme dossier racine du service API.
- Configurer `frontend` comme dossier racine du service web.
- Dans le service frontend, définir `BACKEND_URL` avec le domaine public HTTPS
  du backend, sans barre oblique finale.
- Ne pas définir manuellement `PORT` : Railway le fournit aux deux services.

## Validation par phase

Chaque phase est livrée verticalement, de PostgreSQL jusqu'à l'interface, puis
validée avec les tests minimaux du happy flow avant le commit suivant.
