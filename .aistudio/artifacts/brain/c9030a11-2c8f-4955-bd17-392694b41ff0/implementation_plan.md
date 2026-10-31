# Módulo de Reajuste de Taxas e Planos dos Produtores

Implementação de uma área dedicada dentro do Painel Administrativo de Configurações (`/settings`) para que a administração possa visualizar, reajustar e persistir os valores das taxas de subscrição cobradas aos produtores (Taxa Mensal e Taxa Trimestral em Kwanza - Kz). Os valores reajustados passam a refletir-se dinamicamente na área do produtor, nos contratos digitais e nos fluxos de confirmação de pagamento.

### User Review & Critical Decisions

> [!IMPORTANT]
> **Decisões Confirmadas com o Utilizador:**
> 1. **Posicionamento**: Criação de um card dedicado intitulado **"Módulo 5: Taxas e Planos dos Produtores"** no painel de Configurações Administrativas.
> 2. **Modalidades de Cobrança**: Configuração individualizada da **Taxa Mensal (Kz)** e da **Taxa Trimestral (Kz)**.
> 3. **Reflexo Dinâmico**: Ao salvar no banco de dados Firestore (`settings/general`), os valores são atualizados imediatamente para todos os produtores no painel de assinaturas, links de WhatsApp com comprovativo e contratos digitais.

---

### 1. Overview & Core Concept

- **O que faz**: Permite ao Administrador reajustar com flexibilidade os valores em Kz das taxas cobradas aos produtores para hospedagem e gestão dos seus cursos na plataforma CFA, eliminando valores estáticos/hardcoded no código.
- **Público-alvo**: Administradores da plataforma CFA (para gestão e atualização de preços) e Produtores de Conteúdo (que visualizam as taxas atualizadas no seu painel e contrato).
- **Valor Principal**: Flexibilidade comercial para criar campanhas, ajustar preços perante a inflação ou novos acordos sem necessidade de intervenção técnica ou implantação de novo código.

---

### 2. User Experience & Visual Design

- **Card Dedicado no Painel Administrativo (Módulo 5)**:
  - Localizado no grid de configurações administrativas ao lado dos módulos existentes (Identidade, Pagamentos/Cupões, Permissões, Moldes).
  - Ícone representativo (`Coins` / Moedas douradas), tag de destaque `"Módulo 5 • Comercial"`, título `"Taxas dos Produtores"` e resumo claro.
  - Indicadores em tempo real no próprio card mostrando o valor atual gravado:
    - *Taxa Mensal*: Ex: `3.500 Kz / mês`
    - *Taxa Trimestral*: Ex: `7.000 Kz / 3 meses`
  - Botão de ação com feedback hover: `"Reajustar Taxas"`.

- **Modal Interativo de Reajuste (Popup Administrativo)**:
  - Header escuro refinado com ícone dourado e botão fechar (`X`).
  - Inputs com formatação monetária em Kz para Taxa Mensal e Taxa Trimestral, com validação numérica para evitar valores negativos ou vazios.
  - Alerta informativo explicando que as novas taxas terão efeito imediato para novos planos e renovações de produtores.
  - Botões de ação: `"Cancelar"` e `"Salvar Novas Taxas"` com estado de carregamento (`isSaving`) e toast de confirmação.

- **Reflexo Dinâmico na Área do Produtor**:
  - Na visualização dos produtores em `/settings`, os cards de "Plano Mensal" e "Plano Trimestral" exibem diretamente os valores sincronizados do banco de dados formatados com `Intl.NumberFormat` ou `.toLocaleString('pt-AO')`.
  - O texto automático do WhatsApp para envio do comprovativo de pagamento incorpora automaticamente os valores reajustados.
  - As referências de plano no modal de contrato digital e labels de vinculação (`handleSaveProducerPlan`) utilizam os valores atualizados.

---

### 3. Key Product Decisions & Trade-Offs

- **Persistência em `settings/general`**:
  - *Abordagem*: Guardar os campos `producerMonthlyFee: number` e `producerQuarterlyFee: number` no documento de configurações gerais da plataforma no Firestore, mantendo retrocompatibilidade com valores padrão caso os campos ainda não existam (`3500` e `7000` Kz).
  - *Vantagem*: Carregamento unificado em uma única leitura durante a inicialização de `/settings`, sem impacto na cota do Firestore.
- **Formatação Monetária Consistente**:
  - *Abordagem*: Formatar em padrão angolano (`pt-AO`, ex: `3.500 Kz`), garantindo legibilidade para os produtores locais.

---

### 4. Technical Architecture & Data Strategy

```
┌──────────────────────────────────────────────────────────────┐
│                    Firestore: settings/general               │
│  - producerMonthlyFee: 3500                                  │
│  - producerQuarterlyFee: 7000                                │
└───────────────────────┬──────────────────────────────────────┘
                        │ Leitura em fetchSettings()
                        ▼
┌──────────────────────────────────────────────────────────────┐
│                  src/pages/Settings.tsx                      │
│                                                              │
│  [Admin View]                     [Producer View]            │
│  ┌─────────────────────────┐      ┌────────────────────────┐ │
│  │ Módulo 5: Taxas Prod.   │      │ Planos de Assinatura   │ │
│  │ - Mensal: {monthly} Kz  │      │ - Card Mensal: {fee}   │ │
│  │ - Trimestral: {qtr} Kz  │      │ - Card Trimestral: {fee│ │
│  │ [Reajustar Taxas]       │      │ - WhatsApp: {fee}      │ │
│  └───────────┬─────────────┘      └────────────────────────┘ │
│              │ Abre Modal                                    │
│              ▼                                               │
│  ┌─────────────────────────┐                                 │
│  │ Modal Reajuste de Taxas │                                 │
│  │ - Input Taxa Mensal     │                                 │
│  │ - Input Taxa Trimestral │                                 │
│  │ [Salvar Taxas] ───────┐ │                                 │
└──────────────────────────┼─┴─────────────────────────────────┘
                           │ setDoc/updateDoc
                           ▼
              Gravação segura no Firestore
```

- **Mapeamento de Estados e Ações**:
  - `producerMonthlyFee`: número (default: 3500)
  - `producerQuarterlyFee`: número (default: 7000)
  - `isProducerFeesModalOpen`: booleano para controlar o modal de reajuste do admin.
  - `handleSaveProducerFees`: função assíncrona que valida os inputs e salva no Firestore com feedback de sucesso/erro.
