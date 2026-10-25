# Prontidão comercial — Brasil

**Estado:** piloto técnico; não liberar para clientes pagantes ainda.  
**Mercado assumido:** Brasil, confirmado pelo responsável do projeto.  
**Escopo:** este documento orienta engenharia e preparação do produto. Não é parecer jurídico, certificação elétrica ou auditoria independente.

## O que já pode ser demonstrado

- Login por usuário e senha, MFA TOTP opcional, sessões revogáveis, perfis e isolamento por organização nas rotas revisadas.
- Painéis e valores claramente identificados como demonstração; telemetria real só entra por endpoint autenticado.
- Alarmes, histórico, ordens de serviço, manutenção, inventário e exportação para explorar o fluxo operacional.
- Cadastro público fechado por padrão no Render; organizações do piloto são provisionadas de maneira controlada.

Use exclusivamente dados fictícios para demonstrações. Não apresente o serviço atual como SCADA certificado, sistema de proteção, previsão de falha comprovada, medidor de energia, solução NR-10 ou produto já conforme à LGPD.

## Bloqueios para clientes reais

| Tema | Situação atual | Critério de liberação |
|---|---|---|
| Dados e persistência | Serviço e PostgreSQL do piloto estão no plano gratuito; Render informa que Postgres Free expira em 30 dias, não tem backup gerenciado e é destinado a teste. A auditoria registrou expiração para 15/11/2026, mas ainda é preciso confirmar qual serviço usa esse banco. | Antes da expiração, identificar a origem efetiva de `DATABASE_URL`, preservar qualquer dado, aprovar ou não o custo de infraestrutura persistente e realizar backup/restore isolado. Até lá, somente dados fictícios. Não migrar nem apagar o banco atual sem confirmação do proprietário. |
| Contas e suporte | Há um comando de provisionamento inicial que só funciona se todas as tabelas estiverem vazias; o Render Free não fornece Shell/SSH para executá-lo dentro da instância. Também faltam e-mail verificado, convite, recuperação automática de conta e canal de atendimento. | Definir ambiente administrativo seguro com conectividade já aprovada (sem abrir o banco à internet), endereço de suporte, fluxo de convite, recuperação com token curto e de uso único, MFA para administradores e atendimento/escalação. O cadastro público continua desligado até isso ser validado. |
| Privacidade/LGPD | Existe um inventário técnico preliminar do que o código armazena, exporta e envia por webhook; ele não é aviso legal nem política aprovada. Persistem lacunas de retenção, fluxo integral de direitos, papéis, subprocessadores e processo de incidente. | Usar [MAPA_DADOS_E_PRIVACIDADE_RASCUNHO.md](MAPA_DADOS_E_PRIVACIDADE_RASCUNHO.md) como insumo. Empresa define finalidade, bases legais, papéis, prazos, subprocessadores, canal do titular, encarregado quando aplicável, exclusão/exportação e responsabilidades contratuais. Assessoria jurídica revisa os documentos. |
| Cobrança | A assinatura é metadado; pagamentos, renovação, inadimplência, cancelamento e nota fiscal não estão integrados. | Definir preço e limites com pilotos, entidade vendedora, tributação, provedor, termos de cancelamento/reembolso e suporte; só então integrar checkout e webhooks de cobrança idempotentes. |
| Banco e mudanças | Inicialização usa `create_all()` e ajustes de compatibilidade limitados; não há histórico formal de migrações nem rollback testado. | Versionar migrações, ensaiar atualização e rollback em cópia, adicionar monitoramento e documentar manutenção antes de atualizar produção. |
| Operação | Não há evidência de backup restaurado, alertas operacionais, teste de carga, pentest ou rotina de resposta a incidentes. | Ensaiar recuperação; alertar sobre saúde, latência, erros e banco; executar teste de carga/pentest conforme risco e corrigir achados antes de ampliar acesso. |
| Medição e segurança elétrica | Mapa Modbus depende do modelo/firmware; não há homologação física do medidor nem verificação metrológica/laboratorial documentada. | Escolher equipamento e sensores, validar unidade/escala, timestamps, qualidade, reconexão, limites e alarmes com responsável técnico em bancada e piloto controlado. O gateway deve iniciar conexão de saída e nunca comandar proteção. |
| Conformidade de produto | O software não determina sozinho se o hardware final cai em escopo de certificação/regulamento específico. | Definir se será vendido apenas software, gateway, medidor ou painel montado; verificar cada SKU e instalação com responsável técnico e organismo/regulador competente. Não usar selo ou alegação de certificação antes da evidência. |

## Requisitos legais e normativos a avaliar

- **LGPD (Lei nº 13.709/2018):** mapear dados pessoais e a atuação concreta da HITECH e do cliente como controlador/operador; documentar transparência, finalidade, direitos, segurança, retenção e resposta a incidentes. A ANPD orienta que o incidente sujeito a comunicação deve ser avaliado pelo controlador conforme risco/dano relevante. A aplicação sozinha não torna a operação conforme.
- **NR-10:** trata de segurança de trabalhadores que interagem com instalações e serviços elétricos. O MTE publicou nova redação pela Portaria MTE nº 737/2026, com vigência prevista em **1º de junho de 2027**; até 31/05/2027 aplica-se a redação vigente atual, com regras específicas de transição. Isso não certifica software. Posicionar VoltGuard apenas como ferramenta de monitoramento/apoio à manutenção, sem substituir procedimentos, profissional habilitado, proteção ou prontuário exigido.
- **INMETRO e normas técnicas:** a obrigatoriedade depende do produto e da configuração comercial (por exemplo, medidor, fonte, rádio, gateway ou painel), não apenas do nome da plataforma. Consultar o escopo regulatório do produto físico e o organismo competente antes da venda.
- **Cibersegurança industrial:** usar práticas de segmentação e defesa em profundidade como requisitos de engenharia; a aplicação web não deve abrir acesso de entrada à rede OT. Não declarar conformidade IEC 62443 sem avaliar o sistema completo e realizar a avaliação exigida.

## Sequência recomendada

1. Continuar a validação do piloto com dados fictícios, incluindo os três perfis, operações principais e isolamento entre organizações. O comando inicial só pode ser usado numa instalação nova, vazia e com o serviço parado; não o execute no banco atual do piloto.
2. Definir os dados da empresa e atendimento para elaborar aviso de privacidade, termos, contrato de piloto, DPA quando aplicável e processo de incidente.
3. Exercitar o comando de provisionamento numa instalação vazia, desenhar recuperação de contas e definir infraestrutura persistente; realizar backup/restore em cópia e preparar migrações formais sem tocar no banco atual.
4. Entrevistar clientes do segmento escolhido, rodar pilotos de desenho com objetivos acordados e testar preço/implantação/suporte.
5. Homologar o conjunto medidor-gateway em laboratório e ambiente controlado; medir qualidade das leituras e comportamento de perda de comunicação.
6. Após resolver os bloqueios, habilitar clientes reais gradualmente, com limites, suporte, observabilidade e plano de reversão.

## Decisões ainda necessárias do responsável

- Razão social/CNPJ e nome comercial da entidade que venderá o serviço.
- E-mail e horário/canal de suporte; contato de privacidade e encarregado, se aplicável.
- Segmento inicial e cliente piloto; hardware, modelo completo, firmware, grandezas e instalação alvo.
- Modelo de preço, limites por organização, implantação, cancelamento e processo fiscal.
- Provedor de e-mail e cobrança; orçamento recorrente de produção, banco, backup e monitoramento.
- Papéis de tratamento de dados, prazos de retenção/exportação/exclusão e subprocessadores aprovados.
- Região efetiva e retenção do PostgreSQL, controles de backup e acesso de operadores confirmados com o proprietário da infraestrutura.

## Fontes oficiais

- [ANPD — LGPD e orientações sobre incidentes](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis)
- [Ministério do Trabalho e Emprego — NR-10 e calendário da nova redação](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-paritaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/norma-regulamentadora-no-10-nr-10)
- [INMETRO — produtos e serviços regulados](https://www.gov.br/inmetro/pt-br/assuntos/regulamentacao/produtos-e-servicos-regulados)
- [OWASP ASVS — referência para requisitos verificáveis de segurança de aplicações](https://owasp.org/www-project-application-security-verification-standard/)
- [Render — disponibilidade de Shell e SSH por tipo de serviço](https://render.com/docs/ssh)
