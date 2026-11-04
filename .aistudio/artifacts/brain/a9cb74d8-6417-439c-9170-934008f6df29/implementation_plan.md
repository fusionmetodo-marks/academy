# Plano de Implementação: Sistema Rigoroso de Segurança e Proteção de Aulas

Implementação de uma arquitetura de segurança em camadas (Zero-Trust) para garantir que o acesso às aulas e aos links dos vídeos seja estritamente validado no servidor (backend e banco de dados), impedindo que usuários não autorizados ou hackers obtenham os links das aulas via inspeção de código ou manipulação de rede.

---

## 1. Servidor Proxy de Autorização de Vídeos (`server.ts`)
- Criar a rota de API protegida `/api/lessons/verify-access`.
- Exigir o envio do token de autenticação Firebase (`Authorization: Bearer <idToken>`).
- Validar no servidor se o usuário possui matrícula ativa no curso correspondente no Firestore antes de liberar qualquer resposta.
- Retornar uma resposta encriptada ou token temporário assinado com expiração de curto prazo para reprodução do vídeo no player.
- Ocultar URLs diretas de origens externas no código fonte do cliente e nas requisições públicas.

---

## 2. Regras Rígidas do Firestore (`firestore.rules`)
- Garantir que a leitura de aulas completas e conteúdos exclusivos seja restrita a alunos com o ID do curso presente no seu array `enrolledCourses` e com `subscriptionStatus == 'active'`.
- Bloquear estritamente qualquer tentativa do cliente de modificar o seu próprio papel (`role`), estado de assinatura (`subscriptionStatus`) ou matrículas (`enrolledCourses`).
- Permitir alteração de status de transação exclusivamente para o e-mail administrador mestre (`fusionmetodo@gmail.com` ou utilizadores autenticados com `role == 'admin'`).

---

## 3. Camada de Proteção da Interface do Player de Vídeo (`src/components/`)
- **Remoção de Elementos DOM Expostos**:
  - Impedir a renderização da URL bruta no HTML (`src`, `href` ou atributos inspecionáveis).
  - Utilizar renderização embutida com suporte a token de sessão e sandbox restrito.
- **Bloqueio de Ferramentas de Inspeção e Download**:
  - Desativar menu de contexto (clique direito `contextmenu`).
  - Bloquear atalhos de teclado de inspeção e captura (`F12`, `Ctrl+Shift+I`, `Ctrl+Shift+J`, `Ctrl+U`, `Ctrl+S`, `Cmd+Option+I`).
- **Marca d'Água Dinâmica Anti-Vazamento (Deterrence)**:
  - Exibir marca d'água semi-transparente e flutuante sobre o player com o Nome, E-mail e Telefone do aluno conectado para inibir gravação de tela.

---

## 4. Validação e Compilação
- Testar a validação de tipos e sintaxe através do `lint_applet`.
- Compilar o projeto completo via `compile_applet`.
