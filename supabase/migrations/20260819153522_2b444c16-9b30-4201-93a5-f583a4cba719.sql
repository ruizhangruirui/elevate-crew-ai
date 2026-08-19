CREATE TABLE public.org_nodes (
  id text PRIMARY KEY,
  parent_id text REFERENCES public.org_nodes(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'Team',
  mission text,
  archived boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_nodes TO authenticated;
GRANT ALL ON public.org_nodes TO service_role;
ALTER TABLE public.org_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_nodes readable by authenticated" ON public.org_nodes FOR SELECT TO authenticated USING (true);
CREATE POLICY "org_nodes writable by authenticated" ON public.org_nodes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.config_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.config_items TO authenticated;
GRANT ALL ON public.config_items TO service_role;
ALTER TABLE public.config_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "config_items readable by authenticated" ON public.config_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "config_items writable by authenticated" ON public.config_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.access_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role_label text NOT NULL,
  scope text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'Active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_users TO authenticated;
GRANT ALL ON public.access_users TO service_role;
ALTER TABLE public.access_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "access_users readable by authenticated" ON public.access_users FOR SELECT TO authenticated USING (true);
CREATE POLICY "access_users writable by authenticated" ON public.access_users FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor text NOT NULL DEFAULT 'System Owner',
  action text NOT NULL,
  entity text,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_log readable by authenticated" ON public.audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "audit_log insertable by authenticated" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_org_nodes_updated_at BEFORE UPDATE ON public.org_nodes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_config_items_updated_at BEFORE UPDATE ON public.config_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_access_users_updated_at BEFORE UPDATE ON public.access_users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.org_nodes (id, parent_id, name, type, mission, sort_order) VALUES
  ('vnrc', NULL, 'VNRC', 'Research Center', '建立下一代 AI 计算、NPU 与 Agentic AI 系统的核心研究能力，并形成稳定的专家和技术领导梯队。', 0),
  ('lab-network', 'vnrc', 'Network Lab', 'Lab', '面向 Agentic Computing 建立 NPU、AI 系统与编译协同能力。', 1),
  ('lab-architecture', 'vnrc', 'Architecture Lab', 'Lab', '沉淀系统架构、芯片架构和关键技术决策能力。', 2),
  ('team-npu', 'lab-network', 'Agentic / NPU Team', 'Team', '下一代 Agentic NPU 架构与性能研究。', 1),
  ('team-agentic-ai', 'lab-network', 'Agentic AI Team', 'Team', 'Agent Runtime、可靠性与端到端系统架构。', 2),
  ('team-compiler', 'lab-network', 'Compiler Team', 'Team', 'AI Compiler、Runtime 与硬件感知编译。', 3),
  ('team-system-arch', 'lab-architecture', 'System Architecture Team', 'Team', '跨模块系统架构和重大技术决策。', 1);

INSERT INTO public.config_items (category, name, active, sort_order) VALUES
  ('tags', 'Key Talent', true, 1), ('tags', 'Successor', true, 2), ('tags', 'High Potential', true, 3), ('tags', 'Flight Risk', true, 4),
  ('awards', 'Research Excellence', true, 1), ('awards', 'Patent Award', true, 2), ('awards', 'Team Impact', true, 3),
  ('criticalities', 'Strategic Critical', true, 1), ('criticalities', 'Critical', true, 2), ('criticalities', 'Important', true, 3),
  ('coverageStatuses', 'Fully Covered', true, 1), ('coverageStatuses', 'Partially Covered', true, 2), ('coverageStatuses', 'Not Covered', true, 3),
  ('readiness', 'Ready Now', true, 1), ('readiness', 'Ready in 1-2 Years', true, 2), ('readiness', 'Long Term', true, 3),
  ('futureRoleRelationships', 'Successor', true, 1), ('futureRoleRelationships', 'Development Target', true, 2),
  ('riskTypes', 'Single Point of Failure', true, 1), ('riskTypes', 'Retention Risk', true, 2), ('riskTypes', 'Capability Gap', true, 3),
  ('talentRecordTypes', 'Manager Record', true, 1), ('talentRecordTypes', 'HRBP Insight', true, 2),
  ('actionTypes', 'Develop', true, 1), ('actionTypes', 'Hire', true, 2), ('actionTypes', 'Retain', true, 3),
  ('activityTypes', 'Talent Review', true, 1), ('activityTypes', 'Calibration', true, 2);

INSERT INTO public.access_users (name, role_label, scope, status) VALUES
  ('Rui Zhang', 'System Owner', ARRAY['VNRC'], 'Active'),
  ('Nora Fischer', 'Lab Manager', ARRAY['Network Lab'], 'Active'),
  ('Daniel Smith', 'HRBP', ARRAY['Network Lab','Architecture Lab'], 'Active'),
  ('Sofia Rossi', 'Viewer', ARRAY['VNRC'], 'Inactive');

INSERT INTO public.audit_log (actor, action, entity, detail) VALUES
  ('System Owner', 'Create', '组织结构', '初始化 VNRC / Lab / Team 结构'),
  ('System Owner', 'Create', '人才配置', '导入默认标签、奖项与关键性配置');