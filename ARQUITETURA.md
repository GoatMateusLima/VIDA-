# Arquitetura do Projeto VIDA+

Projeto backend Node.js com **TypeScript** estruturado em camadas MVC
(Model - View - Controller) com camadas adicionais de Service, Middleware,
Routes, Config, Types e Utils.

---

## Estrutura de Pastas

```
VIDA+/
├── server.ts
├── package.json
├── tsconfig.json
├── .env
├── .gitignore
└── src/
    ├── app.ts
    ├── config/
    │   ├── database.ts
    │   └── env.ts
    ├── controllers/
    │   └── UserController.ts
    ├── models/
    │   └── UserModel.ts
    ├── views/
    ├── routes/
    │   ├── index.ts
    │   └── userRoutes.ts
    ├── services/
    │   └── UserService.ts
    ├── middlewares/
    │   ├── authMiddleware.ts
    │   └── errorMiddleware.ts
    ├── types/
    │   └── index.ts
    └── utils/
        └── helpers.ts
```

---

## Arquivos Raiz

### `server.ts`
Ponto de entrada da aplicação. Responsável por iniciar o servidor HTTP,
definir a porta e conectar ao banco de dados. É o primeiro arquivo executado
quando a aplicação sobe. Em TypeScript, os tipos do Node.js são fornecidos
pelo pacote `@types/node`.

### `src/app.ts`
Configura a instância do Express com tipagem. Registra os middlewares globais
(CORS, JSON parser, etc.) e importa as rotas centrais. Separa a configuração
do servidor da inicialização, facilitando testes.

### `tsconfig.json`
Configuração do compilador TypeScript. Define:
- `outDir: ./dist` — pasta de saída dos arquivos compilados
- `rootDir: ./src` — pasta raiz dos arquivos fonte
- `strict: true` — ativa todas as verificações rigorosas de tipos
- `paths` — aliases de importação (`@controllers/*`, `@models/*`, etc.)
- `target: ES2020` — versão do JavaScript gerado na compilação

### `package.json`
Manifesto do projeto Node.js. Define nome, versão, scripts de execução
(`build`, `start`, `dev` com ts-node-dev) e lista dependências incluindo
`typescript`, `ts-node` e os pacotes `@types/*`.

### `.env`
Arquivo de variáveis de ambiente. Armazena dados sensíveis como strings de
conexão ao banco, chaves JWT, porta do servidor e outros segredos.
Nunca deve ser versionado no Git.

### `.gitignore`
Define quais arquivos e pastas o Git deve ignorar: `node_modules/`,
`.env`, pasta `dist/` (build compilado) e arquivos de cache TypeScript.

---

## Camadas da Arquitetura

### `src/config/`
Centraliza as configurações globais da aplicação com tipagem segura.

- **`database.ts`** — Configura e exporta a conexão com o banco de dados
  (ex: Mongoose para MongoDB, Prisma ou TypeORM para SQL). Usa tipos
  TypeScript para garantir que a configuração esteja correta em tempo
  de compilação.

- **`env.ts`** — Lê e valida as variáveis do arquivo `.env`, exportando-as
  tipadas para o restante da aplicação. Garante que variáveis obrigatórias
  existam em tempo de execução e evita `process.env` espalhado pelo código.

---

### `src/models/` — Camada M do MVC
Define a estrutura dos dados e a comunicação direta com o banco de dados.
Em TypeScript, os models são fortemente tipados com interfaces ou classes.

- **`UserModel.ts`** — Representa a entidade User no banco. Define o schema,
  campos, tipos, validações e relacionamentos. Interfaces TypeScript garantem
  consistência entre o modelo e o restante da aplicação.

> Cada entidade do sistema terá seu próprio Model nesta pasta.

---

### `src/views/` — Camada V do MVC
Em APIs REST, a view é a resposta JSON enviada ao cliente. Esta pasta pode
conter serializers ou DTOs (Data Transfer Objects) tipados, garantindo que
os dados retornados sigam um contrato consistente com o cliente.

---

### `src/controllers/` — Camada C do MVC
Recebe as requisições HTTP tipadas (`Request`, `Response` do Express),
extrai os dados da request e chama o Service correspondente. Monta e envia
a resposta HTTP após receber o resultado.

- **`UserController.ts`** — Gerencia requisições relacionadas ao User.
  Contém métodos como `create`, `findAll`, `findById`, `update`, `delete`,
  todos com parâmetros e retornos tipados. Não contém regras de negócio.

> Regra: Controller não acessa Model diretamente, sempre passa pelo Service.

---

### `src/services/` — Camada de Regras de Negócio
Isola toda a lógica de negócio da aplicação, separando-a dos Controllers.
Torna o código mais testável, reutilizável e fácil de tipar.

- **`UserService.ts`** — Contém a lógica de negócio do User com tipos
  explícitos nos parâmetros e retornos. Valida dados, aplica regras de
  negócio, acessa o Model para persistir ou consultar dados. O TypeScript
  garante que os dados manipulados aqui sejam sempre do tipo esperado.

> É aqui que mora o "cérebro" da aplicação.

---

### `src/routes/` — Camada de Roteamento
Mapeia as URLs (endpoints) da API para os métodos dos Controllers.
Aplica middlewares específicos por rota quando necessário.

- **`index.ts`** — Arquivo central de rotas. Importa e agrupa todas as rotas
  do sistema com seus respectivos prefixos (ex: `/api/users`, `/api/products`).

- **`userRoutes.ts`** — Define as rotas específicas do recurso User.
  Exemplo: `GET /users`, `POST /users`, `PUT /users/:id`, `DELETE /users/:id`.

---

### `src/middlewares/` — Interceptadores de Requisição
Funções tipadas com `RequestHandler` do Express, executadas entre a
requisição e a resposta.

- **`authMiddleware.ts`** — Verifica se o token JWT da requisição é válido.
  Pode estender o tipo `Request` do Express para adicionar o campo `user`
  tipado após a autenticação. Protege rotas privadas.

- **`errorMiddleware.ts`** — Captura todos os erros lançados na aplicação.
  Usa o tipo `ErrorRequestHandler` do Express. Formata e retorna respostas
  de erro padronizadas e tipadas para o cliente.

---

### `src/types/` — Tipos e Interfaces Globais
Pasta exclusiva do TypeScript. Centraliza todas as interfaces, tipos e
enums compartilhados entre as camadas da aplicação.

- **`index.ts`** — Exporta interfaces como `IUser`, `IAuthPayload`, enums
  como `UserRole`, e tipos utilitários usados em controllers, services e
  models. Evita duplicação de definições de tipos pelo projeto.

---

### `src/utils/`
Funções utilitárias genéricas e reutilizáveis, todas com tipagem explícita.

- **`helpers.ts`** — Funções auxiliares tipadas como formatação de datas,
  geração de slugs, manipulação de strings e paginação. Por serem funções
  puras com tipos definidos, são fáceis de testar unitariamente.

---

## Fluxo de uma Requisição

```
Cliente (HTTP Request)
        ↓
    server.ts
        ↓
      app.ts  (middlewares globais)
        ↓
    routes/   (qual controller chamar)
        ↓
middlewares/  (autenticação, validação)
        ↓
 controllers/ (recebe Request/Response tipados, chama o service)
        ↓
  services/   (executa a regra de negócio com tipos)
        ↓
   models/    (acessa o banco com schema tipado)
        ↓
  controllers/ (formata e envia a Response)
        ↓
Cliente (HTTP Response)
```

---

## Scripts do Projeto

| Script | Comando | Descrição |
|--------|---------|-----------|
| `dev` | `ts-node-dev src/server.ts` | Sobe o servidor em modo desenvolvimento com hot-reload |
| `build` | `tsc` | Compila TypeScript para JavaScript na pasta `dist/` |
| `start` | `node dist/server.js` | Inicia o servidor compilado em produção |

---

## Princípios que guiam essa arquitetura

- **Tipagem forte** — TypeScript garante contratos claros entre as camadas
- **Separação de responsabilidades** — cada camada tem um papel claro e único
- **Fácil manutenção** — mudanças em uma camada não impactam as outras
- **Testabilidade** — Services isolados com tipos explícitos são fáceis de testar
- **Escalabilidade** — novos recursos seguem o mesmo padrão de pastas e arquivos
