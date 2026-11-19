CREATE OR REPLACE FUNCTION public.offer_candidate_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF current_setting('app.offer_workflow',true) = 'yes' THEN RETURN NEW; END IF;
 IF TG_OP = 'INSERT' THEN
   IF NEW.offer_request_id IS NOT NULL THEN RAISE EXCEPTION 'Use the Offer workflow'; END IF;
   RETURN NEW;
 END IF;
 IF NEW.offer_request_id IS DISTINCT FROM OLD.offer_request_id THEN RAISE EXCEPTION 'Use the Offer workflow'; END IF;
 RETURN NEW;
END; $$;