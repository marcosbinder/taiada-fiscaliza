# Guia de Contribuição — Taiada Fiscaliza ("Cobra, Taiada!")

Agradecemos o seu interesse em contribuir com o **Taiada Fiscaliza**, a plataforma cívica colaborativa de código aberto dedicada a mapear, priorizar e fiscalizar os serviços públicos e a zeladoria urbana de **Caçapava - SP** (Código IBGE: `3508504`).

---

## 1. Princípios Inegociáveis do Projeto

Ao colaborar com este projeto, você concorda em seguir os princípios estabelecidos na Constituição do Projeto ([`GEMINI.md`](./GEMINI.md)) e na documentação oficial ([`docs/`](./docs/00-INDEX.md)):

1. **Fonte Única da Verdade (`docs/`):** Qualquer alteração estrutural, decisão arquitetural, mudança de schema SQLite ou novo peso de algoritmo deve ser documentada na pasta `docs/` e registrada no changelog de [`docs/00-INDEX.md`](./docs/00-INDEX.md).
2. **Geofencing Estrito de Caçapava:** A plataforma é exclusiva para Caçapava - SP. O Bounding Box oficial é `Latitude [-23.2600, -22.9500]` e `Longitude [-45.8100, -45.6000]`.
3. **Padrão Apple Design:** Toda interface web deve respeitar os princípios da skill `apple-design` (física de mola, *velocity handoff*, resposta instantânea no toque, superfícies translúcidas e ausência de hover travado no celular).
4. **Paleta Oficial Verde Taiada:** Utilize exclusivamente os tokens oficiais `#15301d` (`--taiada-dark`) e `#347947` (`--taiada-primary`), além dos modos de tema Claro, Escuro e Sol Forte.
5. **Zero Segredos:** Nunca insira credenciais, tokens ou senhas no código. Utilize sempre o `.env.example` e validação Zod.

---

## 2. Configurando o Ambiente de Desenvolvimento

### Pré-requisitos
- **Node.js:** Versão 20 ou superior (recomendado Node.js v24).
- **npm:** Versão 10 ou superior.

### Passo a Passo
```bash
# 1. Clone o repositório
git clone https://github.com/seu-usuario/taiada-fiscaliza.git
cd taiada-fiscaliza

# 2. Instale as dependências
npm install

# 3. Configure as variáveis de ambiente locais
cp .env.example .env

# 4. Inicie o servidor em modo desenvolvimento
npm run dev

# 5. Em outro terminal, inicie o cliente Vite (se desejar HMR dedicado)
npm run dev:client
```

---

## 3. Scripts Disponíveis

| Comando | Descrição |
| :--- | :--- |
| `npm run dev` | Inicia o servidor backend com reinicialização automática (`tsx watch`). |
| `npm run dev:client` | Inicia o servidor Vite para desenvolvimento de UI no porto `5173`. |
| `npm run build` | Compila os assets do frontend React via Vite para a pasta `dist/`. |
| `npm run typecheck` | Executa a verificação estrita de tipos TypeScript (`tsc --noEmit`). |
| `npm test` | Executa a suíte de testes de integração via Vitest (`tests/api.test.ts`). |
| `npm run seed` | Popula o banco SQLite com as 8 demandas realistas de Caçapava. |

---

## 4. Checklist Obrigatório para Envio de Pull Request (PR)

Antes de abrir um Pull Request, certifique-se de que os seguintes passos foram executados com sucesso no seu ambiente local:

- [ ] `npm run build` executa com código 0 e sem erros de bundling.
- [ ] `npm run typecheck` passa sem nenhum erro de tipagem (`tsc --noEmit`).
- [ ] `npm test` é executado com 100% dos testes passando.
- [ ] Nenhum arquivo `.env` ou dado em `data/` foi incluído no commit.
- [ ] A documentação em `docs/` foi atualizada se houver alterações de regras ou rotas.
