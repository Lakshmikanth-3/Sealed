// Integer minor-unit scenario arithmetic. Inputs and their supporting sources
// are supplied by the owner; no pricing, usage, token price or cost is assumed.
export function assessEconomics(input) {
  const demand = (ok, message) => { if (!ok) throw new Error(message); };
  demand(input && typeof input === 'object', 'Provide a measured-cost scenario');
  demand(typeof input.currency === 'string' && /^[A-Z]{3}$/.test(input.currency), 'Supply an ISO currency code');
  demand(typeof input.period === 'string' && input.period.trim().length > 0, 'Supply the fixed-cost period');
  const amount = (value) => { demand(typeof value === 'string' && /^(0|[1-9]\d{0,30})$/.test(value), 'Amounts must be nonnegative integer strings in the same currency minor units'); return BigInt(value); };
  const sum = (rows) => {
    demand(Array.isArray(rows) && rows.length > 0 && rows.length <= 100, 'Itemize costs, including sourced zero costs where appropriate');
    return rows.reduce((total, row) => {
      demand(typeof row?.label === 'string' && row.label.trim().length > 0 && typeof row.source === 'string' && row.source.trim().length > 0, 'Each cost needs a label and source');
      return total + amount(row.amountMinor);
    }, 0n);
  };
  demand(['proposed', 'accepted_quote', 'paid_invoice'].includes(input.priceBasis), 'Label whether the price is proposed, quoted or paid');
  demand(typeof input.priceSource === 'string' && input.priceSource.trim().length > 0, 'Supply the price source');
  const fixed = sum(input.fixedCosts), variable = sum(input.variableCostsPerPack), price = amount(input.pricePerPackMinor);
  const contribution = price - variable;
  return { currency: input.currency, period: input.period, fixedCostsMinor: String(fixed), variableCostPerPackMinor: String(variable),
    pricePerPackMinor: String(price), contributionPerPackMinor: String(contribution),
    breakEvenPacksPerPeriod: contribution > 0n ? String((fixed + contribution - 1n) / contribution) : null,
    priceBasis: input.priceBasis,
    interpretation: 'Cost scenario only. Break-even is arithmetic, not proof of demand, willingness to pay, revenue or sustainability. Testnet token costs cannot establish mainnet operating costs.' };
}
