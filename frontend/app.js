(function() {
    "use strict";
    const API_BASE = "http://localhost:3000/api";

    // State
    let selections = {};
    let currentQuinielaId = null;
    let currentFolio = null;
    let currentName = null;
    let currentWhatsapp = null;
    let partidos = [];
    let jornadaNum = 1;
    let puedePagar = true;

    // Utils
    function formatDate(d) {
        const days = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
        const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
        const date = new Date(d);
        return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
    }

    function formatTime(d) {
        return new Date(d).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
    }

    function getTeamAbbr(name) {
        const map = {
            "América":"AME","Guadalajara":"GDL","Cruz Azul":"CAZ","Pumas UNAM":"PUM","Monterrey":"MTY","Tigres UANL":"TIG",
            "Toluca":"TOL","Santos Laguna":"SAN","León":"LEO","Atlas":"ATL","Pachuca":"PAC","Necaxa":"NEC",
            "Puebla":"PUE","Querétaro":"QRO","Tijuana":"TIJ","Mazatlán":"MAZ","Juárez":"JUA","San Luis":"SLU"
        };
        return map[name] || name.substring(0,3).toUpperCase();
    }

    // API
    async function fetchJornada() {
        try {
            const resp = await fetch(`${API_BASE}/partidos/jornada-actual`);
            const data = await resp.json();
            if (data.success) {
                partidos = data.partidos || [];
                jornadaNum = data.jornada?.numero || 1;
                puedePagar = data.jornada?.puedePagar !== false;
                document.getElementById("jornadaTitle").textContent = `Jornada ${jornadaNum} — Liga MX Clausura 2026`;
                if (!puedePagar) {
                    document.getElementById("lockoutBanner").classList.add("visible");
                    document.getElementById("btnRegistrar").disabled = true;
                }
                return true;
            }
        } catch (e) { console.error(e); }
        return false;
    }

    async function fetchAcumulado() {
        try {
            const resp = await fetch(`${API_BASE}/info/acumulado`);
            const data = await resp.json();
            if (data.success) {
                const monto = data.monto || 0;
                const part = data.participantes || 0;
                document.getElementById("poolAmount").textContent = `$${monto.toLocaleString("es-MX")}`;
                document.getElementById("poolLabel").textContent = `${part} participante${part!==1?'s':''}`;
                document.getElementById("premioAcumulado").textContent = `$${monto.toLocaleString("es-MX")} MXN`;
                document.getElementById("premioMonto").textContent = `$${monto.toLocaleString("es-MX")} MXN`;
                document.getElementById("participantesCount").textContent = part;
            }
        } catch (e) { console.error(e); }
    }

    async function fetchQuinielas() {
        try {
            const resp = await fetch(`${API_BASE}/admin/quinielas`);
            const data = await resp.json();
            const list = document.getElementById("registeredList");
            const noReg = document.getElementById("noRegistrations");
            if (data.quinielas && data.quinielas.length > 0) {
                noReg.style.display = "none";
                list.innerHTML = data.quinielas.slice(0,20).map(q => `
                    <div class="registered-item">
                        <div class="registered-name">${q.nombre_completo}</div>
                        <span class="payment-badge ${q.pagada?'badge-paid':'badge-pending'}">${q.pagada?'🟢':'🟡'}</span>
                    </div>
                `).join("");
            }
        } catch (e) { console.error(e); }
    }

    // Team logos mapping
    const TEAM_LOGOS = {
        "Club América": "https://ssl.gstatic.com/selectteam/logos/clubamerica_86x86.png",
        "Guadalajara": "https://ssl.gstatic.com/selectteam/logos/chivas_86x86.png",
        "Cruz Azul": "https://ssl.gstatic.com/selectteam/logos/cruzazul_86x86.png",
        "Tigres UANL": "https://ssl.gstatic.com/selectteam/logos/tigres_86x86.png",
        "CF Monterrey": "https://ssl.gstatic.com/selectteam/logos/monterrey_86x86.png",
        "Pumas UNAM": "https://ssl.gstatic.com/selectteam/logos/pumas_86x86.png",
        "Deportivo Toluca FC": "https://ssl.gstatic.com/selectteam/logos/toluca_86x86.png",
        "Santos Laguna": "https://ssl.gstatic.com/selectteam/logos/santos_86x86.png",
        "Club León": "https://ssl.gstatic.com/selectteam/logos/leon_86x86.png",
        "Atlas FC": "https://ssl.gstatic.com/selectteam/logos/atlas_86x86.png",
        "C.F. Pachuca": "https://ssl.gstatic.com/selectteam/logos/pachuca_86x86.png",
        "Club Necaxa": "https://ssl.gstatic.com/selectteam/logos/necaxa_86x86.png",
        "Puebla FC": "https://ssl.gstatic.com/selectteam/logos/puebla_86x86.png",
        "Querétaro FC": "https://ssl.gstatic.com/selectteam/logos/queretaro_86x86.png",
        "Club Tijuana": "https://ssl.gstatic.com/selectteam/logos/tijuana_86x86.png",
        "Mazatlán FC": "https://ssl.gstatic.com/selectteam/logos/mazatlan_86x86.png",
        "FC Juárez": "https://ssl.gstatic.com/selectteam/logos/juarez_86x86.png",
        "Atlético de San Luis": "https://ssl.gstatic.com/selectteam/logos/sanluis_86x86.png"
    };

    function getTeamLogo(teamName) {
        return TEAM_LOGOS[teamName] || null;
    }

    // Render
    function renderMatches() {
        const container = document.getElementById("matchesList");
        container.innerHTML = "";

        partidos.forEach((p, i) => {
            const logoLocal = getTeamLogo(p.equipo_local);
            const logoVisitante = getTeamLogo(p.equipo_visitante);
            const badgeLocal = logoLocal ? `<img src="${logoLocal}" alt="${p.equipo_local}" class="team-logo" onerror="this.style.display='none';this.nextSibling.style.display='flex';">` : '';
            const badgeVisitante = logoVisitante ? `<img src="${logoVisitante}" alt="${p.equipo_visitante}" class="team-logo" onerror="this.style.display='none';this.nextSibling.style.display='flex';">` : '';
            
            const row = document.createElement("div");
            row.className = "match-row";
            row.innerHTML = `
                <div class="team local">
                    <span>${p.equipo_local}</span>
                    <div class="team-logo-wrap">${badgeLocal}<div class="team-badge" style="display:none;">${getTeamAbbr(p.equipo_local)}</div></div>
                </div>
                <div class="match-options">
                    <span class="match-number">${i+1}</span>
                    <button class="match-option" data-id="${p.id}" data-pick="1" title="Gana ${p.equipo_local}">L</button>
                    <button class="match-option" data-id="${p.id}" data-pick="X" title="Empate">E</button>
                    <button class="match-option" data-id="${p.id}" data-pick="2" title="Gana ${p.equipo_visitante}">V</button>
                </div>
                <div class="team visitante">
                    <div class="team-logo-wrap">${badgeVisitante}<div class="team-badge" style="display:none;">${getTeamAbbr(p.equipo_visitante)}</div></div>
                    <span>${p.equipo_visitante}</span>
                </div>
            `;
            container.appendChild(row);
        });

        // Update count and button
        const count = Object.keys(selections).length;
        document.getElementById("matchCount").textContent = `${count}/9 seleccionados`;
        
        const name = document.getElementById("participantName").value.trim();
        const whatsapp = document.getElementById("participantWhatsapp").value.trim();
        const btn = document.getElementById("btnRegistrar");
        btn.disabled = count < 9 || name.length < 2 || !puedePagar;
    }

    function updateMatchCount() {
        const count = Object.keys(selections).length;
        document.getElementById("matchCount").textContent = `${count}/9 seleccionados`;
        
        const name = document.getElementById("participantName").value.trim();
        const whatsapp = document.getElementById("participantWhatsapp").value.trim();
        const btn = document.getElementById("btnRegistrar");
        btn.disabled = count < 9 || name.length < 2 || whatsapp.length < 10 || !puedePagar;
    }

    function renderCurrentResults() {
        const container = document.getElementById("currentResultsContent");
        let html = `<h4 style="margin-bottom:12px;color:var(--accent-green-light);">Jornada ${jornadaNum}</h4>`;
        html += '<table class="results-table"><thead><tr><th>Local</th><th>Resultado</th><th>Visitante</th></tr></thead><tbody>';
        
        partidos.forEach(p => {
            if (p.goles_local !== null && p.goles_visitante !== null) {
                const gl = p.goles_local, gv = p.goles_visitante;
                let cls = "draw-result";
                if (gl > gv) cls = "winner-local";
                else if (gv > gl) cls = "winner-visitante";
                html += `<tr><td style="font-weight:600;text-align:right;">${p.equipo_local}</td><td class="score-cell ${cls}" style="text-align:center;font-weight:800;">${gl} - ${gv}</td><td style="font-weight:600;">${p.equipo_visitante}</td></tr>`;
            } else {
                html += `<tr><td style="font-weight:600;text-align:right;">${p.equipo_local}</td><td class="score-cell" style="text-align:center;color:var(--text-muted);font-style:italic;">Pendiente</td><td style="font-weight:600;">${p.equipo_visitante}</td></tr>`;
            }
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    }

    function showToast(folio) {
        const toast = document.getElementById("successToast");
        document.getElementById("folioDisplay").textContent = folio;
        toast.classList.add("visible");
        setTimeout(() => toast.classList.remove("visible"), 10000);
    }

    // Modal
    function openModal(id) {
        document.getElementById(`modal-${id}`).classList.add("active");
        document.body.style.overflow = "hidden";
        
        // Llenar datos del modal de pago
        if (id === "pago") {
            document.getElementById("pagoNombre").textContent = currentName || "-";
            document.getElementById("pagoWhatsapp").textContent = currentWhatsapp || "-";
            document.getElementById("pagoPronosticos").textContent = Object.keys(selections).length + " partidos";
        }
    }
    function closeModal(id) {
        document.getElementById(`modal-${id}`).classList.remove("active");
        document.body.style.overflow = "";
    }

    // Payment
    async function processPayment() {
        try {
            const resp = await fetch(`${API_BASE}/pagos/crear-sesion`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    pronosticos: selections,
                    nombre: currentName,
                    whatsapp: currentWhatsapp
                })
            });
            const data = await resp.json();
            
            closeModal("pago");
            
            if (data.success && data.sessionUrl) {
                // Redirigir a Stripe Checkout
                window.location.href = data.sessionUrl;
            } else if (data.success && data.demo) {
                // Modo demo (sin Stripe configurado)
                selections = {};
                document.getElementById("participantName").value = "";
                document.getElementById("participantWhatsapp").value = "";
                document.querySelectorAll(".match-option.selected").forEach(el => el.classList.remove("selected"));
                renderMatches();
                updateMatchCount();
                fetchAcumulado();
                fetchQuinielas();
                
                window.location.href = `success.html?id=${data.quiniela_id || data.sessionId}`;
            } else {
                alert("Error: " + (data.message || ""));
            }
        } catch (e) {
            console.error("processPayment error:", e);
            alert("Error: " + e.message);
        } finally {
            const btn = document.getElementById("btnConfirmarPago");
            btn.disabled = false;
            btn.querySelector(".btn-pay-text").style.display = "inline";
            btn.querySelector(".btn-pay-loading").style.display = "none";
        }
    }

    async function registerQuiniela(event) {
        if (event) { event.preventDefault(); event.stopPropagation(); }
        const name = document.getElementById("participantName").value.trim();
        const whatsapp = document.getElementById("participantWhatsapp").value.trim().replace(/\D/g, "");

        if (name.length < 2) { alert("Ingresa tu nombre"); return; }
        if (whatsapp.length < 10) { alert("Ingresa un WhatsApp válido"); return; }
        if (Object.keys(selections).length < 9) { alert("Selecciona los 9 partidos"); return; }

        currentName = name;
        currentWhatsapp = whatsapp;
        
        const modal = document.getElementById("modal-pago");
        if (!modal) { alert("Error: modal no encontrado"); return; }
        modal.classList.add("active");
        document.body.style.overflow = "hidden";
        
        document.getElementById("pagoNombre").textContent = name;
        document.getElementById("pagoWhatsapp").textContent = whatsapp;
        document.getElementById("pagoPronosticos").textContent = Object.keys(selections).length + " partidos";
    }

    // Events
    function bindEvents() {
        // Match selection
        document.getElementById("matchesList").addEventListener("click", e => {
            const btn = e.target.closest(".match-option");
            if (!btn || puedePagar === false) return;

            const id = btn.dataset.id;
            const pick = btn.dataset.pick;

            btn.parentElement.querySelectorAll(".match-option").forEach(s => s.classList.remove("selected"));
            btn.classList.add("selected");
            selections[id] = pick;
            updateMatchCount();
        });

        // Name input
        document.getElementById("participantName").addEventListener("input", updateMatchCount);
        document.getElementById("participantWhatsapp").addEventListener("input", updateMatchCount);

        // Register button - handled via inline onclick for reliability

        // Nav
        document.getElementById("navToggle").addEventListener("click", () => {
            document.getElementById("navMenu").classList.toggle("open");
        });

        document.querySelectorAll("[data-modal]").forEach(btn => {
            btn.addEventListener("click", () => {
                openModal(btn.dataset.modal);
                document.getElementById("navMenu").classList.remove("open");
            });
        });

        document.querySelectorAll("[data-close-modal]").forEach(btn => {
            btn.addEventListener("click", () => {
                closeModal(btn.closest(".modal-overlay").id.replace("modal-",""));
            });
        });

        document.querySelectorAll(".modal-overlay").forEach(m => {
            m.addEventListener("click", e => {
                if (e.target === m) {
                    m.classList.remove("active");
                    document.body.style.overflow = "";
                }
            });
        });

        // Payment form
        document.getElementById("btnConfirmarPago").addEventListener("click", processPayment);

        // Toast dismiss
        document.getElementById("successToast").addEventListener("click", () => {
            document.getElementById("successToast").classList.remove("visible");
        });
    }

    // Init
    async function init() {
        const ok = await fetchJornada();
        if (ok) {
            renderMatches();
            renderCurrentResults();
        } else {
            document.getElementById("matchesList").innerHTML = '<p style="color:var(--text-muted)">Cargando partidos...</p>';
        }
        await fetchAcumulado();
        await fetchQuinielas();
        bindEvents();

        setInterval(() => { fetchAcumulado(); fetchQuinielas(); }, 30000);
    }

    document.addEventListener("DOMContentLoaded", init);

    window.registerQuiniela = registerQuiniela;
    window.processPayment = processPayment;
})();
