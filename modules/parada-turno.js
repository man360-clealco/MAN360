-- MAN360 — Parada com Chuva / Turno
-- Rodar no SQL Editor do Supabase

CREATE TABLE IF NOT EXISTS parada_turno_config (
  id          BIGSERIAL PRIMARY KEY,
  nome        TEXT NOT NULL DEFAULT 'Parada',
  inicio      TIMESTAMPTZ,
  fim_dias    INT DEFAULT 1,
  hora_inicio TEXT DEFAULT '07:00',
  hora_fim    TEXT DEFAULT '17:00',
  equipe      JSONB DEFAULT '[]',
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parada_turno_os (
  id          BIGSERIAL PRIMARY KEY,
  cfg_id      BIGINT REFERENCES parada_turno_config(id),
  os          TEXT NOT NULL,
  cod         TEXT DEFAULT '1',
  descricao   TEXT DEFAULT '',
  hh          NUMERIC DEFAULT 0,
  hh_orig     NUMERIC DEFAULT 0,
  equipe      JSONB DEFAULT '[]',
  recurso     TEXT,
  recurso_dur NUMERIC,
  status      TEXT DEFAULT 'aguardando',
  inicio_real TIMESTAMPTZ,
  fim_real    TIMESTAMPTZ,
  fotos       JSONB DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE parada_turno_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE parada_turno_os     DISABLE ROW LEVEL SECURITY;

SELECT 'Tabelas criadas com sucesso' AS status;

-- Colunas extras para modalidade e prioridade
ALTER TABLE parada_turno_os ADD COLUMN IF NOT EXISTS modalidade TEXT;
ALTER TABLE parada_turno_os ADD COLUMN IF NOT EXISTS prioridade TEXT;
