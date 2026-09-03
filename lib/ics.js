// Minimal .ics builder. Uses UTC ("Z") timestamps for DTSTART/DTEND/DTSTAMP —
// this is a valid, simpler alternative to shipping a VTIMEZONE block, and
// every mainstream calendar app converts a UTC instant to the viewer's local
// time correctly.

function pad(n) {
  return String(n).padStart(2, '0');
}

function toIcsUtc(date) {
  const d = new Date(date);
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

function escapeText(str) {
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

// Fold lines at 75 octets per RFC 5545.
function foldLine(line) {
  if (line.length <= 75) return line;
  const parts = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 0) {
    parts.push(' ' + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return parts.join('\r\n');
}

function buildEvent({ uid, dtstamp, start, end, summary, description, location }) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toIcsUtc(dtstamp || new Date())}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeText(summary)}`,
  ];
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  if (location) lines.push(`LOCATION:${escapeText(location)}`);
  lines.push('END:VEVENT');
  return lines.map(foldLine).join('\r\n');
}

function buildCalendar({ calname, events, method }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Silicon Slopes//StartFEST//EN',
    'CALSCALE:GREGORIAN',
  ];
  if (method) lines.push(`METHOD:${method}`);
  if (calname) lines.push(foldLine(`X-WR-CALNAME:${escapeText(calname)}`));
  lines.push(...events);
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

module.exports = { buildEvent, buildCalendar, toIcsUtc };
