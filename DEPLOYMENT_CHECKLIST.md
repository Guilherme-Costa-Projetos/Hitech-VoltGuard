# Checklist de implantação — Render

## Antes do deploy

- [ ] Confirmar e documentar se o repositório GitHub deve ser público ou privado; em 25/10/2026 o repositório estava público. Não armazenar segredos ou dados de clientes no repositório.
- [ ] Arquivos do pacote extraídos diretamente na raiz do repositório.
- [ ] Pasta `vendor/` enviada com `chart.umd.min.js`, `html5-qrcode.min.js` e as duas licenças.
- [ ] `.env`, banco local e segredos reais não foram enviados ao Git.
- [ ] `render.yaml` revisado; planos/região/recursos confirmados no painel do Render.
- [ ] Dependências e testes locais executados em ambiente com as dependências de `requirements.txt` instaladas.
- [ ] Rever `SECURITY_REVIEW.md`; não considerar pendências de segurança/operação como aceites para dados reais sem decisão explícita.

## Durante o deploy

- [ ] Blueprint criou serviço web e banco PostgreSQL.
- [ ] `SECRET_KEY` foi gerada pelo Render e está definida como variável secreta.
- [ ] `DATABASE_URL` aponta para o banco correto.
- [ ] `ALLOW_SELF_SERVICE_REGISTRATION` permanece `0` até existir confirmação de e-mail e onboarding controlado.
- [ ] Preservar `SECRET_KEY` entre deploys; os segredos TOTP existentes são criptografados com uma chave derivada dela.
- [ ] Se houver mais de uma instância, `RATE_LIMIT_STORAGE_URI` aponta para Redis gerenciado e está cadastrada como variável secreta; sem essa configuração, limites de requisição ficam locais a cada processo.
- [ ] Build e start terminaram sem erros.
- [ ] `/health` responde HTTP 200.
- [ ] A página `/` e os recursos `/app.js`, `/styles.css` e `/vendor/*` enviam `Cache-Control: no-store`.
- [ ] `/vendor/chart.umd.min.js` e `/vendor/html5-qrcode.min.js` respondem HTTP 200; a aba Network não mostra chamadas aos CDNs.
- [ ] O cabeçalho `Content-Security-Policy` está presente; confirme que `script-src` não permite CDNs ou scripts inline.
- [ ] A política CSP Report-Only continua gerando somente relatórios; observar o Console durante os fluxos comuns, o leitor QR e o relatório de OS.

## Testes pós-deploy

- [ ] Criar organização de teste com senha de pelo menos 12 caracteres.
- [ ] Fazer login e sair.
- [ ] Confirmar que um login válido funciona e que usuário inexistente/senha incorreta recebem a mesma mensagem genérica.
- [ ] Confirmar que os painéis iniciais estão marcados como dados de demonstração.
- [ ] Como CEO, criar um Gerente e um Técnico de Campo; confirmar que cada perfil vê apenas módulos autorizados.
- [ ] Em **Minha conta**, trocar a senha de uma conta de teste; confirmar que as sessões abertas são encerradas e que o novo login funciona.
- [ ] Desativar uma conta de teste e confirmar que login/sessões anteriores deixam de funcionar; reativá-la e validar novo login.
- [ ] Tentar abrir `/api/users` com uma conta não CEO e confirmar resposta 403; revisar que as alterações aparecem na auditoria.
- [ ] Com Técnico de Campo, confirmar que `GET /api/devices/credentials` e `GET /api/export/executive-report` retornam 403; com Gerente, confirmar que a lista de credenciais retorna 200 e a exportação executiva retorna 403.
- [ ] Como CEO, encerrar as sessões de uma conta de teste; confirmar que ela precisa entrar novamente e que a ação aparece na auditoria.
- [ ] Como cada perfil (CEO, Gerente e Técnico de Campo), ativar MFA em **Minha conta**, escanear o QR uma vez, confirmar o código TOTP, escolher nova senha e guardar os códigos de recuperação; confirmar que login e troca posterior de senha pedem TOTP (ou um código de recuperação de uso único).
- [ ] Testar leitura QR manual; testar câmera somente em navegador/ambiente com permissão.
- [ ] Criar ordem de serviço e alterar estado.
- [ ] Testar exportação CSV autenticada.
- [ ] Testar regra de alarme e validar os limites com dados simulados.
- [ ] Criar item de estoque, aumentar saldo e confirmar que ajuste negativo indevido é rejeitado.
- [ ] Criar duas organizações de teste e verificar que uma não consegue consultar o painel da outra.
- [ ] Confirmar que nenhum equipamento real ou função de comando/proteção está conectado.

## Antes de qualquer piloto com dados reais

- [ ] No serviço histórico em `main`, confirmar o possível `/app/voltguard.db` efêmero; o Dashboard mostrou ausência de `DATABASE_URL` e o código usa SQLite como padrão. Render Shell/SSH não está disponível no plano Free. Preservar qualquer dado enquanto o container ainda está em execução; não implantar, reiniciar ou suspender antes de um método seguro e aprovado de exportação.
- [ ] Não usar dados reais no serviço/banco Free; Render declara que Free é para teste, não produção, e o PostgreSQL Free expira em 30 dias, sem backup gerenciado.
- [ ] Confirmar no Dashboard qual banco cada serviço usa e a data de expiração; `dpg-db9as5gn74is73f2felg-a` expira em 15/11/2026 23:07 UTC e contém registros. Resolver antes da data sem substituir `DATABASE_URL` às cegas e sem executar o Blueprint (PostgreSQL 16) sobre o recurso existente (PostgreSQL 18).
- [ ] Plano PostgreSQL persistente e custo recorrente aprovados pelo responsável; se não aprovado, manter apenas demonstração e planejar encerramento/exportação antes da expiração.
- [ ] Procedimento em [DATABASE_OPERATIONS.md](DATABASE_OPERATIONS.md) seguido; exportação armazenada em local privado.
- [ ] Restauração completa validada em PostgreSQL separado e vazio, sem apontar o serviço ativo antes da validação. `pg_restore --list` sozinho não conta como teste de restauração.
- [ ] Revisão independente de segurança e testes de isolamento concluídos.
- [ ] Migrações de banco revisadas com backup.
- [ ] Política de privacidade, retenção, suporte e resposta a incidentes definida.
- [ ] Telemetria real validada em laboratório, com identidade por dispositivo e rede de aquisição isolada.
