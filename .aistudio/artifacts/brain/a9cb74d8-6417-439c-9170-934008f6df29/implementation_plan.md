# Plano de Implementação: Arquitetura de Segurança, Anti-Pirataria e Proteção de Dados (Marks o Monstro - ACADEMY)

## Resumo Executivo
Este plano estabelece uma arquitetura de segurança multicamadas para a plataforma **Marks o Monstro - ACADEMY**, garantindo proteção integral contra vazamento de senhas e dados sensíveis (PII), invasão de hackers, acesso não autorizado às aulas de trading do Método Fusion e pirataria de conteúdo digital.

---

## Decisões Críticas e Preferências do Usuário (Fase 1)
As três diretrizes fundamentais definidas pelo usuário para esta implementação são:
1. **Proteção Anti-Pirataria e Aulas de Trading**:
   - Bloqueio de download direto e cliques de contexto no reprodutor de vídeo.
   - Proteção e ofuscação contra gravadores de tela e atalhos de captura.
   - Marca d'água dinâmica e flutuante contendo o ID do estudante e o e-mail, alternando coordenadas e opacidade para inviabilizar o vazamento de aulas.
2. **Controle de Acesso por Dispositivos**:
   - Limite rigoroso de **até 2 dispositivos cadastrados por estudante**.
   - Gerenciamento inteligente de sessões: ao tentar conectar um terceiro dispositivo, o estudante visualiza a lista dos aparelhos ativos e deve obrigatoriamente revogar um deles para registrar o novo.
3. **Privacidade e Mascaramento de Dados Sensíveis (PII)**:
   - Exibição de dados completos (telefone, e-mail completo, dados financeiros e de transações) **exclusivamente para o Administrador Mestre ("Maestro")** (`fusionmetodo@gmail.com`).
   - Mascaramento e ofuscação em listagens e outros painéis (`ex****@gmail.com`, `+244 9** *** **9`), impedindo raspagem (scraping) ou extração indevida por terceiros.

---

## 1. Visão Geral & Conceito de Segurança

A proteção da plataforma opera sob o modelo de **Defesa em Profundidade (Defense-in-Depth)**:
- **Camada 0 (Infraestrutura & Autenticação)**: Firebase Auth com senhas com hash criptográfico irreversível (Argon2 / scrypt internamente pelo Firebase). Nenhuma senha em texto puro é trafegada ou armazenada no Firestore.
- **Camada 1 (Regras de Segurança no Backend / Firestore Rules)**: Validação a nível de banco de dados. Nenhum estudante pode consultar a lista completa de usuários ou transações de terceiros. Apenas o próprio usuário autenticado pode ler/escrever seu próprio documento ou o Maestro/Admin. As aulas (`/lessons`) e módulos requerem matrícula ativa comprovada (`isEnrolled`).
- **Camada 2 (Guard de Dispositivos & Sessões Ativas)**: Controle de `deviceFingerprint` salvo em `users/{uid}/registeredDevices`. Limite máximo de 2 slots de dispositivos.
- **Camada 3 (Player Seguro & Watermark Dinâmico Anti-Pirataria)**: Proteção na reprodução de vídeo (`WistiaPlayer` e biblioteca de vídeos), com overlay dinâmico com opacidade sutil (5-15%) movimentando-se aleatoriamente a cada 15-20 segundos com ID e e-mail do estudante.
- **Camada 4 (Mascaramento de PII & Governança no Frontend)**: Funções de mascaramento rigorosas para e-mails e números de WhatsApp em listagens, exceto quando autenticado como Maestro (`isMasterEmail`).

---

## 2. Experiência do Usuário & Design Visual

1. **Reprodutor de Vídeo Seguro (Player de Trading)**:
   - Interface imersiva, dark theme premium (`#0d1117`, detalhes dourados `#e9c349`).
   - Marca d'água sutil (não atrapalha a análise de gráficos de trading, mas é perfeitamente legível caso o vídeo seja gravado externamente).
   - Aviso visual caso ferramentas de captura ou atalhos de inspeção sejam acionados.
2. **Modal de Gestão de Dispositivos (Quando atinge o limite de 2)**:
   - Interface clara e segura avisando que o limite de 2 aparelhos da conta foi atingido.
   - Lista os 2 dispositivos registrados (ex: "Chrome em Windows - Ativo há 2 dias", "Safari em iPhone - Ativo agora").
   - Botão de ação: "Desconectar aparelho anterior para autorizar este dispositivo".
3. **Painel do Maestro & Diretório de Estudantes**:
   - Selo visual de "Modo Maestro Ativo" para `fusionmetodo@gmail.com`.
   - Visualização com ícone de cadeado para dados sensíveis mascarados vs. desbloqueados.

---

## 3. Decisões Técnicas & Trade-offs

| Desafio | Solução Adotada | Motivo / Trade-off |
| :--- | :--- | :--- |
| **Pirataria por gravação externa/câmera** | Marca d'água dinâmica com ID e E-mail se movendo periodicamente | Se alguém filmar a tela com o celular ou placa de captura externa, o ID e e-mail estarão gravados permanentemente sobre o gráfico do vídeo. |
| **Multi-login compartilhado entre conhecidos** | Limite estrito de 2 dispositivos registrados por estudante no Firestore | Permite ao estudante usar seu computador e seu celular, impedindo que sua conta seja rateada ou compartilhada em grupos de Telegram/WhatsApp. |
| **Vazamento de dados cadastrais** | Firestore Security Rules restritivas + Mascaramento nativo no Frontend | Garante que requisições diretas via SDK do Firebase por estudantes não possam ler a coleção `/users` de outros estudantes. |

---

## 4. Arquitetura Técnica & Diagrama de Segurança

```
[ Estudante no Navegador / App ]
               │
               ▼
   [ Camada 2: Guard de Dispositivos ]
   ├─ Gera Fingerprint do Dispositivo (Browser + OS + Canvas/Platform ID)
   ├─ Verifica `registeredDevices` no Firestore (Max 2)
   └─ Se > 2: Bloqueia navegação e exibe DeviceRevocationModal
               │
               ▼
   [ Camada 1: Firestore Security Rules ]
   ├─ `/users/{userId}`: Apenas `request.auth.uid == userId` ou `isMasterAdmin()`
   ├─ `/lessons/{lessonId}`: Apenas usuários com `courseId in user.enrolledCourses`
   └─ `/transactions`: Somente o dono da compra ou `isMasterAdmin()`
               │
               ▼
   [ Camada 3: Player Seguro & Watermark ]
   ├─ Bloqueio de ContextMenu (botão direito)
   ├─ Prevenção de atalhos de devtools / gravação
   └─ Watermark dinâmico flutuante (E-mail + UID) sobreposto ao vídeo
               │
               ▼
   [ Camada 4: Mascaramento de PII ]
   ├─ `isMasterEmail(user.email)` -> Vê e-mails e telefones completos
   └─ Demais perfis -> `jo**@***.com`, `+244 9** *** **0`
```

---

## 5. Etapas Detalhadas de Implementação

- **Etapa 1: Atualização e Validação das Regras do Firestore (`firestore.rules`)**
  - Reforçar que `/users` não permite `list` para estudantes comuns.
  - Blindar as coleções de transações, contratos e aulas.
  - Publicação imediata das regras via `DeployRules` RPC.
- **Etapa 2: Implementação do Serviço de Fingerprint e Limite de 2 Dispositivos**
  - Implementar em `src/utils/deviceDetection.ts` a geração de identificador consistente de dispositivo.
  - Criar o modal `DeviceLimitModal.tsx` para exibição e revogação de aparelhos quando houver tentativa de 3º dispositivo.
  - Integrar a validação na inicialização da sessão em `src/App.tsx`.
- **Etapa 3: Fortalecimento Anti-Pirataria no Reprodutor de Aulas (`WistiaPlayer.tsx` / `VideoLibrary.tsx`)**
  - Adicionar o componente dinâmico de marca d'água flutuante (`FloatingWatermark.tsx`).
  - Bloquear botão direito (`contextmenu`), atalhos de impressão/gravação e seleção de texto no player.
- **Etapa 4: Mascaramento de Dados PII em Listagens (`StudentDirectory.tsx` e `Analytics.tsx`)**
  - Criar utilitário `src/utils/maskUtils.ts` com funções `maskEmail` e `maskPhone`.
  - Aplicar nas tabelas e cards para que apenas `fusionmetodo@gmail.com` visualize os dados desmascarados.
- **Etapa 5: Testes e Compilação Final**
  - Executar `compile_applet` e `lint_applet` para assegurar integridade de todo o sistema.
