import re

with open('src/pages/StudentDirectory.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Imports
if "serverTimestamp" not in content:
    content = content.replace("arrayUnion, arrayRemove, query, where } from 'firebase/firestore';", "arrayUnion, arrayRemove, query, where, addDoc, serverTimestamp } from 'firebase/firestore';")
if "addDoc" not in content and "serverTimestamp" in content:
    content = content.replace("serverTimestamp", "serverTimestamp, addDoc")

# 2. State definition
if "const [generateInvoice, setGenerateInvoice] = useState(false);" not in content:
    content = content.replace("const [isUpdatingCourses, setIsUpdatingCourses] = useState(false);", "const [isUpdatingCourses, setIsUpdatingCourses] = useState(false);\n  const [generateInvoice, setGenerateInvoice] = useState(false);")

# 3. reset generateInvoice on modal open/close
content = content.replace("setIsRegisterModalOpen(true)}", "setIsRegisterModalOpen(true); setGenerateInvoice(false); }")
content = content.replace("setSelectedStudentForCourses(student);", "setSelectedStudentForCourses(student); setGenerateInvoice(false);")

# 4. Modify handleRegisterStudent
register_search = """      await adminCreateStudentAccount(formData.email, formData.password, {
        firstName: formData.firstName,
        lastName: formData.lastName,
        phoneCountryCode: formData.phoneCountryCode,
        phoneNumber: formData.phoneNumber,
        enrolledCourses: formData.selectedCourses,
        plan: formData.plan
      });"""

register_replace = """      const result = await adminCreateStudentAccount(formData.email, formData.password, {
        firstName: formData.firstName,
        lastName: formData.lastName,
        phoneCountryCode: formData.phoneCountryCode,
        phoneNumber: formData.phoneNumber,
        enrolledCourses: formData.selectedCourses,
        plan: formData.plan
      });

      if (generateInvoice && formData.selectedCourses.length > 0) {
        for (const courseId of formData.selectedCourses) {
          const courseData = isolatedCourses.find(c => c.id === courseId);
          if (courseData) {
            await addDoc(collection(db, 'transactions'), {
              userId: result.uid,
              userName: `${formData.firstName.trim()} ${formData.lastName.trim()}`,
              userEmail: result.email,
              userPhone: `${formData.phoneCountryCode || ''} ${formData.phoneNumber || ''}`.trim(),
              courseId: courseId,
              courseTitle: courseData.title,
              referenceNumber: `CFA-ATRIB-${Math.random().toString(36).substring(2,8).toUpperCase()}`,
              paymentMethod: 'Atribuição Administrativa',
              amount: courseData.price || 0,
              originalAmount: courseData.price || 0,
              discountAmount: 0,
              appliedCoupon: null,
              authorId: courseData.authorId || null,
              producerWhatsApp: courseData.producerPhone || null,
              producerName: courseData.producerName || null,
              status: 'approved',
              createdAt: serverTimestamp()
            });
          }
        }
      }"""

if "if (generateInvoice && formData.selectedCourses.length > 0)" not in content:
    content = content.replace(register_search, register_replace)


# 5. Modify handleSaveStudentCourses
save_search = """      await updateDoc(doc(db, 'users', selectedStudentForCourses.id), {
        enrolledCourses: studentEnrolledCourses,
        subscriptionStatus: hasEnrolled ? 'active' : 'inactive'
      });"""

save_replace = """      const previouslyEnrolled = Array.isArray(selectedStudentForCourses.enrolledCourses) 
        ? selectedStudentForCourses.enrolledCourses 
        : [];
      const newlyAddedCourses = studentEnrolledCourses.filter(c => !previouslyEnrolled.includes(c));

      await updateDoc(doc(db, 'users', selectedStudentForCourses.id), {
        enrolledCourses: studentEnrolledCourses,
        subscriptionStatus: hasEnrolled ? 'active' : 'inactive'
      });

      if (generateInvoice && newlyAddedCourses.length > 0) {
        for (const courseId of newlyAddedCourses) {
          const courseData = isolatedCourses.find(c => c.id === courseId);
          if (courseData) {
            await addDoc(collection(db, 'transactions'), {
              userId: selectedStudentForCourses.id,
              userName: `${selectedStudentForCourses.firstName || ''} ${selectedStudentForCourses.lastName || ''}`.trim() || selectedStudentForCourses.name || 'Aluno',
              userEmail: selectedStudentForCourses.email || '',
              userPhone: `${selectedStudentForCourses.phoneCountryCode || ''} ${selectedStudentForCourses.phoneNumber || ''}`.trim(),
              courseId: courseId,
              courseTitle: courseData.title,
              referenceNumber: `CFA-ATRIB-${Math.random().toString(36).substring(2,8).toUpperCase()}`,
              paymentMethod: 'Atribuição Administrativa',
              amount: courseData.price || 0,
              originalAmount: courseData.price || 0,
              discountAmount: 0,
              appliedCoupon: null,
              authorId: courseData.authorId || null,
              producerWhatsApp: courseData.producerPhone || null,
              producerName: courseData.producerName || null,
              status: 'approved',
              createdAt: serverTimestamp()
            });
          }
        }
      }"""

if "const previouslyEnrolled" not in content:
    content = content.replace(save_search, save_replace)


# 6. Insert toggle UI in Modal 1 (before button block)
modal1_ui_spot = """              <div className="flex items-center gap-3 pt-6 mt-6 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsRegisterModalOpen(false)}"""
                  
toggle_ui = """              {/* Toggle de Faturamento */}
              <label className="flex items-center gap-3 p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl cursor-pointer mt-4 hover:bg-emerald-500/20 transition-all">
                <input
                  type="checkbox"
                  checked={generateInvoice}
                  onChange={(e) => setGenerateInvoice(e.target.checked)}
                  className="w-5 h-5 rounded text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                />
                <div className="flex-1">
                  <p className="text-sm font-bold text-emerald-400">Contabilizar como Venda Faturada</p>
                  <p className="text-xs text-emerald-500/80 mt-0.5">Se marcado, irá registrar a atribuição na Dashboard como uma venda aprovada.</p>
                </div>
              </label>

"""
if "Contabilizar como Venda Faturada" not in content:
    content = content.replace(modal1_ui_spot, toggle_ui + modal1_ui_spot)


# 7. Insert toggle UI in Modal 2
modal2_ui_spot = """            <div className="flex items-center gap-3 pt-6 mt-2 border-t border-gray-800">
              <button
                onClick={() => setSelectedStudentForCourses(null)}"""

if content.count("Contabilizar como Venda Faturada") < 2:
    content = content.replace(modal2_ui_spot, toggle_ui.replace('              {', '            {') + modal2_ui_spot)


with open('src/pages/StudentDirectory.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

