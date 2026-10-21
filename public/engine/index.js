// Entry point: answers in, evaluated plan and generated documents out.

import { evaluate } from './rules.js';
import { buildWill } from './docs/will.js';
import { buildAgentAck, buildPoa } from './docs/poa.js';
import { buildFuneral, buildHipaa, buildPad, buildPadAcceptance, buildTpp } from './docs/health.js';
import { buildSigning } from './docs/signing.js';
import { buildCourtesyLetter, buildDepositInstructions } from './docs/courtesy.js';

export { STEPS, activeSteps, context, validateStep, visibleFields, fieldPath, resolve, incompleteSteps } from './questions.js';
export { evaluate, fulfillmentItems } from './rules.js';
export { summarize } from './summary.js';
export { intestateShares, intestacyFromAnswers } from './intestacy.js';
export { namedPeople } from './roles.js';
export * as constants from './constants.js';

export function buildDocument(a, d) {
  switch (d.type) {
    case 'will': return buildWill(a, d.person);
    case 'tpp': return buildTpp(a, d.person);
    case 'poa': return buildPoa(a, d.person);
    case 'agentAck': return buildAgentAck(a, d.person, d.role);
    case 'pad': return buildPad(a, d.person);
    case 'padAccept': return buildPadAcceptance(a, d.person, d.role);
    case 'hipaa': return buildHipaa(a, d.person);
    case 'funeral': return buildFuneral(a, d.person);
    case 'signing': return buildSigning(a);
    case 'deposit': return buildDepositInstructions(a);
    case 'courtesy': return buildCourtesyLetter(a, d.index);
    default: throw new Error(`Unknown document type ${d.type}`);
  }
}

export function generatePackage(a) {
  const result = evaluate(a);
  const documents = result.documents.map((d) => ({ ...d, doc: buildDocument(a, d) }));
  return { ...result, documents };
}
