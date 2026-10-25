# Revisão técnica — HITECH VoltGuard

## Escopo e conclusão

Esta entrega organiza e endurece o MVP para **demonstração/homologação controlada** no Render. Não representa certificação, pentest independente, conformidade normativa nem prontidão para uso industrial crítico.

## Melhorias aplicadas nesta revisão

- v0.65.0: limite de corpo aplicado durante o recebimento (1 MiB para API e 16 KiB para telemetria, inclusive sem `Content-Length`); no Render, limitador usa `CF-Connecting-IP`, Uvicorn não confia genericamente em cabeçalhos proxy e o Host é restrito; expiração da assinatura calculada em cada inserção; timestamps UTC atualizados; dependências elevadas para versões com patches de segurança conhecidos. A suíte passou com 18 testes. Pendências de segurança e validação operacional estão em `SECURITY_REVIEW.md`.
- v0.64.0: a API exige CEO para exportar o relatório executivo e CEO/Gerente para consultar credenciais de dispositivos, alinhando a autorização do backend à interface e mantendo os dados limitados ao tenant autenticado.
- Operação do banco: documentado o fluxo de exportação e recuperação do PostgreSQL em instância separada, incluindo os limites do plano Free e a preservação de `SECRET_KEY`. O procedimento ainda precisa ser executado e a restauração validada pelo responsável do ambiente.
- v0.63.2: o Dockerfile instala explicitamente PyOTP, qrcode/Pillow e cryptography, e valida as importações durante o build.
- v0.63.1: instalação explícita do PyOTP no Docker e verificação de importação de PyOTP, qrcode e cryptography durante o build.
- v0.63.0: contas com MFA ativo precisam de TOTP ou código de recuperação de uso único tanto no login quanto na troca de senha; todos os perfis podem ativar MFA. A URI do QR contém um único rótulo de conta, sem parâmetro de emissor repetido.
- v0.62.3: o primeiro enrollment MFA exige nova senha após validar o TOTP. Um desafio aleatório, com hash no banco, expira em 10 minutos e é consumido atomicamente; MFA e códigos de recuperação só são ativados após a troca de senha. Outras sessões são revogadas.
- v0.62.2: configuração MFA exibe QR Code gerado localmente com a URI TOTP; permanece disponível a chave manual e nenhuma API externa recebe o segredo.
- v0.62.1: o polling de telemetria não reconstrói a aba Minha conta nem consulta novamente o estado MFA a cada três segundos.
- v0.62.0: qualquer perfil pode ativar MFA TOTP; segredo cifrado em repouso, reautenticação ao alterar a configuração, rejeição atômica de códigos TOTP já usados e 10 códigos de recuperação aleatórios de uso único. Migração compatível adiciona campos opcionais em `users`. MFA fica desativado até adesão explícita nesta versão.
- v0.61.0: rate limiting pode usar Redis/Redis TLS por `RATE_LIMIT_STORAGE_URI`; fallback em memória preserva disponibilidade se Redis falhar, mas não oferece contagem global enquanto o armazenamento compartilhado estiver fora do ar. A variável é opcional; sem Redis, o comportamento permanece por processo.
- v0.60.0: o login executa scrypt mesmo quando o nome de usuário não existe ou a conta ainda usa hash SHA-256 legado, reduzindo diferenças de tempo que poderiam facilitar enumeração de contas. A resposta de erro permanece genérica e nenhuma migração de banco é necessária.
- v0.59.1: a página inicial envia `Cache-Control: no-store` para evitar HTML antigo em cache após deploy; o pacote mantém referências às bibliotecas JavaScript locais de `vendor/`.
- v0.59.0: CSP passou a ser aplicada; scripts, conexões e formulários ficam restritos à origem, objetos e enquadramento são bloqueados. Estilos inline seguem permitidos para manter compatibilidade com o scanner QR; a política Report-Only restritiva continua ativa para observação. A inicialização confere os arquivos JavaScript obrigatórios de `vendor/` e identifica os ausentes.
- v0.58.0: CEO pode encerrar remotamente todas as sessões ativas de outro usuário do próprio tenant; a API bloqueia contas CEO, autoencerramento e contas desativadas, informa a quantidade revogada e registra auditoria.
- v0.56.0: gestão de usuários exclusiva do CEO e isolada por tenant; criação de contas operacionais, alteração de perfil e ativação/desativação; senhas nunca retornam pela API; desativação e mudança de perfil revogam sessões; eventos de gestão são auditados. Migração compatível adiciona `users.is_active` às bases existentes. Blueprint Render alinhado a Docker.
- v0.57.0: troca de senha autenticada pelo próprio usuário, exigindo senha atual, senha nova diferente e mínimo de 12 caracteres; todas as sessões são revogadas e a operação é auditada sem persistir segredos no evento. A rota possui limite de tentativas.
- v0.55.0: matriz central de autorização por perfil; telemetria autenticada restrita aos papéis operacionais; módulos Ativos/Manutenção disponíveis ao Técnico de Campo, com edição de ativos ainda limitada a CEO/Gerente.
- v0.54.0: envios de webhook conectam ao IP público resolvido e validado no momento da entrega, com Host/SNI originais para conservar o roteamento e a verificação TLS. Requests não seguem redirects, ignoram proxies do ambiente e não carregam corpos de resposta.
- v0.53.0: Chart.js 4.5.1 e html5-qrcode 2.3.8 passaram a ser servidos localmente em `vendor/`; versões fixadas e licenças distribuídas com a aplicação. CSP Report-Only não permite mais scripts de CDNs.
- A CSP ativa permite estilos inline para preservar compatibilidade com o scanner QR. A política Report-Only mais restritiva permanece para observar violações. Antes de endurecer a política de estilos, validar os fluxos do scanner QR e do relatório de OS em navegador.
- v0.50.0: folha de estilos principal separada em `styles.css`, servida pelo FastAPI com `Cache-Control: no-store` e incluída na imagem Docker. Atributos de estilo dinâmicos e estilos do relatório gerado ainda impedem CSP estrita.
- v0.49.0: removidos eventos inline de clique, alteração, entrada e envio de formulário; listeners delegados encaminham ações por listas explícitas. Estilos inline restantes impedem CSP estrita.
- v0.48.0: ações de clique das telas dinâmicas migradas para delegação baseada em `data-action` e lista explícita de operações. Eventos inline de alteração/entrada e estilos inline restantes ainda impedem CSP estrita.
- v0.47.0: navegação das abas e envios de formulários dinâmicos migrados para listeners delegados com ações permitidas explicitamente, sem `eval`. Eventos inline dinâmicos restantes e estilos inline ainda impedem CSP estrita.
- v0.46.0: removidos os eventos inline da tela de autenticação, com delegação no JavaScript externo; as alternâncias entre login e cadastro passaram a botões acessíveis por teclado. Handlers nas telas dinâmicas e estilos inline ainda impedem uma CSP estrita.
- v0.45.0: script principal extraído para `app.js`, servido pelo FastAPI com `Cache-Control: no-store` e incluído na imagem Docker. A CSP restritiva permanece pendente porque ainda existem handlers e estilos inline.
- Nomes de arquivos padronizados para coincidir com os caminhos esperados pelo Render e Dockerfile.
- Cabeçalhos HTTP básicos, política `no-store` para respostas de API/health e política de permissões para recursos do navegador.
- Hash de senhas com scrypt e migração de hashes SHA-256 legados no login.
- `SECRET_KEY` configurável; o Render deve fornecer um segredo estável e aleatório.
- Validação de senha de cadastro com mínimo de 12 caracteres, limites de comprimento e validação de identificadores.
- Rate limiting de login, cadastro e endpoints operacionais usando SlowAPI; com `RATE_LIMIT_STORAGE_URI` em Redis pode compartilhar contadores entre instâncias. Sem a variável, permanece por processo.
- Filtros por organização nas consultas de painéis, ordens, auditoria, inventário e histórico.
- Adicionado `tenant_id` ao histórico de painéis, incluindo uma migração de compatibilidade estreita para bancos anteriores.
- Timestamps de novos registros de histórico passam a incluir data/hora completa em formato ISO.
- Validação numérica de telemetria, limites térmicos e de corrente.
- Proteção contra ajuste de estoque abaixo de zero e tratamento de entradas numéricas inválidas.
- Validação HTTPS e bloqueio inicial de destinos locais/privados para webhooks; redirects automáticos desativados no envio.
- Relatório CSV protegido por autenticação e limitado à organização autenticada.
- Interface ajustada para telas menores e identificação explícita de que relatório e painéis demonstrativos não certificam conformidade NR-10.
- Botões de simulação de falha não interpolam o ID do painel em código JavaScript inline.
- Testes básicos adicionados para health check, cabeçalhos, cadastro/login, isolamento entre organizações, inventário e autenticação do relatório.

## Limitações e pendências antes de produção

### Segurança e identidade

1. Realizar revisão de segurança independente e teste de penetração.
2. Revisar os pontos de inserção via `innerHTML`; preferir `textContent`, criação de nós DOM e escape contextual para dados variáveis.
3. A CSP ativa já limita scripts à própria origem. Antes de remover `unsafe-inline` de estilos, validar em navegador o leitor QR e o relatório de OS; a política Report-Only ajuda a localizar violações.
4. MFA TOTP está disponível a qualquer perfil e, quando ativado, é obrigatório no login e na troca de senha. Recuperação de conta, recuperação de senha por e-mail e alertas de atividade continuam pendentes; antes de impor MFA por política, definir também o processo de suporte.
5. Provisionar Redis gerenciado e configurar `RATE_LIMIT_STORAGE_URI` como segredo no Render antes de escalar para múltiplas instâncias; o fallback em memória não mantém limites globais durante falhas do Redis.
6. Limitar conexões WebSocket, acompanhar falhas de autenticação e considerar um transporte de credencial fora da URL para ambientes de produção.
7. O webhook agora fixa o IP público validado por envio para mitigar DNS rebinding/TOCTOU. Antes de produção, ainda usar política de saída de rede, limitar destinos, executar envios num worker isolado e definir logs/retries controlados.
8. Rever a política de CORS, cookies/sessões (se forem introduzidos), CSP e configuração de proxy/HTTPS de acordo com o ambiente.

### Controles implementados na versão 0.41.0

- Tokens de acesso expiram em 8 horas.
- A autorização HTTP usa o usuário atual do banco para obter papel, organização e plano; exclusão e mudança de papel/organização têm efeito imediato sobre tokens já emitidos.
- WebSocket usa ticket opaco de uso único, armazenado como hash e válido por 30 segundos. O ticket é consumido atomicamente e a origem do navegador precisa corresponder à origem do serviço.
- O frontend ainda não usa WebSocket. O ticket curto reduz o impacto de registros de URL, mas não remove completamente o segredo da URL; limitar conexões e monitorar tentativas continua pendente.

### Controles implementados na versão 0.43.0

- Cada login recebe um identificador de sessão aleatório; somente seu hash e validade são persistidos.
- A autorização verifica a sessão ativa em cada requisição autenticada. O endpoint `/api/logout` revoga a sessão atual, e a interface limpa o token e interrompe o polling.
- A atualização invalida tokens emitidos antes da adoção do identificador de sessão; a interface solicita novo login. A troca de senha e a revogação de todas as sessões da conta foram adicionadas em v0.57.0. MFA TOTP foi adicionado em v0.62.0; recuperação de senha e alertas de atividade continuam pendentes.

### Controles implementados na versão 0.44.0

- A ingestão de dispositivo limita 600 requisições por minuto por endereço IP usando SlowAPI.
- A API limita os corpos a 1 MiB e a ingestão de telemetria a 16 KB durante a leitura, inclusive sem `Content-Length`.
- O modelo de telemetria rejeita campos desconhecidos e limita os tamanhos de `panel_id`, `voltage` e `gateway_qr`.
- O rate limiting usa memória por processo quando `RATE_LIMIT_STORAGE_URI` não está configurada. Com Redis configurado, os contadores são compartilhados entre instâncias; se Redis ficar indisponível, há fallback em memória e a contagem deixa de ser global até a recuperação.

### Banco e multiempresa

1. `PanelModel.id` ainda é chave primária global. A aplicação não permite reutilizar o mesmo ID em duas organizações. Alterar para chave composta exige migração estrutural e testes de regressão.
2. A coluna `tenant_id` foi adicionada ao histórico e as consultas filtram por organização. Validar a migração com cópia de banco e backup antes de atualizar bases persistentes antigas.
3. `init_db()` contém alterações de compatibilidade limitadas em `panel_history`, `panels`, `work_orders` e `users`, além de `Base.metadata.create_all()`. Não há histórico versionado ou rollback; adotar Alembic após ensaio em cópia, com backup e plano de retorno. Ver `DATABASE_OPERATIONS.md`.
4. Adicionar testes negativos para cada endpoint que lê ou altera painéis, inventário, regras, auditoria, ordens, webhooks e relatórios.
5. Criar histórico de movimentação de estoque, constraints/índices apropriados, transações robustas e testes de concorrência. A validação de saldo negativo já foi adicionada, mas concorrência precisa ser testada em PostgreSQL.
6. Completar trilha de auditoria para todas as operações administrativas e definir retenção, exportação e exclusão.

### Telemetria e operação

1. A ingestão já usa credenciais individuais por dispositivo, armazenadas como hash, com vínculo a um único painel e possibilidade de revogação. Permanecem pendentes rotação planejada, timestamps de origem confiáveis, idempotência, rate limiting distribuído por credencial e métricas de qualidade.
2. Não existe integração pronta com PLCs/medidores físicos. Definir equipamentos e protocolos (p. ex. Modbus TCP/RTU ou OPC UA), validar em laboratório e separar a rede de aquisição.
3. Criar detecção de equipamento offline, limites de stale data, reconexão, fila de eventos e observabilidade.
4. Previsão de falhas, ESG e KPIs demonstrativos não devem ser anunciados como medições ou previsões validadas.
5. Cobrança é metadado, sem gateway de pagamento, renovação ou gestão de inadimplência.
6. Executar e registrar um backup e uma restauração do PostgreSQL em instância separada; o procedimento está documentado em `DATABASE_OPERATIONS.md`. Logs estruturados, alertas e plano de resposta a incidentes continuam pendentes.
7. Executar testes de carga, navegador multiplataforma e testes de recuperação antes de um piloto.

## Conformidade e segurança industrial

Não declarar conformidade com NR-10, IEC 62443, LGPD ou qualquer certificação industrial com base nesta entrega. A LGPD depende do tratamento real de dados pessoais e das operações da organização; requisitos de segurança industrial dependem da arquitetura, análise de risco, controles e validação profissional. Não conectar a aplicação a funções de comando, proteção ou intertravamento elétrico.

## Critérios mínimos de liberação para piloto com dados reais

- [ ] Revisão de segurança e autorização multiempresa concluída.
- [ ] Testes automatizados executados no ambiente equivalente ao de produção.
- [ ] Migração de banco revisada, backup feito e restauração testada.
- [ ] Segredos e acessos administrativos configurados com privilégio mínimo.
- [ ] Política de retenção, privacidade, resposta a incidentes e suporte definida.
- [ ] Fonte e confiabilidade de cada leitura claramente identificadas.
- [ ] Telemetria industrial validada em laboratório e isolada de sistemas de proteção/comando.

## Atualização técnica v0.4.0

### Melhorias implementadas nesta rodada
- Central de Alarmes com persistência no banco, severidade, estado, primeira/última ocorrência, reconhecimento e encerramento.
- Alarmes de temperatura e corrente são gerados a partir da telemetria autenticada e dos limites configurados pela organização.
- Repetições atualizam o alarme aberto existente do mesmo tipo para o painel, evitando criar uma nova linha a cada leitura.
- Quando uma leitura posterior volta aos limites, o alarme correspondente é encerrado automaticamente. O encerramento manual permanece disponível para usuários autorizados.
- Endpoints de listagem, reconhecimento e encerramento filtram por `tenant_id`; ações manuais geram trilha de auditoria.
- A interface ganhou a aba Central de Alarmes.

### Referências de produto usadas como inspiração funcional
A organização de dispositivos/ativos, dashboards, telemetria e alarmes segue padrões públicos encontrados na documentação do ThingsBoard. O código e a interface foram implementados especificamente para este projeto, sem copiar código proprietário.

### Limitações que continuam abertas
- O painel ainda inclui métricas e ativos de demonstração; valores simulados não devem ser interpretados como medições de campo.
- Não foi implementado driver físico Modbus TCP/OPC UA nem provisionamento de credenciais independentes por dispositivo nesta rodada.
- Notificações externas de alarmes exigem configuração e testes próprios; webhook não substitui um sistema de entrega confiável.
- O controle de assinaturas ainda não processa pagamentos reais.
- A versão não é certificada para comando/proteção de instalações industriais e não declara conformidade automática com NR-10, IEC 62443 ou LGPD.
- A migração atual de banco continua limitada; para mudanças de esquema futuras, adotar Alembic e processo de backup/rollback.


## Revisão adicional — versão 0.5.0

Implementados cadastro de ativos, planos/tarefas de manutenção e credenciais próprias de dispositivos. As credenciais são armazenadas como hashes e podem ser revogadas; a ingestão autenticada valida que o token só escreve no painel vinculado. A recorrência é orientada à conclusão da tarefa e não depende de um scheduler.

Antes de produção: usar migrações formais (Alembic), limitar taxa distribuída, testar restauração/backup, revisar WebSocket e CSP/XSS, adicionar notificações com entrega monitorada, realizar testes de carga e revisão independente de segurança. Nenhuma integração Modbus/OPC UA ou certificação de segurança funcional está incluída.


## Atualização v0.5.3

- Adicionado estado derivado de conectividade para credenciais de dispositivo: `NOT_CONFIGURED`, `NEVER_CONNECTED`, `ONLINE`, `OFFLINE`. O cálculo usa `DeviceCredential.last_used_at` e exclui credenciais revogadas.
- `DEVICE_OFFLINE_AFTER_SECONDS` controla o limiar de inatividade (padrão 300 s, limitado a 30–86400 s).
- Adicionado endpoint autenticado `GET /api/telemetry/history/{panel_id}` com paginação por ID e validação de tenant.
- O endpoint agregado `/api/panels` limita histórico a 500 amostras mais recentes por painel.
- Testes cobrem paginação, limites, isolamento entre tenants e estados de conectividade.
- Limitação: isto indica atividade da credencial/API, não confirma disponibilidade física do PLC/rede; um gateway pode enviar telemetria enquanto o equipamento de campo está inacessível.
