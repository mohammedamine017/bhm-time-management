// Purge complet des documents: base de données puis fichiers Cloudinary.
// Usage:
//   node scripts/purge-documents.mjs --dry-run   (inventaire seul, rien n'est supprimé)
//   node scripts/purge-documents.mjs --yes       (suppression définitive)
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';

const dryRun = !process.argv.includes('--yes');
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL manquant.');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const cloudinaryReady = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET,
);
if (cloudinaryReady) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

const [scans, batches, rows, reports, reportDays, lists, employees, runs, results] =
  await Promise.all([
    prisma.scanDocument.count(),
    prisma.scanBatch.count(),
    prisma.extractedTimeSheetRow.count(),
    prisma.timeClockReport.count(),
    prisma.timeClockReportEmployee.count(),
    prisma.employeeListImport.count(),
    prisma.employee.count(),
    prisma.calculationRun.count(),
    prisma.employeeCalculation.count(),
  ]);

console.log('--- Contenu actuel ---');
console.table({
  'Feuilles scannées': scans,
  'Lots de scan': batches,
  'Lignes extraites': rows,
  'Rapports pointeuse': reports,
  'Lignes pointeuse': reportDays,
  'Listes employés': lists,
  'Employés (supprimés en cascade)': employees,
  'Calculs (conservés, vidés)': runs,
  'Résultats (supprimés en cascade)': results,
});

const [scanFiles, reportFiles, listFiles] = await Promise.all([
  prisma.scanDocument.findMany({
    select: { storageKey: true, storageUrl: true, mimeType: true },
  }),
  prisma.timeClockReport.findMany({
    select: { storageKey: true, storageUrl: true },
  }),
  prisma.employeeListImport.findMany({
    select: { storageKey: true, storageUrl: true },
  }),
]);

const hosted = [
  ...scanFiles.map((file) => ({
    key: file.storageKey,
    url: file.storageUrl,
    type: file.mimeType?.startsWith('image/') ? 'image' : 'raw',
  })),
  ...[...reportFiles, ...listFiles].map((file) => ({
    key: file.storageKey,
    url: file.storageUrl,
    type: 'raw',
  })),
].filter((file) => file.key && file.url);

console.log(`Fichiers hébergés référencés: ${hosted.length}`);

if (dryRun) {
  console.log('\nMode inventaire: rien n’a été supprimé.');
  console.log('Relancer avec --yes pour supprimer définitivement.');
  await prisma.$disconnect();
  process.exit(0);
}

if (!cloudinaryReady) {
  console.error('Identifiants Cloudinary manquants: suppression annulée.');
  await prisma.$disconnect();
  process.exit(1);
}

let removed = 0;
for (const file of hosted) {
  // Le type est déduit du stockage; on retente avec l'autre en cas d'échec.
  const attempts = file.type === 'image' ? ['image', 'raw'] : ['raw', 'image'];
  for (const resourceType of attempts) {
    const outcome = await cloudinary.uploader.destroy(file.key, {
      resource_type: resourceType,
      invalidate: true,
    });
    if (outcome.result === 'ok') {
      removed += 1;
      break;
    }
  }
}
console.log(`Cloudinary: ${removed}/${hosted.length} fichier(s) supprimé(s).`);

// Balayage des orphelins éventuels du dossier de l'application.
for (const resourceType of ['image', 'raw']) {
  const swept = await cloudinary.api.delete_resources_by_prefix('bhm-v2/', {
    resource_type: resourceType,
  });
  const count = Object.keys(swept.deleted ?? {}).length;
  if (count) console.log(`Cloudinary: ${count} orphelin(s) ${resourceType}.`);
}

// Les cascades du schéma suppriment lignes extraites, jours pointés,
// employés et résultats de calcul.
const deletedBatches = await prisma.scanBatch.deleteMany({});
const deletedReports = await prisma.timeClockReport.deleteMany({});
const deletedLists = await prisma.employeeListImport.deleteMany({});

console.log('--- Supprimé ---');
console.table({
  'Lots de scan': deletedBatches.count,
  'Rapports pointeuse': deletedReports.count,
  'Listes employés': deletedLists.count,
});

await prisma.$disconnect();
