-- Skills con decimales: el motor Elo ahora usa K fraccionario (default 1.5)
-- y cambios de rating con 2 decimales, por lo que las columnas INTEGER
-- truncarían los ajustes finos.

ALTER TABLE teams
  ALTER COLUMN skill TYPE NUMERIC(5,2);

ALTER TABLE match_history
  ALTER COLUMN home_skill_before TYPE NUMERIC(5,2),
  ALTER COLUMN away_skill_before TYPE NUMERIC(5,2),
  ALTER COLUMN home_skill_after TYPE NUMERIC(5,2),
  ALTER COLUMN away_skill_after TYPE NUMERIC(5,2),
  ALTER COLUMN home_skill_change TYPE NUMERIC(5,2),
  ALTER COLUMN away_skill_change TYPE NUMERIC(5,2);

ALTER TABLE team_tournament_skills
  ALTER COLUMN skill_snapshot TYPE NUMERIC(5,2);
