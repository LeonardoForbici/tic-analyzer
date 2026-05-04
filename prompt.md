Você é um engenheiro sênior especialista em VS Code Extensions, TypeScript, análise estática, engenharia reversa de sistemas legados, Java/Spring, React/TypeScript, JavaScript, Oracle PL/SQL, arquitetura corporativa e geração de especificações para agentes de IA.

Estamos trabalhando no projeto TIC Coder Lite.

MISSÃO DO MVP:
Transformar o TIC Coder Lite em uma ferramenta de PROGRAMAÇÃO REVERSA LOCAL-FIRST para workspaces corporativos.

Ele não pode ser apenas:
- scanner
- grafo
- dashboard bonito
- exportador de AGENTS.md

Ele precisa transformar código legado em:
- inventário técnico
- análise de arquitetura
- contratos operacionais
- regras de negócio candidatas
- fluxos e state machines
- permissões
- análise de banco/PLSQL
- gaps
- perguntas para validação humana
- rastreabilidade código ↔ especificação
- contexto seguro para agentes de IA

A referência metodológica principal é o Reversa.

Use o Reversa como inspiração/conceito:
- programação reversa de código legado
- geração de especificações operacionais
- agentes/fases: Scout, Archaeologist, Detective, Architect, Writer, Reviewer, Data Master
- confidence scale:
  🟢 CONFIRMADO
  🟡 INFERIDO
  🔴 LACUNA
- geração de SDD
- traceability
- gaps/questions
- integração com engines de IA

Fontes de referência:
- ../reversa/README.md
- ../reversa/agents/
- ../reversa/templates/
- ../reversa/lib/installer/detector.js
- ../reversa/lib/installer/writer.js
- ../reversa/LICENSE

Mas atenção:
- NÃO copiar o Reversa inteiro.
- NÃO transformar TIC Coder Lite em CLI Reversa.
- NÃO usar .reversa como pasta principal.
- Manter .tic-code como pasta principal.
- Manter créditos ao Reversa quando houver adaptação conceitual/código/template.
- TIC Coder Lite deve ser extensão VS Code.
- Tudo deve funcionar localmente.
- Não usar banco local.
- Não usar Docker.
- Não exigir IA.
- Não exigir Ollama.
- Não conectar no Oracle real nesta fase.
- Não executar SQL.
- Não alterar código do usuário.
- Nunca sobrescrever arquivos do usuário sem confirmação.
- A análise deve ser estática, a partir dos arquivos versionados/localmente no workspace.

CONTEXTO DO PRODUTO:
TIC Coder Lite será usado internamente em empresa com workspaces grandes contendo:
- Java / Spring Boot
- React / TypeScript
- JavaScript
- Oracle PL/SQL
- SQL / migrations
- scripts
- infra
- módulos compartilhados

Também deve suportar projetos PL/SQL muito grandes, por exemplo:
- 25.000 tabelas
- milhares de packages
- procedures
- functions
- triggers
- views
- scripts SQL

O objetivo é abrir o workspace no VS Code e rodar:

TIC Coder Lite: Analisar Workspace

A partir disso, o sistema deve:
1. detectar projetos/stacks
2. analisar cada stack
3. cruzar relações entre frontend, backend e banco
4. gerar programação reversa / SDD
5. gerar contexto para agentes de IA
6. permitir IA local opcional para melhorar textos, sem depender dela

==================================================
1. ARQUITETURA FUNCIONAL ESPERADA
==================================================

Fluxo principal:

1. Usuário abre um workspace no VS Code.
2. Executa “TIC Coder Lite: Analisar Workspace”.
3. Scanner detecta projetos:
   - backend
   - frontend
   - mobile
   - database
   - scripts
   - infra
   - shared
   - unknown
4. Cada projeto é analisado com um scanner específico.
5. O sistema gera:
   - scan.json
   - graph.json
   - risks.json
   - workspace-summary.json
   - external-dependencies.json
   - agent-context.md
   - reverse-engineering/*
6. WebView mostra:
   - resumo do workspace
   - projetos detectados
   - programação reversa
   - grafo limpo
   - riscos
   - busca
   - PL/SQL Enterprise Mode quando aplicável
   - export para IA padrão
   - IA local opcional
7. Exportadores geram:
   - AGENTS.md
   - CLAUDE.md
   - .github/copilot-instructions.md
   - .cursorrules
   - GEMINI.md
8. IA local opcional usa contexto filtrado já gerado, nunca o projeto inteiro bruto.

==================================================
2. PRINCÍPIO MAIS IMPORTANTE
==================================================

Toda funcionalidade deve responder:

“Isso melhora a programação reversa ou só deixa bonito?”

Priorizar:
- análise reversa
- rastreabilidade
- contexto confiável
- business rules
- PL/SQL
- relações ponta-a-ponta
- segurança para IA alterar legado

Deixar para depois:
- visual excessivamente animado
- grafo com tudo
- features cosméticas
- Marketplace
- Oracle connector real

==================================================
3. MULTI-STACK / MULTI-PROJETO
==================================================

Implementar/validar detecção real de múltiplos projetos no workspace.

Tipos:

backend:
- pom.xml
- build.gradle
- src/main/java
- application.yml
- application.properties
- Spring annotations

frontend:
- package.json com React/Vue/Angular/Next/Vite
- vite.config.ts/js
- next.config.js/ts
- angular.json
- src/App.tsx
- src/main.tsx
- src/routes
- src/pages
- src/components

mobile:
- react-native.config.js
- app.json com expo
- android/
- ios/
- pubspec.yaml
- lib/main.dart

database:
- db/
- database/
- sql/
- oracle/
- plsql/
- migrations/
- arquivos .sql, .pks, .pkb, .prc, .fnc, .pkg, .trg, .pls, .plsql

scripts:
- scripts/
- tools/
- arquivos .js/.ts executáveis
- package.json sem frontend claro

infra:
- Dockerfile
- docker-compose.yml
- k8s/
- helm/
- terraform/
- .github/workflows/
- Jenkinsfile

shared:
- libs/
- packages/
- shared/
- common/
- package.json com name contendo shared/lib/common
- src/index.ts

Criar/ajustar:
- src/scanner/detectProjects.ts
- src/types.ts
- src/scanner/scanWorkspace.ts

Tipos esperados:

DetectedProject:
- id
- name
- rootPath
- relativePath
- kind:
  backend | frontend | mobile | database | scripts | infra | shared | unknown
- stack: string[]
- evidence: string[]
- files
- lines
- risks
- graphNodes
- graphEdges
- reverseEngineeringStatus

WorkspaceSummary:
- workspaceName
- rootPath
- projects
- totals:
  files
  lines
  risks
  graphNodes
  graphEdges
  businessRules
  gaps
  questions
  plsqlObjects
  externalDependencies
- generatedAt
- limits
- warnings

Gerar:
.tic-code/workspace-summary.json

E por projeto:
.tic-code/projects/{projectId}/scan.json
.tic-code/projects/{projectId}/graph.json
.tic-code/projects/{projectId}/risks.json
.tic-code/projects/{projectId}/agent-context.md
.tic-code/projects/{projectId}/reverse-engineering/

==================================================
4. JAVA / SPRING REVERSE ENGINEERING
==================================================

Para backend Java/Spring detectar:

Estrutura:
- packages
- controllers
- services
- repositories
- entities
- DTOs
- configs
- security
- jobs/schedulers
- integrations/clients
- exceptions
- enums

Anotações:
- @RestController
- @Controller
- @Service
- @Repository
- @Entity
- @Component
- @Configuration
- @Scheduled
- @Transactional
- @PreAuthorize
- @Secured
- @GetMapping
- @PostMapping
- @PutMapping
- @DeleteMapping
- @PatchMapping
- @RequestMapping

Extrair:
- endpoints
- métodos HTTP
- paths
- request DTO
- response DTO quando possível
- service chamado
- repository usado
- entity relacionada
- tabela provável
- permissões
- transações
- jobs
- enums/status
- exceptions
- validações

Gerar:
- api-contracts.md
- code-analysis.md
- permissions.md
- state-machines.md
- business-rules.md

Riscos Java:
- controller chamando repository diretamente
- service importando controller
- classe grande
- muitos imports
- @Transactional ausente em fluxo crítico
- catch vazio
- roles hardcoded
- SQL concatenado
- métodos longos
- muitos endpoints em um controller
- scheduler crítico sem documentação
- serviço crítico com muito acoplamento

==================================================
5. REACT / TYPESCRIPT / JAVASCRIPT REVERSE ENGINEERING
==================================================

Para frontend React/TS/JS detectar:

Estrutura:
- routes
- pages
- components
- hooks
- services
- API clients
- stores
- contexts
- forms
- validators
- feature modules

Detectar:
- React Router
- Next routes
- chamadas fetch
- axios
- API clients
- endpoints consumidos
- componentes grandes
- formulários
- guards
- permissões de tela
- feature flags
- uso de localStorage/sessionStorage
- chamadas para backend

Gerar:
- frontend-analysis.md
- ui-flows.md
- api-consumption.md
- permissions.md quando aplicável
- business-rules.md com regras inferidas do front

Riscos frontend:
- endpoint hardcoded
- regra de negócio só no front
- componente muito grande
- any excessivo
- duplicidade de validação
- rota sem guard
- localStorage com token/dado sensível
- API call sem tratamento de erro
- formulário crítico sem validação clara

==================================================
6. CRUZAMENTO FRONTEND → BACKEND → BANCO
==================================================

O valor real do TIC Coder Lite é cruzar stacks.

Tentar detectar fluxos ponta-a-ponta:

Exemplo:
React TelaFatura.tsx
→ chama /api/faturas
→ FaturaController
→ FaturaService
→ FaturaRepository
→ tabela FATURA
→ trigger TRG_FATURA_STATUS
→ package PKG_FATURAMENTO

Implementar mapeamento aproximado:
- frontend fetch/axios path
- backend @RequestMapping
- controller method
- service calls
- repository/entity
- table name from @Table ou SQL
- PL/SQL references
- triggers/packages touching table

Gerar:
.tic-code/reverse-engineering/flowcharts/
.tic-code/reverse-engineering/sequences/
.tic-code/reverse-engineering/traceability/end-to-end-flows.md

Mermaid quando possível:

```mermaid
sequenceDiagram
  Frontend->>Backend: POST /api/faturas
  Backend->>Service: criarFatura()
  Service->>Repository: save(Fatura)
  Repository->>DB: INSERT FATURA
  DB->>Trigger: TRG_FATURA_STATUS
Cada fluxo deve ter confiança:

🟢 CONFIRMADO se relação direta detectada
🟡 INFERIDO se por nome/padrão
🔴 LACUNA se faltou ligação
==================================================
7. PL/SQL ENTERPRISE MODE

Implementar suporte robusto para projetos PL/SQL grandes.

Importante:

Não conectar no Oracle.
Não executar SQL.
Analisar arquivos locais/versionados.
Suportar até 25.000 tabelas.
Indexar tudo.
Não renderizar tudo.
Não mandar tudo para IA local.
Não gerar grafo visual com 25.000 nós.

Extensões:

.sql
.pks
.pkb
.prc
.fnc
.pkg
.trg
.pls
.plsql

Detectar objetos:

TABLE
VIEW
MATERIALIZED VIEW
PACKAGE
PACKAGE BODY
PROCEDURE
FUNCTION
TRIGGER
CURSOR
TYPE
SYNONYM
SEQUENCE opcional
INDEX opcional

Regex case-insensitive:

CREATE OR REPLACE PACKAGE
CREATE OR REPLACE PACKAGE BODY
CREATE OR REPLACE PROCEDURE
CREATE OR REPLACE FUNCTION
CREATE OR REPLACE TRIGGER
CREATE OR REPLACE VIEW
CREATE TABLE
CURSOR nome IS
PROCEDURE nome
FUNCTION nome
BEGIN
EXCEPTION
END

Detectar dependências:

package.procedure
package.function
chamadas diretas
FROM
JOIN
UPDATE
INSERT INTO
DELETE FROM
MERGE INTO
TRIGGER ON table
EXECUTE IMMEDIATE
DBMS_JOB
DBMS_SCHEDULER

Criar:

src/scanner/detectPlSql.ts
src/scanner/databaseLargeMode.ts
src/scanner/databaseIndex.ts
src/scanner/rankDatabaseObjects.ts
src/webview/databaseSearch.ts

Configurações:

ticCoderLite.database.largeMode: boolean default true
ticCoderLite.database.autoLargeModeTableThreshold: number default 5000
ticCoderLite.database.maxVisualNodes: number default 300
ticCoderLite.database.maxTablesInGraph: number default 100
ticCoderLite.database.maxCriticalTables: number default 200
ticCoderLite.database.enableTableIndex: boolean default true
ticCoderLite.database.maxSqlFiles: number default 100000
ticCoderLite.database.criticalNamePatterns: string[]

Se detectar mais de 5.000 tabelas:

ativar largeMode automaticamente
mostrar aviso na WebView:
“Modo PL/SQL Enterprise ativado: objetos indexados, visualização resumida.”

Gerar índices:
.tic-code/projects/database/index/tables.json
.tic-code/projects/database/index/views.json
.tic-code/projects/database/index/packages.json
.tic-code/projects/database/index/procedures.json
.tic-code/projects/database/index/functions.json
.tic-code/projects/database/index/triggers.json

Gerar:
.tic-code/projects/database/summary.json
.tic-code/projects/database/graph.summary.json
.tic-code/projects/database/critical-objects.json

Tipos:

TableIndexItem:

name
schema opcional
file
line opcional
referencedBy
readCount
writeCount
triggerCount
packageCount
procedureCount
riskLevel
criticalityScore
reasons

PackageIndexItem:

name
file
procedures
functions
tablesRead
tablesWritten
riskLevel
criticalityScore
reasons

TriggerIndexItem:

name
tableName
event
timing
file
riskLevel
writesTables
readsTables
reasons

Ranking de criticidade:
Aumentar score quando nome contém:

fatura
pagamento
boleto
nota
nfe
fiscal
cliente
usuario
permissao
estoque
pedido
produto
contrato
financeiro
contabilidade
lancamento
saldo
movimento

Aumentar score quando:

tabela é escrita por muitas procedures
tabela tem trigger
tabela é usada em package crítico
tabela aparece em UPDATE/DELETE/MERGE
objeto usa COMMIT/ROLLBACK
objeto usa EXECUTE IMMEDIATE
objeto usa autonomous transaction
objeto usa WHEN OTHERS sem RAISE

Riscos PL/SQL:

EXECUTE IMMEDIATE
SQL dinâmico concatenado
COMMIT dentro de procedure/function/package
ROLLBACK dentro de procedure/function/package
WHEN OTHERS sem RAISE
trigger alterando dados
package body com mais de 1500 linhas
procedure com mais de 300 linhas
DBMS_JOB
DBMS_SCHEDULER
autonomous transaction
regra fiscal/financeira escondida no banco
tabela crítica escrita por muitos lugares

WebView Database / PL/SQL:

total de tabelas
total de views
total de packages
total de procedures
total de functions
total de triggers
total de objetos críticos
busca por objeto
top tabelas críticas
top packages críticos
top triggers críticos
filtros:
Todos
Tabelas críticas
Packages
Procedures
Functions
Triggers
Escritas
Lidas
Alto risco

Grafo:

usar graph.summary.json
mostrar no máximo maxVisualNodes
mostrar schemas/packages críticos/triggers críticos/top tabelas críticas
ao buscar objeto, mostrar subgrafo daquele objeto:
quem lê
quem escreve
triggers
packages
riscos
arquivos
==================================================
8. LIMPEZA DO GRAFO / DEPENDÊNCIAS EXTERNAS

O grafo principal não pode ser poluído por:

java.util.List
java.time.*
org.springframework.*
jakarta.*
lombok.*
org.slf4j.*
org.hibernate.*
com.fasterxml.*
org.junit.*
org.mockito.*
reactor.*
io.swagger.*
org.apache.*
com.google.*

Criar:

src/scanner/classifyDependency.ts

Classificar dependências:

internal
external
framework

GraphNode:

id
label
type
module
language
origin: internal | external | framework
frameworkName opcional
visibleByDefault
metadata

Regras:

internal visibleByDefault=true
external/framework visibleByDefault=false
imports externos contam como metadado
imports internos viram edges reais
WebView abre no filtro “Internos”
dependências externas vão para:
.tic-code/external-dependencies.json
.tic-code/reverse-engineering/dependencies.md

WebView filtros:

Internos
Externos
Frameworks
Alto risco
Todos

Texto:
“Exibindo apenas nós internos do workspace. Dependências externas foram ocultadas para reduzir ruído.”

==================================================
9. PROGRAMAÇÃO REVERSA / SDD

Criar camada principal:

.tic-code/reverse-engineering/

Estrutura global:

.tic-code/reverse-engineering/
├── inventory.md
├── dependencies.md
├── code-analysis.md
├── domain.md
├── business-rules.md
├── state-machines.md
├── permissions.md
├── architecture.md
├── api-contracts.md
├── frontend-analysis.md
├── ui-flows.md
├── api-consumption.md
├── data-dictionary.md
├── database-analysis.md
├── plsql-analysis.md
├── confidence-report.md
├── gaps.md
├── questions.md
├── flowcharts/
├── sequences/
└── traceability/
├── code-spec-matrix.md
├── risk-impact-matrix.md
└── end-to-end-flows.md

Por projeto:
.tic-code/projects/{projectId}/reverse-engineering/

Criar/validar:

src/exporters/reverseEngineering/generateReverseEngineering.ts
generateInventory.ts
generateDependencies.ts
generateCodeAnalysis.ts
generateDomain.ts
generateBusinessRules.ts
generateStateMachines.ts
generatePermissions.ts
generateArchitecture.ts
generateApiContracts.ts
generateFrontendAnalysis.ts
generateUiFlows.ts
generateApiConsumption.ts
generateDataDictionary.ts
generateDatabaseAnalysis.ts
generatePlSqlAnalysis.ts
generateConfidenceReport.ts
generateGaps.ts
generateQuestions.ts
generateTraceability.ts
reverseEngineeringTypes.ts

Regras de confiança:
Toda afirmação relevante deve ter:

🟢 CONFIRMADO
🟡 INFERIDO
🔴 LACUNA

Nunca inventar verdade.

Se extraído diretamente do código:
🟢 CONFIRMADO

Se deduzido por padrão/nome/fluxo:
🟡 INFERIDO

Se não der para saber:
🔴 LACUNA

Toda regra deve tentar citar evidência:

arquivo
linha quando possível
classe/procedure/package/tabela
endpoint
anotação
trigger

Exemplo:

Regras candidatas
Faturamento
Uma fatura cancelada não deve gerar boleto. 🟡 INFERIDO
Evidência:
backend/src/main/java/.../FaturaService.java
database/packages/PKG_FATURAMENTO.pkb
O status PAGA existe no fluxo de fatura. 🟢 CONFIRMADO
Evidência:
backend/src/main/java/.../FaturaStatus.java
Lacunas
Não foi possível confirmar se uma fatura vencida pode ser reaberta. 🔴 LACUNA
Pergunta:
O sistema permite reabrir faturas vencidas?
==================================================
10. BUSINESS RULES ENGINE

Extrair regras candidatas a partir de:

Java:

métodos validate/validar/check/verificar
if/else
switch/case
enums
exceptions
annotations
services críticos
nomes de métodos
transações

React/TS/JS:

validações de formulário
guards
feature flags
if/else com status
regras de exibição
permissões de tela
chamadas API

PL/SQL:

IF/ELSE
CASE
exceptions
triggers
procedures
functions
packages
commits/rollbacks
SQL dinâmico
tabelas críticas

Gerar:

business-rules.md
domain.md
gaps.md
questions.md

Agrupar por domínio:

financeiro
fiscal
vendas
estoque
usuário
permissão
cliente
produto
contrato
database
frontend
outros
==================================================
11. STATE MACHINES

Detectar possíveis máquinas de estado por:

Java:

enums
campos status
Status, Situation, State
switch/case
métodos que alteram status

TS/JS:

status strings
reducers
stores
state machines simples
guards

PL/SQL:

UPDATE tabela SET status
CASE status
IF status =
triggers mudando status

Valores comuns:

ABERTO
ATIVO
INATIVO
CANCELADO
PAGO
VENCIDO
PROCESSANDO
APROVADO
REJEITADO
FINALIZADO
EM_ANALISE
BLOQUEADO
LIBERADO

Gerar:
state-machines.md

Com Mermaid quando possível:

Cada transição deve ter confiança.

==================================================
12. PERMISSÕES

Detectar permissões por:

Java:

@PreAuthorize
@Secured
hasRole
hasAuthority
ROLE_
PermissionService
SecurityConfig

React/TS:

route guards
permissions arrays
roles
canAccess
isAdmin
feature flags

Database/PLSQL:

tabelas de usuário/perfil/permissão
packages de permissão
procedures de autorização

Gerar:
permissions.md

Com:

recurso
ação
role/permissão
origem
confiança
lacunas
==================================================
13. API CONTRACTS

Gerar api-contracts.md com:

Backend:

método HTTP
path
controller
método
request DTO
response DTO provável
service chamado
permissões
riscos
confiança

Frontend:

chamadas fetch/axios
endpoint consumido
tela/componente origem
payload provável
erro tratado ou não
confiança

Cruzar frontend/back:

endpoint chamado no front existe no back?
endpoint no back não é usado?
path divergente?
contrato ambíguo?

Gerar gaps se:

frontend chama endpoint não encontrado
backend tem endpoint sem consumidor detectado
DTO não detectado
response não detectável
==================================================
14. DATA DICTIONARY / DATABASE

Gerar data-dictionary.md:

Fontes:

JPA entities
@Table
@Column
SQL CREATE TABLE
migrations
PL/SQL references
views
triggers

Para cada tabela/entidade:

nome
origem
campos detectados
tipo quando possível
relacionamentos prováveis
lida por
escrita por
triggers
packages/procedures relacionadas
risco
confiança

Para database grande:

não colocar 25.000 tabelas completas no Markdown principal
gerar resumo e top críticos
apontar para index/tables.json
==================================================
15. TRACEABILITY

Gerar:

traceability/code-spec-matrix.md

Colunas:

código
projeto
módulo
spec relacionada
tipo
confiança
risco
observações

traceability/risk-impact-matrix.md

Colunas:

risco
arquivo/objeto
stack
impacto
spec relacionada
recomendação

traceability/end-to-end-flows.md

Colunas:

fluxo
frontend
endpoint
controller
service
repository
tabela
trigger/package
confiança
lacunas
==================================================
16. IA LOCAL OPCIONAL

IA local deve melhorar textos, não substituir análise.

Configurações:

ticCoderLite.localAi.enabled
ticCoderLite.localAi.ollamaUrl
ticCoderLite.localAi.model
ticCoderLite.localAi.fastModel
ticCoderLite.localAi.qualityModel
ticCoderLite.localAi.mode: fast | quality | auto

Defaults:

model = qwen2.5-coder:3b
fastModel = qwen2.5-coder:3b
qualityModel = qwen2.5-coder:7b
mode = fast

Regras:

não hardcodar 1.5b
respeitar configuração do usuário
se modelo não existir, mostrar:
“Modelo não encontrado no Ollama. Instale com: ollama pull <modelo>”
nunca baixar modelo automaticamente
nunca mandar projeto inteiro para IA
usar contexto filtrado

No modo auto:

tarefas simples → fastModel
PL/SQL, regras de negócio, domínio, state machines e permissões → qualityModel
se qualityModel não existir, cair para fastModel

IA local deve ler:

summaries
business-rules.md
gaps.md
questions.md
risks.json
critical-objects.json
graph.summary.json
top objetos críticos

Gerar arquivos separados:

module-summaries.ai.md
risks.ai.md
questions.ai.md
business-rules.ai.md
plsql-analysis.ai.md

Nunca sobrescrever SDD base.

==================================================
17. WEBVIEW MVP

WebView deve ser funcional, não decorativa.

Não recriar VS Code dentro da WebView.

Layout:

Header:
TIC Coder Lite
“Entenda seu workspace antes de pedir para a IA alterar código.”
Botões:
Analisar Workspace
Gerar Programação Reversa
Exportar para IA
Melhorar com IA Local
Cards globais:
Projetos detectados
Arquivos analisados
Riscos altos
Regras candidatas
Lacunas
Objetos PL/SQL
Engines IA detectadas
Projetos detectados:
Backend Java
Frontend React/TS
Scripts JS
Database/PLSQL
Infra
Shared
Filtros:
Todos
Backend Java
Frontend React/TS
JavaScript
Database / PL/SQL
Infra
Shared
Alto risco
Fluxo ponta-a-ponta
Abas:
Visão Geral
Programação Reversa
Grafo
Riscos
Database / PL/SQL
IA Padrão
IA Local

Seção Programação Reversa:

specs geradas
business-rules
state-machines
permissions
gaps
questions
confidence
traceability

Seção Database / PL/SQL:

busca por objeto
top tabelas críticas
top packages críticos
top triggers críticos
botão “ver subgrafo”
aviso large mode quando aplicável

Grafo:

filtro padrão internos
não mostrar dependências externas por padrão
não mostrar 25.000 tabelas
usar graph.summary.json para database large mode

Texto 100% português.

==================================================
18. SEGURANÇA / IMUTABILIDADE

O TIC Coder Lite deve seguir princípio semelhante ao Reversa:

nunca deletar arquivos do usuário
nunca modificar código do usuário
escrever apenas:
.tic-code/
arquivos de export como AGENTS.md/CLAUDE.md se usuário confirmar
SafeWriter deve perguntar antes de sobrescrever
manter created-files.json
README deve recomendar Git commit antes da análise
==================================================
19. CONFIGURAÇÕES IMPORTANTES

Atualizar package.json com settings:

scan:

ticCoderLite.scan.maxFiles default 30000
ticCoderLite.scan.maxFileSizeKb default 512
ticCoderLite.scan.include
ticCoderLite.scan.exclude

database:

ticCoderLite.database.largeMode default true
ticCoderLite.database.autoLargeModeTableThreshold default 5000
ticCoderLite.database.maxVisualNodes default 300
ticCoderLite.database.maxTablesInGraph default 100
ticCoderLite.database.maxCriticalTables default 200
ticCoderLite.database.enableTableIndex default true
ticCoderLite.database.maxSqlFiles default 100000

localAi:

ticCoderLite.localAi.enabled
ticCoderLite.localAi.ollamaUrl
ticCoderLite.localAi.model default qwen2.5-coder:3b
ticCoderLite.localAi.fastModel default qwen2.5-coder:3b
ticCoderLite.localAi.qualityModel default qwen2.5-coder:7b
ticCoderLite.localAi.mode default fast

exports:

ticCoderLite.exports.safeWriteMode
==================================================
20. LIMITES DE SCAN

Remover qualquer teto hardcoded de 10.000 arquivos.

Se existir:
Math.min(..., 10000)

remover.

O limite deve respeitar configuração:
ticCoderLite.scan.maxFiles

Default:
30000

Para PL/SQL enterprise:
ticCoderLite.database.maxSqlFiles default 100000

Incluir em scan.json:

limits.maxFiles
limits.maxFileSizeKb
limits.limitReached
limits.filesSkippedByLimit

Se limitReached:

mostrar alerta na WebView
registrar no confidence-report.md
gerar gap:
“A análise pode estar parcial porque o limite de arquivos foi atingido.”
==================================================
21. README FINAL DO MVP

Atualizar README em português com:

O que é TIC Coder Lite
Foco: programação reversa local-first
Como se compara/inspira no Reversa
O que ele gera
Como usar
Como instalar VSIX
Como rodar Analisar Workspace
Multi-stack
PL/SQL Enterprise Mode
IA Padrão
IA Local com Ollama
Configuração de modelos:
qwen2.5-coder:3b
qwen2.5-coder:7b
Configuração para projetos grandes
Segurança/imutabilidade
Limitações do MVP
Roadmap
Créditos ao Reversa

Deixar claro:
“Este MVP analisa arquivos locais/versionados. Não conecta em banco Oracle real.”

==================================================
22. CRITÉRIOS DE ACEITE DO MVP

O MVP só está pronto se:

npm run compile passa.
A extensão abre no VS Code.
Comando “TIC Coder Lite: Analisar Workspace” funciona.
Gera .tic-code/.
Detecta projetos Java/Spring.
Detecta projetos React/TS/JS.
Detecta projeto Database/PLSQL.
Suporta database large mode sem tentar renderizar tudo.
Remove ruído de dependências externas no grafo principal.
Gera reverse-engineering/.
Gera business-rules.md.
Gera confidence-report.md com 🟢🟡🔴.
Gera gaps.md e questions.md.
Gera traceability/code-spec-matrix.md.
Gera PL/SQL analysis quando houver PL/SQL.
WebView mostra Programação Reversa.
WebView mostra Database / PLSQL com busca/resumo.
IA Local respeita qwen2.5-coder:3b configurado.
Nenhum modelo é hardcoded para 1.5b.
Nenhum arquivo do usuário é sobrescrito sem confirmação.
README está em português e explica o MVP.
Não há .git, .tic-code, dist antigo ou .vsix antigo no pacote final.
==================================================
23. NÃO FAZER AGORA

Não implementar:

Marketplace
Electron
conexão Oracle real
execução de SQL
servidor backend
banco local
Neo4j
RAG pesado
download automático de modelo
análise dinâmica com logs reais
UI complexa demais
renderizar 25.000 nós no grafo
==================================================
24. SAÍDA ESPERADA

Ao final, entregar:

Código compilável.
Lista de arquivos alterados.
Checklist dos critérios de aceite.
Explicação curta de como testar:
npm install
npm run compile
F5 no VS Code
TIC Coder Lite: Analisar Workspace
Explicação de como gerar VSIX:
npx @vscode/vsce package

Foco total:
PROGRAMACAO REVERSA LOCAL-FIRST, igual ou melhor que Reversa para o contexto corporativo multi-stack com Java, React/TS/JS e PL/SQL enterprise.