import re

logic = """        // Aplicação inteligente automática de cupão
        if (preAppliedCoupon) {
          setAppliedCoupon(preAppliedCoupon);
          const discountStr = preAppliedCoupon.type === 'percentage' 
            ? `${preAppliedCoupon.discountValue}%` 
            : new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0 }).format(Number(preAppliedCoupon.discountValue));
          setCouponSuccessMsg(`Cupão ${preAppliedCoupon.code} aplicado com sucesso! (-${discountStr})`);
        } else if (loadedCoupons.length > 0) {
          const activeCoupons = loadedCoupons.filter(c => c && c.active !== false);
          
          // Filtrar os cupões aplicáveis a este curso
          const applicableCoupons = activeCoupons.filter(c => {
            if (c.scope === 'course') return c.courseId === courseId;
            if (c.scope === 'producer') return c.producerId === courseData?.authorId; // Precisamos ter o producerId do curso
            if (c.scope === 'all' || c.scope === 'general' || !c.scope) return !c.courseId;
            return false;
          });

          let bestCoupon = null;
          let maxDiscountAmount = 0;

          applicableCoupons.forEach(coupon => {
            let currentDiscount = 0;
            if (coupon.type === 'percentage') {
              currentDiscount = (coursePrice * Number(coupon.discountValue)) / 100;
            } else if (coupon.type === 'fixed') {
              currentDiscount = Number(coupon.discountValue);
            }
            if (currentDiscount > coursePrice) currentDiscount = coursePrice;

            if (currentDiscount > maxDiscountAmount) {
              maxDiscountAmount = currentDiscount;
              bestCoupon = coupon;
            }
          });

          if (bestCoupon && maxDiscountAmount > 0) {
            setAppliedCoupon(bestCoupon);
            const discountStr = bestCoupon.type === 'percentage' 
              ? `${bestCoupon.discountValue}%` 
              : new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0 }).format(Number(bestCoupon.discountValue));
            setCouponSuccessMsg(`Desconto automático ${bestCoupon.code} aplicado! (-${discountStr})`);
          }
        }"""

with open('src/components/CourseCheckout.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the block
# Find start: // Aplicação inteligente automática de cupão
# Find end:         } catch (err) {
pattern = re.compile(r"        // Aplicação inteligente automática de cupão.*?        \} catch \(err\) \{", re.DOTALL)
content = pattern.sub(logic + "\n      } catch (err) {", content)

with open('src/components/CourseCheckout.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated CourseCheckout discount intelligence")
