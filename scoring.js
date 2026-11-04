/**
 * Badminton Management System 2.0 - scoring core
 *
 * Pure functions without any access to Google services, the clock or the network. The attendance
 * table is the only source of truth, everything here can be recalculated at any time.
 *
 * Copies that must stay byte-identical (checked by tests/scoring.test.mjs):
 * apps-script/Scoring.gs, src/BMS2_Scoring.js, web/scoring.js (demo mode only).
 */

const BMS_SCORING_DEFAULT_RULES = Object.freeze({
  ruleVersion: '2027-v1',
  attendanceFrom: '2027-01-01',
  validFrom: '2027-01-01',
  enabled: true,
  weekPoints: Object.freeze([10, 5]),
  editWindowHours: 72,
  levels: Object.freeze([
    Object.freeze({ level: 1, name: 'Federball-Rookie', minPoints: 0 }),
    Object.freeze({ level: 2, name: 'Erster Aufschlag', minPoints: 10 }),
    Object.freeze({ level: 3, name: 'Hallen-Stammgast', minPoints: 40 }),
    Object.freeze({ level: 4, name: 'Netz-Profi', minPoints: 100 }),
    Object.freeze({ level: 5, name: 'Smash-Master', minPoints: 180 }),
    Object.freeze({ level: 6, name: 'Hallenlegende', minPoints: 300 })
  ]),
  badges: Object.freeze({ activeWeeks: Object.freeze([10, 20, 35]), doubleWeeks: 5 })
});

const BMS_BADGE_TITLES = Object.freeze({
  FIRST_TRAINING: { title: 'Hallendebüt', description: 'Erste Anwesenheit der Saison' },
  ACTIVE_10_WEEKS: { title: 'Stammgast', description: '10 aktive Wochen in einer Saison' },
  ACTIVE_20_WEEKS: { title: 'Dauerbrenner', description: '20 aktive Wochen in einer Saison' },
  ACTIVE_35_WEEKS: { title: 'Jahres-Stammgast', description: '35 aktive Wochen in einer Saison' },
  DOUBLE_5_WEEKS: { title: 'Doppelpack', description: '5 Wochen mit mindestens 2 Trainingstagen' },
  PERSONAL_MONTH_RECORD: { title: 'Rekordjäger', description: 'Eigenen Monatsbestwert übertroffen' }
});

// --- Calendar, all on local dates in the form YYYY-MM-DD ---

function scoringAddDays_(dateLocal, days) {
  const d = new Date(dateLocal + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().substring(0, 10);
}

// The Monday of the ISO week identifies the week, also across a change of year
function scoringWeekStart_(dateLocal) {
  const weekday = new Date(dateLocal + 'T12:00:00Z').getUTCDay() || 7;
  return scoringAddDays_(dateLocal, 1 - weekday);
}

function scoringMonthEnd_(yearMonth) {
  const parts = yearMonth.split('-').map(Number);
  return new Date(Date.UTC(parts[0], parts[1], 0, 12)).toISOString().substring(0, 10);
}

function scoringPreviousMonth_(yearMonth) {
  return scoringAddDays_(yearMonth + '-01', -1).substring(0, 7);
}

// --- Rules ---

// One rule version per season: the newest one that is valid at the end of that season.
function scoringRulesForSeason_(rulesList, seasonYear) {
  const end = String(seasonYear) + '-12-31';
  return rulesList
    .filter(r => r.validFrom <= end)
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0] || null;
}

function scoringEarliestStart_(rulesList) {
  return rulesList.map(r => r.validFrom).sort()[0] || null;
}

// --- Points ---

/**
 * visits: [{ playerId, dateLocal, sessionId }] of sessions that may count, in any order.
 * Returns one event per player and local day, the same day twice counts once. The order within a
 * week is the date of the training and never the moment somebody confirmed it. A season is one
 * calendar year, so a week around New Year starts over with the first point value.
 */
function scoringEvents_(visits, rulesList) {
  const byDay = new Map();
  visits.forEach(v => {
    const rules = scoringRulesForSeason_(rulesList, v.dateLocal.substring(0, 4));
    if (!rules || v.dateLocal < rules.validFrom) return;
    const key = v.playerId + '|' + v.dateLocal;
    if (!byDay.has(key)) byDay.set(key, { playerId: v.playerId, dateLocal: v.dateLocal, rules: rules });
  });

  const seen = new Map();
  return Array.from(byDay.values())
    .sort((a, b) => a.dateLocal.localeCompare(b.dateLocal) || a.playerId.localeCompare(b.playerId))
    .map(day => {
      const seasonYear = day.dateLocal.substring(0, 4);
      const weekStart = scoringWeekStart_(day.dateLocal);
      const weekKey = day.playerId + '|' + seasonYear + '|' + weekStart;
      const ordinal = (seen.get(weekKey) || 0) + 1;
      seen.set(weekKey, ordinal);
      return {
        playerId: day.playerId,
        dateLocal: day.dateLocal,
        seasonYear: seasonYear,
        yearMonth: day.dateLocal.substring(0, 7),
        weekStart: weekStart,
        ordinal: ordinal,
        points: day.rules.weekPoints[ordinal - 1] || 0,
        ruleVersion: day.rules.ruleVersion
      };
    });
}

// --- Standings ---

// Equal values share a rank (1, 1, 3). Names only sort the display, they never decide a rank.
function scoringRankBy_(entries, field) {
  const sorted = entries.slice().sort((a, b) =>
    (b[field] - a[field]) ||
    String(a.lastName || '').localeCompare(String(b.lastName || '')) ||
    String(a.firstName || '').localeCompare(String(b.firstName || ''))
  );
  let rank = 0;
  return sorted.map((entry, index) => {
    if (index === 0 || entry[field] !== sorted[index - 1][field]) rank = index + 1;
    return Object.assign({}, entry, { rank: rank });
  });
}

function scoringSeasonTotals_(events, seasonYear) {
  const totals = new Map();
  events.filter(e => e.seasonYear === String(seasonYear)).forEach(e => {
    const t = totals.get(e.playerId) || { playerId: e.playerId, points: 0, weeks: new Set() };
    t.points += e.points;
    t.weeks.add(e.weekStart);
    totals.set(e.playerId, t);
  });
  return Array.from(totals.values()).map(t => ({ playerId: t.playerId, points: t.points, activeWeeks: t.weeks.size }));
}

function scoringMonthTotals_(events, yearMonth) {
  const totals = new Map();
  events.filter(e => e.yearMonth === yearMonth).forEach(e => {
    totals.set(e.playerId, (totals.get(e.playerId) || 0) + e.points);
  });
  return Array.from(totals.entries()).map(entry => ({ playerId: entry[0], points: entry[1] }));
}

// players: Map of playerId to { firstName, lastName }. Somebody who is not a member cannot appear.
/**
 * The ranking list somebody appears in. A choice by a trainer or admin wins. Without one the birth year
 * decides by the usual age class: U18 is whoever turns at most 17 in that season, so nobody changes list
 * in the middle of a season. Without a birth year the person counts as an adult.
 */
function scoringRankingGroup_(player, seasonYear) {
  if (!player) return 'ADULT';
  if (player.rankingGroup === 'ADULT' || player.rankingGroup === 'YOUTH') return player.rankingGroup;
  const birthYear = Number(player.birthYear);
  if (!birthYear) return 'ADULT';
  return Number(seasonYear) - birthYear < 18 ? 'YOUTH' : 'ADULT';
}

function scoringPlayersOfGroup_(players, group, seasonYear) {
  return new Map(Array.from(players.entries()).filter(entry => scoringRankingGroup_(entry[1], seasonYear) === group));
}

function scoringStandings_(events, players, seasonYear, yearMonth) {
  const withName = entry => {
    const p = players.get(entry.playerId);
    return p ? Object.assign({}, entry, { firstName: p.firstName, lastName: p.lastName }) : null;
  };
  const season = scoringSeasonTotals_(events, seasonYear).map(withName).filter(Boolean);
  const month = yearMonth ? scoringMonthTotals_(events, yearMonth).map(withName).filter(Boolean) : [];
  return {
    annual: scoringRankBy_(season, 'points'),
    consistency: scoringRankBy_(season, 'activeWeeks'),
    // Medals only for real points: a month with nothing but third visits wins nothing
    monthly: scoringRankBy_(month, 'points').map(e => Object.assign(e, { medal: e.points > 0 && e.rank <= 3 ? e.rank : 0 }))
  };
}

function scoringMonthsOfSeason_(events, seasonYear) {
  return Array.from(new Set(events.filter(e => e.seasonYear === String(seasonYear)).map(e => e.yearMonth))).sort();
}

// --- Personal progress ---

function scoringLevel_(points, rules) {
  const levels = rules.levels.slice().sort((a, b) => a.minPoints - b.minPoints);
  let current = levels[0];
  levels.forEach(l => { if (points >= l.minPoints) current = l; });
  const next = levels.find(l => l.minPoints > current.minPoints) || null;
  return {
    level: current.level,
    name: current.name,
    minPoints: current.minPoints,
    nextName: next ? next.name : '',
    nextMinPoints: next ? next.minPoints : null,
    pointsToNext: next ? next.minPoints - points : 0,
    fraction: next ? (points - current.minPoints) / (next.minPoints - current.minPoints) : 1
  };
}

function scoringWeekSummary_(events, playerId, today) {
  const weekStart = scoringWeekStart_(today);
  const seasonYear = today.substring(0, 4);
  const points = events
    .filter(e => e.playerId === playerId && e.seasonYear === seasonYear && e.weekStart === weekStart)
    .reduce((sum, e) => sum + e.points, 0);
  let hint = 'Einmal pro Woche reicht fürs Wochenziel.';
  if (points >= 15) hint = 'Maximale Wochenpunkte erreicht.';
  else if (points >= 10) hint = 'Wochenziel erreicht; ein zweites Training ist freiwillig (+5 Punkte).';
  return { weekStart: weekStart, points: points, maxPoints: 15, hint: hint };
}

// A month is final once nobody can change its last session any more
function scoringMonthIsClosed_(yearMonth, today, editWindowHours) {
  return today > scoringAddDays_(scoringMonthEnd_(yearMonth), Math.ceil(editWindowHours / 24));
}

function scoringPlayerMonths_(playerEvents) {
  const months = new Map();
  playerEvents.forEach(e => months.set(e.yearMonth, (months.get(e.yearMonth) || 0) + e.points));
  return Array.from(months.entries()).map(m => ({ yearMonth: m[0], points: m[1] }))
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
}

/**
 * Derived on every read, so a correction also corrects the badges and a new calculation cannot
 * create a duplicate. The date is the training on which the condition was first met.
 */
function scoringBadges_(events, playerId, seasonYear, rules, today) {
  const playerEvents = events.filter(e => e.playerId === playerId);
  const season = playerEvents.filter(e => e.seasonYear === String(seasonYear));
  const earned = new Map();
  if (season.length > 0) earned.set('FIRST_TRAINING', season[0].dateLocal);

  const weeks = [];
  season.forEach(e => { if (weeks.indexOf(e.weekStart) < 0) weeks.push(e.weekStart); });
  rules.badges.activeWeeks.forEach(count => {
    if (weeks.length >= count) {
      earned.set('ACTIVE_' + count + '_WEEKS', season.find(e => e.weekStart === weeks[count - 1]).dateLocal);
    }
  });

  const doubles = season.filter(e => e.ordinal === 2);
  if (doubles.length >= rules.badges.doubleWeeks) {
    earned.set('DOUBLE_' + rules.badges.doubleWeeks + '_WEEKS', doubles[rules.badges.doubleWeeks - 1].dateLocal);
  }

  // Only finished months compare. All months since the start of the new scoring count as history.
  let best = null;
  scoringPlayerMonths_(playerEvents)
    .filter(m => scoringMonthIsClosed_(m.yearMonth, today, rules.editWindowHours))
    .forEach(m => {
      if (best !== null && m.points > best && m.yearMonth.substring(0, 4) === String(seasonYear) && !earned.has('PERSONAL_MONTH_RECORD')) {
        earned.set('PERSONAL_MONTH_RECORD', scoringMonthEnd_(m.yearMonth));
      }
      if (best === null || m.points > best) best = m.points;
    });

  const codes = ['FIRST_TRAINING']
    .concat(rules.badges.activeWeeks.map(c => 'ACTIVE_' + c + '_WEEKS'))
    .concat(['DOUBLE_' + rules.badges.doubleWeeks + '_WEEKS', 'PERSONAL_MONTH_RECORD']);
  return codes.map(code => {
    const info = BMS_BADGE_TITLES[code] || { title: code, description: '' };
    return { code: code, title: info.title, description: info.description, earned: earned.has(code), earnedOn: earned.get(code) || '' };
  });
}

/**
 * offeredDates: local dates of sessions that took place or are planned, without canceled ones and
 * without sessions that do not count. Weeks without any offer never break a streak.
 */
function scoringRecords_(events, playerId, offeredDates, rules, today) {
  const playerEvents = events.filter(e => e.playerId === playerId);
  const months = scoringPlayerMonths_(playerEvents);
  const closed = months.filter(m => scoringMonthIsClosed_(m.yearMonth, today, rules.editWindowHours));
  const bestMonth = closed.reduce((best, m) => (!best || m.points > best.points ? m : best), null);

  const currentMonth = today.substring(0, 7);
  const current = months.find(m => m.yearMonth === currentMonth);
  const currentPoints = current ? current.points : 0;

  const thisYear = today.substring(0, 4);
  const perSeason = new Map();
  playerEvents.forEach(e => {
    const s = perSeason.get(e.seasonYear) || { weeks: new Set(), doubles: 0 };
    s.weeks.add(e.weekStart);
    if (e.ordinal === 2) s.doubles++;
    perSeason.set(e.seasonYear, s);
  });
  let bestSeasonWeeks = null;
  let mostDoubleWeeks = 0;
  perSeason.forEach((s, year) => {
    if (year < thisYear) bestSeasonWeeks = Math.max(bestSeasonWeeks || 0, s.weeks.size);
    mostDoubleWeeks = Math.max(mostDoubleWeeks, s.doubles);
  });

  const activeWeeks = new Set(playerEvents.map(e => e.weekStart));
  const offeredWeeks = Array.from(new Set(offeredDates.filter(d => d <= today).map(scoringWeekStart_))).sort();
  let streak = 0;
  let longestStreak = 0;
  offeredWeeks.forEach(week => {
    streak = activeWeeks.has(week) ? streak + 1 : 0;
    longestStreak = Math.max(longestStreak, streak);
  });

  return {
    bestMonth: bestMonth,
    firstRecordPending: bestMonth === null,
    provisionalBest: bestMonth !== null && currentPoints > bestMonth.points && !closed.some(m => m.yearMonth === currentMonth),
    bestSeasonActiveWeeks: bestSeasonWeeks,
    longestStreakWeeks: longestStreak,
    mostDoubleWeeks: mostDoubleWeeks
  };
}

/**
 * A goal is recognition only and never adds points. Based on the last eight offered weeks before the
 * month, limited to the weeks offered in the month since the player joined. So cancellations can only
 * lower a goal, and somebody who can only come once a week reaches the highest goal as well.
 */
function scoringMonthlyGoal_(events, playerId, yearMonth, offeredDates, memberSince) {
  const monthStart = yearMonth + '-01';
  const monthEnd = scoringMonthEnd_(yearMonth);
  const playerEvents = events.filter(e => e.playerId === playerId);

  const pastWeeks = Array.from(new Set(offeredDates.filter(d => d < monthStart).map(scoringWeekStart_))).sort().slice(-8);
  const activeBefore = new Set(playerEvents.filter(e => e.dateLocal < monthStart).map(e => e.weekStart));
  const activeInWindow = pastWeeks.filter(w => activeBefore.has(w)).length;

  let target = 1;
  if (activeInWindow >= 4) target = 3;
  else if (activeInWindow >= 2) target = 2;

  const from = memberSince && memberSince > monthStart ? memberSince : monthStart;
  const availableWeeks = new Set(offeredDates.filter(d => d >= from && d <= monthEnd).map(scoringWeekStart_)).size;
  target = Math.min(target, availableWeeks);

  const inMonth = playerEvents.filter(e => e.yearMonth === yearMonth);
  const perWeek = new Map();
  inMonth.forEach(e => perWeek.set(e.weekStart, (perWeek.get(e.weekStart) || 0) + 1));
  const progress = perWeek.size;

  return {
    yearMonth: yearMonth,
    target: target,
    progress: progress,
    achieved: target > 0 && progress >= target,
    availableWeeks: availableWeeks,
    bonusAchieved: Array.from(perWeek.values()).some(count => count >= 2)
  };
}

/**
 * Dates offered in a month: real sessions where they exist, the active standard sessions for days the
 * generator has not reached yet. sessions: [{ dateLocal, templateId, counts }], counts is false for
 * canceled sessions and those that do not count. templates: [{ templateId, weekdayIso }].
 */
function scoringOfferedDates_(sessions, templates, yearMonth, today) {
  const offered = new Set(sessions.filter(s => s.counts).map(s => s.dateLocal));
  const taken = new Set(sessions.map(s => s.templateId + '|' + s.dateLocal));
  const end = scoringMonthEnd_(yearMonth);
  for (let d = yearMonth + '-01'; d <= end; d = scoringAddDays_(d, 1)) {
    if (d <= today) continue;
    const weekday = new Date(d + 'T12:00:00Z').getUTCDay() || 7;
    templates.forEach(t => {
      if (Number(t.weekdayIso) === weekday && !taken.has(t.templateId + '|' + d)) offered.add(d);
    });
  }
  return Array.from(offered).sort();
}
