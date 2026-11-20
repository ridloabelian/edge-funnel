export const DASHBOARD_HTML = `<!doctype html>
<html lang="id" class="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>edge-funnel — Serverless Attribution &amp; Same-Age Cohort Engine</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #08101F;
      --surface: #0C172E;
      --surface-alt: #112040;
      --border: rgba(193, 159, 101, 0.18);
      --border-soft: rgba(255, 255, 255, 0.08);
      --gold: #C19F65;
      --gold-soft: rgba(193, 159, 101, 0.14);
      --emerald: #298D6B;
      --emerald-soft: rgba(41, 141, 107, 0.16);
      --coral: #D96B43;
      --coral-soft: rgba(217, 107, 67, 0.16);
      --text: #EDF2F7;
      --muted: #94A3B8;
      --sans: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      --mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background:
        radial-gradient(900px 420px at 15% -5%, rgba(193,159,101,0.10), transparent 60%),
        radial-gradient(800px 420px at 90% 0%, rgba(41,141,107,0.10), transparent 60%),
        var(--bg);
      color: var(--text);
      font-family: var(--sans);
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    .shell { max-width: 1340px; margin: 0 auto; padding: 24px 20px 64px; }
    header.topbar {
      display: flex; flex-wrap: wrap; gap: 16px;
      align-items: center; justify-content: space-between;
      padding: 18px 22px; margin-bottom: 22px;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 14px;
    }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand-mark {
      width: 40px; height: 40px; border-radius: 10px;
      background: linear-gradient(135deg, var(--gold), #8C6D3B);
      display: grid; place-items: center; color: #08101F;
      font-family: var(--mono); font-weight: 800; font-size: 15px;
    }
    .brand h1 { margin: 0; font-size: 18px; letter-spacing: -0.02em; }
    .brand p { margin: 2px 0 0; font-size: 12px; color: var(--muted); }
    .controls { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    select, input, button, textarea {
      font-family: inherit; font-size: 13px; color: var(--text);
      background: var(--surface-alt); border: 1px solid var(--border-soft);
      border-radius: 9px; padding: 8px 12px; outline: none;
    }
    select:focus, input:focus { border-color: var(--gold); }
    .seg { display: inline-flex; background: var(--bg); padding: 3px; border-radius: 10px; border: 1px solid var(--border-soft); }
    .seg button {
      background: transparent; border: none; color: var(--muted);
      padding: 6px 12px; border-radius: 7px; cursor: pointer; font-weight: 600;
    }
    .seg button.active { background: var(--gold); color: #08101F; }
    .btn {
      cursor: pointer; font-weight: 600; transition: 150ms ease;
      background: var(--surface-alt); border: 1px solid var(--border);
    }
    .btn:hover { border-color: var(--gold); color: var(--gold); }
    .btn-primary { background: var(--gold); color: #08101F; border-color: var(--gold); }
    .btn-primary:hover { background: #d4b47b; color: #08101F; }
    .btn-emerald { background: var(--emerald-soft); color: #6ee7b7; border-color: rgba(41,141,107,0.45); }

    .grid-kpi {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(195px, 1fr));
      gap: 14px; margin-bottom: 22px;
    }
    .card {
      background: var(--surface); border: 1px solid var(--border-soft);
      border-radius: 14px; padding: 18px 20px;
    }
    .card-accent { border-color: var(--border); }
    .kpi-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 600; }
    .kpi-val { font-family: var(--mono); font-size: 24px; font-weight: 700; margin: 6px 0 4px; color: #fff; }
    .kpi-sub { font-size: 12px; color: var(--muted); font-family: var(--mono); }
    .kpi-gold { color: var(--gold); }
    .kpi-emerald { color: #34d399; }

    .section-head {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
      gap: 12px; margin-bottom: 14px;
    }
    .section-head h2 { margin: 0; font-size: 16px; letter-spacing: -0.01em; }
    .section-head span.tag {
      font-family: var(--mono); font-size: 11px; padding: 4px 9px;
      border-radius: 999px; background: var(--gold-soft); color: var(--gold);
      border: 1px solid var(--border);
    }

    .grid-2 { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 18px; margin-bottom: 22px; }
    @media (max-width: 980px) { .grid-2 { grid-template-columns: 1fr; } }

    .insights-list { display: flex; flex-direction: column; gap: 11px; }
    .insight-item {
      padding: 13px 15px; border-radius: 11px; background: var(--surface-alt);
      border-left: 3px solid var(--gold);
    }
    .insight-item.warning { border-left-color: var(--coral); }
    .insight-item.win { border-left-color: var(--emerald); }
    .insight-item.attribution { border-left-color: #60a5fa; }
    .insight-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
    .insight-title { font-weight: 700; font-size: 13.5px; color: #f8fafc; }
    .insight-badge {
      font-family: var(--mono); font-size: 11px; font-weight: 700; white-space: nowrap;
      padding: 2px 8px; border-radius: 6px; background: rgba(255,255,255,0.06); color: var(--gold);
    }
    .insight-detail { font-size: 12.5px; color: var(--muted); margin-top: 5px; }

    .funnel-bars { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; }
    .f-row { display: grid; grid-template-columns: 92px 1fr 118px; align-items: center; gap: 12px; }
    .f-label { font-size: 12px; font-weight: 600; color: var(--muted); }
    .f-track { height: 22px; background: var(--bg); border-radius: 7px; overflow: hidden; border: 1px solid var(--border-soft); }
    .f-fill { height: 100%; border-radius: 6px; transition: width 350ms ease; }
    .f-num { font-family: var(--mono); font-size: 12px; text-align: right; color: #e2e8f0; }

    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th {
      text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em;
      color: var(--muted); padding: 10px 10px; border-bottom: 1px solid var(--border-soft);
      font-weight: 600;
    }
    td { padding: 11px 10px; border-bottom: 1px solid rgba(255,255,255,0.04); vertical-align: middle; }
    tr:hover td { background: rgba(255,255,255,0.02); }
    .mono { font-family: var(--mono); }
    .num { font-family: var(--mono); text-align: right; }

    .pill {
      display: inline-block; padding: 3px 8px; border-radius: 6px;
      font-family: var(--mono); font-size: 11px; font-weight: 700;
    }
    .pill-win { background: var(--emerald-soft); color: #34d399; }
    .pill-warn { background: var(--coral-soft); color: #fb923c; }
    .pill-gold { background: var(--gold-soft); color: var(--gold); }
    .pill-muted { background: rgba(148,163,184,0.14); color: #cbd5e1; }

    .chart-box {
      background: var(--bg); border: 1px solid var(--border-soft);
      border-radius: 12px; padding: 14px; margin-bottom: 16px;
    }
    .legend { display: flex; flex-wrap: wrap; gap: 16px; font-size: 12px; color: var(--muted); margin-bottom: 8px; }
    .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; }

    pre.codebox {
      background: var(--bg); border: 1px solid var(--border-soft); border-radius: 10px;
      padding: 13px; font-family: var(--mono); font-size: 12px; color: #cbd5e1;
      overflow-x: auto; margin: 8px 0 0; white-space: pre-wrap; word-break: break-word;
    }
    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin-top: 10px; }
    .muted { color: var(--muted); font-size: 12px; }
    .mb { margin-bottom: 22px; }
  </style>
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">EF</div>
        <div>
          <h1>edge-funnel</h1>
          <p>100% Serverless First-Party Attribution &amp; Same-Age Cohort Engine (D+1 / D+3 / D+7)</p>
        </div>
      </div>
      <div class="controls">
        <select id="wsSelect" aria-label="Workspace selector"></select>
        <div class="seg" role="group" aria-label="Attribution model">
          <button id="btnLastTouch" class="active" type="button">Last-Touch</button>
          <button id="btnFirstTouch" type="button">First-Touch</button>
        </div>
        <button id="btnPreviewReport" class="btn btn-emerald" type="button">Preview WA/TG Report</button>
      </div>
    </header>

    <!-- (a) Executive Overview + KPIs -->
    <section class="grid-kpi" id="kpiGrid"></section>

    <section class="grid-2">
      <div class="card card-accent">
        <div class="section-head">
          <h2>Natural Language Insights</h2>
          <span class="tag">VANITY VIEWS VS REAL REVENUE</span>
        </div>
        <div class="insights-list" id="insightsList"></div>
      </div>

      <div class="card">
        <div class="section-head">
          <h2>Funnel Konversi Berlapis</h2>
          <span class="tag" id="modelBadge">LAST_TOUCH</span>
        </div>
        <div class="funnel-bars" id="funnelBars"></div>
        <div id="reportPreviewBox" style="display:none; margin-top:14px;">
          <div class="kpi-label">Cron Card Preview (waflare &amp; Telegram)</div>
          <pre class="codebox" id="reportPreviewText"></pre>
        </div>
      </div>
    </section>

    <!-- (b) Platform Vanity vs Revenue Matrix -->
    <section class="card mb">
      <div class="section-head">
        <h2>Perbandingan Channel: Vanity Reach vs Real Revenue</h2>
        <span class="tag">RPM EFEKTIF (IDR / 1.000 VIEWS)</span>
      </div>
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th>Platform</th>
              <th class="num">Eps</th>
              <th class="num">Views (Share)</th>
              <th class="num">Klik (Share)</th>
              <th class="num">Leads</th>
              <th class="num">Paid</th>
              <th class="num">Click→Paid</th>
              <th class="num">Revenue (IDR)</th>
              <th class="num">RPM Efektif</th>
            </tr>
          </thead>
          <tbody id="platformTableBody"></tbody>
        </table>
      </div>
    </section>

    <!-- (c) Same-Age Cohort D+1 / D+3 / D+7 -->
    <section class="card card-accent mb">
      <div class="section-head">
        <h2>Same-Age Cohort Velocity Engine</h2>
        <div class="seg" role="group" aria-label="Cohort age selector">
          <button class="cohort-day-btn" data-day="1" type="button">D+1</button>
          <button class="cohort-day-btn active" data-day="3" type="button">D+3</button>
          <button class="cohort-day-btn" data-day="7" type="button">D+7</button>
        </div>
      </div>

      <div class="chart-box">
        <div class="legend">
          <span><i style="background:#C19F65"></i>Episode Terbaru (<span id="trajLatestCode">-</span>)</span>
          <span><i style="background:#298D6B"></i>Median 5 Episode di Umur Sama</span>
          <span><i style="background:#64748B"></i>Episode Sebelumnya</span>
        </div>
        <div id="cohortSvgWrap"></div>
      </div>

      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th>Episode</th>
              <th>Platform</th>
              <th class="num">Views @D+<span class="dayLabel">3</span></th>
              <th class="num">Klik</th>
              <th class="num">Leads</th>
              <th class="num">Paid</th>
              <th class="num">Revenue IDR</th>
              <th class="num">vs Prev</th>
              <th class="num">vs Median-5</th>
              <th>Verdict</th>
            </tr>
          </thead>
          <tbody id="cohortTableBody"></tbody>
        </table>
      </div>
    </section>

    <!-- (d) Shortlink Generator + Copy-Paste Integration -->
    <section class="grid-2">
      <div class="card">
        <div class="section-head">
          <h2>Generator Shortlink &amp; Kontrak <code>ef_ep</code></h2>
          <span class="tag">&lt;10ms REDIRECT</span>
        </div>
        <p class="muted">
          Kompatibel dengan <code>tabligh-os</code> &amp; <code>nazhir-reach</code> via parameter <code>ef_ep=&lt;episode_code&gt;</code>.
        </p>
        <form id="shortlinkForm">
          <div class="form-grid">
            <input id="slApiKey" type="password" placeholder="Workspace API Key (demo: ef_demo_saif_key)" required />
            <select id="slEpisode"></select>
            <input id="slDest" type="url" value="https://saif.co.id/kelas-ai" placeholder="Destination URL" required />
            <input id="slSource" type="text" value="linkedin" placeholder="utm_source" required />
            <input id="slMedium" type="text" value="organic" placeholder="utm_medium" required />
            <input id="slCode" type="text" placeholder="Custom code (opsional)" />
          </div>
          <div style="display:flex; gap:10px; margin-top:12px; flex-wrap:wrap;">
            <button class="btn btn-primary" type="submit">Buat Shortlink</button>
            <button id="btnFillDemoKey" class="btn" type="button">Isi Demo Key Lokal</button>
          </div>
        </form>
        <pre class="codebox" id="shortlinkOutput">Siap membuat shortlink /r/:code...</pre>
      </div>

      <div class="card">
        <div class="section-head">
          <h2>Copy-Paste Snippet &amp; Webhook Adapters</h2>
          <span class="tag">/ef.js &lt;2KB</span>
        </div>
        <div class="kpi-label">1. Pasang Pixel First-Party (&lt;2KB Vanilla JS)</div>
        <pre class="codebox" id="snippetCode"></pre>
        <div class="kpi-label" style="margin-top:12px;">2. Webhook Payment / WhatsApp waflare</div>
        <pre class="codebox" id="webhookEndpoints"></pre>
      </div>
    </section>
  </div>

  <script>
    (function () {
      const state = { slug: 'saif-growth', model: 'last_touch', day: 3, dashboard: null };
      const idr = (n) => 'Rp' + Math.round(Number(n || 0)).toLocaleString('id-ID');
      const num = (n) => Math.round(Number(n || 0)).toLocaleString('id-ID');
      const deltaBadge = (pct) => {
        if (pct === null || pct === undefined) return '<span class="pill pill-muted">baseline</span>';
        const sign = pct >= 0 ? '+' : '';
        const cls = pct >= 10 ? 'pill-win' : (pct <= -15 ? 'pill-warn' : 'pill-muted');
        return '<span class="pill ' + cls + '">' + sign + pct + '%</span>';
      };
      const verdictPill = (v) => {
        if (v === 'BREAKOUT' || v === 'OUTPERFORMING') return '<span class="pill pill-win">' + v + '</span>';
        if (v === 'VANITY_TRAP' || v === 'LAGGING') return '<span class="pill pill-warn">' + v + '</span>';
        return '<span class="pill pill-gold">' + v + '</span>';
      };

      async function loadWorkspaces() {
        const res = await fetch('/api/v1/workspaces');
        const data = await res.json();
        const sel = document.getElementById('wsSelect');
        sel.innerHTML = '';
        (data.workspaces || []).forEach((w) => {
          const opt = document.createElement('option');
          opt.value = w.slug;
          opt.textContent = w.name + ' (' + w.slug + ')';
          sel.appendChild(opt);
        });
        if (data.workspaces && data.workspaces.length > 0) {
          state.slug = data.workspaces[0].slug;
          sel.value = state.slug;
        }
      }

      async function loadDashboard() {
        const res = await fetch('/api/v1/workspaces/' + encodeURIComponent(state.slug) + '/dashboard?model=' + state.model);
        const d = await res.json();
        state.dashboard = d;
        renderOverview(d);
        renderFunnel(d);
        renderPlatforms(d);
        renderTrajectorySvg(d.trajectory || []);
        renderSnippetDocs();
        await loadCohortDay(state.day);
        await loadEpisodesDropdown();
      }

      async function loadCohortDay(day) {
        state.day = day;
        document.querySelectorAll('.dayLabel').forEach((el) => { el.textContent = String(day); });
        const res = await fetch('/api/v1/workspaces/' + encodeURIComponent(state.slug) + '/cohorts?day=' + day + '&model=' + state.model);
        const data = await res.json();
        const tbody = document.getElementById('cohortTableBody');
        const rows = (data.cohorts || []).slice().reverse();
        tbody.innerHTML = rows.map((c) => (
          '<tr>' +
          '<td><strong class="mono">' + c.episode_code + '</strong><br><span class="muted">' + c.title + '</span></td>' +
          '<td class="mono">' + c.platform + '</td>' +
          '<td class="num">' + num(c.metrics.views) + '</td>' +
          '<td class="num">' + num(c.metrics.clicks) + '</td>' +
          '<td class="num">' + num(c.metrics.leads) + '</td>' +
          '<td class="num">' + num(c.metrics.paid) + '</td>' +
          '<td class="num kpi-gold">' + idr(c.metrics.revenue_idr) + '</td>' +
          '<td class="num">' + deltaBadge(c.vs_prev && c.vs_prev.revenue_pct) + '</td>' +
          '<td class="num">' + deltaBadge(c.vs_median5 && c.vs_median5.revenue_pct) + '</td>' +
          '<td>' + verdictPill(c.verdict) + '</td>' +
          '</tr>'
        )).join('');
      }

      async function loadEpisodesDropdown() {
        const res = await fetch('/api/v1/workspaces/' + encodeURIComponent(state.slug) + '/episodes');
        const data = await res.json();
        const sel = document.getElementById('slEpisode');
        sel.innerHTML = (data.episodes || []).map((e) => (
          '<option value="' + e.episode_code + '">' + e.episode_code + ' (' + e.platform + ')</option>'
        )).join('');
      }

      function renderOverview(d) {
        const t = d.totals;
        const kpis = [
          { label: 'Total Views', val: num(t.views), sub: t.episodes_count + ' episode terpantau', cls: '' },
          { label: 'Tracked Clicks', val: num(t.clicks), sub: 'First-party /r + /ef.js', cls: '' },
          { label: 'Leads -> Paid', val: num(t.leads) + ' → ' + num(t.paid), sub: 'Click-to-Paid ' + t.click_to_paid_pct + '%', cls: 'kpi-emerald' },
          { label: 'Real Revenue', val: idr(t.revenue_idr), sub: 'Model: ' + d.model.toUpperCase(), cls: 'kpi-gold' },
          { label: 'RPM Efektif', val: idr(t.effective_rpm_idr), sub: 'Revenue per 1.000 views', cls: 'kpi-gold' },
        ];
        document.getElementById('kpiGrid').innerHTML = kpis.map((k) => (
          '<div class="card"><div class="kpi-label">' + k.label + '</div>' +
          '<div class="kpi-val ' + k.cls + '">' + k.val + '</div>' +
          '<div class="kpi-sub">' + k.sub + '</div></div>'
        )).join('');

        const list = document.getElementById('insightsList');
        const items = d.insights || [];
        list.innerHTML = items.length ? items.map((ins) => (
          '<div class="insight-item ' + ins.severity + '">' +
            '<div class="insight-top">' +
              '<div class="insight-title">' + ins.headline + '</div>' +
              '<span class="insight-badge">' + ins.metric_badge + '</span>' +
            '</div>' +
            '<div class="insight-detail">' + ins.detail + '</div>' +
          '</div>'
        )).join('') : '<div class="muted">Belum cukup data lintas platform untuk insight.</div>';
      }

      function renderFunnel(d) {
        const t = d.totals;
        document.getElementById('modelBadge').textContent = d.model.toUpperCase();
        const stages = [
          { label: 'Views', val: t.views, color: '#475569' },
          { label: 'Clicks', val: t.clicks, color: '#60a5fa' },
          { label: 'Leads', val: t.leads, color: '#C19F65' },
          { label: 'Qualified', val: t.qualified, color: '#d97706' },
          { label: 'Paid Orders', val: t.paid, color: '#298D6B' },
        ];
        const maxVal = Math.max(1, t.views);
        document.getElementById('funnelBars').innerHTML = stages.map((s) => {
          const pct = s.val > 0 ? Math.max(4, Math.round((Math.log10(s.val + 1) / Math.log10(maxVal + 1)) * 100)) : 0;
          return '<div class="f-row">' +
            '<div class="f-label">' + s.label + '</div>' +
            '<div class="f-track"><div class="f-fill" style="width:' + pct + '%;background:' + s.color + '"></div></div>' +
            '<div class="f-num">' + num(s.val) + '</div>' +
          '</div>';
        }).join('');
      }

      function renderPlatforms(d) {
        const tbody = document.getElementById('platformTableBody');
        tbody.innerHTML = (d.platforms || []).map((p) => (
          '<tr>' +
          '<td><strong class="mono" style="text-transform:uppercase">' + p.platform + '</strong></td>' +
          '<td class="num">' + p.episodes_count + '</td>' +
          '<td class="num">' + num(p.views) + ' <span class="muted">(' + p.views_share_pct + '%)</span></td>' +
          '<td class="num">' + num(p.clicks) + ' <span class="muted">(' + p.clicks_share_pct + '%)</span></td>' +
          '<td class="num">' + num(p.leads) + '</td>' +
          '<td class="num">' + num(p.paid) + '</td>' +
          '<td class="num">' + deltaBadge(p.click_to_paid_pct) + '</td>' +
          '<td class="num kpi-gold">' + idr(p.revenue_idr) + '</td>' +
          '<td class="num kpi-emerald">' + idr(p.effective_rpm_idr) + '</td>' +
          '</tr>'
        )).join('');
      }

      function renderTrajectorySvg(pts) {
        const latestCode = (pts.find((p) => p.latest_episode_code) || {}).latest_episode_code || '-';
        document.getElementById('trajLatestCode').textContent = latestCode;
        const maxRev = Math.max(100000, ...pts.flatMap((p) => [p.latest_revenue_idr, p.median5_revenue_idr, p.prev_revenue_idr]));
        const W = 760, H = 175, padL = 64, padR = 24, padT = 18, padB = 30;
        const plotW = W - padL - padR, plotH = H - padT - padB;
        const xFor = (i) => padL + (i * plotW) / Math.max(1, pts.length - 1);
        const yFor = (v) => padT + plotH - (v / maxRev) * plotH;
        const poly = (vals) => vals.map((v, i) => xFor(i).toFixed(1) + ',' + yFor(v).toFixed(1)).join(' ');

        const svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block">' +
          [0, 0.5, 1].map((r) => {
            const y = padT + plotH * (1 - r);
            return '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="rgba(255,255,255,0.08)" />' +
              '<text x="' + (padL - 8) + '" y="' + (y + 4) + '" text-anchor="end" fill="#94A3B8" font-size="10" font-family="JetBrains Mono">' +
              Math.round((maxRev * r) / 1000) + 'k</text>';
          }).join('') +
          '<polyline fill="none" stroke="#64748B" stroke-width="2" stroke-dasharray="4 4" points="' + poly(pts.map((p) => p.prev_revenue_idr)) + '" />' +
          '<polyline fill="none" stroke="#298D6B" stroke-width="2.5" points="' + poly(pts.map((p) => p.median5_revenue_idr)) + '" />' +
          '<polyline fill="none" stroke="#C19F65" stroke-width="3" points="' + poly(pts.map((p) => p.latest_revenue_idr)) + '" />' +
          pts.map((p, i) => (
            '<circle cx="' + xFor(i) + '" cy="' + yFor(p.latest_revenue_idr) + '" r="4.5" fill="#C19F65" />' +
            '<circle cx="' + xFor(i) + '" cy="' + yFor(p.median5_revenue_idr) + '" r="3.5" fill="#298D6B" />' +
            '<text x="' + xFor(i) + '" y="' + (H - 8) + '" text-anchor="middle" fill="#CBD5E1" font-size="11" font-family="JetBrains Mono">D+' + p.day + '</text>'
          )).join('') +
          '</svg>';
        document.getElementById('cohortSvgWrap').innerHTML = svg;
      }

      function renderSnippetDocs() {
        const origin = location.origin;
        document.getElementById('snippetCode').textContent =
          '<script defer src="' + origin + '/ef.js" data-ws="' + state.slug + '"><' + '/script>\\n' +
          '<!-- URL Standard (tabligh-os & nazhir-reach) -->\\n' +
          'https://domainanda.id/landing?ef_ep=ep-07&utm_source=linkedin&utm_medium=organic';

        document.getElementById('webhookEndpoints').textContent =
          'POST ' + origin + '/api/v1/webhooks/' + state.slug + '/waflare\\n' +
          'POST ' + origin + '/api/v1/webhooks/' + state.slug + '/qris\\n' +
          'POST ' + origin + '/api/v1/webhooks/' + state.slug + '/midtrans\\n' +
          'POST ' + origin + '/api/v1/webhooks/' + state.slug + '/xendit\\n' +
          'POST ' + origin + '/api/v1/webhooks/' + state.slug + '/stripe\\n' +
          'POST ' + origin + '/api/v1/webhooks/' + state.slug + '/generic';
      }

      document.getElementById('wsSelect').addEventListener('change', (e) => {
        state.slug = e.target.value;
        loadDashboard();
      });

      document.getElementById('btnLastTouch').addEventListener('click', () => {
        state.model = 'last_touch';
        document.getElementById('btnLastTouch').classList.add('active');
        document.getElementById('btnFirstTouch').classList.remove('active');
        loadDashboard();
      });

      document.getElementById('btnFirstTouch').addEventListener('click', () => {
        state.model = 'first_touch';
        document.getElementById('btnFirstTouch').classList.add('active');
        document.getElementById('btnLastTouch').classList.remove('active');
        loadDashboard();
      });

      document.querySelectorAll('.cohort-day-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.cohort-day-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          loadCohortDay(Number(btn.dataset.day));
        });
      });

      document.getElementById('btnPreviewReport').addEventListener('click', async () => {
        const box = document.getElementById('reportPreviewBox');
        const pre = document.getElementById('reportPreviewText');
        const res = await fetch('/api/v1/workspaces/' + encodeURIComponent(state.slug) + '/reports/preview');
        const data = await res.json();
        pre.textContent = data.report_text || '';
        box.style.display = 'block';
      });

      document.getElementById('btnFillDemoKey').addEventListener('click', () => {
        const demoKeys = { 'saif-growth': 'ef_demo_saif_key', 'nazhir-reach': 'ef_demo_nazhir_key' };
        document.getElementById('slApiKey').value = demoKeys[state.slug] || 'ef_demo_saif_key';
      });

      document.getElementById('shortlinkForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const key = document.getElementById('slApiKey').value;
        const payload = {
          episode_code: document.getElementById('slEpisode').value,
          destination_url: document.getElementById('slDest').value,
          utm_source: document.getElementById('slSource').value,
          utm_medium: document.getElementById('slMedium').value,
          code: document.getElementById('slCode').value || undefined,
        };
        const res = await fetch('/api/v1/workspaces/' + encodeURIComponent(state.slug) + '/shortlinks', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-ef-api-key': key },
          body: JSON.stringify(payload),
        });
        const out = await res.json();
        document.getElementById('shortlinkOutput').textContent = JSON.stringify(out, null, 2);
      });

      loadWorkspaces().then(loadDashboard);
    })();
  </script>
</body>
</html>`;
