
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS resume_path text,
  ADD COLUMN IF NOT EXISTS resume_filename text,
  ADD COLUMN IF NOT EXISTS resume_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS resume_mime_type text,
  ADD COLUMN IF NOT EXISTS resume_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS resume_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS resume_error text,
  ADD COLUMN IF NOT EXISTS profile_resume_text text,
  ADD COLUMN IF NOT EXISTS resume_parsed_skills text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS resume_parsed_technologies text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS resume_parsed_certifications text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS resume_parsed_experience jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS resume_parsed_education jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS resume_parsed_years_experience numeric(4,1);

CREATE TABLE IF NOT EXISTS public.resume_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  filename text,
  size_bytes bigint,
  mime_type text,
  uploaded_at timestamptz,
  archived_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resume_archive TO authenticated;
GRANT ALL ON public.resume_archive TO service_role;

ALTER TABLE public.resume_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own resume archive" ON public.resume_archive
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
