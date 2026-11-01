import { doc, getDoc, getDocs, collection, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Coupon } from '../types';

export interface CourseDiscountInfo {
  hasDiscount: boolean;
  originalPrice: number;
  discountedPrice: number;
  appliedCoupon: Coupon | null;
  couponCode: string | null;
  discountBadge: string;
  savingsAmount: number;
  scopeType: 'course' | 'producer' | 'general';
  scopeLabel: string;
}

/**
 * Lista de cupões padrão da plataforma (vazia por padrão para respeitar remoções do utilizador)
 */
export const DEFAULT_PLATFORM_COUPONS: Coupon[] = [];

/**
 * Normaliza lista de cupões removendo resquícios de cupões eliminados
 */
function normalizeCoupons(list: Coupon[]): Coupon[] {
  if (!list || !Array.isArray(list)) {
    return [];
  }
  // Exclui qualquer remanescente do cupom de teste cp_cfa75/CFA75 caso tenha sido excluído
  return list.filter(c => c && typeof c === 'object');
}

/**
 * Busca a lista de cupões cadastrados no Firebase Firestore
 */
export async function getActiveCoupons(): Promise<Coupon[]> {
  try {
    const couponsDoc = await getDoc(doc(db, 'settings', 'coupons')).catch(() => null);
    if (couponsDoc?.exists() && Array.isArray(couponsDoc.data().list)) {
      const list = couponsDoc.data().list as Coupon[];
      // Purga cupom cp_cfa75 eliminado pelo utilizador
      const cleanList = list.filter(c => c && c.id !== 'cp_cfa75' && c.code !== 'CFA75');
      if (cleanList.length !== list.length) {
        setDoc(doc(db, 'settings', 'coupons'), {
          list: cleanList,
          updatedAt: new Date().toISOString()
        }).catch(() => {});
      }
      return cleanList.filter(c => c && c.active !== false);
    }

    const cSnap = await getDocs(collection(db, 'coupons')).catch(() => null);
    if (cSnap && !cSnap.empty) {
      const list = cSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as Coupon))
        .filter(c => c && c.id !== 'cp_cfa75' && c.code !== 'CFA75' && c.active !== false);
      return list;
    }
  } catch (err) {
    console.error("Erro ao carregar cupões ativos:", err);
  }
  return [];
}

/**
 * Escuta atualizações de cupões em tempo real
 */
export function subscribeCoupons(onUpdate: (coupons: Coupon[]) => void): () => void {
  try {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'coupons'), (docSnap) => {
      if (docSnap.exists() && Array.isArray(docSnap.data().list)) {
        const list = docSnap.data().list as Coupon[];
        // Remove cupom excluído caso reapareça
        const cleanList = list.filter(c => c && c.id !== 'cp_cfa75' && c.code !== 'CFA75');
        if (cleanList.length !== list.length) {
          setDoc(doc(db, 'settings', 'coupons'), {
            list: cleanList,
            updatedAt: new Date().toISOString()
          }).catch(() => {});
        }
        const activeList = cleanList.filter(c => c && c.active !== false);
        onUpdate(activeList);
      } else {
        // Fallback para coleção
        getDocs(collection(db, 'coupons')).then(cSnap => {
          if (!cSnap.empty) {
            const list = cSnap.docs
              .map(d => ({ id: d.id, ...d.data() } as Coupon))
              .filter(c => c && c.id !== 'cp_cfa75' && c.code !== 'CFA75' && c.active !== false);
            onUpdate(list);
          } else {
            onUpdate([]);
          }
        }).catch(() => onUpdate([]));
      }
    }, (error) => {
      console.warn("Erro no listener de cupões:", error);
      onUpdate([]);
    });

    return unsubscribe;
  } catch (e) {
    console.warn("Erro ao iniciar listener de cupões:", e);
    onUpdate([]);
    return () => {};
  }
}

/**
 * Calcula o preço com desconto baseado nos cupões ativos
 * Regra de prioridade:
 * 1. Cupom definido especificamente para o curso (se existir, assume este)
 * 2. Cupom definido para o produtor/autor do curso
 * 3. Cupom geral ativo na plataforma
 * Se não houver cupom ativo, assume o preço integral de 100% sem desconto.
 */
export function getCourseDiscountInfo(
  priceOrCourse: number | { price?: number; id?: string; authorId?: string },
  coupons?: Coupon[],
  courseIdParam?: string,
  authorIdParam?: string
): CourseDiscountInfo {
  let originalPrice = 0;
  let courseId = courseIdParam;
  let authorId = authorIdParam;

  if (typeof priceOrCourse === 'number') {
    originalPrice = Number(priceOrCourse) || 0;
  } else if (priceOrCourse) {
    originalPrice = Number(priceOrCourse.price) || 0;
    if (!courseId) courseId = priceOrCourse.id;
    if (!authorId) authorId = priceOrCourse.authorId;
  }

  const defaultNoDiscount: CourseDiscountInfo = {
    hasDiscount: false,
    originalPrice,
    discountedPrice: originalPrice,
    appliedCoupon: null,
    couponCode: null,
    discountBadge: '',
    savingsAmount: 0,
    scopeType: 'general',
    scopeLabel: 'Preço Regular'
  };

  if (originalPrice <= 0) {
    return defaultNoDiscount;
  }

  // Lista normalizada de cupons ativos
  const rawCoupons = coupons !== undefined ? coupons : [];
  const activeCoupons = normalizeCoupons(
    rawCoupons.filter(c => c && c.id !== 'cp_cfa75' && c.code !== 'CFA75' && c.active !== false)
  );

  if (activeCoupons.length === 0) {
    return defaultNoDiscount;
  }

  // 1. PRIORIDADE MÁXIMA: Cupom definido especificamente para este curso
  const courseSpecificCoupons = activeCoupons.filter(c => {
    const scope = c.scope;
    if (scope === 'course') {
      return courseId && (c.courseId === courseId || (c as any).targetCourseId === courseId);
    }
    return false;
  });

  // 2. SEGUNDA PRIORIDADE: Cupom definido para o produtor/autor
  const producerSpecificCoupons = activeCoupons.filter(c => {
    const scope = c.scope;
    if (scope === 'producer') {
      return authorId && (c.producerId === authorId || (c as any).authorId === authorId);
    }
    return false;
  });

  // 3. TERCEIRA PRIORIDADE: Cupom geral ativo na plataforma para todos os cursos
  const generalCoupons = activeCoupons.filter(c => {
    const scope = c.scope;
    return !scope || scope === 'general' || scope === 'all';
  });

  let selectedGroup: { group: Coupon[]; type: 'course' | 'producer' | 'general'; label: string } | null = null;

  if (courseSpecificCoupons.length > 0) {
    selectedGroup = {
      group: courseSpecificCoupons,
      type: 'course',
      label: 'Cupom do Curso'
    };
  } else if (producerSpecificCoupons.length > 0) {
    selectedGroup = {
      group: producerSpecificCoupons,
      type: 'producer',
      label: 'Cupom do Produtor'
    };
  } else if (generalCoupons.length > 0) {
    selectedGroup = {
      group: generalCoupons,
      type: 'general',
      label: 'Desconto da Plataforma'
    };
  } else {
    // Sem cupons aplicáveis: retorna preço integral
    return defaultNoDiscount;
  }

  // Escolhe o cupom do grupo selecionado com maior economia
  let bestCoupon: Coupon | null = null;
  let maxSavings = 0;
  let bestBadge = '';

  for (const cp of selectedGroup.group) {
    let savings = 0;
    let badge = '';
    const discountVal = Number(cp.discountValue) || 0;

    if (cp.type === 'percentage') {
      const pct = Math.min(100, Math.max(0, discountVal));
      savings = Math.round((originalPrice * pct) / 100);
      badge = `-${pct}%`;
    } else {
      // Valor fixo em Kz
      savings = Math.min(originalPrice, Math.max(0, discountVal));
      badge = `-${savings.toLocaleString('pt-AO')} Kz`;
    }

    if (savings > maxSavings || !bestCoupon) {
      maxSavings = savings;
      bestCoupon = cp;
      bestBadge = badge;
    }
  }

  if (!bestCoupon || maxSavings <= 0) {
    return defaultNoDiscount;
  }

  const discountedPrice = Math.max(0, originalPrice - maxSavings);

  return {
    hasDiscount: true,
    originalPrice,
    discountedPrice,
    appliedCoupon: bestCoupon,
    couponCode: bestCoupon.code,
    discountBadge: bestBadge,
    savingsAmount: maxSavings,
    scopeType: selectedGroup.type,
    scopeLabel: selectedGroup.label
  };
}
