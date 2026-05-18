'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { POSITIONS, POSITION_LABEL } from '@/lib/enum-labels';
import { Alert } from '@/components/alert';
import { updateProfile, type ProfileFormState } from './actions';

type Profile = {
  first_name: string | null;
  last_name: string | null;
  display_name: string;
  home_city: string | null;
  auto_accept_team_invites: boolean;
  show_pro_badge: boolean;
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
    <button
      type="submit"
      disabled={pending}
      className="bg-primary hover:bg-primary/90 rounded-md px-4 py-2 font-medium text-white disabled:opacity-60"
    >
      {pending ? 'Saving…' : 'Save changes'}
    </button>
  );
}

function SocialInput({
  name,
  label,
  placeholder,
  defaultValue,
  maxLength = 80,
  inputMode,
}: {
  name: string;
  label: string;
  placeholder: string;
  defaultValue: string | null;
  maxLength?: number;
  inputMode?: 'url' | 'text';
}) {
  return (
    <label className="block">
      <span className="text-fg/70 text-xs font-medium tracking-wide uppercase">{label}</span>
      <input
        name={name}
        type="text"
        inputMode={inputMode ?? 'text'}
        placeholder={placeholder}
        defaultValue={defaultValue ?? ''}
        maxLength={maxLength}
        className="border-border-base bg-surface mt-1 w-full rounded-md border px-3 py-2 text-sm"
      />
    </label>
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
    <label className="block">
      <span className="text-fg/70 text-xs font-medium tracking-wide uppercase">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue ?? ''}
        className="border-border-base bg-surface mt-1 w-full rounded-md border px-3 py-2 text-sm"
      >
        <option value="">— None —</option>
        {POSITIONS.map((p) => (
          <option key={p} value={p}>
            {POSITION_LABEL[p]}
          </option>
        ))}
      </select>
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

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">First name</span>
          <input
            name="first_name"
            type="text"
            autoComplete="given-name"
            defaultValue={profile.first_name ?? ''}
            maxLength={60}
            className="border-border-base mt-1 w-full rounded-md border px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Last name</span>
          <input
            name="last_name"
            type="text"
            autoComplete="family-name"
            defaultValue={profile.last_name ?? ''}
            maxLength={60}
            className="border-border-base mt-1 w-full rounded-md border px-3 py-2"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium">Display name</span>
        <input
          name="display_name"
          type="text"
          required
          defaultValue={profile.display_name}
          maxLength={80}
          className="border-border-base mt-1 w-full rounded-md border px-3 py-2"
        />
        <span className="text-fg/60 mt-1 block text-xs">
          Shown publicly on events and rosters. Defaults to your first + last name.
        </span>
      </label>

      <label className="block">
        <span className="text-sm font-medium">Home city</span>
        <input
          name="home_city"
          type="text"
          autoComplete="address-level2"
          defaultValue={profile.home_city ?? ''}
          maxLength={120}
          className="border-border-base mt-1 w-full rounded-md border px-3 py-2"
        />
      </label>

      <fieldset className="border-border-base space-y-3 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">Positions</legend>
        <p className="text-fg/60 px-1 text-xs">
          Tell hosts and captains where you like to play. Used when position-based events fill spots
          and when tournament captains pick up free agents. Leave any of these blank if you
          don&apos;t have a preference.
        </p>
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
      </fieldset>

      <fieldset className="border-border-base space-y-3 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">Social media</legend>
        <p className="text-fg/60 px-1 text-xs">
          Optional. Shown as small icons on your public player page. Paste just your handle (e.g.{' '}
          <code>jane.doe</code>) or a full profile URL &mdash; we&apos;ll normalize it.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <SocialInput
            name="instagram_handle"
            label="Instagram"
            placeholder="jane.doe"
            defaultValue={profile.instagram_handle}
          />
          <SocialInput
            name="tiktok_handle"
            label="TikTok"
            placeholder="jane.doe"
            defaultValue={profile.tiktok_handle}
          />
          <SocialInput
            name="twitter_handle"
            label="X (Twitter)"
            placeholder="janedoe"
            defaultValue={profile.twitter_handle}
          />
          <SocialInput
            name="facebook_handle"
            label="Facebook"
            placeholder="jane.doe"
            defaultValue={profile.facebook_handle}
          />
          <SocialInput
            name="youtube_handle"
            label="YouTube"
            placeholder="janedoe"
            defaultValue={profile.youtube_handle}
          />
          <SocialInput
            name="website_url"
            label="Website"
            placeholder="https://example.com"
            defaultValue={profile.website_url}
            maxLength={200}
            inputMode="url"
          />
        </div>
      </fieldset>

      <div className="text-fg/70 block text-sm">
        Email: <span className="text-fg font-medium">{email}</span>
      </div>

      <fieldset className="border-border-base space-y-2 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">Team invites</legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            name="auto_accept_team_invites"
            type="checkbox"
            defaultChecked={profile.auto_accept_team_invites}
            className="mt-1"
          />
          <span>
            <span className="font-medium">Auto-accept team invites</span>
            <span className="text-fg/60 mt-0.5 block text-xs">
              Skip the confirmation step — captains can add you to their team roster directly.
            </span>
          </span>
        </label>
      </fieldset>

      {isPro && (
        <fieldset className="border-border-base space-y-2 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">Pro badge</legend>
          <label className="flex items-start gap-2 text-sm">
            <input
              name="show_pro_badge"
              type="checkbox"
              defaultChecked={profile.show_pro_badge}
              className="mt-1"
            />
            <span>
              <span className="font-medium">Show Pro badge on my profile</span>
              <span className="text-fg/60 mt-0.5 block text-xs">
                Turn this off to hide the gold Pro pill next to your name on your public player
                page. You&apos;ll still get all Pro perks.
              </span>
            </span>
          </label>
        </fieldset>
      )}

      {state.error && <Alert variant="error">{state.error}</Alert>}
      {state.success && !state.error && <Alert variant="success">Profile updated.</Alert>}

      <SubmitButton />
    </form>
  );
}
