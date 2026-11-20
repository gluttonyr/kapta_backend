'use strict';

// Kapta super admin panel: plain JS against the Kapta API on the same origin (no external code).
(() => {
  const TOKEN_KEY = 'kapta-admin-token';
  const EMAIL_KEY = 'kapta-admin-email';
  const DURATIONS = [
    { days: 30, label: '30 jours' },
    { days: 90, label: '3 mois' },
    { days: 180, label: '6 mois' },
    { days: 365, label: '1 an' },
  ];
  const CODE_STATUS = {
    DISPONIBLE: ['ok', 'Disponible'],
    UTILISE: ['off', 'Utilisé'],
    EXPIRE: ['warn', 'Expiré'],
    REVOQUE: ['bad', 'Révoqué'],
  };
  const LICENSE_STATUS = {
    ACTIVE: ['ok', 'Active'],
    EXPIREE: ['warn', 'Expirée'],
    REVOQUEE: ['bad', 'Révoquée'],
  };

  const $ = (id) => document.getElementById(id);
  // The token lives only for this browser tab.
  const state = {
    token: sessionStorage.getItem(TOKEN_KEY),
    clients: [],
    selectedId: null,
    // Codes just generated, per client: the server never shows them again.
    freshCodes: {},
  };

  // ── helpers ────────────────────────────────────────────────────────────

  /** Element builder; strings become text nodes (never HTML). */
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      else if (key in el && typeof value !== 'string') el[key] = value;
      else el.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return el;
  }

  const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR') : '—');
  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : '—');
  const badge = (map, status) => {
    const [tone, label] = map[status] || ['off', status];
    return h('span', { class: `badge ${tone}` }, label);
  };
  const shortId = (id) => (id && id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id || '—');

  let toastTimer;
  function toast(message, bad = false) {
    const el = $('toast');
    el.textContent = message;
    el.className = bad ? 'toast bad' : 'toast';
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copié');
    } catch {
      window.prompt('Copiez le texte :', text);
    }
  }

  function randomPassword() {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const bytes = crypto.getRandomValues(new Uint32Array(12));
    return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  }

  async function api(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    let res;
    try {
      res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new Error('Serveur Kapta injoignable.');
    }
    const data = await res.json().catch(() => null);
    if (res.status === 401 && state.token) {
      signOut();
      throw new Error('Session expirée : reconnectez-vous.');
    }
    if (!res.ok) {
      const message = data && data.message;
      throw new Error((Array.isArray(message) ? message[0] : message) || `Erreur ${res.status}`);
    }
    return data;
  }

  /** Runs an action from a button: disables it meanwhile, shows the error if any. */
  async function run(button, action) {
    if (button) button.disabled = true;
    try {
      await action();
    } catch (e) {
      toast(e.message, true);
    } finally {
      if (button) button.disabled = false;
    }
  }

  // ── session ────────────────────────────────────────────────────────────

  function signOut() {
    state.token = null;
    state.selectedId = null;
    state.freshCodes = {};
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(EMAIL_KEY);
    showLogin();
  }

  function showLogin() {
    $('who').hidden = true;
    $('main-view').hidden = true;
    $('login-view').hidden = false;
  }

  async function showMain() {
    $('login-view').hidden = true;
    $('main-view').hidden = false;
    $('who').hidden = false;
    $('who-email').textContent = sessionStorage.getItem(EMAIL_KEY) || '';
    await loadClients();
  }

  $('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = $('login-error');
    error.hidden = true;
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const data = await api('POST', '/auth/admin/login', {
        email: form.elements.email.value.trim(),
        password: form.elements.password.value,
      });
      state.token = data.accessToken;
      sessionStorage.setItem(TOKEN_KEY, data.accessToken);
      sessionStorage.setItem(EMAIL_KEY, data.email);
      form.reset();
      await showMain();
    } catch (e) {
      error.textContent = e.message;
      error.hidden = false;
    } finally {
      button.disabled = false;
    }
  });

  $('logout').addEventListener('click', signOut);

  // ── clients ────────────────────────────────────────────────────────────

  async function loadClients() {
    state.clients = await api('GET', '/admin/clients');
    renderClientList();
    if (state.selectedId && state.clients.some((c) => c.id === state.selectedId)) await renderDetail();
  }

  function renderClientList() {
    const list = $('client-list');
    list.replaceChildren(
      ...state.clients.map((client) =>
        h('li', null,
          h('button', {
            type: 'button',
            class: client.id === state.selectedId ? 'selected' : '',
            onclick: () => selectClient(client.id),
          },
          h('span', null, client.name, h('span', { class: 'url' }, client.backendUrl)),
          badge({ true: ['ok', 'Actif'], false: ['off', 'Désactivé'] }, String(client.active)))),
      ),
    );
    if (!state.clients.length) list.append(h('li', { class: 'sub' }, 'Aucun client pour l’instant.'));
  }

  $('client-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = $('client-error');
    error.hidden = true;
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const client = await api('POST', '/admin/clients', {
        name: form.elements.name.value.trim(),
        backendUrl: form.elements.backendUrl.value.trim(),
      });
      form.reset();
      state.selectedId = client.id;
      await loadClients();
      toast(`Client « ${client.name} » créé`);
    } catch (e) {
      error.textContent = e.message;
      error.hidden = false;
    } finally {
      button.disabled = false;
    }
  });

  async function selectClient(id) {
    state.selectedId = id;
    renderClientList();
    await run(null, renderDetail);
  }

  // ── selected client ────────────────────────────────────────────────────

  async function renderDetail() {
    const client = state.clients.find((c) => c.id === state.selectedId);
    if (!client) return;
    const [users, codes, licenses] = await Promise.all([
      api('GET', `/admin/clients/${client.id}/users`),
      api('GET', `/admin/clients/${client.id}/codes`),
      api('GET', `/admin/clients/${client.id}/licenses`),
    ]);
    $('no-client').hidden = true;
    const detail = $('client-detail');
    detail.hidden = false;
    detail.replaceChildren(
      clientCard(client),
      accountsCard(client, users),
      codesCard(client, codes),
      licensesCard(users, licenses),
    );
  }

  function clientCard(client) {
    const name = h('input', { name: 'name', value: client.name, required: true, minLength: 2, maxLength: 100 });
    const url = h('input', { name: 'backendUrl', type: 'url', value: client.backendUrl, required: true });
    const save = h('button', { type: 'submit', class: 'primary' }, 'Enregistrer');
    const toggle = h('button', {
      type: 'button',
      class: client.active ? 'danger' : '',
      onclick: () => {
        if (client.active && !window.confirm(`Désactiver « ${client.name} » ? Tous ses comptes et téléphones s’arrêtent.`)) return;
        run(toggle, async () => {
          await api('PATCH', `/admin/clients/${client.id}`, { active: !client.active });
          toast(client.active ? 'Client désactivé' : 'Client réactivé');
          await loadClients();
        });
      },
    }, client.active ? 'Désactiver le client' : 'Réactiver le client');

    const form = h('form', {
      class: 'row',
      onsubmit: (event) => {
        event.preventDefault();
        run(save, async () => {
          await api('PATCH', `/admin/clients/${client.id}`, { name: name.value.trim(), backendUrl: url.value.trim() });
          toast('Client enregistré');
          await loadClients();
        });
      },
    }, h('label', null, 'Nom', name), h('label', null, 'URL du backend', url), save);

    return h('section', { class: 'card' },
      h('div', { class: 'section-head' },
        h('h2', null, client.name, ' ', badge({ true: ['ok', 'Actif'], false: ['off', 'Désactivé'] }, String(client.active))),
        toggle),
      h('p', { class: 'sub' }, `Les SMS captés sont envoyés à ${client.backendUrl}`),
      form);
  }

  function accountsCard(client, users) {
    const email = h('input', { name: 'email', type: 'email', required: true, placeholder: 'admin@client.com' });
    const password = h('input', { name: 'password', type: 'text', required: true, minLength: 8, value: randomPassword() });
    const create = h('button', { type: 'submit', class: 'primary' }, 'Créer le compte');

    const rows = users.map((user) => {
      const toggle = h('button', {
        type: 'button',
        class: `small ${user.active ? 'danger' : ''}`,
        onclick: () => run(toggle, async () => {
          await api('PATCH', `/admin/client-users/${user.id}`, { active: !user.active });
          toast(user.active ? 'Compte désactivé' : 'Compte réactivé');
          await renderDetail();
        }),
      }, user.active ? 'Désactiver' : 'Réactiver');
      const reset = h('button', {
        type: 'button',
        class: 'small',
        onclick: () => {
          const next = window.prompt(`Nouveau mot de passe pour ${user.email} (8 caractères minimum) :`, randomPassword());
          if (!next) return;
          run(reset, async () => {
            await api('PATCH', `/admin/client-users/${user.id}`, { password: next });
            await copy(next);
            toast('Mot de passe changé et copié');
          });
        },
      }, 'Nouveau mot de passe');
      return h('tr', null,
        h('td', null, user.email),
        h('td', null, badge({ true: ['ok', 'Actif'], false: ['off', 'Désactivé'] }, String(user.active))),
        h('td', null, fmtDateTime(user.lastLoginAt)),
        h('td', null, h('div', { class: 'row' }, reset, toggle)));
    });

    const form = h('form', {
      class: 'row stack',
      onsubmit: (event) => {
        event.preventDefault();
        run(create, async () => {
          const created = await api('POST', `/admin/clients/${client.id}/users`, {
            email: email.value.trim(),
            password: password.value,
          });
          await copy(`${created.email} / ${password.value}`);
          toast('Compte créé, identifiants copiés');
          await renderDetail();
        });
      },
    },
    h('label', null, 'E-mail', email),
    h('label', null, 'Mot de passe', password),
    create);

    return h('section', { class: 'card' },
      h('div', { class: 'section-head' }, h('h2', null, 'Comptes Kapta du client')),
      h('p', { class: 'sub' }, 'Identifiants à donner au client pour se connecter dans l’application Kapta.'),
      users.length
        ? h('div', { class: 'table-wrap' }, h('table', null,
          h('thead', null, h('tr', null, h('th', null, 'E-mail'), h('th', null, 'Statut'), h('th', null, 'Dernière connexion'), h('th', null, ''))),
          h('tbody', null, rows)))
        : h('p', { class: 'sub' }, 'Aucun compte.'),
      form);
  }

  function codesCard(client, codes) {
    const preset = h('select', { name: 'duration' },
      DURATIONS.map((d) => h('option', { value: String(d.days) }, d.label)),
      h('option', { value: 'custom' }, 'Autre…'));
    const customDays = h('input', { type: 'number', min: 1, max: 3650, placeholder: 'Nombre de jours', hidden: true });
    preset.addEventListener('change', () => { customDays.hidden = preset.value !== 'custom'; });
    const count = h('input', { type: 'number', min: 1, max: 50, value: '1' });
    const validFor = h('input', { type: 'number', min: 1, max: 365, placeholder: 'Sans limite' });
    const generate = h('button', { type: 'submit', class: 'primary' }, 'Générer');

    const form = h('form', {
      class: 'row',
      onsubmit: (event) => {
        event.preventDefault();
        const durationDays = Number(preset.value === 'custom' ? customDays.value : preset.value);
        if (!Number.isInteger(durationDays) || durationDays < 1) {
          toast('Indiquez une durée en jours.', true);
          return;
        }
        run(generate, async () => {
          const body = { durationDays, count: Number(count.value) || 1 };
          if (validFor.value) body.validForDays = Number(validFor.value);
          const created = await api('POST', `/admin/clients/${client.id}/codes`, body);
          state.freshCodes[client.id] = created;
          toast(`${created.length} code${created.length > 1 ? 's' : ''} généré${created.length > 1 ? 's' : ''}`);
          await renderDetail();
        });
      },
    },
    h('label', null, 'Durée de licence', preset, customDays),
    h('label', null, 'Nombre de codes', count),
    h('label', null, 'À utiliser sous (jours)', validFor),
    generate);

    const fresh = state.freshCodes[client.id];
    const freshBox = fresh && fresh.length
      ? h('div', { class: 'codes-box' },
        h('p', null, 'Copiez ces codes maintenant : ils ne seront plus jamais affichés.'),
        fresh.map((c) => h('div', { class: 'code-line' },
          h('span', { class: 'mono' }, c.code),
          h('span', { class: 'sub' }, `${c.durationDays} jours`),
          h('button', { type: 'button', class: 'small', onclick: () => copy(c.code) }, 'Copier'))),
        fresh.length > 1
          ? h('button', { type: 'button', class: 'small', onclick: () => copy(fresh.map((c) => c.code).join('\n')) }, 'Tout copier')
          : null)
      : null;

    const rows = codes.map((code) => {
      const revoke = code.status === 'DISPONIBLE'
        ? h('button', {
          type: 'button',
          class: 'small danger',
          onclick: () => {
            if (!window.confirm(`Révoquer le code ${code.codeHint} ?`)) return;
            run(revoke, async () => {
              await api('POST', `/admin/codes/${code.id}/revoke`);
              toast('Code révoqué');
              await renderDetail();
            });
          },
        }, 'Révoquer')
        : null;
      return h('tr', null,
        h('td', { class: 'mono' }, code.codeHint),
        h('td', null, `${code.durationDays} j`),
        h('td', null, badge(CODE_STATUS, code.status)),
        h('td', null, code.usedAt ? fmtDateTime(code.usedAt) : code.expiresAt ? `avant le ${fmtDate(code.expiresAt)}` : '—'),
        h('td', { class: 'mono', title: code.deviceId || '' }, shortId(code.deviceId)),
        h('td', null, revoke));
    });

    return h('section', { class: 'card' },
      h('div', { class: 'section-head' }, h('h2', null, 'Codes d’activation')),
      h('p', { class: 'sub' }, 'Un code sert une seule fois. Sur un téléphone déjà actif, il prolonge la licence.'),
      form,
      freshBox,
      codes.length
        ? h('div', { class: 'table-wrap stack' }, h('table', null,
          h('thead', null, h('tr', null, h('th', null, 'Code'), h('th', null, 'Durée'), h('th', null, 'Statut'), h('th', null, 'Utilisé / validité'), h('th', null, 'Téléphone'), h('th', null, ''))),
          h('tbody', null, rows)))
        : h('p', { class: 'sub stack' }, 'Aucun code.'));
  }

  function licensesCard(users, licenses) {
    const emails = Object.fromEntries(users.map((u) => [u.id, u.email]));
    const rows = licenses.map((license) => {
      const revoke = license.status === 'ACTIVE'
        ? h('button', {
          type: 'button',
          class: 'small danger',
          onclick: () => {
            if (!window.confirm('Révoquer la licence de ce téléphone ? Sa capture s’arrêtera.')) return;
            run(revoke, async () => {
              await api('POST', `/admin/licenses/${license.id}/revoke`);
              toast('Licence révoquée');
              await renderDetail();
            });
          },
        }, 'Révoquer')
        : null;
      return h('tr', null,
        h('td', { class: 'mono', title: license.deviceId }, shortId(license.deviceId)),
        h('td', null, emails[license.userId] || '—'),
        h('td', null, badge(LICENSE_STATUS, license.status)),
        h('td', null, fmtDate(license.expiresAt)),
        h('td', null, fmtDateTime(license.lastCheckAt)),
        h('td', null, revoke));
    });
    return h('section', { class: 'card' },
      h('div', { class: 'section-head' }, h('h2', null, 'Téléphones (licences)')),
      licenses.length
        ? h('div', { class: 'table-wrap' }, h('table', null,
          h('thead', null, h('tr', null, h('th', null, 'Téléphone'), h('th', null, 'Compte'), h('th', null, 'Statut'), h('th', null, 'Fin'), h('th', null, 'Dernière vérification'), h('th', null, ''))),
          h('tbody', null, rows)))
        : h('p', { class: 'sub' }, 'Aucun téléphone activé.'));
  }

  // ── start ──────────────────────────────────────────────────────────────

  if (state.token) showMain().catch((e) => { toast(e.message, true); });
  else showLogin();
})();
