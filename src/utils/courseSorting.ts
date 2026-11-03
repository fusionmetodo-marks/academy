/**
 * Utilitário de ordenação para os Cursos da Money Building
 * Garante a progressão correta dos Níveis:
 * - Nível 1: Leitura de Preço Avançada
 * - Nível 2: Método Fusion
 * - Nível 3: Retração + Registro do Preço
 * - Nível 4: Cálculos Binários / Mentoria
 */

export function getCourseLevelOrder(course: { title?: string; order?: number }): number {
  if (typeof course.order === 'number' && course.order > 0) {
    return course.order;
  }

  const title = (course.title || '').trim().toLowerCase();

  // 1. Detecção direta de "Nível X" ou "Nivel X"
  const nivelMatch = title.match(/n[íi]vel\s*([0-9]+)/i);
  if (nivelMatch && nivelMatch[1]) {
    const num = parseInt(nivelMatch[1], 10);
    if (!isNaN(num)) return num;
  }

  // 2. Mapeamento por palavras-chave definidas pelo utilizador
  // Nível 1: leitura de preço avançada
  if (title.includes('leitura') && (title.includes('preço') || title.includes('preco'))) {
    return 1;
  }

  // Nível 2: método fusion
  if (title.includes('fusion')) {
    return 2;
  }

  // Nível 3: retração + registro do preço
  if (title.includes('retra') || title.includes('registro')) {
    return 3;
  }

  // Nível 4: cálculos binários / mentoria
  if (title.includes('cálculo') || title.includes('calculo') || title.includes('binári') || title.includes('binari')) {
    return 4;
  }

  return 99;
}

export function sortCoursesByLevel<T extends { title?: string; order?: number }>(courses: T[]): T[] {
  if (!Array.isArray(courses)) return [];

  return [...courses].sort((a, b) => {
    const orderA = getCourseLevelOrder(a);
    const orderB = getCourseLevelOrder(b);

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    // Desempate por título em ordem alfabética
    return (a.title || '').localeCompare(b.title || '');
  });
}
