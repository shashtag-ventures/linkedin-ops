/**
 * campaigns/batch-connect.example.mjs
 *
 * Example script for running a batch outreach campaign.
 * Copy this file to `campaigns/my-campaign.mjs` and customize.
 *
 * Guarantees:
 * - Mutex lock prevents collisions with other agents or CLI commands
 * - Each invite uses an isolated tab that auto-closes
 * - Random jitter delay between actions protects account health
 */

import { withLock } from "../src/lock.mjs";
import { withDedicatedTab } from "../src/tab-manager.mjs";
import { sendConnectionInvite } from "../src/actions/connect.mjs";
import { delay } from "../src/cdp.mjs";

// Define your target profiles and personalized notes
const PROFILES = [
  {
    url: "https://www.linkedin.com/in/example-profile-1",
    note: "Hi Alex, loved your post on distributed systems and event-driven architectures. Would love to connect!",
  },
  {
    url: "https://www.linkedin.com/in/example-profile-2",
    note: "Hi Jordan, noticed your work on platform engineering. Always great connecting with fellow engineers.",
  },
];

// Set to true only when you are ready to send live invitations
const LIVE_SEND = false;

async function runCampaign() {
  console.log(
    `🚀 Starting campaign: ${PROFILES.length} target(s) (Live: ${LIVE_SEND ? "YES" : "NO (Dry-run)"})`,
  );

  await withLock("batch-outreach-campaign", async () => {
    let sentCount = 0;

    for (let i = 0; i < PROFILES.length; i++) {
      const target = PROFILES[i];
      console.log(`\n[${i + 1}/${PROFILES.length}] Processing: ${target.url}`);

      try {
        const result = await withDedicatedTab(
          { port: 9222, autoClose: true },
          async (cdp) => {
            return await sendConnectionInvite(cdp, {
              linkedinUrl: target.url,
              note: target.note,
              send: LIVE_SEND,
            });
          },
        );

        console.log(`Outcome:`, result);
        if (result.success) sentCount++;
      } catch (err) {
        console.error(`❌ Failed on ${target.url}:`, err.message);
      }

      // Add a respectful random human delay (15-30 seconds) between profiles
      if (i < PROFILES.length - 1) {
        const waitSec = Math.floor(Math.random() * 15) + 15;
        console.log(`⏳ Waiting ${waitSec}s before next profile...`);
        await delay(waitSec * 1000);
      }
    }

    console.log(
      `\n🏁 Campaign complete: ${sentCount}/${PROFILES.length} actions succeeded.`,
    );
  });
}

runCampaign().catch(console.error);
