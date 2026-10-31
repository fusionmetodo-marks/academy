export interface Coupon {
  id: string;
  code: string; // Ex: "PROMO10", "FUSION20"
  type: 'percentage' | 'fixed'; // Porcentagem (%) ou Valor Fixo (Kz)
  discountValue: number; // Ex: 10 para 10% ou 5000 para 5.000 Kz
  scope: 'general' | 'course' | 'all' | 'producer'; // 'general'/'all' = todos os cursos, 'course' = curso específico, 'producer' = apenas cursos do produtor
  courseId?: string; // ID do curso se for específico
  courseTitle?: string; // Título do curso para exibição
  producerId?: string;
  producerEmail?: string; // ID do produtor para o escopo 'producer'
  active: boolean; // Ativo / Inativo
  createdAt?: string;
  usageCount?: number;
  authorId?: string;
  authorEmail?: string; // ID do produtor que criou o cupão (se for de produtor)
}

export interface PlatformSettings {
  supportWhatsApp: string; // Ex: "244900000000" (Sem o + ou espaços)
  platformName?: string;
  defaultCurrency?: string;
  logoUrl?: string;
  certificateTemplate?: string;
}

export interface Transaction {
  id: string;
  userId: string;
  userEmail?: string;
  userName: string;
  courseId: string;
  courseTitle: string;
  referenceNumber: string; // NOVO: Número da transação/referência
  paymentMethod?: string;
  amount?: number;
  originalAmount?: number;
  discountAmount?: number;
  appliedCoupon?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: any;
  proofUrl?: string;
  producerId?: string;
  producerEmail?: string; // ID do produtor recebedor
}

export interface LessonLink {
  id?: string;
  label: string;
  url: string;
}

export interface Lesson {
  id: string;
  moduleId?: string;
  courseId?: string;
  title: string;
  duration: string;
  order?: number;
  // NOVOS CAMPOS PARA SUPORTAR MÚLTIPLAS FONTES:
  videoSource?: 'youtube' | 'wistia';
  videoData?: string; // Se for youtube, guarda o Link. Se for wistia, guarda o ID (código).
  videoUrl?: string; // Compatibilidade legado
  materials?: string;
  description?: string; // Descrição textual da aula
  links?: LessonLink[]; // Múltiplos links personalizados (WhatsApp, PDFs, etc)
}

export interface Module {
  id: string;
  title: string;
  status: 'published' | 'draft';
  lessons: Lesson[];
}

export interface Course {
  id: string;
  title: string;
  instructor: string;
  coverImage?: string;
  description?: string;
  structureType?: 'modules' | 'single_lesson' | 'direct_link';
  directLinkUrl?: string;
  singleLessonVideoSource?: 'youtube' | 'wistia';
  singleLessonVideoData?: string;
  singleLessonMaterials?: string;
  singleLessonDescription?: string;
  singleLessonLinks?: LessonLink[];
  modules: Module[];
  price?: number;
  authorId?: string;
  authorEmail?: string; // ID do produtor ou admin autor
  producerName?: string; // Nome de exibição do produtor
  producerPhone?: string; // WhatsApp de contacto do produtor
  producerIban?: string; // IBAN específico do produtor
  producerHolderName?: string; // Titular da conta do produtor
  producerBankName?: string; // Nome do Banco do produtor
  producerExpressPhone?: string; // Express do produtor
}

export interface UserProfile {
  uid: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: 'admin' | 'producer' | 'student';
  subscriptionStatus: 'active' | 'inactive' | 'pending';
  enrolledCourses?: string[];
  completedLessons?: string[];
  plan?: string;
  phone?: string;
  registeredAt?: string;
  // Campos específicos de Produtor e Contrato Digital
  producerPlan?: 'monthly' | 'quarterly' | 'semiannual' | 'none'; // 'monthly' ou 'semiannual'
  producerPlanStatus?: 'active' | 'pending' | 'expired';
  producerPlanExpiresAt?: string;
  producerIban?: string;
  producerHolderName?: string;
  producerBankName?: string;
  producerWhatsApp?: string;
  producerExpressPhone?: string;
  // Contrato Digital do Produtor
  contractAccepted?: boolean;
  contractAcceptedAt?: string;
  contractBillingFrequency?: 'monthly' | 'semiannual';
  contractSignerName?: string;
  contractSignerEmail?: string;
  contractSignerPhone?: string;
  contractSignerNif?: string;
  // Controle de Segurança de Dispositivos (Limite de até 2 aparelhos)
  registeredDevices?: RegisteredDevice[];
}

export interface RegisteredDevice {
  deviceId: string;
  deviceName: string;
  os: string;
  browser: string;
  lastLoginAt: string;
  ipHint?: string;
}
