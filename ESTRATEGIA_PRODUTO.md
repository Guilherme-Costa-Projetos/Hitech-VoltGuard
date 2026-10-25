# Estratégia de produto e crescimento — HITECH VoltGuard

**Versão:** proposta inicial, 17 de outubro de 2026  
**Premissa de trabalho:** começar pelo mercado brasileiro de pequenas e médias indústrias e instalações comerciais com quadros elétricos críticos, equipes de manutenção enxutas e pouca visibilidade contínua. Validar essa premissa com clientes antes de ampliar o produto.

## 1. Direção recomendada

Posicionar o VoltGuard como uma solução de **confiabilidade elétrica e manutenção orientada por condição**. O produto deve ajudar o responsável de manutenção a identificar uma condição anormal, entender qual ativo está envolvido, designar uma ação, registrar o que foi feito e demonstrar o resultado.

Não competir inicialmente como SCADA universal, plataforma IoT de baixo nível, CMMS completo ou sistema de proteção elétrica. Essas categorias exigem escopo, integrações, certificações, suporte e investimento muito maiores. A vantagem potencial do VoltGuard está em juntar monitoramento elétrico simples com resposta operacional e prova de valor para uma equipe que hoje usa planilhas, mensagens e inspeções manuais.

**Promessa que vale testar:** “Detecte condições elétricas anormais mais cedo e transforme alertas em ações de manutenção rastreáveis.” Evitar promessas de prevenir falhas, prever vida útil ou garantir conformidade até haver evidência medida em instalações reais.

## 2. Cliente inicial e problema a validar

### Perfil de cliente ideal (hipótese)

- Instalação com 1–5 sites e dezenas a poucas centenas de ativos elétricos relevantes.
- Manutenção própria pequena ou prestador terceirizado, sem equipe dedicada de automação/analytics.
- Incidentes elétricos, paradas inesperadas ou inspeções manuais cujo custo seja perceptível para a operação.
- Acesso a sensores/medidores existentes ou disposição para instalar um gateway de leitura.
- Comprador econômico: gerente de manutenção, facilities ou operações; usuários diários: técnicos e prestadores.

### Entrevistas e piloto antes de ampliar o código

1. Entrevistar 10–15 responsáveis de manutenção de pelo menos dois segmentos (por exemplo, alimentos e bebidas, logística/refrigeração, edifícios comerciais). Perguntar sobre o último incidente, custo/tempo parado, processo de inspeção, dados existentes, orçamento e quem aprova compras.
2. Confirmar uma dor frequente e um comprador identificável; selecionar um segmento inicial, não tentar atender todos.
3. Obter 3 parceiros de desenho e 1–2 pilotos pagos ou com compromisso comercial claro. Definir dados, responsabilidades, período de avaliação e critérios de sucesso por escrito.
4. Só então fixar pacote e preço. Testar cobrança por site/faixa de ativos monitorados, mais implantação/gateway quando necessário. Não fixar preço a partir de concorrentes sem entender custo de instalação, suporte, conectividade e valor para o cliente.

## 3. Referências de produto e como aproveitá-las

| Referência | Padrão útil para o VoltGuard | Aplicação sugerida |
|---|---|---|
| ThingsBoard | Hierarquia de tenants, clientes, ativos e dispositivos; gestão de dispositivos; ingestão multi-protocolo; rule engine; telemetria e operação na borda. | Estudar seus conceitos e APIs. Para acelerar pilotos, avaliar integração com gateway/stack existente; construir no VoltGuard apenas o fluxo elétrico e operacional que diferencie o produto. A licença do ThingsBoard mudou: versões 4.4+ usam BUSL 1.1, com limites de uso comercial; avaliar a versão e a licença com jurídico antes de incorporar ou oferecer como serviço. |
| Node-RED | Adaptadores e fluxos para integrar protocolos, equipamentos, bancos e serviços sem escrever um driver para cada combinação. | Executar como gateway/serviço separado em laboratório ou piloto; normalizar as leituras e encaminhá-las ao VoltGuard. Fixar versões e auditar a licença de cada node adicional. A licença do núcleo é Apache 2.0. |
| Grafana Alerting | Alertas identificados por labels, roteamento por contexto, agrupamento e silenciamento para diminuir ruído. | Modelar cada alerta do VoltGuard com tenant, site, ativo, severidade, regra e responsável; agrupar e encaminhar notificações. Grafana pode servir à observabilidade interna; não precisa ser a interface principal do cliente. |
| MaintainX e CMMS semelhantes | Fluxo móvel de ordem de serviço, histórico por ativo, inspeção/checklist, atribuição e evidência do trabalho. | Melhorar a experiência de campo do VoltGuard: QR do ativo, abrir ordem a partir do alarme, checklist simples, fotos/notas, responsável, timestamps e histórico. Usar como referência funcional, sem copiar código ou identidade visual. |

As referências são fontes de padrões, não especificações a reproduzir. Separar conceitos de código. Antes de incorporar bibliotecas, imagens, dashboards, plugins ou trechos de código, verificar licença, obrigações de atribuição, marcas, termos de uso e compatibilidade com distribuição SaaS.

## 4. Produto: o que construir e em que ordem

### Etapa 0 — Provar a dor (2–4 semanas)

- Entrevistas, mapa do processo atual e cálculo de custo de incidentes/inspeções.
- Definição de segmento, persona, instalação piloto e baseline de indicadores.
- Protótipo navegável do fluxo “alerta → diagnóstico → ordem → conclusão → relatório”.
- Acordo de piloto que deixe claro que a ferramenta é de monitoramento e apoio à manutenção, sem comando ou função de proteção.

**Saída para avançar:** problema recorrente, comprador com orçamento, dados acessíveis e pelo menos um piloto com critérios mensuráveis.

### Etapa 1 — Tornar a base confiável (primeiro ciclo de engenharia)

- Separar ambientes de demonstração, teste e produção; remover qualquer dado de exemplo ambíguo na experiência de produção.
- Formalizar identidade, usuários, convite, recuperação de conta, MFA para todos os perfis com imposição obrigatória para administradores, papéis e permissões por ação.
- Implementar migrações versionadas, constraints e índices; revisar isolamento multiempresa endpoint por endpoint.
- Padronizar o evento de telemetria: tenant/site/ativo/dispositivo, nome da variável, valor, unidade, instante de origem, instante de recepção, qualidade, origem e identificador idempotente.
- Ingestão com credenciais por dispositivo, rotação/revogação, rate limits compartilhados, validação, fila/retry e trilha de auditoria.
- Operação básica: logs estruturados, métricas, alertas internos, backup e restauração comprovada, política de retenção, status de dependências e runbook de incidentes.
- Definir matriz de permissões e transições válidas para ordens, alarmes e tarefas; registrar ator, horário e motivo.

**Saída para piloto:** restauração testada, testes de isolamento/roles, observabilidade ativa e nenhum segredo ou dado de cliente usado em demonstração.

### Etapa 2 — Entregar o fluxo de confiabilidade elétrica

1. Hierarquia **organização → site → área → ativo → dispositivo/sensor** e importação de ativos por CSV.
2. Conectividade via gateway desacoplado (começar com um protocolo e hardware escolhido após entrevistas; avaliar Node-RED e gateways comerciais existentes). Não abrir conexão do serviço público diretamente à rede de controle do cliente.
3. Regras com limiar, histerese, persistência mínima, qualidade/staleness e supressão de ruído; estados explícitos e histórico de eventos.
4. Notificações configuráveis por criticidade e turno; agrupamento, escalação, confirmação de entrega, silenciamento temporário e trilha de envio.
5. Ação rápida: alarme cria/associa ordem de serviço, atribui responsável, vencimento, checklist, observações/fotos e encerramento com causa/solução.
6. Interface móvel responsiva para técnico, QR do ativo e modo de conectividade ruim; sincronização offline só se pilotos demonstrarem essa necessidade.
7. Relatórios de operação: eventos por ativo, tempo até reconhecimento/atendimento, ordens concluídas, indisponibilidade informada e tendência de medições com origem e qualidade visíveis.

### Etapa 3 — Mostrar retorno e expandir receita

- Comparar baseline e piloto: tempo de detecção, tempo de resposta, horas de parada evitadas/observadas, inspeções realizadas e alarmes acionáveis versus falsos/ruidosos.
- Depois de dados suficientes, adicionar análise de tendência e anomalias explicáveis. Validar alertas em modo sombra com especialistas antes de apresentá-los como recomendação.
- Expandir para energia, temperatura de conexões ou ativos adjacentes apenas se o mesmo comprador valorizar e os sensores forem confiáveis.
- Oferecer integrações, API, SSO, retenção ampliada, relatórios e suporte/SLA como níveis comerciais, após comprovar custo de atendimento.

**Não priorizar agora:** IA preditiva sem dados rotulados, ESG estimado, cobrança complexa, editor genérico de dashboards, controle remoto, marketplace e muitos protocolos ao mesmo tempo.

## 5. Modelo de receita a testar

- **Implantação:** levantamento, configuração, integração, gateway/sensores e treinamento. Precificar separadamente para não esconder trabalho profissional no SaaS.
- **Assinatura:** por site com faixa de ativos/dispositivos ou por faixa de ativos monitorados, com limites explícitos de retenção e usuários.
- **Serviços recorrentes opcionais:** revisão mensal de alarmes, calibração/verificação de dados, relatórios operacionais e suporte com SLA.
- **Parceiros:** integradores elétricos e empresas de manutenção podem vender/instalar, mas exigem margem, certificação de parceiros, suporte e responsabilidades definidos.

Validar disposição a pagar por meio de piloto pago e proposta comercial real. Medir margem depois de gateway, conectividade, instalação, cloud, suporte e aquisição do cliente. Evitar plano gratuito irrestrito antes de conhecer esses custos.

## 6. Métricas de produto e negócio

| Área | Métrica inicial |
|---|---|
| Ativação | Dias entre contrato e primeira telemetria validada; % de sites com ativos e responsáveis configurados. |
| Confiabilidade | Disponibilidade de ingestão, atraso de telemetria, eventos perdidos/duplicados, restaurações bem-sucedidas. |
| Qualidade operacional | % de alarmes reconhecidos no SLA do piloto, tempo até reconhecimento/ordem/conclusão, taxa de alarmes sem ação ou marcados como falso positivo. |
| Valor | Horas de parada observadas, inspeções reduzidas, falhas detectadas antes do impacto; documentar método e incerteza. |
| Receita | Conversão de piloto pago para recorrência, receita recorrente por site, margem bruta incluindo serviço e churn/renovação. |
| Adoção | Usuários ativos por site, ordens concluídas no sistema, ativos com dados recentes e histórico utilizável. |

Não tratar “ONLINE” do gateway como saúde física do ativo. Mostrar separadamente frescor de dados, conectividade do dispositivo, qualidade da leitura e estado operacional inferido.

## 7. Arquitetura alvo (incremental)

```text
Medidores / PLCs (somente leitura no primeiro produto)
                  ↓
Gateway local (Node-RED ou integração validada; buffer e normalização)
                  ↓ HTTPS/MQTT autenticado
Ingestão VoltGuard → validação/idempotência → fila de eventos
                  ↓
Persistência de telemetria + banco operacional versionado
                  ↓
Regras e eventos → notificações/ordens → dashboard e auditoria
```

Começar modular no monólito atual e separar ingestão, tarefas assíncronas ou armazenamento de séries quando medições de carga e disponibilidade justificarem. Evitar microserviços antes de haver volume ou equipe para operá-los. Manter a rede de aquisição segmentada e a ingestão sem permissão de escrita em PLC no primeiro escopo.

## 8. Condições para um produto profissional

- O produto é uma camada de monitoramento e gestão de manutenção; não substitui relé de proteção, intertravamento, SCADA certificado ou julgamento de profissional habilitado.
- Fazer análise de risco e revisão independente de segurança antes de conexão a ambientes industriais; validar requisitos contratuais e regulatórios com especialistas locais.
- Classificar dados, minimizar dados pessoais, definir retenção/exclusão e preparar contratos e responsabilidades de tratamento.
- Formalizar suporte, resposta a incidentes, disponibilidade prometida, janelas de manutenção, SLA e limites do serviço.
- Dar transparência à origem: dado real, dado simulado, derivado ou ausente; unidade, timestamp, frescor e incerteza.

## 9. Decisões pendentes que mudam o plano

1. Qual segmento abre portas hoje e quem são os 3 primeiros clientes potenciais?
2. O cliente já possui medidores/gateways ou a HITECH terá de fornecer hardware e instalação?
3. A empresa quer vender software puro, projeto de integração, ou uma solução combinada com parceiro?
4. Qual equipe e orçamento existem para engenharia, instalação, suporte e vendas nos próximos seis meses?
5. O produto ficará em nuvem, on-premises ou híbrido para os clientes iniciais?

## Fontes de referência

- [ThingsBoard — funcionalidades e plataforma](https://thingsboard.io/docs/paas/why-thingsboard/)
- [ThingsBoard — licença atual do repositório e mudança a partir da versão 4.4](https://github.com/thingsboard/thingsboard)
- [Node-RED — licença](https://nodered.org/about/license/)
- [Grafana — políticas de roteamento de alertas](https://grafana.com/docs/grafana/latest/alerting/fundamentals/notifications/notification-policies/)
- [Grafana — labels e annotations de alertas](https://grafana.com/docs/grafana/latest/alerting/fundamentals/alert-rules/annotation-label/)
- [MaintainX — gestão de ativos e manutenção](https://www.getmaintainx.com/)

As páginas e licenças comerciais podem mudar; verificar a versão e os termos aplicáveis antes de qualquer integração ou distribuição.

## Implementação iniciada — v0.18.0

Entregues a ligação rastreável entre alarmes e ordens de serviço, busca e filtros na Central de Alarmes, em tarefas de manutenção e em credenciais de dispositivo, indicadores de atrasos e de uso de credenciais, restauração auditável de regras específicas do painel aos padrões da organização, edição auditável do responsável e prazo das tarefas, consulta de auditoria pesquisável e paginada, autorização por papel, transições controladas, edição auditável dos dados principais da OS e dos ativos, busca e filtro de ativos, o ciclo operacional, histórico dedicado por ordem, busca/priorização por situação e prazo, checklist de execução auditável com bloqueio de conclusão enquanto houver pendências, modelos reutilizáveis isolados por organização e relatório individual imprimível por OS.

Esta etapa não transforma o sistema em produto industrial pronto; deve ser seguida pela consolidação de identidade/permissões, migrações formais, ingestão/gateway resiliente, notificação monitorada e um piloto validado com clientes.
