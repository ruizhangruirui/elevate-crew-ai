CREATE TABLE public.orgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tagline text,
  description text,
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.directions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction_id uuid NOT NULL REFERENCES public.directions(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  level_min int NOT NULL DEFAULT 14,
  level_max int NOT NULL DEFAULT 16,
  target_count int NOT NULL DEFAULT 1,
  criticality text NOT NULL DEFAULT 'important',
  sort_order int NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  role_id uuid REFERENCES public.roles(id) ON DELETE SET NULL,
  name text NOT NULL,
  level int,
  status text NOT NULL DEFAULT 'onboard',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orgs TO authenticated;
GRANT ALL ON public.orgs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.directions TO authenticated;
GRANT ALL ON public.directions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roles TO authenticated;
GRANT ALL ON public.roles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people TO authenticated;
GRANT ALL ON public.people TO service_role;

ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.directions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orgs_all_authenticated" ON public.orgs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "directions_all_authenticated" ON public.directions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "roles_all_authenticated" ON public.roles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "people_all_authenticated" ON public.people FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER orgs_touch BEFORE UPDATE ON public.orgs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER directions_touch BEFORE UPDATE ON public.directions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER roles_touch BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER people_touch BEFORE UPDATE ON public.people FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.orgs (id, name, tagline, description, tags) VALUES
('11111111-1111-1111-1111-111111111111', 'Network Lab', '战略组织', '面向 Agentic Computing 建立 NPU、AI 系统与编译协同能力。', ARRAY['Agentic Computing','下一代 AI 芯片']);

INSERT INTO public.directions (id, org_id, title, description, sort_order) VALUES
('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111111', '下一代 Agentic NPU 架构研究', '面向 Agentic workload 建立下一代 NPU 架构、性能与软硬件协同研究能力。', 1),
('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111111', 'Agentic AI 系统架构研究', '研究 Agentic AI 系统端到端架构、Agent Runtime、系统可靠性与跨模块协同。', 2),
('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111111', 'Compiler–NPU 协同方向', '研究 AI Compiler、Runtime 与 NPU 之间的架构协同和硬件感知编译。', 3);

INSERT INTO public.roles (id, direction_id, title, description, level_min, level_max, target_count, criticality, sort_order) VALUES
('33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222201', '首席 NPU 架构专家', '定义下一代 Agentic NPU 架构方向，承担关键架构决策和专家梯队建设。', 18, 19, 1, 'strategic_critical', 1),
('33333333-3333-3333-3333-333333333302', '22222222-2222-2222-2222-222222222201', '高级 NPU 架构专家', '承担关键 NPU 子系统架构设计，并形成可复制的模块 ownership。', 16, 17, 2, 'critical', 2),
('33333333-3333-3333-3333-333333333303', '22222222-2222-2222-2222-222222222201', '核心 NPU 研究人才', '支撑 NPU 架构研究、实验验证与长期技术积累。', 14, 16, 3, 'important', 3),
('33333333-3333-3333-3333-333333333304', '22222222-2222-2222-2222-222222222202', 'Agentic 系统架构师', '负责 Agent Runtime 与端到端系统架构设计，保障系统可靠性。', 16, 18, 1, 'critical', 1),
('33333333-3333-3333-3333-333333333305', '22222222-2222-2222-2222-222222222203', 'AI Compiler 架构专家', '负责硬件感知编译策略与 Compiler–NPU 接口设计。', 15, 17, 1, 'important', 1);

INSERT INTO public.people (org_id, role_id, name, level, status, note) VALUES
('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333301', '陈临舟', 18, 'onboard', '架构决策核心，专家梯队负责人'),
('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333302', '沈亦白', 16, 'onboard', 'Memory 子系统 ownership'),
('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333303', '林知远', 15, 'onboard', '性能建模'),
('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333303', '苏禾', 14, 'onboard', '实验验证'),
('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333303', '周斯年', 16, 'onboard', '长期技术积累方向'),
('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333305', '祁明', 15, 'onboard', 'Compiler 接口设计'),
('11111111-1111-1111-1111-111111111111', NULL, '罗晚', 17, 'candidate', '候选：Agentic 系统架构师');