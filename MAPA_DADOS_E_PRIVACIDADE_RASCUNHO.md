# Mapa técnico de dados e privacidade — rascunho

**Estado:** inventário técnico do código; não é aviso de privacidade, política de retenção, contrato ou parecer jurídico.  
**Base revisada:** branch `codex/commercial-readiness-audit`, código `main.py` e `gateway.py`, em 23/10/2026.  
**Uso permitido no piloto atual:** somente dados fictícios até aprovação de finalidade, papéis, avisos, retenção, infraestrutura e controles operacionais.

Este documento descreve campos e fluxos observados na implementação. Não presume finalidade jurídica, base legal, prazo de guarda, localização do PostgreSQL, acesso interno do provedor ou práticas de backup. Esses pontos precisam ser confirmados antes de inserir dados pessoais ou operacionais reais.

## Inventário observado

| Categoria | Exemplos de campos/tabelas | Uso técnico observado | Acesso e exposição observados | Retenção/exclusão observadas |
|---|---|---|---|---|
| Conta e autenticação | `users`: username, hash de senha, papel, tenant, plano, estado ativo, segredo TOTP cifrado, hashes de recuperação e desafio MFA | Autenticar, autorizar e aplicar MFA | Rotas autenticadas; usernames/roles aparecem em auditoria e histórico | Não há exclusão de conta/tenant observada. Desativar usuário e revogar sessões não removem o registro nem históricos associados. |
| Sessões e tickets | `auth_sessions`: username, hash do JTI, expiração, revogação; `websocket_tickets`: username, hash do ticket, hash da sessão emissora, expiração, uso | Revogação de sessão e autenticação WebSocket de uso único | Segredos são armazenados como hashes; ticket WebSocket é curto e vinculado à sessão que o emitiu | Sessões expiradas há mais de 30 dias são removidas durante login; tickets expirados há mais de um dia são removidos ao emitir novo ticket. A limpeza não é um processo agendado. |
| Telemetria e configuração de painéis | `panels`, `panel_history`, `alarm_rules`: tenant/painel, nome/localização e medições (temperatura, corrente, tensão, potência, energia, frequência, fator de potência), regras e horários | Mostrar estado/histórico e detectar limites configurados | Rotas autenticadas e filtradas por tenant; histórico é limitado por consulta e painel | Não foi encontrada política/rotina de expurgo do histórico. Exclusão de painel/tenant não está disponível como fluxo completo observado. |
| Alarmes e manutenção | `alarms`, `work_orders`, `work_order_history`, checklists, `maintenance_plans`, `maintenance_tasks` | Acompanhar alarmes, intervenções, responsáveis, execução e resolução | Consultas autenticadas e tenant-scoped; histórico de auditoria tem limites de consulta | Não foi encontrada retenção nem exclusão em cascata/expurgo para esses registros. |
| Ativos, estoque e custos | `assets`: localização, fabricante, modelo, número de série, observações; `inventory`: peça, categoria, quantidades, custo unitário | Cadastro de ativos e apoio ao controle operacional | Relatório executivo CEO-only, isolado por tenant; outras rotas seguem autorização do backend | Sem política de retenção ou exclusão integral observada. |
| Auditoria | `audit_logs`: tenant, data, username, papel, ação e detalhes; histórico de OS inclui autor, ação, detalhes e resolução | Rastreabilidade de ações | Consulta de logs limitada ao CEO e ao tenant; exportação executiva também é CEO-only | Sem prazo de retenção ou expurgo observado. Campos de texto podem incluir dados inseridos pelo usuário. |
| Credenciais de dispositivos | `device_credentials`: tenant, painel, nome, hash do token, criação, último uso e revogação | Autorizar telemetria de dispositivo | Token em texto não é retornado nas consultas normais; telemetria usa bearer token e fica vinculada ao painel/tenant | Revogar impede uso futuro; a linha e seus metadados permanecem. Sem expurgo configurado. |
| Configuração e eventos de webhook | Assinatura armazena URL de webhook; o evento de teste envia tipo do evento, ID aleatório, `organization_id` e horário; alerta crítico envia `panel_id`, temperatura e `tenant_id` | Entregar eventos ao endpoint configurado pela organização | O CEO configura/testa. O endpoint externo recebe os campos do payload. O código exige HTTPS público, fixa o IP validado e não segue redirects | A URL e eventos não têm política de retenção/rotação documentada. Retenção pelo destinatário externo não é controlada pelo VoltGuard. |
| Exportação | `/api/export/executive-report` gera XLSX com resumo, painéis, alarmes, OS/checklists, ativos, tarefas de manutenção e estoque/custos | Relatório operacional pontual | Exclusivo do CEO e filtrado por tenant; conteúdo é sanitizado contra fórmulas de planilha | Arquivo baixado passa ao controle de quem o salva/compartilha; não há revogação remota, registro de entrega nem mecanismo de exclusão do arquivo externo. Não é exportação completa de titular/organização: não inclui contas, sessões, auditoria nem todo o histórico de telemetria. |
| Dados enviados pelo gateway | `gateway.py` envia `panel_id`, medições e opcionalmente identificador QR; o token fica em variável de ambiente | Coletar leituras Modbus e enviá-las à API por HTTPS | Requer credencial de dispositivo; logs registram painel, número de medições e falhas. Não há comando de escrita Modbus no gateway revisado | O gateway não mantém banco local de telemetria; comportamento de logs depende do ambiente que o executa. |

## Limites e cuidados encontrados

- Não foram encontrados campos estruturados de e-mail, telefone, CPF/CNPJ ou cartão de pagamento nos modelos revistos. Isso não prova ausência desses dados em logs externos, segredos de infraestrutura, arquivos enviados ou histórico Git.
- Campos livres (`location`, `notes`, descrição/resolução, nomes de usuários, rótulos e `audit_logs.details`) podem receber nomes de pessoas, contatos ou outras informações pessoais. Orientar usuários a não inserir dados excessivos até haver regras e aviso aprovados.
- O relatório executivo contém potencialmente identificadores de técnicos, localização, números de série, detalhes de intervenção e valores de estoque. Tratar o XLSX como dado confidencial da organização.
- O webhook transmite leituras e identificadores operacionais a um terceiro configurado pelo cliente. Definir documentação do payload, responsabilidade pelo destinatário, minimização, autenticação/assinatura do evento e rotação da URL antes de oferecer o recurso comercialmente.
- Username é chave global única no modelo, não composta por tenant. Isso implica que não se deve presumir separação de identidades iguais entre organizações.
- Foi observada desativação de usuários e revogação de sessões, mas não um fluxo de acesso/correção/exportação/exclusão de todos os dados de uma pessoa ou organização.
- Ausência de rotina de expurgo no código não confirma que backups, banco gerenciado ou logs do provedor não tenham seus próprios prazos. Confirmar retenção, região, subprocessadores, backups e controles de acesso no painel do provedor e nos contratos.

## Decisões pendentes — não preencher por suposição

| Decisão | Responsável/entrada necessária | Estado |
|---|---|---|
| Entidade controladora, operadora e contatos para solicitações de titulares | Empresa e assessoria jurídica | Pendente |
| Finalidades e bases legais por categoria de dado; necessidade de RIPD/avaliação de risco | Empresa/controlador com assessoria jurídica | Pendente |
| Prazos de retenção, critérios de expurgo, preservação legal e destino de backups | Responsável pelo produto, controlador e provedor | Pendente |
| Fluxo autenticado para exportação, correção e exclusão, incluindo encerramento de tenant e cópias | Produto/engenharia e responsável por privacidade | Pendente |
| Região efetiva do banco, acesso de operadores, subprocessadores, transferência internacional e backups | Proprietário Render e empresa | Pendente; região do banco não verificada |
| Segurança do webhook: assinatura HMAC/segredo, política de retries e retenção no destino | Produto/engenharia e cliente piloto | Pendente |
| Regras para campos livres, minimização de dados e descarte de exportações | Produto e controlador | Pendente |

## Próxima etapa para transformar o rascunho em processo

1. Confirmar com o proprietário a identidade e região do banco atual sem alterar dados; documentar contrato, backups e subprocessadores.
2. Aprovar a matriz de finalidade/base legal/retenção com a empresa e assessoria jurídica.
3. Projetar e testar em cópia isolada exportação completa e exclusão segura, incluindo registros relacionados, credenciais, auditoria e política para backups.
4. Documentar os dados entregues por webhook e adicionar autenticação verificável e procedimento de rotação antes de uso com clientes reais.
5. Publicar aviso/termos somente após inserir razão social/CNPJ, contatos, práticas confirmadas e revisão jurídica.

