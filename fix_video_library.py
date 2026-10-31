import re

with open('src/pages/VideoLibrary.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

if "import { CertificateModal }" not in content:
    content = content.replace("import NotificationCenter from '../components/NotificationCenter';", "import NotificationCenter from '../components/NotificationCenter';\nimport { CertificateModal } from '../components/CertificateModal';")

if "const [showCertificateModal, setShowCertificateModal] = useState(false);" not in content:
    content = content.replace("const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);", "const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);\n  const [showCertificateModal, setShowCertificateModal] = useState(false);")

# Find the spot to inject the certificate button
injection_spot = """              <div className="w-full h-1.5 bg-black/50 rounded-full overflow-hidden">
                    <div className="bg-[#e9c349] h-full rounded-full transition-all" style={{ width: `${getCourseProgress()}%` }} />
                  </div>
                </div>
              </div>"""

replacement_spot = """              <div className="w-full h-1.5 bg-black/50 rounded-full overflow-hidden">
                    <div className="bg-[#e9c349] h-full rounded-full transition-all" style={{ width: `${getCourseProgress()}%` }} />
                  </div>
                </div>
                {getCourseProgress() === 100 && (
                  <button
                    onClick={() => setShowCertificateModal(true)}
                    className="w-full mt-4 flex items-center justify-center gap-2 bg-[#e9c349] text-black font-bold py-2.5 rounded-xl hover:bg-[#e9c349]/90 transition-all active:scale-95 shadow-[0_0_15px_rgba(233,195,73,0.3)]"
                  >
                    <span className="material-symbols-outlined text-[20px]">workspace_premium</span>
                    Emitir Certificado
                  </button>
                )}
              </div>"""

if "Emitir Certificado" not in content:
    content = content.replace(injection_spot, replacement_spot)

# And in desktop sidebar
injection_spot_desktop = """              <div className="w-full h-1.5 bg-[#353534]/30 rounded-full overflow-hidden">
                <div 
                  className="bg-[#e9c349] h-full rounded-full transition-all duration-500" 
                  style={{ width: `${getCourseProgress()}%` }}
                />
              </div>
            </div>
          </div>"""

replacement_spot_desktop = """              <div className="w-full h-1.5 bg-[#353534]/30 rounded-full overflow-hidden">
                <div 
                  className="bg-[#e9c349] h-full rounded-full transition-all duration-500" 
                  style={{ width: `${getCourseProgress()}%` }}
                />
              </div>
              {getCourseProgress() === 100 && (
                <button
                  onClick={() => setShowCertificateModal(true)}
                  className="w-full mt-4 flex items-center justify-center gap-2 bg-[#e9c349]/10 border border-[#e9c349] text-[#e9c349] font-bold py-2.5 rounded-xl hover:bg-[#e9c349] hover:text-black transition-all active:scale-95 shadow-[0_0_15px_rgba(233,195,73,0.1)]"
                >
                  <span className="material-symbols-outlined text-[20px]">workspace_premium</span>
                  Emitir Certificado
                </button>
              )}
            </div>
          </div>"""

if "Emitir Certificado" not in content: # wait, if the first one succeeded, this check fails. Let's do it carefully.
    pass
    
content = content.replace(injection_spot_desktop, replacement_spot_desktop)


# Insert Modal at the end of return ()
end_modal_spot = """    </div>
  );
}"""

end_modal_replacement = """      <CertificateModal 
        isOpen={showCertificateModal} 
        onClose={() => setShowCertificateModal(false)}
        courseTitle={course?.title || 'Curso de Especialização'}
        initialStudentName={userProfile?.name || auth.currentUser?.displayName || 'Nome do Aluno'}
      />
    </div>
  );
}"""

if "<CertificateModal" not in content:
    content = content.replace(end_modal_spot, end_modal_replacement)

with open('src/pages/VideoLibrary.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

