import React, { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid, Cell } from "recharts";
import Sidebar from '../components/Sidebar';
import { NotificationCenter } from '../components/NotificationCenter';
import { PushSubscriptionBanner } from '../components/PushSubscriptionBanner';
import { collection, onSnapshot, updateDoc, doc, arrayRemove, deleteDoc, query, where, getDocs, getDoc } from 'firebase/firestore';
import { db, auth, approveStudentTransaction } from '../firebase';
import { Transaction } from '../types';
import { isMasterEmail } from '../utils/constants';
import { 
  BarChart3, 
  TrendingUp, 
  Calendar, 
  Download, 
  Clock, 
  Search, 
  X, 
  Layers, 
  Activity, 
  ChevronDown, 
  Check
} from 'lucide-react';

type TimeFilter = '7d' | '30d' | '6m' | '1y' | 'all';
type MetricType = 'revenue' | 'transactions' | 'students';
type ChartStyle = 'bar' | 'area';

interface AuditLog {
  id: string;
  type: 'payment_approved' | 'payment_pending' | 'payment_rejected' | 'student_signup' | 'lesson_completed';
  title: string;
  description: string;
  timestamp: Date;
  metadata?: string;
  userEmail?: string;
  userName?: string;
}

// Safely parse Firestore Timestamp, Date, ISO string or epoch number
function parseDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val.toDate === 'function') {
    try {
      const d = val.toDate();
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
  if (typeof val.seconds === 'number') {
    const d = new Date(val.seconds * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'number') {
    const d = new Date(val > 1e11 ? val : val * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'string') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export default function Dashboard() {
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Firestore Real-time States
  const [students, setStudents] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [coursesList, setCoursesList] = useState<any[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [coursesCount, setCoursesCount] = useState<number>(0);

  // Interactive Chart & Filter Controls
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [metricType, setMetricType] = useState<MetricType>('revenue');
  const [chartStyle, setChartStyle] = useState<ChartStyle>('bar');
  const [hoveredDataPoint, setHoveredDataPoint] = useState<any | null>(null);
  const [isTimeDropdownOpen, setIsTimeDropdownOpen] = useState(false);

  // Audit Logs Modal State
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [logsSearch, setLogsSearch] = useState('');
  const [logsFilterType, setLogsFilterType] = useState<string>('all');

  // History Modal State
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historySearch, setHistorySearch] = useState('');
  const [activeDropdownTxId, setActiveDropdownTxId] = useState<string | null>(null);

  // Custom confirmation modal states (replaces iframe-blocked confirm popup)
  const [txToDelete, setTxToDelete] = useState<Transaction | null>(null);
  const [txToCancel, setTxToCancel] = useState<Transaction | null>(null);
  const [txToApprove, setTxToApprove] = useState<Transaction | null>(null);
  const [txToReject, setTxToReject] = useState<Transaction | null>(null);
  const [activePendingDropdownTxId, setActivePendingDropdownTxId] = useState<string | null>(null);
  const [pendingSearch, setPendingSearch] = useState('');

  const showNotification = (msg: string) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  // Listen to Users, Transactions and Courses in real-time
  useEffect(() => {
    const user = auth.currentUser;
    if (user) {
      getDoc(doc(db, 'users', user.uid)).then((snap) => {
        if (snap.exists()) {
          setCurrentUserProfile(snap.data());
        }
      }).catch((err) => console.warn("Could not fetch user profile in dashboard:", err));
    }

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const list: any[] = [];
      snap.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setStudents(list);
      setLoading(false);
    }, (err) => {
      console.error("Dashboard failed to subscribe to users:", err);
      setLoading(false);
    });

    const unsubTransactions = onSnapshot(collection(db, 'transactions'), (snap) => {
      const txList: Transaction[] = [];
      snap.forEach((docSnap) => {
        txList.push({ id: docSnap.id, ...docSnap.data() } as Transaction);
      });
      // sort latest first
      txList.sort((a, b) => {
        const timeA = parseDate(a.createdAt)?.getTime() || 0;
        const timeB = parseDate(b.createdAt)?.getTime() || 0;
        return timeB - timeA;
      });
      setTransactions(txList);
    }, (err) => {
      console.error("Dashboard failed to subscribe to transactions:", err);
    });

    const unsubCourses = onSnapshot(collection(db, 'courses'), (snap) => {
      const cList: any[] = [];
      snap.forEach((docSnap) => {
        cList.push({ id: docSnap.id, ...docSnap.data() });
      });
      setCoursesList(cList);
      setCoursesCount(snap.size);
    }, (err) => {
      console.error("Dashboard failed to subscribe to courses:", err);
    });

    return () => {
      unsubUsers();
      unsubTransactions();
      unsubCourses();
    };
  }, []);

  const handleApproveTransaction = async (tx: Transaction) => {
    try {
      const courseIdToEnroll = tx.courseId || 'marks-trading-master';
      const courseTitle = tx.courseTitle || 'Curso Marks ACADEMY';
      
      await approveStudentTransaction(tx.id, tx.userId, courseIdToEnroll, tx.userEmail);
      showNotification(`Pagamento aprovado! Curso "${courseTitle}" liberado com sucesso para ${tx.userName || tx.userEmail}!`);
    } catch (err) {
      console.error("Erro ao aprovar:", err);
      showNotification('Erro ao processar aprovação da transação.');
    }
  };

  const handleRejectTransaction = async (tx: Transaction) => {
    try {
      await updateDoc(doc(db, 'transactions', tx.id), { status: 'rejected' });
      showNotification(`Transação ${tx.referenceNumber} marcada como recusada.`);
    } catch (err) {
      console.error("Error rejecting transaction:", err);
      showNotification('Erro ao atualizar status.');
    }
  };

  const handleCancelSubscription = async (tx: Transaction) => {
    try {
      const courseIdToRemove = tx.courseId || 'marks-trading-master';
      
      // 1. Revert transaction status back to 'pending'
      await updateDoc(doc(db, 'transactions', tx.id), {
        status: 'pending',
        approvedAt: null,
        approvedBy: null
      });

      // 2. Remove the course from user's enrolledCourses
      if (tx.userId && !tx.userId.startsWith('guest_')) {
        try {
          const userRef = doc(db, 'users', tx.userId);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            await updateDoc(userRef, {
              enrolledCourses: arrayRemove(courseIdToRemove)
            });
          } else {
            console.warn(`User document ${tx.userId} not found, skipping course removal.`);
          }
        } catch (userErr) {
          console.error("Failed to update user enrolledCourses during cancellation:", userErr);
        }
      } else if (tx.userEmail) {
        try {
          const q = query(collection(db, 'users'), where('email', '==', tx.userEmail.trim().toLowerCase()));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const foundDoc = snap.docs[0];
            await updateDoc(doc(db, 'users', foundDoc.id), {
              enrolledCourses: arrayRemove(courseIdToRemove)
            });
          }
        } catch (userErr) {
          console.error("Failed to update user enrolledCourses by email during cancellation:", userErr);
        }
      }
      showNotification(`Subscrição cancelada! O curso foi removido do estudante e a transação voltou para pendente.`);
    } catch (err) {
      console.error("Erro ao cancelar subscrição:", err);
      showNotification('Erro ao cancelar subscrição.');
    }
  };

  const handleDeleteTransaction = async (txId: string, userId?: string, courseId?: string, userEmail?: string, status?: string) => {
    try {
      // 1. Delete the transaction document
      await deleteDoc(doc(db, 'transactions', txId));

      // 2. If the transaction was approved, remove the course from the user's enrolledCourses
      if (status === 'approved' && courseId) {
        if (userId && !userId.startsWith('guest_')) {
          try {
            const userRef = doc(db, 'users', userId);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
              await updateDoc(userRef, {
                enrolledCourses: arrayRemove(courseId)
              });
            } else {
              console.warn(`User document ${userId} not found, skipping course removal during transaction deletion.`);
            }
          } catch (userErr) {
            console.error("Failed to update user enrolledCourses during deletion:", userErr);
          }
        } else if (userEmail) {
          try {
            const q = query(collection(db, 'users'), where('email', '==', userEmail.trim().toLowerCase()));
            const snap = await getDocs(q);
            if (!snap.empty) {
              const foundDoc = snap.docs[0];
              await updateDoc(doc(db, 'users', foundDoc.id), {
                enrolledCourses: arrayRemove(courseId)
              });
            }
          } catch (userErr) {
            console.error("Failed to update user enrolledCourses by email during deletion:", userErr);
          }
        }
      }
      showNotification(`Transação eliminada com sucesso e faturamento estornado.`);
    } catch (err) {
      console.error("Erro ao eliminar transação:", err);
      showNotification('Erro ao eliminar transação.');
    }
  };

  // Filter students (exclude master admin & producer from student count metrics)
  const realStudents = useMemo(() => {
    return students.filter(s => {
      const cleanEmail = (s.email || '').trim().toLowerCase();
      const isMaster = isMasterEmail(cleanEmail);
      const isProducer = s.role === 'producer' || s.role === 'admin' || s.roleType === 'producer';
      return !isMaster && !isProducer;
    });
  }, [students]);

  // Detect current user role & producer status for data isolation
  const currentAuthUser = auth.currentUser;
  const cleanCurrentEmail = currentAuthUser?.email?.trim().toLowerCase() || '';
  const isMasterUser = isMasterEmail(cleanCurrentEmail);
  const isProducerRole = currentUserProfile?.role === 'producer' || currentUserProfile?.roleType === 'producer';
  const isProducerMode = !isMasterUser && (isProducerRole || currentUserProfile?.role === 'admin');

  // Producer's isolated courses
  const producerCourses = useMemo(() => {
    if (!isProducerMode) return coursesList;
    const pName = (currentUserProfile?.producerName || `${currentUserProfile?.firstName || ''} ${currentUserProfile?.lastName || ''}`).trim().toLowerCase();
    return coursesList.filter(c => {
      const authorMatch = c.authorId && (c.authorId === currentAuthUser?.uid || c.authorId === currentAuthUser?.email);
      const nameMatch = c.producerName && pName && c.producerName.trim().toLowerCase() === pName;
      return authorMatch || nameMatch;
    });
  }, [coursesList, isProducerMode, currentAuthUser, currentUserProfile]);

  const producerCourseIds = useMemo(() => {
    return new Set(producerCourses.map(c => c.id));
  }, [producerCourses]);

  // Isolated Transactions for Producer vs Master Admin
  const effectiveTransactions = useMemo(() => {
    if (!isProducerMode) return transactions;
    return transactions.filter(t => 
      (t.courseId && producerCourseIds.has(t.courseId)) ||
      (t.courseAuthorId && (t.courseAuthorId === currentAuthUser?.uid || t.courseAuthorId === currentAuthUser?.email))
    );
  }, [transactions, isProducerMode, producerCourseIds, currentAuthUser]);

  // Isolated Students for Producer vs Master Admin
  const effectiveStudents = useMemo(() => {
    if (!isProducerMode) return realStudents;
    return realStudents.filter(s => 
      Array.isArray(s.enrolledCourses) && s.enrolledCourses.some(cid => producerCourseIds.has(cid))
    );
  }, [realStudents, isProducerMode, producerCourseIds]);

  const displayCoursesCount = isProducerMode ? producerCourses.length : coursesCount;

  // Filter items by selected time range for key metrics
  const now = new Date();
  const getFilterStartDate = (filter: TimeFilter): Date | null => {
    const d = new Date();
    if (filter === '7d') {
      d.setDate(d.getDate() - 7);
      return d;
    }
    if (filter === '30d') {
      d.setDate(d.getDate() - 30);
      return d;
    }
    if (filter === '6m') {
      d.setMonth(d.getMonth() - 6);
      return d;
    }
    if (filter === '1y') {
      d.setFullYear(d.getFullYear() - 1);
      return d;
    }
    return null;
  };

  const filterStartDate = getFilterStartDate(timeFilter);

  const filteredTransactions = useMemo(() => {
    if (!filterStartDate) return effectiveTransactions;
    return effectiveTransactions.filter(t => {
      const tDate = parseDate(t.createdAt) || new Date(0);
      return tDate >= filterStartDate;
    });
  }, [effectiveTransactions, filterStartDate]);

  const filteredStudents = useMemo(() => {
    if (!filterStartDate) return effectiveStudents;
    return effectiveStudents.filter(s => {
      const sDate = parseDate(s.createdAt) || new Date(0);
      return sDate >= filterStartDate;
    });
  }, [effectiveStudents, filterStartDate]);

  const totalStudents = filteredStudents.length;
  const activeStudents = filteredStudents.filter(s => 
    s.subscriptionStatus === 'active' && 
    Array.isArray(s.enrolledCourses) && 
    s.enrolledCourses.length > 0
  ).length;
  
  const totalCompletions = effectiveStudents.reduce((sum, s) => {
    const completed = s.completedLessons || [];
    return sum + completed.length;
  }, 0);

  const realApprovedRevenue = filteredTransactions
    .filter(t => t.status === 'approved')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  const revenueFormatted = new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(realApprovedRevenue);

  // =========================================================================
  // CHART DATA AGGREGATOR
  // =========================================================================
  const chartData = useMemo(() => {
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    if (timeFilter === '7d') {
      // Last 7 individual days
      const days: { label: string; dateStr: string; revenue: number; transactions: number; students: number; pending: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayStr = d.toLocaleDateString('pt-AO', { day: '2-digit', month: '2-digit' });
        const ymd = d.toISOString().split('T')[0];

        const dayTxs = effectiveTransactions.filter(t => {
          const tDate = parseDate(t.createdAt);
          if (!tDate) return false;
          return tDate.toISOString().split('T')[0] === ymd;
        });

        const dayStudents = effectiveStudents.filter(s => {
          const sDate = parseDate(s.createdAt);
          if (!sDate) return false;
          return sDate.toISOString().split('T')[0] === ymd;
        });

        const approvedRev = dayTxs.filter(t => t.status === 'approved').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
        const pendingCount = dayTxs.filter(t => t.status === 'pending').length;

        days.push({
          label: dayStr,
          dateStr: d.toLocaleDateString('pt-AO', { weekday: 'short', day: 'numeric', month: 'short' }),
          revenue: approvedRev,
          transactions: dayTxs.length,
          students: dayStudents.length,
          pending: pendingCount
        });
      }
      return days;
    }

    if (timeFilter === '30d') {
      // 4 weeks interval
      const weeks: { label: string; dateStr: string; revenue: number; transactions: number; students: number; pending: number }[] = [];
      for (let i = 3; i >= 0; i--) {
        const endD = new Date();
        endD.setDate(endD.getDate() - (i * 7));
        const startD = new Date(endD);
        startD.setDate(startD.getDate() - 7);

        const wTxs = effectiveTransactions.filter(t => {
          const tDate = parseDate(t.createdAt);
          if (!tDate) return false;
          return tDate >= startD && tDate <= endD;
        });

        const wStudents = effectiveStudents.filter(s => {
          const sDate = parseDate(s.createdAt);
          if (!sDate) return false;
          return sDate >= startD && sDate <= endD;
        });

        const approvedRev = wTxs.filter(t => t.status === 'approved').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

        weeks.push({
          label: `Sem ${4 - i}`,
          dateStr: `${startD.toLocaleDateString('pt-AO', { day: '2-digit', month: 'short' })} - ${endD.toLocaleDateString('pt-AO', { day: '2-digit', month: 'short' })}`,
          revenue: approvedRev,
          transactions: wTxs.length,
          students: wStudents.length,
          pending: wTxs.filter(t => t.status === 'pending').length
        });
      }
      return weeks;
    }

    // Monthly breakdown (6m, 1y, all)
    const monthCount = timeFilter === '6m' ? 6 : timeFilter === '1y' ? 12 : 12;
    const months: { label: string; dateStr: string; revenue: number; transactions: number; students: number; pending: number }[] = [];

    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    for (let i = monthCount - 1; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - i, 1);
      const mIdx = d.getMonth();
      const yr = d.getFullYear();
      const label = `${monthNames[mIdx]} ${yr.toString().slice(2)}`;
      const ymStr = `${yr}-${String(mIdx + 1).padStart(2, '0')}`;

      const mTxs = effectiveTransactions.filter(t => {
        const tDate = parseDate(t.createdAt);
        if (!tDate) return false;
        const itemYm = `${tDate.getFullYear()}-${String(tDate.getMonth() + 1).padStart(2, '0')}`;
        return itemYm === ymStr;
      });

      const mStudents = effectiveStudents.filter(s => {
        const sDate = parseDate(s.createdAt);
        if (!sDate) return false;
        const itemYm = `${sDate.getFullYear()}-${String(sDate.getMonth() + 1).padStart(2, '0')}`;
        return itemYm === ymStr;
      });

      const approvedRev = mTxs.filter(t => t.status === 'approved').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

      months.push({
        label,
        dateStr: `${monthNames[mIdx]} de ${yr}`,
        revenue: approvedRev,
        transactions: mTxs.length,
        students: mStudents.length,
        pending: mTxs.filter(t => t.status === 'pending').length
      });
    }

    // If all values are zero because test transactions don't have past dates, assign to current month
    const totalRevInChart = months.reduce((sum, m) => sum + m.revenue, 0);
    if (totalRevInChart === 0 && realApprovedRevenue > 0) {
      months[months.length - 1].revenue = realApprovedRevenue;
      months[months.length - 1].transactions = effectiveTransactions.length;
      months[months.length - 1].students = effectiveStudents.length;
    }

    return months;
  }, [effectiveTransactions, effectiveStudents, timeFilter, realApprovedRevenue]);

  // Max value in chart for scale calculation
  const maxChartValue = useMemo(() => {
    const vals = chartData.map(d => {
      if (metricType === 'revenue') return d.revenue;
      if (metricType === 'transactions') return d.transactions;
      return d.students;
    });
    const max = Math.max(...vals, 0);
    return max === 0 ? 100000 : max;
  }, [chartData, metricType]);

  const totalPeriodRevenue = useMemo(() => {
    return chartData.reduce((sum, d) => sum + d.revenue, 0);
  }, [chartData]);

  const peakPeriodValue = useMemo(() => {
    if (metricType === 'revenue') {
      const max = Math.max(...chartData.map(d => d.revenue), 0);
      return new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(max);
    }
    const max = Math.max(...chartData.map(d => metricType === 'transactions' ? d.transactions : d.students), 0);
    return `${max} registros`;
  }, [chartData, metricType]);

  // =========================================================================
  // COMPLETE AUDIT & ACTIVITY LOGS SYSTEM
  // =========================================================================
  const allAuditLogs = useMemo<AuditLog[]>(() => {
    const logs: AuditLog[] = [];

    // 1. Transaction Logs
    effectiveTransactions.forEach(t => {
      const txDate = parseDate(t.createdAt) || new Date();
      if (t.status === 'approved') {
        logs.push({
          id: `tx-app-${t.id}`,
          type: 'payment_approved',
          title: `Pagamento Aprovado (${t.referenceNumber || 'REF'})`,
          description: `Valor de ${new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(Number(t.amount) || 0)} confirmado para ${t.userName || t.userEmail}. Curso liberado.`,
          timestamp: txDate,
          metadata: t.courseTitle || 'Curso CFA',
          userEmail: t.userEmail,
          userName: t.userName
        });
      } else if (t.status === 'rejected') {
        logs.push({
          id: `tx-rej-${t.id}`,
          type: 'payment_rejected',
          title: `Pagamento Recusado (${t.referenceNumber || 'REF'})`,
          description: `Comprovativo recusado para ${t.userName || t.userEmail}. Estudante notificado.`,
          timestamp: txDate,
          metadata: t.courseTitle || 'Curso CFA',
          userEmail: t.userEmail,
          userName: t.userName
        });
      } else {
        logs.push({
          id: `tx-pen-${t.id}`,
          type: 'payment_pending',
          title: `Comprovativo Enviado (${t.referenceNumber || 'REF'})`,
          description: `Nova submissão de pagamento por ${t.userName || t.userEmail} aguardando validação do administrador.`,
          timestamp: txDate,
          metadata: t.courseTitle || 'Curso CFA',
          userEmail: t.userEmail,
          userName: t.userName
        });
      }
    });

    // 2. Student Signups Logs
    effectiveStudents.forEach(s => {
      const sDate = parseDate(s.createdAt) || new Date();
      logs.push({
        id: `usr-reg-${s.id}`,
        type: 'student_signup',
        title: `Novo Estudante Registado`,
        description: `${s.firstName ? `${s.firstName} ${s.lastName || ''}` : s.email} criou conta na academia CFA.`,
        timestamp: sDate,
        metadata: s.subscriptionStatus === 'active' ? 'Assinatura Ativa' : 'Pendente',
        userEmail: s.email,
        userName: s.firstName ? `${s.firstName} ${s.lastName || ''}` : s.email
      });

      // Completed Lessons
      if (Array.isArray(s.completedLessons) && s.completedLessons.length > 0) {
        logs.push({
          id: `lesson-comp-${s.id}`,
          type: 'lesson_completed',
          title: `Aulas Concluídas`,
          description: `O aluno ${s.firstName || s.email} já validou ${s.completedLessons.length} aula(s) no portal.`,
          timestamp: sDate,
          metadata: `${s.completedLessons.length} Aulas`,
          userEmail: s.email,
          userName: s.firstName || s.email
        });
      }
    });

    // Sort descending by timestamp
    logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return logs;
  }, [transactions, students]);

  // Filtered audit logs for modal
  const filteredAuditLogs = useMemo(() => {
    return allAuditLogs.filter(log => {
      const matchesSearch = 
        logsSearch === '' ||
        log.title.toLowerCase().includes(logsSearch.toLowerCase()) ||
        log.description.toLowerCase().includes(logsSearch.toLowerCase()) ||
        (log.userEmail && log.userEmail.toLowerCase().includes(logsSearch.toLowerCase())) ||
        (log.userName && log.userName.toLowerCase().includes(logsSearch.toLowerCase()));

      const matchesType = 
        logsFilterType === 'all' ||
        (logsFilterType === 'payments' && (log.type === 'payment_approved' || log.type === 'payment_pending' || log.type === 'payment_rejected')) ||
        (logsFilterType === 'students' && log.type === 'student_signup') ||
        (logsFilterType === 'lessons' && log.type === 'lesson_completed');

      return matchesSearch && matchesType;
    });
  }, [allAuditLogs, logsSearch, logsFilterType]);

  // Dynamic Recent Activities top 5
  const dynamicActivities = useMemo(() => {
    return allAuditLogs.slice(0, 5).map(log => {
      let icon = 'history';
      let color = 'text-primary';
      if (log.type === 'payment_approved') {
        icon = 'payments';
        color = 'text-secondary';
      } else if (log.type === 'payment_rejected') {
        icon = 'cancel';
        color = 'text-error';
      } else if (log.type === 'payment_pending') {
        icon = 'hourglass_top';
        color = 'text-[#e9c349]';
      } else if (log.type === 'student_signup') {
        icon = 'person_add';
        color = 'text-emerald-400';
      } else if (log.type === 'lesson_completed') {
        icon = 'check_circle';
        color = 'text-sky-400';
      }

      return {
        id: log.id,
        icon,
        text: log.description,
        time: log.timestamp.toLocaleDateString('pt-AO', { hour: '2-digit', minute: '2-digit' }),
        color,
        log
      };
    });
  }, [allAuditLogs]);

  // =========================================================================
  // REAL REPORT CSV EXPORT
  // =========================================================================
  const handleExport = () => {
    try {
      const csvRows: string[] = [];
      
      // Header Section
      csvRows.push('RELATÓRIO DE DESEMPENHO E AUDITORIA - MARKS O MONSTRO ACADEMY');
      csvRows.push(`Data de Emissão: ${new Date().toLocaleString('pt-AO')}`);
      csvRows.push(`Faturamento Total Aprovado: ${revenueFormatted}`);
      csvRows.push(`Total de Estudantes Registados: ${totalStudents}`);
      csvRows.push(`Estudantes com Assinatura Ativa: ${activeStudents}`);
      csvRows.push(`Total de Aulas Concluídas: ${totalCompletions}`);
      csvRows.push('');
      
      // Transactions Table
      csvRows.push('TRANSAÇÕES & HISTÓRICO DE PAGAMENTOS');
      csvRows.push('Referência,Estudante,E-mail,Curso,Valor (Kz),Status,Data');
      
      effectiveTransactions.forEach(t => {
        const tDate = parseDate(t.createdAt);
        const dateFormatted = tDate ? tDate.toLocaleString('pt-AO') : '-';
        const cleanRef = (t.referenceNumber || 'N/A').replace(/,/g, ' ');
        const cleanName = (t.userName || 'Estudante').replace(/,/g, ' ');
        const cleanEmail = (t.userEmail || '').replace(/,/g, ' ');
        const cleanCourse = (t.courseTitle || 'Curso Marks ACADEMY').replace(/,/g, ' ');
        const amount = t.amount || 0;
        const status = t.status === 'approved' ? 'Aprovado' : t.status === 'rejected' ? 'Recusado' : 'Pendente';
        csvRows.push(`"${cleanRef}","${cleanName}","${cleanEmail}","${cleanCourse}",${amount},"${status}","${dateFormatted}"`);
      });

      csvRows.push('');
      csvRows.push('LISTA DE ESTUDANTES');
      csvRows.push('Nome,E-mail,Status de Acesso,Cursos Matriculados,Aulas Concluídas');
      
      effectiveStudents.forEach(s => {
        const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Estudante';
        const email = s.email || '';
        const status = s.subscriptionStatus === 'active' ? 'Ativo' : 'Inativo / Pendente';
        const courses = (s.enrolledCourses || []).join('; ');
        const completed = (s.completedLessons || []).length;
        csvRows.push(`"${name}","${email}","${status}","${courses}",${completed}`);
      });

      const csvContent = '\uFEFF' + csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `relatorio_marks_academy_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showNotification('Relatório completo exportado em CSV com sucesso!');
    } catch (err) {
      console.error('Error generating export CSV:', err);
      showNotification('Erro ao gerar arquivo de exportação.');
    }
  };

  const timeFilterLabels: Record<TimeFilter, string> = {
    '7d': 'Últimos 7 Dias',
    '30d': 'Últimos 30 Dias',
    '6m': 'Últimos 6 Meses',
    '1y': 'Último 1 Ano',
    'all': 'Todo o Período'
  };

  return (
    <div className="flex h-screen bg-background text-on-surface font-body overflow-hidden selection:bg-primary/30 selection:text-primary">
      {/* Toast Notification */}
      {showToast && (
        <div className="fixed top-4 right-4 z-[9999] bg-surface-container-high border border-primary/30 text-on-surface px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
          <span className="material-symbols-outlined text-primary">check_circle</span>
          <span className="text-sm font-bold">{toastMessage}</span>
        </div>
      )}

      <Sidebar />
      
      <main className="flex-1 overflow-y-auto relative lg:ml-72 ml-0 pt-16 lg:pt-0">
        <div className="fixed inset-0 pointer-events-none z-[99] opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")' }}></div>
        
        <div className="p-4 sm:p-8 lg:p-12 max-w-7xl mx-auto relative z-10">
          <PushSubscriptionBanner userRole="producer" />

          <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 sm:mb-12">
            <div>
              <div className="flex items-center gap-2 text-secondary mb-1">
                <span className="material-symbols-outlined text-sm">monitoring</span>
                <span className="text-xs font-bold uppercase tracking-widest font-label">Visão Geral</span>
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tighter font-headline">Dashboard Premium</h1>
            </div>
            
            {/* Header Controls */}
            <div className="flex gap-4 relative">
              <div className="relative">
                <button 
                  id="btn-filter-period"
                  type="button"
                  onClick={() => setIsTimeDropdownOpen(!isTimeDropdownOpen)}
                  className="bg-surface-container-high border border-outline-variant/20 px-4 py-2 rounded-lg text-sm font-medium hover:bg-surface-container-highest transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Calendar className="w-4 h-4 text-primary" />
                  <span>{timeFilterLabels[timeFilter]}</span>
                  <ChevronDown className={`w-4 h-4 text-stone-400 transition-transform ${isTimeDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isTimeDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-[#1a1a1a] border border-outline-variant/20 rounded-xl shadow-2xl z-50 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                    {(['7d', '30d', '6m', '1y', 'all'] as TimeFilter[]).map((f) => (
                      <button
                        key={f}
                        onClick={() => {
                          setTimeFilter(f);
                          setIsTimeDropdownOpen(false);
                          showNotification(`Filtro atualizado: ${timeFilterLabels[f]}`);
                        }}
                        className={`w-full text-left px-4 py-2 text-xs font-medium flex items-center justify-between hover:bg-stone-800 transition-colors cursor-pointer ${
                          timeFilter === f ? 'text-primary font-bold bg-primary/10' : 'text-stone-300'
                        }`}
                      >
                        <span>{timeFilterLabels[f]}</span>
                        {timeFilter === f && <Check className="w-3.5 h-3.5 text-primary" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <NotificationCenter userRole="admin" userId={auth.currentUser?.uid} />

              <button 
                id="btn-export-dashboard-report"
                type="button"
                onClick={handleExport}
                className="bg-primary text-on-primary px-4 py-2 rounded-lg text-sm font-bold hover:opacity-90 transition-opacity flex items-center gap-2 shadow-[0_0_15px_rgba(233,195,73,0.2)] cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Exportar Relatório
              </button>
            </div>
          </header>

          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6 mb-12">
            <div className="bg-surface-container p-6 rounded-2xl border border-outline-variant/10 relative overflow-hidden group lg:col-span-3">
              <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
                <span className="material-symbols-outlined text-4xl text-primary">account_balance_wallet</span>
              </div>
              <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">Faturamento Real Aprovado</p>
              <h3 className="text-3xl sm:text-4xl font-black font-headline text-on-surface mb-2">{revenueFormatted}</h3>
              <div className="flex items-center gap-1 text-secondary text-xs font-medium">
                <span className="material-symbols-outlined text-sm">payments</span>
                <span>Baseado em transações aprovadas</span>
              </div>
            </div>
            <div className="bg-surface-container p-6 rounded-2xl border border-outline-variant/10 relative overflow-hidden group lg:col-span-1">
              <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
                <span className="material-symbols-outlined text-4xl text-primary">group</span>
              </div>
              <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">Estudantes Registados</p>
              <h3 className="text-3xl font-black font-headline text-on-surface mb-2">{totalStudents}</h3>
              <div className="flex items-center gap-1 text-secondary text-xs font-medium">
                <span className="material-symbols-outlined text-sm">person_add</span>
                <span>{activeStudents} ativos</span>
              </div>
            </div>
            <div className="bg-surface-container p-6 rounded-2xl border border-outline-variant/10 relative overflow-hidden group lg:col-span-1">
              <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
                <span className="material-symbols-outlined text-4xl text-error">cancel</span>
              </div>
              <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">Taxa de Adesão</p>
              <h3 className="text-3xl font-black font-headline text-on-surface mb-2">
                {totalStudents > 0 ? Math.round((activeStudents / totalStudents) * 100) : 0}%
              </h3>
              <div className="flex items-center gap-1 text-secondary text-xs font-medium">
                <span className="material-symbols-outlined text-sm">done_all</span>
                <span>Percentual ativo</span>
              </div>
            </div>
            <div className="bg-surface-container p-6 rounded-2xl border border-outline-variant/10 relative overflow-hidden group lg:col-span-1">
              <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
                <span className="material-symbols-outlined text-4xl text-primary">play_circle</span>
              </div>
              <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">Aulas Concluídas</p>
              <h3 className="text-3xl font-black font-headline text-on-surface mb-2">{totalCompletions}</h3>
              <div className="flex items-center gap-1 text-secondary text-xs font-medium">
                <span className="material-symbols-outlined text-sm">trending_up</span>
                <span>Checklists validados</span>
              </div>
            </div>
          </div>

          {/* Recent Transactions & Payment References - PENDING VALIDATION ONLY */}
          <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6 lg:p-8 mb-8 sm:mb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2 text-primary mb-1">
                  <span className="material-symbols-outlined text-base">receipt_long</span>
                  <span className="text-xs font-bold uppercase tracking-widest font-label">Validação de Pagamentos (Pendentes)</span>
                </div>
                <h3 className="text-xl font-extrabold font-headline text-on-surface">Aguardando Aprovação de Comprovativos</h3>
              </div>
              
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative w-full sm:w-64">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">search</span>
                  <input
                    type="text"
                    placeholder="Pesquisar por nome, curso ou data..."
                    value={pendingSearch}
                    onChange={(e) => setPendingSearch(e.target.value)}
                    className="w-full bg-[#121212] border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-[#e9c349]"
                  />
                </div>
                <span className="text-xs px-3 py-1 bg-surface-container-highest rounded-full text-[#e9c349] font-mono font-bold whitespace-nowrap">
                  {effectiveTransactions.filter(t => !t.status || t.status === 'pending').length} Pendentes
                </span>
              </div>
            </div>

            {effectiveTransactions.filter(t => !t.status || t.status === 'pending').length === 0 ? (
              <div className="text-center py-10 border border-dashed border-outline-variant/20 rounded-xl bg-surface-container-lowest/30">
                <span className="material-symbols-outlined text-4xl text-stone-600 mb-2">done_all</span>
                <p className="text-sm text-stone-400">Nenhuma transação pendente de validação no momento. Todas foram processadas e arquivadas.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-stone-500 font-label border-b border-outline-variant/10">
                    <tr>
                      <th className="pb-3 px-3">Referência</th>
                      <th className="pb-3 px-3">Estudante</th>
                      <th className="pb-3 px-3">Curso</th>
                      <th className="pb-3 px-3">Data/Hora</th>
                      <th className="pb-3 px-3">Status</th>
                      <th className="pb-3 px-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/5 font-body">
                    {effectiveTransactions
                      .filter(t => !t.status || t.status === 'pending')
                      .filter(t => {
                        if (!pendingSearch.trim()) return true;
                        const q = pendingSearch.toLowerCase();
                        const name = (t.userName || '').toLowerCase();
                        const email = (t.userEmail || '').toLowerCase();
                        const course = (t.courseTitle || '').toLowerCase();
                        const ref = (t.referenceNumber || '').toLowerCase();
                        const dateStr = t.createdAt ? (t.createdAt.toDate ? t.createdAt.toDate().toLocaleString('pt-AO') : new Date(t.createdAt).toLocaleString('pt-AO')).toLowerCase() : '';
                        return name.includes(q) || email.includes(q) || course.includes(q) || ref.includes(q) || dateStr.includes(q);
                      })
                      .map((tx) => {
                        const student = students.find(s => s.id === tx.userId || (s.email && tx.userEmail && s.email.toLowerCase() === tx.userEmail.toLowerCase()));
                        const studentPhone = tx.userPhone || student?.phone || student?.whatsapp || student?.phoneNumber || tx.referenceNumber || 'N/A';
                        const cleanPhoneDigits = studentPhone !== 'N/A' ? studentPhone.replace(/[^0-9]/g, '') : '';
                        const whatsappUrl = cleanPhoneDigits ? `https://wa.me/${cleanPhoneDigits}?text=${encodeURIComponent(`Olá ${tx.userName || 'Estudante'}, entramos em contato sobre o seu comprovativo para o curso ${tx.courseTitle || 'Marks ACADEMY'}.`)}` : '#';

                        return (
                      <tr key={tx.id} className="hover:bg-surface-container-highest/30 transition-colors">
                        <td className="py-3 px-3">
                          {cleanPhoneDigits ? (
                            <a 
                              href={whatsappUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono font-bold text-xs hover:bg-emerald-500/20 transition-colors shadow-sm"
                              title="Contactar via WhatsApp"
                            >
                              <span className="material-symbols-outlined text-sm">chat</span>
                              <span>{studentPhone}</span>
                            </a>
                          ) : (
                            <span className="font-mono font-bold text-stone-400 text-xs">{tx.referenceNumber || 'N/A'}</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <p className="font-medium text-on-surface">{tx.userName || 'Estudante'}</p>
                          <p className="text-[11px] text-stone-500">{tx.userEmail || tx.userId || ''}</p>
                        </td>
                        <td className="py-3 px-3 text-stone-300">{tx.courseTitle || 'Método Fusion'}</td>
                        <td className="py-3 px-3 text-stone-400 text-xs font-mono">
                          {tx.createdAt ? (tx.createdAt.toDate ? tx.createdAt.toDate().toLocaleString('pt-AO') : new Date(tx.createdAt).toLocaleString('pt-AO')) : '-'}
                        </td>
                        <td className="py-3 px-3">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-primary/15 text-primary border border-primary/30 animate-pulse">
                            Pendente
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right relative">
                          <div className="relative inline-block text-left">
                            <button
                              type="button"
                              onClick={() => setActivePendingDropdownTxId(activePendingDropdownTxId === tx.id ? null : tx.id)}
                              className="p-1.5 text-stone-400 hover:text-white hover:bg-stone-800 rounded-lg transition-colors cursor-pointer inline-flex items-center"
                            >
                              <span className="material-symbols-outlined text-base">more_vert</span>
                            </button>

                            {activePendingDropdownTxId === tx.id && (
                              <>
                                <div className="fixed inset-0 z-40" onClick={() => setActivePendingDropdownTxId(null)} />
                                <div className="absolute right-0 mt-1 w-48 bg-[#1e1e1e] border border-stone-800 rounded-xl shadow-2xl z-50 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100 text-left">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActivePendingDropdownTxId(null);
                                      setTxToApprove(tx);
                                    }}
                                    className="w-full px-3 py-2 text-xs text-secondary hover:bg-stone-800 transition-colors flex items-center gap-2 cursor-pointer font-bold"
                                  >
                                    <span className="material-symbols-outlined text-sm">check_circle</span>
                                    Aprovar & Arquivar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActivePendingDropdownTxId(null);
                                      setTxToReject(tx);
                                    }}
                                    className="w-full px-3 py-2 text-xs text-error hover:bg-stone-800 transition-colors flex items-center gap-2 cursor-pointer font-bold"
                                  >
                                    <span className="material-symbols-outlined text-sm">cancel</span>
                                    Recusar
                                  </button>
                                  <div className="pt-1 mt-1 border-t border-stone-800">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActivePendingDropdownTxId(null);
                                        setTxToDelete(tx);
                                      }}
                                      className="w-full px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2 cursor-pointer font-bold"
                                    >
                                      <span className="material-symbols-outlined text-sm">delete</span>
                                      Eliminar Transação
                                    </button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* BOTÃO PARA ABRIR O HISTÓRICO DE PAGAMENTOS EM POPUP */}
          <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6 mb-12 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center border border-secondary/20 flex-shrink-0">
                <span className="material-symbols-outlined text-2xl">history</span>
              </div>
              <div>
                <h4 className="text-base font-bold text-white font-headline">Histórico de Pagamentos (Arquivados & Processados)</h4>
                <p className="text-xs text-stone-400">Consulte transações aprovadas e recusadas com detalhes completos de data, hora, ID e curso.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setHistoryPage(1); setIsHistoryModalOpen(true); }}
              className="px-5 py-2.5 bg-secondary text-surface font-bold text-xs rounded-xl hover:brightness-110 transition-all flex items-center gap-2 cursor-pointer shadow-md whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-base">visibility</span>
              <span>Abrir Histórico ({transactions.filter(t => t.status === 'approved' || t.status === 'rejected').length})</span>
            </button>
          </div>

          {/* ========================================================================= */}
          {/* SECTION: FUNCTIONAL CHART */}
          {/* ========================================================================= */}
          <div className="w-full">
            {/* Chart Area - 100% Functional & Interactive */}
            <div id="card-revenue-chart" className="w-full bg-surface-container p-6 sm:p-8 rounded-2xl border border-outline-variant/10 flex flex-col justify-between">
              <div>
                {/* Header Controls */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <div className="flex items-center gap-2 text-primary mb-1">
                      <TrendingUp className="w-4 h-4" />
                      <span className="text-xs font-bold uppercase tracking-widest font-label">Análise Financeira em Tempo Real</span>
                    </div>
                    <h3 className="font-bold font-headline text-xl text-white">Crescimento de Receita</h3>
                  </div>

                  {/* Interactive Metric & View Toggle */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Metric Select */}
                    <div className="flex bg-surface-container-lowest p-1 rounded-xl border border-outline-variant/10">
                      <button
                        type="button"
                        onClick={() => setMetricType('revenue')}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                          metricType === 'revenue' 
                            ? 'bg-primary text-black shadow-sm' 
                            : 'text-stone-400 hover:text-white'
                        }`}
                      >
                        Receita (Kz)
                      </button>
                      <button
                        type="button"
                        onClick={() => setMetricType('transactions')}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                          metricType === 'transactions' 
                            ? 'bg-primary text-black shadow-sm' 
                            : 'text-stone-400 hover:text-white'
                        }`}
                      >
                        Vendas (Qtd)
                      </button>
                      <button
                        type="button"
                        onClick={() => setMetricType('students')}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                          metricType === 'students' 
                            ? 'bg-primary text-black shadow-sm' 
                            : 'text-stone-400 hover:text-white'
                        }`}
                      >
                        Estudantes
                      </button>
                    </div>

                    {/* Chart Style: Bar vs Area */}
                    <div className="flex bg-surface-container-lowest p-1 rounded-xl border border-outline-variant/10">
                      <button
                        type="button"
                        onClick={() => setChartStyle('bar')}
                        className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                          chartStyle === 'bar' ? 'bg-stone-700 text-primary' : 'text-stone-500 hover:text-stone-300'
                        }`}
                        title="Visualização em Barras"
                      >
                        <BarChart3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setChartStyle('area')}
                        className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                          chartStyle === 'area' ? 'bg-stone-700 text-primary' : 'text-stone-500 hover:text-stone-300'
                        }`}
                        title="Visualização em Área / Curva"
                      >
                        <Activity className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Sub-header Summary Stats Banner */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 mb-6 rounded-xl bg-surface-container-lowest/60 border border-outline-variant/5 text-xs">
                  <div>
                    <span className="text-stone-400 block text-[11px]">Total no Período</span>
                    <span className="font-bold text-white font-mono text-sm">
                      {metricType === 'revenue' 
                        ? new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(totalPeriodRevenue)
                        : metricType === 'transactions'
                        ? `${filteredTransactions.length} vendas`
                        : `${totalStudents} estudantes`
                      }
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[11px]">Pico de Desempenho</span>
                    <span className="font-bold text-[#e9c349] font-mono text-sm">{peakPeriodValue}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[11px]">Intervalo Ativo</span>
                    <span className="font-bold text-stone-200 font-mono text-sm">{timeFilterLabels[timeFilter]}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[11px]">Taxa de Conversão</span>
                    <span className="font-bold text-secondary font-mono text-sm">
                      {transactions.length > 0 ? `${Math.round((transactions.filter(t => t.status === 'approved').length / transactions.length) * 100)}%` : '100%'}
                    </span>
                  </div>
                </div>

                {/* Interactive Dynamic Chart Box */}
                <div 
                  id="dynamic-chart-canvas"
                  className="h-64 w-full bg-surface-container-highest/40 rounded-xl border border-outline-variant/10 p-4 relative overflow-hidden flex flex-col justify-between"
                  onMouseLeave={() => setHoveredDataPoint(null)}
                >
                  {/* CHART RENDERING: BARS OR AREA */}
                  <div className="relative z-10 h-[240px] w-full pt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      {chartStyle === 'area' ? (
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#e9c349" stopOpacity={0.4}/>
                              <stop offset="95%" stopColor="#e9c349" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" opacity={0.5} />
                          <XAxis 
                            dataKey="label" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#78716c', fontSize: 10 }}
                            dy={10}
                          />
                          <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#78716c', fontSize: 10 }}
                            tickFormatter={(value) => {
                              if (metricType === 'revenue') {
                                return value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value;
                              }
                              return value;
                            }}
                          />
                          <RechartsTooltip 
                            content={({ active, payload, label }) => {
                              if (active && payload && payload.length) {
                                const val = payload[0].value as number;
                                const data = payload[0].payload;
                                return (
                                  <div className="bg-[#121212] border border-[#333] p-3 rounded-xl shadow-xl">
                                    <p className="text-xs text-stone-400 mb-1">{label}</p>
                                    <p className="text-sm font-bold text-[#e9c349] font-mono">
                                      {metricType === 'revenue' 
                                        ? new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0 }).format(val)
                                        : metricType === 'transactions'
                                        ? `${val} Vendas (${data.pending} pendentes)`
                                        : `${val} Estudantes`
                                      }
                                    </p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Area 
                            type="monotone" 
                            dataKey={metricType === 'revenue' ? 'revenue' : metricType === 'transactions' ? 'transactions' : 'students'}
                            stroke="#e9c349" 
                            strokeWidth={3}
                            fillOpacity={1} 
                            fill="url(#colorValue)" 
                            activeDot={{ r: 6, fill: '#e9c349', stroke: '#121212', strokeWidth: 2 }}
                          />
                        </AreaChart>
                      ) : (
                        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" opacity={0.5} />
                          <XAxis 
                            dataKey="label" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#78716c', fontSize: 10 }}
                            dy={10}
                          />
                          <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#78716c', fontSize: 10 }}
                            tickFormatter={(value) => {
                              if (metricType === 'revenue') {
                                return value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value;
                              }
                              return value;
                            }}
                          />
                          <RechartsTooltip 
                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                            content={({ active, payload, label }) => {
                              if (active && payload && payload.length) {
                                const val = payload[0].value as number;
                                const data = payload[0].payload;
                                return (
                                  <div className="bg-[#121212] border border-[#333] p-3 rounded-xl shadow-xl">
                                    <p className="text-xs text-stone-400 mb-1">{label}</p>
                                    <p className="text-sm font-bold text-[#e9c349] font-mono">
                                      {metricType === 'revenue' 
                                        ? new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0 }).format(val)
                                        : metricType === 'transactions'
                                        ? `${val} Vendas (${data.pending} pendentes)`
                                        : `${val} Estudantes`
                                      }
                                    </p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar 
                            dataKey={metricType === 'revenue' ? 'revenue' : metricType === 'transactions' ? 'transactions' : 'students'}
                            fill="#e9c349" 
                            radius={[4, 4, 0, 0]}
                          >
                            {
                              chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={hoveredDataPoint?.label === entry.label ? '#fcd34d' : '#e9c349'} />
                              ))
                            }
                          </Bar>
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-outline-variant/10 text-[11px] text-stone-500">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-primary"></span>
                      <span>Valores calculados em tempo real do banco de dados</span>
                    </span>
                    <span className="font-mono text-stone-400">Total: {revenueFormatted}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ========================================================================= */}
      {/* MODAL: CENTRAL DE LOGS RECORRENTES & AUDITORIA COMPLETA */}
      {/* ========================================================================= */}
      {isLogsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#181818] border border-outline-variant/20 rounded-2xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl flex flex-col max-h-[88vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-outline-variant/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white font-headline">Central de Logs & Auditoria da Academia</h3>
                  <p className="text-xs text-stone-400">Histórico completo de matrículas, pagamentos e acessos</p>
                </div>
              </div>
              <button 
                onClick={() => setIsLogsModalOpen(false)}
                className="p-2 rounded-xl text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter and Search Bar */}
            <div className="py-4 flex flex-col sm:flex-row gap-3 items-center justify-between border-b border-outline-variant/10">
              {/* Search */}
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  type="text"
                  placeholder="Pesquisar por estudante, e-mail..."
                  value={logsSearch}
                  onChange={(e) => setLogsSearch(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-stone-500 focus:outline-none focus:border-primary"
                />
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                {[
                  { id: 'all', label: 'Todos' },
                  { id: 'payments', label: 'Pagamentos' },
                  { id: 'students', label: 'Estudantes' },
                  { id: 'lessons', label: 'Aulas' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setLogsFilterType(tab.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                      logsFilterType === tab.id 
                        ? 'bg-primary text-black' 
                        : 'bg-surface-container-high text-stone-400 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Logs List Container */}
            <div className="flex-1 overflow-y-auto py-4 space-y-3 pr-1">
              {filteredAuditLogs.length > 0 ? (
                filteredAuditLogs.map(log => (
                  <div 
                    key={log.id}
                    className="p-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant/10 flex items-start gap-3.5 hover:border-outline-variant/30 transition-all"
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      log.type === 'payment_approved' ? 'bg-secondary/15 text-secondary border border-secondary/30' :
                      log.type === 'payment_rejected' ? 'bg-error/15 text-error border border-error/30' :
                      log.type === 'payment_pending' ? 'bg-[#e9c349]/15 text-[#e9c349] border border-[#e9c349]/30' :
                      log.type === 'student_signup' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
                      'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                    }`}>
                      <span className="material-symbols-outlined text-[16px]">
                        {log.type === 'payment_approved' ? 'check_circle' :
                         log.type === 'payment_rejected' ? 'cancel' :
                         log.type === 'payment_pending' ? 'hourglass_top' :
                         log.type === 'student_signup' ? 'person_add' : 'play_circle'}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-xs text-white">{log.title}</span>
                        <span className="text-[10px] text-stone-500 font-mono">
                          {log.timestamp.toLocaleString('pt-AO')}
                        </span>
                      </div>
                      <p className="text-xs text-stone-300 mt-1 leading-relaxed">{log.description}</p>
                      {log.metadata && (
                        <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded bg-surface-container-high text-stone-400 font-medium">
                          {log.metadata}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-stone-500 text-xs">
                  Nenhum log encontrado para o filtro selecionado.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-outline-variant/10 flex items-center justify-between">
              <span className="text-xs text-stone-400">
                Mostrando <strong className="text-white">{filteredAuditLogs.length}</strong> de {allAuditLogs.length} logs
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleExport}
                  className="px-4 py-2 bg-surface-container-highest hover:bg-surface-bright text-xs font-bold text-white rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Exportar Logs
                </button>
                <button
                  type="button"
                  onClick={() => setIsLogsModalOpen(false)}
                  className="px-5 py-2 bg-primary text-black text-xs font-bold rounded-xl hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: HISTÓRICO DE PAGAMENTOS ARQUIVADOS COM PAGINAÇÃO (20 POR PÁGINA) */}
      {/* ========================================================================= */}
      {isHistoryModalOpen && (() => {
        const baseArchived = transactions.filter(t => t.status === 'approved' || t.status === 'rejected');
        const archived = baseArchived.filter(tx => {
          if (!historySearch.trim()) return true;
          const q = historySearch.toLowerCase();
          const student = students.find(s => s.id === tx.userId || (s.email && tx.userEmail && s.email.toLowerCase() === tx.userEmail.toLowerCase()));
          const studentPhone = (tx.userPhone || student?.phone || student?.whatsapp || student?.phoneNumber || tx.referenceNumber || '').toLowerCase();
          const studentEmail = (tx.userEmail || student?.email || '').toLowerCase();
          const studentName = (tx.userName || (student?.firstName ? `${student.firstName} ${student.lastName || ''}`.trim() : student?.name) || '').toLowerCase();
          const courseTitle = (tx.courseTitle || '').toLowerCase();
          const refNum = (tx.referenceNumber || '').toLowerCase();
          return studentPhone.includes(q) || studentEmail.includes(q) || studentName.includes(q) || courseTitle.includes(q) || refNum.includes(q);
        });
        const itemsPerPage = 20;
        const totalPages = Math.ceil(archived.length / itemsPerPage) || 1;
        const startIndex = (historyPage - 1) * itemsPerPage;
        const currentItems = archived.slice(startIndex, startIndex + itemsPerPage);

        return (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-[#181818] border border-outline-variant/20 rounded-2xl max-w-7xl w-full p-6 sm:p-8 shadow-2xl flex flex-col max-h-[88vh] animate-in fade-in zoom-in-95 duration-200">
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-4 border-b border-outline-variant/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center border border-secondary/20">
                    <span className="material-symbols-outlined text-xl">history</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white font-headline">Histórico de Pagamentos (Arquivados & Processados)</h3>
                    <p className="text-xs text-stone-400">Total de {archived.length} transações registradas no histórico</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsHistoryModalOpen(false)}
                  className="p-2 rounded-xl text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Search Bar for Archived History */}
              <div className="py-3 border-b border-outline-variant/10">
                <div className="relative w-full sm:w-80">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">search</span>
                  <input
                    type="text"
                    placeholder="Pesquisar por nome, número ou e-mail..."
                    value={historySearch}
                    onChange={(e) => {
                      setHistorySearch(e.target.value);
                      setHistoryPage(1);
                    }}
                    className="w-full bg-[#121212] border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-[#e9c349]"
                  />
                </div>
              </div>

              {/* Table Container */}
              <div className="flex-1 overflow-y-auto py-4">
                {archived.length === 0 ? (
                  <div className="text-center py-16 text-stone-500 text-xs">
                    <span className="material-symbols-outlined text-4xl mb-2 text-stone-600">folder_open</span>
                    <p>Nenhum pagamento arquivado no histórico ainda.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs whitespace-nowrap">
                      <thead className="uppercase text-stone-500 font-label border-b border-outline-variant/10">
                        <tr>
                          <th className="pb-2.5 px-2.5">Data e Hora</th>
                          <th className="pb-2.5 px-2.5">Telefone</th>
                          <th className="pb-2.5 px-2.5">Estudante (E-mail / Nome)</th>
                          <th className="pb-2.5 px-2.5">Curso Assinado</th>
                          <th className="pb-2.5 px-2.5">Valor</th>
                          <th className="pb-2.5 px-2.5 text-right">Status</th>
                          <th className="pb-2.5 px-2.5 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/5 font-body">
                        {currentItems.map((tx) => {
                          const student = students.find(s => s.id === tx.userId || (s.email && tx.userEmail && s.email.toLowerCase() === tx.userEmail.toLowerCase()));
                          const studentPhone = tx.userPhone || student?.phone || student?.whatsapp || student?.phoneNumber || tx.referenceNumber || 'N/A';
                          const studentEmail = tx.userEmail || student?.email || 'N/A';
                          const studentName = tx.userName || (student?.firstName ? `${student.firstName} ${student.lastName || ''}`.trim() : student?.name) || 'Estudante';
                          return (
                          <tr key={tx.id} className="hover:bg-surface-container-highest/30 transition-colors">
                            <td className="py-2.5 px-2.5 text-stone-300 font-mono text-[11px]">
                              {tx.createdAt ? (tx.createdAt.toDate ? tx.createdAt.toDate().toLocaleString('pt-AO') : new Date(tx.createdAt).toLocaleString('pt-AO')) : '-'}
                            </td>
                            <td className="py-2.5 px-2.5">
                              <span className="font-mono font-bold text-on-surface text-xs">{studentPhone}</span>
                            </td>
                            <td className="py-2.5 px-2.5">
                              <p className="font-medium text-on-surface text-xs">{studentName}</p>
                              <p className="text-[10px] text-stone-500 font-mono">{studentEmail}</p>
                            </td>
                            <td className="py-2.5 px-2.5 text-stone-300 font-semibold text-xs">{tx.courseTitle || 'Método Fusion'}</td>
                            <td className="py-2.5 px-2.5 text-[#e9c349] font-bold font-mono text-xs">
                              {new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(tx.amount || 0)}
                            </td>
                            <td className="py-2.5 px-2.5 text-right">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                tx.status === 'approved' 
                                  ? 'bg-secondary/15 text-secondary border border-secondary/30'
                                  : 'bg-error/15 text-error border border-error/30'
                              }`}>
                                {tx.status === 'approved' ? 'Aprovado (Arquivado)' : 'Recusado'}
                              </span>
                            </td>
                            <td className="py-2.5 px-2.5 text-right relative">
                              <div className="relative inline-block text-left">
                                <button
                                  type="button"
                                  onClick={() => setActiveDropdownTxId(activeDropdownTxId === tx.id ? null : tx.id)}
                                  className="p-1.5 text-stone-400 hover:text-white hover:bg-stone-800 rounded-lg transition-colors cursor-pointer inline-flex items-center"
                                >
                                  <span className="material-symbols-outlined text-base">more_vert</span>
                                </button>
                                
                                {activeDropdownTxId === tx.id && (
                                  <div className="absolute right-0 mt-1 w-44 bg-[#1e1e1e] border border-stone-800 rounded-xl shadow-2xl z-50 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100 text-left">
                                    {tx.status === 'approved' && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActiveDropdownTxId(null);
                                          setTxToCancel(tx);
                                        }}
                                        className="w-full px-3 py-2 text-xs text-stone-300 hover:bg-stone-800 hover:text-[#e9c349] transition-colors flex items-center gap-2 cursor-pointer"
                                      >
                                        <span className="material-symbols-outlined text-sm flex-shrink-0">undo</span>
                                        Cancelar Subscrição
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveDropdownTxId(null);
                                        setTxToDelete(tx);
                                      }}
                                      className="w-full px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2 cursor-pointer"
                                    >
                                      <span className="material-symbols-outlined text-sm flex-shrink-0">delete</span>
                                      Eliminar Transação
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Pagination and Footer */}
              <div className="pt-4 border-t border-outline-variant/10 flex flex-col sm:flex-row items-center justify-between gap-4">
                <span className="text-xs text-stone-400">
                  Mostrando <strong className="text-white">{currentItems.length}</strong> de <strong className="text-white">{archived.length}</strong> registros (Página {historyPage} de {totalPages})
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={historyPage <= 1}
                    onClick={() => setHistoryPage(p => Math.max(p - 1, 1))}
                    className="px-3 py-1.5 bg-surface-container-highest disabled:opacity-40 text-xs font-bold text-white rounded-xl transition-colors cursor-pointer"
                  >
                    Anterior
                  </button>
                  <span className="text-xs text-stone-400 font-mono px-2">
                    {historyPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={historyPage >= totalPages}
                    onClick={() => setHistoryPage(p => Math.min(p + 1, totalPages))}
                    className="px-3 py-1.5 bg-surface-container-highest disabled:opacity-40 text-xs font-bold text-white rounded-xl transition-colors cursor-pointer"
                  >
                    Próxima
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsHistoryModalOpen(false)}
                    className="ml-4 px-5 py-2 bg-secondary text-surface text-xs font-bold rounded-xl hover:brightness-110 transition-all cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* CUSTOM DELETE CONFIRMATION MODAL */}
      {txToDelete && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#181818] border border-red-500/30 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center border border-red-500/20 mb-4">
              <span className="material-symbols-outlined text-2xl">delete_forever</span>
            </div>
            <h4 className="text-base font-bold text-white mb-2 font-headline">Eliminar Transação Permanentemente?</h4>
            <p className="text-xs text-stone-400 mb-6 leading-relaxed">
              Você está prestes a eliminar permanentemente a transação do estudante <strong className="text-white">{txToDelete.userName || 'Estudante'}</strong> com a referência <strong className="text-white font-mono">{txToDelete.referenceNumber || 'N/A'}</strong>. 
              {txToDelete.status === 'approved' && ' Como ela já foi aprovada, o curso correspondente também será removido da conta do estudante.'} Esta ação é irreversível.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setTxToDelete(null)}
                className="px-4 py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const t = txToDelete;
                  setTxToDelete(null);
                  await handleDeleteTransaction(t.id, t.userId, t.courseId, t.userEmail, t.status);
                }}
                className="px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Confirmar Eliminação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM CANCEL/REFUND CONFIRMATION MODAL */}
      {txToCancel && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#181818] border border-[#e9c349]/30 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-xl bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center border border-[#e9c349]/20 mb-4">
              <span className="material-symbols-outlined text-2xl">undo</span>
            </div>
            <h4 className="text-base font-bold text-white mb-2 font-headline">Cancelar Subscrição / Estornar?</h4>
            <p className="text-xs text-stone-400 mb-6 leading-relaxed">
              Deseja cancelar o acesso do estudante ao curso e retornar esta transação para o estado de análise <strong className="text-[#e9c349]">Pendente</strong>? O estudante perderá acesso imediato às aulas.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setTxToCancel(null)}
                className="px-4 py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Manter Ativa
              </button>
              <button
                type="button"
                onClick={async () => {
                  const t = txToCancel;
                  setTxToCancel(null);
                  await handleCancelSubscription(t);
                }}
                className="px-4 py-2.5 bg-[#e9c349] hover:bg-[#d4b03f] text-black text-xs font-extrabold rounded-xl transition-colors cursor-pointer"
              >
                Cancelar Subscrição
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM APPROVE CONFIRMATION MODAL */}
      {txToApprove && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#181818] border border-secondary/30 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center border border-secondary/20 mb-4">
              <span className="material-symbols-outlined text-2xl">check_circle</span>
            </div>
            <h4 className="text-base font-bold text-white mb-2 font-headline">Aprovar & Arquivar Pagamento?</h4>
            <p className="text-xs text-stone-400 mb-6 leading-relaxed">
              Deseja realmente aprovar o pagamento do estudante <strong className="text-white">{txToApprove.userName || 'Estudante'}</strong> e liberar imediatamente o acesso ao curso <strong className="text-white">{txToApprove.courseTitle || 'Método Fusion'}</strong>?
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setTxToApprove(null)}
                className="px-4 py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const t = txToApprove;
                  setTxToApprove(null);
                  await handleApproveTransaction(t);
                }}
                className="px-4 py-2.5 bg-secondary text-surface text-xs font-bold rounded-xl hover:brightness-110 transition-all cursor-pointer"
              >
                Confirmar Aprovação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM REJECT CONFIRMATION MODAL */}
      {txToReject && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#181818] border border-error/30 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-xl bg-error/10 text-error flex items-center justify-center border border-error/20 mb-4">
              <span className="material-symbols-outlined text-2xl">cancel</span>
            </div>
            <h4 className="text-base font-bold text-white mb-2 font-headline">Recusar Pagamento?</h4>
            <p className="text-xs text-stone-400 mb-6 leading-relaxed">
              Deseja realmente recusar o comprovativo enviado por <strong className="text-white">{txToReject.userName || 'Estudante'}</strong>? A transação será marcada como recusada e arquivada.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setTxToReject(null)}
                className="px-4 py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const t = txToReject;
                  setTxToReject(null);
                  await handleRejectTransaction(t);
                }}
                className="px-4 py-2.5 bg-error text-white text-xs font-bold rounded-xl hover:brightness-110 transition-all cursor-pointer"
              >
                Confirmar Recusa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
