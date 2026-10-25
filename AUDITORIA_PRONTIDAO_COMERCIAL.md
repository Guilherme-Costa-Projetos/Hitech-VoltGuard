# Auditoria de prontidão — HITECH VoltGuard

**Atualização:** 25/10/2026
**Escopo:** código da branch de prontidão, deploy do piloto no Render e metadados/consultas somente de estrutura e agregados do PostgreSQL em 25/10.
**Resultado:** o deploy do piloto está `live`; após a implantação, `/health` respondeu HTTP 200 e a página de login carregou. A autenticação e os fluxos que gravam dados não foram testados nesta verificação. O produto ainda não está pronto para produção comercial nem para receber dados operacionais reais.

## Validação atualizada — 25/10/2026

- A suíte local `python -m unittest discover -s tests -v` passou com **31 testes** usando `requirements-test.txt`. A execução só inicializa a aplicação com banco de teste local; não conecta ao PostgreSQL do Render nem grava no piloto.
- O aviso do Starlette sobre `httpx` no `TestClient` foi resolvido adicionando `httpx2` somente em `requirements-test.txt`; `httpx` continua nas dependências de produção para o gateway. A suíte passou sem o aviso; `pip check` e `compileall` também passaram.
- O GitHub Actions do commit `e3c9530f5bc7a97898ca2710b8277edee134f721` concluiu com sucesso no run **40199571178** (run #71), incluindo Gitleaks, `pip-audit`, 31 testes, sintaxe e build Docker.
- O Render confirma o deploy `dep-dbf0jcdg1s2s739qm5o0` como `live`, associado ao mesmo commit, no serviço `voltguard-pilot-free` (plano Free, uma instância, sem alteração de configuração nesta verificação).
- A consulta pública de leitura retornou `/health` com `status: ok` e `/api/tenant/registration-status` com `self_service_enabled: false`. Não houve login, cadastro, gravação ou alteração no banco.
- Requisições GET sem autenticação a `/api/panels`, `/api/users` e `/api/export/executive-report` retornaram HTTP 401 com JSON; nenhum conteúdo protegido foi recebido.
- Nova consulta somente de metadados no workspace `My Workspace` confirmou o piloto ainda em plano Free, uma instância, branch `codex/commercial-readiness-audit`, `healthCheckPath: /health` e auto-deploy após CI. O PostgreSQL `voltguard-db` segue Free, PostgreSQL 18, disponível e expira em **15/11/2026 23:07:02 UTC**.
- A lista externa do PostgreSQL foi limpa com autorização do responsável (`ipAllowList: []`). Antes da alteração, a consulta read-only de `pg_stat_activity` encontrou duas conexões persistentes do usuário `voltguard_pilot_user` com IP privado `10.31.208.12`; após a mudança, `/health` continuou `ok` e o cadastro permaneceu desativado. O metadado do recurso confirma allowlist vazia. A consulta SQL hospedada do Render deixou de alcançar o banco por fora, como esperado; não foi executada nenhuma consulta a dados de negócio após a alteração. O Render documenta que as regras afetam somente a URL externa e que serviços na mesma região podem sempre usar a URL interna.
- Essas verificações confirmam a disponibilidade básica e a suíte automatizada; não substituem o teste manual dos fluxos autenticados, integração com hardware, restauração de backup nem os bloqueios P0 abaixo.

## Bloqueios prioritários

### P0 — Confirmar e corrigir o banco usado pelo serviço

- A auditoria somente leitura de 22/10 não encontrou tabelas em `voltguard-db` (`dpg-db9as5gn74is73f2felg-a`). Essa observação é histórica: nova consulta em 25/10 encontrou 19 tabelas e registros existentes. Foram consultados apenas nomes de tabelas e agregados; nenhum valor de linha foi lido. Este repositório é público, portanto os agregados não são reproduzidos aqui.
- O PostgreSQL selecionado no workspace `My Workspace` consta como `available`, plano Free, PostgreSQL 18, criado em **16/10/2026 23:07:02 UTC**, com expiração em **15/11/2026 23:07:02 UTC**. A existência de tabelas e registros confirma que qualquer troca de banco, migração ou exclusão deve ser precedida de backup e restauração validada.
- Pela página Environment do Dashboard, o serviço piloto tem `DATABASE_URL` e `SECRET_KEY` definidas diretamente, sem Environment Group vinculado; o valor secreto de `DATABASE_URL` não foi aberto. O destino desse valor continua sem confirmação.
- O serviço histórico `Hitech-VoltGuard` em `main` tem somente `SECRET_KEY` na página Environment e não tem Environment Group vinculado. O `main.py` dessa branch usa `sqlite:///./voltguard.db` como padrão se `DATABASE_URL` faltar, e seu Dockerfile usa `/app` como diretório de trabalho. Portanto, esse serviço pode estar usando `/app/voltguard.db` dentro do filesystem efêmero do container. A existência ou o conteúdo desse arquivo não foram inspecionados. Isso pode explicar autenticações/cadastros anteriores com HTTP 200 apesar do PostgreSQL consultado estar vazio em 22/10, mas não prova onde os dados foram gravados.
- Render documenta que serviços web Free entram em idle após 15 minutos sem tráfego e perdem alterações locais do filesystem ao entrar em idle, reiniciar ou implantar. Portanto, o possível SQLite pode já ter sido apagado; não há evidência para confirmar presença, conteúdo ou perda do arquivo. A consulta de eventos do serviço entre 16/10 e 25/10 não retornou eventos de reinício/disponibilidade, mas a ausência nessa API não confirma persistência nem existência do arquivo. O `main.py` público oferece exportação de relatório executivo, não exportação/restauração completa do SQLite.
- Não reinicie, implante, suspenda ou reconfigure o serviço histórico até determinar se esse arquivo SQLite contém dados que precisam ser preservados e planejar uma cópia segura. O PostgreSQL Free com tabelas/registros pode ser outro conjunto de dados; ainda não foi provado qual serviço o utiliza.
- O Dashboard informa que Render Shell e SSH não são suportados no plano Free. Nenhuma cópia do possível SQLite foi feita; um caminho gratuito para exportar o arquivo diretamente do container ainda não foi confirmado. Não faça upgrade pago sem aprovação; mantenha o serviço histórico em execução e sem deploy até uma via segura de preservação ser definida.
- O Blueprint versionado solicita PostgreSQL 16, enquanto o recurso existente consultado está em PostgreSQL 18. Não reaplique o Blueprint sobre o recurso existente nem inicie migração até confirmar compatibilidade e preservar os dados.
- O código da branch encerra a inicialização no Render se `DATABASE_URL` estiver ausente ou apontar para SQLite. O deploy do commit `ab186c7384558f8f68b19d80fc7019f9df368525` ficou `live` em `dep-dbf071h5efls73bejm00`; isso confirma o deploy, não a identidade do banco nem a persistência dos dados.
- O repositório GitHub está **público** (metadados consultados em 25/10/2026). Não foi alterada sua visibilidade. O serviço piloto e o histórico continuam servindo URLs públicas; não use segredos, dados pessoais ou operacionais reais nesse ambiente.
- O serviço web e o banco PostgreSQL estão no plano Free. O Render documenta que o sistema de arquivos do serviço Free é efêmero, bancos PostgreSQL Free expiram após 30 dias e esses planos são destinados a teste, não produção ([limitações do plano Free do Render](https://render.com/docs/free)).
- O PostgreSQL ativo agora tem `ipAllowList: []`, bloqueando conexões pela internet; o painel confirmou `health: ok` após essa alteração, e as conexões prévias do app vinham de endereço privado. O Render Hosted MCP também perde acesso direto ao banco quando não tem IP externo autorizado; use o app na rede privada ou acesso local controlado conforme a necessidade operacional. Não reabra o acesso público geral apenas para restaurar consultas administrativas.
- Há dois serviços Render públicos ligados ao mesmo repositório: `Hitech-VoltGuard` segue `main` em `https://hitech-voltguard-934a.onrender.com/`, sem health check; `voltguard-pilot-free` segue `codex/commercial-readiness-audit` em `https://voltguard-pilot-free.onrender.com/`, com `/health` e deploy após CI. Ambos estão no plano Free. A revisão do piloto ainda não foi promovida para `main`.

**Ação para liberar:** preservar primeiro qualquer arquivo SQLite do serviço histórico ainda em execução por método de exportação gratuito, seguro e aprovado; esse método ainda precisa ser encontrado. Enquanto isso, não reiniciar nem implantar o serviço. Em paralelo, gerar backup lógico manual do PostgreSQL Free e validar restauração completa em instância separada e vazia. Identificar o destino de `DATABASE_URL` do piloto sem divulgar o segredo. Só então decidir infraestrutura e compatibilidade de versão; não migrar ou excluir dados antes disso. Resolver a expiração do PostgreSQL antes de **15/11/2026 23:07 UTC**.

### Verificações pós-deploy — saúde do piloto

- A configuração inicial do serviço estava sem `healthCheckPath`; `/health` foi definido no Render em 23/10 e o deploy da configuração concluiu como `live`.
- A rota implementa `SELECT 1` e responde erro se o banco não responder. Em 25/10/2026, após o deploy `dep-dbf071h5efls73bejm00` do commit `ab186c7384558f8f68b19d80fc7019f9df368525`, a verificação direta no navegador retornou HTTP 200 com `{"status":"ok","service":"voltguard","mode":"stored-data"}`. A raiz carregou a tela de login; nenhuma autenticação nem gravação foi feita nesta verificação.
- A consulta somente leitura ao endpoint público `/api/tenant/registration-status` retornou HTTP 200 com `self_service_enabled: false` após esse deploy. Cadastro permanece fechado no piloto.
- O modo automático de deploy do Render está configurado para `After CI Checks Pass`; as revisões recentes passaram na CI antes de publicar.

## Lacunas de produto e operação

### P1 — Cobrança e ciclo comercial

- A tela de assinatura declara que pagamentos, alteração de plano e cancelamento não são processados.
- A assinatura é apenas metadado no banco; não há provedor de pagamento, webhook de cobrança, renovação, inadimplência, cancelamento ou bloqueio de recursos por plano.
- Planos e preço ainda dependem de pilotos e cálculo de custo de implantação, gateway, conectividade, cloud e suporte.

**Ação:** definir mercado inicial e modelo de cobrança com pilotos pagos; então escolher provedor, regras de plano, emissão fiscal, cancelamento e tratamento de falhas antes de implementar o fluxo de pagamento.

### P1 — Identidade e atendimento ao cliente

- O cadastro de organização não tem confirmação de e-mail; por segurança, está fechado por padrão no Render. Ainda não há convites, recuperação de senha ou aprovação comercial. A variável de auto-cadastro não deve ser habilitada em produção até esses fluxos serem projetados e testados.
- Não há recuperação de senha por e-mail. A recuperação administrativa depende de suporte fora do fluxo do produto.
- Não há política implementada de retenção, exportação e exclusão de dados da organização, termos, aviso de privacidade, SLA nem processo de resposta a incidentes.

**Ação:** definir o processo de onboarding e recuperação; incluir os fluxos de e-mail verificado/convite e suporte; formalizar privacidade, retenção e atendimento antes de clientes reais.

### P1 — Dados e integração industrial

- Novas organizações recebem painéis fictícios de demonstração. Alguns indicadores antigos do dashboard eram números fixos e sem origem operacional; foram substituídos nesta revisão por contagens baseadas na API.
- `gateway.py` implementa um coletor Modbus configurável, mas o mapa de registradores depende do equipamento e firmware. Não há homologação física do PM5320 nem validação laboratorial documentada.
- A conectividade significa atividade recente da credencial/API, não disponibilidade garantida do medidor ou do circuito. Os indicadores preditivos e ESG ainda não devem ser vendidos como previsões ou medições validadas.
- O produto é monitoramento e apoio à manutenção. Não é sistema certificado de proteção, comando, intertravamento ou conformidade normativa.

**Ação:** separar claramente demonstração de produção; escolher medidores e gateway do piloto; validar leituras, qualidade, stale data, reconexão e alarmes em laboratório e depois em piloto controlado, sem conectar o VoltGuard a funções de proteção/comando.

### P1 — Confiabilidade e segurança de produção

- `init_db()` usa `create_all()` e ajustes de compatibilidade específicos; ainda não há migrações versionadas com rollback.
- Não há evidência registrada de restauração de backup testada, monitoramento/alertas operacionais, teste de carga, revisão independente de segurança ou testes de isolamento completos de todos os endpoints.
- O rate limit é local por processo sem Redis. A arquitetura atual do serviço tem uma instância, mas limites globais serão necessários ao escalar.
- Webhooks são síncronos, sem fila durável, política de repetição ou monitoramento de entrega.

**Ação:** adicionar migrações formais, backup e restauração ensaiados, alertas, testes de segurança/isolamento e observabilidade; mover entregas externas para fila durável quando a operação exigir garantias.

## Melhorias feitas nesta revisão

- Removidos KPIs fixos de risco, downtime, confiabilidade, ESG, MTTR e disponibilidade que não eram calculados a partir de dados reais.
- O cabeçalho agora mostra painéis cadastrados, painéis online, alarmes ativos/reconhecidos e ordens em aberto, atualizados com o polling do painel.
- Adicionada proteção para impedir que uma configuração do Render sem `DATABASE_URL` use o SQLite descartável como se fosse persistente.
- O cadastro de ativos não cria medições aleatórias nem histórico fictício; leituras parciais ficam identificadas e não são exibidas como estado normal.
- Login de contas com MFA habilitado exige segundo fator. Cadastro público fecha por padrão e só abre com `ALLOW_SELF_SERVICE_REGISTRATION=1` configurado explicitamente.
- Acrescentado `scripts/provision_first_tenant.py`: inicializa a primeira organização apenas quando todas as tabelas estão vazias, exige confirmação e senha em terminal interativo, e reaproveita as validações do endpoint existente. Não altera dados de uma base preenchida nem ativa o cadastro público do serviço.
- Novo teste percorre todas as rotas `/api/` e falha se alguma não exigir usuário autenticado ou credencial de dispositivo explicitamente.
- Health check HTTP `/health` configurado no Render e declarado no Blueprint; verificado após o deploy `dep-dbf071h5efls73bejm00` com HTTP 200. A raiz carregou a tela de login, sem autenticar ou alterar dados.
- Deploy do serviço configurado para aguardar CI do GitHub. O commit `ab186c7384558f8f68b19d80fc7019f9df368525` está `live` no Render; a execução GitHub Actions `40197556258` passou em Gitleaks, `pip-audit`, 31 testes de integração, sintaxe Python/JavaScript e build Docker.

## Ordem sugerida de liberação

1. Encontrar método gratuito aprovado para preservar possível SQLite do serviço histórico; Render Shell não está disponível no plano Free. Não reiniciar ou implantar esse serviço até avaliar e exportar os dados.
2. Fazer backup lógico do PostgreSQL Free populado e testar restauração em instância separada; resolver a expiração antes de 15/11/2026 23:07 UTC.
3. Identificar sem ambiguidade o PostgreSQL usado pelo piloto e validar a diferença de versão 16/18 antes de qualquer migração.
4. Aprovar infraestrutura persistente e configurar backup/restauração.
5. Manter o health check HTTP `/health` e validar a próxima revisão em homologação.
6. Fechar onboarding, recuperação de conta, privacidade, suporte e cobrança.
7. Validar hardware/protocolo e isolamento industrial com piloto pago e métricas de sucesso acordadas.
8. Só então habilitar clientes de produção e anunciar métricas/benefícios que tenham evidência.

## Limites desta auditoria

Esta revisão não substitui revisão independente de segurança, validação em medidor físico, assessoria jurídica/tributária ou confirmação do vínculo e da persistência de `DATABASE_URL` no painel do Render. Não foram alterados recursos pagos, segredos ou banco de dados. A visibilidade pública do GitHub foi confirmada; revise se isso é intencional antes de armazenar artefatos ou informações operacionais no repositório. O Render foi configurado para verificar `/health` e aguardar o CI do GitHub antes de publicar.
