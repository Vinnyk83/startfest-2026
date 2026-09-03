// Verbatim transcription of the StartFEST 2026 agenda poster (build spec §7).
// Dates are NOT baked in here — day 1/2 dates are computed at setup time from
// CONFERENCE_START_DATE (see scripts/setup.js).

const days = [
  { dayNumber: 1, subtitle: null },
  { dayNumber: 2, subtitle: null },
];

const tracks = [
  { slug: 'ai', name: 'AI', colorHex: '#C4E538', textHex: '#12314F', sortOrder: 1 },
  { slug: 'marketing', name: 'Marketing', colorHex: '#21C99A', textHex: '#0B2E24', sortOrder: 2 },
  { slug: 'operations', name: 'Operations', colorHex: '#4FB3F0', textHex: '#0A2438', sortOrder: 3 },
  { slug: 'funding', name: 'Funding', colorHex: '#6B7BF7', textHex: '#FFFFFF', sortOrder: 4 },
  { slug: 'self-leadership', name: 'Self Leadership', colorHex: '#A55BE0', textHex: '#FFFFFF', sortOrder: 5 },
  { slug: 'sales', name: 'Sales', colorHex: '#E84BC9', textHex: '#FFFFFF', sortOrder: 6 },
];

const rooms = [
  { code: 'MAIN', name: 'Mainstage', capacity: null, isBreakout: false, sortOrder: 0 },
  { code: 'A', name: 'Start Room', capacity: null, isBreakout: true, sortOrder: 1 },
  { code: 'B', name: 'Ignition Room', capacity: null, isBreakout: true, sortOrder: 2 },
  { code: 'C', name: 'Accelerator', capacity: null, isBreakout: true, sortOrder: 3 },
  { code: 'RESOURCE', name: 'Resource Room', capacity: null, isBreakout: true, sortOrder: 4 },
];

const settings = {
  name: 'StartFEST',
  presenter: 'Silicon Slopes',
  tagline: '2 Days • 6 Tracks • 36 Sessions • 3 Rooms',
  venueName: 'Mountain America Event Venue',
  venueSecondary: 'Loveland Living Planet Aquarium',
  venueAddress: '12033 S Lone Peak Pkwy, Draper, UT 84020', // best-guess — verify before shipping, see README
  partners: [
    { name: 'Mountain America', logoUrl: null },
    { name: 'Minky Couture', logoUrl: null },
    { name: 'Entrata', logoUrl: null },
  ],
  timezone: 'America/Denver',
  footerNote: 'Schedule subject to change · Times shown in Mountain Time (MDT)',
};

const speakers = [
  { slug: 'clint-betts', fullName: 'Clint Betts', title: 'CEO', company: 'Silicon Slopes', isKeynote: true },
  { slug: 'lindsey-ivie', fullName: 'Lindsey Ivie' },
  { slug: 'nick-thomas', fullName: 'Nick Thomas', title: 'CEO', company: 'Nordmark', isKeynote: true, bio: 'Co-founded the Bluetooth Special Interest Group.' },
  { slug: 'ryan-caldwell', fullName: 'Ryan Caldwell', title: 'CEO', company: 'MX' },
  { slug: 'tara-rosander', fullName: 'Tara Rosander', title: 'Deputy Director, COO', company: 'GOED' },
  { slug: 'scott-holley', fullName: 'Scott Holley', title: 'Executive Director', company: 'Lassonde Entrepreneur Institute' },
  { slug: 'lisa-jones-christensen', fullName: 'Lisa Jones Christensen', title: 'Associate Professor of Entrepreneurship', company: 'Marriott School of Business, BYU' },
  { slug: 'cameo-doran', fullName: 'Cameo Doran', title: 'Founder', company: 'Cameo Labs' },
  { slug: 'michael-malin', fullName: 'Michael Malin', title: 'Founder', company: 'Model Forge' },
  { slug: 'joe-grover', fullName: 'Joe Grover', title: 'CGO', company: 'Ampleo' },
  { slug: 'brock-blake', fullName: 'Brock Blake', title: 'CEO', company: 'Lendio' },
  { slug: 'erika-coleman', fullName: 'Erika Coleman', company: 'Erika Coleman Speaks' },
  { slug: 'levi-lindsay', fullName: 'Levi Lindsay', title: 'VP of Creative', company: 'Pestie' },
  { slug: 'landon-essig', fullName: 'Landon Essig', title: 'CEO', company: 'CoDev' },
  { slug: 'nicole-toomey-davis', fullName: 'Nicole Toomey Davis', title: 'President & CEO, Co-Founder', company: 'Enclavix, LLC' },
  { slug: 'steve-daly', fullName: 'Steve Daly', title: 'CEO', company: 'Instructure' },
  { slug: 'amy-cook', fullName: 'Amy Cook', title: 'CMO', company: 'Fullcast' },
  { slug: 'jon-cheney', fullName: 'Jon Cheney', title: 'CEO', company: 'GENAIPI' },
  { slug: 'steve-arntz', fullName: 'Steve Arntz', title: 'CEO', company: 'Campire' },
  { slug: 'jeremy-andrus', fullName: 'Jeremy Andrus', title: 'CEO', company: 'Traeger', isKeynote: true },
  { slug: 'jake-fackrell', fullName: 'Jake Fackrell', title: 'COO', company: 'Savvos Health' },
  { slug: 'gabe-larsen', fullName: 'Gabe Larsen', company: 'Atonom' },
  { slug: 'michael-schmutz', fullName: 'Michael Schmutz', title: 'Founder', company: 'DataXGrowth' },
  { slug: 'kurt-workman', fullName: 'Kurt Workman', title: 'CEO', company: 'Owlet' },
  { slug: 'zack-oates', fullName: 'Zack Oates', title: 'Founder & CEO', company: 'Ovation' },
  { slug: 'catherine-bennett', fullName: 'Catherine Bennett', company: 'Utah Business' },
  { slug: 'hayden-harward', fullName: 'Hayden Harward', company: 'Utah Business' },
  { slug: 'kolleen-russo', fullName: 'Kolleen Russo', company: 'Utah Business' },
  { slug: 'krista-parry', fullName: 'Krista Parry', title: 'Founder', company: 'KP Media' },
  { slug: 'jordan-gunderson', fullName: 'Jordan Gunderson', title: 'Co-Founder', company: 'Izeni' },
  { slug: 'russ-hannig', fullName: 'Russ Hannig', title: 'COO', company: 'SponsorCX' },
  { slug: 'brian-beutler', fullName: 'Brian Beutler', title: 'CEO', company: 'Alianza' },
  { slug: 'sindee-savage', fullName: 'Sindee Savage', title: 'Community Architech', company: 'Sindee Savage Consulting' },
  { slug: 'jake-larsen', fullName: 'Jake Larsen', title: 'Founder', company: 'Video Power Marketing' },
  { slug: 'russ-simon', fullName: 'Russ Simon', title: 'Founder', company: 'Russ Simon Leadership Solutions' },
];

const sp = (slug, roleLabel) => ({ slug, roleLabel: roleLabel || null });

// Day 1
const day1 = [
  { slug: 'd1-welcome', start: '09:00', end: '09:15', roomCode: 'MAIN', trackSlug: null, sessionType: 'ceremony', title: 'Welcome', speakerSlugs: [sp('clint-betts'), sp('lindsey-ivie')], isRegistrable: true },
  { slug: 'd1-opening-keynote', start: '09:15', end: '09:45', roomCode: 'MAIN', trackSlug: null, sessionType: 'keynote', title: 'Opening Keynote', speakerSlugs: [sp('nick-thomas')], isRegistrable: true },
  { slug: 'd1-state-of-silicon-slopes', start: '09:45', end: '10:15', roomCode: 'MAIN', trackSlug: null, sessionType: 'panel', title: 'The State of Silicon Slopes: Where the Money Is Moving', speakerSlugs: [sp('ryan-caldwell'), sp('tara-rosander')], isRegistrable: true },
  { slug: 'd1-bridging-the-gap', start: '10:30', end: '11:05', roomCode: 'A', trackSlug: 'funding', sessionType: 'breakout', title: 'Bridging the Gap', speakerSlugs: [sp('scott-holley')], isRegistrable: true },
  { slug: 'd1-cant-scale-cant-regulate', start: '10:30', end: '11:05', roomCode: 'B', trackSlug: 'self-leadership', sessionType: 'breakout', title: "You Can't Scale What You Can't Regulate", speakerSlugs: [sp('lisa-jones-christensen')], isRegistrable: true },
  { slug: 'd1-ai-blueprint-workshop', start: '10:30', end: '11:05', roomCode: 'C', trackSlug: 'ai', sessionType: 'workshop', title: 'AI Blueprint Workshop', speakerSlugs: [sp('cameo-doran')], isRegistrable: true },
  // Q2: room conflict — both cards seeded into Start Room (A) at 10:30, flagged.
  { slug: 'd1-surviving-ai-correction', start: '10:30', end: '11:05', roomCode: 'A', trackSlug: 'ai', sessionType: 'breakout', title: 'Surviving the AI Correction', speakerSlugs: [sp('michael-malin')], isRegistrable: true, hasRoomConflict: true },
  { slug: 'd1-break-am', start: '11:05', end: '11:25', roomCode: null, trackSlug: null, sessionType: 'break', title: 'Break', speakerSlugs: [], isRegistrable: false },
  { slug: 'd1-ai-not-your-cmo', start: '11:25', end: '12:00', roomCode: 'A', trackSlug: 'sales', sessionType: 'breakout', title: 'AI Is Not Your CMO: The New GTM Math', speakerSlugs: [sp('joe-grover')], isRegistrable: true },
  { slug: 'd1-funding', start: '11:25', end: '12:00', roomCode: 'B', trackSlug: 'funding', sessionType: 'breakout', title: 'Funding', speakerSlugs: [sp('brock-blake')], isRegistrable: true },
  { slug: 'd1-even-achieving', start: '11:25', end: '12:00', roomCode: 'C', trackSlug: 'self-leadership', sessionType: 'breakout', title: 'Even-Achieving: How to Balance Stress with Success', speakerSlugs: [sp('erika-coleman')], isRegistrable: true },
  { slug: 'd1-networking-lunch', start: '12:00', end: '13:30', roomCode: null, trackSlug: null, sessionType: 'break', title: 'Networking Lunch', speakerSlugs: [], isRegistrable: false },
  { slug: 'd1-content-people-want', start: '13:30', end: '14:05', roomCode: 'A', trackSlug: 'marketing', sessionType: 'breakout', title: 'How to Make Content People Actually Want to Watch', speakerSlugs: [sp('levi-lindsay')], isRegistrable: true },
  { slug: 'd1-ai-for-c-suite', start: '13:30', end: '14:05', roomCode: 'B', trackSlug: 'ai', sessionType: 'breakout', title: 'AI for the C-Suite', speakerSlugs: [sp('landon-essig')], isRegistrable: true },
  { slug: 'd1-advisory-board', start: '13:30', end: '14:05', roomCode: 'C', trackSlug: 'funding', sessionType: 'breakout', title: 'Build an Advisory Board to Strengthen Fundraising', speakerSlugs: [sp('nicole-toomey-davis')], isRegistrable: true },
  { slug: 'd1-leadership-daly', start: '14:15', end: '15:00', roomCode: 'A', trackSlug: 'self-leadership', sessionType: 'breakout', title: 'Leadership', speakerSlugs: [sp('steve-daly')], isRegistrable: true },
  { slug: 'd1-comp-plan-pipeline', start: '14:15', end: '15:00', roomCode: 'B', trackSlug: 'sales', sessionType: 'breakout', title: 'Your Comp Plan Is Killing Your Pipeline', speakerSlugs: [sp('amy-cook')], isRegistrable: true },
  { slug: 'd1-build-business-with-ai', start: '14:15', end: '15:00', roomCode: 'C', trackSlug: 'ai', sessionType: 'breakout', title: 'How to Build a Business with AI', speakerSlugs: [sp('jon-cheney')], isRegistrable: true },
  { slug: 'd1-break-pm', start: '15:00', end: '15:15', roomCode: null, trackSlug: null, sessionType: 'break', title: 'Break', speakerSlugs: [], isRegistrable: false },
  { slug: 'd1-leadership-arntz', start: '15:15', end: '16:00', roomCode: 'A', trackSlug: 'self-leadership', sessionType: 'breakout', title: 'Leadership', speakerSlugs: [sp('steve-arntz')], isRegistrable: true },
  { slug: 'd1-hackathon', start: '15:15', end: '17:00', roomCode: 'B', trackSlug: 'ai', sessionType: 'special', title: 'Hackathon', speakerSlugs: [], isRegistrable: true },
].map((s) => ({ ...s, dayNumber: 1 }));

// Day 2
const day2 = [
  { slug: 'd2-ai-future-of-utah', start: '08:45', end: '09:15', roomCode: 'MAIN', trackSlug: null, sessionType: 'keynote', title: 'AI and the Future of Utah', speakerSlugs: [sp('jeremy-andrus'), sp('clint-betts')], isRegistrable: true },
  { slug: 'd2-startup-world-cup', start: '09:15', end: '10:50', roomCode: 'MAIN', trackSlug: null, sessionType: 'mainstage', title: 'Startup World Cup — 10 Finalists', speakerSlugs: [], isRegistrable: true },
  { slug: 'd2-chaos-to-process', start: '11:00', end: '11:35', roomCode: 'A', trackSlug: 'operations', sessionType: 'breakout', title: 'From Chaos to Process', speakerSlugs: [sp('jake-fackrell')], isRegistrable: true },
  { slug: 'd2-ai-automation', start: '11:00', end: '11:35', roomCode: 'B', trackSlug: 'ai', sessionType: 'breakout', title: 'AI Automation', speakerSlugs: [sp('gabe-larsen')], isRegistrable: true },
  { slug: 'd2-ai-powered-growth-marketing', start: '11:00', end: '11:35', roomCode: 'C', trackSlug: 'sales', sessionType: 'breakout', title: 'AI-Powered Growth Marketing', speakerSlugs: [sp('michael-schmutz')], isRegistrable: true },
  { slug: 'd2-room-owes-you-nothing', start: '11:40', end: '12:15', roomCode: 'A', trackSlug: 'self-leadership', sessionType: 'breakout', title: 'The Room Owes You Nothing: Leading Without a Resume', speakerSlugs: [sp('kurt-workman'), sp('clint-betts')], isRegistrable: true },
  { slug: 'd2-unexpected-obvious-growth', start: '11:40', end: '12:15', roomCode: 'B', trackSlug: 'marketing', sessionType: 'breakout', title: 'The Unexpected Obvious of Growth: Conferences, Podcasts & Thought Leadership', speakerSlugs: [sp('zack-oates')], isRegistrable: true },
  { slug: 'd2-event-marketing', start: '11:40', end: '12:15', roomCode: 'C', trackSlug: 'marketing', sessionType: 'breakout', title: 'Event Marketing', speakerSlugs: [sp('catherine-bennett'), sp('hayden-harward'), sp('kolleen-russo')], isRegistrable: true },
  { slug: 'd2-networking-lunch', start: '12:30', end: '14:00', roomCode: null, trackSlug: null, sessionType: 'break', title: 'Networking Lunch', speakerSlugs: [], isRegistrable: false },
  { slug: 'd2-stop-noise-build-signal', start: '14:00', end: '14:35', roomCode: 'A', trackSlug: 'marketing', sessionType: 'breakout', title: 'Stop Producing Noise. Start Building Signal', speakerSlugs: [sp('krista-parry')], isRegistrable: true },
  { slug: 'd2-pydantic-n8n', start: '14:00', end: '14:35', roomCode: 'B', trackSlug: 'ai', sessionType: 'breakout', title: 'Building Reliable AI Workflow Automations with Pydantic & n8n', speakerSlugs: [sp('jordan-gunderson')], isRegistrable: true },
  { slug: 'd2-teams-stop-talking', start: '14:00', end: '14:35', roomCode: 'C', trackSlug: 'operations', sessionType: 'breakout', title: 'When Teams Stop Talking, Data Stops Working', speakerSlugs: [sp('russ-hannig')], isRegistrable: true },
  { slug: 'd2-sustainable-ai-datacenters', start: '14:40', end: '15:40', roomCode: 'A', trackSlug: 'ai', sessionType: 'panel', title: 'Sustainable AI and the rise of the Mega Data Centers', description: 'Panel Discussion.', speakerSlugs: [sp('brian-beutler')], isRegistrable: true },
  { slug: 'd2-open-office-hours', start: '14:40', end: '15:15', roomCode: 'RESOURCE', trackSlug: null, sessionType: 'special', title: 'Open Office Hours', description: 'Resource partners in Marketing, Sales, Legal, Accounting, and Fund Raising.', speakerSlugs: [], isRegistrable: true },
  // Q3: no printed end time — ended at 3:15 PM to match Open Office Hours.
  { slug: 'd2-building-community', start: '14:40', end: '15:15', roomCode: 'C', trackSlug: 'marketing', sessionType: 'breakout', title: 'Building Community in the Age of AI', speakerSlugs: [sp('sindee-savage')], isRegistrable: true },
  { slug: 'd2-million-dollar-video-ad', start: '15:20', end: '16:00', roomCode: 'B', trackSlug: 'marketing', sessionType: 'breakout', title: 'The Million Dollar Video Ad Framework', speakerSlugs: [sp('jake-larsen')], isRegistrable: true },
  { slug: 'd2-grinding-to-growing', start: '15:20', end: '16:00', roomCode: 'C', trackSlug: 'self-leadership', sessionType: 'breakout', title: 'From Grinding to Growing: Architect Your Capacity Wall', speakerSlugs: [sp('russ-simon')], isRegistrable: true },
].map((s) => ({ ...s, dayNumber: 2 }));

const sessions = [...day1, ...day2];

// Users — password hashed at setup time. Plaintext here only exists transiently in this seed module.
const users = [
  { email: 'admin@startfest.local', username: 'admin', password: 'password1', fullName: 'StartFEST Admin', jobTitle: 'Event Operations', company: 'Silicon Slopes', role: 'admin', avatarColor: '#C4E538' },
  { email: 'maya.ellsworth@northlooplabs.com', password: 'startfest2026', fullName: 'Maya Ellsworth', jobTitle: 'Head of Product', company: 'North Loop Labs', role: 'attendee', avatarColor: '#21C99A', shareAttendance: true, bio: 'Building developer tools at North Loop. Here for the AI track and to argue about roadmaps.' },
  { email: 'devin.park@sagebrushhealth.com', password: 'startfest2026', fullName: 'Devin Park', jobTitle: 'Director of Operations', company: 'Sagebrush Health', role: 'attendee', avatarColor: '#4FB3F0', shareAttendance: true, bio: 'Ten years running ops for clinics across the Wasatch Front. Looking for anything that reduces handoffs.' },
  { email: 'priya.raman@vectatech.io', password: 'startfest2026', fullName: 'Priya Raman', jobTitle: 'Founder & CEO', company: 'Vecta Technologies', role: 'attendee', avatarColor: '#6B7BF7', shareAttendance: true, bio: 'Second-time founder, currently raising a seed round. Talk to me about advisory boards.' },
  { email: 'tomas.cordero@bluffpoint.co', password: 'startfest2026', fullName: 'Tomás Cordero', jobTitle: 'Head of Growth', company: 'Bluffpoint', role: 'attendee', avatarColor: '#E84BC9', shareAttendance: true, bio: 'Growth for a small B2B team. Mostly here for the marketing and sales sessions.' },
  { email: 'hannah.zhao@orchardpay.com', password: 'startfest2026', fullName: 'Hannah Zhao', jobTitle: 'Staff Engineer', company: 'OrchardPay', role: 'attendee', avatarColor: '#A55BE0', shareAttendance: false, bio: 'Payments infrastructure. Curious whether any of this AI workflow stuff survives production.' },
];

const registrations = [
  ...['d1-welcome', 'd1-opening-keynote', 'd1-ai-blueprint-workshop', 'd1-ai-for-c-suite', 'd1-build-business-with-ai', 'd2-ai-future-of-utah', 'd2-pydantic-n8n', 'd2-sustainable-ai-datacenters']
    .map((sessionSlug) => ({ userEmail: 'maya.ellsworth@northlooplabs.com', sessionSlug })),
  // Deliberate demo conflict for Maya: Hackathon (15:15-17:00) overlaps Leadership/Arntz (15:15-16:00), pre-acknowledged.
  { userEmail: 'maya.ellsworth@northlooplabs.com', sessionSlug: 'd1-leadership-arntz' },
  { userEmail: 'maya.ellsworth@northlooplabs.com', sessionSlug: 'd1-hackathon', conflictAcknowledged: true },

  ...['d1-welcome', 'd1-cant-scale-cant-regulate', 'd1-even-achieving', 'd1-leadership-daly', 'd2-chaos-to-process', 'd2-teams-stop-talking', 'd2-grinding-to-growing']
    .map((sessionSlug) => ({ userEmail: 'devin.park@sagebrushhealth.com', sessionSlug })),

  ...['d1-opening-keynote', 'd1-state-of-silicon-slopes', 'd1-bridging-the-gap', 'd1-funding', 'd1-advisory-board', 'd2-startup-world-cup', 'd2-open-office-hours']
    .map((sessionSlug) => ({ userEmail: 'priya.raman@vectatech.io', sessionSlug })),

  ...['d1-ai-not-your-cmo', 'd1-content-people-want', 'd1-comp-plan-pipeline', 'd2-ai-powered-growth-marketing', 'd2-unexpected-obvious-growth', 'd2-stop-noise-build-signal', 'd2-million-dollar-video-ad']
    .map((sessionSlug) => ({ userEmail: 'tomas.cordero@bluffpoint.co', sessionSlug })),

  ...['d1-ai-blueprint-workshop', 'd1-ai-for-c-suite', 'd2-ai-automation', 'd2-pydantic-n8n', 'd2-building-community']
    .map((sessionSlug) => ({ userEmail: 'hannah.zhao@orchardpay.com', sessionSlug })),
];

module.exports = { days, tracks, rooms, settings, speakers, sessions, users, registrations };
