
-- Make set_updated_at a plain invoker function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Lock execute on definer trigger fn (only auth trigger needs it)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- Storage policies: users access only their own folder (path = "<uid>/...")
CREATE POLICY "resumes own read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "resumes own write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "resumes own update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "resumes own delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "docs own read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'generated-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "docs own write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'generated-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "docs own update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'generated-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "docs own delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'generated-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
