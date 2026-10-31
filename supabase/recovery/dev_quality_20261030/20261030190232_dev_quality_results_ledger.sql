-- Cotironda D019: métricas del laboratorio IA DEV. Nunca ejecutar en producción.
-- El benchmark no guarda prompts, respuestas crudas, marcas, SKUs, compradores o secretos.
CREATE TABLE IF NOT EXISTS public.dev_ia_quality_results (
  case_id text PRIMARY KEY
    REFERENCES public.dev_ia_quality_claims(case_id) ON DELETE RESTRICT,
  source text NOT NULL DEFAULT 'edge_runtime'
    CHECK (source IN ('edge_runtime','reported_by_owner')),
  model text NOT NULL CHECK (model = 'gpt-6-luna'),
  security_pass boolean NOT NULL,
  coverage_pass boolean NOT NULL,
  products_expected integer NOT NULL CHECK (products_expected >= 0),
  products_exact integer NOT NULL CHECK (products_exact >= 0),
  products_omitted integer NOT NULL CHECK (products_omitted >= 0),
  products_altered integer NOT NULL CHECK (products_altered >= 0),
  suppliers_expected integer NOT NULL CHECK (suppliers_expected >= 0),
  suppliers_correct integer NOT NULL CHECK (suppliers_correct >= 0),
  suppliers_omitted integer NOT NULL CHECK (suppliers_omitted >= 0),
  suppliers_incorrect integer NOT NULL CHECK (suppliers_incorrect >= 0),
  tokens_input integer CHECK (tokens_input >= 0),
  tokens_output integer CHECK (tokens_output >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dev_quality_products_covered CHECK
    (products_exact + products_omitted <= products_expected),
  CONSTRAINT dev_quality_suppliers_covered CHECK
    (suppliers_correct + suppliers_omitted <= suppliers_expected)
);
ALTER TABLE public.dev_ia_quality_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dev_ia_quality_results FROM PUBLIC, anon, authenticated;
GRANT INSERT, SELECT ON public.dev_ia_quality_results TO service_role;
COMMENT ON TABLE public.dev_ia_quality_results IS
  'Cotironda DEV only. Numeric benchmark outcome per one-time case. No client data.';
