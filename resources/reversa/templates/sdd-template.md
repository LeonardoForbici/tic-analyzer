# SDD — [Nome do Componente]

**Fase:** [geração | revisão]
**Confiança geral:** 🟡 INFERIDO
**Gerado por:** TIC Coder Lite (Reversa Engine)
**Data:** [data]

---

## 1. Visão Geral

[O que é este componente, qual problema resolve — 2 a 3 linhas]

**Confiança:** 🟢 / 🟡 / 🔴

---

## 2. Responsabilidades

- [Responsabilidade 1] 🟢
- [Responsabilidade 2] 🟡
- [Responsabilidade desconhecida] 🔴

---

## 3. Interface

### Entradas

| Parâmetro | Tipo | Obrigatório | Descrição | Confiança |
|-----------|------|-------------|-----------|-----------|
| [param] | [tipo] | sim/não | [descrição] | 🟢 |

### Saídas

| Campo | Tipo | Descrição | Confiança |
|-------|------|-----------|-----------|
| [campo] | [tipo] | [descrição] | 🟢 |

---

## 4. Regras de Negócio

- [Regra 1] 🟢 — `arquivo.ts:linha`
- [Regra 2] 🟡 — deduzida de padrão
- [Comportamento desconhecido] 🔴 — requer validação humana

---

## 5. Fluxo Principal

```
1. [Passo 1]
2. [Passo 2]
3. [Passo N]
```

---

## 6. Fluxos Alternativos

- **[Condição especial]:** [comportamento] 🟡
- **[Caso de erro]:** [comportamento] 🔴

---

## 7. Dependências

| Componente | Tipo | Como Usa | Confiança |
|------------|------|----------|-----------|
| [componente] | interno/externo | [descrição] | 🟢 |

---

## 8. Requisitos Não Funcionais

| Tipo | Requisito | Evidência | Confiança |
|------|-----------|-----------|-----------|
| Performance | [ex: timeout] | `arquivo:linha` | 🟡 |
| Segurança | [ex: autenticação] | `arquivo:linha` | 🟡 |

---

## 9. Critérios de Aceitação

```gherkin
Dado [pré-condição]
Quando [ação]
Então [resultado esperado]

Dado [condição de erro]
Quando [ação inválida]
Então [comportamento de falha esperado]
```

---

## 10. Lacunas (🔴)

- [Comportamento não determinável pelo código estático]
- [Lógica dependente de config externa não acessível]

---

## 11. Rastreabilidade

| Arquivo | Linha(s) | Tipo de evidência |
|---------|----------|-------------------|
| `arquivo.ts` | 42-67 | implementação |
| `arquivo.spec.ts` | 12-30 | teste |
