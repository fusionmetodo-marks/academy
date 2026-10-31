import re
import os

logic = """  const getCourseDiscountInfo = (course: Course) => {
    if (!course.price || course.price === 0) return { isFree: true, hasDiscount: false, discountedPrice: 0, couponCode: null, discountValue: 0, discountType: 'percentage' };
    
    // Filtrar todos os cupões aplicáveis a este curso
    const applicableCoupons = coupons.filter(c => {
      if (c.active === false) return false; // Ignorar inativos

      if (c.scope === 'course') {
        return c.courseId === course.id;
      }
      if (c.scope === 'producer') {
        return c.producerId === course.authorId;
      }
      if (c.scope === 'all' || c.scope === 'general' || !c.scope) {
        return !c.courseId; // Cupão geral não pode estar atrelado a um ID de curso específico
      }
      return false;
    });

    if (applicableCoupons.length === 0) {
      return { isFree: false, hasDiscount: false, discountedPrice: course.price, couponCode: null, discountValue: 0, discountType: 'percentage' };
    }

    // Encontrar o cupão que oferece o MAIOR desconto
    let bestCoupon = null;
    let maxDiscountAmount = 0;

    applicableCoupons.forEach(coupon => {
      let currentDiscountAmount = 0;
      if (coupon.type === 'percentage') {
        currentDiscountAmount = (course.price * Number(coupon.discountValue)) / 100;
      } else if (coupon.type === 'fixed') {
        currentDiscountAmount = Number(coupon.discountValue);
      }
      
      if (currentDiscountAmount > course.price) {
        currentDiscountAmount = course.price;
      }

      if (currentDiscountAmount > maxDiscountAmount) {
        maxDiscountAmount = currentDiscountAmount;
        bestCoupon = coupon;
      }
    });

    if (!bestCoupon || maxDiscountAmount <= 0) {
      return { isFree: false, hasDiscount: false, discountedPrice: course.price, couponCode: null, discountValue: 0, discountType: 'percentage' };
    }
    
    const discountedPrice = Math.max(0, course.price - maxDiscountAmount);
    return {
      isFree: false,
      hasDiscount: discountedPrice < course.price,
      discountedPrice,
      couponCode: bestCoupon.code,
      discountValue: bestCoupon.discountValue,
      discountType: bestCoupon.type
    };
  };"""

files_to_fix = ['src/pages/SalesPage.tsx', 'src/components/StudentCatalog.tsx']

for filepath in files_to_fix:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find the function definition
    # Regex to match the function up to its return block
    pattern = re.compile(r"  const getCourseDiscountInfo = \(course: Course\) => \{.*?return \{.*?isFree: false.*?hasDiscount: discountedPrice < course\.price,.*?discountedPrice.*?couponCode: .*?discountValue: .*?discountType: .*?\n    \};\n  \};", re.DOTALL)
    
    if not pattern.search(content):
        # Maybe slightly different pattern
        pattern = re.compile(r"  const getCourseDiscountInfo = \(course: Course\) => \{.*?return \{\n.*?\};\n  \};", re.DOTALL)

    content = pattern.sub(logic, content)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
print("Discount logic made intelligent!")
