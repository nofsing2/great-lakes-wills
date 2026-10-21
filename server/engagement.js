// Limited-scope engagement terms shown at checkout (MRPC 1.2(b), 1.5(b)).
// Firm decisions (Oct. 20, 2026): limited-scope engagement; flat fee earned upon receipt.
// Changing this text? Bump ENGAGEMENT_VERSION so each order records which version the client accepted.
import { FEES, FIRM } from '../public/engine/constants.js';
import { money } from '../public/engine/util.js';

export const ENGAGEMENT_VERSION = '2026-10-v1';

export function engagementText({ clientNames, documents, total, extras = [], costs = 0 }) {
  return `LIMITED-SCOPE ENGAGEMENT AGREEMENT

Client(s): ${clientNames}
Law firm: ${FIRM.legalEntity}, ${FIRM.address}, offering this service as ${FIRM.name} ("the Firm")
Reviewing attorney: ${FIRM.reviewingAttorney}

1. Limited scope. You are hiring the Firm for the limited purpose described in section 3 only, as permitted by Michigan Rule of Professional Conduct 1.2(b). The Firm is not your lawyer for any other matter.

2. When representation begins. Submitting this order is a request for legal services. An attorney-client relationship begins only when the Firm completes a conflict-of-interest check and the reviewing attorney accepts the matter. If the Firm declines, it will refund the full fee.

3. Scope. The Firm will (a) review your questionnaire answers, (b) contact you if anything needs clarification, which may include a short phone or video call, (c) prepare the following documents under Michigan law: ${documents}, (d) make one round of reasonable revisions, ${extras.length ? `(e) provide written signing instructions, and after you sign, ${extras.map((e, i) => `(${'fghij'[i]}) ${e}`).join(' and ')}` : 'and (e) provide written signing instructions'}.

4. Not included. Unless agreed in writing, the Firm will not: supervise your signing; transfer or retitle assets; change beneficiary designations; prepare deeds, trusts, tax returns, or Medicaid applications; advise on laws of other states; or administer any estate. Your documents may not suit circumstances you did not disclose.

5. Your responsibilities. You agree to give complete and accurate information, to sign the documents exactly as the signing instructions describe, and to tell the Firm about anything that might affect your plan. If someone who benefits from your plan is helping you, the attorney may need to speak with you alone.

6. Fee. The flat fee is ${money(total - costs)}. It covers the services in section 3. Rush review, if you choose it at checkout, adds ${money(FEES.rushReview)}.${costs ? ` Court fees of ${money(costs)} are not part of the Firm's fee; they are held in the Firm's client trust account until paid to the court.` : ''} The fee is earned upon receipt and will be deposited in the Firm's operating account, not its client trust account. Because it is earned when paid, it is not refundable, with two exceptions: if the Firm declines the matter after its conflict check or initial review, the Firm will refund the full fee; and the Firm will make any refund the Michigan Rules of Professional Conduct require.

7. Confidentiality and communication. Information you provide is confidential and is used only to provide these services. You agree that the Firm may communicate with you by email and through this website.

8. End of representation. The representation ends when the Firm delivers your approved documents, or 90 days after the Firm asks you for information or changes and you do not respond, whichever is first. The Firm has no continuing duty to update your documents for later changes in law or in your circumstances.

9. Michigan law. This agreement is governed by Michigan law.`;
}
