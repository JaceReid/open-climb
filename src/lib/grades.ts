// Fontainebleau bouldering grades, easiest first. The index doubles as a
// numeric value so grades can be charted.
export const FONT_GRADES = [
  '3',
  '4',
  '4+',
  '5',
  '5+',
  '6A',
  '6A+',
  '6B',
  '6B+',
  '6C',
  '6C+',
  '7A',
  '7A+',
  '7B',
  '7B+',
  '7C',
  '7C+',
  '8A',
  '8A+',
  '8B',
  '8B+',
  '8C',
  '8C+',
  '9A',
] as const;

export function gradeIndex(grade: string | null | undefined): number {
  if (!grade) return -1;
  return FONT_GRADES.indexOf(grade.trim().toUpperCase() as (typeof FONT_GRADES)[number]);
}

export function maxGrade(grades: (string | null | undefined)[]): string | null {
  let best = -1;
  for (const g of grades) best = Math.max(best, gradeIndex(g));
  return best >= 0 ? FONT_GRADES[best] : null;
}
