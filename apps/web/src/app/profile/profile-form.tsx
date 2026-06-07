'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { primaryButtonClass } from '@/components/primary-button';
import { POSITIONS, POSITION_LABEL } from '@/lib/enum-labels';
import { Alert } from '@/components/alert';
import { useAlertReveal } from '@/components/use-alert-reveal';
import { updateProfile, type ProfileFormState } from './actions';
import {
  fieldInputClass as inputClass,
  fieldLabelClass as labelClass,
} from '@/components/field-styles';

type Profile = {
  first_name: string | null;
  last_name: string | null;
  display_name: string;
  home_city: string | null;
  auto_accept_team_invites: boolean;
  show_pro_badge: boolean;
  discoverable: boolean;
  primary_position: string | null;
  secondary_position: string | null;
  tertiary_position: string | null;
  instagram_handle: string | null;
  tiktok_handle: string | null;
  twitter_handle: string | null;
  facebook_handle: string | null;
  youtube_handle: string | null;
  website_url: string | null;
};

const initialState: ProfileFormState = { error: null, success: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={primaryButtonClass('md')}>
      {pending ? 'Saving…' : 'Save changes'}
    </button>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border-base space-y-4 border-t pt-5 first:border-t-0 first:pt-0">
      <header className="space-y-1">
        <h3 className="text-fg text-base font-semibold">{title}</h3>
        {description && <p className="text-muted text-xs">{description}</p>}
      </header>
      {children}
    </section>
  );
}

function TextField({
  name,
  label,
  defaultValue,
  required,
  autoComplete,
  maxLength,
  hint,
  type = 'text',
  inputMode,
  placeholder,
}: {
  name: string;
  label: string;
  defaultValue: string | null | undefined;
  required?: boolean;
  autoComplete?: string;
  maxLength?: number;
  hint?: string;
  type?: 'text' | 'url';
  inputMode?: 'url' | 'text';
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className={labelClass}>
        {label}
        {!required && <span className="text-fg/50"> (optional)</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        {...(inputMode ? { inputMode } : {})}
        {...(autoComplete ? { autoComplete } : {})}
        {...(required ? { required: true } : {})}
        {...(maxLength ? { maxLength } : {})}
        {...(placeholder ? { placeholder } : {})}
        defaultValue={defaultValue ?? ''}
        className={inputClass}
      />
      {hint && <p className="text-muted mt-1 text-xs">{hint}</p>}
    </div>
  );
}

function PositionSelect({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: string | null;
}) {
  return (
    <div>
      <label htmlFor={name} className={labelClass}>
        {label}
      </label>
      <select id={name} name={name} defaultValue={defaultValue ?? ''} className={inputClass}>
        <option value="">— None —</option>
        {POSITIONS.map((p) => (
          <option key={p} value={p}>
            {POSITION_LABEL[p]}
          </option>
        ))}
      </select>
    </div>
  );
}

function ToggleCard({
  name,
  title,
  description,
  defaultChecked,
}: {
  name: string;
  title: string;
  description: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="border-border-base bg-surface hover:bg-fg/5 has-[:checked]:border-primary has-[:checked]:bg-highlight/40 flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm">
      <input name={name} type="checkbox" defaultChecked={defaultChecked} className="mt-0.5" />
      <span className="space-y-0.5">
        <span className="text-fg block font-medium">{title}</span>
        <span className="text-muted block text-xs">{description}</span>
      </span>
    </label>
  );
}

export function ProfileForm({
  profile,
  email,
  isPro,
}: {
  profile: Profile;
  email: string;
  isPro: boolean;
}) {
  const [state, formAction] = useFormState(updateProfile, initialState);
  const errorRef = useAlertReveal(state, Boolean(state.error || state.success));

  return (
    <form action={formAction} className="space-y-6">
      <Section title="Identity" description="How you appear to other players.">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="first_name"
            label="First name"
            defaultValue={profile.first_name}
            autoComplete="given-name"
            maxLength={60}
          />
          <TextField
            name="last_name"
            label="Last name"
            defaultValue={profile.last_name}
            autoComplete="family-name"
            maxLength={60}
          />
        </div>
        <TextField
          name="display_name"
          label="Display name"
          defaultValue={profile.display_name}
          required
          maxLength={80}
          hint="Shown publicly on events and rosters. Defaults to your first + last name."
        />
        <TextField
          name="home_city"
          label="Home city"
          defaultValue={profile.home_city}
          autoComplete="address-level2"
          maxLength={120}
        />
        <div className="text-muted text-xs">
          Email: <span className="text-fg font-medium">{email}</span>
        </div>
      </Section>

      <Section
        title="Positions"
        description="Used when position-based events fill spots and when tournament captains pick up free agents. Leave blank if you have no preference."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <PositionSelect
            name="primary_position"
            label="Primary"
            defaultValue={profile.primary_position}
          />
          <PositionSelect
            name="secondary_position"
            label="Secondary"
            defaultValue={profile.secondary_position}
          />
          <PositionSelect
            name="tertiary_position"
            label="Third"
            defaultValue={profile.tertiary_position}
          />
        </div>
      </Section>

      <Section
        title="Social media"
        description="Optional. Shown as small icons on your public player page. Paste just your handle (e.g. jane.doe) or a full profile URL — we'll normalize it."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            name="instagram_handle"
            label="Instagram"
            defaultValue={profile.instagram_handle}
            placeholder="jane.doe"
            maxLength={80}
          />
          <TextField
            name="tiktok_handle"
            label="TikTok"
            defaultValue={profile.tiktok_handle}
            placeholder="jane.doe"
            maxLength={80}
          />
          <TextField
            name="twitter_handle"
            label="X (Twitter)"
            defaultValue={profile.twitter_handle}
            placeholder="janedoe"
            maxLength={80}
          />
          <TextField
            name="facebook_handle"
            label="Facebook"
            defaultValue={profile.facebook_handle}
            placeholder="jane.doe"
            maxLength={80}
          />
          <TextField
            name="youtube_handle"
            label="YouTube"
            defaultValue={profile.youtube_handle}
            placeholder="janedoe"
            maxLength={80}
          />
          <TextField
            name="website_url"
            label="Website"
            defaultValue={profile.website_url}
            placeholder="https://example.com"
            maxLength={200}
            type="url"
            inputMode="url"
          />
        </div>
      </Section>

      <Section title="Preferences">
        <div className="grid gap-3 sm:grid-cols-2">
          <ToggleCard
            name="discoverable"
            title="Appear in player search"
            description="Let captains find and add you to teams, and list you in the players directory. Turn this off to stay private — you can still join events and create your own teams."
            defaultChecked={profile.discoverable}
          />
          <ToggleCard
            name="auto_accept_team_invites"
            title="Auto-accept team invites"
            description="Skip the confirmation step — captains can add you to their team roster directly."
            defaultChecked={profile.auto_accept_team_invites}
          />
          {isPro && (
            <ToggleCard
              name="show_pro_badge"
              title="Show Pro badge"
              description="Display the gold Pro pill next to your name on your public page. You'll still get all Pro perks if hidden."
              defaultChecked={profile.show_pro_badge}
            />
          )}
        </div>
      </Section>

      {(state.error || state.success) && (
        <div ref={errorRef} tabIndex={-1} className="outline-none">
          {state.error && <Alert variant="error">{state.error}</Alert>}
          {state.success && !state.error && <Alert variant="success">Profile updated.</Alert>}
        </div>
      )}

      <div className="border-border-base flex justify-end border-t pt-4">
        <SubmitButton />
      </div>
    </form>
  );
}
