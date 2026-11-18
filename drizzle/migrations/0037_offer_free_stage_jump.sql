CREATE OR REPLACE FUNCTION public.mutate_offer_request(p_actor uuid, p_candidate uuid, p_expected integer, p_command text, p_payload jsonb DEFAULT '{}'::jsonb, p_note text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u public.app_users; c public.candidates; o public.offer_requests; prev public.offer_requests; target text; back_stage text; delta jsonb := '{}'::jsonb; k text; v jsonb; approver uuid; role_row public.roles; lab text; node text; parent text; node_type text;
BEGIN
 SELECT * INTO u FROM public.app_users WHERE id=p_actor AND status='active';
 IF u.id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 SELECT * INTO c FROM public.candidates WHERE id=p_candidate FOR UPDATE;
 IF c.id IS NULL THEN RAISE EXCEPTION 'Candidate not found'; END IF;
 SELECT * INTO o FROM public.offer_requests WHERE candidate_id=c.id FOR UPDATE;
 PERFORM set_config('app.offer_workflow','yes',true);
 IF o.id IS NULL OR (o.state='withdrawn' AND p_command='create') THEN
   IF p_command <> 'create' OR u.role NOT IN ('recruiter','owner','hr_director') OR c.outcome IN ('hired','rejected','withdrawn') THEN RAISE EXCEPTION 'Only a recruiter can start an active offer'; END IF;
   SELECT * INTO role_row FROM public.roles WHERE id=c.role_id AND NOT archived AND approval_status <> 'pending';
   IF role_row.id IS NULL THEN RAISE EXCEPTION 'Position unavailable or not approved'; END IF;
   IF u.role = 'recruiter' AND role_row.recruiter_person_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.people p WHERE p.id=role_row.recruiter_person_id AND NOT p.archived AND (lower(p.company_email)=lower(u.email) OR (coalesce(p.company_email,'')='' AND p.name=u.name))) THEN RAISE EXCEPTION 'Only the position recruiter can create this offer'; END IF;
   node:=role_row.org_node_id;
   WHILE node IS NOT NULL LOOP
     SELECT parent_id,type INTO parent,node_type FROM public.org_nodes WHERE id=node;
     IF lower(node_type)='lab' THEN lab:=node; EXIT; END IF;
     node:=parent;
   END LOOP;
   IF lab IS NULL THEN RAISE EXCEPTION 'Position needs a Lab'; END IF;
   IF o.id IS NULL THEN
     INSERT INTO public.offer_requests(candidate_id,role_id,org_node_id,lab_id,recruiter_user_id,terms) VALUES(c.id,c.role_id,role_row.org_node_id,lab,u.id,p_payload->'terms') RETURNING * INTO o;
   ELSE
     UPDATE public.offer_requests SET role_id=c.role_id,org_node_id=role_row.org_node_id,lab_id=lab,recruiter_user_id=u.id,terms=coalesce(p_payload->'terms',o.terms),state='draft',revision=o.revision+1,updated_at=now() WHERE id=o.id RETURNING * INTO o;
   END IF;
   UPDATE public.candidates SET offer_request_id=o.id,stage='Offer approval',outcome='active',next_step='Offer approval',updated_at=now() WHERE id=c.id;
   INSERT INTO public.offer_request_events(offer_id,revision,round,actor_user_id,actor_name,kind,to_state,terms_snapshot,changes) VALUES(o.id,o.revision,o.round,u.id,u.name,'create',o.state,o.terms,jsonb_build_object('terms',jsonb_build_object('before',null,'after',o.terms)));
   RETURN o.id;
 END IF;
 IF o.revision <> p_expected THEN RAISE EXCEPTION 'Offer changed; refresh and try again'; END IF;
 prev:=o;
 target:=o.state;
 IF p_command IN ('save','submit','sent','accepted') AND u.role NOT IN ('owner','hr_director') AND (o.recruiter_user_id<>u.id OR u.role<>'recruiter') THEN RAISE EXCEPTION 'Only the assigned recruiter can maintain offer terms'; END IF;
 IF p_command IN ('save','submit') THEN
   IF o.state IN ('accepted','onboarded','withdrawn') THEN RAISE EXCEPTION 'Accepted offer cannot be revised'; END IF;
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
 ELSIF p_command='set_stage' THEN
   IF o.state IN ('onboarded','withdrawn') THEN RAISE EXCEPTION 'This offer can no longer change stage'; END IF;
   IF u.role NOT IN ('owner','hr_director') AND (o.recruiter_user_id<>u.id OR u.role<>'recruiter') THEN RAISE EXCEPTION 'Only the assigned recruiter can change the offer stage'; END IF;
   target:=CASE p_payload->>'stage'
     WHEN 'Offer approval' THEN CASE WHEN o.state IN ('draft','hiring_manager','lab_director','hrd','rejected','approved') THEN o.state ELSE 'draft' END
     WHEN 'Offer sent' THEN 'sent' WHEN 'Offer accepted' THEN 'accepted' ELSE NULL END;
   IF target IS NULL THEN RAISE EXCEPTION 'Invalid offer stage'; END IF;
 ELSIF p_command='withdraw' THEN
   IF o.state IN ('accepted','onboarded','withdrawn') THEN RAISE EXCEPTION 'This offer can no longer be withdrawn'; END IF;
   IF u.role NOT IN ('owner','hr_director') AND (o.recruiter_user_id<>u.id OR u.role<>'recruiter') THEN RAISE EXCEPTION 'Only the assigned recruiter can withdraw this offer'; END IF;
   target:='withdrawn';
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
 IF target='withdrawn' THEN
   SELECT e.stage INTO back_stage FROM public.candidate_events e WHERE e.candidate_id=c.id AND e.kind='stage' AND e.stage IS NOT NULL AND e.stage NOT IN ('Offer approval','Offer sent','Offer accepted') ORDER BY e.created_at DESC LIMIT 1;
   UPDATE public.candidates SET offer_request_id=NULL,stage=back_stage,outcome='active',onboarding_on=NULL,next_step=NULL,updated_at=now() WHERE id=c.id;
   INSERT INTO public.candidate_events(candidate_id,kind,stage,actor,note) VALUES(c.id,'stage',back_stage,u.name,'Offer approval withdrawn');
   RETURN o.id;
 END IF;
 UPDATE public.candidates SET stage=CASE WHEN target IN ('sent','accepted') THEN CASE WHEN target='sent' THEN 'Offer sent' ELSE 'Offer accepted' END ELSE 'Offer approval' END,
 outcome=CASE WHEN target='accepted' THEN 'to_onboard' ELSE 'active' END,
 onboarding_on=CASE WHEN target='accepted' THEN nullif(o.terms->>'start_date','')::date ELSE NULL END,
 name=o.terms->>'candidate_name',contract_type=o.terms->>'contract_type',next_step=CASE target WHEN 'approved' THEN 'Send offer' WHEN 'sent' THEN 'Await acceptance' WHEN 'accepted' THEN 'Onboarding' WHEN 'rejected' THEN 'Revise offer' ELSE 'Offer approval' END, updated_at=now() WHERE id=c.id;
 RETURN o.id;
END; $$;