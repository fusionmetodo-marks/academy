# Implementation Plan: Universal Student Lesson Access Across All Browsers

## User Intent & Requirements
1. **Percebido & Confirmado**:
   - Compreendemos perfeitamente a sua solicitação. A conta de administrador funcionava em todos os navegadores porque a verificação do e-mail do administrador é instantânea e direta (`fusionmetodo@gmail.com`).
   - Nos outros navegadores e dispositivos, a conta dos alunos ficava bloqueada porque a verificação dependia de regras do Firestore que podiam falhar ao consultar o array `enrolledCourses`.

2. **Solução para Acesso Universal dos Alunos**:
   - Configurar a liberação para alunos de forma idêntica e fluida à do administrador: se o aluno possui conta ativa (`subscriptionStatus == 'active'`) ou possui o curso na sua lista de matrículas, o acesso às aulas é concedido instantaneamente em **qualquer navegador ou dispositivo**.
   - Atualizar e publicar as regras do Firestore (`firestore.rules`) via `deploy_firebase` para autorizar a leitura das aulas para estudantes autenticados ativos.

---

## User Review Required
> [!IMPORTANT]
> Atualizaremos as regras de segurança do Firestore e os componentes de verificação de aulas (`VideoLibrary.tsx`, `SecureVideoPlayer.tsx` e `enrollmentService.ts`). Todos os alunos ativos e matriculados terão acesso imediato e garantido às suas aulas em qualquer navegador.

---

## Proposed Changes

### Firestore Security Rules (`firestore.rules`)
- **Atualização de Acesso às Aulas (`/lessons/{lessonId}`)**:
  - Permitir a leitura de aulas para qualquer usuário logado (`isSignedIn()`) que possua conta ativa (`subscriptionStatus == 'active'`), curso matriculado ou privilégios de administração.
  - Publicar as novas regras com o utilitário `deploy_firebase`.

---

### Serviço de Matrícula e Perfil (`src/services/enrollmentService.ts`)
- **Garantia de Status Ativo no Perfil**:
  - Em `subscribeUserEnrollments`, definir o status padrão como `'active'` caso o estudante tenha registro de perfil ou transação aprovada.
  - Sincronizar o array `enrolledCourses` e garantir correspondência por e-mail e UID.

---

### Player de Vídeo e Sala de Aula (`src/pages/VideoLibrary.tsx` e `src/components/SecureVideoPlayer.tsx`)
- **Liberação Universal na Interface**:
  - Atualizar a verificação `hasCourseAccess` para conceder acesso imediato se `userProfile.subscriptionStatus === 'active'` ou se o curso constar em `enrolledCourseIds` ou se for Administrador.
  - No `SecureVideoPlayer.tsx`, autorizar a reprodução das aulas sem bloqueios de navegador para todos os alunos ativos.

---

## Verification Plan

### Deployment & Verification
1. Aplicar as edições nos arquivos do projeto.
2. Executar `deploy_firebase` para implantar as novas `firestore.rules`.
3. Executar `compile_applet` e `lint_applet` juntos para validar que não existem erros de compilação.
4. Reiniciar o servidor de desenvolvimento com `restart_dev_server`.
5. Testar a reprodução e verificação de acesso para garantir funcionamento universal.
