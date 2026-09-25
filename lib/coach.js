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

async function writeSummary(data) {
  const response = await client.beta.messages.create({
    model: 'claude-opus-5',
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: JSON.stringify(data, null, 2) }],
  });

  if (response.stop_reason === 'refusal') throw new Error('Claude declined the request');
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const parsed = JSON.parse(text);
  return {
    samenvatting: String(parsed.samenvatting || ''),
    tips: (Array.isArray(parsed.tips) ? parsed.tips : []).map(String).slice(0, 2),
    model: response.model,
  };
}

module.exports = { writeSummary };
