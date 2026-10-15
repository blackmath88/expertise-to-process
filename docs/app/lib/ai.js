// AI boundary. The MVP ships only the offline adapter: guided questions, a labelled script and rules.
// A later adapter (e.g. a self-hosted model behind an authorised server) must return the same shapes:
// proposals that the person previews and accepts. Adapters never publish, merge records, set review,
// effectiveness or authority status, or overwrite accepted process data.
import {createProposal, scriptedTurns} from './guidance.js';
import {reviewProcess} from './review.js';
import {suggestClassification as keywordClassification} from './library.js';

export function createOfflineAdapter({taxonomy} = {}) {
  return {
    mode: 'offline',
    label: 'Offline: feste Fragen, vorbereitetes Drehbuch und Regeln – keine KI',
    makesNetworkRequests: false,
    /** Proposals for a process. Offline this is the prepared script, clearly labelled as such. */
    async proposeProcess() { return scriptedTurns().map(t => ({...t, proposal: createProposal(t.ops, {label: t.label, source: 'scripted-example'})})); },
    /** Reflection questions derived from model facts. */
    async suggestReflection(process, extras) { return reviewProcess(process, extras).questions; },
    /** Category suggestions with evidence; the person accepts or rejects them. */
    async suggestClassification(process, extras = {}) {
      if (!taxonomy) return {source: 'keyword-rule', activityTags: [], frictionTags: []};
      return keywordClassification(process, taxonomy, extras.reported);
    }
  };
}
