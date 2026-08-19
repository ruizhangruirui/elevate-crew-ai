UPDATE public.roles SET
  domains = ARRAY['NPU Architecture','AI Accelerator','Computer Architecture'],
  knowledge = ARRAY['Memory Systems','Transformer / LLM','Parallel Computing','AI Workload'],
  leadership = ARRAY['技术方向定义','重大架构决策','跨团队技术影响','高级人才培养'],
  experience = ARRAY['主导关键芯片 / 加速器架构项目','完整 Architecture Ownership','跨团队技术决策经验'],
  skills = '[{"skill":"NPU 微架构设计","level":"Expert"},{"skill":"Architecture Trade-off","level":"Expert"},{"skill":"Performance Modeling","level":"Advanced"},{"skill":"HW/SW Co-design","level":"Advanced"}]'::jsonb,
  kpa = '3 external mapped candidates',
  recommended_action = ARRAY['Develop John','Maintain external KPA','Build second-line succession']
WHERE id = '33333333-3333-3333-3333-333333333301';

UPDATE public.roles SET
  domains = ARRAY['NPU Architecture','Performance Modeling','AI Accelerator'],
  knowledge = ARRAY['Microarchitecture','Memory Hierarchy','Workload Analysis'],
  leadership = ARRAY['模块技术决策','跨团队协同','培养 Backup'],
  experience = ARRAY['独立负责架构模块','参与芯片架构评审','项目性能优化经验'],
  skills = '[{"skill":"NPU 子系统设计","level":"Advanced"},{"skill":"性能建模","level":"Advanced"},{"skill":"架构评审","level":"Advanced"}]'::jsonb,
  kpa = '2 external mapped candidates',
  recommended_action = ARRAY['Develop John','Hire one senior architect']
WHERE id = '33333333-3333-3333-3333-333333333302';

UPDATE public.roles SET
  domains = ARRAY['NPU Research','Architecture Evaluation'],
  knowledge = ARRAY['AI Workload','Simulation','Parallel Computing'],
  leadership = ARRAY['研究课题 owner','技术沉淀'],
  experience = ARRAY['参与 NPU 研究项目','有端到端实验验证经验'],
  skills = '[{"skill":"实验设计","level":"Advanced"},{"skill":"架构分析","level":"Advanced"},{"skill":"研究交付","level":"Working"}]'::jsonb,
  kpa = '1 external mapped candidate',
  recommended_action = ARRAY['Maintain internal pipeline']
WHERE id = '33333333-3333-3333-3333-333333333303';

UPDATE public.roles SET
  domains = ARRAY['Agent Runtime','Distributed AI Systems','Reliability'],
  knowledge = ARRAY['Agentic AI','System Architecture','Observability','Reliability Engineering'],
  leadership = ARRAY['系统架构定义','跨团队影响','复杂问题决策'],
  experience = ARRAY['主导大型 AI 系统架构','跨团队平台落地经验'],
  skills = '[{"skill":"Agent Runtime 架构","level":"Expert"},{"skill":"系统可靠性设计","level":"Advanced"},{"skill":"跨模块协同","level":"Advanced"}]'::jsonb,
  kpa = '4 external candidates',
  recommended_action = ARRAY['Develop Lisa','Maintain external KPA']
WHERE id = '33333333-3333-3333-3333-333333333304';

UPDATE public.roles SET
  domains = ARRAY['AI Compiler','Runtime','HW/SW Co-design'],
  knowledge = ARRAY['Compiler IR','Runtime Scheduling','NPU ISA'],
  leadership = ARRAY['编译架构路线','跨栈优化决策'],
  experience = ARRAY['负责 Compiler 架构项目','与芯片团队协作优化'],
  skills = '[{"skill":"硬件感知编译","level":"Expert"},{"skill":"Runtime 优化","level":"Advanced"},{"skill":"Compiler-NPU 协同","level":"Advanced"}]'::jsonb,
  kpa = '2 external mapped candidates',
  recommended_action = ARRAY['Close skill gap for Chen','Add external mapping']
WHERE id = '33333333-3333-3333-3333-333333333305';