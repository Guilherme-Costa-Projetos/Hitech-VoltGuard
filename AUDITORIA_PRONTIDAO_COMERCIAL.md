# Auditoria de prontidão — HITECH VoltGuard

**Atualização:** 25/10/2026
**Escopo:** código da branch de prontidão, deploy do piloto no Render e metadados/consultas somente de estrutura e agregados do PostgreSQL em 25/10.
**Resultado:** o deploy do piloto está `live`; após a implantação, `/health` respondeu HTTP 200 e a página de login carregou. A autenticação e os fluxos que gravam dados não foram testados nesta verificação. O produto ainda não está pronto para produção comercial nem para receber dados operacionais reais.

## Bloqueios prioritários

### P0 — Confirmar e corrigir o banco usado pelo serviço

- A auditoria somente leitura de 22/10 não encontrou tabelas em `voltguard-db` (`dpg-db9as5gn74is73f2felg-a`). Essa observação é histórica: nova consulta em 25/10 encontrou 19 tabelas e registros existentes. Foram consultados apenas nomes de tabelas e agregados; nenhum valor de linha foi lido. Este repositório é público, portanto os agregados não são reproduzidos aqui.
- O PostgreSQL selecionado no workspace `My Workspace` consta como `available`, plano Free, PostgreSQL 18, criado em **16/10/2026 23:07:02 UTC**, com expiração em **15/11/2026 23:07:02 UTC**. A existência de tabelas e registros confirma que qualquer troca de banco, migração ou exclusão deve ser precedida de backup e restauração validada.
- Não foi possível confirmar a variável `DATABASE_URL` do serviço pelo conector Render: a resposta não expõe o vínculo de variáveis. Assim, ainda não se sabe se o serviço piloto, o serviço histórico ou ambos apontam para esse banco. A configuração observada de serviço não basta para provar o vínculo.
- O Blueprint versionado solicita PostgreSQL 16, enquanto o recurso existente consultado está em PostgreSQL 18. Não reaplique o Blueprint sobre o recurso existente nem inicie migração até confirmar compatibilidade e preservar os dados.
- O código da branch encerra a inicialização no Render se `DATABASE_URL` estiver ausente ou apontar para SQLite. O deploy mais recente do piloto, do commit `ec4aaf3258d097557fafb0aab211a0fe56f35db7`, ficou `live` em `dep-dbf01ke7bikc73bli5b0`; isso confirma o deploy, não a identidade do banco nem a persistência dos dados.
- O repositório GitHub está **público** (metadados consultados em 25/10/2026). Não foi alterada sua visibilidade. O serviço piloto e o histórico continuam servindo URLs públicas; não use segredos, dados pessoais ou operacionais reais nesse ambiente.
- O serviço web e o banco PostgreSQL estão no plano Free. O Render documenta que o sistema de arquivos do serviço Free é efêmero, bancos PostgreSQL Free expiram após 30 dias e esses planos são destinados a teste, não produção ([limitações do plano Free do Render](https://render.com/docs/free)).
- Há dois serviços Render públicos ligados ao mesmo repositório: `Hitech-VoltGuard` segue `main` em `https://hitech-voltguard-934a.onrender.com/`, sem health check; `voltguard-pilot-free` segue `codex/commercial-readiness-audit` em `https://voltguard-pilot-free.onrender.com/`, com `/health` e deploy após CI. Ambos estão no plano Free. A revisão do piloto ainda não foi promovida para `main`.

**Ação para liberar:** no Dashboard, identificar a origem efetiva de `DATABASE_URL` sem copiar o segredo para o chat. Antes de qualquer alteração, gerar backup lógico manual do Free e validar restauração completa em instância PostgreSQL separada e vazia. Depois decidir infraestrutura e compatibilidade de versão; não reiniciar, migrar ou excluir dados antes disso. Resolver a expiração antes de **15/11/2026 23:07 UTC**.

### P0 — Tornar o health check HTTP efetivo

- A configuração inicial do serviço estava sem `healthCheckPath`; `/health` foi definido no Render em 23/10 e o deploy da configuração concluiu como `live`.
- A rota implementa `SELECT 1` e responde erro se o banco não responder. Em 25/10/2026, após o deploy `dep-dbf04h0473hc739h4fi0` do commit `4c6802de7777c4dd6bebb4dc1d03113e3d12df94`, a verificação direta no navegador retornou HTTP 200 com `{"status":"ok","service":"voltguard","mode":"stored-data"}`. A raiz carregou a tela de login; nenhuma autenticação nem gravação foi feita nesta verificação.
- O modo automático de deploy do Render foi alterado de `On Commit` para `After CI Checks Pass`; a próxima revisão só será publicada após os checks configurados no GitHub passarem.

**Ação para liberar:** abrir o endpoint `/health` do piloto no navegador do usuário após o deploy e confirmar HTTP 200; confirmar separadamente no Dashboard qual recurso fornece `DATABASE_URL`, sem compartilhar seu valor. `SELECT 1` confirma conexão, mas não identidade nem histórico do banco.

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
- Health check HTTP `/health` configurado no Render e declarado no Blueprint; verificado após o deploy atual com HTTP 200. A raiz carregou a tela de login, sem autenticar ou alterar dados.
- Deploy do serviço configurado para aguardar CI do GitHub. O commit `ec4aaf3258d097557fafb0aab211a0fe56f35db7` está `live` no Render; a execução GitHub Actions `40196676008` passou em Gitleaks, `pip-audit`, 31 testes de integração, sintaxe Python/JavaScript e build Docker.

## Ordem sugerida de liberação

1. Fazer backup lógico do banco Free populado e testar restauração em instância separada; resolver a expiração antes de 15/11/2026 23:07 UTC.
2. Identificar sem ambiguidade o banco que cada serviço usa e validar a diferença PostgreSQL 16/18 antes de qualquer migração ou reinício.
3. Aprovar infraestrutura persistente e configurar backup/restauração.
4. Manter o health check HTTP `/health` e validar a próxima revisão em homologação.
5. Fechar onboarding, recuperação de conta, privacidade, suporte e cobrança.
6. Validar hardware/protocolo e isolamento industrial com piloto pago e métricas de sucesso acordadas.
7. Só então habilitar clientes de produção e anunciar métricas/benefícios que tenham evidência.

## Limites desta auditoria

Esta revisão não substitui revisão independente de segurança, validação em medidor físico, assessoria jurídica/tributária ou confirmação do vínculo e da persistência de `DATABASE_URL` no painel do Render. Não foram alterados recursos pagos, segredos ou banco de dados. A visibilidade pública do GitHub foi confirmada; revise se isso é intencional antes de armazenar artefatos ou informações operacionais no repositório. O Render foi configurado para verificar `/health` e aguardar o CI do GitHub antes de publicar.
