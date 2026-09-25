const { default: Anthropic } = require('@anthropic-ai/sdk');

const client = new Anthropic(); // reads ANTHROPIC_API_KEY

const SYSTEM = `Je bent een nuchtere, bemoedigende hardloopcoach. Je loper is een beginner die na Couch to 5K traint voor de CPC Loop in Den Haag (10 km, zondag 14 maart 2027) met drie runs per week, meestal op woensdag, vrijdag en zondag. Rustige runs horen op de praat-test te gaan.

Je krijgt de gegevens van één afgeronde run als JSON: de run zelf, de kilometertijden (verstreken tijd, dus een pauze telt mee), de geplande sessie en weekfocus uit het schema, de volgende geplande sessie en de recente runs.

Schrijf in het Nederlands, in de je-vorm, kort en concreet:
- "samenvatting": 2 tot 3 zinnen over deze run. Vergelijk met de geplande sessie, benoem het tempo en het verloop over de kilometers, en vergelijk met recente runs als dat iets zegt.
- "tips": 1 of 2 korte, concrete tips voor de volgende run, afgestemd op de volgende geplande sessie.

Gebruik alleen de gegevens die je krijgt; er is geen hartslag. Wees positief maar eerlijk en overdrijf niet. Geef geen medisch advies; noem bij twijfel over pijn alleen rust en eventueel een fysiotherapeut.`;

const SCHEMA = {
  type: 'object',
  properties: {
    samenvatting: { type: 'string' },
    tips: { type: 'array', items: { type: 'string' } },
  },
  required: ['samenvatting', 'tips'],
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

async function writeSummary(data) {
  const { parsed, model } = await ask(SYSTEM, SCHEMA, data);
  return { samenvatting: String(parsed.samenvatting || ''), tips: list(parsed.tips), model };
}

async function writeWeekSummary(data) {
  const { parsed, model } = await ask(WEEK_SYSTEM, WEEK_SCHEMA, data);
  return { samenvatting: String(parsed.samenvatting || ''), focus: list(parsed.focus), model };
}

module.exports = { writeSummary, writeWeekSummary };
