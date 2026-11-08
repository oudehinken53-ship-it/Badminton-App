/**
 * Badminton Management System 2.0 - the training week on the start page.
 *
 * Pure functions without clock, network or page. "today" is always passed in as YYYY-MM-DD in
 * Europe/Berlin. A session stays "today" until midnight of its day, also during and after the
 * training, and until then one can sign up or withdraw (DECISIONS 22).
 */

// Monday of the week of a calendar date, as YYYY-MM-DD
function weekStart_(dateLocal) {
  const day = new Date(dateLocal + 'T12:00:00Z');
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() - (weekday - 1));
  return day.toISOString().slice(0, 10);
}

function weekAddDays_(dateLocal, days) {
  const day = new Date(dateLocal + 'T12:00:00Z');
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

// ISO calendar week number
function isoWeekNumber_(dateLocal) {
  const thursday = weekAddDays_(weekStart_(dateLocal), 3);
  const yearStart = thursday.slice(0, 4) + '-01-01';
  const days = (Date.parse(thursday + 'T12:00:00Z') - Date.parse(yearStart + 'T12:00:00Z')) / 86400000;
  return Math.floor(days / 7) + 1;
}

// By date, then by start time, so that two groups on one day keep their order
function sortSessionsByTime_(sessions) {
  return sessions.slice().sort((a, b) =>
    String(a.dateLocal).localeCompare(String(b.dateLocal)) ||
    String(a.startLocal || '').localeCompare(String(b.startLocal || '')));
}

function sessionPhase_(session, today) {
  if (session.dateLocal < today) return 'PAST';
  return session.dateLocal === today ? 'TODAY' : 'COMING';
}

// One may sign up or withdraw while the session is open and its day has not ended
function canChangeRegistration_(session, today) {
  return session.status === 'OPEN' && session.dateLocal >= today;
}

// The registration a button sends. Always a target state, never "toggle", so that an old picture
// from the cache cannot send the opposite of what the member wants.
function registrationTarget_(myRegistration) {
  return myRegistration === 'CONFIRMED' ? 'DECLINED' : 'CONFIRMED';
}

/**
 * Splits the list from listSessions into what the start page shows.
 *  past:      sessions before today the server still lists (open attendance or not yet closed)
 *  featured:  big cards, all of today's sessions or else the next coming one
 *  week:      the other coming sessions of the shown week, compact
 *  later:     coming sessions after the shown week
 * The shown week is the current one while it still has a session today or later, else the week
 * of the next coming session.
 */
function planTrainingWeek_(sessions, today) {
  const sorted = sortSessionsByTime_(sessions);
  const past = sorted.filter(s => s.dateLocal < today);
  const coming = sorted.filter(s => s.dateLocal >= today);
  const thisWeek = weekStart_(today);
  const shownWeek = coming.length === 0 ? thisWeek
    : coming.some(s => weekStart_(s.dateLocal) === thisWeek) ? thisWeek : weekStart_(coming[0].dateLocal);
  const inWeek = coming.filter(s => weekStart_(s.dateLocal) === shownWeek);
  const todays = inWeek.filter(s => s.dateLocal === today);
  // A canceled session is no "next training", the next one that takes place is
  const next = inWeek.find(s => s.status !== 'CANCELED') || inWeek[0];
  const featured = todays.length > 0 ? todays : (next ? [next] : []);
  const featuredIds = new Set(featured.map(s => s.sessionId));
  return {
    weekStart: shownWeek,
    weekNumber: isoWeekNumber_(shownWeek),
    isCurrentWeek: shownWeek === thisWeek,
    featuredIsToday: todays.length > 0,
    past: past,
    featured: featured,
    week: inWeek.filter(s => !featuredIds.has(s.sessionId)),
    later: coming.filter(s => weekStart_(s.dateLocal) > shownWeek)
  };
}
