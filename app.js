        let currentTab = 'realtime';
        let currentUser = '', currentCargo = '', tokenJwt = '';
        let mfaEnrollment = null, mfaRecoveryCodes = [], mfaSetupChallenge = '', mfaPasswordChanged = false;
        let dadosGlobais = {}, auditLogs = [], billingData = {}, inventoryData = {}, historyData = {}, workOrders = [], workOrderChecklistTemplates = [], alarmsData = [], assetsData = [], maintenancePlans = [], maintenanceTasks = [], deviceCredentials = [], tenantUsers = [], pollingInterval = null;
        const workOrderHistoryOpen = new Set();
        const workOrderEditOpen = new Set();
        const assetEditOpen = new Set();
        let assetSearchText = '', assetStatusFilter = 'TODOS';
        let maintenanceSearchText = '', maintenanceStatusFilter = 'TODOS', maintenanceOnlyOverdue = false;
        let deviceSearchText = '', devicePanelFilter = 'TODOS', deviceStatusFilter = 'TODOS';
        let panelRuleCustom = false, panelRuleLoadSequence = 0;
        let workOrderSearchText = '', workOrderStatusFilter = 'TODAS', workOrderOnlyOverdue = false, workOrderOriginFilter = 'TODAS';
        let alarmSearchText = '', alarmStatusFilter = 'TODAS', alarmSeverityFilter = 'TODAS';
        let auditPageLogs = [], auditActions = [], auditTotal = 0, auditHasMore = false, auditLoading = false, auditError = '';
        let auditOffset = 0, auditFilters = {search:'', user_name:'', action:'', date_from:'', date_to:''};
        let inventoryPrefilledItemId = null;
        let chartInstances = {};
        let historyWindowHours = 168;
        let historyPageState = {};
        let html5QrCodeScanner = null;
        let qrScannerCleanup = Promise.resolve();
        let qrScannerLocalizationObserver = null;
        let lastScannedQr = '', lastScannedQrAt = 0, qrLookupInProgress = false;

        function formatarNome(n) { return String(n || '').replace(/([a-z])([A-Z])/g, '$1 $2'); }

        function formatarDataHora(valor) {
            if (!valor) return '—';
            const normalizado = /(?:Z|[+-]\d{2}:\d{2})$/.test(valor) ? valor : `${valor}Z`;
            const data = new Date(normalizado);
            return Number.isNaN(data.getTime()) ? String(valor) : data.toLocaleString('pt-BR', {dateStyle:'short', timeStyle:'short'});
        }

        function formatarMedida(valor, casas = 1) {
            const numero = Number(valor);
            return valor == null || valor === '' || !Number.isFinite(numero)
                ? 'Sem dado'
                : numero.toLocaleString('pt-BR', {minimumFractionDigits:casas, maximumFractionDigits:2});
        }

        function formatarLeituraPainel(painel, campo, casas = 1) {
            if (painel[`${campo}_has_reading`] === false || (painel.data_available === false && !painel[`${campo}_has_reading`])) return 'Sem leitura';
            const valor = formatarMedida(painel[campo], casas);
            if (painel[`${campo}_measured`] === false && valor !== 'Sem dado') {
                return `${valor} (última leitura preservada)`;
            }
            return valor;
        }

        function statusOperacionalPainel(painel) {
            if (painel.data_available === false) return 'AGUARDANDO TELEMETRIA';
            if (painel.status === 'PARCIAL') return 'PARCIAL — AVALIAÇÃO INCOMPLETA';
            return painel.status || 'INDEFINIDO';
        }

        function rotuloTensaoPainel(painel) {
            if (String(painel.name || '').includes('DEMO')) return 'Tensão simulada (DEMO)';
            if (painel.voltage_measured) return 'Tensão medida';
            return painel.voltage_has_reading ? 'Tensão (última leitura preservada)' : 'Tensão de referência';
        }

        function resumirConectividade(painel) {
            const estado = painel.connectivity_status || 'INDEFINIDO';
            const labels = {
                ONLINE: 'Online', OFFLINE: 'Offline',
                NOT_CONFIGURED: 'Sem credencial ativa',
                NEVER_CONNECTED: 'Aguardando primeira telemetria',
                INDEFINIDO: 'Indisponível'
            };
            if (!painel.last_seen_at) return labels[estado] || estado;
            const timestamp = Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(painel.last_seen_at) ? painel.last_seen_at : `${painel.last_seen_at}Z`);
            if (!Number.isFinite(timestamp)) return labels[estado] || estado;
            const age = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
            const elapsed = age < 60 ? `há ${age} s` : age < 3600 ? `há ${Math.floor(age / 60)} min` : `há ${Math.floor(age / 3600)} h`;
            return `${labels[estado] || estado} · última leitura ${elapsed} (${formatarDataHora(painel.last_seen_at)})`;
        }

        function dataParaInputLocal(valor) {
            if (!valor) return '';
            const normalizado = /(?:Z|[+-]\d{2}:\d{2})$/.test(valor) ? valor : `${valor}Z`;
            const data = new Date(normalizado);
            if (Number.isNaN(data.getTime())) return '';
            return new Date(data.getTime() - data.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        }

        function escapeHtml(value) { return String(value ?? '').replace(/[&<>\"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch])); }

        function mostrarRegisto(mostrar) {
            document.getElementById('login-screen').classList.toggle('is-hidden', mostrar);
            document.getElementById('register-screen').classList.toggle('is-hidden', !mostrar);
        }

        async function carregarDisponibilidadeCadastro() {
            const button = document.getElementById('show-register-button');
            const message = document.getElementById('registration-unavailable');
            if (!button || !message) return;
            try {
                const response = await fetch('/api/tenant/registration-status', {headers:{'Accept':'application/json'}});
                if (!response.ok) throw new Error('Não foi possível consultar o cadastro.');
                const config = await response.json();
                const enabled = config.self_service_enabled === true;
                button.classList.toggle('is-hidden', !enabled);
                message.classList.toggle('is-hidden', enabled);
            } catch (_error) {
                button.classList.add('is-hidden');
                message.classList.remove('is-hidden');
                message.textContent = 'Não foi possível verificar se o cadastro público está disponível.';
            }
        }

        async function registarTenant() {
            const tenant = document.getElementById('reg-tenant').value.trim();
            const user = document.getElementById('reg-user').value.trim();
            const pass = document.getElementById('reg-pass').value;
            const errEl = document.getElementById('reg-error-msg');

            try {
                const res = await fetch('/api/tenant/register', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({tenant_id: tenant, username: user, password: pass})
                });
                const data = await res.json();
                if(!res.ok) throw new Error(data.detail || "Erro ao registar.");
                alert(data.message);
                mostrarRegisto(false);
            } catch (err) {
                if(errEl) errEl.innerText = err.message;
            }
        }

        async function realizarLogin() {
            const usuarioInput = document.getElementById('usuario');
            const senhaInput = document.getElementById('senha');
            const errEl = document.getElementById('error-msg');

            if(!usuarioInput || !senhaInput) return;

            const usuario = usuarioInput.value.trim();
            const senha = senhaInput.value;
            const mfaCodeInput = document.getElementById('mfa-login-code');
            const mfaCode = mfaCodeInput?.value.trim() || '';
            if(errEl) errEl.innerText = "A autenticar...";

            try {
                const res = await fetch('/api/token', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({username: usuario, password: senha, ...(mfaCode ? {mfa_code: mfaCode} : {})})
                });
                
                const data = await res.json();
                if (res.status === 401 && data.detail === 'MFA_REQUIRED') {
                    document.getElementById('mfa-login-group')?.classList.remove('is-hidden');
                    if(errEl) errEl.innerText = 'Informe o código do aplicativo autenticador ou um código de recuperação.';
                    mfaCodeInput?.focus();
                    return;
                }
                if(!res.ok) {
                    throw new Error(data.detail || "Utilizador ou senha incorretos.");
                }

                tokenJwt = data.access_token;
                currentCargo = data.role;
                currentUser = usuario;
                mfaEnrollment = null;
                mfaRecoveryCodes = [];
                mfaSetupChallenge = '';
                mfaPasswordChanged = false;

                document.getElementById('user-display').innerText = formatarNome(usuario);
                document.getElementById('cargo-display').innerText = currentCargo;
                document.getElementById('login-screen').classList.add('is-hidden');
                document.getElementById('dashboard-screen').classList.remove('is-hidden');
                document.getElementById('mfa-login-group')?.classList.add('is-hidden');
                if (mfaCodeInput) mfaCodeInput.value = '';

                construirAbas();
                iniciarPolling();
            } catch (err) {
                console.error("Erro no Login:", err);
                if(errEl) errEl.innerText = err.message;
            }
        }

        async function realizarLogout() {
            const activeToken = tokenJwt;
            if (activeToken) {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 3000);
                try {
                    await fetch('/api/logout', {
                        method: 'POST',
                        headers: {'Authorization': `Bearer ${activeToken}`},
                        signal: controller.signal
                    });
                } catch (err) {
                    console.warn('O servidor não confirmou a revogação da sessão:', err);
                } finally {
                    clearTimeout(timeout);
                }
            }
            if (pollingInterval) clearInterval(pollingInterval);
            pollingInterval = null;
            tokenJwt = '';
            currentUser = '';
            currentCargo = '';
            mfaEnrollment = null;
            mfaRecoveryCodes = [];
            mfaSetupChallenge = '';
            mfaPasswordChanged = false;
            tenantUsers = [];
            window.location.reload();
        }

        async function baixarRelatorio() {
            try {
                const res = await fetch('/api/export/executive-report', {
                    headers: {'Authorization': `Bearer ${tokenJwt}`}
                });
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.detail || 'Não foi possível gerar o relatório.');
                }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'relatorio_executivo_voltguard.xlsx';
                document.body.appendChild(link);
                link.click();
                link.remove();
                URL.revokeObjectURL(url);
            } catch (err) {
                alert(err.message || 'Falha ao descarregar relatório.');
            }
        }

        function construirAbas() {
            let html = `<button type="button" class="tab-btn active" id="t-realtime" data-action="switch-tab" data-tab="realtime">📊 Tempo Real</button>`;
            html += `<button type="button" class="tab-btn" id="t-account" data-action="switch-tab" data-tab="account">🔐 Minha conta</button>`;
            html += `<button type="button" class="tab-btn" id="t-commission" data-action="switch-tab" data-tab="commission">📷 Comissionamento (QR)</button>`;
            if (currentCargo === 'CEO' || currentCargo === 'Gerente') {
                html += `<button type="button" class="tab-btn" id="t-predictive" data-action="switch-tab" data-tab="predictive">📈 Tendência Térmica</button>`;
                html += `<button type="button" class="tab-btn" id="t-esg" data-action="switch-tab" data-tab="esg">🌱 ESG</button>`;
                html += `<button type="button" class="tab-btn" id="t-inventory" data-action="switch-tab" data-tab="inventory">📦 Almoxarifado</button>`;
                html += `<button type="button" class="tab-btn" id="t-assets" data-action="switch-tab" data-tab="assets">🏷️ Ativos</button>`;
                html += `<button type="button" class="tab-btn" id="t-maintenance" data-action="switch-tab" data-tab="maintenance">🧰 Manutenção</button>`;
                html += `<button type="button" class="tab-btn" id="t-devices" data-action="switch-tab" data-tab="devices">🔑 Dispositivos</button>`;
                html += `<button type="button" class="tab-btn" id="t-rules" data-action="switch-tab" data-tab="rules">⚙️ Regras de Alarme</button>`;
            } else if (currentCargo === 'Técnico de Campo') {
                html += `<button type="button" class="tab-btn" id="t-assets" data-action="switch-tab" data-tab="assets">🏷️ Ativos</button>`;
                html += `<button type="button" class="tab-btn" id="t-maintenance" data-action="switch-tab" data-tab="maintenance">🧰 Manutenção</button>`;
            }
            html += `<button type="button" class="tab-btn" id="t-alarms" data-action="switch-tab" data-tab="alarms">🚨 Central de Alarmes</button>`;
            html += `<button type="button" class="tab-btn" id="t-orders" data-action="switch-tab" data-tab="orders">📋 Ordens de Serviço</button>`;
            if (currentCargo === 'CEO') {
                html += `<button type="button" class="tab-btn" id="t-audit" data-action="switch-tab" data-tab="audit">🛡️ Auditoria</button>`;
                html += `<button type="button" class="tab-btn" id="t-users" data-action="switch-tab" data-tab="users">👥 Usuários</button>`;
                html += `<button type="button" class="tab-btn" id="t-billing" data-action="switch-tab" data-tab="billing">💳 Assinatura & Billing</button>`;
                html += `<button type="button" class="tab-btn" id="t-executive" data-action="switch-tab" data-tab="executive">📈 Relatório Executivo</button>`;
                html += `<button type="button" class="tab-btn" id="t-webhooks" data-action="switch-tab" data-tab="webhooks">🔔 Webhooks</button>`;
                html += `<button type="button" class="tab-btn" id="t-demo" data-action="switch-tab" data-tab="demo" data-vg-style="static-0c95907cb51f">🎬 Demo Vendas (Simulador)</button>`;
            }
            const tabsContainer = document.getElementById('nav-tabs-container');
            if(tabsContainer) tabsContainer.innerHTML = html;
        }

        function atualizarKPIs() {
            const banner = document.getElementById('kpi-banner');
            if(!banner) return;
            const panels = Object.values(dadosGlobais).filter(panel => panel && panel.id);
            const onlinePanels = panels.filter(panel => panel.connectivity_status === 'ONLINE').length;
            const activeAlarms = alarmsData.filter(alarm => ['ACTIVE', 'ACKNOWLEDGED'].includes(alarm.status)).length;
            const openWorkOrders = workOrders.filter(order => !['CONCLUIDA', 'CANCELADA'].includes(order.status)).length;
            banner.classList.remove('is-hidden');
            banner.innerHTML = `
                <div class="kpi-card"><h4>Painéis cadastrados</h4><span>${panels.length}</span></div>
                <div class="kpi-card"><h4>Painéis online</h4><span>${onlinePanels} de ${panels.length}</span></div>
                <div class="kpi-card"><h4>Alarmes ativos</h4><span>${activeAlarms}</span></div>
                <div class="kpi-card"><h4>Ordens em aberto</h4><span>${openWorkOrders}</span></div>
            `;
        }

        function buscarDadosPainéis() {
            if(!tokenJwt) return;
            return fetch('/api/panels', {headers: {'Authorization': `Bearer ${tokenJwt}`}})
                .then(res => {
                    if (res.status === 401) {
                        if (pollingInterval) clearInterval(pollingInterval);
                        pollingInterval = null;
                        tokenJwt = '';
                        currentUser = '';
                        currentCargo = '';
                        document.getElementById('dashboard-screen').classList.add('is-hidden');
                        document.getElementById('login-screen').classList.remove('is-hidden');
                        const error = document.getElementById('error-msg');
                        if (error) error.textContent = 'Sua sessão expirou ou foi encerrada. Entre novamente.';
                        return null;
                    }
                    if (!res.ok) throw new Error('Não foi possível atualizar os dados do painel.');
                    return res.json();
                })
                .then(data => {
                    if (!data) return;
                    if(data.panels) {
                        billingData = data.billing || {};
                        const tenantDisplay = document.getElementById('tenant-display');
                        if(tenantDisplay) tenantDisplay.innerText = `Organização: ${data.tenant_id} (${billingData.plan_name})`;
                        auditLogs = data.audit_logs || [];
                        inventoryData = data.inventory || [];
                        workOrders = data.work_orders || [];
                        alarmsData = data.alarms || [];
                        const latestHistory = data.history || {};
                        Object.keys(latestHistory).forEach(panelId => {
                            const current = historyData[panelId] || [];
                            const seen = new Set(current.map(r => `${r.timestamp}|${r.temperature}|${r.current}|${r.voltage}`));
                            const merged = current.slice();
                            latestHistory[panelId].forEach(r => {
                                const key = `${r.timestamp}|${r.temperature}|${r.current}|${r.voltage}`;
                                if (!seen.has(key)) { seen.add(key); merged.push(r); }
                            });
                            merged.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
                            historyData[panelId] = merged;
                        });
                        dadosGlobais = {};
                        data.panels.forEach(p => { dadosGlobais[p.id] = p; });
                        atualizarKPIs();
                        
                        if (currentTab === 'predictive') {
                            atualizarGraficosExistentes();
                        } else if (currentTab === 'account') {
                            // A aba Minha conta contém formulários de segurança e estado MFA.
                            // O polling do painel não deve recriar esses campos nem repetir
                            // a consulta do MFA a cada ciclo de três segundos.
                        } else if (currentTab === 'rules') {
                            // A aba de regras contém um seletor e campos editáveis.
                            // Não reconstruir seu HTML durante o polling: isso apagava
                            // a seleção do painel e voltava ao primeiro item a cada 3 s.
                            // Os dados continuam sendo atualizados em memória e serão
                            // usados na próxima renderização/navegação.
                        } else if (currentTab === 'orders') {
                            // Preserve unsaved OS form values and open history panels.
                            // The list is re-rendered after an explicit create/update or tab navigation.
                        } else if (currentTab === 'audit') {
                            // Auditoria tem carregamento paginado próprio; o polling geral não deve resetar filtros nem a página atual.
                        } else if (currentTab === 'maintenance') {
                            // Não reconstruir os campos de tarefa durante a edição; a aba recarrega ao navegar ou salvar.
                        } else if (currentTab === 'devices') {
                            // Preserve o formulário e filtros; dados recarregam ao navegar ou criar/revogar credencial.
                        } else if (currentTab === 'users') {
                            // A lista de usuários tem carregamento próprio; o polling não deve redesenhá-la com dados desatualizados.
                        } else if (currentTab !== 'commission') {
                            // Não substituir formulários enquanto o usuário digita.
                            const container = document.getElementById('main-container');
                            const active = document.activeElement;
                            const editingField = container && active && container.contains(active)
                                && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
                            if (!editingField) renderizar();
                        }
                    }
                }).catch(err => console.error(err));
        }

        function iniciarPolling() {
            if (pollingInterval) clearInterval(pollingInterval);
            buscarDadosPainéis();
            pollingInterval = setInterval(buscarDadosPainéis, 3000);
        }

        async function acaoAlarme(id, action) {
            try {
                const res = await fetch(`/api/alarms/${id}/${action}`, {method:'POST', headers:{'Authorization':`Bearer ${tokenJwt}`}});
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Não foi possível atualizar o alarme.');
                await buscarDadosPainéis();
                alert(action === 'acknowledge' ? 'Alarme reconhecido.' : 'Alarme encerrado.');
            } catch (err) { alert(err.message || 'Falha ao atualizar alarme.'); }
        }

        function filtrarAlarmes() {
            alarmSearchText = document.getElementById('alarm-search')?.value || '';
            alarmStatusFilter = document.getElementById('alarm-status-filter')?.value || 'TODAS';
            alarmSeverityFilter = document.getElementById('alarm-severity-filter')?.value || 'TODAS';
            const query = alarmSearchText.toLocaleLowerCase('pt-BR').trim();
            let visibleCount = 0;
            document.querySelectorAll('[data-alarm-row]').forEach(row => {
                const matches = (!query || row.dataset.search.includes(query))
                    && (alarmStatusFilter === 'TODAS' || row.dataset.status === alarmStatusFilter)
                    && (alarmSeverityFilter === 'TODAS' || row.dataset.severity === alarmSeverityFilter);
                row.hidden = !matches;
                if (matches) visibleCount += 1;
            });
            const empty = document.getElementById('alarm-no-results');
            if (empty) empty.hidden = visibleCount !== 0;
            const count = document.getElementById('alarm-filter-count');
            if (count) count.textContent = `${visibleCount} alarme(s) exibido(s)`;
        }

        function duracaoAlarme(alarm, now = Date.now()) {
            const started = Date.parse(alarm.first_triggered_at || '');
            const ended = alarm.status === 'CLEARED' ? Date.parse(alarm.cleared_at || '') : now;
            if (!Number.isFinite(started) || !Number.isFinite(ended)) return '—';
            const minutes = Math.max(0, Math.floor((ended - started) / 60000));
            const days = Math.floor(minutes / 1440);
            const hours = Math.floor((minutes % 1440) / 60);
            const remainder = minutes % 60;
            if (days) return `${days}d ${hours}h`;
            if (hours) return `${hours}h ${remainder}min`;
            return `${remainder}min`;
        }

        async function abrirOrdemDoAlarme(id) {
            try {
                const res = await fetch(`/api/alarms/${id}/work-order`, {method:'POST', headers:{'Authorization':`Bearer ${tokenJwt}`}});
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Não foi possível abrir a ordem de serviço.');
                await buscarDadosPainéis();
                alert(data.status === 'already_exists' ? `Este alarme já está vinculado à ordem #${data.id}.` : `Ordem de serviço #${data.id} criada a partir do alarme.`);
            } catch (err) { alert(err.message || 'Falha ao abrir ordem de serviço.'); }
        }

        function mudarAba(aba) {
            if (currentTab === 'commission' && aba !== 'commission') pararLeitorCamera();
            currentTab = aba;
            ['realtime', 'account', 'commission', 'predictive', 'esg', 'inventory', 'assets', 'maintenance', 'devices', 'rules', 'alarms', 'orders', 'audit', 'users', 'billing', 'executive', 'webhooks', 'demo'].forEach(t => {
                const el = document.getElementById(`t-${t}`);
                if(el) el.className = t === aba ? 'tab-btn active' : 'tab-btn';
            });
            if (aba === 'audit') carregarAuditoria(true);
            else if (aba === 'assets') carregarAtivos();
            else if (aba === 'maintenance') carregarManutencao();
            else if (aba === 'devices') carregarDispositivos();
            else if (aba === 'users') carregarUsuariosTenant();
            else if (aba === 'orders') { renderizar(); carregarModelosChecklistOS(); }
            else renderizar();
        }

        async function consultarQR(qrCode) {
            const resultBox = document.getElementById('qr-result-box');
            if(!resultBox || !qrCode || qrLookupInProgress) return;
            qrLookupInProgress = true;
            resultBox.innerHTML = '<p role="status" data-vg-style="static-cf7295d9acfa">Consultando código…</p>';
            try {
                const res = await fetch(`/api/panels/qr/${encodeURIComponent(qrCode)}`, {
                    headers: {'Authorization': `Bearer ${tokenJwt}`}
                });
                const p = await res.json();
                if(!res.ok) throw new Error(p.detail || "Painel não encontrado.");

                resultBox.innerHTML = `
                    <div class="panel-card ${p.status === 'CRITICO' ? 'critico' : ''}" data-vg-style="static-cf7295d9acfa">
                        <h3>Cubículo Encontrado: ${escapeHtml(p.id)} - ${escapeHtml(p.name)}</h3>
                        <p><strong>Local:</strong> ${escapeHtml(p.location)}</p>
                        <p><strong>Gateway QR:</strong> ${escapeHtml(p.gateway_qr)}</p>
                        <p><strong>${escapeHtml(rotuloTensaoPainel(p))}:</strong> ${escapeHtml(p.voltage_v == null ? (p.voltage || 'Sem dado') : `${formatarMedida(p.voltage_v, 1)} V`)} | <strong>Corrente:</strong> ${escapeHtml(formatarLeituraPainel(p, 'current'))}${p.current_has_reading ? ' A' : ''}</p>
                        <p><strong>Temperatura:</strong> ${escapeHtml(formatarLeituraPainel(p, 'temperature'))}${p.temperature_has_reading ? ' °C' : ''}</p>
                        ${p.active_power_kw == null ? '' : `<p><strong>Potência ativa:</strong> ${escapeHtml(formatarMedida(p.active_power_kw, 2))} kW</p>`}
                        ${p.active_energy_kwh == null ? '' : `<p><strong>Energia acumulada:</strong> ${escapeHtml(formatarMedida(p.active_energy_kwh, 2))} kWh</p>`}
                        ${p.frequency_hz == null ? '' : `<p><strong>Frequência:</strong> ${escapeHtml(formatarMedida(p.frequency_hz, 2))} Hz</p>`}
                        ${p.power_factor == null ? '' : `<p><strong>Fator de potência:</strong> ${escapeHtml(formatarMedida(p.power_factor, 3))}</p>`}
                        <p><strong>Status operacional:</strong> ${escapeHtml(statusOperacionalPainel(p))}</p>
                        <p><strong>Conectividade:</strong> ${escapeHtml(resumirConectividade(p))}</p>
                        <p><strong>Diagnóstico:</strong> ${escapeHtml(p.recommendation)}</p>
                    </div>`;
            } catch (err) {
                resultBox.innerHTML = `<p data-vg-style="static-791a94f3f2d2">${escapeHtml(err.message)}</p>`;
            } finally {
                qrLookupInProgress = false;
            }
        }

        function pararLeitorCamera() {
            const scanner = html5QrCodeScanner;
            html5QrCodeScanner = null;
            if (qrScannerLocalizationObserver) {
                qrScannerLocalizationObserver.disconnect();
                qrScannerLocalizationObserver = null;
            }
            if (scanner) {
                qrScannerCleanup = Promise.resolve(qrScannerCleanup).catch(() => {}).then(() => scanner.clear()).catch(() => {});
            }
            return qrScannerCleanup;
        }

        function traduzirControlesLeitorQR(readerContainer) {
            const traducoes = {
                'request camera permissions': 'Ativar câmera',
                'scan an image file': 'Ler QR de uma imagem',
                'stop scanning': 'Parar leitura',
                'scan': 'Iniciar leitura',
            };
            const walker = document.createTreeWalker(readerContainer, NodeFilter.SHOW_TEXT);
            let textNode;
            while ((textNode = walker.nextNode())) {
                const original = textNode.nodeValue || '';
                const texto = original.trim().toLowerCase();
                if (traducoes[texto]) textNode.nodeValue = original.replace(original.trim(), traducoes[texto]);
            }
        }

        async function iniciarLeitorCamera() {
            await pararLeitorCamera();
            await qrScannerCleanup;
            const readerContainer = document.getElementById('reader');
            if(!readerContainer || currentTab !== 'commission') return;
            try {
                html5QrCodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 }, false);
                html5QrCodeScanner.render((decodedText) => {
                    const now = Date.now();
                    if (decodedText === lastScannedQr && now - lastScannedQrAt < 5000) return;
                    lastScannedQr = decodedText;
                    lastScannedQrAt = now;
                    const qrInput = document.getElementById('qr-input-manual');
                    if(qrInput) qrInput.value = decodedText;
                    consultarQR(decodedText);
                }, (error) => {});
                traduzirControlesLeitorQR(readerContainer);
                qrScannerLocalizationObserver = new MutationObserver(() => traduzirControlesLeitorQR(readerContainer));
                qrScannerLocalizationObserver.observe(readerContainer, {childList:true, characterData:true, subtree:true});
            } catch(e) {
                readerContainer.innerHTML = `<p data-vg-style="static-43188c225fbf">⚠️ Câmara indisponível.</p>`;
            }
        }

        async function simularFalhaComercial(id) {
            try {
                const res = await fetch('/api/demo/force-failure', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenJwt}`},
                    body: JSON.stringify({panel_id: id})
                });
                const d = await res.json();
                if (!res.ok) throw new Error(d.detail || 'Não foi possível gerar o alarme simulado.');
                await buscarDadosPainéis();
                const webhookMessage = d.webhook_delivery === 'DELIVERED'
                    ? `Webhook entregue (HTTP ${Number(d.webhook_http_status)}).`
                    : d.webhook_delivery === 'FAILED'
                        ? `A tentativa de webhook falhou${d.webhook_http_status ? ` (HTTP ${Number(d.webhook_http_status)})` : ''}. O alarme foi registrado mesmo assim.`
                        : 'Webhook não configurado; nenhum envio externo foi feito.';
                alert(`${d.message}\n${webhookMessage}\nA Central de Alarmes será aberta.`);
                mudarAba('alarms');
            } catch (err) {
                alert(err.message || 'Falha ao executar a simulação.');
            }
        }

        async function salvarWebhook(event) {
            event.preventDefault();
            const input = document.getElementById('webhook-url-input');
            const button = document.getElementById('webhook-save-button');
            const status = document.getElementById('webhook-save-status');
            const url = input.value.trim();
            button.disabled = true;
            status.textContent = 'Salvando configuração…';
            status.dataset.vgStyle = 'state-disabled';
            try {
                const res = await fetch('/api/tenant/webhook', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenJwt}`},
                    body: JSON.stringify({webhook_url: url})
                });
                const d = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(d.detail || 'Não foi possível salvar o webhook.');
                billingData.webhook_url = url;
                status.textContent = url ? 'Webhook salvo e ativo.' : 'Webhook removido e desativado.';
                status.dataset.vgStyle = 'state-configured';
                const stateLabel = document.getElementById('webhook-state-label');
                if (stateLabel) {
                    stateLabel.textContent = url ? 'Configurado' : 'Desativado';
                    stateLabel.dataset.vgStyle = url ? 'state-configured' : 'state-disabled';
                }
                const testButton = document.getElementById('webhook-test-button');
                if (testButton) testButton.disabled = !url;
            } catch (err) {
                status.textContent = err.message || 'Falha ao salvar o webhook.';
                status.dataset.vgStyle = 'metric-danger';
            } finally {
                button.disabled = false;
            }
        }

        async function testarWebhook() {
            const button = document.getElementById('webhook-test-button');
            const status = document.getElementById('webhook-test-status');
            button.disabled = true;
            status.textContent = 'Enviando evento de teste…';
            status.dataset.vgStyle = 'state-disabled';
            try {
                const res = await fetch('/api/tenant/webhook/test', {
                    method: 'POST',
                    headers: {'Authorization': `Bearer ${tokenJwt}`}
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.detail || 'Não foi possível testar o webhook.');
                const delivered = data.delivery === 'DELIVERED';
                status.textContent = delivered
                    ? `Evento entregue (HTTP ${Number(data.http_status)}).`
                    : `Entrega não confirmada${data.http_status ? ` (HTTP ${Number(data.http_status)})` : ''}. Verifique o endpoint.`;
                status.dataset.vgStyle = delivered ? 'state-configured' : 'metric-warning';
            } catch (err) {
                status.textContent = err.message || 'Falha ao testar o webhook.';
                status.dataset.vgStyle = 'metric-danger';
            } finally {
                button.disabled = !billingData.webhook_url;
            }
        }

        async function salvarRegrasTenant(event) {
            event.preventDefault();
            const maxTemp = parseFloat(document.getElementById('rule-temp-input').value);
            const maxCurr = parseFloat(document.getElementById('rule-curr-input').value);

            const res = await fetch('/api/tenant/rules', {
                method: 'POST',
                headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenJwt}`},
                body: JSON.stringify({max_temperature: maxTemp, max_current: maxCurr})
            });
            const d = await res.json();
            if(!res.ok) { alert(d.detail || 'Não foi possível salvar as regras da organização.'); return; }
            billingData.max_temperature = maxTemp;
            billingData.max_current = maxCurr;
            alert(d.message);
        }

        async function carregarRegrasPainel() {
            const selector = document.getElementById('panel-rule-select');
            if (!selector || !selector.value) return;
            const panelId = selector.value;
            const requestSequence = ++panelRuleLoadSequence;
            try {
                const res = await fetch(`/api/panels/${encodeURIComponent(panelId)}/alarm-rules`, {headers:{'Authorization': `Bearer ${tokenJwt}`}});
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Falha ao carregar regras do painel.');
                if (requestSequence !== panelRuleLoadSequence || selector.value !== panelId) return;
                document.getElementById('panel-rule-temp').value = data.max_temperature;
                document.getElementById('panel-rule-current').value = data.max_current;
                document.getElementById('panel-rule-temp-hyst').value = data.temperature_hysteresis;
                document.getElementById('panel-rule-current-hyst').value = data.current_hysteresis;
                panelRuleCustom = data.custom;
                document.getElementById('panel-rule-mode').innerText = data.custom ? 'Usando regras específicas deste painel.' : 'Usando regras padrão da organização até salvar regras específicas.';
                document.getElementById('panel-rule-reset').disabled = !data.custom;
                atualizarPreviaRegrasPainel();
            } catch (err) { alert(err.message); }
        }

        function atualizarPreviaRegrasPainel() {
            const preview = document.getElementById('panel-rule-preview');
            if (!preview) return;
            const temperature = Number(document.getElementById('panel-rule-temp')?.value);
            const current = Number(document.getElementById('panel-rule-current')?.value);
            const tempHyst = Number(document.getElementById('panel-rule-temp-hyst')?.value);
            const currentHyst = Number(document.getElementById('panel-rule-current-hyst')?.value);
            if (![temperature, current, tempHyst, currentHyst].every(Number.isFinite)) {
                preview.textContent = 'Informe valores numéricos válidos para visualizar quando os alarmes serão acionados e normalizados.';
                return;
            }
            const tempReset = temperature - tempHyst;
            const currentReset = current - currentHyst;
            preview.innerHTML = `<strong>Comportamento para os valores exibidos</strong><ul data-vg-style="static-d6252b508808"><li>Temperatura: abre quando passar de <strong>${escapeHtml(temperature)} °C</strong>; se já estiver aberto, só normaliza ao cair para <strong>${escapeHtml(tempReset)} °C</strong> ou menos.</li><li>Corrente: abre quando passar de <strong>${escapeHtml(current)} A</strong>; se já estiver aberto, só normaliza ao cair para <strong>${escapeHtml(currentReset)} A</strong> ou menos.</li></ul><small>Esses valores passam a valer após salvar. A histerese evita abre e fecha repetidos perto do limite.</small>`;
        }

        async function salvarRegrasPainel(event) {
            event.preventDefault();
            const panelId = document.getElementById('panel-rule-select').value;
            const payload = {max_temperature:Number(document.getElementById('panel-rule-temp').value), max_current:Number(document.getElementById('panel-rule-current').value), temperature_hysteresis:Number(document.getElementById('panel-rule-temp-hyst').value), current_hysteresis:Number(document.getElementById('panel-rule-current-hyst').value)};
            try {
                const res = await fetch(`/api/panels/${encodeURIComponent(panelId)}/alarm-rules`, {method:'PUT', headers:{'Content-Type':'application/json','Authorization':`Bearer ${tokenJwt}`}, body:JSON.stringify(payload)});
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Falha ao guardar regras.');
                panelRuleCustom = true;
                document.getElementById('panel-rule-mode').innerText = 'Regras específicas salvas para este painel.';
                document.getElementById('panel-rule-reset').disabled = false;
                atualizarPreviaRegrasPainel();
                alert(data.message);
            } catch (err) { alert(err.message); }
        }

        async function restaurarRegrasPainel() {
            const selector = document.getElementById('panel-rule-select');
            if (!selector || !selector.value) return;
            const panelId = selector.value;
            try {
                const res = await fetch(`/api/panels/${encodeURIComponent(panelId)}/alarm-rules`, {method:'DELETE', headers:{'Authorization':`Bearer ${tokenJwt}`}});
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Falha ao restaurar regras padrão.');
                await carregarRegrasPainel();
                alert(data.message);
            } catch (err) { alert(err.message); }
        }

        async function criarOrdemServico(event) {
            event.preventDefault();
            const dueValue = document.getElementById('os-due-at').value;
            const checklist = document.getElementById('os-checklist').value.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
            const payload = {panel_id: document.getElementById('os-panel').value, title: document.getElementById('os-title').value.trim(), priority: document.getElementById('os-priority').value, assigned_technician: document.getElementById('os-tech').value.trim() || null, description: document.getElementById('os-description').value.trim() || null, due_at: dueValue ? new Date(dueValue).toISOString() : null, checklist};
            try {
                const res = await fetch('/api/work-orders', {method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${tokenJwt}`}, body:JSON.stringify(payload)});
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Não foi possível criar a ordem.');
                alert('Ordem de serviço criada.'); await buscarDadosPainéis(); renderizar();
            } catch (err) { alert(err.message); }
        }

        async function atualizarOrdemServico(id) {
            const select = document.getElementById(`os-status-${id}`);
            if (!select) return;
            try {
                const resolution = document.getElementById(`os-resolution-${id}`)?.value.trim() || null;
                const res = await fetch(`/api/work-orders/${id}`, {method:'PATCH', headers:{'Content-Type':'application/json','Authorization':`Bearer ${tokenJwt}`}, body:JSON.stringify({status:select.value, resolution})});
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Não foi possível atualizar a ordem.');
                alert('Ordem de serviço atualizada.'); await buscarDadosPainéis(); renderizar();
            } catch (err) { alert(err.message); }
        }

        async function atualizarDadosOrdemServico(id) {
            const title = document.getElementById(`os-edit-title-${id}`)?.value.trim();
            const priority = document.getElementById(`os-edit-priority-${id}`)?.value;
            const technician = document.getElementById(`os-edit-tech-${id}`)?.value.trim() || null;
            const dueValue = document.getElementById(`os-edit-due-${id}`)?.value;
            const description = document.getElementById(`os-edit-description-${id}`)?.value || '';
            if (!title) return alert('Informe o título da ordem.');
            const payload = {title, priority, assigned_technician:technician, due_at:dueValue ? new Date(dueValue).toISOString() : null, description};
            try {
                const res = await fetch(`/api/work-orders/${Number(id)}`, {method:'PATCH', headers:{'Content-Type':'application/json','Authorization':`Bearer ${tokenJwt}`}, body:JSON.stringify(payload)});
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Não foi possível salvar os dados da ordem.');
                alert('Dados da ordem atualizados.'); await buscarDadosPainéis(); renderizar();
            } catch (err) { alert(err.message); }
        }

        function gerarRelatorioOrdem(orderId) {
            const order = workOrders.find(item => Number(item.id) === Number(orderId));
            if (!order) return alert('Não foi possível localizar esta ordem para gerar o relatório.');
            const checklist = Array.isArray(order.checklist) ? order.checklist : [];
            const events = Array.isArray(order.history) ? order.history : [];
            const checklistHtml = checklist.length
                ? checklist.map(item => `<li class="check-item"><span class="check-mark">${item.is_completed ? '☑' : '☐'}</span><span>${escapeHtml(item.label)}${item.is_completed ? `<small>Concluído por ${escapeHtml(item.completed_by || '—')} · ${escapeHtml(formatarDataHora(item.completed_at))}</small>` : '<small>Pendente</small>'}</span></li>`).join('')
                : '<li>Nenhum item de checklist registrado.</li>';
            const historyHtml = events.length
                ? events.map(event => `<article class="event"><strong>${escapeHtml(formatarDataHora(event.timestamp))}</strong><div>${escapeHtml(event.user_name)} (${escapeHtml(event.role)}) · ${escapeHtml(event.action)}</div><p>${escapeHtml(event.details)}</p>${event.resolution ? `<p><strong>Resumo:</strong> ${escapeHtml(event.resolution)}</p>` : ''}</article>`).join('')
                : '<p>Sem eventos registrados.</p>';
            const popup = window.open('', '_blank');
            if (!popup) return alert('O navegador bloqueou a janela do relatório. Permita pop-ups para este site e tente novamente.');
            popup.document.open();
            popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OS #${Number(order.id)} — VoltGuard</title><link rel="stylesheet" href="${window.location.origin}/report.css"></head><body><div class="actions"><button id="print-report-button" type="button">Imprimir / Salvar como PDF</button></div><main class="page"><header class="top"><div><div class="brand">HITECH VoltGuard</div><div class="muted">Relatório de Ordem de Serviço</div></div><div class="status">${escapeHtml(order.status)}</div></header><h1>OS #${Number(order.id)} — ${escapeHtml(order.title)}</h1><section class="meta"><div class="field"><label>Painel</label>${escapeHtml(order.panel_id)}</div><div class="field"><label>Prioridade</label>${escapeHtml(order.priority)}</div><div class="field"><label>Técnico atribuído</label>${escapeHtml(order.assigned_technician || '—')}</div><div class="field"><label>Criada em</label>${escapeHtml(formatarDataHora(order.created_at))}</div><div class="field"><label>Prazo</label>${escapeHtml(formatarDataHora(order.due_at))}</div><div class="field"><label>Início</label>${escapeHtml(formatarDataHora(order.started_at))}</div><div class="field"><label>Conclusão</label>${escapeHtml(formatarDataHora(order.completed_at))}</div></section><section class="block"><h2>Descrição</h2><p>${escapeHtml(order.description || 'Sem descrição.')}</p></section><section class="block"><h2>Checklist (${checklist.filter(item => item.is_completed).length}/${checklist.length})</h2><ul class="checklist">${checklistHtml}</ul></section><section class="block"><h2>Resumo de execução</h2><p>${escapeHtml(order.resolution || 'Ainda não registrado.')}</p></section><section class="block"><h2>Histórico de alterações</h2>${historyHtml}</section><footer class="foot">Gerado em ${escapeHtml(new Date().toLocaleString('pt-BR'))}. Relatório operacional do VoltGuard; confira os procedimentos e registros aplicáveis ao local antes de executar qualquer atividade.</footer></main></body></html>`);
            popup.document.close();
            popup.document.getElementById('print-report-button')?.addEventListener('click', () => popup.print());
        }
        async function atualizarChecklistOS(orderId, itemId, checkbox) {
            const desejado = checkbox.checked;
            checkbox.disabled = true;
            try {
                const res = await fetch(`/api/work-orders/${Number(orderId)}/checklist/${Number(itemId)}`, {method:'PATCH', headers:{'Content-Type':'application/json','Authorization':`Bearer ${tokenJwt}`}, body:JSON.stringify({is_completed:desejado})});
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Não foi possível atualizar o checklist.');
                checkbox.checked = data.is_completed;
                const order = workOrders.find(item => Number(item.id) === Number(orderId));
                const checklistItem = order?.checklist?.find(item => Number(item.id) === Number(itemId));
                if (checklistItem) {
                    checklistItem.is_completed = data.is_completed;
                    checklistItem.completed_at = data.completed_at;
                    checklistItem.completed_by = data.completed_by;
                }
                if (data.history_event && order) {
                    order.history = order.history || [];
                    order.history.push(data.history_event);
                    const details = document.querySelector(`details[data-os-history="${Number(orderId)}"]`);
                    if (details?.open) {
                        const entry = document.createElement('div');
                        entry.className = 'os-history-event';
                        const date = document.createElement('strong'); date.textContent = formatarDataHora(data.history_event.timestamp);
                        entry.append(date, document.createElement('br'));
                        entry.append(document.createTextNode(`${data.history_event.user_name} (${data.history_event.role}) · ${data.history_event.action}`), document.createElement('br'));
                        entry.append(document.createTextNode(data.history_event.details));
                        details.append(entry);
                    }
                }
                const items = order?.checklist || [];
                const done = items.filter(item => item.is_completed).length;
                const summary = checkbox.closest('details')?.querySelector('summary');
                if (summary) summary.textContent = `Checklist (${done}/${items.length})`;
            } catch (err) {
                checkbox.checked = !desejado;
                alert(err.message);
            } finally {
                checkbox.disabled = false;
            }
        }

        function definirJanelaHistorico(hours) {
            const parsed = Number(hours);
            historyWindowHours = [1, 24, 168, 0].includes(parsed) ? parsed : 168;
            Object.values(chartInstances).forEach(chart => { try { chart.destroy(); } catch (_) {} });
            chartInstances = {};
            renderizar();
        }

        function chaveAmostraHistorico(record) {
            return `${record.id ?? ''}|${record.timestamp}|${record.temperature}|${record.current}|${record.voltage_v}|${record.active_power_kw}|${record.active_energy_kwh}|${record.frequency_hz}|${record.power_factor}`;
        }

        async function carregarHistoricoPainel(panelId, carregarMais = false) {
            let state = historyPageState[panelId];
            if (!state) state = historyPageState[panelId] = {beforeId: null, hasMore: true, loading: false, initialized: false, error: ''};
            if (state.loading || (state.initialized && !carregarMais) || (carregarMais && !state.hasMore)) return;
            state.loading = true;
            state.error = '';
            atualizarControlesHistorico(panelId);
            try {
                const params = new URLSearchParams({limit:'500'});
                if (state.beforeId != null) params.set('before_id', state.beforeId);
                const page = await apiJson(`/api/telemetry/history/${encodeURIComponent(panelId)}?${params}`);
                const current = historyData[panelId] || [];
                const known = new Set(current.map(chaveAmostraHistorico));
                const added = (page.history || []).filter(record => !known.has(chaveAmostraHistorico(record)));
                historyData[panelId] = [...current, ...added].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
                state.beforeId = page.next_before_id;
                state.hasMore = Boolean(page.has_more);
                state.initialized = true;
            } catch (err) {
                state.error = err.message || 'Falha ao carregar histórico.';
            } finally {
                state.loading = false;
                atualizarControlesHistorico(panelId);
                renderizarChart(panelId);
            }
        }

        function atualizarControlesHistorico(panelId) {
            const state = historyPageState[panelId];
            const button = document.getElementById(`history-more-${panelId}`);
            if (button && state) {
                button.disabled = state.loading || !state.hasMore;
                button.textContent = state.loading ? 'Carregando…' : state.hasMore ? 'Carregar registros anteriores' : 'Todo o histórico carregado';
            }
            const status = document.getElementById(`history-status-${panelId}`);
            if (status && state?.error) status.textContent = `Não foi possível carregar mais histórico: ${state.error}`;
        }

        function renderizarChart(panelId) {
            const records = (historyData[panelId] || []).filter(r => r && r.timestamp);
            const cutoff = historyWindowHours === 0 ? 0 : Date.now() - historyWindowHours * 60 * 60 * 1000;
            const filtered = records.filter(r => {
                const time = Date.parse(r.timestamp);
                return Number.isFinite(time) && (cutoff === 0 || time >= cutoff);
            });
            const labels = filtered.map(r => {
                const time = new Date(r.timestamp);
                return Number.isNaN(time.getTime()) ? 'Data inválida' : time.toLocaleString('pt-BR');
            });
            const tempCanvas = document.getElementById(`chart-temp-${panelId}`);
            const currentCanvas = document.getElementById(`chart-current-${panelId}`);
            const powerCanvas = document.getElementById(`chart-power-${panelId}`);
            const energyCanvas = document.getElementById(`chart-energy-${panelId}`);
            const frequencyCanvas = document.getElementById(`chart-frequency-${panelId}`);
            const powerFactorCanvas = document.getElementById(`chart-power-factor-${panelId}`);
            const statusEl = document.getElementById(`history-status-${panelId}`);
            if (statusEl) {
                const state = historyPageState[panelId];
                const detail = state?.error ? ` Falha ao carregar página: ${state.error}` : '';
                statusEl.textContent = (filtered.length
                    ? `${filtered.length} amostra(s) no período selecionado.`
                    : 'Sem amostras de telemetria no período selecionado. Nenhum valor foi inventado.')
                    + (!state || state.loading && !state.initialized ? ' Consultando o histórico completo…' : state.hasMore ? ' Existem registros anteriores disponíveis.' : ' Todo o histórico foi carregado.')
                    + ' Campos sem medição permanecem vazios no histórico.' + detail;
            }
            const createOrUpdate = (canvas, key, label, field, borderColor, fillColor, unit) => {
                if (!canvas) return;
                const values = filtered.map(r => {
                    if (field === 'temperature' && r.temperature_measured === false) return null;
                    return r[field] == null || !Number.isFinite(Number(r[field])) ? null : Number(r[field]);
                });
                if (chartInstances[key]) {
                    chartInstances[key].data.labels = labels;
                    chartInstances[key].data.datasets[0].data = values;
                    chartInstances[key].update('none');
                    return;
                }
                chartInstances[key] = new Chart(canvas, {
                    type: 'line',
                    data: { labels, datasets: [{ label, data: values, borderColor, backgroundColor: fillColor, borderWidth: 2, fill: true, tension: 0.25, spanGaps: false }] },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        animation: false,
                        interaction: { mode: 'index', intersect: false },
                        plugins: { legend: { labels: { color: '#ffffff', font: { size: 10 } } }, tooltip: { callbacks: { label: item => `${item.dataset.label}: ${item.raw == null ? 'sem dado' : item.raw + ' ' + unit}` } } },
                        scales: {
                            x: { ticks: { color: '#9ca3af', maxTicksLimit: 6, font: { size: 9 } }, grid: { color: '#065f46' } },
                            y: { title: { display: true, text: unit, color: '#9ca3af' }, ticks: { color: '#9ca3af', font: { size: 9 } }, grid: { color: '#065f46' } }
                        }
                    }
                });
            };
            createOrUpdate(tempCanvas, `${panelId}:temperature`, 'Temperatura (°C)', 'temperature', '#10b981', 'rgba(16,185,129,.12)', '°C');
            createOrUpdate(currentCanvas, `${panelId}:current`, 'Corrente (A)', 'current', '#60a5fa', 'rgba(96,165,250,.12)', 'A');
            createOrUpdate(powerCanvas, `${panelId}:power`, 'Potência ativa (kW)', 'active_power_kw', '#f59e0b', 'rgba(245,158,11,.12)', 'kW');
            createOrUpdate(energyCanvas, `${panelId}:energy`, 'Energia acumulada (kWh)', 'active_energy_kwh', '#a78bfa', 'rgba(167,139,250,.12)', 'kWh');
            createOrUpdate(frequencyCanvas, `${panelId}:frequency`, 'Frequência (Hz)', 'frequency_hz', '#22d3ee', 'rgba(34,211,238,.12)', 'Hz');
            createOrUpdate(powerFactorCanvas, `${panelId}:power-factor`, 'Fator de potência', 'power_factor', '#fb7185', 'rgba(251,113,133,.12)', '');
        }

        function atualizarGraficosExistentes() {
            const lista = Object.values(dadosGlobais);
            if (!lista.length) return;

            // Os canvases reais usam chart-temp-* e chart-current-*.
            // Verificar um ID genérico fazia o polling reconstruir a aba a cada 3 s,
            // interrompendo os gráficos e causando o efeito de aparecer/desaparecer.
            const canvasesDisponiveis = lista.every(p =>
                document.getElementById(`chart-temp-${p.id}`) &&
                document.getElementById(`chart-current-${p.id}`)
            );

            if (!canvasesDisponiveis) {
                renderizar();
                return;
            }

            // Atualiza somente os dados dos gráficos existentes; não recria o DOM.
            lista.forEach(p => renderizarChart(p.id));
            lista.forEach(p => carregarHistoricoPainel(p.id));
        }

        async function apiJson(path, options = {}) {
            const headers = Object.assign({'Authorization': `Bearer ${tokenJwt}`, 'Content-Type':'application/json'}, options.headers || {});
            const response = await fetch(path, Object.assign({}, options, {headers}));
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.detail || `Erro HTTP ${response.status}`);
            return data;
        }

        async function carregarAuditoria(reset = false) {
            if (auditLoading) return;
            if (reset) {
                auditPageLogs = [];
                auditOffset = 0;
                auditTotal = 0;
                auditHasMore = false;
                auditError = '';
            }
            auditLoading = true;
            auditError = '';
            renderizar();
            const params = new URLSearchParams({limit:'100', offset:String(auditOffset)});
            Object.entries(auditFilters).forEach(([key, value]) => { if (value) params.set(key, value); });
            try {
                const data = await apiJson(`/api/audit-logs?${params.toString()}`);
                auditPageLogs = reset ? data.items : auditPageLogs.concat(data.items);
                auditActions = data.actions || auditActions;
                auditTotal = data.total || 0;
                auditOffset = auditPageLogs.length;
                auditHasMore = Boolean(data.has_more);
            } catch (err) {
                auditError = err.message || 'Não foi possível carregar a auditoria.';
            } finally {
                auditLoading = false;
                renderizar();
            }
        }

        function preencherCamposInventarioExistente() {
            const nameInput = document.getElementById('inventory-name');
            const match = inventoryData.find(item => item.part_name === (nameInput?.value || '').trim());
            if (match) {
                inventoryPrefilledItemId = match.id;
                document.getElementById('inventory-category').value = match.category || 'Elétrica';
                document.getElementById('inventory-minimum').value = match.min_threshold ?? 3;
                document.getElementById('inventory-cost').value = match.unit_cost ?? 0;
            } else if (inventoryPrefilledItemId !== null) {
                inventoryPrefilledItemId = null;
                document.getElementById('inventory-category').value = 'Elétrica';
                document.getElementById('inventory-minimum').value = 3;
                document.getElementById('inventory-cost').value = 0;
            }
        }

        async function salvarItemInventario(event) {
            event.preventDefault();
            const form = event.currentTarget;
            const payload = {
                part_name: document.getElementById('inventory-name')?.value.trim(),
                category: document.getElementById('inventory-category')?.value.trim() || 'Elétrica',
                quantity_change: Number(document.getElementById('inventory-quantity')?.value),
                min_threshold: Number(document.getElementById('inventory-minimum')?.value),
                unit_cost: Number(document.getElementById('inventory-cost')?.value),
            };
            const button = form.querySelector('button[type="submit"]');
            if (button) { button.disabled = true; button.textContent = 'Salvando…'; }
            try {
                const result = await apiJson('/api/inventory/update', {method:'POST', body:JSON.stringify(payload)});
                form.reset();
                inventoryPrefilledItemId = null;
                await buscarDadosPainéis();
                alert(result.message || 'Estoque atualizado.');
            } catch (err) {
                alert(err.message || 'Não foi possível atualizar o estoque.');
            } finally {
                if (button) { button.disabled = false; button.textContent = 'Registrar movimentação'; }
            }
        }

        function filtrarInventario() {
            const query = (document.getElementById('inventory-search')?.value || '').toLocaleLowerCase('pt-BR').trim();
            let visible = 0;
            document.querySelectorAll('[data-inventory-row]').forEach(row => {
                const matches = !query || row.dataset.search.includes(query);
                row.hidden = !matches;
                if (matches) visible += 1;
            });
            const count = document.getElementById('inventory-filter-count');
            if (count) count.textContent = `${visible} de ${inventoryData.length} item(ns)`;
        }

        function filtrarAuditoria(event) {
            event?.preventDefault();
            auditFilters = {
                search:document.getElementById('audit-search')?.value.trim() || '',
                user_name:document.getElementById('audit-user')?.value.trim() || '',
                action:document.getElementById('audit-action')?.value || '',
                date_from:document.getElementById('audit-date-from')?.value || '',
                date_to:document.getElementById('audit-date-to')?.value || '',
            };
            carregarAuditoria(true);
        }

        function limparFiltrosAuditoria() {
            auditFilters = {search:'', user_name:'', action:'', date_from:'', date_to:''};
            carregarAuditoria(true);
        }

        function atualizarSeletorModelosChecklistOS(selectedId = '') {
            const select = document.getElementById('os-checklist-template');
            if (!select) return;
            const previous = selectedId || select.value;
            select.innerHTML = `<option value="">Selecionar modelo...</option>${workOrderChecklistTemplates.map(template => `<option value="${Number(template.id)}">${escapeHtml(template.name)}</option>`).join('')}`;
            if (workOrderChecklistTemplates.some(template => Number(template.id) === Number(previous))) select.value = String(previous);
        }
        async function carregarModelosChecklistOS(selectedId = '') {
            try {
                workOrderChecklistTemplates = await apiJson('/api/work-order-checklist-templates');
                atualizarSeletorModelosChecklistOS(selectedId);
            } catch (err) { console.error('Falha ao carregar modelos de checklist:', err); }
        }
        function aplicarModeloChecklistOS(confirmarSubstituicao = true, silencioso = false) {
            const templateId = Number(document.getElementById('os-checklist-template')?.value);
            const template = workOrderChecklistTemplates.find(item => Number(item.id) === templateId);
            const field = document.getElementById('os-checklist');
            if (!template || !field) { if (!silencioso) alert('Selecione um modelo de checklist.'); return; }
            if (confirmarSubstituicao && field.value.trim() && !confirm('Substituir os itens atuais pelo conteúdo deste modelo?')) return;
            field.value = template.items.join('\n');
        }
        async function salvarModeloChecklistOS() {
            const name = document.getElementById('os-checklist-template-name')?.value.trim() || '';
            const items = document.getElementById('os-checklist')?.value.split(/\r?\n/).map(item => item.trim()).filter(Boolean) || [];
            if (!name) return alert('Informe um nome para o modelo.');
            if (!items.length) return alert('Adicione pelo menos um item ao checklist antes de salvar como modelo.');
            try {
                const template = await apiJson('/api/work-order-checklist-templates', {method:'POST', body:JSON.stringify({name, items})});
                await carregarModelosChecklistOS(template.id);
                const nameField = document.getElementById('os-checklist-template-name');
                if (nameField) nameField.value = '';
                alert('Modelo de checklist salvo para esta organização.');
            } catch (err) { alert(err.message); }
        }
        async function removerModeloChecklistOS() {
            const select = document.getElementById('os-checklist-template');
            const templateId = Number(select?.value);
            const template = workOrderChecklistTemplates.find(item => Number(item.id) === templateId);
            if (!template) return alert('Selecione o modelo que deseja remover.');
            if (!confirm(`Remover o modelo "${template.name}"? As OS já criadas não serão alteradas.`)) return;
            try {
                await apiJson(`/api/work-order-checklist-templates/${templateId}`, {method:'DELETE'});
                await carregarModelosChecklistOS();
                alert('Modelo removido.');
            } catch (err) { alert(err.message); }
        }
        async function carregarAtivos() { try { assetsData = await apiJson('/api/assets'); renderizar(); } catch(e) { alert(e.message); } }
        async function criarAtivo(event) {
            event.preventDefault();
            try { await apiJson('/api/assets', {method:'POST', body:JSON.stringify({asset_tag:document.getElementById('asset-tag').value,name:document.getElementById('asset-name').value,asset_type:document.getElementById('asset-type').value,location:document.getElementById('asset-location').value,manufacturer:document.getElementById('asset-manufacturer').value,model:document.getElementById('asset-model').value,serial_number:document.getElementById('asset-serial').value,panel_id:document.getElementById('asset-panel').value || null,notes:document.getElementById('asset-notes').value})}); alert('Ativo cadastrado.'); assetsData = await apiJson('/api/assets'); renderizar(); } catch(e) { alert(e.message); }
        }
        async function salvarAtivo(id) {
            const fields = ['asset_tag','name','asset_type','location','manufacturer','model','serial_number','panel_id','status','notes'];
            const payload = {};
            fields.forEach(field => { const input = document.getElementById(`asset-edit-${Number(id)}-${field}`); if (input) payload[field] = input.value || (field === 'panel_id' ? null : ''); });
            try {
                await apiJson(`/api/assets/${Number(id)}`, {method:'PATCH', body:JSON.stringify(payload)});
                assetEditOpen.delete(Number(id));
                assetsData = await apiJson('/api/assets');
                renderizar();
                alert('Ativo atualizado.');
            } catch(e) { alert(e.message); }
        }
        function renderizarLinhaAtivo(a, lista) {
            const id = Number(a.id);
            const status = a.status || 'ATIVO';
            const canManageAssets = ['CEO', 'Gerente'].includes(currentCargo);
            const editAction = canManageAssets ? `<button type="button" class="btn-action" data-action="toggle-asset-edit" data-asset-id="${id}">${assetEditOpen.has(id)?'Fechar edição':'Editar'}</button>` : '—';
            const row = `<tr><td>${escapeHtml(a.asset_tag)}</td><td>${escapeHtml(a.name)}</td><td>${escapeHtml(a.asset_type)}</td><td>${escapeHtml(a.location||'—')}</td><td>${escapeHtml(a.panel_id||'—')}</td><td>${escapeHtml(a.serial_number||'—')}</td><td data-vg-style="${status==='ATIVO'?'asset-status-active':status==='MANUTENCAO'?'asset-status-maintenance':'asset-status-inactive'}">${escapeHtml(status)}</td><td>${editAction}</td></tr>`;
            if (!canManageAssets) return row;
            if (!assetEditOpen.has(id)) return row;
            return row + `<tr><td colspan="8"><div data-vg-style="static-82267458c46d">
                <div class="input-group"><label>Tag / patrimônio</label><input id="asset-edit-${id}-asset_tag" value="${escapeHtml(a.asset_tag)}" maxlength="80"></div>
                <div class="input-group"><label>Nome</label><input id="asset-edit-${id}-name" value="${escapeHtml(a.name)}" maxlength="160"></div>
                <div class="input-group"><label>Tipo</label><input id="asset-edit-${id}-asset_type" value="${escapeHtml(a.asset_type)}" maxlength="80"></div>
                <div class="input-group"><label>Localização</label><input id="asset-edit-${id}-location" value="${escapeHtml(a.location||'')}" maxlength="200"></div>
                <div class="input-group"><label>Fabricante</label><input id="asset-edit-${id}-manufacturer" value="${escapeHtml(a.manufacturer||'')}" maxlength="120"></div>
                <div class="input-group"><label>Modelo</label><input id="asset-edit-${id}-model" value="${escapeHtml(a.model||'')}" maxlength="120"></div>
                <div class="input-group"><label>Número de série</label><input id="asset-edit-${id}-serial_number" value="${escapeHtml(a.serial_number||'')}" maxlength="120"></div>
                <div class="input-group"><label>Painel associado</label><select id="asset-edit-${id}-panel_id"><option value="">Nenhum</option>${lista.map(x=>`<option value="${escapeHtml(x.id)}" ${a.panel_id===x.id?'selected':''}>${escapeHtml(x.id)}</option>`).join('')}</select></div>
                <div class="input-group"><label>Estado</label><select id="asset-edit-${id}-status">${['ATIVO','MANUTENCAO','INATIVO'].map(value=>`<option value="${value}" ${status===value?'selected':''}>${value}</option>`).join('')}</select></div>
                <div class="input-group" data-vg-style="static-51377a917eb3"><label>Observações</label><textarea id="asset-edit-${id}-notes" maxlength="2000">${escapeHtml(a.notes||'')}</textarea></div>
                <button type="button" class="btn-primary" data-action="save-asset" data-asset-id="${id}">Salvar alterações</button>
            </div></td></tr>`;
        }
        async function carregarManutencao() { try { [maintenancePlans, maintenanceTasks, assetsData] = await Promise.all([apiJson('/api/maintenance/plans'),apiJson('/api/maintenance/tasks'),apiJson('/api/assets')]); renderizar(); } catch(e) { alert(e.message); } }
        async function criarPlanoManutencao(event) {
            event.preventDefault(); try { await apiJson('/api/maintenance/plans',{method:'POST',body:JSON.stringify({asset_id:Number(document.getElementById('mp-asset').value),title:document.getElementById('mp-title').value,interval_days:Number(document.getElementById('mp-interval').value),checklist:document.getElementById('mp-checklist').value})}); alert('Plano criado e primeira tarefa agendada.'); await carregarManutencao(); } catch(e) { alert(e.message); }
        }
        async function criarTarefaManutencao(event) {
            event.preventDefault();
            const dueValue = document.getElementById('mt-new-due').value;
            const payload = {
                asset_id: Number(document.getElementById('mt-new-asset').value),
                title: document.getElementById('mt-new-title').value.trim(),
                due_at: dueValue ? new Date(dueValue).toISOString() : null,
                assigned_to: document.getElementById('mt-new-assigned').value.trim() || null,
                notes: document.getElementById('mt-new-notes').value.trim(),
            };
            try {
                await apiJson('/api/maintenance/tasks', {method:'POST', body:JSON.stringify(payload)});
                event.currentTarget.reset();
                await carregarManutencao();
                alert('Tarefa avulsa agendada.');
            } catch(e) { alert(e.message || 'Não foi possível agendar a tarefa.'); }
        }
        async function atualizarTarefaManutencao(id) {
            const status = document.getElementById(`mt-status-${Number(id)}`).value;
            const assigned_to = document.getElementById(`mt-assigned-${Number(id)}`).value;
            const dueValue = document.getElementById(`mt-due-${Number(id)}`).value;
            const due_at = dueValue ? new Date(dueValue).toISOString() : null;
            try { await apiJson(`/api/maintenance/tasks/${Number(id)}`,{method:'PATCH',body:JSON.stringify({status,assigned_to,due_at})}); await carregarManutencao(); alert('Tarefa de manutenção atualizada.'); } catch(e) { alert(e.message); }
        }
        function dataHoraLocalInput(valor) {
            if (!valor) return '';
            const normalizado = /(?:Z|[+-]\d{2}:\d{2})$/.test(valor) ? valor : `${valor}Z`;
            const data = new Date(normalizado);
            return Number.isNaN(data.getTime()) ? '' : new Date(data.getTime() - data.getTimezoneOffset() * 60000).toISOString().slice(0,16);
        }
        async function carregarDispositivos() { try { deviceCredentials = await apiJson('/api/devices/credentials'); renderizar(); } catch(e) { alert(e.message); } }

        async function carregarUsuariosTenant() {
            try { tenantUsers = await apiJson('/api/users'); renderizar(); }
            catch (err) { alert(err.message || 'Não foi possível carregar os usuários.'); }
        }

        async function criarUsuarioTenant(event) {
            event.preventDefault();
            const username = document.getElementById('tenant-user-name')?.value.trim() || '';
            const password = document.getElementById('tenant-user-password')?.value || '';
            const role = document.getElementById('tenant-user-role')?.value || '';
            try {
                await apiJson('/api/users', {method:'POST', body:JSON.stringify({username, password, role})});
                await carregarUsuariosTenant();
                alert('Usuário criado. Compartilhe a senha inicial por um canal seguro. O usuário poderá trocá-la em Minha conta.');
            } catch (err) { alert(err.message || 'Não foi possível criar o usuário.'); }
        }

        async function atualizarUsuarioTenant(button) {
            const username = button.dataset.username || '';
            const role = document.getElementById(`tenant-user-role-${username}`)?.value || '';
            try {
                await apiJson(`/api/users/${encodeURIComponent(username)}`, {method:'PATCH', body:JSON.stringify({role})});
                await carregarUsuariosTenant();
            } catch (err) { alert(err.message || 'Não foi possível atualizar o perfil.'); }
        }

        async function alternarEstadoUsuarioTenant(button) {
            const username = button.dataset.username || '';
            const user = tenantUsers.find(item => item.username === username);
            if (!user) return;
            const is_active = !user.is_active;
            if (!confirm(`${is_active ? 'Reativar' : 'Desativar'} a conta de ${username}?${is_active ? '' : ' As sessões atuais serão encerradas.'}`)) return;
            try {
                await apiJson(`/api/users/${encodeURIComponent(username)}`, {method:'PATCH', body:JSON.stringify({is_active})});
                await carregarUsuariosTenant();
            } catch (err) { alert(err.message || 'Não foi possível alterar o estado da conta.'); }
        }

        async function encerrarSessoesUsuarioTenant(button) {
            const username = button.dataset.username || '';
            if (!username || !confirm(`Encerrar agora todas as sessões abertas de ${username}? O usuário precisará entrar novamente.`)) return;
            try {
                const result = await apiJson(`/api/users/${encodeURIComponent(username)}/revoke-sessions`, {method:'POST'});
                alert(result.revoked_sessions
                    ? `${result.revoked_sessions} sessão(ões) encerrada(s) para ${username}.`
                    : `Nenhuma sessão ativa foi encontrada para ${username}.`);
            } catch (err) { alert(err.message || 'Não foi possível encerrar as sessões.'); }
        }

        async function alterarMinhaSenha(event) {
            event.preventDefault();
            const form = event.currentTarget;
            const current_password = document.getElementById('account-current-password')?.value || '';
            const new_password = document.getElementById('account-new-password')?.value || '';
            const confirm_password = document.getElementById('account-confirm-password')?.value || '';
            const mfa_code = document.getElementById('account-mfa-code')?.value.trim() || '';
            const status = document.getElementById('account-password-status');
            if (new_password !== confirm_password) {
                if (status) status.textContent = 'A confirmação não corresponde à nova senha.';
                document.getElementById('account-confirm-password')?.focus();
                return;
            }
            try {
                await apiJson('/api/account/password', {
                    method:'POST', body:JSON.stringify({current_password, new_password, ...(mfa_code ? {mfa_code} : {})})
                });
                form.reset();
                if (status) status.textContent = 'Senha alterada. Redirecionando para o login…';
                tokenJwt = '';
                if (pollingInterval) clearInterval(pollingInterval);
                pollingInterval = null;
                setTimeout(() => window.location.reload(), 600);
            } catch (err) {
                const newPassword = document.getElementById('account-new-password');
                const confirmPassword = document.getElementById('account-confirm-password');
                if (newPassword) newPassword.value = '';
                if (confirmPassword) confirmPassword.value = '';
                if (status) status.textContent = err.message || 'Não foi possível alterar a senha.';
                newPassword?.focus();
            }
        }
        async function carregarStatusMfa() {
            const container = document.getElementById('mfa-management');
            if (!container) return;
            if (mfaRecoveryCodes.length) {
                definirMfaNecessarioParaTrocaSenha(true);
                container.innerHTML = `<h4>MFA ativado</h4><p>${mfaPasswordChanged ? 'Senha alterada com sucesso. ' : ''}Guarde estes códigos agora. Cada código pode ser usado uma única vez e não será mostrado novamente.</p><pre class="mfa-recovery-codes">${mfaRecoveryCodes.map(escapeHtml).join('\n')}</pre><button type="button" class="btn-action" data-action="mfa-ack-codes">${mfaPasswordChanged ? 'Guardei os códigos e sair' : 'Já guardei os códigos'}</button>`;
                return;
            }
            if (mfaSetupChallenge) {
                definirMfaNecessarioParaTrocaSenha(false);
                container.innerHTML = `<h4>Escolha sua nova senha</h4><p>O código do autenticador foi confirmado. Defina uma senha nova para concluir e ativar o MFA. Use pelo menos 12 caracteres.</p><form data-vg-submit="complete-mfa-setup"><div class="input-group"><label for="mfa-new-password">Nova senha</label><input id="mfa-new-password" type="password" autocomplete="new-password" minlength="12" maxlength="256" required></div><div class="input-group"><label for="mfa-confirm-new-password">Confirme a nova senha</label><input id="mfa-confirm-new-password" type="password" autocomplete="new-password" minlength="12" maxlength="256" required></div><button type="submit" class="btn-primary">Salvar senha e ativar MFA</button></form><p id="mfa-status-message" role="status" aria-live="polite"></p>`;
                return;
            }
            try {
                const state = await apiJson('/api/account/mfa');
                definirMfaNecessarioParaTrocaSenha(Boolean(state.enabled));
                if (mfaEnrollment) {
                    container.innerHTML = `<h4>Conclua a configuração</h4><p>Escaneie este QR Code no Microsoft Authenticator ou em outro aplicativo compatível. A configuração usa códigos TOTP de 6 dígitos com validade de 30 segundos.</p><img class="mfa-setup-qr" src="${escapeHtml(mfaEnrollment.qr_code_data_url)}" alt="QR Code privado para configurar o autenticador"><p>Se não conseguir escanear, adicione a chave manualmente: <code>${escapeHtml(mfaEnrollment.secret)}</code></p><details><summary>URI para configurar manualmente</summary><code class="mfa-setup-uri">${escapeHtml(mfaEnrollment.provisioning_uri)}</code></details><form data-vg-submit="confirm-mfa"><div class="input-group"><label for="mfa-confirm-code">Código de 6 dígitos do aplicativo</label><input id="mfa-confirm-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required></div><button type="submit" class="btn-primary">Confirmar código</button></form><p id="mfa-status-message" role="status" aria-live="polite"></p>`;
                    return;
                }
                if (state.enabled) {
                    container.innerHTML = `<h4>MFA ativo no login</h4><p>O autenticador ou um código de recuperação será pedido ao entrar e ao alterar a senha. Restam ${Number(state.recovery_codes_remaining) || 0} código(s) de recuperação.</p><form data-vg-submit="disable-mfa"><div class="input-group"><label for="mfa-disable-password">Senha atual</label><input id="mfa-disable-password" type="password" autocomplete="current-password" maxlength="256" required></div><div class="input-group"><label for="mfa-disable-code">Código MFA ou código de recuperação</label><input id="mfa-disable-code" autocomplete="one-time-code" maxlength="23" required></div><button type="submit" class="btn-action">Desativar MFA</button></form><p id="mfa-status-message" role="status" aria-live="polite"></p>`;
                } else {
                    container.innerHTML = `<h4>MFA desativado</h4><p>Ative o autenticador para proteger o login e futuras trocas de senha com uma segunda etapa.</p><form data-vg-submit="setup-mfa"><div class="input-group"><label for="mfa-setup-password">Confirme sua senha atual</label><input id="mfa-setup-password" type="password" autocomplete="current-password" maxlength="256" required></div><button type="submit" class="btn-primary">Configurar aplicativo autenticador</button></form><p id="mfa-status-message" role="status" aria-live="polite"></p>`;
                }
            } catch (err) {
                container.innerHTML = `<p role="status">Não foi possível carregar o estado do MFA: ${escapeHtml(err.message)}</p>`;
            }
        }

        function definirMfaNecessarioParaTrocaSenha(ativo) {
            const group = document.getElementById('account-mfa-code-group');
            const input = document.getElementById('account-mfa-code');
            if (!group || !input) return;
            group.classList.toggle('is-hidden', !ativo);
            input.required = Boolean(ativo);
            if (!ativo) input.value = '';
        }

        async function iniciarConfiguracaoMfa(event) {
            event.preventDefault();
            const status = document.getElementById('mfa-status-message');
            const password = document.getElementById('mfa-setup-password')?.value || '';
            try {
                mfaEnrollment = await apiJson('/api/account/mfa/setup', {method:'POST', body:JSON.stringify({password})});
                renderizar();
            } catch (err) {
                if (status) status.textContent = err.message || 'Não foi possível iniciar a configuração MFA.';
            }
        }

        async function confirmarConfiguracaoMfa(event) {
            event.preventDefault();
            const status = document.getElementById('mfa-status-message');
            const code = document.getElementById('mfa-confirm-code')?.value.trim() || '';
            try {
                const result = await apiJson('/api/account/mfa/confirm', {method:'POST', body:JSON.stringify({code})});
                mfaSetupChallenge = result.setup_challenge || '';
                mfaEnrollment = null;
                renderizar();
            } catch (err) {
                if (status) status.textContent = err.message || 'Código inválido. Confira o relógio do dispositivo e tente novamente.';
            }
        }

        async function concluirConfiguracaoMfa(event) {
            event.preventDefault();
            const status = document.getElementById('mfa-status-message');
            const new_password = document.getElementById('mfa-new-password')?.value || '';
            const confirm_password = document.getElementById('mfa-confirm-new-password')?.value || '';
            if (new_password !== confirm_password) {
                if (status) status.textContent = 'A confirmação não corresponde à nova senha.';
                document.getElementById('mfa-confirm-new-password')?.focus();
                return;
            }
            try {
                const result = await apiJson('/api/account/mfa/complete', {
                    method:'POST', body:JSON.stringify({setup_challenge:mfaSetupChallenge, new_password, confirm_password})
                });
                mfaSetupChallenge = '';
                mfaPasswordChanged = true;
                mfaRecoveryCodes = result.recovery_codes || [];
                renderizar();
            } catch (err) {
                const password = document.getElementById('mfa-new-password');
                const confirmation = document.getElementById('mfa-confirm-new-password');
                if (password) password.value = '';
                if (confirmation) confirmation.value = '';
                if (status) status.textContent = err.message || 'Não foi possível concluir a ativação do MFA.';
                password?.focus();
            }
        }

        async function encerrarSessaoAposMfa() {
            try { await apiJson('/api/logout', {method:'POST'}); } catch (_) {}
            tokenJwt = '';
            currentUser = '';
            currentCargo = '';
            mfaRecoveryCodes = [];
            mfaPasswordChanged = false;
            window.location.reload();
        }

        async function desativarMfa(event) {
            event.preventDefault();
            const status = document.getElementById('mfa-status-message');
            const password = document.getElementById('mfa-disable-password')?.value || '';
            const code = document.getElementById('mfa-disable-code')?.value.trim() || '';
            if (!confirm('Desativar MFA? Todas as sessões desta conta serão encerradas.')) return;
            try {
                await apiJson('/api/account/mfa/disable', {method:'POST', body:JSON.stringify({password, code})});
                if (status) status.textContent = 'MFA desativado. Redirecionando para o login…';
                tokenJwt = '';
                if (pollingInterval) clearInterval(pollingInterval);
                setTimeout(() => window.location.reload(), 600);
            } catch (err) {
                if (status) status.textContent = err.message || 'Não foi possível desativar o MFA.';
            }
        }

        function gerarIdPainelDemo() {
            const organizacao = (document.getElementById('tenant-display')?.innerText || 'VOLTGUARD')
                .replace(/^Organização:\s*/i, '').replace(/\s*\(.+\)$/, '')
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'VOLTGUARD';
            const sufixo = Date.now().toString(36).toUpperCase();
            return `${organizacao}-PANEL-${sufixo}`.slice(0, 100);
        }
        async function cadastrarPainelDemo(event) {
            event.preventDefault();
            const form = event.currentTarget;
            const payload = {
                id: document.getElementById('new-panel-id').value.trim().toUpperCase(),
                name: document.getElementById('new-panel-name').value.trim(),
                location: document.getElementById('new-panel-location').value.trim(),
                voltage: document.getElementById('new-panel-voltage').value.trim() || '380V AC',
                component: document.getElementById('new-panel-component').value.trim() || 'Disjuntor Principal'
            };
            const status = document.getElementById('new-panel-status');
            try {
                await apiJson('/api/panels/add', {method:'POST', body:JSON.stringify(payload)});
                await buscarDadosPainéis();
                alert(`Painel demonstrativo cadastrado. Copie este ID para o gateway:\n\n${payload.id}`);
                form.reset();
                document.getElementById('new-panel-id').value = gerarIdPainelDemo();
                renderizar();
            } catch (error) {
                status.textContent = error.message || 'Não foi possível cadastrar o painel.';
            }
        }
        function exemploTelemetriaDispositivo() {
            const panelId = document.getElementById('device-panel')?.value || 'ID_DO_PAINEL';
            const example = {
                panel_id: panelId,
                temperature: 42.5,
                current: 118.4,
                voltage: '380 V AC',
                voltage_v: 380,
                active_power_kw: 76.2,
                active_energy_kwh: 1842.7,
                frequency_hz: 60,
                power_factor: 0.96,
                gateway_qr: 'QR-GW-001'
            };
            return `POST ${window.location.origin}/api/device/telemetry\nAuthorization: Bearer SEU_TOKEN_GUARDADO\nContent-Type: application/json\n\n${JSON.stringify(example, null, 2)}`;
        }
        async function copiarExemploTelemetria() {
            const sample = document.getElementById('device-telemetry-example');
            const status = document.getElementById('device-example-copy-status');
            if (!sample || !status) return;
            try {
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(sample.textContent);
                } else {
                    const helper = document.createElement('textarea');
                    helper.value = sample.textContent;
                    helper.className = 'visually-hidden-copy';
                    document.body.append(helper); helper.select();
                    const copied = document.execCommand('copy'); helper.remove();
                    if (!copied) throw new Error('Selecione o exemplo e use Ctrl+C.');
                }
                status.textContent = 'Exemplo copiado. Substitua SEU_TOKEN_GUARDADO pelo token armazenado no seu gateway.';
            } catch (error) {
                status.textContent = error.message || 'Não foi possível copiar. Selecione o exemplo e use Ctrl+C.';
            }
        }
        function mostrarTokenDispositivo(token) {
            const anterior = document.getElementById('device-token-modal');
            if (anterior) anterior.remove();
            const overlay = document.createElement('div');
            overlay.id = 'device-token-modal';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('aria-labelledby', 'device-token-title');
            overlay.className = 'device-token-overlay';
            const card = document.createElement('div');
            card.className = 'device-token-card';
            const title = document.createElement('h2');
            title.id = 'device-token-title';
            title.textContent = 'Credencial criada — copie seu token';
            title.className = 'device-token-title';
            const warning = document.createElement('p');
            warning.textContent = 'Este token será mostrado somente agora. Copie-o e guarde-o em um cofre de segredos. Não compartilhe nem publique no GitHub.';
            warning.className = 'device-token-warning';
            const tokenField = document.createElement('textarea');
            tokenField.readOnly = true;
            tokenField.value = String(token || '');
            tokenField.setAttribute('aria-label', 'Token de telemetria');
            tokenField.rows = 3;
            tokenField.className = 'device-token-value';
            const status = document.createElement('p');
            status.setAttribute('aria-live', 'polite');
            status.className = 'device-token-status';
            const actions = document.createElement('div');
            actions.className = 'device-token-actions';
            const copyButton = document.createElement('button');
            copyButton.type = 'button';
            copyButton.textContent = 'Copiar token';
            copyButton.className = 'device-token-copy';
            copyButton.addEventListener('click', async () => {
                try {
                    if (navigator.clipboard && window.isSecureContext) {
                        await navigator.clipboard.writeText(tokenField.value);
                    } else {
                        tokenField.focus(); tokenField.select();
                        const copied = document.execCommand('copy');
                        if (!copied) throw new Error('O navegador não permitiu copiar automaticamente. Selecione o token e use Ctrl+C.');
                    }
                    status.textContent = 'Token copiado. Guarde-o em local seguro.';
                    copyButton.textContent = 'Copiado ✓';
                } catch (error) {
                    tokenField.focus(); tokenField.select();
                    status.textContent = error.message || 'Não foi possível copiar automaticamente. Selecione o token e use Ctrl+C.';
                    status.dataset.vgStyle = 'metric-warning';
                }
            });
            const closeButton = document.createElement('button');
            closeButton.type = 'button';
            closeButton.textContent = 'Já guardei — fechar';
            closeButton.className = 'device-token-close';
            closeButton.addEventListener('click', () => overlay.remove());
            actions.append(copyButton, closeButton);
            card.append(title, warning, tokenField, status, actions);
            overlay.append(card);
            overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); });
            document.body.append(overlay);
            tokenField.focus(); tokenField.select();
        }

        async function criarCredencialDispositivo(event) {
            event.preventDefault();
            try {
                const result = await apiJson('/api/devices/credentials', {method:'POST', body:JSON.stringify({panel_id:document.getElementById('device-panel').value,name:document.getElementById('device-name').value})});
                deviceCredentials = await apiJson('/api/devices/credentials');
                renderizar();
                mostrarTokenDispositivo(result.device_token);
            } catch(e) { alert(e.message); }
        }
        async function revogarDispositivo(id) { if(!confirm('Revogar esta credencial? O dispositivo deixará de enviar telemetria.')) return; try { await apiJson(`/api/devices/credentials/${Number(id)}/revoke`,{method:'POST'}); await carregarDispositivos(); } catch(e) { alert(e.message); } }

        function ordemServicoAtrasada(order, agora = Date.now()) {
            if (!order.due_at || ['CONCLUIDA', 'CANCELADA'].includes(order.status)) return false;
            const prazo = Date.parse(order.due_at);
            return Number.isFinite(prazo) && prazo < agora;
        }

        function filtrarOrdensServico() {
            const busca = (document.getElementById('os-search')?.value || '').trim().toLocaleLowerCase('pt-BR');
            const estado = document.getElementById('os-filter-status')?.value || 'TODAS';
            const origem = document.getElementById('os-filter-origin')?.value || 'TODAS';
            const somenteAtrasadas = Boolean(document.getElementById('os-filter-overdue')?.checked);
            workOrderSearchText = document.getElementById('os-search')?.value || '';
            workOrderStatusFilter = estado;
            workOrderOriginFilter = origem;
            workOrderOnlyOverdue = somenteAtrasadas;
            document.querySelectorAll('#os-table-body [data-os-row]').forEach(row => {
                const correspondeBusca = !busca || row.dataset.search.includes(busca);
                const correspondeEstado = estado === 'TODAS' || row.dataset.status === estado;
                const correspondeOrigem = origem === 'TODAS' || (origem === 'ALARME' ? row.dataset.origin === 'ALARME' : row.dataset.origin === 'MANUAL');
                const correspondePrazo = !somenteAtrasadas || row.dataset.overdue === 'true';
                row.hidden = !(correspondeBusca && correspondeEstado && correspondeOrigem && correspondePrazo);
            });
            const noResults = document.getElementById('os-no-results');
            if (noResults) noResults.hidden = document.querySelectorAll('#os-table-body [data-os-row]:not([hidden])').length > 0;
        }

        function renderizar() {
            const container = document.getElementById('main-container');
            if(!container) return;

            if (currentTab === 'account') {
                container.innerHTML = `<section class="user-management-card account-security-card"><h3>🔐 Segurança da conta</h3><p>Usuário: <strong>${escapeHtml(currentUser)}</strong> · Perfil: <strong>${escapeHtml(currentCargo)}</strong></p><p>Use uma senha exclusiva com pelo menos 12 caracteres. Ao alterá-la, todas as sessões abertas desta conta serão encerradas.</p><form class="account-password-form" data-vg-submit="change-password"><div class="input-group"><label for="account-current-password">Senha atual</label><input id="account-current-password" type="password" autocomplete="current-password" maxlength="256" required></div><div class="input-group"><label for="account-new-password">Nova senha</label><input id="account-new-password" type="password" autocomplete="new-password" minlength="12" maxlength="256" required></div><div class="input-group"><label for="account-confirm-password">Confirme a nova senha</label><input id="account-confirm-password" type="password" autocomplete="new-password" minlength="12" maxlength="256" required></div><div class="input-group is-hidden" id="account-mfa-code-group"><label for="account-mfa-code">Código do autenticador ou de recuperação</label><input id="account-mfa-code" autocomplete="one-time-code" maxlength="23" placeholder="Código MFA"></div><button type="submit" class="btn-primary">Alterar senha</button><p id="account-password-status" role="status" aria-live="polite"></p></form><section class="mfa-account-section"><h3>📲 Autenticação em dois fatores</h3><div id="mfa-management" role="region" aria-live="polite"><p>Carregando configuração MFA…</p></div></section></section>`;
                carregarStatusMfa();
                return;
            }
            const lista = Object.values(dadosGlobais);

            if (currentTab === 'assets') {
                const filteredAssets = assetsData.filter(a => {
                    const query = assetSearchText.trim().toLowerCase();
                    const matchesQuery = !query || [a.asset_tag,a.name,a.asset_type,a.location,a.manufacturer,a.model,a.serial_number,a.panel_id].some(value => String(value || '').toLowerCase().includes(query));
                    return matchesQuery && (assetStatusFilter === 'TODOS' || (a.status || 'ATIVO') === assetStatusFilter);
                });
                const assetPanels = lista.map(x=>`<option value="${escapeHtml(x.id)}">${escapeHtml(x.id)}</option>`).join('');
                const activeAssetCount = assetsData.filter(a => (a.status || 'ATIVO') === 'ATIVO').length;
                const maintenanceAssetCount = assetsData.filter(a => a.status === 'MANUTENCAO').length;
                const linkedAssetCount = assetsData.filter(a => a.panel_id).length;
                const assetRows = filteredAssets.map(a => renderizarLinhaAtivo(a, lista)).join('')
                    || `<tr><td colspan="8">${assetsData.length ? 'Nenhum ativo corresponde aos filtros selecionados.' : 'Nenhum ativo cadastrado. Preencha o formulário para começar.'}</td></tr>`;
                container.innerHTML = `<div data-vg-style="static-193448d00075">
                    <h3 data-vg-style="static-4303eeffcdf9">🏷️ Cadastro e gestão de ativos</h3>
                    <div class="os-overview">
                        <div class="os-overview-card"><span>Ativos cadastrados</span><strong>${assetsData.length}</strong></div>
                        <div class="os-overview-card"><span>Em operação</span><strong>${activeAssetCount}</strong></div>
                        <div class="os-overview-card"><span>Em manutenção</span><strong data-vg-style="${maintenanceAssetCount ? 'metric-warning' : 'metric-normal'}">${maintenanceAssetCount}</strong></div>
                        <div class="os-overview-card"><span>Vinculados a painéis</span><strong>${linkedAssetCount} de ${assetsData.length}</strong></div>
                    </div>
                    <form data-vg-submit="criarAtivo" data-vg-style="static-b8da16db9528">
                        <div class="input-group"><label for="asset-tag">Tag / patrimônio</label><input id="asset-tag" required maxlength="80"></div>
                        <div class="input-group"><label for="asset-name">Nome do ativo</label><input id="asset-name" required maxlength="160"></div>
                        <div class="input-group"><label for="asset-type">Tipo</label><select id="asset-type"><option>PAINEL_ELETRICO</option><option>MOTOR</option><option>INVERSOR</option><option>TRANSFORMADOR</option><option>MEDIDOR</option><option>OUTRO</option></select></div>
                        <div class="input-group"><label for="asset-location">Localização</label><input id="asset-location" maxlength="200"></div>
                        <div class="input-group"><label for="asset-manufacturer">Fabricante</label><input id="asset-manufacturer" maxlength="120"></div>
                        <div class="input-group"><label for="asset-model">Modelo</label><input id="asset-model" maxlength="120"></div>
                        <div class="input-group"><label for="asset-serial">Número de série</label><input id="asset-serial" maxlength="120"></div>
                        <div class="input-group"><label for="asset-panel">Painel associado</label><select id="asset-panel"><option value="">Nenhum</option>${assetPanels}</select></div>
                        <div class="input-group" data-vg-style="static-51377a917eb3"><label for="asset-notes">Observações</label><textarea id="asset-notes" maxlength="2000"></textarea></div>
                        <button class="btn-primary" type="submit">Cadastrar ativo</button>
                    </form>
                    <h4>Ativos cadastrados (${filteredAssets.length} de ${assetsData.length})</h4>
                    <div data-vg-style="static-03286a93516d">
                        <div class="input-group"><label for="asset-search">Buscar ativo</label><input id="asset-search" value="${escapeHtml(assetSearchText)}" placeholder="Tag, nome, tipo, local ou série" data-vg-change="update-asset-search"></div>
                        <button type="button" class="btn-action" data-action="search-assets">Buscar</button>
                        <div class="input-group"><label>Estado</label><select data-vg-change="filter-asset-status"><option value="TODOS" ${assetStatusFilter==='TODOS'?'selected':''}>Todos os estados</option><option value="ATIVO" ${assetStatusFilter==='ATIVO'?'selected':''}>ATIVO</option><option value="MANUTENCAO" ${assetStatusFilter==='MANUTENCAO'?'selected':''}>MANUTENCAO</option><option value="INATIVO" ${assetStatusFilter==='INATIVO'?'selected':''}>INATIVO</option></select></div>
                    </div>
                    <div data-vg-style="static-1b1d75452fbb"><table class="enterprise-table"><thead><tr><th>Tag</th><th>Nome</th><th>Tipo</th><th>Local</th><th>Painel</th><th>Série</th><th>Estado</th><th>Ação</th></tr></thead><tbody>${assetRows}</tbody></table></div>
                </div>`;
                return;
            }
            if (currentTab === 'maintenance') {
                const now = Date.now();
                const overdueTask = t => !['CONCLUIDA','CANCELADA'].includes(t.status) && new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(t.due_at||'') ? t.due_at : `${t.due_at||''}Z`).getTime() < now;
                const filteredTasks = maintenanceTasks.filter(t => {
                    const query = maintenanceSearchText.trim().toLowerCase();
                    const matchesQuery = !query || [t.asset_name,t.title,t.assigned_to,t.status].some(value => String(value || '').toLowerCase().includes(query));
                    return matchesQuery && (maintenanceStatusFilter === 'TODOS' || t.status === maintenanceStatusFilter) && (!maintenanceOnlyOverdue || overdueTask(t));
                });
                const taskRows = filteredTasks.map(t => {
                    const terminal = ['CONCLUIDA','CANCELADA'].includes(t.status);
                    return `<tr>
                        <td data-vg-style="${overdueTask(t)?'text-danger':'text-inherit'}">${overdueTask(t)?'ATRASADA · ':''}${formatarDataHora(t.due_at)}</td>
                        <td>${escapeHtml(t.asset_name||t.asset_id)}</td>
                        <td>${escapeHtml(t.title)}<details data-vg-style="static-301647f5065e"><summary>Ver checklist / observações</summary><small data-vg-style="static-092af903b212">${escapeHtml(t.notes||'Sem checklist ou observações registradas.')}</small></details></td>
                        <td><input id="mt-assigned-${Number(t.id)}" value="${escapeHtml(t.assigned_to||'')}" maxlength="120" placeholder="Responsável"></td>
                        <td><select id="mt-status-${Number(t.id)}" ${terminal?'disabled title="Tarefa finalizada; reabertura não permitida."':''}>${['PENDENTE','EM_ANDAMENTO','CONCLUIDA','CANCELADA'].map(s=>`<option value="${s}" ${t.status===s?'selected':''}>${s}</option>`).join('')}</select>${terminal?'<small data-vg-style="static-e9905a77430a">Estado final</small>':''}</td>
                        <td>${t.completed_at?formatarDataHora(t.completed_at):'—'}</td>
                        <td><input id="mt-due-${Number(t.id)}" type="datetime-local" value="${dataHoraLocalInput(t.due_at)}"><button type="button" class="btn-action" data-action="update-maintenance-task" data-task-id="${Number(t.id)}">Salvar</button></td>
                    </tr>`;
                }).join('') || `<tr><td colspan="7">${maintenanceTasks.length?'Nenhuma tarefa corresponde aos filtros selecionados.':'Nenhuma tarefa agendada.'}</td></tr>`;
                const assetOptions = assetsData.map(a=>`<option value="${Number(a.id)}">${escapeHtml(a.asset_tag)} — ${escapeHtml(a.name)}</option>`).join('');
                const taskCounters = [['PENDENTES',maintenanceTasks.filter(t=>t.status==='PENDENTE').length],['EM ANDAMENTO',maintenanceTasks.filter(t=>t.status==='EM_ANDAMENTO').length],['ATRASADAS',maintenanceTasks.filter(overdueTask).length],['CONCLUÍDAS',maintenanceTasks.filter(t=>t.status==='CONCLUIDA').length]];
                container.innerHTML = `<div data-vg-style="static-193448d00075">
                    <h3 data-vg-style="static-4303eeffcdf9">🧰 Manutenção Preventiva</h3>
                    <div class="os-overview">${taskCounters.map(([label,count])=>`<div class="os-overview-card"><span>${label}</span><strong data-vg-style="${label==='ATRASADAS'&&count?'metric-danger':'metric-normal'}">${count}</strong></div>`).join('')}</div>
                    <h4>Criar plano recorrente</h4>
                    <form data-vg-submit="criarPlanoManutencao" data-vg-style="static-fc22463955e6">
                        <div class="input-group"><label for="mp-asset">Ativo</label><select id="mp-asset" required>${assetOptions}</select></div>
                        <div class="input-group"><label for="mp-title">Nome do plano</label><input id="mp-title" required maxlength="180" placeholder="Inspeção trimestral"></div>
                        <div class="input-group"><label for="mp-interval">Periodicidade (dias)</label><input id="mp-interval" type="number" min="1" max="3650" value="30" required></div>
                        <div class="input-group" data-vg-style="static-51377a917eb3"><label for="mp-checklist">Checklist (separe os itens por ponto e vírgula)</label><textarea id="mp-checklist" maxlength="4000">Inspeção visual;Verificar conexões;Registrar observações</textarea></div>
                        <button class="btn-primary" type="submit" ${assetsData.length?'':'disabled'}>Criar plano e agendar primeira tarefa</button>
                    </form>
                    <h4>Agendar tarefa avulsa</h4>
                    <form data-vg-submit="criarTarefaManutencao" data-vg-style="static-fc22463955e6">
                        <div class="input-group"><label for="mt-new-asset">Ativo</label><select id="mt-new-asset" required>${assetOptions}</select></div>
                        <div class="input-group"><label for="mt-new-title">Tarefa</label><input id="mt-new-title" maxlength="180" required placeholder="Ex.: Inspecionar conexão"></div>
                        <div class="input-group"><label for="mt-new-due">Prazo</label><input id="mt-new-due" type="datetime-local" required></div>
                        <div class="input-group"><label for="mt-new-assigned">Responsável</label><input id="mt-new-assigned" maxlength="120"></div>
                        <div class="input-group" data-vg-style="static-51377a917eb3"><label for="mt-new-notes">Checklist / observações</label><textarea id="mt-new-notes" maxlength="4000" placeholder="Procedimentos, verificações e observações da tarefa"></textarea></div>
                        <button class="btn-primary" type="submit" ${assetsData.length?'':'disabled'}>Agendar tarefa avulsa</button>
                    </form>
                    ${assetsData.length?'':'<p>Cadastre um ativo antes de agendar manutenção.</p>'}
                    <h4>Planos recorrentes</h4>
                    <div data-vg-style="static-1b1d75452fbb"><table class="enterprise-table"><thead><tr><th>Ativo</th><th>Plano</th><th>Periodicidade</th><th>Checklist</th><th>Próxima execução</th></tr></thead><tbody>${maintenancePlans.map(p=>`<tr><td>${escapeHtml(p.asset_name||p.asset_id)}</td><td>${escapeHtml(p.title)}</td><td>${Number(p.interval_days)} dias</td><td>${escapeHtml(p.checklist||'—')}</td><td>${formatarDataHora(p.next_due_at)}</td></tr>`).join('')||'<tr><td colspan="5">Nenhum plano recorrente cadastrado.</td></tr>'}</tbody></table></div>
                    <h4>Tarefas (${filteredTasks.length} de ${maintenanceTasks.length})</h4>
                    <div class="os-filters"><div class="input-group"><label for="maintenance-search">Buscar</label><input id="maintenance-search" value="${escapeHtml(maintenanceSearchText)}" placeholder="Ativo, tarefa ou responsável" data-vg-change="update-maintenance-search"></div>
                        <button type="button" class="btn-action" data-action="search-maintenance">Buscar</button>
                        <div class="input-group"><label>Estado</label><select data-vg-change="filter-maintenance-status"><option value="TODOS" ${maintenanceStatusFilter==='TODOS'?'selected':''}>Todos os estados</option>${['PENDENTE','EM_ANDAMENTO','CONCLUIDA','CANCELADA'].map(s=>`<option value="${s}" ${maintenanceStatusFilter===s?'selected':''}>${s}</option>`).join('')}</select></div>
                        <label><input type="checkbox" ${maintenanceOnlyOverdue?'checked':''} data-vg-change="filter-maintenance-overdue"> Somente atrasadas</label>
                    </div>
                    <div data-vg-style="static-1b1d75452fbb"><table class="enterprise-table"><thead><tr><th>Prazo</th><th>Ativo</th><th>Tarefa / detalhes</th><th>Responsável</th><th>Estado</th><th>Conclusão</th><th>Ação</th></tr></thead><tbody>${taskRows}</tbody></table></div>
                </div>`;
                return;
            }
            if (currentTab === 'devices') {
                const filteredCredentials = deviceCredentials.filter(d => {
                    const query = deviceSearchText.trim().toLowerCase();
                    const matchesQuery = !query || [d.name,d.panel_id].some(value => String(value || '').toLowerCase().includes(query));
                    return matchesQuery && (devicePanelFilter === 'TODOS' || d.panel_id === devicePanelFilter)
                        && (deviceStatusFilter === 'TODOS' || (deviceStatusFilter === 'REVOGADA' ? d.revoked : !d.revoked));
                });
                const activeCredentials = deviceCredentials.filter(d => !d.revoked).length;
                const unusedCredentials = deviceCredentials.filter(d => !d.revoked && !d.last_used_at).length;
                const revokedCredentials = deviceCredentials.filter(d => d.revoked).length;
                const panelIdDefault = gerarIdPainelDemo();
                container.innerHTML = `<div data-vg-style="static-193448d00075"><h3 data-vg-style="static-4303eeffcdf9">🔑 Credenciais de Telemetria por Dispositivo</h3><p>O token é exibido somente uma vez. Guarde-o num cofre de segredos; não o publique no frontend.</p><div data-vg-style="static-d6af650bb715">${[['ATIVAS',activeCredentials],['SEM USO',unusedCredentials],['REVOGADAS',revokedCredentials]].map(([label,count])=>`<div data-vg-style="static-f55e039d0393"><small>${label}</small><strong data-vg-style="static-9f1e0c6c4e91">${count}</strong></div>`).join('')}</div>${lista.length?'':`<section data-vg-style="static-9f08327a77f4"><h3 data-vg-style="static-8d28e72a95b3">Cadastrar painel demonstrativo</h3><p>Esta organização ainda não tem painéis. Cadastre um painel fictício para preparar a configuração do gateway; isso não representa equipamento real.</p><form data-vg-submit="cadastrarPainelDemo" data-vg-style="static-fc22463955e6"><div class="input-group"><label for="new-panel-id">ID do painel</label><input id="new-panel-id" value="${escapeHtml(panelIdDefault)}" maxlength="100" pattern="[A-Za-z0-9_-]+" required></div><div class="input-group"><label for="new-panel-name">Nome</label><input id="new-panel-name" value="Painel de teste — DEMO" maxlength="200" required></div><div class="input-group"><label for="new-panel-location">Local</label><input id="new-panel-location" value="Ambiente simulado" maxlength="200" required></div><div class="input-group"><label for="new-panel-voltage">Tensão</label><input id="new-panel-voltage" value="380V AC" maxlength="80"></div><div class="input-group"><label for="new-panel-component">Componente monitorado</label><input id="new-panel-component" value="Disjuntor principal" maxlength="160"></div><button class="btn-primary" type="submit">Cadastrar painel demonstrativo</button></form><p id="new-panel-status" aria-live="polite" data-vg-style="static-bf2699b70d44"></p></section>`}<form data-vg-submit="criarCredencialDispositivo" data-vg-style="static-fc22463955e6"><div class="input-group"><label>Painel autorizado</label><select id="device-panel" required data-vg-change="refresh-device-example">${lista.length?lista.map(x=>`<option value="${escapeHtml(x.id)}">${escapeHtml(x.id)} — ${escapeHtml(x.name)}</option>`).join(''):'<option value="" selected disabled>Nenhum painel cadastrado</option>'}</select></div><div class="input-group"><label>Nome da credencial</label><input id="device-name" maxlength="120" required placeholder="Gateway sala elétrica"></div><button class="btn-primary" type="submit" ${lista.length?'':'disabled'}>Criar credencial</button></form><p>Endpoint de ingestão: <code>POST /api/device/telemetry</code>. O token deve ser enviado no cabeçalho <code>Authorization: Bearer …</code>, pelo gateway.</p><details data-vg-style="static-d0fd22aac602"><summary data-vg-style="static-d20f7e4975c3">Guia rápido de integração</summary><p>Envie uma requisição HTTP POST com o ID do painel e ao menos uma grandeza numérica. Temperatura, corrente, tensão, potência ativa, energia acumulada, frequência e fator de potência são aceitos. Temperatura e corrente só criam ou normalizam seus alarmes quando incluídas na leitura. O token é segredo do dispositivo; mantenha-o no gateway e fora do navegador, do código-fonte e dos registros.</p><pre id="device-telemetry-example" data-vg-style="static-c1386a63ff19">${escapeHtml(exemploTelemetriaDispositivo())}</pre><button type="button" class="btn-action" data-action="copy-telemetry-example">Copiar exemplo HTTP</button><p id="device-example-copy-status" aria-live="polite" data-vg-style="static-e1d2a65ace9e"></p><small>Temperatura: −50 a 250 °C; corrente: 0 a 100.000 A. Tensão e identificador do gateway são opcionais.</small></details><h4>Credenciais (${filteredCredentials.length} de ${deviceCredentials.length})</h4><div data-vg-style="static-03286a93516d"><div class="input-group"><label>Buscar</label><input id="device-search" value="${escapeHtml(deviceSearchText)}" placeholder="Nome ou painel" data-vg-change="update-device-search"></div><button type="button" class="btn-action" data-action="search-devices">Buscar</button><div class="input-group"><label>Painel</label><select data-vg-change="filter-device-panel"><option value="TODOS" ${devicePanelFilter==='TODOS'?'selected':''}>Todos os painéis</option>${[...new Set(deviceCredentials.map(d=>d.panel_id))].map(panel=>`<option value="${escapeHtml(panel)}" ${devicePanelFilter===panel?'selected':''}>${escapeHtml(panel)}</option>`).join('')}</select></div><div class="input-group"><label>Estado</label><select data-vg-change="filter-device-status"><option value="TODOS" ${deviceStatusFilter==='TODOS'?'selected':''}>Todos os estados</option><option value="ATIVA" ${deviceStatusFilter==='ATIVA'?'selected':''}>Ativas</option><option value="REVOGADA" ${deviceStatusFilter==='REVOGADA'?'selected':''}>Revogadas</option></select></div></div><div data-vg-style="static-1b1d75452fbb"><table class="enterprise-table"><tr><th>Nome</th><th>Painel</th><th>Criada em</th><th>Último uso</th><th>Estado</th><th>Ação</th></tr>${filteredCredentials.map(d=>`<tr><td>${escapeHtml(d.name)}</td><td>${escapeHtml(d.panel_id)}</td><td>${formatarDataHora(d.created_at)}</td><td>${d.last_used_at?formatarDataHora(d.last_used_at):'Nunca utilizada'}</td><td>${d.revoked?'REVOGADA':'ATIVA'}</td><td>${d.revoked?'—':`<button type="button" class="btn-action" data-action="revoke-device-credential" data-credential-id="${Number(d.id)}">Revogar</button>`}</td></tr>`).join('')}</table>${filteredCredentials.length?'':'<p>Nenhuma credencial corresponde aos filtros selecionados.</p>'}</div></div>`;
                return;
            }

            if (currentTab === 'users') {
                const rows = tenantUsers.map(user => {
                    const isSelf = user.username === currentUser;
                    const roleControl = user.role === 'CEO'
                        ? '<span>CEO</span>'
                        : `<select id="tenant-user-role-${escapeHtml(user.username)}" aria-label="Perfil de ${escapeHtml(user.username)}"><option value="Gerente" ${user.role==='Gerente'?'selected':''}>Gerente</option><option value="Técnico de Campo" ${user.role==='Técnico de Campo'?'selected':''}>Técnico de Campo</option></select> <button type="button" class="btn-action" data-action="save-tenant-user-role" data-username="${escapeHtml(user.username)}">Salvar perfil</button>`;
                    const stateAction = user.role === 'CEO' || isSelf ? '—' : `<button type="button" class="btn-action" data-action="toggle-tenant-user" data-username="${escapeHtml(user.username)}">${user.is_active?'Desativar':'Reativar'}</button>`;
                    const sessionsAction = user.role !== 'CEO' && !isSelf && user.is_active
                        ? `<button type="button" class="btn-action" data-action="revoke-tenant-user-sessions" data-username="${escapeHtml(user.username)}">Encerrar sessões</button>`
                        : '—';
                    return `<tr><td>${escapeHtml(user.username)}${isSelf?' (você)':''}</td><td>${roleControl}</td><td>${user.is_active?'ATIVA':'DESATIVADA'}</td><td>${stateAction}<br>${sessionsAction}</td></tr>`;
                }).join('');
                container.innerHTML = `<section class="user-management-card"><h3>👥 Usuários da organização</h3><p>Contas são isoladas por organização. Apenas o CEO pode criar, alterar perfil e desativar usuários. O CEO inicial não pode ser desativado nesta tela.</p><form class="user-create-form" data-vg-submit="create-tenant-user"><div class="input-group"><label for="tenant-user-name">Nome de usuário</label><input id="tenant-user-name" maxlength="120" pattern="[A-Za-z0-9_.-]{3,120}" autocomplete="off" required></div><div class="input-group"><label for="tenant-user-password">Senha inicial (mínimo 12 caracteres)</label><input id="tenant-user-password" type="password" minlength="12" maxlength="256" autocomplete="new-password" required></div><div class="input-group"><label for="tenant-user-role">Perfil</label><select id="tenant-user-role" required><option value="Gerente">Gerente</option><option value="Técnico de Campo">Técnico de Campo</option></select></div><button type="submit" class="btn-primary">Criar usuário</button></form><div class="user-management-table-wrap"><table class="enterprise-table"><thead><tr><th>Usuário</th><th>Perfil</th><th>Estado</th><th>Acesso</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Nenhum usuário encontrado.</td></tr>'}</tbody></table></div></section>`;
                return;
            }

            if (currentTab !== 'predictive') { chartInstances = {}; }

            if (currentTab === 'commission') {
                container.innerHTML = `
                    <div data-vg-style="static-f691882e54df">
                        <h3 data-vg-style="static-4893d804f30c">📷 Consulta de painel por QR Code</h3>
                        <p data-vg-style="static-6d0af102348d">Leia o QR do gateway usando a câmera ou selecione uma imagem com o código. Se preferir, informe o código ou ID do painel abaixo. A câmera é opcional e pode pedir autorização do navegador.</p>
                        <form data-vg-submit="consult-qr" data-vg-style="static-3c4a3d440074">
                            <div class="input-group"><label for="qr-input-manual">Código QR / ID do painel</label><input type="text" id="qr-input-manual" maxlength="160" placeholder="Ex: QR-GW-0010" required></div>
                            <button type="submit" class="btn-primary">Consultar painel</button>
                        </form>
                        <div id="reader" data-vg-style="static-461d11ccd11d"></div>
                        <div id="qr-result-box"></div>
                    </div>`;
                setTimeout(() => { iniciarLeitorCamera(); }, 200);
                return;
            }

            if (currentTab === 'demo') {
                container.innerHTML = `
                    <div data-vg-style="static-f1bda7ed6173">
                        <h3 data-vg-style="static-55c0840455c1">🎬 Simulação de falha crítica</h3>
                        <p data-vg-style="static-6d0af102348d">Registra alarmes demonstrativos e tenta enviar um webhook se houver endpoint configurado. O resultado da entrega será informado após a ação; uma falha externa não desfaz o alarme:</p>
                        <div data-vg-style="static-b1eedbcacd42">
                            ${lista.map(p => `
                                <div data-vg-style="static-5ec15f0c49b9">
                                    <h4 data-vg-style="static-987330981b8c">${escapeHtml(p.id)} -${escapeHtml(p.name)}</h4>
                                    <p data-vg-style="static-651f10dd3974">Status: ${escapeHtml(p.status)}</p>
                                    <button type="button" class="btn-action" data-vg-style="static-495e290204ce" data-action="force-failure" data-panel-id="${escapeHtml(p.id)}">⚡ Disparar Alarme Crítico</button>
                                </div>
                            `).join('')}
                        </div>
                    </div>`;
                return;
            }

            if (currentTab === 'webhooks') {
                const webhookConfigured = Boolean(billingData.webhook_url);
                container.innerHTML = `
                    <div data-vg-style="static-62863a260c5a">
                        <h3 data-vg-style="static-4893d804f30c">🔔 Webhook para alertas críticos</h3>
                        <p data-vg-style="static-6d0af102348d">Estado: <strong id="webhook-state-label" data-vg-style="${webhookConfigured ? 'state-configured' : 'state-disabled'}">${webhookConfigured ? 'Configurado' : 'Desativado'}</strong></p>
                        <p data-vg-style="static-6d0af102348d">No momento, o envio acontece quando a ação de simular falha crítica é executada. O endpoint deve ser HTTPS público. Deixe o campo vazio e salve para desativar.</p>
                        <form data-vg-submit="salvarWebhook" data-vg-style="static-9afdabaccbc9">
                            <div class="input-group"><label for="webhook-url-input">Endpoint URL</label><input type="url" id="webhook-url-input" maxlength="2048" placeholder="https://exemplo.com/webhook" value="${escapeHtml(billingData.webhook_url || '')}"></div>
                            <button id="webhook-save-button" type="submit" class="btn-primary" data-vg-style="static-3b6fad0b298d">Salvar configuração</button>
                            <p id="webhook-save-status" role="status" aria-live="polite" data-vg-style="static-63d609018306"></p>
                            <button id="webhook-test-button" type="button" class="btn-primary" data-vg-style="static-3b6fad0b298d" data-action="test-webhook" ${webhookConfigured ? '' : 'disabled'}>Enviar evento de teste</button>
                            <p id="webhook-test-status" role="status" aria-live="polite" data-vg-style="static-63d609018306">${webhookConfigured ? 'O teste não cria alarmes; o resultado será registrado na auditoria.' : 'Salve um endpoint para habilitar o teste.'}</p>
                        </form>
                    </div>`;
                return;
            }

            if (currentTab === 'billing') {
                const maxPanels = Number(billingData.max_panels);
                const currentPanels = Object.values(dadosGlobais).filter(panel => panel && panel.id).length;
                const hasPanelLimit = Number.isFinite(maxPanels) && maxPanels >= 0;
                const remainingPanels = hasPanelLimit ? Math.max(0, maxPanels - currentPanels) : null;
                const panelUsagePercent = hasPanelLimit && maxPanels > 0 ? Math.min(100, Math.round(currentPanels / maxPanels * 100)) : 0;
                const expiresAt = billingData.expires_at ? formatarDataHora(billingData.expires_at) : 'Não informada';
                container.innerHTML = `
                    <div data-vg-style="static-62863a260c5a">
                        <h3 data-vg-style="static-4893d804f30c">💳 Assinatura e Dados de Faturação (Billing)</h3>
                        <p data-vg-style="static-6d0af102348d">Resumo do plano e da utilização atual da organização.</p>
                        <div data-vg-style="static-925cc7ef1c93">
                            <p><strong>Plano:</strong> ${escapeHtml(billingData.plan_name || 'Não informado')}</p>
                            <p><strong>Estado:</strong> <span data-vg-style="static-df8aa9a1b94b">${escapeHtml(billingData.status || 'Não informado')}</span></p>
                            <p><strong>Renovação/expiração:</strong> ${escapeHtml(expiresAt)}</p>
                            <p><strong>Painéis cadastrados:</strong> ${currentPanels}${hasPanelLimit ? ` de ${maxPanels}` : ''}</p>
                            ${hasPanelLimit ? `<div role="progressbar" aria-label="Uso do limite de painéis" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${panelUsagePercent}" data-vg-style="static-c2a5046df7cd"><div class="usage-meter-fill usage-meter-width-${panelUsagePercent}"></div></div><p>${remainingPanels} ${remainingPanels === 1 ? 'painel disponível' : 'painéis disponíveis'} no limite atual.</p>` : '<p>Limite de painéis não informado.</p>'}
                        </div>
                        <p data-vg-style="static-5b1f236569eb">Ambiente de demonstração: pagamentos, alteração de plano e cancelamento não são processados nesta tela.</p>
                    </div>`;
                return;
            }

            if (currentTab === 'executive') {
                container.innerHTML = `
                    <div data-vg-style="static-62863a260c5a">
                        <h3 data-vg-style="static-4893d804f30c">📈 Relatório Executivo Operacional</h3>
                        <p data-vg-style="static-6d0af102348d">Exporte um retrato da organização em uma pasta de trabalho Excel formatada, com abas separadas para resumo, painéis, alarmes, ordens de serviço, ativos, manutenção e estoque. As tabelas têm filtros, cabeçalhos destacados e colunas ajustadas. Os dados refletem o momento da exportação.</p>
                        <p data-vg-style="static-c028f172c14a">Relatório operacional demonstrativo; não certifica conformidade com NR-10 ou outras normas.</p>
                        <button type="button" class="btn-primary" data-vg-style="static-cf7295d9acfa" data-action="download-report">📥 Descarregar relatório executivo (.xlsx)</button>
                    </div>`;
                return;
            }

            if (currentTab === 'rules') {
                container.innerHTML = `
                    <div data-vg-style="static-62863a260c5a">
                        <h3 data-vg-style="static-4893d804f30c">⚙️ Configuração do Motor de Regras por Organização</h3>
                        <p data-vg-style="static-6d0af102348d">Defina os limiares de segurança térmica que acionam o estado CRÍTICO em toda a frota.</p>
                        <form data-vg-submit="salvarRegrasTenant" data-vg-style="static-9afdabaccbc9">
                            <div class="input-group"><label>Temperatura Máxima de Alerta (°C)</label><input type="number" step="0.1" min="0.1" max="250" id="rule-temp-input" value="${billingData.max_temperature || 85.0}" required></div>
                            <div class="input-group"><label>Corrente Máxima de Alerta (A)</label><input type="number" step="0.1" min="0.1" max="100000" id="rule-curr-input" value="${billingData.max_current || 500.0}" required></div>
                            <button type="submit" class="btn-primary" data-vg-style="static-3b6fad0b298d">Guardar Regras da Organização</button>
                        </form>
                        <hr data-vg-style="static-d2f1193b37fa">
                        <h3 data-vg-style="static-df8aa9a1b94b">Regras específicas por painel</h3>
                        <p data-vg-style="static-bbfd7d233bbf">Regras específicas substituem os limites padrão da organização. A histerese reduz abertura e fechamento repetidos quando as leituras oscilam perto do limite.</p>
                        <form data-vg-submit="salvarRegrasPainel" data-vg-style="static-cf7295d9acfa">
                            <div class="input-group"><label for="panel-rule-select">Painel</label><select id="panel-rule-select" data-vg-change="load-panel-rules" required>${Object.values(dadosGlobais).filter(p => p && p.id).map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name || p.id)} — ${escapeHtml(p.id)}</option>`).join('') || '<option value="" selected disabled>Nenhum painel disponível</option>'}</select></div>
                            <div class="input-group"><label>Temperatura máxima (°C)</label><input type="number" step="0.1" min="0.1" max="250" id="panel-rule-temp" value="85" data-vg-input="preview-panel-rules" required></div>
                            <div class="input-group"><label>Corrente máxima (A)</label><input type="number" step="0.1" min="0.1" max="100000" id="panel-rule-current" value="500" data-vg-input="preview-panel-rules" required></div>
                            <div class="input-group"><label>Histerese de temperatura (°C)</label><input type="number" step="0.1" min="0" id="panel-rule-temp-hyst" value="3" data-vg-input="preview-panel-rules" required></div>
                            <div class="input-group"><label>Histerese de corrente (A)</label><input type="number" step="0.1" min="0" id="panel-rule-current-hyst" value="10" data-vg-input="preview-panel-rules" required></div>
                            <p id="panel-rule-mode" data-vg-style="static-9411b6b19e8c">Selecione um painel para carregar as regras.</p>
                            <div id="panel-rule-preview" aria-live="polite" data-vg-style="static-3eeb0e65bfbc">Carregando os limites e a histerese efetivos deste painel…</div>
                            <button type="submit" class="btn-primary" data-vg-style="static-726e8b317f32">Salvar regras deste painel</button>
                            <button type="button" id="panel-rule-reset" class="btn-action" data-vg-style="static-726e8b317f32" data-action="restore-panel-rules" disabled>Restaurar padrões da organização</button>
                        </form>
                    </div>`;
                setTimeout(() => carregarRegrasPainel(), 0);
                return;
            }

            if (currentTab === 'alarms') {
                const openCount = alarmsData.filter(a => a.status !== 'CLEARED').length;
                const activeCount = alarmsData.filter(a => a.status === 'ACTIVE').length;
                const acknowledgedCount = alarmsData.filter(a => a.status === 'ACKNOWLEDGED').length;
                const closedCount = alarmsData.filter(a => a.status === 'CLEARED').length;
                const filteredAlarms = alarmsData.filter(a => {
                    const query = alarmSearchText.toLocaleLowerCase('pt-BR').trim();
                    const text = [a.panel_id, a.alarm_type, a.severity, a.message, a.acknowledged_by].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
                    return (!query || text.includes(query))
                        && (alarmStatusFilter === 'TODAS' || a.status === alarmStatusFilter)
                        && (alarmSeverityFilter === 'TODAS' || a.severity === alarmSeverityFilter);
                });
                container.innerHTML = `<div data-vg-style="static-370b3cb5604e">
                  <h3 data-vg-style="static-9c38dde7ed06">🚨 Central de Alarmes</h3>
                  <p>Alarmes são gerados a partir da telemetria recebida e dos limites configurados. A duração conta desde a primeira ocorrência; alarmes abertos continuam contando até serem encerrados.</p>
                  <div data-vg-style="static-d64df4483d57">${[['ATIVOS',activeCount],['RECONHECIDOS',acknowledgedCount],['ENCERRADOS',closedCount],['EM ABERTO',openCount]].map(([label,count])=>`<div data-vg-style="static-f55e039d0393"><small>${label}</small><strong class="metric-number ${label==='ATIVOS'&&count?'metric-danger':'metric-normal'}">${count}</strong></div>`).join('')}</div>
                  <div class="os-filters"><div class="input-group"><label for="alarm-search">Buscar alarme</label><input id="alarm-search" value="${escapeHtml(alarmSearchText)}" data-vg-input="filter-alarms" placeholder="Painel, tipo ou mensagem"></div><div class="input-group"><label for="alarm-status-filter">Estado</label><select id="alarm-status-filter" data-vg-change="filter-alarms"><option value="TODAS" ${alarmStatusFilter==='TODAS'?'selected':''}>Todos os estados</option><option value="ACTIVE" ${alarmStatusFilter==='ACTIVE'?'selected':''}>Ativo</option><option value="ACKNOWLEDGED" ${alarmStatusFilter==='ACKNOWLEDGED'?'selected':''}>Reconhecido</option><option value="CLEARED" ${alarmStatusFilter==='CLEARED'?'selected':''}>Encerrado</option></select></div><div class="input-group"><label for="alarm-severity-filter">Severidade</label><select id="alarm-severity-filter" data-vg-change="filter-alarms"><option value="TODAS" ${alarmSeverityFilter==='TODAS'?'selected':''}>Todas</option><option value="CRITICAL" ${alarmSeverityFilter==='CRITICAL'?'selected':''}>Crítica</option></select></div><span id="alarm-filter-count">${filteredAlarms.length} alarme(s) exibido(s)</span></div>
                  <div data-vg-style="static-fbff25e9fc50"><table class="enterprise-table"><tr><th>Primeira ocorrência</th><th>Última ocorrência</th><th>Duração</th><th>Painel</th><th>Tipo</th><th>Severidade</th><th>Mensagem</th><th>Estado</th><th>Ações</th></tr>
                  ${filteredAlarms.map(a => `<tr data-alarm-row data-status="${escapeHtml(a.status)}" data-severity="${escapeHtml(a.severity)}" data-search="${escapeHtml([a.panel_id, a.alarm_type, a.severity, a.message, a.acknowledged_by].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR'))}"><td>${escapeHtml(formatarDataHora(a.first_triggered_at))}</td><td>${escapeHtml(formatarDataHora(a.last_triggered_at))}</td><td>${escapeHtml(duracaoAlarme(a))}</td><td>${escapeHtml(a.panel_id)}</td><td>${escapeHtml(a.alarm_type)}</td><td>${escapeHtml(a.severity)}</td><td>${escapeHtml(a.message)}</td><td>${escapeHtml(a.status)}${a.acknowledged_by ? `<br><small>Por ${escapeHtml(a.acknowledged_by)}</small>` : ''}${a.acknowledged_at ? `<br><small>Reconhecido em ${escapeHtml(formatarDataHora(a.acknowledged_at))}</small>` : ''}${a.cleared_at ? `<br><small>Encerrado em ${escapeHtml(formatarDataHora(a.cleared_at))}</small>` : ''}</td><td>${a.work_order_id ? `<span>OS #${Number(a.work_order_id)}</span>` : (a.status !== 'CLEARED' && ['CEO','Gerente','Técnico de Campo'].includes(currentCargo) ? `<button type="button" class="btn-primary" data-action="open-order-from-alarm" data-alarm-id="${Number(a.id)}">Abrir OS</button>` : '')} ${a.status === 'ACTIVE' && ['CEO','Gerente','Técnico de Campo'].includes(currentCargo) ? `<button type="button" class="btn-primary" data-action="acknowledge-alarm" data-alarm-id="${Number(a.id)}">Reconhecer</button>` : ''} ${a.status !== 'CLEARED' && ['CEO','Gerente','Técnico de Campo'].includes(currentCargo) ? `<button type="button" class="btn-primary" data-action="clear-alarm" data-alarm-id="${Number(a.id)}">Encerrar</button>` : ''}</td></tr>`).join('') || (alarmsData.length ? '' : '<tr><td colspan="9">Nenhum alarme registrado. Ao receber telemetria fora dos limites, os alarmes aparecerão aqui.</td></tr>')}
                  </table><p id="alarm-no-results" ${alarmsData.length && !filteredAlarms.length ? '' : 'hidden'}>Nenhum alarme corresponde aos filtros selecionados.</p></div></div>`;
                return;
            }

            if (currentTab === 'inventory') {
                const belowMinimum = inventoryData.filter(i => Number(i.quantity_in_stock) < Number(i.min_threshold)).length;
                const stockValue = inventoryData.reduce((sum, i) => sum + Number(i.quantity_in_stock || 0) * Number(i.unit_cost || 0), 0);
                const money = value => Number(value || 0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
                container.innerHTML = `<section data-vg-style="static-3ea8e22c3813">
                    <h3 data-vg-style="static-2a43bc62729a">📦 Gestão de Inventário e Almoxarifado</h3>
                    <div class="os-overview">
                        <div class="os-overview-card"><span>Itens cadastrados</span><strong>${inventoryData.length}</strong></div>
                        <div class="os-overview-card"><span>Abaixo do estoque mínimo</span><strong data-vg-style="${belowMinimum ? 'metric-danger' : 'metric-normal'}">${belowMinimum}</strong></div>
                        <div class="os-overview-card"><span>Valor estimado em estoque</span><strong>${money(stockValue)}</strong></div>
                    </div>
                    <form data-vg-submit="salvarItemInventario" data-vg-style="static-455163eebd66">
                        <div class="input-group" data-vg-style="static-ab79ea2b8573"><label for="inventory-name">Item</label><input id="inventory-name" maxlength="160" required placeholder="Ex.: Disjuntor 60 A" data-vg-input="fill-existing-inventory"></div>
                        <div class="input-group" data-vg-style="static-ab79ea2b8573"><label for="inventory-category">Categoria</label><input id="inventory-category" maxlength="120" value="Elétrica"></div>
                        <div class="input-group" data-vg-style="static-ab79ea2b8573"><label for="inventory-quantity">Ajuste de quantidade</label><input id="inventory-quantity" type="number" step="1" min="-100000" max="100000" required value="1" aria-describedby="inventory-quantity-help"></div>
                        <div class="input-group" data-vg-style="static-ab79ea2b8573"><label for="inventory-minimum">Estoque mínimo</label><input id="inventory-minimum" type="number" step="1" min="0" max="100000" required value="3"></div>
                        <div class="input-group" data-vg-style="static-ab79ea2b8573"><label for="inventory-cost">Custo unitário (R$)</label><input id="inventory-cost" type="number" step="0.01" min="0" max="100000000" required value="0"></div>
                        <button type="submit" class="btn-primary" data-vg-style="static-da982660a1d2">Registrar movimentação</button>
                        <small id="inventory-quantity-help" data-vg-style="static-e8696ccd3f08">Use quantidade positiva para entrada e negativa para saída. Para atualizar um item existente, informe o mesmo nome cadastrado.</small>
                    </form>
                    <div class="os-filters"><div class="input-group" data-vg-style="static-ab79ea2b8573"><label for="inventory-search">Buscar item</label><input id="inventory-search" data-vg-input="filter-inventory" placeholder="Nome ou categoria"></div><span id="inventory-filter-count">${inventoryData.length} de ${inventoryData.length} item(ns)</span></div>
                    <div data-vg-style="static-fbff25e9fc50"><table class="enterprise-table"><thead><tr><th>Item</th><th>Categoria</th><th>Quantidade</th><th>Mínimo</th><th>Custo unitário</th><th>Valor em estoque</th><th>Estado</th></tr></thead>
                        <tbody>${inventoryData.map(i => {
                            const quantity = Number(i.quantity_in_stock || 0);
                            const minimum = Number(i.min_threshold || 0);
                            const unitCost = Number(i.unit_cost || 0);
                            const low = quantity < minimum;
                            const search = `${i.part_name || ''} ${i.category || ''}`.toLocaleLowerCase('pt-BR');
                            return `<tr data-inventory-row data-search="${escapeHtml(search)}"><td>${escapeHtml(i.part_name)}</td><td>${escapeHtml(i.category)}</td><td>${quantity}</td><td>${minimum}</td><td>${money(unitCost)}</td><td>${money(quantity * unitCost)}</td><td data-vg-style="${low ? 'inventory-low' : 'inventory-ok'}">${low ? 'ABAIXO DO MÍNIMO' : 'REGULAR'}</td></tr>`;
                        }).join('') || '<tr><td colspan="7">Nenhum item cadastrado. Use o formulário para registrar o estoque inicial.</td></tr>'}</tbody>
                    </table></div>
                    <p data-vg-style="static-b24868868a0d">O valor em estoque é uma estimativa calculada pela quantidade atual multiplicada pelo custo unitário informado.</p>
                </section>`;
                return;
            }

            if (currentTab === 'realtime') {
                container.innerHTML = lista.map(p => `
                    <div class="panel-card ${p.status === 'CRITICO' ? 'critico' : ''}">
                        <h3>${escapeHtml(p.id)} - ${escapeHtml(p.name)}</h3>
                        <p><strong>Local:</strong> ${escapeHtml(p.location)}</p>
                        <p><strong>Gateway QR:</strong> ${escapeHtml(p.gateway_qr)}</p>
                        <p><strong>${escapeHtml(rotuloTensaoPainel(p))}:</strong> ${escapeHtml(p.voltage_v == null ? (p.voltage || 'Sem dado') : `${formatarMedida(p.voltage_v, 1)} V`)} | <strong>Corrente:</strong> ${escapeHtml(formatarLeituraPainel(p, 'current'))}${p.current_has_reading ? ' A' : ''}</p>
                        <p><strong>Temperatura:</strong> ${escapeHtml(formatarLeituraPainel(p, 'temperature'))}${p.temperature_has_reading ? ' °C' : ''}</p>
                        ${p.active_power_kw == null ? '' : `<p><strong>Potência ativa:</strong> ${escapeHtml(formatarMedida(p.active_power_kw, 2))} kW</p>`}
                        ${p.active_energy_kwh == null ? '' : `<p><strong>Energia acumulada:</strong> ${escapeHtml(formatarMedida(p.active_energy_kwh, 2))} kWh</p>`}
                        ${p.frequency_hz == null ? '' : `<p><strong>Frequência:</strong> ${escapeHtml(formatarMedida(p.frequency_hz, 2))} Hz</p>`}
                        ${p.power_factor == null ? '' : `<p><strong>Fator de potência:</strong> ${escapeHtml(formatarMedida(p.power_factor, 3))}</p>`}
                        <p><strong>Status operacional:</strong> ${escapeHtml(statusOperacionalPainel(p))}</p>
                        <p><strong>Conectividade:</strong> ${escapeHtml(resumirConectividade(p))}</p>
                    </div>`).join('');
            } else if (currentTab === 'predictive') {
                container.innerHTML = `<div data-vg-style="static-b718b6694ed2">
                    <strong>Período do histórico:</strong>
                    <select aria-label="Período do histórico" data-vg-change="set-history-window" data-vg-style="static-a766043ac854">
                        <option value="1" ${historyWindowHours===1?'selected':''}>Última hora</option>
                        <option value="24" ${historyWindowHours===24?'selected':''}>Últimas 24 horas</option>
                        <option value="168" ${historyWindowHours===168?'selected':''}>Últimos 7 dias</option>
                        <option value="0" ${historyWindowHours===0?'selected':''}>Todo o histórico carregado</option>
                    </select>
                    <span data-vg-style="static-765becb77e44">Gráficos usam apenas amostras registradas. O painel carrega até 500 amostras por dispositivo.</span>
                </div>` + lista.map(p => `
                    <div class="panel-card ${p.status === 'CRITICO' ? 'critico' : ''}">
                        <h3>📈 Histórico de telemetria — ${escapeHtml(p.id)}</h3>
                        <p><strong>Componente:</strong> ${escapeHtml(p.component)}</p>
                        <p id="history-status-${escapeHtml(p.id)}" data-vg-style="static-89b3bc41743d">Carregando amostras...</p>
                        <button type="button" id="history-more-${escapeHtml(p.id)}" data-action="load-panel-history" data-panel-id="${escapeHtml(p.id)}" data-vg-style="static-f95cd371f584">Carregar registros anteriores</button>
                        <div data-vg-style="static-280052cd7fa2"><canvas id="chart-temp-${escapeHtml(p.id)}" aria-label="Histórico de temperatura do painel ${escapeHtml(p.id)}"></canvas></div>
                        <div data-vg-style="static-86816ffa2691"><canvas id="chart-current-${escapeHtml(p.id)}" aria-label="Histórico de corrente do painel ${escapeHtml(p.id)}"></canvas></div>
                        <div data-vg-style="static-86816ffa2691"><canvas id="chart-power-${escapeHtml(p.id)}" aria-label="Histórico de potência ativa do painel ${escapeHtml(p.id)}"></canvas></div>
                        <div data-vg-style="static-86816ffa2691"><canvas id="chart-energy-${escapeHtml(p.id)}" aria-label="Histórico de energia acumulada do painel ${escapeHtml(p.id)}"></canvas></div>
                        <div data-vg-style="static-86816ffa2691"><canvas id="chart-frequency-${escapeHtml(p.id)}" aria-label="Histórico de frequência do painel ${escapeHtml(p.id)}"></canvas></div>
                        <div data-vg-style="static-86816ffa2691"><canvas id="chart-power-factor-${escapeHtml(p.id)}" aria-label="Histórico do fator de potência do painel ${escapeHtml(p.id)}"></canvas></div>
                        <p><strong>Última tensão recebida:</strong> ${escapeHtml(p.voltage ?? 'Sem dado')}</p>
                        <p><strong>Última tensão numérica:</strong> ${p.voltage_v == null ? 'Sem dado' : `${escapeHtml(formatarMedida(p.voltage_v, 1))} V`}</p>
                        <p><strong>Última potência ativa:</strong> ${p.active_power_kw == null ? 'Sem dado' : `${escapeHtml(formatarMedida(p.active_power_kw, 2))} kW`}</p>
                        <p><strong>Última energia acumulada:</strong> ${p.active_energy_kwh == null ? 'Sem dado' : `${escapeHtml(formatarMedida(p.active_energy_kwh, 2))} kWh`}</p>
                        <p><strong>Última frequência:</strong> ${p.frequency_hz == null ? 'Sem dado' : `${escapeHtml(formatarMedida(p.frequency_hz, 2))} Hz`}</p>
                        <p><strong>Último fator de potência:</strong> ${p.power_factor == null ? 'Sem dado' : escapeHtml(formatarMedida(p.power_factor, 3))}</p>
                        <p data-vg-style="static-ac44bfc7d750">${escapeHtml(p.recommendation)}</p>
                    </div>`).join('');
                setTimeout(() => {
                    lista.forEach(p => {
                        renderizarChart(p.id);
                        carregarHistoricoPainel(p.id);
                        atualizarControlesHistorico(p.id);
                    });
                }, 50);
            } else if (currentTab === 'esg') {
                const estimates = lista.map(p => ({
                    panel: p,
                    value: p.esg_waste_kwh == null || p.esg_waste_kwh === '' || !Number.isFinite(Number(p.esg_waste_kwh))
                        ? null : Number(p.esg_waste_kwh)
                }));
                const availableEstimates = estimates.filter(item => item.value !== null);
                const totalEstimate = availableEstimates.reduce((sum, item) => sum + item.value, 0);
                container.innerHTML = `<section data-vg-style="static-3ea8e22c3813">
                    <h3 data-vg-style="static-b6bcbb798691">🌱 Indicadores ESG demonstrativos</h3>
                    <p data-vg-style="static-5c58cfcd5413">Estimativas informativas cadastradas por painel. Não são medições de consumo, cálculo de emissões ou indicadores auditados.</p>
                    <div class="os-overview">
                        <div class="os-overview-card"><span>Painéis na organização</span><strong>${lista.length}</strong></div>
                        <div class="os-overview-card"><span>Estimativas disponíveis</span><strong>${availableEstimates.length} de ${lista.length}</strong></div>
                        <div class="os-overview-card"><span>Soma das estimativas</span><strong>${formatarMedida(totalEstimate)} kWh/dia</strong></div>
                    </div>
                    <div data-vg-style="static-fa4a9f6a3d61">
                        <table class="enterprise-table">
                            <thead><tr><th>Painel</th><th>Local</th><th>Estimativa informada</th><th>Observação</th></tr></thead>
                            <tbody>${estimates.map(({panel, value}) => `<tr>
                                <td>${escapeHtml(panel.id)} — ${escapeHtml(panel.name)}</td>
                                <td>${escapeHtml(panel.location || '—')}</td>
                                <td>${value === null ? 'Sem estimativa cadastrada' : `${escapeHtml(formatarMedida(value))} kWh/dia`}</td>
                                <td>${value === null ? 'Dado indisponível' : 'Valor demonstrativo; confirmar origem antes de uso operacional'}</td>
                            </tr>`).join('') || '<tr><td colspan="4">Nenhum painel cadastrado.</td></tr>'}</tbody>
                        </table>
                    </div>
                </section>`;
            } else if (currentTab === 'orders') {
                const overdueCount = workOrders.filter(w => ordemServicoAtrasada(w)).length;
                const openCount = workOrders.filter(w => !['CONCLUIDA', 'CANCELADA'].includes(w.status)).length;
                const inProgressCount = workOrders.filter(w => w.status === 'EM_ANDAMENTO').length;
                const completedCount = workOrders.filter(w => w.status === 'CONCLUIDA').length;
                const alarmOriginCount = workOrders.filter(w => w.alarm_id).length;
                container.innerHTML = `
                    <div data-vg-style="static-5ce313828479"><h3 data-vg-style="static-9c38dde7ed06">📋 Gestão de Ordens de Serviço</h3>
                    <div class="os-overview"><div class="os-overview-card"><span>Ordens em aberto</span><strong>${openCount}</strong></div><div class="os-overview-card"><span>Em andamento</span><strong>${inProgressCount}</strong></div><div class="os-overview-card"><span>Atrasadas</span><strong data-vg-style="${overdueCount ? 'metric-danger' : 'metric-normal'}">${overdueCount}</strong></div><div class="os-overview-card"><span>Concluídas</span><strong>${completedCount}</strong></div><div class="os-overview-card"><span>Originadas de alarmes</span><strong>${alarmOriginCount}</strong></div></div>
                    <form data-vg-submit="criarOrdemServico" data-vg-style="static-1058606e2a0e">
                      <div class="input-group"><label>Painel</label><select id="os-panel" required>${lista.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.id)} — ${escapeHtml(p.name)}</option>`).join('')}</select></div>
                      <div class="input-group"><label>Título</label><input id="os-title" maxlength="200" required></div>
                      <div class="input-group"><label>Prioridade</label><select id="os-priority"><option>BAIXA</option><option>MEDIA</option><option selected>ALTA</option><option>CRITICA</option></select></div>
                      <div class="input-group"><label>Técnico atribuído</label><input id="os-tech" maxlength="120"></div>
                      <div class="input-group"><label>Prazo (opcional)</label><input id="os-due-at" type="datetime-local"></div>
                      <div class="input-group" data-vg-style="static-51377a917eb3"><label>Descrição</label><input id="os-description" maxlength="4000"></div>
                      <div class="input-group" data-vg-style="static-51377a917eb3"><label>Modelo de checklist</label><div data-vg-style="static-14bb9141330a"><select id="os-checklist-template" data-vg-change="apply-checklist-preview" data-vg-style="static-42636e83b671"><option value="">Selecionar modelo...</option></select><button type="button" class="btn-action" data-action="apply-checklist-template">Usar modelo</button>${['CEO','Gerente'].includes(currentCargo) ? '<input id="os-checklist-template-name" maxlength="120" placeholder="Nome do novo modelo" data-vg-style="static-5a5048952d24"><button type="button" class="btn-action" data-action="save-checklist-template">Salvar checklist como modelo</button><button type="button" class="btn-action" data-action="remove-checklist-template">Remover selecionado</button>' : ''}</div></div>
                      <div class="input-group" data-vg-style="static-51377a917eb3"><label>Checklist (opcional, um item por linha; até 20)</label><textarea id="os-checklist" maxlength="5000" rows="3" placeholder="Ex.: Inspecionar visualmente\nVerificar conexões\nRegistrar medições"></textarea></div>
                      <button class="btn-primary" type="submit">Criar ordem de serviço</button>
                    </form>
                    <div class="os-filters"><div class="input-group"><label for="os-search">Buscar OS</label><input id="os-search" value="${escapeHtml(workOrderSearchText)}" data-vg-input="filter-work-orders" placeholder="Painel, título, técnico ou alarme"></div><div class="input-group"><label for="os-filter-status">Estado</label><select id="os-filter-status" data-vg-change="filter-work-orders"><option value="TODAS" ${workOrderStatusFilter==='TODAS'?'selected':''}>Todos os estados</option><option value="ABERTA" ${workOrderStatusFilter==='ABERTA'?'selected':''}>Aberta</option><option value="EM_ANDAMENTO" ${workOrderStatusFilter==='EM_ANDAMENTO'?'selected':''}>Em andamento</option><option value="AGUARDANDO_PECA" ${workOrderStatusFilter==='AGUARDANDO_PECA'?'selected':''}>Aguardando peça</option><option value="CONCLUIDA" ${workOrderStatusFilter==='CONCLUIDA'?'selected':''}>Concluída</option><option value="CANCELADA" ${workOrderStatusFilter==='CANCELADA'?'selected':''}>Cancelada</option></select></div><div class="input-group"><label for="os-filter-origin">Origem</label><select id="os-filter-origin" data-vg-change="filter-work-orders"><option value="TODAS" ${workOrderOriginFilter==='TODAS'?'selected':''}>Todas as origens</option><option value="ALARME" ${workOrderOriginFilter==='ALARME'?'selected':''}>Criada de alarme</option><option value="MANUAL" ${workOrderOriginFilter==='MANUAL'?'selected':''}>Criada manualmente</option></select></div><label><input id="os-filter-overdue" type="checkbox" ${workOrderOnlyOverdue?'checked':''} data-vg-change="filter-work-orders"> Somente atrasadas</label></div>
                    <div data-vg-style="static-a825de92443e"><table class="enterprise-table"><thead><tr><th>ID</th><th>Painel</th><th>Título</th><th>Prioridade</th><th>Estado</th><th>Técnico</th><th>Prazo</th><th>Início</th><th>Conclusão</th><th>Checklist</th><th>Resumo de execução</th><th>Ação</th><th>Histórico</th></tr></thead><tbody id="os-table-body">
                    ${workOrders.map(w => {
                        const events = Array.isArray(w.history) ? w.history : [];
                        const checklist = Array.isArray(w.checklist) ? w.checklist : [];
                        const checklistDone = checklist.filter(item => item.is_completed).length;
                        const orderId = String(Number(w.id));
                        const terminal = ['CONCLUIDA', 'CANCELADA'].includes(w.status);
                        const overdue = ordemServicoAtrasada(w);
                        const origin = w.alarm_id ? 'ALARME' : 'MANUAL';
                        const search = [w.panel_id, w.title, w.assigned_technician, w.alarm_id ? `alarme #${w.alarm_id}` : 'manual'].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
                        const checklistHtml = checklist.length
                            ? checklist.map(item => `<label class="os-checklist-item"><input type="checkbox" ${item.is_completed ? 'checked' : ''} ${terminal ? 'disabled' : ''} data-vg-change="update-checklist-item" data-order-id="${Number(w.id)}" data-checklist-item-id="${Number(item.id)}"><span>${escapeHtml(item.label)}${item.is_completed ? `<small>Concluído por ${escapeHtml(item.completed_by || '—')} em ${escapeHtml(formatarDataHora(item.completed_at))}</small>` : ''}</span></label>`).join('')
                            : '<span>Sem itens de checklist</span>';
                        return `<tr data-os-row data-status="${escapeHtml(w.status)}" data-origin="${origin}" data-overdue="${overdue}" data-search="${escapeHtml(search)}"><td>${escapeHtml(w.id)}</td><td>${escapeHtml(w.panel_id)}</td><td>${escapeHtml(w.title)}${w.alarm_id ? `<br><small data-vg-style="static-383cae387b10">Origem: Alarme #${Number(w.alarm_id)}</small>` : ''}<details class="os-edit" data-os-edit="${orderId}" ${workOrderEditOpen.has(orderId) ? 'open' : ''}><summary>Editar dados</summary><div class="os-edit-fields"><label>Título<input id="os-edit-title-${Number(w.id)}" maxlength="200" value="${escapeHtml(w.title)}"></label><label>Prioridade<select id="os-edit-priority-${Number(w.id)}"><option ${w.priority==='BAIXA'?'selected':''}>BAIXA</option><option ${['MEDIA','MÉDIA'].includes(w.priority)?'selected':''}>MEDIA</option><option ${w.priority==='ALTA'?'selected':''}>ALTA</option><option ${['CRITICA','CRÍTICA'].includes(w.priority)?'selected':''}>CRITICA</option></select></label><label>Técnico<input id="os-edit-tech-${Number(w.id)}" maxlength="120" value="${escapeHtml(w.assigned_technician || '')}"></label><label>Prazo<input id="os-edit-due-${Number(w.id)}" type="datetime-local" value="${dataParaInputLocal(w.due_at)}"></label><label>Descrição<textarea id="os-edit-description-${Number(w.id)}" maxlength="4000">${escapeHtml(w.description || '')}</textarea></label><button type="button" class="btn-action" data-action="update-order-details" data-order-id="${Number(w.id)}">Salvar dados</button></div></details></td><td>${escapeHtml(w.priority)}</td><td>${escapeHtml(w.status)}</td><td>${escapeHtml(w.assigned_technician || '—')}</td><td>${overdue ? '<span class="os-overdue">ATRASADA · </span>' : ''}${escapeHtml(formatarDataHora(w.due_at))}</td><td>${escapeHtml(formatarDataHora(w.started_at))}</td><td>${escapeHtml(formatarDataHora(w.completed_at))}</td><td class="os-checklist"><details><summary>Checklist (${checklistDone}/${checklist.length})</summary>${checklistHtml}</details></td><td><input id="os-resolution-${Number(w.id)}" maxlength="4000" value="${escapeHtml(w.resolution || '')}" placeholder="Obrigatório para concluir" data-vg-style="static-43459be14cf5"></td><td><select id="os-status-${Number(w.id)}"><option ${w.status==='ABERTA'?'selected':''}>ABERTA</option><option ${w.status==='EM_ANDAMENTO'?'selected':''}>EM_ANDAMENTO</option><option ${w.status==='AGUARDANDO_PECA'?'selected':''}>AGUARDANDO_PECA</option><option ${w.status==='CONCLUIDA'?'selected':''}>CONCLUIDA</option><option ${w.status==='CANCELADA'?'selected':''}>CANCELADA</option></select><button type="button" class="btn-action" data-action="update-order" data-order-id="${Number(w.id)}">Guardar</button><button type="button" class="btn-action" data-action="print-order-report" data-order-id="${Number(w.id)}">Relatório PDF</button></td><td class="os-history"><details data-os-history="${orderId}" ${workOrderHistoryOpen.has(orderId) ? 'open' : ''}><summary>Ver histórico (${events.length})</summary>${events.length ? events.map(event => `<div class="os-history-event"><strong>${escapeHtml(formatarDataHora(event.timestamp))}</strong><br>${escapeHtml(event.user_name)} (${escapeHtml(event.role)}) · ${escapeHtml(event.action)}<br>${escapeHtml(event.details)}${event.resolution ? `<br><strong>Resumo registrado:</strong> ${escapeHtml(event.resolution)}` : ''}</div>`).join('') : '<div class="os-history-event">Sem eventos anteriores. O histórico começa a ser registrado a partir desta versão.</div>'}</details></td></tr>`;
                    }).join('')}
                    </tbody></table><p id="os-no-results" hidden>Nenhuma ordem corresponde aos filtros selecionados.</p></div></div>`;
                filtrarOrdensServico();
                // Rebuild the model options after the form HTML is replaced.
                atualizarSeletorModelosChecklistOS();
            } else if (currentTab === 'audit') {
                container.innerHTML = `<div data-vg-style="static-bf8e9f7e240e">
                    <h3 data-vg-style="static-c0f00e062a3d">Registro de Auditoria</h3>
                    <form class="os-filters" data-vg-submit="filtrarAuditoria">
                        <div class="input-group"><label for="audit-search">Buscar nos detalhes</label><input id="audit-search" value="${escapeHtml(auditFilters.search)}" maxlength="200" placeholder="Ação, detalhes ou papel"></div>
                        <div class="input-group"><label for="audit-user">Usuário</label><input id="audit-user" value="${escapeHtml(auditFilters.user_name)}" maxlength="120" placeholder="Nome do usuário"></div>
                        <div class="input-group"><label for="audit-action">Ação</label><select id="audit-action"><option value="">Todas as ações</option>${auditActions.map(action => `<option value="${escapeHtml(action)}" ${auditFilters.action===action?'selected':''}>${escapeHtml(action)}</option>`).join('')}</select></div>
                        <div class="input-group"><label for="audit-date-from">De</label><input id="audit-date-from" type="date" value="${escapeHtml(auditFilters.date_from)}"></div>
                        <div class="input-group"><label for="audit-date-to">Até</label><input id="audit-date-to" type="date" value="${escapeHtml(auditFilters.date_to)}"></div>
                        <button class="btn-primary" type="submit">Filtrar</button><button class="btn-action" type="button" data-action="clear-audit-filters">Limpar</button>
                    </form>
                    <p>${auditLoading ? 'Carregando registros…' : `${auditPageLogs.length} de ${auditTotal} registro(s)`}</p>
                    ${auditError ? `<p data-vg-style="static-de6e20e39901">${escapeHtml(auditError)} <button type="button" class="btn-action" data-action="load-audit" data-reset="true">Tentar novamente</button></p>` : ''}
                    <table class="enterprise-table">
                        <tr><th>Data/Hora</th><th>Usuário</th><th>Ação</th><th>Detalhes</th></tr>
                        ${auditPageLogs.map(l => `<tr><td>${escapeHtml(formatarDataHora(l.timestamp))}</td><td>${escapeHtml(l.user_name)}<br><small>${escapeHtml(l.role)}</small></td><td>${escapeHtml(l.action)}</td><td>${escapeHtml(l.details)}</td></tr>`).join('') || `<tr><td colspan="4">${auditError ? 'Não foi possível carregar os registros.' : auditLoading ? 'Carregando…' : 'Nenhum registro corresponde aos filtros.'}</td></tr>`}
                    </table>
                    ${auditHasMore ? `<button type="button" class="btn-primary" data-action="load-audit" data-reset="false" ${auditLoading?'disabled':''}>${auditLoading?'Carregando…':'Carregar mais registros'}</button>` : ''}
                </div>`;
            }
        }
        document.addEventListener('toggle', (event) => {
            const details = event.target;
            if (!(details instanceof HTMLDetailsElement)) return;
            const historyId = details.getAttribute('data-os-history');
            const editId = details.getAttribute('data-os-edit');
            if (!historyId && !editId) return;
            const targetSet = historyId ? workOrderHistoryOpen : workOrderEditOpen;
            const orderId = historyId || editId;
            if (details.open) targetSet.add(orderId);
            else targetSet.delete(orderId);
        }, true);
        // Delegação de eventos para evitar interpolar identificadores de painéis em código JavaScript inline.
        document.addEventListener('click', (event) => {
            if (!(event.target instanceof Element)) return;
            const target = event.target.closest('[data-action]');
            if (!target) return;
            switch (target.dataset.action) {
                case 'switch-tab':
                    mudarAba(target.dataset.tab || 'realtime');
                    break;
                case 'open-order-from-alarm':
                    abrirOrdemDoAlarme(Number(target.dataset.alarmId));
                    break;
                case 'acknowledge-alarm':
                    acaoAlarme(Number(target.dataset.alarmId), 'acknowledge');
                    break;
                case 'clear-alarm':
                    acaoAlarme(Number(target.dataset.alarmId), 'clear');
                    break;
                case 'apply-checklist-template':
                    aplicarModeloChecklistOS();
                    break;
                case 'toggle-asset-edit': {
                    if (!['CEO', 'Gerente'].includes(currentCargo)) break;
                    const id = Number(target.dataset.assetId);
                    assetEditOpen.has(id) ? assetEditOpen.delete(id) : assetEditOpen.add(id);
                    renderizar();
                    break;
                }
                case 'search-assets':
                    assetSearchText = document.getElementById('asset-search')?.value || '';
                    renderizar();
                    break;
                case 'save-asset':
                    salvarAtivo(Number(target.dataset.assetId));
                    break;
                case 'update-maintenance-task':
                    atualizarTarefaManutencao(Number(target.dataset.taskId));
                    break;
                case 'download-report':
                    baixarRelatorio();
                    break;
                case 'load-audit':
                    carregarAuditoria(target.dataset.reset === 'true');
                    break;
                case 'load-panel-history':
                    carregarHistoricoPainel(target.dataset.panelId || '', true);
                    break;
                case 'copy-telemetry-example':
                    copiarExemploTelemetria();
                    break;
                case 'search-devices':
                    deviceSearchText = document.getElementById('device-search')?.value || '';
                    renderizar();
                    break;
                case 'save-tenant-user-role':
                    atualizarUsuarioTenant(target);
                    break;
                case 'toggle-tenant-user':
                    alternarEstadoUsuarioTenant(target);
                    break;
                case 'revoke-tenant-user-sessions':
                    encerrarSessoesUsuarioTenant(target);
                    break;
                case 'print-order-report':
                    gerarRelatorioOrdem(Number(target.dataset.orderId));
                    break;
                case 'update-order':
                    atualizarOrdemServico(Number(target.dataset.orderId));
                    break;
                case 'update-order-details':
                    atualizarDadosOrdemServico(Number(target.dataset.orderId));
                    break;
                case 'clear-audit-filters':
                    limparFiltrosAuditoria();
                    break;
                case 'search-maintenance':
                    maintenanceSearchText = document.getElementById('maintenance-search')?.value || '';
                    renderizar();
                    break;
                case 'remove-checklist-template':
                    removerModeloChecklistOS();
                    break;
                case 'restore-panel-rules':
                    restaurarRegrasPainel();
                    break;
                case 'revoke-device-credential':
                    revogarDispositivo(Number(target.dataset.credentialId));
                    break;
                case 'save-checklist-template':
                    salvarModeloChecklistOS();
                    break;
                case 'test-webhook':
                    testarWebhook();
                    break;
                case 'print-page':
                    window.print();
                    break;
                case 'force-failure':
                    simularFalhaComercial(target.dataset.panelId || '');
                    break;
                case 'login':
                    realizarLogin();
                    break;
                case 'mfa-ack-codes':
                    if (mfaPasswordChanged) {
                        encerrarSessaoAposMfa();
                        break;
                    }
                    mfaRecoveryCodes = [];
                    renderizar();
                    break;
                case 'register':
                    registarTenant();
                    break;
                case 'show-register':
                    mostrarRegisto(true);
                    break;
                case 'show-login':
                    mostrarRegisto(false);
                    break;
                case 'logout':
                    realizarLogout();
                    break;
            }
        });
        carregarDisponibilidadeCadastro();
        document.addEventListener('submit', (event) => {
            const form = event.target;
            if (!(form instanceof HTMLFormElement)) return;
            switch (form.dataset.vgSubmit) {
                case 'cadastrarPainelDemo': cadastrarPainelDemo(event); break;
                case 'criarAtivo': criarAtivo(event); break;
                case 'criarCredencialDispositivo': criarCredencialDispositivo(event); break;
                case 'criarOrdemServico': criarOrdemServico(event); break;
                case 'criarPlanoManutencao': criarPlanoManutencao(event); break;
                case 'criarTarefaManutencao': criarTarefaManutencao(event); break;
                case 'filtrarAuditoria': filtrarAuditoria(event); break;
                case 'salvarItemInventario': salvarItemInventario(event); break;
                case 'salvarRegrasPainel': salvarRegrasPainel(event); break;
                case 'salvarRegrasTenant': salvarRegrasTenant(event); break;
                case 'salvarWebhook': salvarWebhook(event); break;
                case 'create-tenant-user': criarUsuarioTenant(event); break;
                case 'change-password': alterarMinhaSenha(event); break;
                case 'setup-mfa': iniciarConfiguracaoMfa(event); break;
                case 'confirm-mfa': confirmarConfiguracaoMfa(event); break;
                case 'complete-mfa-setup': concluirConfiguracaoMfa(event); break;
                case 'disable-mfa': desativarMfa(event); break;
                case 'consult-qr':
                    event.preventDefault();
                    consultarQR(document.getElementById('qr-input-manual')?.value.trim() || '');
                    break;
            }
        });
        document.addEventListener('change', (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;
            switch (target.dataset.vgChange) {
                case 'apply-checklist-preview': aplicarModeloChecklistOS(true, true); break;
                case 'update-asset-search': assetSearchText = target.value; renderizar(); break;
                case 'filter-asset-status': assetStatusFilter = target.value; renderizar(); break;
                case 'update-checklist-item': atualizarChecklistOS(Number(target.dataset.orderId), Number(target.dataset.checklistItemId), target); break;
                case 'load-panel-rules': carregarRegrasPainel(); break;
                case 'refresh-device-example': {
                    const sample = document.getElementById('device-telemetry-example');
                    if (sample) sample.textContent = exemploTelemetriaDispositivo();
                    break;
                }
                case 'set-history-window': definirJanelaHistorico(target.value); break;
                case 'filter-device-panel': devicePanelFilter = target.value; renderizar(); break;
                case 'update-device-search': deviceSearchText = target.value; renderizar(); break;
                case 'filter-device-status': deviceStatusFilter = target.value; renderizar(); break;
                case 'filter-alarms': filtrarAlarmes(); break;
                case 'filter-work-orders': filtrarOrdensServico(); break;
                case 'filter-maintenance-overdue': maintenanceOnlyOverdue = target.checked; renderizar(); break;
                case 'update-maintenance-search': maintenanceSearchText = target.value; renderizar(); break;
                case 'filter-maintenance-status': maintenanceStatusFilter = target.value; renderizar(); break;
            }
        });
        document.addEventListener('input', (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;
            switch (target.dataset.vgInput) {
                case 'preview-panel-rules': atualizarPreviaRegrasPainel(); break;
                case 'filter-alarms': filtrarAlarmes(); break;
                case 'filter-inventory': filtrarInventario(); break;
                case 'filter-work-orders': filtrarOrdensServico(); break;
                case 'fill-existing-inventory': preencherCamposInventarioExistente(); break;
            }
        });
