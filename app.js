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
const RANKING_GROUP_LABELS = { ADULT: 'Erwachsene', YOUTH: 'Jugend' };
const SESSION_VIEW_LABELS = { ALL: 'Alle Termine', ADULT: 'Nur Erwachsene', YOUTH: 'Nur Jugend' };
const matchesSessionView = (audience, view) => !view || view === 'ALL' || (audience || 'ADULT') === view;
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
  detailSessionId: null,
  attendance: null,
  rankings: null,
  rankingBoard: 'LEGACY',
  rankingMonth: '',
  archive: null,
  sharedSession: false
};

// Mock In-Memory Backend (Deterministic Demo/Fallback)
const mockDb = {
  users: {
    anna: { playerId: 'p-anna', firstName: 'Anna', lastName: 'Meier', role: 'PLAYER', sub: '1001' },
    ben: { playerId: 'p-ben', firstName: 'Ben', lastName: 'Schmidt', role: 'PLAYER', sub: '1002' },
    orga: { playerId: 'p-orga', firstName: 'Olaf', lastName: 'Orga', role: 'ORGANIZER', sub: '1003' },
    admin: { playerId: 'p-admin', firstName: 'Ada', lastName: 'Admin', role: 'ADMIN', sub: '1004' },
    clara: { playerId: 'p-clara', firstName: 'Clara', lastName: 'Klein', role: 'PLAYER', sub: '1005', birthYear: '2011', rankingGroup: 'ADULT' },
    david: { playerId: 'p-david', firstName: 'David', lastName: 'Dorn', role: 'PLAYER', sub: '1006', birthYear: '2012' },
    emil: { playerId: 'p-emil', firstName: 'Emil', lastName: 'Ernst', role: 'PLAYER', sub: '1007' }
  },
  sessions: [],
  templates: [
    { templateId: 'tpl-mo', weekdayIso: 1, venue: 'PARK', startLocal: '19:30', endLocal: '22:30', active: true, audience: 'ADULT', trainerPlayerId: 'p-orga' },
    { templateId: 'tpl-di', weekdayIso: 2, venue: 'MZH', startLocal: '17:30', endLocal: '20:00', active: true, audience: 'ADULT', trainerPlayerId: '' },
    { templateId: 'tpl-do', weekdayIso: 4, venue: 'MZH', startLocal: '20:00', endLocal: '22:00', active: true, audience: 'ADULT', trainerPlayerId: '' },
    { templateId: 'tpl-fr', weekdayIso: 5, venue: 'MZH', startLocal: '17:00', endLocal: '18:30', active: true, audience: 'YOUTH', trainerPlayerId: 'p-orga' }
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
  trainingList: document.getElementById('trainingList'),
  trainingDetail: document.getElementById('trainingDetail'),
  detailHead: document.getElementById('detailHead'),
  detailActions: document.getElementById('detailActions'),
  detailConfirmBtn: document.getElementById('detailConfirmBtn'),
  detailDeclineBtn: document.getElementById('detailDeclineBtn'),
  detailParticipantsBox: document.getElementById('detailParticipantsBox'),
  detailParticipantsTitle: document.getElementById('detailParticipantsTitle'),
  detailParticipants: document.getElementById('detailParticipants'),
  detailGuestsTitle: document.getElementById('detailGuestsTitle'),
  detailGuests: document.getElementById('detailGuests'),
  guestBox: document.getElementById('guestBox'),
  guestName: document.getElementById('guestName'),
  guestAddBtn: document.getElementById('guestAddBtn'),
  orgaSessionTools: document.getElementById('orgaSessionTools'),
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
  newAudience: document.getElementById('newAudience'),
  settingsBtn: document.getElementById('settingsBtn'),
  settingsDialog: document.getElementById('settingsDialog'),
  settingsViewGroup: document.getElementById('settingsViewGroup'),
  settingsCloseBtn: document.getElementById('settingsCloseBtn'),
  sessionViewHint: document.getElementById('sessionViewHint'),
  settingsRankingNote: document.getElementById('settingsRankingNote'),
  rankingGroupTabs: document.getElementById('rankingGroupTabs'),
  rankingMemberSearch: document.getElementById('rankingMemberSearch'),
  rankingMemberList: document.getElementById('rankingMemberList'),
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
  saveTemplateBtn: document.getElementById('saveTemplateBtn'),
  attendanceDue: document.getElementById('attendanceDue'),
  attendanceBox: document.getElementById('attendanceBox'),
  attendanceStatus: document.getElementById('attendanceStatus'),
  attendanceSelf: document.getElementById('attendanceSelf'),
  attendanceSelfPresent: document.getElementById('attendanceSelfPresent'),
  attendanceSelfAbsent: document.getElementById('attendanceSelfAbsent'),
  attendanceReasonWrap: document.getElementById('attendanceReasonWrap'),
  attendanceReason: document.getElementById('attendanceReason'),
  attendanceList: document.getElementById('attendanceList'),
  attendanceAddBox: document.getElementById('attendanceAddBox'),
  attendanceSearch: document.getElementById('attendanceSearch'),
  attendanceSearchResults: document.getElementById('attendanceSearchResults'),
  attendanceStand: document.getElementById('attendanceStand'),
  attendanceRefreshBtn: document.getElementById('attendanceRefreshBtn'),
  attendanceAuditBox: document.getElementById('attendanceAuditBox'),
  attendanceAuditList: document.getElementById('attendanceAuditList'),
  profileBody: document.getElementById('profileBody'),
  rankingTabs: document.getElementById('rankingTabs'),
  rankingMonthWrap: document.getElementById('rankingMonthWrap'),
  rankingMonth: document.getElementById('rankingMonth'),
  rankingSeasonWrap: document.getElementById('rankingSeasonWrap'),
  rankingSeason: document.getElementById('rankingSeason'),
  rankingHint: document.getElementById('rankingHint'),
  rankingMe: document.getElementById('rankingMe'),
  leaderboardValueHead: document.getElementById('leaderboardValueHead'),
  newCounts: document.getElementById('newCounts'),
  archiveYear: document.getElementById('archiveYear'),
  archiveInfo: document.getElementById('archiveInfo'),
  archivePreviewBtn: document.getElementById('archivePreviewBtn'),
  archiveApplyBtn: document.getElementById('archiveApplyBtn')
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
  INVALID_GUEST_DATA: 'Bitte gib einen gültigen Namen für den Gast an.',
  GUEST_ALREADY_ADDED: 'Dieser Gast ist für den Termin schon angemeldet.',
  GUEST_NOT_FOUND: 'Dieser Gast wurde nicht gefunden.',
  INVALID_CORRECTION_DATA: 'Bitte wähle einen Spieler und gib ganze Punkte ungleich 0 sowie eine Begründung an.',
  INVALID_CANCEL_DATA: 'Bitte gib einen Grund für die Absage an.',
  INVALID_INVITE_DATA: 'Bitte prüfe Spieler und Rolle.',
  IDENTITY_NOT_LINKED: 'Dieser Spieler hat keinen aktiven Zugang.',
  SELF_LOCKOUT: 'Deine eigene Rolle und deinen eigenen Zugang kannst du nicht ändern.',
  RECOVERY_REQUIRED: 'Der Abschluss ist unvollständig und wurde gestoppt. Punkte prüfen, bitte den Admin informieren.',
  ATTENDANCE_CONFLICT: 'Jemand anderes hat diesen Eintrag gerade geändert. Die Liste wurde neu geladen, bitte prüfen. Nichts wurde überschrieben.',
  ATTENDANCE_NOT_OPEN: 'Die Anwesenheit kann erst ab Beginn des Termins eingetragen werden.',
  INVALID_SESSION_VIEW: 'Diese Auswahl gibt es nicht.',
  INVALID_RANKING_DATA: 'Bitte prüfe den Jahrgang und die Rangliste.',
  ATTENDANCE_WINDOW_CLOSED: 'Die Frist für diesen Termin ist vorbei. Korrekturen macht ein Admin.',
  CORRECTION_REASON_REQUIRED: 'Bitte gib eine Begründung für die Korrektur an.',
  CLIENT_UPDATE_REQUIRED: 'Deine App ist nicht aktuell. Bitte lade die Seite neu. Nichts wurde gespeichert.',
  FEATURE_DISABLED: 'Die Anwesenheit ist gerade abgeschaltet. Nichts wurde gespeichert.',
  POINTS_ARE_DERIVED: 'Punkte dieser Saison ergeben sich aus der Anwesenheit. Bitte die Anwesenheit des Termins korrigieren.',
  SEASON_FINALIZED: 'Diese Saison ist archiviert und kann nicht mehr geändert werden.',
  SEASON_NOT_OVER: 'Diese Saison läuft noch oder ihre Korrekturfrist ist nicht vorbei.',
  OPEN_SESSIONS: 'In dieser Saison sind noch Termine offen.',
  NO_SOURCE_FOR_SEASON: 'Für diese Saison liegen keine Daten vor.',
  ALREADY_ARCHIVED: 'Diese Saison ist bereits archiviert.',
  UNMATCHED_PLAYERS: 'Punkte können nicht allen Mitgliedern zugeordnet werden.',
  INVALID_LEGACY_ROWS: 'In der Punkteliste stehen ungültige oder doppelte Zeilen.',
  INVALID_SCORING_RULES: 'Die Wertungsregeln im Sheet sind ungültig. Bitte den Admin informieren.',
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

// Sample data for the demo: everything relative to today, so that the new functions can always be shown
const DEMO_RULES = { ...BMS_SCORING_DEFAULT_RULES, attendanceFrom: '2000-01-01', validFrom: '2000-01-01' };
const demoRules = [DEMO_RULES];

function berlinToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' });
}

function buildDemoSessions() {
  const today = berlinToday();
  const templates = [
    { templateId: 'tpl-mo', weekday: 1, venue: 'PARK', startLocal: '19:30', endLocal: '22:30' },
    { templateId: 'tpl-di', weekday: 2, venue: 'MZH', startLocal: '17:30', endLocal: '20:00' },
    { templateId: 'tpl-do', weekday: 4, venue: 'MZH', startLocal: '20:00', endLocal: '22:00' },
    { templateId: 'tpl-fr', weekday: 5, venue: 'MZH', startLocal: '17:00', endLocal: '18:30', audience: 'YOUTH' }
  ];
  // Who usually comes: invented pattern, one line per synthetic member
  const habits = {
    'p-anna': { 'tpl-mo': 1, 'tpl-do': 3 },
    'p-ben': { 'tpl-di': 1 },
    'p-orga': { 'tpl-mo': 1, 'tpl-di': 2, 'tpl-do': 2 },
    'p-admin': { 'tpl-do': 2 },
    'p-clara': { 'tpl-mo': 1 },
    'p-david': { 'tpl-di': 2 }
  };
  const sessions = [];
  for (let offset = -56; offset <= 14; offset++) {
    const dateLocal = scoringAddDays_(today, offset);
    const weekday = new Date(`${dateLocal}T12:00:00Z`).getUTCDay() || 7;
    templates.filter(t => t.weekday === weekday).forEach(t => {
      const session = {
        sessionId: `ses-${dateLocal}-${t.templateId}`,
        templateId: t.templateId,
        audience: t.audience || 'ADULT',
        dateLocal,
        venue: t.venue,
        startLocal: t.startLocal,
        endLocal: t.endLocal,
        status: offset < 0 ? 'CLOSED' : 'OPEN',
        confirmedCount: 0,
        registrations: {},
        attendance: {},
        attendanceMeta: {},
        audit: [],
        guests: []
      };
      Object.entries(habits).forEach(([playerId, pattern]) => {
        const every = pattern[t.templateId];
        if (!every) return;
        session.registrations[playerId] = 'CONFIRMED';
        session.confirmedCount++;
        // The last days stay open, so that attendance can be tried out
        if (offset < -3 && Math.abs(offset) % every === 0) {
          session.attendance[playerId] = 'PRESENT';
          session.attendanceMeta[playerId] = { version: 1, by: 'p-orga', at: `${dateLocal}T21:00:00Z` };
        }
      });
      sessions.push(session);
    });
  }
  return sessions;
}

function demoWindow(session) {
  if (session.status === 'CANCELED') return { state: 'CANCELED', deadline: '' };
  const start = new Date(`${session.dateLocal}T${session.startLocal}:00`);
  const end = new Date(`${session.dateLocal}T${session.endLocal}:00`);
  const deadline = new Date(end.getTime() + DEMO_RULES.editWindowHours * 3600000);
  const now = new Date();
  const windowState = now < start ? 'NOT_YET' : now > deadline ? 'LOCKED' : 'OPEN';
  return { state: windowState, deadline: deadline.toISOString(), opensAt: start.toISOString() };
}

function demoMembers() {
  return new Map(Object.values(mockDb.users).map(u => [u.playerId, { firstName: u.firstName, lastName: u.lastName, birthYear: u.birthYear, rankingGroup: u.rankingGroup }]));
}

function demoCounts(session) {
  return session.status !== 'CANCELED' && session.countsForRanking !== false;
}

function demoEvents() {
  const visits = [];
  mockDb.sessions.filter(demoCounts).forEach(session => {
    Object.entries(session.attendance).forEach(([playerId, value]) => {
      if (value === 'PRESENT') visits.push({ playerId, dateLocal: session.dateLocal, sessionId: session.sessionId });
    });
  });
  return scoringEvents_(visits, demoRules);
}

function demoProgress(user, seasonYear) {
  const today = berlinToday();
  const year = seasonYear || today.substring(0, 4);
  const yearMonth = today.substring(0, 7);
  const events = demoEvents();
  const standings = scoringStandings_(events, scoringPlayersOfGroup_(demoMembers(), scoringRankingGroup_(user, year), year), year, yearMonth);
  const annual = standings.annual.find(e => e.playerId === user.playerId);
  const consistency = standings.consistency.find(e => e.playerId === user.playerId);
  const monthly = standings.monthly.find(e => e.playerId === user.playerId);
  const points = annual ? annual.points : 0;
  const sessionInfo = mockDb.sessions.map(s => ({ dateLocal: s.dateLocal, templateId: s.templateId, counts: demoCounts(s) }));
  const offered = scoringOfferedDates_(sessionInfo, mockDb.templates.filter(t => t.active), yearMonth, today);
  return {
    active: true,
    seasonYear: year,
    yearMonth,
    rankingGroup: scoringRankingGroup_(user, year),
    seasons: [today.substring(0, 4)],
    week: scoringWeekSummary_(events, user.playerId, today),
    annual: { points, rank: annual ? annual.rank : null },
    consistency: { activeWeeks: consistency ? consistency.activeWeeks : 0, rank: consistency ? consistency.rank : null },
    monthly: { points: monthly ? monthly.points : 0, rank: monthly ? monthly.rank : null },
    level: scoringLevel_(points, DEMO_RULES),
    badges: scoringBadges_(events, user.playerId, year, DEMO_RULES, today),
    records: scoringRecords_(events, user.playerId, offered, DEMO_RULES, today),
    goal: scoringMonthlyGoal_(events, user.playerId, yearMonth, offered, '')
  };
}

function demoAttendanceInfo(session, playerId) {
  const window = demoWindow(session);
  return { windowState: window.state, deadline: window.deadline, myState: session.attendance[playerId] || 'UNKNOWN' };
}

function demoGetAttendance(user, data) {
  const session = mockDb.sessions.find(s => s.sessionId === data.sessionId);
  if (!session) throw apiError('SESSION_NOT_FOUND');
  const window = demoWindow(session);
  const names = demoMembers();
  const nameOf = id => {
    const p = names.get(id);
    return p ? `${p.firstName} ${p.lastName}`.trim() : '';
  };
  const entries = [];
  const others = [];
  Object.values(mockDb.users).forEach(u => {
    const person = { playerId: u.playerId, firstName: u.firstName, lastName: u.lastName };
    const value = session.attendance[u.playerId];
    if (value || session.registrations[u.playerId] === 'CONFIRMED') {
      const meta = session.attendanceMeta[u.playerId];
      entries.push({
        ...person,
        registrationState: session.registrations[u.playerId] || 'UNDECIDED',
        attendanceState: value || 'UNKNOWN',
        version: meta ? meta.version : 0,
        updatedAt: meta ? meta.at : '',
        updatedByName: meta ? nameOf(meta.by) : ''
      });
    } else {
      others.push(person);
    }
  });
  const byName = (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
  return {
    sharedAttendance: true,
    sessionId: session.sessionId,
    windowState: window.state,
    opensAt: window.opensAt,
    deadline: window.deadline,
    canEdit: window.state === 'OPEN',
    canCorrect: window.state === 'LOCKED' && user.role === 'ADMIN',
    entries: entries.sort(byName),
    others: others.sort(byName),
    loadedAt: new Date().toISOString()
  };
}

function demoSetAttendance(user, data) {
  const session = mockDb.sessions.find(s => s.sessionId === data.sessionId);
  if (!session) throw apiError('SESSION_NOT_FOUND');
  if (session.status === 'CANCELED') throw apiError('SESSION_NOT_OPEN');
  if (!Number.isInteger(data.expectedVersion)) throw apiError('CLIENT_UPDATE_REQUIRED');
  const window = demoWindow(session);
  if (window.state === 'NOT_YET') throw apiError('ATTENDANCE_NOT_OPEN');
  const reason = String(data.reason || '').trim();
  if (window.state === 'LOCKED') {
    if (user.role !== 'ADMIN') throw apiError('ATTENDANCE_WINDOW_CLOSED');
    if (!reason) throw apiError('CORRECTION_REASON_REQUIRED');
  }
  const current = session.attendance[data.playerId] || 'UNKNOWN';
  const meta = session.attendanceMeta[data.playerId] || { version: 0 };
  if (current === data.state) return { sessionId: session.sessionId, playerId: data.playerId, state: current, version: meta.version, unchanged: true };
  if (meta.version !== data.expectedVersion) throw apiError('ATTENDANCE_CONFLICT');
  const version = meta.version + 1;
  const at = new Date().toISOString();
  session.audit.push({ playerId: data.playerId, actorId: user.playerId, oldState: current, newState: data.state, reason: window.state === 'LOCKED' ? reason : '', createdAt: at });
  session.attendance[data.playerId] = data.state;
  session.attendanceMeta[data.playerId] = { version, by: user.playerId, at };
  return { sessionId: session.sessionId, playerId: data.playerId, state: data.state, version, updatedAt: at };
}

function demoRankingMember(u, seasonYear) {
  return { playerId: u.playerId, firstName: u.firstName, lastName: u.lastName, birthYear: u.birthYear || '', rankingGroup: u.rankingGroup || 'AUTO', effectiveGroup: scoringRankingGroup_(u, seasonYear) };
}

function demoRankings(user, data) {
  const today = berlinToday();
  const seasonYear = today.substring(0, 4);
  const events = demoEvents();
  const group = RANKING_GROUP_LABELS[data.rankingGroup] ? data.rankingGroup : scoringRankingGroup_(user, seasonYear);
  const yearMonth = /^\d{4}-\d{2}$/.test(String(data.yearMonth || '')) ? data.yearMonth : today.substring(0, 7);
  const months = scoringMonthsOfSeason_(events, seasonYear);
  if (!months.includes(today.substring(0, 7))) months.push(today.substring(0, 7));
  return {
    active: true,
    seasonYear,
    myPlayerId: user.playerId,
    finalized: false,
    ruleVersion: 'demo',
    yearMonth,
    months,
    rankingGroup: group,
    myRankingGroup: scoringRankingGroup_(user, seasonYear),
    ...scoringStandings_(events, scoringPlayersOfGroup_(demoMembers(), group, seasonYear), seasonYear, yearMonth)
  };
}

function demoArchive(user, data) {
  const year = String(Number(berlinToday().substring(0, 4)) - 1);
  const annual = scoringRankBy_(Object.values(mockDb.users).map(u => ({
    playerId: u.playerId, firstName: u.firstName, lastName: u.lastName, points: mockDb.points[u.playerId] || 0, activeWeeks: 0
  })), 'points');
  return {
    seasons: [{ seasonYear: year, oldRules: true }],
    selected: { seasonYear: year, oldRules: true, source: 'Beispieldaten', sourceDate: `${Number(year) + 1}-01-02`, yearMonth: '', months: [], annual, consistency: [], monthly: [] },
    myPlayerId: user.playerId
  };
}

// Mock Engine
async function runMockApi(action, data) {
  await new Promise(r => setTimeout(r, 120)); // slight realistic network latency
  const user = mockDb.users[state.persona] || mockDb.users.anna;

  switch (action) {
    case 'whoami':
      return { sessionView: 'ALL', ...user, rankingGroup: scoringRankingGroup_(user, berlinToday().substring(0, 4)) };

    case 'listRankingMembers': {
      if (user.role === 'PLAYER') throw apiError('FORBIDDEN');
      const seasonYear = berlinToday().substring(0, 4);
      return { seasonYear, players: Object.values(mockDb.users).map(u => demoRankingMember(u, seasonYear)).sort((a, b) => a.lastName.localeCompare(b.lastName)) };
    }

    case 'setPlayerRanking': {
      if (user.role === 'PLAYER') throw apiError('FORBIDDEN');
      const target = Object.values(mockDb.users).find(u => u.playerId === data.playerId);
      if (!target) throw apiError('PLAYER_NOT_FOUND');
      if (data.rankingGroup !== 'AUTO' && !RANKING_GROUP_LABELS[data.rankingGroup]) throw apiError('INVALID_RANKING_DATA');
      const year = String(data.birthYear ?? '').trim();
      if (year !== '' && !/^\d{4}$/.test(year)) throw apiError('INVALID_RANKING_DATA');
      target.birthYear = year;
      target.rankingGroup = data.rankingGroup === 'AUTO' ? '' : data.rankingGroup;
      return demoRankingMember(target, berlinToday().substring(0, 4));
    }

    case 'setSessionView': {
      if (!SESSION_VIEW_LABELS[data.view]) throw apiError('INVALID_SESSION_VIEW');
      user.sessionView = data.view;
      return { sessionView: data.view };
    }

    case 'listSessions': {
      const today = berlinToday();
      const view = data.allAudiences === true && user.role !== 'PLAYER' ? 'ALL' : (user.sessionView || 'ALL');
      const visible = mockDb.sessions
        .filter(s => s.dateLocal >= today || demoWindow(s).state === 'OPEN')
        .filter(s => matchesSessionView(s.audience, view) || s.registrations[user.playerId] === 'CONFIRMED' || s.attendance[user.playerId] === 'PRESENT');
      return visible.map(s => {
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
          guestCount: (s.guests || []).length,
          audience: s.audience || 'ADULT',
          trainerName: s.trainerName || '',
          myRegistration: myReg,
          attendance: demoAttendanceInfo(s, user.playerId)
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
      mockDb.preferences[user.playerId] = { ...mockDb.preferences[user.playerId], ...data };
      return mockDb.preferences[user.playerId];
    }

    case 'getProgress':
      return demoProgress(user, data.seasonYear);

    case 'getRankings':
      return demoRankings(user, data);

    case 'getAttendance':
      return demoGetAttendance(user, data);

    case 'setAttendance':
      return demoSetAttendance(user, data);

    case 'getAttendanceAudit': {
      if (user.role !== 'ADMIN') throw apiError('FORBIDDEN');
      const session = mockDb.sessions.find(s => s.sessionId === data.sessionId);
      if (!session) throw apiError('SESSION_NOT_FOUND');
      const members = demoMembers();
      const label = id => {
        const p = members.get(id);
        return p ? `${p.firstName} ${p.lastName}` : '';
      };
      return {
        sessionId: session.sessionId,
        entries: session.audit.map(a => ({ playerName: label(a.playerId), actorName: label(a.actorId), oldState: a.oldState, newState: a.newState, reason: a.reason, createdAt: a.createdAt }))
      };
    }

    case 'getSeasonArchive':
      return demoArchive(user, data);

    case 'archiveSeason':
      return { seasonYear: data.seasonYear, oldRules: true, source: 'Beispieldaten', participants: 0, totalPoints: 0, blockers: ['SEASON_NOT_OVER'], unmatchedKeys: [], invalidKeys: [], canApply: false };

    case 'getLeaderboard': {
      if (String(data.seasonYear) === berlinToday().substring(0, 4)) {
        return { seasonYear: data.seasonYear, totalEvents: 0, scoring: 'ATTENDANCE', standings: demoRankings(user, data).annual };
      }
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
      return { seasonYear: data.seasonYear, standings };
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
      return { session: { ...session, sharedAttendance: true }, roster, otherPlayers };
    }

    case 'closeSession': {
      const session = mockDb.sessions.find(s => s.sessionId === data.sessionId);
      if (!session) throw apiError('SESSION_NOT_FOUND');
      // Closing only ends the registration, attendance and points never come from a confirmation
      session.status = 'CLOSED';
      return { sessionId: session.sessionId, status: 'CLOSED', awardedCount: 0 };
    }

    case 'cancelSession': {
      if (user.role === 'PLAYER') throw apiError('FORBIDDEN');
      const session = mockDb.sessions.find(s => s.sessionId === data.sessionId);
      if (!session) throw apiError('SESSION_NOT_FOUND');
      if (!String(data.reason || '').trim()) throw apiError('INVALID_CANCEL_DATA');
      if (session.status !== 'OPEN' && session.status !== 'CLOSED') throw apiError('SESSION_NOT_OPEN');
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

    case 'getSessionDetail': {
      const session = mockDb.sessions.find(s => s.sessionId === data.sessionId);
      if (!session) throw apiError('SESSION_NOT_FOUND');
      const names = Object.values(mockDb.users).filter(u => session.registrations[u.playerId] === 'CONFIRMED').map(u => u.firstName + ' ' + u.lastName);
      const canManage = user.role !== 'PLAYER';
      return {
        session: { ...session, attendance: demoAttendanceInfo(session, user.playerId) },
        myRegistration: session.registrations[user.playerId] || 'UNDECIDED',
        participants: names,
        guests: (session.guests || []).map(g => ({ ...g, canRemove: canManage || g.invitedBy === user.playerId }))
      };
    }

    case 'addGuest': {
      const session = mockDb.sessions.find(s => s.sessionId === data.sessionId);
      if (!session) throw apiError('SESSION_NOT_FOUND');
      const label = String(data.label || '').trim();
      if (!label) throw apiError('INVALID_GUEST_DATA');
      session.guests = session.guests || [];
      if (session.guests.some(g => g.label.toLowerCase() === label.toLowerCase())) throw apiError('GUEST_ALREADY_ADDED');
      const guest = { guestId: 'gst-demo-' + Date.now(), label, invitedBy: user.playerId, invitedByName: user.firstName + ' ' + user.lastName };
      session.guests.push(guest);
      return { guestId: guest.guestId };
    }

    case 'removeGuest': {
      for (const session of mockDb.sessions) {
        const index = (session.guests || []).findIndex(g => g.guestId === data.guestId);
        if (index >= 0) {
          session.guests.splice(index, 1);
          return { guestId: data.guestId };
        }
      }
      throw apiError('GUEST_NOT_FOUND');
    }

    case 'correctPoints': {
      if (user.role !== 'ADMIN') throw apiError('FORBIDDEN');
      if (String(data.seasonYear) === berlinToday().substring(0, 4)) throw apiError('POINTS_ARE_DERIVED');
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
      mockDb.sessions.push({ sessionId, templateId: '', audience: data.audience || 'ADULT', dateLocal: data.dateLocal, venue: data.venue, startLocal: data.startLocal, endLocal: data.endLocal, status: 'OPEN', confirmedCount: 0, registrations: {}, attendance: {}, attendanceMeta: {}, audit: [], guests: [], countsForRanking: data.countsForRanking !== false });
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
  if (tabName === 'profile') loadProfile();
  if (tabName === 'admin') loadOrgaTab();
}

// Sub pages get a history entry, so that the back button of the phone stays inside the app
function navSnapshot() {
  return { tab: state.activeTab, orgaView: state.orgaView, sessionId: state.detailSessionId };
}

function navigate(change) {
  history.replaceState(navSnapshot(), '');
  change();
  history.pushState(navSnapshot(), '');
  window.scrollTo(0, 0);
}

window.addEventListener('popstate', event => {
  const target = event.state || { tab: 'sessions', orgaView: 'menu', sessionId: null };
  const leavesSessionPage = state.detailSessionId && !target.sessionId;
  const sameTab = target.tab === state.activeTab;
  if (!sameTab) switchTab(target.tab);
  showOrgaView(target.orgaView || 'menu');
  showSessionPage(target.sessionId || null);
  // Changes made on the session page have to show up in the list
  if (leavesSessionPage && sameTab && state.currentUser) loadSessions();
});

dom.navTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    showOrgaView('menu');
    showSessionPage(null);
    switchTab(tab.dataset.tab);
    history.replaceState(navSnapshot(), '');
    window.scrollTo(0, 0);
  });
});

function openLeaderboard() {
  navigate(() => switchTab('leaderboard'));
}

function openSession(sessionId) {
  navigate(() => {
    if (state.activeTab !== 'sessions') switchTab('sessions');
    showSessionPage(sessionId);
  });
}

function showSessionPage(sessionId) {
  state.detailSessionId = sessionId;
  dom.trainingList.hidden = Boolean(sessionId);
  dom.trainingDetail.hidden = !sessionId;
  if (!sessionId) return;
  dom.detailHead.textContent = 'Lade …';
  dom.detailActions.hidden = true;
  dom.detailParticipantsBox.hidden = true;
  dom.orgaSessionTools.hidden = true;
  dom.guestBox.hidden = true;
  dom.detailGuests.replaceChildren();
  dom.detailGuestsTitle.textContent = '';
  [dom.walkInBox, dom.sessionEditBox, dom.closeBox, dom.cancelSessionBox, dom.guestBox].forEach(box => { box.open = false; });
  resetAttendanceBox();
  loadSessionPage(sessionId);
}

function sessionHeadHtml(session) {
  const hallClasses = { PARK: 'hall-park', MZH: 'hall-mzh' };
  const extras = [
    session.audience === 'YOUTH' ? '🧒 Jugend' : '',
    session.trainerName ? `👤 Trainer: ${esc(session.trainerName)}` : ''
  ].filter(Boolean).join(' &bull; ');
  return `
    <div class="session-date">${esc(formatDate(session.dateLocal))}</div>
    <div class="session-when">${esc(session.startLocal)}–${esc(session.endLocal)} Uhr</div>
    <span class="hall-chip ${hallClasses[session.venue] || 'hall-other'}">📍 ${esc(session.venue)}</span>
    ${extras ? `<div class="session-venue">${extras}</div>` : ''}
  `;
}

async function loadSessionPage(sessionId) {
  try {
    const detail = await callApi('getSessionDetail', { sessionId });
    if (state.detailSessionId !== sessionId) return;
    const { session, myRegistration, participants, guests } = detail;
    const isOpen = session.status === 'OPEN';
    const canManage = state.currentUser?.role === 'ORGANIZER' || state.currentUser?.role === 'ADMIN';

    dom.detailHead.innerHTML = sessionHeadHtml(session);
    state.sharedSession = Boolean(session.attendance);

    dom.detailActions.hidden = !isOpen;
    dom.detailConfirmBtn.disabled = myRegistration === 'CONFIRMED';
    dom.detailDeclineBtn.disabled = myRegistration === 'DECLINED';

    // Under the old rules trainers see the same people with actions in the attendance list
    dom.detailParticipantsBox.hidden = canManage && !state.sharedSession;
    dom.detailParticipantsTitle.textContent = `Angemeldet (${participants.length})`;
    dom.detailParticipants.replaceChildren();
    participants.forEach(name => {
      const row = document.createElement('div');
      row.className = 'detail-name';
      row.textContent = name;
      dom.detailParticipants.append(row);
    });

    renderGuests(guests, isOpen);

    if (state.sharedSession) await loadAttendance(sessionId);

    dom.orgaSessionTools.hidden = !canManage;
    if (canManage) {
      if (dom.editVenue.options.length === 0) await loadTemplates();
      await loadRoster(sessionId);
    }
  } catch (err) {
    dom.detailHead.textContent = `Fehler: ${err.message}`;
  }
}

function renderGuests(guests, isOpen) {
  dom.detailGuestsTitle.textContent = `Gäste (${guests.length})`;
  dom.detailGuests.replaceChildren();
  guests.forEach(guest => {
    const row = document.createElement('div');
    row.className = 'orga-roster-row';
    const name = document.createElement('div');
    name.className = 'detail-name';
    name.style.borderBottom = 'none';
    name.textContent = guest.label;
    if (guest.invitedByName) {
      const by = document.createElement('small');
      by.textContent = `Eingeladen von ${guest.invitedByName}`;
      name.append(by);
    }
    row.append(name);
    if (isOpen && guest.canRemove) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-decline';
      btn.textContent = 'Entfernen';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await callApi('removeGuest', { guestId: guest.guestId });
          await loadSessionPage(state.detailSessionId);
        } catch (err) {
          showToast(`Fehler: ${err.message}`);
          btn.disabled = false;
        }
      });
      row.append(btn);
    }
    dom.detailGuests.append(row);
  });
  dom.guestBox.hidden = !isOpen;
}

async function setMyRegistration(stateToSet, btn) {
  btn.disabled = true;
  try {
    const res = await callApi('setRegistration', { sessionId: state.detailSessionId, state: stateToSet });
    showToast(`Erfolgreich gespeichert: ${res.state === 'CONFIRMED' ? 'Zusage ✓' : 'Absage ✗'}`);
    await loadSessionPage(state.detailSessionId);
  } catch (err) {
    showToast(`Fehler: ${err.message}`);
    btn.disabled = false;
  }
}

dom.detailConfirmBtn.addEventListener('click', () => setMyRegistration('CONFIRMED', dom.detailConfirmBtn));
dom.detailDeclineBtn.addEventListener('click', () => setMyRegistration('DECLINED', dom.detailDeclineBtn));

async function addGuest() {
  const label = dom.guestName.value.trim();
  if (!label) {
    showToast(ERROR_MESSAGES.INVALID_GUEST_DATA);
    return;
  }
  dom.guestAddBtn.disabled = true;
  try {
    await callApi('addGuest', { sessionId: state.detailSessionId, label });
    dom.guestName.value = '';
    showToast('Gast angemeldet.');
    await loadSessionPage(state.detailSessionId);
  } catch (err) {
    showToast(`Fehler: ${err.message}`, 6000);
  } finally {
    dom.guestAddBtn.disabled = false;
  }
}

dom.guestAddBtn.addEventListener('click', addGuest);
dom.guestName.addEventListener('keydown', e => {
  if (e.key === 'Enter') addGuest();
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
    // An older backend does not know the setting, then there is nothing to offer
    dom.settingsBtn.hidden = !me.sessionView;
    dom.settingsRankingNote.hidden = !me.rankingGroup;
    if (me.rankingGroup) dom.settingsRankingNote.textContent = `Du wirst in der Rangliste „${RANKING_GROUP_LABELS[me.rankingGroup]}" gewertet. Das legt dein Trainer oder Admin fest.`;
    state.rankingGroup = null;

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
    renderSessionViewHint();
    renderSessions(sessions);
  } catch (err) {
    dom.sessionList.innerHTML = `<p style="color: var(--danger);">Fehler: ${esc(err.message)}</p>`;
  }
}

function renderSessionViewHint() {
  const view = state.currentUser?.sessionView;
  dom.sessionViewHint.hidden = !view || view === 'ALL';
  if (!dom.sessionViewHint.hidden) dom.sessionViewHint.textContent = `Anzeige: ${SESSION_VIEW_LABELS[view]}. Ändern über das Zahnrad oben.`;
}

function syncSettingsDialog() {
  dom.settingsDialog.querySelectorAll('input[name="sessionView"]').forEach(input => {
    input.checked = input.value === (state.currentUser?.sessionView || 'ALL');
  });
}

dom.settingsBtn.addEventListener('click', () => {
  syncSettingsDialog();
  dom.settingsDialog.showModal();
});
dom.settingsCloseBtn.addEventListener('click', () => dom.settingsDialog.close());
dom.settingsDialog.addEventListener('change', async event => {
  const view = event.target.value;
  dom.settingsViewGroup.disabled = true;
  try {
    const saved = await callApi('setSessionView', { view });
    state.currentUser.sessionView = saved.sessionView;
    showToast('Einstellung gespeichert.');
    await loadSessions();
    if (document.getElementById('tab-preferences').classList.contains('active')) await loadPreferences();
  } catch (err) {
    showToast(`Fehler: ${err.message}`, 6000);
  } finally {
    // Always shows what the server has stored
    syncSettingsDialog();
    dom.settingsViewGroup.disabled = false;
  }
});

// User Personal Rank in Current Year
async function loadPlayerRank() {
  if (!dom.playerRankSummary || !state.currentUser) return;
  try {
    // The app can be newer than the backend, then the old card stays
    const progress = await callApi('getProgress').catch(() => null);
    if (progress && progress.active) {
      renderProgressCard(progress);
      return;
    }
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
    cardBtn.addEventListener('click', openLeaderboard);
    cardBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openLeaderboard();
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

function renderSessions(allSessions) {
  dom.sessionList.replaceChildren();

  // Past sessions with an open attendance list have their own place above the coming ones
  renderAttendanceDue(allSessions);
  const sessions = allSessions.filter(s => !(s.attendance && s.attendance.windowState === 'OPEN'));

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
    const guestText = session.guestCount > 0 ? ` + ${esc(session.guestCount)} ${session.guestCount === 1 ? 'Gast' : 'Gäste'}` : '';

    card.innerHTML = `
      <div class="session-header">
        <div>${sessionHeadHtml(session)}</div>
        <span class="session-status-badge ${badgeClass}">${badgeLabel}</span>
      </div>

      <div class="registration-count-box">
        <span class="count-icon">👥</span>
        <span class="count-text"><strong class="count-number">${esc(session.confirmedCount)}</strong> ${regLabel}${guestText}</span>
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
      <div class="session-more">Details ›</div>
    `;

    // The whole card opens the session page, the buttons keep their own function
    card.dataset.clickable = 'true';
    card.tabIndex = 0;
    card.setAttribute('aria-label', `Details zu ${formatDate(session.dateLocal)}`);
    card.addEventListener('click', event => {
      if (!event.target.closest('button')) openSession(session.sessionId);
    });
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' && event.target === card) openSession(session.sessionId);
    });

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
    // A standing date that is already on stays listed, otherwise it could not be switched off
    const view = state.currentUser?.sessionView;
    renderPreferences(templates.filter(t => t.active && (matchesSessionView(t.audience, view) || prefs[t.templateId] === true)), prefs);
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
          <div class="pref-label">${esc(WEEKDAYS[t.weekdayIso])} (${esc(t.venue)})${t.audience === 'YOUTH' ? ', Jugend' : ''}</div>
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
    const seasonYear = String(new Date().getFullYear());
    dom.currentYear.textContent = seasonYear;
    // The app can be newer than the backend, then the old list stays
    const request = { seasonYear, yearMonth: state.rankingMonth };
    if (state.rankingGroup) request.rankingGroup = state.rankingGroup;
    const rankings = await callApi('getRankings', request).catch(() => null);
    state.rankings = rankings;
    const active = Boolean(rankings && rankings.active);
    if (active && rankings.rankingGroup) {
      state.rankingGroup = rankings.rankingGroup;
      state.myRankingGroup = rankings.myRankingGroup;
    }

    dom.rankingTabs.querySelectorAll('button').forEach(btn => {
      btn.hidden = btn.dataset.board === 'LEGACY' ? active : (!active && btn.dataset.board !== 'ARCHIVE');
    });
    dom.rankingTabs.querySelector('[data-board="LEGACY"]').textContent = `Saison ${seasonYear}`;

    if (active) {
      fillSelect(dom.rankingMonth, rankings.months.map(month => [month, formatMonth(month)]));
      dom.rankingMonth.value = rankings.yearMonth;
      state.rankingMonth = rankings.yearMonth;
      if (state.rankingBoard === 'LEGACY') state.rankingBoard = 'ANNUAL';
    } else {
      const data = await callApi('getLeaderboard', { seasonYear });
      state.leaderboard = data.standings;
      if (state.rankingBoard !== 'ARCHIVE') state.rankingBoard = 'LEGACY';
    }
    setBoard(state.rankingBoard);
  } catch (err) {
    dom.leaderboardBody.innerHTML = `<tr><td colspan="3" style="color: var(--danger);">Fehler: ${esc(err.message)}</td></tr>`;
  }
}

function renderLeaderboard(standings, field = 'points') {
  dom.leaderboardBody.replaceChildren();
  if (standings.length === 0) {
    dom.leaderboardBody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--gray-600);">Noch keine Wertungen.</td></tr>';
    return;
  }

  standings.forEach(item => {
    const tr = document.createElement('tr');
    const isMe = state.currentUser && item.playerId === state.currentUser.playerId;
    if (isMe) tr.className = 'highlight-me';

    // Medals need real points, a shared place shows the same medal
    const rewarded = item.medal === undefined ? item.rank <= 3 : item.medal > 0;
    const rankDisplay = (rewarded && medalFor(item.rank)) || item.rank;
    const rankClass = rewarded && item.rank <= 3 ? `rank-${item.rank}` : '';

    tr.innerHTML = `
      <td><span class="rank-badge ${rankClass}">${rankDisplay}</span></td>
      <td>${esc(item.firstName)} ${esc(item.lastName)} ${isMe ? '<strong>(Du)</strong>' : ''}</td>
      <td style="text-align: right; font-weight: 700;">${esc(item[field])}</td>
    `;
    dom.leaderboardBody.append(tr);
  });
}

dom.refreshLeaderboardBtn.addEventListener('click', () => loadLeaderboard());

// Shared attendance: every signed-in member, the server decides what is allowed
const ATTENDANCE_LABELS = {
  PRESENT: '✓ War da',
  ABSENT: '✗ War nicht da',
  UNKNOWN: '? Ungeklärt'
};
const BERLIN = 'Europe/Berlin';

function formatDeadline(iso) {
  const date = new Date(iso);
  const day = date.toLocaleDateString('de-DE', { timeZone: BERLIN, weekday: 'short', day: '2-digit', month: '2-digit' });
  const time = date.toLocaleTimeString('de-DE', { timeZone: BERLIN, hour: '2-digit', minute: '2-digit' });
  return `${day}, ${time} Uhr`;
}

function fullName(person) {
  return [person.firstName, person.lastName].join(' ').trim();
}

function resetAttendanceBox() {
  state.attendance = null;
  dom.attendanceBox.hidden = true;
  dom.attendanceAddBox.open = false;
  dom.attendanceAuditBox.open = false;
  dom.attendanceSearch.value = '';
  dom.attendanceReason.value = '';
  dom.attendanceList.replaceChildren();
  dom.attendanceSearchResults.replaceChildren();
  dom.attendanceAuditList.replaceChildren();
}

async function loadAttendance(sessionId) {
  try {
    const data = await callApi('getAttendance', { sessionId });
    if (state.detailSessionId !== sessionId || !data.sharedAttendance) return;
    state.attendance = data;
    renderAttendance();
  } catch (err) {
    dom.attendanceBox.hidden = false;
    dom.attendanceStatus.textContent = `Fehler: ${err.message}`;
  }
}

function attendanceStatusText(data) {
  if (data.windowState === 'NOT_YET') return `Ab Trainingsbeginn kannst du hier eintragen, wer tatsächlich da ist, bis ${formatDeadline(data.deadline)}.`;
  if (data.windowState === 'CANCELED') return 'Dieser Termin ist abgesagt und zählt nicht für die Wertung.';
  if (data.windowState === 'PLANNED') return 'Dieser Termin ist noch nicht geöffnet.';
  if (data.windowState === 'LOCKED') {
    return data.canCorrect
      ? 'Die Frist ist vorbei. Als Admin kannst du mit Begründung korrigieren.'
      : 'Die Frist ist vorbei, die Liste kann nur noch gelesen werden.';
  }
  return data.canEdit ? `Noch bis ${formatDeadline(data.deadline)} bearbeitbar. Eine Zusage allein zählt nicht.` : 'Die Liste kann gerade nicht bearbeitet werden.';
}

function renderAttendance() {
  const data = state.attendance;
  if (!data) return;
  const canChange = data.canEdit || data.canCorrect;
  const me = state.currentUser ? state.currentUser.playerId : null;
  const mine = data.entries.find(e => e.playerId === me);
  const myState = mine ? mine.attendanceState : 'UNKNOWN';

  dom.attendanceBox.hidden = false;
  dom.attendanceStatus.textContent = attendanceStatusText(data);
  dom.attendanceStand.textContent = `Stand: ${new Date(data.loadedAt).toLocaleTimeString('de-DE', { timeZone: BERLIN, hour: '2-digit', minute: '2-digit' })} Uhr`;
  dom.attendanceReasonWrap.hidden = !data.canCorrect;
  dom.attendanceAddBox.hidden = !canChange;
  dom.attendanceAuditBox.hidden = state.currentUser?.role !== 'ADMIN';

  dom.attendanceSelf.hidden = !canChange;
  dom.attendanceSelfPresent.disabled = myState === 'PRESENT';
  dom.attendanceSelfAbsent.disabled = myState === 'ABSENT';

  dom.attendanceList.replaceChildren();
  if (data.entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'attendance-empty';
    empty.textContent = 'Noch niemand auf der Liste.';
    dom.attendanceList.append(empty);
  }
  data.entries.forEach(entry => dom.attendanceList.append(attendanceRow(entry, canChange)));
  renderAttendanceSearch();
}

function attendanceRow(entry, canChange) {
  const row = document.createElement('div');
  row.className = 'attendance-row';

  const info = document.createElement('div');
  info.className = 'attendance-person';
  const name = document.createElement('div');
  name.className = 'attendance-name';
  name.textContent = fullName(entry);
  const stateLabel = document.createElement('span');
  stateLabel.className = `attendance-state attendance-${entry.attendanceState.toLowerCase()}`;
  stateLabel.textContent = ATTENDANCE_LABELS[entry.attendanceState] || entry.attendanceState;
  info.append(name, stateLabel);
  if (entry.updatedByName) {
    const by = document.createElement('small');
    by.textContent = `Zuletzt von ${entry.updatedByName}`;
    info.append(by);
  }
  row.append(info);

  if (canChange) {
    const actions = document.createElement('div');
    actions.className = 'attendance-actions';
    const button = (label, nextState, className) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn ${className}`;
      btn.textContent = label;
      btn.disabled = entry.attendanceState === nextState;
      btn.addEventListener('click', () => changeAttendance(entry, nextState, actions));
      return btn;
    };
    actions.append(button('War da', 'PRESENT', 'btn-confirm'), button('War nicht da', 'ABSENT', 'btn-decline'));
    if (entry.attendanceState !== 'UNKNOWN') actions.append(button('Zurücksetzen', 'UNKNOWN', 'btn-reset'));
    row.append(actions);
  }
  return row;
}

function renderAttendanceSearch() {
  const data = state.attendance;
  dom.attendanceSearchResults.replaceChildren();
  if (!data) return;
  const term = dom.attendanceSearch.value.trim().toLowerCase();
  data.others
    .filter(person => !term || fullName(person).toLowerCase().includes(term))
    .slice(0, 30)
    .forEach(person => {
      const row = document.createElement('div');
      row.className = 'orga-roster-row';
      const name = document.createElement('div');
      name.className = 'attendance-name';
      name.textContent = fullName(person);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-confirm';
      btn.textContent = 'War da';
      btn.addEventListener('click', () => changeAttendance({ ...person, attendanceState: 'UNKNOWN', version: 0 }, 'PRESENT', row));
      row.append(name, btn);
      dom.attendanceSearchResults.append(row);
    });
}

async function changeAttendance(entry, nextState, controls) {
  const data = state.attendance;
  if (!data) return;
  const sessionId = data.sessionId;
  const me = state.currentUser ? state.currentUser.playerId : null;

  // Taking back somebody else's confirmed attendance has to be a conscious step
  if (entry.playerId !== me && entry.attendanceState === 'PRESENT' &&
      !confirm(`${fullName(entry)} ist als anwesend bestätigt. Wirklich ändern? Die Änderung wird mit deinem Namen gespeichert.`)) {
    return;
  }

  const reason = dom.attendanceReason.value.trim();
  if (data.canCorrect && !reason) {
    showToast(ERROR_MESSAGES.CORRECTION_REASON_REQUIRED);
    dom.attendanceReason.focus();
    return;
  }

  const buttons = controls ? [...controls.querySelectorAll('button')] : [];
  buttons.forEach(b => { b.disabled = true; });
  try {
    await callApi('setAttendance', {
      sessionId,
      playerId: entry.playerId,
      state: nextState,
      expectedVersion: entry.version,
      requestId: crypto.randomUUID(),
      reason
    });
    showToast(`Gespeichert: ${fullName(entry)}, ${ATTENDANCE_LABELS[nextState]}`);
    dom.attendanceReason.value = '';
  } catch (err) {
    showToast(`Fehler: ${err.message}`, 6000);
  }
  // Always the state the server now holds, also after an error or a conflict
  await loadAttendance(sessionId);
  if (state.currentUser && entry.playerId === me) loadPlayerRank();
}

function setMyAttendance(nextState) {
  const data = state.attendance;
  const me = state.currentUser;
  if (!data || !me) return;
  const entry = data.entries.find(e => e.playerId === me.playerId) ||
    { playerId: me.playerId, firstName: me.firstName, lastName: me.lastName, attendanceState: 'UNKNOWN', version: 0 };
  changeAttendance(entry, nextState, dom.attendanceSelf);
}

dom.attendanceSelfPresent.addEventListener('click', () => setMyAttendance('PRESENT'));
dom.attendanceSelfAbsent.addEventListener('click', () => setMyAttendance('ABSENT'));
dom.attendanceSearch.addEventListener('input', renderAttendanceSearch);
dom.attendanceRefreshBtn.addEventListener('click', () => {
  if (state.detailSessionId) loadAttendance(state.detailSessionId);
});

dom.attendanceAuditBox.addEventListener('toggle', async () => {
  if (!dom.attendanceAuditBox.open || !state.attendance) return;
  dom.attendanceAuditList.textContent = 'Lade …';
  try {
    const { entries } = await callApi('getAttendanceAudit', { sessionId: state.attendance.sessionId });
    dom.attendanceAuditList.replaceChildren();
    if (entries.length === 0) dom.attendanceAuditList.textContent = 'Noch keine Änderungen.';
    entries.forEach(e => {
      const row = document.createElement('div');
      row.className = 'detail-name';
      row.textContent = `${e.playerName}: ${ATTENDANCE_LABELS[e.oldState] || e.oldState} → ${ATTENDANCE_LABELS[e.newState] || e.newState}`;
      const by = document.createElement('small');
      by.textContent = `${e.actorName}, ${formatDeadline(e.createdAt)}${e.reason ? `, Grund: ${e.reason}` : ''}`;
      row.append(by);
      dom.attendanceAuditList.append(row);
    });
  } catch (err) {
    dom.attendanceAuditList.textContent = `Fehler: ${err.message}`;
  }
});

function renderAttendanceDue(sessions) {
  dom.attendanceDue.replaceChildren();
  const due = sessions.filter(s => s.attendance && s.attendance.windowState === 'OPEN');
  if (due.length === 0) return;

  const title = document.createElement('h2');
  title.className = 'section-title';
  title.textContent = 'Wer war tatsächlich da?';
  dom.attendanceDue.append(title);

  due.forEach(session => {
    const card = document.createElement('article');
    card.className = 'session-card attendance-due';
    card.dataset.clickable = 'true';
    card.innerHTML = `
      <div>${sessionHeadHtml(session)}</div>
      <p class="attendance-due-state"></p>
      <p class="attendance-due-deadline"></p>
      <button class="btn btn-confirm" type="button">Anwesenheit bestätigen</button>
    `;
    card.querySelector('.attendance-due-state').textContent = `Du: ${ATTENDANCE_LABELS[session.attendance.myState] || session.attendance.myState}`;
    card.querySelector('.attendance-due-deadline').textContent = `Noch bis ${formatDeadline(session.attendance.deadline)} bearbeitbar`;
    card.addEventListener('click', () => openSession(session.sessionId));
    dom.attendanceDue.append(card);
  });
}

// Personal progress on the start page, never more than one message at a time
function levelBarHtml(level) {
  const percent = Math.round(level.fraction * 100);
  const next = level.nextMinPoints === null
    ? 'Höchstes Level erreicht'
    : `Noch ${esc(level.pointsToNext)} Punkte bis ${esc(level.nextName)}`;
  return `
    <div class="level-line"><strong>Level ${esc(level.level)}: ${esc(level.name)}</strong></div>
    <div class="level-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" aria-label="Fortschritt zum nächsten Level">
      <span style="width: ${percent}%"></span>
    </div>
    <div class="level-next">${next}</div>
  `;
}

function rankText(rank) {
  return rank ? `Platz ${esc(rank)}` : '–';
}

function renderProgressCard(progress) {
  dom.playerRankSummary.innerHTML = `
    <div class="progress-card" id="openLeaderboardCard" role="button" tabindex="0" aria-label="Wertungen öffnen">
      <div class="progress-week">
        <span class="progress-week-points">${esc(progress.week.points)}/${esc(progress.week.maxPoints)}</span>
        <span class="progress-week-text"><strong>Punkte diese Woche</strong><br>${esc(progress.week.hint)}</span>
      </div>
      <div class="progress-stats">
        <div><span>Monatscup</span><strong>${rankText(progress.monthly.rank)}</strong><small>${esc(progress.monthly.points)} Punkte</small></div>
        <div><span>Jahrescup</span><strong>${rankText(progress.annual.rank)}</strong><small>${esc(progress.annual.points)} Punkte</small></div>
        <div><span>Konstanz</span><strong>${rankText(progress.consistency.rank)}</strong><small>${esc(progress.consistency.activeWeeks)} ${progress.consistency.activeWeeks === 1 ? 'Woche' : 'Wochen'}</small></div>
      </div>
      ${levelBarHtml(progress.level)}
      <div class="player-rank-cta">Wertungen ➔</div>
    </div>
  `;
  const card = dom.playerRankSummary.querySelector('#openLeaderboardCard');
  card.addEventListener('click', openLeaderboard);
  card.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openLeaderboard();
    }
  });
}

// Profile: level, goal, badges and records
function formatMonth(yearMonth) {
  return new Date(`${yearMonth}-15T12:00:00Z`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function goalHtml(goal) {
  if (goal.target === 0) return '<p>In diesem Monat ist kein Ziel offen.</p>';
  const weekWord = goal.target === 1 ? 'Woche' : 'Wochen';
  const base = goal.achieved
    ? `<p><strong>✓ Monatsziel erreicht:</strong> in ${esc(goal.progress)} von ${esc(goal.target)} ${weekWord} trainiert.</p>`
    : `<p><strong>Monatsziel:</strong> in ${esc(goal.target)} ${weekWord} trainieren, bisher ${esc(goal.progress)}.</p>`;
  const bonus = goal.bonusAchieved
    ? '<p>✓ Freiwilliger Bonus geschafft: in einer Woche zweimal da.</p>'
    : '<p>Freiwilliger Bonus: einmal im Monat in einer Woche ein zweites Training.</p>';
  return base + bonus;
}

function recordsHtml(progress) {
  const r = progress.records;
  const lines = [];
  if (r.bestMonth) lines.push(`Bester Monat: ${esc(formatMonth(r.bestMonth.yearMonth))}, ${esc(r.bestMonth.points)} Punkte`);
  if (r.firstRecordPending) lines.push('Dein erster Bestwert entsteht.');
  if (r.provisionalBest) lines.push(`Vorläufig neuer Bestwert in diesem Monat: ${esc(progress.monthly.points)} Punkte`);
  if (r.bestSeasonActiveWeeks !== null) lines.push(`Meiste aktive Wochen in einer Saison: ${esc(r.bestSeasonActiveWeeks)}`);
  lines.push(`Längste Serie: ${esc(r.longestStreakWeeks)} ${r.longestStreakWeeks === 1 ? 'Woche' : 'Wochen'}`);
  lines.push(`Meiste Wochen mit zwei Trainings: ${esc(r.mostDoubleWeeks)}`);
  return lines.map(line => `<p>${line}</p>`).join('');
}

function badgesHtml(badges) {
  return badges.map(badge => `
    <div class="badge-item ${badge.earned ? 'badge-earned' : 'badge-open'}">
      <span class="badge-icon" aria-hidden="true">${badge.earned ? '🏅' : '◯'}</span>
      <div>
        <strong>${esc(badge.title)}</strong>
        <small>${esc(badge.description)}</small>
        <small>${badge.earned ? `Erreicht am ${esc(formatDate(badge.earnedOn))}` : 'Noch offen'}</small>
      </div>
    </div>
  `).join('');
}

async function loadProfile(seasonYear) {
  dom.profileBody.textContent = 'Lade …';
  try {
    const progress = await callApi('getProgress', seasonYear ? { seasonYear } : {});
    renderProfile(progress);
  } catch (err) {
    dom.profileBody.textContent = `Fehler: ${err.message}`;
  }
}

function renderProfile(progress) {
  if (!progress.active) {
    dom.profileBody.innerHTML = `
      <div class="pref-card">
        <p>Die neue Wertung mit Level, Abzeichen und Monatszielen startet am <strong>${esc(formatDate(progress.startsOn))}</strong>.</p>
        <p class="profile-note">Bis dahin läuft die bisherige Teilnahmewertung unverändert weiter.</p>
      </div>
    `;
    return;
  }
  const thisYear = String(new Date().getFullYear());
  const isCurrent = progress.seasonYear === thisYear;
  dom.profileBody.innerHTML = `
    <label class="profile-season">Saison: <select id="profileSeason" class="demo-selector"></select></label>
    <div class="pref-card profile-card">${levelBarHtml(progress.level)}<p class="profile-note">${esc(progress.annual.points)} Punkte in ${esc(progress.seasonYear)}, Level gelten pro Saison.</p></div>
    ${isCurrent ? `<div class="pref-card profile-card"><h3>Dein ${esc(formatMonth(progress.yearMonth))}</h3>${goalHtml(progress.goal)}</div>` : ''}
    <div class="pref-card profile-card"><h3>Abzeichen</h3><div class="badge-list">${badgesHtml(progress.badges)}</div></div>
    <div class="pref-card profile-card"><h3>Bestwerte</h3>${recordsHtml(progress)}</div>
  `;
  const select = dom.profileBody.querySelector('#profileSeason');
  fillSelect(select, progress.seasons.map(year => [year, year]));
  select.value = progress.seasonYear;
  select.addEventListener('change', () => loadProfile(select.value));
}

// Rankings: three competitions with equal weight, plus the archive
const BOARD_LABELS = { ANNUAL: 'Punkte', CONSISTENCY: 'Aktive Wochen', MONTHLY: 'Punkte', LEGACY: 'Teilnahmen', ARCHIVE: 'Punkte' };

function medalFor(rank) {
  return { 1: '🥇', 2: '🥈', 3: '🥉' }[rank] || '';
}

function setBoard(board) {
  state.rankingBoard = board;
  dom.rankingTabs.querySelectorAll('button').forEach(btn => {
    const active = btn.dataset.board === board;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  renderBoard();
}

dom.rankingTabs.querySelectorAll('button').forEach(btn => {
  btn.addEventListener('click', () => {
    setBoard(btn.dataset.board);
    if (btn.dataset.board === 'ARCHIVE') loadArchive();
  });
});

dom.rankingGroupTabs.querySelectorAll('button').forEach(btn => {
  btn.addEventListener('click', async () => {
    state.rankingGroup = btn.dataset.group;
    await loadLeaderboard();
    if (state.rankingBoard === 'ARCHIVE') await loadArchive(state.archive?.selected?.seasonYear);
  });
});

function syncRankingGroupTabs(visible) {
  dom.rankingGroupTabs.hidden = !visible;
  dom.rankingGroupTabs.querySelectorAll('button').forEach(btn => {
    const active = btn.dataset.group === state.rankingGroup;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

dom.rankingMonth.addEventListener('change', () => {
  state.rankingMonth = dom.rankingMonth.value;
  loadLeaderboard();
});

dom.rankingSeason.addEventListener('change', () => loadArchive(dom.rankingSeason.value));

function renderBoard() {
  const board = state.rankingBoard;
  const r = state.rankings;
  dom.rankingMonthWrap.hidden = board !== 'MONTHLY';
  dom.rankingSeasonWrap.hidden = board !== 'ARCHIVE';
  dom.leaderboardValueHead.textContent = BOARD_LABELS[board];
  dom.rankingHint.textContent = '';
  dom.rankingMe.textContent = '';
  syncRankingGroupTabs(board !== 'LEGACY' && board !== 'ARCHIVE' && Boolean(r && r.active && r.rankingGroup));

  if (board === 'ARCHIVE') {
    renderArchive();
    return;
  }
  if (board === 'LEGACY') {
    dom.rankingHint.textContent = r && r.startsOn
      ? `Laufende Saison nach den bisherigen Regeln. Die neue Wertung startet am ${formatDate(r.startsOn)}.`
      : 'Laufende Saison nach den bisherigen Regeln.';
    renderStandings(state.leaderboard, 'points', '');
    return;
  }
  if (!r || !r.active) return;

  const hints = {
    ANNUAL: 'Summe aller Wochenpunkte im Jahr: 10 für die erste, 5 für die zweite Teilnahme einer Woche.',
    CONSISTENCY: 'Zählt die Wochen mit mindestens einer Teilnahme. Ein zweiter Besuch ändert daran nichts.',
    MONTHLY: 'Jeden Monat neue Chancen: Hier zählt nur dieser Monat.'
  };
  dom.rankingHint.textContent = hints[board];
  const rows = { ANNUAL: r.annual, CONSISTENCY: r.consistency, MONTHLY: r.monthly }[board];
  const field = board === 'CONSISTENCY' ? 'activeWeeks' : 'points';
  renderStandings(rows, field, r.myPlayerId);
}

function renderStandings(rows, field, myId) {
  const me = myId || state.currentUser?.playerId;
  const mine = rows.find(item => item.playerId === me);
  const otherList = state.rankingBoard !== 'LEGACY' && state.myRankingGroup && state.rankingGroup !== state.myRankingGroup;
  dom.rankingMe.textContent = mine
    ? `Dein Platz: ${mine.rank}, ${mine[field]} ${BOARD_LABELS[state.rankingBoard]}`
    : otherList
      ? `Du wirst in der Rangliste „${RANKING_GROUP_LABELS[state.myRankingGroup]}" gewertet.`
      : 'Du bist hier noch nicht eingetragen.';
  renderLeaderboard(rows, field);
}

async function loadArchive(seasonYear) {
  dom.leaderboardBody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--gray-600);">Lade …</td></tr>';
  try {
    const request = seasonYear ? { seasonYear } : {};
    if (state.rankingGroup) request.rankingGroup = state.rankingGroup;
    state.archive = await callApi('getSeasonArchive', request);
    if (state.archive.rankingGroup) {
      state.rankingGroup = state.archive.rankingGroup;
      state.myRankingGroup = state.archive.myRankingGroup;
    }
    if (state.rankingBoard === 'ARCHIVE') renderArchive();
  } catch (err) {
    dom.leaderboardBody.innerHTML = `<tr><td colspan="3" style="color: var(--danger);">Fehler: ${esc(err.message)}</td></tr>`;
  }
}

function renderArchive() {
  const archive = state.archive;
  if (!archive) return;
  fillSelect(dom.rankingSeason, archive.seasons.map(s => [s.seasonYear, s.oldRules ? `${s.seasonYear} (alte Regeln)` : s.seasonYear]));
  const selected = archive.selected;
  if (!selected) {
    dom.rankingSeasonWrap.hidden = true;
    dom.rankingHint.textContent = 'Noch keine Saison archiviert. Die Saison 2026 kommt erst mit ihrem endgültigen Stand hierher.';
    renderLeaderboard([], 'points');
    return;
  }
  dom.rankingSeason.value = selected.seasonYear;
  // The seasons of the old rules have one list for everybody
  syncRankingGroupTabs(!selected.oldRules && Boolean(archive.rankingGroup));
  dom.leaderboardValueHead.textContent = selected.oldRules ? 'Teilnahmen' : 'Punkte';
  dom.rankingHint.textContent = selected.oldRules
    ? `Historische Wertung ${selected.seasonYear}, alte Regeln: nur Gesamtsummen, keine einzelnen Trainingstage. Stand ${formatDate(selected.sourceDate)}.`
    : `Abgeschlossene Saison ${selected.seasonYear}, Stand ${formatDate(selected.sourceDate)}.`;
  const rows = selected.annual.filter(e => e.points > 0);
  const mine = rows.find(e => e.playerId === archive.myPlayerId);
  if (mine) dom.rankingMe.textContent = `Dein Platz: ${mine.rank}, ${mine.points} ${selected.oldRules ? 'Teilnahmen' : 'Punkte'}`;
  renderLeaderboard(rows, 'points');
}


// Organizer & Admin Tab, split into sub pages
const STATUS_LABELS = { OPEN: 'Offen', CLOSING: 'Wird abgeschlossen', CLOSED: 'Abgeschlossen', CANCELED: 'Abgesagt', PLANNED: 'Geplant' };

function showOrgaView(view) {
  state.orgaView = view;
  document.querySelectorAll('.orga-view').forEach(el => {
    el.hidden = el.id !== `orga-${view}`;
  });
}

document.querySelectorAll('.orga-back').forEach(btn => {
  btn.addEventListener('click', () => history.back());
});

document.querySelectorAll('[data-orga-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    navigate(() => showOrgaView(btn.dataset.orgaView));
    if (btn.dataset.orgaView === 'system') refreshCorrectInfo();
    if (btn.dataset.orgaView === 'ranking') loadRankingMembers();
  });
});

async function loadRankingMembers() {
  dom.rankingMemberList.textContent = 'Lade …';
  try {
    const { players } = await callApi('listRankingMembers');
    state.rankingMembers = players;
    renderRankingMembers();
  } catch (err) {
    dom.rankingMemberList.textContent = `Fehler: ${err.message}`;
  }
}

function autoGroupLabel(member) {
  // What automatic means for this person, so the choice is not a guess
  const group = scoringRankingGroup_({ birthYear: member.birthYear }, new Date().getFullYear());
  return `Automatisch (${RANKING_GROUP_LABELS[group]})`;
}

function renderRankingMembers() {
  const needle = dom.rankingMemberSearch.value.trim().toLowerCase();
  dom.rankingMemberList.replaceChildren();
  (state.rankingMembers || [])
    .filter(m => `${m.firstName} ${m.lastName}`.toLowerCase().includes(needle))
    .forEach(member => {
      const row = document.createElement('div');
      row.className = 'ranking-member';
      const name = document.createElement('div');
      name.className = 'ranking-member-name';
      name.textContent = `${member.firstName} ${member.lastName}`;
      const year = document.createElement('input');
      year.type = 'text';
      year.inputMode = 'numeric';
      year.maxLength = 4;
      year.className = 'demo-selector';
      year.placeholder = 'Jahrgang';
      year.setAttribute('aria-label', `Jahrgang von ${member.firstName} ${member.lastName}`);
      year.value = member.birthYear;
      const select = document.createElement('select');
      select.className = 'demo-selector';
      select.setAttribute('aria-label', `Rangliste von ${member.firstName} ${member.lastName}`);
      fillSelect(select, [['AUTO', autoGroupLabel(member)], ['ADULT', RANKING_GROUP_LABELS.ADULT], ['YOUTH', RANKING_GROUP_LABELS.YOUTH]]);
      select.value = member.rankingGroup;
      const save = async () => {
        year.disabled = true;
        select.disabled = true;
        try {
          const saved = await callApi('setPlayerRanking', { playerId: member.playerId, rankingGroup: select.value, birthYear: year.value.trim() });
          Object.assign(member, saved);
          showToast(`${member.firstName} ${member.lastName}: Rangliste ${RANKING_GROUP_LABELS[saved.effectiveGroup]}`);
          state.rankingGroup = null;
        } catch (err) {
          showToast(`Fehler: ${err.message}`, 6000);
        }
        // Always shows what the server has stored
        renderRankingMembers();
      };
      year.addEventListener('change', save);
      select.addEventListener('change', save);
      row.append(name, year, select);
      dom.rankingMemberList.append(row);
    });
}

dom.rankingMemberSearch.addEventListener('input', renderRankingMembers);

function sessionLabel(s) {
  return `${formatDate(s.dateLocal)}, ${s.startLocal}–${s.endLocal}, ${s.venue}`;
}

async function loadOrgaTab() {
  const isAdmin = state.currentUser?.role === 'ADMIN';
  dom.orgaMenuAccess.hidden = !isAdmin;
  dom.orgaMenuSystem.hidden = !isAdmin;

  await loadSessions();
  // Trainers manage every session, whatever they chose to see on their own start page
  state.orgaSessions = await callApi('listSessions', { allAudiences: true });
  renderOrgaMenu();

  // The lists for the selection fields, the session page needs them
  await loadTemplates();
  if (isAdmin) await loadPlayerLinks();
  if (state.detailSessionId) await loadSessionPage(state.detailSessionId);
}

function renderOrgaMenu() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' });
  const sessions = state.orgaSessions || state.sessions;
  const next = sessions.find(s => (s.status === 'OPEN' || s.status === 'CLOSING') && s.dateLocal >= today);
  dom.orgaNextBtn.hidden = !next;
  if (next) {
    dom.orgaNextBtn.replaceChildren(next.dateLocal === today ? '🏸 Heute' : '🏸 Nächster Termin');
    const detail = document.createElement('span');
    detail.textContent = sessionLabel(next);
    dom.orgaNextBtn.append(detail);
    dom.orgaNextBtn.onclick = () => openSession(next.sessionId);
  }

  dom.orgaSessionList.replaceChildren();
  if (sessions.length === 0) {
    dom.orgaSessionList.textContent = 'Keine Termine vorhanden.';
  }
  sessions.forEach(s => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'orga-menu-item';
    btn.append(sessionLabel(s));
    const status = document.createElement('span');
    status.textContent = `${STATUS_LABELS[s.status] || s.status} · ${s.confirmedCount} ${s.confirmedCount === 1 ? 'Zusage' : 'Zusagen'}`;
    btn.append(status);
    btn.addEventListener('click', () => openSession(s.sessionId));
    dom.orgaSessionList.append(btn);
  });
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

  const isOpen = session.status === 'OPEN';
  const hints = {
    OPEN: 'Gegen 23 Uhr wird automatisch abgeschlossen. Bis dahin kannst du hier korrigieren.',
    CLOSING: 'Der Abschluss wurde begonnen, die Liste ist gesperrt.',
    CLOSED: 'Abgeschlossen. Korrekturen macht ein Admin über die Punktkorrektur.',
    CANCELED: 'Dieser Termin ist abgesagt.',
    PLANNED: 'Dieser Termin ist noch nicht geöffnet.'
  };
  dom.orgaSessionHint.textContent = session.sharedAttendance
    ? 'Termin verwalten. Die Anwesenheit pflegen alle Mitglieder oben in der Liste.'
    : hints[session.status] || '';
  state.sharedSession = Boolean(session.sharedAttendance);

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
  if (!session.sharedAttendance) {
    section('Anwesend', present, 'Austragen', 'ABSENT', 'btn-decline');
    if (absent.length > 0 || isOpen) section('Nicht da', absent, 'Eintragen', 'PRESENT', 'btn-confirm');
  }

  dom.walkInBox.hidden = session.sharedAttendance || !isOpen || addable.length === 0;
  fillSelect(dom.walkInSelect, addable.map(p => [p.playerId, `${p.firstName} ${p.lastName}`]));

  const canEdit = isOpen || session.status === 'PLANNED';
  dom.sessionEditBox.hidden = !canEdit;
  dom.cancelSessionBox.hidden = !canEdit && !(session.sharedAttendance && session.status === 'CLOSED');
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
fillSelect(dom.archiveYear, [thisYear - 1, thisYear - 2].map(year => [String(year), String(year)]));

function archiveSummary(res) {
  const lines = [`${res.participants} Teilnehmer, ${res.totalPoints} ${res.oldRules ? 'Teilnahmen (alte Regeln)' : 'Punkte'}, Quelle: ${res.source}.`];
  res.blockers.forEach(code => lines.push(ERROR_MESSAGES[code] || code));
  if (res.unmatchedKeys.length > 0) lines.push(`Nicht zugeordnet: ${res.unmatchedKeys.join(', ')}`);
  if (res.invalidKeys.length > 0) lines.push(`Ungültig: ${res.invalidKeys.join(', ')}`);
  return lines.join(' ');
}

dom.archiveYear.addEventListener('change', () => {
  dom.archiveInfo.textContent = '';
  dom.archiveApplyBtn.disabled = true;
});

dom.archivePreviewBtn.addEventListener('click', async () => {
  dom.archivePreviewBtn.disabled = true;
  dom.archiveApplyBtn.disabled = true;
  try {
    const res = await callApi('archiveSeason', { seasonYear: dom.archiveYear.value });
    dom.archiveInfo.textContent = archiveSummary(res);
    dom.archiveApplyBtn.disabled = !res.canApply;
  } catch (err) {
    dom.archiveInfo.textContent = `Fehler: ${err.message}`;
  } finally {
    dom.archivePreviewBtn.disabled = false;
  }
});

dom.archiveApplyBtn.addEventListener('click', async () => {
  if (!confirm(`Saison ${dom.archiveYear.value} endgültig archivieren? Das lässt sich in der App nicht rückgängig machen.`)) return;
  dom.archiveApplyBtn.disabled = true;
  try {
    const res = await callApi('archiveSeason', { seasonYear: dom.archiveYear.value, apply: true });
    dom.archiveInfo.textContent = `Archiviert. ${archiveSummary(res)}`;
  } catch (err) {
    dom.archiveInfo.textContent = `Fehler: ${err.message}`;
  }
});

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
  const sessionId = state.detailSessionId;
  const question = state.sharedSession
    ? 'Termin jetzt schon abschließen? Sonst geschieht das automatisch gegen 23 Uhr. Danach sind keine Zu- und Absagen mehr möglich, die Anwesenheit bleibt bis zur Frist offen.'
    : 'Termin jetzt schon abschließen? Sonst geschieht das automatisch gegen 23 Uhr. Alle als anwesend Markierten bekommen +1 Punkt, danach sind keine Änderungen mehr möglich.';
  if (!confirm(question)) {
    return;
  }

  dom.closeSessionBtn.disabled = true;
  try {
    const res = await callApi('closeSession', { sessionId });
    showToast(state.sharedSession ? 'Termin abgeschlossen. Die Anwesenheit bleibt bis zur Frist offen.' : `Spieltag abgeschlossen! ${res.awardedCount} Punkte gutgeschrieben.`);
    await loadOrgaTab();
  } catch (err) {
    showToast(`Fehler beim Abschluss: ${err.message}`, 8000);
    await loadRoster(sessionId);
  }
});

dom.walkInBtn.addEventListener('click', async () => {
  const sessionId = state.detailSessionId;
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
    await callApi('cancelSession', { sessionId: state.detailSessionId, reason });
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
  const sessionId = state.detailSessionId;
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
      endLocal: dom.newEnd.value,
      countsForRanking: dom.newCounts.checked,
      audience: dom.newAudience.value
    });
    dom.newAudience.value = 'ADULT';
    dom.newDate.value = '';
    dom.newCounts.checked = true;
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
    mockDb.sessions = buildDemoSessions();
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
