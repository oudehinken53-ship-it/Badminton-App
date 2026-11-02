/**
 * Badminton Management System 2.0 - Mobile Frontend
 * Supports both Live API (via Gateway) and Mock Transport (for instant preview & test).
 */

// Service Worker Registration for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('SW registration failed:', err);
    });
  });
}

const cfg = window.BADMINTON_CONFIG || {
  gatewayUrl: 'https://gateway.example.com',
  googleClientId: 'test.apps.googleusercontent.com'
};

// Global App State
const state = {
  activeTab: 'sessions',
  persona: 'anna', // 'anna' | 'ben' | 'orga' | 'admin' | 'google'
  currentUser: null,
  idToken: null,
  sessions: [],
  preferences: {},
  leaderboard: [],
  orgaRoster: []
};

// Mock In-Memory Backend (Deterministic Demo/Fallback)
const mockDb = {
  users: {
    anna: { playerId: 'p-anna', firstName: 'Anna', lastName: 'Meier', role: 'PLAYER', sub: '1001' },
    ben: { playerId: 'p-ben', firstName: 'Ben', lastName: 'Schmidt', role: 'PLAYER', sub: '1002' },
    orga: { playerId: 'p-orga', firstName: 'Olaf', lastName: 'Orga', role: 'ORGANIZER', sub: '1003' },
    admin: { playerId: 'p-admin', firstName: 'Ada', lastName: 'Admin', role: 'ADMIN', sub: '1004' }
  },
  sessions: [
    {
      sessionId: 'ses-20261102-park',
      templateId: 'tpl-mo',
      dateLocal: '2026-11-02',
      venue: 'PARK',
      startLocal: '19:30',
      endLocal: '22:30',
      status: 'OPEN',
      capacity: 20,
      confirmedCount: 14,
      waitlistedCount: 0,
      availableCapacity: 6,
      registrations: { 'p-anna': 'CONFIRMED', 'p-ben': 'DECLINED' },
      attendance: { 'p-anna': 'PRESENT', 'p-ben': 'ABSENT' }
    },
    {
      sessionId: 'ses-20261103-mzh',
      templateId: 'tpl-di',
      dateLocal: '2026-11-03',
      venue: 'MZH',
      startLocal: '17:30',
      endLocal: '20:00',
      status: 'OPEN',
      capacity: 20,
      confirmedCount: 8,
      waitlistedCount: 0,
      availableCapacity: 12,
      registrations: { 'p-anna': 'UNDECIDED', 'p-ben': 'CONFIRMED' },
      attendance: {}
    },
    {
      sessionId: 'ses-20261105-mzh',
      templateId: 'tpl-do',
      dateLocal: '2026-11-05',
      venue: 'MZH',
      startLocal: '20:00',
      endLocal: '22:00',
      status: 'OPEN',
      capacity: 20,
      confirmedCount: 16,
      waitlistedCount: 0,
      availableCapacity: 4,
      registrations: { 'p-anna': 'CONFIRMED', 'p-ben': 'CONFIRMED' },
      attendance: {}
    }
  ],
  preferences: {
    'p-anna': { 'tpl-mo': true, 'tpl-di': false, 'tpl-do': true },
    'p-ben': { 'tpl-mo': false, 'tpl-di': true, 'tpl-do': false },
    'p-orga': { 'tpl-mo': true, 'tpl-di': true, 'tpl-do': true },
    'p-admin': { 'tpl-mo': true, 'tpl-di': true, 'tpl-do': true }
  },
  points: {
    'p-anna': 53,
    'p-ben': 48,
    'p-orga': 60,
    'p-admin': 35
  }
};

// UI Elements
const dom = {
  toast: document.getElementById('toast'),
  roleBadge: document.getElementById('roleBadge'),
  userName: document.getElementById('userName'),
  personaSelect: document.getElementById('personaSelect'),
  googleAuthContainer: document.getElementById('googleAuthContainer'),
  googleButton: document.getElementById('googleButton'),
  playerRankSummary: document.getElementById('playerRankSummary'),
  sessionList: document.getElementById('sessionList'),
  refreshSessionsBtn: document.getElementById('refreshSessionsBtn'),
  savePreferencesBtn: document.getElementById('savePreferencesBtn'),
  refreshLeaderboardBtn: document.getElementById('refreshLeaderboardBtn'),
  leaderboardBody: document.getElementById('leaderboardBody'),
  adminNavTab: document.getElementById('adminNavTab'),
  orgaSessionSelect: document.getElementById('orgaSessionSelect'),
  orgaRosterContainer: document.getElementById('orgaRosterContainer'),
  closeSessionBtn: document.getElementById('closeSessionBtn'),
  generateSessionsBtn: document.getElementById('generateSessionsBtn'),
  systemHealthBtn: document.getElementById('systemHealthBtn'),
  navTabs: document.querySelectorAll('.nav-tab'),
  tabContents: document.querySelectorAll('.tab-content'),
  prefInputs: {
    'tpl-mo': document.getElementById('pref-tpl-mo'),
    'tpl-di': document.getElementById('pref-tpl-di'),
    'tpl-do': document.getElementById('pref-tpl-do')
  }
};

// Toast Notification
function showToast(message, duration = 3000) {
  dom.toast.textContent = message;
  dom.toast.classList.add('show');
  setTimeout(() => dom.toast.classList.remove('show'), duration);
}

// API Dispatcher (Mock vs Gateway)
async function callApi(action, data = {}) {
  // Demo Mode: run local mock backend
  if (state.persona !== 'google') {
    return runMockApi(action, data);
  }

  // Live Gateway Mode
  if (!state.idToken) {
    throw new Error('Bitte melde dich zuerst über Google an.');
  }

  const response = await fetch(cfg.gatewayUrl.replace(/\/$/, '') + '/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, data, idToken: state.idToken }),
    cache: 'no-store'
  });

  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.code || 'BACKEND_ERROR');
  }
  return result.data;
}

// Mock Engine
async function runMockApi(action, data) {
  await new Promise(r => setTimeout(r, 120)); // slight realistic network latency
  const user = mockDb.users[state.persona] || mockDb.users.anna;

  switch (action) {
    case 'whoami':
      return { ...user };

    case 'listSessions': {
      return mockDb.sessions.map(s => {
        const myReg = s.registrations[user.playerId] || 'UNDECIDED';
        return {
          sessionId: s.sessionId,
          templateId: s.templateId,
          dateLocal: s.dateLocal,
          venue: s.venue,
          startLocal: s.startLocal,
          endLocal: s.endLocal,
          status: s.status,
          capacity: s.capacity,
          confirmedCount: s.confirmedCount,
          waitlistedCount: s.waitlistedCount,
          availableCapacity: Math.max(0, s.capacity - s.confirmedCount),
          myRegistration: myReg
        };
      });
    }

    case 'setRegistration': {
      const session = mockDb.sessions.find(s => s.sessionId === data.sessionId);
      if (!session) throw new Error('SESSION_NOT_FOUND');
      if (session.status !== 'OPEN') throw new Error('SESSION_NOT_OPEN');

      const current = session.registrations[user.playerId];
      const newState = data.state;

      if (newState === 'CONFIRMED' && current !== 'CONFIRMED') {
        session.confirmedCount++;
      } else if (newState === 'DECLINED' && current === 'CONFIRMED') {
        session.confirmedCount = Math.max(0, session.confirmedCount - 1);
      }

      session.registrations[user.playerId] = newState;
      return { sessionId: session.sessionId, playerId: user.playerId, state: newState };
    }

    case 'getPreferences': {
      return mockDb.preferences[user.playerId] || { 'tpl-mo': false, 'tpl-di': false, 'tpl-do': false };
    }

    case 'setPreferences': {
      mockDb.preferences[user.playerId] = { ...data };
      return mockDb.preferences[user.playerId];
    }

    case 'getLeaderboard': {
      const standings = Object.keys(mockDb.users).map(k => {
        const u = mockDb.users[k];
        return {
          playerId: u.playerId,
          firstName: u.firstName,
          lastName: u.lastName,
          points: mockDb.points[u.playerId] || 0
        };
      });
      standings.sort((a, b) => b.points - a.points);
      standings.forEach((s, idx) => s.rank = idx + 1);
      return { seasonYear: '2026', standings };
    }

    case 'getSessionRoster': {
      const session = mockDb.sessions.find(s => s.sessionId === data.sessionId);
      if (!session) throw new Error('SESSION_NOT_FOUND');
      const roster = Object.values(mockDb.users).map(u => ({
        playerId: u.playerId,
        firstName: u.firstName,
        lastName: u.lastName,
        registrationState: session.registrations[u.playerId] || 'UNDECIDED',
        attendanceState: session.attendance[u.playerId] || 'UNKNOWN'
      }));
      return { session, roster };
    }

    case 'setAttendance': {
      const session = mockDb.sessions.find(s => s.sessionId === data.sessionId);
      if (!session) throw new Error('SESSION_NOT_FOUND');
      session.attendance[data.playerId] = data.state;
      return { sessionId: data.sessionId, playerId: data.playerId, state: data.state };
    }

    case 'closeSession': {
      const session = mockDb.sessions.find(s => s.sessionId === data.sessionId);
      if (!session) throw new Error('SESSION_NOT_FOUND');
      session.status = 'CLOSED';

      // Award points
      let awarded = 0;
      Object.keys(session.attendance).forEach(pId => {
        if (session.attendance[pId] === 'PRESENT') {
          mockDb.points[pId] = (mockDb.points[pId] || 0) + 1;
          awarded++;
        }
      });
      return { sessionId: session.sessionId, status: 'CLOSED', awardedCount: awarded };
    }

    case 'generateSessions': {
      return { generatedCount: 3, prefilledRegistrations: 6 };
    }

    case 'getSystemHealth': {
      return { status: 'HEALTHY', allTablesPresent: true, unresolvedCloseBatches: 0 };
    }

    default:
      throw new Error('UNKNOWN_ACTION');
  }
}

// Navigation & Tab Switching
function switchTab(tabName) {
  state.activeTab = tabName;
  dom.navTabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  dom.tabContents.forEach(content => {
    content.classList.toggle('active', content.id === `tab-${tabName}`);
  });

  if (tabName === 'sessions') loadSessions();
  if (tabName === 'preferences') loadPreferences();
  if (tabName === 'leaderboard') loadLeaderboard();
  if (tabName === 'admin') loadOrgaTab();
}

dom.navTabs.forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

// Persona Change (Anna, Ben, Orga, Admin, Google)
dom.personaSelect.addEventListener('change', async e => {
  state.persona = e.target.value;
  if (state.persona === 'google') {
    dom.googleAuthContainer.style.display = 'block';
    initGoogleSignIn();
  } else {
    dom.googleAuthContainer.style.display = 'none';
    await initUser();
  }
});

// Init User Profile
async function initUser() {
  try {
    const me = await callApi('whoami');
    state.currentUser = me;
    dom.userName.textContent = `${me.firstName} ${me.lastName}`;
    dom.roleBadge.textContent = me.role;

    // Show Orga/Admin tab if role permits
    const canSeeAdmin = me.role === 'ORGANIZER' || me.role === 'ADMIN';
    dom.adminNavTab.style.display = canSeeAdmin ? 'flex' : 'none';

    await loadSessions();
  } catch (err) {
    showToast(`Fehler beim Laden: ${err.message}`);
  }
}

// Sessions & Personal Rank Rendering
async function loadSessions() {
  try {
    const [sessions] = await Promise.all([
      callApi('listSessions'),
      loadPlayerRank()
    ]);
    state.sessions = sessions;
    renderSessions(sessions);
  } catch (err) {
    dom.sessionList.innerHTML = `<p style="color: var(--danger);">Fehler: ${err.message}</p>`;
  }
}

// User Personal Rank in Current Year
async function loadPlayerRank() {
  if (!dom.playerRankSummary || !state.currentUser) return;
  try {
    const currentYear = String(new Date().getFullYear());
    const data = await callApi('getLeaderboard', { seasonYear: currentYear });
    state.leaderboard = data.standings || [];
    renderPlayerRankSummary(state.leaderboard, currentYear);
  } catch (err) {
    console.warn('Ranglisten-Platzierung konnte nicht geladen werden:', err);
  }
}

function renderPlayerRankSummary(standings, currentYear) {
  if (!dom.playerRankSummary) return;
  const myId = state.currentUser ? state.currentUser.playerId : null;
  const myEntry = standings.find(s => s.playerId === myId);

  let icon = '🏆';
  let placeText = 'Noch keine Wertung';
  let pointsText = '0 Teilnahmen';

  if (myEntry) {
    if (myEntry.rank === 1) icon = '🥇';
    else if (myEntry.rank === 2) icon = '🥈';
    else if (myEntry.rank === 3) icon = '🥉';
    else icon = '🏅';

    placeText = `Platz <strong>#${myEntry.rank}</strong>`;
    pointsText = `<strong>${myEntry.points}</strong> ${myEntry.points === 1 ? 'Teilnahme' : 'Teilnahmen'}`;
  }

  dom.playerRankSummary.innerHTML = `
    <div class="player-rank-card" id="openLeaderboardCard" role="button" tabindex="0" aria-label="Rangliste öffnen. Deine Platzierung: ${myEntry ? 'Platz ' + myEntry.rank + ' mit ' + myEntry.points + ' Teilnahmen' : 'Noch keine Wertung'}">
      <div class="player-rank-left">
        <div class="player-rank-icon">${icon}</div>
        <div class="player-rank-text">
          <div class="player-rank-title">Deine Trainingswertung ${currentYear}</div>
          <div class="player-rank-stats">
            <span class="player-rank-place">${placeText}</span>
            <span class="player-rank-dot">&bull;</span>
            <span class="player-rank-points">${pointsText}</span>
          </div>
        </div>
      </div>
      <div class="player-rank-cta">
        Rangliste ➔
      </div>
    </div>
  `;

  const cardBtn = dom.playerRankSummary.querySelector('#openLeaderboardCard');
  if (cardBtn) {
    cardBtn.addEventListener('click', () => switchTab('leaderboard'));
    cardBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        switchTab('leaderboard');
      }
    });
  }
}

function formatDate(isoDate) {
  const [yyyy, mm, dd] = isoDate.split('-');
  const dateObj = new Date(isoDate);
  const weekdays = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const dayName = weekdays[dateObj.getDay()];
  return `${dayName} ${dd}.${mm}.${yyyy}`;
}

function renderSessions(sessions) {
  dom.sessionList.replaceChildren();

  if (sessions.length === 0) {
    dom.sessionList.innerHTML = '<p style="color: var(--gray-600); text-align: center; padding: 24px;">Keine anstehenden Termine.</p>';
    return;
  }

  sessions.forEach(session => {
    const card = document.createElement('article');
    const regClass = session.myRegistration ? session.myRegistration.toLowerCase() : '';
    card.className = `session-card ${session.status === 'CLOSED' ? 'closed' : regClass}`;

    let badgeClass = 'badge-undecided';
    let badgeLabel = 'Nicht reagiert';
    if (session.status === 'CLOSED') {
      badgeClass = 'badge-closed';
      badgeLabel = 'Abgeschlossen';
    } else if (session.myRegistration === 'CONFIRMED') {
      badgeClass = 'badge-confirmed';
      badgeLabel = '✓ Angemeldet';
    } else if (session.myRegistration === 'DECLINED') {
      badgeClass = 'badge-declined';
      badgeLabel = '✗ Abgemeldet';
    } else if (session.myRegistration === 'WAITLISTED') {
      badgeClass = 'badge-waitlisted';
      badgeLabel = '⏳ Warteliste';
    }

    const regLabel = session.confirmedCount === 1 ? 'Anmeldung' : 'Anmeldungen';

    card.innerHTML = `
      <div class="session-header">
        <div>
          <div class="session-date">${formatDate(session.dateLocal)}</div>
          <div class="session-venue">📍 Halle ${session.venue} &bull; ${session.startLocal} - ${session.endLocal} Uhr</div>
        </div>
        <span class="session-status-badge ${badgeClass}">${badgeLabel}</span>
      </div>

      <div class="registration-count-box">
        <span class="count-icon">👥</span>
        <span class="count-text"><strong class="count-number">${session.confirmedCount}</strong> ${regLabel}</span>
      </div>

      ${session.status === 'OPEN' ? `
        <div class="action-buttons">
          <button class="btn btn-confirm" data-action="CONFIRMED" ${session.myRegistration === 'CONFIRMED' ? 'disabled' : ''}>
            ✓ Zusagen
          </button>
          <button class="btn btn-decline" data-action="DECLINED" ${session.myRegistration === 'DECLINED' ? 'disabled' : ''}>
            ✗ Absagen
          </button>
        </div>
      ` : '<p style="font-size: 0.8rem; color: var(--gray-600); margin-top: 8px;">Dieser Spieltag ist bereits abgeschlossen.</p>'}
    `;

    // 1-Click Handlers with Loading State
    const confirmBtn = card.querySelector('[data-action="CONFIRMED"]');
    const declineBtn = card.querySelector('[data-action="DECLINED"]');

    [confirmBtn, declineBtn].forEach(btn => {
      if (!btn) return;
      btn.addEventListener('click', async () => {
        const stateToSet = btn.dataset.action;
        btn.disabled = true;
        try {
          const res = await callApi('setRegistration', { sessionId: session.sessionId, state: stateToSet });
          showToast(`Erfolgreich gespeichert: ${res.state === 'CONFIRMED' ? 'Zusage ✓' : res.state === 'WAITLISTED' ? 'Warteliste ⏳' : 'Absage ✗'}`);
          await loadSessions();
        } catch (err) {
          showToast(`Fehler: ${err.message}`);
          btn.disabled = false;
        }
      });
    });

    dom.sessionList.append(card);
  });
}

dom.refreshSessionsBtn.addEventListener('click', () => loadSessions());

// Preferences Tab
async function loadPreferences() {
  try {
    const prefs = await callApi('getPreferences');
    state.preferences = prefs;
    Object.keys(dom.prefInputs).forEach(tplId => {
      if (dom.prefInputs[tplId]) {
        dom.prefInputs[tplId].checked = prefs[tplId] === true;
      }
    });
  } catch (err) {
    showToast(`Fehler beim Laden der Präferenzen: ${err.message}`);
  }
}

dom.savePreferencesBtn.addEventListener('click', async () => {
  dom.savePreferencesBtn.disabled = true;
  try {
    const payload = {};
    Object.keys(dom.prefInputs).forEach(tplId => {
      payload[tplId] = dom.prefInputs[tplId].checked;
    });
    await callApi('setPreferences', payload);
    showToast('Stammtage erfolgreich gespeichert! ✓');
  } catch (err) {
    showToast(`Fehler: ${err.message}`);
  } finally {
    dom.savePreferencesBtn.disabled = false;
  }
});

// Leaderboard Tab
async function loadLeaderboard() {
  try {
    const data = await callApi('getLeaderboard', { seasonYear: '2026' });
    state.leaderboard = data.standings;
    renderLeaderboard(data.standings);
  } catch (err) {
    dom.leaderboardBody.innerHTML = `<tr><td colspan="3" style="color: var(--danger);">Fehler: ${err.message}</td></tr>`;
  }
}

function renderLeaderboard(standings) {
  dom.leaderboardBody.replaceChildren();
  if (standings.length === 0) {
    dom.leaderboardBody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--gray-600);">Noch keine Wertungen.</td></tr>';
    return;
  }

  standings.forEach(item => {
    const tr = document.createElement('tr');
    const isMe = state.currentUser && item.playerId === state.currentUser.playerId;
    if (isMe) tr.className = 'highlight-me';

    let rankDisplay = item.rank;
    let rankClass = '';
    if (item.rank === 1) { rankDisplay = '🥇'; rankClass = 'rank-1'; }
    else if (item.rank === 2) { rankDisplay = '🥈'; rankClass = 'rank-2'; }
    else if (item.rank === 3) { rankDisplay = '🥉'; rankClass = 'rank-3'; }

    tr.innerHTML = `
      <td><span class="rank-badge ${rankClass}">${rankDisplay}</span></td>
      <td>${item.firstName} ${item.lastName} ${isMe ? '<strong>(Du)</strong>' : ''}</td>
      <td style="text-align: right; font-weight: 700;">${item.points}</td>
    `;
    dom.leaderboardBody.append(tr);
  });
}

dom.refreshLeaderboardBtn.addEventListener('click', () => loadLeaderboard());

// Organizer & Admin Tab
async function loadOrgaTab() {
  dom.orgaSessionSelect.replaceChildren();
  state.sessions.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.sessionId;
    opt.textContent = `${formatDate(s.dateLocal)} (${s.venue}) - Status: ${s.status}`;
    dom.orgaSessionSelect.append(opt);
  });

  if (state.sessions.length > 0) {
    await loadRoster(state.sessions[0].sessionId);
  }
}

dom.orgaSessionSelect.addEventListener('change', e => {
  loadRoster(e.target.value);
});

async function loadRoster(sessionId) {
  try {
    const data = await callApi('getSessionRoster', { sessionId });
    renderRoster(sessionId, data.roster, data.session);
  } catch (err) {
    dom.orgaRosterContainer.innerHTML = `<p style="color: var(--danger);">Fehler: ${err.message}</p>`;
  }
}

function renderRoster(sessionId, roster, session) {
  dom.orgaRosterContainer.replaceChildren();

  const isClosed = session.status === 'CLOSED';
  dom.closeSessionBtn.disabled = isClosed;
  dom.closeSessionBtn.textContent = isClosed ? '✓ Spieltag bereits abgeschlossen' : '🔒 Spieltag abschließen & Punkte gutschreiben';

  if (roster.length === 0) {
    dom.orgaRosterContainer.innerHTML = '<p style="color: var(--gray-600); font-size: 0.85rem;">Keine Anmeldungen für diesen Termin.</p>';
    return;
  }

  roster.forEach(player => {
    const row = document.createElement('div');
    row.style = 'display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--gray-100);';

    const isPresent = player.attendanceState === 'PRESENT';

    row.innerHTML = `
      <div>
        <div style="font-weight: 600; font-size: 0.9rem;">${player.firstName} ${player.lastName}</div>
        <div style="font-size: 0.75rem; color: var(--gray-600);">Status: ${player.registrationState}</div>
      </div>
      <div>
        <button class="btn ${isPresent ? 'btn-confirm' : 'btn-decline'}" style="padding: 6px 12px; font-size: 0.8rem; min-height: 36px;" ${isClosed ? 'disabled' : ''}>
          ${isPresent ? '✓ Anwesend' : 'Abwesend'}
        </button>
      </div>
    `;

    const btn = row.querySelector('button');
    btn.addEventListener('click', async () => {
      const nextState = isPresent ? 'ABSENT' : 'PRESENT';
      btn.disabled = true;
      try {
        await callApi('setAttendance', { sessionId, playerId: player.playerId, state: nextState });
        await loadRoster(sessionId);
      } catch (err) {
        showToast(`Fehler: ${err.message}`);
        btn.disabled = false;
      }
    });

    dom.orgaRosterContainer.append(row);
  });
}

dom.closeSessionBtn.addEventListener('click', async () => {
  const sessionId = dom.orgaSessionSelect.value;
  if (!confirm('Möchtest du diesen Spieltag wirklich abschließen? Allen als anwesend markierten Spielern wird +1 Punkt gutgeschrieben.')) {
    return;
  }

  dom.closeSessionBtn.disabled = true;
  try {
    const res = await callApi('closeSession', { sessionId });
    showToast(`Spieltag abgeschlossen! ${res.awardedCount} Punkte gutgeschrieben.`);
    await loadSessions();
    await loadOrgaTab();
  } catch (err) {
    showToast(`Fehler beim Abschluss: ${err.message}`);
    dom.closeSessionBtn.disabled = false;
  }
});

dom.generateSessionsBtn.addEventListener('click', async () => {
  try {
    const res = await callApi('generateSessions', { daysAhead: 28 });
    showToast(`${res.generatedCount} Termine generiert (${res.prefilledRegistrations} Voranmeldungen).`);
    await loadSessions();
  } catch (err) {
    showToast(`Fehler: ${err.message}`);
  }
});

dom.systemHealthBtn.addEventListener('click', async () => {
  try {
    const res = await callApi('getSystemHealth');
    alert(`Systemstatus: ${res.status}\nAlle Tabellen vorhanden: ${res.allTablesPresent ? 'Ja' : 'Nein'}\nOffene Batches: ${res.unresolvedCloseBatches}`);
  } catch (err) {
    showToast(`Fehler: ${err.message}`);
  }
});

// Google Identity Services (GIS) Integration
function initGoogleSignIn() {
  if (!window.google?.accounts?.id) return;
  window.google.accounts.id.initialize({
    client_id: cfg.googleClientId,
    callback: response => {
      state.idToken = response.credential;
      showToast('Google-Token empfangen!');
      initUser();
    },
    auto_select: false
  });
  window.google.accounts.id.renderButton(dom.googleButton, {
    theme: 'outline', size: 'large', text: 'signin_with'
  });
}

// Start Application
initUser();
