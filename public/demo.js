// Demo entry: install the in-browser API, add a sample family, then start the app.
import '/mock-api.js';
import { youngFamilyCouple } from '/demo-sample.js';

window.__GLW_DEMO.sample = youngFamilyCouple;
if (!location.hash) location.hash = '#/q/start';
await import('/app.js');
