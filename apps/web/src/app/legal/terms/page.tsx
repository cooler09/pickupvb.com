import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms that govern your use of PickupVB.',
};

const LAST_UPDATED = 'May 18, 2026';
const COMPANY = 'Zachary Lockhart Consulting, LLC';
const BRAND = 'PickupVB';
const CONTACT_EMAIL = 'support@pickupvb.com';
const LEGAL_EMAIL = 'legal@pickupvb.com';
const GOVERNING_LAW = 'the Commonwealth of Pennsylvania, United States';
const VENUE = 'the state and federal courts located in Erie County, Pennsylvania';

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p>
        <em>Last updated: {LAST_UPDATED}</em>
      </p>

      <p>
        These Terms of Service (the &quot;Terms&quot;) are a binding agreement between you and{' '}
        {COMPANY} (&quot;{BRAND}&quot;, &quot;we&quot;, &quot;us&quot;), the operator of the {BRAND}{' '}
        website and related services (collectively, the &quot;Service&quot;). By creating an account
        or otherwise using the Service, you agree to these Terms and to our{' '}
        <a href="/legal/privacy">Privacy Policy</a>. If you do not agree, do not use the Service.
      </p>

      <p>
        <strong>
          PLEASE READ SECTION 14 CAREFULLY. IT REQUIRES THAT MOST DISPUTES BE RESOLVED THROUGH
          BINDING INDIVIDUAL ARBITRATION AND WAIVES YOUR RIGHT TO PARTICIPATE IN A CLASS ACTION.
        </strong>
      </p>

      <h2>1. Definitions</h2>
      <ul>
        <li>
          <strong>&quot;Account&quot;</strong> means the account you create to access the Service.
        </li>
        <li>
          <strong>&quot;Host&quot;</strong> means a user who creates, organizes, or runs an event on
          the Service.
        </li>
        <li>
          <strong>&quot;Attendee&quot;</strong> means a user who RSVPs to, registers for, or attends
          an event.
        </li>
        <li>
          <strong>&quot;User Content&quot;</strong> means content you submit through the Service,
          including event listings, profile information, messages, and photos.
        </li>
        <li>
          <strong>&quot;Pro Subscription&quot;</strong> means the paid Pro Host subscription
          described in Section 7.
        </li>
      </ul>

      <h2>2. Eligibility</h2>
      <p>
        You must be at least 13 years old to use the Service. Users between 13 and the age of
        majority in their jurisdiction may use the Service only with parental or guardian consent.
        By using the Service you represent that you meet these requirements and that you are not
        barred from using the Service under applicable law.
      </p>

      <h2>3. Accounts</h2>
      <p>
        You are responsible for activity that occurs under your Account and for keeping your
        credentials confidential. Notify us immediately at{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> if you suspect unauthorized use. You
        must provide accurate registration information and keep it up to date. We may suspend or
        terminate Accounts that contain false information or that violate these Terms.
      </p>

      <h2>4. License to use the Service</h2>
      <p>
        Subject to your compliance with these Terms, {BRAND} grants you a limited, non-exclusive,
        non-transferable, revocable license to access and use the Service for personal,
        non-commercial purposes (or, for Hosts, for the commercial purposes expressly permitted by
        these Terms). All rights not expressly granted are reserved.
      </p>

      <h2>5. User Content</h2>
      <p>
        You retain ownership of your User Content. You grant {BRAND} a worldwide, non-exclusive,
        royalty-free, sublicensable license to host, store, reproduce, modify (for formatting),
        publicly display, and distribute your User Content solely to operate, improve, and promote
        the Service. This license ends when you delete your User Content, except to the extent it
        has been shared with others who have not deleted it, or to the extent we are required to
        retain it by law.
      </p>
      <p>
        You represent that you have all rights necessary to grant this license and that your User
        Content does not infringe the rights of any third party.
      </p>

      <h2>6. Hosts and paid events</h2>
      <p>
        Hosts may use the Service to organize free or paid events. Hosts who collect payments do so
        through Stripe Connect and, by onboarding, agree to the{' '}
        <a
          href="https://stripe.com/connect-account/legal"
          target="_blank"
          rel="noopener noreferrer"
        >
          Stripe Connected Account Agreement
        </a>{' '}
        and the{' '}
        <a href="https://stripe.com/legal/ssa" target="_blank" rel="noopener noreferrer">
          Stripe Services Agreement
        </a>
        .
      </p>
      <p>Hosts are solely responsible for:</p>
      <ul>
        <li>
          The accuracy of event listings, including date, location, price, format, skill level, and
          capacity.
        </li>
        <li>
          Delivering the event substantially as described, or processing refunds consistent with our{' '}
          <a href="/legal/refunds">Refund Policy</a>.
        </li>
        <li>
          Securing any venue permissions, equipment, insurance, and permits required by their
          jurisdiction.
        </li>
        <li>
          Collecting and remitting all applicable taxes on event proceeds. {BRAND} does not act as a
          merchant of record for Host events and does not withhold or remit taxes on a Host&apos;s
          behalf.
        </li>
        <li>Complying with all laws applicable to the events they run.</li>
      </ul>
      <p>
        {BRAND} charges Hosts service fees as disclosed in the Service. Fees may change with
        prospective notice.
      </p>

      <h2>7. Pro Host subscription</h2>
      <p>
        The Pro Host subscription is a recurring paid subscription that unlocks additional Host
        features. Current pricing and features are shown on the <a href="/pricing">pricing page</a>.
      </p>
      <p>
        <strong>Automatic renewal.</strong> Pro Subscriptions renew automatically at the end of each
        billing period (monthly or annual, depending on the plan you selected) at the then-current
        price, until you cancel. You authorize {BRAND} and its payment processor to charge your
        payment method for each renewal.
      </p>
      <p>
        <strong>Free trial.</strong> Eligible users may receive a free trial. If you do not cancel
        before the trial ends, you will be charged the applicable subscription fee. Trials are
        limited to one per user, and {BRAND} may modify or end trials at any time.
      </p>
      <p>
        <strong>Cancellation.</strong> You may cancel at any time from your billing settings or via
        the Stripe Billing Portal link in your Account. Cancellation takes effect at the end of the
        current billing period; you retain access to Pro features until then. Except where required
        by law, subscription fees are non-refundable for partial periods.
      </p>
      <p>
        <strong>California subscribers.</strong> If you reside in California, you may cancel by
        emailing <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we will process the
        cancellation within 30 days, in accordance with the California Automatic Renewal Law (Cal.
        Bus. &amp; Prof. Code §17600 et seq.).
      </p>

      <h2>8. Acceptable use</h2>
      <p>You agree not to, and not to enable any third party to:</p>
      <ul>
        <li>
          Use the Service in any way that violates law, infringes intellectual property rights, or
          is fraudulent, harmful, threatening, harassing, defamatory, or hateful.
        </li>
        <li>
          Impersonate another person, misrepresent your affiliation, or create accounts on behalf of
          another without authorization.
        </li>
        <li>
          Probe, scan, or test the vulnerability of the Service, breach security or authentication
          measures, or attempt to access data not intended for you.
        </li>
        <li>
          Interfere with or disrupt the Service, the servers or networks connected to it, or any
          user&apos;s use of it.
        </li>
        <li>
          Scrape, harvest, or mine data from the Service except through publicly documented APIs and
          within published rate limits.
        </li>
        <li>Use the Service to send unsolicited commercial messages, spam, or chain letters.</li>
        <li>
          Use the Service to organize, promote, or facilitate illegal activity, including unlawful
          gambling, money laundering, or sale of regulated goods.
        </li>
      </ul>

      <h2>9. Assumption of risk and release</h2>
      <p>
        <strong>
          Volleyball and other pickup sports involve inherent physical risk, including risk of
          serious injury or death.
        </strong>{' '}
        {BRAND} does not organize, supervise, control, or attend events listed on the Service.{' '}
        {BRAND} does not screen Hosts, Attendees, venues, or participants, and does not verify any
        representation made by them.
      </p>
      <p>
        To the fullest extent permitted by law, you assume all risk arising out of or related to
        your participation in any event listed on the Service, and you release {COMPANY}, its
        affiliates, officers, directors, employees, agents, and licensors from any claim, demand,
        loss, damage, injury, illness, or death arising out of or related to such participation,
        whether occurring before, during, or after the event, and whether arising on the part of{' '}
        {BRAND}, a Host, an Attendee, a venue operator, or any third party.
      </p>

      <h2>10. Intellectual property; copyright notices</h2>
      <p>
        The Service, including its software, design, text, graphics, and trademarks (other than User
        Content), is owned by {COMPANY} or its licensors and is protected by intellectual property
        laws.
      </p>
      <p>
        We respond to notices of alleged copyright infringement under the Digital Millennium
        Copyright Act (DMCA). To submit a notice, email{' '}
        <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a> with: (a) identification of the
        copyrighted work claimed to be infringed; (b) identification of the allegedly infringing
        material and its location on the Service; (c) your contact information; (d) a statement that
        you have a good-faith belief that the use is not authorized; (e) a statement, under penalty
        of perjury, that the information is accurate and that you are authorized to act on behalf of
        the copyright owner; and (f) your physical or electronic signature. Repeat infringers&apos;
        accounts will be terminated.
      </p>

      <h2>11. Third-party services</h2>
      <p>
        The Service integrates with third-party services such as Stripe, Supabase, Vercel, Resend,
        Sentry, and Cloudflare Turnstile. Your use of those services is governed by their own terms
        and privacy policies. {BRAND} is not responsible for third-party services.
      </p>

      <h2>12. Disclaimers</h2>
      <p>
        <strong>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTY OF
          ANY KIND, EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION WARRANTIES OF MERCHANTABILITY,
          FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, AND ANY WARRANTY ARISING OUT OF COURSE
          OF DEALING OR USAGE OF TRADE.
        </strong>{' '}
        {BRAND} does not warrant that the Service will be uninterrupted, secure, or error-free; that
        defects will be corrected; or that any content (including event listings) is accurate or
        reliable.
      </p>

      <h2>13. Limitation of liability</h2>
      <p>
        <strong>
          TO THE FULLEST EXTENT PERMITTED BY LAW, {COMPANY.toUpperCase()} AND ITS AFFILIATES WILL
          NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE
          DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, GOODWILL, OR OTHER INTANGIBLE LOSSES,
          ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE.
        </strong>
      </p>
      <p>
        <strong>
          {COMPANY.toUpperCase()}&apos;S TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF OR RELATING TO
          THESE TERMS OR THE SERVICE WILL NOT EXCEED THE GREATER OF (A) THE AMOUNTS YOU PAID US IN
          THE 12 MONTHS PRECEDING THE EVENT GIVING RISE TO THE LIABILITY, OR (B) US $100.
        </strong>
      </p>
      <p>
        Some jurisdictions do not allow the exclusion or limitation of certain damages; in those
        jurisdictions the foregoing limitations apply only to the extent permitted by law.
      </p>

      <h2>14. Dispute resolution; arbitration; class action waiver</h2>
      <p>
        <strong>Informal resolution.</strong> Before filing a claim, you agree to try to resolve the
        dispute by emailing <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a>. If we cannot
        resolve it within 60 days, either party may bring a formal proceeding.
      </p>
      <p>
        <strong>Binding arbitration.</strong> You and {BRAND} agree that any dispute arising out of
        or related to these Terms or the Service will be resolved through binding individual
        arbitration administered by the American Arbitration Association (AAA) under its Consumer
        Arbitration Rules. The arbitration will be held in the county where you reside (or, at your
        election, conducted remotely). Judgment on the award may be entered in any court of
        competent jurisdiction.
      </p>
      <p>
        <strong>Class action waiver.</strong> You and {BRAND} agree that each may bring claims only
        in an individual capacity and not as a plaintiff or class member in any purported class or
        representative proceeding.
      </p>
      <p>
        <strong>Exceptions.</strong> Either party may bring an individual action in small-claims
        court, or seek injunctive or equitable relief in court to protect its intellectual property
        rights.
      </p>
      <p>
        <strong>Opt-out.</strong> You may opt out of this arbitration agreement by emailing{' '}
        <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a> within 30 days of first accepting these
        Terms, stating your name, email, and intent to opt out.
      </p>

      <h2>15. Governing law</h2>
      <p>
        These Terms are governed by the laws of {GOVERNING_LAW}, without regard to conflict-of-laws
        principles. Subject to Section 14, any action not subject to arbitration will be brought
        exclusively in {VENUE}, and you consent to the personal jurisdiction of those courts.
      </p>

      <h2>16. Termination</h2>
      <p>
        You may stop using the Service at any time and close your Account from your profile
        settings. {BRAND} may suspend or terminate your access to the Service at any time, with or
        without notice, if we reasonably believe you have violated these Terms or that termination
        is necessary to protect the Service, its users, or {COMPANY}. Sections that by their nature
        should survive termination will survive (including Sections 5, 9, 12, 13, 14, 15, and 18).
      </p>

      <h2>17. Changes to the Terms</h2>
      <p>
        We may update these Terms from time to time. If we make material changes, we will notify you
        (for example, by email or an in-app notice) at least 14 days before the changes take effect.
        Continued use of the Service after the effective date constitutes acceptance of the updated
        Terms.
      </p>

      <h2>18. Miscellaneous</h2>
      <ul>
        <li>
          <strong>Entire agreement.</strong> These Terms, together with the Privacy Policy and any
          other policies referenced in the Service, constitute the entire agreement between you and{' '}
          {COMPANY}.
        </li>
        <li>
          <strong>Severability.</strong> If any provision is held unenforceable, the remainder will
          remain in effect.
        </li>
        <li>
          <strong>Assignment.</strong> You may not assign these Terms without our prior written
          consent. {COMPANY} may assign these Terms freely, including in connection with a merger,
          acquisition, or sale of assets.
        </li>
        <li>
          <strong>Waiver.</strong> Our failure to enforce any right or provision is not a waiver of
          that right or provision.
        </li>
        <li>
          <strong>Notices.</strong> Notices to you may be provided by email or through the Service.
          Notices to {COMPANY} should be sent to <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a>
          .
        </li>
        <li>
          <strong>No agency.</strong> Nothing in these Terms creates any agency, partnership, joint
          venture, or employment relationship.
        </li>
      </ul>

      <h2>19. Contact</h2>
      <p>
        Questions about these Terms? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>{' '}
        (general) or <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a> (legal notices).
      </p>
      <p>
        <strong>{COMPANY}</strong>
      </p>
    </>
  );
}
