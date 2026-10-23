const { default: Anthropic } = require('@anthropic-ai/sdk');

const client = new Anthropic(); // reads ANTHROPIC_API_KEY

const SYSTEM = `Je bent een nuchtere, bemoedigende hardloopcoach. Je loper is een beginner die na Couch to 5K traint voor de CPC Loop in Den Haag (10 km, zondag 14 maart 2027) met drie runs per week, meestal op woensdag, vrijdag en zondag. Rustige runs horen op de praat-test te gaan.

Je krijgt de gegevens van één afgeronde run als JSON: de run zelf, de kilometertijden (bewegingstijd, dus stilstaan telt niet mee), de geplande sessie en weekfocus uit het schema, de volgende geplande sessie, eventueel overgeslagen sessies tussen deze run en de volgende ("skipped_since") en de recente runs. Soms ook: hoe de run voelde ("feel": inspanning makkelijk/goed/zwaar en scheenbeenpijn 0-10, de loper had eerder last van een scheenbeen), hoe het gevoel bij eerdere runs was ("recent_feel"), de belasting ("load": kilometers in de 7 dagen tot en met deze run en de 7 dagen daarvoor, en of er runs op opeenvolgende dagen waren) en de komende sessies ("upcoming_sessions", met id).

Schrijf in het Nederlands, in de je-vorm, kort en concreet:
- "samenvatting": 2 tot 3 zinnen over deze run. Vergelijk met de geplande sessie, benoem het tempo en het verloop over de kilometers, en vergelijk met recente runs als dat iets zegt.
- "tips": 1 of 2 korte, concrete tips voor de volgende run, afgestemd op de volgende geplande sessie. Zijn er sessies overgeslagen, houd daar dan rekening mee (bijvoorbeeld wat er daardoor anders is aan de volgende run), zonder er een probleem van te maken. Weeg het gevoel en de scheenbeenpijn mee als die er zijn.
- "voorstel": meestal soort "geen". Stel alleen iets voor als er een duidelijke reden is: scheenbeenpijn van 4 of hoger, een rustige run die zwaar voelde, of een opbouw van meer dan zo'n 10% per week. Je mag een komende sessie uit "upcoming_sessions" alleen korter maken (soort "korter", met "km" kleiner dan gepland en minstens 2) of laten overslaan (soort "overslaan"), nooit langer of zwaarder. "sessie_id" is de id van die sessie, "reden" één korte zin waarom. Bij soort "geen": sessie_id "", km 0 en reden "". De loper beslist zelf of het voorstel wordt doorgevoerd.

Gebruik alleen de gegevens die je krijgt; er is geen hartslag. Wees positief maar eerlijk en overdrijf niet. Geef geen medisch advies; noem bij twijfel over pijn alleen rust en eventueel een fysiotherapeut.`;

const SCHEMA = {
  type: 'object',
  properties: {
    samenvatting: { type: 'string' },
    tips: { type: 'array', items: { type: 'string' } },
    voorstel: {
      type: 'object',
      properties: {
        soort: { type: 'string', enum: ['geen', 'korter', 'overslaan'] },
        sessie_id: { type: 'string' },
        km: { type: 'number' },
        reden: { type: 'string' },
      },
      required: ['soort', 'sessie_id', 'km', 'reden'],
      additionalProperties: false,
    },
  },
  required: ['samenvatting', 'tips', 'voorstel'],
  additionalProperties: false,
};

const WEEK_SYSTEM = `Je bent dezelfde nuchtere, bemoedigende hardloopcoach. Je loper is een beginner die traint voor de CPC Loop in Den Haag (10 km, zondag 14 maart 2027) met drie runs per week.

Je krijgt één trainingsweek als JSON: de weekfocus, de geplande sessies met hun status (gedaan, overgeslagen of niet gelopen), de gelopen runs, de totalen van de weken ervoor en het schema voor de volgende week.

Schrijf in het Nederlands, in de je-vorm, kort en concreet:
- "samenvatting": 2 tot 4 zinnen over de week: hoeveel sessies en kilometers ten opzichte van het plan, het tempo en de ontwikkeling ten opzichte van de vorige weken, en hoe de week paste bij de weekfocus.
- "focus": 1 of 2 korte aandachtspunten voor de volgende week, afgestemd op het schema van die week.

Gebruik alleen de gegevens die je krijgt; er is geen hartslag. Een gemiste of overgeslagen sessie is geen ramp: benoem het rustig en kijk vooruit. Geef geen medisch advies.`;

const WEEK_SCHEMA = {
  type: 'object',
  properties: {
    samenvatting: { type: 'string' },
    focus: { type: 'array', items: { type: 'string' } },
  },
  required: ['samenvatting', 'focus'],
  additionalProperties: false,
};

async function ask(system, schema, data) {
  const response = await client.beta.messages.create({
    model: 'claude-opus-5',
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content: JSON.stringify(data, null, 2) }],
  });
  if (response.stop_reason === 'refusal') throw new Error('Claude declined the request');
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { parsed: JSON.parse(text), model: response.model };
}

function list(value) {
  return (Array.isArray(value) ? value : []).map(String).slice(0, 2);
}

// Only a shorter or skipped session that is actually coming up; anything else becomes "geen".
function suggestion(value, upcoming) {
  const none = { soort: 'geen', sessie_id: '', km: 0, reden: '' };
  if (!value || typeof value !== 'object') return none;
  const session = (upcoming || []).find((s) => s.id === value.sessie_id);
  if (!session || !['korter', 'overslaan'].includes(value.soort)) return none;
  const reden = String(value.reden || '').slice(0, 200);
  if (value.soort === 'overslaan') return { soort: 'overslaan', sessie_id: session.id, km: 0, reden };
  const km = Math.round(Number(value.km) * 2) / 2;
  if (!(km >= 2) || !(km < (session.km || 0))) return none;
  return { soort: 'korter', sessie_id: session.id, km, reden };
}

async function writeSummary(data) {
  const { parsed, model } = await ask(SYSTEM, SCHEMA, data);
  return {
    samenvatting: String(parsed.samenvatting || ''),
    tips: list(parsed.tips),
    voorstel: suggestion(parsed.voorstel, data.upcoming_sessions),
    model,
  };
}

async function writeWeekSummary(data) {
  const { parsed, model } = await ask(WEEK_SYSTEM, WEEK_SCHEMA, data);
  return { samenvatting: String(parsed.samenvatting || ''), focus: list(parsed.focus), model };
}

module.exports = { writeSummary, writeWeekSummary };
