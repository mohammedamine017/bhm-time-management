# Plan MVP valide

## Phase 0 - Fondation

- Nouveau projet independant et sans authentification.
- Angular, NestJS, PostgreSQL avec Prisma.
- Docker pour le developpement et Railway pour le deploiement futur.
- Un seul cycle actif, calcule automatiquement du 20 du mois precedent au 19 du mois de paie.
- Codes metier configurables: nombre, P, A, D, T, F, X et case vide.

## Phase 1 - Liste active des employes

- Importer un fichier Excel contenant matricule, nom et prenom.
- Previsualiser puis confirmer l'import.
- Conserver une seule liste active.
- Voir, remplacer ou supprimer cette liste depuis la page Employes.
- Archiver le fichier remplace ou supprime.

## Phase 2 - Scan et extraction

- Ouvrir une page mobile permanente avec un QR code unique.
- Envoyer plusieurs images ou PDF dans un meme lot.
- Transmettre les documents et la liste active a Claude.
- Claude extrait les noms et la grille complete du 20 au 19.
- Claude ignore le titre Atelier, lit toute la zone d'identite et associe les noms a la liste active.
- Claude retourne un JSON strict directement exploitable.

## Phase 3 - Codes et rubriques metier

- Interpreter les codes extraits sans document complementaire.
- Traiter T comme une journee de travail a la tache, sans ajouter d'heures.
- Compter une date avec T une seule fois par employe, meme si elle apparait sur plusieurs feuilles.
- Conserver les codes metier dans une structure extensible.

## Phase 4 - Calcul et verification

- Lancer l'operation lorsque la liste des employes et les feuilles horaires sont disponibles.
- Interpreter les codes et calculer les rubriques du cycle.
- Afficher la grille complete et les totaux par employe.
- Permettre la correction case par case avec recalcul automatique.
- Conserver le lien vers la feuille source de chaque employe.

## Phase 5 - Exports et fin de cycle

- Exporter le tableau global et le detail d'un employe.
- Archiver les documents avec leur date.
- Reinitialiser les donnees actives du cycle termine tout en conservant les archives documentaires.

## Strategie de test

Chaque phase est livree comme un flux vertical frontend, API et base de donnees. Elle recoit uniquement les tests unitaires et d'integration minimaux du parcours nominal avant le passage a la phase suivante.
