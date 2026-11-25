/** Overall candidate score: JD fit weighs 40%, education/experience/skills/publications 15% each. */
export function candidateOverall(s: { jd_fit: number; education: number; experience: number; skills: number; publications: number }) {
  return Math.round(s.jd_fit * 0.4 + (s.education + s.experience + s.skills + s.publications) * 0.15);
}
