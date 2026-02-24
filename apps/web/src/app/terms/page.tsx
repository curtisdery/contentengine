import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service — Pandocast',
  description: 'Pandocast Terms of Service. Read our terms governing the use of the Pandocast platform.',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-cme-bg">
      {/* Header */}
      <header className="border-b border-cme-border/50">
        <div className="mx-auto max-w-3xl px-6 py-6 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold text-cme-text hover:text-cme-primary transition-colors">
            Pandocast
          </Link>
          <Link
            href="/"
            className="text-sm text-cme-text-muted hover:text-cme-text transition-colors"
          >
            &larr; Back to home
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-6 py-12">
        <article className="prose-legal">
          <h1 className="text-3xl font-bold text-cme-text mb-2">Terms of Service</h1>
          <p className="text-sm text-cme-text-muted mb-10">Effective: February 24, 2026</p>

          <p>
            These Terms of Service (&ldquo;Terms&rdquo;) govern your use of the Pandocast platform
            (&ldquo;Service&rdquo;) operated by Pandocast Inc. (&ldquo;Pandocast,&rdquo;
            &ldquo;we,&rdquo; &ldquo;us,&rdquo; &ldquo;our&rdquo;). By creating an account or
            using the Service, you agree to be bound by these Terms. If you do not agree, do not use
            the Service.
          </p>

          <h2>1. The Service</h2>
          <p>
            Pandocast is a content transformation and distribution platform that helps creators
            repurpose long-form content into multiple platform-native formats. The Service includes
            content analysis, AI-powered content generation, scheduling, automated and manual
            publishing to connected social media platforms, and performance analytics.
          </p>

          <h2>2. Eligibility</h2>
          <p>
            You must be at least 16 years old to use Pandocast. If you are between 16 and 18, you
            represent that your parent or legal guardian has reviewed and consents to these Terms. By
            creating an account, you represent that you meet these requirements and have the legal
            capacity to enter into a binding agreement.
          </p>

          <h2>3. Your Account</h2>
          <p>
            You are responsible for maintaining the confidentiality and security of your account
            credentials, including any API keys or connected platform tokens associated with your
            account. You are responsible for all activity that occurs under your account, whether or
            not you authorized such activity. You agree to notify us immediately at{' '}
            <a href="mailto:support@pandocast.ai">support@pandocast.ai</a> if you suspect any
            unauthorized access or use of your account.
          </p>

          <h2>4. Your Content and Intellectual Property</h2>
          <p>
            <strong>You own your content.</strong> You retain all ownership rights, including all
            intellectual property rights, to content you upload to Pandocast (&ldquo;Input
            Content&rdquo;) and to the outputs generated from your content (&ldquo;Generated
            Content&rdquo;). Together, Input Content and Generated Content are referred to as
            &ldquo;Your Content.&rdquo;
          </p>
          <p>
            By uploading content, you grant Pandocast a limited, non-exclusive, revocable license to
            process, analyze, transform, and store Your Content solely for the purpose of providing,
            maintaining, and improving the Service as it pertains to your account. This license
            terminates when you delete your account or the applicable content.
          </p>
          <p>
            <strong>We do not use Your Content to train AI models.</strong> Your Input Content and
            Generated Content are never used to train, fine-tune, or improve any artificial
            intelligence or machine learning models &mdash; whether owned by Pandocast, our AI
            providers, or any third party. Your content is processed through third-party AI services
            (currently Anthropic&rsquo;s Claude) solely to generate outputs for your use, and we use
            zero-data-retention API configurations where available. Your content is yours. Period.
          </p>
          <p>
            You represent and warrant that you have all necessary rights, licenses, and permissions
            to upload and distribute the content you provide, and that Your Content does not infringe
            or misappropriate any third party&rsquo;s intellectual property rights, privacy rights,
            publicity rights, or any applicable laws or regulations.
          </p>

          <h2>5. AI-Generated Content &mdash; Disclaimers and Limitations</h2>
          <p>
            Pandocast uses third-party artificial intelligence services to analyze your content and
            generate platform-native outputs. You acknowledge and agree that:
          </p>
          <ul>
            <li>
              <strong>No guarantee of accuracy.</strong> AI-generated outputs may contain factual
              errors, inaccuracies, misrepresentations, hallucinations, or unintended content.
              Pandocast does not warrant that Generated Content is accurate, complete, reliable, or
              error-free.
            </li>
            <li>
              <strong>No guarantee of non-infringement.</strong> AI-generated outputs may
              inadvertently reproduce or closely resemble existing copyrighted material, trademarks,
              or the proprietary content of third parties. Pandocast does not warrant that Generated
              Content will not infringe on any third party&rsquo;s intellectual property rights.
            </li>
            <li>
              <strong>No guarantee of fitness for purpose.</strong> Generated Content is provided as
              a starting point. Pandocast does not warrant that outputs are suitable for any
              particular platform, audience, purpose, or use case without human review and editing.
            </li>
            <li>
              <strong>No guarantee of platform compliance.</strong> Generated Content may not comply
              with the terms of service, community guidelines, content policies, or advertising
              standards of the platforms to which you publish. You are solely responsible for
              ensuring compliance with each platform&rsquo;s rules.
            </li>
            <li>
              <strong>Your responsibility to review.</strong> You agree to review and approve all
              Generated Content before publishing, except where you have explicitly enabled the
              Autopilot feature (see Section 9). You are solely responsible for all content published
              to your connected platforms, regardless of whether it was AI-generated.
            </li>
          </ul>

          <h2>6. Connected Platforms</h2>
          <p>
            When you connect social media or publishing accounts (&ldquo;Connected Platforms&rdquo;),
            you authorize Pandocast to access those accounts on your behalf for the following
            purposes: publishing content you have approved (or content approved via Autopilot),
            retrieving post-level analytics and engagement metrics, and reading basic account
            information such as username and follower count.
          </p>
          <p>
            You may revoke Pandocast&rsquo;s access to any Connected Platform at any time through the
            Pandocast settings page, through the Connected Platform&rsquo;s own authorization
            settings, or by contacting{' '}
            <a href="mailto:support@pandocast.ai">support@pandocast.ai</a>. Upon disconnection, we
            will delete the stored access credentials for that platform.
          </p>
          <p>
            You are responsible for complying with each Connected Platform&rsquo;s terms of service,
            API usage policies, content guidelines, and rate limits when publishing content through
            Pandocast. Pandocast is not responsible for changes to third-party platform APIs,
            policies, or availability that may affect the Service.
          </p>

          <h2>7. Subscriptions and Billing</h2>
          <p>
            Pandocast offers free and paid subscription tiers. Each tier provides access to different
            features, usage limits, and capabilities as described on our pricing page.
          </p>
          <p>
            <strong>Billing.</strong> Paid subscriptions are billed monthly or annually through our
            payment processor, Stripe. All fees are exclusive of applicable taxes. You are responsible
            for providing accurate and current billing information.
          </p>
          <p>
            <strong>Cancellation.</strong> You may cancel your paid subscription at any time.
            Cancellation takes effect at the end of the current billing period, and you will retain
            access to paid features until that period ends. No prorated refunds are provided for
            partial billing periods.
          </p>
          <p>
            <strong>Free tier.</strong> The free tier provides limited access to the Service at no
            cost. Pandocast reserves the right to modify, limit, or discontinue the free tier at any
            time with 30 days&rsquo; notice.
          </p>
          <p>
            <strong>Pricing changes.</strong> We may change subscription pricing with at least 30
            days&rsquo; advance notice. Price changes will take effect at the start of your next
            billing period following the notice.
          </p>
          <p>
            <strong>Refunds.</strong> Refund requests are handled on a case-by-case basis. Contact{' '}
            <a href="mailto:support@pandocast.ai">support@pandocast.ai</a> within 14 days of the
            relevant charge.
          </p>

          <h2>8. Acceptable Use</h2>
          <p>You agree not to use Pandocast to:</p>
          <ul>
            <li>
              Upload or distribute content that is illegal, hateful, harassing, threatening,
              defamatory, obscene, or promotes violence or discrimination.
            </li>
            <li>
              Infringe on any third party&rsquo;s intellectual property, privacy, or publicity
              rights.
            </li>
            <li>
              Distribute spam, malware, phishing content, or deceptive or misleading material.
            </li>
            <li>
              Attempt to access other users&rsquo; accounts, data, or encrypted credentials.
            </li>
            <li>
              Circumvent usage limits, rate limits, tier restrictions, or security measures through
              technical means.
            </li>
            <li>
              Resell, sublicense, or redistribute the Service or access to the Service without our
              prior written consent.
            </li>
            <li>
              Use the Service for automated scraping, data mining, or competitive intelligence
              gathering.
            </li>
            <li>
              Use the Service in any way that violates applicable laws, regulations, or third-party
              platform policies.
            </li>
          </ul>
          <p>
            We reserve the right to suspend or terminate accounts that violate these terms, with or
            without notice depending on the severity of the violation. Where practicable, we will
            provide notice and an opportunity to remedy the violation before termination.
          </p>

          <h2>9. Autopilot Publishing</h2>
          <p className="font-semibold text-cme-warning">
            Important: Autopilot enables automated publishing without manual review. Please read this
            section carefully before enabling it.
          </p>
          <p>
            Pandocast offers an optional Autopilot feature that can automatically approve and publish
            AI-generated content to your Connected Platforms based on quality thresholds and
            voice-matching scores that you configure. By enabling Autopilot, you expressly
            acknowledge and agree to the following:
          </p>
          <ul>
            <li>
              <strong>No manual review.</strong> Content published via Autopilot may reach your
              audience without any human review. While Pandocast applies automated quality checks
              (voice matching, content moderation, standalone value scoring), these checks are not
              infallible and do not substitute for human judgment.
            </li>
            <li>
              <strong>Your responsibility.</strong> You are solely and fully responsible for all
              content published via Autopilot, including any errors, inaccuracies, tone mismatches,
              timing issues, or unintended consequences.
            </li>
            <li>
              <strong>Eligibility requirements.</strong> Autopilot is only available after you have
              manually reviewed and approved a minimum number of content batches, and only when your
              historical approval rate meets the required threshold. These requirements exist to
              ensure Autopilot reflects your standards.
            </li>
            <li>
              <strong>Timing risks.</strong> Autopilot publishes content on pre-configured schedules
              and does not account for breaking news, current events, public crises, or other
              real-time context that might make scheduled content inappropriate or tone-deaf. You
              should monitor your publishing calendar during sensitive periods and disable Autopilot
              when circumstances warrant.
            </li>
            <li>
              <strong>Brand and reputational risk.</strong> Automated publishing inherently carries
              risk of reduced personal touch, engagement changes, or publishing mishaps. You accept
              these risks by enabling the feature.
            </li>
            <li>
              <strong>Disable at any time.</strong> You may disable Autopilot at any time through
              your account settings. Disabling Autopilot will cancel any queued posts that have not
              yet been published.
            </li>
          </ul>
          <p>
            Pandocast is not liable for any damages, losses, or consequences arising from content
            published through Autopilot, including but not limited to reputational harm, audience
            loss, platform penalties, or third-party claims.
          </p>

          <h2>10. Service Availability and Performance</h2>
          <p>
            <strong>Availability target.</strong> Pandocast targets 99.5% monthly uptime for core
            Service functions (content upload, generation, and publishing). This target is a goal, not
            a guarantee, and does not constitute a service level agreement (SLA). Uptime is measured
            as the percentage of time the Service&rsquo;s core API endpoints are responsive in a
            given calendar month, excluding planned maintenance windows.
          </p>
          <p>
            <strong>Planned maintenance.</strong> We will provide at least 24 hours&rsquo; advance
            notice for planned maintenance that may affect Service availability, via email or in-app
            notification. Where possible, maintenance will be scheduled during low-usage periods
            (midnight to 6 AM UTC).
          </p>
          <p>
            <strong>Publishing delays.</strong> Pandocast relies on third-party platform APIs to
            publish content and retrieve analytics. We are not responsible for delays, failures, or
            disruptions caused by third-party platform outages, API changes, rate limiting, content
            policy enforcement, or authentication revocations. If a scheduled post fails to publish
            due to a platform-side issue, Pandocast will attempt automatic retries (up to 3 attempts
            with increasing intervals) and will notify you of any permanent failures.
          </p>
          <p>
            <strong>Incident communication.</strong> In the event of significant unplanned downtime
            affecting publishing or content generation, we will post updates to our status page and
            notify affected users via email.
          </p>
          <p>
            <strong>No uptime credits.</strong> The Service does not currently offer credits, refunds,
            or compensation for downtime or publishing delays. If downtime materially impacts your
            use, you may cancel your subscription as described in Section 7.
          </p>

          <h2>11. Disclaimer of Warranties</h2>
          <p className="uppercase font-semibold text-cme-text">
            THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT
            WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE.
          </p>
          <p>
            To the maximum extent permitted by applicable law, Pandocast expressly disclaims all
            warranties, including but not limited to:
          </p>
          <ul>
            <li>
              <strong>Implied warranties of merchantability</strong> &mdash; that the Service is of
              satisfactory quality or fit for general commercial use.
            </li>
            <li>
              <strong>Fitness for a particular purpose</strong> &mdash; that the Service or Generated
              Content will be suitable for your specific needs, audience, or platform requirements.
            </li>
            <li>
              <strong>Non-infringement</strong> &mdash; that the Service or Generated Content will
              not infringe or misappropriate any third party&rsquo;s intellectual property rights,
              including copyrights, trademarks, patents, or trade secrets.
            </li>
            <li>
              <strong>Accuracy or reliability of AI outputs</strong> &mdash; that AI-generated
              content will be factually accurate, free from hallucinations, tonally appropriate,
              brand-safe, or consistent with your voice and style preferences.
            </li>
            <li>
              <strong>Uninterrupted or error-free operation</strong> &mdash; that the Service will
              operate without interruption, delay, errors, or security vulnerabilities.
            </li>
            <li>
              <strong>Third-party platform compatibility</strong> &mdash; that the Service will
              remain compatible with third-party platform APIs, which may change without notice.
            </li>
          </ul>
          <p>
            You acknowledge that no technology or AI system can guarantee perfect results, and that
            the Service requires human oversight, particularly for content published to public-facing
            platforms.
          </p>

          <h2>12. Limitation of Liability</h2>
          <p>
            <strong>Liability cap.</strong> To the maximum extent permitted by applicable law,
            Pandocast&rsquo;s total aggregate liability for all claims arising out of or relating to
            these Terms or the Service &mdash; whether in contract, tort (including negligence),
            strict liability, or otherwise &mdash; shall not exceed the greater of: (a) the total
            amount you paid to Pandocast in the twelve (12) months immediately preceding the event
            giving rise to the claim, or (b) fifty U.S. dollars ($50). This minimum floor ensures
            that free-tier users retain a meaningful basis for claims.
          </p>
          <p>
            <strong>Exclusion of consequential damages.</strong> In no event shall Pandocast be
            liable for any indirect, incidental, special, consequential, exemplary, or punitive
            damages, including but not limited to: loss of profits, revenue, or business
            opportunities; loss of data or content; reputational harm; audience or follower loss;
            cost of procurement of substitute services; or damages arising from Autopilot publishing
            &mdash; regardless of whether Pandocast was advised of the possibility of such damages.
          </p>
          <p>
            <strong>Exceptions.</strong> Nothing in these Terms shall limit Pandocast&rsquo;s
            liability for: (a) death or personal injury caused by our negligence, (b) fraud or
            fraudulent misrepresentation, or (c) any other liability that cannot be excluded or
            limited under applicable law.
          </p>

          <h2>13. Indemnification</h2>
          <p>
            <strong>Your indemnification.</strong> You agree to indemnify, defend, and hold harmless
            Pandocast and its officers, directors, employees, agents, and affiliates from and against
            any and all claims, damages, losses, liabilities, costs, and expenses (including
            reasonable attorneys&rsquo; fees) arising from or related to: (a) Your Content, including
            any claims that Your Content infringes or misappropriates a third party&rsquo;s rights;
            (b) your use of the Service; (c) your violation of these Terms; (d) your violation of any
            applicable law, regulation, or third-party platform policy; or (e) content published via
            the Autopilot feature.
          </p>
          <p>
            <strong>Pandocast&rsquo;s indemnification.</strong> Pandocast agrees to indemnify,
            defend, and hold harmless you from and against any third-party claims alleging that the
            Service itself (excluding Your Content and Generated Content based on Your Content)
            infringes a third party&rsquo;s intellectual property rights, provided that: (a) you
            promptly notify Pandocast of the claim in writing; (b) you grant Pandocast sole control
            of the defense and settlement; and (c) you provide reasonable cooperation at
            Pandocast&rsquo;s expense. This indemnity does not extend to claims arising from Your
            Content, Generated Content derived from Your Content, your modifications to Generated
            Content, or your use of the Service in violation of these Terms.
          </p>

          <h2>14. Termination</h2>
          <p>
            <strong>By you.</strong> You may delete your account at any time through your account
            settings or by contacting{' '}
            <a href="mailto:support@pandocast.ai">support@pandocast.ai</a>.
          </p>
          <p>
            <strong>By us.</strong> We may suspend or terminate your account for material violations
            of these Terms. Where the violation is not urgent (i.e., does not involve illegal
            activity, fraud, or harm to others), we will provide 7 days&rsquo; written notice and an
            opportunity to cure the violation before termination.
          </p>
          <p>
            <strong>Effect of termination.</strong> Upon termination, your data will be handled
            according to our Privacy Policy: a 30-day grace period during which your account can be
            recovered, followed by permanent deletion of all data. Any queued or scheduled posts will
            be cancelled upon account deletion. Sections 4, 5, 11, 12, 13, 15, and 16 survive
            termination.
          </p>

          <h2>15. Dispute Resolution</h2>
          <p>
            <strong>Governing law.</strong> These Terms are governed by and construed in accordance
            with the laws of the State of Delaware, United States, without regard to conflict of law
            principles.
          </p>
          <p>
            <strong>Informal resolution first.</strong> Before initiating any formal dispute
            resolution, you agree to contact us at{' '}
            <a href="mailto:legal@pandocast.ai">legal@pandocast.ai</a> and attempt to resolve the
            dispute informally for at least 30 days.
          </p>
          <p>
            <strong>Binding arbitration.</strong> If informal resolution is unsuccessful, any dispute,
            claim, or controversy arising out of or relating to these Terms or the Service shall be
            resolved by binding arbitration administered by the American Arbitration Association
            (&ldquo;AAA&rdquo;) under its Commercial Arbitration Rules. The arbitration shall be
            conducted by a single arbitrator in Wilmington, Delaware, or, at your election, via video
            conference. The arbitrator&rsquo;s decision shall be final and binding and may be entered
            as a judgment in any court of competent jurisdiction.
          </p>
          <p>
            <strong>Small claims exception.</strong> Either party may bring an individual action in
            small claims court in their jurisdiction, provided the claim falls within the court&rsquo;s
            jurisdictional limits.
          </p>
          <p>
            <strong>Class action waiver.</strong> You and Pandocast each agree that any dispute
            resolution proceedings will be conducted only on an individual basis and not as part of a
            class, consolidated, or representative action. If a court or arbitrator determines that
            this class action waiver is unenforceable as to a particular claim, that claim (and only
            that claim) shall be severed and may proceed in court, while the remaining claims shall
            proceed in arbitration.
          </p>
          <p>
            <strong>Injunctive relief.</strong> Notwithstanding the above, either party may seek
            injunctive or equitable relief in any court of competent jurisdiction to protect
            intellectual property rights, prevent unauthorized disclosure of confidential information,
            or address urgent security concerns.
          </p>
          <p>
            <strong>International users.</strong> If you reside in the European Union, European
            Economic Area, United Kingdom, or any jurisdiction where mandatory consumer protection
            laws apply, nothing in these Terms shall deprive you of any mandatory protections granted
            under the laws of your jurisdiction. In such cases, the governing law and dispute
            resolution provisions of this section shall apply only to the extent permitted by your
            local laws, and you may bring claims in the courts of your country of residence as
            permitted by applicable law.
          </p>

          <h2>16. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. We will notify you of material changes at
            least 30 days before they take effect via email to the address associated with your
            account. The updated Terms will be posted on this page with a revised effective date. Your
            continued use of the Service after the effective date of updated Terms constitutes your
            acceptance of the changes. If you do not agree to the updated Terms, you must stop using
            the Service and may delete your account.
          </p>

          <h2>17. General Provisions</h2>
          <p>
            <strong>Entire agreement.</strong> These Terms, together with our Privacy Policy,
            constitute the entire agreement between you and Pandocast regarding the Service and
            supersede all prior agreements, understandings, or communications.
          </p>
          <p>
            <strong>Severability.</strong> If any provision of these Terms is found to be
            unenforceable or invalid by a court or arbitrator, that provision shall be modified to the
            minimum extent necessary to make it enforceable, or severed if modification is not
            possible, and the remaining provisions shall remain in full force and effect.
          </p>
          <p>
            <strong>No waiver.</strong> Pandocast&rsquo;s failure to enforce any right or provision of
            these Terms shall not constitute a waiver of that right or provision.
          </p>
          <p>
            <strong>Assignment.</strong> You may not assign or transfer your rights or obligations
            under these Terms without our prior written consent. Pandocast may assign these Terms in
            connection with a merger, acquisition, reorganization, or sale of all or substantially all
            of its assets, provided the assignee agrees to be bound by these Terms.
          </p>
          <p>
            <strong>Force majeure.</strong> Pandocast shall not be liable for any failure or delay in
            performance resulting from circumstances beyond our reasonable control, including but not
            limited to natural disasters, government actions, internet or infrastructure failures,
            third-party platform outages, or cyberattacks.
          </p>

          <h2>18. Contact</h2>
          <p>
            Questions about these Terms:{' '}
            <a href="mailto:hello@pandocast.ai">hello@pandocast.ai</a>
          </p>
          <p>
            General support:{' '}
            <a href="mailto:support@pandocast.ai">support@pandocast.ai</a>
          </p>
        </article>
      </main>

      {/* Footer */}
      <footer className="border-t border-cme-border/50 py-8">
        <div className="mx-auto max-w-3xl px-6 text-center text-sm text-cme-text-muted">
          &copy; {new Date().getFullYear()} Pandocast Inc. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
