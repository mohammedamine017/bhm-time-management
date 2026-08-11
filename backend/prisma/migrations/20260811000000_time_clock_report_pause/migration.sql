-- La pause payée devient un réglage du rapport de pointeuse.
ALTER TABLE "TimeClockReport"
ADD COLUMN "pauseMinutes" INTEGER NOT NULL DEFAULT 30;

-- Les journées déjà importées contiennent la pause de 30 min ajoutée au
-- moment de la lecture. Le calcul l'ajoute désormais lui-même: on ne garde
-- que le temps réellement pointé.
UPDATE "TimeClockReportEmployee" e
SET days = recalculated.days
FROM (
  SELECT entry.id,
         jsonb_agg(
           CASE
             WHEN (day.value->>'durationMinutes')::int > 0
               THEN jsonb_set(
                 day.value,
                 '{durationMinutes}',
                 to_jsonb((day.value->>'durationMinutes')::int - 30)
               )
             ELSE day.value
           END
           ORDER BY day.ordinality
         ) AS days
  FROM "TimeClockReportEmployee" entry,
       jsonb_array_elements(entry.days) WITH ORDINALITY AS day(value, ordinality)
  GROUP BY entry.id
) AS recalculated
WHERE e.id = recalculated.id;
