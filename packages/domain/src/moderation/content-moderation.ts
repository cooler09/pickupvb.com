import {
  DataSet,
  RegExpMatcher,
  TextCensor,
  asteriskCensorStrategy,
  englishDataset,
  englishRecommendedTransformers,
  type EnglishProfaneWord,
  type ParsedPattern,
} from 'obscenity';
import { ValidationError } from '../shared/result.js';

/**
 * How a surface wants user text screened (see ADR 0030).
 *
 * - `'mask'` — public surfaces (titles, descriptions, profile/group/event
 *   names, and the team/event/group chat rooms). Tier-A profanity is censored
 *   into the returned `cleaned` string; Tier-B extreme content is blocked.
 * - `'block-extreme'` — private surfaces (DMs). Tier-A profanity is left
 *   untouched (adults may swear at each other in a 1:1 thread); only Tier-B
 *   extreme content is blocked.
 *
 * Both policies block Tier-B — extreme content is never acceptable anywhere.
 */
export type ModerationPolicy = 'mask' | 'block-extreme';

export interface ScreenResult {
  /**
   * The text after masking. For `'mask'` this is the input with Tier-A
   * profanity replaced by asterisks; for `'block-extreme'` it is the input
   * returned unchanged. Either way it never contains Tier-B content (that path
   * throws before returning).
   */
  cleaned: string;
  /**
   * True when any Tier-A profanity was present — whether or not it was masked.
   * Lets a caller decide to e.g. shadow-flag a DM that was let through.
   */
  hadProfanity: boolean;
}

export interface ContentModerationOptions {
  /**
   * Extra terms that must never be masked — the false-positive escape hatch
   * for the Scunthorpe problem (surnames / place names that embed a blacklisted
   * substring). Merged with the library's built-in whitelist. See ADR 0030.
   */
  allowlist?: readonly string[];
  /**
   * Additional Tier-B patterns to block, on top of {@link EXTREME_WORDS} — for
   * terms the base dataset doesn't carry. Tests inject a benign sentinel here
   * rather than asserting against real slurs.
   *
   * Author these with the library's `parseRawPattern` / `pattern` helpers, and
   * note the recommended transformers collapse duplicate characters in the
   * input: a pattern with a doubled letter (`zz`) won't match input whose `zz`
   * collapses to `z`. The {@link EXTREME_WORDS} subset sidesteps this by reusing
   * the dataset's own collapse-aware patterns.
   */
  extremePatterns?: readonly ParsedPattern[];
}

/**
 * Tier-B — extreme content blocked on every surface, public or private.
 *
 * This is a **curated content list**, not program logic: review it the way a
 * policy document is reviewed, and expect it to grow. It is the identity-hate
 * subset of `obscenity`'s English dataset — slurs targeting race/ethnicity,
 * sexual orientation/gender identity, and disability — i.e. terms with no
 * legitimate use in this product's community. Drawing the subset from the
 * dataset (rather than hand-authoring patterns) inherits its battle-tested,
 * leetspeak- and duplicate-collapse-aware matching.
 *
 * Deliberately **not** here (left to Tier-A masking + the report backstop + a
 * future off-hot-path AI tier, per ADR 0030): sexual-violence and explicit
 * terms (`rape`, `incest`, …) and credible threats — they appear in legitimate
 * discussion ("the ref raped us") and a hard block would over-censor. `negro`
 * is also omitted as too context-dependent for an automatic block.
 */
export const EXTREME_WORDS: ReadonlySet<EnglishProfaneWord> = new Set([
  // Race / ethnicity.
  'abo',
  'abeed',
  'africoon',
  'arabush',
  'boonga',
  'chingchong',
  'chink',
  'kike',
  'nigger',
  // Sexual orientation / gender identity.
  'fag',
  'dyke',
  'tranny',
  // Disability.
  'retard',
  'spastic',
]);

/**
 * Default false-positive allowlist. The library already whitelists many of
 * these; a handful of name/place exemplars are kept here as the seed for the
 * project-owned list (ADR 0030 follow-up).
 */
const DEFAULT_ALLOWLIST: readonly string[] = ['scunthorpe', 'penistone', 'cockburn', 'cockfosters'];

/**
 * Two-tier profanity screen — the proactive front line described in ADR 0030.
 *
 * Pure and synchronous: it runs the wordlist matchers in-process, so it adds no
 * latency, no per-call cost, and sends nothing off-system — safe to call on the
 * chat send hot path. It sits *in front of* the reactive report → auto-hide
 * backstop; it does not replace it (the wordlist can't judge context or novel
 * terms).
 *
 * Build once and reuse — constructing the matchers compiles the datasets, so
 * the shared {@link contentModeration} singleton is the normal entry point.
 */
export class ContentModeration {
  private readonly profanity: RegExpMatcher;
  private readonly extreme: RegExpMatcher;
  private readonly censor: TextCensor;

  constructor(options: ContentModerationOptions = {}) {
    // Tier A (mask): the full English dataset, plus the false-positive allowlist.
    const builtProfanity = englishDataset.build();
    this.profanity = new RegExpMatcher({
      ...builtProfanity,
      whitelistedTerms: [
        ...(builtProfanity.whitelistedTerms ?? []),
        ...DEFAULT_ALLOWLIST,
        ...(options.allowlist ?? []),
      ],
      ...englishRecommendedTransformers,
    });

    // Tier B (block): the identity-hate subset of the same dataset, plus any
    // caller-supplied custom patterns. Cloned into a fresh DataSet so the shared
    // `englishDataset` is never mutated.
    const extremeDataset = new DataSet<{ originalWord: EnglishProfaneWord }>()
      .addAll(englishDataset)
      .removePhrasesIf(
        (phrase) =>
          phrase.metadata === undefined || !EXTREME_WORDS.has(phrase.metadata.originalWord),
      );
    for (const p of options.extremePatterns ?? []) {
      extremeDataset.addPhrase((phrase) => phrase.addPattern(p));
    }
    this.extreme = new RegExpMatcher({
      ...extremeDataset.build(),
      ...englishRecommendedTransformers,
    });

    // Deterministic mask (`****`) rather than the library's default grawlix, so
    // output is stable for callers, tests, and snapshots.
    this.censor = new TextCensor().setStrategy(asteriskCensorStrategy());
  }

  /**
   * Screen `text` under `policy`. Throws {@link ValidationError} when Tier-B
   * extreme content is present (both policies). Otherwise returns the
   * (possibly masked) text plus whether Tier-A profanity was found.
   */
  screen(text: string, policy: ModerationPolicy): ScreenResult {
    // Tier B blocks first, on every surface — before any masking happens, so an
    // extreme term is never merely censored on a public page.
    if (this.extreme.hasMatch(text)) {
      throw new ValidationError("That contains language that isn't allowed here.", {
        reason: 'extreme',
      });
    }

    if (policy === 'block-extreme') {
      return { cleaned: text, hadProfanity: this.profanity.hasMatch(text) };
    }

    const matches = this.profanity.getAllMatches(text);
    if (matches.length === 0) {
      return { cleaned: text, hadProfanity: false };
    }
    return { cleaned: this.censor.applyTo(text, matches), hadProfanity: true };
  }
}

/**
 * Shared, pre-built instance. Constructing the matchers is the expensive part,
 * so callers reuse this rather than `new ContentModeration()` per request.
 */
export const contentModeration = new ContentModeration();
