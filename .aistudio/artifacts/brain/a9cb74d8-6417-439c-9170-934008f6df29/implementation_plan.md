# Arquitetura de Proteção de Senhas, Contas e Dados dos Alunos

Estrutura detalhada de isolamento de credenciais, blindagem do banco de dados e mascaramento de dados pessoais (PII) entre Administrador Mestre e operadores da plataforma.

## Decisões Confirmadas com o Utilizador

> [!IMPORTANT]
> - **Proteção e Armazenamento de Senhas**: Manutenção estrita do padrão Google Firebase Auth com hashing Scrypt e separação total do Firestore (senhas nunca são salvas no banco de dados).
> - **Mascaramento de Dados Pessoais (PII)**: E-mails e números de telefone dos estudantes mascarados de forma automática em todo o painel e tabelas de transação para operadores comuns e produtores, com visibilidade integral reservada unicamente ao Administrador Mestre.

---

## 1. Como as Senhas e Contas Já São Blindadas

1. **Separadas Fisicamente do Banco de Dados**:
   - As senhas dos estudantes **nunca são gravadas em texto plano nem em documentos do Firestore**.
   - As contas utilizam o **Firebase Authentication**, serviço isolado do Google que armazena apenas hashes criptográficos de via única com algoritmo **Scrypt + salt**.
   - Mesmo que um invasor tivesse acesso de leitura ao banco de dados, ele não encontrará nenhuma senha de nenhum aluno.

2. **Isolamento de Acesso às Contas (`firestore.rules`)**:
   - Cada aluno tem permissão restrita para ler e atualizar exclusivamente o seu próprio documento (`request.auth.uid == userId`).
   - Tentativas de ler documentos de outros alunos resultam em bloqueio imediato (`permission-denied`).

3. **Proteção de Chaves e Configurações Sensíveis**:
   - Chaves de gateways de pagamento e tokens do Wistia são criptografados com **AES-256-GCM** no servidor antes de serem gravados.

---

## 2. Aprimoramento de Privacidade: Mascaramento PII em Todo o Painel

Para garantir que produtores, operadores ou colaboradores não tenham acesso a dados confidenciais dos alunos:

1. **Tabelas de Validação e Histórico no Dashboard (`Dashboard.tsx`)**:
   - E-mails: exibidos como `al***@gmail.com` para operadores; completos para o Mestre.
   - Telefones: exibidos como `+244 92*** **12` para operadores; completos para o Mestre.
2. **Diretório de Estudantes (`StudentDirectory.tsx`)**:
   - Reforço do mascaramento nas visualizações mobile e desktop para qualquer usuário sem privilégio Mestre.

---

## 3. Diagrama da Arquitetura de Separação de Dados

```
┌─────────────────────────────────┐
│ Dispositivo do Estudante / Admin │
└────────────────┬────────────────┘
                 │
                 ├── 1. Autenticação Direta ──► ┌───────────────────────────────┐
                 │    (Login com Senha)         │ Google Firebase Auth          │
                 │                              │ (Hash Scrypt + Salt — Sem DB) │
                 │                              └───────────────────────────────┘
                 │
                 └── 2. Dados de Perfil & Cursos ─► ┌───────────────────────────┐
                      (Com Regras Restritas)        │ Firestore Database        │
                                                    │ • UID, Nome, Cursos       │
                                                    │ • PII Mascarada p/ Staff  │
                                                    │ • Cofre AES-256-GCM       │
                                                    └───────────────────────────┘
```

---

## 4. Plano de Execução Passo a Passo

### Etapa 1: Aplicação do Mascaramento no Dashboard (`src/pages/Dashboard.tsx`)
- Importar `maskEmail` e `maskPhone` de `../utils/maskUtils`.
- Aplicar nas tabelas de validação pendente e modal de histórico de transações com base em `isMasterUser`.

### Etapa 2: Validação das Regras do Banco
- Confirmar que as regras do `firestore.rules` mantêm o bloqueio estrito contra leitura cruzada de contas.

### Etapa 3: Verificação e Compilação
- Executar `compile_applet` e `lint_applet` para assegurar integridade do código.
- Reiniciar o servidor de desenvolvimento.
