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
 * Cupom padrão ativo da plataforma (CFA75 com 75% de desconto para todos os cursos)
 */
export const DEFAULT_PLATFORM_COUPONS: Coupon[] = [
  {
    id: 'cp_cfa75',
    code: 'CFA75',
    type: 'percentage',
    discountValue: 75,
    scope: 'general',
    active: true,
    createdAt: new Date().toISOString()
  }
];

/**
 * Normaliza lista de cupões, garantindo que o cupom geral da plataforma
 * reflita o desconto vigente de 75% caso seja o cupom padrão inicial.
 */
function normalizeCoupons(list: Coupon[]): Coupon[] {
  if (!list || list.length === 0) {
    return [...DEFAULT_PLATFORM_COUPONS];
  }

  // Substitui qualquer remanescente do antigo cupom de demonstração CFA10 (10%) para o desconto oficial da plataforma de 75%
  const updated = list.map(c => {
    if (c.id === 'cp_cfa10' || (c.code === 'CFA10' && Number(c.discountValue) === 10)) {
      return {
        ...c,
        id: 'cp_cfa75',
        code: 'CFA75',
        discountValue: 75
      };
    }
    return c;
  });

  // Se nenhum cupom geral estiver cadastrado, inclui o cupom geral de 75%
  const hasGeneral = updated.some(c => c && c.active !== false && (!c.scope || c.scope === 'general' || c.scope === 'all'));
  if (!hasGeneral) {
    return [...updated, ...DEFAULT_PLATFORM_COUPONS];
  }

  return updated;
}

/**
 * Busca a lista de cupões cadastrados no Firebase Firestore
 */
export async function getActiveCoupons(): Promise<Coupon[]> {
  try {
    const couponsDoc = await getDoc(doc(db, 'settings', 'coupons')).catch(() => null);
    if (couponsDoc?.exists() && Array.isArray(couponsDoc.data().list)) {
      const list = couponsDoc.data().list as Coupon[];
      if (list.length > 0) {
        return normalizeCoupons(list.filter(c => c && c.active !== false));
      }
    }

    const cSnap = await getDocs(collection(db, 'coupons')).catch(() => null);
    if (cSnap && !cSnap.empty) {
      const list = cSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as Coupon))
        .filter(c => c && c.active !== false);
      return normalizeCoupons(list);
    }
  } catch (err) {
    console.error("Erro ao carregar cupões ativos:", err);
  }
  return DEFAULT_PLATFORM_COUPONS;
}

/**
 * Escuta atualizações de cupões em tempo real
 */
export function subscribeCoupons(onUpdate: (coupons: Coupon[]) => void): () => void {
  try {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'coupons'), (docSnap) => {
      if (docSnap.exists() && Array.isArray(docSnap.data().list)) {
        const list = docSnap.data().list;
        if (list.length > 0) {
          const activeList = list.filter((c: any) => c && c.active !== false);
          onUpdate(normalizeCoupons(activeList));
        } else {
          onUpdate(DEFAULT_PLATFORM_COUPONS);
        }
      } else {
        // Fallback para coleção ou cupom padrão da plataforma
        getDocs(collection(db, 'coupons')).then(cSnap => {
          if (!cSnap.empty) {
            const list = cSnap.docs.map(d => ({ id: d.id, ...d.data() } as Coupon)).filter(c => c && c.active !== false);
            onUpdate(normalizeCoupons(list));
          } else {
            onUpdate(DEFAULT_PLATFORM_COUPONS);
            // Salva cupom padrão no Firestore para persistência global
            setDoc(doc(db, 'settings', 'coupons'), {
              list: DEFAULT_PLATFORM_COUPONS,
              updatedAt: new Date().toISOString()
            }).catch(() => {});
          }
        }).catch(() => onUpdate(DEFAULT_PLATFORM_COUPONS));
      }
    }, (error) => {
      console.warn("Erro no listener de cupões, usando padrão:", error);
      onUpdate(DEFAULT_PLATFORM_COUPONS);
    });

    return unsubscribe;
  } catch (e) {
    console.warn("Erro ao iniciar listener de cupões, usando padrão:", e);
    onUpdate(DEFAULT_PLATFORM_COUPONS);
    return () => {};
  }
}

/**
 * Calcula o preço com desconto baseado nos cupões ativos
 * Regra de prioridade:
 * 1. Cupom definido especificamente para o curso (se existir, assume este)
 * 2. Cupom definido para o produtor/autor do curso
 * 3. Cupom geral ativo na plataforma (75% para todos os cursos)
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

  // Lista normalizada de cupons ativos (garantindo que se não houver cupons, assume o de 75% da plataforma)
  const rawCoupons = (coupons && coupons.length > 0) ? coupons : DEFAULT_PLATFORM_COUPONS;
  const activeCoupons = normalizeCoupons(rawCoupons.filter(c => c && c.active !== false));

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

  // 3. TERCEIRA PRIORIDADE: Cupom geral ativo na plataforma para todos os cursos (75%)
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
    // Fallback garantido para o cupom padrão de 75%
    selectedGroup = {
      group: DEFAULT_PLATFORM_COUPONS,
      type: 'general',
      label: 'Desconto da Plataforma'
    };
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
