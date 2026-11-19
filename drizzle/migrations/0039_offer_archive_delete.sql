ALTER TABLE public.offer_requests ADD COLUMN archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.offer_requests ADD COLUMN archived_at timestamptz;

CREATE OR REPLACE FUNCTION public.offer_events_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF TG_OP = 'DELETE' AND current_setting('app.offer_delete',true) = 'yes' THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'Offer audit records cannot be changed or deleted';
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_offer_request(p_actor uuid, p_offer uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u public.app_users; o public.offer_requests; back_stage text;
BEGIN
 SELECT * INTO u FROM public.app_users WHERE id=p_actor AND status='active';
 IF u.id IS NULL OR u.role NOT IN ('owner','hr_director') THEN RAISE EXCEPTION 'Only the Owner can delete offers'; END IF;
 SELECT * INTO o FROM public.offer_requests WHERE id=p_offer FOR UPDATE;
 IF o.id IS NULL THEN RAISE EXCEPTION 'Offer not found'; END IF;
 PERFORM set_config('app.offer_workflow','yes',true);
 PERFORM set_config('app.offer_delete','yes',true);
 SELECT e.stage INTO back_stage FROM public.candidate_events e WHERE e.candidate_id=o.candidate_id AND e.kind='stage' AND e.stage IS NOT NULL AND e.stage NOT IN ('Offer approval','Offer sent','Offer accepted') ORDER BY e.created_at DESC LIMIT 1;
 UPDATE public.candidates SET offer_request_id=NULL,
   stage=CASE WHEN outcome='hired' THEN stage ELSE back_stage END,
   outcome=CASE WHEN outcome='hired' THEN outcome ELSE 'active' END,
   onboarding_on=CASE WHEN outcome='hired' THEN onboarding_on ELSE NULL END,
   next_step=CASE WHEN outcome='hired' THEN next_step ELSE NULL END,
   updated_at=now()
 WHERE offer_request_id=o.id;
 UPDATE public.people SET approved_offer_id=NULL WHERE approved_offer_id=o.id;
 DELETE FROM public.actions WHERE source_kind='offer_approval' AND source_key=o.id::text;
 DELETE FROM public.offer_request_events WHERE offer_id=o.id;
 DELETE FROM public.offer_requests WHERE id=o.id;
 INSERT INTO public.audit_log(actor,action,entity,detail) VALUES(u.name,'delete','offer_request',coalesce(o.terms->>'candidate_name','')||' · '||o.id::text);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_offer_request(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_offer_request(uuid,uuid) TO service_role;
GRANT DELETE ON public.offer_request_events TO service_role;