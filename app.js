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

const cfg = window.BADMINTON_CONFIG || {};

// Demo data only by explicit config, or on a local dev server with ?demo=1. Never the default.
const isLocalHost = ['localhost', '127.0.0.1'].includes(location.hostname);
const demoMode = cfg.demoMode === true || (isLocalHost && new URLSearchParams(location.search).has('demo'));
const isConfigured = Boolean(cfg.gatewayUrl) && !/YOUR-WORKER/.test(cfg.gatewayUrl);

// The device key keeps a phone signed in. Storage can be unavailable, then the code is asked for again.
const DEVICE_TOKEN_KEY = 'bms_device_token';

function loadDeviceToken() {
  try {
    return localStorage.getItem(DEVICE_TOKEN_KEY);
  } catch {
    return null;
  }
}

function saveDeviceToken(token) {
  state.deviceToken = token;
  try {
    if (token) localStorage.setItem(DEVICE_TOKEN_KEY, token);
    else localStorage.removeItem(DEVICE_TOKEN_KEY);
  } catch {
    // Stays signed in until the page is closed
  }
}

const ROLE_LABELS = { PLAYER: 'Spieler', ORGANIZER: 'Trainer', ADMIN: 'Admin' };
const WEEKDAYS = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

// Global App State
const state = {
  activeTab: 'sessions',
  persona: demoMode ? 'anna' : 'live', // 'anna' | 'ben' | 'orga' | 'admin' | 'live'
  currentUser: null,
  deviceToken: loadDeviceToken(),
  sessions: [],
  preferences: {},
  leaderboard: [],
  orgaRoster: [],
  templates: [],
  trainers: [],
  orgaView: 'menu',
  orgaSessionId: null
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
      confirmedCount: 14,
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
      confirmedCount: 8,
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
      confirmedCount: 16,
      registrations: { 'p-anna': 'CONFIRMED', 'p-ben': 'CONFIRMED' },
      attendance: {}
    }
  ],
  templates: [
    { templateId: 'tpl-mo', weekdayIso: 1, venue: 'PARK', startLocal: '19:30', endLocal: '22:30', active: true, audience: 'ADULT', trainerPlayerId: 'p-orga' },
    { templateId: 'tpl-di', weekdayIso: 2, venue: 'MZH', startLocal: '17:30', endLocal: '20:00', active: true, audience: 'ADULT', trainerPlayerId: '' },
    { templateId: 'tpl-do', weekdayIso: 4, venue: 'MZH', startLocal: '20:00', endLocal: '22:00', active: true, audience: 'ADULT', trainerPlayerId: '' }
  ],
  venues: ['PARK', 'MZH'],
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
  personaWrap: document.getElementById('personaWrap'),
  demoBanner: document.getElementById('demoBanner'),
  currentYear: document.getElementById('currentYear'),
  loginBox: document.getElementById('loginBox'),
  inviteCode: document.getElementById('inviteCode'),
  redeemBtn: document.getElementById('redeemBtn'),
  playerRankSummary: document.getElementById('playerRankSummary'),
  sessionList: document.getElementById('sessionList'),
  refreshSessionsBtn: document.getElementById('refreshSessionsBtn'),
  savePreferencesBtn: document.getElementById('savePreferencesBtn'),
  refreshLeaderboardBtn: document.getElementById('refreshLeaderboardBtn'),
  leaderboardBody: document.getElementById('leaderboardBody'),
  adminNavTab: document.getElementById('adminNavTab'),
  orgaNextBtn: document.getElementById('orgaNextBtn'),
  orgaMenuAccess: document.getElementById('orgaMenuAccess'),
  orgaMenuSystem: document.getElementById('orgaMenuSystem'),
  orgaSessionTitle: document.getElementById('orgaSessionTitle'),
  orgaSessionHint: document.getElementById('orgaSessionHint'),
  orgaSessionList: document.getElementById('orgaSessionList'),
  closeBox: document.getElementById('closeBox'),
  correctPlayer: document.getElementById('correctPlayer'),
  correctYear: document.getElementById('correctYear'),
  correctInfo: document.getElementById('correctInfo'),
  correctDelta: document.getElementById('correctDelta'),
  correctReason: document.getElementById('correctReason'),
  correctBtn: document.getElementById('correctBtn'),
  orgaRosterContainer: document.getElementById('orgaRosterContainer'),
  closeSessionBtn: document.getElementById('closeSessionBtn'),
  systemHealthBtn: document.getElementById('systemHealthBtn'),
  walkInBox: document.getElementById('walkInBox'),
  walkInSelect: document.getElementById('walkInSelect'),
  walkInBtn: document.getElementById('walkInBtn'),
  cancelSessionBox: document.getElementById('cancelSessionBox'),
  cancelReason: document.getElementById('cancelReason'),
  cancelSessionBtn: document.getElementById('cancelSessionBtn'),
  linkCard: document.getElementById('linkCard'),
  linkPlayerSelect: document.getElementById('linkPlayerSelect'),
  inviteResult: document.getElementById('inviteResult'),
  inviteCodeOut: document.getElementById('inviteCodeOut'),
  inviteExpiry: document.getElementById('inviteExpiry'),
  linkRole: document.getElementById('linkRole'),
  linkBtn: document.getElementById('linkBtn'),
  unlinkBtn: document.getElementById('unlinkBtn'),
  navTabs: document.querySelectorAll('.nav-tab'),
  tabContents: document.querySelectorAll('.tab-content'),
  prefList: document.getElementById('prefList'),
  adminToolsCard: document.getElementById('adminToolsCard'),
  sessionEditBox: document.getElementById('sessionEditBox'),
  editStart: document.getElementById('editStart'),
  editEnd: document.getElementById('editEnd'),
  editVenue: document.getElementById('editVenue'),
  saveSessionBtn: document.getElementById('saveSessionBtn'),
  newSessionCard: document.getElementById('newSessionCard'),
  newDate: document.getElementById('newDate'),
  newStart: document.getElementById('newStart'),
  newEnd: document.getElementById('newEnd'),
  newVenue: document.getElementById('newVenue'),
  createSessionBtn: document.getElementById('createSessionBtn'),
  templateCard: document.getElementById('templateCard'),
  templateSelect: document.getElementById('templateSelect'),
  templateWeekday: document.getElementById('templateWeekday'),
  templateStart: document.getElementById('templateStart'),
  templateEnd: document.getElementById('templateEnd'),
  templateVenue: document.getElementById('templateVenue'),
  templateTrainer: document.getElementById('templateTrainer'),
  templateAudience: document.getElementById('templateAudience'),
  templateActive: document.getElementById('templateActive'),
  templateApply: document.getElementById('templateApply'),
  templateApplyWrap: document.getElementById('templateApplyWrap'),
  saveTemplateBtn: document.getElementById('saveTemplateBtn')
};

// Toast Notification
function showToast(message, duration = 3000) {
  dom.toast.textContent = message;
  dom.toast.classList.add('show');
  setTimeout(() => dom.toast.classList.remove('show'), duration);
}

// Everything that ends up in innerHTML goes through here
function esc(value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, c => map[c]);
}

const ERROR_MESSAGES = {
  UNAUTHENTICATED: 'Bitte melde dich mit deinem Einladungscode an.',
  UNLINKED_ACCOUNT: 'Dieser Zugang ist nicht aktiv. Bitte hol dir beim Admin einen neuen Einladungscode.',
  INVALID_INVITE: 'Dieser Code ist ungültig, abgelaufen oder wurde schon benutzt.',
  RATE_LIMITED: 'Zu viele falsche Codes. Bitte versuche es in einer Viertelstunde noch einmal.',
  FORBIDDEN: 'Dafür fehlt dir die Berechtigung.',
  SESSION_NOT_OPEN: 'Dieser Termin ist nicht mehr offen. Nichts wurde gespeichert.',
  SESSION_ALREADY_CLOSED: 'Dieser Termin ist bereits abgeschlossen. Nichts wurde gespeichert.',
  SESSION_NOT_FOUND: 'Dieser Termin wurde nicht gefunden.',
  PLAYER_NOT_FOUND: 'Dieser Spieler wurde nicht gefunden oder ist nicht aktiv.',
  INVALID_SESSION_DATA: 'Bitte prüfe Datum, Halle und Uhrzeiten. Das Ende muss nach dem Beginn liegen.',
  INVALID_TEMPLATE_DATA: 'Bitte prüfe Halle und Uhrzeiten. Der Wochentag eines Standardtermins lässt sich nicht ändern.',
  TEMPLATE_NOT_FOUND: 'Dieser Standardtermin wurde nicht gefunden.',
  INVALID_CORRECTION_DATA: 'Bitte wähle einen Spieler und gib ganze Punkte ungleich 0 sowie eine Begründung an.',
  INVALID_CANCEL_DATA: 'Bitte gib einen Grund für die Absage an.',
  INVALID_INVITE_DATA: 'Bitte prüfe Spieler und Rolle.',
  IDENTITY_NOT_LINKED: 'Dieser Spieler hat keinen aktiven Zugang.',
  SELF_LOCKOUT: 'Deine eigene Rolle und deinen eigenen Zugang kannst du nicht ändern.',
  RECOVERY_REQUIRED: 'Der Abschluss ist unvollständig und wurde gestoppt. Punkte prüfen, bitte den Admin informieren.',
  UPSTREAM_UNAVAILABLE: 'Der Server ist gerade nicht erreichbar. Nichts wurde gespeichert.',
  NETWORK: 'Keine Verbindung zum Server. Nichts wurde gespeichert.'
};

function apiError(code) {
  const err = new Error(ERROR_MESSAGES[code] || `Unerwarteter Fehler (${code}). Nichts wurde gespeichert.`);
  err.code = code;
  return err;
}

// API Dispatcher (Mock vs Gateway)
async function callApi(action, data = {}) {
  // Demo Mode: run local mock backend
  if (state.persona !== 'live') {
    return runMockApi(action, data);
  }

  // Live Gateway Mode
  if (!state.deviceToken && action !== 'redeemInvite') {
    throw apiError('UNAUTHENTICATED');
  }

  let response;
  try {
    response = await fetch(cfg.gatewayUrl.replace(/\/$/, '') + '/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, data, deviceToken: state.deviceToken }),
      cache: 'no-store'
    });
  } catch {
    throw apiError('NETWORK');
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw apiError('BACKEND_ERROR');
  }
  if (!response.ok || !result.ok) {
    // The key is useless now (blocked or replaced by a new device), ask for a code again
    if (result.code === 'UNAUTHENTICATED' || result.code === 'UNLINKED_ACCOUNT') {
      saveDeviceToken(null);
      showSignedOut(ERROR_MESSAGES[result.code]);
    }
    throw apiError(result.code || 'BACKEND_ERROR');
  }
  if (result.deviceToken) saveDeviceToken(result.deviceToken);
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
          confirmedCount: s.confirmedCount,
          audience: s.audience || 'ADULT',
          trainerName: s.trainerName || '',
          myRegistration: myReg
        };
      });
    }

    case 'setRegistration': {
      const session = mockDb.sessions.find(s => s.sessionId === data.sessionId);
      if (!session) throw apiError('SESSION_NOT_FOUND');
      if (session.status !== 'OPEN') throw apiError('SESSION_NOT_OPEN');

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
      if (!session) throw apiError('SESSION_NOT_FOUND');
      const isListed = u => session.registrations[u.playerId] || session.attendance[u.playerId];
      const users = Object.values(mockDb.users);
      const roster = users.filter(isListed).map(u => ({
        playerId: u.playerId,
        firstName: u.firstName,
        lastName: u.lastName,
        registrationState: session.registrations[u.playerId] || 'UNDECIDED',
        attendanceState: session.attendance[u.playerId] || 'UNKNOWN'
      }));
      const otherPlayers = users.filter(u => !isListed(u)).map(u => ({
        playerId: u.playerId,
        firstName: u.firstName,
        lastName: u.lastName
      }));
      return { session, roster, otherPlayers };
    }

    case 'setAttendance': {
      const session = mockDb.sessions.find(s => s.sessionId === data.sessionId);
      if (!session) throw apiError('SESSION_NOT_FOUND');
      if (session.status !== 'OPEN') throw apiError('SESSION_NOT_OPEN');
      session.attendance[data.playerId] = data.state;
      return { sessionId: data.sessionId, playerId: data.playerId, state: data.state };
    }

    case 'closeSession': {
      const session = mockDb.sessions.find(s => s.sessionId === data.sessionId);
      if (!session) throw apiError('SESSION_NOT_FOUND');
      session.status = 'CLOSED';

      // A confirmation counts as attendance unless a trainer set ABSENT
      Object.keys(session.registrations).forEach(pId => {
        if (session.registrations[pId] === 'CONFIRMED' && !session.attendance[pId]) session.attendance[pId] = 'PRESENT';
      });

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

    case 'cancelSession': {
      if (user.role === 'PLAYER') throw apiError('FORBIDDEN');
      const session = mockDb.sessions.find(s => s.sessionId === data.sessionId);
      if (!session) throw apiError('SESSION_NOT_FOUND');
      if (!String(data.reason || '').trim()) throw apiError('INVALID_CANCEL_DATA');
      if (session.status !== 'OPEN') throw apiError('SESSION_NOT_OPEN');
      session.status = 'CANCELED';
      return { sessionId: session.sessionId, status: 'CANCELED' };
    }

    case 'listPlayerLinks': {
      const players = Object.values(mockDb.users).map(u => {
        const role = u.linked === false ? '' : u.role;
        return { playerId: u.playerId, firstName: u.firstName, lastName: u.lastName, linked: u.linked !== false, role, deviceCount: u.linked === false ? 0 : 1, invitePending: u.invitePending === true };
      });
      return { players };
    }

    case 'createInvite': {
      const target = Object.values(mockDb.users).find(u => u.playerId === data.playerId);
      if (!target) throw apiError('PLAYER_NOT_FOUND');
      if (target.playerId === user.playerId && data.role !== user.role) throw apiError('SELF_LOCKOUT');
      target.invitePending = true;
      return {
        playerId: target.playerId,
        role: data.role,
        code: 'DEMO2-CODE3',
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString()
      };
    }

    case 'unlinkIdentity': {
      const target = Object.values(mockDb.users).find(u => u.playerId === data.playerId);
      if (!target) throw apiError('PLAYER_NOT_FOUND');
      if (target.playerId === user.playerId) throw apiError('SELF_LOCKOUT');
      if (target.linked === false && !target.invitePending) throw apiError('IDENTITY_NOT_LINKED');
      target.linked = false;
      target.invitePending = false;
      return { playerId: target.playerId, linked: false };
    }

    case 'correctPoints': {
      if (user.role !== 'ADMIN') throw apiError('FORBIDDEN');
      const delta = Number(data.delta);
      if (!data.playerId || !Number.isSafeInteger(delta) || delta === 0 || !String(data.reason || '').trim()) throw apiError('INVALID_CORRECTION_DATA');
      mockDb.points[data.playerId] = (mockDb.points[data.playerId] || 0) + delta;
      return { success: true, newDelta: delta };
    }

    case 'listTemplates': {
      const canManage = user.role !== 'PLAYER';
      const trainers = Object.values(mockDb.users).filter(u => u.role !== 'PLAYER').map(u => ({ playerId: u.playerId, name: u.firstName + ' ' + u.lastName }));
      return { templates: mockDb.templates.filter(t => canManage || t.active), venues: [...mockDb.venues], trainers: canManage ? trainers : [] };
    }

    case 'saveTemplate': {
      if (user.role === 'PLAYER') throw apiError('FORBIDDEN');
      if (!mockDb.venues.includes(data.venue) || !data.startLocal || !data.endLocal || data.endLocal <= data.startLocal) throw apiError('INVALID_TEMPLATE_DATA');
      const { templateId, applyToExisting, ...fields } = data;
      const existing = mockDb.templates.find(t => t.templateId === templateId);
      if (existing && existing.weekdayIso !== data.weekdayIso) throw apiError('INVALID_TEMPLATE_DATA');
      let updatedSessions = 0;
      if (existing) {
        Object.assign(existing, fields);
        if (applyToExisting) {
          mockDb.sessions.filter(s => s.templateId === templateId && s.status === 'OPEN').forEach(s => {
            const trainer = Object.values(mockDb.users).find(u => u.playerId === data.trainerPlayerId);
            Object.assign(s, { venue: data.venue, startLocal: data.startLocal, endLocal: data.endLocal, audience: data.audience, trainerName: trainer ? trainer.firstName + ' ' + trainer.lastName : '' });
            updatedSessions++;
          });
        }
        return { templateId, updatedSessions, generatedCount: 0 };
      }
      const created = { templateId: 'tpl-demo-' + mockDb.templates.length, ...fields };
      mockDb.templates.push(created);
      return { templateId: created.templateId, updatedSessions, generatedCount: 4 };
    }

    case 'createSession': {
      if (user.role === 'PLAYER') throw apiError('FORBIDDEN');
      if (!data.dateLocal || !data.venue || !data.startLocal || !data.endLocal || data.endLocal <= data.startLocal) throw apiError('INVALID_SESSION_DATA');
      const sessionId = 'ses-demo-' + mockDb.sessions.length;
      mockDb.sessions.push({ sessionId, templateId: '', dateLocal: data.dateLocal, venue: data.venue, startLocal: data.startLocal, endLocal: data.endLocal, status: 'OPEN', confirmedCount: 0, registrations: {}, attendance: {} });
      mockDb.sessions.sort((a, b) => a.dateLocal.localeCompare(b.dateLocal));
      return { sessionId };
    }

    case 'updateSession': {
      if (user.role === 'PLAYER') throw apiError('FORBIDDEN');
      const session = mockDb.sessions.find(s => s.sessionId === data.sessionId);
      if (!session) throw apiError('SESSION_NOT_FOUND');
      if (session.status !== 'OPEN') throw apiError('SESSION_NOT_OPEN');
      if (!data.venue || !data.startLocal || !data.endLocal || data.endLocal <= data.startLocal) throw apiError('INVALID_SESSION_DATA');
      Object.assign(session, { venue: data.venue, startLocal: data.startLocal, endLocal: data.endLocal });
      return { sessionId: session.sessionId };
    }

    case 'getSystemHealth': {
      return { status: 'HEALTHY', allTablesPresent: true, unresolvedCloseBatches: 0 };
    }

    default:
      throw apiError('UNKNOWN_ACTION');
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

  if (!state.currentUser) return;
  if (tabName === 'sessions') loadSessions();
  if (tabName === 'preferences') loadPreferences();
  if (tabName === 'leaderboard') loadLeaderboard();
  if (tabName === 'admin') {
    showOrgaView('menu', false);
    loadOrgaTab();
  }
}

dom.navTabs.forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

// Persona Change (demo only)
dom.personaSelect.addEventListener('change', async e => {
  state.persona = e.target.value;
  await initUser();
});

// Nobody signed in: no data on screen, a clear message instead
function showSignedOut(message) {
  state.currentUser = null;
  dom.userName.textContent = 'Nicht angemeldet';
  dom.roleBadge.textContent = 'Gast';
  dom.adminNavTab.style.display = 'none';
  dom.playerRankSummary.replaceChildren();
  dom.loginBox.style.display = state.persona === 'live' && isConfigured && !state.deviceToken ? 'block' : 'none';
  if (state.activeTab === 'admin') switchTab('sessions');
  dom.sessionList.innerHTML = `
    <p style="color: var(--gray-600); text-align: center; padding: 24px;">${esc(message)}</p>
  `;
}

// Init User Profile
async function initUser() {
  try {
    const me = await callApi('whoami');
    state.currentUser = me;
    dom.userName.textContent = `${me.firstName} ${me.lastName}`;
    dom.roleBadge.textContent = ROLE_LABELS[me.role] || me.role;
    dom.loginBox.style.display = 'none';

    // Show Orga/Admin tab if role permits
    const canSeeAdmin = me.role === 'ORGANIZER' || me.role === 'ADMIN';
    dom.adminNavTab.style.display = canSeeAdmin ? 'flex' : 'none';

    await loadSessions();
  } catch (err) {
    if (err.code !== 'UNLINKED_ACCOUNT' && err.code !== 'UNAUTHENTICATED') showSignedOut(err.message);
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
    dom.sessionList.innerHTML = `<p style="color: var(--danger);">Fehler: ${esc(err.message)}</p>`;
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
  const dateObj = new Date(`${isoDate}T12:00:00`);
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
    card.className = `session-card ${session.status !== 'OPEN' ? 'closed' : regClass}`;

    let badgeClass = 'badge-undecided';
    let badgeLabel = 'Nicht reagiert';
    if (session.status === 'CLOSED') {
      badgeClass = 'badge-closed';
      badgeLabel = 'Abgeschlossen';
    } else if (session.status === 'CANCELED') {
      badgeClass = 'badge-closed';
      badgeLabel = 'Abgesagt';
    } else if (session.status === 'CLOSING') {
      badgeClass = 'badge-closed';
      badgeLabel = 'Wird abgeschlossen';
    } else if (session.myRegistration === 'CONFIRMED') {
      badgeClass = 'badge-confirmed';
      badgeLabel = '✓ Angemeldet';
    } else if (session.myRegistration === 'DECLINED') {
      badgeClass = 'badge-declined';
      badgeLabel = '✗ Abgemeldet';
    }

    const regLabel = session.confirmedCount === 1 ? 'Anmeldung' : 'Anmeldungen';

    card.innerHTML = `
      <div class="session-header">
        <div>
          <div class="session-date">${esc(formatDate(session.dateLocal))}</div>
          <div class="session-venue">📍 Halle ${esc(session.venue)} &bull; ${esc(session.startLocal)} - ${esc(session.endLocal)} Uhr</div>
          ${session.audience === 'YOUTH' || session.trainerName ? `<div class="session-venue">${session.audience === 'YOUTH' ? '🧒 Jugend' : ''}${session.audience === 'YOUTH' && session.trainerName ? ' &bull; ' : ''}${session.trainerName ? `👤 Trainer: ${esc(session.trainerName)}` : ''}</div>` : ''}
        </div>
        <span class="session-status-badge ${badgeClass}">${badgeLabel}</span>
      </div>

      <div class="registration-count-box">
        <span class="count-icon">👥</span>
        <span class="count-text"><strong class="count-number">${esc(session.confirmedCount)}</strong> ${regLabel}</span>
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
      ` : `<p style="font-size: 0.8rem; color: var(--gray-600); margin-top: 8px;">${badgeLabel}: keine Änderung mehr möglich.</p>`}
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
          showToast(`Erfolgreich gespeichert: ${res.state === 'CONFIRMED' ? 'Zusage ✓' : 'Absage ✗'}`);
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
    const [{ templates }, prefs] = await Promise.all([callApi('listTemplates'), callApi('getPreferences')]);
    state.preferences = prefs;
    renderPreferences(templates.filter(t => t.active), prefs);
  } catch (err) {
    showToast(`Fehler beim Laden der Präferenzen: ${err.message}`);
  }
}

function renderPreferences(templates, prefs) {
  dom.prefList.replaceChildren();
  templates
    .sort((a, b) => a.weekdayIso - b.weekdayIso || a.startLocal.localeCompare(b.startLocal))
    .forEach(t => {
      const item = document.createElement('div');
      item.className = 'pref-item';
      item.innerHTML = `
        <div>
          <div class="pref-label">${esc(WEEKDAYS[t.weekdayIso])} (${esc(t.venue)})</div>
          <div class="pref-sub">${esc(t.startLocal)} – ${esc(t.endLocal)} Uhr</div>
        </div>
        <label class="switch" aria-label="${esc(WEEKDAYS[t.weekdayIso])} ${esc(t.startLocal)} automatisch vormerken">
          <input type="checkbox">
          <span class="slider"></span>
        </label>
      `;
      const input = item.querySelector('input');
      input.dataset.templateId = t.templateId;
      input.checked = prefs[t.templateId] === true;
      dom.prefList.append(item);
    });
}

dom.savePreferencesBtn.addEventListener('click', async () => {
  dom.savePreferencesBtn.disabled = true;
  try {
    const payload = {};
    dom.prefList.querySelectorAll('input[type=checkbox]').forEach(input => {
      payload[input.dataset.templateId] = input.checked;
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
    const data = await callApi('getLeaderboard', { seasonYear: String(new Date().getFullYear()) });
    state.leaderboard = data.standings;
    renderLeaderboard(data.standings);
  } catch (err) {
    dom.leaderboardBody.innerHTML = `<tr><td colspan="3" style="color: var(--danger);">Fehler: ${esc(err.message)}</td></tr>`;
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
      <td>${esc(item.firstName)} ${esc(item.lastName)} ${isMe ? '<strong>(Du)</strong>' : ''}</td>
      <td style="text-align: right; font-weight: 700;">${esc(item.points)}</td>
    `;
    dom.leaderboardBody.append(tr);
  });
}

dom.refreshLeaderboardBtn.addEventListener('click', () => loadLeaderboard());

// Organizer & Admin Tab, split into sub pages
const STATUS_LABELS = { OPEN: 'Offen', CLOSING: 'Wird abgeschlossen', CLOSED: 'Abgeschlossen', CANCELED: 'Abgesagt', PLANNED: 'Geplant' };

function showOrgaView(view, addHistory = true) {
  state.orgaView = view;
  document.querySelectorAll('.orga-view').forEach(el => {
    el.hidden = el.id !== `orga-${view}`;
  });
  // A history entry, so that the back button of the phone leads back to the menu
  if (addHistory && view !== 'menu') history.pushState({ orgaView: view }, '');
  window.scrollTo(0, 0);
}

window.addEventListener('popstate', event => {
  showOrgaView(event.state?.orgaView || 'menu', false);
});

document.querySelectorAll('.orga-back').forEach(btn => {
  btn.addEventListener('click', () => history.back());
});

document.querySelectorAll('[data-orga-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    showOrgaView(btn.dataset.orgaView);
    if (btn.dataset.orgaView === 'system') refreshCorrectInfo();
  });
});

function sessionLabel(s) {
  return `${formatDate(s.dateLocal)}, ${s.startLocal}–${s.endLocal}, ${s.venue}`;
}

async function loadOrgaTab() {
  const isAdmin = state.currentUser?.role === 'ADMIN';
  dom.orgaMenuAccess.hidden = !isAdmin;
  dom.orgaMenuSystem.hidden = !isAdmin;

  await loadSessions();
  renderOrgaMenu();

  // The lists for the selection fields, the session page needs them
  await loadTemplates();
  if (isAdmin) await loadPlayerLinks();
  if (state.orgaView === 'session' && state.orgaSessionId) await loadRoster(state.orgaSessionId);
}

function renderOrgaMenu() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' });
  const next = state.sessions.find(s => (s.status === 'OPEN' || s.status === 'CLOSING') && s.dateLocal >= today);
  dom.orgaNextBtn.hidden = !next;
  if (next) {
    dom.orgaNextBtn.replaceChildren(next.dateLocal === today ? '🏸 Heute' : '🏸 Nächster Termin');
    const detail = document.createElement('span');
    detail.textContent = sessionLabel(next);
    dom.orgaNextBtn.append(detail);
    dom.orgaNextBtn.onclick = () => openOrgaSession(next.sessionId);
  }

  dom.orgaSessionList.replaceChildren();
  if (state.sessions.length === 0) {
    dom.orgaSessionList.textContent = 'Keine Termine vorhanden.';
  }
  state.sessions.forEach(s => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'orga-menu-item';
    btn.append(sessionLabel(s));
    const status = document.createElement('span');
    status.textContent = `${STATUS_LABELS[s.status] || s.status} · ${s.confirmedCount} ${s.confirmedCount === 1 ? 'Zusage' : 'Zusagen'}`;
    btn.append(status);
    btn.addEventListener('click', () => openOrgaSession(s.sessionId));
    dom.orgaSessionList.append(btn);
  });
}

async function openOrgaSession(sessionId) {
  state.orgaSessionId = sessionId;
  dom.orgaSessionTitle.textContent = '';
  dom.orgaSessionHint.textContent = '';
  dom.orgaRosterContainer.textContent = 'Lade …';
  [dom.walkInBox, dom.sessionEditBox, dom.closeBox, dom.cancelSessionBox].forEach(box => {
    box.open = false;
    box.hidden = true;
  });
  showOrgaView('session');
  await loadRoster(sessionId);
}

function fillSelect(select, entries) {
  const selected = select.value;
  select.replaceChildren();
  entries.forEach(([value, text]) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = text;
    select.append(opt);
  });
  if (entries.some(([value]) => value === selected)) select.value = selected;
}

async function loadTemplates() {
  try {
    const { templates, venues, trainers } = await callApi('listTemplates');
    state.trainers = trainers;
    state.templates = templates.sort((a, b) => a.weekdayIso - b.weekdayIso || a.startLocal.localeCompare(b.startLocal));

    const selected = dom.templateSelect.value;
    dom.templateSelect.replaceChildren();
    state.templates.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.templateId;
      opt.textContent = `${WEEKDAYS[t.weekdayIso]} ${t.startLocal}–${t.endLocal}, ${t.venue}${t.audience === 'YOUTH' ? ', Jugend' : ''}${t.active ? '' : ' (inaktiv)'}`;
      dom.templateSelect.append(opt);
    });
    const fresh = document.createElement('option');
    fresh.value = '';
    fresh.textContent = '+ Neuer Standardtermin';
    dom.templateSelect.append(fresh);
    if ([...dom.templateSelect.options].some(o => o.value === selected)) dom.templateSelect.value = selected;
    const venueEntries = venues.map(code => [code, code]);
    [dom.editVenue, dom.newVenue, dom.templateVenue].forEach(select => fillSelect(select, venueEntries));
    fillSelect(dom.templateTrainer, [['', 'Kein Trainer'], ...trainers.map(t => [t.playerId, t.name])]);
    showTemplate();
  } catch (err) {
    showToast(`Fehler: ${err.message}`);
  }
}

function showTemplate() {
  const t = state.templates.find(x => x.templateId === dom.templateSelect.value);
  // The weekday is fixed once sessions exist for it
  dom.templateWeekday.disabled = Boolean(t);
  dom.templateWeekday.value = String(t ? t.weekdayIso : 1);
  dom.templateStart.value = t ? t.startLocal : '';
  dom.templateEnd.value = t ? t.endLocal : '';
  dom.templateVenue.value = t ? t.venue : dom.templateVenue.options[0]?.value || '';
  dom.templateTrainer.value = t ? t.trainerPlayerId : '';
  dom.templateAudience.value = t ? t.audience : 'ADULT';
  dom.templateActive.checked = t ? t.active : true;
  dom.templateApply.checked = false;
  dom.templateApplyWrap.style.display = t ? 'flex' : 'none';
}

async function loadPlayerLinks() {
  try {
    const { players } = await callApi('listPlayerLinks');
    const selected = dom.linkPlayerSelect.value;
    dom.linkPlayerSelect.replaceChildren();
    players.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.playerId;
      const devices = p.deviceCount === 1 ? '1 Gerät' : `${p.deviceCount} Geräte`;
      const status = p.linked ? `${ROLE_LABELS[p.role] || p.role}, ${devices}` : (p.invitePending ? 'Code offen' : 'kein Zugang');
      opt.textContent = `${p.firstName} ${p.lastName} (${status})`;
      dom.linkPlayerSelect.append(opt);
    });
    if (selected) dom.linkPlayerSelect.value = selected;
    fillSelect(dom.correctPlayer, players.map(p => [p.playerId, `${p.firstName} ${p.lastName}`]));
  } catch (err) {
    showToast(`Fehler: ${err.message}`);
  }
}

async function loadRoster(sessionId) {
  try {
    const data = await callApi('getSessionRoster', { sessionId });
    renderRoster(sessionId, data.roster, data.session, data.otherPlayers || []);
  } catch (err) {
    dom.orgaRosterContainer.innerHTML = `<p style="color: var(--danger);">Fehler: ${esc(err.message)}</p>`;
  }
}

function renderRoster(sessionId, roster, session, otherPlayers) {
  dom.orgaRosterContainer.replaceChildren();
  dom.orgaSessionTitle.textContent = sessionLabel(session);

  const isOpen = session.status === 'OPEN';
  const hints = {
    OPEN: 'Gegen 23 Uhr wird automatisch abgeschlossen. Bis dahin kannst du hier korrigieren.',
    CLOSING: 'Der Abschluss wurde begonnen, die Liste ist gesperrt.',
    CLOSED: 'Abgeschlossen. Korrekturen macht ein Admin über die Punktkorrektur.',
    CANCELED: 'Dieser Termin ist abgesagt.',
    PLANNED: 'Dieser Termin ist noch nicht geöffnet.'
  };
  dom.orgaSessionHint.textContent = hints[session.status] || '';

  // A confirmation counts as attendance unless a trainer set ABSENT
  const isPresent = p => p.attendanceState === 'PRESENT' || (p.attendanceState === 'UNKNOWN' && p.registrationState === 'CONFIRMED');
  const present = roster.filter(isPresent);
  const absent = roster.filter(p => !isPresent(p) && p.attendanceState === 'ABSENT');
  const addable = [...otherPlayers, ...roster.filter(p => !isPresent(p) && p.attendanceState !== 'ABSENT')]
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));

  const section = (title, players, actionLabel, nextState, btnClass) => {
    const heading = document.createElement('div');
    heading.className = 'orga-roster-title';
    heading.textContent = `${title} (${players.length})`;
    dom.orgaRosterContainer.append(heading);

    players.forEach(player => {
      const row = document.createElement('div');
      row.className = 'orga-roster-row';
      const name = document.createElement('div');
      name.textContent = [player.firstName, player.lastName].join(' ').trim();
      name.style.fontWeight = '600';
      row.append(name);
      if (isOpen) {
        const btn = document.createElement('button');
        btn.className = `btn ${btnClass}`;
        btn.textContent = actionLabel;
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            await callApi('setAttendance', { sessionId, playerId: player.playerId, state: nextState });
            await loadRoster(sessionId);
          } catch (err) {
            showToast(`Fehler: ${err.message}`);
            btn.disabled = false;
          }
        });
        row.append(btn);
      }
      dom.orgaRosterContainer.append(row);
    });
  };
  section('Anwesend', present, 'Austragen', 'ABSENT', 'btn-decline');
  if (absent.length > 0 || isOpen) section('Nicht da', absent, 'Eintragen', 'PRESENT', 'btn-confirm');

  dom.walkInBox.hidden = !isOpen || addable.length === 0;
  fillSelect(dom.walkInSelect, addable.map(p => [p.playerId, `${p.firstName} ${p.lastName}`]));

  const canEdit = isOpen || session.status === 'PLANNED';
  dom.sessionEditBox.hidden = !canEdit;
  dom.cancelSessionBox.hidden = !canEdit;
  dom.closeBox.hidden = !isOpen && session.status !== 'CLOSING';
  dom.closeSessionBtn.disabled = false;
  dom.closeSessionBtn.textContent = session.status === 'CLOSING' ? '🔁 Abschluss fortsetzen' : '🔒 Jetzt schon abschließen';
  dom.editStart.value = session.startLocal || '';
  dom.editEnd.value = session.endLocal || '';
  dom.editVenue.value = session.venue || '';
}

// Point corrections (admin only). Every correction is its own entry with a reason.
const thisYear = new Date().getFullYear();
fillSelect(dom.correctYear, [thisYear, thisYear - 1].map(year => [String(year), String(year)]));
dom.correctYear.value = String(thisYear);

async function refreshCorrectInfo() {
  dom.correctInfo.textContent = '';
  if (!dom.correctPlayer.value) return;
  try {
    const { standings } = await callApi('getLeaderboard', { seasonYear: dom.correctYear.value });
    const entry = (standings || []).find(s => s.playerId === dom.correctPlayer.value);
    dom.correctInfo.textContent = `Aktuell: ${entry ? entry.points : 0} Punkte in ${dom.correctYear.value}`;
  } catch (err) {
    showToast(`Fehler: ${err.message}`);
  }
}

dom.correctPlayer.addEventListener('change', refreshCorrectInfo);
dom.correctYear.addEventListener('change', refreshCorrectInfo);

dom.correctBtn.addEventListener('click', async () => {
  const name = dom.correctPlayer.options[dom.correctPlayer.selectedIndex]?.textContent || '';
  const delta = dom.correctDelta.value;
  if (!confirm(`${delta} Punkte für ${name} im Jahr ${dom.correctYear.value} buchen?`)) {
    return;
  }
  dom.correctBtn.disabled = true;
  try {
    await callApi('correctPoints', {
      playerId: dom.correctPlayer.value,
      delta: Number(delta),
      reason: dom.correctReason.value.trim(),
      seasonYear: dom.correctYear.value
    });
    dom.correctDelta.value = '';
    dom.correctReason.value = '';
    showToast('Korrektur gebucht.');
    await refreshCorrectInfo();
  } catch (err) {
    showToast(`Fehler: ${err.message}`, 6000);
  } finally {
    dom.correctBtn.disabled = false;
  }
});

dom.closeSessionBtn.addEventListener('click', async () => {
  const sessionId = state.orgaSessionId;
  if (!confirm('Termin jetzt schon abschließen? Sonst geschieht das automatisch gegen 23 Uhr. Alle als anwesend Markierten bekommen +1 Punkt, danach sind keine Änderungen mehr möglich.')) {
    return;
  }

  dom.closeSessionBtn.disabled = true;
  try {
    const res = await callApi('closeSession', { sessionId });
    showToast(`Spieltag abgeschlossen! ${res.awardedCount} Punkte gutgeschrieben.`);
    await loadOrgaTab();
  } catch (err) {
    showToast(`Fehler beim Abschluss: ${err.message}`, 8000);
    await loadRoster(sessionId);
  }
});

dom.walkInBtn.addEventListener('click', async () => {
  const sessionId = state.orgaSessionId;
  dom.walkInBtn.disabled = true;
  try {
    await callApi('setAttendance', { sessionId, playerId: dom.walkInSelect.value, state: 'PRESENT' });
    await loadRoster(sessionId);
  } catch (err) {
    showToast(`Fehler: ${err.message}`);
  } finally {
    dom.walkInBtn.disabled = false;
  }
});

dom.cancelSessionBtn.addEventListener('click', async () => {
  const reason = dom.cancelReason.value.trim();
  if (!reason) {
    showToast(ERROR_MESSAGES.INVALID_CANCEL_DATA);
    return;
  }
  if (!confirm('Möchtest du diesen Termin wirklich absagen? Anmeldungen bleiben gespeichert, Zu- und Absagen sind danach nicht mehr möglich.')) {
    return;
  }
  dom.cancelSessionBtn.disabled = true;
  try {
    await callApi('cancelSession', { sessionId: state.orgaSessionId, reason });
    dom.cancelReason.value = '';
    showToast('Termin abgesagt.');
    await loadOrgaTab();
  } catch (err) {
    showToast(`Fehler: ${err.message}`);
  } finally {
    dom.cancelSessionBtn.disabled = false;
  }
});

dom.linkBtn.addEventListener('click', async () => {
  dom.linkBtn.disabled = true;
  dom.inviteResult.style.display = 'none';
  try {
    const invite = await callApi('createInvite', {
      playerId: dom.linkPlayerSelect.value,
      role: dom.linkRole.value
    });
    dom.inviteCodeOut.textContent = invite.code;
    dom.inviteExpiry.textContent = `Gültig bis ${new Date(invite.expiresAt).toLocaleDateString('de-DE')}, nur einmal verwendbar. Fügt ein Gerät hinzu, ein früherer offener Code verfällt damit.`;
    dom.inviteResult.style.display = 'block';
    await loadPlayerLinks();
  } catch (err) {
    showToast(`Fehler: ${err.message}`);
  } finally {
    dom.linkBtn.disabled = false;
  }
});

dom.unlinkBtn.addEventListener('click', async () => {
  if (!confirm('Zugang wirklich sperren? Alle Geräte des Spielers werden abgemeldet, er braucht danach neue Einladungscodes.')) {
    return;
  }
  dom.unlinkBtn.disabled = true;
  try {
    await callApi('unlinkIdentity', { playerId: dom.linkPlayerSelect.value });
    dom.inviteResult.style.display = 'none';
    showToast('Zugang gesperrt.');
    await loadPlayerLinks();
  } catch (err) {
    showToast(`Fehler: ${err.message}`);
  } finally {
    dom.unlinkBtn.disabled = false;
  }
});

dom.templateSelect.addEventListener('change', showTemplate);

dom.saveSessionBtn.addEventListener('click', async () => {
  const sessionId = state.orgaSessionId;
  dom.saveSessionBtn.disabled = true;
  try {
    await callApi('updateSession', {
      sessionId,
      venue: dom.editVenue.value.trim(),
      startLocal: dom.editStart.value,
      endLocal: dom.editEnd.value
    });
    showToast('Termin geändert. Anmeldungen bleiben bestehen.');
    await loadOrgaTab();
  } catch (err) {
    showToast(`Fehler: ${err.message}`, 6000);
  } finally {
    dom.saveSessionBtn.disabled = false;
  }
});

dom.createSessionBtn.addEventListener('click', async () => {
  dom.createSessionBtn.disabled = true;
  try {
    await callApi('createSession', {
      dateLocal: dom.newDate.value,
      venue: dom.newVenue.value.trim(),
      startLocal: dom.newStart.value,
      endLocal: dom.newEnd.value
    });
    dom.newDate.value = '';
    dom.newStart.value = '';
    dom.newEnd.value = '';
    showToast('Termin angelegt.');
    await loadOrgaTab();
  } catch (err) {
    showToast(`Fehler: ${err.message}`, 6000);
  } finally {
    dom.createSessionBtn.disabled = false;
  }
});

dom.saveTemplateBtn.addEventListener('click', async () => {
  dom.saveTemplateBtn.disabled = true;
  try {
    const res = await callApi('saveTemplate', {
      templateId: dom.templateSelect.value,
      weekdayIso: Number(dom.templateWeekday.value),
      venue: dom.templateVenue.value.trim(),
      startLocal: dom.templateStart.value,
      endLocal: dom.templateEnd.value,
      trainerPlayerId: dom.templateTrainer.value,
      audience: dom.templateAudience.value,
      active: dom.templateActive.checked,
      applyToExisting: dom.templateApply.checked
    });
    dom.templateSelect.value = '';
    showToast(`Gespeichert. Angepasste Termine: ${res.updatedSessions}, neu erzeugt: ${res.generatedCount}.`, 5000);
    await loadOrgaTab();
    dom.templateSelect.value = res.templateId;
    showTemplate();
  } catch (err) {
    showToast(`Fehler: ${err.message}`, 6000);
  } finally {
    dom.saveTemplateBtn.disabled = false;
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

// Sign-in with an invitation code
async function redeemCode() {
  const code = dom.inviteCode.value.trim();
  if (!code) return;
  dom.redeemBtn.disabled = true;
  try {
    await callApi('redeemInvite', { code });
    dom.inviteCode.value = '';
    await initUser();
  } catch (err) {
    showToast(err.message, 6000);
  } finally {
    dom.redeemBtn.disabled = false;
  }
}

dom.redeemBtn.addEventListener('click', redeemCode);
dom.inviteCode.addEventListener('keydown', e => {
  if (e.key === 'Enter') redeemCode();
});

// Start Application
function startApp() {
  dom.currentYear.textContent = String(new Date().getFullYear());

  if (demoMode) {
    dom.demoBanner.style.display = 'block';
    dom.personaWrap.style.display = 'block';
    initUser();
    return;
  }

  if (!isConfigured) {
    showSignedOut('Diese App ist noch nicht eingerichtet. Es werden keine Daten angezeigt oder gespeichert.');
    return;
  }

  if (state.deviceToken) {
    initUser();
    return;
  }

  showSignedOut(ERROR_MESSAGES.UNAUTHENTICATED);
}

startApp();
