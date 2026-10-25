# HITECH VoltGuard SCADA Enterprise — pacote para Render

> **ARQUIVO HISTÓRICO — NÃO É A VERSÃO ATUAL.** Esta pasta preserva uma cópia antiga de referência, com fluxos, configuração e instruções desatualizados. O código mantido e implantado está na raiz do repositório. Consulte o `README.md`, `SECURITY_REVIEW.md` e `PRONTIDAO_COMERCIAL_BR.md` da raiz; não implante esta subpasta.

Versão revisada para **demonstração e homologação controlada**. Este pacote não é SCADA industrial certificado e não deve ser conectado a funções de proteção, intertravamento ou comando de equipamentos elétricos.

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
  -d '{"panel_id":"PANEL_ID","temperature":42.5,"current":118.4,"voltage":"380V AC"}'
```

3. A resposta deve conter `status: success`. Consulte o painel e o histórico para confirmar temperatura, corrente e tensão. Uma leitura acima dos limites configurados deve gerar/atualizar o alarme correspondente; uma leitura normal deve limpar automaticamente a condição ativa.
4. Em **Dispositivos**, confirme que “Último uso” foi atualizado. Revogue a credencial e repita a chamada: a API deve responder `401`.

Validações locais nesta versão: 11 testes automatizados aprovados. O teste foi executado com um stub de `slowapi` porque essa dependência não estava disponível no ambiente local; portanto, o rate limiting deve ser confirmado com as dependências completas no Render. A atualização não foi publicada automaticamente no serviço do usuário.

## Publicação recomendada no Render

1. Extraia o ZIP e confirme que `main.py`, `index.html`, `requirements.txt`, `Dockerfile` e `render.yaml` estão na raiz do repositório.
2. Crie um repositório **privado** no GitHub e envie o conteúdo da pasta do projeto. Não envie `.env`, bancos locais ou segredos.
3. No Render, escolha **New + → Blueprint** e conecte o repositório.
4. Revise os recursos e variáveis definidos pelo `render.yaml` antes de aplicar.
5. Aguarde o deploy e verifique `https://SEU-SERVICO.onrender.com/health`. A resposta esperada contém `"status":"ok"`.
6. Abra a página inicial, selecione **Registar Nova Empresa**, crie uma organização, um usuário e uma senha com pelo menos 12 caracteres; depois faça login.
7. Confira que os três painéis criados para a organização estão identificados como demonstração. Não são leituras de medidores físicos.
8. Teste o acesso às abas, a criação de ordens de serviço, a exportação CSV, as regras e o inventário.

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
- Configure `SECRET_KEY` com pelo menos 32 caracteres aleatórios e `DATABASE_URL` com a URL interna do PostgreSQL. Não existe usuário/senha predefinido; cadastre a primeira organização pela interface.

Não comite valores reais de `SECRET_KEY` nem URLs de banco com credenciais.

## Testes locais

Requer Python 3.12 ou superior compatível com as dependências listadas.

```bash
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# Linux/macOS:
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v
uvicorn main:app --host 127.0.0.1 --port 8000
```

Abra `http://127.0.0.1:8000`. Para ambiente local, o padrão é SQLite. Para Render, use PostgreSQL.

## Persistência e custo

O Blueprint está configurado para avaliação econômica. Serviços e bancos gratuitos podem ter limites de uso, suspensão por inatividade e políticas de expiração que mudam com o tempo. Antes de guardar dados reais, confirme no painel e na documentação atual do Render o plano, a persistência, os backups e a política de expiração do PostgreSQL. Faça upgrade quando necessário e teste restauração antes de um piloto comercial.

## Limites funcionais importantes

- A telemetria da API é autenticada com token de usuário; **ainda não existe uma identidade/credencial dedicada por dispositivo industrial**.
- Não há driver pronto de PLC/medidor (Modbus/OPC UA), gateway de aquisição ou garantia de tempo real industrial.
- O WebSocket autentica o token via query string, o que pode expor tokens em logs; reavaliar antes de produção.
- Alguns KPIs, previsão de falhas e valores ESG são demonstrativos/estimativas e não constituem predição validada ou medição real.
- A assinatura representa metadados; não há integração de cobrança, pagamentos, inadimplência ou cancelamento.
- IDs de painéis permanecem globalmente únicos no modelo atual. A coluna `tenant_id` e os filtros de acesso protegem as consultas, mas permitir IDs iguais entre organizações requer migração de chave e revisão dos relacionamentos.
- O limitador de requisições usa armazenamento em memória por processo; não é proteção distribuída para uma implantação escalada.

Leia `REVISAO_TECNICA.md` antes de usar dados reais.

## Novos módulos (v0.5.0)

### Gestão de ativos
A aba **Ativos** permite cadastrar tag patrimonial, nome, tipo, localização, fabricante, modelo, número de série, painel associado e observações. A tag é validada como única por organização na aplicação.

Endpoints autenticados: `GET /api/assets` e `POST /api/assets`.

### Manutenção preventiva
A aba **Manutenção** permite criar planos com periodicidade em dias e checklist, gera a primeira tarefa e agenda a próxima execução quando uma tarefa recorrente é concluída. Estados: `PENDENTE`, `EM_ANDAMENTO`, `CONCLUIDA`, `CANCELADA`. A recorrência é acionada na conclusão da tarefa, não por um scheduler externo.

Endpoints autenticados: `GET/POST /api/maintenance/plans`, `GET/POST /api/maintenance/tasks`, `PATCH /api/maintenance/tasks/{id}`.

### Credenciais dedicadas de dispositivo
A aba **Dispositivos** permite emitir um token exclusivo vinculado a um painel. A API guarda somente o hash SHA-256 do token; o valor bruto aparece uma única vez na criação. Credenciais podem ser revogadas. Use HTTPS, armazene o token em cofre de segredos no gateway e nunca no JavaScript do navegador.

Envie telemetria com `POST /api/device/telemetry`, cabeçalho `Authorization: Bearer <device-token>` e JSON contendo `panel_id`, `temperature`, `current` e opcionalmente `voltage`. Cada token só pode enviar dados ao painel ao qual foi vinculado. Isso implementa o endpoint de ingestão autenticada, mas não instala driver Modbus/OPC UA nem conecta automaticamente equipamento físico.

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
