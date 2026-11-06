# Sistema de Proteção DRM e Restrição de Vídeo Wistia

Arquitetura de proteção avançada para vídeo aulas utilizando restrição de domínio, tokens criptografados de sessão efêmera, marca d'água forense dinâmica e escudo anti-gravação de tela.

## Decisões Confirmadas com o Utilizador

> [!IMPORTANT]
> - **Abordagem DRM Selecionada**: Restrição estrita de domínio Wistia combinada com tokens criptografados de sessão assinados pelo servidor.
> - **Proteções Ativas no Player**: Descriptografia de tokens de sessão, marca d'água forense dinâmica flutuante (Nome, E-mail e Telefone do estudante) e proteção contra gravação/captura de tela (bloqueio de atalhos de inspeção e cortina de privacidade).

---

## 1. Visão Geral da Arquitetura de Proteção

O sistema combina 4 camadas de segurança complementares para blindar as aulas contra pirataria, downloads indevidos e compartilhamento:

1. **Restrição de Domínio no Provedor (Wistia Domain Locking)**:
   - Configuração de trava de domínio no Wistia para autorizar reprodução exclusivamente nas URLs oficiais da plataforma. Qualquer tentativa de carregar o vídeo fora da plataforma (como em extensões de download, leitores de mídia externos ou sites de terceiros) é bloqueada na fonte.
   - Bloqueio de download nativo desativado em todas as mídias.

2. **Handshake de Sessão Criptografada (Stream Session Tokens)**:
   - Antes de iniciar o player, o frontend solicita uma autorização ao endpoint `/api/lessons/verify-access`.
   - O servidor verifica a matrícula ativa e gera um token efêmero com assinatura HMAC-SHA256 contendo `userId`, `courseId`, `lessonId` e tempo de expiração (1 hora).
   - O player só renderiza os componentes de reprodução após validação bem-sucedida do token.

3. **Marca D'Água Forense Dinâmica (Anti-Vazamento Rastreável)**:
   - Sobreposição flutuante semitransparente que se move de forma contínua e randômica sobre o vídeo a cada 6 segundos.
   - Exibe os dados oficiais do estudante autenticado (Nome Completo, E-mail e Telefone).
   - Se o estudante tentar gravar a tela com câmera ou software externo, sua identidade fica gravada no vídeo, permitindo banimento imediato e responsabilização legal.

4. **Escudo Anti-Gravação e Anti-Inspeção no Cliente**:
   - Bloqueio de botão direito do mouse (`contextmenu`) no player.
   - Bloqueio de atalhos de ferramentas de desenvolvedor (`F12`, `Ctrl+Shift+I`, `Ctrl+Shift+J`, `Ctrl+Shift+C`, `Ctrl+U`, `Ctrl+S`).
   - Detecção de tecla `PrintScreen` e perda de foco com cortina escura de proteção.

---

## 2. Diagrama de Fluxo de Segurança

```
┌─────────────────────────────────┐
│ Aluno Autenticado               │
│ (Clica em Assistir Aula)        │
└────────────────┬────────────────┘
                 │
                 │ 1. Solicita Token de Streaming (/api/lessons/verify-access)
                 ▼
┌────────────────────────────────────────────────────────┐
│ Servidor Backend (server.ts)                           │
│ 2. Valida Matrícula Ativa + Role + Status              │
│ 3. Assina Token Criptografado HMAC-SHA256              │
│ 4. Prepara Metadados Forenses da Marca D'água          │
└────────────────┬───────────────────────────────────────┘
                 │
                 │ 5. Retorna { allowed: true, token, watermarkData }
                 ▼
┌────────────────────────────────────────────────────────┐
│ Player Protegido (SecureVideoPlayer.tsx)               │
│ 6. Carrega Embed Wistia com Restrição de Domínio       │
│ 7. Ativa Escudo Anti-Inspeção e Anti-Screen Capture    │
│ 8. Inicia Movimentação Randômica da Marca D'água       │
└────────────────────────────────────────────────────────┘
```

---

## 3. Plano de Execução Passo a Passo

### Etapa 1: Reforço dos Tokens de Sessão no Backend (`server.ts`)
- Implementar geração de token assinado com HMAC-SHA256 incluindo timestamp de expiração rigoroso de 60 minutos.
- Inserir cabeçalhos anti-embedding e validação de origem segura na resposta de autorização.

### Etapa 2: Aprimoramento do Player Seguro (`src/components/SecureVideoPlayer.tsx`)
- Adicionar parâmetros de proteção reforçada no embed Wistia (`videoFoam=true`, `endVideoBehavior=pause`, `controlsVisibleOnLoad=false`).
- Integrar escudo de privacidade em perda de foco/tentativa de captura de tela (cortina preta com mensagem de proteção).
- Reforçar o bloqueio de atalhos de teclado (incluindo atalhos MacOS como `Cmd+Option+I` e `PrintScreen`).

### Etapa 3: Instruções de Configuração no Painel Wistia
- Documentar no painel administrativo as configurações recomendadas no dashboard da Wistia:
  1. *Security -> Domain Restriction*: Adicionar domínios permitidos.
  2. *Customizations -> Controls*: Desabilitar botões de download e compartilhamento social.

### Etapa 4: Validação e Compilação
- Compilar o projeto com `compile_applet` e validar com `lint_applet`.
- Testar o fluxo completo de reprodução e as barreiras de proteção.
