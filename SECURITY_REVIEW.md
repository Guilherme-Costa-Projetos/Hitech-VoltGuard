# Revisão de segurança — VoltGuard

Revisão do código e das dependências do branch `codex/commercial-readiness-audit`, atualizada em 25/10/2026. O resultado descreve o que foi verificado nesta cópia; não é certificação, pentest independente nem garantia de ausência de vulnerabilidades. O repositório GitHub está público; não versione segredos, dados de clientes ou relatórios que revelem informações operacionais.

## Validação atualizada — 25/10/2026

- A suíte local passou com 31 testes após instalação das dependências declaradas. Os testes usam dados locais de teste; nenhuma conexão ou mutação no PostgreSQL do piloto foi feita.
- A versão de Starlette selecionada pelas faixas atuais emitiu `StarletteDeprecationWarning` ao importar `starlette.testclient` com `httpx`. A suíte passou; acompanhar a compatibilidade do adaptador em futuras atualizações e corrigir se a integração for removida.
- O run GitHub Actions `40198092399` do commit `4c29a0a2f1136647b928382b610d9e4196f2a49e` terminou com sucesso. O deploy associado `dep-dbf0aauq1p3s73em1fbg` está `live`.
- A rota `/health` retornou `ok`; o cadastro público continuou fechado. Não foram feitos login nem testes de gravação no serviço público.

## Corrigido nesta revisão

- A suíte usava o mesmo IP simulado em todos os casos e consumia o limite real de cadastro/login compartilhado. Agora cada teste usa um endereço reservado próprio, sem desativar o limitador do aplicativo.
- A validade padrão da assinatura era calculada no carregamento do módulo. Todas as organizações criadas pelo mesmo processo podiam receber a mesma data de expiração. O prazo agora é calculado no momento de cada inserção.
- Os timestamps UTC usavam `datetime.utcnow()`, descontinuado na versão atual do Python. A função `utcnow()` preserva o formato UTC sem fuso usado pelas colunas existentes.
- Corpos da API agora têm limite em fluxo: 1 MiB para rotas `/api/*` e 16 KiB para ingestão de telemetria. O limite vale também quando o cliente envia o corpo em blocos sem `Content-Length`.
- O manifesto passou a exigir versões com correções de segurança conhecidas: FastAPI 0.161+, Starlette 1.3.1+, PyJWT 2.15+, python-multipart 0.0.31+ e cryptography 49+. As faixas também mantêm limites de versão major.
- O rate limit no Render usa o `CF-Connecting-IP` validado como endereço IP; ignora `X-Forwarded-For` fornecido pelo cliente. Localmente continua usando o IP da conexão.
- O Docker desativa a interpretação genérica de cabeçalhos proxy pelo Uvicorn. O `Host` é verificado contra `RENDER_EXTERNAL_HOSTNAME` e a lista opcional `ALLOWED_HOSTS`; HSTS reconhece HTTPS encaminhado apenas em Render.
- Painéis recém-cadastrados não recebem leituras aleatórias nem uma amostra inicial fictícia. A API marca `SEM_DADOS` até receber telemetria; a interface separa tensão de referência das leituras medidas.
- Amostras sem temperatura ou corrente não são apresentadas como operação normal: o painel fica `PARCIAL` até ser possível avaliar os dois limites de alarme. A API diferencia medições atuais de valores preservados de amostras anteriores.
- GitHub Actions executa testes e `pip-audit` em push/PR e semanalmente; Dependabot abre atualizações semanais para pacotes Python e Actions.

## Controles verificados no código

- Senhas novas usam scrypt; JWT fixa o algoritmo HS256; sessões têm identificador aleatório, expiração e revogação consultada no banco.
- As operações sensíveis verificam papel e organização no servidor. A matriz de integração cobre todos os handlers que usam `require_roles`: rotas CEO-only são negadas para Gerente/Técnico, e rotas CEO/Gerente são negadas para Técnico. Inclui teste de webhook e remoção de modelo de checklist. A cobertura positiva ainda é representativa: não testa todas as combinações de papel, recursos e transições de estado.
- Um teste multiempresa adicional cria dados operacionais de uma organização e confirma que outra não os lê nem os altera por IDs conhecidos: inclui painel/dashboard, histórico, alarmes, ordens e checklists, ativos, manutenção, templates, auditoria, estoque e credenciais. As mutações cross-tenant esperam `404` e verificam que os registros da organização proprietária permanecem intactos.
- Um teste de inventário percorre todas as rotas `/api/` e exige a dependência `get_current_user`, exceto login, status/cadastro opt-in e ingestão de dispositivo, que usa bearer token próprio.
- Tokens de dispositivo são aleatórios, armazenados como hash, limitados a um painel e revogáveis.
- Tickets WebSocket permanecem de uso único e curta duração e agora são vinculados ao hash da sessão JWT que os emitiu. A conexão revalida usuário ativo e sessão não expirada/não revogada; tickets antigos sem vínculo são recusados após a migração compatível. A integração cobre reutilização e conexão após logout.
- Quando MFA TOTP está habilitado, o login agora exige o código TOTP ou um código de recuperação de uso único; senha correta sem segundo fator não cria sessão.
- Cadastro público é desativado por padrão em todos os ambientes; precisa de `ALLOW_SELF_SERVICE_REGISTRATION=1` explícito. O Blueprint do Render o mantém desativado até haver verificação de e-mail e onboarding.
- O provisionamento da primeira organização usa um comando separado, requer banco sem nenhuma linha, confirmação explícita e terminal interativo para a senha; testes verificam que base com dados é recusada sem alteração e que pipe não é aceito como entrada de senha. O caminho completo também foi executado manualmente numa base SQLite temporária vazia. O comando não é fluxo de convite ou recuperação.
- Webhooks exigem HTTPS, rejeitam destinos não globais, fixam o IP resolvido, não seguem redirects e não herdam proxies do ambiente.
- Cabeçalhos de segurança e CSP estão ativos; os testes confirmam ao menos `X-Content-Type-Options`.
- A revisão dos arquivos de configuração do branch não encontrou `.env` nem credenciais reais versionadas; `.env.example` contém valores vazios/de exemplo. Isso não inspeciona todo o histórico Git nem os segredos configurados no GitHub/Render.

## Pendências antes de dados reais ou venda

- O piloto sem custo usa rate limit em memória por processo. Sem Redis, várias instâncias ou reinícios não compartilham contadores; o fallback continua permissivo para disponibilidade. Configure armazenamento compartilhado antes de escalar.
- Não há confirmação de e-mail, convite, recuperação de senha ou onboarding comercial. O cadastro público agora fica fechado por padrão; não habilite a variável de self-service em produção antes de implementar verificação de e-mail, prevenção contra abuso e fluxo de suporte.
- Ainda não foram executados pentest, teste de carga ou revisão independente. Na validação local do branch em 23/10/2026, os 31 testes passaram; `compileall`, `node --check`, `pip check` e `git diff --check` passaram. A execução GitHub Actions `40041413021` do commit de código `cedb852e330b32679aacf72cb19f9d0cb2cd28e2` passou em `pip-audit`, integração, sintaxe e build Docker. Na validação seguinte, o commit `820d7681e5ba153cbb9367fa95dbd3b174f64d13` estava ativo no serviço piloto Render pelo deploy `dep-dbdv6ejm8hqs73d1jb60`; os endpoints públicos responderam com saúde `ok` e cadastro público desativado. A CI inclui Gitleaks `v8.30.1`, fixado por versão, para examinar todos os commits alcançáveis com `--redact`. A varredura completa sinalizou duas ocorrências da senha fictícia dos testes em um commit histórico; a revisão do contexto confirmou que não são credenciais de serviço ou conta. `.gitleaks.toml` limita a exceção à regra `generic-api-key`, ao arquivo de teste e ao commit específico. Na execução GitHub Actions `40195907833` do commit `9a74ba9181d987bf03c2994c9a7d62db61218b71`, Gitleaks examinou o histórico sem achados além da exceção restrita; passaram `pip-audit`, os 31 testes de integração, `compileall`, `pip check`, `node --check` e o build Docker. O deploy automático desse commit ficou `live` no Render como `dep-dbevss15efls73be9ed0`. A disponibilidade pública não substitui teste de carga ou homologação.
- Em Render, adicione cada domínio personalizado ao `ALLOWED_HOSTS` separado por vírgulas; sem isso, apenas o hostname padrão do serviço é autorizado.
- O Blueprint público solicita PostgreSQL 16 e plano Free; o recurso existente consultado em 25/10 está em PostgreSQL 18, disponível, criado em 16/10/2026 23:07:02 UTC e com expiração em 15/11/2026 23:07:02 UTC. Consulta somente de estrutura/agregados confirmou tabelas e registros, sem leitura de conteúdo de linhas. Não reaplique o Blueprint nem altere conexão antes de backup lógico e restauração isolada validada. Free não tem backup/PITR gerenciado. Migrações formais com rollback, alertas, rotação de credenciais, recuperação de conta, retenção/exclusão de dados e resposta a incidentes ainda precisam de validação operacional.
- A página Environment do serviço histórico `Hitech-VoltGuard` em `main` não contém `DATABASE_URL` nem Environment Group; a branch `main.py` usa SQLite por padrão e o Dockerfile tem `WORKDIR /app`, então dados podem estar em `/app/voltguard.db` no filesystem efêmero Free. A existência e o conteúdo do arquivo não foram verificados. O Dashboard informa que Shell/SSH não são suportados em Free; não reinicie ou implante o serviço antes de um método aprovado de preservação. No serviço piloto, `DATABASE_URL` está definida diretamente, mas seu valor não foi revelado e o banco de destino permanece desconhecido.
- A telemetria Modbus ainda precisa ser validada com o modelo/firmware do medidor em laboratório. Não conecte esta aplicação a funções de comando, proteção ou intertravamento e não declare conformidade NR-10, IEC 62443 ou LGPD com base nesta revisão.
- Os testes cobrem os fluxos principais, os acessos cross-tenant listados acima e o cadastro do painel sem telemetria fictícia; ainda não formam uma matriz negativa completa de autorização para cada rota, papel e recurso. Revisar essa matriz antes de ampliar o piloto.

## Referências de advisories consultados

- [PyJWT — correções de segurança até 2.15.0](https://github.com/jpadilla/pyjwt/security/advisories)
- [Starlette — limites de parser de formulário e validação de Host/path](https://github.com/Kludex/starlette/security/advisories)
- [python-multipart — limites de cabeçalho multipart e parsing](https://github.com/Kludex/python-multipart/security/advisories)
- [cryptography — OpenSSL incluído nas wheels e validação de certificados](https://github.com/pyca/cryptography/security/advisories)
