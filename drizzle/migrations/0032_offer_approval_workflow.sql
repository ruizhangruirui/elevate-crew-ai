CREATE TABLE public.offer_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), candidate_id uuid NOT NULL UNIQUE REFERENCES public.candidates(id),
 role_id uuid NOT NULL REFERENCES public.roles(id), org_node_id text REFERENCES public.org_nodes(id), lab_id text REFERENCES public.org_nodes(id),
 recruiter_user_id uuid NOT NULL REFERENCES public.app_users(id), hiring_manager_user_id uuid REFERENCES public.app_users(id),
 lab_director_user_id uuid REFERENCES public.app_users(id), hrd_user_id uuid REFERENCES public.app_users(id),
 terms jsonb NOT NULL DEFAULT '{}'::jsonb, state text NOT NULL DEFAULT 'draft', revision integer NOT NULL DEFAULT 1, round integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.offer_requests TO service_role;
ALTER TABLE public.offer_requests ENABLE ROW LEVEL SECURITY;
CREATE INDEX offer_requests_lab_state ON public.offer_requests(lab_id,state,updated_at);
CREATE TABLE public.offer_request_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), offer_id uuid NOT NULL REFERENCES public.offer_requests(id), revision integer NOT NULL,
 round integer NOT NULL, actor_user_id uuid NOT NULL, actor_name text NOT NULL, kind text NOT NULL, from_state text, to_state text,
 changes jsonb NOT NULL DEFAULT '{}'::jsonb, terms_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, note text,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.offer_request_events TO service_role;
ALTER TABLE public.offer_request_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX offer_request_events_order ON public.offer_request_events(offer_id,revision);
ALTER TABLE public.candidates ADD COLUMN offer_request_id uuid REFERENCES public.offer_requests(id);
ALTER TABLE public.people ADD COLUMN contract_duration_months integer;
ALTER TABLE public.people ADD COLUMN project_code text;
ALTER TABLE public.people ADD COLUMN approved_offer_id uuid REFERENCES public.offer_requests(id);

CREATE OR REPLACE FUNCTION public.offer_events_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Offer audit records cannot be changed or deleted'; END;
$$;
CREATE TRIGGER offer_events_immutable BEFORE UPDATE OR DELETE ON public.offer_request_events FOR EACH ROW EXECUTE FUNCTION public.offer_events_immutable();

CREATE OR REPLACE FUNCTION public.offer_candidate_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF current_setting('app.offer_workflow',true) = 'yes' THEN RETURN NEW; END IF;
 IF TG_OP = 'INSERT' THEN
   IF NEW.offer_request_id IS NOT NULL THEN RAISE EXCEPTION 'Use the Offer workflow'; END IF;
   RETURN NEW;
 END IF;
 IF NEW.offer_request_id IS DISTINCT FROM OLD.offer_request_id THEN RAISE EXCEPTION 'Use the Offer workflow'; END IF;
 IF OLD.offer_request_id IS NOT NULL AND (NEW.stage IS DISTINCT FROM OLD.stage OR NEW.outcome IS DISTINCT FROM OLD.outcome OR NEW.onboarding_on IS DISTINCT FROM OLD.onboarding_on OR NEW.contract_type IS DISTINCT FROM OLD.contract_type OR NEW.name IS DISTINCT FROM OLD.name OR NEW.role_id IS DISTINCT FROM OLD.role_id OR NEW.person_id IS DISTINCT FROM OLD.person_id OR NEW.next_step IS DISTINCT FROM OLD.next_step) THEN
   RAISE EXCEPTION 'Offer candidate terms and progression are managed by the Offer workflow';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER offer_candidate_guard BEFORE INSERT OR UPDATE ON public.candidates FOR EACH ROW EXECUTE FUNCTION public.offer_candidate_guard();

CREATE OR REPLACE FUNCTION public.mutate_offer_request(p_actor uuid, p_candidate uuid, p_expected integer, p_command text, p_payload jsonb DEFAULT '{}'::jsonb, p_note text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u public.app_users; c public.candidates; o public.offer_requests; prev public.offer_requests; target text; delta jsonb := '{}'::jsonb; k text; v jsonb; approver uuid; role_row public.roles; lab text; node text; parent text; node_type text;
BEGIN
 SELECT * INTO u FROM public.app_users WHERE id=p_actor AND status='active';
 IF u.id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 SELECT * INTO c FROM public.candidates WHERE id=p_candidate FOR UPDATE;
 IF c.id IS NULL THEN RAISE EXCEPTION 'Candidate not found'; END IF;
 SELECT * INTO o FROM public.offer_requests WHERE candidate_id=c.id FOR UPDATE;
 PERFORM set_config('app.offer_workflow','yes',true);
 IF o.id IS NULL THEN
   IF p_command <> 'create' OR u.role <> 'recruiter' OR c.outcome IN ('hired','rejected','withdrawn') THEN RAISE EXCEPTION 'Only a recruiter can start an active offer'; END IF;
   SELECT * INTO role_row FROM public.roles WHERE id=c.role_id AND NOT archived AND approval_status <> 'pending';
   IF role_row.id IS NULL THEN RAISE EXCEPTION 'Position unavailable or not approved'; END IF;
   IF role_row.recruiter_person_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.people p WHERE p.id=role_row.recruiter_person_id AND NOT p.archived AND (lower(p.company_email)=lower(u.email) OR (coalesce(p.company_email,'')='' AND p.name=u.name))) THEN RAISE EXCEPTION 'Only the position recruiter can create this offer'; END IF;
   node:=role_row.org_node_id;
   WHILE node IS NOT NULL LOOP
     SELECT parent_id,type INTO parent,node_type FROM public.org_nodes WHERE id=node;
     IF lower(node_type)='lab' THEN lab:=node; EXIT; END IF;
     node:=parent;
   END LOOP;
   IF lab IS NULL THEN RAISE EXCEPTION 'Position needs a Lab'; END IF;
   INSERT INTO public.offer_requests(candidate_id,role_id,org_node_id,lab_id,recruiter_user_id,terms) VALUES(c.id,c.role_id,role_row.org_node_id,lab,u.id,p_payload->'terms') RETURNING * INTO o;
   UPDATE public.candidates SET offer_request_id=o.id,stage='Offer approval',outcome='active',next_step='Offer approval',updated_at=now() WHERE id=c.id;
   INSERT INTO public.offer_request_events(offer_id,revision,round,actor_user_id,actor_name,kind,to_state,terms_snapshot,changes) VALUES(o.id,o.revision,o.round,u.id,u.name,'create',o.state,o.terms,jsonb_build_object('terms',jsonb_build_object('before',null,'after',o.terms)));
   RETURN o.id;
 END IF;
 IF o.revision <> p_expected THEN RAISE EXCEPTION 'Offer changed; refresh and try again'; END IF;
 prev:=o;
 target:=o.state;
 IF p_command IN ('save','submit','sent','accepted') AND (o.recruiter_user_id<>u.id OR u.role<>'recruiter') THEN RAISE EXCEPTION 'Only the assigned recruiter can maintain offer terms'; END IF;
 IF p_command IN ('save','submit') THEN
   IF o.state IN ('accepted','onboarded') THEN RAISE EXCEPTION 'Accepted offer cannot be revised'; END IF;
   o.terms:=p_payload->'terms';
   o.hiring_manager_user_id:=nullif(p_payload->>'hiring_manager_user_id','')::uuid;
   o.lab_director_user_id:=nullif(p_payload->>'lab_director_user_id','')::uuid;
   o.hrd_user_id:=nullif(p_payload->>'hrd_user_id','')::uuid;
   IF p_command='submit' THEN
     IF o.hiring_manager_user_id IS NULL OR o.lab_director_user_id IS NULL OR o.hrd_user_id IS NULL THEN RAISE EXCEPTION 'Choose all approvers'; END IF;
     IF NOT EXISTS(SELECT 1 FROM public.app_users WHERE id=o.hiring_manager_user_id AND role='manager' AND status='active') OR NOT EXISTS(SELECT 1 FROM public.app_users WHERE id=o.lab_director_user_id AND role='manager' AND status='active') OR NOT EXISTS(SELECT 1 FROM public.app_users WHERE id=o.hrd_user_id AND role='hr_director' AND status='active') THEN RAISE EXCEPTION 'Approvers must have eligible active accounts'; END IF;
     o.round:=o.round+1; target:='hiring_manager';
   ELSE target:='draft'; END IF;
 ELSIF p_command IN ('approve','reject') THEN
   approver:=CASE o.state WHEN 'hiring_manager' THEN o.hiring_manager_user_id WHEN 'lab_director' THEN o.lab_director_user_id WHEN 'hrd' THEN o.hrd_user_id ELSE NULL END;
   IF approver IS NULL OR approver<>u.id THEN RAISE EXCEPTION 'Only the current named approver can decide'; END IF;
   IF (o.state IN ('hiring_manager','lab_director') AND u.role<>'manager') OR (o.state='hrd' AND u.role<>'hr_director') THEN RAISE EXCEPTION 'Approver role no longer eligible'; END IF;
   IF p_command='reject' THEN
     IF trim(p_note)='' THEN RAISE EXCEPTION 'Enter a rejection reason'; END IF;
     target:='rejected';
   ELSE target:=CASE o.state WHEN 'hiring_manager' THEN 'lab_director' WHEN 'lab_director' THEN 'hrd' WHEN 'hrd' THEN 'approved' END;
   END IF;
 ELSIF p_command='sent' THEN
   IF o.state<>'approved' THEN RAISE EXCEPTION 'All approvals are required before sending'; END IF; target:='sent';
 ELSIF p_command='accepted' THEN
   IF o.state<>'sent' THEN RAISE EXCEPTION 'Record offer sent before acceptance'; END IF; target:='accepted';
 ELSE RAISE EXCEPTION 'Invalid offer operation'; END IF;
 FOR k,v IN SELECT * FROM jsonb_each(o.terms) LOOP
   IF v IS DISTINCT FROM prev.terms->k THEN delta:=delta||jsonb_build_object(k,jsonb_build_object('before',prev.terms->k,'after',v)); END IF;
 END LOOP;
 IF o.hiring_manager_user_id IS DISTINCT FROM prev.hiring_manager_user_id THEN delta:=delta||jsonb_build_object('hiring_manager_user_id',jsonb_build_object('before',prev.hiring_manager_user_id,'after',o.hiring_manager_user_id)); END IF;
 IF o.lab_director_user_id IS DISTINCT FROM prev.lab_director_user_id THEN delta:=delta||jsonb_build_object('lab_director_user_id',jsonb_build_object('before',prev.lab_director_user_id,'after',o.lab_director_user_id)); END IF;
 IF o.hrd_user_id IS DISTINCT FROM prev.hrd_user_id THEN delta:=delta||jsonb_build_object('hrd_user_id',jsonb_build_object('before',prev.hrd_user_id,'after',o.hrd_user_id)); END IF;
 UPDATE public.offer_requests SET terms=o.terms,hiring_manager_user_id=o.hiring_manager_user_id,lab_director_user_id=o.lab_director_user_id,hrd_user_id=o.hrd_user_id,state=target,round=o.round,revision=o.revision+1,updated_at=now() WHERE id=o.id RETURNING * INTO o;
 INSERT INTO public.offer_request_events(offer_id,revision,round,actor_user_id,actor_name,kind,from_state,to_state,changes,terms_snapshot,note) VALUES(o.id,o.revision,o.round,u.id,u.name,p_command,prev.state,o.state,delta,o.terms,nullif(trim(p_note),''));
 UPDATE public.actions SET status='done',completed_at=now(),updated_at=now() WHERE source_kind='offer_approval' AND source_key=o.id::text AND status IN ('todo','doing');
 approver:=CASE target WHEN 'hiring_manager' THEN o.hiring_manager_user_id WHEN 'lab_director' THEN o.lab_director_user_id WHEN 'hrd' THEN o.hrd_user_id WHEN 'approved' THEN o.recruiter_user_id WHEN 'rejected' THEN o.recruiter_user_id ELSE NULL END;
 IF approver IS NOT NULL THEN
   INSERT INTO public.actions(title,detail,source_kind,source_key,role_id,org_node_id,owner,priority,status) SELECT 'Offer · '||c.name||' · '||target,'Offer round '||o.round,'offer_approval',o.id::text,o.role_id,o.org_node_id,name,'high','todo' FROM public.app_users WHERE id=approver;
 END IF;
 UPDATE public.candidates SET stage=CASE WHEN target IN ('sent','accepted') THEN CASE WHEN target='sent' THEN 'Offer sent' ELSE 'Offer accepted' END ELSE 'Offer approval' END,
 outcome=CASE WHEN target='accepted' THEN 'to_onboard' ELSE 'active' END,
 onboarding_on=CASE WHEN target='accepted' THEN (o.terms->>'start_date')::date ELSE NULL END,
 name=o.terms->>'candidate_name',contract_type=o.terms->>'contract_type',next_step=CASE target WHEN 'approved' THEN 'Send offer' WHEN 'sent' THEN 'Await acceptance' WHEN 'accepted' THEN 'Onboarding' WHEN 'rejected' THEN 'Revise offer' ELSE 'Offer approval' END, updated_at=now() WHERE id=c.id;
 RETURN o.id;
END; $$;
REVOKE ALL ON FUNCTION public.mutate_offer_request(uuid,uuid,integer,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_offer_request(uuid,uuid,integer,text,jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION public.onboard_accepted_offer(p_offer uuid, p_today date) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.offer_requests; c public.candidates; pid uuid; org uuid; terms jsonb; rid uuid;
BEGIN
 SELECT candidate_id INTO rid FROM public.offer_requests WHERE id=p_offer;
 SELECT * INTO c FROM public.candidates WHERE id=rid FOR UPDATE;
 SELECT * INTO o FROM public.offer_requests WHERE id=p_offer FOR UPDATE;
 IF o.state<>'accepted' OR c.outcome<>'to_onboard' OR (o.terms->>'start_date')::date>p_today THEN RETURN false; END IF;
 terms:=o.terms;
 pid:=c.person_id;
 IF pid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.people WHERE id=pid AND NOT archived AND status<>'left') THEN RAISE EXCEPTION 'Linked person is unavailable'; END IF;
 IF pid IS NULL THEN
   SELECT d.org_id INTO org FROM public.roles r JOIN public.directions d ON d.id=r.direction_id WHERE r.id=o.role_id;
   INSERT INTO public.people(org_id,name,status,role_id,org_node_id,hire_date,offer_title,appointed_role_title,level,contract_type,fixed_term,contract_end_on,contract_duration_months,supervisor_id,workload_pct,project_code,approved_offer_id,personal_email)
   SELECT org,terms->>'candidate_name','onboard',o.role_id,o.org_node_id,(terms->>'start_date')::date,terms->>'job_title',r.title,(terms->>'job_level')::integer,terms->>'contract_type',terms->>'contract_term'='fixed_term',nullif(terms->>'end_date','')::date,nullif(terms->>'duration_months','')::integer,nullif(terms->>'supervisor_id','')::uuid,(terms->>'workload')::integer,terms->>'project_code',o.id,c.email FROM public.roles r WHERE r.id=o.role_id RETURNING id INTO pid;
 ELSE
   UPDATE public.people SET status='onboard',hire_date=coalesce(hire_date,(terms->>'start_date')::date),offer_title=terms->>'job_title',level=(terms->>'job_level')::integer,contract_type=terms->>'contract_type',fixed_term=terms->>'contract_term'='fixed_term',contract_end_on=nullif(terms->>'end_date','')::date,contract_duration_months=nullif(terms->>'duration_months','')::integer,supervisor_id=nullif(terms->>'supervisor_id','')::uuid,workload_pct=(terms->>'workload')::integer,project_code=terms->>'project_code',approved_offer_id=o.id,role_id=o.role_id,org_node_id=o.org_node_id,updated_at=now() WHERE id=pid;
 END IF;
 PERFORM set_config('app.offer_workflow','yes',true);
 UPDATE public.candidates SET person_id=pid,outcome='hired',next_step='Onboarded',updated_at=now() WHERE id=c.id;
 UPDATE public.offer_requests SET state='onboarded',revision=revision+1,updated_at=now() WHERE id=o.id;
 INSERT INTO public.offer_request_events(offer_id,revision,round,actor_user_id,actor_name,kind,from_state,to_state,terms_snapshot) VALUES(o.id,o.revision+1,o.round,o.recruiter_user_id,'system','onboard',o.state,'onboarded',o.terms);
 INSERT INTO public.candidate_events(candidate_id,kind,outcome,actor,note,happened_on) VALUES(c.id,'outcome','hired','system','Approved offer auto-onboarded on start date',p_today);
 INSERT INTO public.audit_log(actor,action,entity,detail,person_id) VALUES('system','auto_onboard','candidate',c.name,pid);
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.onboard_accepted_offer(uuid,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.onboard_accepted_offer(uuid,date) TO service_role;
