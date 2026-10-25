# Operação do banco de dados — HITECH VoltGuard

Este procedimento cobre os dados armazenados no PostgreSQL do Render. Faça o backup antes de qualquer alteração de esquema, atualização importante ou atividade de manutenção. Use somente dados de demonstração enquanto a restauração não tiver sido validada.

## Aviso crítico: PostgreSQL no plano Free

O Blueprint deste repositório solicita PostgreSQL `Free`. A documentação atual do Render informa que bancos Free não têm backups gerenciados nem PITR, expiram 30 dias após a criação, ficam inacessíveis ao expirar e são excluídos ao fim de mais 14 dias sem upgrade. O serviço web Free também é para teste, não produção. Consulte [limitações do Render Free](https://render.com/docs/free) e [recuperação e backups PostgreSQL](https://render.com/docs/postgresql-backups).

A auditoria somente de metadados no workspace `My Workspace` confirmou `dpg-db9as5gn74is73f2felg-a` como PostgreSQL 18, plano Free, criado em **16/10/2026 23:07:02 UTC**, com expiração em **15/11/2026 23:07:02 UTC**. Uma consulta somente de estrutura encontrou tabelas e uma consulta agregada confirmou registros existentes; nenhuma linha ou valor de usuário foi lido. O repositório GitHub é público, portanto não registre aqui contagens nem conteúdo dos dados. Confirme no Dashboard qual serviço usa esse banco; o serviço histórico e o serviço piloto podem apontar para bancos diferentes. Não altere `DATABASE_URL`, não migre nem exclua o banco até gerar e validar backup.

## Serviço histórico e possível SQLite efêmero

A página Environment do serviço histórico `Hitech-VoltGuard` em `main` mostrou `SECRET_KEY`, mas nenhuma `DATABASE_URL` nem Environment Group. O `main.py` dessa branch define `sqlite:///./voltguard.db` quando a variável está ausente, e o Dockerfile executa a aplicação a partir de `/app`. O serviço pode, portanto, usar `/app/voltguard.db` no filesystem efêmero do container Free. Não foi verificado se o arquivo existe ou contém dados. Os registros/agregados observados no PostgreSQL não provam que esse seja o banco do serviço histórico ou do piloto.

**Preservação:** não implante, reinicie, suspenda ou reconfigure o serviço histórico até a equipe responsável determinar se há dados locais que precisam ser preservados e escolher um método seguro de cópia a partir do container ainda em execução. O Dashboard informa que Shell/SSH não estão disponíveis no plano Free; não solicite upgrade pago sem aprovação e não tente exportar por um endpoint improvisado. Não cole, anexe ou versione o arquivo no GitHub/chat. Faça validação em cópia isolada. Se não houver método gratuito seguro, mantenha o serviço em execução e consulte o suporte do Render antes de qualquer deploy.

Até haver decisão aprovada sobre infraestrutura e restauração validada:

- mantenha apenas dados fictícios/de demonstração; não use dados operacionais reais nem prometa retenção;
- confirme no Dashboard a data exata de expiração e registre lembretes internos para decidir antes dela;
- antes da expiração, escolha com o responsável: aprovar um plano persistente pago, migrar para outro destino aprovado ou encerrar o piloto após exportação;
- não suponha que backup local isolado seja suficiente: teste a restauração em uma instância PostgreSQL separada e vazia antes de confiar no arquivo.

## Estado atual do aplicativo

- O endereço `DATABASE_URL` seleciona o PostgreSQL no Render; em desenvolvimento local, o padrão é SQLite.
- Na inicialização, `init_db()` executa algumas alterações de compatibilidade específicas e `Base.metadata.create_all()`. Isso não é um sistema de migração versionado e não oferece rollback automático.
- Não há comando de migração separado nesta versão. Não edite tabelas manualmente nem introduza uma nova migração de esquema sem cópia do banco, plano de retorno e validação em uma instância separada.
- O banco contém contas, hashes de senha, segredos TOTP criptografados, códigos de recuperação em hash, auditoria, credenciais de dispositivos em hash, telemetria e dados por organização. Trate qualquer exportação como informação sensível.

## Exportação lógica pelo painel em planos compatíveis

1. Abra o Dashboard do Render e selecione o recurso **PostgreSQL** conectado ao serviço VoltGuard.
2. Confirme que o nome do banco e o serviço correspondem ao ambiente pretendido.
3. Abra **Recovery** e escolha **Create export**.
4. Aguarde a exportação terminar e baixe o arquivo `.dir.tar.gz` para um local privado com acesso restrito.
5. Registre a data, o banco de origem e a versão do aplicativo em um registro de operação. Nunca inclua URLs de conexão, senhas ou segredos nesse registro.
6. Armazene uma cópia fora do Render se precisar de retenção maior. O Render informa retenção de sete dias para exportações lógicas criadas no painel.

Render não oferece exportação lógica pelo painel nem recuperação PITR no plano Free. Confira o plano atual na página do banco.

### Exportação manual para um banco Free

Use esta opção somente para manter uma cópia de demonstração enquanto a decisão de infraestrutura está pendente. Instale ferramentas PostgreSQL da mesma versão principal do destino (o Blueprint solicita PostgreSQL 16) e conecte-se usando o host externo, que exige TLS. Não cole a URL completa do banco em comandos, tickets, capturas, histórico do terminal ou mensagens: ela contém credenciais.

**Acesso externo atualmente bloqueado no recurso PostgreSQL:** a allowlist própria do banco `voltguard-db` está vazia, e o Dashboard exibe “All internet traffic is blocked by PostgreSQL inbound IP rules”. Em 25/10/2026, a tela também mostrou uma regra herdada do workspace, `0.0.0.0/0` (“everywhere”), na seção **Affected by: Workspace**. Uma tentativa autorizada de adicionar somente o IPv4 da estação como `/32` fez a URL externa aparecer e a tela indicar dois intervalos permitidos; não foi possível confirmar se a regra ampla herdada se aplica ao acesso externo do banco. O `/32` foi removido imediatamente, a allowlist do banco voltou a `[]` e a tela voltou a indicar bloqueio externo. Nenhum `pg_dump` foi executado e nenhuma credencial foi aberta. **Não adicione outro `/32` nem execute a exportação até confirmar com a documentação/suporte do Render o efeito da regra herdada e como restringir somente este banco. Não altere a regra global do workspace**, pois isso pode afetar outros serviços. A URL interna permanece para serviços Render na mesma região; use-a no app, não na estação local.

1. No Windows, crie o arquivo `%APPDATA%\\postgresql\\pgpass.conf` fora do repositório; no macOS/Linux, use `~/.pgpass` ou defina `PGPASSFILE`. Restrinja o acesso ao usuário atual. A linha tem o formato `host:port:database:username:password`; escape `:` e `\\` dentro dos campos. Veja [o formato e permissões do arquivo de senha do PostgreSQL](https://www.postgresql.org/docs/current/libpq-pgpass.html).
2. Obtenha host, banco e usuário na página **Connect** do banco no Render. Use a senha somente no arquivo de senha local protegido. No macOS/Linux, aplique `chmod 0600 ~/.pgpass`; no Windows, mantenha o arquivo no perfil privado do usuário. O banco atualmente auditado é PostgreSQL 18; use cliente compatível e confirme a versão principal do destino antes de qualquer restauração.
3. Escolha uma pasta privada em disco criptografado, fora do Git e de pastas sincronizadas sem aprovação. No PowerShell, defina `PGPASSFILE` se o arquivo não estiver no caminho padrão e `PGSSLMODE=require`; então execute, substituindo cada placeholder:

   ```powershell
   $env:PGSSLMODE = 'require'
   pg_dump --host 'HOST_EXTERNO' --port 5432 --username 'USUARIO' --dbname 'BANCO' --format=custom --no-owner --no-acl --file 'CAMINHO_PRIVADO\\voltguard-AAAA-MM-DD.dump'
   if ($LASTEXITCODE -ne 0) { throw 'pg_dump falhou; não trate o arquivo como backup válido.' }
   pg_restore --list 'CAMINHO_PRIVADO\\voltguard-AAAA-MM-DD.dump' | Out-Null
   if ($LASTEXITCODE -ne 0) { throw 'O arquivo não passou na leitura de catálogo do pg_restore.' }
   Get-FileHash -Algorithm SHA256 'CAMINHO_PRIVADO\\voltguard-AAAA-MM-DD.dump'
   ```

4. Registre a saída de `Get-FileHash` junto da data e do banco de origem, sem incluir segredos. Guarde o arquivo e o hash em local criptografado e com acesso restrito. A leitura do catálogo confirma que o arquivo pode ser lido, mas **não valida a restauração**.
5. Valide uma restauração completa em PostgreSQL separado e vazio, preferencialmente local enquanto não houver destino pago aprovado. Nunca restaure no banco ativo; não use `--clean` nesse banco.

## Recuperação após perda ou corrupção de dados

### Banco pago com recuperação PITR disponível

1. Em **Recovery**, use **Restore Database** para criar uma instância de recuperação em um horário anterior ao incidente.
2. Aguarde a nova instância ficar disponível e valide os dados nela, sem apontar o serviço ativo para ela ainda.
3. Se os dados estiverem corretos, atualize `DATABASE_URL` no ambiente do serviço (ou no Environment Group correspondente) para a URL da instância recuperada.
4. Faça um deploy/restart controlado e confirme `/health`, login de uma conta de teste e leitura de dados esperados.
5. Preserve a instância original até confirmar o funcionamento. Só então decida se ela deve ser suspensa ou removida.

O PITR cria uma nova instância; ele não substitui o banco em uso automaticamente. Janela e disponibilidade dependem do plano vigente. Consulte [Render Postgres Recovery and Backups](https://render.com/docs/postgresql-backups).

### Restaurar uma exportação lógica

Restaure apenas em um banco novo e vazio. O comando `pg_restore --clean` remove objetos existentes no esquema de destino. Não o execute contra o banco ativo nem contra um banco que contenha outros dados importantes.

1. Crie um banco de destino separado no Render e obtenha a URL externa dele.
2. Baixe e extraia o arquivo `.dir.tar.gz` em uma pasta privada.
3. Use `pg_restore` da versão principal compatível com o banco de destino, apontando para a URL externa do destino.
4. Valide as tabelas e os dados no destino antes de alterar `DATABASE_URL` do serviço.

Siga os comandos e requisitos atuais da documentação oficial do Render, pois os nomes das opções e as ferramentas PostgreSQL compatíveis podem mudar: [Render Postgres Recovery and Backups](https://render.com/docs/postgresql-backups).

## Voltar atrás após uma atualização de aplicativo

1. Se o deploy falhar antes de alterar o esquema, restaure a versão anterior do aplicativo pelo fluxo de deploy do Render.
2. Se a inicialização da nova versão já tiver alterado o esquema, não presuma que voltar o código reverte o banco. Pare novas alterações, preserve logs e use a cópia/PITR para preparar uma instância separada.
3. Valide a instância recuperada com a versão de aplicativo compatível antes de trocar a conexão do serviço.
4. Não apague a instância original ou a cópia de recuperação até confirmar que a aplicação está lendo e gravando os dados esperados.

## Segredos e configuração

O backup do banco não substitui o backup seguro de configuração. Preserve `SECRET_KEY` em um cofre de segredos com acesso restrito e mantenha-a estável: os segredos TOTP são criptografados com uma chave derivada dela. Uma cópia do banco sem a `SECRET_KEY` original não permite descriptografar os segredos MFA existentes. Nunca coloque `SECRET_KEY`, `DATABASE_URL`, códigos de recuperação ou exportações no GitHub, em capturas de tela ou neste repositório.

## Registro mínimo de cada operação

- Data e responsável.
- Banco/ambiente de origem e destino (nomes, sem URLs).
- Versão do aplicativo e motivo da operação.
- Tipo e horário do backup ou ponto de recuperação.
- Resultado da validação e decisão de manter/remover instâncias temporárias.
