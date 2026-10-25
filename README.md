# HITECH VoltGuard — monitoramento elétrico e gestão da manutenção

> **Estado do produto:** piloto técnico demonstrativo; não é SCADA certificado nem sistema de proteção, comando ou intertravamento. Use dados fictícios até que persistência, restauração, privacidade, suporte e validação de hardware estejam aprovados. O cadastro público está fechado por padrão no Render.

Leia [`PRONTIDAO_COMERCIAL_BR.md`](PRONTIDAO_COMERCIAL_BR.md) para os critérios de liberação do piloto comercial e decisões que dependem da empresa.

## v0.66.0 — Integridade e completude das leituras

Um painel recém-cadastrado aguarda a primeira amostra sem gerar corrente, temperatura ou histórico fictício. A interface distingue tensão de referência de medição e identifica grandezas nunca recebidas. Se uma amostra não trouxer temperatura ou corrente, o estado será `PARCIAL`, sem afirmar operação normal até que ambos os limites de alarme possam ser avaliados. Painéis explicitamente marcados como demonstração continuam usando dados simulados.

## v0.65.0 — Limites de requisição, prazos e dependências

Os corpos de `/api/*` agora têm limite durante a leitura, inclusive em requisições transmitidas em blocos sem `Content-Length`: 1 MiB para a API e 16 KiB para telemetria. No Render, o limitador usa o IP enviado pela Cloudflare, o Docker não confia genericamente em cabeçalhos de proxy e o Host é validado. A validade da assinatura é calculada por organização no momento do cadastro. Dependências críticas foram elevadas para versões com correções de segurança conhecidas; veja [`SECURITY_REVIEW.md`](SECURITY_REVIEW.md) para o resultado da revisão e as pendências antes de dados reais.

## v0.64.0 — Permissões do relatório executivo e credenciais

O backend agora exige perfil CEO para exportar o relatório executivo e CEO/Gerente para consultar metadados das credenciais de dispositivos, alinhando as rotas às permissões já exibidas na interface.

## v0.63.2 — Dependências MFA no Docker

O Dockerfile instala diretamente PyOTP, qrcode com Pillow e cryptography, além de instalar `requirements.txt`. O build verifica as três importações antes de concluir a imagem.

## v0.63.1 — Verificação das dependências MFA

O build Docker instala PyOTP explicitamente e confirma que PyOTP, qrcode e cryptography podem ser importados antes de criar a imagem final. Se faltar alguma biblioteca, o deploy para no build com o erro de dependência, sem iniciar uma versão quebrada.

## v0.63.0 — MFA no login e nas operações de senha

Quando MFA estiver ativo, o login e a troca de senha exigem também um código do autenticador ou um código de recuperação de uso único. O MFA pode ser ativado por qualquer perfil em **Minha conta**. O QR apresenta uma única identificação para reduzir a possibilidade de leitores criarem duas entradas para a mesma configuração. Códigos TOTP já usados não podem ser reutilizados.

## v0.62.3 — Senha nova como etapa da ativação MFA

Na primeira ativação do MFA, o fluxo é: informar a senha atual para iniciar, escanear o QR, digitar o código TOTP, escolher e confirmar uma nova senha e guardar os códigos de recuperação. A senha nova deve ter pelo menos 12 caracteres. Após confirmar que guardou os códigos, a sessão é encerrada. Nos próximos logins e nas trocas de senha, será pedido um código TOTP ou de recuperação.

## v0.62.2 — QR Code para aplicativo autenticador

Ao configurar MFA em **Minha conta**, qualquer perfil pode escanear um QR Code com o Microsoft Authenticator ou outro aplicativo TOTP. O QR é gerado localmente no backend e enviado apenas na resposta autenticada da configuração; a chave manual continua disponível como alternativa.

## v0.62.1 — Estabilidade da tela Minha conta

A atualização periódica dos painéis não redesenha mais a aba **Minha conta**. Isso evita recarregar o estado do MFA e mantém estáveis os formulários enquanto a aba permanece aberta.

## v0.62.0 — Autenticação em dois fatores para contas

Todos os perfis podem ativar MFA TOTP em **Minha conta** usando aplicativo autenticador compatível. Quando ativo, o login e a alteração de senha exigem um código TOTP de 6 dígitos ou um código de recuperação; cada janela TOTP só pode ser aceita uma vez. Dez códigos de recuperação de uso único são exibidos uma única vez ao concluir a configuração. Guarde-os em local seguro.

Os segredos TOTP são criptografados no banco com uma chave derivada de `SECRET_KEY`. Mantenha essa variável estável e faça backup seguro; se ela for trocada, usuários com MFA ativo precisarão reconfigurar o autenticador. A migração é automática e não ativa MFA nas contas existentes. A ativação é voluntária nesta versão.

## v0.61.0 — Rate limiting pronto para Redis compartilhado

O backend aceita `RATE_LIMIT_STORAGE_URI` com uma URL `redis://` ou `rediss://` para compartilhar contadores de tentativas entre instâncias. Sem essa variável, a aplicação continua usando memória local por processo, como antes. Se o Redis configurado ficar indisponível, o SlowAPI usa fallback local; durante essa falha, o limite não é global. Para ativar o modo compartilhado, provisione Redis gerenciado e adicione a URL como variável secreta no Render. Nenhuma credencial Redis deve ser enviada ao GitHub ou ao chat.

## v0.60.0 — Resposta de login com trabalho criptográfico uniforme

O login executa scrypt também para nomes de usuário inexistentes e contas com hash legado, reduzindo diferenças de tempo que poderiam indicar se uma conta existe. A mensagem de falha continua genérica. O limitador pode usar Redis compartilhado quando `RATE_LIMIT_STORAGE_URI` está configurada; sem Redis, permanece em memória por processo.

## v0.59.1 — Evitar cache desatualizado do HTML

A resposta da página inicial passa a usar `Cache-Control: no-store`, assim como os recursos da aplicação. Isso evita que o navegador ou uma camada intermediária mantenha um `index.html` antigo após o deploy. O HTML servido referencia Chart.js e html5-qrcode em `vendor/`, na mesma origem do serviço.

## v0.59.0 — CSP ativa e validação de bibliotecas locais

A política de segurança de conteúdo agora é aplicada pelo navegador: scripts só podem vir da própria aplicação, formulários e conexões ficam limitados à origem, e conteúdo de objetos e enquadramento são bloqueados. Estilos inline continuam permitidos para preservar o leitor QR; a política Report-Only mais restritiva continua registrando possíveis violações de estilo. O backend também confere na inicialização se os dois arquivos JavaScript obrigatórios existem em `vendor/` e identifica os nomes ausentes no erro.

## v0.58.0 — Encerramento remoto de sessões

O CEO pode encerrar todas as sessões ativas de outro usuário da própria organização pela aba **Usuários**. A ação exige confirmação, mostra quantas sessões foram revogadas e registra o evento na auditoria. A conta CEO e a própria conta do operador ficam protegidas nessa ação; para encerrar as próprias sessões, use **Sair** ou troque a senha em **Minha conta**.

## v0.57.0 — Troca de senha e encerramento de sessões

Todos os usuários autenticados podem abrir **Minha conta** e trocar a própria senha após informar a senha atual. A nova senha deve ter de 12 a 256 caracteres e ser diferente da atual. Após a troca, todas as sessões da conta são revogadas e o usuário precisa entrar novamente. A API limita tentativas, grava um evento de auditoria sem registrar segredos e não oferece recuperação por e-mail; a recuperação administrativa continua pendente.

## v0.56.0 — Gestão de usuários e perfis por organização

O CEO pode abrir **Usuários**, listar contas da própria organização, criar contas de Gerente e Técnico de Campo, alterar o perfil e desativar/reativar uma conta. A conta CEO e a própria sessão do CEO não podem ser alteradas nessa tela. A desativação encerra as sessões ativas e impede novos logins. O backend valida novamente o papel e o tenant em cada chamada; a interface não é a barreira de segurança. O banco adiciona `users.is_active` com migração compatível; contas existentes são mantidas ativas. A entrega da senha inicial deve ocorrer por canal seguro; todos os perfis podem ativar MFA em **Minha conta**.

O `render.yaml` agora declara `runtime: docker` e aponta explicitamente para `./Dockerfile` e para o contexto raiz, em linha com a configuração do serviço Render.

## v0.55.0 — Permissões por perfil

As permissões das rotas usam uma matriz central no backend: CEO e Gerente administram configurações e credenciais; CEO, Gerente e Técnico de Campo podem executar operações de campo, como reconhecer alarmes e manter tarefas. Técnico de Campo pode cadastrar ativos, planos e tarefas, mas não editar ativos, consultar/administrar credenciais, alterar regras, configurar webhooks ou consultar auditoria. A exportação do relatório executivo é exclusiva do CEO. A interface aplica as mesmas permissões, mas a validação decisiva ocorre no servidor.

## v0.54.0 — Proteção do destino de webhooks

Antes de cada envio, o backend valida os endereços DNS e conecta ao IP público aprovado, preservando Host e SNI para a validação do certificado. Redirects e proxies definidos no ambiente não são usados. A resposta do endpoint não é carregada.

## v0.53.0 — Dependências locais e CSP

Chart.js 4.5.1 e html5-qrcode 2.3.8 são entregues localmente em `vendor/`, sem chamadas a CDNs de terceiros. As licenças MIT e Apache 2.0 estão na mesma pasta. O Dockerfile copia `vendor/` para a imagem e o backend envia esses arquivos sem cache. A CSP permanece em `Report-Only`; antes de aplicar bloqueio, ainda precisamos observar o fluxo do leitor QR, que pode inserir estilos inline.

### Arquivos necessários para o deploy

Mantenha `vendor/chart.umd.min.js`, `vendor/html5-qrcode.min.js` e os dois arquivos de licença dentro de `vendor/`, junto aos arquivos da aplicação.

## v0.52.0 — Exibição do dashboard após autenticação

Corrigida a visibilidade do dashboard após autenticação. A tela inicia oculta por classe e a regra CSS a exibe quando a classe é removida pelo JavaScript.

## v0.51.0 — Preparação CSP e estilos externos

Os estilos do HTML e das telas geradas pelo JavaScript agora ficam em `styles.css`; o relatório de ordem de serviço usa `report.css`. O backend serve ambos sem cache e os inclui na imagem Docker. A política CSP está em `Content-Security-Policy-Report-Only`: observe o Console do navegador depois do deploy para identificar dependências que ainda tentam usar estilos inline antes de ativar o bloqueio.

## v0.50.0 — Folha de estilos externa

O CSS principal da página agora está em `styles.css`, servido em `/styles.css` sem cache e empacotado no Docker. Atributos de estilo gerados pelo JavaScript e o CSS do relatório de OS permanecem pendentes, então CSP restritiva não foi ativada.

## v0.49.0 — Migração dos eventos de alteração e digitação

Filtros, prévias, histórico e checklists agora usam listeners delegados para `change` e `input`. Os atributos inline `onclick`, `onchange`, `oninput` e `onsubmit` foram removidos. Estilos inline ainda precisam ser migrados antes da CSP restritiva.

## v0.48.0 — Migração dos cliques das telas dinâmicas

As ações de clique nas telas dinâmicas usam agora `data-action` e delegação de eventos, com encaminhamento por uma lista permitida no JavaScript externo. Os eventos inline de alteração/entrada e os estilos inline ainda precisam ser removidos antes da CSP restritiva.

## v0.47.0 — Migração dos eventos de navegação e envio de formulários

As abas e os envios dos formulários gerados pela interface passaram a usar listeners delegados no `app.js`, com uma lista explícita de ações permitidas. Ainda há eventos inline de clique/alteração/entrada e estilos inline; a CSP restritiva continua pendente.

## v0.46.0 — Migração dos eventos da tela de autenticação

Login, cadastro de organização e logout agora usam delegação de eventos no JavaScript externo. A alternância entre as telas de login e cadastro usa botões com suporte a teclado. Os handlers dinâmicos e estilos inline restantes ainda precisam ser migrados antes da ativação de CSP restritiva.

## v0.45.0 — JavaScript servido como recurso externo

O script principal da interface foi separado em `app.js`, servido em `/app.js` sem cache e incluído na imagem Docker. Esta etapa prepara uma CSP mais restritiva. A CSP ainda não foi ativada porque há handlers e estilos inline que precisam ser migrados primeiro.

## v0.44.0 — Limites básicos para ingestão de telemetria

A rota de telemetria limita cada IP a 600 requisições por minuto e o backend limita o corpo a 16 KB durante a leitura, mesmo sem `Content-Length`. As demais rotas da API aceitam até 1 MiB por requisição. O payload rejeita campos desconhecidos e restringe o tamanho dos identificadores e da tensão textual. Sem Redis, os limites ficam em memória por processo; com `RATE_LIMIT_STORAGE_URI`, os contadores são compartilhados entre instâncias. A política por credencial no proxy/WAF continua pendente.

## v0.43.0 — Revogação de sessão no logout

Cada login recebe um identificador de sessão aleatório; somente o hash é persistido. Requisições autenticadas verificam se a sessão continua ativa. O botão “Sair” chama `/api/logout` para revogar o token no servidor e limpa a sessão local; tokens antigos, sem identificador de sessão, exigem novo login após esta atualização. O CEO pode revogar as sessões de outros usuários da organização pela aba **Usuários**. Os registros expirados são eliminados gradualmente no login; alertas de atividade continuam pendentes.

## v0.42.0 — Ticket temporário para WebSocket

A rota `/api/ws-ticket` emite um ticket opaco, armazenado apenas como hash, de uso único e válido por 30 segundos. `/ws/panels` consome o ticket atomicamente, verifica o usuário e associa a conexão à organização atual; a rota rejeita origem diferente da origem do serviço. O frontend atual não abre WebSocket, então esta mudança protege e prepara a rota sem alterar a interface. O ticket ainda aparece na URL por poucos segundos; conexões também precisam de limites e monitoramento antes de produção.

## v0.41.0 — Autorização baseada no estado atual da conta

Tokens de acesso passam a expirar em 8 horas. Em cada requisição protegida, papel, organização e plano são carregados do banco, então mudanças de conta e usuários removidos passam a valer imediatamente, inclusive no WebSocket. Esta etapa reduz o tempo de exposição de sessões e impede que claims antigos preservem permissões; ainda não substitui revogação individual de sessão.

## v0.40.0 — Protótipo de gateway Modbus TCP

Incluído um coletor local de leitura somente em `gateway/`, configurável para ler registradores Modbus TCP e enviar medições autenticadas ao VoltGuard por HTTPS. O mapa de registradores deve ser preenchido e validado para o modelo/firmware efetivamente instalados; ainda não houve homologação em medidor físico. Consulte `gateway/README.md` e `INTEGRACAO_POWERLOGIC_PM5320.md`.

## v0.39.0 — Telemetria elétrica ampliada para gateway Modbus

O endpoint de dispositivo aceita leituras parciais de temperatura, corrente, tensão, potência ativa (kW), energia ativa acumulada (kWh), frequência (Hz) e fator de potência. As novas grandezas são persistidas no painel e no histórico; leituras sem temperatura não disparam nem limpam alarmes térmicos. Os gateways existentes continuam compatíveis. O gateway Modbus para o PowerLogic PM5320 e o mapa específico do medidor ainda precisam ser implementados e validados com o equipamento.

## v0.38.1 — Tradução completa do leitor QR

A tradução dos controles do leitor agora alcança também textos inseridos em nós de texto da biblioteca, incluindo a opção para ler um QR a partir de imagem.

## v0.38.0 — Leitor QR em português

Os controles do leitor QR passam a ser exibidos em português. A orientação da aba esclarece que a câmera é opcional e que também é possível consultar o painel por imagem, código ou ID.

## v0.37.0 — Teste independente de webhook

A aba Webhooks permite enviar um evento de teste ao endpoint salvo sem simular uma falha nem criar alarmes. A interface informa o resultado HTTP e cada tentativa é registrada na auditoria da organização.

## v0.36.2 — Painel mais amplo no Excel Online

O resumo foi reorganizado em três cartões por linha, ocupando mais largura da tela sem depender do zoom do aplicativo. Inclui contagens de painéis normais e alarmes encerrados.

## v0.36.1 — Zoom e cores de alerta condicionais

A aba Resumo abre com zoom de 140% para aproveitar melhor a tela. Cartões de painéis críticos, alarmes ativos/reconhecidos e estoque abaixo do mínimo usam cores de alerta apenas quando a contagem é maior que zero.

## v0.36.0 — Resumo executivo em cartões

A aba inicial do relatório apresenta os indicadores em cartões coloridos organizados em duas colunas, com maior destaque para itens críticos. O layout ocupa melhor a página, centraliza a impressão em uma folha horizontal e mantém as abas seguintes para consulta detalhada.

## v0.35.2 — Mais espaço no título do resumo

Ampliadas as colunas da aba Resumo para dar margem visual ao título e às notas no Excel.

## v0.35.1 — Ajuste visual do resumo do relatório

A aba Resumo usa colunas mais largas para exibir o título e as notas sem cortes ao abrir no Excel.

## v0.35.0 — Relatório executivo formatado em Excel

O relatório executivo agora é exportado como `.xlsx`, com abas separadas para resumo, painéis, alarmes, ordens de serviço, ativos, manutenção e estoque. O arquivo inclui cabeçalhos destacados, filtros, linhas congeladas, colunas ajustadas e configuração para impressão. Mantém a rastreabilidade de alarmes e OS e o progresso dos checklists.

## v0.34.0 — Rastreabilidade no relatório executivo

O CSV executivo inclui datas de ocorrência, reconhecimento e encerramento dos alarmes e mostra a OS vinculada. As OS exportadas incluem o alarme de origem e o progresso do checklist; o resumo também conta alarmes ativos/reconhecidos e OS originadas de alarmes.

## v0.33.0 — Rastreamento da origem das ordens

A aba Ordens de Serviço identifica ordens criadas a partir de alarmes, permite filtrar por origem e localizar uma ordem pelo número do alarme. O resumo inclui a quantidade de ordens vinculadas a alarmes.

## v0.32.0 — Duração e resumo da Central de Alarmes

A Central de Alarmes apresenta contagens por estado e mostra a primeira e a última ocorrência, a duração total e os horários de reconhecimento e encerramento quando disponíveis. A duração dos alarmes ainda abertos acompanha as atualizações periódicas da tela.

## v0.31.0 — Prévia do comportamento dos alarmes

Na aba Regras de Alarme, a configuração por painel mostra os valores que abrem os alarmes de temperatura e corrente e os valores de normalização após histerese. A prévia atualiza durante a edição e indica que os parâmetros editados só entram em vigor após salvar.

## v0.30.0 — Guia de integração de telemetria

A aba Dispositivos inclui um guia rápido expansível para enviar leituras ao endpoint de telemetria, com exemplo HTTP copiável e payload ajustado ao painel selecionado. O exemplo usa um marcador de token: o segredo continua guardado no gateway e nunca é inserido nem exibido novamente pela interface.

## v0.29.0 — Tarefas avulsas de manutenção

A aba Manutenção permite agendar tarefas avulsas além dos planos recorrentes. Checklist e observações ficam visíveis nos detalhes da tarefa, a data de conclusão aparece na lista e tarefas concluídas ou canceladas têm o estado final bloqueado na interface.

## v0.28.0 — Resumo da gestão de ativos

A aba Ativos mostra totais cadastrados, em operação, em manutenção e vinculados a painéis. A tabela aplica cores ao estado e informa claramente quando não há ativos ou quando os filtros não encontram resultados.

## v0.27.0 — Movimentação de estoque pela interface

A aba Almoxarifado permite registrar itens e movimentações de entrada/saída pela API existente, mostra os itens abaixo do mínimo e calcula o valor estimado em estoque. Ao informar o nome exato de um item existente, categoria, mínimo e custo são preenchidos com os valores atuais antes do ajuste.

## v0.26.0 — Resumo ESG transparente

A aba ESG consolida as estimativas informadas por painel e indica quantas estão disponíveis. A tela esclarece que os números são demonstrativos, não medições, cálculos de emissões ou indicadores auditados; painéis sem valor permanecem identificados como indisponíveis.

## v0.25.0 — Histórico térmico paginado na interface

A aba Tendência Térmica carrega a primeira página de até 500 amostras por painel e oferece **Carregar registros anteriores** para consultar páginas adicionais. A consulta usa cursor por ID e mantém as amostras já carregadas durante o polling. A API continua limitada ao painel e à organização autenticada.

## v0.24.0 — Leitura de QR mais previsível

A aba Comissionamento evita consultas repetidas do mesmo QR durante a leitura contínua, encerra a câmera ao sair da aba e mostra conectividade e horário da última telemetria no resultado. A consulta manual também pode ser enviada pelo teclado.

## v0.23.0 — Leitura de conectividade em português

A aba Tempo Real localiza valores numéricos e horários, apresenta estados de conectividade em português e calcula o tempo desde a última telemetria. Diferencia painel sem credencial ativa de painel que ainda aguarda a primeira leitura.

## v0.22.0 — Retorno de entrega do webhook

A simulação de falha crítica informa se o endpoint respondeu com sucesso, falhou ou não estava configurado. Respostas HTTP de erro deixam de ser consideradas entrega válida; a gravação dos alarmes é mantida mesmo quando o endpoint externo falha.

## v0.21.0 — Configuração de webhook mais clara

A aba Webhooks informa que o envio atual é acionado pela simulação de falha crítica, valida a URL como HTTPS no navegador e mostra retorno de sucesso ou erro ao salvar. Um campo vazio remove a configuração.

## v0.20.0 — Relatório executivo ampliado

O CSV executivo inclui indicadores e registros da organização para painéis, alarmes, ordens de serviço, ativos, tarefas de manutenção e estoque. A exportação é isolada por organização, inclui marca UTF-8 para compatibilidade com Excel e protege campos textuais contra execução acidental como fórmulas.

## v0.19.0 — Resumo de assinatura e uso

A aba Assinatura & Billing mostra o plano e estado retornados pela organização, a data de expiração quando cadastrada e o uso do limite de painéis. A tela informa quando a data não foi configurada e esclarece que não processa pagamentos nem alterações de plano.

Versão revisada para **demonstração e homologação controlada**. Este pacote não é SCADA industrial certificado e não deve ser conectado a funções de proteção, intertravamento ou comando de equipamentos elétricos.

## v0.18.0 — Regras de alarme

Regras específicas por painel podem ser removidas para voltar aos limites padrão da organização. A alteração é isolada por organização e auditada. A auditoria das regras gerais registra os limites de temperatura e corrente.

## v0.17.0 — Credenciais de dispositivos

A aba Dispositivos resume credenciais ativas, nunca utilizadas e revogadas, com busca e filtros por painel/estado. O log de criação guarda o ID atribuído pelo banco; chamadas repetidas para revogar não alteram o horário original.

## v0.16.0 — Acompanhamento de manutenção

A aba Manutenção apresenta contadores operacionais, destaca e filtra tarefas atrasadas, permite buscar por ativo/tarefa/responsável e ajustar o responsável, prazo e estado da tarefa. Alterações operacionais entram na auditoria.

## v0.15.0 — Gestão de ativos

A aba Ativos agora permite buscar por tag, nome, tipo, localização, fabricante, modelo, série ou painel, filtrar por estado e editar os dados. Mudanças são registradas na auditoria e os ativos podem ser marcados como `ATIVO`, `MANUTENCAO` ou `INATIVO`, preservando seus vínculos com planos e tarefas.

## v0.14.0 — Auditoria pesquisável e paginada

A aba Auditoria permite filtrar por texto, usuário, ação e intervalo de datas. Os registros são carregados em páginas de até 100 itens, com isolamento pela organização autenticada.

## v0.13.0 — Busca e filtros na Central de Alarmes

A lista de alarmes agora pode ser pesquisada por painel, tipo ou mensagem e filtrada por estado e severidade. Alarmes reconhecidos mostram o usuário responsável.

## v0.12.0 — Edição dos dados da OS

Os dados principais de uma ordem existente podem ser editados pela coluna **Título**: título, prioridade, técnico atribuído, prazo e descrição. As alterações são registradas no histórico da ordem.

## v0.11.0 — Relatório individual de ordem de serviço

Cada OS pode abrir um relatório imprimível com seus dados, checklist, resumo de execução e histórico. Use a opção de impressão do navegador e escolha “Salvar como PDF” para exportar o documento.

## v0.10.2 — Preservação dos modelos ao redesenhar a tela

As opções de modelos são repostas no seletor após criar uma OS ou redesenhar a aba, mantendo os modelos disponíveis enquanto o formulário é reconstruído.


## v0.10.1 — Aplicação direta dos modelos

Selecionar um modelo agora preenche automaticamente os itens no formulário da nova OS; a aplicação confirma antes de substituir itens já digitados. O botão **Usar modelo** permanece disponível.

## v0.10.0 — Modelos reutilizáveis de checklist

Modelos de checklist são guardados por organização. CEO e Gerente podem salvar o checklist atual como modelo e remover modelos; qualquer usuário autenticado com acesso às OS pode aplicar um modelo ao formulário. As OS existentes permanecem independentes dos modelos.

## v0.9.0 — Checklist de execução para ordens de serviço

Ao criar uma OS, é possível incluir até 20 itens de checklist. A equipe marca cada item durante a execução; cada alteração registra usuário, horário e ação no histórico. O sistema impede concluir uma ordem enquanto houver itens pendentes. OS antigas sem checklist continuam funcionando.

## v0.8.0 — Busca e prioridade operacional para ordens

A gestão de OS mostra contagens por situação, permite buscar por painel/título/técnico e filtrar por estado ou apenas prazos vencidos. Ordens ativas com prazo expirado recebem destaque visual.

## v0.7.2 — Preservação de rascunhos de ordem de serviço

O polling atualiza os dados em memória sem reconstruir a aba de OS, preservando campos preenchidos e histórico expandido. A lista é redesenhada após criar/atualizar uma OS ou navegar novamente para a aba.

## v0.7.1 — Histórico permanece aberto durante o polling

A seção expansível do histórico mantém seu estado aberto enquanto os dados do painel são atualizados automaticamente.

## v0.7.0 — Histórico de alterações das ordens de serviço

Cada OS registra criação e alterações de estado/campos com usuário, papel, horário e detalhes. O histórico fica disponível em uma seção expansível na lista de ordens. Ordens anteriores à atualização não têm eventos retroativos; alterações passam a ser registradas após a implantação.

## v0.6.0 — Ciclo de vida das ordens de serviço

Ordens de serviço agora registram prazo, início e conclusão. A conclusão exige um resumo da solução executada com pelo menos 10 caracteres; datas e resultado aparecem na gestão de ordens. A inicialização adiciona os novos campos a bancos existentes sem apagar ordens anteriores.

## v0.5.3 — Telemetria confiável e conectividade

- Estado do dispositivo: `NOT_CONFIGURED`, `NEVER_CONNECTED`, `ONLINE` ou `OFFLINE`, com base no último uso de credencial ativa.
- `DEVICE_OFFLINE_AFTER_SECONDS` define o limiar de inatividade (padrão 300 segundos; faixa de 30 a 86400 segundos).
- `GET /api/telemetry/history/{panel_id}` retorna histórico paginado, protegido por autenticação e isolamento de organização. Parâmetros: `limit` (1–1000) e `before_id`.
- O endpoint de dashboard mantém no máximo 500 amostras por painel para reduzir payloads grandes.
- Os cartões de monitoramento exibem conectividade e último contato.
- O estado `ONLINE` significa que uma credencial ativa enviou telemetria recentemente; não comprova por si só que um PLC ou equipamento físico esteja íntegro.

## Conteúdo do pacote

- `main.py`: API FastAPI, autenticação JWT, SQLAlchemy, cadastro de organização, painéis, telemetria via API autenticada, alarmes, inventário, ordens de serviço, auditoria e exportação CSV.
- `index.html`: painel web responsivo em português, login/cadastro, abas de monitoramento, QR Code e gestão.
- `requirements.txt`: dependências de execução, incluindo o driver PostgreSQL.
- `render.yaml`: Blueprint para serviço web e PostgreSQL no Render.
- `Dockerfile`: alternativa de execução por contêiner.
- `tests/test_render_smoke.py`: testes básicos de saúde, autenticação, isolamento entre organizações, relatório e integridade do estoque.
- `.env.example`: exemplo de configuração local sem segredos reais.
- `REVISAO_TECNICA.md`: limitações conhecidas e checklist antes de produção.

## v0.5.1 — Histórico completo de telemetria

O histórico agora registra temperatura, corrente e tensão por amostra, além do timestamp UTC. As colunas novas são adicionadas de forma compatível com registros antigos; medições históricas que não foram armazenadas anteriormente permanecem sem corrente/tensão (`null`), sem inventar valores.

### Teste de telemetria autenticada

1. Na aba **Dispositivos**, crie uma credencial para um painel de teste e copie o token apenas no momento em que ele for exibido.
2. Envie uma leitura para `POST /api/device/telemetry` com `Authorization: Bearer <TOKEN>` e JSON semelhante ao exemplo abaixo. Substitua `PANEL_ID` e `TOKEN`; não os coloque em repositórios públicos.

```bash
curl -X POST "https://SEU-SERVICO.onrender.com/api/device/telemetry" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"panel_id":"PANEL_ID","current":118.4,"voltage_v":380,"active_power_kw":76.2,"active_energy_kwh":1842.7,"frequency_hz":60,"power_factor":0.96}'
```

3. A resposta deve conter `status: success` e listar `measurements_received`. Consulte o painel e o histórico para confirmar as grandezas recebidas. Alarmes de temperatura e corrente só são avaliados quando a leitura inclui o respectivo campo; a ausência de uma medição não limpa um alarme existente.
4. Em **Dispositivos**, confirme que “Último uso” foi atualizado. Revogue a credencial e repita a chamada: a API deve responder `401`.

Validação local registrada: 31 testes aprovados com `requirements-test.txt`, cobrindo rate limiting, MFA, isolamento entre organizações, autenticação em todas as rotas da API, matriz básica de perfis e recusas seguras do comando de bootstrap. O caminho de criação do bootstrap também foi exercitado manualmente em um SQLite temporário vazio. A CI do GitHub valida segredos no histórico, dependências, sintaxe, testes e build Docker.

## Publicação recomendada no Render

**Use este procedimento somente em um workspace/projeto novo e sem recursos ou dados. Não reaplique o `render.yaml` ao piloto atual:** o serviço ativo tem nome/branch próprios, o PostgreSQL já contém registros e está em PostgreSQL 18, enquanto o Blueprint solicita PostgreSQL 16. Uma nova aplicação ou sincronização do Blueprint pode criar recursos paralelos ou alterar a associação de banco. Preserve os recursos existentes e siga `DEPLOYMENT_CHECKLIST.md` e `DATABASE_OPERATIONS.md` antes de qualquer mudança.

1. Extraia o ZIP e confirme que `main.py`, `index.html`, `requirements.txt`, `Dockerfile` e `render.yaml` estão na raiz do repositório.
2. Crie um repositório **privado** no GitHub e envie o conteúdo da pasta do projeto. Não envie `.env`, bancos locais ou segredos.
3. No Render, escolha **New + → Blueprint** e conecte o repositório.
4. Revise os recursos e variáveis definidos pelo `render.yaml` antes de aplicar.
5. Aguarde o deploy e verifique `https://SEU-SERVICO.onrender.com/health`. A resposta esperada contém `"status":"ok"`.
6. No piloto Render, entre com a conta de teste já provisionada. O cadastro público permanece desativado. Para uma instalação nova, o comando de bootstrap abaixo cria a primeira organização somente após confirmar que o banco está vazio.
7. Confira que os painéis demonstrativos estão identificados como simulação. Não são leituras de medidores físicos.
8. Teste o acesso às abas, a criação de ordens de serviço, a exportação CSV, as regras e o inventário usando somente dados fictícios.

### Provisionar a primeira organização em um banco vazio

O cadastro pela internet permanece fechado por padrão. Para inicializar **uma instalação nova, sem nenhum registro**, pare o serviço web, execute o comando abaixo em um ambiente com acesso ao banco e com `DATABASE_URL` e a mesma `SECRET_KEY` estável configuradas. O comando exige confirmação digitada e senha oculta; ele cria a conta CEO inicial e os dados de demonstração pela mesma validação usada pela aplicação.

```powershell
python scripts/provision_first_tenant.py --tenant-id SUA-ORGANIZACAO --username seu.usuario
```

O script verifica todas as tabelas antes de começar e aborta se qualquer uma contiver dados. Não use no banco do piloto atual nem em uma base com dados a preservar. Após a criação, inicie o serviço, entre com a conta informada e ative MFA; mantenha o auto-cadastro público desligado. O comando não altera as variáveis de ambiente persistentes do Render. Faça um backup antes de qualquer operação administrativa no banco. **O Render Free não oferece Shell/SSH** ([limitações oficiais](https://render.com/docs/ssh)); portanto, a execução deve ser feita de um ambiente administrativo seguro com conectividade ao banco já aprovada. Não amplie regras de rede para abrir o banco à internet como atalho. Se não houver acesso seguro, não execute o provisionamento no Render Free.

## Configuração do serviço

O Blueprint configura:

- `SECRET_KEY`: gerada pelo Render; mantenha-a secreta e estável entre reinicializações.
- `DATABASE_URL`: conexão fornecida pelo banco PostgreSQL do Blueprint.
- `SIMULATE_TELEMETRY=0`: não simula variações contínuas das leituras.
- `PYTHON_VERSION=3.12.8`.

Se configurar o serviço manualmente, use:

- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Health check path: `/health`
- Configure `SECRET_KEY` com pelo menos 32 caracteres aleatórios e `DATABASE_URL` com a URL interna do PostgreSQL. Não existe usuário/senha predefinido; o cadastro público é fechado. Para uma instalação nova sem registros, use o provisionamento inicial controlado documentado acima. Recuperação de conta e onboarding de clientes continuam pendentes antes da produção.

Não comite valores reais de `SECRET_KEY` nem URLs de banco com credenciais.

## Testes locais

Requer Python 3.12 ou superior compatível com as dependências listadas.

```bash
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# Linux/macOS:
source .venv/bin/activate
python -m pip install -r requirements-test.txt
python -m unittest discover -s tests -v
uvicorn main:app --host 127.0.0.1 --port 8000
```

Abra `http://127.0.0.1:8000`. Para ambiente local, o padrão é SQLite. Para Render, use PostgreSQL.

## Persistência e custo

O Blueprint está configurado para avaliação econômica. Serviços e bancos gratuitos podem ter limites de uso, suspensão por inatividade e políticas de expiração que mudam com o tempo. Antes de guardar dados reais, confirme no painel e na documentação atual do Render o plano, a persistência, os backups e a política de expiração do PostgreSQL. Faça upgrade quando necessário e teste restauração antes de um piloto comercial.

Consulte [DATABASE_OPERATIONS.md](DATABASE_OPERATIONS.md) para criar uma exportação, recuperar o banco em uma instância separada e preservar os segredos necessários. A inicialização ainda executa alterações de compatibilidade limitadas; mudanças futuras de esquema exigem migração formal, backup e ensaio de retorno.

## Limites funcionais importantes

- A telemetria da API é autenticada com token de usuário; **ainda não existe uma identidade/credencial dedicada por dispositivo industrial**.
- Não há driver pronto de PLC/medidor (Modbus/OPC UA), gateway de aquisição ou garantia de tempo real industrial.
- O WebSocket autentica com ticket opaco, de uso único e validade de 30 segundos. A conexão ainda precisa de limites e monitoramento antes de produção.
- KPIs preditivos e valores ESG são demonstrativos/estimativas e não constituem predição validada, medição real ou promessa de economia.
- A assinatura representa metadados; não há integração de cobrança, pagamentos, inadimplência ou cancelamento.
- IDs de painéis permanecem globalmente únicos no modelo atual. A coluna `tenant_id` e os filtros de acesso protegem as consultas, mas permitir IDs iguais entre organizações requer migração de chave e revisão dos relacionamentos.
- O limitador de requisições usa memória por processo por padrão; configure Redis via `RATE_LIMIT_STORAGE_URI` antes de escalar para múltiplas instâncias.

Leia `REVISAO_TECNICA.md` antes de usar dados reais.

### Gestão de usuários (v0.58.0)
A aba **Usuários** aparece somente para CEO. Permite criar usuários com perfil Gerente ou Técnico de Campo, alterar seus perfis, desativar/reativar contas e encerrar as sessões de outros usuários ativos do mesmo tenant. A API protege todas as contas CEO e impede que o CEO altere ou encerre a própria conta por estas ações. Desativar uma conta impede novos logins e revoga sessões existentes; mudar um perfil também revoga sessões para exigir novo login. Ações são registradas na auditoria.

Endpoints: `GET /api/users`, `POST /api/users` com `{ "username", "password", "role" }`, `PATCH /api/users/{username}` com `role` e/ou `is_active`, e `POST /api/users/{username}/revoke-sessions`. Apenas o backend concede acesso. Senhas devem ter pelo menos 12 caracteres e são armazenadas com scrypt. O endpoint `POST /api/account/password` exige senha atual e nova senha e encerra todas as sessões após a alteração; contas com MFA ativo também devem confirmar o segundo fator. MFA TOTP pode ser ativado por qualquer perfil; quando ativo, também é exigido no login. Recuperação de senha por e-mail ainda não está disponível.

## Novos módulos (v0.5.0)

### Gestão de ativos
A aba **Ativos** permite cadastrar tag patrimonial, nome, tipo, localização, fabricante, modelo, número de série, painel associado e observações. A tag é validada como única por organização na aplicação.

Endpoints autenticados: `GET /api/assets`, `POST /api/assets` e `PATCH /api/assets/{id}` (edição permitida a CEO e Gerente).

### Manutenção preventiva
A aba **Manutenção** permite criar planos com periodicidade em dias e checklist, gera a primeira tarefa e agenda a próxima execução quando uma tarefa recorrente é concluída. Estados: `PENDENTE`, `EM_ANDAMENTO`, `CONCLUIDA`, `CANCELADA`. A recorrência é acionada na conclusão da tarefa, não por um scheduler externo.

Endpoints autenticados: `GET/POST /api/maintenance/plans`, `GET/POST /api/maintenance/tasks`, `PATCH /api/maintenance/tasks/{id}` (atualiza estado, responsável e prazo).

### Credenciais dedicadas de dispositivo
A aba **Dispositivos** permite emitir um token exclusivo vinculado a um painel. A API guarda somente o hash SHA-256 do token; o valor bruto aparece uma única vez na criação. Credenciais podem ser revogadas. Use HTTPS, armazene o token em cofre de segredos no gateway e nunca no JavaScript do navegador.

Envie telemetria com `POST /api/device/telemetry`, cabeçalho `Authorization: Bearer <device-token>` e JSON com `panel_id` e ao menos uma grandeza. Campos numéricos aceitos: `temperature` (°C), `current` (A), `voltage_v` (V), `active_power_kw` (kW), `active_energy_kwh` (kWh), `frequency_hz` (Hz) e `power_factor` (-1 a 1). `voltage` textual continua aceito para compatibilidade. Cada token só pode enviar dados ao painel ao qual foi vinculado. A API não instala driver Modbus/OPC UA nem conecta automaticamente equipamento físico.

## Central de Alarmes (v0.4.1)
Acesse a aba **Central de Alarmes** depois de entrar. Os alarmes de temperatura/corrente são criados quando a telemetria autenticada excede os limites da organização. O ciclo de vida inclui `ACTIVE`, `ACKNOWLEDGED` e `CLEARED`. Para gerar um alarme de teste, use um painel da própria organização e envie telemetria pelo endpoint autenticado `POST /api/telemetry` com valores acima dos limites configurados. Dados de teste não devem ser enviados a equipamentos de campo.

Endpoints autenticados:
- `GET /api/alarms` (opcional `?status_filter=ACTIVE|ACKNOWLEDGED|CLEARED`)
- `POST /api/alarms/{id}/acknowledge`
- `POST /api/alarms/{id}/clear`

O estado dos alarmes é específico por organização. Esta versão ainda não configura notificações de produção ou integrações com PLCs.

### Testar a Central de Alarmes com telemetria simulada
1. Entre com uma conta que tenha papel CEO ou Gerente.
2. Na aba **Tempo Real**, clique em **Disparar Alarme Crítico** em um painel de demonstração.
3. Confirme a mensagem de sucesso; a interface abre a **Central de Alarmes** automaticamente.
4. Devem aparecer alarmes `HIGH_TEMPERATURE` e `HIGH_CURRENT`. Você pode reconhecer o alarme ou encerrar manualmente conforme suas permissões.
5. Para encerrar automaticamente por retorno à faixa normal, envie telemetria dentro dos limites configurados via endpoint autenticado `/api/telemetry`.

Este botão altera apenas dados simulados da aplicação. Não envia comandos a equipamentos físicos nem deve ser usado como teste de proteção industrial.


### v0.5.2 — copiar token de dispositivo
Ao criar uma credencial em **Dispositivos**, abre uma janela com o token e botão **Copiar token**. O token é mostrado somente nessa criação; se fechar a janela sem guardá-lo, revogue a credencial e gere outra.


## v0.5.4 — Histórico gráfico
A aba **Tendência Térmica** mostra gráficos de temperatura e corrente a partir das amostras armazenadas. O filtro de período atua sobre até 500 amostras por painel carregadas no painel principal: última hora, 24 horas, 7 dias ou todo o histórico carregado. Para consultas mais extensas, use o endpoint autenticado `GET /api/telemetry/history/{panel_id}`, que suporta paginação. A tensão permanece exibida como última leitura textual porque o modelo atual não guarda uma tensão numérica normalizada. Se não houver amostras no período, a interface informa isso sem inventar dados.


### Regras de alarme por painel (v0.5.6)
A aba **Regras de Alarme** permite configurar limites e histerese por painel. Endpoints: `GET`, `PUT` e `DELETE /api/panels/{panel_id}/alarm-rules`. Ao remover uma regra personalizada, o painel volta a usar os limites da organização. A tabela `panel_alarm_rules` é criada por `create_all`; não exige apagar ou recriar o banco existente.


## v0.5.8

A aba Regras de Alarme não é mais reconstruída pelo polling periódico, preservando o painel selecionado e evitando que o formulário volte automaticamente ao primeiro painel.
