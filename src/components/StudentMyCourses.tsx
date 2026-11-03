import React, { useState, useEffect } from 'react';
import { collection, getDocs, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { subscribeUserEnrollments } from '../services/enrollmentService';
import { BookOpen, Play, CheckCircle2, Award, ArrowRight, Clock, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { sortCoursesByLevel } from '../utils/courseSorting';

interface Course {
  id: string;
  title: string;
  description: string;
  coverImage: string;
  structureType?: 'modules' | 'single_lesson' | 'direct_link';
  directLinkUrl?: string;
  modules?: Array<{
    id: string;
    lessons?: Array<{ id: string }>;
  }>;
}

export default function StudentMyCourses({ onExplore }: { onExplore: () => void }) {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<string[]>([]);
  const [completedLessons, setCompletedLessons] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. Escutar em tempo real as matrículas do usuário logado
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setLoading(false);
      return;
    }

    const unsubEnrollments = subscribeUserEnrollments(currentUser, (enrollData) => {
      setEnrolledCourseIds(enrollData.enrolledCourses);
      setCompletedLessons(enrollData.completedLessons);
    });

    return () => unsubEnrollments();
  }, []);

  // 2. Escutar em tempo real a coleção de cursos cadastrados
  useEffect(() => {
    const unsubCourses = onSnapshot(collection(db, 'courses'), (snap) => {
      const fetched = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as Course[];
      setAllCourses(fetched);
      setLoading(false);
    }, (err) => {
      console.error("Erro ao carregar coleção de cursos em StudentMyCourses:", err);
      setLoading(false);
    });

    return () => unsubCourses();
  }, []);

  // 3. Filtrar cursos conforme a lista de matriculados e ordenar por Nível
  useEffect(() => {
    const myFiltered = allCourses.filter(c => enrolledCourseIds.includes(c.id));
    setCourses(sortCoursesByLevel(myFiltered));
  }, [allCourses, enrolledCourseIds]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="w-8 h-8 border-4 border-[#e9c349] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="w-full py-2 sm:py-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 sm:mb-8">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white font-headline">Meus Cursos e Progresso</h1>
          <p className="text-gray-400 text-[11px] sm:text-xs md:text-sm mt-0.5">Acompanhe todos os treinamentos que você adquiriu e seu avanço nas aulas.</p>
        </div>
        <button
          onClick={onExplore}
          className="bg-[#e9c349]/15 text-[#e9c349] border border-[#e9c349]/30 hover:bg-[#e9c349]/25 font-bold px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer w-full sm:w-max active:scale-95"
        >
          <span>Explorar Novos Cursos</span>
          <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
      </div>

      {courses.length === 0 ? (
        <div className="bg-[#131313] border border-gray-800 rounded-2xl p-5 sm:p-12 text-center max-w-xl mx-auto my-6 sm:my-12">
          <BookOpen className="w-10 h-10 sm:w-16 sm:h-16 text-[#e9c349] mx-auto mb-3 sm:mb-4 opacity-80" />
          <h3 className="text-base sm:text-xl font-bold text-white mb-1.5 sm:mb-2">Nenhum curso na sua conta ainda</h3>
          <p className="text-gray-400 text-[11px] sm:text-xs md:text-sm mb-5 sm:mb-6">Você ainda não se matriculou em nenhum treinamento ou sua matrícula está pendente de aprovação.</p>
          <button
            onClick={onExplore}
            className="w-full sm:w-auto bg-[#e9c349] text-black font-bold px-5 py-2.5 sm:px-6 sm:py-3 rounded-xl hover:bg-[#d4b03f] transition-all cursor-pointer text-xs sm:text-sm shadow-md active:scale-95"
          >
            Explorar Catálogo de Cursos
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 sm:gap-6">
          {courses.map(course => {
            // Calculate progress
            let totalLessons = 0;
            let completedCount = 0;
            const isDirectLink = course.structureType === 'direct_link';
            const isSingleLesson = course.structureType === 'single_lesson';

            if (isSingleLesson) {
              totalLessons = 1;
              if (completedLessons.includes(course.id)) {
                completedCount = 1;
              }
            } else if (!isDirectLink) {
              if (course.modules && Array.isArray(course.modules)) {
                course.modules.forEach(m => {
                  if (m.lessons && Array.isArray(m.lessons)) {
                    m.lessons.forEach(l => {
                      totalLessons++;
                      if (completedLessons.includes(l.id)) {
                        completedCount++;
                      }
                    });
                  }
                });
              }
            }

            const progressPercent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

            return (
              <div 
                key={course.id}
                className="bg-[#131313] border border-gray-800 rounded-xl sm:rounded-2xl overflow-hidden hover:border-[#e9c349]/50 transition-all flex flex-col group shadow-lg"
              >
                <div className="h-36 sm:h-48 relative overflow-hidden bg-black">
                  {course.coverImage ? (
                    <img src={course.coverImage} alt={course.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full bg-gray-900 flex items-center justify-center text-gray-600 font-mono text-xs">Marks ACADEMY</div>
                  )}
                  {isDirectLink ? (
                    <div className="absolute top-2.5 right-2.5 bg-sky-500/80 backdrop-blur-md px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full border border-sky-500/20 text-white text-[10px] sm:text-xs font-bold font-mono">
                      Link Externo
                    </div>
                  ) : isSingleLesson ? (
                    <div className="absolute top-2.5 right-2.5 bg-indigo-500/80 backdrop-blur-md px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full border border-indigo-500/20 text-white text-[10px] sm:text-xs font-bold font-mono">
                      Aula Única
                    </div>
                  ) : (
                    <div className="absolute top-2.5 right-2.5 bg-black/70 backdrop-blur-md px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full border border-gray-700 text-[#e9c349] text-[10px] sm:text-xs font-bold font-mono">
                      {progressPercent}% Concluído
                    </div>
                  )}
                </div>

                <div className="p-3.5 sm:p-5 md:p-6 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm sm:text-base md:text-lg font-bold text-white mb-1.5 line-clamp-2">{course.title}</h3>
                    <p className="text-gray-400 text-[11px] sm:text-xs line-clamp-2 sm:line-clamp-4 leading-relaxed mb-3 sm:mb-4">{course.description || 'Treinamento completo em trading Método Fusion.'}</p>
                    
                    {/* Progress Bar or delivery type info */}
                    {isDirectLink ? (
                      <div className="mb-4 sm:mb-6 bg-sky-500/5 border border-sky-500/10 p-2.5 sm:p-3 rounded-xl flex items-start gap-2">
                        <span className="text-sky-400 text-xs sm:text-sm">🔗</span>
                        <div>
                          <p className="text-[11px] sm:text-xs font-bold text-sky-400">Canal / Recurso Externo</p>
                          <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed">Este treinamento direciona para um link de acesso ou grupo VIP de alunos externo.</p>
                        </div>
                      </div>
                    ) : isSingleLesson ? (
                      <div className="mb-4 sm:mb-6">
                        <div className="flex justify-between text-[11px] sm:text-xs text-gray-400 mb-1 font-mono">
                          <span>Aula Única / Replay</span>
                          <span className="text-[#e9c349] font-bold">{completedCount === 1 ? 'Concluída' : 'Não assistida'}</span>
                        </div>
                        <div className="w-full h-1.5 sm:h-2 bg-gray-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-[#e9c349] to-amber-500 transition-all duration-500 rounded-full"
                            style={{ width: completedCount === 1 ? '100%' : '0%' }}
                          ></div>
                        </div>
                      </div>
                    ) : (
                      <div className="mb-4 sm:mb-6">
                        <div className="flex justify-between text-[11px] sm:text-xs text-gray-400 mb-1 font-mono">
                          <span>Progresso do Curso</span>
                          <span className="text-[#e9c349] font-bold">{completedCount} de {totalLessons} aulas</span>
                        </div>
                        <div className="w-full h-1.5 sm:h-2 bg-gray-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-[#e9c349] to-amber-500 transition-all duration-500 rounded-full"
                            style={{ width: `${progressPercent}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-gray-800 flex items-center justify-between mt-auto">
                    <span className="text-[10px] sm:text-[11px] text-gray-500 flex items-center gap-1">
                      <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> Acesso Ilimitado
                    </span>
                    <button
                      onClick={() => {
                        if (isDirectLink) {
                          window.open(course.directLinkUrl || '#', '_blank', 'noopener,noreferrer');
                        } else {
                          navigate(`/classroom?courseId=${course.id}`);
                        }
                      }}
                      className="bg-[#e9c349] text-black font-bold px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl text-[11px] sm:text-xs hover:bg-[#d4b03f] transition-all flex items-center gap-1 cursor-pointer shadow-sm active:scale-95 animate-in fade-in duration-300"
                    >
                      {isDirectLink ? (
                        <>
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Acessar Canal</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-black" />
                          <span>{progressPercent > 0 ? 'Continuar' : 'Iniciar Aulas'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
