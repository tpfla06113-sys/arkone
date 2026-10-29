// 접수 내역·방문 통계 저장소 (Durable Object + SQLite). 별도 데이터베이스 생성 없이 wrangler.jsonc 선언만으로 동작
import { DurableObject } from 'cloudflare:workers';

const DAY = 86400e3;
const kstDay = (t = Date.now()) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);

export class Store extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY, created_at INTEGER, day TEXT, name TEXT, phone TEXT, intent TEXT,
        visit_date TEXT, visit_time TEXT, source TEXT, landing TEXT, consent_version TEXT,
        sms_status TEXT, sms_error TEXT);
      CREATE INDEX IF NOT EXISTS leads_created ON leads(created_at);
      CREATE TABLE IF NOT EXISTS events (ts INTEGER, day TEXT, event TEXT, source TEXT, visitor TEXT);
      CREATE INDEX IF NOT EXISTS events_day ON events(day);`);
  }

  addLead(l) {
    // 개인정보 보관기간(수집일로부터 1년) 경과분은 새 접수 때마다 파기
    this.sql.exec('DELETE FROM leads WHERE created_at < ?', Date.now() - 365 * DAY);
    this.sql.exec(
      'INSERT INTO leads VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      l.id, l.created_at, kstDay(l.created_at), l.name, l.phone, l.intent, l.visit_date, l.visit_time,
      l.source, l.landing, l.consent_version, 'pending', '');
  }

  setSms(id, status, error = '') {
    this.sql.exec('UPDATE leads SET sms_status = ?, sms_error = ? WHERE id = ?', status, String(error).slice(0, 200), id);
  }

  deleteLead(id) {
    this.sql.exec('DELETE FROM leads WHERE id = ?', id);
  }

  addEvent(e) {
    if (Math.random() < 0.02) this.sql.exec('DELETE FROM events WHERE ts < ?', Date.now() - 400 * DAY);
    this.sql.exec('INSERT INTO events VALUES (?,?,?,?,?)', Date.now(), kstDay(), e.event, e.source, e.visitor);
  }

  leads(limit = 1000) {
    return this.sql.exec('SELECT * FROM leads ORDER BY created_at DESC LIMIT ?', limit).toArray();
  }

  stats(days = 14) {
    const since = kstDay(Date.now() - (days - 1) * DAY);
    const daily = {};
    for (let i = days - 1; i >= 0; i--) daily[kstDay(Date.now() - i * DAY)] = { visitors: 0, views: 0, calls: 0, consult: 0, visit: 0 };
    for (const r of this.sql.exec(
      `SELECT day, COUNT(DISTINCT visitor) v, COUNT(*) n FROM events WHERE event = 'page_view' AND day >= ? GROUP BY day`, since)) {
      if (daily[r.day]) Object.assign(daily[r.day], { visitors: r.v, views: r.n });
    }
    for (const r of this.sql.exec(`SELECT day, COUNT(*) n FROM events WHERE event = 'phone_click' AND day >= ? GROUP BY day`, since)) {
      if (daily[r.day]) daily[r.day].calls = r.n;
    }
    for (const r of this.sql.exec(`SELECT day, intent, COUNT(*) n FROM leads WHERE day >= ? GROUP BY day, intent`, since)) {
      if (daily[r.day]) daily[r.day][r.intent === 'visit' ? 'visit' : 'consult'] = r.n;
    }
    const sources = {};
    for (const r of this.sql.exec(
      `SELECT source, COUNT(DISTINCT visitor) v FROM events WHERE event = 'page_view' AND day >= ? GROUP BY source`, since)) {
      sources[r.source] = { visitors: r.v, leads: 0 };
    }
    for (const r of this.sql.exec(`SELECT source, COUNT(*) n FROM leads WHERE day >= ? GROUP BY source`, since)) {
      (sources[r.source] ||= { visitors: 0, leads: 0 }).leads = r.n;
    }
    const total = this.sql.exec(
      `SELECT COUNT(*) n, SUM(intent = 'visit') visit, SUM(sms_status = 'failed') failed FROM leads`).one();
    return { days, daily, sources, total: { leads: total.n || 0, visit: total.visit || 0, smsFailed: total.failed || 0 } };
  }
}
