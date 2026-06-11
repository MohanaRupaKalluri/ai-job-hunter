
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS work_mode text,
  ADD COLUMN IF NOT EXISTS raw_location text,
  ADD COLUMN IF NOT EXISTS matched_keywords text[];

CREATE INDEX IF NOT EXISTS idx_jobs_country ON public.jobs(country);
CREATE INDEX IF NOT EXISTS idx_jobs_work_mode ON public.jobs(work_mode);
